// Interfaz del asistente de Ámbar (marca ficticia): chat, panel «Qué pasó por dentro», resumen para el equipo,
// catálogo, métricas de la sesión y pruebas. El motor (motor.js) no toca el DOM.
import { crearMotor, REGLAS, NOMBRE_TEMA } from './motor.js';
import { correrPruebas, PRUEBAS } from './pruebas.js';

const params = new URLSearchParams(location.search);
const html = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const quieto = params.get('quieto') === '1' || reduce;
if (!quieto && 'IntersectionObserver' in window) document.documentElement.classList.add('js-mov');
if (params.get('quieto') === '1') html.classList.add('quieto');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const estado = { idioma: 'es', dic: null, turnos: [], resultados: [], ver: -1, personas: [] };
const dics = {};
let motor = null;

/* ---------- Texto ---------- */
const t = (k, vars = {}) => {
  let s = estado.dic && estado.dic[k] != null ? estado.dic[k] : k;
  for (const [a, b] of Object.entries(vars)) s = s.split(`{${a}}`).join(b);
  return s;
};
const num = (n, d = 2) => new Intl.NumberFormat(estado.idioma === 'es' ? 'es-AR' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const dinero = (n) => `US$ ${new Intl.NumberFormat(estado.idioma === 'es' ? 'es-AR' : 'en-US').format(n)}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

async function diccionario(l) {
  if (!dics[l]) dics[l] = await fetch(`i18n/${l}.json`).then((r) => r.json());
  return dics[l];
}
function aplicarDiccionario() {
  $$('[data-i18n]').forEach((e) => { const v = estado.dic[e.dataset.i18n]; if (v != null) e.textContent = v; });
  $$('[data-i18n-attr]').forEach((e) => e.dataset.i18nAttr.split(';').forEach((par) => {
    const [a, k] = par.split('=').map((s) => s.trim());
    if (estado.dic[k] != null) e.setAttribute(a, estado.dic[k]);
  }));
  document.title = t('meta.titulo');
  $('meta[name="description"]').content = t('meta.descripcion');
}
async function cambiarIdioma(l, guardar = true) {
  estado.dic = await diccionario(l);
  const dibujar = () => {
    estado.idioma = l;
    html.lang = l;
    aplicarDiccionario();
    $$('[data-idioma]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.idioma === l)));
    if (motor) { dibujarCatalogo(); reconstruir(); dibujarReglas(); if (ultimaPrueba) dibujarPruebas(ultimaPrueba); }
  };
  if (guardar) { try { localStorage.setItem('idioma', l); } catch (e) {} }
  if (document.startViewTransition && !quieto && estado.idioma !== l && document.visibilityState === 'visible') document.startViewTransition(dibujar);
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

/* ---------- Conversación ---------- */
// Un turno es lo que escribió el cliente (o eligió en una aclaración). Al cambiar de idioma se vuelven a correr todos.
function correrTurnos() {
  const res = [];
  let ctx = {};
  for (const tu of estado.turnos) {
    if (tu.tipo === 'persona') { res.push({ persona: true, tu }); continue; }
    const c = { ...ctx };
    if (tu.forzar) c.forzar = [tu.forzar];
    const r = motor.responder(tu.q, { idioma: estado.idioma, contexto: c });
    res.push(r);
    ctx = { ultimo: r.ultimo, pendiente: r.pendiente || (tu.forzar ? null : ctx.pendiente && r.regla === 'R2' ? ctx.pendiente : null), candidatos: r.opciones ? r.opciones.map((o) => o.id).filter(Boolean) : null };
  }
  estado.resultados = res;
}
function preguntar(q, forzar = null, mostrar = null) {
  q = String(q || '').trim().slice(0, 240);
  if (!q) return;
  const antes = estado.resultados.length;
  estado.turnos.push({ q, forzar, mostrar });
  correrTurnos();
  const r = estado.resultados[estado.resultados.length - 1];
  if (r.regla === 'R4') estado.turnos.push({ tipo: 'persona', motivo: q }), correrTurnos();
  dibujarLog(antes);
  verTurno(indiceUltimaRespuesta());
  dibujarMedidas();
  $('#anuncio').textContent = t('anuncio.respuesta', { r: t('regla.' + r.regla) });
  if (window.innerWidth < 1024 && !$('#asistente').classList.contains('ver-traza')) $('#vista-punto').classList.add('nuevo');
}
function persona() {
  const antes = estado.resultados.length;
  estado.turnos.push({ tipo: 'persona', boton: true });
  correrTurnos();
  dibujarLog(antes);
  dibujarMedidas();
}
const indiceUltimaRespuesta = () => { for (let i = estado.resultados.length - 1; i >= 0; i--) if (!estado.resultados[i].persona) return i; return -1; };
const respuestas = () => estado.resultados.map((r, i) => ({ r, i })).filter((x) => !x.r.persona);

function reconstruir() {
  correrTurnos();
  dibujarLog(0, true);
  if (estado.ver >= 0) verTurno(estado.ver, true);
  else dibujarTrazaVacia();
  dibujarMedidas();
}

function dibujarLog(desde = 0, todo = false) {
  const log = $('#log');
  if (todo || desde === 0) {
    log.innerHTML = '';
    const b = el('li', 'msg msg--asistente msg--bienvenida');
    b.append(el('p', 'msg__p', t('chat.bienvenida')));
    // Dos fichas del catálogo con su foto de estudio: el cliente ve de qué tienda es antes de preguntar.
    const vitrina = el('div', 'vitrina');
    for (const p of motor.productos.filter((x) => x.configurador)) {
      const f = el('button', 'vitrina__item');
      f.type = 'button';
      f.dataset.ficha = p.id;
      const img = el('img', 'vitrina__img');
      img.src = `../configurador/img/poster-${p.configurador}-800.webp`;
      img.width = 800; img.height = 600; img.decoding = 'async'; img.alt = '';
      f.append(img, el('span', 'vitrina__n', p.nombre[estado.idioma]), el('span', 'vitrina__p', `${t('catalogo.desde')} ${dinero(p.precio.desde)}`));
      f.setAttribute('aria-label', `${p.nombre[estado.idioma]}, ${t('catalogo.desde')} ${dinero(p.precio.desde)}. ${t('catalogo.ver')}`);
      f.addEventListener('click', () => abrirFicha(p.id));
      vitrina.append(f);
    }
    b.append(vitrina);
    log.append(b);
  }
  for (let i = desde; i < estado.resultados.length; i++) {
    const r = estado.resultados[i];
    const tu = estado.turnos[i];
    if (r.persona) {
      if (tu.boton) log.append(burbujaCliente(t('persona.cliente'), !todo));
      log.append(mensajePersona(i, !todo));
      continue;
    }
    log.append(burbujaCliente(tu.mostrar ? nombreDe(tu.forzar) : tu.q, !todo));
    log.append(mensajeAsistente(r, i, !todo));
  }
  $('#chat').classList.toggle('con-charla', estado.turnos.length > 0);
  $$('.sug').forEach((b) => b.classList.toggle('usada', estado.turnos.some((tu) => tu.q === t('sug.' + b.dataset.sug))));
  requestAnimationFrame(() => {
    // La pregunta nueva queda arriba del área visible: la respuesta se lee desde el principio.
    const clientes = $$('.msg--cliente', log);
    const ultimo = clientes[clientes.length - 1];
    if (ultimo) log.scrollTop = Math.max(0, ultimo.offsetTop - 12);
  });
}
const nombreDe = (id) => (motor.ficha(id) ? motor.ficha(id).nombre[estado.idioma] : id);
function burbujaCliente(texto, animar) {
  const li = el('li', 'msg msg--cliente' + (animar && !quieto ? ' msg--entra' : ''));
  li.append(el('span', 'sr', t('chat.vos') + ': '));
  li.append(document.createTextNode(texto));
  return li;
}
function textoConCitas(texto, r) {
  const frag = document.createDocumentFragment();
  const partes = texto.split(/(⟦\d+⟧)/);
  for (const p of partes) {
    const m = p.match(/^⟦(\d+)⟧$/);
    if (m) {
      const c = r.citas[+m[1] - 1];
      const b = el('button', 'cita', m[1]);
      b.type = 'button';
      b.setAttribute('aria-label', t('msg.fuente', { n: m[1], d: `${c.nombre} · ${c.etiqueta}` }));
      b.title = `${c.nombre} · ${c.etiqueta}`;
      b.addEventListener('click', () => abrirFicha(c.doc, c.id));
      frag.append(b);
    } else if (p) frag.append(document.createTextNode(p.replace(/\s+$/, (x) => (x.length ? ' ' : ''))));
  }
  return frag;
}
function mensajeAsistente(r, i, animar) {
  const li = el('li', 'msg msg--asistente' + (animar && !quieto ? ' msg--entra' : ''));
  li.dataset.turno = i;
  let lista = null;
  r.parrafos.forEach((p, k) => {
    if (p.startsWith('• ')) {
      if (!lista) { lista = el('ul', 'msg__lista'); li.append(lista); }
      const it = el('li');
      it.append(textoConCitas(p.slice(2), r));
      lista.append(it);
    } else {
      lista = null;
      const e = el('p', 'msg__p');
      e.append(textoConCitas(p, r));
      li.append(e);
      if (k === 0 && r.tabla) li.append(tablaComparar(r));
    }
  });
  if (r.opciones) {
    const box = el('div', 'msg__opciones');
    const respondida = i < estado.resultados.length - 1;
    for (const o of r.opciones) {
      const b = el('button', 'opcion');
      b.type = 'button';
      b.append(el('span', 'opcion__n', o.etiqueta));
      if (o.detalle) b.append(el('span', 'opcion__d', o.detalle));
      if (respondida) b.disabled = true;
      b.addEventListener('click', () => {
        if (o.id) preguntar(r.consulta, o.id, true);
        else preguntar(o.etiqueta);
      });
      box.append(b);
    }
    li.append(box);
  }
  if (r.acciones && r.acciones.length && r.regla !== 'R4') {
    const box = el('div', 'msg__acciones');
    if (r.acciones.includes('persona')) { const b = el('button', 'boton boton--borde', t('msg.persona')); b.type = 'button'; b.addEventListener('click', persona); box.append(b); }
    if (r.acciones.includes('catalogo')) { const a = el('a', 'boton boton--borde', t('msg.catalogo')); a.href = '#catalogo'; box.append(a); }
    li.append(box);
  }
  if (r.citas.length) {
    const f = el('div', 'fuentes');
    if (r.citas.length > 4) {
      const det = el('details', 'fuentes__plegadas');
      det.append(el('summary', null, t('msg.fuentes', { n: r.citas.length })));
      det.append(f);
      li.append(det);
    }
    r.citas.forEach((c, k) => {
      const b = el('button');
      b.type = 'button';
      b.append(el('span', 'fuentes__n', String(k + 1)));
      const d = el('span', 'fuentes__d');
      d.innerHTML = `<b>${esc(c.nombre)}</b> · ${esc(c.etiqueta)}`;
      b.append(d);
      b.addEventListener('click', () => abrirFicha(c.doc, c.id));
      f.append(b);
    });
    if (r.citas.length <= 4) li.append(f);
  }
  const pie = el('p', 'msg__pie');
  const rg = el('span', 'msg__regla');
  rg.innerHTML = `${esc(t('msg.regla'))} <b>${r.regla}</b> · ${esc(t('regla.' + r.regla))}`;
  pie.append(rg);
  const v = el('button', 'msg__dentro', t('msg.dentro'));
  v.type = 'button';
  v.addEventListener('click', () => { verTurno(i); if (window.innerWidth < 1024) cambiarVista('traza'); });
  pie.append(v);
  li.append(pie);
  return li;
}
function tablaComparar(r) {
  const box = el('div', 'msg__tabla');
  const tb = el('table');
  const th = el('thead');
  const tr = el('tr');
  tr.append(el('th', null, ''));
  r.tabla.columnas.forEach((c) => { const h = el('th', null, c); h.scope = 'col'; tr.append(h); });
  th.append(tr);
  tb.append(th);
  const bd = el('tbody');
  for (const f of r.tabla.filas) {
    const fr = el('tr');
    const h = el('th', null, f.campo);
    h.scope = 'row';
    fr.append(h);
    for (const c of f.celdas) { const td = el('td'); td.append(textoConCitas(`${c.v} ${c.cita}`, r)); fr.append(td); }
    bd.append(fr);
  }
  tb.append(bd);
  box.append(tb);
  return box;
}

/* ---------- Resumen para una persona ---------- */
function armarResumen(hasta) {
  const prev = estado.resultados.slice(0, hasta).filter((r) => !r.persona);
  const tu = estado.turnos[hasta];
  const l = estado.idioma;
  const productos = [...new Set(prev.flatMap((r) => r.seleccion))].map(nombreDe);
  const respondido = prev.filter((r) => ['R1', 'R5'].includes(r.regla)).map((r) => `${r.consulta} → ${r.citas[0].nombre} · ${r.citas[0].etiqueta}${r.citas.length > 1 ? ` (+${r.citas.length - 1})` : ''}`);
  const sin = prev.filter((r) => r.regla === 'R3' || r.regla === 'R2' || r.sinDato.length).map((r) => `${r.consulta} → ${r.regla === 'R2' ? t('resumen.aclarar') : `${t('resumen.noesta')}${r.sinDato.length ? ` (${r.sinDato.join(', ')})` : ''}`}`);
  const posventa = prev.some((r) => r.regla === 'R4' && /pedido|reclam|rot|order|broken|damag|complain|factura|invoice/i.test(r.consulta));
  const faltantes = [...new Set(prev.flatMap((r) => r.sinDato))];
  const motivo = tu.boton ? t('resumen.motivo.boton') : t('resumen.motivo.consulta', { q: tu.motivo });
  let siguiente = t('siguiente.nada');
  if (posventa) siguiente = t('siguiente.posventa');
  else if (faltantes.length) siguiente = t('siguiente.sin', { x: faltantes.join(', ') });
  else if (productos.length) siguiente = t('siguiente.venta', { p: productos[productos.length - 1] });
  return { motivo, productos, respondido, sin, siguiente, l, salida: { canal: 'chat_web_demo', motivo: tu.boton ? 'boton_persona' : 'consulta', productos: [...new Set(prev.flatMap((r) => r.seleccion))], respondidas_con_cita: respondido.length, sin_respuesta: sin.length, faltantes, siguiente_paso: siguiente } };
}
function mensajePersona(i, animar) {
  const li = el('li', 'msg msg--asistente' + (animar && !quieto ? ' msg--entra' : ''));
  li.append(el('p', 'msg__p', t('persona.msg')));
  const s = armarResumen(i);
  const box = el('div', 'resumen');
  const cab = el('div', 'resumen__cabeza');
  cab.append(el('p', 'resumen__t', t('resumen.titulo')));
  const cp = el('button', 'boton boton--borde resumen__copiar', t('resumen.copiar'));
  cp.type = 'button';
  cab.append(cp);
  box.append(cab);
  const dl = el('dl');
  const fila = (k, v) => {
    const d = el('div');
    d.append(el('dt', null, t(k)));
    const dd = el('dd');
    if (Array.isArray(v)) {
      if (!v.length) dd.textContent = t('resumen.ninguno');
      else { const ul = el('ul'); v.forEach((x) => ul.append(el('li', null, x))); dd.append(ul); }
    } else dd.textContent = v;
    d.append(dd);
    dl.append(d);
  };
  fila('resumen.motivo', s.motivo);
  fila('resumen.productos', s.productos.length ? s.productos.join(', ') : t('resumen.ninguno'));
  fila('resumen.respondido', s.respondido);
  fila('resumen.sin', s.sin);
  fila('resumen.siguiente', s.siguiente);
  box.append(dl);
  box.append(el('p', 'resumen__nota', t('resumen.nota')));
  cp.addEventListener('click', async () => {
    const txt = [`${t('resumen.titulo')}`, `${t('resumen.motivo')}: ${s.motivo}`, `${t('resumen.productos')}: ${s.productos.join(', ') || t('resumen.ninguno')}`, `${t('resumen.respondido')}:`, ...s.respondido.map((x) => `- ${x}`), `${t('resumen.sin')}:`, ...s.sin.map((x) => `- ${x}`), `${t('resumen.siguiente')}: ${s.siguiente}`].join('\n');
    try { await navigator.clipboard.writeText(txt); cp.textContent = t('resumen.copiado'); setTimeout(() => { cp.textContent = t('resumen.copiar'); }, 1600); } catch (e) {}
  });
  li.append(box);
  return li;
}

/* ---------- Panel «Qué pasó por dentro» ---------- */
function dibujarReglas() {
  const ol = $('#traza-reglas');
  if (!ol) return;
  ol.innerHTML = '';
  const cab = el('li', null);
  cab.append(el('p', 'paso__t', t('traza.reglas')));
  ol.append(cab);
  for (const id of Object.keys(REGLAS)) {
    const li = el('li', 'regla');
    li.append(el('span', 'regla__id', id));
    li.append(el('span', 'regla__n', t('regla.' + id)));
    ol.append(li);
  }
}
function dibujarTrazaVacia() {
  $('#traza-turno').textContent = '—';
  $('#traza-ant').disabled = true;
  $('#traza-sig').disabled = true;
}
function verTurno(i, sinAnimar = false) {
  const lista = respuestas();
  if (!lista.length || i < 0) { dibujarTrazaVacia(); return; }
  estado.ver = i;
  const pos = lista.findIndex((x) => x.i === i);
  const r = estado.resultados[i];
  $('#traza-turno').textContent = t('traza.turno', { n: pos + 1, t: lista.length });
  $('#traza-ant').disabled = pos <= 0;
  $('#traza-sig').disabled = pos >= lista.length - 1;
  $$('.msg--asistente').forEach((m) => m.classList.toggle('activo', +m.dataset.turno === i));
  const cuerpo = $('#traza-cuerpo');
  cuerpo.innerHTML = '';
  const ol = el('ol', 'pasos');
  ol.setAttribute('role', 'list');
  const paso = (clave) => { const li = el('li', 'paso' + (sinAnimar || quieto ? '' : ' paso--entra')); li.append(el('h3', 'paso__t', t(clave))); ol.append(li); return li; };

  // 1 Consulta
  const p1 = paso('paso.consulta');
  p1.append(el('p', 'paso__q', `«${r.consulta}»`));
  const ts = el('div', 'terminos');
  let vacias = 0;
  const vistos = new Set();
  const deLaIntencion = new Set(r.intencion ? r.intencion.por : []);
  for (const x0 of r.terminos) {
    if (x0.tipo === 'vacia') { vacias++; continue; }
    if (x0.tipo === 'numero') continue;
    // Una palabra que pertenece a otra intención (el «hay» de «qué diferencia hay») no se rotula como intención.
    const x = x0.tipo === 'intencion' && !deLaIntencion.has(x0.palabra) ? { ...x0, tipo: 'contenido' } : x0;
    const clave = `${x.palabra}|${x.tipo}|${x.corregida || ''}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const s = el('span', `termino termino--${x.tipo}`);
    s.append(document.createTextNode(x.palabra));
    const etq = x.corregida ? `${t('tipo.corregida')} ${x.corregida}` : t('tipo.' + x.tipo);
    if (!['contenido'].includes(x.tipo) || x.corregida) s.append(el('small', null, etq));
    ts.append(s);
  }
  for (const x of r.terminos.filter((y) => y.tipo === 'numero')) { const s = el('span', 'termino', x.palabra); ts.append(s); }
  p1.append(ts);
  if (vacias) p1.append(el('p', 'recup__nota', t('traza.vacias', { n: vacias })));
  const di = el('p', 'paso__dato');
  di.innerHTML = r.intencion
    ? `${esc(t('traza.intencion'))} <b>${esc(NOMBRE_TEMA[estado.idioma][r.intencion.id] || r.intencion.id)}</b>${r.intencion.por.length ? ` ${esc(t('traza.por'))} «${esc(r.intencion.por.join(', '))}»` : ''}`
    : esc(t('traza.sinintencion'));
  p1.append(di);
  const dp = el('p', 'paso__dato');
  dp.innerHTML = `${esc(t('traza.productos'))} <b>${r.seleccion.length ? esc(r.seleccion.map(nombreDe).join(', ')) : esc(t('traza.ningun'))}</b>${r.via ? ` · ${esc(t('via.' + r.via))}` : ''}`;
  p1.append(dp);

  // 2 Recuperación
  const p2 = paso('paso.recuperacion');
  p2.append(el('p', 'paso__dato', t('traza.bm25', { n: r.indice.fragmentos, v: r.indice.terminos })));
  if (r.recuperados.length) {
    const ul = el('ol', 'recup');
    ul.setAttribute('role', 'list');
    const lista = [...r.recuperados].sort((a, b) => b.total - a.total);
    const mostrar = lista.slice(0, 8);
    const max = Math.max(...lista.map((x) => x.total), 1);
    for (const x of mostrar) {
      const li = el('li', x.usado ? 'usado' : '');
      li.title = t('traza.detalle', { b: num(x.base), c: num(x.bonoCampo, 1), p: num(x.bonoProducto, 1) });
      const n = el('span', 'recup__n');
      n.innerHTML = `<b>${esc(x.nombre)}</b> · ${esc(x.etiqueta)}`;
      const barra = el('span', 'recup__barra');
      const sp = el('span');
      sp.style.setProperty('--v', sinAnimar || quieto ? (x.total / max).toFixed(3) : '0');
      barra.append(sp);
      barra.setAttribute('aria-hidden', 'true');
      const v = el('span', 'recup__v', x.total ? num(x.total) : '—');
      li.append(n, barra, v);
      ul.append(li);
      if (!(sinAnimar || quieto)) requestAnimationFrame(() => requestAnimationFrame(() => sp.style.setProperty('--v', (x.total / max).toFixed(3))));
    }
    p2.append(ul);
    if (lista.length > mostrar.length) p2.append(el('p', 'recup__nota', t('traza.mas', { n: lista.length - mostrar.length })));
    p2.append(el('p', 'recup__nota', t('traza.bonos')));
  } else p2.append(el('p', 'paso__dato', t('traza.sinrecup')));

  // 3 Regla
  const p3 = paso('paso.regla');
  const rg = el('ol', 'traza__reglas');
  rg.setAttribute('role', 'list');
  rg.style.marginTop = '8px';
  for (const id of Object.keys(REGLAS)) {
    const li = el('li', 'regla' + (id === r.regla ? ' activa' : ''));
    li.append(el('span', 'regla__id', id));
    li.append(el('span', 'regla__n', t('regla.' + id)));
    if (id === r.regla) li.setAttribute('aria-current', 'true');
    rg.append(li);
  }
  p3.append(rg);
  p3.append(el('p', 'paso__dato', r.porque));

  // 4 Verificación
  const p4 = paso('paso.verificacion');
  const v = r.verificacion;
  const vb = el('p', 'verif' + (v.ok ? '' : ' verif--mal'));
  vb.innerHTML = `<span class="verif__ok" aria-hidden="true"><svg viewBox="0 0 16 16">${v.ok ? '<path d="m3.5 8.4 2.9 2.8 6-6.4"/>' : '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>'}</svg></span><span></span>`;
  vb.lastChild.textContent = !v.ok ? t('verif.mal', { f: v.faltan.join(', ') }) : v.cifras ? t('verif.ok', { c: v.cifras, e: v.encontradas, k: v.calculadas ? t('verif.calc', { k: v.calculadas }) : '' }) : t('verif.cero');
  p4.append(vb);

  // 5 Salida
  const p5 = paso('paso.salida');
  const det = el('details', 'salida');
  if (params.get('salida') === '1' || window.innerHeight > 1000) det.open = true;
  det.append(el('summary', null, t('salida.ver')));
  const dl = el('dl');
  for (const [k, val] of Object.entries(r.salida)) {
    dl.append(el('dt', null, k));
    dl.append(el('dd', null, Array.isArray(val) ? (val.length ? JSON.stringify(val) : '[]') : String(val)));
  }
  det.append(dl);
  p5.append(det);

  cuerpo.append(ol);
  cuerpo.scrollTop = 0;
  $('#traza-pie').textContent = t('traza.pie.ms', { ms: num(r.ms) });
}
$('#traza-ant').addEventListener('click', () => { const l = respuestas(); const p = l.findIndex((x) => x.i === estado.ver); if (p > 0) verTurno(l[p - 1].i); });
$('#traza-sig').addEventListener('click', () => { const l = respuestas(); const p = l.findIndex((x) => x.i === estado.ver); if (p < l.length - 1) verTurno(l[p + 1].i); });

