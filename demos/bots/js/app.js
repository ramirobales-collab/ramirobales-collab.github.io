// Sala de bots: simulación en el navegador. Sin servidor, sin modelo, sin red (salvo los JSON de idioma).
import { CLUB, PLANTEL, UMBRAL_ACWR, REPORTE_FOTO, VOZ, ONDA, DIA, EVENTOS, PRECIOS, RADAR, PROYECTOS } from './datos.js';

const params = new URLSearchParams(location.search);
const html = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const quieto = params.get('quieto') === '1' || reduce;
html.classList.add(quieto ? 'quieto' : 'js-mov');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esperar = (ms) => (quieto ? Promise.resolve() : new Promise((ok) => setTimeout(ok, ms)));

const jugador = (id) => PLANTEL.find((j) => j.id === id);
const apellido = (j) => j.nombre.split(' ').slice(1).join(' ');

/* ---------- Estado ---------- */
const E = {
  idioma: 'es', dic: null,
  mensajes: [],        // especificaciones (se redibujan al cambiar de idioma)
  traza: null,         // especificación del último mensaje
  id: 1041, usados: 0, cacheHits: 0, duplicados: 0, modelo: 0,
  cache: new Map(), ultimo: null, ocupado: false, duda: null,
  reloj: 9 * 60 + 2,   // hora del chat
  minuto: DIA.hasta, sel: null, reproduciendo: false,
  fotos: 0,
};
const dics = {};

