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
function marcarTema() {
  const oscuro = temaActual() === 'dark';
  qsa('.tema').forEach((b) => b.setAttribute('aria-pressed', String(oscuro)));
}
function iniciarTema() {
  marcarTema();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', marcarTema);
  qsa('.tema').forEach((b) => {
    b.addEventListener('click', () => {
      const nuevo = temaActual() === 'dark' ? 'light' : 'dark';
      html.dataset.theme = nuevo;
      try { localStorage.setItem('tema', nuevo); } catch {}
      marcarTema();
      document.dispatchEvent(new CustomEvent('tema', { detail: nuevo }));
    });
  });
}

/* ---------- Idioma ---------- */
let idioma = 'es';
let dic = null;
const guardado = (() => { try { return localStorage.getItem('idioma'); } catch { return null; } })();
idioma = params.get('idioma') || guardado || ((navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en');

export function idiomaActual() { return idioma; }

async function cargarDiccionario(l) {
  const r = await fetch(new URL(`i18n/${l}.json`, BASE));
  if (!r.ok) throw new Error('i18n ' + l);
  return r.json();
}

function aplicarDiccionario() {
  if (!dic) return;
  qsa('[data-i18n]').forEach((el) => {
    const v = dic[el.dataset.i18n];
    if (v == null) { console.warn('i18n: falta', el.dataset.i18n); return; }
    if (el.hasAttribute('data-i18n-html')) el.innerHTML = v; else el.textContent = v;
    if (el.hasAttribute('data-revelar')) delete el.dataset.original;
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
  if (guardar) { try { localStorage.setItem('idioma', l); } catch {} }
  if (l === idioma && (l === 'es' || dic)) { marcarIdioma(); return; }
  idioma = l;
  dic = await cargarDiccionario(l);
  const pintar = () => { aplicarDiccionario(); marcarIdioma(); repartirTodo(); };
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
  const elegido = !!params.get('idioma');
  if (idioma !== 'es') return cambiarIdioma(idioma, { animar: false, guardar: elegido });
  if (elegido) { try { localStorage.setItem('idioma', 'es'); } catch {} }
  return Promise.resolve();
}

/* ---------- Menú móvil ---------- */
function iniciarMenu() {
  const boton = qs('.nav__menu');
  const panel = qs('.nav__panel');
  if (!boton || !panel) return;
  const abrir = (si) => { boton.setAttribute('aria-expanded', String(si)); panel.dataset.abierto = String(si); };
  boton.addEventListener('click', () => abrir(boton.getAttribute('aria-expanded') !== 'true'));
  panel.addEventListener('click', (e) => { if (e.target.closest('a')) abrir(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') abrir(false); });
}

/* ---------- Sección actual en la nav ---------- */
function iniciarNavActual() {
  const secciones = qsa('main > section[id], header[id]');
  const enlaces = qsa('.nav__enlaces a[href^="#"]');
  if (!secciones.length || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entradas) => {
    entradas.forEach((en) => {
      if (!en.isIntersecting) return;
      enlaces.forEach((a) => a.toggleAttribute('aria-current', a.getAttribute('href') === '#' + en.target.id) || a.removeAttribute('aria-current'));
      enlaces.forEach((a) => { if (a.getAttribute('href') === '#' + en.target.id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  secciones.forEach((s) => io.observe(s));
}

/* ---------- Texto por corte ---------- */
const revelados = new Map();

function partirLineas(el) {
  if (el.dataset.original == null) el.dataset.original = el.innerHTML;
  el.innerHTML = el.dataset.original;
  if (el.dataset.revelar === 'bloque') {
    const t = document.createElement('span'); t.className = 'linea__t'; t.innerHTML = el.dataset.original;
    const l = document.createElement('span'); l.className = 'linea'; l.appendChild(t);
    el.innerHTML = ''; el.appendChild(l);
    return [t];
  }
  const trozos = [];
  el.childNodes.forEach((n) => {
    if (n.nodeType === 3) n.textContent.split(/\s+/).forEach((p) => { if (p) trozos.push(p); });
    else if (n.nodeName === 'BR') trozos.push(n);
    else n.textContent.split(/\s+/).forEach((p) => { if (p) trozos.push(p); });
  });
  el.innerHTML = '';
  const spans = trozos.map((tk) => {
    if (typeof tk !== 'string') { const b = document.createElement('br'); el.appendChild(b); return b; }
    const s = document.createElement('span'); s.textContent = tk; el.appendChild(s); el.appendChild(document.createTextNode(' ')); return s;
  });
  const lineas = []; let top = null; let actual = [];
  spans.forEach((s) => {
    if (s.nodeName === 'BR') return;
    const t = s.offsetTop;
    if (top === null || Math.abs(t - top) > 2) { if (actual.length) lineas.push(actual); actual = []; top = t; }
    actual.push(s.textContent);
  });
  if (actual.length) lineas.push(actual);
  el.innerHTML = '';
  return lineas.map((l) => {
    const w = document.createElement('span'); w.className = 'linea';
    const t = document.createElement('span'); t.className = 'linea__t'; t.textContent = l.join(' ');
    w.appendChild(t); el.appendChild(w); return t;
  });
}

function armarRevelado(el) {
  const previo = revelados.get(el);
  if (previo?.tl) { previo.tl.scrollTrigger?.kill(); previo.tl.kill(); }
  const hecho = previo?.hecho || IR;
  const lineas = partirLineas(el);
  if (SIN_MOVIMIENTO || !window.gsap) {
    revelados.set(el, { hecho: true });
    if (!el.classList.contains('visto') && !SIN_MOVIMIENTO) el.classList.add('visto');
    return;
  }
  if (hecho) { revelados.set(el, { hecho: true }); return; }
  const esTitulo = /^H[1-3]$/.test(el.tagName);
  const [inicio, fin] = (el.dataset.revelarRango || '82 65').split(' ');
  gsap.set(lineas, { clipPath: 'inset(0 0 100% 0)', y: 12, opacity: 0 });
  const marcar = () => { const r = revelados.get(el); if (r) r.hecho = true; };
  const alto = innerHeight * (inicio / 100);
  if (el.getBoundingClientRect().top < alto) {
    // ya está a la vista al cargar (héroe, o tras ?ir=): entra por tiempo, no por scroll
    const orden = qsa('[data-revelar]').indexOf(el);
    const tl = gsap.timeline({ delay: 0.08 + Math.min(orden, 10) * 0.07, onComplete: marcar });
    tl.to(lineas, { clipPath: 'inset(0 0 0% 0)', y: 0, opacity: 1, duration: esTitulo ? 0.9 : 0.6, stagger: 0.06, ease: 'expo.out' });
    revelados.set(el, { tl, hecho: false });
    return;
  }
  const tl = gsap.timeline({
    scrollTrigger: { trigger: el, start: `top ${inicio}%`, end: `top ${fin}%`, scrub: 0.6, once: true },
    onComplete: marcar,
  });
  tl.to(lineas, { clipPath: 'inset(0 0 0% 0)', y: 0, opacity: 1, duration: esTitulo ? 0.9 : 0.6, stagger: 0.06, ease: 'none' });
  revelados.set(el, { tl, hecho: false });
}

function repartirTodo() {
  qsa('[data-revelar]').forEach(armarRevelado);
  if (window.ScrollTrigger) ScrollTrigger.refresh();
}

function iniciarRevelados() {
  if (window.gsap && window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
  repartirTodo();
  if (SIN_MOVIMIENTO && !QUIETO) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visto'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -15% 0px' });
    qsa('[data-revelar]').forEach((el) => io.observe(el));
  }
  let ancho = innerWidth; let t;
  addEventListener('resize', () => {
    if (innerWidth === ancho) return;
    ancho = innerWidth;
    clearTimeout(t); t = setTimeout(repartirTodo, 160);
  });
  if (document.fonts?.ready) document.fonts.ready.then(() => { if (!document.fonts.check('600 1em Inter')) return; repartirTodo(); });
}

/* ---------- Folios, máscaras y clases «visto» ---------- */
function iniciarVistos() {
  if (QUIETO || IR) { qsa('.folio, .mascara, [data-visto]').forEach((el) => el.classList.add('visto')); return; }
  const observar = (sel, margen) => {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('visto'); io.unobserve(e.target); } }), { rootMargin: `0px 0px -${margen}% 0px` });
    qsa(sel).forEach((el) => io.observe(el));
  };
  observar('.folio', 35);
  observar('.mascara', 40);
  observar('[data-visto]', 30);
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
  await iniciarIdioma();
  irASeccion();
  iniciarRevelados();
  iniciarVistos();
  iniciarNavActual();
}

iniciar();
