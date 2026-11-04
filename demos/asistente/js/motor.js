// Motor del asistente de Ámbar Muebles (marca ficticia). Corre entero en el navegador (y en Node para las pruebas):
// 1) normaliza la consulta, 2) recupera fragmentos de las fichas con BM25, 3) aplica una de cinco reglas,
// 4) arma la respuesta con plantillas y citas, 5) verifica que cada cifra de la respuesta esté en un fragmento citado.
// No hay modelo de lenguaje: todo lo que dice sale de datos/catalogo.json.

export const REGLAS = {
  R1: 'responder_con_cita',
  R2: 'pedir_aclaracion',
  R3: 'no_esta_en_el_catalogo',
  R4: 'derivar_a_una_persona',
  R5: 'comparar_con_citas',
};
const K1 = 1.2;
const B = 0.75;

/* ---------- Texto ---------- */
export function normalizar(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[×x](?=\s*\d)/g, ' ');
}
export function palabras(s) {
  return normalizar(s).split(/[^a-z0-9]+/).filter(Boolean);
}
const EXCEPCIONES = { plaza: 'plaza', plazas: 'plaza', tardes: 'tardes', noches: 'noches' };
export function raiz(w) {
  if (/^\d+$/.test(w)) return w;
  if (EXCEPCIONES[w]) return EXCEPCIONES[w];
  let r = w;
  if (r.length > 5 && /ces$/.test(r)) r = r.slice(0, -3) + 'z';
  else if (r.length > 5 && /[nrldz]es$/.test(r)) r = r.slice(0, -2);
  else if (r.length > 3 && /s$/.test(r) && !/ss$/.test(r)) r = r.slice(0, -1);
  if (r.length > 4 && /[aeo]$/.test(r)) r = r.slice(0, -1);
  return r.slice(0, 7);
}
const raices = (lista) => new Set(lista.flatMap((x) => palabras(x)).map(raiz));

// Palabras que no aportan a la búsqueda (es + en).
const VACIAS = raices([
  'de del la el los las lo un una unos unas y e o u a al en con sin por para que como cuanto cuanta cuantos cuantas cual quien es son ser sea fue esta este esto estos estas ese esa eso esos esas aquel me mi mis te tu tus su sus se le les nos vos usted ustedes yo',
  'alguien tercer tercero cuarto quinto sexto third fourth fifth ademas aparte respecto acerca sino pero ninguno ninguna nada pido pedir pediria pidiera encargo encargar mueble muebles contame contar cuentame contanos info informacion detalle detalles dato datos tiene tengo tenemos quiero quiera quisiera queria necesito necesitaria saber sabes puedo podria podes puede pueden podrian si no muy mas menos ya hola buenas buen buenos dia dias tardes noches gracias favor porfa bueno ok dale tambien algo alguna alguno algun cosa cosas dame decime decir dicen consulta pregunta preguntar otra otro otros sobre entre hasta desde cuando donde ahi aca alli estar estan va van vamos hacer hago ver mirar comprar compro compraria llevo llevar busco buscando ando estoy seria serian solo cada todo toda todos todas mucho mucha poco ahora hoy despues antes igual mismo misma che bien mal seria ambos ambas uno dos tres',
  'the a an and or of to in on at for with without by is are was be been am do does did can could would should will shall may might i you we they he she it this that these those my your our their me us them what who whom how much many when where why there here have has had want wanted need needs know tell through out off between among from into onto over under after before then so but not yes okay there here other another something anything thing things way furniture details detail info information please thanks thank hi hello hey about buy buying get getting if any some also more less than just only like really very one two three each all both its im ive id youre whats',
  'cm centimetro centimetros mm metro metros kg kilo kilos us usd dolar dolares',
]);

// Intenciones: raíz → peso. La de mayor suma gana; empate, el orden de la lista.
const INTENCIONES = [
  ['derivar', 3, ['atienda', 'atiendan', 'atender', 'humano', 'humana', 'asesor', 'asesora', 'vendedor', 'vendedora', 'operador', 'operadora', 'human', 'agent', 'representative']],
  ['comparar', 2.5, ['diferencia', 'diferencias', 'comparar', 'compara', 'comparacion', 'comparame', 'versus', 'vs', 'conviene', 'mejor', 'difference', 'differences', 'compare', 'comparison', 'better']],
  ['puerta', 2.5, ['puerta', 'puertas', 'door', 'doors', 'doorway', 'pasillo', 'hallway', 'ascensor', 'elevator', 'lift']],
  ['plazo', 2, ['tarda', 'tardan', 'tardaria', 'demora', 'demoran', 'llega', 'llegan', 'llegar', 'llegue', 'llegaria', 'plazo', 'plazos', 'stock', 'disponible', 'disponibles', 'disponibilidad', 'entregan', 'entregar', 'arrive', 'arrives', 'arrival', 'deliver', 'delivered', 'lead', 'take', 'takes', 'soon', 'available', 'availability', 'pronto', 'rapido', 'fast', 'quick', 'semanas', 'weeks', 'urgente']],
  ['cuidado', 2, ['saco', 'sacar', 'sacarle', 'quito', 'quitar', 'remover', 'remove', 'limpio', 'limpiar', 'limpia', 'limpieza', 'lavar', 'lava', 'lavo', 'lavable', 'lavarropas', 'mancha', 'manchas', 'manche', 'cuidar', 'cuido', 'cuidado', 'cuidados', 'mantener', 'mantenimiento', 'aspirar', 'clean', 'cleaning', 'wash', 'washable', 'stain', 'stains', 'care', 'maintain', 'maintenance', 'vacuum', 'spill', 'spilled', 'derrame', 'derrame', 'volque', 'vino', 'wine']],
  ['garantia', 2, ['garantia', 'warranty', 'guarantee', 'cubre', 'covers', 'cover', 'falla', 'fallas', 'fault', 'faults', 'defecto', 'defect']],
  ['devolucion', 2, ['devolver', 'devolucion', 'devoluciones', 'devuelvo', 'arrepiento', 'arrepentimiento', 'cambiar', 'cambio', 'return', 'returns', 'refund', 'exchange']],
  ['envio', 2, ['envio', 'envios', 'enviar', 'envian', 'mandan', 'flete', 'piso', 'pisos', 'escalera', 'escaleras', 'balcon', 'cobertura', 'domicilio', 'zona', 'postal', 'ship', 'shippi', 'floor', 'floors', 'stairs', 'staircase', 'coverage', 'postcode', 'zip', 'freight', 'carrier', 'balcony']],
  ['precio', 2, ['precio', 'precios', 'cuesta', 'cuestan', 'sale', 'salen', 'vale', 'valen', 'valor', 'price', 'prices', 'cost', 'costs', 'costo', 'costs', 'barato', 'barata', 'caro', 'cara', 'expensive', 'cheap', 'cheaper', 'pay', 'pagar']],
  ['peso', 2, ['pesa', 'pesan', 'peso', 'pesado', 'pesada', 'weigh', 'weighs', 'weight', 'heavy']],
  ['armado', 2, ['armado', 'armada', 'armar', 'armo', 'arma', 'montaje', 'herramienta', 'herramientas', 'atornillar', 'assembly', 'assemble', 'assembled', 'tools', 'tool', 'bultos', 'cajas', 'packages', 'boxes']],
  ['medidas', 2, ['mide', 'miden', 'medida', 'medidas', 'dimension', 'dimensiones', 'tamano', 'ancho', 'alto', 'altura', 'largo', 'profundidad', 'size', 'sizes', 'dimensions', 'wide', 'width', 'high', 'height', 'tall', 'deep', 'depth', 'long', 'length', 'big', 'grande', 'entra', 'entran', 'cabe', 'caben', 'fit', 'fits', 'espacio', 'lugares', 'personas', 'people', 'seats', 'seat', 'asiento']],
  ['materiales', 1.5, ['material', 'materiales', 'tela', 'telas', 'color', 'colores', 'colour', 'colours', 'colors', 'madera', 'maderas', 'acabado', 'acabados', 'terminacion', 'tapizado', 'hecho', 'hecha', 'made', 'fabric', 'fabrics', 'finish', 'finishes', 'wood', 'upholstery', 'viene', 'vienen', 'come', 'comes', 'opciones', 'options', 'variantes', 'combinaciones']],
  ['listar', 1, ['tienen', 'tenes', 'venden', 'vendes', 'hay', 'ofrecen', 'fabrican', 'hacen', 'catalogo', 'mostrame', 'mostrar', 'cuales', 'opciones', 'sell', 'carry', 'offer', 'which', 'show', 'list', 'catalogue', 'catalog', 'range']],
].map(([id, peso, lista]) => ({ id, peso, raices: raices(lista) }));
const CAMPO_DE = { medidas: 'medidas', puerta: 'entrega', plazo: 'plazo', cuidado: 'cuidado', garantia: 'garantia', devolucion: 'plazo', envio: 'precio', precio: 'precio', peso: 'entrega', armado: 'entrega', materiales: 'opciones' };
const POSVENTA = /\b(mi|mis|nuestro|nuestra) (pedido|compra|orden|envio)\b|\bmy (order|delivery|purchase)\b|\b(numero|nro) de (pedido|orden)\b|\border (number|status)\b|\breclam|\bqueja|\bcomplain|\broto\b|\brota\b|\brompi|\bdanad|\bdamaged|\bbroken\b|\bfactura\b|\binvoice\b|\bdescuento|\bdiscount/;

