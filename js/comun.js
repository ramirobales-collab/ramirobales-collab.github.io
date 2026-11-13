import { iniciarMovimiento, refrescarMovimiento } from './movimiento.js';

const html = document.documentElement;
const params = new URLSearchParams(location.search);
export const QUIETO = params.get('quieto') === '1';
export const IR = params.get('ir');
export const REDUCIDO = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const SIN_MOVIMIENTO = QUIETO || REDUCIDO;
export const BASE = new URL('../', import.meta.url);
export const qs = (s, r = document) => r.querySelector(s);
export const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

if (QUIETO) html.classList.add('quieto');
if (IR) html.classList.add('ir');

/* ---------- Tema ---------- */
function temaActual() {
  return html.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}
/* El botón muestra el tema al que se pasa («Claro» estando en oscuro); su nombre dice esa misma acción, sin un
   estado «presionado» que la contradiga. */
function marcarTema() {
  const oscuro = temaActual() === 'dark';
  const clave = oscuro ? 'tema.pasar.claro' : 'tema.pasar.oscuro';
  const nombre = dic?.[clave] || NOMBRES_TEMA[idioma][oscuro ? 0 : 1];
  qsa('.tema').forEach((b) => { b.removeAttribute('aria-pressed'); b.setAttribute('aria-label', nombre); });
}
function iniciarTema() {
  marcarTema();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', marcarTema);
  qsa('.tema').forEach((b) => {
    b.addEventListener('click', () => {
      const nuevo = temaActual() === 'dark' ? 'light' : 'dark';
      const cambiar = () => { html.dataset.theme = nuevo; marcarTema(); };
      try { localStorage.setItem('tema', nuevo); } catch {}
      // fundido entre temas (sin corte seco) donde el navegador lo permite
      if (document.startViewTransition && !SIN_MOVIMIENTO && document.visibilityState === 'visible') document.startViewTransition(cambiar);
      else cambiar();
      document.dispatchEvent(new CustomEvent('tema', { detail: nuevo }));
    });
  });
}

/* ---------- Idioma ---------- */
/* `idioma` es el idioma del texto que se VE (el HTML viene en español). lang, el conmutador y lo guardado cambian
   recién cuando el diccionario llegó y se aplicó: nunca hay texto en castellano marcado como inglés. Arranca en el
   idioma con que viene escrita la página (lang del HTML). */
