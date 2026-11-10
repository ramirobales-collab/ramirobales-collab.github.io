/* index.js — arranque de «la sala negra»: la carga como primer acto, sincronía con el DOM,
   máquina de actos, verbos del titular, zonas activas de cada producto y respaldos.
   El texto y los botones del héroe ya se ven y funcionan antes de que esto corra (y sin esto).
   Plano: portfolio-docs/v3/motor.md. Interfaz para la segunda mitad: portfolio-docs/v3/progreso-motor-1.md. */
import { crearMotor } from './motor.js';
import { crearSala, encuadrar, crearCamara, rectObra, zDeCapa } from './sala.js';
import { crearEnjambre } from './enjambre.js';
import { crearPost } from './post.js';
import { crearLente } from './lente.js';
import { crearFondo } from './fondo.js';

const html = document.documentElement;
const par = new URLSearchParams(location.search);
const lienzo = document.querySelector('canvas.mundo');
const heroe = document.querySelector('.heroe');
const BASE = new URL('../../assets/mundo/', import.meta.url);
const ACTOS = ['defino', 'diseno', 'verifico'];
const QUIETO = par.get('quieto') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;
const T_FIJO = par.has('t') && isFinite(+par.get('t')) ? +par.get('t') : null;
const ACTO_FIJO = ACTOS.includes(par.get('acto')) ? par.get('acto') : null;
const SEC = par.has('sec') && isFinite(+par.get('sec')) ? +par.get('sec') : null; // congela la secuencia de carga en ese segundo
const GANANCIA = 0.18;  // fracción del recorrido de puntero del plano (0,16 × 0,09 m). Entero, el teléfono (a 0,9 m) se corre ±420 px a 1920 y se sale del cuadro; con 0,18 son ±77 px
if (par.get('fondo') === '1') html.classList.add('solo-fondo');

let mundo = null, datos = null, formato = 'h', motor = null, sala = null, enjambre = null, fondoVivo = null, post = null;
let obras = [];                       // { id, el, o (mundo.json), z, r, x, y, w, h, oculta, verificada }
let anchoH = 1, altoH = 1, topeH = 0; // héroe: tamaño y posición en el documento (px CSS)
const cajaTexto = [0, 0, 0, 0];       // bloque de texto, en coordenadas locales del héroe
const cajaBaja = [0, 0, 0, 0];        // botones y sellos (pueden ser más anchos que el titular); en cero si no están
let escY = 0, escH = 1;               // escenario dentro del héroe: todo el héroe en horizontal; en vertical, la lámina 9:16 apoyada abajo
const encDom = {}, camQuieta = { Tx: 1, Ty: 1, tx: 0, ty: 0, tz: 0 };
let derTexto = 0;                     // borde derecho real del titular (su línea más larga), en coordenadas del héroe
let anchoMax = Infinity;              // ancho máximo de la lámina para que el portal no quede detrás del titular (formato h)
let altoNav = 0;
let fundidoH = 0.16;                  // fundido inferior del héroe con la página (fracción de su alto): nunca alcanza al texto
/* puntero en px CSS del lienzo, para la lente y para dirigir el enjambre */
const puntero = { x: -1e4, y: -1e4, fino: matchMedia('(pointer: fine)').matches, visto: false, dentro: false, sobreTexto: false, peso: 0, movido: -1e9 };
const aviso = (tipo, detalle) => lienzo.dispatchEvent(new CustomEvent(tipo, { detail: detalle }));

/* ================= Verbos del titular (funcionan con o sin motor) ================= */
let fijado = null, previa = null, tFijo = 0, tPrevia = 0;
let acto = null;        // acto en el que está la máquina
let eco = null;         // { tipo, fin } mientras dura un eco
const mostrado = () => (eco ? eco.tipo : acto) || ACTO_FIJO || fijado || previa || 'diseno';
const pedido = () => ACTO_FIJO || fijado || previa;