/* ---------- Vista en móvil (pestañas) ---------- */
function cambiarVista(v) {
  const esc2 = $('#asistente');
  esc2.classList.toggle('ver-traza', v === 'traza');
  $$('.vista [role="tab"]').forEach((b) => { const sel = b.dataset.vista === v; b.setAttribute('aria-selected', String(sel)); b.tabIndex = sel ? 0 : -1; });
  if (v === 'traza') $('#vista-punto').classList.remove('nuevo');
}
$$('.vista [role="tab"]').forEach((b) => {
  b.addEventListener('click', () => cambiarVista(b.dataset.vista));
  b.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const otro = b.dataset.vista === 'chat' ? 'traza' : 'chat'; cambiarVista(otro); $(`.vista [data-vista="${otro}"]`).focus(); }
  });
});

/* ---------- Métricas de la sesión ---------- */
function dibujarMedidas() {
  const rs = estado.resultados.filter((r) => !r.persona);
  const n = rs.length;
  const pct = (a, b) => t('medir.pct', { p: b ? Math.round((a / b) * 100) : 0, a, b });
  if (!n) { ['m-cita', 'm-deriva', 'm-noesta', 'm-tiempo'].forEach((id) => { $('#' + id).textContent = t('medir.vacio'); }); return; }
  const respuestasConDato = rs.filter((r) => ['R1', 'R5'].includes(r.regla));
  $('#m-cita').textContent = pct(respuestasConDato.filter((r) => r.citas.length).length, respuestasConDato.length);
  const derivadas = estado.resultados.filter((r) => r.persona).length;
  $('#m-deriva').textContent = pct(derivadas, n);
  const faltan = [...new Set(rs.flatMap((r) => r.sinDato))];
  $('#m-noesta').textContent = faltan.length ? faltan.map((x) => `«${x}»`).join(', ') : t('medir.ninguna');
  const ms = rs.map((r) => r.ms).sort((a, b) => a - b);
  $('#m-tiempo').textContent = t('medir.ms', { ms: num(ms[Math.floor(ms.length / 2)]) });
}