let idioma = (html.lang || 'es').toLowerCase().startsWith('en') ? 'en' : 'es';
let dic = null;
const NOMBRES_TEMA = { es: ['Pasar a tema claro', 'Pasar a tema oscuro'], en: ['Switch to light theme', 'Switch to dark theme'] };
const guardado = (() => { try { return localStorage.getItem('idioma'); } catch { return null; } })();
const pedido = params.get('idioma');
const preferido = (pedido === 'es' || pedido === 'en' ? pedido : null) || (guardado === 'es' || guardado === 'en' ? guardado : null) || ((navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en');

export function idiomaActual() { return idioma; }

/* Cada tipo de página pide sólo sus textos: <html data-dic="casos"> carga i18n/casos-<idioma>.json (que trae todo);
   sin el atributo se carga el general, que no lleva los textos de los casos (la portada no los descarga). */
const DIC = html.dataset.dic ? `${html.dataset.dic}-` : '';
async function cargarDiccionario(l) {
  const r = await fetch(new URL(`i18n/${DIC}${l}.json`, BASE));
  if (!r.ok) throw new Error('i18n ' + l);
  return r.json();
}

function aplicarDiccionario() {
  if (!dic) return;
  qsa('[data-i18n]').forEach((el) => {
    const v = dic[el.dataset.i18n];
    if (v == null) { console.warn('i18n: falta', el.dataset.i18n); return; }
    if (el.hasAttribute('data-i18n-html')) el.innerHTML = v; else el.textContent = v;
  });
  qsa('[data-i18n-attr]').forEach((el) => {
    el.dataset.i18nAttr.split(';').forEach((par) => {
      const [attr, k] = par.split('=').map((s) => s.trim());
      if (dic[k] != null) el.setAttribute(attr, dic[k]);
    });
  });
}

function marcarIdioma() {
  html.lang = idioma;
  qsa('.conmutador--idioma button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.idioma === idioma)));
  qsa('a[data-cv]').forEach((a) => { a.href = new URL(`cv/ramiro-bales-cv-${idioma}.pdf`, BASE).pathname; });
}

export async function cambiarIdioma(l, { animar = true, guardar = true } = {}) {
  if (l !== 'es' && l !== 'en') return;
  if (l === idioma) {
    if (guardar) { try { localStorage.setItem('idioma', l); } catch {} }
    marcarIdioma();
    return;
  }
  let nuevo;
  try { nuevo = await cargarDiccionario(l); }
  catch (e) { console.warn('i18n: no pude cargar', l, e.message); marcarIdioma(); return; } // queda el idioma que se ve
  if (guardar) { try { localStorage.setItem('idioma', l); } catch {} }
  const pintar = () => { idioma = l; dic = nuevo; aplicarDiccionario(); marcarIdioma(); marcarTema(); refrescarMovimiento(); };
  if (animar && document.startViewTransition && !SIN_MOVIMIENTO && document.visibilityState === 'visible') {
    const vt = document.startViewTransition(pintar);
    vt.ready.catch(() => {});
    await vt.finished.catch(() => {});
  } else pintar();
  document.dispatchEvent(new CustomEvent('idioma', { detail: l }));
}

function iniciarIdioma() {
  qsa('.conmutador--idioma button').forEach((b) => b.addEventListener('click', () => cambiarIdioma(b.dataset.idioma)));
  marcarIdioma();
  const elegido = !!pedido;
  if (preferido !== 'es') return cambiarIdioma(preferido, { animar: false, guardar: elegido });
  if (elegido) { try { localStorage.setItem('idioma', 'es'); } catch {} }
  return Promise.resolve();
}

/* ---------- Menú móvil ---------- */
function iniciarMenu() {
  const nav = qs('.nav');
  const boton = qs('.nav__menu');
  const panel = qs('.nav__panel');
  if (!boton || !panel) return;
  const abierto = () => boton.getAttribute('aria-expanded') === 'true';
  const abrir = (si, devolverFoco = true) => {
    if (si === abierto()) return;
    boton.setAttribute('aria-expanded', String(si));
    panel.dataset.abierto = String(si);
    nav?.classList.toggle('nav--abierta', si);
    html.classList.toggle('menu-abierto', si);
    // el resto de la página queda inerte: con el panel abierto el foco no puede irse detrás de la capa
    qsa('body > *').forEach((el) => {
      if (el === nav || el.tagName === 'SCRIPT') return;
      if (si && !el.inert) { el.inert = true; el.dataset.inertMenu = '1'; }
      else if (!si && el.dataset.inertMenu) { el.inert = false; delete el.dataset.inertMenu; }
    });
    if (si) qs('a', panel)?.focus({ preventScroll: true });
    else if (devolverFoco) boton.focus({ preventScroll: true });
  };
  boton.addEventListener('click', () => abrir(!abierto()));
  panel.addEventListener('click', (e) => { if (e.target.closest('a')) abrir(false, false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') abrir(false); });
  matchMedia('(min-width: 64em)').addEventListener('change', (e) => { if (e.matches) abrir(false, false); });
}

/* ---------- ?ir=<id> ---------- */
function irASeccion() {
  if (!IR) return;
  const destino = document.getElementById(IR);
  if (!destino) return;
  // sin scroll: se desplaza el documento con un margen negativo, así la captura es determinista
  qsa('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; });
  const primero = document.querySelector('body > header, body > main');
  const saltar = () => {
    primero.style.marginTop = '';
    const y = destino.getBoundingClientRect().top + scrollY - (destino.tagName === 'HEADER' ? 0 : parseFloat(getComputedStyle(html).scrollPaddingTop) || 0);
    primero.style.marginTop = `-${Math.max(0, Math.round(y))}px`;
    scrollTo(0, 0);
  };
  saltar();
  addEventListener('load', saltar);
  document.fonts?.ready.then(saltar);
}

/* ---------- Arranque ---------- */
export async function iniciar() {
  iniciarTema();
  iniciarMenu();
  await iniciarIdioma().catch((e) => console.warn(e.message));
  irASeccion();
  iniciarMovimiento();
}

iniciar();
