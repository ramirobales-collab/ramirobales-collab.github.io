/* Arranque del fondo líquido del inicio. Es un módulo async aparte para no esperar a GSAP ni a comun.js:
   antes colgaba del evento load y, en un celular con red lenta, el lienzo quedaba segundos sin «listo» y sin
   rastro. Cada salida deja su estado en data-estado del lienzo y en la consola. */
const lienzo = document.querySelector('.heroe__lava');
const cabecera = document.querySelector('.heroe');
const params = new URLSearchParams(location.search);
if (lienzo && cabecera) {
  if (navigator.connection?.saveData) {
    lienzo.dataset.estado = 'ahorro-de-datos';
    console.info('fondo líquido: se omite por el ahorro de datos');
  } else {
    if (params.get('fondo') === '1') document.documentElement.classList.add('solo-fondo');
    lienzo.dataset.estado = 'cargando';
    import('./lava.js')
      .then((m) => { if (!m.iniciar(lienzo, cabecera)) console.warn('fondo líquido: no arrancó, estado', lienzo.dataset.estado); })
      .catch((e) => { lienzo.dataset.estado = 'error-carga'; console.warn('fondo líquido no disponible', e); });
  }
}

/* Galería 3D: sólo escritorio con puntero fino y sin ahorro de datos; se pide cuando el hilo queda libre. */
const escena = document.querySelector('.heroe__escena');
const escritorio = matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)');
if (escena && cabecera && !navigator.connection?.saveData && params.get('3d') !== '0') {
  let pedida = false;
  const pedir = () => {
    if (pedida || !escritorio.matches) return;
    pedida = true;
    escena.dataset.estado = 'esperando';
    const ir = () => import('./escena.js')
      .then((m) => m.iniciar(escena, cabecera))
      .catch((e) => { escena.dataset.estado = 'error-carga'; console.warn('galería 3D no disponible', e); });
    (window.requestIdleCallback ? (f) => requestIdleCallback(f, { timeout: 1500 }) : (f) => setTimeout(f, 300))(ir);
  };
  pedir();
  escritorio.addEventListener('change', pedir);
}
