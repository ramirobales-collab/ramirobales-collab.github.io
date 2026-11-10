// Ningún secreto en el repo: credenciales, archivos de claves, rutas de la máquina local, correos de más.
// Mira el árbol entero (no sólo lo publicado: también herramientas/ y pruebas/) y, si hay git y no se pidió
// --rapido, todo el historial con «git grep» y «git log -p» (sólo lectura). Los servicios propios y los nombres
// internos se comparan por huella (pruebas/lib/huella.mjs): la lista no está escrita en el repo.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { archivos, lineaDe, TEXTO } from './lib/html.mjs';
import { buscar } from './lib/huella.mjs';

export const nombre = 'secretos';
export const descripcion = 'sin credenciales, claves, servicios propios, rutas locales ni correos de más (árbol e historial)';

export function correr({ raiz, config, rapido }) {
  const S = config.secretos;
  const fallas = [];
  const avisos = [];
  const lista = archivos(raiz);
  const reNombre = new RegExp(S.nombres_prohibidos, 'i');
  const reRuta = new RegExp(S.rutas_locales);
  const reDir = new RegExp(S.direcciones_locales.re);
  // El README explica cómo servirlo en local: ahí la dirección con puerto es documentación, no una fuga.
  const publicado = (f) => !/^(pruebas|herramientas|\.github)\//.test(f) && f !== 'README.md';
  const reTel = new RegExp(S.telefono, 'g');
  const permitidos = new Set(S.correos_permitidos.map((c) => c.correo));
  let textos = 0;
  for (const f of lista) {
    if (reNombre.test(f)) fallas.push(`${f}: nombre de archivo de secretos`);
    if (!TEXTO.test(f)) continue;
    textos++;
    const t = readFileSync(join(raiz, f), 'utf8');
    // Las pruebas y su configuración contienen los patrones a propósito
    const esConfig = f === 'pruebas/config.json' || f === 'pruebas/secretos.mjs';
    for (const c of S.credenciales) {
      if (esConfig) continue;
      const m = new RegExp(c.re).exec(t);
      if (m) fallas.push(`${f}:${lineaDe(t, m.index)}: ${c.motivo} («${m[0].slice(0, 12)}…»)`);
    }
    for (const h of buscar(t, config.huellas.servicios)) fallas.push(`${f}:${lineaDe(t, h.pos)}: ${h.motivo} (huella)`);
    if (!esConfig && !f.startsWith('lib/')) {
      const m = reRuta.exec(t);
      if (m) fallas.push(`${f}:${lineaDe(t, m.index)}: ruta de la máquina local «${m[0]}»`);
      const d = publicado(f) && reDir.exec(t);
      if (d) fallas.push(`${f}:${lineaDe(t, d.index)}: ${S.direcciones_locales.motivo.split(';')[0]} «${d[0]}»`);
    }
    if (esConfig) continue;
    for (const m of t.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
      const correo = m[0].toLowerCase();
      if (/\.(png|jpg|webp|avif|svg|js|css)$/.test(correo) || /@\d+x\./.test(correo)) continue;
      const regla = S.correos_permitidos.find((c) => c.correo === correo);
      if (!regla || (regla.en && !new RegExp(regla.en).test(f))) {
        if (correo.endsWith('@anthropic.com') || correo.endsWith('@example.com')) continue;
        fallas.push(`${f}:${lineaDe(t, m.index)}: correo no declarado «${correo}»`);
      }
    }
    for (const m of t.matchAll(reTel)) {
      const ok = S.telefono_permitido.find((p) => new RegExp(p.en).test(f));
      (ok ? avisos : fallas).push(`${f}:${lineaDe(t, m.index)}: teléfono${ok ? ` (${ok.motivo})` : ''}`);
    }
  }
  // PDF: buscar rutas y autor en los metadatos crudos
  for (const f of lista.filter((x) => x.endsWith('.pdf'))) {
    const b = readFileSync(join(raiz, f)).toString('latin1');
    if (reRuta.test(b)) fallas.push(`${f}: ruta local dentro del PDF`);
    const autor = b.match(/\/Author\s*\(([^)]*)\)/);
    if (autor) avisos.push(`${f}: /Author «${autor[1]}»`);
  }

  let historial = 'historial: omitido';
  if (!rapido) {
    try {
      const revs = execFileSync('git', ['-C', raiz, 'rev-list', '--all'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').filter(Boolean);
      const patrones = S.credenciales.map((c) => c.re);
      let encontrados = 0;
      for (let i = 0; i < revs.length; i += 50) {
        let out = '';
        try {
          out = execFileSync('git', ['-C', raiz, 'grep', '-I', '-l', '-P', ...patrones.flatMap((p) => ['-e', p]), ...revs.slice(i, i + 50), '--', '.', ':!pruebas/config.json', ':!pruebas/secretos.mjs'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 << 20 });
        } catch (e) { out = e.status === 1 ? '' : (e.stdout || ''); }
        for (const l of out.split('\n').filter(Boolean)) { encontrados++; fallas.push(`historial ${l}: patrón de credencial`); }
      }
      // Servicios propios y nombres internos, por huella, en cada línea agregada de cada commit
      const huellas = [...config.huellas.servicios, ...config.huellas.en_todo];
      const diff = execFileSync('git', ['-C', raiz, 'log', '--all', '-p', '-U0', '--no-color', '--no-ext-diff', '--no-renames', '--format=@@commit %h'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 512 << 20 });
      let commit = '', archivo = '';
      const vistos = new Set();
      for (const l of diff.split(String.fromCharCode(10))) {
        if (l.startsWith('@@commit ')) { commit = l.slice(9); continue; }
        if (l.startsWith('+++ ')) { archivo = l.slice(6); continue; }
        if (l[0] !== '+' || l.startsWith('+++')) continue;
        for (const h of buscar(l, huellas)) {
          const k = `${commit} ${archivo} ${h.motivo}`;
          if (vistos.has(k)) continue;
          vistos.add(k); encontrados++;
          fallas.push(`historial ${commit}:${archivo}: ${h.motivo} (huella; hay que reescribir ese commit antes de publicar)`);
        }
      }
      historial = `historial: ${revs.length} commits, ${encontrados} coincidencias`;
    } catch { historial = 'historial: sin git (omitido)'; }
  }
  return { fallas, avisos, resumen: `${textos} archivos de texto; ${historial}` };
}
