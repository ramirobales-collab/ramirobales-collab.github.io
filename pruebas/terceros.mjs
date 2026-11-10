// Ningún pedido a terceros (estático): ni scripts, hojas, fuentes, imágenes, medios ni iframes de otro
// origen en el HTML; ni url()/@import externos en el CSS; ni fetch/import/Worker con URL absoluta en el JS
// propio. La prueba de humo lo confirma en el navegador (registro de red).
import { archivos, paginas, leer, etiquetas, bloques, lineaDe } from './lib/html.mjs';

export const nombre = 'terceros';
export const descripcion = 'ningún recurso ni pedido a otro origen (estático)';

const externa = (u) => /^\s*(https?:)?\/\//i.test(u || '');

export function correr({ raiz }) {
  const fallas = [];
  for (const p of paginas(raiz)) {
    const texto = leer(raiz, p);
    for (const e of etiquetas(texto)) {
      const a = e.attrs;
      if (['script', 'img', 'source', 'video', 'audio', 'track', 'iframe', 'embed', 'input'].includes(e.tag) && externa(a.src)) fallas.push(`${p}:${e.linea}: <${e.tag} src="${a.src}">`);
      if (['img', 'source'].includes(e.tag) && (a.srcset || '').split(',').some((s) => externa(s.trim().split(/\s+/)[0]))) fallas.push(`${p}:${e.linea}: <${e.tag} srcset> externo`);
      if (e.tag === 'video' && externa(a.poster)) fallas.push(`${p}:${e.linea}: <video poster> externo`);
      if (e.tag === 'object' && externa(a.data)) fallas.push(`${p}:${e.linea}: <object data> externo`);
      if (e.tag === 'link' && externa(a.href) && !/\b(canonical|alternate|me|author|license)\b/.test(a.rel || '')) fallas.push(`${p}:${e.linea}: <link rel="${a.rel}" href="${a.href}">`);
    }
    for (const b of bloques(texto)) {
      if (b.tag === 'style') cssExterno(p, b.contenido, b.linea - 1);
      if (b.tag === 'script' && !b.attrs.src && b.attrs.type !== 'application/ld+json') jsExterno(p, b.contenido, b.linea - 1);
    }
  }
  for (const f of archivos(raiz, { soloPublicados: true })) {
    if (f.endsWith('.css')) cssExterno(f, leer(raiz, f));
    if (/\.(js|mjs)$/.test(f) && !f.startsWith('lib/')) jsExterno(f, leer(raiz, f));
  }
  function cssExterno(f, css, base = 0) {
    for (const m of css.matchAll(/url\(\s*['"]?((?:https?:)?\/\/[^'")]+)|@import\s+(?:url\()?\s*['"]?((?:https?:)?\/\/[^'")\s]+)/gi)) fallas.push(`${f}:${base + lineaDe(css, m.index)}: CSS externo ${m[1] || m[2]}`);
  }
  function jsExterno(f, js, base = 0) {
    const re = /\b(fetch|import|importScripts|Worker|SharedWorker|EventSource|WebSocket|sendBeacon)\s*\(\s*['"`]((?:https?|wss?):)?\/\/([^'"`]+)/g;
    for (const m of js.matchAll(re)) fallas.push(`${f}:${base + lineaDe(js, m.index)}: ${m[1]}() a ${m[3].slice(0, 60)}`);
    for (const m of js.matchAll(/\bfrom\s*['"]((?:https?:)?\/\/[^'"]+)/g)) fallas.push(`${f}:${base + lineaDe(js, m.index)}: import desde ${m[1]}`);
  }
  return { fallas, resumen: fallas.length ? `${fallas.length} recursos externos` : '0 recursos externos' };
}
