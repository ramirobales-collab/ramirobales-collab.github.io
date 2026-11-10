/* movimiento.js — el movimiento de la página, sin dependencias (lo carga comun.js).
   · Texto que entra al deslizar: [data-revelar] (títulos por líneas, lo demás por bloque) y [data-revelar-hijos].
   · Rodillos de cifras [data-rodillo], filetes, cortinas de imagen (.cortina / .mascara) y clases .visto.
   · Luz de puntero en las placas, paralaje al puntero en [data-paralaje], rótulo de cursor [data-cursor].
   · Barra que pasa a placa apenas se desliza (oscura mientras la sala sigue debajo) y sección actual en la barra y el riel.
   Sin JS el contenido se ve entero: lo oculto sólo existe bajo html.mov. Con ?quieto=1 o ?ir= no se anima nada. */
const html = document.documentElement;
const params = new URLSearchParams(location.search);
const QUIETO = params.get('quieto') === '1';
const IR = !!params.get('ir');
const REDUCIDO = matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINO = matchMedia('(hover: hover) and (pointer: fine)').matches;
const ACTIVO = !QUIETO && !IR && 'IntersectionObserver' in window;
const qs = (s, r = document) => r.querySelector(s);
const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

html.dataset.mov = '1'; // el guion en línea del <head> quita .js y .mov si esto no llegó a correr
html.classList.add('js');
html.classList.toggle('mov', ACTIVO);

const DURACION = { lineas: 900, bloque: 600, cortina: 1500 };
let observador = null;
let iniciado = false;

/* ---------- Preparación ---------- */
function tipoDe(el) {
  const v = el.dataset.revelar;
  if (v === 'bloque' || v === 'lineas') return v;
  return /^H[1-6]$/.test(el.tagName) ? 'lineas' : 'bloque';
}

/* Envuelve cada palabra en .pal > .pal__t sin tocar los nodos en línea (negritas, enlaces) ni los espacios:
   el texto real y el nombre accesible quedan iguales. La «máscara por línea» sale de darle a cada palabra el
   retardo de su línea (--l), así un cambio de ancho no obliga a partir de nuevo. */
function partirPalabras(el) {
  if (el.querySelector('.pal')) return;
  const caminante = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const textos = [];
  while (caminante.nextNode()) textos.push(caminante.currentNode);
  for (const n of textos) {
    if (!n.nodeValue.trim()) continue;
    const frag = document.createDocumentFragment();
    for (const parte of n.nodeValue.split(/(\s+)/)) {
      if (!parte) continue;
      if (/^\s+$/.test(parte)) { frag.append(parte); continue; }
      const pal = document.createElement('span');
      pal.className = 'pal';
      const t = document.createElement('span');
      t.className = 'pal__t';
      t.textContent = parte;
      pal.append(t);
      frag.append(pal);
    }
    n.replaceWith(frag);
  }
}

function medirLineas(elementos) {
  const lecturas = elementos.map((el) => qsa('.pal', el).map((p) => [p, p.offsetTop]));
  lecturas.forEach((pals, i) => {
    let top = null;
    let l = -1;
    for (const [p, t] of pals) {
      if (top === null || Math.abs(t - top) > 4) { l += 1; top = t; }
      p.firstChild.style.setProperty('--l', l);
    }
    elementos[i].dataset.lineas = String(l + 1);
  });
}

/* Cifras: cada dígito pasa a ser una columna de cuatro que termina en el dígito real (rodillo). */
function armarRodillo(el) {
  if (el.querySelector('.rod')) return;
  const texto = el.textContent;
  el.textContent = '';
  let i = 0;
  for (const c of texto) {
    if (!/\d/.test(c)) { el.append(c); continue; }
    const rod = document.createElement('span');
    rod.className = 'rod';
    rod.style.setProperty('--i', i++);
    const col = document.createElement('span');
    col.className = 'rod__c';
    for (let k = 0; k <= 3; k++) {
      const d = document.createElement('span');
      d.textContent = String((+c + 10 - k) % 10);
      col.append(d);
    }
    rod.append(col);
    el.append(rod);
  }
}

/* La flecha final de un enlace («Leer el caso →») pasa a un span para que avance sola al pasar. */
function armarFlechas() {
  qsa('.boton, .caso__leer').forEach((el) => {
    if (el.querySelector('.flecha')) return;
    const n = el.lastChild;
    if (!n || n.nodeType !== 3 || !/→\s*$/.test(n.nodeValue)) return;
    n.nodeValue = n.nodeValue.replace(/→\s*$/, '');
    const f = document.createElement('span');
    f.className = 'flecha';
    f.setAttribute('aria-hidden', 'true');
    f.textContent = '→';
    el.append(f);
  });
}