function marcarVerbos() {
  const m = mostrado();
  heroe.dataset.acto = m;
  for (const b of heroe.querySelectorAll('.acto')) {
    b.setAttribute('aria-pressed', String(fijado === b.dataset.acto));
    b.classList.toggle('activo', m === b.dataset.acto);
  }
}
function pedidoCambio() {
  if (motor && sala) { motor.despertar(); return; }
  /* sin motor: el héroe igual responde (data-acto lo usa el CSS del póster) */
  acto = pedido() || 'diseno';
  marcarVerbos();
}
function iniciarVerbos() {
  const verbo = (e) => e.target.closest?.('.acto');
  const entra = (b) => { clearTimeout(tPrevia); previa = b.dataset.acto; pedidoCambio(); };
  const sale = () => { clearTimeout(tPrevia); tPrevia = setTimeout(() => { previa = null; pedidoCambio(); }, 1200); };
  heroe.addEventListener('pointerover', (e) => { const b = verbo(e); if (b && e.pointerType === 'mouse') entra(b); });
  heroe.addEventListener('pointerout', (e) => { if (verbo(e) && e.pointerType === 'mouse') sale(); });
  heroe.addEventListener('focusin', (e) => { const b = verbo(e); if (b && b.matches(':focus-visible')) entra(b); });
  heroe.addEventListener('focusout', (e) => { if (verbo(e) && previa) sale(); });
  heroe.addEventListener('click', (e) => {
    const b = verbo(e);
    if (!b) return;
    clearTimeout(tFijo);
    if (fijado === b.dataset.acto) fijado = null;
    else { fijado = b.dataset.acto; tFijo = setTimeout(() => { fijado = null; pedidoCambio(); marcarVerbos(); }, 6000); }
    pedidoCambio(); marcarVerbos();
  });
  /* comun.js reescribe el titular al cambiar de idioma: los botones nuevos heredan el estado en el acto */
  const titulo = heroe.querySelector('.heroe__titulo');
  if (titulo && 'MutationObserver' in window) new MutationObserver(marcarVerbos).observe(titulo, { childList: true });
  marcarVerbos();
}

/* ================= Zonas activas ================= */
function medirHeroe() {
  anchoH = heroe.offsetWidth; altoH = heroe.offsetHeight;
  const rh = heroe.getBoundingClientRect(), rt = heroe.querySelector('.heroe__texto')?.getBoundingClientRect();
  topeH = rh.top + scrollY;
  if (rt) { cajaTexto[0] = rt.left - rh.left; cajaTexto[1] = rt.top - rh.top; cajaTexto[2] = rt.right - rh.left; cajaTexto[3] = rt.bottom - rh.top; }
  /* hasta dónde llega de verdad el texto: la extensión de sus líneas, no la columna entera */
  const rango = document.createRange();
  const der = (el) => { if (!el || !el.getClientRects().length) return -1e9; rango.selectNodeContents(el); return rango.getBoundingClientRect().right - rh.left; };
  derTexto = Math.max(0, der(heroe.querySelector('.heroe__titulo')), der(heroe.querySelector('.heroe__sub')), der(heroe.querySelector('.heroe__etiqueta')));
  const acc = heroe.querySelector('.heroe__acciones'), ra = acc?.getBoundingClientRect();
  cajaBaja.fill(0);
  if (ra && ra.height > 0 && rt) {
    cajaBaja[0] = cajaTexto[0]; cajaBaja[1] = ra.top - rh.top; cajaBaja[3] = cajaTexto[3];
    cajaBaja[2] = Math.min(cajaTexto[2], Math.max(der(acc), der(heroe.querySelector('.heroe__sellos'))) + 12);
  }
  altoNav = document.querySelector('.nav')?.offsetHeight || 0;
  /* el fundido de abajo empieza después del último renglón de texto (en tema claro funde a papel: debajo del texto no) */
  fundidoH = rt ? Math.min(0.16, Math.max(0.04, (altoH - cajaTexto[3] - 14) / altoH)) : 0.16;
  heroe.style.setProperty('--fundido-desde', (100 - fundidoH * 100).toFixed(1) + '%');
  medirEncuadre();
}
/* El portal no puede quedar detrás del titular (ni contraste ni lectura). En horizontal la lámina se achica lo
   justo (nunca más de 16 %) y se apoya a la derecha: el borde de la lámina es negro, así que a la izquierda queda
   más sala a oscuras. Se aparta del «cover» del plano (motor.md §3) sólo cuando hace falta. */
