/* index.js — arranque de «la sala negra»: la carga como primer acto, sincronía con el DOM,
   máquina de actos, verbos del titular, zonas activas de cada producto y respaldos.
   El texto y los botones del héroe ya se ven y funcionan antes de que esto corra (y sin esto).
   Plano: portfolio-docs/v3/motor.md. Interfaz para la segunda mitad: portfolio-docs/v3/progreso-motor-1.md. */
import { crearMotor, LOCAL } from './motor.js';
import { crearSala, encuadrar, crearCamara, rectObra, zDeCapa, CAJAS } from './sala.js';
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
/* ganchos de captura y medición (?t=, ?sec=, ?fondo=, ?nivel=, ?tope=): sólo en el servidor local o con ?captura=1.
   Publicados, un enlace con esos parámetros no puede dejar el sitio vacío ni fijar la calidad máxima en un teléfono */
const CAPTURA = LOCAL || par.get('captura') === '1';
const T_FIJO = CAPTURA && par.has('t') && isFinite(+par.get('t')) ? +par.get('t') : null;
const ACTO_FIJO = ACTOS.includes(par.get('acto')) ? par.get('acto') : null;
const SEC = CAPTURA && par.has('sec') && isFinite(+par.get('sec')) ? +par.get('sec') : null; // congela la secuencia de carga en ese segundo
const GANANCIA = 0.18;  // fracción del recorrido de puntero del plano (0,16 × 0,09 m). Entero, el teléfono (a 0,9 m) se corre ±420 px a 1920 y se sale del cuadro; con 0,18 son ±77 px
if (CAPTURA && par.get('fondo') === '1') html.classList.add('solo-fondo');
/* Composición por espacio disponible (las mismas consultas que el bloque «Héroe» de componentes.css):
   al lado (≥ 1024 px y más ancho que 4:3, o 940–1023 px y más ancho que 1,45), apilada (texto arriba, lámina horizontal
   abajo) o vertical (lámina 9:16). */
const MQ_APILADA = matchMedia('(max-width: 939px), (max-width: 1023px) and (max-aspect-ratio: 1449/1000), (max-aspect-ratio: 1333/1000)');
const MQ_VERTICAL = matchMedia('(max-aspect-ratio: 4/5)');
const MQ_CLARO = matchMedia('(prefers-color-scheme: light)');
let apilada = false;
let visto0 = false;
try { visto0 = sessionStorage.getItem('mundo-visto') === '1'; } catch {}
/* con qué acto arranca el titular: si va a correr la secuencia, «defino» (el póster a oscuras la acompaña) */
const INICIAL = QUIETO || T_FIJO != null || ACTO_FIJO || visto0 || SEC != null ? ACTO_FIJO || 'diseno' : 'defino';

let mundo = null, datos = null, formato = 'h', motor = null, sala = null, enjambre = null, fondoVivo = null, post = null;
let obras = [];                       // { id, el, o (mundo.json), z, r, x, y, w, h, oculta, verificada }
let anchoH = 1, altoH = 1, topeH = 0; // héroe: tamaño y posición en el documento (px CSS)
const cajaTexto = [0, 0, 0, 0];       // bloque de texto, en coordenadas locales del héroe
const cajaBaja = [0, 0, 0, 0];        // botones y sellos (pueden ser más anchos que el titular); en cero si no están
let escY = 0, escH = 1;               // escenario dentro del héroe: todo el héroe en horizontal; en vertical, la lámina 9:16 apoyada abajo
const encDom = {}, camQuieta = { Tx: 1, Ty: 1, tx: 0, ty: 0, tz: 0 };
let derTexto = 0;                     // borde derecho real del titular (su línea más larga), en coordenadas del héroe
/* renglones de texto del héroe (coordenadas del héroe) y el tope de luz bajo cada uno (log2, lineal): la garantía de
   contraste de la salida (sala.js) se arma renglón por renglón y cae suave afuera, nunca como un rectángulo */
const renglones = new Float32Array(CAJAS * 4), nivelRenglon = new Float32Array(CAJAS);
let nRenglones = 0;
const TOPE_TEXTO = Math.log2(0.019), TOPE_VERBO = Math.log2(0.011);
let anchoMax = Infinity;              // ancho máximo de la lámina para que el portal no quede detrás del titular (formato h)
let altoNav = 0;
let finPantallas = 0;                 // borde de abajo de la pantalla más baja (px del héroe): el fundido inferior empieza después
let sY = 0;                           // scrollY, leído una sola vez al principio de cada cuadro
/* puntero en px CSS del lienzo, para la lente y para dirigir el enjambre */
const puntero = { x: -1e4, y: -1e4, fino: matchMedia('(pointer: fine)').matches, visto: false, dentro: false, sobreTexto: false, peso: 0, movido: -1e9 };
const aviso = (tipo, detalle) => lienzo.dispatchEvent(new CustomEvent(tipo, { detail: detalle }));

/* ================= Verbos del titular (funcionan con o sin motor) ================= */
let fijado = null, previa = null, tPrevia = 0;
let acto = null;        // acto en el que está la máquina
let eco = null;         // { tipo, fin } mientras dura un eco
let actoVisto = null;   // el acto que se VE (sale de la interpolación de la sala): el verbo se enciende con él
const mostrado = () => (motor && sala && actoVisto) || (eco ? eco.tipo : acto) || ACTO_FIJO || fijado || previa || INICIAL;
const pedido = () => ACTO_FIJO || fijado || previa;

