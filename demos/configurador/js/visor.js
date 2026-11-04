// Visor 3D del configurador: carga GLB con KHR_materials_variants, entorno HDR prefiltrado (PMREM),
// ACES, sombra suave sobre plano transparente, órbita propia con inercia, transición de materiales
// de 300 ms y render bajo demanda (sólo se dibuja si algo cambió).
import * as THREE from 'three';
import { GLTFLoader } from '../../../lib/GLTFLoader.js';
import { RGBELoader } from '../../../lib/RGBELoader.js';

const RAIZ = new URL('../../../', import.meta.url);
const DUR_MATERIAL = 300;
const TAU_CAMARA = 0.14;
const VEL_AUTO = THREE.MathUtils.degToRad(7);
const suave = (t) => 1 - Math.pow(1 - t, 3);
const amortiguar = (a, b, dt, tau) => b + (a - b) * Math.exp(-dt / tau);

function texturaContacto() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, 'rgba(0,0,0,0.62)');
  r.addColorStop(0.35, 'rgba(0,0,0,0.38)');
  r.addColorStop(0.7, 'rgba(0,0,0,0.1)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function crearVisor({ lienzo, pixelRatioMax = 2, alProgreso = () => {}, alCambio = () => {} }) {
  const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(26, 1, 0.05, 40);

  // Entorno: HDRI de estudio reducido a 512 px y prefiltrado en la GPU.
  // Se pide en paralelo con el GLB; mostrar() espera a los dos.
  const entornoListo = new RGBELoader().loadAsync(new URL('assets/3d/env/studio_small_09_512.hdr', RAIZ).href).then((hdr) => {
    const pmrem = new THREE.PMREMGenerator(renderer);
    escena.environment = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose();
    pmrem.dispose();
  });

  // Luz principal cálida: sólo para la sombra proyectada (el modelado lo da el entorno).
  const clave = new THREE.DirectionalLight(0xfff1dc, 1.1);
  clave.castShadow = true;
  clave.shadow.mapSize.set(1024, 1024);
  clave.shadow.radius = 9;
  clave.shadow.blurSamples = 16;
  clave.shadow.bias = -0.0004;
  escena.add(clave, clave.target);

  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ color: 0x3a2a18, opacity: 0.2 }));
  suelo.rotation.x = -Math.PI / 2;
  suelo.receiveShadow = true;
  escena.add(suelo);

  const contacto = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: texturaContacto(), color: 0x2a1e12, transparent: true, depthWrite: false, toneMapped: false })
  );
  contacto.rotation.x = -Math.PI / 2;
  contacto.position.y = 0.001;
  contacto.renderOrder = 1;
  escena.add(contacto);

  const raizProducto = new THREE.Group();
  escena.add(raizProducto);

  const loader = new GLTFLoader();
  const cache = new Map();
  let producto = null;

  // ---------- Cámara orbital con inercia ----------
  const orb = {
    theta: 0.6, phi: 1.2, dist: 3, objetivo: new THREE.Vector3(),
    t: { theta: 0.6, phi: 1.2, dist: 3, objetivo: new THREE.Vector3() },
    lim: { distMin: 1, distMax: 5, phiMin: 0.75, phiMax: 1.47 },
    auto: false, girado: 0, arrastre: false,
  };
  const vista = { completa: null, macro: null, enMacro: false };
  const transiciones = new Set();
  let necesita = true;
  let bucle = 0;
  let previo = 0;
  let pausado = false;

  function encuadre(datos) {
    const caja = new THREE.Box3().setFromObject(raizProducto);
    const tam = caja.getSize(new THREE.Vector3());
    const centro = caja.getCenter(new THREE.Vector3());
    const radio = tam.length() / 2;
    const ajuste = camara.aspect < 1 ? 1.25 / Math.max(0.62, camara.aspect) : 1;
    const dist = (radio / Math.sin(THREE.MathUtils.degToRad(camara.fov / 2))) * 1.04 * ajuste;
    vista.completa = { theta: datos.vista.theta, phi: datos.vista.phi, dist, objetivo: new THREE.Vector3(centro.x, centro.y * 0.92, centro.z) };
    vista.macro = { theta: datos.macro.theta, phi: datos.macro.phi, dist: datos.macro.dist, objetivo: new THREE.Vector3(...datos.macro.objetivo) };
    orb.lim.distMin = dist * 0.55;
    orb.lim.distMax = dist * 1.5;
    // Sombra: luz por encima y delante a la izquierda, cámara de sombra ajustada a la huella.
    const huella = Math.max(tam.x, tam.z);
    clave.position.set(centro.x - huella * 0.9, tam.y * 4.2, centro.z + huella * 1.1);
    clave.target.position.set(centro.x, 0, centro.z);
    const s = huella * 1.6;
    Object.assign(clave.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.1, far: tam.y * 10 });
    clave.shadow.camera.updateProjectionMatrix();
    contacto.scale.set(tam.x * 1.18, tam.z * 1.3, 1);
    contacto.position.x = centro.x;
    contacto.position.z = centro.z;
  }

  function irA(v, inmediato = false) {
    orb.t.theta = v.theta; orb.t.phi = v.phi; orb.t.dist = v.dist; orb.t.objetivo.copy(v.objetivo);
    if (inmediato) { orb.theta = v.theta; orb.phi = v.phi; orb.dist = v.dist; orb.objetivo.copy(v.objetivo); }
    despertar();
  }

  function colocarCamara() {
    const sp = Math.sin(orb.phi);
    camara.position.set(
      orb.objetivo.x + orb.dist * sp * Math.sin(orb.theta),
      orb.objetivo.y + orb.dist * Math.cos(orb.phi),
      orb.objetivo.z + orb.dist * sp * Math.cos(orb.theta)
    );
    camara.lookAt(orb.objetivo);
  }

  // ---------- Materiales ----------
  function propsDe(m) {
    return {
      color: m.color.clone(),
      roughness: m.roughness, metalness: m.metalness,
      sheenColor: m.sheenColor ? m.sheenColor.clone() : null,
      sheenRoughness: m.sheenRoughness ?? 0,
      specularColor: m.specularColor ? m.specularColor.clone() : null,
      specularIntensity: m.specularIntensity ?? 1,
      normalScale: m.normalScale ? m.normalScale.clone() : null,
      envMapIntensity: m.envMapIntensity ?? 1,
      mapas: { map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, metalnessMap: m.metalnessMap, aoMap: m.aoMap },
    };
  }

  async function objetivoDe(parte, op) {
    let fuente = parte.base;
    if (op.variante != null) {
      const idx = parte.mapeo.get(op.variante);
      if (idx != null) fuente = await producto.parser.getDependency('material', idx);
    }
    const p = propsDe(fuente);
    if (op.color) p.color = new THREE.Color(op.color);
    if (op.brillo && p.sheenColor) p.sheenColor = new THREE.Color(op.brillo);
    if (op.rugosidad != null) p.roughness = op.rugosidad;
    if (op.metal != null) p.metalness = op.metal;
    if (op.especular && p.specularColor) p.specularColor = new THREE.Color(op.especular);
    if (op.sinMapaRugosidad) p.mapas.roughnessMap = null;
    if (parte.sinUv1 && p.mapas.aoMap && p.mapas.aoMap.channel === 1) p.mapas.aoMap = null;
    return p;
  }

  async function aplicar(parteId, op, inmediato = false) {
    if (!producto) return;
    const parte = producto.partes[parteId];
    if (!parte) return;
    const fin = await objetivoDe(parte, op);
    const m = parte.trabajo;
    let recompilar = false;
    for (const [k, v] of Object.entries(fin.mapas)) {
      if (!(k in m)) continue;
      if (!!m[k] !== !!v) recompilar = true;
      m[k] = v;
    }
    if (recompilar) m.needsUpdate = true;
    const ini = propsDe(m);
    for (const tr of transiciones) if (tr.m === m) transiciones.delete(tr);
    const tr = { m, ini, fin, t0: performance.now(), dur: inmediato ? 0 : DUR_MATERIAL };
    transiciones.add(tr);
    paso(tr, inmediato ? 1 : 0);
    despertar();
  }

  function paso(tr, k) {
    const { m, ini, fin } = tr;
    const e = suave(k);
    m.color.copy(ini.color).lerp(fin.color, e);
    m.roughness = THREE.MathUtils.lerp(ini.roughness, fin.roughness, e);
    m.metalness = THREE.MathUtils.lerp(ini.metalness, fin.metalness, e);
    if (m.sheenColor && fin.sheenColor) m.sheenColor.copy(ini.sheenColor).lerp(fin.sheenColor, e);
    if ('sheenRoughness' in m) m.sheenRoughness = THREE.MathUtils.lerp(ini.sheenRoughness, fin.sheenRoughness, e);
    if (m.specularColor && fin.specularColor) m.specularColor.copy(ini.specularColor).lerp(fin.specularColor, e);
    if ('specularIntensity' in m) m.specularIntensity = THREE.MathUtils.lerp(ini.specularIntensity, fin.specularIntensity, e);
    if (m.normalScale && fin.normalScale) m.normalScale.copy(ini.normalScale).lerp(fin.normalScale, e);
    if (k >= 1) transiciones.delete(tr);
  }

  // ---------- Carga de productos ----------
  async function cargarGLB(datos) {
    if (cache.has(datos.id)) return cache.get(datos.id);
    const gltf = await loader.loadAsync(new URL(datos.glb, RAIZ).href, (ev) => {
      // Con el archivo comprimido en el servidor, `total` es el tamaño comprimido y `loaded` el real: se acota a 1.
      if (ev.lengthComputable && ev.total > 0) alProgreso(datos.id, Math.min(1, ev.loaded / ev.total));
    });
    alProgreso(datos.id, 1);
    const raiz = gltf.scene;
    const quitar = [];
    raiz.traverse((o) => { if (o.isLight) quitar.push(o); });
    quitar.forEach((o) => o.parent.remove(o));
    const partes = {};
    raiz.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = false;
      const id = Object.entries(datos.mallas).find(([, sufijo]) => o.name.endsWith(sufijo))?.[0];
      if (!id) return;
      const mapeo = new Map();
      const ext = o.userData.gltfExtensions?.KHR_materials_variants;
      if (ext) ext.mappings.forEach((mp) => mp.variants.forEach((v) => mapeo.set(v, mp.material)));
      const base = o.material;
      const trabajo = base.clone();
      o.material = trabajo;
      const sinUv1 = !o.geometry.attributes.uv1;
      if (sinUv1 && trabajo.aoMap && trabajo.aoMap.channel === 1) trabajo.aoMap = null;
      if (!partes[id]) partes[id] = { mallas: [], base, trabajo, mapeo, sinUv1 };
      else o.material = partes[id].trabajo;
      partes[id].mallas.push(o);
    });
    const variantes = (gltf.userData.gltfExtensions?.KHR_materials_variants?.variants || []).map((v) => v.name);
    const p = { id: datos.id, raiz, partes, parser: gltf.parser, variantes, datos };
    // Pre-compila los materiales de variante para que el primer cambio no tartamudee.
    await Promise.all(Object.values(partes).flatMap((pt) => [...pt.mapeo.values()].map((i) => gltf.parser.getDependency('material', i))));
    cache.set(datos.id, p);
    return p;
  }

  async function mostrar(datos, selecciones) {
    const [p] = await Promise.all([cargarGLB(datos), entornoListo]);
    raizProducto.clear();
    raizProducto.add(p.raiz);
    producto = p;
    for (const [parte, op] of Object.entries(selecciones)) await aplicar(parte, op, true);
    encuadre(datos);
    vista.enMacro = false;
    irA(vista.completa, true);
    renderer.compile(escena, camara);
    necesita = true;
    despertar();
    return p;
  }

  // ---------- Bucle bajo demanda ----------
  function cuadro(ahora) {
    bucle = 0;
    const dt = Math.min(0.05, (ahora - (previo || ahora)) / 1000) || 0.016;
    previo = ahora;
    let activo = false;
    for (const tr of [...transiciones]) {
      const k = tr.dur ? Math.min(1, (ahora - tr.t0) / tr.dur) : 1;
      paso(tr, k);
      activo = true;
    }
    if (orb.auto && !orb.arrastre && !vista.enMacro) {
      const d = VEL_AUTO * dt;
      orb.t.theta += d;
      orb.girado += d;
      if (orb.girado >= Math.PI * 2) { orb.auto = false; orb.girado = 0; alCambio({ auto: false }); }
      activo = true;
    }
    const tau = vista.transicion ? 0.32 : TAU_CAMARA;
    orb.theta = amortiguar(orb.theta, orb.t.theta, dt, tau);
    orb.phi = amortiguar(orb.phi, orb.t.phi, dt, tau);
    orb.dist = amortiguar(orb.dist, orb.t.dist, dt, tau);
    orb.objetivo.x = amortiguar(orb.objetivo.x, orb.t.objetivo.x, dt, tau);
    orb.objetivo.y = amortiguar(orb.objetivo.y, orb.t.objetivo.y, dt, tau);
    orb.objetivo.z = amortiguar(orb.objetivo.z, orb.t.objetivo.z, dt, tau);
    const resto = Math.abs(orb.theta - orb.t.theta) + Math.abs(orb.phi - orb.t.phi) + Math.abs(orb.dist - orb.t.dist) * 0.5 + orb.objetivo.distanceTo(orb.t.objetivo);
    if (resto > 1e-4) activo = true;
    else { vista.transicion = false; orb.theta = orb.t.theta; orb.phi = orb.t.phi; orb.dist = orb.t.dist; orb.objetivo.copy(orb.t.objetivo); }
    if (activo || necesita) {
      colocarCamara();
      renderer.render(escena, camara);
      necesita = false;
      cuadros++;
    }
    if (activo && !pausado) despertar();
  }
  let cuadros = 0;
  function despertar() { necesita = true; if (!bucle && !pausado) bucle = requestAnimationFrame(cuadro); }

  function redimensionar(ancho, alto) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioMax));
    renderer.setSize(ancho, alto, false);
    camara.aspect = ancho / Math.max(1, alto);
    camara.updateProjectionMatrix();
    if (producto) {
      const enMacro = vista.enMacro;
      encuadre(producto.datos);
      if (!enMacro) { orb.t.dist = vista.completa.dist; orb.dist = orb.t.dist; }
    }
    despertar();
  }

  // ---------- Entrada: arrastrar, pellizcar, teclado ----------
  const punteros = new Map();
  let pellizco = 0;
  lienzo.addEventListener('pointerdown', (e) => {
    lienzo.setPointerCapture(e.pointerId);
    punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    orb.arrastre = true;
    if (orb.auto) { orb.auto = false; alCambio({ auto: false, porUsuario: true }); }
    if (punteros.size === 2) { const [a, b] = [...punteros.values()]; pellizco = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  lienzo.addEventListener('pointermove', (e) => {
    const p = punteros.get(e.pointerId);
    if (!p) return;
    if (punteros.size === 1) {
      orb.t.theta -= (e.clientX - p.x) * 0.0085;
      orb.t.phi = THREE.MathUtils.clamp(orb.t.phi - (e.clientY - p.y) * 0.006, orb.lim.phiMin, orb.lim.phiMax);
    }
    p.x = e.clientX; p.y = e.clientY;
    if (punteros.size === 2) {
      const [a, b] = [...punteros.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pellizco) zoom(pellizco / d);
      pellizco = d;
    }
    despertar();
  });
  const soltar = (e) => { punteros.delete(e.pointerId); pellizco = 0; if (!punteros.size) orb.arrastre = false; };
  lienzo.addEventListener('pointerup', soltar);
  lienzo.addEventListener('pointercancel', soltar);

  function zoom(f) {
    orb.t.dist = THREE.MathUtils.clamp(orb.t.dist * f, vista.enMacro ? vista.macro.dist * 0.7 : orb.lim.distMin, vista.enMacro ? vista.macro.dist * 2 : orb.lim.distMax);
    despertar();
  }
  function girar(rad) {
    if (orb.auto) { orb.auto = false; alCambio({ auto: false, porUsuario: true }); }
    orb.t.theta += rad;
    despertar();
  }
  function inclinar(rad) { orb.t.phi = THREE.MathUtils.clamp(orb.t.phi + rad, orb.lim.phiMin, orb.lim.phiMax); despertar(); }
  function autoRotar(si) { orb.auto = si; orb.girado = 0; despertar(); }
  function macro(si) {
    if (!producto) return;
    vista.enMacro = si;
    vista.transicion = true;
    if (si && orb.auto) { orb.auto = false; alCambio({ auto: false }); }
    const v = si ? vista.macro : vista.completa;
    // Llegar por el camino corto: el ángulo objetivo se acerca al actual.
    const vuelta = Math.round((orb.t.theta - v.theta) / (Math.PI * 2)) * Math.PI * 2;
    irA({ ...v, theta: v.theta + vuelta });
  }
  function pausar(si) {
    pausado = si;
    if (si && bucle) { cancelAnimationFrame(bucle); bucle = 0; }
    if (!si) { previo = 0; despertar(); }
  }

  function setTema(oscuro) {
    suelo.material.opacity = oscuro ? 0.55 : 0.2;
    contacto.material.opacity = oscuro ? 1 : 0.9;
    contacto.material.color.set(oscuro ? 0x000000 : 0x2a1e12);
    despertar();
  }

  return {
    renderer, mostrar, setTema, aplicar, redimensionar, girar, inclinar, zoom, autoRotar, macro, pausar,
    despertar,
    estado: () => ({ auto: orb.auto, macro: vista.enMacro, cuadros, theta: orb.theta, dist: orb.dist, pr: renderer.getPixelRatio() }),
    renderFijo: () => { colocarCamara(); renderer.render(escena, camara); },
    saltar: () => { orb.theta = orb.t.theta; orb.phi = orb.t.phi; orb.dist = orb.t.dist; orb.objetivo.copy(orb.t.objetivo); for (const tr of [...transiciones]) paso(tr, 1); },
  };
}