function medirEncuadre() {
  anchoMax = Infinity;
  heroe.style.removeProperty('--portal-x');   // en vertical manda el CSS
  if (formato !== 'h' || !datos || !derTexto) return;
  const v = datos.camara.vista, po = datos.portal, Tx = Math.tan((datos.camara.fovY * Math.PI) / 360) * datos.ancho / datos.alto;
  const xv = v[0] * po.pos[0] + v[4] * po.pos[1] + v[8] * po.pos[2] + v[12], d = -(v[2] * po.pos[0] + v[6] * po.pos[1] + v[10] * po.pos[2] + v[14]);
  const fx = (xv / (d * Tx) + 1) / 2, medio = (po.ancho || 0.24) / (d * Tx) / 4;   // centro y medio ancho del portal, en fracción de la lámina
  const cubre = datos.ancho * Math.max(anchoH / datos.ancho, altoH / datos.alto);
  anchoMax = Math.max(0.84 * cubre, (anchoH - derTexto - 0.022 * anchoH) / (1 - fx + medio));
  if (anchoMax >= cubre) anchoMax = Infinity;
  /* el portal dibujado en CSS (primer pintado) queda donde lo va a poner el motor */
  encuadrar(datos, 0, 0, anchoH, altoH, encDom, anchoMax);
  heroe.style.setProperty('--portal-x', ((encDom.x0 + fx * encDom.W) / anchoH * 100).toFixed(2) + '%');
}
function medirEscenario() {
  if (formato === 'v' && datos) { escH = Math.min(altoH, anchoH * datos.alto / datos.ancho); escY = altoH - escH; } else { escY = 0; escH = altoH; }
}
function elegirFormato() { return anchoH / altoH < 0.8 && mundo.v ? 'v' : 'h'; }

function iniciarZonas() {
  obras = datos.obras.map((o) => ({
    id: o.id, o, el: heroe.querySelector('.obra--' + o.id), z: zDeCapa(datos, o.capa),
    r: new Float32Array(4), x: -1e9, y: -1e9, w: -1e9, h: -1e9, oculta: false, verificada: false,
  })).filter((z) => z.el);
  Object.assign(camQuieta, crearCamara(datos));
  for (const z of obras) {
    if (z.el.dataset.listo) continue;
    z.el.dataset.listo = '1';
    const entra = () => { apuntada = z.id; aviso('mundo:obra', z.id); motor?.despertar(); };
    const sale = () => { if (apuntada === z.id) { apuntada = null; aviso('mundo:obra', null); motor?.despertar(); } };
    z.el.addEventListener('pointerenter', entra); z.el.addEventListener('pointerleave', sale);
    z.el.addEventListener('focus', entra); z.el.addEventListener('blur', sale);
  }
  heroe.querySelector('.heroe__obras')?.classList.add('ubicadas');
  html.classList.add('mundo-zonas');
}
/* Ubica cada .obra sobre el rectángulo `pantalla` de su producto (coordenadas locales del héroe). */
function ubicarZonas(cam) {
  medirEscenario();
  encuadrar(datos, 0, escY, anchoH, escH, encDom, anchoMax);
  for (const z of obras) {
    const r = rectObra(encDom, cam, z.o.pantalla, z.z, z.r);
    const oculta = z.z - cam.tz < 0.3 || r[0] > anchoH || r[1] > altoH || r[0] + r[2] < 0 || r[1] + r[3] < 0;
    if (oculta !== z.oculta) { z.oculta = oculta; z.el.classList.toggle('obra--fuera', oculta); }
    if (oculta) continue;
    if (Math.abs(r[0] - z.x) > 0.5 || Math.abs(r[1] - z.y) > 0.5) { z.x = r[0]; z.y = r[1]; z.el.style.transform = `translate3d(${r[0].toFixed(1)}px,${r[1].toFixed(1)}px,0)`; }
    if (Math.abs(r[2] - z.w) > 0.5 || Math.abs(r[3] - z.h) > 0.5) { z.w = r[2]; z.h = r[3]; z.el.style.width = r[2].toFixed(1) + 'px'; z.el.style.height = r[3].toFixed(1) + 'px'; }
  }
}
function verificar(z, si) {
  if (z.verificada === si) return;
  z.verificada = si; z.el.classList.toggle('verificada', si);
  if (si) aviso('mundo:verificada', z.id);
}
let apuntada = null;