/* aria-pressed = el verbo fijado con un clic (queda hasta que se elige otro o se vuelve a pulsar); la clase «activo»
   (cereza) = el acto que se está viendo. Cada verbo dice qué hace (aria-describedby, texto traducido oculto). */
function marcarVerbos() {
  const m = mostrado();
  heroe.dataset.acto = m;
  for (const b of heroe.querySelectorAll('.acto')) {
    b.setAttribute('aria-pressed', String(fijado === b.dataset.acto));
    if (b.getAttribute('aria-describedby') !== 'actos-ayuda') b.setAttribute('aria-describedby', 'actos-ayuda');
    b.classList.toggle('activo', m === b.dataset.acto);
  }
}
function pedidoCambio() {
  if (motor && sala) {
    /* movimiento reducido: el reloj de los actos no avanza, así que el acto se pone sin transición */
    if (motor.quieto && sala.listoColor) pose(pedido() || 'diseno');
    motor.despertar(); return;
  }
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
    fijado = fijado === b.dataset.acto ? null : b.dataset.acto;   // sin temporizador: el estado anunciado es el real
    pedidoCambio(); marcarVerbos();
  });
  /* comun.js reescribe el titular al cambiar de idioma: los botones nuevos heredan el estado en el acto */
  const titulo = heroe.querySelector('.heroe__titulo');
  if (titulo && 'MutationObserver' in window) new MutationObserver(marcarVerbos).observe(titulo, { childList: true });
  marcarVerbos();
}

/* ================= Zonas activas ================= */
const conSuperficie = () => innerWidth >= 2 && innerHeight >= 2 && heroe.offsetWidth >= 2 && heroe.offsetHeight >= 2;
function medirHeroe() {
  /* sin superficie (panel oculto, ventana minimizada) las medidas llegan en cero: se conservan las anteriores */
  if (!conSuperficie()) return;
  apilada = MQ_APILADA.matches;
  heroe.dataset.comp = formato === 'v' && mundo?.v ? 'vertical' : apilada ? 'apilada' : 'lado';
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
  medirRenglones(rh, rango);
  altoNav = document.querySelector('.nav')?.offsetHeight || 0;
  medirEncuadre();
}
/* Renglones: la extensión real de cada línea de texto (las cajas de línea del navegador, unidas por renglón), más un
   margen para el suavizado y el vuelo de la itálica. Los verbos van aparte, con un tope más bajo (son cereza). */
function medirRenglones(rh, rango) {
  nRenglones = 0;
  const sumar = (el, nivel, mx, my, entero, conRango) => {
    if (!el || !el.getClientRects().length) return;
    let rs;
    if (entero === true && conRango) { rango.selectNodeContents(el); rs = [rango.getBoundingClientRect()]; }
    else if (entero) rs = [el.getBoundingClientRect()];
    else { rango.selectNodeContents(el); rs = rango.getClientRects(); }
    const propios = [];
    for (const r of rs) {
      if (r.width < 1 || r.height < 1) continue;
      const c = (r.top + r.bottom) / 2;
      const ya = propios.find((p) => c > p[1] && c < p[3]);
      if (ya) { ya[0] = Math.min(ya[0], r.left); ya[2] = Math.max(ya[2], r.right); ya[1] = Math.min(ya[1], r.top); ya[3] = Math.max(ya[3], r.bottom); }
      else propios.push([r.left, r.top, r.right, r.bottom]);
    }
    for (const p of propios) {
      if (nRenglones >= CAJAS) return;
      const o = nRenglones * 4;
      renglones[o] = p[0] - rh.left - mx; renglones[o + 1] = p[1] - rh.top - my; renglones[o + 2] = p[2] - rh.left + mx; renglones[o + 3] = p[3] - rh.top + my;
      nivelRenglon[nRenglones++] = nivel;
    }
  };
  const q = (s) => heroe.querySelector(s);
  sumar(q('.heroe__acento'), TOPE_VERBO, 10, 4);
  sumar(q('.heroe__etiqueta'), TOPE_TEXTO, 6, 2);
  /* el titular y la bajada, como bloque (la extensión de sus líneas): el hueco a la derecha de un renglón corto también
     queda oscuro, así ninguna mota ni reflejo se lee «dentro» del párrafo */
  sumar(q('.heroe__titulo'), TOPE_TEXTO, 8, 2, true, rango);
  sumar(q('.heroe__sub'), TOPE_TEXTO, 8, 2, true, rango);
  sumar(q('.heroe__acciones'), TOPE_TEXTO, 8, 4, true);
  sumar(q('.heroe__sellos'), TOPE_TEXTO, 8, 4, true);
}
/* El portal no puede quedar detrás del titular (ni contraste ni lectura). En horizontal la lámina se achica lo
   justo (nunca más de 20 %) y se apoya a la derecha: el borde de la lámina es negro, así que a la izquierda queda
   más sala a oscuras. Se aparta del «cover» del plano (motor.md §3) sólo cuando hace falta. */