/* ---------- Catálogo y ficha ---------- */
function dibujarCatalogo() {
  const l = estado.idioma;
  const ul = $('#fichas');
  ul.innerHTML = '';
  for (const p of motor.productos) {
    const li = el('li', 'ficha' + (p.configurador ? ' ficha--destacada' : ''));
    const b = el('button', 'ficha__b' + (p.configurador ? ' ficha__b--img' : ''));
    b.type = 'button';
    if (p.configurador) {
      const img = el('img', 'ficha__img');
      img.src = `../configurador/img/poster-${p.configurador}-800.webp`;
      img.width = 800; img.height = 600; img.loading = 'lazy'; img.decoding = 'async'; img.alt = '';
      b.append(img);
    }
    b.append(el('span', 'ficha__linea', p.linea[l]));
    b.append(el('span', 'ficha__n', p.nombre[l]));
    b.append(el('span', 'ficha__d', p.descripcion[l]));
    const pie = el('span', 'ficha__pie');
    pie.append(el('span', 'ficha__precio', `${t('catalogo.desde')} ${dinero(p.precio.desde)}`));
    pie.append(el('span', 'ficha__ver', t('catalogo.ver')));
    b.append(pie);
    b.addEventListener('click', () => abrirFicha(p.id));
    li.append(b);
    ul.append(li);
  }
  const ud = $('#docs');
  ud.innerHTML = '';
  for (const d of motor.documentos) {
    const li = el('li', 'ficha');
    const b = el('button', 'ficha__b');
    b.type = 'button';
    b.append(el('span', 'ficha__linea', t(d.tipo === 'guia' ? 'catalogo.guia' : 'catalogo.politica')));
    b.append(el('span', 'ficha__n', d.nombre[l]));
    b.append(el('span', 'ficha__d', d.secciones.map((s) => s.titulo[l]).join(' · ')));
    const pie = el('span', 'ficha__pie');
    pie.append(el('span', 'ficha__precio', t('catalogo.secciones', { n: d.secciones.length })));
    pie.append(el('span', 'ficha__ver', t('catalogo.ver')));
    b.append(pie);
    b.addEventListener('click', () => abrirFicha(d.id));
    li.append(b);
    ud.append(li);
  }
}
let fichaAbierta = null;
function abrirFicha(id, resaltar = null) {
  const f = motor.ficha(id);
  if (!f) return;
  const l = estado.idioma;
  fichaAbierta = { id, resaltar };
  $('#ficha-d-linea').textContent = f.linea ? f.linea[l] : t(f.tipo === 'guia' ? 'catalogo.guia' : 'catalogo.politica');
  $('#ficha-d-t').textContent = f.nombre[l];
  const ol = $('#ficha-d-lista');
  ol.innerHTML = '';
  let marcado = null;
  for (const fr of motor.fragmentosDe(id, l)) {
    const li = el('li', fr.id === resaltar ? 'citado' : '');
    li.append(el('b', null, fr.etiqueta));
    li.append(document.createTextNode(fr.texto));
    if (fr.id === resaltar) { li.setAttribute('aria-current', 'true'); marcado = li; }
    ol.append(li);
  }
  const conf = $('#ficha-d-config');
  conf.hidden = !f.configurador;
  if (f.configurador) $('#ficha-d-config-a').href = `../configurador/index.html?producto=${f.configurador}`;
  const d = $('#ficha-d');
  if (!d.open) d.showModal();
  if (marcado) marcado.scrollIntoView({ block: 'nearest' });
}
$('#ficha-d-cerrar').addEventListener('click', () => $('#ficha-d').close());
$('#ficha-d').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
$('#ficha-d').addEventListener('close', () => { fichaAbierta = null; });