function preparar() {
  armarFlechas();
  if (!ACTIVO) return;
  qsa('[data-revelar-hijos]').forEach((c) => {
    const sel = c.dataset.revelarHijos;
    (sel ? qsa(sel, c) : Array.from(c.children)).forEach((h) => { if (!h.hasAttribute('data-revelar')) h.setAttribute('data-revelar', 'bloque'); });
  });
  const nuevos = [];
  const lineas = [];
  qsa('[data-revelar]').forEach((el) => {
    const tipo = tipoDe(el);
    if (tipo === 'lineas') {
      partirPalabras(el);
      if (el.dataset.mov !== 'fin') lineas.push(el);
    }
    if (!el.dataset.mov) { el.dataset.mov = tipo; nuevos.push(el); }
  });
  qsa('.cortina, .mascara').forEach((el) => { if (!el.dataset.mov) { el.dataset.mov = 'cortina'; nuevos.push(el); } });
  qsa('[data-rodillo]').forEach((el) => { if (!el.querySelector('.rod')) { armarRodillo(el); nuevos.push(el); } });
  qsa('.folio, .filete, [data-visto]').forEach((el) => { if (!el.dataset.obs) nuevos.push(el); });
  medirLineas(lineas);
  nuevos.forEach(vigilar);
}

/* Qué mira el observador por cada elemento. Una cortina está recortada por su propio clip-path (inset 100 % abajo):
   el navegador intersecta ese rectángulo ya recortado, que es una línea en el borde superior. Si un salto (ancla,
   riel, «atrás») deja ese borde por encima de la pantalla, la línea nunca entra y la cortina no se abre. Por eso
   la cortina se vigila a través de su contenedor, que no está recortado. */
const vigilados = new Map(); // objetivo observado → elementos que dispara
function vigilar(el) {
  if (el.dataset.obs) return;
  el.dataset.obs = '1';
  const objetivo = el.dataset.mov === 'cortina' && el.parentElement ? el.parentElement : el;
  let lista = vigilados.get(objetivo);
  if (!lista) { lista = []; vigilados.set(objetivo, lista); observador.observe(objetivo); }
  lista.push(el);
}

/* ---------- Disparo al entrar ---------- */
function marcar(el, retardo, yaPaso) {
  const tipo = el.dataset.mov;
  if (yaPaso) {
    el.classList.add('visto');
    if (tipo) el.dataset.mov = 'fin';
    return;
  }
  el.style.setProperty('--d', retardo + 'ms');
  el.classList.add('visto');
  if (!tipo) return;
  const extra = tipo === 'lineas' ? (+el.dataset.lineas || 1) * 80 : 0;
  setTimeout(() => { el.dataset.mov = 'fin'; el.style.removeProperty('--d'); }, (DURACION[tipo] || 600) + extra + retardo + 120);
}

function alEntrar(entradas) {
  const entran = [];
  for (const e of entradas) {
    const lista = vigilados.get(e.target) || [e.target];
    if (e.isIntersecting) entran.push(...lista);
    else if (e.boundingClientRect.bottom < 0) lista.forEach((el) => marcar(el, 0, true)); // quedó arriba de la vista: se muestra sin animar
    else continue;
    observador.unobserve(e.target);
    vigilados.delete(e.target);
  }
  const rects = new Map(entran.map((el) => [el, el.getBoundingClientRect()]));
  entran.sort((a, b) => rects.get(a).top - rects.get(b).top || rects.get(a).left - rects.get(b).left);
  entran.forEach((el, i) => marcar(el, REDUCIDO ? 0 : Math.min(i, 10) * 60));
}

/* ---------- Imágenes: aparecen cuando terminaron de bajar ---------- */
function iniciarImagenes() {
  qsa('img[data-carga]').forEach((img) => {
    const lista = () => img.classList.add('cargada');
    if (img.complete && img.naturalWidth) lista();
    else { img.addEventListener('load', lista, { once: true }); img.addEventListener('error', lista, { once: true }); }
  });
}

/* ---------- Puntero fino: luz en las placas, paralaje y rótulo de cursor ---------- */
function iniciarPuntero() {
  if (!FINO || QUIETO) return;
  let x = 0;
  let y = 0;
  let destino = null;
  let pendiente = 0;
  let conParalaje = null;
  let rotulo = null;
  const soltar = () => {
    if (conParalaje) { conParalaje.style.setProperty('--px', 0); conParalaje.style.setProperty('--py', 0); conParalaje = null; }
    if (rotulo) rotulo.classList.remove('activo');
  };
  const aplicar = () => {
    pendiente = 0;
    if (!destino || !destino.closest) return;
    const caso = destino.closest('.caso');
    const placa = caso ? qs('.placa', caso) : destino.closest('.placa, .papel, [data-luz]');
    if (placa) {
      const r = placa.getBoundingClientRect();
      placa.style.setProperty('--mx', Math.round(x - r.left) + 'px');
      placa.style.setProperty('--my', Math.round(y - r.top) + 'px');
    }
    const media = caso && qs('[data-paralaje]', caso);
    if (media !== conParalaje) soltar();
    if (!media) return;
    if (!REDUCIDO) {
      const r = media.getBoundingClientRect();
      const acotar = (v) => Math.max(-1, Math.min(1, v));
      media.style.setProperty('--px', acotar((x - r.left - r.width / 2) / (r.width / 2)).toFixed(3));
      media.style.setProperty('--py', acotar((y - r.top - r.height / 2) / (r.height / 2)).toFixed(3));
      conParalaje = media;
    }
    if (media.dataset.cursor) {
      if (!rotulo) {
        rotulo = document.createElement('div');
        rotulo.className = 'cursor-rotulo';
        rotulo.setAttribute('aria-hidden', 'true');
        document.body.append(rotulo);
      }
      if (rotulo.textContent !== media.dataset.cursor) rotulo.textContent = media.dataset.cursor;
      rotulo.style.transform = `translate3d(${x + 16}px, ${y + 20}px, 0)`;
      rotulo.classList.add('activo');
    }
  };
  addEventListener('pointermove', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    x = e.clientX; y = e.clientY; destino = e.target;
    if (!pendiente) pendiente = requestAnimationFrame(aplicar);
  }, { passive: true });
  document.addEventListener('pointerleave', soltar);
  addEventListener('scroll', () => { if (rotulo) rotulo.classList.remove('activo'); }, { passive: true });
  addEventListener('blur', soltar);
}

