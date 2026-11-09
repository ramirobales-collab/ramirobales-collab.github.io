/* Galería 3D del inicio (sólo escritorio con puntero fino).
   Las cuatro capturas pasan a ser piezas físicas modeladas en Blender (assets/3d/obras): losas de metal anodizado
   con vidrio delantero y un teléfono con canto de titanio, con la oclusión ambiental y la sombra de contacto
   horneadas en Cycles. Luz por HDRI de estudio + luces de color de la lámpara, tone mapping ACES.
   Cada pieza se apoya exactamente sobre la caja de su tarjeta del DOM (que sigue siendo el enlace, el foco y el
   respaldo): a profundidad cero coincide píxel a píxel; después se separa en Z, flota, sigue al puntero con
   paralaje real de cámara y se abre en profundidad con el scroll. Con movimiento reducido o ?quieto=1 queda
   quieta en su pose final. Si algo falla, quedan las tarjetas del DOM y el motivo en data-estado. */
import * as THREE from 'three';
import { GLTFLoader } from '../lib/GLTFLoader.js';
import { RGBELoader } from '../lib/RGBELoader.js';

const RAIZ = new URL('../', import.meta.url);
const ruta = (p) => new URL(p, RAIZ).href;
const QS = new URLSearchParams(location.search);
const GRADO = Math.PI / 180;

// Medidas de las piezas en Blender (unidades del modelo); el frente mira a +Z.
const PIEZAS = {
  losa: { ancho: 1.6, alto: 0.9, canto: 0.075 },
  telefono: { ancho: 0.9, alto: 1.86, canto: 0.082 },
};
// Cuánto se separa cada obra en profundidad al bajar (px de mundo) y hacia dónde gira.
const APERTURA = { cathedra: 40, athleteiq: -260, coro: -180, fortal: 230 };

const suave = (x) => 1 - Math.pow(1 - Math.min(Math.max(x, 0), 1), 4);
const acercar = (a, b, k) => a + (b - a) * k;

