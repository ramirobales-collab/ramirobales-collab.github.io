// Vitales en frío (CDP, sin dependencias): lo que el humo no ve porque carga rápido y con la caché del
// navegador del sistema. Perfil nuevo, sin caché, red lenta (150 ms, 1,6 Mbit/s) y CPU ×4
// (pruebas/config.json → vitales). Falla si:
//   - el salto de maquetado (CLS, ventana de sesión de WebVitals) pasa de la vara en index, 404, créditos y legal;
//   - hay una tarea larga de más de la vara después del primer pintado;
//   - en la portada, «lineas» (la primera vista del motor) llega más tarde que la vara después de «cargando»;
//   - con movimiento reducido, un clic en un verbo no cambia la imagen de la sala;
//   - con SwiftShader (sin placa) el motor sigue vivo por debajo de la vara de cuadros por segundo en lugar de
//     caer al póster.
import { servir } from './lib/servidor.mjs';
import { abrirNavegador } from './lib/navegador.mjs';
import { existe } from './lib/html.mjs';

export const nombre = 'vitales';
export const descripcion = 'en frío (red lenta, CPU ×4): salto de maquetado, tareas largas, «lineas» a tiempo, movimiento reducido y caída al póster sin placa';
export const navegador = true;

// Corre antes que la página: anota saltos, tareas largas, primer pintado y los estados del lienzo del motor.
const INYECTAR = `(() => {
  const V = window.__vit = { saltos: [], largas: [], fp: null, estados: [] };
  const ver = (tipo, f) => { try { new PerformanceObserver((l) => l.getEntries().forEach(f)).observe({ type: tipo, buffered: true }); } catch {} };
  ver('layout-shift', (e) => { if (!e.hadRecentInput) V.saltos.push([e.startTime, e.value, (e.sources || []).slice(0, 3).map((s) => s.node ? s.node.nodeName.toLowerCase() + (s.node.className && typeof s.node.className === 'string' ? '.' + s.node.className.trim().split(/\\s+/)[0] : '') : '?').join(' ')]); });
  ver('longtask', (e) => V.largas.push([e.startTime, e.duration]));
  ver('paint', (e) => { V.fp = V.fp == null ? e.startTime : Math.min(V.fp, e.startTime); });
  const mirar = () => {
    const c = document.querySelector('canvas.mundo');
    if (!c) return false;
    const anotar = () => { const e = c.dataset.estado; if (e && (V.estados.at(-1) || [])[0] !== e) V.estados.push([e, performance.now()]); };
    anotar();
    new MutationObserver(anotar).observe(c, { attributes: true, attributeFilter: ['data-estado'] });
    return true;
  };
  if (!mirar()) new MutationObserver((m, o) => { if (mirar()) o.disconnect(); }).observe(document, { childList: true, subtree: true });
})();`;

/** CLS como WebVitals: la peor ventana de sesión (saltos a menos de 1 s entre sí, ventana de hasta 5 s). */
export function cls(saltos) {
  let peor = 0, suma = 0, ini = -1, ult = -1, fuentes = [], peorFuentes = [];
  for (const [t, v, f] of saltos) {
    if (ini < 0 || t - ult > 1000 || t - ini > 5000) { ini = t; suma = 0; fuentes = []; }
    suma += v; ult = t; fuentes.push(f);
    if (suma > peor) { peor = suma; peorFuentes = [...fuentes]; }
  }
  return { valor: peor, fuentes: [...new Set(peorFuentes.filter(Boolean))].slice(0, 4) };
}

const ESTADOS_POSTER = ['respaldo', 'sin-webgl2', 'ahorro-de-datos', 'error-carga', 'error-shader', 'contexto-perdido', 'lento'];