const CATEGORIAS = {
  butaca: ['butaca', 'butacas', 'armchair', 'armchairs', 'sillon', 'sillones'],
  sofa: ['sofa', 'sofas', 'couch', 'couches', 'settee', 'sillon', 'sillones'],
  mesa: ['mesa', 'mesas', 'mesita', 'mesitas', 'table', 'tables', 'nightstand', 'nightstands'],
  silla: ['silla', 'sillas', 'chair', 'chairs'],
  aparador: ['aparador', 'aparadores', 'sideboard', 'sideboards', 'buffet', 'credenza'],
  lampara: ['lampara', 'lamparas', 'lamp', 'lamps', 'iluminacion', 'lighting'],
  alfombra: ['alfombra', 'alfombras', 'rug', 'rugs', 'carpet'],
  cama: ['cama', 'camas', 'bed', 'beds'],
  escritorio: ['escritorio', 'escritorios', 'desk', 'desks'],
};
const RAIZ_CATEGORIA = new Map();
for (const [c, lista] of Object.entries(CATEGORIAS)) for (const r of raices(lista)) RAIZ_CATEGORIA.set(r, [...(RAIZ_CATEGORIA.get(r) || []), c]);

// Etiquetas que se suman al texto indexado de cada campo (lo que la gente escribe para pedir ese dato).
const ETIQUETAS = {
  resumen: 'producto descripción product description',
  medidas: 'medidas dimensiones mide ancho alto profundidad tamaño size dimensions width height depth',
  entrega: 'entrega bultos caja armado peso puerta pasa entra delivery packages box assembly weight door fit',
  precio: 'precio cuesta sale desde price cost from',
  opciones: 'materiales telas colores opciones acabados materials fabrics colours options finishes',
  plazo: 'plazo stock demora llega disponible lead time delivery arrives available',
  garantia: 'garantía cubre warranty covers',
  cuidado: 'cuidado limpieza limpiar manchas care cleaning clean stains',
  envio: 'envío costo pisos delivery cost floors',
  devolucion: 'devolución devolver return refund',
};

/* ---------- Formato por idioma ---------- */
const L = {
  es: {
    dinero: (n) => `US$ ${new Intl.NumberFormat('es-AR').format(n)}`,
    lista: (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`),
    o: (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} o ${xs[xs.length - 1]}`),
    campos: { resumen: 'Descripción', medidas: 'Medidas', entrega: 'Entrega y peso', precio: 'Precio', opciones: 'Materiales y opciones', plazo: 'Plazo', garantia: 'Garantía', cuidado: 'Cuidado' },
  },
  en: {
    dinero: (n) => `US$ ${new Intl.NumberFormat('en-US').format(n)}`,
    lista: (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`),
    o: (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`),
    campos: { resumen: 'Description', medidas: 'Dimensions', entrega: 'Delivery and weight', precio: 'Price', opciones: 'Materials and options', plazo: 'Lead time', garantia: 'Warranty', cuidado: 'Care' },
  },
};
export const NOMBRE_TEMA = {
  es: { medidas: 'medidas', puerta: 'si pasa por una puerta', plazo: 'plazo', cuidado: 'cuidado', garantia: 'garantía', devolucion: 'devolución', envio: 'envío', precio: 'precio', peso: 'peso', armado: 'armado', materiales: 'materiales', comparar: 'comparar', listar: 'qué hay', derivar: 'hablar con una persona' },
  en: { medidas: 'dimensions', puerta: 'door fit', plazo: 'lead time', cuidado: 'care', garantia: 'warranty', devolucion: 'returns', envio: 'delivery', precio: 'price', peso: 'weight', armado: 'assembly', materiales: 'materials', comparar: 'compare', listar: 'what is there', derivar: 'talk to a person' },
};
const may = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const dims = (d) => d.join(' × ');

/* ---------- Fragmentos de cada ficha ---------- */
function textoCampo(p, campo, l) {
  const f = L[l];
  const es = l === 'es';
  switch (campo) {
    case 'resumen': return `${p.nombre[l]}. ${p.descripcion[l]}`;
    case 'medidas': {
      const m = p.medidas;
      const base = p.categoria === 'alfombra'
        ? (es ? `Medidas: ${m.ancho} × ${m.prof} cm.` : `Dimensions: ${m.ancho} × ${m.prof} cm.`)
        : (es ? `Medidas: ${m.ancho} × ${m.prof} × ${m.alto} cm (ancho × profundidad × alto).` : `Dimensions: ${m.ancho} × ${m.prof} × ${m.alto} cm (width × depth × height).`);
      return `${base} ${m.extra[l]}`;
    }
    case 'entrega': {
      const e = p.entrega;
      const b = e.bultos.map(dims).join(es ? ' y ' : ' and ');
      return es ? `Entrega: ${e.es} ${e.bultos.length > 1 ? 'Bultos' : 'Bulto'}: ${b} cm. Peso: ${e.peso} kg.` : `Delivery: ${e.en} ${e.bultos.length > 1 ? 'Packages' : 'Package'}: ${b} cm. Weight: ${e.peso} kg.`;
    }
    case 'precio': return es ? `Precio: desde ${f.dinero(p.precio.desde)}, ${p.precio.es}.` : `Price: from ${f.dinero(p.precio.desde)}, ${p.precio.en}.`;
    case 'opciones': {
      const g = p.opciones.map((o) => `${o.grupo[l]}: ${o.valores.map((v) => (v.extra ? `${v[l]} (+${f.dinero(v.extra)})` : v[l])).join(', ')}.`).join(' ');
      return `${p.materiales[l]} ${g}`;
    }
    case 'plazo': {
      const varios = p.plazos.length > 1 || p.opciones[0].valores.length > 1;
      return (es ? 'Plazo: ' : 'Lead time: ') + p.plazos.map((r) => (varios ? `${f.lista(r.opciones.map((id) => nombreOpcion(p, id, l)))}: ${r[l]}.` : `${may(r[l])}.`)).join(' ');
    }
    case 'garantia': return (es ? 'Garantía: ' : 'Warranty: ') + p.garantia[l];
    case 'cuidado': {
      const guias = p.cuidado.guias.map((g) => (es ? GUIAS_NOMBRE.es[g] : GUIAS_NOMBRE.en[g]));
      const ref = guias.length ? (es ? ` Seguir la ${f.lista(guias)}.` : ` Follow the ${f.lista(guias)}.`) : '';
      return ((es ? 'Cuidado: ' : 'Care: ') + (p.cuidado[l] || '') + ref).replace(/:\s+(Seguir|Follow)/, ': $1');
    }
    default: return '';
  }
}
const GUIAS_NOMBRE = { es: { terciopelo: 'guía de cuidado del terciopelo', madera: 'guía de cuidado de la madera maciza' }, en: { terciopelo: 'velvet care guide', madera: 'solid wood care guide' } };
function nombreOpcion(p, id, l) {
  for (const g of p.opciones) for (const v of g.valores) if (v.id === id) return v[l];
  return id;
}
const CAMPOS = ['resumen', 'medidas', 'entrega', 'precio', 'opciones', 'plazo', 'garantia', 'cuidado'];