/* ---------- Barra: transparente sobre la sala, placa al salir del héroe; sección actual ---------- */
function iniciarBarra() {
  const nav = qs('.nav');
  if (!nav) return;
  const heroe = qs('.heroe');
  if (!heroe) nav.classList.add('nav--placa');
  else {
    /* Transparente sólo en reposo: con el primer desplazamiento ya hay texto, rótulos o luz que pueden pasar por
       debajo, así que pasa a placa opaca. Mientras la sala siga detrás de la barra, la placa es oscura (.nav--sala). */
    let pendiente = 0;
    // en pantallas muy apaisadas la ranura de luz del portal sube hasta la barra (medido a 2560×1080: «Método» a 1,5:1
    // aun con el halo): ahí la barra es placa también en reposo
    const apaisada = matchMedia('(min-aspect-ratio: 2/1)');
    const leer = () => {
      pendiente = 0;
      const alto = nav.offsetHeight || 72;
      const r = heroe.getBoundingClientRect();
      nav.classList.toggle('nav--placa', r.top < -12 || r.bottom < alto || apaisada.matches);
      nav.classList.toggle('nav--sala', r.bottom > alto * 0.5);
    };
    leer();
    /* dónde termina la sala (coordenada de página): en tema claro el fondo del documento es negro hasta ahí, así la
       sala se desvanece contra negro como en oscuro y el pliegue hace el pase al papel debajo */
    const fin = () => html.style.setProperty('--heroe-fin', Math.round(heroe.getBoundingClientRect().bottom + scrollY) + 'px');
    fin();
    if ('ResizeObserver' in window) new ResizeObserver(fin).observe(heroe);
    const pedir = () => { if (!pendiente) pendiente = requestAnimationFrame(leer); };
    addEventListener('scroll', pedir, { passive: true });
    addEventListener('resize', pedir, { passive: true });
    apaisada.addEventListener?.('change', pedir);
  }
  const secciones = qsa('main > section[id], header[id]');
  const enlaces = qsa('.nav__enlaces a[href^="#"], .riel a[href^="#"]');
  if (!secciones.length || !enlaces.length || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entradas) => {
    entradas.forEach((en) => {
      if (!en.isIntersecting) return;
      enlaces.forEach((a) => { if (a.getAttribute('href') === '#' + en.target.id) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  secciones.forEach((s) => io.observe(s));
}

/* ---------- Contenedores que se desplazan de costado ---------- */
/* La región de «Qué sé hacer» es un carril deslizable sólo en celular: ahí necesita foco de teclado para poder
   moverla. En escritorio no se desplaza y una parada de foco de 3.000 px de alto sólo estorba. */
function iniciarDesplazables() {
  const lista = qsa('.saberes[tabindex]');
  if (!lista.length) return;
  const revisar = (el) => {
    if (el.scrollWidth > el.clientWidth + 1) el.setAttribute('tabindex', '0');
    else if (document.activeElement !== el) el.removeAttribute('tabindex');
  };
  lista.forEach(revisar);
  if ('ResizeObserver' in window) { const ro = new ResizeObserver((es) => es.forEach((e) => revisar(e.target))); lista.forEach((el) => ro.observe(el)); }
}

/* ---------- Interfaz para comun.js ---------- */
export function iniciarMovimiento() {
  if (ACTIVO) observador = new IntersectionObserver(alEntrar, { rootMargin: '0px 0px -10% 0px' });
  iniciado = true;
  preparar();
  iniciarImagenes();
  iniciarPuntero();
  iniciarBarra();
  iniciarDesplazables();
  if (!ACTIVO) return;
  let ancho = innerWidth;
  let t = 0;
  const remedir = () => medirLineas(qsa('[data-mov="lineas"]:not(.visto)'));
  addEventListener('resize', () => {
    if (innerWidth === ancho) return;
    ancho = innerWidth;
    clearTimeout(t);
    t = setTimeout(remedir, 160);
  });
  if (document.fonts?.ready) document.fonts.ready.then(remedir);
}

/* Después de cambiar el idioma (el diccionario reescribe los textos): vuelve a partir palabras y flechas. */
export function refrescarMovimiento() { if (iniciado) preparar(); }
