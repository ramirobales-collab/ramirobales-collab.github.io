import * as THREE from '../../../lib/three.module.min.js';
import { RGBELoader } from '../lib/RGBELoader.js';
import { crearRuido } from './ruido.js';

const RAD = Math.PI / 180;

// Claves de cámara, luz y mecanismo. La cámara orbita `mira` en esféricas (dist, az, el).
// `sec` es el índice de parada (0–4) y `f` la fracción del alto de esa parada.
export const CLAVES = [
  { sec: 0, f: 0.00, dist: 1.20, az: 0,   el: 20, mira: [0, 0.14, 0], fov: 38, luzAz: 118, luzEl: 30, despiece: 0, litros: 1,    tapa: 0 },
  { sec: 0, f: 0.62, dist: 1.05, az: 90,  el: 20, mira: [0, 0.14, 0], fov: 38, luzAz: 205, luzEl: 27, despiece: 0, litros: 1,    tapa: 0 },
  { sec: 1, f: 0.04, dist: 0.36, az: 118, el: 10, mira: [0.02, 0.13, 0], fov: 34, luzAz: -45, luzEl: 30, despiece: 0, litros: 1, tapa: 0 },
  { sec: 1, f: 0.26, dist: 0.34, az: 128, el: 6,  mira: [0.01, 0.12, 0], fov: 34, luzAz: -40, luzEl: 26, despiece: 0, litros: 1, tapa: 0 },
  { sec: 1, f: 0.38, dist: 0.36, az: 160, el: 24, mira: [0.03, 0.02, 0.04], fov: 34, luzAz: -10, luzEl: 40, despiece: 0, litros: 1, tapa: 0 },
  { sec: 1, f: 0.60, dist: 0.34, az: 175, el: 22, mira: [0.02, 0.02, 0.05], fov: 34, luzAz: -5, luzEl: 38, despiece: 0, litros: 1, tapa: 0 },
  { sec: 1, f: 0.72, dist: 0.30, az: 205, el: 30, mira: [0, 0.27, 0], fov: 34, luzAz: 10, luzEl: 45, despiece: 0, litros: 1, tapa: 0 },
  { sec: 1, f: 0.90, dist: 0.30, az: 220, el: 34, mira: [0, 0.27, 0], fov: 34, luzAz: 15, luzEl: 45, despiece: 0, litros: 1, tapa: 0 },
  { sec: 2, f: 0.05, dist: 1.20, az: 235, el: 40, mira: [0, 0.10, 0], fov: 38, luzAz: 355, luzEl: 30, despiece: 0, litros: 1,    tapa: 0 },
  { sec: 2, f: 0.50, dist: 1.28, az: 262, el: 44, mira: [0, 0.11, 0], fov: 38, luzAz: 20, luzEl: 28, despiece: 1, litros: 0.75, tapa: 1 },
  { sec: 2, f: 0.95, dist: 1.20, az: 290, el: 36, mira: [0, 0.09, 0], fov: 38, luzAz: 50, luzEl: 26, despiece: 0, litros: 0.25, tapa: 0 },
  { sec: 3, f: 0.03, dist: 0.42, az: 300, el: 12, mira: [0.11, 0.15, 0], fov: 34, luzAz: 40, luzEl: 30, despiece: 0, litros: 0.25, tapa: 0 },
  { sec: 3, f: 0.20, dist: 0.40, az: 320, el: 8,  mira: [0.11, 0.15, 0], fov: 34, luzAz: 45, luzEl: 28, despiece: 0, litros: 0.25, tapa: 0 },
  { sec: 3, f: 0.28, dist: 0.30, az: 340, el: 10, mira: [-0.07, 0.245, 0], fov: 34, luzAz: 60, luzEl: 34, despiece: 0, litros: 0.25, tapa: 0 },
  { sec: 3, f: 0.45, dist: 0.29, az: 356, el: 14, mira: [-0.075, 0.25, 0], fov: 34, luzAz: 70, luzEl: 36, despiece: 0, litros: 0.25, tapa: 0 },
  { sec: 3, f: 0.53, dist: 0.40, az: 440, el: 4,  mira: [0.07, 0.02, 0.06], fov: 34, luzAz: 95, luzEl: 22, despiece: 0, litros: 0.25, tapa: 0 },
  { sec: 3, f: 0.70, dist: 0.40, az: 460, el: 2,  mira: [0.07, 0.02, 0.06], fov: 34, luzAz: 105, luzEl: 20, despiece: 0, litros: 0.25, tapa: 0 },
  { sec: 3, f: 0.78, dist: 0.32, az: 500, el: 36, mira: [0, 0.27, 0], fov: 34, luzAz: 120, luzEl: 48, despiece: 0, litros: 0.25, tapa: 0 },
  { sec: 3, f: 0.88, dist: 0.32, az: 520, el: 40, mira: [0, 0.27, 0], fov: 34, luzAz: 125, luzEl: 50, despiece: 0, litros: 0.25, tapa: 0 },
  { sec: 4, f: 0.00, dist: 1.25, az: 600, el: 20, mira: [0, 0.14, 0], fov: 38, luzAz: 360, luzEl: 30, despiece: 0, litros: 0.25, tapa: 0 },
  { sec: 4, f: 1.00, dist: 1.30, az: 625, el: 22, mira: [0, 0.14, 0], fov: 38, luzAz: 385, luzEl: 24, despiece: 0, litros: 0.25, tapa: 0 },
];