function medirEncuadre() {
  anchoMax = Infinity;
  heroe.style.removeProperty('--portal-x');   // en vertical manda el CSS
  if (formato !== 'h' || apilada || !datos || !derTexto) return;
  const v = datos.camara.vista, po = datos.portal, Tx = Math.tan((datos.camara.fovY * Math.PI) / 360) * datos.ancho / datos.alto;
  const xv = v[0] * po.pos[0] + v[4] * po.pos[1] + v[8] * po.pos[2] + v[12], d = -(v[2] * po.pos[0] + v[6] * po.pos[1] + v[10] * po.pos[2] + v[14]);
  const fx = (xv / (d * Tx) + 1) / 2, medio = (po.ancho || 0.24) / (d * Tx) / 4;   // centro y medio ancho del portal, en fracción de la lámina
  const cubre = datos.ancho * Math.max(anchoH / datos.ancho, altoH / datos.alto);
  /* margen entre el titular y el portal: la garantía de contraste cae suave (≈ 150 px) y el portal tiene que quedar fuera de esa caída */
  anchoMax = Math.max(0.8 * cubre, (anchoH - derTexto - 0.075 * anchoH) / (1 - fx + medio));
  if (anchoMax >= cubre) anchoMax = Infinity;
  /* el portal dibujado en CSS (primer pintado) queda donde lo va a poner el motor */
  encuadrar(datos, 0, 0, anchoH, altoH, encDom, anchoMax);
  heroe.style.setProperty('--portal-x', ((encDom.x0 + fx * encDom.W) / anchoH * 100).toFixed(2) + '%');
}
function medirEscenario() {
  if (formato === 'v' && datos) { escH = Math.min(altoH, anchoH * datos.alto / datos.ancho); escY = altoH - escH; }
  else if (apilada && datos) {
    /* apilada: la lámina horizontal a todo el ancho, apoyada abajo, siempre debajo del último renglón */
    escH = Math.max(1, Math.min(anchoH * datos.alto / datos.ancho, altoH - cajaTexto[3] - 4)); escY = altoH - escH;
  } else { escY = 0; escH = altoH; }
}
function elegirFormato() { return MQ_VERTICAL.matches && mundo.v ? 'v' : 'h'; }
/* Fundido inferior (fracciones del escenario): llega a cero donde termina la lámina (`fin`) y es largo (hasta 30 %
   del escenario), pero nunca empieza antes del pie de la pantalla más baja, ni en tema claro debajo del texto (ahí
   la página es papel). Lo usan la salida de sala.js, el fondo vivo (misma curva) y la máscara del póster. */
const fundido = { fin: 1, largo: 0.16 };
function medirFundido(e) {
  if (formato === 'v') { fundido.fin = 1; fundido.largo = 0.08; return fundido; }   // vertical: el teléfono llega al borde de abajo
  const fin = Math.min(1, (e.y0 + e.H - e.Sy) / e.Sh);
  let desde = Math.max(fin - 0.3, (finPantallas - escY) / escH + 0.035);
  const claro = (html.dataset.theme || (MQ_CLARO.matches ? 'light' : 'dark')) === 'light';
  if (claro && !apilada) desde = Math.max(desde, (cajaTexto[3] + 14 - escY) / escH);
  fundido.fin = fin; fundido.largo = Math.max(0.04, fin - desde);
  return fundido;
}

function iniciarZonas() {
  obras = datos.obras.map((o) => ({
    id: o.id, o, el: heroe.querySelector('.obra--' + o.id), z: zDeCapa(datos, o.capa),
    r: new Float32Array(4), x: -1e9, y: -1e9, w: -1e9, h: -1e9, oculta: false, verificada: false,
  })).filter((z) => z.el);
  Object.assign(camQuieta, crearCamara(datos));
  /* al cambiar de formato las zonas se rehacen: ninguna hereda «fuera» del formato anterior (si no, no vuelve a aparecer) */
  for (const z of obras) { z.el.classList.remove('obra--fuera'); z.el.style.transform = ''; }
  for (const z of obras) {
    if (z.el.dataset.listo) continue;
    z.el.dataset.listo = '1';
    const entra = () => { apuntada = z.id; aviso('mundo:obra', z.id); motor?.despertar(); };
    const sale = () => { if (apuntada === z.id) { apuntada = null; aviso('mundo:obra', null); motor?.despertar(); } };
    z.el.addEventListener('pointerenter', entra); z.el.addEventListener('pointerleave', sale);
    z.el.addEventListener('focus', entra); z.el.addEventListener('blur', sale);
  }
  html.classList.add('mundo-zonas');
}
/* ¿El rectángulo de la zona (con su rótulo) toca algún renglón de texto? Red de seguridad: con la composición
   correcta no pasa nunca; si pasa, la zona se esconde (el sello del producto sigue siendo su enlace). */
function chocaTexto(r) {
  const x0 = r[0] - 2, y0 = r[1] - 2, x1 = r[0] + r[2] + 2, y1 = r[1] + r[3] + (formato === 'v' ? 28 : 2);
  for (let i = 0; i < nRenglones; i++) {
    const o = i * 4;
    if (x0 < renglones[o + 2] && x1 > renglones[o] && y0 < renglones[o + 3] && y1 > renglones[o + 1]) return true;
  }
  return false;
}
let zonasUbicadas = false;
/* Ubica cada .obra sobre el rectángulo `pantalla` de su producto (coordenadas locales del héroe). */
function ubicarZonas(cam) {
  medirEscenario();
  encuadrar(datos, 0, escY, anchoH, escH, encDom, anchoMax);
  let pie = 0;
  for (const z of obras) {
    const r = rectObra(encDom, cam, z.o.pantalla, z.z, z.r);
    pie = Math.max(pie, r[1] + r[3]);
    const oculta = z.z - cam.tz < 0.3 || r[0] > anchoH || r[1] > altoH || r[0] + r[2] < 0 || r[1] + r[3] < 0 || chocaTexto(r);
    if (oculta !== z.oculta) { z.oculta = oculta; z.el.classList.toggle('obra--fuera', oculta); }
    if (oculta) continue;
    if (Math.abs(r[0] - z.x) > 0.5 || Math.abs(r[1] - z.y) > 0.5) { z.x = r[0]; z.y = r[1]; z.el.style.transform = `translate3d(${r[0].toFixed(1)}px,${r[1].toFixed(1)}px,0)`; }
    /* el tamaño cambia el maquetado: sólo se escribe si se movió más de 1,5 px (el travelling ya casi no escala) */
    if (Math.abs(r[2] - z.w) > 1.5 || Math.abs(r[3] - z.h) > 1.5) { z.w = r[2]; z.h = r[3]; z.el.style.width = r[2].toFixed(1) + 'px'; z.el.style.height = r[3].toFixed(1) + 'px'; }
  }
  finPantallas = pie;
  if (!zonasUbicadas && encDom.W > 0 && anchoH > 0) { zonasUbicadas = true; heroe.querySelector('.heroe__obras')?.classList.add('ubicadas'); }
}
function verificar(z, si) {
  if (z.verificada === si) return;
  z.verificada = si; z.el.classList.toggle('verificada', si);
  if (si) aviso('mundo:verificada', z.id);
}
let apuntada = null;

