const params = new URLSearchParams(location.search);
const html = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const quieto = params.get('quieto') === '1' || reduce;
const posterN = params.get('poster');
const medir = params.get('medir') === '1';
const escenaEl = document.querySelector('.escena');
const lienzo = document.getElementById('lienzo');
const secciones = [...document.querySelectorAll('.parada')];
const litrosEl = document.getElementById('litros');
const posters = [...document.querySelectorAll('.poster')];

let idioma = 'es';
const diccionarios = { es: null, en: null };
let escena = null;
let claves = [];
let posiciones = [];
let interp = null;
const prox = { y: 0, objetivo: 0 };
let maxScroll = 1;
let ultimoLitros = -1;
let bucle = null;
let anchoPrevio = innerWidth;

/* ---------- Tema ---------- */
function temaActual() {
  const q = params.get('tema');
  if (q === 'light' || q === 'dark') return q;
  const t = html.dataset.theme;
  if (t === 'light' || t === 'dark') return t;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function aplicarTema(t, guardar = true) {
  html.dataset.theme = t;
  if (guardar) { try { localStorage.setItem('tema', t); } catch (e) {} }
  document.querySelectorAll('.conm-tema').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tema === t)));
  if (escena) { escena.setTema(t === 'dark'); escena.evento(); despertar(); }
}
document.querySelectorAll('.conm-tema').forEach(b => {
  b.addEventListener('click', () => aplicarTema(b.dataset.tema));
  b.setAttribute('aria-pressed', String(b.dataset.tema === temaActual()));
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!html.dataset.theme && escena) { escena.setTema(temaActual() === 'dark'); despertar(); } });