// Índice de clave usado como póster de cada parada (sin WebGL o con reduced-motion).
export const POSTERS = [0, 2, 9, 11, 19];

const CAMPOS = ['dist', 'az', 'el', 'fov', 'luzAz', 'luzEl', 'despiece', 'litros', 'tapa', 'dx'];
CLAVES.forEach(k => { if (k.dx === undefined) k.dx = k.sec === 4 ? 0.31 : 0.21; });

function suave(t) { return t * t * (3 - 2 * t); }

export function interpolar(a, b, t, out) {
  const s = suave(Math.min(1, Math.max(0, t)));
  for (const k of CAMPOS) out[k] = a[k] + (b[k] - a[k]) * s;
  out.mira = out.mira || [0, 0, 0];
  for (let i = 0; i < 3; i++) out.mira[i] = a.mira[i] + (b.mira[i] - a.mira[i]) * s;
  return out;
}

function perfil(puntos, n) {
  const curva = new THREE.CatmullRomCurve3(puntos.map(p => new THREE.Vector3(p[0], p[1], 0)), false, 'centripetal', 0.5);
  return curva.getSpacedPoints(n).map(v => new THREE.Vector2(Math.max(0, v.x), v.y));
}

function tuboEliptico(curva, segs, radSegs, a, b, escala) {
  const frames = curva.computeFrenetFrames(segs, false);
  const pos = [], nor = [], uv = [], idx = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curva.getPointAt(t, P);
    N.copy(frames.normals[i]); B.copy(frames.binormals[i]);
    const s = escala ? escala(t) : 1;
    for (let j = 0; j <= radSegs; j++) {
      const v = (j / radSegs) * Math.PI * 2;
      const cx = Math.cos(v) * a * s, cy = Math.sin(v) * b * s;
      q.copy(P).addScaledVector(N, cx).addScaledVector(B, cy);
      pos.push(q.x, q.y, q.z);
      q.copy(N).multiplyScalar(Math.cos(v) * b).addScaledVector(B, Math.sin(v) * a).normalize();
      nor.push(q.x, q.y, q.z);
      uv.push(t * 3, j / radSegs);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radSegs; j++) {
      const a0 = i * (radSegs + 1) + j, a1 = a0 + radSegs + 1;
      idx.push(a0, a0 + 1, a1, a1, a0 + 1, a1 + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function curva(puntos) {
  return new THREE.CatmullRomCurve3(puntos.map(p => new THREE.Vector3(...p)), false, 'centripetal', 0.5);
}

const PERFIL_EXTERIOR = [
  [0, 0], [0.034, 0], [0.058, 0.0015], [0.064, 0.004], [0.071, 0.012], [0.081, 0.035], [0.089, 0.075],
  [0.091, 0.105], [0.088, 0.140], [0.078, 0.175], [0.065, 0.200], [0.059, 0.215], [0.058, 0.232],
  [0.061, 0.246], [0.064, 0.251],
];
const PERFIL_INTERIOR = [
  [0.0585, 0.251], [0.055, 0.248], [0.053, 0.232], [0.054, 0.215], [0.061, 0.198], [0.074, 0.170],
  [0.084, 0.135], [0.087, 0.105], [0.085, 0.072], [0.077, 0.035], [0.067, 0.016], [0.048, 0.011], [0.0, 0.011],
];

function radioInterior(y) {
  const p = PERFIL_INTERIOR;
  for (let i = 0; i < p.length - 1; i++) {
    const [r0, y0] = p[i], [r1, y1] = p[i + 1];
    if ((y <= y0 && y >= y1) || (y >= y0 && y <= y1)) {
      const t = (y - y0) / ((y1 - y0) || 1);
      return r0 + (r1 - r0) * t;
    }
  }
  return 0.05;
}

function geometriaCuerpo() {
  const ext = perfil(PERFIL_EXTERIOR, 110);
  const int = perfil(PERFIL_INTERIOR, 80);
  const g = new THREE.LatheGeometry(ext.concat(int), 128);
  g.computeVertexNormals();
  return g;
}

function geometriaAsa() {
  const c = curva([[0.072, 0.212, 0], [0.108, 0.224, 0], [0.144, 0.202, 0], [0.153, 0.150, 0], [0.144, 0.100, 0], [0.116, 0.074, 0], [0.082, 0.078, 0]]);
  return tuboEliptico(c, 56, 24, 0.0165, 0.0095, t => 1 + 0.10 * Math.sin(t * Math.PI));
}

function geometriaPico() {
  const c = curva([[-0.040, 0.222, 0], [-0.064, 0.238, 0], [-0.090, 0.260, 0], [-0.116, 0.284, 0], [-0.134, 0.302, 0]]);
  return tuboEliptico(c, 36, 24, 0.030, 0.014, t => 1 - 0.48 * t);
}

function geometriaTapa() {
  const pts = perfil([
    [0, 0], [0.040, 0], [0.0495, 0.001], [0.0505, 0.006], [0.052, 0.009], [0.062, 0.011], [0.0635, 0.016],
    [0.0635, 0.030], [0.061, 0.036], [0.042, 0.039], [0.022, 0.040], [0.015, 0.046], [0.015, 0.057], [0.011, 0.064], [0, 0.066],
  ], 90);
  const g = new THREE.LatheGeometry(pts, 192);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y > 0.0125 && y < 0.0335) {
      const r = Math.hypot(x, z);
      if (r > 0.057) {
        const th = Math.atan2(z, x);
        const borde = Math.min(1, (y - 0.0125) / 0.004, (0.0335 - y) / 0.004);
        const k = 1 + 0.018 * Math.cos(48 * th) * borde;
        p.setXYZ(i, x * k, y, z * k);
      }
    }
  }
  g.computeVertexNormals();
  return g;
}

function geometriaBase() {
  const pts = [[0, 0], [0.128, 0], [0.130, 0.002], [0.130, 0.0205], [0.1265, 0.025], [0.1225, 0.025], [0, 0.025]].map(p => new THREE.Vector2(p[0], p[1]));
  const g = new THREE.LatheGeometry(pts, 128);
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (n.getY(i) > 0.6 || y < 0.0005) {
      uv.setXY(i, x / 0.42 + 0.5, z / 0.42 + 0.5);
    } else {
      uv.setXY(i, (Math.atan2(z, x) / (Math.PI * 2) + 0.5) * 3.2, y / 0.025 * 0.08);
    }
  }
  return g;
}

