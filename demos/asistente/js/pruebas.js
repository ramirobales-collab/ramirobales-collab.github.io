// Preguntas de prueba del asistente: cada una dice qué regla se espera y sobre qué fichas.
// Las corre el botón «Correr las pruebas» de la página y también el script de verificación en Node.
// «sigue» = la pregunta se hace después de la anterior (prueba el contexto de la conversación).
export const PRUEBAS = [
  // Las seis sugeridas, en los dos idiomas
  { q: '¿Tienen colchones de dos plazas?', l: 'es', regla: 'R3', cita: ['estela'] },
  { q: '¿Cuánto tarda en llegar la mesa?', l: 'es', regla: 'R2', productos: ['sauce', 'alba', 'nido'] },
  { q: '¿La Butaca Lúa entra por una puerta de 70 cm?', l: 'es', regla: 'R1', productos: ['lua'], campo: 'entrega' },
  { q: 'Si compro el Sofá Duna en terciopelo Musgo, ¿cuándo me llega?', l: 'es', regla: 'R1', productos: ['duna'], campo: 'plazo' },
  { q: '¿Cómo saco una mancha del terciopelo?', l: 'es', regla: 'R1', cita: ['terciopelo'] },
  { q: '¿Qué diferencia hay entre el Sofá Duna y el Sofá Bruma?', l: 'es', regla: 'R5', productos: ['duna', 'bruma'] },
  { q: 'Do you sell mattresses?', l: 'en', regla: 'R3', cita: ['estela'] },
  { q: 'How long does the table take to arrive?', l: 'en', regla: 'R2', productos: ['sauce', 'alba', 'nido'] },
  { q: 'Will the Lúa armchair fit through a 70 cm door?', l: 'en', regla: 'R1', productos: ['lua'], campo: 'entrega' },
  { q: 'If I order the Duna sofa in Moss velvet, when will it arrive?', l: 'en', regla: 'R1', productos: ['duna'], campo: 'plazo' },
  { q: 'How do I get a stain out of velvet?', l: 'en', regla: 'R1', cita: ['terciopelo'] },
  { q: 'What is the difference between the Duna and Bruma sofas?', l: 'en', regla: 'R5', productos: ['duna', 'bruma'] },
  // Medidas, precio, peso, materiales
  { q: '¿Cuánto mide la mesa de comedor Alba?', l: 'es', regla: 'R1', productos: ['alba'], campo: 'medidas' },
  { q: 'medidas del escritorio', l: 'es', regla: 'R1', productos: ['faro'], campo: 'medidas' },
  { q: '¿Cuánto pesa el aparador?', l: 'es', regla: 'R1', productos: ['cierzo'], campo: 'entrega' },
  { q: '¿Cuánto sale la alfombra Trama?', l: 'es', regla: 'R1', productos: ['trama'], campo: 'precio' },
  { q: '¿En qué colores viene la Silla Vera?', l: 'es', regla: 'R1', productos: ['vera'], campo: 'opciones' },
  { q: 'How much is the Faro desk?', l: 'en', regla: 'R1', productos: ['faro'], campo: 'precio' },
  { q: 'How tall is the Lumbre lamp?', l: 'en', regla: 'R1', productos: ['lumbre'], campo: 'medidas' },
  // Contexto de la conversación
  { q: 'Contame del Sofá Bruma', l: 'es', regla: 'R1', productos: ['bruma'] },
  { q: '¿y cuánto pesa?', l: 'es', regla: 'R1', productos: ['bruma'], campo: 'entrega', sigue: true },
  { q: '¿se puede lavar?', l: 'es', regla: 'R1', productos: ['bruma'], campo: 'cuidado', sigue: true },
  // Aclaración resuelta escribiendo
  { q: '¿Cuánto mide la mesa?', l: 'es', regla: 'R2', productos: ['sauce', 'alba', 'nido'] },
  { q: 'la ratona', l: 'es', regla: 'R1', productos: ['sauce'], campo: 'medidas', sigue: true },
  // Plazos y stock
  { q: '¿La mesa de luz Nido está en stock?', l: 'es', regla: 'R1', productos: ['nido'], campo: 'plazo' },
  { q: 'Is the Estela bed in stock?', l: 'en', regla: 'R1', productos: ['estela'], campo: 'plazo' },
  // No está: en el catálogo o en la ficha
  { q: '¿Puedo pagar en cuotas?', l: 'es', regla: 'R3' },
  { q: '¿La lámpara Lumbre es regulable?', l: 'es', regla: 'R3', productos: ['lumbre'] },
  { q: '¿El Sofá Duna viene en cuero?', l: 'es', regla: 'R3', productos: ['duna'] },
  { q: 'Do you have outdoor furniture?', l: 'en', regla: 'R3' },
  // Políticas
  { q: '¿Cuánto cuesta el envío?', l: 'es', regla: 'R1', cita: ['envios'] },
  { q: '¿Puedo devolver un producto?', l: 'es', regla: 'R1', cita: ['devoluciones'] },
  { q: '¿Puedo devolver el sofá Duna si lo pido en Musgo?', l: 'es', regla: 'R1', productos: ['duna'], cita: ['devoluciones'] },
  { q: '¿Qué cubre la garantía de la Butaca Lúa?', l: 'es', regla: 'R1', productos: ['lua'], campo: 'garantia' },
  // Listas y comparaciones
  { q: '¿Qué mesas tienen?', l: 'es', regla: 'R1', productos: ['sauce', 'alba', 'nido'] },
  { q: '¿Tienen algo en terciopelo?', l: 'es', regla: 'R1', productos: ['lua', 'duna', 'vera'] },
  { q: '¿Cuál es más barato, el Duna o el Bruma?', l: 'es', regla: 'R5', productos: ['duna', 'bruma'] },
  { q: 'Compare the sofas', l: 'en', regla: 'R5', productos: ['duna', 'bruma'] },
  // Derivación a una persona
  { q: 'Quiero hablar con una persona', l: 'es', regla: 'R4' },
  { q: 'Mi pedido llegó con una pata rota', l: 'es', regla: 'R4' },
  { q: 'Can I talk to a human?', l: 'en', regla: 'R4' },
  { q: '¿Me hacen un descuento si llevo dos sillas?', l: 'es', regla: 'R4' },
  // Frases libres que no estaban en la lista original
  { q: 'necesito una mesa para comer 8 personas', l: 'es', regla: 'R1', productos: ['alba'], campo: 'medidas' },
  { q: 'la butaca viene en verde?', l: 'es', regla: 'R3', productos: ['lua'] },
  { q: 'cuanto cuesta enviar el sofa duna a un tercer piso', l: 'es', regla: 'R1', productos: ['duna'], cita: ['envios'] },
  { q: 'quiero que me atienda alguien', l: 'es', regla: 'R4' },
  { q: 'Do you deliver to Chile?', l: 'en', regla: 'R1', cita: ['envios'] },
  { q: "hey, what's the difference between the bruma and the duna?", l: 'en', regla: 'R5', productos: ['bruma', 'duna'] },
  // Errores de tipeo y sin tema
  { q: '¿Cuanto mide la butca Lua?', l: 'es', regla: 'R1', productos: ['lua'], campo: 'medidas' },
  { q: 'hola', l: 'es', regla: 'R2' },
];

