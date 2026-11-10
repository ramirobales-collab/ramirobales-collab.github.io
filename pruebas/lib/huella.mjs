// Huellas de palabras: la lista de lo que no puede aparecer en el sitio se guarda como hash, nunca en
// claro (si estuviera escrita, este repo público publicaría justo lo que hay que esconder).
//
// Normalización: minúsculas, sin tildes, y el texto partido en tramos de sólo letras o sólo cifras
// («Gpt-4o» → gpt · 4 · o). Se comparan los tramos sueltos y las uniones de 2 y 3 seguidos, así una
// palabra escrita con espacio, guion o guion bajo en el medio también coincide.
// Huella = sha256("pv1:" + palabra normalizada), primeros 20 caracteres hexadecimales.
//
// Es una ocultación, no un secreto: quien adivine una palabra puede calcular su huella. Alcanza para
// que la lista no se lea, no se indexe y no aparezca en una búsqueda del repo.
//
//   node pruebas/lib/huella.mjs <palabra> [<palabra> …]   # imprime la huella para sumarla a config.json
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAL = 'pv1:';
const cache = new Map();

export function huella(palabra) {
  let h = cache.get(palabra);
  if (!h) { h = createHash('sha256').update(SAL + palabra).digest('hex').slice(0, 20); cache.set(palabra, h); }
  return h;
}

export const normalizar = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Tramos con su posición en el texto original (la normalización NFD no cambia la cantidad de tramos). */
export function tramos(texto) {
  const out = [];
  const plano = texto.normalize('NFC');
  for (const m of plano.matchAll(/[\p{L}]+|[\p{N}]+/gu)) out.push({ t: normalizar(m[0]), i: m.index });
  return out;
}

/** Palabra normalizada lista para huella (lo que imprime la línea de comandos). */
export const forma = (s) => tramos(s).map((x) => x.t).join('');

/**
 * Busca en el texto las huellas de la lista [{h, motivo, salvo_si_sigue?, si_sigue_cifra?}]:
 * salvo_si_sigue = huella del tramo siguiente que la anula; si_sigue_cifra = sólo cuenta pegada a una cifra.
 * Devuelve [{motivo, pos}] (una por coincidencia; pos = índice en el texto, para dar la línea).
 */
export function buscar(texto, lista, { max = 3 } = {}) {
  if (!lista?.length) return [];
  const mapa = new Map(lista.map((r) => [r.h, r]));
  const ts = tramos(texto);
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    let junto = '';
    for (let n = 0; n < max && i + n < ts.length; n++) {
      junto += ts[i + n].t;
      if (junto.length > 32) break;
      const r = mapa.get(huella(junto));
      if (!r) continue;
      const sig = ts[i + n + 1];
      if (r.salvo_si_sigue && sig && huella(sig.t) === r.salvo_si_sigue) continue;
      if (r.si_sigue_cifra && !(sig && /^\d/.test(sig.t) && texto.slice(ts[i + n].i + ts[i + n].t.length, sig.i).length <= 1)) continue;
      out.push({ motivo: r.motivo, pos: ts[i].i });
    }
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ps = process.argv.slice(2);
  if (!ps.length) { console.error('uso: node pruebas/lib/huella.mjs <palabra> [<palabra> …]'); process.exit(2); }
  for (const p of ps) console.log(`${huella(forma(p))}  (${forma(p).length} caracteres)`);
}
