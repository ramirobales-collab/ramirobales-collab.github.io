import { PRODUCTOS } from './datos.js';

const params = new URLSearchParams(location.search);
const html = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const quieto = params.get('quieto') === '1' || reduce;
if (!quieto && 'IntersectionObserver' in window) html.classList.add('js-mov');
const modoPoster = params.get('poster') === '1';
const modoRender = params.get('render') === '1';
const medir = params.get('medir') === '1';
// En celular la primera vista es el póster: el modelo y el entorno se piden recién al primer toque sobre el visor.
const diferir3d = !modoRender && !medir && matchMedia('(max-width: 767px)').matches;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const estado = {
  producto: params.get('producto') === 'sofa' ? 'sofa' : 'silla',
  sel: { silla: {}, sofa: {} },
  grupoActivo: 'tela',
  carrito: [],
  idioma: 'es',
  dic: null,
  macro: false,
};
const dics = {};
const miniaturas = {};
let relojMini = 0;
let visor = null;
let visorListo = false;
const cargados = new Set(['__']);

// Pide el GLB del producto inicial y el entorno antes de que cargue three.js (el visor los toma de la caché).
// No en celular ni con ahorro de datos: ahí el póster cubre la primera pantalla y el 3D espera.
if (params.get('poster') !== '1' && !diferir3d && !(navigator.connection || {}).saveData) {
  const raiz = new URL('../../', location.href);
  for (const [href, tipo] of [[PRODUCTOS[params.get('producto') === 'sofa' ? 'sofa' : 'silla'].glb, 'fetch'], ['assets/3d/env/studio_small_09_512.hdr', 'fetch']]) {
    const l = document.createElement('link');
    l.rel = 'preload'; l.as = tipo; l.crossOrigin = 'anonymous'; l.href = new URL(href, raiz).href;
    document.head.append(l);
  }
}

for (const p of Object.values(PRODUCTOS)) for (const g of p.grupos) estado.sel[p.id][g.id] = g.opciones[0].id;
// Parámetros de captura: ?tela=pavo&madera=ebano&metal=cromo (ids de datos.js).
for (const g of PRODUCTOS[estado.producto].grupos) {
  const q = params.get(g.id);
  if (q && g.opciones.some((o) => o.id === q)) estado.sel[estado.producto][g.id] = q;
}

/* ---------- Texto ---------- */
const t = (k, fallback = '') => (estado.dic && estado.dic[k] != null ? estado.dic[k] : fallback || k);
const fmt = (n) => new Intl.NumberFormat(estado.idioma === 'es' ? 'es-AR' : 'en-US', { maximumFractionDigits: 0 }).format(n);
const dinero = (n) => `US$ ${fmt(n)}`;

