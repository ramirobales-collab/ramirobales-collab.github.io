import * as THREE from '../lib/three.module.min.js';

const RUTA = new URL('../assets/3d/', import.meta.url);
const G = (d) => (d * Math.PI) / 180;

/* ---------- Ruido simplex 2D (Gustavson), semilla por sesión ---------- */
function simplex2D(semilla) {
  const grad = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const p = new Uint8Array(256);
  let s = semilla >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  const perm = new Uint8Array(512); for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  return (x, y) => {
    const sF = (x + y) * F2; const i = Math.floor(x + sF), j = Math.floor(y + sF);
    const t = (i + j) * G2; const x0 = x - (i - t), y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0;
    const c = (tx, ty, g) => { let tt = 0.5 - tx * tx - ty * ty; if (tt < 0) return 0; tt *= tt; return tt * tt * (g[0] * tx + g[1] * ty); };
    n += c(x0, y0, grad[perm[ii + perm[jj]] % 8]);
    n += c(x1, y1, grad[perm[ii + i1 + perm[jj + j1]] % 8]);
    n += c(x2, y2, grad[perm[ii + 1 + perm[jj + 1]] % 8]);
    return 70 * n;
  };
}

/* ---------- Geometría ---------- */
function rectRedondeado(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function placa(w, h, espesor, radio, bisel, hueco) {
  const forma = rectRedondeado(w, h, radio);
  if (hueco) {
    const hu = rectRedondeado(hueco[0], hueco[1], radio * 0.6);
    const pts = hu.getPoints(16).reverse();
    const path = new THREE.Path(pts);
    forma.holes.push(path);
  }
  const g = new THREE.ExtrudeGeometry(forma, { depth: espesor - 2 * bisel, bevelEnabled: true, bevelThickness: bisel, bevelSize: bisel, bevelSegments: 3, curveSegments: 12 });
  g.translate(0, 0, bisel);
  g.setAttribute('uv1', g.attributes.uv);
  return g;
}

/* ---------- Carga de texturas ---------- */
function cargador() {
  const tl = new THREE.TextureLoader();
  const cache = new Map();
  let pendientes = 0;
  const esperando = [];
  const fin = () => { pendientes--; if (pendientes === 0) esperando.splice(0).forEach((r) => r()); };
  const tex = (nombre, { srgb = false, repetir = 1 } = {}) => {
    const clave = nombre + repetir;
    if (cache.has(clave)) return cache.get(clave);
    pendientes++;
    const t = tl.load(new URL('tex/' + nombre, RUTA).href, fin, undefined, fin);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repetir, repetir);
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    cache.set(clave, t);
    return t;
  };
  tex.listo = () => (pendientes === 0 ? Promise.resolve() : new Promise((r) => esperando.push(r)));
  return tex;
}

/* ---------- Escena ---------- */
function texturaRadial(interior, exterior) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, '#fff'); g.addColorStop(interior, '#fff'); g.addColorStop(exterior, '#000');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}
function contacto(w, h, opacidad) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0x2a2015, transparent: true, opacity: opacidad, alphaMap: texturaRadial(0.12, 1), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

