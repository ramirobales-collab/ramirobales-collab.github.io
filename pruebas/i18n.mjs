// Paridad de diccionarios ES/EN: mismas claves (también anidadas), sin valores vacíos, mismos marcadores
// {x}; y toda clave que una página usa (data-i18n, data-i18n-attr) existe en su diccionario.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { archivos, paginas, leer, etiquetas } from './lib/html.mjs';

export const nombre = 'i18n';
export const descripcion = 'paridad de claves ES/EN y claves usadas existentes';

const aplanar = (o, pre = '', out = {}) => {
  for (const [k, v] of Object.entries(o)) {
    const c = pre ? `${pre}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) aplanar(v, c, out); else out[c] = v;
  }
  return out;
};
const marcadores = (v) => [...String(v).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

export function correr({ raiz }) {
  const fallas = [];
  const avisos = [];
  const pares = archivos(raiz, { soloPublicados: true }).filter((f) => /(^|\/)i18n\/(.*-)?es\.json$/.test(f));
  const dics = new Map();
  let claves = 0;
  for (const es of pares) {
    const en = es.replace(/es\.json$/, 'en.json');
    if (!existsSync(join(raiz, en))) { fallas.push(`${es}: falta su par ${en}`); continue; }
    let a, b;
    try { a = aplanar(JSON.parse(leer(raiz, es))); b = aplanar(JSON.parse(leer(raiz, en))); } catch (e) { fallas.push(`${es}/${en}: JSON inválido (${e.message})`); continue; }
    dics.set(es.replace(/es\.json$/, ''), { es: a, en: b });
    for (const k of Object.keys(a)) if (!(k in b)) fallas.push(`${en}: falta «${k}»`);
    for (const k of Object.keys(b)) if (!(k in a)) fallas.push(`${es}: falta «${k}»`);
    for (const [k, v] of Object.entries(a)) {
      claves++;
      if (v === '' || v == null) fallas.push(`${es}: «${k}» vacío`);
      if (k in b && (b[k] === '' || b[k] == null)) fallas.push(`${en}: «${k}» vacío`);
      if (k in b && typeof v === 'string' && marcadores(v) !== marcadores(b[k])) fallas.push(`«${k}»: marcadores distintos (es: ${marcadores(v) || '—'} / en: ${marcadores(b[k]) || '—'})`);
    }
  }

  // Diccionario de cada página: el de su carpeta de demo, o el general si carga js/comun.js.
  let usadas = 0;
  for (const p of paginas(raiz)) {
    const texto = leer(raiz, p);
    let dic = null;
    const demo = p.match(/^(demos\/[^/]+)\//);
    if (demo && dics.has(`${demo[1]}/i18n/`)) dic = dics.get(`${demo[1]}/i18n/`);
    else if (/js\/comun\.js/.test(texto)) {
      // <html data-dic="casos"> pide i18n/casos-<idioma>.json; sin el atributo, el general
      const propio = texto.match(/<html\b[^>]*\bdata-dic="([\w-]+)"/);
      dic = propio ? dics.get(`i18n/${propio[1]}-`) : dics.get('i18n/');
      if (propio && !dic) fallas.push(`${p}: pide el diccionario «${propio[1]}» y no existe i18n/${propio[1]}-es.json`);
    }
    if (!dic) continue;
    for (const e of etiquetas(texto)) {
      const pedidas = [];
      if (e.attrs['data-i18n']) pedidas.push(e.attrs['data-i18n']);
      if (e.attrs['data-i18n-attr']) for (const par of e.attrs['data-i18n-attr'].split(';')) { const k = par.split('=')[1]?.trim(); if (k) pedidas.push(k); }
      for (const k of pedidas) {
        usadas++;
        if (!(k in dic.es)) fallas.push(`${p}:${e.linea}: la clave «${k}» no está en el diccionario`);
      }
    }
  }
  if (!pares.length) avisos.push('no encontré diccionarios');
  return { fallas, avisos, resumen: `${pares.length} pares, ${claves} claves, ${usadas} usos en páginas` };
}