// Esconde todo menos el lienzo del motor (por CSSOM: la política no lo bloquea) y saca una captura reducida.
const SOLO_LIENZO = `(() => { for (const el of document.body.querySelectorAll('*')) el.style.setProperty('visibility', el.matches('canvas.mundo') ? 'visible' : 'hidden', 'important'); document.body.style.setProperty('visibility', 'hidden', 'important'); return 1; })()`;
// «poster» = el motor se apagó y quedó la foto (el <img class="heroe__poster"> está siempre en el HTML, debajo del lienzo).
// Cuadros por segundo del motor: su contador (m.cuadros) si lo expone; si no, requestAnimationFrame.
const CPS = `new Promise((ok) => { const m = document.querySelector('canvas.mundo')?.mundo?.motor; const t0 = performance.now(); if (m && typeof m.cuadros === 'number') { const c0 = m.cuadros; setTimeout(() => ok((m.cuadros - c0) / ((performance.now() - t0) / 1000)), 3000); return; } let n = 0; const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else ok(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); })`;
const POSTER = `({ estado: document.querySelector('canvas.mundo')?.dataset.estado ?? null, vivo: document.documentElement.classList.contains('mundo-vivo'), poster: !document.documentElement.classList.contains('mundo-vivo') && [...document.querySelectorAll('.heroe__poster')].some((i) => i.naturalWidth > 0), ms: document.querySelector('canvas.mundo')?.mundo?.motor?.ms ?? null })`;