/* ---------- Pruebas ---------- */
let ultimaPrueba = null;
function dibujarPruebas(filas) {
  const ok = filas.filter((f) => f.ok).length;
  const ms = filas.map((f) => f.ms).sort((a, b) => a - b);
  $('#pruebas-res').textContent = t('pruebas.res', { ok, n: filas.length, ms: num(ms[Math.floor(ms.length / 2)]) });
  const box = $('#pruebas-tabla');
  box.hidden = false;
  box.innerHTML = '';
  const tb = el('table');
  const th = el('thead');
  const tr = el('tr');
  for (const k of ['pruebas.col.q', 'pruebas.col.l', 'pruebas.col.e', 'pruebas.col.r']) { const h = el('th', null, t(k)); h.scope = 'col'; tr.append(h); }
  th.append(tr);
  tb.append(th);
  const bd = el('tbody');
  for (const f of filas) {
    const fr = el('tr');
    fr.append(el('td', null, f.q));
    fr.append(el('td', null, f.l.toUpperCase()));
    fr.append(el('td', null, `${f.regla} · ${t('regla.' + f.regla)}`));
    fr.append(el('td', f.ok ? 'ok' : 'mal', f.ok ? `✓ ${t('pruebas.ok')}` : `✗ ${t('pruebas.mal')}: ${f.fallas.join('; ')}`));
    bd.append(fr);
  }
  tb.append(bd);
  box.append(tb);
}
$('#correr').addEventListener('click', () => { ultimaPrueba = correrPruebas(motor); dibujarPruebas(ultimaPrueba); });