// Corre la lista con un motor ya creado. Devuelve una fila por prueba.
export function correrPruebas(motor) {
  const filas = [];
  let ctx = {};
  for (const p of PRUEBAS) {
    if (!p.sigue) ctx = {};
    const r = motor.responder(p.q, { idioma: p.l, contexto: ctx });
    ctx = { ultimo: r.ultimo, pendiente: r.pendiente, candidatos: r.opciones ? r.opciones.map((o) => o.id).filter(Boolean) : null };
    const fallas = [];
    if (r.regla !== p.regla) fallas.push(`regla ${r.regla}`);
    if (p.productos && p.productos.join() !== r.seleccion.join()) fallas.push(`productos ${r.seleccion.join(',') || '—'}`);
    if (p.campo && !r.citas.some((c) => c.campo === p.campo && p.productos.includes(c.doc))) fallas.push(`sin cita de ${p.campo}`);
    if (p.cita && !p.cita.every((d) => r.citas.some((c) => c.doc === d))) fallas.push(`sin cita de ${p.cita.join(',')}`);
    if (['R1', 'R5'].includes(r.regla) && !r.citas.length) fallas.push('respuesta sin cita');
    if (!r.verificacion.ok) fallas.push(`cifras sin fuente ${r.verificacion.faltan.join(',')}`);
    filas.push({ ...p, obtenida: r.regla, ms: r.ms, ok: fallas.length === 0, fallas });
  }
  return filas;
}
