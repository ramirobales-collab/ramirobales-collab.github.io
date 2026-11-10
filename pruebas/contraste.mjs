// Contraste de los tokens de color, estático y sin navegador. Lee css/variables.css (light-dark() con
// oklch, alfa y var()), pasa oklch a sRGB, compone las superficies translúcidas (placa, barra, banda tinta)
// sobre el fondo de cada tema, como hace el navegador (mezcla en sRGB con gamma), y mide cada par
// texto/fondo de pruebas/config.json → contraste con la fórmula de WCAG 2.
//
// Vara (config.json → contraste.vara): claro, texto 7:1, secundario 4,5:1, bordes, foco y texto grande 3:1;
// oscuro, 4,5:1 y 3:1. El texto sobre el fondo vivo (píxeles que se mueven) no se puede medir acá: para eso
// está la «mota», el peor caso de una luz desenfocada detrás de una superficie translúcida.
// Fuera de gama sRGB se recorta cada canal (lo que hace Chrome hoy con oklch); puede diferir unas
// centésimas de un mapeo de gama por croma.
import { leer, existe } from './lib/html.mjs';

export const nombre = 'contraste';
export const descripcion = 'pares texto/fondo de css/variables.css en claro y oscuro (y la demo de AthleteIQ)';

const rad = (g) => (g * Math.PI) / 180;
const gamma = (v) => { v = Math.min(1, Math.max(0, v)); return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055; };
const lineal = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

export function oklch(L, C, h) {
  const a = C * Math.cos(rad(h)), b = C * Math.sin(rad(h));
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(gamma);
}
export const luminancia = ([r, g, b]) => 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b);
export function razon(a, b) { const x = luminancia(a), y = luminancia(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
/** Compone un color con alfa sobre uno opaco, en sRGB con gamma (como el navegador). */
const sobre = (arriba, abajo) => [0, 1, 2].map((i) => arriba[i] * arriba[3] + abajo[i] * (1 - arriba[3])).concat(1);
const conAlfa = (c, a) => [...c.slice(0, 3), a];

/** Color CSS (oklch con o sin alfa, o #hex de 6) → [r, g, b, a] en sRGB 0..1. */
export function color(s, vars = {}) {
  s = s.trim().replace(/var\((--[\w-]+)\)/g, (t, n) => (n in vars ? vars[n] : t));
  let m = s.match(/^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)$/);
  if (m) return [...oklch(+m[1] / 100, +m[2], +m[3]), m[4] == null ? 1 : +m[4]];
  m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).concat(1);
  return null;
}

/** light-dark(a, b) → [a, b] respetando paréntesis; si no es light-dark, [v, v]. */
function partir(v) {
  v = v.trim();
  if (!v.startsWith('light-dark(')) return [v, v];
  const d = v.slice(11, -1);
  let p = 0;
  for (let i = 0; i < d.length; i++) { p += d[i] === '(' ? 1 : d[i] === ')' ? -1 : 0; if (d[i] === ',' && !p) return [d.slice(0, i).trim(), d.slice(i + 1).trim()]; }
  return [v, v];
}

const declaraciones = (bloque) => Object.fromEntries([...bloque.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));

/** Tokens de color por tema: {claro: {--x: [r,g,b,a]}, oscuro: {...}}. */
export function tokens(css) {
  const bloque = (sel) => { const i = css.indexOf(sel); if (i < 0) return ''; const a = css.indexOf('{', i); return css.slice(a + 1, css.indexOf('}', a)); };
  const raiz = declaraciones(bloque(':root {'));
  const extra = { claro: declaraciones(bloque(':root[data-theme="light"]')), oscuro: declaraciones(bloque(':root[data-theme="dark"]')) };
  const out = { claro: {}, oscuro: {} };
  for (const [tema, lado] of [['claro', 0], ['oscuro', 1]]) {
    const crudo = { ...raiz, ...extra[tema] };
    const valor = (n, prof = 0) => {
      let v = crudo[n];
      if (v == null || prof > 6) return null;
      v = partir(v)[lado];
      const solo = v.match(/^var\((--[\w-]+)\)$/);
      return solo ? valor(solo[1], prof + 1) : v.replace(/var\((--[\w-]+)\)/g, (t, x) => valor(x, prof + 1) ?? t);
    };
    for (const n of Object.keys(crudo)) { const c = color(valor(n) || ''); if (c) out[tema][n] = c; }
  }
  return out;
}