export async function correr({ raiz, config, gpu }) {
  const V = config.vitales;
  const nav = await abrirNavegador({ gpu });
  if (!nav) return { omitida: 'no encontré Edge/Chrome/Chromium (definí NAVEGADOR=<ruta>)' };
  const srv = await servir({ raiz, puerto: 0 });
  const fallas = [];
  const avisos = [];
  const filas = [];
  const frio = { red: V.red, cpu: V.cpu, inyectar: INYECTAR, leer: 'window.__vit', tope: V.tope_visita };
  try {
    // 1) En frío: saltos, tareas largas y, en la portada, «lineas»
    for (const p of V.paginas.filter((x) => existe(raiz, x))) {
      const r = await nav.visitar(`${srv.url}${p}`, { ...frio, espera: p === 'index.html' ? V.espera_portada : V.espera });
      if (r.cortada) { fallas.push(`${p}: ${r.cortada}`); continue; }
      const d = r.valor || { saltos: [], largas: [], estados: [] };
      const c = cls(d.saltos);
      filas.push(`${p} CLS ${c.valor.toFixed(3)}`);
      if (c.valor > V.cls_max) fallas.push(`${p}: salto de maquetado ${c.valor.toFixed(3)} > ${V.cls_max} en frío${c.fuentes.length ? ` (se movió: ${c.fuentes.join(', ')})` : ''}`);
      const fp = d.fp ?? 0;
      const largas = d.largas.filter(([t, dur]) => t + dur > fp && dur > V.tarea_larga_max);
      if (largas.length) fallas.push(`${p}: ${largas.length} tarea${largas.length > 1 ? 's' : ''} larga${largas.length > 1 ? 's' : ''} después del primer pintado (la peor de ${Math.round(Math.max(...largas.map((x) => x[1])))} ms > ${V.tarea_larga_max} ms, a los ${Math.round(largas.sort((a, b) => b[1] - a[1])[0][0])} ms)`);
      if (p !== 'index.html') continue;
      const est = Object.fromEntries(d.estados.map(([e, t]) => [e, t]));
      const camino = d.estados.map(([e, t]) => `${e} ${(t / 1000).toFixed(1)} s`).join(' → ') || 'sin estados';
      filas.push(`portada: ${camino}`);
      if (d.estados.some(([e]) => ESTADOS_POSTER.includes(e))) avisos.push(`index.html: en frío el motor terminó en póster (${camino}); «lineas» no se mide`);
      else if (est.cargando == null) fallas.push(`index.html: el motor nunca pasó por «cargando» (${camino})`);
      else if (est.lineas == null) fallas.push(`index.html: «lineas» no llegó en ${(V.espera_portada / 1000).toFixed(0)} s de visita (${camino})`);
      else if (est.lineas - est.cargando > V.lineas_max_ms) fallas.push(`index.html: «lineas» llegó ${((est.lineas - est.cargando) / 1000).toFixed(1)} s después de «cargando» (> ${V.lineas_max_ms / 1000} s) en frío`);
    }

    // 2) Movimiento reducido: un clic en un verbo tiene que cambiar la sala (sin animar, pero cambiar)
    {
      let antes = null, despues = null, info = null;
      const captura = async (cdp) => (await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1440, height: 900, scale: 0.25 } })).data;
      const r = await nav.visitar(`${srv.url}index.html`, {
        ancho: 1440, alto: 900, espera: 1500, medios: [{ name: 'prefers-reduced-motion', value: 'reduce' }], tope: V.tope_visita,
        antes: async (s, ev, cdp) => {
          for (let i = 0; i < 40; i++) { info = await ev(POSTER); if (info.estado === 'listo' || ESTADOS_POSTER.includes(info.estado)) break; await nav.esperar(500); }
          if (info.estado !== 'listo') return;
          await nav.esperar(800);
          await ev(SOLO_LIENZO);
          await nav.esperar(300);
          antes = await captura(cdp);
          const pulsado = await ev(`(() => { const bs = [...document.querySelectorAll('button.acto')]; const b = bs.find((x) => x.dataset.acto === 'defino' && x.getAttribute('aria-pressed') !== 'true') || bs.find((x) => x.getAttribute('aria-pressed') !== 'true'); if (!b) return null; b.click(); return b.dataset.acto; })()`);
          info.pulsado = pulsado;
          await nav.esperar(V.espera_reducido);
          despues = await captura(cdp);
        },
      });
      if (r.cortada) fallas.push(`index.html (movimiento reducido): ${r.cortada}`);
      else if (!info || info.estado !== 'listo') avisos.push(`index.html (movimiento reducido): el motor quedó en «${info?.estado}»; no se mide el cambio de verbo`);
      else if (!info.pulsado) fallas.push('index.html (movimiento reducido): no encontré un verbo (button.acto) para pulsar');
      else if (antes === despues) fallas.push(`index.html (movimiento reducido): después de pulsar «${info.pulsado}» la sala no cambió (las dos capturas del lienzo son idénticas)`);
      else filas.push(`reducido: «${info.pulsado}» cambia la sala`);
    }
  } finally {
    await nav.cerrar();
  }

  // 3) Sin placa (SwiftShader): o el motor da cuadros suficientes o cae al póster
  const sw = await abrirNavegador({ gpu: false });
  try {
    let cps = null;
    const r = await sw.visitar(`${srv.url}index.html`, { ancho: 1920, alto: 1080, espera: V.espera_swiftshader, leer: POSTER, tope: V.tope_visita + 30000,
      antes: async (s, ev) => { cps = await ev(CPS); } });
    if (r.cortada) fallas.push(`index.html (SwiftShader): ${r.cortada}`);
    else {
      const v = r.valor || {};
      filas.push(`SwiftShader: ${v.poster ? 'póster' : 'motor vivo'} (${v.estado}, ${cps?.toFixed(1)} c/s)`);
      if (!v.poster && v.vivo && cps != null && cps < V.swiftshader_cps_min)
        fallas.push(`index.html (SwiftShader): el motor sigue vivo a ${cps.toFixed(1)} c/s (< ${V.swiftshader_cps_min}) en lugar de caer al póster${v.ms > 0 ? `; ${Math.round(v.ms)} ms por cuadro medidos por el motor` : ''}`);
      if (!v.poster && !v.vivo) fallas.push(`index.html (SwiftShader): ni motor vivo ni póster (estado «${v.estado}»)`);
    }
  } finally {
    await sw.cerrar();
    await srv.cerrar();
  }
  return { fallas, avisos, resumen: filas.join(' · ') };
}