async function diccionario(l) {
  if (!dics[l]) dics[l] = await fetch(`i18n/${l}.json`).then((r) => r.json());
  return dics[l];
}
function aplicarDiccionario() {
  $$('[data-i18n]').forEach((el) => { const v = estado.dic[el.dataset.i18n]; if (v != null) el.textContent = v; });
  $$('[data-i18n-attr]').forEach((el) => el.dataset.i18nAttr.split(';').forEach((par) => {
    const [a, k] = par.split('=').map((s) => s.trim());
    if (estado.dic[k] != null) el.setAttribute(a, estado.dic[k]);
  }));
  document.title = t('meta.titulo');
  $('meta[name="description"]').content = t('meta.descripcion');
}
async function cambiarIdioma(l, guardar = true) {
  estado.dic = await diccionario(l);
  const pintar = () => {
    estado.idioma = l;
    html.lang = l;
    aplicarDiccionario();
    $$('[data-idioma]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.idioma === l)));
    pintarProducto(false);
    pintarCarrito();
    actualizarMacroTexto();
  };
  if (guardar) { try { localStorage.setItem('idioma', l); } catch (e) {} }
  if (document.startViewTransition && !quieto && estado.idioma !== l && document.visibilityState === 'visible') document.startViewTransition(pintar);
  else pintar();
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
  if (visor) visor.setTema(nuevo === 'dark');
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { marcarTema(); if (visor) visor.setTema(temaActual() === 'dark'); });

/* ---------- Producto y opciones ---------- */
const prod = () => PRODUCTOS[estado.producto];
const opcion = (p, g, id) => p.grupos.find((x) => x.id === g).opciones.find((o) => o.id === id);
function precioDe(pid, sel = estado.sel[pid]) {
  const p = PRODUCTOS[pid];
  return p.precioBase + p.grupos.reduce((s, g) => s + opcion(p, g.id, sel[g.id]).precio, 0);
}
const nombreOp = (pid, g, id) => t(`op.${pid}.${g}.${id}`, id);
const nombreCorto = (pid, g, id) => { const n = nombreOp(pid, g, id).replace(/^Terciopelo /, '').replace(/ velvet$/, ''); return n.charAt(0).toUpperCase() + n.slice(1); };
const nombreGrupo = (pid, g) => t(`grupo.${pid}.${g}`, g);

function crearSwatches() {
  const p = prod();
  const pest = $('#pestanas');
  const cont = $('#grupos');
  pest.innerHTML = '';
  cont.innerHTML = '';
  if (!p.grupos.some((g) => g.id === estado.grupoActivo)) estado.grupoActivo = p.grupos[0].id;
  p.grupos.forEach((g, i) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.role = 'tab';
    tab.id = `tab-${g.id}`;
    tab.className = 'pestana';
    tab.dataset.grupo = g.id;
    tab.setAttribute('aria-controls', `grupo-${g.id}`);
    tab.innerHTML = `<span class="pestana__n">${String(i + 1).padStart(2, '0')}</span><span class="pestana__t"></span>`;
    pest.append(tab);

    const sec = document.createElement('div');
    sec.className = 'grupo';
    sec.id = `grupo-${g.id}`;
    sec.dataset.grupo = g.id;
    sec.setAttribute('role', 'tabpanel');
    sec.setAttribute('aria-labelledby', `tab-${g.id}`);
    sec.innerHTML = `<p class="grupo__cabeza" id="cab-${g.id}"><span class="grupo__nombre"></span><span class="grupo__elegido"></span></p>
      <div class="muestras" role="radiogroup" aria-labelledby="cab-${g.id}"></div>`;
    const lista = $('.muestras', sec);
    // Filas parejas: hasta 6 muestras en una fila; con 7 o más, dos filas casi iguales (sin una muestra huérfana).
    lista.style.setProperty('--cols', String(g.opciones.length <= 6 ? 6 : Math.ceil(g.opciones.length / 2)));
    g.opciones.forEach((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.role = 'radio';
      b.className = 'muestra';
      b.dataset.grupo = g.id;
      b.dataset.op = o.id;
      b.innerHTML = `<span class="muestra__disco"><svg class="muestra__tilde" viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10.4 3.2 3.1L15 6.6"/></svg></span>
        <span class="muestra__nombre"></span><span class="muestra__extra"></span>`;
      const disco = b.querySelector('.muestra__disco');
      disco.style.setProperty('--m1', o.muestra[0]);
      disco.style.setProperty('--m2', o.muestra[1]);
      lista.append(b);
    });
    cont.append(sec);
  });
}