function construir(opciones) {
  const tex = cargador();
  const escena = new THREE.Scene();
  const grupo = new THREE.Group();
  escena.add(grupo);

  const travertino = new THREE.MeshStandardMaterial({
    map: tex('travertine009-color.webp', { srgb: true, repetir: 1.4 }),
    normalMap: tex('travertine009-normal.webp', { repetir: 1.4 }),
    roughnessMap: tex('travertine009-rough.webp', { repetir: 1.4 }),
    aoMap: tex('travertine009-ao.webp', { repetir: 1.4 }),
    roughness: 1, metalness: 0, envMapIntensity: 0.8, normalScale: new THREE.Vector2(1.8, 1.8), aoMapIntensity: 1,
  });
  const porcelana = new THREE.MeshPhysicalMaterial({
    map: tex('porcelain001-color.webp', { srgb: true, repetir: 3 }),
    normalMap: tex('porcelain001-normal.webp', { repetir: 3 }),
    roughnessMap: tex('porcelain001-rough.webp', { repetir: 3 }),
    roughness: 1.0, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.0,
    color: new THREE.Color(0xf4efe6), normalScale: new THREE.Vector2(0.7, 0.7),
  });
  const arcilla = new THREE.MeshStandardMaterial({
    map: tex('clay003-color.webp', { srgb: true, repetir: 2.5 }),
    normalMap: tex('clay003-normal.webp', { repetir: 2.5 }),
    roughnessMap: tex('clay003-rough.webp', { repetir: 2.5 }),
    aoMap: tex('clay003-ao.webp', { repetir: 2.5 }),
    color: new THREE.Color(0xd9cdbf), roughness: 1, metalness: 0, envMapIntensity: 0.5, normalScale: new THREE.Vector2(2, 2), aoMapIntensity: 1,
  });
  const arcillaSello = (idioma) => new THREE.MeshStandardMaterial({
    map: tex('clay003-color.webp', { srgb: true, repetir: 1 }),
    normalMap: tex(`sello-${idioma}-normal.webp`),
    roughnessMap: tex('clay003-rough.webp'),
    aoMap: tex(`sello-${idioma}-ao.webp`),
    color: new THREE.Color(0xd9cdbf), roughness: 1, metalness: 0, envMapIntensity: 0.5, normalScale: new THREE.Vector2(2.4, 2.4), aoMapIntensity: 1,
  });

  // Losa de travertino 1,40 × 0,90 × 0,06 m, apoyada en diagonal
  const losa = new THREE.Mesh(placa(1.4, 0.9, 0.06, 0.012, 0.006), travertino);
  losa.rotation.x = -Math.PI / 2;
  const losaG = new THREE.Group();
  losaG.add(losa);
  losaG.rotation.y = G(-14);
  losaG.rotation.z = G(2);
  losaG.position.set(0.12, 0.016, 0);
  losa.castShadow = losa.receiveShadow = true;
  grupo.add(losaG);

  // Marco de porcelana 0,64 × 0,40 × 0,03 con pantalla 16:9 (0,576 × 0,324), bisel 7 mm
  const marcoG = new THREE.Group();
  const marco = new THREE.Mesh(placa(0.64, 0.40, 0.03, 0.008, 0.007, [0.576, 0.324]), porcelana);
  marco.castShadow = marco.receiveShadow = true;
  marcoG.add(marco);
  const fondoMarco = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.35), porcelana);
  fondoMarco.position.z = 0.0005; fondoMarco.castShadow = true;
  marcoG.add(fondoMarco);
  const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(0.576, 0.324), new THREE.MeshBasicMaterial({ colorWrite: false }));
  pantalla.position.z = 0.021;
  pantalla.renderOrder = -10;
  marcoG.add(pantalla);
  marcoG.rotation.set(G(-12), G(6 - 14), 0, 'YXZ');
  marcoG.position.set(-0.10, 0.3, -0.02);
  grupo.add(marcoG);

  // Cilindro-sello de arcilla Ø 0,20 × 0,035 m
  const cilG = new THREE.CylinderGeometry(0.10, 0.10, 0.035, 128, 1);
  cilG.setAttribute('uv1', cilG.attributes.uv);
  const selloMat = {};
  const sello = (l) => selloMat[l] || (selloMat[l] = arcillaSello(l === 'en' ? 'en' : 'es'));
  const cilindro = new THREE.Mesh(cilG, [arcilla, sello(document.documentElement.lang), arcilla]);
  cilindro.castShadow = cilindro.receiveShadow = true;
  cilindro.position.set(0.37, 0.2, 0.25);
  cilindro.rotation.y = G(-26);
  grupo.add(cilindro);

  // apoyar marco y cilindro sobre la losa inclinada: rayo desde arriba
  const apoyar = (obj, altura) => {
    losaG.updateWorldMatrix(true, true);
    const r = new THREE.Raycaster(new THREE.Vector3(obj.position.x, 2, obj.position.z), new THREE.Vector3(0, -1, 0));
    const h = r.intersectObject(losa, false)[0];
    if (h) obj.position.y = h.point.y + altura;
  };
  apoyar(cilindro, 0.0175);
  apoyar(marcoG, 0.40 / 2 * Math.cos(G(12)) + 0.014);

  // Sombras de contacto sobre la losa (en coordenadas de la losa) y bajo la losa
  const enLosa = (obj) => { const p = losaG.worldToLocal(obj.position.clone()); return [p.x, p.z]; };
  const cMarco = contacto(0.74, 0.2, 0.6);
  const cCil = contacto(0.3, 0.3, 0.55);
  [[cMarco, marcoG], [cCil, cilindro]].forEach(([c, o]) => { const [x, z] = enLosa(o); c.position.set(x, 0.0605, z); losaG.add(c); });
  cMarco.position.z += 0.03;
  const cLosa = contacto(1.8, 1.3, 0.5);
  cLosa.position.set(0.12, 0.0008, 0); cLosa.rotation.z = G(-14);
  escena.add(cLosa);

  // Suelo que sólo recibe sombra
  const suelo = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ color: new THREE.Color(0x3a2e1c), opacity: 0.5, transparent: true }));
  suelo.rotation.x = -Math.PI / 2;
  suelo.receiveShadow = true;
  escena.add(suelo);

  // Luz direccional cálida con sombra única
  const luz = new THREE.DirectionalLight(0xf6ebd8, 2.6);
  luz.castShadow = true;
  luz.shadow.mapSize.set(opciones.sombra || 1024, opciones.sombra || 1024);
  luz.shadow.camera.left = -1.1; luz.shadow.camera.right = 1.1;
  luz.shadow.camera.top = 1.1; luz.shadow.camera.bottom = -1.1;
  luz.shadow.camera.near = 0.2; luz.shadow.camera.far = 8;
  luz.shadow.bias = -0.0002; luz.shadow.normalBias = 0.012; luz.shadow.radius = 3;
  escena.add(luz, luz.target);
  const barrido = new THREE.DirectionalLight(0xffffff, 0);
  escena.add(barrido, barrido.target);
  const relleno = new THREE.HemisphereLight(0xf3eee4, 0x8a7a60, 0.35);
  escena.add(relleno);
  // Luz de borde fría (sólo en tema oscuro): separa la losa y el marco del fondo
  const borde = new THREE.DirectionalLight(0xb9ccff, 0);
  borde.position.set(Math.sin(G(150)) * Math.cos(G(22)) * 4, Math.sin(G(22)) * 4, Math.cos(G(150)) * Math.cos(G(22)) * 4);
  escena.add(borde, borde.target);
  const setTema = (oscuro) => {
    borde.intensity = oscuro ? 3.2 : 0;
    relleno.intensity = oscuro ? 0.18 : 0.35;
    relleno.color.set(oscuro ? 0x2a251e : 0xf3eee4); relleno.groundColor.set(oscuro ? 0x14110d : 0x8a7a60);
    suelo.material.opacity = oscuro ? 0.7 : 0.5;
  };

  // Cámara 38 mm a 1,25 m con 22° de picado
  const camara = new THREE.PerspectiveCamera(40, 1.6, 0.05, 20);
  camara.setFocalLength(38);
  const objetivo = new THREE.Vector3(-0.05, 0.15, 0.04);
  const dist = 1.62, picado = G(24);
  camara.position.set(objetivo.x + 0.02, objetivo.y + dist * Math.sin(picado), objetivo.z + dist * Math.cos(picado));
  camara.lookAt(objetivo);

  const ponerLuz = (az, el) => {
    const a = G(az), e = G(el);
    luz.position.set(Math.sin(a) * Math.cos(e) * 4, Math.sin(e) * 4, Math.cos(a) * Math.cos(e) * 4);
    luz.target.position.set(0, 0, 0);
  };

  return { escena, grupo, camara, luz, barrido, ponerLuz, setTema, losaG, marcoG, marco, pantalla, cilindro, sello, suelo, cLosa, travertino, porcelana, arcilla, tex };
}