/* ================= Respaldo: póster ================= */
function respaldo(nombre, motivo) {
  if (nombre) { lienzo.dataset.estado = nombre; console.info('mundo:', nombre, '— ' + motivo); }
  html.classList.remove('mundo-vivo');
  const fondo = heroe.querySelector('.heroe__fondo');
  if (fondo && !fondo.querySelector('.heroe__poster')) {
    const img = new Image();
    img.className = 'heroe__poster'; img.alt = ''; img.decoding = 'async';
    if (formato !== 'v') { const a = datos?.ancla || [0.64, 0.5]; img.style.objectPosition = `${a[0] * 100}% ${a[1] * 100}%`; }
    else if (datos) img.style.aspectRatio = datos.ancho + ' / ' + datos.alto;
    img.addEventListener('load', () => { img.classList.add('visto'); html.classList.add('mundo-poster'); });
    img.src = new URL(`poster-${formato}.webp`, BASE).href;
    fondo.appendChild(img);
  }
  if (!datos) return;
  const ubicar = () => {
    medirHeroe(); ubicarZonas(camQuieta);
    const img = fondo?.querySelector('.heroe__poster');
    if (img && formato !== 'v') { // el póster con el mismo encuadre que la lámina (las zonas caen sobre sus pantallas)
      const e = encDom, st = img.style;
      st.inset = 'auto'; st.left = e.x0.toFixed(1) + 'px'; st.top = e.y0.toFixed(1) + 'px'; st.width = e.W.toFixed(1) + 'px'; st.height = e.H.toFixed(1) + 'px';
      st.objectFit = 'fill';
      st.maskImage = st.webkitMaskImage = e.x0 > 1 ? 'linear-gradient(90deg, transparent, #000 5%)' : '';
    }
  };
  ubicar();
  addEventListener('resize', ubicar);
  for (const z of obras) verificar(z, true);
  acto = pedido() || 'diseno';
  marcarVerbos();
}

/* ================= Máquina de actos ================= */
const CLAVES = ['L', 'fL', 'fM', 'V', 'sombra', 'vs', 'tzE'];
const val = { L: 0, fL: -0.3, fM: -0.4, V: 0, sombra: 1, vs: 0, tzE: 0 };
const tw = CLAVES.map(() => ({ a: 0, b: 0, t0: 0, d: 1, vivo: false, suave: false }));
let reloj = 0, sec = null, barriendo = false, finBarrido = 0, proxEco = 12, zsFijo = 0;