export function correr({ raiz, config }) {
  const K = config.contraste;
  const fallas = [];
  const avisos = [];
  const filas = [];
  const t = tokens(leer(raiz, 'css/variables.css'));
  const mota = color(K.mota.color);
  const banda = color(K.banda.color);
  for (const [tema, T] of Object.entries(t)) {
    const faltan = K.requeridos.filter((n) => !T[n]);
    if (faltan.length) { fallas.push(`${tema}: no pude leer ${faltan.join(', ')} en css/variables.css`); continue; }
    // superficies compuestas sobre el fondo de la página
    T['placa-a'] = sobre(T['--placa-a'], T['--fondo']);
    T['placa-b'] = sobre(T['--placa-b'], T['--fondo']);
    T['placa-b+mota'] = tema === 'oscuro' ? sobre(T['--placa-b'], mota) : T['placa-b'];
    T.nav = sobre(conAlfa(T['--capa-1'], K.nav_alfa), T['--fondo']);
    T['hover-secundario'] = sobre(conAlfa(T['--texto'], K.hover_alfa), T['--fondo']);
    // banda tinta: oscura en los dos temas; adentro rigen los tokens del tema oscuro
    const velo = K.banda.velo[tema];
    T.banda = sobre(conAlfa(banda, velo), T['--fondo']);
    T['banda+mota'] = tema === 'oscuro' ? sobre(conAlfa(banda, velo), mota) : T.banda;
    for (const k of ['--texto', '--texto-2', '--texto-3', '--acento-display', '--acento-texto', '--foco', '--borde']) if (t.oscuro[k]) T['banda:' + k.slice(2)] = t.oscuro[k];
    if (t.oscuro['--placa-b']) T['banda:placa-b'] = sobre(t.oscuro['--placa-b'], T.banda);
  }
  let medidos = 0;
  let peor = null;
  for (const [fg, bg, clase, nota] of K.pares) {
    for (const tema of ['claro', 'oscuro']) {
      const a = t[tema][fg], b = t[tema][bg];
      if (!a || !b) { fallas.push(`${tema}: par ${fg} / ${bg} sin color (¿cambió el nombre del token?)`); continue; }
      const r = razon(a, b);
      const vara = K.vara[tema][clase];
      medidos++;
      if (!peor || r / vara < peor.m) peor = { m: r / vara, txt: `${fg} / ${bg} (${tema}) ${r.toFixed(2)}:1 ≥ ${vara}` };
      if (r < vara) fallas.push(`${tema}: ${fg} ${hex(a)} sobre ${bg} ${hex(b)} = ${r.toFixed(2)}:1 < ${vara}:1 (${clase}${nota ? ', ' + nota : ''})`);
    }
  }
  // Demo AthleteIQ: tema único, colores #hex en su propio :root
  const D = K.demo_athleteiq;
  if (D && existe(raiz, D.pagina)) {
    const html = leer(raiz, D.pagina);
    const m = html.match(/:root\s*\{([^}]*)\}/);
    const tok = m ? Object.fromEntries([...m[1].matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-f]{6})/gi)].map((x) => [x[1], color(x[2])])) : {};
    for (const [fg, bg, clase] of D.pares) {
      const a = fg.startsWith('#') ? color(fg) : tok[fg], b = tok[bg];
      if (!a || !b) { avisos.push(`${D.pagina}: no encontré ${!a ? fg : bg} en su :root`); continue; }
      const r = razon(a, b);
      const vara = K.vara.oscuro[clase];
      medidos++;
      if (r < vara) fallas.push(`${D.pagina}: ${fg} sobre ${bg} = ${r.toFixed(2)}:1 < ${vara}:1 (${clase})`);
    }
  }
  filas.push(`${medidos} medidas`);
  if (peor) filas.push(`el más justo: ${peor.txt}`);
  return { fallas, avisos, resumen: filas.join('; ') };
}