/* ---------- Índice ---------- */
export function crearMotor(catalogo) {
  const productos = catalogo.productos;
  const documentos = catalogo.documentos;
  const porId = new Map(productos.map((p) => [p.id, p]));
  const docPorId = new Map(documentos.map((d) => [d.id, d]));
  const fragmentos = [];
  for (const p of productos) {
    for (const campo of CAMPOS) {
      const es = textoCampo(p, campo, 'es');
      const en = textoCampo(p, campo, 'en');
      fragmentos.push({ id: `${p.id}#${campo}`, doc: p.id, tipo: 'producto', campo, texto: { es, en }, indexado: `${p.nombre.es} ${p.nombre.en} ${es} ${en} ${ETIQUETAS[campo]}` });
    }
  }
  for (const d of documentos) {
    for (const s of d.secciones) {
      fragmentos.push({ id: `${d.id}#${s.id}`, doc: d.id, tipo: d.tipo, campo: s.campo, seccion: s.id, titulo: s.titulo, texto: { es: s.es, en: s.en }, indexado: `${d.nombre.es} ${d.nombre.en} ${s.titulo.es} ${s.titulo.en} ${s.es} ${s.en} ${s.etiquetas || ''} ${ETIQUETAS[s.campo] || ''}` });
    }
  }
  const df = new Map();
  let largoTotal = 0;
  for (const f of fragmentos) {
    f.terminos = palabras(f.indexado).map(raiz).filter((r) => !VACIAS.has(r));
    f.tf = new Map();
    for (const r of f.terminos) f.tf.set(r, (f.tf.get(r) || 0) + 1);
    for (const r of f.tf.keys()) df.set(r, (df.get(r) || 0) + 1);
    largoTotal += f.terminos.length;
  }
  const N = fragmentos.length;
  const largoMedio = largoTotal / N;
  const idf = (r) => { const n = df.get(r) || 0; return Math.log(1 + (N - n + 0.5) / (n + 0.5)); };
  const vocabulario = new Set(df.keys());

  const claveProducto = new Map();
  const opcionRaiz = new Map();
  for (const p of productos) {
    for (const c of p.clave) claveProducto.set(raiz(normalizar(c)), p.id);
    for (const g of p.opciones) for (const v of g.valores) for (const l of ['es', 'en']) for (const w of palabras(v[l])) {
      const r = raiz(w);
      if (VACIAS.has(r) || /^\d+$/.test(r)) continue;
      if (!opcionRaiz.has(r)) opcionRaiz.set(r, new Set());
      opcionRaiz.get(r).add(`${p.id}:${v.id}`);
    }
  }
  const modProducto = new Map();
  for (const p of productos) for (const m of p.modificadores) { const r = raiz(normalizar(m)); modProducto.set(r, [...(modProducto.get(r) || []), p.id]); }
  const claveGuia = new Map();
  for (const d of documentos) for (const c of d.clave) claveGuia.set(raiz(normalizar(c)), d.id);
  const conocidas = new Set([...vocabulario, ...claveProducto.keys(), ...RAIZ_CATEGORIA.keys(), ...opcionRaiz.keys(), ...modProducto.keys(), ...INTENCIONES.flatMap((i) => [...i.raices])]);

  function bm25(f, qs) {
    let s = 0;
    for (const r of qs) {
      const tf = f.tf.get(r);
      if (!tf) continue;
      s += idf(r) * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * f.terminos.length) / largoMedio)));
    }
    return s;
  }

  function corregir(r) {
    if (r.length < 4 || /^\d+$/.test(r)) return null;
    const tope = r.length >= 8 ? 2 : 1;
    let mejor = null;
    let dmin = tope + 1;
    const lista = r.length < 5 ? [...claveProducto.keys(), ...RAIZ_CATEGORIA.keys()].filter((v) => v.length === r.length + 1 && subsecuencia(r, v)) : conocidas;
    for (const v of lista) {
      if (Math.abs(v.length - r.length) > tope || v.length < 4) continue;
      const d = distancia(r, v, tope);
      if (d < dmin) { dmin = d; mejor = v; }
    }
    return dmin <= tope ? mejor : null;
  }

  /* ---------- Responder ---------- */
  function responder(consulta, opciones = {}) {
    const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
    const l = opciones.idioma === 'en' ? 'en' : 'es';
    const f = L[l];
    const ctx = opciones.contexto || {};
    const norm = normalizar(consulta);
    const crudas = palabras(consulta);
    const terminos = [];
    const qs = [];
    const numeros = (norm.match(/\d+/g) || []).map(Number);
    const originales = String(consulta).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const alineadas = originales.length === crudas.length;
    for (const [k, w] of crudas.entries()) {
      let r = raiz(w);
      const t = { palabra: alineadas ? originales[k].toLowerCase() : w, raiz: r, tipo: 'contenido' };
      if (/^\d+$/.test(r)) t.tipo = 'numero';
      else if (VACIAS.has(r)) t.tipo = 'vacia';
      else if (!conocidas.has(r)) {
        const c = corregir(r);
        if (c) { t.corregida = c; r = c; t.raiz = c; } else t.tipo = 'desconocida';
      }
      if (t.tipo === 'contenido') {
        if (claveProducto.has(r)) t.tipo = 'producto';
        else if (RAIZ_CATEGORIA.has(r)) t.tipo = 'categoria';
        else if (INTENCIONES.some((i) => i.raices.has(r))) t.tipo = 'intencion';
        else if (opcionRaiz.has(r)) t.tipo = 'opcion';
      }
      terminos.push(t);
      if (t.tipo !== 'vacia') qs.push(r);
    }

    // Intención
    const puntajes = INTENCIONES.map((i) => ({ id: i.id, s: qs.filter((r) => i.raices.has(r)).length * i.peso, por: terminos.filter((t) => i.raices.has(t.raiz)).map((t) => t.palabra) }));
    if (POSVENTA.test(norm)) puntajes.find((p) => p.id === 'derivar').s += 4;
    if (/\b(con|a|una|alguna|to|with|a real)\s+(persona|alguien|person|someone|somebody)\b|\b(hablar|charlar|comunicarme|contactar|talk|speak)\b/.test(norm)) { const d = puntajes.find((p) => p.id === 'derivar'); d.s += 3; const m = norm.match(/\b(persona|alguien|person|someone|somebody|hablar|talk|speak)\b/); if (m && !d.por.includes(m[1])) d.por.push(m[1]); }
    if (numeros.some((n) => n >= 40 && n <= 150) && /\b(pasa|pasar|entra|entrar|cabe|fit|fits|through|go)\b/.test(norm) && /\b(puerta|door|doorway|pasillo|hall|hallway|ascensor|elevator|lift)\b/.test(norm)) puntajes.find((p) => p.id === 'puerta').s += 2;
    if (/\b(tienen|tenes|venden|vendes|hay|ofrecen|fabrican)\b|\bdo you (have|sell|carry|make|offer)\b/.test(norm)) puntajes.find((p) => p.id === 'listar').s += 1;
    if (/\bhow much\b/.test(norm) && !/\bweigh/.test(norm)) puntajes.find((p) => p.id === 'precio').s += 2;
    if (/\b(deliver|ship|send|envian|envias|mandan|llevan|enviar|mandar)\s+(to|a|al|hasta|para)\b/.test(norm)) puntajes.find((p) => p.id === 'envio').s += 2.5;
    // «cuánto tarda» manda sobre «long» de medidas; «how long … take» es plazo.
    if (/\bhow long\b/.test(norm) && /\b(take|takes|arrive|deliver|wait)\b/.test(norm)) puntajes.find((p) => p.id === 'plazo').s += 2;
    const listar = puntajes.find((p) => p.id === 'listar');
    const orden = [...puntajes].sort((a, b) => b.s - a.s || INTENCIONES.findIndex((i) => i.id === a.id) - INTENCIONES.findIndex((i) => i.id === b.id));
    let intencion = orden[0].s > 0 ? orden[0] : null;
    if (intencion && intencion.id === 'listar' && orden[1] && orden[1].s >= 1.5) intencion = orden[1];
    const campoIntencion = intencion ? intencion.id : null;

    // Productos y documentos
    const nombrados = [...new Set(qs.filter((r) => claveProducto.has(r)).map((r) => claveProducto.get(r)))];
    const cats = [...new Set(qs.flatMap((r) => RAIZ_CATEGORIA.get(r) || []))];
    const mods = qs.flatMap((r) => modProducto.get(r) || []);
    const porCategoria = productos.filter((p) => cats.includes(p.categoria)).map((p) => p.id);
    const fuertes = porCategoria.filter((id) => mods.includes(id));
    const opcionesQ = qs.filter((r) => opcionRaiz.has(r));
    const guias = [...new Set(qs.filter((r) => claveGuia.has(r)).map((r) => claveGuia.get(r)))];
    const desconocidas = terminos.filter((t) => t.tipo === 'desconocida').map((t) => t.palabra);

    // Recuperación
    const usados = new Set();
    let seleccion = [];
    let via = null;
    if (ctx.forzar && ctx.forzar.length) { seleccion = ctx.forzar.filter((id) => porId.has(id)); via = 'aclaracion'; }
    else if (nombrados.length) { seleccion = nombrados; via = 'nombre'; }
    else if (fuertes.length) { seleccion = fuertes; via = 'categoria'; }
    else if (porCategoria.length) { seleccion = porCategoria; via = 'categoria'; }
    else if (opcionesQ.length && !guias.length) {
      const conjuntos = opcionesQ.map((r) => new Set([...opcionRaiz.get(r)].map((x) => x.split(':')[0])));
      const inter = [...conjuntos[0]].filter((id) => conjuntos.every((c) => c.has(id)));
      if (inter.length && inter.length <= 2) { seleccion = inter; via = 'opcion'; }
    }
    if (!seleccion.length && mods.length && !cats.length) {
      let m = [...new Set(mods)];
      if (ctx.candidatos && ctx.candidatos.length) m = m.filter((id) => ctx.candidatos.includes(id));
      if (m.length === 1) { seleccion = m; via = ctx.pendiente ? 'aclaracion' : 'modificador'; }
    }
    // «¿Tienen algo en terciopelo?»: lista los productos cuya ficha de materiales contiene el término.
    let porMaterial = [];
    if (!seleccion.length && !cats.length && listar.s > 0) {
      const buscados = terminos.filter((t) => ['contenido', 'opcion'].includes(t.tipo)).map((t) => t.raiz);
      if (buscados.length) porMaterial = productos.filter((p) => { const fr = fragmentos.find((x) => x.id === `${p.id}#opciones`); return buscados.every((r) => fr.tf.has(r)); }).map((p) => p.id);
      if (porMaterial.length) { seleccion = porMaterial; via = 'material'; }
    }
    const objetos = !seleccion.length && !cats.length && !nombrados.length && listar.s > 0 ? terminos.filter((t) => t.tipo === 'contenido').map((t) => t.palabra).slice(0, 1) : [];
    const campoBuscado = CAMPO_DE[campoIntencion];
    const puntuar = (sel) => fragmentos.map((fr) => {
      const base = bm25(fr, qs);
      const bonoCampo = base > 0 && campoBuscado && (fr.campo === campoBuscado || (campoIntencion === 'cuidado' && fr.campo === 'cuidado') || (['envio', 'devolucion', 'garantia'].includes(campoIntencion) && fr.campo === campoIntencion)) ? 2 : 0;
      const bonoProducto = base > 0 && sel.includes(fr.doc) ? 1.5 : 0;
      return { fr, base, bonoCampo, bonoProducto, total: base + bonoCampo + bonoProducto };
    }).sort((a, b) => b.total - a.total);
    let ranking = puntuar(seleccion);
    // Sin nombre ni categoría: el producto que más puntaje junta en los fragmentos, si se despega del segundo.
    if (!seleccion.length && !guias.length && !objetos.length && !['envio', 'devolucion', 'derivar'].includes(campoIntencion)) {
      const porDoc = new Map();
      for (const x of ranking) if (x.fr.tipo === 'producto' && x.base > 0) porDoc.set(x.fr.doc, Math.max(porDoc.get(x.fr.doc) || 0, x.base));
      const top = [...porDoc.entries()].sort((a, b) => b[1] - a[1]);
      if (top.length && top[0][1] >= 3.2 && (!top[1] || top[0][1] >= top[1][1] * 1.6) && desconocidas.length === 0) { seleccion = [top[0][0]]; via = 'bm25'; ranking = puntuar(seleccion); }
    }
    if (!seleccion.length && ctx.ultimo && porId.has(ctx.ultimo) && campoIntencion && !['comparar', 'listar', 'derivar', 'envio', 'devolucion'].includes(campoIntencion) && !guias.length && !cats.length && desconocidas.length === 0) {
      seleccion = [ctx.ultimo]; via = 'contexto'; ranking = puntuar(seleccion);
    }
    // Una aclaración pendiente presta su intención si la respuesta no trae una.
    let intencionFinal = campoIntencion;
    if (ctx.pendiente && (!intencionFinal || intencionFinal === 'listar') && seleccion.length) { intencionFinal = ctx.pendiente; if (via !== 'aclaracion') via = 'aclaracion'; ranking = puntuar(seleccion); }

    // Con un solo producto: las palabras de contenido que su ficha (y sus guías) no contiene también cuentan como «sin dato».
    if (seleccion.length === 1) {
      const p = porId.get(seleccion[0]);
      const propios = fragmentos.filter((x) => x.doc === p.id || p.cuidado.guias.includes(x.doc));
      for (const t of terminos) if (t.tipo === 'contenido' && !modProducto.has(t.raiz) && !propios.some((x) => x.tf.has(t.raiz)) && !desconocidas.includes(t.palabra)) desconocidas.push(t.palabra);
    }

    /* ---------- Reglas ---------- */
    const citas = [];
    const citar = (id) => {
      const fr = fragmentos.find((x) => x.id === id);
      if (!fr) return '';
      let n = citas.findIndex((c) => c.id === id);
      if (n < 0) { citas.push({ id, doc: fr.doc, campo: fr.campo, nombre: nombreDoc(fr.doc, l), etiqueta: etiquetaFragmento(fr, l), texto: fr.texto[l] }); n = citas.length - 1; }
      usados.add(id);
      return `⟦${n + 1}⟧`;
    };
    const P = (id) => porId.get(id);
    const nom = (id) => P(id).nombre[l];
    let regla = 'R1';
    let porque = '';
    let parrafos = [];
    let tabla = null;
    let opcionesUI = null;
    let acciones = [];
    let sinDato = [];
    const calculadas = [];
    let pendiente = null;
    let ultimo = ctx.ultimo || null;

    const es = l === 'es';
    const opcionesDe = (p) => opcionesQ.flatMap((r) => [...opcionRaiz.get(r)].filter((x) => x.startsWith(p.id + ':')).map((x) => x.split(':')[1]));

    const tema = campoIntencion;
    if (tema === 'derivar') {
      regla = 'R4';
      porque = es ? `La consulta pide una persona o es de posventa («${puntajes.find((p) => p.id === 'derivar').por.join(', ') || (norm.match(POSVENTA) || [''])[0]}»): eso lo resuelve el equipo, no el catálogo.` : `The question asks for a person or is about an existing order (“${puntajes.find((p) => p.id === 'derivar').por.join(', ') || (norm.match(POSVENTA) || [''])[0]}”): the team handles that, not the catalogue.`;
      parrafos = [es ? 'Esto lo tiene que ver una persona del equipo: preparé un resumen de la conversación para que no tengas que repetir nada.' : 'A person on the team needs to handle this: I put together a summary of the conversation so you do not have to repeat anything.'];
      acciones = ['persona'];
    } else if ((desconocidas.length || objetos.length) && !seleccion.length && !guias.length && !cats.length && !['envio', 'devolucion', 'garantia'].includes(tema)) {
      regla = 'R3';
      const q = [...new Set([...objetos, ...desconocidas])].map((w) => `«${w}»`);
      porque = es ? `Ningún fragmento contiene ${f.lista(q)} y no se nombró ningún producto del catálogo. Responder igual sería inventar.` : `No passage contains ${f.lista(q)} and no catalogue product was named. Answering anyway would mean making it up.`;
      parrafos = [desconocidas.length
        ? (es ? `No encuentro ${f.lista(q)} en el catálogo ni en las políticas de Ámbar, así que no te voy a dar un dato que no tengo.` : `I cannot find ${f.lista(q)} in Ámbar's catalogue or policies, so I will not give you information I do not have.`)
        : (es ? `No hay ${f.lista(q)} entre los productos del catálogo de Ámbar.` : `There are no ${f.lista(q)} among the products in Ámbar's catalogue.`)];
      if (!desconocidas.length) porque = es ? `Pregunta si venden ${f.lista(q)}: ninguna categoría ni producto del catálogo coincide; sólo aparece mencionado dentro de otra ficha.` : `Asks whether they sell ${f.lista(q)}: no catalogue category or product matches; it only appears mentioned inside another page.`;
      // ¿Hay algo relacionado en las fichas? (p. ej. la cama que no incluye colchón)
      const rel = ranking.find((x) => x.base >= 2.2 && x.fr.tipo === 'producto');
      if (rel) parrafos.push((es ? 'Lo más cercano que sí está: ' : 'The closest thing that is there: ') + `${rel.fr.texto[l]} ${citar(rel.fr.id)}`);
      parrafos.push(es ? 'Si querés, le paso la pregunta a una persona del equipo con un resumen.' : 'If you like, I can pass the question to a person on the team with a summary.');
      sinDato = [...new Set([...objetos, ...desconocidas])];
      acciones = ['persona', 'catalogo'];
    } else if (seleccion.length >= 2 && (tema === 'comparar' || via === 'nombre' || (via === 'aclaracion' && seleccion.length >= 2))) {
      regla = 'R5';
      const ids = seleccion.slice(0, 3);
      porque = es ? `Se nombraron ${ids.length} productos (${f.lista(ids.map(nom))}): comparo campo por campo y cito cada celda.` : `${ids.length} products were named (${f.lista(ids.map(nom))}): I compare field by field and cite every cell.`;
      const filas = [];
      const campos = tema && CAMPO_DE[tema] && tema !== 'comparar' ? [CAMPO_DE[tema]] : ['precio', 'medidas', 'opciones', 'plazo', 'garantia', 'cuidado'];
      for (const c of campos) filas.push({ campo: L[l].campos[c], celdas: ids.map((id) => ({ v: celda(P(id), c, l, calculadas), cita: citar(`${id}#${c}`) })) });
      tabla = { columnas: ids.map(nom), filas };
      const masBarato = [...ids].sort((a, b) => P(a).precio.desde - P(b).precio.desde)[0];
      const rapido = [...ids].sort((a, b) => minimoPlazo(P(a)) - minimoPlazo(P(b)))[0];
      parrafos = [es ? `Te los pongo lado a lado. Cada dato sale de su ficha:` : 'Here they are side by side. Every value comes from its product page:'];
      const cierre = [];
      cierre.push(es ? `El de menor precio es ${art(P(masBarato)).toLowerCase()} ${nom(masBarato)}, desde ${f.dinero(P(masBarato).precio.desde)} ${citar(masBarato + '#precio')}.` : `The lowest price is the ${nom(masBarato)}, from ${f.dinero(P(masBarato).precio.desde)} ${citar(masBarato + '#precio')}.`);
      if (ids.some((id) => minimoPlazo(P(id)) !== minimoPlazo(P(rapido)))) cierre.push(es ? `El que llega antes es ${art(P(rapido)).toLowerCase()} ${nom(rapido)} ${citar(rapido + '#plazo')}.` : `The one that arrives first is the ${nom(rapido)} ${citar(rapido + '#plazo')}.`);
      parrafos.push(cierre.join(' '));
      ultimo = null;
    } else if ((seleccion.length >= 2 || via === 'material') && (tema === 'listar' || via === 'material' || (listar.s > 0 && !['medidas', 'plazo', 'precio', 'cuidado', 'garantia', 'peso', 'armado', 'puerta', 'materiales'].includes(tema)))) {
      regla = 'R1';
      porque = via === 'material'
        ? (es ? `Pregunta qué productos vienen en un material: listo los ${seleccion.length} cuya ficha de materiales lo contiene.` : `Asks which products come in a material: I list the ${seleccion.length} whose materials passage contains it.`)
        : (es ? `Pregunta qué hay de una categoría: listo los ${seleccion.length} productos con su precio de ficha.` : `It asks what there is in a category: I list the ${seleccion.length} products with their listed price.`);
      calculadas.push(seleccion.length);
      parrafos = [es ? `En el catálogo hay ${seleccion.length}:` : `There are ${seleccion.length} in the catalogue:`];
      for (const id of seleccion) parrafos.push(`• ${nom(id)}: ${P(id).descripcion[l].replace(/\.$/, '')}. ${es ? 'Desde' : 'From'} ${f.dinero(P(id).precio.desde)} ${citar(id + '#resumen')}${citar(id + '#precio')}${via === 'material' ? citar(id + '#opciones') : ''}`);
      if (seleccion.length === 1) ultimo = seleccion[0];
      parrafos.push(es ? '¿Querés las medidas, el plazo o comparar dos de ellos?' : 'Would you like the dimensions, the lead time or a comparison of two of them?');
    } else if (seleccion.length >= 2) {
      regla = 'R2';
      porque = es ? `${seleccion.length} productos encajan (${f.lista(seleccion.map(nom))}) y la respuesta cambia según cuál sea: pregunto antes de responder.` : `${seleccion.length} products match (${f.lista(seleccion.map(nom))}) and the answer depends on which one: I ask before answering.`;
      const que = { plazo: es ? 'el plazo' : 'the lead time', medidas: es ? 'las medidas' : 'the dimensions', precio: es ? 'el precio' : 'the price', cuidado: es ? 'el cuidado' : 'care', garantia: es ? 'la garantía' : 'the warranty', peso: es ? 'el peso' : 'the weight', armado: es ? 'la entrega' : 'delivery', puerta: es ? 'si pasa por la puerta' : 'whether it fits through the door', materiales: es ? 'los materiales' : 'the materials' }[tema] || (es ? 'eso' : 'that');
      parrafos = [es ? `Tengo ${seleccion.length} que encajan y la respuesta no es la misma para todos. ¿De cuál querés saber ${que}?` : `I have ${seleccion.length} that match and the answer is not the same for all of them. Which one do you mean?`];
      calculadas.push(seleccion.length);
      opcionesUI = seleccion.map((id) => ({ id, etiqueta: nom(id), detalle: `${es ? 'desde' : 'from'} ${f.dinero(P(id).precio.desde)}` }));
      pendiente = tema && tema !== 'listar' ? tema : 'resumen';
    } else if (seleccion.length === 1) {
      const p = P(seleccion[0]);
      ultimo = p.id;
      const t = intencionFinal && intencionFinal !== 'listar' && intencionFinal !== 'comparar' ? intencionFinal : null;
      const opsQ = opcionesDe(p);
      const materialPedido = t === 'materiales' || (!t && desconocidas.length);
      if (desconocidas.length && (materialPedido || !t)) {
        regla = 'R3';
        const q = desconocidas.map((w) => `«${w}»`);
        porque = es ? `La ficha de ${p.nombre.es} no contiene ${f.lista(q)}. Muestro lo que sí dice y ofrezco una persona.` : `The ${p.nombre.en} page does not contain ${f.lista(q)}. I show what it does say and offer a person.`;
        const campoCercano = t ? CAMPO_DE[t] : 'opciones';
        parrafos = [es ? `La ficha de ${p.nombre.es} no dice nada sobre ${f.lista(q)}, así que no lo puedo confirmar.` : `The ${p.nombre.en} page says nothing about ${f.lista(q)}, so I cannot confirm it.`,
          (es ? 'Lo que sí dice: ' : 'What it does say: ') + `${textoCampo(p, campoCercano, l)} ${citar(`${p.id}#${campoCercano}`)}`,
          es ? 'Si es importante para tu compra, se lo paso a una persona del equipo.' : 'If it matters for your purchase, I can pass it to a person on the team.'];
        sinDato = desconocidas;
        acciones = ['persona'];
      } else {
        regla = 'R1';
        const r = plantilla(p, t, { l, f, citar, opsQ, numeros, calculadas, P, docPorId, ranking, fragmentos });
        parrafos = r.parrafos;
        porque = (via === 'contexto' ? (es ? `No se nombró producto: uso el de la pregunta anterior (${p.nombre.es}). ` : `No product named: I use the one from the previous question (${p.nombre.en}). `) : '') + r.porque;
        if (desconocidas.length) { parrafos.push(es ? `No encontré ${f.lista(desconocidas.map((w) => `«${w}»`))} en la ficha.` : `I could not find ${f.lista(desconocidas.map((w) => `«${w}»`))} on the product page.`); sinDato = desconocidas; }
        if (r.acciones) acciones = r.acciones;
      }
    } else if (guias.length || ['envio', 'devolucion', 'garantia', 'cuidado'].includes(tema)) {
      // Documentos: guías de cuidado y políticas.
      const docs = guias.length ? guias : (tema === 'cuidado' ? ['terciopelo', 'madera'] : ['envios', 'devoluciones']);
      const campoDoc = tema === 'devolucion' ? 'devolucion' : tema === 'garantia' ? 'garantia' : tema === 'envio' ? 'envio' : tema === 'plazo' ? 'plazo' : 'cuidado';
      const cand = ranking.filter((x) => docs.includes(x.fr.doc) && x.base > 0 && (x.fr.campo === campoDoc || tema === null));
      if (!cand.length && !tema) {
        regla = 'R2';
        porque = es ? 'Se nombró un material pero no qué se quiere saber.' : 'A material was named but not what the person wants to know.';
        parrafos = [es ? `Sobre ${docPorId.get(docs[0]).nombre.es.toLowerCase()} puedo responder cómo limpiarlo, qué evitar y cómo sacar manchas. ¿Qué necesitás?` : `About the ${docPorId.get(docs[0]).nombre.en.toLowerCase()}, I can tell you how to clean it, what to avoid and how to remove stains. What do you need?`];
        pendiente = 'cuidado';
      } else {
        const elegidos = (cand.length ? cand : ranking.filter((x) => docs.includes(x.fr.doc) && x.fr.campo === campoDoc)).slice(0, 2).filter((x, i, a) => i === 0 || x.total >= a[0].total * 0.5);
        if (!elegidos.length) {
          regla = 'R3';
          porque = es ? 'Las políticas no tienen un fragmento que responda esto.' : 'The policies have no passage that answers this.';
          parrafos = [es ? 'Eso no está en las políticas de Ámbar. Te paso con una persona del equipo.' : 'That is not in Ámbar\'s policies. I can pass you to a person on the team.'];
          acciones = ['persona'];
        } else {
          regla = 'R1';
          const d = docPorId.get(elegidos[0].fr.doc);
          porque = es ? `Tema de ${tema === 'cuidado' || !tema ? 'cuidado' : 'política'} sin producto: cito ${elegidos.length === 1 ? 'el fragmento' : 'los 2 fragmentos'} con más puntaje de «${d.nombre.es}».` : `A ${tema === 'cuidado' || !tema ? 'care' : 'policy'} question with no product: I cite the ${elegidos.length === 1 ? 'top passage' : 'top 2 passages'} from “${d.nombre.en}”.`;
          parrafos = [es ? (/^(Guía|Política)/.test(d.nombre.es) ? `Según la ${d.nombre.es.charAt(0).toLowerCase() + d.nombre.es.slice(1)}:` : `Según «${d.nombre.es}»:`) : (/(guide|policy)$/i.test(d.nombre.en) ? `According to the ${d.nombre.en.charAt(0).toLowerCase() + d.nombre.en.slice(1)}:` : `According to “${d.nombre.en}”:`)];
          for (const x of elegidos) parrafos.push(`${x.fr.texto[l]} ${citar(x.fr.id)}`);
          if (tema === 'envio' && desconocidas.length) { parrafos.push(es ? `No tengo el costo exacto para ${f.lista(desconocidas.map((w) => `«${w}»`))}: eso lo cotiza el equipo.` : `I do not have the exact cost for ${f.lista(desconocidas.map((w) => `“${w}”`))}: the team quotes that.`); sinDato = desconocidas; acciones = ['persona']; }
        }
      }
    } else {
      regla = 'R2';
      if (tema && tema !== 'listar') {
        porque = es ? `Se entiende qué dato se busca (${NOMBRE_TEMA.es[tema] || tema}) pero no de qué producto, y no hay uno en la conversación.` : `It is clear which detail is wanted (${NOMBRE_TEMA.en[tema] || tema}) but not for which product, and there is none earlier in the conversation.`;
        parrafos = [es ? '¿De qué producto? Puedo responder sobre cualquiera de las fichas del catálogo.' : 'Which product? I can answer about any product in the catalogue.'];
        pendiente = tema;
      } else {
        porque = es ? 'La consulta no nombra producto, categoría ni tema del catálogo.' : 'The question names no product, category or catalogue topic.';
        parrafos = [es ? 'Puedo responder medidas, plazos, precios, cuidado y garantía de los muebles de Ámbar, y compararlos. ¿Qué te interesa?' : 'I can answer dimensions, lead times, prices, care and warranty for Ámbar\'s furniture, and compare them. What are you interested in?'];
      }
      opcionesUI = [['sofa', es ? 'Sofás' : 'Sofas'], ['butaca', es ? 'Butacas' : 'Armchairs'], ['mesa', es ? 'Mesas' : 'Tables'], ['silla', es ? 'Sillas' : 'Chairs'], ['cama', es ? 'Camas' : 'Beds']].map(([c, e]) => ({ categoria: c, etiqueta: e }));
    }

    // Verificación: cada cifra de la respuesta tiene que estar en un fragmento citado, en la consulta o ser un cálculo declarado.
    const plano = [...parrafos, ...(tabla ? tabla.filas.flatMap((fi) => fi.celdas.map((c) => c.v)) : [])].join(' ').replace(/⟦\d+⟧/g, '');
    const cifras = extraerCifras(plano);
    const fuente = new Set([...citas.flatMap((c) => extraerCifras(c.texto)), ...numeros.map(String)]);
    const calc = new Set(calculadas.map(String));
    const faltan = cifras.filter((c) => !fuente.has(c) && !calc.has(c));
    const verificacion = { cifras: cifras.length, encontradas: cifras.filter((c) => fuente.has(c)).length, calculadas: cifras.filter((c) => calc.has(c) && !fuente.has(c)).length, faltan, ok: faltan.length === 0 };
    if (!verificacion.ok) {
      // Una respuesta que no pasa la verificación no sale: se deriva.
      regla = 'R4';
      porque += es ? ` La verificación encontró cifras sin fuente (${faltan.join(', ')}): no se envía y se deriva.` : ` Verification found figures with no source (${faltan.join(', ')}): it is not sent and goes to a person.`;
      parrafos = [es ? 'Prefiero que esto lo confirme una persona del equipo.' : 'I would rather a person on the team confirms this.'];
      tabla = null;
      acciones = ['persona'];
    }

    const recuperados = ranking.filter((x) => x.total > 0).slice(0, 6).map((x) => ({ id: x.fr.id, nombre: nombreDoc(x.fr.doc, l), etiqueta: etiquetaFragmento(x.fr, l), base: x.base, bonoCampo: x.bonoCampo, bonoProducto: x.bonoProducto, total: x.total, usado: usados.has(x.fr.id) }));
    for (const c of citas) if (!recuperados.some((r) => r.id === c.id)) { const x = ranking.find((y) => y.fr.id === c.id); recuperados.push({ id: c.id, nombre: c.nombre, etiqueta: c.etiqueta, base: x ? x.base : 0, bonoCampo: x ? x.bonoCampo : 0, bonoProducto: x ? x.bonoProducto : 0, total: x ? x.total : 0, usado: true, fuera: true }); }
    const ms = (typeof performance !== 'undefined' ? performance : Date).now() - t0;
    const salida = {
      regla: `${regla}_${REGLAS[regla]}`,
      intencion: intencionFinal || null,
      productos: seleccion,
      respuesta: [...parrafos, ...(tabla ? [`[${es ? 'tabla' : 'table'}: ${tabla.filas.length}×${tabla.columnas.length}]`] : [])].join(' ').replace(/⟦(\d+)⟧/g, '[$1]').replace(/\s+/g, ' ').trim(),
      citas: citas.map((c, i) => ({ n: i + 1, ficha: c.doc, campo: c.campo })),
      sin_dato: sinDato,
      derivar: regla === 'R4',
    };
    return {
      consulta, idioma: l, terminos, intencion: intencionFinal ? { id: intencionFinal, por: (puntajes.find((p) => p.id === intencionFinal) || { por: [] }).por } : null,
      seleccion, via, regla, nombreRegla: REGLAS[regla], porque, parrafos, tabla, opciones: opcionesUI, acciones, citas, recuperados,
      verificacion, salida, pendiente, ultimo, sinDato, ms, indice: { fragmentos: N, productos: productos.length, documentos: documentos.length, terminos: vocabulario.size },
    };
  }

  function nombreDoc(id, l) { return porId.has(id) ? porId.get(id).nombre[l] : docPorId.get(id).nombre[l]; }
  function etiquetaFragmento(fr, l) { return fr.tipo === 'producto' ? L[l].campos[fr.campo] : fr.titulo[l]; }
  function ficha(id) { return porId.get(id) || docPorId.get(id); }
  function fragmentosDe(id, l) { return fragmentos.filter((x) => x.doc === id).map((x) => ({ id: x.id, etiqueta: etiquetaFragmento(x, l), texto: x.texto[l] })); }

  return { responder, ficha, fragmentosDe, productos, documentos, total: fragmentos.length, vocabulario: vocabulario.size, nombreDoc };
}