/* ---------- Texto ---------- */
function t(k, vars) {
  let s = E.dic && E.dic[k] != null ? E.dic[k] : k;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, n) => (vars[n] != null ? valor(vars[n]) : m));
  return s;
}
const locale = () => (E.idioma === 'es' ? 'es-AR' : 'en-US');
const num = (n, d = 0) => new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
function valor(v) {
  if (v && typeof v === 'object') {
    if ('n' in v) return num(v.n, v.d || 0);
    if ('k' in v) return t(v.k, v.vars);
  }
  return String(v);
}
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function diccionario(l) {
  if (!dics[l]) dics[l] = await fetch(`i18n/${l}.json`).then((r) => r.json());
  return dics[l];
}
function aplicarDiccionario() {
  $$('[data-i18n]').forEach((el) => { const v = E.dic[el.dataset.i18n]; if (v != null) el.textContent = v; });
  $$('[data-i18n-attr]').forEach((el) => el.dataset.i18nAttr.split(';').forEach((par) => {
    const [a, k] = par.split('=').map((s) => s.trim());
    if (E.dic[k] != null) el.setAttribute(a, E.dic[k]);
  }));
  document.title = t('meta.titulo');
  $('meta[name="description"]').content = t('meta.descripcion');
  // Etiquetas de columna para la tabla apilada del celular.
  const cab = $$('.tabla thead th').map((th) => th.textContent);
  $$('.tabla tbody tr').forEach((tr) => $$('td', tr).forEach((td, i) => td.setAttribute('data-et', cab[i + 1] || '')));
}
async function cambiarIdioma(l, guardar = true) {
  E.dic = await diccionario(l);
  const dibujar = () => {
    E.idioma = l;
    html.lang = l;
    aplicarDiccionario();
    $$('[data-idioma]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.idioma === l)));
    dibujarChat();
    dibujarTraza();
    dibujarContadores(false);
    dibujarDia(false);
    dibujarBotonLimite();
  };
  if (guardar) { try { localStorage.setItem('idioma', l); } catch (e) {} }
  if (document.startViewTransition && !quieto && E.idioma !== l && document.visibilityState === 'visible') document.startViewTransition(dibujar);
  else dibujar();
}
function idiomaInicial() {
  const q = params.get('idioma');
  if (q === 'es' || q === 'en') return q;
  try { const g = localStorage.getItem('idioma'); if (g === 'es' || g === 'en') return g; } catch (e) {}
  return (navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en';
}

/* ---------- Tema ---------- */
function temaActual() {
  const d = html.dataset.theme;
  if (d === 'light' || d === 'dark') return d;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function marcarTema() { $('.tema').setAttribute('aria-pressed', String(temaActual() === 'dark')); }
$('.tema').addEventListener('click', () => {
  const nuevo = temaActual() === 'dark' ? 'light' : 'dark';
  html.dataset.theme = nuevo;
  try { localStorage.setItem('tema', nuevo); } catch (e) {}
  marcarTema();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', marcarTema);

/* =========================================================
   Bot de respuesta
   ========================================================= */
const ICONO_TILDE = '<svg viewBox="0 0 16 12" aria-hidden="true"><path d="m1.5 6.5 3 3 6-7"/><path d="m6.5 8.6.9.9 6-7"/></svg>';

function normal(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

// Intención de un texto libre. Sólo reconoce lo que los datos pueden contestar; el resto cae en «no está».
function detectar(texto) {
  const s = normal(texto);
  const j = PLANTEL.find((x) => s.includes(normal(apellido(x))));
  if (E.duda) {
    const m = s.match(/(\d+)[.,](\d)/);
    if (m) return { intent: 'confirma', valor: Number(`${m[1]}.${m[2]}`) };
  }
  if (/(cobra|sueldo|salario|contrato|paga|gana |salary|wage|contract|paid|earn)/.test(s)) return { intent: 'fuera' };
  if (j && /(jugar|juega|sabado|disponible|apto|partido|play|saturday|available|fit|match|game)/.test(s)) return { intent: 'disp', j };
  if (j) return { intent: 'ficha', j };
  if (/(riesgo|carga|lesion|acwr|risk|load|injur)/.test(s)) return { intent: 'riesgo' };
  if (/(gps|sesion|session|reporte|report|foto|photo|planilla)/.test(s)) return { intent: 'gps' };
  if (/(^| )(hola|buenas|buen dia|hello|hi|hey|good morning)( |$|[!.,?])/.test(s)) return { intent: 'hola' };
  return { intent: 'nose' };
}

// Construye la respuesta (partes con claves de texto y números crudos) y los pasos de datos/modelo.
function responder(intento) {
  const r = { partes: [], datos: null, modelo: { k: 'p.modelo.reglas' }, cacheable: false, botones: null };
  const d1 = (n) => ({ n, d: 2 });
  if (intento.intent === 'riesgo') {
    const riesgo = PLANTEL.filter((j) => j.acwr >= UMBRAL_ACWR).sort((a, b) => b.acwr - a.acwr);
    r.partes.push({ p: 'r.riesgo.intro', vars: { n: riesgo.length, u: { n: UMBRAL_ACWR, d: 1 } } });
    r.partes.push({ ul: riesgo.map((j) => ({ k: j.bienestar <= 2 ? 'r.riesgo.item2' : 'r.riesgo.item', vars: { nombre: j.nombre, pos: { k: `pos.${j.pos}` }, acwr: d1(j.acwr), carga: { n: j.carga }, prom: { n: j.prom }, b: j.bienestar, s: { n: j.sueno, d: 1 } } })) });
    r.partes.push({ p: 'r.riesgo.sug' });
    r.partes.push({ fuente: 'r.riesgo.fuente' });
    r.datos = { k: 'p.datos.riesgo', vars: { n: PLANTEL.length, m: riesgo.length }, chips: riesgo.map((j) => ({ k: 'chip.acwr', vars: { a: apellido(j), v: d1(j.acwr) } })) };
    r.cacheable = true;
  } else if (intento.intent === 'disp' || intento.intent === 'ficha') {
    const j = intento.j;
    const pct = Math.round((j.sprint / j.sprintProm) * 100);
    const base = { nombre: j.nombre, pos: { k: `pos.${j.pos}` }, acwr: d1(j.acwr), carga: { n: j.carga }, b: j.bienestar, s: { n: j.sueno, d: 1 }, pct, nota: { k: `nota.${j.id}` }, estado: { k: `estado.${j.medico}` } };
    if (intento.intent === 'disp') {
      r.partes.push({ p: `r.disp.${j.medico}`, vars: base });
      if (j.medico === 'restriccion') r.partes.push({ p: 'r.disp.decide' });
      r.partes.push({ fuente: 'r.disp.fuente' });
    } else {
      r.partes.push({ p: 'r.ficha', vars: base });
      if (j.medico !== 'apto') r.partes.push({ p: 'r.ficha.nota', vars: base });
      r.partes.push({ fuente: 'r.ficha.fuente' });
    }
    r.datos = { k: 'p.datos.jugador', vars: { nombre: j.nombre }, chips: [{ k: 'chip.carga', vars: { v: d1(j.acwr) } }, { k: 'chip.sprint', vars: { v: pct } }, { k: 'chip.medico', vars: { v: { k: `estado.${j.medico}` } } }] };
    r.cacheable = true;
  } else if (intento.intent === 'foto') {
    const raras = [];
    for (const f of REPORTE_FOTO) {
      const j = jugador(f.id);
      if (f.sprint / f.sprintProm >= 1.3) raras.push({ k: 'r.foto.sprint', vars: { nombre: j.nombre, v: { n: f.sprint }, p: { n: f.sprintProm }, pct: Math.round((f.sprint / f.sprintProm - 1) * 100) } });
      if (f.km != null && f.km / f.kmProm <= 0.7) raras.push({ k: 'r.foto.km', vars: { nombre: j.nombre, v: { n: f.km, d: 1 }, p: { n: f.kmProm, d: 1 }, pct: Math.round((1 - f.km / f.kmProm) * 100) } });
    }
    const dudosa = REPORTE_FOTO.find((f) => f.km == null);
    const jd = jugador(dudosa.id);
    r.partes.push({ p: 'r.foto.intro', vars: { n: REPORTE_FOTO.length } });
    r.partes.push({ ul: raras });
    r.partes.push({ p: 'r.foto.duda', vars: { nombre: jd.nombre, a: { n: dudosa.dudas[0], d: 1 }, b: { n: dudosa.dudas[1], d: 1 } } });
    r.partes.push({ p: 'r.foto.guardado', vars: { n: REPORTE_FOTO.length - 1, s: CLUB.semana } });
    r.partes.push({ fuente: 'r.foto.fuente' });
    r.botones = dudosa.dudas.map((v) => ({ n: v, d: 1 }));
    r.datos = { k: 'p.datos.foto', vars: { n: REPORTE_FOTO.length }, chips: raras.map((x) => ({ k: x.k === 'r.foto.sprint' ? 'chip.sprintmas' : 'chip.kmmenos', vars: { a: apellido({ nombre: x.vars.nombre }), v: x.vars.pct } })) };
    r.modelo = { k: 'p.modelo.foto' };
    E.duda = { id: dudosa.id, opciones: dudosa.dudas };
  } else if (intento.intent === 'confirma') {
    const jd = jugador(E.duda.id);
    r.partes.push({ p: 'r.confirma', vars: { nombre: jd.nombre, v: { n: intento.valor, d: 1 }, s: CLUB.semana } });
    r.datos = { k: 'p.datos.confirma', vars: { nombre: jd.nombre, s: CLUB.semana }, chips: [{ k: 'chip.km', vars: { a: apellido(jd), v: { n: intento.valor, d: 1 } } }] };
    r.modelo = { k: 'p.modelo.confirma' };
    E.duda = null;
  } else if (intento.intent === 'fuera') {
    r.partes.push({ p: 'r.fuera' });
    r.partes.push({ fuente: 'r.fuera.regla' });
    r.datos = { k: 'p.datos.fuera', estado: 'ok', label: 'est.sindato' };
    r.modelo = { k: 'p.modelo.fuera' };
  } else if (intento.intent === 'gps') {
    r.partes.push({ p: 'r.gps' });
    r.datos = { k: 'p.datos.nada', estado: 'omite' };
  } else if (intento.intent === 'hola') {
    r.partes.push({ p: 'r.hola', vars: { n: PLANTEL.length } });
    r.datos = { k: 'p.datos.nada', estado: 'omite' };
  } else {
    r.partes.push({ p: 'r.nose', vars: { n: PLANTEL.length } });
    r.datos = { k: 'p.datos.nose', estado: 'omite' };
    r.modelo = { k: 'p.modelo.nose' };
  }
  return r;
}

const PASOS = ['entrada', 'dup', 'limite', 'prep', 'cache', 'datos', 'modelo', 'resp'];
const omitido = (nombre) => ({ nombre, estado: 'omite', label: 'est.omite', det: null });

// Procesa una entrada como lo haría el servidor y devuelve todo lo que hay que dibujar.
function procesar(entrada) {
  const res = { yo: null, sistema: [], pasos: [], bot: null, titulo: null, costo: 0, efectos: [] };

  if (entrada.tipo === 'duplicado') {
    const u = E.ultimo;
    res.titulo = { k: 'traza.titulo.dup', vars: { id: u.id } };
    res.pasos.push({ nombre: 'entrada', estado: 'ok', label: 'est.recibido', det: { k: 'p.entrada.dup', vars: { id: u.id } } });
    res.pasos.push({ nombre: 'dup', estado: 'frena', label: 'est.duplicado', det: { k: 'p.dup.frena', vars: { id: u.id } } });
    for (const p of PASOS.slice(2)) res.pasos.push(omitido(p));
    res.sistema.push({ k: 'sis.dup', vars: { id: u.id } });
    res.pie = { k: 'pie.dup' };
    res.efectos.push(() => { E.duplicados += 1; });
    return res;
  }

  const id = ++E.id;
  E.reloj += 1;
  const hora = hhmm(E.reloj);
  res.titulo = { k: 'traza.titulo', vars: { id, tipo: { k: `tipo.${entrada.tipo}` } } };
  if (entrada.tipo === 'texto') res.yo = { lado: 'yo', tipo: 'texto', texto: entrada.texto, clave: entrada.clave, hora };
  if (entrada.tipo === 'voz') res.yo = { lado: 'yo', tipo: 'voz', transcrita: false, hora };
  if (entrada.tipo === 'foto') res.yo = { lado: 'yo', tipo: 'foto', n: ++E.fotos, hora };
  E.ultimo = { id, tipo: entrada.tipo };

  const detEntrada = entrada.tipo === 'voz' ? { k: 'p.entrada.voz', vars: { id, s: VOZ.segundos } } : { k: `p.entrada.${entrada.tipo}`, vars: { id } };
  res.pasos.push({ nombre: 'entrada', estado: 'ok', label: 'est.recibido', det: detEntrada });
  res.pasos.push({ nombre: 'dup', estado: 'ok', label: 'est.nuevo', det: { k: 'p.dup.ok', vars: { id } } });

  // Límite de uso
  if (E.usados >= CLUB.limite) {
    res.pasos.push({ nombre: 'limite', estado: 'frena', label: 'est.sincupo', det: { k: 'p.limite.frena', vars: { max: CLUB.limite } } });
    for (const p of PASOS.slice(3, 7)) res.pasos.push(omitido(p));
    res.pasos.push({ nombre: 'resp', estado: 'ok', label: 'est.salio', det: { k: 'p.resp.limite' } });
    res.bot = { lado: 'bot', partes: [{ p: 'r.limite', vars: { max: CLUB.limite } }], hora };
    res.pie = { k: 'pie.limite' };
    return res;
  }
  const n = E.usados + 1;
  res.pasos.push({ nombre: 'limite', estado: 'ok', label: 'est.dentro', det: { k: 'p.limite.ok', vars: { n, max: CLUB.limite } } });
  res.efectos.push(() => { E.usados = n; });

  // Preparación
  let intento;
  if (entrada.tipo === 'voz') {
    intento = { intent: 'disp', j: jugador(VOZ.jugador) };
    res.pasos.push({ nombre: 'prep', estado: 'ok', label: 'est.transcripta', det: { k: 'p.prep.voz', vars: { i: { k: 'int.disp', vars: { nombre: jugador(VOZ.jugador).nombre } } } }, extra: { tipo: 'cita', k: 'voz.transcripcion' }, alLlegar: () => { res.yo.transcrita = true; } });
  } else if (entrada.tipo === 'foto') {
    intento = { intent: 'foto' };
    res.pasos.push({ nombre: 'prep', estado: 'ok', label: 'est.leida', det: { k: 'p.prep.foto', vars: { n: REPORTE_FOTO.length } }, extra: { tipo: 'tabla-foto' } });
  } else {
    intento = entrada.intento || detectar(entrada.texto || t(entrada.clave));
    const nombreInt = intento.j ? { k: `int.${intento.intent}`, vars: { nombre: intento.j.nombre } } : { k: `int.${intento.intent}` };
    res.pasos.push({ nombre: 'prep', estado: 'ok', label: 'est.directo', det: { k: 'p.prep.texto', vars: { i: nombreInt } } });
  }

  const r = responder(intento);
  const clave = r.cacheable ? `${intento.intent}:${intento.j ? intento.j.id : ''}` : null;
  const enCache = clave && E.cache.has(clave);
  if (!r.cacheable) res.pasos.push({ nombre: 'cache', estado: 'omite', label: 'est.noaplica', det: { k: intento.intent === 'foto' || intento.intent === 'confirma' ? 'p.cache.nuevo' : 'p.cache.noaplica' } });
  else if (enCache) res.pasos.push({ nombre: 'cache', estado: 'cache', label: 'est.acierto', det: { k: 'p.cache.hit' } });
  else res.pasos.push({ nombre: 'cache', estado: 'ok', label: 'est.singuardar', det: { k: 'p.cache.miss' } });

  if (enCache) {
    res.pasos.push({ nombre: 'datos', estado: 'omite', label: 'est.omite', det: { k: 'p.datos.cache' } });
    res.pasos.push({ nombre: 'modelo', estado: 'omite', label: 'est.nosellama', det: { k: 'p.modelo.cache' } });
    const guardada = E.cache.get(clave);
    res.bot = { lado: 'bot', partes: [...guardada.partes, { cache: true }], hora };
    res.efectos.push(() => { E.cacheHits += 1; });
    res.pie = { k: 'pie.cache' };
  } else {
    const dat = r.datos || { k: 'p.datos.nada', estado: 'omite' };
    res.pasos.push({ nombre: 'datos', estado: dat.estado || 'ok', label: dat.label || (dat.estado === 'omite' ? 'est.omite' : 'est.leidos'), det: { k: dat.k, vars: dat.vars }, extra: dat.chips && dat.chips.length ? { tipo: 'chips', items: dat.chips } : null });
    res.pasos.push({ nombre: 'modelo', estado: 'ok', label: 'est.unallamada', det: r.modelo });
    res.bot = { lado: 'bot', partes: r.partes, botones: r.botones, hora };
    if (clave) res.efectos.push(() => { E.cache.set(clave, { partes: r.partes }); });
    res.efectos.push(() => { E.modelo += 1; });
    res.costo = 1;
    res.pie = { k: 'pie.modelo' };
  }
  const conFuente = res.bot.partes.some((x) => x.fuente);
  res.pasos.push({ nombre: 'resp', estado: 'ok', label: 'est.salio', det: { k: conFuente ? 'p.resp.ok' : 'p.resp.sinfuente', vars: { n: () => E.mensajes.filter((m) => m.lado === 'yo' || m.lado === 'bot').length } } });
  return res;
}

/* ---------- Dibujo del chat ---------- */
function htmlPartes(partes) {
  return partes.map((x) => {
    if (x.p) return `<p>${esc(t(x.p, x.vars))}</p>`;
    if (x.ul) return `<ul>${x.ul.map((li) => `<li>${esc(t(li.k, li.vars))}</li>`).join('')}</ul>`;
    if (x.fuente) return `<p class="burbuja__fuente">${esc(t(x.fuente))}</p>`;
    if (x.cache) return `<p class="burbuja__cache"><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2.5 8a5.5 5.5 0 1 0 1.7-4"/><path d="M2.3 1.8v2.6h2.6"/></svg>${esc(t('r.cache.nota'))}</p>`;
    return '';
  }).join('');
}
function meta(m, leido) {
  return `<span class="burbuja__meta">${esc(m.hora)}${m.lado === 'yo' ? ICONO_TILDE : ''}<span class="sr">${leido ? esc(t('chat.leido')) : ''}</span></span>`;
}

function fotoSVG(n) {
  const f = (v, d = 1) => num(v, d);
  const filas = REPORTE_FOTO.map((r, i) => {
    const y = 112 + i * 25;
    const j = jugador(r.id);
    const km = r.km == null ? f(r.dudas[0]) : f(r.km);
    const mancha = r.km == null ? `<ellipse cx="258" cy="${y - 5}" rx="11" ry="8" fill="oklch(32% 0.03 260)" opacity="0.55" filter="url(#borron${n})"/>` : '';
    return `<g><text x="62" y="${y}">${esc(apellido(j))}</text><text x="262" y="${y}" text-anchor="end">${km}</text>${mancha}<text x="340" y="${y}" text-anchor="end">${num(r.sprint)}</text><line x1="56" x2="348" y1="${y + 8}" y2="${y + 8}" stroke="oklch(80% 0.01 80)" stroke-width="0.8"/></g>`;
  }).join('');
  return `<svg viewBox="0 0 400 300" role="img" aria-label="${esc(t('foto.alt'))}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="mesa${n}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="oklch(34% 0.035 55)"/><stop offset="1" stop-color="oklch(22% 0.025 50)"/></linearGradient>
    <linearGradient id="luz${n}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="oklch(100% 0 0)" stop-opacity="0.22"/><stop offset="0.6" stop-color="oklch(100% 0 0)" stop-opacity="0"/></linearGradient>
    <filter id="borron${n}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2"/></filter>
    <filter id="sombra${n}" x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>
  <rect width="400" height="300" fill="url(#mesa${n})"/>
  <g transform="rotate(-3.5 200 160)">
    <rect x="44" y="34" width="318" height="248" rx="3" fill="oklch(10% 0.02 50)" opacity="0.55" filter="url(#sombra${n})" transform="translate(6 10)"/>
    <rect x="44" y="30" width="318" height="250" rx="3" fill="oklch(96.5% 0.008 85)"/>
    <g font-family="Inter, Arial, sans-serif" fill="oklch(22% 0.012 80)">
      <text x="62" y="58" font-size="10.5" font-weight="600" letter-spacing="1.2">${esc(t('foto.cabeza'))}</text>
      <text x="62" y="73" font-size="9" fill="oklch(45% 0.015 80)">${esc(t('foto.sub'))}</text>
      <g font-size="8.5" font-weight="600" fill="oklch(45% 0.015 80)" letter-spacing="0.8"><text x="62" y="88">${esc(t('foto.col1'))}</text><text x="262" y="88" text-anchor="end">${esc(t('foto.col2'))}</text><text x="340" y="88" text-anchor="end">${esc(t('foto.col3'))}</text></g>
      <line x1="56" x2="348" y1="93" y2="93" stroke="oklch(40% 0.012 80)" stroke-width="1"/>
      <g font-size="11.5">${filas}</g>
    </g>
  </g>
  <rect width="400" height="300" fill="url(#luz${n})"/>
</svg>`;
}

function htmlMensaje(m, i) {
  if (m.lado === 'fecha') return `<li class="chat__fecha"><span>${esc(t(m.k))}</span></li>`;
  if (m.lado === 'sistema') return `<li class="chat__sistema"><span>${esc(t(m.k, m.vars))}</span></li>`;
  if (m.lado === 'escribe') return `<li class="bot"><div class="burbuja escribe" aria-label="${esc(t('chat.escribiendo'))}"><i></i><i></i><i></i></div></li>`;
  const cls = m.lado === 'yo' ? 'yo' : 'bot';
  const nuevo = m.nuevo ? ' entra' : '';
  if (m.lado === 'yo' && m.tipo === 'voz') {
    const barras = ONDA.map((h, k) => `<i style="height:${Math.round(8 + h * 20)}px" data-k="${k}"></i>`).join('');
    const trans = m.transcrita
      ? `<p class="voz__trans"><span class="voz__trans-et">${esc(t('voz.et'))}</span>${esc(t('voz.transcripcion'))}</p>`
      : `<p class="voz__trans pendiente">${esc(t('voz.transcribiendo'))}</p>`;
    return `<li class="${cls}${nuevo}"><div class="burbuja burbuja--voz"><div class="voz"><button type="button" class="voz__play" aria-pressed="false" aria-label="${esc(t('voz.play'))}" data-voz="${i}"><svg class="i-play" viewBox="0 0 20 20" aria-hidden="true"><path d="M6.5 4.5v11l9-5.5Z"/></svg><svg class="i-pausa" viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5v10M13 5v10"/></svg></button><span class="voz__onda" aria-hidden="true">${barras}</span><span class="voz__dur">0:0${VOZ.segundos}</span></div>${trans}${meta(m, true)}</div></li>`;
  }
  if (m.lado === 'yo' && m.tipo === 'foto') {
    return `<li class="${cls}${nuevo}"><div class="burbuja burbuja--foto"><div class="foto">${fotoSVG(m.n)}</div><p class="burbuja__pie">${esc(t('foto.pie'))}</p>${meta(m, true)}</div></li>`;
  }
  if (m.lado === 'yo') {
    const texto = m.clave ? t(m.clave) : m.texto;
    return `<li class="${cls}${nuevo}"><div class="burbuja"><p>${esc(texto)}</p>${meta(m, true)}</div></li>`;
  }
  const botones = m.botones && m.botonesVivos
    ? `<div class="teclado" role="group" aria-label="${esc(t('chat.respuestas'))}">${m.botones.map((b) => `<button type="button" class="teclado__b" data-confirma="${b.n}">${esc(num(b.n, b.d))} km</button>`).join('')}</div>`
    : '';
  return `<li class="${cls}${nuevo}"><div class="burbuja">${htmlPartes(m.partes)}${meta(m)}${botones}</div></li>`;
}

function dibujarChat() {
  const ol = $('#mensajes');
  ol.innerHTML = E.mensajes.map(htmlMensaje).join('');
  E.mensajes.forEach((m) => { m.nuevo = false; });
  ol.scrollTop = ol.scrollHeight;
}
function agregar(m) {
  m.nuevo = !quieto;
  E.mensajes.push(m);
  dibujarChat();
}
function quitarEscribe() {
  const i = E.mensajes.findIndex((m) => m.lado === 'escribe');
  if (i >= 0) E.mensajes.splice(i, 1);
}

/* ---------- Dibujo de la traza ---------- */
const ICONOS_PASO = {
  ok: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2.5 6.2 2.3 2.3 4.7-5"/></svg>',
  cache: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6a4 4 0 1 0 1.2-2.9"/><path d="M2 1.6v2h2"/></svg>',
  frena: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3 3 6 6M9 3 3 9"/></svg>',
  omite: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 6h6"/></svg>',
};
function htmlExtra(x) {
  if (!x) return '';
  if (x.tipo === 'cita') return `<div class="paso__extra"><blockquote>${t('cita.abre')}${esc(t(x.k))}${t('cita.cierra')}</blockquote></div>`;
  if (x.tipo === 'chips') return `<div class="paso__extra paso__chips">${x.items.map((c) => `<span>${esc(t(c.k, c.vars))}</span>`).join('')}</div>`;
  if (x.tipo === 'tabla-foto') {
    const filas = REPORTE_FOTO.map((r) => {
      const j = jugador(r.id);
      const km = r.km == null ? `${num(r.dudas[0], 1)} / ${num(r.dudas[1], 1)} ?` : num(r.km, 1);
      return `<tr${r.km == null ? ' class="dudosa"' : ''}><th scope="row">${esc(apellido(j))}</th><td>${km}</td><td>${num(r.sprint)}</td></tr>`;
    }).join('');
    return `<div class="paso__extra"><table class="paso__tabla"><thead><tr><th scope="col">${esc(t('foto.col1'))}</th><th scope="col">${esc(t('foto.col2'))}</th><th scope="col">${esc(t('foto.col3'))}</th></tr></thead><tbody>${filas}</tbody></table></div>`;
  }
  return '';
}
function htmlPaso(p, visible) {
  const det = p.det ? { k: p.det.k, vars: p.det.vars && Object.fromEntries(Object.entries(p.det.vars).map(([a, b]) => [a, typeof b === 'function' ? b() : b])) } : null;
  const clase = visible ? `paso--${p.estado}` : 'paso--espera';
  return `<li class="paso ${clase}${p.nuevo ? ' entra' : ''}"><span class="paso__punto">${ICONOS_PASO[p.estado] || ''}</span><div class="paso__cuerpo"><div class="paso__fila"><span class="paso__nombre">${esc(t(`p.${p.nombre}`))}</span><span class="paso__estado">${visible ? esc(t(p.label)) : ''}</span></div>${visible && det ? `<p class="paso__detalle">${esc(t(det.k, det.vars))}</p>` : ''}${visible ? htmlExtra(p.extra) : ''}</div></li>`;
}
function dibujarTraza() {
  const tr = E.traza;
  if (!tr) return;
  $('#traza-titulo').textContent = t(tr.titulo.k, tr.titulo.vars);
  $('#pasos').innerHTML = tr.pasos.map((p, i) => htmlPaso(p, i < tr.visibles)).join('');
  tr.pasos.forEach((p) => { p.nuevo = false; });
  $('#traza-pie').textContent = tr.visibles >= tr.pasos.length && tr.pie ? t(tr.pie.k) : '';
}

/* ---------- Contadores ---------- */
const prev = {};
function dibujarContadores(animar = true) {
  const v = { 'c-consultas': E.usados, 'c-limite': CLUB.limite, 'c-cache': E.cacheHits, 'c-dup': E.duplicados, 'c-modelo': E.modelo };
  for (const [id, n] of Object.entries(v)) {
    const el = $(`#${id}`);
    const txt = num(n);
    if (el.textContent !== txt) {
      el.textContent = txt;
      const dd = el.closest('dd');
      if (animar && !quieto && prev[id] != null) { dd.classList.remove('cambio'); void dd.offsetWidth; dd.classList.add('cambio'); }
    }
    prev[id] = n;
  }
}

/* ---------- Orquestación de una entrada ---------- */
function bloquear() {
  E.ocupado = true;
  $$('[data-accion]').forEach((b) => b.setAttribute('aria-disabled', 'true'));
}
async function enviar(entrada, yaBloqueado = false) {
  if (E.ocupado && !yaBloqueado) return;
  bloquear();
  // Las respuestas rápidas del último mensaje del bot dejan de valer.
  E.mensajes.forEach((m) => { m.botonesVivos = false; });

  const res = procesar(entrada);
  if (res.yo) agregar(res.yo);
  for (const s of res.sistema) agregar({ lado: 'sistema', ...s });
  E.traza = { titulo: res.titulo, pasos: res.pasos, visibles: quieto ? res.pasos.length : 0, pie: res.pie };
  dibujarTraza();

  const estado = $('#chat-estado');
  for (let i = 0; i < res.pasos.length; i++) {
    await esperar(i === 0 ? 180 : res.pasos[i].nombre === 'prep' && entrada.tipo !== 'texto' ? 420 : 260);
    const p = res.pasos[i];
    if (p.alLlegar) p.alLlegar();
    if (!quieto) { E.traza.visibles = i + 1; p.nuevo = true; dibujarTraza(); }
    if (p.nombre === 'prep' && entrada.tipo === 'voz') dibujarChat();
    if (p.nombre === 'cache' && res.bot) {
      estado.textContent = t('chat.escribiendo'); estado.classList.add('escribiendo');
      if (!quieto) { E.mensajes.push({ lado: 'escribe' }); dibujarChat(); }
    }
  }
  res.efectos.forEach((f) => f());
  quitarEscribe();
  if (res.bot) { res.bot.botonesVivos = !!res.bot.botones; agregar(res.bot); }
  else dibujarChat();
  estado.textContent = t('chat.estado'); estado.classList.remove('escribiendo');
  E.traza.visibles = res.pasos.length;
  dibujarTraza();
  dibujarContadores();
  dibujarBotonLimite();
  E.ocupado = false;
  $$('[data-accion]').forEach((b) => b.removeAttribute('aria-disabled'));
}

const ACCIONES = {
  voz: () => enviar({ tipo: 'voz' }),
  foto: () => enviar({ tipo: 'foto' }),
  riesgo: () => enviar({ tipo: 'texto', clave: 'q.riesgo', intento: { intent: 'riesgo' } }),
  fuera: () => enviar({ tipo: 'texto', clave: 'q.fuera', intento: { intent: 'fuera' } }),
  duplicado: () => enviar({ tipo: 'duplicado' }),
  limite: async () => {
    if (E.ocupado) return;
    if (E.usados >= CLUB.limite) {
      E.usados = 0;
      agregar({ lado: 'sistema', k: 'sis.renovado' });
      dibujarContadores();
      dibujarBotonLimite();
      return;
    }
    bloquear();
    const salto = CLUB.limite - E.usados;
    E.usados = CLUB.limite;
    agregar({ lado: 'sistema', k: 'sis.salto', vars: { n: salto } });
    dibujarContadores();
    await esperar(300);
    await enviar({ tipo: 'texto', clave: 'q.limite', intento: { intent: 'ficha', j: jugador('corvalan') } }, true);
  },
};
function dibujarBotonLimite() {
  const b = $('[data-accion="limite"]');
  const lleno = E.usados >= CLUB.limite;
  $('.accion__nombre', b).textContent = t(lleno ? 'acc.renovar' : 'acc.limite');
  $('.accion__que', b).textContent = t(lleno ? 'acc.renovar.que' : 'acc.limite.que');
}

document.addEventListener('click', (ev) => {
  const a = ev.target.closest('[data-accion]');
  if (a) { ev.preventDefault(); if (a.getAttribute('aria-disabled') !== 'true') ACCIONES[a.dataset.accion](); return; }
  const c = ev.target.closest('[data-confirma]');
  if (c && !E.ocupado) { const v = Number(c.dataset.confirma); enviar({ tipo: 'texto', texto: `${num(v, 1)} km`, intento: { intent: 'confirma', valor: v } }); return; }
  const v = ev.target.closest('[data-voz]');
  if (v) reproducirVoz(v);
});

// Nota de voz: no hay audio real; la onda se recorre en 6 s y se detiene (nada en bucle).
let vozRaf = 0;
function reproducirVoz(boton) {
  const barras = $$('.voz__onda i', boton.closest('.voz'));
  if (boton.getAttribute('aria-pressed') === 'true') { cancelAnimationFrame(vozRaf); boton.setAttribute('aria-pressed', 'false'); return; }
  boton.setAttribute('aria-pressed', 'true');
  const dur = boton.closest('.burbuja').querySelector('.voz__dur');
  const t0 = performance.now();
  const total = VOZ.segundos * 1000;
  const paso = (ahora) => {
    const f = Math.min(1, (ahora - t0) / total);
    const k = Math.round(f * barras.length);
    barras.forEach((b, i) => b.classList.toggle('oido', i < k));
    dur.textContent = `0:0${Math.min(VOZ.segundos, Math.floor(f * VOZ.segundos))}`;
    if (f < 1 && boton.isConnected) vozRaf = requestAnimationFrame(paso);
    else { boton.setAttribute('aria-pressed', 'false'); dur.textContent = `0:0${VOZ.segundos}`; barras.forEach((b) => b.classList.remove('oido')); }
  };
  if (quieto) { boton.setAttribute('aria-pressed', 'false'); return; }
  vozRaf = requestAnimationFrame(paso);
}

// Texto libre
const campo = $('#campo');
const form = $('#componer');
function alternarEnviar() {
  const hay = campo.value.trim().length > 0;
  $('#boton-enviar').hidden = !hay;
  $('#boton-voz').hidden = hay;
}
campo.addEventListener('input', alternarEnviar);
form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const texto = campo.value.trim();
  if (!texto || E.ocupado) return;
  campo.value = '';
  alternarEnviar();
  enviar({ tipo: 'texto', texto });
});

/* =========================================================
   Bots proactivos: un día
   ========================================================= */
const regla = $('#regla');
const ICONO_EV = {
  precios: '<svg viewBox="0 0 12 12"><path d="M2 9.5 5 6l2 2 3-4"/><path d="M7.5 4H10v2.5"/></svg>',
  radar: '<svg viewBox="0 0 12 12"><circle cx="6" cy="6" r="4"/><path d="M6 6 9 3"/></svg>',
  parcial: '<svg viewBox="0 0 12 12"><rect x="2" y="2.5" width="8" height="7.5" rx="1"/><path d="M2 5h8M4.5 1.5v2M7.5 1.5v2"/></svg>',
  rutina: '<svg viewBox="0 0 12 12"><path d="M1.5 6h9M3 4v4M9 4v4"/></svg>',
};
const pct = (m) => ((m - DIA.desde) / (DIA.hasta - DIA.desde)) * 100;

function montarEje() {
  const ticks = $('#ticks');
  ticks.innerHTML = '';
  for (let h = DIA.desde / 60; h <= DIA.hasta / 60; h += 2) {
    const s = document.createElement('span');
    s.style.left = `${pct(h * 60)}%`;
    s.textContent = `${String(h).padStart(2, '0')}:00`;
    ticks.append(s);
  }
  const pista = $('.eje__pista');
  for (const ev of EVENTOS) {
    const p = document.createElement('span');
    p.className = 'eje__punto';
    p.dataset.ev = ev.id;
    // El pulgar mide 24 px: el punto se corrige para coincidir con la posición real del valor.
    p.style.left = `calc(${pct(ev.min)}% + ${12 - (24 * pct(ev.min)) / 100}px)`;
    pista.append(p);
  }
}

let firmaDia = '';
function dibujarDia(animarNuevo = true, nuevos = [], forzar = true) {
  const m = E.minuto;
  regla.value = String(m);
  regla.style.setProperty('--p', `${pct(m)}%`);
  regla.setAttribute('aria-valuetext', hhmm(m));
  $('#reloj-hora').textContent = hhmm(m);
  $('#bloqueo-hora').textContent = hhmm(m);
  const pasados = EVENTOS.filter((e) => e.min <= m);
  if (!E.sel || !EVENTOS.some((e) => e.id === E.sel)) E.sel = (pasados[pasados.length - 1] || EVENTOS[0]).id;
  // Lo pesado (marcas, avisos, ficha) se redibuja sólo si cambió qué pasó o qué está elegido.
  const firma = `${pasados.length}|${E.sel}|${E.idioma}`;
  if (!forzar && firma === firmaDia) return;
  firmaDia = firma;

  $$('.eje__punto').forEach((p) => p.classList.toggle('hecho', EVENTOS.find((e) => e.id === p.dataset.ev).min <= m));
  $('#marcas').innerHTML = EVENTOS.map((e) => {
    const hecho = e.min <= m;
    return `<li><button type="button" class="marca-ev${hecho ? ' marca-ev--hecho' : ''}" data-ev="${e.id}" aria-pressed="${e.id === E.sel}"><span class="marca-ev__fila"><span class="marca-ev__hora">${hhmm(e.min)}</span><span class="marca-ev__estado">${esc(t(hecho ? 'dia.hecho' : 'dia.programado'))}</span></span><span class="marca-ev__nombre">${esc(t(`ev.${e.id}.t`))}</span><span class="marca-ev__proy">${esc(t(`proy.${e.proyecto}`))}</span></button></li>`;
  }).join('');

  const avisos = [...pasados].reverse();
  $('#avisos').innerHTML = avisos.map((e) => `<li class="noti${e.id === E.sel ? ' noti--sel' : ''}${animarNuevo && nuevos.includes(e.id) && !quieto ? ' entra' : ''}"><p class="noti__cabeza"><span class="noti__icono">${ICONO_EV[e.id]}</span>${esc(t(`ev.${e.id}.app`))}<span class="noti__hora">${hhmm(e.min)}</span></p><p class="noti__titulo">${esc(t(`ev.${e.id}.noti.t`))}</p><p class="noti__texto">${esc(t(`ev.${e.id}.noti.p`))}</p></li>`).join('');
  $('#avisos-vacio').hidden = avisos.length > 0;
  dibujarFicha();
}

function dibujarFicha() {
  const e = EVENTOS.find((x) => x.id === E.sel);
  const hecho = e.min <= E.minuto;
  const k = (s) => t(`ev.${e.id}.${s}`);
  let extra = '';
  if (e.id === 'precios') {
    const filas = PRECIOS.map((p) => {
      const cambio = p.ahora == null ? `<td class="sube">${esc(t('precios.sinstock'))}</td>` : `<td class="${p.ahora < p.antes ? 'baja' : 'sube'}">US$ ${num(p.ahora)} (${p.ahora < p.antes ? '−' : '+'}${num(Math.round(Math.abs(p.ahora / p.antes - 1) * 100))} %)</td>`;
      return `<tr><th scope="row">${esc(t(`precios.${p.prod}`))}</th><td>${esc(t(`tienda.${p.tienda}`))}</td><td>US$ ${num(p.antes)}</td>${cambio}</tr>`;
    }).join('');
    extra = `<div class="ficha__extra"><h4>${esc(t('precios.titulo'))}</h4><table class="ficha__tabla"><thead><tr><th scope="col">${esc(t('precios.col1'))}</th><th scope="col">${esc(t('precios.col2'))}</th><th scope="col">${esc(t('precios.col3'))}</th><th scope="col">${esc(t('precios.col4'))}</th></tr></thead><tbody>${filas}</tbody></table></div>`;
  } else if (e.id === 'radar') {
    const items = RADAR.map((r) => `<li class="${r.estado !== 'nueva' ? 'descartada' : ''}"><span class="txt">${esc(t(`radar.${r.id}`))}</span><span class="est est--${r.estado}">${esc(t(`radar.est.${r.estado}`))}</span></li>`).join('');
    extra = `<div class="ficha__extra"><h4>${esc(t('radar.titulo'))}</h4><ul class="ficha__lista" role="list">${items}</ul><p class="ficha__costo">${esc(t('radar.costo'))}</p></div>`;
  }
  $('#ficha').innerHTML = `<div class="ficha__cabeza"><h3 class="ficha__titulo"><span class="ficha__hora">${hhmm(e.min)}</span>${esc(k('t'))}</h3><a class="ficha__proy" href="${PROYECTOS[e.proyecto]}">${esc(t(`proy.${e.proyecto}`))} →</a></div>
  <dl class="ficha__dl">
    <dt>${esc(t('ficha.disparador'))}</dt><dd>${esc(k('disparador'))}</dd>
    <dt>${esc(t('ficha.lee'))}</dt><dd>${esc(k('lee'))}</dd>
    <dt>${esc(t('ficha.regla'))}</dt><dd>${esc(k('regla'))}</dd>
    <dt>${esc(t('ficha.manda'))}</dt><dd>${hecho ? esc(k('manda')) : esc(t('ficha.todavia', { h: hhmm(e.min) }))}</dd>
    <dt>${esc(t('ficha.descarto'))}</dt><dd>${hecho ? esc(k('descarto')) : '—'}</dd>
  </dl>${hecho ? extra : ''}`;
}

function irA(m, seleccion) {
  const antes = E.minuto;
  E.minuto = Math.max(DIA.desde, Math.min(DIA.hasta, m));
  const nuevos = EVENTOS.filter((e) => e.min > antes && e.min <= E.minuto).map((e) => e.id);
  if (seleccion) E.sel = seleccion;
  else {
    const pasados = EVENTOS.filter((e) => e.min <= E.minuto);
    E.sel = (nuevos.length ? EVENTOS.find((e) => e.id === nuevos[nuevos.length - 1]) : pasados[pasados.length - 1] || EVENTOS[0]).id;
  }
  dibujarDia(true, nuevos, false);
}
regla.addEventListener('input', () => { pararDia(); irA(Number(regla.value)); });
$('#marcas').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-ev]');
  if (!b) return;
  pararDia();
  const e = EVENTOS.find((x) => x.id === b.dataset.ev);
  irA(Math.max(E.minuto, e.min), e.id);
});

let diaRaf = 0;
const boton = $('#reproducir');
function pararDia() {
  if (!E.reproduciendo) return;
  E.reproduciendo = false;
  cancelAnimationFrame(diaRaf);
  boton.setAttribute('aria-pressed', 'false');
  $('#reproducir-texto').textContent = t('dia.reproducir');
}
boton.addEventListener('click', () => {
  if (E.reproduciendo) { pararDia(); return; }
  if (E.minuto >= DIA.hasta) irA(DIA.desde);
  if (quieto) { irA(DIA.hasta); return; }
  E.reproduciendo = true;
  boton.setAttribute('aria-pressed', 'true');
  $('#reproducir-texto').textContent = t('dia.pausar');
  const desde = E.minuto;
  const t0 = performance.now();
  const total = ((DIA.hasta - desde) / (DIA.hasta - DIA.desde)) * 9000;
  const paso = (ahora) => {
    const f = Math.min(1, (ahora - t0) / total);
    const m = Math.round(desde + (DIA.hasta - desde) * f);
    if (m !== E.minuto) irA(m);
    if (f < 1 && E.reproduciendo) diaRaf = requestAnimationFrame(paso);
    else pararDia();
  };
  diaRaf = requestAnimationFrame(paso);
});
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') pararDia(); });

/* ---------- Revelado por corte de los títulos de sección ---------- */
function montarRevelado() {
  if (quieto || !('IntersectionObserver' in window)) return;
  const els = $$('.seccion .titulo-2, .seccion .cabecera .intro, .seccion .mini-titulo');
  els.forEach((el) => el.setAttribute('data-corte', ''));
  const io = new IntersectionObserver((entradas) => entradas.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add('visto'); io.unobserve(en.target); }
  }), { rootMargin: '0px 0px -18% 0px' });
  els.forEach((el) => io.observe(el));
}

