// Básicos de HTML por página: lang, title, descripción, viewport, un solo h1, alt en imágenes,
// ids sin repetir y rel="noopener noreferrer" en enlaces que abren pestaña nueva.
// (Los manejadores en línea y los style= los controla politica.mjs.)
import { execFileSync } from 'node:child_process';
import { paginas, leer, etiquetas, bloques, resolver, existe } from './lib/html.mjs';

export const nombre = 'basicos';
export const descripcion = 'lang, title, descripción, un h1, alt, ids únicos, rel en target=_blank';

export function correr({ raiz }) {
  const fallas = [];
  const avisos = [];
  const lista = paginas(raiz);
  for (const p of lista) {
    const texto = leer(raiz, p);
    const ets = etiquetas(texto);
    const html = ets.find((e) => e.tag === 'html');
    if (!html || !['es', 'en'].includes(html.attrs.lang)) fallas.push(`${p}: <html lang> tiene que ser es o en (es «${html?.attrs.lang ?? 'nada'}»)`);
    const titulo = texto.match(/<title\b[^>]*>([^<]*)<\/title>/i);
    if (!titulo || !titulo[1].trim()) fallas.push(`${p}: sin <title>`);
    const desc = ets.find((e) => e.tag === 'meta' && e.attrs.name === 'description');
    if (!desc || !(desc.attrs.content || '').trim()) fallas.push(`${p}: sin <meta name="description">`);
    if (!ets.find((e) => e.tag === 'meta' && e.attrs.name === 'viewport')) fallas.push(`${p}: sin <meta name="viewport">`);
    const h1 = ets.filter((e) => e.tag === 'h1');
    if (h1.length !== 1) fallas.push(`${p}: ${h1.length} <h1> (tiene que haber uno)`);
    const vistos = new Map();
    for (const e of ets) {
      if (e.tag === 'img' && !('alt' in e.attrs)) fallas.push(`${p}:${e.linea}: <img> sin alt`);
      if (e.attrs.id) {
        if (vistos.has(e.attrs.id)) fallas.push(`${p}:${e.linea}: id «${e.attrs.id}» repetido (ya en la línea ${vistos.get(e.attrs.id)})`);
        else vistos.set(e.attrs.id, e.linea);
      }
      if (e.tag === 'a' && (e.attrs.target || '').toLowerCase() === '_blank') {
        const rel = (e.attrs.rel || '').toLowerCase().split(/\s+/);
        const faltan = ['noopener', 'noreferrer'].filter((t) => !rel.includes(t));
        if (faltan.length) fallas.push(`${p}:${e.linea}: target=_blank sin ${faltan.join(' ni ')} (proteccion.py lo agrega)`);
      }
      if ((e.tag === 'button' || e.tag === 'a') && !texto.slice(e.inicio, texto.indexOf(`</${e.tag}>`, e.inicio)).replace(/<[^>]+>/g, '').trim() && !e.attrs['aria-label'] && !e.attrs['aria-labelledby'] && !e.attrs.title && !texto.slice(e.inicio, texto.indexOf(`</${e.tag}>`, e.inicio)).match(/<img[^>]+alt="[^"]+"/))
        avisos.push(`${p}:${e.linea}: <${e.tag}> sin nombre accesible en el HTML (puede ponerlo el JS)`);
    }
    for (const b of bloques(texto)) if (b.tag === 'script' && b.attrs.type === 'application/ld+json') {
      try { JSON.parse(b.contenido); } catch (err) { fallas.push(`${p}:${b.linea}: JSON-LD inválido (${err.message})`); }
    }
  }
  // Sitemap ↔ páginas indexables (sin noindex; la 404 no cuenta)
  if (existe(raiz, 'sitemap.xml')) {
    const sm = leer(raiz, 'sitemap.xml');
    const locs = new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => resolver('index.html', m[1])?.ruta));
    for (const p of lista) {
      if (p === '404.html') continue;
      const noindex = etiquetas(leer(raiz, p)).some((e) => e.tag === 'meta' && e.attrs.name === 'robots' && /noindex/i.test(e.attrs.content || ''));
      if (!noindex && !locs.has(p)) fallas.push(`sitemap.xml: falta ${p} (indexable)`);
      if (noindex && locs.has(p)) fallas.push(`sitemap.xml: incluye ${p}, que tiene noindex`);
    }
    // lastmod no puede quedar más viejo que el último commit que tocó la página (sólo lectura de git)
    for (const m of sm.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)) {
      const ruta = resolver('index.html', m[1])?.ruta;
      if (!ruta || !existe(raiz, ruta)) continue;
      let fecha = '';
      try { fecha = execFileSync('git', ['-C', raiz, 'log', '-1', '--format=%cs', '--', ruta], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { break; }
      if (fecha && m[2] < fecha) fallas.push(`sitemap.xml: lastmod ${m[2]} de ${ruta} es anterior a su último commit (${fecha})`);
    }
  } else fallas.push('falta sitemap.xml');
  return { fallas, avisos, resumen: `${lista.length} páginas` };
}