function pintarProducto(animar = true) {
  const p = prod();
  const pid = p.id;
  $('#producto-nombre').textContent = t(`${pid}.nombre`);
  $('#producto-bajada').textContent = t(`${pid}.bajada`);
  $('#miga-cat').textContent = t(`miga.${pid}`);
  $('#medidas').textContent = t(`${pid}.medidas`);
  $('#lienzo').setAttribute('aria-label', t(`visor.aria.${pid}`));
  $$('.sp').forEach((b) => {
    const si = b.dataset.producto === pid;
    b.setAttribute('aria-checked', String(si));
    b.tabIndex = si ? 0 : -1;
  });
  $('#sp-silla').textContent = dinero(precioDe('silla'));
  $('#sp-sofa').textContent = dinero(precioDe('sofa'));
  p.grupos.forEach((g) => {
    const tab = $(`#tab-${g.id}`);
    $('.pestana__t', tab).textContent = nombreGrupo(pid, g.id);
    const activo = g.id === estado.grupoActivo;
    tab.setAttribute('aria-selected', String(activo));
    tab.tabIndex = activo ? 0 : -1;
    const sec = $(`#grupo-${g.id}`);
    sec.classList.toggle('activo', activo);
    $('.grupo__nombre', sec).textContent = nombreGrupo(pid, g.id);
    const elegida = opcion(p, g.id, estado.sel[pid][g.id]);
    $('.grupo__elegido', sec).textContent = nombreOp(pid, g.id, elegida.id) + (elegida.precio ? ` · +${dinero(elegida.precio)}` : '');
    $$('.muestra', sec).forEach((b) => {
      const o = opcion(p, g.id, b.dataset.op);
      const si = o.id === estado.sel[pid][g.id];
      b.setAttribute('aria-checked', String(si));
      b.tabIndex = si ? 0 : -1;
      $('.muestra__nombre', b).textContent = nombreCorto(pid, g.id, o.id);
      $('.muestra__extra', b).textContent = o.precio ? `+${dinero(o.precio)}` : t('op.incluido');
      b.setAttribute('aria-label', `${nombreOp(pid, g.id, o.id)}, ${o.precio ? `+${dinero(o.precio)}` : t('op.incluido')}`);
    });
  });
  const total = dinero(precioDe(pid));
  const cifra = $('#precio');
  if (cifra.textContent !== total) {
    cifra.textContent = total;
    if (animar && !quieto) { cifra.classList.remove('cambio'); void cifra.offsetWidth; cifra.classList.add('cambio'); }
  }
  $('#precio-movil').textContent = total;
  $('#resumen').textContent = `${t('resumen.tu')} ${p.grupos.map((g) => nombreOp(pid, g.id, estado.sel[pid][g.id])).join(' · ')}`;
  const img = $('#poster img');
  img.alt = t(`poster.${pid}`);
}

function seleccionar(gid, oid, { foco = false } = {}) {
  const p = prod();
  if (estado.sel[p.id][gid] === oid) return;
  estado.sel[p.id][gid] = oid;
  pintarProducto();
  if (foco) $(`#grupo-${gid} .muestra[data-op="${oid}"]`).focus();
  if (visor && visorListo) { visor.aplicar(gid, opcion(p, gid, oid), quieto); programarMiniatura(); }
  if (modoPoster) ponerPoster();
}

function activarGrupo(gid, foco = false) {
  estado.grupoActivo = gid;
  pintarProducto(false);
  if (foco) $(`#tab-${gid}`).focus();
}

document.addEventListener('click', (e) => {
  const m = e.target.closest('.muestra');
  if (m) return seleccionar(m.dataset.grupo, m.dataset.op);
  const tab = e.target.closest('.pestana');
  if (tab) return activarGrupo(tab.dataset.grupo);
  const sp = e.target.closest('.sp');
  if (sp) return cambiarProducto(sp.dataset.producto);
});

// Teclado: flechas dentro de cada grupo de radios y de las pestañas (foco itinerante).
document.addEventListener('keydown', (e) => {
  const claves = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Home: -99, End: 99 };
  if (!(e.key in claves)) return;
  const m = e.target.closest('.muestra, .pestana, .sp');
  if (!m) return;
  e.preventDefault();
  const hermanos = $$(m.classList.contains('muestra') ? '.muestra' : m.classList.contains('pestana') ? '.pestana' : '.sp', m.parentElement);
  let i = hermanos.indexOf(m) + claves[e.key];
  if (claves[e.key] === -99) i = 0;
  if (claves[e.key] === 99) i = hermanos.length - 1;
  i = (i + hermanos.length) % hermanos.length;
  const sig = hermanos[i];
  if (sig.classList.contains('muestra')) seleccionar(sig.dataset.grupo, sig.dataset.op, { foco: true });
  else if (sig.classList.contains('pestana')) activarGrupo(sig.dataset.grupo, true);
  else { cambiarProducto(sig.dataset.producto); sig.focus(); }
});