/* cubic-bezier(0.16, 1, 0.3, 1): la curva única del sitio */
function curva(x) {
  let t = x;
  for (let i = 0; i < 5; i++) {
    const u = 1 - t;
    const bx = 3 * u * u * t * 0.16 + 3 * u * t * t * 0.3 + t * t * t - x;
    const dx = 3 * u * u * 0.16 + 6 * u * t * 0.14 + 3 * t * t * 0.7;
    t = Math.min(1, Math.max(0, t - bx / Math.max(dx, 1e-4)));
  }
  const u = 1 - t;
  return 3 * u * u * t + 3 * u * t * t + t * t * t;
}
function animar(k, hasta, dur, retraso = 0, suave = false) {
  const w = tw[CLAVES.indexOf(k)];
  w.a = val[k]; w.b = hasta; w.t0 = reloj + retraso; w.d = dur; w.vivo = true; w.suave = suave;
}
function poner(k, v) { tw[CLAVES.indexOf(k)].vivo = false; val[k] = v; }
function avanzar() {
  for (let i = 0; i < CLAVES.length; i++) {
    const w = tw[i];
    if (!w.vivo) continue;
    const x = (reloj - w.t0) / w.d;
    if (x <= 0) continue;
    if (x >= 1) { val[CLAVES[i]] = w.b; w.vivo = false; continue; }
    val[CLAVES[i]] = w.a + (w.b - w.a) * (w.suave ? x * x * (3 - 2 * x) : curva(x));
  }
}
function barrer(dur) {
  for (const z of obras) verificar(z, false);
  animar('V', 1, 0.25); poner('vs', 0); animar('vs', 1, dur, 0.1, true);
  barriendo = true;
}
function irA(a) {
  if (a === acto) return;
  const de = acto;
  acto = a;
  if (a === 'defino') {
    animar('L', 1, 0.4); poner('fL', 1.3); animar('fL', -0.3, 1.2, 0, true);
    animar('fM', 1.35, 0.9, 0, true); animar('V', 0, 0.3); animar('sombra', 1, 0.3);
  } else if (a === 'diseno') {
    const lento = de === 'defino';
    animar('fM', -0.4, lento ? 1.5 : 0.5, 0, true);
    animar('L', 0, 0.5, lento ? 1.2 : 0); animar('V', 0, 0.6); animar('sombra', 1, 0.4);
  } else {
    animar('fM', -0.4, 0.5, 0, true); animar('L', 0, 0.4); animar('sombra', 1, 0.3);
    barrer(1.7);
  }
  marcarVerbos(); aviso('mundo:acto', a);
}
/* Deja un acto puesto sin transición (capturas con ?t=, movimiento reducido, sesión ya vista). */
function pose(a) {
  acto = a; eco = null; sec = null; barriendo = false;
  for (const w of tw) w.vivo = false;
  val.L = a === 'defino' ? 1 : 0; val.fL = -0.3; val.fM = a === 'defino' ? 1.35 : -0.4;
  val.V = a === 'verifico' ? 1 : 0; val.sombra = 1; val.vs = 1; val.tzE = 0;
  zsFijo = a === 'verifico' && obras.length ? obras[0].o.distancia + 0.02 : 0;
  for (const z of obras) verificar(z, a === 'diseno' || (a === 'verifico' && z.o.distancia <= zsFijo));
  marcarVerbos(); aviso('mundo:acto', a);
}
function terminarEco() {
  if (!eco) return;
  eco = null;
  animar('L', acto === 'defino' ? 1 : 0, 0.7); animar('sombra', 1, 0.8);
  if (acto !== 'verifico') animar('V', 0, 0.5);
  proxEco = reloj + 9 + 11 * Math.random();
  marcarVerbos();
}
function actuar(dt) {
  reloj += dt;
  const pide = pedido();
  /* secuencia de carga: defino → (cuando llegan los colores) diseño → verifico → reposo */
  if (sec && pide) sec = null;
  if (sec) {
    const e = reloj - sec.t0;
    if (sec.fase === 1 && sala.listoColor && e >= 1.25) { irA('diseno'); sec.fase = 2; sec.t0 = reloj; }
    else if (sec.fase === 2 && e >= 1.6) { irA('verifico'); sec.fase = 3; sec.t0 = reloj; }
    else if (sec.fase === 3 && e >= 1.55) { irA('diseno'); sec = null; proxEco = reloj + 9 + 11 * Math.random(); try { sessionStorage.setItem('mundo-visto', '1'); } catch {} }
  } else if (!zsFijo) {
    const objetivo = pide || 'diseno';
    if (pide && eco) terminarEco();
    if (objetivo !== acto && (pide || sala.listoColor)) irA(objetivo);
    if (acto === 'verifico' && pide && !barriendo && reloj - finBarrido > 1.6) barrer(1.7);
    /* ecos de los otros dos actos, sin período */
    if (!pide && acto === 'diseno' && !eco && reloj >= proxEco && sala.aLaVista()) {
      eco = { tipo: Math.random() < 0.5 ? 'defino' : 'verifico', fin: reloj + 1.9 };
      if (eco.tipo === 'defino') { animar('sombra', 0.4, 0.45); poner('fL', 1.3); animar('fL', -0.3, 1.0, 0, true); animar('L', 0.85, 0.3); }
      else barrer(1.5);
      marcarVerbos(); aviso('mundo:eco', eco.tipo);
    }
    if (eco && reloj >= eco.fin) terminarEco();
  }
  avanzar();
  const p = sala.p;
  p.L = val.L; p.fL = val.fL; p.fM = val.fM; p.V = val.V; p.sombra = val.sombra;
  p.filo = tw[2].vivo ? 1 : Math.max(0, p.filo - dt * 4);
  p.zs = zsFijo || 0.35 * Math.pow((sala.zs[0] + 1) / 0.35, val.vs);
  if (barriendo) {
    for (const z of obras) if (p.zs >= z.o.distancia) verificar(z, true);
    if (!tw[5].vivo) { barriendo = false; finBarrido = reloj; }
  }
}