/* ================= Póster: primer pintado, pausa y respaldo ================= */
/* El póster ya está en el HTML. Se muestra recién cuando quedó con el mismo encuadre que la lámina del motor (así
   las zonas caen sobre sus pantallas y no hay salto al encenderse el lienzo), o con el de CSS si no hay datos. */
let posterUbicado = false, enRespaldo = false, oyeRespaldo = false;
const poster = () => heroe.querySelector('.heroe__poster');
function mostrarPoster() {
  const img = poster();
  if (!img || !posterUbicado || !img.complete || !img.naturalWidth) return;
  img.classList.add('visto');
  if (enRespaldo) html.classList.add('mundo-poster');
}
function ubicarPoster() {
  const img = poster();
  if (!img) return;
  if (datos) {
    const e = encDom, st = img.style;
    st.inset = 'auto'; st.left = e.x0.toFixed(1) + 'px'; st.top = e.y0.toFixed(1) + 'px'; st.width = e.W.toFixed(1) + 'px'; st.height = e.H.toFixed(1) + 'px';
    st.objectFit = 'fill'; st.aspectRatio = 'auto'; st.maxHeight = 'none';
    /* el mismo fundido que el motor: a la izquierda si la lámina está achicada (18 % del ancho del lienzo), arriba si
       el escenario va debajo del texto */
    let mascara = '';
    if (escY > 0) mascara = `linear-gradient(transparent ${((escY - e.y0) / e.H * 100).toFixed(1)}%, #000 ${((escY - e.y0 + 0.14 * escH) / e.H * 100).toFixed(1)}%)`;
    else if (e.x0 > 1) { const f = (0.18 * anchoH / e.W * 100).toFixed(1); mascara = `linear-gradient(90deg, rgb(0 0 0 / 0.1), rgb(0 0 0 / 0.35) calc(${f}% * 0.35), rgb(0 0 0 / 0.75) calc(${f}% * 0.7), #000 ${f}%)`; }
    st.maskImage = st.webkitMaskImage = mascara;
    /* el fundido inferior del héroe (máscara de .heroe__fondo), igual al del lienzo */
    const fu = medirFundido(e), fin = escY + escH * fu.fin;
    heroe.style.setProperty('--fundido-desde', ((fin - escH * fu.largo) / altoH * 100).toFixed(1) + '%');
    heroe.style.setProperty('--fundido-hasta', (fin / altoH * 100).toFixed(1) + '%');
  }
  posterUbicado = true;
  mostrarPoster();
}
function iniciarPoster() {
  const img = poster();
  if (img) img.addEventListener('load', mostrarPoster);
}
function respaldo(nombre, motivo) {
  if (nombre) { lienzo.dataset.estado = nombre; console.info('mundo:', nombre, '— ' + motivo); }
  html.classList.remove('mundo-vivo');
  enRespaldo = true;
  if (!datos) { posterUbicado = true; mostrarPoster(); acto = pedido() || 'diseno'; marcarVerbos(); return; }   // sin datos: el encuadre de CSS y sin zonas
  ubicarRespaldo();
  if (!oyeRespaldo) { oyeRespaldo = true; addEventListener('resize', () => { if (enRespaldo) ubicarRespaldo(); }); }
  for (const z of obras) verificar(z, true);
  acto = pedido() || 'diseno';
  marcarVerbos();
  deslizarListo();
}
function ubicarRespaldo() { medirHeroe(); ubicarZonas(camQuieta); ubicarPoster(); }

/* ================= Máquina de actos ================= */
const CLAVES = ['L', 'fL', 'fM', 'V', 'sombra', 'vs', 'tzE', 'cab'];
const val = { L: 0, fL: -0.3, fM: -0.4, V: 0, sombra: 1, vs: 0, tzE: 0, cab: -0.3 };
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
  acto = a; actoVisto = a; eco = null; sec = null; barriendo = false;
  for (const w of tw) w.vivo = false;
  val.L = a === 'defino' ? 1 : 0; val.fL = -0.3; val.fM = a === 'defino' ? 1.35 : -0.4;
  val.V = a === 'verifico' ? 1 : 0; val.sombra = 1; val.vs = 1; val.tzE = 0;
  zsFijo = a === 'verifico' && obras.length ? obras[0].o.distancia + 0.02 : 0;
  for (const z of obras) verificar(z, a === 'diseno' || (a === 'verifico' && z.o.distancia <= zsFijo));
  marcarVerbos(); aviso('mundo:acto', a);
}
/* Fin de la secuencia de carga: el reposo arranca con sucesos cerca (primer eco a los 3–6 s, foco que vaga a los 4 s)
   y aparece la señal de «deslizá». */
