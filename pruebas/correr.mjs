#!/usr/bin/env node
// Corre todas las pruebas del sitio. Sin dependencias: Node ≥ 22 y, para humo y vitales, Edge/Chrome/Chromium.
//
//   node pruebas/correr.mjs                 # todas
//   node pruebas/correr.mjs --solo=politica  # una (o varias separadas por coma)
//   node pruebas/correr.mjs --sin-navegador  # sólo las estáticas
//   node pruebas/correr.mjs --gpu            # humo y vitales con la placa de video real (por defecto SwiftShader)
//   node pruebas/correr.mjs --rapido         # sin revisar el historial de git
//   node pruebas/correr.mjs --paginas=index  # humo sólo en las páginas que contienen ese texto
//   node pruebas/correr.mjs --raiz=<carpeta> # otra copia del sitio
//
// Sale con 1 si falla cualquiera. Sin navegador, humo, pausa y vitales quedan OMITIDAS (en CI=1 eso cuenta como falla).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
const aquí = fileURLToPath(new URL('.', import.meta.url));
const raiz = resolve(args.raiz || resolve(aquí, '..'));
const config = JSON.parse(readFileSync(resolve(aquí, 'config.json'), 'utf8'));
const TODAS = ['enlaces', 'i18n', 'politica', 'basicos', 'terceros', 'veracidad', 'contraste', 'presupuestos', 'secretos', 'humo', 'pausa', 'vitales'];
const elegidas = args.solo ? String(args.solo).split(',') : TODAS;
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const pintar = (c, s) => (color ? `\x1b[${c}m${s}\x1b[0m` : s);
const ESTADO = { OK: pintar(32, 'OK     '), FALLA: pintar(31, 'FALLA  '), OMITIDA: pintar(33, 'OMITIDA') };

const ctx = { raiz, config, gpu: !!args.gpu, rapido: !!args.rapido, solo: args.paginas ? String(args.paginas).split(',') : null };
const resultados = [];
console.log(`Pruebas sobre ${raiz}\n`);
for (const n of elegidas) {
  if (!TODAS.includes(n)) { console.error(`no existe la prueba «${n}» (hay: ${TODAS.join(', ')})`); process.exit(2); }
  const mod = await import(`./${n}.mjs`);
  if (mod.navegador && args['sin-navegador']) { resultados.push({ n, estado: 'OMITIDA', ms: 0, resumen: 'pedido con --sin-navegador', fallas: [], avisos: [] }); continue; }
  const t0 = performance.now();
  let r;
  try { r = await mod.correr(ctx); } catch (e) { r = { fallas: [`la prueba se cortó: ${e.stack || e.message}`] }; }
  const ms = Math.round(performance.now() - t0);
  const estado = r.omitida ? 'OMITIDA' : r.fallas?.length ? 'FALLA' : 'OK';
  resultados.push({ n, estado, ms, resumen: r.omitida || r.resumen || '', fallas: r.fallas || [], avisos: r.avisos || [] });
  const ult = resultados.at(-1);
  console.log(`${ESTADO[estado]}  ${n.padEnd(13)} ${String(ms).padStart(6)} ms  ${ult.resumen}${ult.fallas.length ? `  (${ult.fallas.length} problema${ult.fallas.length > 1 ? 's' : ''})` : ''}`);
}

for (const r of resultados) {
  if (r.fallas.length) {
    console.log(`\n${pintar(31, '✗')} ${r.n} — ${r.fallas.length}:`);
    const tope = args.todo ? Infinity : 40;
    for (const f of r.fallas.slice(0, tope)) console.log(`   ${f}`);
    if (r.fallas.length > tope) console.log(`   … y ${r.fallas.length - tope} más (--todo para verlas)`);
  }
  if (r.avisos.length && (args.avisos || !r.fallas.length)) {
    console.log(`\n${pintar(33, '!')} ${r.n} — avisos (${r.avisos.length}):`);
    for (const a of r.avisos.slice(0, args.avisos ? Infinity : 8)) console.log(`   ${a}`);
    if (!args.avisos && r.avisos.length > 8) console.log(`   … y ${r.avisos.length - 8} más (--avisos)`);
  }
}
const fallo = resultados.some((r) => r.estado === 'FALLA' || (r.estado === 'OMITIDA' && process.env.CI && r.resumen !== 'pedido con --sin-navegador'));
const ok = resultados.filter((r) => r.estado === 'OK').length;
console.log(`\n${fallo ? pintar(31, 'FALLA') : pintar(32, 'OK')}: ${ok}/${resultados.length} pruebas en verde`);
process.exit(fallo ? 1 : 0);