function cargarEntorno(renderer, escena, materiales) {
  return new Promise((res) => {
    new THREE.TextureLoader().load(new URL('env/photo_studio_01.webp', RUTA).href, (t) => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      t.colorSpace = THREE.SRGBColorSpace;
      const pm = new THREE.PMREMGenerator(renderer);
      const env = pm.fromEquirectangular(t).texture;
      escena.environment = env;
      t.dispose(); pm.dispose();
      res();
    }, undefined, () => res());
  });
}

function esquinasPantalla(pantalla, camara, W, H) {
  const g = pantalla.geometry.parameters;
  const pts = [[-g.width / 2, g.height / 2], [g.width / 2, g.height / 2], [g.width / 2, -g.height / 2], [-g.width / 2, -g.height / 2]];
  pantalla.updateWorldMatrix(true, false);
  return pts.map(([x, y]) => {
    const v = new THREE.Vector3(x, y, 0).applyMatrix4(pantalla.matrixWorld).project(camara);
    return [(v.x + 1) / 2, (1 - v.y) / 2];
  });
}

function crearRenderer(canvas, opciones) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!opciones.poster });
  r.setClearColor(0x000000, 0);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.0;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  return r;
}

/* ---------- Modo página ---------- */
export async function iniciar(contenedor, { ubicarLcp } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'heroe__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  contenedor.appendChild(canvas);
  const renderer = crearRenderer(canvas, {});
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  const e = construir({ sombra: 1024 });
  await cargarEntorno(renderer, e.escena);

  const W = () => contenedor.clientWidth, H = () => contenedor.clientHeight;
  const redimensionar = () => { renderer.setSize(W(), H(), false); e.camara.aspect = W() / H(); e.camara.updateProjectionMatrix(); };
  redimensionar();
  addEventListener('resize', redimensionar);

  const ruido = simplex2D((Math.random() * 1e9) | 0);
  const estado = { azScroll: -35, az: -35, azMeta: -35, derivaAz: 0, derivaTilt: 0, actividad: 1, ultimoEvento: performance.now(), punteroX: 0, punteroY: 0, intensidad: 0.6, t0: performance.now(), asentado: false };
  let activo = true, rafId = 0, cuadros = 0, acumulado = 0, ultimo = performance.now();

  const despertar = () => { estado.actividad = 1; estado.ultimoEvento = performance.now(); if (!activo) { activo = true; ultimo = performance.now(); rafId = requestAnimationFrame(cuadro); } };
  addEventListener('scroll', despertar, { passive: true });
  addEventListener('focus', despertar);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) despertar(); });
  canvas.style.pointerEvents = 'auto';
  const ray = new THREE.Raycaster(); const nd = new THREE.Vector2(); let sobreMarco = false, barridoT = -1;
  addEventListener('pointermove', (ev) => {
    estado.punteroX = ev.clientX / innerWidth; estado.punteroY = ev.clientY / innerHeight; despertar();
  }, { passive: true });
  canvas.addEventListener('pointermove', (ev) => {
    if (!matchMedia('(pointer: fine)').matches) return;
    const r = canvas.getBoundingClientRect();
    nd.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(nd, e.camara);
    const hit = ray.intersectObject(e.marco, false).length > 0;
    if (hit && !sobreMarco) { barridoT = performance.now(); }
    sobreMarco = hit;
  });
  canvas.addEventListener('pointerleave', () => { sobreMarco = false; });

  document.addEventListener('idioma', (ev) => { e.cilindro.material[1] = e.sello(ev.detail); despertar(); });
  const oscuro = () => (document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
  e.setTema(oscuro());
  document.addEventListener('tema', () => { e.setTema(oscuro()); despertar(); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { e.setTema(oscuro()); despertar(); });

  const expoOut = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));

  function cuadro(ahora) {
    const dt = Math.min(0.05, (ahora - ultimo) / 1000); ultimo = ahora;
    // scroll de la primera pantalla: −35° → +5°
    const p = Math.min(1, Math.max(0, scrollY / Math.max(1, innerHeight)));
    estado.azScroll = -35 + 40 * p;
    // deriva por ruido, decae a cero en 12 s sin eventos
    const desde = (ahora - estado.ultimoEvento) / 1000;
    estado.actividad = Math.max(0, 1 - desde / 12);
    const tiempo = ahora / 1000 * 0.08;
    const nAz = ruido(tiempo + estado.punteroX * 2, 3.1 + estado.punteroY * 2) * 6 * estado.actividad;
    const nTilt = ruido(7.7 + tiempo * 0.9, estado.punteroX * 1.5) * 1.5 * estado.actividad;
    estado.azMeta = estado.azScroll + nAz;
    // inercia 0,6 s (scroll) / 0,8 s (deriva)
    const k1 = 1 - Math.exp(-dt / 0.6), k2 = 1 - Math.exp(-dt / 0.8);
    estado.az += (estado.azMeta - estado.az) * k1;
    estado.derivaTilt += (nTilt - estado.derivaTilt) * k2;
    e.losaG.rotation.z = G(2 + estado.derivaTilt);
    e.losaG.rotation.x = G(estado.derivaTilt * 0.5);
    e.ponerLuz(estado.az, 30);
    // asentamiento de carga: 700 ms expo.out
    const a = Math.min(1, (ahora - estado.t0) / 700);
    const ea = expoOut(a);
    e.marcoG.position.y = e.marcoG.userData.y0 + 0.004 * (1 - ea);
    e.losaG.position.y = 0.016 + 0.002 * (1 - ea);
    e.luz.intensity = 2.6 * (0.6 + 0.4 * ea);
    // barrido del reflejo: una vez por entrada del puntero, 900 ms lineal
    if (barridoT > 0) {
      const b = (ahora - barridoT) / 900;
      if (b >= 1) { barridoT = -1; e.barrido.intensity = 0; }
      else { e.barrido.intensity = 1.6 * Math.sin(b * Math.PI); const az = -30 + 60 * b; e.barrido.position.set(Math.sin(G(az)) * 3, 2.2, Math.cos(G(az)) * 3); }
    }
    renderer.render(e.escena, e.camara);
    if (ubicarLcp) ubicarLcp(esquinasPantalla(e.pantalla, e.camara));
    // guardia de rendimiento: si los primeros 60 cuadros promedian > 200 ms, se apaga
    cuadros++; acumulado += dt;
    if (cuadros === 60 && acumulado / 60 > 0.2) { apagar(); return; }
    const quieto = estado.actividad === 0 && Math.abs(estado.azMeta - estado.az) < 0.01 && a >= 1 && barridoT < 0 && !document.hidden;
    if (document.hidden || quieto) { activo = false; return; }
    rafId = requestAnimationFrame(cuadro);
  }
  function apagar() {
    cancelAnimationFrame(rafId);
    contenedor.classList.remove('webgl');
    canvas.remove();
    renderer.dispose();
    document.dispatchEvent(new CustomEvent('lcp-reubicar'));
  }

  e.marcoG.userData.y0 = e.marcoG.position.y;
  e.ponerLuz(-35, 30);
  await new Promise((r) => setTimeout(r, 60));
  renderer.render(e.escena, e.camara);
  estado.t0 = performance.now();
  contenedor.classList.add('webgl');
  requestAnimationFrame(() => canvas.classList.add('listo'));
  rafId = requestAnimationFrame(cuadro);
  return { apagar };
}