/* ---------- Arranque ---------- */
$$('[data-idioma]').forEach((b) => b.addEventListener('click', () => cambiarIdioma(b.dataset.idioma)));

async function escena(nombre) {
  const pasos = {
    voz: ['voz'], foto: ['foto'], confirma: ['foto', 'confirma'], fuera: ['fuera'], cache: ['riesgo'],
    duplicado: ['voz', 'duplicado'], limite: ['limite'], todo: ['voz', 'foto'],
  }[nombre] || [];
  for (const p of pasos) {
    if (p === 'confirma') await enviar({ tipo: 'texto', texto: `${num(7.3, 1)} km`, intento: { intent: 'confirma', valor: 7.3 } });
    else await ACCIONES[p]();
  }
}

async function iniciar() {
  E.idioma = idiomaInicial();
  E.dic = await diccionario(E.idioma);
  html.lang = E.idioma;
  aplicarDiccionario();
  $$('[data-idioma]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.idioma === E.idioma)));
  marcarTema();
  montarEje();

  // Historial previo del chat: el saludo y una consulta ya respondida (con su traza).
  E.mensajes.push({ lado: 'fecha', k: 'chat.hoy' });
  E.mensajes.push({ lado: 'bot', partes: [{ p: 'r.bienvenida', vars: { n: PLANTEL.length } }], hora: '09:00' });
  const res = procesar({ tipo: 'texto', clave: 'q.riesgo', intento: { intent: 'riesgo' } });
  res.yo.hora = '09:02'; res.bot.hora = '09:02';
  E.mensajes.push(res.yo);
  res.efectos.forEach((f) => f());
  E.mensajes.push(res.bot);
  E.traza = { titulo: res.titulo, pasos: res.pasos, visibles: res.pasos.length, pie: res.pie };
  dibujarChat();
  dibujarTraza();
  dibujarContadores(false);
  dibujarBotonLimite();

  const h = params.get('hora');
  if (h && /^\d{1,2}:\d{2}$/.test(h)) { const [a, b] = h.split(':').map(Number); E.minuto = Math.max(DIA.desde, Math.min(DIA.hasta, a * 60 + b)); }
  const ev = params.get('evento');
  // Al abrir, todo el día ya pasó: se muestra el radar, que es el que tiene el costo medido.
  E.sel = ev && EVENTOS.some((e) => e.id === ev) ? ev : 'radar';
  dibujarDia(false);
  montarRevelado();

  const es = params.get('escena');
  if (es) await escena(es);
  html.dataset.listo = '1';
}
iniciar();