/* ---------- Idioma ---------- */
function formatoLitros(v, lang) {
  const s = v.toFixed(2);
  return (lang === 'es' ? s.replace('.', ',') : s) + ' L';
}
function etiquetasDial(lang) {
  return lang === 'es' ? ['0,25', '0,5', '0,75', '1 L'] : ['0.25', '0.5', '0.75', '1 L'];
}
async function cargarDiccionario(lang) {
  if (diccionarios[lang]) return diccionarios[lang];
  const r = await fetch(`i18n/${lang}.json`, { cache: 'force-cache' });
  diccionarios[lang] = await r.json();
  return diccionarios[lang];
}
function aplicarDiccionario(dic) {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.dataset.i18n;
    if (!(k in dic)) return;
    const attr = el.dataset.i18nAttr;
    if (attr) el.setAttribute(attr, dic[k]); else { el.textContent = dic[k]; delete el.dataset.texto; }
  });
}
async function aplicarIdioma(lang, guardar = true) {
  const dic = await cargarDiccionario(lang);
  const cambio = () => {
    aplicarDiccionario(dic);
    html.lang = lang;
    document.title = dic['meta.titulo'];
    document.querySelector('meta[name="description"]').content = dic['meta.descripcion'];
    document.querySelectorAll('[data-idioma]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.idioma === lang)));
    idioma = lang;
    if (guardar) { try { localStorage.setItem('idioma', lang); } catch (e) {} }
    if (escena) { escena.setDial(etiquetasDial(lang)); despertar(); }
    ultimoLitros = -1;
    if (quieto || !escena) litrosEl.textContent = formatoLitros(quieto ? 0.75 : 1, lang);
    partirTodo();
  };
  if (document.startViewTransition && !quieto && idioma !== lang) document.startViewTransition(cambio); else cambio();
}
document.querySelectorAll('[data-idioma]').forEach(b => b.addEventListener('click', () => aplicarIdioma(b.dataset.idioma)));

function idiomaInicial() {
  const q = params.get('idioma');
  if (q === 'es' || q === 'en') return q;
  try { const g = localStorage.getItem('idioma'); if (g === 'es' || g === 'en') return g; } catch (e) {}
  return (navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en';
}

/* ---------- Revelado por corte (línea a línea, atado al scroll) ---------- */
const TEXTO = 'h1, h2, h3, p, dt, dd, figcaption';

function partirLineas(el) {
  const texto = (el.dataset.texto || el.textContent).replace(/\s+/g, ' ').trim();
  el.dataset.texto = texto;
  el.innerHTML = texto.split(' ').map(w => `<span class="w">${w}</span>`).join(' ');
  const lineas = [];
  let top = null;
  el.querySelectorAll('.w').forEach(w => {
    const t = w.offsetTop;
    if (t !== top) { lineas.push([]); top = t; }
    lineas[lineas.length - 1].push(w.textContent);
  });
  el.innerHTML = lineas.map(l => `<span class="ln"><span class="li">${l.join(' ')}</span></span>`).join('');
  return [...el.querySelectorAll('.li')];
}

function partir(bloque) {
  if (bloque._tl) { if (bloque._tl.scrollTrigger) bloque._tl.scrollTrigger.kill(); bloque._tl.kill(); bloque._tl = null; }
  const hojas = bloque.matches(TEXTO) ? [bloque] : [...bloque.querySelectorAll(TEXTO)];
  const lis = hojas.flatMap(partirLineas);
  if (!lis.length) return;
  const r = bloque.getBoundingClientRect();
  const enVista = r.top <= innerHeight * 0.88 && r.bottom > 0;
  const desde = { clipPath: 'inset(0 0 100% 0)', y: 14, opacity: 0 };
  const hasta = { clipPath: 'inset(0 0 -4% 0)', y: 0, opacity: 1, ease: 'none' };
  let tl;
  if (enVista) {
    tl = gsap.timeline({ delay: 0.08 });
    lis.forEach((li, i) => tl.fromTo(li, desde, { ...hasta, duration: 0.9, ease: 'expo.out' }, i * 0.06));
  } else {
    tl = gsap.timeline({ scrollTrigger: { trigger: bloque, start: 'top 88%', end: 'top 58%', scrub: true, once: true } });
    lis.forEach((li, i) => tl.fromTo(li, desde, { ...hasta, duration: 1 }, i * 0.18));
  }
  bloque._tl = tl;
}

function partirTodo() {
  const els = document.querySelectorAll('[data-rev]');
  if (quieto || !window.gsap) {
    if (!reduce) { els.forEach(el => el.classList.add('visto')); return; }
    els.forEach(el => {
      if (el._io) return;
      const io = new IntersectionObserver(en => { en.forEach(e => { if (e.isIntersecting) { el.classList.add('visto'); io.disconnect(); } }); }, { rootMargin: '0px 0px -10% 0px' });
      io.observe(el); el._io = io;
    });
    return;
  }
  els.forEach(partir);
  ScrollTrigger.refresh();
}

/* ---------- Folios ---------- */
function folios() {
  const io = new IntersectionObserver(en => { en.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visto'); io.unobserve(e.target); } }); }, { rootMargin: '0px 0px -35% 0px' });
  document.querySelectorAll('.folio').forEach(f => io.observe(f));
}

/* ---------- Pósters (sin WebGL o quieto) ---------- */
function activarPosters() {
  const io = new IntersectionObserver(en => {
    en.forEach(e => {
      if (!e.isIntersecting) return;
      const i = Number(e.target.dataset.sec);
      posters.forEach(p => p.classList.toggle('activo', Number(p.dataset.parada) === i));
    });
  }, { rootMargin: '-40% 0px -40% 0px' });
  secciones.forEach(s => io.observe(s));
}

/* ---------- Escena ---------- */
function hayWebGL2() {
  try { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch (e) { return false; }
}
function estrecho() { return innerWidth < 768; }

function calcularPosiciones() {
  posiciones = claves.map(k => {
    const s = secciones[k.sec];
    return s.offsetTop + k.f * s.offsetHeight;
  });
  maxScroll = Math.max(1, html.scrollHeight - innerHeight);
}

function estadoEn(y, out) {
  const n = posiciones.length;
  if (y <= posiciones[0]) return interp(claves[0], claves[0], 0, out);
  for (let i = 0; i < n - 1; i++) {
    if (y >= posiciones[i] && y <= posiciones[i + 1]) {
      const t = (y - posiciones[i]) / Math.max(1, posiciones[i + 1] - posiciones[i]);
      return interp(claves[i], claves[i + 1], t, out);
    }
  }
  return interp(claves[n - 1], claves[n - 1], 0, out);
}

function ajusteMovil(estado) {
  if (estrecho()) { estado.dist *= 1.5; }
}

let dxActual = -1;
function redimensionarEscena(dx = dxActual < 0 ? 0.21 : dxActual) {
  const movil = estrecho();
  dxActual = dx;
  escena.redimensionar(innerWidth, innerHeight, movil ? 0 : dx, Math.min(devicePixelRatio || 1, movil ? 1 : 1.5), movil ? 0.26 : 0);
}

let cuadroPrevio = 0;
function cuadro(ahora) {
  const dt = Math.min(0.1, (ahora - cuadroPrevio) / 1000) || 0.016;
  cuadroPrevio = ahora;
  prox.y += (prox.objetivo - prox.y) * (1 - Math.exp(-dt / 0.2));
  if (Math.abs(prox.objetivo - prox.y) < 0.3) prox.y = prox.objetivo;
  estadoEn(prox.y, escena.estado);
  ajusteMovil(escena.estado);
  if (Math.abs(escena.estado.dx - dxActual) > 0.002) redimensionarEscena(escena.estado.dx);
  escena.render(ahora, true);
  const l = escena.estado.litros;
  if (Math.abs(l - ultimoLitros) > 0.004) { ultimoLitros = l; litrosEl.textContent = formatoLitros(l, idioma); }
  if (medir || escena.estaActiva() || Math.abs(prox.y - prox.objetivo) > 0.5) bucle = requestAnimationFrame(cuadro);
  else bucle = null;
}
function despertar() { if (!bucle && escena && !document.hidden && posterN === null) bucle = requestAnimationFrame(cuadro); }

function medicion() {
  const el = document.getElementById('medicion');
  el.hidden = false;
  el.textContent = 'midiendo…';
  setTimeout(() => {
    let n = 0, peor = 0;
    const t0 = performance.now();
    let prev = t0;
    const cuenta = (t) => {
      n++; peor = Math.max(peor, t - prev); prev = t;
      escena.evento();
      if (t - t0 < 5000) { requestAnimationFrame(cuenta); return; }
      const fps = n / ((t - t0) / 1000);
      el.textContent = `fps ${fps.toFixed(1)} · peor cuadro ${peor.toFixed(1)} ms · ${innerWidth}×${innerHeight} @${escena.renderer.getPixelRatio()}`;
      el.dataset.fps = fps.toFixed(1);
      document.title = 'medicion ' + el.textContent;
      console.log('MEDICION', el.textContent);
    };
    requestAnimationFrame(cuenta);
  }, 1500);
}

async function iniciarEscena() {
  const mod = await import('./escena.js');
  interp = mod.interpolar;
  claves = mod.CLAVES;
  escena = await mod.crearEscena({ lienzo, base: './', pixelRatio: 1.5, conservar: posterN !== null });
  escena.setTema(temaActual() === 'dark');
  escena.setDial(etiquetasDial(idioma));

  if (posterN !== null) {
    const k = mod.POSTERS[Number(posterN)] ?? Number(posterN);
    interp(claves[k], claves[k], 0, escena.estado);
    escena.redimensionar(innerWidth, innerHeight, innerWidth >= 768 ? escena.estado.dx : 0, 1, innerWidth >= 768 ? 0 : 0.26);
    ajusteMovil(escena.estado);
    escenaEl.classList.add('lista');
    let n = 0;
    const fijo = (t) => { escena.render(t, false); if (++n === 4) document.title = 'poster-listo'; requestAnimationFrame(fijo); };
    requestAnimationFrame(fijo);
    return;
  }

  redimensionarEscena();
  calcularPosiciones();
  prox.y = scrollY; prox.objetivo = scrollY;
  ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate: () => { prox.objetivo = scrollY; despertar(); },
    onRefresh: () => { calcularPosiciones(); prox.objetivo = scrollY; despertar(); },
  });

  addEventListener('resize', () => { redimensionarEscena(); calcularPosiciones(); escena.evento(); despertar(); });
  addEventListener('pointermove', e => { escena.puntero((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1); despertar(); }, { passive: true });
  addEventListener('scroll', () => { escena.evento(); despertar(); }, { passive: true });
  addEventListener('focus', () => { escena.evento(); despertar(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (bucle) cancelAnimationFrame(bucle); bucle = null; } else { escena.evento(); despertar(); }
  });

  escena.render(performance.now(), false);
  escenaEl.classList.add('lista');
  escena.evento();
  despertar();
  if (medir) medicion();
  window.__anfora = { prox, estado: escena.estado, posiciones: () => posiciones, maxScroll: () => maxScroll };
}

/* ---------- Arranque ---------- */
let temporizadorResize = 0;
addEventListener('resize', () => {
  if (innerWidth === anchoPrevio) return;
  anchoPrevio = innerWidth;
  clearTimeout(temporizadorResize);
  temporizadorResize = setTimeout(partirTodo, 180);
});

async function arrancar() {
  if (posterN !== null) document.body.classList.add('poster');
  if (quieto) html.classList.add('quieto');
  const temaQ = params.get('tema');
  if (temaQ === 'light' || temaQ === 'dark') aplicarTema(temaQ, false);

  const lang = idiomaInicial();
  if (lang !== 'es') await aplicarIdioma(lang, false); else { html.lang = 'es'; await cargarDiccionario('es').catch(() => {}); }

  await (document.fonts ? document.fonts.ready : Promise.resolve());
  if (window.gsap && window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);

  const ir = params.get('ir');
  const destino = ir && document.getElementById(ir);
  if (destino) {
    html.classList.add('sin-suave');
    scrollTo({ top: destino.offsetTop, left: 0, behavior: 'instant' });
    setTimeout(() => html.classList.remove('sin-suave'), 80);
  }

  folios();
  partirTodo();
  if (quieto) litrosEl.textContent = formatoLitros(0.75, lang);

  const conexion = navigator.connection || {};
  const puede = hayWebGL2() && !conexion.saveData && !(navigator.deviceMemory && navigator.deviceMemory < 2);
  if ((puede && !quieto) || posterN !== null) {
    try { await iniciarEscena(); } catch (e) { console.error('escena', e); activarPosters(); }
  } else {
    activarPosters();
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar); else arrancar();