/* ---------- Plantillas de respuesta por campo ---------- */
function plantilla(p, t, k) {
  const { l, f, citar, opsQ, numeros, calculadas, docPorId, ranking } = k;
  const es = l === 'es';
  const n = p.nombre[l];
  const m = p.medidas;
  const id = p.id;
  const out = { parrafos: [], porque: '' };
  switch (t) {
    case 'medidas': {
      out.porque = es ? 'Un producto y una pregunta de medidas: respondo con el fragmento «Medidas» de su ficha.' : 'One product and a dimensions question: I answer from the “Dimensions” passage of its page.';
      if (p.categoria === 'alfombra') out.parrafos.push(es ? `La ${n} mide ${m.ancho} × ${m.prof} cm ${citar(id + '#medidas')}. ${m.extra.es} ${citar(id + '#medidas')}` : `The ${n} measures ${m.ancho} × ${m.prof} cm ${citar(id + '#medidas')}. ${m.extra.en} ${citar(id + '#medidas')}`);
      else out.parrafos.push(es ? `${art(p)} ${n} mide ${m.ancho} cm de ancho, ${m.prof} de profundidad y ${m.alto} de alto ${citar(id + '#medidas')}. ${m.extra.es} ${citar(id + '#medidas')}` : `The ${n} is ${m.ancho} cm wide, ${m.prof} deep and ${m.alto} high ${citar(id + '#medidas')}. ${m.extra.en} ${citar(id + '#medidas')}`);
      break;
    }
    case 'puerta': {
      const puerta = numeros.find((x) => x >= 40 && x <= 150);
      const bultos = p.entrega.bultos;
      const mayor = [...bultos].sort((a, b) => Math.max(...b) - Math.max(...a))[0];
      const canto = Math.min(...mayor);
      out.porque = es ? 'Pregunta si pasa por una puerta: comparo la medida más chica del bulto más grande (fragmento «Entrega y peso») con el ancho que dio el cliente.' : 'Asks whether it fits through a door: I compare the smallest side of the largest package (“Delivery and weight” passage) with the width the customer gave.';
      if (!puerta) {
        out.parrafos.push(es ? `${art(p)} ${n} viaja en ${bultos.length > 1 ? 'bultos de' : 'un bulto de'} ${bultos.map(dims).join(' y ')} cm ${citar(id + '#entrega')}. ¿Cuánto mide de ancho la puerta? Con ese número te digo si pasa.` : `The ${n} ships in ${bultos.length > 1 ? 'packages of' : 'one package of'} ${bultos.map(dims).join(' and ')} cm ${citar(id + '#entrega')}. How wide is the door? With that number I can tell you whether it fits.`);
        break;
      }
      const margen = puerta - canto;
      calculadas.push(Math.abs(margen));
      const elBulto = es ? (bultos.length > 1 ? 'el bulto más grande' : 'la caja') : (bultos.length > 1 ? 'the largest package' : 'the box');
      if (margen >= 5) out.parrafos.push(es ? `Sí, debería pasar: ${elBulto} mide ${dims(mayor)} cm ${citar(id + '#entrega')} y de canto queda en ${canto} cm, ${margen} cm menos que tu puerta de ${puerta}.` : `Yes, it should fit: ${elBulto} is ${dims(mayor)} cm ${citar(id + '#entrega')} and on its side it is ${canto} cm, ${margen} cm narrower than your ${puerta} cm door.`);
      else if (margen >= 0) out.parrafos.push(es ? `Pasa justo: ${elBulto} mide ${dims(mayor)} cm y de canto queda en ${canto} cm, apenas ${margen} cm menos que tu puerta de ${puerta} ${citar(id + '#entrega')}. Medí también el marco y el pasillo.` : `It is a tight fit: ${elBulto} is ${dims(mayor)} cm and on its side it is ${canto} cm, just ${margen} cm narrower than your ${puerta} cm door ${citar(id + '#entrega')}. Measure the frame and the hallway too.`);
      else out.parrafos.push(es ? `Así como viaja, no pasa: ${elBulto} mide ${dims(mayor)} cm y aun de canto queda en ${canto} cm, ${-margen} cm más que tu puerta de ${puerta} ${citar(id + '#entrega')}.` : `As it ships, it will not fit: ${elBulto} is ${dims(mayor)} cm and even on its side it is ${canto} cm, ${-margen} cm wider than your ${puerta} cm door ${citar(id + '#entrega')}.`);
      out.parrafos.push(es ? 'Si hay escalera, un pasillo con giro o un ascensor chico, conviene que lo confirme alguien del equipo de entregas.' : 'If there are stairs, a hallway with a turn or a small lift, it is best to have someone from the delivery team confirm it.');
      out.acciones = ['persona'];
      break;
    }
    case 'plazo': {
      out.porque = es ? `Pregunta de plazo${opsQ.length ? ' con una opción nombrada' : ''}: respondo con el fragmento «Plazo» y cito desde cuándo corre (política de envíos).` : `Lead time question${opsQ.length ? ' with a named option' : ''}: I answer from the “Lead time” passage and cite when it starts (delivery policy).`;
      const reglas = opsQ.length ? p.plazos.filter((r) => r.opciones.some((o) => opsQ.includes(o))) : p.plazos;
      if (opsQ.length && reglas.length) {
        const r = reglas[0];
        const op = f.lista(opsQ.filter((o) => r.opciones.includes(o)).map((o) => nombreOpcion(p, o, l)));
        out.parrafos.push(es ? `En ${op}, ${art(p).toLowerCase()} ${n} está ${r.es} ${citar(id + '#plazo')}.` : `In ${op}, the ${n} is ${r.en} ${citar(id + '#plazo')}.`);
        const rapido = p.plazos.find((x) => x.estado === 'stock');
        if (r.estado !== 'stock' && rapido) out.parrafos.push(es ? `Si lo necesitás antes: en ${f.lista(rapido.opciones.map((o) => nombreOpcion(p, o, l)))} está ${rapido.es} ${citar(id + '#plazo')}.` : `If you need it sooner: in ${f.lista(rapido.opciones.map((o) => nombreOpcion(p, o, l)))} it is ${rapido.en} ${citar(id + '#plazo')}.`);
      } else if (p.plazos.length === 1) {
        out.parrafos.push(es ? `${art(p)} ${n} está ${p.plazos[0].es} ${citar(id + '#plazo')}.` : `The ${n} is ${p.plazos[0].en} ${citar(id + '#plazo')}.`);
      } else {
        out.parrafos.push(es ? `Depende de la terminación que elijas ${citar(id + '#plazo')}:` : `It depends on the option you choose ${citar(id + '#plazo')}:`);
        for (const r of p.plazos) out.parrafos.push(`• ${f.lista(r.opciones.map((o) => nombreOpcion(p, o, l)))}: ${r[l]}.`);
      }
      out.parrafos.push((es ? 'El plazo corre desde que se confirma el pago.' : 'The lead time starts once payment is confirmed.') + ` ${citar('envios#plazo')}`);
      break;
    }
    case 'cuidado': {
      out.porque = es ? 'Pregunta de cuidado: cito el fragmento «Cuidado» de la ficha y la sección de la guía que más puntaje sacó.' : 'Care question: I cite the “Care” passage of the page and the highest-scoring section of the guide.';
      if (p.cuidado[l]) out.parrafos.push(`${p.cuidado[l]} ${citar(id + '#cuidado')}`);
      const secs = ranking.filter((x) => p.cuidado.guias.includes(x.fr.doc)).slice(0, 2);
      const elegidas = secs.filter((x) => x.base > 0).length ? secs.filter((x) => x.base > 0) : p.cuidado.guias.map((g) => ranking.find((x) => x.fr.doc === g)).filter(Boolean).slice(0, 1);
      for (const x of elegidas) out.parrafos.push(`${x.fr.texto[l]} ${citar(x.fr.id)}`);
      if (!out.parrafos.length) out.parrafos.push(`${textoCampo(p, 'cuidado', l)} ${citar(id + '#cuidado')}`);
      break;
    }
    case 'garantia': {
      out.porque = es ? 'Pregunta de garantía con producto: cito la garantía de la ficha y qué cubre según la política.' : 'Warranty question with a product: I cite the page warranty and what the policy covers.';
      out.parrafos.push(es ? `${art(p)} ${n} tiene ${p.garantia.es.replace(/\.$/, '')} ${citar(id + '#garantia')}.` : `The ${n} has ${p.garantia.en.replace(/\.$/, '')} ${citar(id + '#garantia')}.`);
      out.parrafos.push(`${docPorId.get('devoluciones').secciones.find((s) => s.id === 'cubre')[l]} ${citar('devoluciones#cubre')}`);
      break;
    }
    case 'devolucion': {
      out.porque = es ? 'Devolución de un producto: depende de si está en stock o se fabrica para el cliente; cruzo el fragmento «Plazo» con la política.' : 'Returning a product: it depends on whether it is in stock or made for the customer; I cross the “Lead time” passage with the policy.';
      const dev = docPorId.get('devoluciones').secciones;
      const reglas = opsQ.length ? p.plazos.filter((r) => r.opciones.some((o) => opsQ.includes(o))) : p.plazos;
      const varias = p.plazos.length > 1;
      for (const r of reglas) {
        const ops = f.lista((opsQ.length ? r.opciones.filter((o) => opsQ.includes(o)) : r.opciones).map((o) => nombreOpcion(p, o, l)));
        const quien = varias ? (es ? `En ${ops}, ${art(p).toLowerCase()} ${n}` : `In ${ops}, the ${n}`) : (es ? `${art(p)} ${n}` : `The ${n}`);
        if (r.estado === 'stock') out.parrafos.push(es ? `${quien} está en stock ${citar(id + '#plazo')}, así que se puede devolver dentro de los 30 días de la entrega, sin uso y en su embalaje; el retiro lo paga Ámbar ${citar('devoluciones#stock')}.` : `${quien} is in stock ${citar(id + '#plazo')}, so it can be returned within 30 days of delivery, unused and in its packaging; Ámbar pays for the pickup ${citar('devoluciones#stock')}.`);
        else out.parrafos.push(es ? `${quien} se fabrica ${r.estado === 'pedido' ? 'a pedido' : 'en taller'} ${citar(id + '#plazo')}, así que no tiene devolución, salvo falla ${citar('devoluciones#pedido')}.` : `${quien} is ${r.estado === 'pedido' ? 'made to order' : 'made in the workshop'} ${citar(id + '#plazo')}, so it cannot be returned except for faults ${citar('devoluciones#pedido')}.`);
      }
      if (opsQ.length && reglas.length && reglas.every((r) => r.estado !== 'stock')) {
        const st = p.plazos.find((r) => r.estado === 'stock');
        if (st) out.parrafos.push(es ? `Si querés poder devolverlo: ${f.lista(st.opciones.map((o) => nombreOpcion(p, o, l)))} ${st.opciones.length > 1 ? 'están' : 'está'} en stock ${citar(id + '#plazo')}.` : `If you want to be able to return it: ${f.lista(st.opciones.map((o) => nombreOpcion(p, o, l)))} is in stock ${citar(id + '#plazo')}.`);
      }
      void dev;
      break;
    }
    case 'envio': {
      out.porque = es ? 'Envío de un producto: comparo su precio de ficha con el mínimo de envío sin cargo de la política.' : 'Delivery for a product: I compare its listed price with the free-delivery minimum in the policy.';
      const gratis = p.precio.desde >= 1000;
      out.parrafos.push(es ? `${art(p)} ${n} sale desde ${f.dinero(p.precio.desde)} ${citar(id + '#precio')} y el envío no tiene cargo desde ${f.dinero(1000)} ${citar('envios#costo')}: ${gratis ? 'en tu caso, el envío es sin cargo dentro del área de cobertura.' : 'si es la única compra, el costo se calcula en el carrito con tu código postal.'}` : `The ${n} is from ${f.dinero(p.precio.desde)} ${citar(id + '#precio')} and delivery is free from ${f.dinero(1000)} ${citar('envios#costo')}: ${gratis ? 'so delivery is free within the coverage area.' : 'if it is your only item, the cost is worked out in the cart from your postcode.'}`);
      out.parrafos.push(`${docPorId.get('envios').secciones.find((s) => s.id === 'pisos')[l]} ${citar('envios#pisos')}`);
      break;
    }
    case 'precio': {
      out.porque = es ? 'Pregunta de precio: cito el precio de ficha y el rango de recargos de las opciones.' : 'Price question: I cite the listed price and the range of option surcharges.';
      out.parrafos.push(es ? `${art(p)} ${n} sale desde ${f.dinero(p.precio.desde)}, ${p.precio.es} ${citar(id + '#precio')}.` : `The ${n} is from ${f.dinero(p.precio.desde)}, ${p.precio.en} ${citar(id + '#precio')}.`);
      const extras = p.opciones.flatMap((g) => g.valores.map((v) => v.extra)).filter((x) => x > 0);
      if (extras.length && p.categoria !== 'alfombra') {
        const mn = Math.min(...extras); const mx = Math.max(...extras);
        out.parrafos.push(es ? (mn === mx ? `Hay opciones que suman ${f.dinero(mn)} ${citar(id + '#opciones')}.` : `Algunas opciones suman entre ${f.dinero(mn)} y ${f.dinero(mx)} ${citar(id + '#opciones')}.`) : (mn === mx ? `Some options add ${f.dinero(mn)} ${citar(id + '#opciones')}.` : `Some options add between ${f.dinero(mn)} and ${f.dinero(mx)} ${citar(id + '#opciones')}.`));
      }
      break;
    }
    case 'peso': {
      out.porque = es ? 'Pregunta de peso: está en el fragmento «Entrega y peso».' : 'Weight question: it is in the “Delivery and weight” passage.';
      out.parrafos.push(es ? `${art(p)} ${n} pesa ${p.entrega.peso} kg ${citar(id + '#entrega')}.` : `The ${n} weighs ${p.entrega.peso} kg ${citar(id + '#entrega')}.`);
      break;
    }
    case 'armado': {
      out.porque = es ? 'Pregunta de armado o bultos: respondo con el fragmento «Entrega y peso».' : 'Assembly or packages question: I answer from the “Delivery and weight” passage.';
      out.parrafos.push(`${p.entrega[l]} ${citar(id + '#entrega')}`);
      out.parrafos.push(es ? `${p.entrega.bultos.length > 1 ? 'Bultos' : 'Bulto'}: ${p.entrega.bultos.map(dims).join(' y ')} cm ${citar(id + '#entrega')}.` : `${p.entrega.bultos.length > 1 ? 'Packages' : 'Package'}: ${p.entrega.bultos.map(dims).join(' and ')} cm ${citar(id + '#entrega')}.`);
      break;
    }
    case 'materiales': {
      out.porque = es ? 'Pregunta de materiales u opciones: cito el fragmento «Materiales y opciones».' : 'Materials or options question: I cite the “Materials and options” passage.';
      out.parrafos.push(`${p.materiales[l]} ${citar(id + '#opciones')}`);
      for (const g of p.opciones) out.parrafos.push(`• ${g.grupo[l]}: ${f.lista(g.valores.map((v) => (v.extra ? `${v[l]} (+${f.dinero(v.extra)})` : v[l])))} ${citar(id + '#opciones')}`);
      break;
    }
    default: {
      out.porque = es ? 'Se nombró el producto sin una pregunta concreta: doy el resumen de su ficha (descripción, precio y plazo).' : 'The product was named without a specific question: I give the summary of its page (description, price and lead time).';
      out.parrafos.push(`${p.descripcion[l]} ${citar(id + '#resumen')}`);
      out.parrafos.push(es ? `Sale desde ${f.dinero(p.precio.desde)} ${citar(id + '#precio')} y ${p.plazos.length > 1 ? 'el plazo depende de la terminación' : `está ${p.plazos[0].es}`} ${citar(id + '#plazo')}.` : `It is from ${f.dinero(p.precio.desde)} ${citar(id + '#precio')} and ${p.plazos.length > 1 ? 'the lead time depends on the option' : `it is ${p.plazos[0].en}`} ${citar(id + '#plazo')}.`);
      out.parrafos.push(es ? '¿Querés medidas, materiales o cuidado?' : 'Would you like the dimensions, materials or care?');
    }
  }
  return out;
}
function art(p) { return ['mesa', 'silla', 'butaca', 'lampara', 'alfombra', 'cama'].includes(p.categoria) ? 'La' : 'El'; }
function minimoPlazo(p) {
  const orden = { stock: 0, taller: 1, pedido: 2 };
  return Math.min(...p.plazos.map((r) => orden[r.estado]));
}
function celda(p, campo, l, calculadas = []) {
  const f = L[l];
  const es = l === 'es';
  const m = p.medidas;
  switch (campo) {
    case 'precio': return `${es ? 'desde' : 'from'} ${f.dinero(p.precio.desde)}`;
    case 'medidas': return p.categoria === 'alfombra' ? `${m.ancho} × ${m.prof} cm` : `${m.ancho} × ${m.prof} × ${m.alto} cm`;
    case 'opciones': return p.opciones.map((g) => { calculadas.push(g.valores.length); return `${g.grupo[l]}: ${g.valores.length} ${es ? (g.valores.length > 1 ? 'opciones' : 'opción') : (g.valores.length > 1 ? 'options' : 'option')}`; }).join(' · ');
    case 'plazo': { const r = [...p.plazos].sort((a, b) => ({ stock: 0, taller: 1, pedido: 2 }[a.estado] - { stock: 0, taller: 1, pedido: 2 }[b.estado]))[0]; return `${r[l]}${p.plazos.length > 1 ? (es ? ' (la opción más rápida)' : ' (fastest option)') : ''}`; }
    case 'garantia': return p.garantia[l].replace(/\.$/, '');
    case 'cuidado': return (p.cuidado[l] || '').split('. ')[0].replace(/\.$/, '') || (es ? 'según la guía de la madera' : 'per the wood guide');
    case 'entrega': calculadas.push(p.entrega.bultos.length); return `${p.entrega.bultos.length} ${es ? (p.entrega.bultos.length > 1 ? 'bultos' : 'bulto') : (p.entrega.bultos.length > 1 ? 'packages' : 'package')} · ${p.entrega.peso} kg`;
    default: return '';
  }
}
export function extraerCifras(s) {
  return (String(s).match(/\d{1,3}(?:[.,]\d{3})+|\d+/g) || []).map((x) => x.replace(/[.,]/g, ''));
}
function subsecuencia(a, b) {
  let i = 0;
  for (const c of b) if (c === a[i]) i++;
  return i === a.length;
}
function distancia(a, b, tope) {
  const m = a.length; const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let prev2 = prev;
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    let minFila = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      if (cur[j] < minFila) minFila = cur[j];
    }
    if (minFila > tope) return tope + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[n];
}