function finSecuencia() {
  sec = null;
  proxEco = reloj + 3 + 3 * Math.random();
  proxFoco = reloj + 4;
  deslizarListo();
}
function terminarEco() {
  if (!eco) return;
  eco = null;
  animar('L', acto === 'defino' ? 1 : 0, 0.7); animar('sombra', 1, 0.8);
  if (acto !== 'verifico') animar('V', 0, 0.5);
  proxEco = reloj + 6 + 8 * Math.random();   // otro eco en 6–14 s, sin período
  marcarVerbos();
}
function actuar(dt) {
  reloj += dt;
  const pide = pedido();
  /* secuencia de carga: defino → (cuando llegan los colores) diseño → verifico → reposo */
  if (sec && pide) sec = null;
  if (sec) {
    const e = reloj - sec.t0;
    if (sec.fase === 1 && sala.listoColor && sala.grande && e >= 1.25) { irA('diseno'); sec.fase = 2; sec.t0 = reloj; }
    else if (sec.fase === 1 && e >= sec.proxCab) {
      /* mientras se prepara la materia, el frente vuelve a recorrer el plano (sin borrarlo): pasadas de inspección al azar */
      poner('cab', 1.3); animar('cab', -0.3, 1.5, 0, true);
      sec.proxCab = e + 2.3 + 1.7 * Math.random();
    }
    else if (sec.fase === 2 && e >= 1.6) { irA('verifico'); sec.fase = 3; sec.t0 = reloj; }
    else if (sec.fase === 3 && e >= 1.55) { irA('diseno'); finSecuencia(); try { sessionStorage.setItem('mundo-visto', '1'); } catch {} }
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
  /* el verbo se enciende cuando el acto ya se VE (la interpolación pasó la mitad), y el anterior se apaga en el mismo cuadro */
  const vis = val.V >= 0.5 ? 'verifico' : (val.L >= 0.5 && (val.fM > 0.25 || eco?.tipo === 'defino') ? 'defino' : 'diseno');
  if (vis !== actoVisto) { actoVisto = vis; marcarVerbos(); }
  const p = sala.p;
  p.L = val.L; p.fL = val.fL; p.fM = val.fM; p.V = val.V; p.sombra = val.sombra;
  p.cabeza = tw[7].vivo ? val.cab : val.fL;   // la cabeza del frente en el programa liviano (pasadas de inspección)
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
  /* un objetivo inválido (medidas en cero con el panel oculto) no entra al estado; un estado inválido se cura solo */
  if (!Number.isFinite(objetivo)) return;
  if (!Number.isFinite(s.x) || !Number.isFinite(s.v)) { s.x = objetivo; s.v = 0; return; }
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
  const tope = topeH - sY;
  medirEscenario();
  sala.encuadrar(0, tope + escY, anchoH, escH, anchoMax);
  sala.heroeY = tope;
  sala.p.fundidoArriba = escY > 0 ? 0.14 : 0;
  const fu = medirFundido(sala.enc);
  sala.p.fin = fu.fin; sala.p.fundido = fu.largo;
  /* bloque de texto para el motor: hasta donde llega de verdad el titular (no la columna entera), con los botones y
     los sellos debajo (la grilla de «defino», el filo y el resplandor se calman en todo el bloque) */
  const baja = cajaBaja[3] > cajaBaja[1];
  sala.texto[0] = cajaTexto[0]; sala.texto[1] = cajaTexto[1] + tope; sala.texto[3] = cajaTexto[3] + tope;
  sala.texto[2] = Math.max(derTexto > cajaTexto[0] ? Math.min(cajaTexto[2], derTexto + 0.012 * anchoH) : cajaTexto[2], baja ? cajaBaja[2] : 0);
  for (let i = 0; i < nRenglones; i++) {
    const o = i * 4;
    sala.cajas[o] = renglones[o]; sala.cajas[o + 1] = renglones[o + 1] + tope; sala.cajas[o + 2] = renglones[o + 2]; sala.cajas[o + 3] = renglones[o + 3] + tope;
    sala.nivelCaja[i] = nivelRenglon[i];
  }
  sala.nCajas = lienzo.mundo?.sinGarantia ? 0 : nRenglones;   // sinGarantia: sólo para medir (pruebas)
  sala.texto2[0] = cajaBaja[0]; sala.texto2[1] = cajaBaja[1] + tope; sala.texto2[2] = cajaBaja[2]; sala.texto2[3] = baja ? cajaBaja[3] + tope : cajaBaja[1] + tope;
  if (QUIETO) { cam.tx = cam.ty = cam.tz = 0; sala.p.q = 1 / datos.foco.distancia; return; }
  resorte(sx, punteroX, 13, dt); resorte(sy, punteroY, 13, dt);
  const obj = Math.min(1, Math.max(0, -tope / altoH));
  avance += (obj - avance) * (1 - Math.exp(-dt / 0.4));
  cam.tx = -sx.x * 0.16 * GANANCIA + 0.02 * (0.7 * ruido1(t * 0.13) + 0.3 * ruido1(t * 0.31 + 5.2));
  cam.ty = sy.x * 0.09 * GANANCIA + 0.012 * (0.7 * ruido1(t * 0.11 + 31.7) + 0.3 * ruido1(t * 0.27 + 9.1)) - 0.25 * avance;
  /* al salir del héroe la cámara apenas avanza (antes 1,4 m: el zócalo y el monitor se volvían una mancha gigante):
     ninguna capa pasa de ≈ 1,1× de escala; el movimiento de salida lo da el descenso (ty) */
  cam.tz = 0.02 * ruido1(t * 0.07 + 77.3) + 0.09 * avance + val.tzE;
  acotar(cam);
  /* foco en dioptrías: reposo, producto apuntado (resorte que «caza»), infinito al deslizar */
  let df = datos.foco.distancia;
  vagar();
  const mira = apuntada || enfocada;
  if (mira) for (const z of obras) if (z.id === mira) df = z.z;
  const qObj = (1 / df) * (1 - avance);
  if (!sq.x) sq.x = qObj;
  const pasos = Math.max(1, Math.ceil(dt / 0.012)), h = dt / pasos, w = 8.2;
  for (let i = 0; i < pasos; i++) { sq.v += (w * w * (qObj - sq.x) - 2 * 0.6 * w * sq.v) * h; sq.x += sq.v * h; }
  sala.p.q = Math.max(0, sq.x);
}
/* Ningún producto se sale del cuadro por la derecha con el puntero: se acota el corrimiento lateral de la cámara
   (con rodilla suave, sin tope seco) para que el borde derecho de cada pantalla quede a 8 px del borde del lienzo. */
function acotar(cam) {
  const e = sala.enc;
  let txMin = -1e9;
  for (const z of obras) {
    const zz = Math.max(z.z - cam.tz, 0.05), s = z.z / zz, u = z.o.pantalla[2];
    const ox = (2 * u - 1) * s + 1 - 2 * (anchoH - 8 - e.x0) / e.W;
    txMin = Math.max(txMin, ox * cam.Tx * zz);
  }
  const k = 0.004;
  if (cam.tx < txMin + k) cam.tx = txMin + k * Math.exp((cam.tx - txMin - k) / k);
}
/* Foco que vaga, sin período: en reposo, cada 10 a 22 s (al azar) el foco viaja a otro producto 3 o 4 s, su rótulo
   se enciende y vuelve. El puntero manda: si apunta algo, esto se corta. */
let enfocada = null, finFoco = 0, proxFoco = 14;
function vagar() {
  const libre = !apuntada && !sec && !eco && acto === 'diseno' && avance < 0.05 && sala.aLaVista() && !QUIETO;
  if (enfocada && (!libre || reloj >= finFoco)) {
    const z = obras.find((o) => o.id === enfocada);
    z?.el.classList.remove('obra--enfocada');
    enfocada = null; proxFoco = reloj + 7 + 8 * Math.random();
  }
  if (!enfocada && libre && reloj >= proxFoco && obras.length > 1) {
    const reposo = datos.foco.distancia, cand = obras.filter((o) => !o.oculta && Math.abs(o.z - reposo) > 0.05);
    if (!cand.length) { proxFoco = reloj + 10; return; }
    const z = cand[(Math.random() * cand.length) | 0];
    enfocada = z.id; finFoco = reloj + 3 + Math.random();
    z.el.classList.add('obra--enfocada');
  } else if (!libre && !enfocada && reloj > proxFoco - 4) proxFoco = reloj + 4;   // tras una interacción, espera
}
/* Puntero: dónde está respecto del escenario y del texto (la lente no aparece sobre el texto ni sobre la navegación)
   y cuánto dirige al enjambre (entero mientras se mueve, a media fuerza si queda quieto encima). */
function apuntarTodo(m) {
  const p = puntero, tope = topeH - sY;
  p.dentro = p.visto && p.x >= 0 && p.x <= anchoH && p.y >= Math.max(tope + escY, altoNav) && p.y <= tope + escY + escH * (sala.p.fin - 0.7 * sala.p.fundido);
  const t1 = sala.texto, t2 = sala.texto2;
  p.sobreTexto = (p.x > t1[0] - 26 && p.x < t1[2] + 26 && p.y > t1[1] - 26 && p.y < t1[3] + 26)
              || (t2[3] > t2[1] && p.x > t2[0] - 26 && p.x < t2[2] + 26 && p.y > t2[1] - 26 && p.y < t2[3] + 26);
  const quiere = p.dentro && p.fino && !QUIETO ? (performance.now() - p.movido < 3500 ? 1 : 0.4) : 0;
  p.peso += (quiere - p.peso) * (1 - Math.exp(-m.dtReal * 4));
  if (p.peso < 0.002 && !quiere) p.peso = 0;
}

/* ================= Cuadro ================= */
function cuadro(m) {
  sY = scrollY;
  actuar(m.dtActos);
  camara(m);
  apuntarTodo(m);
  ubicarZonas(sala.cam);
  sala.rejX = !apilada && formato === 'h' ? 1 : 0;
  const hay = sala.aLaVista() && sala.dibujar();   // con el héroe fuera de vista sólo queda el fondo vivo
  const g = m.ganchos, grande = hay && !sala.soloLineas;
  /* GANCHO enjambre: se dibuja sumando sobre sala.fbColor y lee sala.texInfo (no con el programa liviano de líneas) */
  if (grande) for (let i = 0; i < g.sobreSala.length; i++) g.sobreSala[i](m, sala);
  /* GANCHO post: recibe el color lineal y devuelve la textura a mostrar */
  if (!grande) sala.fuerzaResplandor = 0;
  sala.salida(grande && g.post ? g.post(m, sala) : sala.texColor);
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
  /* con la secuencia ya corriendo en el programa liviano, el calentamiento dibuja el camino grande sólo en los destinos
     intermedios (el lienzo sigue mostrando las líneas); si no, cuadros invisibles completos como antes */
  const detras = !!motor.alCuadro;
  if (!detras) { p.entrada = 0; medirHeroe(); motor.ajustar(); }   // tras recuperar el contexto el lienzo vuelve sin medida
  while (esta.vivo && !motor.perdido) {
    if (detras) precalentar(esta); else cuadro(motor);
    if ((enjambre.dibujo && post.dibujo && (detras || fondoVivo.dibujo)) || performance.now() - t0 > 3000) break;
    await espera(40);
  }
  const s = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  while (s && !motor.perdido && gl.clientWaitSync(s, 0, 0) === gl.TIMEOUT_EXPIRED && performance.now() - t0 < 6000) await espera(30);
  if (s) gl.deleteSync(s);
  p.entrada = 1;
}

function precalentar(esta) {
  if (!esta.aLaVista() || !esta.dibujar(true)) return;
  for (const f of motor.ganchos.sobreSala) f(motor, esta);
  motor.ganchos.post?.(motor, esta);
  esta.fuerzaResplandor = 0;
}

async function armar() {
  motor.estado('cargando', `formato ${formato}, nivel ${motor.nivel}`);
  let visto = false;
  try { visto = sessionStorage.getItem('mundo-visto') === '1'; } catch {}
  const directo = QUIETO || T_FIJO != null || ACTO_FIJO || visto || SEC != null;
  actoVisto = null;
  try {
    sala = crearSala(motor, datos, formato, BASE);
  } catch (e) { motor.estado('error-shader', e.message); sala = null; return respaldo(); }
  const esta = sala;
  lienzo.mundo = { // para pruebas
    motor, sala: esta, val, obras, puntero, enjambre, fondo: fondoVivo, get acto() { return acto; }, get reloj() { return reloj; }, get apuntada() { return apuntada; }, get enfocada() { return enfocada; },
    apuntar(x, y) { punteroX = sx.x = x; punteroY = sy.x = y; sx.v = sy.v = 0; }, // pone el puntero (−1..1) sin esperar al resorte
  };
  try {
    const pedidos = esta.pedirColor();
    for (const p of pedidos) p.catch(() => {});
    const programa = esta.programaListo().then(() => { motor.hitos.programa = Math.round(performance.now()); });
    programa.catch(() => {});
    await Promise.all([esta.cargarDatos().then(() => { motor.hitos.datos = Math.round(performance.now()); }), esta.lineasListas()]);
    if (!esta.vivo || motor.perdido) return;
    medirHeroe();
    reloj = 0; eco = null; acto = null; apuntada = null;
    if (!directo) {
      /* la carga es la secuencia: apenas están los datos corre «defino» con el programa liviano de líneas, mientras el
         grande se compila detrás (en frío, más de 3 s) y bajan los colores. Nunca hay una pausa muerta. */
      poner('fM', 1.35); poner('L', 0); poner('V', 0); poner('tzE', -0.22); animar('tzE', 0, 4.2);
      sec = { fase: 1, t0: 0, proxCab: 2.6 };
      irA('defino');
      motor.estado('lineas', 'datos listos: corre el acto «defino» mientras se prepara la materia');
      html.classList.add('mundo-vivo');
      motor.alCuadro = cuadro; motor.despertar();
    }
    await programa;
    if (!esta.vivo || motor.perdido) return;
    /* los colores se suben mientras la placa se calienta: así la secuencia no se traba al subirlos */
    const color = esta.cargarColor(pedidos);
    color.catch(() => {});
    if (directo) esta.grande = true;
    await calentar(esta);
    motor.hitos.calentado = Math.round(performance.now());
    if (!esta.vivo || motor.perdido) return;
    await color;
    if (!esta.vivo || motor.perdido) return;
    esta.grande = true;   // el bucle pasa al programa grande: las líneas caen en el mismo lugar
    motor.vigilarDesde();
    if (directo) {
      medirHeroe();
      if (SEC != null) {
        /* captura de la secuencia: se simula hasta el segundo pedido y se congela */
        poner('fM', 1.35); poner('L', 0); poner('tzE', -0.22); animar('tzE', 0, 4.2);
        sec = { fase: 1, t0: 0, proxCab: 1e9 }; irA('defino');
        for (let s = 0; s < SEC; s += 1 / 60) actuar(1 / 60);
        motor.tiempoFijo = SEC;
      } else pose(T_FIJO != null || QUIETO ? ACTO_FIJO || 'diseno' : 'diseno'); // con ?acto= y sin ?t=, la máquina va sola al acto pedido
      if (SEC == null) { proxEco = reloj + 3 + 3 * Math.random(); proxFoco = reloj + 4; deslizarListo(); }
      html.classList.add('mundo-vivo');
      motor.alCuadro = cuadro; motor.despertar();
    }
    html.classList.remove('mundo-poster'); enRespaldo = false;
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
  iniciarPoster();
  medirHeroe();
  deslizar();
  try {
    const r = await fetch(new URL('mundo.json', BASE));
    if (!r.ok) throw new Error(r.status + ' en mundo.json');
    mundo = await r.json();
  } catch (e) { lienzo.dataset.estado = 'error-carga'; console.warn('mundo: error-carga —', e.message); return respaldo(); }
  formato = elegirFormato(); datos = mundo[formato];
  medirHeroe();
  iniciarZonas();
  ubicarZonas(camQuieta);
  ubicarPoster();
  if (par.get('mundo') === '0') return respaldo('respaldo', 'pedido con ?mundo=0');
  if (navigator.connection?.saveData) return respaldo('ahorro-de-datos', 'el navegador pide ahorrar datos: queda el póster');
  motor = crearMotor(lienzo, { nivel: CAPTURA ? par.get('nivel') : null, tiempoFijo: T_FIJO, quieto: QUIETO, sinTope: CAPTURA && par.get('tope') === '0' });
  if (!motor) return respaldo();
  /* segunda mitad: enjambre y guías, resplandor, lente y fondo vivo (se enganchan solos en motor.ganchos) */
  const ctx = { val, puntero, heroe, topeHeroe: () => topeH - sY, enfocada: () => apuntada || enfocada };
  enjambre = crearEnjambre(motor, ctx);
  post = crearPost(motor);
  crearLente(motor, ctx);
  fondoVivo = crearFondo(motor);

  /* el DOM manda: tamaño del héroe, scroll y puntero */
  const alMedir = () => {
    if (!conSuperficie()) return;   // sin superficie no se mide ni se rearma: al volver llega otro aviso de tamaño
    medirHeroe();
    if (mundo.v && elegirFormato() !== formato) rearmar();
    else { ubicarZonas(sala ? sala.cam : camQuieta); ubicarPoster(); }
    motor.despertar();
  };
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
      medirHeroe();
      for (const z of obras) { z.el.classList.remove('verificada'); }
      iniciarZonas(); ubicarZonas(camQuieta); ubicarPoster(); armar();
    }, 250);
  }
  /* contexto perdido: el póster queda a la vista enseguida; si en 2 s no vuelve, pasa a respaldo con sus zonas */
  let tPerdida = 0;
  motor.ganchos.alPerder.push(() => {
    if (sala) sala.vivo = false; sala = null; motor.alCuadro = null; html.classList.remove('mundo-vivo');
    clearTimeout(tPerdida);
    tPerdida = setTimeout(() => { if (motor.perdido) respaldo('contexto-perdido', 'el contexto no volvió: queda el póster'); }, 2000);
  });
  motor.ganchos.alRestaurar.push(() => { clearTimeout(tPerdida); armar(); });
  /* WebGL que no llega a 20 c/s ni en nivel 1 (placa muy débil): el póster. Como la máquina pudo estar ocupada sólo
     al cargar, se vuelve a probar (hasta dos veces, con 8 s de espera) cuando la persona vuelve a la página o lleva
     el puntero a la sala. */
  let reintentos = 0, tLento = 0;
  const reintentar = () => {
    if (lienzo.dataset.estado !== 'lento' || reintentos >= 2 || document.visibilityState === 'hidden' || performance.now() - tLento < 8000) return;
    reintentos++;
    console.info('mundo: reintento', reintentos, '— se vuelve a probar el motor');
    motor.reintentar(); armar();
  };
  motor.ganchos.alLento.push((m, ms) => {
    motor.alCuadro = null; motor.parar(); sala?.liberar(); sala = null;
    tLento = performance.now();
    respaldo('lento', `la placa no llega a 20 c/s (${ms.toFixed(0)} ms por cuadro): queda el póster`);
  });
  document.addEventListener('visibilitychange', reintentar);
  addEventListener('focus', reintentar);
  addEventListener('pageshow', reintentar);
  heroe.addEventListener('pointerenter', reintentar);

  await armar();
}

