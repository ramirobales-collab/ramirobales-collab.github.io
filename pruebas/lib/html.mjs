// Lectura del sitio para las pruebas: páginas publicadas, etiquetas, atributos y bloques en línea.
// Implementación propia e independiente de herramientas/proteccion.py (a propósito: si las dos
// difieren en un hash, la prueba de la política lo agarra).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, posix } from 'node:path';

export const SITIO = 'https://ramirobales-collab.github.io/';
// Carpetas de la raíz que no son sitio publicado.
export const NO_PUBLICADO = new Set(['.git', 'node_modules', 'pruebas', 'herramientas', '.github']);
export const TEXTO = /\.(html|css|js|mjs|json|webmanifest|txt|xml|md|svg|py|yml|yaml)$/i;

/** Todos los archivos del árbol (rutas con «/»), sin .git ni node_modules. */
export function archivos(raiz, { soloPublicados = false } = {}) {
  const out = [];
  const andar = (rel) => {
    for (const n of readdirSync(join(raiz, rel)).sort()) {
      if (n === '.git' || n === 'node_modules') continue;
      if (!rel && soloPublicados && NO_PUBLICADO.has(n)) continue;
      const r = rel ? `${rel}/${n}` : n;
      if (statSync(join(raiz, r)).isDirectory()) andar(r); else out.push(r);
    }
  };
  andar('');
  return out;
}

export const paginas = (raiz) => archivos(raiz, { soloPublicados: true }).filter((r) => r.endsWith('.html'));

export function leer(raiz, rel) {
  return readFileSync(join(raiz, rel), 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

export const lineaDe = (texto, pos) => texto.slice(0, pos).split('\n').length;

const RE_CRUDO = /<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
const RE_COMENTARIO = /<!--[\s\S]*?-->/g;
const tapar = (s) => s.replace(/[^\n]/g, ' ');

/** Mismo largo y mismos saltos, sin comentarios ni contenido de <script>/<style>. */
export function enmascarar(texto) {
  let t = texto.replace(RE_COMENTARIO, tapar);
  t = t.replace(RE_CRUDO, (todo, tag, attrs, cont) => {
    const ini = todo.indexOf('>') + 1;
    return todo.slice(0, ini) + tapar(cont) + todo.slice(ini + cont.length);
  });
  return t;
}

export function atributos(cadena = '') {
  const out = {};
  const re = /([^\s=>/"']+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>"']+))?/g;
  let m;
  while ((m = re.exec(cadena))) {
    const n = m[1].toLowerCase();
    let v = m[2] ?? '';
    if (v[0] === '"' || v[0] === "'") v = v.slice(1, -1);
    if (!(n in out)) out[n] = v;
  }
  return out;
}

const RE_ETIQUETA = /<([a-zA-Z][\w:-]*)((?:\s+[^\s=>/"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+))?)*)\s*\/?>/g;

/** Etiquetas de apertura fuera de comentarios y de código: [{tag, attrs, linea, inicio}] */
export function etiquetas(texto) {
  const masc = enmascarar(texto);
  const out = [];
  let m;
  RE_ETIQUETA.lastIndex = 0;
  while ((m = RE_ETIQUETA.exec(masc))) out.push({ tag: m[1].toLowerCase(), attrs: atributos(m[2]), linea: lineaDe(masc, m.index), inicio: m.index, crudo: texto.slice(m.index, m.index + m[0].length) });
  return out;
}

/** Bloques <script>/<style> en línea (fuera de comentarios): [{tag, attrs, contenido, linea}] */
export function bloques(texto) {
  const sinComent = texto.replace(RE_COMENTARIO, tapar);
  const out = [];
  let m;
  RE_CRUDO.lastIndex = 0;
  while ((m = RE_CRUDO.exec(sinComent))) {
    const ini = m.index + m[0].indexOf('>') + 1;
    out.push({ tag: m[1].toLowerCase(), attrs: atributos(m[2]), contenido: texto.slice(ini, ini + m[3].length), linea: lineaDe(texto, m.index) });
  }
  return out;
}

const TIPOS_JS = new Set(['', 'text/javascript', 'application/javascript', 'module', 'importmap', 'speculationrules', 'text/ecmascript', 'application/ecmascript']);
export const esEjecutable = (b) => b.tag === 'script' && !('src' in b.attrs) && TIPOS_JS.has((b.attrs.type || '').trim().toLowerCase());

/** Texto visible aproximado (sin etiquetas, sin código), para las guardias de contenido. */
export function textoVisible(texto) {
  return enmascarar(texto).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
}

/**
 * Resuelve una URL de la página a una ruta del repo, o null si es externa / no es un archivo.
 * Devuelve {ruta, ancla}.
 */
export function resolver(paginaRel, url) {
  if (!url) return null;
  let u = url.trim();
  if (/^(mailto:|tel:|data:|blob:|javascript:|about:)/i.test(u)) return null;
  if (u.startsWith(SITIO)) u = '/' + u.slice(SITIO.length);
  else if (/^(https?:)?\/\//i.test(u)) return null;
  const [sinQuery] = u.split('?');
  const [camino, ancla = null] = sinQuery.split('#');
  let ruta;
  if (!camino) ruta = paginaRel; // «#ancla» o «?x» en la misma página
  else if (camino.startsWith('/')) ruta = camino.slice(1);
  else ruta = posix.normalize(posix.join(posix.dirname(paginaRel), camino));
  try { ruta = decodeURIComponent(ruta); } catch {}
  if (ruta === '' || ruta.endsWith('/')) ruta += 'index.html';
  return { ruta, ancla };
}

export function existe(raiz, ruta) {
  const p = join(raiz, ruta);
  if (!existsSync(p)) return false;
  return statSync(p).isFile() || existsSync(join(p, 'index.html'));
}

export function ids(texto) {
  return new Set(etiquetas(texto).map((e) => e.attrs.id).filter(Boolean));
}
