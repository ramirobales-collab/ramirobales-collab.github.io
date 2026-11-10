// Cliente mínimo del protocolo de depuración (CDP) sobre el navegador del sistema, sin dependencias
// (WebSocket nativo de Node ≥ 22). Arranca Edge/Chrome/Chromium sin ventana con un perfil temporal.
//
//   const nav = await abrirNavegador({ gpu: false });
//   const r = await nav.visitar(url, { ancho, alto, espera, antes: (s, ev, cdp) => …, tema: 'dark' });
//   await nav.cerrar();
//
// Ninguna llamada espera para siempre: cada mensaje CDP tiene un tope (30 s, con el método y la URL en el
// error) y cada visita otro (60 s por defecto); si una pestaña se cuelga, la visita vuelve con r.cortada y
// la prueba sigue con la página siguiente.
//
// NAVEGADOR=<ruta> elige el ejecutable; si no, se busca en las rutas habituales de Windows, macOS y Linux.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATOS = [
  process.env.NAVEGADOR,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
];

export function buscarNavegador() {
  for (const c of CANDIDATOS) if (c && existsSync(c)) return c;
  for (const n of ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    try { const r = execFileSync('which', [n], { encoding: 'utf8' }).trim(); if (r) return r; } catch {}
  }
  return null;
}

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
export const TOPE_CDP = 30000;
export const TOPE_VISITA = 60000;

// Se inyecta antes que cualquier script de la página: junta violaciones de la política.
const ESPIA = `(() => { window.__csp = []; addEventListener('securitypolicyviolation', (e) => {
  window.__csp.push({ directiva: e.effectiveDirective, bloqueado: e.blockedURI, linea: e.lineNumber, fuente: e.sourceFile, muestra: e.sample });
}, true); })();`;