/* ---------- Eventos ---------- */
$('#form').addEventListener('submit', (e) => {
  e.preventDefault();
  const i = $('#chat-entrada');
  const q = i.value;
  i.value = '';
  preguntar(q);
});
$$('.sug').forEach((b) => b.addEventListener('click', () => preguntar(t('sug.' + b.dataset.sug))));
$$('[data-probar]').forEach((b) => b.addEventListener('click', () => {
  $('#asistente').scrollIntoView({ behavior: quieto ? 'auto' : 'smooth', block: 'start' });
  preguntar(t('sug.' + b.dataset.probar));
}));
$('#persona').addEventListener('click', persona);
$$('[data-idioma]').forEach((b) => b.addEventListener('click', () => cambiarIdioma(b.dataset.idioma)));

/* ---------- Arranque ---------- */
(async function iniciar() {
  const [catalogo] = await Promise.all([fetch('datos/catalogo.json').then((r) => r.json()), cambiarIdioma(idiomaInicial(), false)]);
  motor = crearMotor(catalogo);
  marcarTema();
  dibujarCatalogo();
  dibujarReglas();
  dibujarLog(0, true);
  dibujarMedidas();
  $('#flujo2-d').textContent = estado.idioma === 'es' ? `BM25 en JavaScript sobre ${motor.total} fragmentos.` : `BM25 in JavaScript over ${motor.total} passages.`;
  // Parámetros de captura: ?q=…&q=… (en orden; «@id» elige en la aclaración anterior), ?persona=1, ?ver=N, ?ficha=id[#campo], ?pruebas=1, ?panel=traza, ?ir=seccion
  // ?q= sólo acepta las sugerencias (sug:N o su texto exacto) y «@id»: nadie puede armar un enlace que muestre su propio
  // texto como consulta dentro de la demo. El texto libre queda para el campo que escribe el visitante.
  const sugerencias = $$('.sug').map((b) => t('sug.' + b.dataset.sug));
  for (const q of params.getAll('q')) {
    if (q.startsWith('@')) { const prev = estado.turnos.filter((x) => !x.tipo).pop(); if (prev) preguntar(prev.q, q.slice(1), true); }
    else if (/^sug:\d$/.test(q) && sugerencias.includes(t('sug.' + q.slice(4)))) preguntar(t('sug.' + q.slice(4)));
    else if (sugerencias.includes(q)) preguntar(q);
  }
  if (params.get('persona') === '1') persona();
  if (params.get('ver')) { const l = respuestas(); const n = Math.min(+params.get('ver'), l.length) - 1; if (l[n]) verTurno(l[n].i, true); }
  if (params.get('pruebas') === '1') { ultimaPrueba = correrPruebas(motor); dibujarPruebas(ultimaPrueba); }
  if (params.get('panel') === 'traza') cambiarVista('traza');
  if (params.get('ficha')) { const [id, campo] = params.get('ficha').split('.'); abrirFicha(id, campo ? `${id}#${campo}` : null); }
  if (params.get('ir')) { const s = document.getElementById(params.get('ir')); if (s) s.scrollIntoView({ block: 'start' }); }
  window.__listo = true;
  window.__pruebas = PRUEBAS.length;
})();

/* ---------- Entrada de los titulares de sección ---------- */
(function montarRevelado() {
  if (!document.documentElement.classList.contains('js-mov')) return;
  const els = [...document.querySelectorAll('.seccion .folio, .seccion .titulo, .seccion .intro, .seccion .subtitulo, .proceso h3')];
  els.forEach((e) => e.setAttribute('data-corte', ''));
  const io = new IntersectionObserver((entradas) => entradas.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add('visto'); io.unobserve(en.target); }
  }), { rootMargin: '0px 0px -12% 0px' });
  els.forEach((e) => io.observe(e));
})();
