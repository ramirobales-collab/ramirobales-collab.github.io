// Guardia de veracidad: lo que no puede aparecer en lo publicado (reglas de contenido del dueño).
// Config en pruebas/config.json → veracidad y huellas. Cada excepción tiene su motivo. Las palabras que
// no se pueden publicar se comparan por huella (pruebas/lib/huella.mjs): no están escritas en el repo.
import { archivos, paginas, leer, etiquetas, enmascarar, lineaDe, TEXTO } from './lib/html.mjs';
import { buscar } from './lib/huella.mjs';

export const nombre = 'veracidad';
export const descripcion = 'reglas de contenido: nombres internos (por huella), Cathedra sin proveedores/precios/modelos/«lanzado», cifras de pruebas y de coro, AthleteIQ';

const TEXTO_PUBLICADO = /\.(html|json|js|mjs|css|webmanifest|xml|txt|svg|md)$/i;
const BLOQUE = /<\/?(p|li|ul|ol|h[1-6]|div|section|article|header|footer|nav|main|aside|td|th|tr|figcaption|figure|dd|dt|dl|title|br|text|desc|button|a|label|span class="sello)\b[^>]*>/gi;
const ENTIDADES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&mdash;': '—', '&ndash;': '–', '&hellip;': '…' };
const plano = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, (e) => ENTIDADES[e] ?? ' ').replace(/\s+/g, ' ').trim();

/** Unidades de texto: bloques en HTML (más los content de las metas), valores en JSON, líneas en el resto. */
export function unidades(f, texto) {
  if (f.endsWith('.html')) {
    const metas = etiquetas(texto).filter((e) => e.tag === 'meta' && e.attrs.content).map((e) => e.attrs.content);
    const p = enmascarar(texto).replace(BLOQUE, '\n').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, (e) => ENTIDADES[e] ?? ' ');
    return [...p.split('\n'), ...metas].map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }
  if (/\.(json|webmanifest)$/.test(f)) {
    try {
      const out = [];
      const andar = (v) => { if (typeof v === 'string') out.push(plano(v)); else if (v && typeof v === 'object') Object.values(v).forEach(andar); };
      andar(JSON.parse(texto));
      return out;
    } catch {}
  }
  return texto.split('\n');
}

/**
 * Ítems que llevan su contexto en un chip aparte (li.saber__item: «qué» + «dónde»). El chip es un enlace
 * y BLOQUE lo separa de su oración; acá se juntan, en el idioma del HTML y en los dos diccionarios.
 */