export async function abrirNavegador({ gpu = false } = {}) {
  const ejecutable = buscarNavegador();
  if (!ejecutable) return null;
  const perfil = mkdtempSync(join(tmpdir(), 'pruebas-nav-'));
  const env = { ...process.env };
  delete env.__COMPAT_LAYER;
  const banderas = gpu ? ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const proc = spawn(ejecutable, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${perfil}`, '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--force-device-scale-factor=1', ...(process.env.CI ? ['--no-sandbox'] : []), ...banderas, 'about:blank',
  ], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((ok, mal) => {
    let buf = '';
    const t = setTimeout(() => mal(new Error('el navegador no anunció el puerto de depuración')), 30000);
    proc.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); ok(m[1]); } });
    proc.on('exit', (c) => mal(new Error('el navegador salió con ' + c)));
  });
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, mal) => { ws.onopen = ok; ws.onerror = mal; });
  let id = 0;
  const pendientes = new Map();
  const oyentes = new Set();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pendientes.has(m.id)) {
      const { ok, mal } = pendientes.get(m.id); pendientes.delete(m.id);
      m.error ? mal(new Error(JSON.stringify(m.error))) : ok(m.result);
    } else if (m.method) for (const f of oyentes) f(m);
  };
  let actual = '';
  const enviar = (method, params = {}, sessionId) => new Promise((ok, mal) => {
    const n = ++id;
    const t = setTimeout(() => { pendientes.delete(n); mal(new Error(`${method}: sin respuesta en ${TOPE_CDP / 1000} s${actual ? ` (${actual})` : ''}`)); }, TOPE_CDP);
    pendientes.set(n, { ok: (v) => { clearTimeout(t); ok(v); }, mal: (e) => { clearTimeout(t); mal(new Error(method + ': ' + e.message)); } });
    ws.send(JSON.stringify({ id: n, method, params, sessionId }));
  });

  async function evaluar(s, expr) {
    const r = await enviar('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, s);
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
    return r.result.value;
  }

  /**
   * Abre una pestaña nueva, carga la URL y junta: errores de consola, excepciones, violaciones de la
   * política, pedidos fuera del origen, pedidos fallidos/4xx/5xx y bytes recibidos.
   * opciones.antes(s, evaluar, cdp) corre después de cargar (scroll, clics, capturas); opciones.leer es una
   * expresión final. Para medir en frío: red {latencia ms, bajada y subida en bit/s}, cpu (factor de
   * lentitud), medios ([{name, value}] además del tema, p. ej. prefers-reduced-motion) e inyectar (código
   * que corre antes que la página). Si la visita pasa de opciones.tope ms, vuelve con r.cortada.
   */
  async function visitar(url, op = {}) {
    const tope = op.tope ?? TOPE_VISITA;
    const r = { url, errores: [], excepciones: [], csp: [], externos: [], fallidos: [], bytes: 0, pedidos: 0 };
    let reloj;
    const corte = new Promise((ok) => { reloj = setTimeout(() => ok('corte'), tope); });
    try {
      const fin = await Promise.race([visita(url, op, r).then(() => 'ok', (e) => e), corte]);
      if (fin === 'corte') {
        r.cortada = `la visita pasó de ${tope / 1000} s (${actual || url})`;
        if (r.targetId) await enviar('Target.closeTarget', { targetId: r.targetId }).catch(() => {});
      }
      else if (fin instanceof Error) r.cortada = fin.message.slice(0, 300);
    } finally { clearTimeout(reloj); }
    return r;
  }

  async function visita(url, { ancho = 1920, alto = 1080, movil = false, tema = null, espera = 2500, antes = null, leer = null, sinWebgl = false, red = null, cpu = null, medios = [], inyectar = '' } = {}, r) {
    actual = url;
    const { targetId } = await enviar('Target.createTarget', { url: 'about:blank' });
    Object.defineProperty(r, 'targetId', { value: targetId, enumerable: false });
    const { sessionId: s } = await enviar('Target.attachToTarget', { targetId, flatten: true });
    const origen = new URL(url).origin;
    const tipos = new Map();
    const oyente = (m) => {
      if (m.sessionId !== s) return;
      const p = m.params;
      if (m.method === 'Runtime.consoleAPICalled' && p.type === 'error') r.errores.push(p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
      else if (m.method === 'Runtime.exceptionThrown') r.excepciones.push((p.exceptionDetails.exception?.description || p.exceptionDetails.text || '').slice(0, 300));
      else if (m.method === 'Log.entryAdded' && p.entry.level === 'error') r.errores.push(`[${p.entry.source}] ${p.entry.text}`.slice(0, 300));
      else if (m.method === 'Network.requestWillBeSent') {
        r.pedidos++;
        const u = p.request.url;
        tipos.set(p.requestId, u);
        if (/^https?:/.test(u) && new URL(u).origin !== origen) r.externos.push(u);
      } else if (m.method === 'Network.responseReceived' && p.response.status >= 400) r.fallidos.push(`${p.response.status} ${p.response.url}`);
      else if (m.method === 'Network.loadingFailed' && !p.canceled) r.fallidos.push(`${p.errorText} ${tipos.get(p.requestId) || ''}`);
      else if (m.method === 'Network.loadingFinished') r.bytes += p.encodedDataLength || 0;
    };
    oyentes.add(oyente);
    try {
      await enviar('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 1, mobile: movil, screenWidth: ancho, screenHeight: alto }, s);
      if (movil) await enviar('Emulation.setTouchEmulationEnabled', { enabled: true }, s);
      const rasgos = [...(tema ? [{ name: 'prefers-color-scheme', value: tema }] : []), ...medios];
      if (rasgos.length) await enviar('Emulation.setEmulatedMedia', { features: rasgos }, s);
      if (cpu) await enviar('Emulation.setCPUThrottlingRate', { rate: cpu }, s);
      await enviar('Runtime.enable', {}, s);
      await enviar('Log.enable', {}, s);
      await enviar('Network.enable', {}, s);
      await enviar('Network.setCacheDisabled', { cacheDisabled: true }, s);
      if (red) await enviar('Network.emulateNetworkConditions', { offline: false, latency: red.latencia, downloadThroughput: red.bajada / 8, uploadThroughput: (red.subida || red.bajada) / 8 }, s);
      await enviar('Page.enable', {}, s);
      await enviar('Page.addScriptToEvaluateOnNewDocument', { source: ESPIA + (sinWebgl ? `HTMLCanvasElement.prototype.getContext=function(){return null};` : '') + inyectar }, s);
      await enviar('Page.navigate', { url }, s);
      await esperar(espera);
      if (antes) await antes(s, (e) => evaluar(s, e), (m, p = {}) => enviar(m, p, s));
      r.csp = (await evaluar(s, 'window.__csp || []')) || [];
      if (leer) r.valor = await evaluar(s, leer);
    } finally {
      oyentes.delete(oyente);
      await enviar('Target.closeTarget', { targetId }).catch(() => {});
      actual = '';
    }
  }

  async function cerrar() {
    try { await enviar('Browser.close'); } catch {}
    ws.close();
    await esperar(300);
    try { proc.kill(); } catch {}
    try { rmSync(perfil, { recursive: true, force: true }); } catch {}
  }
  return { ejecutable, visitar, cerrar, esperar };
}