/* ================= Cámara viva ================= */
const sx = { x: 0, v: 0 }, sy = { x: 0, v: 0 }, sq = { x: 0, v: 0 };
let punteroX = 0, punteroY = 0, avance = 0;
function resorte(s, objetivo, w, dt) { // críticamente amortiguado, exacto
  const d = s.x - objetivo, e = Math.exp(-w * dt), b = (s.v + w * d) * dt;
  s.x = objetivo + (d + b) * e; s.v = (s.v - w * b) * e;
}
function azar1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function ruido1(x) { // ruido de una dimensión, suave, en −1..1
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f), a = azar1(i);
  return (a + (azar1(i + 1) - a) * u) * 2 - 1;
}
function camara(m) {
  const cam = sala.cam, dt = m.dtReal, t = m.t;
  const tope = topeH - scrollY;
  medirEscenario();
  sala.encuadrar(0, tope + escY, anchoH, escH, anchoMax);
  sala.heroeY = tope;
  sala.p.fundidoArriba = escY > 0 ? 0.14 : 0;
  sala.p.fundido = escY > 0 ? 0.08 : fundidoH;   // en vertical el teléfono llega al borde de abajo: el fundido con la página es más corto
  /* bloque de texto para el motor: hasta donde llega de verdad el titular (no la columna entera) */
  const baja = cajaBaja[3] > cajaBaja[1];
  sala.texto[0] = cajaTexto[0]; sala.texto[1] = cajaTexto[1] + tope; sala.texto[3] = (baja ? cajaBaja[1] : cajaTexto[3]) + tope;
  sala.texto[2] = derTexto > cajaTexto[0] ? Math.min(cajaTexto[2], derTexto + 0.012 * anchoH) : cajaTexto[2];
  sala.texto2[0] = cajaBaja[0]; sala.texto2[1] = cajaBaja[1] + tope; sala.texto2[2] = cajaBaja[2]; sala.texto2[3] = baja ? cajaBaja[3] + tope : cajaBaja[1] + tope;
  if (QUIETO) { cam.tx = cam.ty = cam.tz = 0; sala.p.q = 1 / datos.foco.distancia; return; }
  resorte(sx, punteroX, 13, dt); resorte(sy, punteroY, 13, dt);
  const obj = Math.min(1, Math.max(0, -tope / altoH));
  avance += (obj - avance) * (1 - Math.exp(-dt / 0.4));
  cam.tx = -sx.x * 0.16 * GANANCIA + 0.02 * (0.7 * ruido1(t * 0.13) + 0.3 * ruido1(t * 0.31 + 5.2));
  cam.ty = sy.x * 0.09 * GANANCIA + 0.012 * (0.7 * ruido1(t * 0.11 + 31.7) + 0.3 * ruido1(t * 0.27 + 9.1)) - 0.25 * avance;
  cam.tz = 0.02 * ruido1(t * 0.07 + 77.3) + 1.4 * avance + val.tzE;
  /* foco en dioptrías: reposo, producto apuntado (resorte que «caza»), infinito al deslizar */
  let df = datos.foco.distancia;
  if (apuntada) for (const z of obras) if (z.id === apuntada) df = z.z;
  const qObj = (1 / df) * (1 - avance);
  if (!sq.x) sq.x = qObj;
  const pasos = Math.max(1, Math.ceil(dt / 0.012)), h = dt / pasos, w = 8.2;
  for (let i = 0; i < pasos; i++) { sq.v += (w * w * (qObj - sq.x) - 2 * 0.6 * w * sq.v) * h; sq.x += sq.v * h; }
  sala.p.q = Math.max(0, sq.x);
}
/* Puntero: dónde está respecto del escenario y del texto (la lente no aparece sobre el texto ni sobre la navegación)
   y cuánto dirige al enjambre (entero mientras se mueve, a media fuerza si queda quieto encima). */
function apuntarTodo(m) {
  const p = puntero, tope = topeH - scrollY;
  p.dentro = p.visto && p.x >= 0 && p.x <= anchoH && p.y >= Math.max(tope + escY, altoNav) && p.y <= tope + altoH * (1 - 0.7 * sala.p.fundido);
  const t1 = sala.texto, t2 = sala.texto2;
  p.sobreTexto = (p.x > t1[0] - 26 && p.x < t1[2] + 26 && p.y > t1[1] - 26 && p.y < t1[3] + 26)
              || (t2[3] > t2[1] && p.x > t2[0] - 26 && p.x < t2[2] + 26 && p.y > t2[1] - 26 && p.y < t2[3] + 26);
  const quiere = p.dentro && p.fino && !QUIETO ? (performance.now() - p.movido < 3500 ? 1 : 0.4) : 0;
  p.peso += (quiere - p.peso) * (1 - Math.exp(-m.dtReal * 4));
  if (p.peso < 0.002 && !quiere) p.peso = 0;
}