async function cambiarProducto(pid) {
  if (pid === estado.producto) return;
  estado.producto = pid;
  estado.macro = false;
  crearSwatches();
  pintarProducto(false);
  actualizarMacroTexto();
  ponerPoster();
  try { const u = new URL(location.href); u.searchParams.set('producto', pid); history.replaceState(null, '', u); } catch (e) {}
  if (visor && visorListo) {
    $('#visor').classList.remove('listo');
    if (!cargados.has(pid)) mostrarEstado(t(pid === 'sofa' ? 'estado.sofa' : 'estado.cargando'), 0.05);
    const pedido = pid;
    await visor.mostrar(PRODUCTOS[pid], seleccionesVisor(pid));
    cargados.add(pid);
    if (estado.producto !== pedido) return;
    $('#visor').classList.add('listo');
    ocultarEstado();
    if (!quieto) { visor.autoRotar(autoPedido); marcarAuto(autoPedido); }
    programarMiniatura();
  }
}

// La miniatura del selector y la del carrito muestran la tela, la madera y el metal elegidos, no la foto de catálogo.
function programarMiniatura() {
  clearTimeout(relojMini);
  relojMini = setTimeout(async () => {
    if (!visor || !visorListo) return;
    const pid = estado.producto;
    const url = await visor.instantanea(200, 150);
    if (!url || pid !== estado.producto) { if (url) URL.revokeObjectURL(url); return; }
    const img = $(`.sp[data-producto="${pid}"] img`);
    const vieja = miniaturas[pid];
    miniaturas[pid] = url;
    if (img) img.src = url;
    if (vieja && !estado.carrito.some((it) => it.mini === vieja)) URL.revokeObjectURL(vieja);
  }, 420);
}

function seleccionesVisor(pid) {
  const p = PRODUCTOS[pid];
  return Object.fromEntries(p.grupos.map((g) => [g.id, opcion(p, g.id, estado.sel[pid][g.id])]));
}

/* ---------- Póster (sin WebGL, ?poster=1) ---------- */
function ponerPoster() {
  const pid = estado.producto;
  const fuente = $('#poster source');
  const img = $('#poster img');
  fuente.srcset = `img/poster-${pid}-800.webp 800w, img/poster-${pid}-1600.webp 1600w`;
  img.src = `img/poster-${pid}-1600.webp`;
}

/* ---------- Carrito con micro-animación ---------- */
function pintarCarrito() {
  const n = estado.carrito.length;
  $('#carrito-n').textContent = String(n);
  $('#carrito').classList.toggle('lleno', n > 0);
  $('#carrito').setAttribute('aria-label', n === 1 ? t('carrito.aria1') : t('carrito.ariaN').replace('{n}', n));
  const lista = $('#cajon-lista');
  lista.innerHTML = '';
  estado.carrito.forEach((it, i) => {
    const li = document.createElement('li');
    li.className = 'item';
    const p = PRODUCTOS[it.pid];
    li.innerHTML = `<img src="${it.mini || `img/poster-${it.pid}-200.webp`}" width="100" height="75" alt=""><div class="item__txt"><p class="item__nombre"></p><p class="item__conf"></p></div><p class="item__precio"></p><button type="button" class="item__quitar" data-i="${i}"></button>`;
    $('.item__nombre', li).textContent = t(`${it.pid}.nombre`);
    $('.item__conf', li).textContent = p.grupos.map((g) => nombreOp(it.pid, g.id, it.sel[g.id])).join(' · ');
    $('.item__precio', li).textContent = dinero(precioDe(it.pid, it.sel));
    $('.item__quitar', li).textContent = t('cajon.quitar');
    lista.append(li);
  });
  $('#cajon-vacio').hidden = n > 0;
  $('#cajon-total').textContent = dinero(estado.carrito.reduce((s, it) => s + precioDe(it.pid, it.sel), 0));
}

