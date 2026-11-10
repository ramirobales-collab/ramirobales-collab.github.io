// La página en pausa sin aviso. El motor de la portada tiene que sobrevivir cuando el navegador deja de entregar
// cuadros o deja la ventana sin tamaño SIN avisar por visibilitychange (un panel oculto, una ventana tapada) y
// cuando la pestaña se abre de fondo. Antes de esta prueba el motor confundía eso con una placa lenta y dejaba el
// póster fijo, o guardaba valores inválidos en la cámara y la sala quedaba en negro hasta recargar.
// Casos: cuadros a uno por segundo durante el arranque · ventana en cero con el motor ya listo · carga con la
// ventana en cero · pestaña de fondo · respaldo por lentitud que se recupera al volver a la página.
// Con placa real (--gpu) el motor tiene que quedar «listo» y dibujando; por software la portada va al póster a
// propósito, y ahí se comprueba que nada de esto tire una excepción.
import { servir } from './lib/servidor.mjs';
import { abrirNavegador } from './lib/navegador.mjs';

export const nombre = 'pausa';
export const descripcion = 'el motor sobrevive a quedar sin cuadros o sin tamaño (panel oculto, pestaña de fondo)';
export const navegador = true;

/* Compuerta de cuadros: se inyecta antes que la página. __pausar(ms) retiene los cuadros, __lento(ms, cada) los
   entrega de a uno cada `cada` ms, __soltarYa() vuelve a lo normal. __cuadros cuenta los entregados. */
const COMPUERTA = `(() => {
  const real = window.requestAnimationFrame.bind(window);
  let modo = 0, cola = [], reloj = 0;
  window.__cuadros = 0;
  window.requestAnimationFrame = (cb) => { const f = (t) => { window.__cuadros++; cb(t); }; if (modo === 0) return real(f); cola.push(f); return 1e9 + cola.length; };
  const soltar = () => { const c = cola.splice(0); if (c.length) real((t) => c.forEach((f) => f(t))); };
  window.__pausar = (ms) => { modo = 1; setTimeout(() => { modo = 0; soltar(); }, ms); };
  window.__lento = (ms, cada) => { modo = 2; reloj = setInterval(soltar, cada); setTimeout(() => { clearInterval(reloj); modo = 0; soltar(); }, ms); };
  window.__soltarYa = () => { clearInterval(reloj); modo = 0; soltar(); };
  const w = Object.getOwnPropertyDescriptor(window, 'innerWidth'), h = Object.getOwnPropertyDescriptor(window, 'innerHeight');
  let tapado = false;
  const tapar = () => { if (tapado && document.documentElement) document.documentElement.style.display = 'none'; };
  new MutationObserver(tapar).observe(document, { childList: true, subtree: true });
  /* ventana en cero: así la deja un panel oculto (innerWidth e innerHeight en 0 y todo sin caja) */
  window.__sinTamano = () => { tapado = true; Object.defineProperty(window, 'innerWidth', { configurable: true, get: () => 0 }); Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => 0 }); tapar(); window.dispatchEvent(new Event('resize')); };
  window.__conTamano = () => { tapado = false; Object.defineProperty(window, 'innerWidth', w); Object.defineProperty(window, 'innerHeight', h); document.documentElement.style.display = ''; window.dispatchEvent(new Event('resize')); };
  let oculto = false;
  window.__ocultar = () => { oculto = true; Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (oculto ? 'hidden' : 'visible') }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => oculto }); };
  window.__mostrar = () => { oculto = false; document.dispatchEvent(new Event('visibilitychange')); };
})();`;