/* ---------- Modo póster (captura con Edge sin ventana) ---------- */
export async function poster(contenedor, { capa = 'compuesto', ancho = 1600, idioma = 'es' } = {}) {
  const alto = capa === 'anfora' ? Math.round(ancho * 0.75) : capa === 'cilindro' ? ancho : Math.round(ancho * 10 / 16);
  const canvas = document.createElement('canvas');
  contenedor.appendChild(canvas);
  const renderer = crearRenderer(canvas, { poster: true });
  renderer.setPixelRatio(1);
  renderer.setSize(ancho, alto, true);
  const e = construir({ sombra: 2048 });
  e.cilindro.material[1] = e.sello(idioma);
  await cargarEntorno(renderer, e.escena);
  e.camara.aspect = ancho / alto; e.camara.updateProjectionMatrix();
  e.ponerLuz(-25, 30);

  const invisibleConSombra = (m) => { m.traverse((o) => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map(() => new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })) : new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }); } }); };
  const soloVisible = (lista) => { [e.losaG, e.marcoG, e.cilindro].forEach((o) => { o.visible = lista.includes(o); }); };

  e.cLosa.visible = capa === 'sombra' || capa === 'compuesto';
  if (capa === 'losa') { soloVisible([e.losaG]); e.suelo.visible = false; invisibleConSombra(e.marcoG); e.marcoG.visible = true; invisibleConSombra(e.cilindro); e.cilindro.visible = true; }
  else if (capa === 'marco') { soloVisible([e.marcoG]); e.suelo.visible = false; }
  else if (capa === 'sello') { soloVisible([e.cilindro]); e.suelo.visible = false; }
  else if (capa === 'sombra') { soloVisible([e.losaG, e.marcoG, e.cilindro]); [e.losaG, e.marcoG, e.cilindro].forEach(invisibleConSombra); }
  else if (capa === 'cilindro') {
    soloVisible([e.cilindro]); e.suelo.visible = false;
    const c = e.cilindro.position.clone();
    e.camara.position.set(c.x + 0.03, c.y + 0.30, c.z + 0.24); e.camara.lookAt(c); e.camara.setFocalLength(50);
    e.ponerLuz(-50, 24);
  } else if (capa === 'anfora') {
    soloVisible([]); e.suelo.visible = true;
    armarAnfora(e);
  }
  // en modo póster no hay deriva ni asentamiento; se espera a que todas las texturas estén cargadas
  await e.tex.listo();
  await new Promise((r) => setTimeout(r, 600));
  renderer.render(e.escena, e.camara);
  await new Promise((r) => setTimeout(r, 300));
  renderer.render(e.escena, e.camara);
  const datos = { capa, ancho, alto, esquinas: capa === 'anfora' || capa === 'cilindro' ? null : esquinasPantalla(e.pantalla, e.camara) };
  const pre = document.createElement('pre'); pre.id = 'datos'; pre.textContent = JSON.stringify(datos);
  document.body.appendChild(pre);
  document.title = 'listo';
  return datos;
}