export async function iniciar(lienzo, cabecera) {
  const fallar = (estado, detalle) => { lienzo.dataset.estado = estado; console.warn(`galería 3D: ${estado}`, detalle || ''); return false; };
  const contenedor = cabecera.querySelector('.heroe__obras');
  const tarjetas = [...cabecera.querySelectorAll('.obra')];
  if (!contenedor || !tarjetas.length) return fallar('sin-obras');
  const reducido = matchMedia('(prefers-reduced-motion: reduce)');
  const tFijo = QS.has('t') ? parseFloat(QS.get('t')) : null;
  const quieto = () => QS.get('quieto') === '1' || reducido.matches || tFijo !== null;
  lienzo.dataset.estado = 'cargando';

  let render;
  try {
    render = new THREE.WebGLRenderer({ canvas: lienzo, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch (e) { return fallar('sin-webgl', e.message); }
  render.setClearColor(0x000000, 0);
  render.outputColorSpace = THREE.SRGBColorSpace;
  render.toneMapping = THREE.ACESFilmicToneMapping;
  render.toneMappingExposure = 1.05;

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(26, 1, 20, 30000);

  // ---------- Recursos ----------
  const gltf = new GLTFLoader();
  const texturas = new THREE.TextureLoader();
  const cargarTex = (p, opciones = {}) => new Promise((ok, mal) => texturas.load(p, (t) => { Object.assign(t, opciones); ok(t); }, undefined, mal));
  const mayorDe = (img) => {
    const fuentes = (img.getAttribute('srcset') || '').split(',').map((s) => s.trim().split(/\s+/)).filter((p) => p[0]);
    fuentes.sort((a, b) => parseInt(b[1], 10) - parseInt(a[1], 10));
    return fuentes.length ? new URL(fuentes[0][0], location.href).href : img.currentSrc || img.src;
  };
  let recursos;
  try {
    const [losa, telefono, hdr, aoLosa, aoTel, sombraLosa, sombraTel, ...capturas] = await Promise.all([
      gltf.loadAsync(ruta('assets/3d/obras/losa.glb')),
      gltf.loadAsync(ruta('assets/3d/obras/telefono.glb')),
      new RGBELoader().loadAsync(ruta('assets/3d/env/studio_small_09_512.hdr')),
      cargarTex(ruta('assets/3d/obras/losa-ao.webp'), { flipY: false }),
      cargarTex(ruta('assets/3d/obras/telefono-ao.webp'), { flipY: false }),
      cargarTex(ruta('assets/3d/obras/sombra-losa.webp')),
      cargarTex(ruta('assets/3d/obras/sombra-telefono.webp')),
      ...tarjetas.map((t) => cargarTex(mayorDe(t.querySelector('img')), { flipY: false, colorSpace: THREE.SRGBColorSpace })),
    ]);
    recursos = { losa, telefono, hdr, ao: { losa: aoLosa, telefono: aoTel }, sombra: { losa: sombraLosa, telefono: sombraTel }, capturas };
  } catch (e) { render.dispose(); return fallar('error-recursos', e?.message || e); }

  const pmrem = new THREE.PMREMGenerator(render);
  escena.environment = pmrem.fromEquirectangular(recursos.hdr).texture;
  recursos.hdr.dispose(); pmrem.dispose();

  // ---------- Luces: clave lila, contraluz magenta que dibuja el canto, y la lámpara desde abajo ----------
  const clave = new THREE.DirectionalLight(0xd9c8ff, 1.4); clave.position.set(-0.9, 1.1, 1.4);
  const contra = new THREE.DirectionalLight(0xff6fe0, 2.2); contra.position.set(1.3, 0.35, -0.7);
  const lampara = new THREE.DirectionalLight(0x8a5cff, 1.1); lampara.position.set(-0.2, -1, 0.55);
  const barrido = new THREE.DirectionalLight(0xffffff, 0.9); // reflejo que cruza el vidrio despacio
  escena.add(clave, contra, lampara, barrido);

  // ---------- Materiales ----------
  const anisotropia = Math.min(8, render.capabilities.getMaxAnisotropy());
  const matMarco = {
    losa: new THREE.MeshPhysicalMaterial({ metalness: 1, roughness: 0.3, clearcoat: 0.55, clearcoatRoughness: 0.18, aoMap: recursos.ao.losa, aoMapIntensity: 1 }),
    telefono: new THREE.MeshPhysicalMaterial({ metalness: 1, roughness: 0.24, clearcoat: 0.4, clearcoatRoughness: 0.12, aoMap: recursos.ao.telefono, aoMapIntensity: 1 }),
  };
  // Vidrio: base negra con mezcla aditiva, así sólo suma reflejos (Fresnel del entorno + barniz), como un vidrio real.
  const matVidrio = new THREE.MeshPhysicalMaterial({
    color: 0x000000, metalness: 0, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.7,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });

  // ---------- Piezas ----------
  const tipoDe = (t) => (t.classList.contains('obra--fortal') ? 'telefono' : 'losa');
  const nombreDe = (t) => (t.className.match(/obra--(\w+)/) || [])[1] || 'obra';
  const obras = tarjetas.map((tarjeta, i) => {
    const tipo = tipoDe(tarjeta);
    const pieza = PIEZAS[tipo];
    const fuente = recursos[tipo].scene;
    const grupo = new THREE.Group();
    const cuerpo = new THREE.Group(); // lo que flota y se inclina; la sombra queda en el grupo
    grupo.add(cuerpo);
    let pantallaGeo = null;
    fuente.traverse((n) => {
      if (!n.isMesh) return;
      const m = new THREE.Mesh(n.geometry, null);
      m.position.copy(n.position); m.quaternion.copy(n.quaternion); m.scale.copy(n.scale);
      if (/marco/.test(n.name)) m.material = matMarco[tipo];
      else if (/vidrio/.test(n.name)) { m.material = matVidrio; m.renderOrder = 2; }
      else if (/pantalla/.test(n.name)) { pantallaGeo = n.geometry; m.renderOrder = 1; m.userData.pantalla = true; }
      cuerpo.add(m);
    });
    // La captura cubre la pantalla como object-fit: cover, alineada arriba (igual que la tarjeta del DOM).
    const tex = recursos.capturas[i];
    tex.anisotropy = anisotropia;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    pantallaGeo.computeBoundingBox();
    const caja = pantallaGeo.boundingBox;
    const aspPantalla = (caja.max.x - caja.min.x) / (caja.max.y - caja.min.y);
    const aspImagen = tex.image.width / tex.image.height;
    if (aspImagen > aspPantalla) { tex.repeat.set(aspPantalla / aspImagen, 1); tex.offset.set((1 - tex.repeat.x) / 2, 0); }
    else { tex.repeat.set(1, aspImagen / aspPantalla); tex.offset.set(0, 0); }
    const matPantalla = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    cuerpo.children.forEach((m) => { if (m.userData.pantalla) m.material = matPantalla; });

    // Sombra horneada en Blender: plano detrás de la pieza, levemente corrido hacia abajo.
    const lado = Math.max(pieza.ancho, pieza.alto) * 2.2;
    const matSombra = new THREE.MeshBasicMaterial({ map: recursos.sombra[tipo], color: 0x06030d, transparent: true, depthWrite: false, opacity: 0 });
    const sombra = new THREE.Mesh(new THREE.PlaneGeometry(lado, lado), matSombra);
    sombra.position.set(0, -pieza.alto * 0.06, -(pieza.canto / 2 + 0.16));
    sombra.renderOrder = -1;
    grupo.add(sombra);
    escena.add(grupo);

    const estilo = getComputedStyle(tarjeta);
    const nombre = nombreDe(tarjeta);
    return {
      tarjeta, grupo, cuerpo, sombra, matSombra, matPantalla, pieza, nombre, i,
      z: parseFloat(estilo.getPropertyValue('--z')) || 0.7,
      ry: (parseFloat(estilo.getPropertyValue('--ry')) || 0) * GRADO,
      rz: (parseFloat(estilo.getPropertyValue('--rz')) || 0) * GRADO,
      apertura: APERTURA[nombre] ?? 0,
      demora: { athleteiq: 0.0, coro: 0.12, cathedra: 0.22, fortal: 0.36 }[nombre] ?? i * 0.1,
      elevar: 0, elevarObjetivo: 0, caja: null,
    };
  });

  // Hover y foco del enlace del DOM levantan la pieza hacia la cámara.
  obras.forEach((o) => {
    const subir = () => { o.elevarObjetivo = 1; pedir(); };
    const bajar = () => { o.elevarObjetivo = 0; pedir(); };
    o.tarjeta.addEventListener('pointerenter', subir);
    o.tarjeta.addEventListener('pointerleave', bajar);
    o.tarjeta.addEventListener('focus', subir);
    o.tarjeta.addEventListener('blur', bajar);
  });

  // ---------- Polvo de luz en tres planos (delante, medio, detrás): da la escala de la profundidad ----------
  const N_POLVO = 90;
  const posPolvo = new Float32Array(N_POLVO * 3);
  const semilla = new Float32Array(N_POLVO);
  for (let k = 0; k < N_POLVO; k++) {
    posPolvo[k * 3] = (Math.random() - 0.5) * 1.6;
    posPolvo[k * 3 + 1] = (Math.random() - 0.5) * 1.3;
    posPolvo[k * 3 + 2] = -700 + Math.random() * 1050;
    semilla[k] = Math.random() * 100;
  }
  const geoPolvo = new THREE.BufferGeometry();
  geoPolvo.setAttribute('position', new THREE.BufferAttribute(posPolvo.slice(), 3));
  const puntoTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(235,215,255,0.55)'); r.addColorStop(1, 'rgba(200,160,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const matPolvo = new THREE.PointsMaterial({ map: puntoTex, size: 7, sizeAttenuation: true, transparent: true, depthWrite: false, color: 0xd8b8ff, opacity: 0.85 });
  const polvo = new THREE.Points(geoPolvo, matPolvo);
  polvo.renderOrder = 3;
  escena.add(polvo);

  // ---------- Tema ----------
  const esClaro = () => {
    const t = document.documentElement.dataset.theme;
    return t === 'light' || (t !== 'dark' && matchMedia('(prefers-color-scheme: light)').matches);
  };
  const aplicarTema = () => {
    const claro = esClaro();
    matMarco.losa.color.set(claro ? 0xcfc6e2 : 0x3b3150);
    matMarco.telefono.color.set(claro ? 0xd8d2e6 : 0x4a4060);
    matMarco.losa.envMapIntensity = matMarco.telefono.envMapIntensity = claro ? 1.0 : 1.25;
    obras.forEach((o) => { o.matSombra.color.set(claro ? 0x3b1f73 : 0x05020b); o.sombraMax = claro ? 0.34 : 0.92; });
    matPolvo.blending = claro ? THREE.NormalBlending : THREE.AdditiveBlending;
    matPolvo.color.set(claro ? 0x7c4ad8 : 0xd8b8ff);
    matPolvo.opacity = claro ? 0.38 : 0.85;
    matPolvo.needsUpdate = true;
    contra.intensity = claro ? 1.3 : 2.2;
    lampara.intensity = claro ? 0.6 : 1.1;
    pedir();
  };

  // ---------- Medidas: el mundo usa píxeles CSS (a Z = 0, una unidad = un píxel) ----------
  const polvoBase = { x: 0, y: 0, w: 1, h: 1 };
  let ancho = 0, alto = 0, D = 1000, ratio = Math.min(devicePixelRatio || 1, 1.75);
  const medir = () => {
    const r = lienzo.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    if (r.width !== ancho || r.height !== alto) {
      ancho = r.width; alto = r.height;
      render.setPixelRatio(ratio);
      render.setSize(ancho, alto, false);
      camara.aspect = ancho / alto;
      D = (alto / 2) / Math.tan((camara.fov / 2) * GRADO);
      camara.near = D * 0.05; camara.far = D * 4;
      camara.updateProjectionMatrix();
    }
    // Caja de cada tarjeta sin sus transformaciones (offset* no las cuenta); el contenedor sí, por su translate.
    const rc = contenedor.getBoundingClientRect();
    obras.forEach((o) => {
      const t = o.tarjeta;
      const cx = rc.left + t.offsetLeft + t.offsetWidth / 2 - r.left;
      const cy = rc.top + t.offsetTop + t.offsetHeight / 2 - r.top;
      o.caja = { x: cx - ancho / 2, y: alto / 2 - cy, w: t.offsetWidth };
    });
    polvoBase.x = rc.left + rc.width / 2 - r.left - ancho / 2;
    polvoBase.y = alto / 2 - (rc.top + rc.height / 2 - r.top);
    polvoBase.w = rc.width; polvoBase.h = rc.height;
    return true;
  };

  // ---------- Animación ----------
  const puntero = { x: 0, y: 0, ax: 0, ay: 0 };
  let t0 = -1, ultimo = performance.now(), raf = 0, activo = true, scrollSuave = 0;
  let muestras = 0, acumulado = 0;
  const pose = (o, t, dt) => {
    const c = o.caja; if (!c) return;
    const parado = quieto();
    const e = parado ? 1 : suave((t - t0 - o.demora) / 1.9); // entrada: de plano a profundidad
    o.elevar = acercar(o.elevar, o.elevarObjetivo, 1 - Math.pow(0.0009, dt));
    const sc = parado ? 0 : scrollSuave;
    // profundidad en px de mundo; a Z = 0 la pieza coincide con su tarjeta del DOM
    const zBase = (o.z - 0.7) * 300 * e;
    const z = zBase + o.apertura * sc + o.elevar * 80;
    const k = (D - z) / D; // compensa la perspectiva para que la caja proyectada siga a la tarjeta
    const escala = (c.w / o.pieza.ancho) * k * (1 + o.elevar * 0.025);
    const flota = parado ? 0 : Math.sin(t * 0.55 + o.i * 1.7) * 5 * e;
    o.grupo.position.set(c.x * k, (c.y + flota + sc * 70 * o.z) * k, z);
    o.grupo.scale.setScalar(escala);
    o.grupo.rotation.set(0, o.ry * (1 - o.elevar * 0.7) + sc * o.ry * 1.3, o.rz * (1 - o.elevar * 0.8));
    const viva = parado ? 0 : 1;
    o.cuerpo.rotation.set(
      (-3.5 * e + Math.sin(t * 0.4 + o.i) * 0.6 * viva - sc * 6) * GRADO,
      Math.cos(t * 0.33 + o.i * 2.1) * 0.8 * viva * GRADO,
      0,
    );
    o.matSombra.opacity = (o.sombraMax ?? 0.9) * e * (1 - o.elevar * 0.25);
  };
  const cuadro = (ms) => {
    raf = 0;
    const ahora = ms ?? performance.now();
    const crudo = ahora - ultimo;
    const dt = Math.min(0.05, crudo / 1000); ultimo = ahora;
    // Si la placa no llega (más de 22 ms por cuadro en promedio), baja la resolución antes de que se note.
    if (crudo < 200) { acumulado += crudo; muestras++; }
    if (muestras === 90) {
      if (acumulado / muestras > 22 && ratio > 1) { ratio = Math.max(1, ratio - 0.25); ancho = 0; }
      muestras = 0; acumulado = 0;
    }
    const t = tFijo !== null ? tFijo : ahora / 1000;
    if (t0 < 0) t0 = t;
    if (!medir()) return;
    const parado = quieto();
    // scroll: 0 arriba, 1 cuando la cabecera salió de la vista; suavizado con inercia
    const rCab = cabecera.getBoundingClientRect();
    const sc = Math.min(Math.max(-rCab.top / Math.max(rCab.height, 1), 0), 1);
    scrollSuave = parado ? sc : acercar(scrollSuave, sc, 1 - Math.pow(0.002, dt));
    puntero.ax = parado ? 0 : acercar(puntero.ax, puntero.x, 1 - Math.pow(0.004, dt));
    puntero.ay = parado ? 0 : acercar(puntero.ay, puntero.y, 1 - Math.pow(0.004, dt));
    camara.position.set(puntero.ax * 60, puntero.ay * 40, D);
    camara.lookAt(0, 0, 0);
    barrido.position.set(Math.sin(t * 0.18) * 1.4, 0.6 + Math.cos(t * 0.13) * 0.4, 1);
    obras.forEach((o) => pose(o, t, dt));
    {
      const pol = geoPolvo.attributes.position; const viva = parado ? 0 : 1;
      for (let k = 0; k < N_POLVO; k++) {
        pol.array[k * 3] = polvoBase.x + posPolvo[k * 3] * polvoBase.w + Math.cos(t * 0.21 + semilla[k]) * 14 * viva;
        pol.array[k * 3 + 1] = polvoBase.y + posPolvo[k * 3 + 1] * polvoBase.h + Math.sin(t * 0.17 + semilla[k]) * 18 * viva;
      }
      pol.needsUpdate = true;
    }
    render.render(escena, camara);
    // Seguir animando mientras haya movimiento pendiente.
    const enMovimiento = !parado || obras.some((o) => Math.abs(o.elevar - o.elevarObjetivo) > 0.002);
    if (activo && enMovimiento) pedir();
  };
  function pedir() { if (!raf && activo) raf = requestAnimationFrame(cuadro); }

  if (matchMedia('(hover: hover)').matches) {
    addEventListener('pointermove', (e) => {
      puntero.x = e.clientX / innerWidth - 0.5;
      puntero.y = 0.5 - e.clientY / innerHeight;
      if (quieto()) return;
      pedir();
    }, { passive: true });
  }
  addEventListener('scroll', pedir, { passive: true });
  new ResizeObserver(() => { ancho = 0; pedir(); }).observe(cabecera);
  new IntersectionObserver(([e]) => { activo = e.isIntersecting && !document.hidden; if (activo) pedir(); }).observe(lienzo);
  document.addEventListener('visibilitychange', () => { activo = !document.hidden; if (activo) { ultimo = performance.now(); pedir(); } });
  new MutationObserver(aplicarTema).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', aplicarTema);
  reducido.addEventListener('change', pedir);
  lienzo.addEventListener('webglcontextlost', (e) => { e.preventDefault(); activo = false; document.documentElement.classList.remove('obras-3d'); fallar('contexto-perdido'); });
  lienzo.addEventListener('webglcontextrestored', () => { activo = true; document.documentElement.classList.add('obras-3d'); lienzo.dataset.estado = 'listo'; pedir(); });

  aplicarTema();
  // Compilar antes de mostrar evita el tirón del primer cuadro.
  render.compile(escena, camara);
  cuadro(performance.now());
  document.documentElement.classList.add('obras-3d');
  lienzo.dataset.estado = 'listo';
  return true;
}