const LEER = `(() => {
  const c = document.querySelector('canvas.mundo'), M = c && c.mundo, mal = [];
  if (M && M.sala && M.sala.cam) for (const k of ['tx', 'ty', 'tz']) if (!Number.isFinite(M.sala.cam[k])) mal.push('cámara.' + k);
  const estilo = document.querySelector('.heroe')?.getAttribute('style') || '';
  if (/NaN|Infinity/.test(estilo)) mal.push('estilo del héroe: ' + estilo);
  return { estado: c ? c.dataset.estado : null, noFinitos: mal, nivel: M && M.motor ? M.motor.nivel : null, cuadros: window.__cuadros };
})()`;

export async function correr({ raiz, gpu }) {
  const nav = await abrirNavegador({ gpu });
  if (!nav) return { omitida: 'no encontré Edge/Chrome/Chromium (definí NAVEGADOR=<ruta>)' };
  const srv = await servir({ raiz, puerto: 0 });
  const fallas = [];
  const vivos = gpu ? ['listo'] : ['listo', 'software'];
  const porSegundo = async (ev) => { const a = await ev('window.__cuadros'); await nav.esperar(1000); return (await ev('window.__cuadros')) - a; };
  const casos = [
    ['cuadros a uno por segundo en el arranque', 300, '__lento(12000, 1000);', async (ev) => { await nav.esperar(16000); }],
    ['ventana en cero con el motor listo', 9000, '', async (ev) => { await ev('__sinTamano()'); await nav.esperar(1200); await ev('__pausar(6000)'); await nav.esperar(6500); await ev('__conTamano()'); await nav.esperar(4000); }],
    ['carga con la ventana en cero', 9000, '__sinTamano(); __pausar(3600000);', async (ev) => { await ev('__conTamano(); __soltarYa()'); await nav.esperar(8000); }],
    ['pestaña de fondo', 9000, '__ocultar(); __pausar(3600000);', async (ev) => { await ev('__soltarYa(); __mostrar()'); await nav.esperar(8000); }],
  ];
  if (gpu) casos.push(['respaldo por lentitud que se recupera al volver', 9000, '', async (ev) => {
    await ev(`(() => { const m = document.querySelector('canvas.mundo').mundo.motor; for (const f of m.ganchos.alLento) f(m, 99); })()`);
    await nav.esperar(1500);
    const e = await ev(`document.querySelector('canvas.mundo').dataset.estado`);
    if (e !== 'lento') fallas.push(`respaldo por lentitud: el lienzo quedó en «${e}» (esperaba lento)`);
    await nav.esperar(8000); await ev(`window.dispatchEvent(new Event('focus'))`); await nav.esperar(10000);
  }]);
  let hechos = 0;
  try {
    for (const [etq, espera, alCargar, pasos] of casos) {
      let cps = -1;
      const r = await nav.visitar(`${srv.url}index.html?tema=dark&idioma=es`, {
        ancho: 1440, alto: 900, tema: 'dark', espera, tope: 90000, inyectar: COMPUERTA + alCargar,
        antes: async (s, ev) => { await pasos(ev); cps = await porSegundo(ev); }, leer: LEER,
      });
      hechos++;
      if (r.cortada) { fallas.push(`${etq}: ${r.cortada}`); continue; }
      const v = r.valor || {};
      for (const e of r.excepciones) fallas.push(`${etq}: excepción: ${e}`);
      for (const e of r.errores) fallas.push(`${etq}: consola: ${e}`);
      if (!vivos.includes(v.estado)) fallas.push(`${etq}: el lienzo quedó en «${v.estado}» (esperaba ${vivos.join(' o ')})`);
      if (v.noFinitos?.length) fallas.push(`${etq}: valores inválidos en ${v.noFinitos.join(', ')}`);
      if (gpu && v.estado === 'listo' && cps < 20) fallas.push(`${etq}: el motor dice «listo» pero dibuja ${cps} cuadros por segundo`);
    }
  } finally {
    await nav.cerrar();
    await srv.cerrar();
  }
  return { fallas, avisos: [], resumen: `${hechos} casos${gpu ? ' (GPU)' : ' (SwiftShader: sólo que no rompa)'}` };
}
