// Política de seguridad de contenido: segunda implementación, en JavaScript, de lo que escribe
// herramientas/proteccion.py. Si los hashes recalculados acá no coinciden con los declarados en la
// página, falla (aunque Python diga que está todo bien). Además valida /.well-known/security.txt.
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { paginas, leer, etiquetas, bloques, esEjecutable } from './lib/html.mjs';

export const nombre = 'politica';
export const descripcion = 'CSP por meta al día (hashes), referrer, sin manejadores ni style= en línea; security.txt';

const hash = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;
const fuentes = (pol, d) => (pol.split(';').map((x) => x.trim().split(/\s+/)).find((x) => x[0] === d) || [null]).slice(1);

export function correr({ raiz, config, hoy = new Date() }) {
  const P = config?.politica || { img_data: [] };
  const fallas = [];
  let conPolitica = 0;
  const lista = paginas(raiz);
  for (const p of lista) {
    const texto = leer(raiz, p);
    const ets = etiquetas(texto);
    const iCharset = ets.findIndex((e) => e.tag === 'meta' && 'charset' in e.attrs);
    const iCsp = ets.findIndex((e) => e.tag === 'meta' && (e.attrs['http-equiv'] || '').toLowerCase() === 'content-security-policy');
    const ref = ets.find((e) => e.tag === 'meta' && e.attrs.name === 'referrer');
    if (iCsp < 0) { fallas.push(`${p}: sin política (corré python herramientas/proteccion.py)`); }
    else {
      conPolitica++;
      if (iCharset < 0 || iCsp !== iCharset + 1) fallas.push(`${p}: la meta CSP tiene que ir justo después de <meta charset>`);
      const antes = ets.slice(0, iCsp).find((e) => ['script', 'style', 'link'].includes(e.tag));
      if (antes) fallas.push(`${p}:${antes.linea}: <${antes.tag}> antes de la política (no lo cubre)`);
      const pol = ets[iCsp].attrs.content || '';
      const bl = bloques(texto);
      const usadosJs = new Set(bl.filter(esEjecutable).map((b) => hash(b.contenido)));
      const usadosCss = new Set(bl.filter((b) => b.tag === 'style').map((b) => hash(b.contenido)));
      for (const [d, usados] of [['script-src', usadosJs], ['style-src', usadosCss]]) {
        const decl = new Set(fuentes(pol, d).filter((f) => f.startsWith("'sha")));
        const sinDeclarar = [...usados].filter((h) => !decl.has(h));
        const sinUso = [...decl].filter((h) => !usados.has(h));
        if (sinDeclarar.length) fallas.push(`${p}: ${d} usado sin declarar ${sinDeclarar.join(' ')} (corré proteccion.py)`);
        if (sinUso.length) fallas.push(`${p}: ${d} declarado sin uso ${sinUso.join(' ')} (corré proteccion.py)`);
      }
      const js = fuentes(pol, 'script-src');
      if (!fuentes(pol, 'default-src').length) fallas.push(`${p}: falta default-src`);
      for (const malo of ["'unsafe-inline'", "'unsafe-eval'", '*', 'http:', 'https:', 'data:', 'blob:']) if (js.includes(malo)) fallas.push(`${p}: script-src con ${malo}`);
      if (fuentes(pol, 'style-src').includes("'unsafe-inline'")) fallas.push(`${p}: style-src con 'unsafe-inline'`);
      if (fuentes(pol, 'img-src').includes('data:') && !P.img_data.includes(p)) fallas.push(`${p}: img-src con data: (sólo en ${P.img_data.join(', ')}; config.json → politica)`);
      if (!ets.some((e) => e.tag === 'script')) for (const d of ['script-src', 'connect-src']) if (fuentes(pol, d).join(' ') !== "'none'") fallas.push(`${p}: página sin scripts con ${d} «${fuentes(pol, d).join(' ')}» (tiene que ser 'none')`);
      if (fuentes(pol, 'object-src').join(' ') !== "'none'") fallas.push(`${p}: object-src tiene que ser 'none'`);
      if (!fuentes(pol, 'base-uri').length) fallas.push(`${p}: falta base-uri`);
      if (!fuentes(pol, 'form-action').length) fallas.push(`${p}: falta form-action`);
      if (/frame-ancestors|report-uri|report-to|sandbox/.test(pol)) fallas.push(`${p}: directiva que en <meta> se ignora (frame-ancestors/report-*/sandbox)`);
    }
    if (!ref) fallas.push(`${p}: sin <meta name="referrer">`);
    else if (!['no-referrer', 'same-origin', 'strict-origin', 'strict-origin-when-cross-origin'].includes(ref.attrs.content)) fallas.push(`${p}: referrer «${ref.attrs.content}» no es estricto`);
    for (const e of ets) {
      for (const a of Object.keys(e.attrs)) {
        if (/^on[a-z]+$/.test(a)) fallas.push(`${p}:${e.linea}: manejador en línea ${a}= en <${e.tag}>`);
        if (a === 'style') fallas.push(`${p}:${e.linea}: atributo style= en <${e.tag}> (lo bloquea style-src)`);
      }
      for (const a of ['href', 'src', 'action', 'formaction']) if (/^\s*javascript:/i.test(e.attrs[a] || '')) fallas.push(`${p}:${e.linea}: URL javascript:`);
      if (['base', 'iframe', 'frame', 'object', 'embed'].includes(e.tag)) fallas.push(`${p}:${e.linea}: <${e.tag}> no permitido`);
    }
  }

  // security.txt (RFC 9116)
  const st = join(raiz, '.well-known', 'security.txt');
  if (!existsSync(st)) fallas.push('.well-known/security.txt no existe');
  else {
    const t = leer(raiz, '.well-known/security.txt');
    const campo = (n) => (t.match(new RegExp(`^${n}:\\s*(.+)$`, 'mi')) || [])[1]?.trim();
    if (!/^mailto:|^https:/.test(campo('Contact') || '')) fallas.push('security.txt: falta Contact (mailto: o https:)');
    const vence = new Date(campo('Expires') || 'x');
    const dias = (vence - hoy) / 864e5;
    if (isNaN(dias)) fallas.push('security.txt: falta Expires o no es una fecha ISO');
    else if (dias < 30) fallas.push(`security.txt: vence en ${Math.round(dias)} días (renovar)`);
    else if (dias > 366) fallas.push('security.txt: Expires a más de un año (RFC 9116 lo desaconseja)');
    if (!campo('Canonical')) fallas.push('security.txt: falta Canonical');
    if (!campo('Preferred-Languages')) fallas.push('security.txt: falta Preferred-Languages');
    if (!existsSync(join(raiz, '.nojekyll'))) fallas.push('.nojekyll no existe: GitHub Pages no publicaría /.well-known/');
  }
  return { fallas, resumen: `${conPolitica}/${lista.length} páginas con política` };
}
