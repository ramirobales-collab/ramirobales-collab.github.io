// Humo en el navegador del sistema (CDP, sin dependencias). Para cada página publicada, en oscuro/ES y
// claro/EN: 0 violaciones de la política, 0 errores y excepciones de consola, 0 pedidos fallidos, 0 pedidos
// a otro origen, sin desborde horizontal, almacenamiento dentro de lo declarado y 0 cookies. Recorre la
// página entera con scroll. En la portada, además: el motor llega a «listo», los caminos de respaldo
// (?mundo=0, sin WebGL, ?quieto=1), celular, ?idioma=zz no se guarda, y la primera carga medida en red.
// En CI (CI=1, SwiftShader) cada página interior se visita una vez, alternando oscuro/ES y claro/EN, para que
// la corrida entre con margen en el tope del flujo; en local se visitan las dos combinaciones.
import { paginas } from './lib/html.mjs';
import { servir } from './lib/servidor.mjs';
import { abrirNavegador } from './lib/navegador.mjs';

export const nombre = 'humo';
export const descripcion = 'cada página en el navegador: sin violaciones, errores ni terceros; respaldos de la portada';
export const navegador = true;

const LEER = `({
  estado: document.querySelector('canvas.mundo')?.dataset.estado ?? null,
  lang: document.documentElement.lang,
  ls: Object.keys(localStorage), ss: Object.keys(sessionStorage), cookie: document.cookie,
  desborde: document.documentElement.scrollWidth - innerWidth,
  diferidas: [...document.querySelectorAll('link[data-diferida]')].filter((l) => l.media !== 'all').map((l) => l.getAttribute('href')),
  poster: [...document.querySelectorAll('.heroe__fondo img')].some((i) => i.naturalWidth > 0),
  obras: document.querySelectorAll('a.obra[href]').length,
})`;

export async function correr({ raiz, config, gpu, solo }) {
  const nav = await abrirNavegador({ gpu });
  if (!nav) return { omitida: 'no encontré Edge/Chrome/Chromium (definí NAVEGADOR=<ruta>)' };
  const srv = await servir({ raiz, puerto: 0 });
  const fallas = [];
  const avisos = [];
  let visitas = 0;
  let medida = null;
  const permitidas = config.almacenamiento;
  const recorrer = async (s, ev) => {
    const alto = await ev('document.documentElement.scrollHeight');
    for (let y = 0; y < alto; y += 900) { await ev(`scrollTo(0, ${y})`); await nav.esperar(60); }
    await ev(`document.querySelectorAll('button.acto').forEach((b) => b.click()); 1`);
    await nav.esperar(400);
    await ev('scrollTo(0, 0)');
    await nav.esperar(150);
  };
  const revisar = (etq, r, { estados = null } = {}) => {
    visitas++;
    if (r.cortada) { fallas.push(`${etq}: ${r.cortada}`); return {}; }
    const v = r.valor || {};
    for (const c of r.csp) fallas.push(`${etq}: violación ${c.directiva} (${c.bloqueado}) ${c.fuente ? c.fuente.split('/').pop() + ':' + c.linea : ''}`);
    for (const e of r.errores) fallas.push(`${etq}: consola: ${e}`);
    for (const e of r.excepciones) fallas.push(`${etq}: excepción: ${e}`);
    for (const e of r.fallidos) fallas.push(`${etq}: pedido fallido ${e}`);
    for (const e of [...new Set(r.externos)]) fallas.push(`${etq}: pedido a otro origen ${e}`);
    if (v.desborde > 1) fallas.push(`${etq}: desborde horizontal de ${v.desborde}px`);
    for (const k of v.ls || []) if (!permitidas.localStorage.includes(k)) fallas.push(`${etq}: localStorage «${k}» no declarado`);
    for (const k of v.ss || []) if (!permitidas.sessionStorage.includes(k)) fallas.push(`${etq}: sessionStorage «${k}» no declarado`);
    if (v.cookie) fallas.push(`${etq}: cookie «${v.cookie}»`);
    if (v.diferidas?.length) fallas.push(`${etq}: hojas diferidas que no se activaron: ${v.diferidas.join(', ')}`);
    if (estados && !estados.includes(v.estado)) fallas.push(`${etq}: el lienzo quedó en «${v.estado}» (esperaba ${estados.join(' o ')})`);
    return v;
  };
  try {
    const lista = paginas(raiz).filter((p) => !solo || solo.some((s) => p.includes(s)));
    const combinaciones = [['dark', 'es'], ['light', 'en']];
    for (const [n, p] of lista.entries()) {
      const combos = process.env.CI && p !== 'index.html' ? [combinaciones[n % 2]] : combinaciones;
      for (const [tema, idioma] of combos) {
        const url = `${srv.url}${p}?tema=${tema}&idioma=${idioma}`;
        const r = await nav.visitar(url, { tema, espera: p === 'index.html' ? 4000 : 1500, antes: recorrer, leer: LEER });
        const v = revisar(`${p} (${tema}, ${idioma})`, r, { estados: p === 'index.html' ? ['listo'] : null });
        if (p === 'index.html' && v.lang !== idioma) fallas.push(`${p}: lang «${v.lang}» con ?idioma=${idioma}`);
      }
      if (p !== 'index.html') continue;
      const extras = [
        ['?mundo=0', {}, ['respaldo'], (v) => !v.poster && 'sin póster en el respaldo'],
        ['?quieto=1', {}, ['listo'], null],
        ['', { sinWebgl: true }, ['sin-webgl2'], (v) => (!v.poster && 'sin póster sin WebGL') || (!v.obras && 'las zonas de producto no quedaron como enlaces')],
        ['?tema=dark', { ancho: 390, alto: 844, movil: true, tema: 'dark' }, ['listo', 'ahorro-de-datos'], null],
        ['?tema=light&idioma=en', { ancho: 390, alto: 844, movil: true, tema: 'light' }, ['listo', 'ahorro-de-datos'], null],
      ];
      for (const [q, op, estados, extra] of extras) {
        const r = await nav.visitar(`${srv.url}index.html${q}`, { espera: 4500, antes: recorrer, leer: LEER, ...op });
        const etq = `index.html ${q || ''}${op.sinWebgl ? ' sin WebGL' : ''}${op.movil ? ' celular' : ''}`.trim();
        const v = revisar(etq, r, { estados });
        const msg = extra && extra(v);
        if (msg) fallas.push(`${etq}: ${msg}`);
      }
      // ?idioma inválido: no se guarda ni rompe el arranque
      const z = await nav.visitar(`${srv.url}index.html?idioma=zz`, { espera: 3000, leer: LEER });
      const vz = revisar('index.html ?idioma=zz', z);
      if (!['es', 'en'].includes(vz.lang) || (vz.ls || []).includes('zz')) fallas.push(`index.html ?idioma=zz: lang «${vz.lang}» (se tiene que ignorar)`);
      // Primera carga medida: sin scroll, hasta que el motor está listo
      const m = await nav.visitar(`${srv.url}index.html`, { espera: 6000, leer: LEER });
      medida = m.bytes;
      const max = config.presupuestos.primera_carga_portada.max;
      if (m.bytes > max) fallas.push(`index.html: primera carga medida ${(m.bytes / 1000).toFixed(0)} KB > ${(max / 1000).toFixed(0)} KB`);
    }
  } finally {
    await nav.cerrar();
    await srv.cerrar();
  }
  return { fallas, avisos, resumen: `${visitas} visitas${medida ? `; primera carga medida ${(medida / 1000).toFixed(0)} KB` : ''}${gpu ? ' (GPU)' : ' (SwiftShader)'}` };
}