/* Señal de «deslizá» al pie del héroe (sólo en la composición al lado y si hay lugar debajo del último renglón):
   rótulo en versalitas, filete y una gota de luz que baja a intervalos al azar (nunca con un período fijo). Aparece
   con un fundido al terminar la secuencia y se apaga en cuanto se desliza. Decorativa: aria-hidden, sin foco. */
let deslizarListo = () => {};
function deslizar() {
  const el = heroe.querySelector('.heroe__deslizar'), gota = el?.querySelector('.heroe__gota');
  if (!el || !gota) return;
  let apagada = false, t = 0, lista = false;
  const poner = () => {
    const libre = altoH - cajaTexto[3];
    const hay = heroe.dataset.comp === 'lado' && libre >= 56;
    el.classList.toggle('lista', hay);
    if (!hay) return;
    el.style.left = (cajaTexto[0] || 0).toFixed(1) + 'px';
    el.style.bottom = Math.min(22, (libre - 30) / 2).toFixed(1) + 'px';
  };
  poner(); addEventListener('resize', poner);
  if ('ResizeObserver' in window) new ResizeObserver(poner).observe(heroe);
  const mirar = () => {
    const ap = scrollY > 24;
    if (ap !== apagada) { apagada = ap; el.classList.toggle('apagada', ap); if (!ap) caer(); }
  };
  addEventListener('scroll', mirar, { passive: true });
  function caer() {
    clearTimeout(t);
    if (apagada || !lista || QUIETO || !gota.animate) return;
    const dur = 1500 + 500 * Math.random();
    gota.animate([{ transform: 'translateY(-4px) scaleY(0.6)', opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0.9, offset: 0.7 }, { transform: 'translateY(30px) scaleY(1.3)', opacity: 0 }],
      { duration: dur, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    t = setTimeout(caer, dur + 1800 + 4200 * Math.random());
  }
  deslizarListo = () => {
    if (lista) return;
    lista = true; poner(); el.classList.add('vista');
    mirar(); t = setTimeout(caer, 1400);
  };
  mirar();
}

arrancar();
