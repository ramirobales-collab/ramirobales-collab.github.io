/* caso.js — comportamiento propio de las páginas de caso v4 (patrón «ensayo fotográfico con pruebas»).
   Ampliación de capturas: cada figure.ampliable lleva un button.ampliar con data-ampliar="<imagen grande>"; al tocarlo
   se abre el dialog.ampliacion de la página con esa imagen, su alt y el pie de la figura (o el titular del paso del
   recorrido). Esc, el botón Cerrar o un toque fuera de la imagen lo cierran; el foco vuelve al botón (lo hace el
   navegador al cerrar un dialog modal). Sin dialog en la página, o sin soporte de showModal, no hace nada: las
   capturas ya se ven enteras en la página. */

const dialogo = document.querySelector('dialog.ampliacion');

function textoDe(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }

function abrir(boton) {
  const figura = boton.closest('figure');
  const origen = figura && figura.querySelector('img');
  const src = boton.dataset.ampliar;
  if (!origen || !src) return;
  const marco = dialogo.querySelector('.ampliacion__marco');
  const img = document.createElement('img');
  img.src = src;
  img.alt = origen.alt;
  img.decoding = 'async';
  const ancho = +origen.getAttribute('width');
  const alto = +origen.getAttribute('height');
  if (ancho && alto) { img.width = ancho; img.height = alto; }
  if (alto > ancho) img.dataset.vertical = '';
  marco.replaceChildren(img);
  const pie = figura.querySelector('figcaption') || boton.closest('li')?.querySelector('h3');
  dialogo.querySelector('.ampliacion__texto').textContent = textoDe(pie);
  // el diálogo se anuncia con lo que muestra, no con un «Imagen ampliada» igual para todas
  if (origen.alt) dialogo.setAttribute('aria-label', origen.alt);
  dialogo.showModal();
  dialogo.querySelector('.ampliacion__cerrar').focus({ preventScroll: true });
}

// Cada botón se nombra con su rótulo («Ampliar imagen», traducido por comun.js) más el alt de su imagen: un lector de
// pantalla ya no lista nueve botones iguales. Se arma con aria-labelledby, así sigue al idioma sin volver a calcularse.
function nombrarBotones() {
  document.querySelectorAll('figure button.ampliar').forEach((boton, i) => {
    const img = boton.closest('figure').querySelector('img');
    const rotulo = boton.querySelector('.oculto-visual');
    if (!img || !rotulo || !img.alt) return;
    if (!img.id) img.id = 'ampliable-' + (i + 1);
    if (!rotulo.id) rotulo.id = 'ampliar-' + (i + 1);
    boton.setAttribute('aria-labelledby', rotulo.id + ' ' + img.id);
  });
}

function iniciar() {
  if (!dialogo || typeof dialogo.showModal !== 'function') {
    document.querySelectorAll('.ampliar').forEach((b) => { b.hidden = true; });
    return;
  }
  nombrarBotones();
  document.addEventListener('click', (e) => {
    const boton = e.target.closest && e.target.closest('button.ampliar');
    if (boton) { abrir(boton); return; }
    if (!dialogo.open) return;
    if (e.target.closest('.ampliacion__cerrar') || e.target === dialogo) dialogo.close();
  });
  dialogo.addEventListener('close', () => { dialogo.querySelector('.ampliacion__marco').replaceChildren(); });
}

iniciar();