function itemsConChip(texto, dics) {
  const out = [];
  for (const m of enmascarar(texto).matchAll(/<li\b[^>]*class="[^"]*\bsaber__item\b[^"]*"[^>]*>([\s\S]*?)<\/li>/g)) {
    const crudo = texto.slice(m.index, m.index + m[0].length);
    const chips = [...crudo.matchAll(/class="chip[^"]*"[^>]*>([^<]*)</g)].map((c) => c[1].trim()).filter(Boolean).join(', ');
    out.push(plano(crudo));
    const claves = [...crudo.matchAll(/data-i18n="([^"]+)"/g)].map((c) => c[1]).filter((k) => k !== 'saber.donde');
    for (const d of dics) {
      const t = claves.map((k) => plano(d[k] || '')).filter(Boolean).join(' ');
      if (t) out.push(`${t} — ${chips}`);
    }
  }
  return out;
}

const oraciones = (u) => u.split(/(?<=[.!?…])\s+(?=[¿¡«"“(]?[A-ZÁÉÍÓÚÑ0-9])/);

export function correr({ raiz, config }) {
  const v = config.veracidad;
  const H = config.huellas;
  const C = v.cerca_de_cathedra;
  const cerca = [...H.proveedores, ...H.internos];
  const fallas = [];
  const avisos = [];
  const lista = archivos(raiz, { soloPublicados: true }).filter((f) => TEXTO_PUBLICADO.test(f) && !f.startsWith('lib/'));
  for (const f of archivos(raiz)) if (/^(README\.md|SEGURIDAD\.md|LICENSE)$/.test(f) && !lista.includes(f)) lista.push(f);
  const dics = ['es', 'en'].map((l) => { try { return JSON.parse(leer(raiz, `i18n/${l}.json`)); } catch { return {}; } });

  let menciones = 0;
  const cifrasOk = new Set([...v.coro_reseñas.validas, ...(v.coro_reseñas.otras_permitidas || []).map((x) => x.cifra)]);
  const reFrases = v.frases_prohibidas.map((r) => [new RegExp(r.re, 'i'), r.motivo]);
  const reCifra = new RegExp(v.cifra_pruebas.re, 'giu');
  const prohibida = (r, texto) => {
    const h = new RegExp(r.re, 'i').exec(texto);
    if (!h) return null;
    if (r.no_si && new RegExp(r.no_si, 'i').test(texto.slice(Math.max(0, h.index - 12), h.index + h[0].length + 2))) return null;
    return h;
  };
  const revisarCathedra = (f, o) => {
    menciones++;
    for (const r of C.prohibidas) {
      const h = prohibida(r, o);
      if (h) fallas.push(`${f}: «${h[0]}» en una oración sobre Cathedra — ${r.motivo} («${recorte(o, h.index)}»)`);
    }
    for (const h of buscar(o, cerca)) fallas.push(`${f}: palabra con huella en una oración sobre Cathedra — ${h.motivo} («${recorte(o, h.pos)}»)`);
  };

  // 1) Nombres internos, en todo el árbol: lo publicado y también pruebas/ y herramientas/ (sólo huellas)
  const todoTexto = archivos(raiz).filter((f) => TEXTO.test(f) && !f.startsWith('lib/'));
  for (const f of todoTexto) {
    const texto = leer(raiz, f);
    for (const h of buscar(texto, H.en_todo)) fallas.push(`${f}:${lineaDe(texto, h.pos)}: palabra con huella — ${h.motivo}`);
    for (const h of buscar(f, H.en_todo)) fallas.push(`${f}: el nombre del archivo — ${h.motivo}`);
  }

  // 2) Lo publicado, por unidad de texto
  for (const f of lista) {
    const texto = leer(raiz, f);
    const us = unidades(f, texto);
    if (f.endsWith('.html')) us.push(...itemsConChip(texto, dics));
    for (const u of us) {
      if (/cathedra/i.test(u)) {
        const l = new RegExp(C.lanzado.re, 'i').exec(u);
        if (l) fallas.push(`${f}: «${l[0]}» junto a Cathedra — ${C.lanzado.motivo} («${recorte(u, l.index)}»)`);
        for (const o of oraciones(u)) if (/cathedra/i.test(o)) revisarCathedra(f, o);
      }
      for (const m of u.matchAll(new RegExp(v.coro_reseñas.re, 'gi'))) {
        const n = m[1].replace(/[.,]$/, '');
        if (!cifrasOk.has(n)) fallas.push(`${f}: «${m[0]}» — cifra de reseñas no declarada (coro: 400 / 1.200; si es otra cosa, declararla en config.json con su motivo)`);
      }
      for (const m of u.matchAll(reCifra)) {
        if (!v.cifra_pruebas.validas.includes(m[1])) fallas.push(`${f}: «${m[0]}» — ${v.cifra_pruebas.motivo} («${recorte(u, m.index)}»)`);
      }
      for (const [re, motivo] of reFrases) {
        const h = re.exec(u);
        if (h) fallas.push(`${f}: «${h[0]}» — ${motivo} («${recorte(u, h.index)}»)`);
      }
    }
  }

  // 3) Página de Cathedra y página de AthleteIQ enteras, con el texto de sus claves en los dos idiomas
  const conClaves = (p) => {
    const texto = leer(raiz, p);
    const claves = etiquetas(texto).flatMap((e) => [e.attrs['data-i18n'], ...(e.attrs['data-i18n-attr'] || '').split(';').map((x) => x.split('=')[1]?.trim())]).filter(Boolean);
    return [...unidades(p, texto), ...claves.flatMap((k) => dics.map((d) => plano(d[k] || '')))].join('\n');
  };
  for (const p of paginas(raiz).filter((x) => /(^|\/)cathedra\.html$/.test(x))) {
    const todo = conClaves(p);
    for (const r of [C.lanzado, ...C.prohibidas]) {
      const h = prohibida(r, todo);
      if (h) fallas.push(`${p}: «${h[0]}» en la página de Cathedra — ${r.motivo} («${recorte(todo, h.index)}»)`);
    }
    for (const h of buscar(todo, cerca)) fallas.push(`${p}: palabra con huella en la página de Cathedra — ${h.motivo} («${recorte(todo, h.pos)}»)`);
  }
  for (const p of v.paginas_sin_proveedor.paginas) {
    let todo;
    try { todo = conClaves(p); } catch { avisos.push(`${p}: no existe (paginas_sin_proveedor)`); continue; }
    for (const h of buscar(todo, H.proveedores)) fallas.push(`${p}: palabra con huella — AthleteIQ sin proveedor («${recorte(todo, h.pos)}»)`);
  }
  // La misma oración puede aparecer en el HTML y en el diccionario: una línea por hallazgo
  return { fallas: [...new Set(fallas)], avisos, resumen: `${lista.length} archivos publicados y ${todoTexto.length} de texto en el árbol; ${menciones} oraciones sobre Cathedra revisadas` };
}

const recorte = (s, i) => '…' + s.slice(Math.max(0, i - 50), i + 50).replace(/\s+/g, ' ').trim() + '…';