$('#cajon-lista').addEventListener('click', (e) => {
  const b = e.target.closest('.item__quitar');
  if (!b) return;
  estado.carrito.splice(Number(b.dataset.i), 1);
  pintarCarrito();
  $('#cajon-cerrar').focus();
});

let tCta = 0;
$('#cta').addEventListener('click', () => {
  const pid = estado.producto;
  estado.carrito.push({ pid, sel: { ...estado.sel[pid] }, mini: miniaturas[pid] || null });
  const p = prod();
  const nombre = t(`${pid}.nombre`);
  const conf = p.grupos.map((g) => nombreOp(pid, g.id, estado.sel[pid][g.id])).join(', ');
  const destino = $('#carrito');
  const origen = $('#cta');
  const fin = () => {
    pintarCarrito();
    if (!quieto) { destino.classList.remove('pulso'); void destino.offsetWidth; destino.classList.add('pulso'); }
  };
  if (!quieto && destino.getBoundingClientRect().width) {
    const a = origen.getBoundingClientRect();
    const b = destino.getBoundingClientRect();
    const v = $('#vuelo');
    const tela = opcion(p, 'tela', estado.sel[pid].tela).muestra;
    v.style.setProperty('--m1', tela[0]);
    v.style.setProperty('--m2', tela[1]);
    const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2;
    const x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
    const cx = (x0 + x1) / 2, cy = Math.min(y0, y1) - 120;
    const marcos = [];
    for (let i = 0; i <= 12; i++) {
      const k = i / 12;
      const x = (1 - k) * (1 - k) * x0 + 2 * (1 - k) * k * cx + k * k * x1;
      const y = (1 - k) * (1 - k) * y0 + 2 * (1 - k) * k * cy + k * k * y1;
      marcos.push({ transform: `translate(${x - 14}px, ${y - 14}px) scale(${1 - 0.55 * k})`, opacity: k > 0.92 ? 0 : 1 });
    }
    v.hidden = false;
    v.animate(marcos, { duration: 620, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards' }).finished.then(() => { v.hidden = true; fin(); });
  } else fin();
  origen.classList.add('hecho');
  $('#cta-texto').textContent = t('cta.agregado');
  clearTimeout(tCta);
  tCta = setTimeout(() => { origen.classList.remove('hecho'); $('#cta-texto').textContent = t('cta.agregar'); }, 1800);
  const n = estado.carrito.length;
  $('#anuncio').textContent = t('anuncio.agregado').replace('{p}', nombre).replace('{c}', conf).replace('{n}', n);
});

const cajon = $('#panel-carrito');
$('#carrito').addEventListener('click', () => { pintarCarrito(); cajon.showModal(); });
$('#cajon-cerrar').addEventListener('click', () => cajon.close());
cajon.addEventListener('click', (e) => { if (e.target === cajon) cajon.close(); });
cajon.addEventListener('close', () => $('#carrito').focus());

/* ---------- Visor ---------- */
let autoPedido = !quieto;
function marcarAuto(si) {
  const b = $('#ctl-auto');
  b.setAttribute('aria-pressed', String(si));
  b.setAttribute('aria-label', si ? t('controles.pausar') : t('controles.girar'));
}
function mostrarEstado(texto, k) {
  const e = $('#estado');
  e.hidden = false;
  $('#estado-texto').textContent = texto;
  $('#estado-barra').style.transform = `scaleX(${k})`;
}
function ocultarEstado() { $('#estado').hidden = true; }
function actualizarMacroTexto() {
  $('#ctl-macro').setAttribute('aria-pressed', String(estado.macro));
  $('#ctl-macro-texto').textContent = estado.macro ? t('macro.volver') : t('macro.ver');
  $('#macro-nota').hidden = !estado.macro;
  $('#visor').classList.toggle('en-macro', estado.macro);
}

function hayWebGL() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; }
}

