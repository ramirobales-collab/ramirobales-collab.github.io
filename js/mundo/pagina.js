/* pagina.js — el fondo vivo de «la sala negra» en las páginas sin héroe (casos, seguridad, legales, créditos, 404).
   Arranca sólo el motor y el fondo vivo (fondo.js) sobre el mismo lienzo fijo de la portada: enjambre lejano en tres
   planos, bruma tenue y motas que recorren los cantos de las placas marcadas con data-iman. No baja láminas.
   Respaldo: sin WebGL2, con ahorro de datos o con ?mundo=0 el lienzo queda quieto y pinta en CSS una luz fija
   (caso.css, `canvas.mundo[data-estado]`). Movimiento reducido o ?quieto=1: un solo cuadro, sin viento ni paralaje.
   También: paralaje al puntero de la foto de cabecera de los casos ([data-paralaje] en .caso-cabecera__media). */
import { crearMotor } from './motor.js';
import { crearFondo } from './fondo.js';

const html = document.documentElement;
const par = new URLSearchParams(location.search);
const lienzo = document.querySelector('canvas.mundo');
const QUIETO = par.get('quieto') === '1' || matchMedia('(prefers-reduced-motion: reduce)').matches;
const T_FIJO = par.has('t') && isFinite(+par.get('t')) ? +par.get('t') : null;

/* El fondo vivo dibuja «donde el héroe no tapa»: acá no hay héroe, así que el escenario queda fuera de cuadro. */
const SIN_HEROE = { enc: { Sx: 0, Sy: -1e6, Sw: 1, Sh: 1 }, heroeY: null, p: { fundido: 0, entrada: 0 }, listoDatos: false };

function respaldo(nombre, motivo) {
  if (nombre) { lienzo.dataset.estado = nombre; console.info('mundo:', nombre, '— ' + motivo); }
  html.classList.add('mundo-quieto');
}

function arrancar() {
  if (!lienzo) return;
  if (par.get('mundo') === '0') return respaldo('respaldo', 'pedido con ?mundo=0');
  if (navigator.connection?.saveData) return respaldo('ahorro-de-datos', 'el navegador pide ahorrar datos: queda la luz fija');
  const motor = crearMotor(lienzo, { nivel: par.get('nivel'), tiempoFijo: T_FIJO, quieto: QUIETO, sinTope: par.get('tope') === '0' });
  if (!motor) return respaldo(); // crearMotor ya dejó el motivo en data-estado («sin-webgl2»)
  const gl = motor.gl;
  crearFondo(motor);
  motor.alCuadro = (m) => {
    if (m.perdido) return false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, m.ancho, m.alto);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    for (const g of m.ganchos.fondo) g(m, SIN_HEROE);
    return true;
  };
  motor.ganchos.alRestaurar.push(() => motor.despertar());
  addEventListener('scroll', () => motor.despertar(), { passive: true });
  /* para las pruebas y las capturas (igual que la portada): canvas.mundo.mundo */
  lienzo.mundo = { motor };
  motor.estado('listo', `fondo vivo sin héroe, nivel ${motor.nivel}`);
  html.classList.add('mundo-vivo');
  motor.despertar();
}

/* Foto de cabecera de un caso: las dos capas (fondo y dispositivo) se corren en sentidos opuestos según el puntero,
   con inercia. Sólo puntero fino y sin movimiento reducido. Las variables --px/--py las lee caso.css. */
function paralajeCabecera() {
  if (QUIETO || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  /* la cabecera sigue al puntero en toda la pantalla; la puerta al caso siguiente, sólo con el puntero encima */
  const medias = [
    { el: document.querySelector('.caso-cabecera__media[data-paralaje]'), dentro: false },
    { el: document.querySelector('.caso-puerta [data-paralaje]'), dentro: true },
  ].filter((m) => m.el).map((m) => ({ ...m, ox: 0, oy: 0, x: 0, y: 0 }));
  if (!medias.length) return;
  let raf = 0;
  const paso = () => {
    let sigue = false;
    for (const m of medias) {
      m.x += (m.ox - m.x) * 0.09; m.y += (m.oy - m.y) * 0.09;
      m.el.style.setProperty('--px', m.x.toFixed(3)); m.el.style.setProperty('--py', m.y.toFixed(3));
      if (Math.abs(m.ox - m.x) + Math.abs(m.oy - m.y) > 0.002) sigue = true;
    }
    raf = sigue ? requestAnimationFrame(paso) : 0;
  };
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    for (const m of medias) {
      const r = m.el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) continue;
      const enc = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (m.dentro && !enc) { m.ox = 0; m.oy = 0; continue; }
      m.ox = Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / (r.width / 2)));
      m.oy = Math.max(-1, Math.min(1, (e.clientY - r.top - r.height / 2) / (r.height / 2)));
    }
    if (!raf) raf = requestAnimationFrame(paso);
  }, { passive: true });
  document.addEventListener('pointerleave', () => { for (const m of medias) { m.ox = 0; m.oy = 0; } if (!raf) raf = requestAnimationFrame(paso); });
}

/* Índice del caso: marca la parte que se está leyendo (aria-current). */
function indice() {
  const enlaces = [...document.querySelectorAll('.caso-indice a')];
  const partes = enlaces.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if (!partes.length || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((es) => {
    for (const e of es) {
      if (!e.isIntersecting) continue;
      for (const a of enlaces) { if (a.getAttribute('href') === '#' + e.target.id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); }
    }
  }, { rootMargin: '-30% 0px -55% 0px' });
  partes.forEach((s) => io.observe(s));
}

/* Red de seguridad de las cortinas de imagen: el observador de movimiento.js mira la caja ya recortada (una línea en
   el borde de arriba), así que un salto de scroll que deja ese borde por encima de la pantalla (un ancla, Inicio/Fin)
   no la dispara y la imagen queda oculta aunque se vea. Al terminar de deslizar, se abre todo lo que está a la vista. */
function redCortinas() {
  if (!html.classList.contains('mov')) return;
  let t = 0;
  const revisar = () => {
    const h = innerHeight;
    for (const el of document.querySelectorAll('.cortina:not(.visto), .mascara:not(.visto)')) {
      const r = el.getBoundingClientRect();
      if (r.bottom > 0 && r.top < h) el.classList.add('visto');
    }
  };
  addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(revisar, 160); }, { passive: true });
  addEventListener('load', revisar);
}

arrancar();
paralajeCabecera();
indice();
redCortinas();
