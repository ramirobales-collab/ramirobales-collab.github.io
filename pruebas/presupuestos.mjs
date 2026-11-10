// Presupuestos de peso (pruebas/config.json → presupuestos). La primera carga de la portada se calcula
// de forma estática y conservadora: el HTML, sus hojas, sus scripts con todo su grafo de import, lo que
// precarga (fuentes, mundo.json), el póster horizontal y el juego de láminas h que pide el motor. No cuenta
// las imágenes diferidas (loading="lazy"), que llegan al deslizar. La prueba de humo la mide además en red.
import { statSync, existsSync } from 'node:fs';
import { join, posix } from 'node:path';
import { archivos, leer, etiquetas, bloques, resolver } from './lib/html.mjs';

export const nombre = 'presupuestos';
export const descripcion = 'láminas h/v, pósters, CSS crítico y primera carga de la portada';

const kb = (b) => `${(b / 1000).toFixed(1)} KB`;
const tam = (raiz, r) => { try { return statSync(join(raiz, r)).size; } catch { return 0; } };

export function primeraCarga(raiz, pagina = 'index.html') {
  const vistos = new Set([pagina]);
  const agregar = (desde, url) => { const r = resolver(desde, url); if (r && existsSync(join(raiz, r.ruta))) { if (!vistos.has(r.ruta)) { vistos.add(r.ruta); return r.ruta; } } return null; };
  const texto = leer(raiz, pagina);
  const js = [];
  for (const e of etiquetas(texto)) {
    const a = e.attrs;
    if (e.tag === 'link' && /\bstylesheet\b/.test(a.rel || '')) agregar(pagina, a.href);
    if (e.tag === 'link' && /\b(preload|modulepreload)\b/.test(a.rel || '')) { const r = agregar(pagina, a.href); if (r && /\.m?js$/.test(r)) js.push(r); }
    if (e.tag === 'script' && a.src) { const r = agregar(pagina, a.src); if (r) js.push(r); }
  }
  for (const b of bloques(texto)) if (b.tag === 'script' && !b.attrs.src) js.push(...importa(pagina, b.contenido));
  while (js.length) { const f = js.pop(); js.push(...importa(f, leer(raiz, f))); }
  function importa(desde, codigo) {
    const out = [];
    for (const m of codigo.matchAll(/\bimport\s*(?:[\w*{}\s,$]+\s*from\s*)?(['"])(\.{1,2}\/[^'"]+)\1/g)) { const r = agregar(desde, m[2]); if (r) out.push(r); }
    return out;
  }
  // Lo que pide el motor al arrancar (no se puede leer estático porque arma las rutas en tiempo de ejecución)
  for (const f of archivos(raiz)) if (/^assets\/mundo\/(h-.*\.(webp|png)|poster-h\.avif|mundo\.json)$/.test(f)) vistos.add(f);
  const lista = [...vistos].map((r) => [r, tam(raiz, r)]).sort((a, b) => b[1] - a[1]);
  return { total: lista.reduce((s, [, t]) => s + t, 0), lista };
}

export function correr({ raiz, config }) {
  const P = config.presupuestos;
  const fallas = [];
  const filas = [];
  const todos = archivos(raiz);
  for (const clave of ['juego_h', 'juego_v']) {
    const re = new RegExp(P[clave].patron);
    const total = todos.filter((f) => re.test(f)).reduce((s, f) => s + tam(raiz, f), 0);
    filas.push(`${clave} ${kb(total)} / ${kb(P[clave].max)}`);
    if (total > P[clave].max) fallas.push(`${clave}: ${kb(total)} > ${kb(P[clave].max)} (${P[clave].fuente})`);
    if (!total) fallas.push(`${clave}: no encontré archivos (${P[clave].patron})`);
  }
  const reP = new RegExp(P.poster.patron);
  for (const f of todos.filter((x) => reP.test(x))) {
    const t = tam(raiz, f);
    filas.push(`${posix.basename(f)} ${kb(t)}`);
    if (t > P.poster.max_cada_uno) fallas.push(`${f}: ${kb(t)} > ${kb(P.poster.max_cada_uno)}`);
  }
  for (const p of todos.filter((f) => f.endsWith('.html'))) {
    const b = bloques(leer(raiz, p)).find((x) => x.tag === 'style' && x.attrs.id === 'critico');
    if (!b) continue;
    const t = Buffer.byteLength(b.contenido, 'utf8');
    if (p === 'index.html') filas.push(`crítico ${(t / 1024).toFixed(1)} KiB`);
    if (t > P.css_critico.max) fallas.push(`${p}: CSS crítico ${(t / 1024).toFixed(1)} KiB > 14 KiB`);
  }
  const pc = primeraCarga(raiz);
  filas.push(`primera carga ${kb(pc.total)} / ${kb(P.primera_carga_portada.max)}`);
  if (pc.total > P.primera_carga_portada.max) fallas.push(`primera carga de la portada ${kb(pc.total)} > ${kb(P.primera_carga_portada.max)}; lo más pesado: ${pc.lista.slice(0, 5).map(([r, t]) => `${r} ${kb(t)}`).join(', ')}`);
  return { fallas, resumen: filas.join(' · '), datos: { primeraCarga: pc } };
}