async function iniciarVisor() {
  const visorEl = $('#visor');
  const lienzo = $('#lienzo');
  mostrarEstado(t('estado.cargando'), 0.04);
  const { crearVisor } = await import('./visor.js');
  const progreso = {};
  visor = await crearVisor({
    lienzo,
    pixelRatioMax: 2,
    alProgreso: (id, k) => { progreso[id] = k; if (id === estado.producto) mostrarEstado(`${t(id === 'sofa' ? 'estado.sofa' : 'estado.cargando')} ${Math.round(k * 100)} %`, 0.1 + k * 0.85); },
    alCambio: (c) => { if ('auto' in c) { if (c.porUsuario) autoPedido = false; marcarAuto(c.auto); } },
  });
  visor.setTema(temaActual() === 'dark');
  const tam = () => { const r = visorEl.getBoundingClientRect(); visor.redimensionar(Math.round(r.width), Math.round(r.height)); };
  tam();
  new ResizeObserver(tam).observe(visorEl);
  mostrarEstado(t('estado.luz'), 0.96);
  await visor.mostrar(prod(), seleccionesVisor(estado.producto));
  visorListo = true;
  cargados.add(estado.producto);
  if (PRODUCTOS[estado.producto].grupos.some((g) => estado.sel[estado.producto][g.id] !== g.opciones[0].id)) programarMiniatura();
  if (params.get('macro') === '1') { estado.macro = true; visor.macro(true); visor.saltar(); actualizarMacroTexto(); }
  visorEl.classList.add('listo');
  ocultarEstado();
  window.__primerRender = performance.now();
  document.dispatchEvent(new CustomEvent('visor-listo'));
  if (!quieto && !modoRender && !estado.macro) visor.autoRotar(true);
  marcarAuto(!quieto && !modoRender && !estado.macro);

  // Pausa cuando no se ve (otra pestaña o fuera de pantalla).
  let visible = true;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; visor.pausar(!visible || document.hidden); }).observe(visorEl);
  document.addEventListener('visibilitychange', () => visor.pausar(!visible || document.hidden));

  const paso = Math.PI / 6;
  $('#ctl-auto').addEventListener('click', () => {
    const si = $('#ctl-auto').getAttribute('aria-pressed') !== 'true';
    autoPedido = si;
    if (si && estado.macro) { estado.macro = false; visor.macro(false); actualizarMacroTexto(); }
    visor.autoRotar(si);
    marcarAuto(si);
  });
  $('#ctl-izq').addEventListener('click', () => visor.girar(-paso));
  $('#ctl-der').addEventListener('click', () => visor.girar(paso));
  $('#ctl-mas').addEventListener('click', () => visor.zoom(0.82));
  $('#ctl-menos').addEventListener('click', () => visor.zoom(1.22));
  $('#ctl-macro').addEventListener('click', () => {
    estado.macro = !estado.macro;
    visor.macro(estado.macro);
    if (quieto) visor.saltar();
    if (!estado.macro && autoPedido && !quieto) { visor.autoRotar(true); marcarAuto(true); }
    actualizarMacroTexto();
  });
  lienzo.addEventListener('keydown', (e) => {
    const acc = { ArrowLeft: () => visor.girar(-paso / 2), ArrowRight: () => visor.girar(paso / 2), ArrowUp: () => visor.inclinar(-0.08), ArrowDown: () => visor.inclinar(0.08), '+': () => visor.zoom(0.85), '=': () => visor.zoom(0.85), '-': () => visor.zoom(1.18) }[e.key];
    if (acc) { e.preventDefault(); acc(); }
  });
  lienzo.addEventListener('pointerdown', () => $('#pista').classList.add('oculta'), { once: true });

  if (modoRender) {
    document.body.classList.add('render');
    tam();
    visor.saltar();
    visor.renderFijo();
    requestAnimationFrame(() => requestAnimationFrame(() => { visor.renderFijo(); document.title = 'render-listo'; }));
  }
  if (medir) medicion();
  window.__visor = visor;
}