/* ================= Cuadro ================= */
function cuadro(m) {
  actuar(m.dtActos);
  camara(m);
  apuntarTodo(m);
  ubicarZonas(sala.cam);
  const hay = sala.aLaVista() && sala.dibujar();   // con el héroe fuera de vista sólo queda el fondo vivo
  const g = m.ganchos;
  /* GANCHO enjambre: se dibuja sumando sobre sala.fbColor y lee sala.texInfo */
  if (hay) for (let i = 0; i < g.sobreSala.length; i++) g.sobreSala[i](m, sala);
  /* GANCHO post: recibe el color lineal y devuelve la textura a mostrar */
  sala.salida(hay && g.post ? g.post(m, sala) : sala.texColor);
  /* GANCHO lente y fondo vivo: dibujan directo en el lienzo, después de la salida */
  for (let i = 0; i < g.sobreSalida.length; i++) g.sobreSalida[i](m, sala);
  for (let i = 0; i < g.fondo.length; i++) g.fondo[i](m, sala);
  return hay || g.fondo.length > 0; // la sala fuera de vista y sin fondo vivo: el bucle duerme
}

/* ================= Arranque ================= */
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));
/* La placa termina de preparar cada programa recién la primera vez que dibuja con él (más de un segundo en total):
   si eso pasa con la secuencia andando, se ve un tirón. Entonces se dibujan cuadros invisibles con todo lo que
   se va a usar y se espera a que la placa termine, sin trabar la página; recién después arranca la secuencia. */
async function calentar(esta) {
  if (QUIETO || T_FIJO != null) return;
  const gl = motor.gl, t0 = performance.now(), p = esta.p;
  p.entrada = 0;
  medirHeroe();
  motor.ajustar();   // tras recuperar el contexto el lienzo vuelve sin medida: se dibuja fuera del bucle, así que se ajusta acá
  while (esta.vivo && !motor.perdido) {
    cuadro(motor);
    if ((enjambre.dibujo && post.dibujo && fondoVivo.dibujo) || performance.now() - t0 > 3000) break;
    await espera(40);
  }
  const s = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  while (s && !motor.perdido && gl.clientWaitSync(s, 0, 0) === gl.TIMEOUT_EXPIRED && performance.now() - t0 < 6000) await espera(30);
  if (s) gl.deleteSync(s);
  p.entrada = 1;
}

async function armar() {
  motor.estado('cargando', `formato ${formato}, nivel ${motor.nivel}`);
  let visto = false;
  try { visto = sessionStorage.getItem('mundo-visto') === '1'; } catch {}
  const directo = QUIETO || T_FIJO != null || ACTO_FIJO || visto || SEC != null;
  try {
    sala = crearSala(motor, datos, formato, BASE);
  } catch (e) { motor.estado('error-shader', e.message); sala = null; return respaldo(); }
  const esta = sala;
  lienzo.mundo = { // para pruebas
    motor, sala: esta, val, obras, puntero, enjambre, fondo: fondoVivo, get acto() { return acto; }, get reloj() { return reloj; }, get apuntada() { return apuntada; },
    apuntar(x, y) { punteroX = sx.x = x; punteroY = sy.x = y; sx.v = sy.v = 0; }, // pone el puntero (−1..1) sin esperar al resorte
  };
  try {
    const pedidos = esta.pedirColor();
    for (const p of pedidos) p.catch(() => {});
    await Promise.all([esta.cargarDatos(), esta.programaListo()]);
    if (!esta.vivo || motor.perdido) return;
    await calentar(esta);
    if (!esta.vivo || motor.perdido) return;
    medirHeroe();
    reloj = 0; eco = null; acto = null; apuntada = null;
    if (!directo) {
      /* la carga es la secuencia: con los datos ya corre «defino» */
      poner('fM', 1.35); poner('L', 0); poner('V', 0); poner('tzE', -0.22); animar('tzE', 0, 4.2);
      sec = { fase: 1, t0: 0 };
      irA('defino');
      motor.estado('lineas', 'datos listos: corre el acto «defino» mientras bajan los colores');
      html.classList.add('mundo-vivo');
      motor.alCuadro = cuadro; motor.despertar();
    }
    await esta.cargarColor(pedidos);
    if (!esta.vivo || motor.perdido) return;
    if (directo) {
      if (SEC != null) {
        /* captura de la secuencia: se simula hasta el segundo pedido y se congela */
        poner('fM', 1.35); poner('L', 0); poner('tzE', -0.22); animar('tzE', 0, 4.2);
        sec = { fase: 1, t0: 0 }; irA('defino');
        for (let s = 0; s < SEC; s += 1 / 60) actuar(1 / 60);
        motor.tiempoFijo = SEC;
      } else pose(T_FIJO != null || QUIETO ? ACTO_FIJO || 'diseno' : 'diseno'); // con ?acto= y sin ?t=, la máquina va sola al acto pedido
      html.classList.add('mundo-vivo');
      motor.alCuadro = cuadro; motor.despertar();
    }
    motor.estado('listo', `láminas ${formato} en memoria, nivel ${motor.nivel}`);
  } catch (e) {
    if (motor.perdido) return;
    motor.estado(/^(shader|programa) /.test(e.message) ? 'error-shader' : 'error-carga', e.message);
    motor.alCuadro = null; esta.liberar(); sala = null;
    respaldo();
  }
}