/* ---------- Ánfora: jarra ficticia para la tarjeta de la página de prueba ---------- */
function armarAnfora(e) {
  const perfil = [
    [0.0, 0.0], [0.052, 0.0], [0.058, 0.004], [0.064, 0.02], [0.072, 0.06], [0.078, 0.11], [0.076, 0.15],
    [0.066, 0.185], [0.05, 0.205], [0.044, 0.215], [0.046, 0.228], [0.05, 0.236], [0.049, 0.24],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const cuerpo = new THREE.Mesh(new THREE.LatheGeometry(perfil, 96), e.porcelana);
  cuerpo.castShadow = cuerpo.receiveShadow = true;
  const g = new THREE.Group();
  g.add(cuerpo);
  const curva = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.07, 0.19, 0), new THREE.Vector3(-0.115, 0.17, 0), new THREE.Vector3(-0.125, 0.12, 0), new THREE.Vector3(-0.105, 0.075, 0), new THREE.Vector3(-0.075, 0.06, 0),
  ]);
  const asa = new THREE.Mesh(new THREE.TubeGeometry(curva, 48, 0.009, 16, false), e.porcelana);
  asa.scale.z = 1.5; asa.castShadow = true;
  g.add(asa);
  const tapaG = new THREE.CylinderGeometry(0.047, 0.05, 0.016, 48); tapaG.setAttribute('uv1', tapaG.attributes.uv);
  const tapa = new THREE.Mesh(tapaG, e.arcilla); tapa.position.y = 0.248; tapa.castShadow = true;
  const pomo = new THREE.Mesh(new THREE.SphereGeometry(0.012, 32, 24), e.arcilla); pomo.position.y = 0.265;
  g.add(tapa, pomo);
  const baseG = new THREE.CylinderGeometry(0.1, 0.104, 0.022, 96); baseG.setAttribute('uv1', baseG.attributes.uv);
  const base = new THREE.Mesh(baseG, e.travertino.clone()); base.material.map = e.tex('travertine009-color.webp', { srgb: true, repetir: 2.5 });
  base.position.y = -0.011; base.receiveShadow = true; base.castShadow = true;
  g.add(base);
  g.position.set(0, 0.022, 0);
  e.escena.add(g);
  e.camara.position.set(0.4, 0.3, 0.66); e.camara.lookAt(0, 0.125, 0); e.camara.setFocalLength(55);
  e.ponerLuz(-40, 42);
}