// fps al girar (5 s de giro automático) y cuadros dibujados en reposo (5 s quieto).
function medicion() {
  const el = $('#medicion');
  el.hidden = false;
  el.textContent = 'midiendo…';
  visor.autoRotar(true);
  setTimeout(() => {
    let n = 0, peor = 0;
    const t0 = performance.now();
    let prev = t0;
    const c0 = visor.estado().cuadros;
    const cuenta = (ahora) => {
      n++; peor = Math.max(peor, ahora - prev); prev = ahora;
      if (ahora - t0 < 5000) return requestAnimationFrame(cuenta);
      const dib = visor.estado().cuadros - c0;
      const fps = dib / ((ahora - t0) / 1000);
      visor.autoRotar(false);
      setTimeout(() => {
        const r0 = visor.estado().cuadros;
        setTimeout(() => {
          const reposo = (visor.estado().cuadros - r0) / 5;
          el.textContent = `girando ${fps.toFixed(1)} fps · peor ${peor.toFixed(1)} ms · reposo ${reposo.toFixed(1)} cuadros/s · ${innerWidth}×${innerHeight} @${visor.estado().pr}`;
          document.title = 'medicion ' + el.textContent;
          console.log('MEDICION', el.textContent);
        }, 5000);
      }, 1500);
    };
    requestAnimationFrame(cuenta);
  }, 1500);
}

/* ---------- Celular: el 3D arranca al primer toque ---------- */
function esperarToque() {
  ocultarEstado();
  const visorEl = $('#visor');
  const pista = $('#pista');
  const rotular = (k) => { pista.dataset.i18n = k; pista.textContent = t(k); };
  rotular('visor.tocar');
  visorEl.classList.add('en-espera');
  const ir = async (e) => {
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    visorEl.removeEventListener('pointerdown', ir);
    visorEl.removeEventListener('keydown', ir);
    visorEl.classList.remove('en-espera');
    rotular('visor.pista');
    try { await iniciarVisor(); } catch (err) { console.error('visor', err); document.body.classList.add('modo-poster'); ocultarEstado(); }
  };
  visorEl.addEventListener('pointerdown', ir);
  visorEl.addEventListener('keydown', ir);
}

/* ---------- Móvil: la hoja inferior se compacta fuera de la ficha ---------- */
function hojaMovil() {
  // Compacta cuando el final del panel ya pasó por arriba de la pantalla (no cuando todavía está abajo).
  new IntersectionObserver(([en]) => document.body.classList.toggle('fuera-ficha', !en.isIntersecting && en.boundingClientRect.top < 0)).observe($('.panel__aviso'));
}

/* ---------- Arranque ---------- */
async function arrancar() {
  if (quieto) html.classList.add('quieto');
  if (modoPoster) document.body.classList.add('modo-poster');
  marcarTema();
  crearSwatches();
  const l = idiomaInicial();
  estado.dic = await diccionario(l).catch(() => ({}));
  if (l !== 'es') await cambiarIdioma(l, false);
  else { estado.idioma = 'es'; pintarProducto(false); pintarCarrito(); actualizarMacroTexto(); }
  $$('[data-idioma]').forEach((b) => b.addEventListener('click', () => cambiarIdioma(b.dataset.idioma)));
  if (estado.producto !== 'silla') ponerPoster();
  hojaMovil();
  const conexion = navigator.connection || {};
  if (!modoPoster && hayWebGL() && !conexion.saveData && diferir3d) {
    esperarToque();
  } else if (!modoPoster && hayWebGL() && !conexion.saveData) {
    try { await iniciarVisor(); } catch (e) { console.error('visor', e); document.body.classList.add('modo-poster'); ocultarEstado(); }
  } else {
    document.body.classList.add('modo-poster');
    ocultarEstado();
  }
}
arrancar();

/* ---------- Entrada de los titulares de sección ---------- */
(function montarRevelado() {
  if (!html.classList.contains('js-mov')) return;
  const els = $$('.seccion .folio, .seccion .titulo, .seccion .intro, .seccion .subtitulo, .proceso h3');
  els.forEach((el) => el.setAttribute('data-corte', ''));
  const io = new IntersectionObserver((entradas) => entradas.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add('visto'); io.unobserve(en.target); }
  }), { rootMargin: '0px 0px -12% 0px' });
  els.forEach((el) => io.observe(el));
})();