async function arrancar() {
  if (!lienzo || !heroe) return;
  iniciarVerbos();
  medirHeroe();
  try {
    const r = await fetch(new URL('mundo.json', BASE));
    if (!r.ok) throw new Error(r.status + ' en mundo.json');
    mundo = await r.json();
  } catch (e) { lienzo.dataset.estado = 'error-carga'; console.warn('mundo: error-carga —', e.message); return respaldo(); }
  formato = elegirFormato(); datos = mundo[formato];
  medirEncuadre();
  iniciarZonas();
  ubicarZonas(camQuieta);
  if (par.get('mundo') === '0') return respaldo('respaldo', 'pedido con ?mundo=0');
  if (navigator.connection?.saveData) return respaldo('ahorro-de-datos', 'el navegador pide ahorrar datos: queda el póster');
  motor = crearMotor(lienzo, { nivel: par.get('nivel'), tiempoFijo: T_FIJO, quieto: QUIETO, sinTope: par.get('tope') === '0' });
  if (!motor) return respaldo();
  /* segunda mitad: enjambre y guías, resplandor, lente y fondo vivo (se enganchan solos en motor.ganchos) */
  const ctx = { val, puntero, heroe, topeHeroe: () => topeH - scrollY };
  enjambre = crearEnjambre(motor, ctx);
  post = crearPost(motor);
  crearLente(motor, ctx);
  fondoVivo = crearFondo(motor);

  /* el DOM manda: tamaño del héroe, scroll y puntero */
  const alMedir = () => { medirHeroe(); if (mundo.v && elegirFormato() !== formato) rearmar(); motor.despertar(); };
  if ('ResizeObserver' in window) new ResizeObserver(alMedir).observe(heroe);
  addEventListener('resize', alMedir);
  addEventListener('load', alMedir);
  document.fonts?.ready.then(alMedir);
  addEventListener('scroll', () => motor.despertar(), { passive: true });
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') { punteroX = (e.clientX / innerWidth * 2 - 1) * 0.35; punteroY = 0; } // arrastre leve
    else {
      punteroX = e.clientX / innerWidth * 2 - 1; punteroY = e.clientY / innerHeight * 2 - 1;
      puntero.x = e.clientX; puntero.y = e.clientY; puntero.visto = true; puntero.movido = performance.now();
      if (!puntero.fino && e.pointerType === 'mouse') puntero.fino = true;
    }
  }, { passive: true });
  addEventListener('pointerup', (e) => { if (e.pointerType === 'touch') punteroX = 0; }, { passive: true });
  document.addEventListener('pointerleave', () => { punteroX = 0; punteroY = 0; puntero.visto = false; });

  let tRearme = 0;
  function rearmar() {
    clearTimeout(tRearme);
    tRearme = setTimeout(() => {
      if (elegirFormato() === formato) return;
      motor.alCuadro = null; sala?.liberar(); sala = null;
      formato = elegirFormato(); datos = mundo[formato];
      medirEncuadre();
      for (const z of obras) { z.el.classList.remove('verificada'); }
      iniciarZonas(); armar();
    }, 250);
  }
  motor.ganchos.alPerder.push(() => { if (sala) sala.vivo = false; sala = null; motor.alCuadro = null; html.classList.remove('mundo-vivo'); });
  motor.ganchos.alRestaurar.push(() => { armar(); });

  await armar();
}

arrancar();