function texturaDial(etiquetas) {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff';
  ctx.lineCap = 'round';
  const cx = S / 2, cy = S / 2;
  const R0 = S * 0.455, R1 = S * 0.49;
  const inicio = 200 * RAD, fin = 340 * RAD;
  for (let i = 0; i <= 12; i++) {
    const a = inicio + (fin - inicio) * (i / 12);
    const mayor = i % 4 === 0;
    const r0 = mayor ? R0 - S * 0.03 : R0;
    ctx.lineWidth = mayor ? 9 : 5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
    ctx.lineTo(cx + Math.cos(a) * R1, cy + Math.sin(a) * R1);
    ctx.stroke();
  }
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(cx, cy, R1, inicio, fin); ctx.stroke();
  ctx.font = '600 44px Inter, Arial, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  etiquetas.forEach((t, i) => {
    const a = inicio + (fin - inicio) * (i / 3);
    const r = R0 - S * 0.075;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(t, 0, 0);
    ctx.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

function texturaRadial(interior = 0.45, exterior = 1) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, '#fff'); g.addColorStop(interior, '#fff'); g.addColorStop(exterior, '#000');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

export async function crearEscena({ lienzo, base = './', pixelRatio = 1.5, conservar = false }) {
  const renderer = new THREE.WebGLRenderer({ canvas: lienzo, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: conservar });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);

  const escena = new THREE.Scene();
  const camara = new THREE.PerspectiveCamera(38, 1, 0.05, 20);

  const cargador = new THREE.TextureLoader();
  const tex = (nombre, color = false, rep = 1) => {
    const t = cargador.load(base + 'tex/' + nombre + '.webp');
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep, rep);
    t.anisotropy = 4;
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  const porcelana = new THREE.MeshPhysicalMaterial({
    map: tex('porcelain001-color', true, 2), normalMap: tex('porcelain001-normal', false, 2), roughnessMap: tex('porcelain001-roughness', false, 2),
    color: 0xf6f1e8, roughness: 1.0, metalness: 0, envMapIntensity: 0.9, normalScale: new THREE.Vector2(1.4, 1.4),
    clearcoat: 1.0, clearcoatRoughness: 0.08, sheen: 0.15, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xfff1e2),
  });
  // Asa y pico: misma porcelana pero satinada; en un tubo fino el estudio se refleja como cromo si queda tan brillante como el cuerpo.
  const porcelanaAsa = porcelana.clone(); porcelanaAsa.roughness = 1.5; porcelanaAsa.clearcoat = 0.9; porcelanaAsa.clearcoatRoughness = 0.14; porcelanaAsa.sheen = 0.15; porcelanaAsa.envMapIntensity = 0.8; porcelanaAsa.color = new THREE.Color(0xf8f3ea);
  const porcelanaDoble = porcelanaAsa.clone(); porcelanaDoble.side = THREE.DoubleSide;
  const arcilla = new THREE.MeshStandardMaterial({
    map: tex('clay002-color', true, 2), normalMap: tex('clay002-normal', false, 2), roughnessMap: tex('clay002-roughness', false, 2), aoMap: tex('clay002-ao', false, 2),
    roughness: 1, metalness: 0, envMapIntensity: 0.7, normalScale: new THREE.Vector2(0.9, 0.9), aoMapIntensity: 0.8,
  });
  const travertino = new THREE.MeshStandardMaterial({
    map: tex('travertine003-color', true), normalMap: tex('travertine003-normal'), roughnessMap: tex('travertine003-roughness'), aoMap: tex('travertine003-ao'),
    roughness: 1, metalness: 0, envMapIntensity: 0.8, normalScale: new THREE.Vector2(0.8, 0.8),
  });
  const agua = new THREE.MeshPhysicalMaterial({ color: 0x4f98bb, roughness: 0.02, metalness: 0, envMapIntensity: 0.3, transparent: true, opacity: 0.8, clearcoat: 0.4, clearcoatRoughness: 0.02 });
  const dialMat = new THREE.MeshStandardMaterial({ color: 0x15100a, roughness: 0.95, metalness: 0, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const contactoMat = new THREE.MeshBasicMaterial({ color: 0x1a1208, transparent: true, opacity: 0.5, alphaMap: texturaRadial(0.05, 1), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const sombraMat = new THREE.ShadowMaterial({ color: 0x2a2015, opacity: 0.42, transparent: true, depthWrite: false });
  const sueloOscuroMat = new THREE.MeshStandardMaterial({ color: 0x1b1712, roughness: 0.92, metalness: 0, transparent: true, alphaMap: texturaRadial(0.2, 1), envMapIntensity: 0.1, depthWrite: false });

  const conjunto = new THREE.Group();
  escena.add(conjunto);

  const gBase = new THREE.Group();
  const base3d = new THREE.Mesh(geometriaBase(), travertino);
  base3d.castShadow = true; base3d.receiveShadow = true;
  gBase.add(base3d);
  const dial = new THREE.Mesh(new THREE.PlaneGeometry(0.262, 0.262), dialMat);
  dial.rotation.x = -Math.PI / 2; dial.rotation.z = Math.PI / 2; dial.position.y = 0.0252;
  dial.receiveShadow = true;
  gBase.add(dial);
  const contactoJarra = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.19), contactoMat);
  contactoJarra.rotation.x = -Math.PI / 2; contactoJarra.position.y = 0.0254;
  gBase.add(contactoJarra);
  const contactoBase = new THREE.Mesh(new THREE.PlaneGeometry(0.40, 0.40), contactoMat.clone());
  contactoBase.material.opacity = 0.38;
  contactoBase.rotation.x = -Math.PI / 2; contactoBase.position.y = 0.0006;
  escena.add(contactoBase);
  conjunto.add(gBase);

  const gJarra = new THREE.Group();
  gJarra.position.y = 0.025;
  const cuerpo = new THREE.Mesh(geometriaCuerpo(), porcelana);
  cuerpo.castShadow = true; cuerpo.receiveShadow = true;
  const asa = new THREE.Mesh(geometriaAsa(), porcelanaAsa);
  asa.castShadow = true; asa.receiveShadow = true;
  const pico = new THREE.Mesh(geometriaPico(), porcelanaDoble);
  pico.castShadow = true; pico.receiveShadow = true;
  const nivel = new THREE.Mesh(new THREE.CircleGeometry(1, 64), agua);
  nivel.rotation.x = -Math.PI / 2;
  gJarra.add(cuerpo, asa, pico, nivel);
  conjunto.add(gJarra);

  const gTapa = new THREE.Group();
  gTapa.position.y = 0.025 + 0.240;
  const tapa = new THREE.Mesh(geometriaTapa(), arcilla);
  tapa.castShadow = true; tapa.receiveShadow = true;
  gTapa.add(tapa);
  conjunto.add(gTapa);

  const sueloSombra = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), sombraMat);
  sueloSombra.rotation.x = -Math.PI / 2;
  sueloSombra.receiveShadow = true;
  escena.add(sueloSombra);
  const sueloOscuro = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), sueloOscuroMat);
  sueloOscuro.rotation.x = -Math.PI / 2;
  sueloOscuro.position.y = -0.0005;
  sueloOscuro.receiveShadow = true;
  sueloOscuro.visible = false;
  escena.add(sueloOscuro);

  const luz = new THREE.DirectionalLight(0xf6ebd8, 3.0);
  luz.castShadow = true;
  luz.shadow.mapSize.set(1024, 1024);
  const sc = luz.shadow.camera;
  sc.left = -0.42; sc.right = 0.42; sc.top = 0.42; sc.bottom = -0.42; sc.near = 0.5; sc.far = 6;
  luz.shadow.bias = -0.0003; luz.shadow.normalBias = 0.012;
  luz.target.position.set(0, 0.12, 0);
  escena.add(luz, luz.target);
  const relleno = new THREE.HemisphereLight(0xf3eee4, 0x8a7a66, 0.42);
  escena.add(relleno);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  await new Promise((ok, err) => {
    new RGBELoader().load(base + 'env/photo_studio_01-512.hdr', (hdr) => {
      escena.environment = pmrem.fromEquirectangular(hdr).texture;
      hdr.dispose(); pmrem.dispose();
      ok();
    }, undefined, err);
  });

  const texturas = [porcelana.map, porcelana.normalMap, porcelana.roughnessMap, arcilla.map, arcilla.normalMap, arcilla.roughnessMap, arcilla.aoMap, travertino.map, travertino.normalMap, travertino.roughnessMap, travertino.aoMap];
  await Promise.all(texturas.map(t => new Promise(ok => { if (t.image && t.image.width) ok(); else { const i = setInterval(() => { if (t.image && t.image.width) { clearInterval(i); ok(); } }, 20); } })));

  const ruidoA = crearRuido((Math.random() * 1e9) | 0);
  const ruidoB = crearRuido((Math.random() * 1e9) | 0);
  const estado = {};
  interpolar(CLAVES[0], CLAVES[0], 0, estado);
  const deriva = { px: 0, py: 0, sx: 0, sy: 0, vida: 0, ultimo: performance.now() };
  let t0 = performance.now();

  function setTema(esOscuro) {
    sueloOscuro.visible = esOscuro;
    sombraMat.opacity = esOscuro ? 0.6 : 0.42;
    relleno.intensity = esOscuro ? 0.08 : 0.42;
    relleno.color.set(esOscuro ? 0x2a251e : 0xf3eee4); relleno.groundColor.set(esOscuro ? 0x14110d : 0x8a7a66);
    luz.intensity = esOscuro ? 2.6 : 3.0;
  }

  function setDial(etiquetas) {
    if (dialMat.alphaMap) dialMat.alphaMap.dispose();
    dialMat.alphaMap = texturaDial(etiquetas);
    dialMat.needsUpdate = true;
  }

  function redimensionar(w, h, despl = 0, pr, desplY = 0) {
    if (pr) renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    camara.aspect = w / h;
    if (despl || desplY) camara.setViewOffset(w, h, -despl * w, desplY * h, w, h); else camara.clearViewOffset();
    camara.updateProjectionMatrix();
  }

  function evento() { deriva.vida = 1; deriva.ultimo = performance.now(); }
  function puntero(x, y) { deriva.px = x; deriva.py = y; evento(); }

  const posCam = new THREE.Vector3(), mira = new THREE.Vector3();
  function aplicar(ahora, conDeriva = true) {
    const t = (ahora - t0) / 1000;
    const desde = (ahora - deriva.ultimo) / 1000;
    if (desde > 12) deriva.vida = Math.max(0, deriva.vida - 0.016 * 0.4); else deriva.vida = Math.min(1, deriva.vida + 0.05);
    const v = conDeriva ? deriva.vida : 0;
    deriva.sx += (deriva.px - deriva.sx) * 0.035;
    deriva.sy += (deriva.py - deriva.sy) * 0.035;
    const nA = ruidoA(t * 0.08, 0.37), nB = ruidoB(0.11, t * 0.08);
    const dAz = v * (deriva.sx * 2.2 + nA * 1.6);
    const dEl = v * (deriva.sy * -1.4 + nB * 1.0);
    const dLuz = v * (deriva.sx * 4 + nA * 2);
    conjunto.rotation.z = v * nB * 0.75 * RAD;
    conjunto.rotation.x = v * nA * 0.75 * RAD;

    const az = (estado.az + dAz) * RAD, el = (estado.el + dEl) * RAD;
    mira.set(estado.mira[0], estado.mira[1], estado.mira[2]);
    posCam.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(estado.dist).add(mira);
    camara.position.copy(posCam);
    camara.lookAt(mira);
    if (camara.fov !== estado.fov) { camara.fov = estado.fov; camara.updateProjectionMatrix(); }

    const lAz = (estado.luzAz + dLuz) * RAD, lEl = estado.luzEl * RAD;
    luz.position.set(Math.cos(lEl) * Math.sin(lAz), Math.sin(lEl), Math.cos(lEl) * Math.cos(lAz)).multiplyScalar(2.6);
    luz.position.y += 0.1;

    const d = estado.despiece;
    const lleno = (estado.litros - 0.25) / 0.75;
    gTapa.position.y = 0.265 + 0.13 * d + 0.012 * estado.tapa - 0.004 * lleno;
    gJarra.position.y = 0.025 - 0.004 * lleno;
    gBase.position.y = -0.11 * d;
    contactoJarra.material.opacity = 0.5 * (1 - d);
    contactoBase.position.y = 0.0006 - 0.11 * d;
    const yAgua = 0.055 + (0.190 - 0.055) * lleno;
    nivel.position.y = yAgua;
    const r = radioInterior(yAgua) - 0.0015;
    nivel.scale.set(r, r, 1);
  }

  function render(ahora = performance.now(), conDeriva = true) {
    aplicar(ahora, conDeriva);
    renderer.render(escena, camara);
  }

  function estaActiva() { return deriva.vida > 0.001; }

  return { renderer, camara, escena, estado, CLAVES, redimensionar, render, setTema, setDial, puntero, evento, estaActiva, lienzo };
}
