// Enlaces y recursos: todo destino interno existe y toda ancla apunta a un id de la página destino.
// Mira HTML (href, src, srcset, poster, content de og:image/twitter:image), importmap, CSS (url(), @import),
// JS propio (import estático y dinámico con literal, new URL('…', import.meta.url)), manifest y sitemap.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { archivos, paginas, leer, etiquetas, bloques, resolver, existe, ids, lineaDe, SITIO } from './lib/html.mjs';

export const nombre = 'enlaces';
export const descripcion = 'enlaces, anclas y recursos internos resuelven';

export function correr({ raiz }) {
  const fallas = [];
  const cacheIds = new Map();
  const idsDe = (ruta) => {
    if (!cacheIds.has(ruta)) cacheIds.set(ruta, ruta.endsWith('.html') && existe(raiz, ruta) ? ids(leer(raiz, ruta)) : null);
    return cacheIds.get(ruta);
  };
  let revisados = 0;
  const revisar = (origen, linea, url, { ancla = true } = {}) => {
    const r = resolver(origen, url);
    if (!r) return;
    revisados++;
    if (!existe(raiz, r.ruta)) { fallas.push(`${origen}:${linea} → ${url} (no existe ${r.ruta})`); return; }
    if (ancla && r.ancla && r.ancla !== 'top') {
      const conjunto = idsDe(r.ruta.endsWith('/index.html') || existe(raiz, r.ruta) ? r.ruta : r.ruta + '/index.html');
      if (conjunto && !conjunto.has(decodeURIComponent(r.ancla))) fallas.push(`${origen}:${linea} → ${url} (no hay id="${r.ancla}" en ${r.ruta})`);
    }
  };

  for (const p of paginas(raiz)) {
    const texto = leer(raiz, p);
    for (const e of etiquetas(texto)) {
      const a = e.attrs;
      if (e.tag === 'a' || e.tag === 'area') revisar(p, e.linea, a.href);
      if (e.tag === 'link' && !/\b(canonical|alternate|preconnect|dns-prefetch)\b/.test(a.rel || '')) revisar(p, e.linea, a.href, { ancla: false });
      if (e.tag === 'link' && /\bcanonical\b/.test(a.rel || '') && a.href?.startsWith(SITIO)) revisar(p, e.linea, a.href, { ancla: false });
      for (const at of ['src', 'poster', 'data-src']) if (a[at]) revisar(p, e.linea, a[at], { ancla: false });
      for (const at of ['srcset', 'data-srcset']) if (a[at]) for (const parte of a[at].split(',')) revisar(p, e.linea, parte.trim().split(/\s+/)[0], { ancla: false });
      if (e.tag === 'meta' && /^(og:image|twitter:image|og:url)$/.test(a.property || a.name || '') && (a.content || '').startsWith(SITIO)) revisar(p, e.linea, a.content, { ancla: false });
    }
    for (const b of bloques(texto)) {
      if (b.tag === 'script' && b.attrs.type === 'importmap') {
        try { for (const v of Object.values(JSON.parse(b.contenido).imports || {})) revisar(p, b.linea, v, { ancla: false }); } catch (e) { fallas.push(`${p}:${b.linea} importmap inválido: ${e.message}`); }
      } else if (b.tag === 'script' && !b.attrs.src && /^(module|)$/.test(b.attrs.type || '')) importsJs(p, b.contenido, b.linea - 1);
      else if (b.tag === 'style') urlsCss(p, b.contenido, b.linea - 1);
    }
  }

  function importsJs(origen, codigo, base = 0) {
    const re = /(?:\bimport\s*(?:[\w*{}\s,$]+\s*from\s*)?|\bimport\s*\(\s*|\bnew URL\(\s*)(['"])(\.{1,2}\/[^'"]+)\1(\s*,\s*import\.meta\.url)?/g;
    let m;
    while ((m = re.exec(codigo))) {
      if (m[0].startsWith('new URL') && !m[3]) continue; // new URL relativo a BASE: no es estático
      if (m[2].endsWith('/')) { // carpeta base (p. ej. new URL('../../assets/mundo/', import.meta.url))
        const r = resolver(origen, m[2]);
        revisados++;
        if (r && !existsSync(join(raiz, r.ruta.replace(/index\.html$/, '')))) fallas.push(`${origen}:${base + lineaDe(codigo, m.index)} → ${m[2]} (no existe la carpeta)`);
        continue;
      }
      revisar(origen, base + lineaDe(codigo, m.index), m[2], { ancla: false });
    }
  }
  function urlsCss(origen, css, base = 0) {
    const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)|@import\s+(['"])([^'"]+)\3/g;
    let m;
    while ((m = re.exec(css))) {
      const u = m[2] || m[4];
      if (/^(data:|#|https?:|\/\/)/.test(u)) continue;
      revisar(origen, base + lineaDe(css, m.index), u, { ancla: false });
    }
  }

  for (const f of archivos(raiz, { soloPublicados: true })) {
    if (f.startsWith('lib/')) continue; // bibliotecas de terceros, tal cual
    if (/\.(js|mjs)$/.test(f)) importsJs(f, leer(raiz, f));
    if (f.endsWith('.css')) urlsCss(f, leer(raiz, f));
  }

  if (existe(raiz, 'manifest.webmanifest')) {
    try {
      const m = JSON.parse(leer(raiz, 'manifest.webmanifest'));
      for (const i of m.icons || []) revisar('manifest.webmanifest', 1, i.src, { ancla: false });
    } catch (e) { fallas.push('manifest.webmanifest inválido: ' + e.message); }
  }
  if (existe(raiz, 'sitemap.xml')) {
    const s = leer(raiz, 'sitemap.xml');
    for (const m of s.matchAll(/<loc>([^<]+)<\/loc>/g)) revisar('sitemap.xml', lineaDe(s, m.index), m[1], { ancla: false });
  }
  if (existe(raiz, 'robots.txt')) {
    const r = leer(raiz, 'robots.txt');
    const m = r.match(/^Sitemap:\s*(\S+)/m);
    if (m) revisar('robots.txt', 1, m[1], { ancla: false }); else fallas.push('robots.txt sin línea Sitemap');
  }
  return { fallas, resumen: `${revisados} destinos internos revisados` };
}
