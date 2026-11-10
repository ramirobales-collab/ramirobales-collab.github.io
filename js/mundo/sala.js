/* sala.js — compositor de láminas de «la sala negra»: encuadre, cámara viva, foco en tiempo real,
   los tres actos (líneas, materia, verificación), reluz, bruma básica y salida con tramado.
   Sólo depende de mundo.json (nunca de la resolución ni del contenido de las láminas).
   Fórmulas: portfolio-docs/v3/motor.md §3 y §4.1. Interfaz para la segunda mitad: progreso-motor-1.md. */

export const IDS = ['fondo', 'lejos', 'medio', 'cerca'];
const ANCLA_H = [0.64, 0.5], ANCLA_V = [0.5, 0.72];
const KF = 0.005;       // σ del desenfoque, en fracción del alto de la lámina por dioptría (f/4 con 50 mm da ≈ 0,0105: se cierra un poco para que los productos se lean)
const D_MIN = 0.4;      // m: arranque de la profundidad normalizada (logarítmica) de los frentes

/* ---------- Geometría pura (sirve también sin WebGL: respaldo con póster) ---------- */

/* Encuadre «cover» con ancla. S = escenario en px CSS. Deja en `e`: x0, y0, W = pw·k, H = ph·k.
   `anchoMax` (px CSS) achica la lámina y la apoya contra el borde derecho: lo usa index.js para que el
   portal no quede detrás del titular. El borde de la lámina es negro, así que lo que sobra es más sala a oscuras. */
export function encuadrar(datos, Sx, Sy, Sw, Sh, e, anchoMax = Infinity) {
  const pw = datos.ancho, ph = datos.alto;
  const ancla = datos.ancla || (pw >= ph ? ANCLA_H : ANCLA_V);
  let k = Math.max(Sw / pw, Sh / ph), ax = ancla[0];
  if (pw * k > anchoMax) {
    const f = Math.min(1, (pw * k - anchoMax) / (0.04 * pw * k)); // pasa del ancla a «derecha» sin salto
    k = anchoMax / pw; ax += (1 - ax) * f;
  }
  e.k = k; e.W = pw * k; e.H = ph * k;
  e.x0 = Sx + (Sw - e.W) * ax; e.y0 = Sy + (Sh - e.H) * ancla[1];
  e.Sx = Sx; e.Sy = Sy; e.Sw = Sw; e.Sh = Sh;
  return e;
}

/* Cámara de una lámina: Tx, Ty y el desplazamiento vivo t (en ejes de vista; tz > 0 = avanzar). */
export function crearCamara(datos) {
  const Ty = Math.tan((datos.camara.fovY * Math.PI) / 360);
  return { Tx: (Ty * datos.ancho) / datos.alto, Ty, tx: 0, ty: 0, tz: 0 };
}

export function zDeCapa(datos, id) {
  for (const c of datos.capas) if (c.id === id) return c.z;
  return datos.foco.distancia;
}

/* Rectángulo en pantalla (px CSS: x, y, ancho, alto) del `pantalla` de una obra, con la
   transformación de su capa (p' = p·s − o) y el encuadre. `out` es un arreglo de 4. */
export function rectObra(e, cam, pantalla, z, out) {
  const zz = Math.max(z - cam.tz, 1e-3), s = z / zz;
  const ox = cam.tx / cam.Tx / zz, oy = cam.ty / cam.Ty / zz;
  const ua = ((2 * pantalla[0] - 1) * s - ox + 1) / 2, ub = ((2 * pantalla[2] - 1) * s - ox + 1) / 2;
  const va = (1 - ((1 - 2 * pantalla[1]) * s - oy)) / 2, vb = (1 - ((1 - 2 * pantalla[3]) * s - oy)) / 2;
  out[0] = e.x0 + ua * e.W; out[1] = e.y0 + va * e.H; out[2] = (ub - ua) * e.W; out[3] = (vb - va) * e.H;
  return out;
}

/* ---------- Programas ---------- */

const CABEZA = `#version 300 es
precision highp float;
precision highp sampler2D;
`;

/* Datos de una lámina (-p.png + -n.webp) → RGBA16F: R = profundidad en metros (los huecos se rellenan
   con el vecino más cercano o con el z de la capa), G = máscara (B/255), B = contorno, A = 1. */
const FS_DATOS = CABEZA + `
uniform sampler2D u_p, u_n;
uniform vec3 u_cl;   // cerca, lejos, z de la capa
uniform float u_hayN;
out vec4 o;
ivec2 tam;
vec4 crudo(ivec2 c){ return texelFetch(u_p, clamp(c, ivec2(0), tam - 1), 0); }
float metros(vec4 t){ return u_cl.x + (t.r * 65280.0 + t.g * 255.0) / 65535.0 * (u_cl.y - u_cl.x); }
vec3 normal(ivec2 c){ return texelFetch(u_n, clamp(c * textureSize(u_n, 0) / tam, ivec2(0), textureSize(u_n, 0) - 1), 0).xyz * 2.0 - 1.0; }
void main(){
  tam = textureSize(u_p, 0);
  ivec2 c = ivec2(gl_FragCoord.xy);
  vec4 t = crudo(c);
  bool hueco = t.b < 0.002;
  float d = metros(t);
  if (hueco) {
    float mejor = 1e9;
    for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
      vec4 v = crudo(c + ivec2(x, y));
      if (v.b >= 0.002) mejor = min(mejor, metros(v));
    }
    d = mejor < 1e8 ? mejor : u_cl.z;
  }
  float borde = 0.0;
  if (!hueco) {
    float w = 1.0 / d, lap = 0.0, silueta = 0.0, quiebre = 0.0;
    vec3 n = normal(c);
    for (int i = 0; i < 4; i++) {
      ivec2 e = c + ivec2(i == 0 ? 1 : (i == 1 ? -1 : 0), i == 2 ? 1 : (i == 3 ? -1 : 0));
      vec4 v = crudo(e);
      if (abs(v.b - t.b) > 0.002) { silueta = 1.0; continue; }
      lap += 1.0 / metros(v) - w;
      quiebre = max(quiebre, 1.0 - dot(n, normal(e)));
    }
    float escalon = abs(lap) * d * d * 25.0; // ≈ 1 con un escalón de 4 cm, igual a toda distancia
    borde = max(silueta, smoothstep(0.12, 0.5, escalon));
    /* el pase de normales trae el relieve del material (motas del piso): sin apoyo en la profundidad, el quiebre pesa poco */
    borde = max(borde, u_hayN * smoothstep(0.08, 0.3, quiebre) * (0.2 + 0.8 * smoothstep(0.012, 0.06, escalon)));
  }
  o = vec4(d, t.b, borde, 1.0);
}`;

/* Color recto sRGB → premultiplicado en lineal (nivel 0 de la pirámide). */
const FS_PREMULTIPLICA = CABEZA + `
uniform sampler2D u_t;
out vec4 o;
void main(){ vec4 c = texelFetch(u_t, ivec2(gl_FragCoord.xy), 0); o = vec4(c.rgb * c.a, c.a); }`;

/* Gaussiana separable (σ = √3 texeles de la fuente) con reducción a la mitad: de nivel en nivel, σ ≈ 2, 4, 8, 16 px. */
const FS_DESENFOQUE = CABEZA + `
uniform sampler2D u_t;
uniform vec2 u_dir, u_tam;
uniform float u_lod;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy / u_tam;
  vec4 c = textureLod(u_t, uv, u_lod);
  c += 1.3599 * (textureLod(u_t, uv + u_dir * 1.3775, u_lod) + textureLod(u_t, uv - u_dir * 1.3775, u_lod));
  c += 0.2926 * (textureLod(u_t, uv + u_dir * 3.2375, u_lod) + textureLod(u_t, uv - u_dir * 3.2375, u_lod));
  o = c / 4.305;
}`;

/* Bloque de una capa con plano propio (lejos, medio, cerca). */
function capaGLSL(i) {
  const k = 'xyzw'[i];
  return `
  if (u_vis.${k} > 0.002) {
    float zc = u_z.${k}, zz = zc - u_t.z;
    vec2 p = (pp * zz + txy) / zc;
    vec2 uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
    vec4 dat = textureLod(u_d${i}, uv, 0.0);
    float sig = u_foco.y * abs(u_foco.x - 1.0 / zc);
    vec4 c = u_foco.z > 0.5 ? foco(u_c${i}, uv, max(log2(1.0 + sig * 0.6), u_lod0.${k}), u_razon.${k})
                            : vec4(0.0, 0.0, 0.0, smoothstep(0.03, 0.09, dat.g));
    float a = c.a * u_vis.${k};
#if BRUMA > 1
    niebla(C, zN, zz, pp); zN = min(zN, zz);
#endif
    if (a > 0.003) {
      vec3 X = aMundo(p, dat.r);
      float ll = llave(dat.r, X);
      float m = smoothstep(u_acto.z - 0.03, u_acto.z + 0.03, ll);
      vec3 col = c.rgb * (mix(u_ver.w, 1.0, m) * u_ver.z * u_vis.${k});
      col += a * u_acto.w * calma * 0.55 * FILO * exp(-pow((ll - u_acto.z) / 0.022, 2.0));
      C = C * (1.0 - a) + col;
      Eb = max(Eb * (1.0 - a * 0.85), dat.b * a);
      Gb = max(Gb * (1.0 - a * 0.85), textureLod(u_d${i}, uv, 2.5).b * a);
      if (a > 0.5) {
        Dor = dat.r; N = textureLod(u_n${i}, uv, 0.0).xyz; Mv = m; Ll = ll;
        Mk = texelFetch(u_d${i}, clamp(ivec2(uv * vec2(textureSize(u_d${i}, 0))), ivec2(0), textureSize(u_d${i}, 0) - 1), 0).g;
      }
    }
  }`;
}

function fuenteSala(P) {
  return CABEZA + `
#define TOMAS ${P.tomas}
#define LUCES ${P.luces}
#define BRUMA ${P.bruma}
#define PASOS ${P.bruma === 3 ? 2 : 1}
#define FILO vec3(1.25, 1.2, 1.12)
layout(location = 0) out vec4 o_color;
layout(location = 1) out vec4 o_info;
uniform sampler2D u_c0, u_c1, u_c2, u_c3;
uniform sampler2D u_d0, u_d1, u_d2, u_d3;
uniform sampler2D u_n0, u_n1, u_n2, u_n3;
uniform vec2 u_lienzo;      // búfer, px
uniform vec4 u_enc;         // x0, y0, pw·k, ph·k (px de búfer, origen arriba a la izquierda)
uniform vec3 u_t;           // cámara viva (m, ejes de vista)
uniform vec2 u_T;           // tan(fov/2) en x, y
uniform vec4 u_z, u_vis, u_lod0, u_razon;   // por capa: z, visibilidad, lod mínimo, texeles por px
uniform vec3 u_foco;        // 1/df, σ en px de lámina por dioptría, hay color (0|1)
uniform vec4 u_acto;        // L, frente de líneas, frente de materia, filo
uniform vec4 u_ver;         // V, zs (m), sombra, penumbra
uniform vec2 u_dn;          // dmin, 1/ln(dmax/dmin)
uniform mat4 u_vInv;        // vista⁻¹ de la lámina
uniform float u_piso;
uniform vec4 u_portal;      // xyz en vista viva, radio
uniform vec3 u_portalColor;
uniform vec3 u_bruma;       // densidad, intensidad, tiempo
uniform vec4 u_texto;       // bloque de texto del héroe (px de búfer): ahí la luz de líneas y barrido se calma
uniform vec2 u_eje;         // derecha de la sala en el piso (xz de mundo): las juntas y la grilla fugan al portal
uniform vec4 u_brillo;      // por obra: su pantalla sube de brillo cuando el enjambre la ronda
#if LUCES > 0
uniform vec4 u_luz[8];      // xyz en vista viva, intensidad
uniform vec3 u_luzC[8];
uniform int u_nLuces;
#endif

float azar(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float ruido(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(azar(i), azar(i + vec3(1, 0, 0)), f.x), mix(azar(i + vec3(0, 1, 0)), azar(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(azar(i + vec3(0, 0, 1)), azar(i + vec3(1, 0, 1)), f.x), mix(azar(i + vec3(0, 1, 1)), azar(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
/* Lectura con foco: lod = log2(1 + 0,6·σ) (los niveles valen σ ≈ 1,7 · 3,9 · 7,9 · 16 px de lámina); mezcla entre dos
   niveles de la pirámide (textureLod) y, con varias tomas, suaviza la
   reconstrucción bilineal del nivel bajo y la reducción cuando la lámina tiene más texeles que la pantalla. */
vec4 foco(sampler2D t, vec2 uv, float lod, float razon){
#if TOMAS > 1
  vec2 e = max(exp2(lod) * 0.35 * smoothstep(0.0, 1.0, lod), max(razon - 1.0, 0.0) * 0.25) / vec2(textureSize(t, 0));
  return 0.25 * (textureLod(t, uv + vec2(e.x, e.y * 0.4), lod) + textureLod(t, uv + vec2(-e.x * 0.4, e.y), lod)
               + textureLod(t, uv + vec2(-e.x, -e.y * 0.4), lod) + textureLod(t, uv + vec2(e.x * 0.4, -e.y), lod));
#else
  return textureLod(t, uv, lod);
#endif
}
vec3 aMundo(vec2 p, float d){ return (u_vInv * vec4(p * d * u_T, -d, 1.0)).xyz; }
/* Llave de los frentes: profundidad normalizada (logarítmica: 0 cerca, 1 en el portal) rota con ruido de mundo. */
float llave(float d, vec3 X){
  return clamp(log(max(d, u_dn.x) / u_dn.x) * u_dn.y, 0.0, 1.0) + 0.18 * ruido(X * 0.6) + 0.05 * ruido(X * 5.0);
}
/* Bruma del tramo [zB, zA] (distancias a la cámara viva): extinción + luz del portal dispersada. */
void niebla(inout vec3 C, float zA, float zB, vec2 pp){
  float largo = zA - zB;
  if (largo <= 0.0) return;
  float od = 0.0, luz = 0.0;
  for (int i = 0; i < PASOS; i++) {
    float zm = mix(zB, zA, (float(i) + 0.5) / float(PASOS));
    vec3 Xv = vec3(pp * zm * u_T, -zm);
    float n = ruido(Xv * vec3(0.45, 0.8, 0.45) + vec3(0.05, -0.02, 0.08) * u_bruma.z);
    float rho = u_bruma.x * (0.3 + 1.4 * n * n);
    vec3 r = Xv - u_portal.xyz; r.y *= 0.3;
    float g = 1.0 / (1.0 + dot(r, r) / (u_portal.w * u_portal.w));
    od += rho; luz += rho * g * g;
  }
  float T = exp(-od * largo / float(PASOS));
  C = C * T + u_portalColor * (u_bruma.y * luz / max(od, 1e-5) * (1.0 - T));
}

void main(){
  vec2 q = vec2(gl_FragCoord.x, u_lienzo.y - gl_FragCoord.y);
  vec2 uvp = (q - u_enc.xy) / u_enc.zw;
  vec2 pp = vec2(uvp.x * 2.0 - 1.0, 1.0 - uvp.y * 2.0);
  vec2 txy = u_t.xy / u_T;
  /* detrás del bloque de texto, la luz de líneas, del filo y del barrido se calma */
  vec2 dq = max(u_texto.xy - q, q - u_texto.zw);
  float calma = mix(0.05, 1.0, smoothstep(-0.01, 0.07, max(dq.x, dq.y) / u_lienzo.x));

  /* fondo: piso continuo, z por píxel con punto fijo (arranca en d + tz: exacto para un piso plano) */
  float d = textureLod(u_d0, uvp, 0.0).r + u_t.z;
  vec2 p, uv; vec4 dat;
  for (int i = 0; i < 2; i++) {
    p = (pp * max(d - u_t.z, 0.05) + txy) / d;
    uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
    dat = textureLod(u_d0, uv, 0.0);
    d = dat.r;
  }
  float sig = u_foco.y * abs(u_foco.x - 1.0 / d);
  vec3 C = u_foco.z > 0.5 ? foco(u_c0, uv, max(log2(1.0 + sig * 0.6), u_lod0.x), u_razon.x).rgb : vec3(0.0);
  vec3 X = aMundo(p, d);
  float Ll = llave(d, X);
  float Mv = smoothstep(u_acto.z - 0.03, u_acto.z + 0.03, Ll);
  /* filo del frente: una línea de luz donde el frente es fino; en una pared de frente (llave casi pareja) sería un fogonazo: ahí baja */
  float fino = calma * mix(0.12, 1.0, smoothstep(0.001, 0.005, fwidth(Ll)));
  C = C * (mix(u_ver.w, 1.0, Mv) * u_ver.z) + u_acto.w * fino * FILO * exp(-pow((Ll - u_acto.z) / 0.022, 2.0));
  float Dor = d, Mk = dat.g;
  vec3 N = textureLod(u_n0, uv, 0.0).xyz;
  /* grilla del piso: 0,45 m en coordenadas de sala (sobre las juntas de las losas: fuga al portal), se apaga con la distancia */
  vec2 g = vec2(dot(X.xz, u_eje) - 0.225, dot(X.xz, vec2(u_eje.y, -u_eje.x))) / 0.45, fw = fwidth(g);
  vec2 gr = 1.0 - smoothstep(vec2(0.0), fw * 1.5, abs(fract(g - 0.5) - 0.5));
  float suelo = 1.0 - smoothstep(0.02, 0.06, abs(X.y - u_piso));
  float grilla = max(gr.x, gr.y) * suelo * (1.0 - smoothstep(0.25, 0.7, max(fw.x, fw.y))) * exp(-d * 0.09);
  float Eb = max(dat.b, grilla * 0.6);
  float Gb = textureLod(u_d0, uv, 2.5).b;
  float zN = d - u_t.z;
${capaGLSL(1)}${capaGLSL(2)}${capaGLSL(3)}
  float D = Dor - u_t.z;
  /* la obra que el enjambre ronda: su pantalla sube de brillo un momento */
  float ob = Mk * 255.0 / 32.0 - 1.0;
  if (ob > -0.5 && ob < 3.5) C *= 1.0 + u_brillo[int(ob + 0.5)];
#if BRUMA > 1
  niebla(C, zN, 0.0, pp);
#else
  niebla(C, D, 0.0, pp);
#endif

#if LUCES > 0
  /* reluz: luces puntuales sobre la normal y la posición del píxel visible */
  vec3 Xv = vec3(pp * D * u_T, -D), V = normalize(-Xv), n = normalize(N * 2.0 - 1.0), R = vec3(0.0);
  for (int i = 0; i < LUCES; i++) {
    if (i >= u_nLuces) break;
    vec3 l = u_luz[i].xyz - Xv;
    float r2 = dot(l, l); l *= inversesqrt(r2);
    float nl = max(dot(n, l), 0.0);
    float sp = pow(max(dot(n, normalize(l + V)), 0.0), 420.0) * step(0.0, dot(n, l));
    R += u_luzC[i] * (u_luz[i].w / (1.0 + r2 * 4.0)) * (sp * 1.8 + nl * 0.035);
  }
  C += R * (0.3 + 0.7 * Mv);
#endif

  /* líneas: trazo fino con resplandor, dibujado por un frente; se apagan donde ya entró la materia */
  float tr = smoothstep(u_acto.y, u_acto.y + 0.06, Ll);
  float cab = exp(-pow((Ll - u_acto.y) / 0.05, 2.0));
  float Lw = u_acto.x * (1.0 - 0.85 * Mv * u_ver.z);
  C += vec3(0.80, 0.90, 1.0) * ((Eb * 0.95 + Gb * 0.32) * tr + (Eb + Gb * 0.5) * cab * 1.2) * (Lw * calma);

  /* verificación: plano de luz en z = zs (cámara de la lámina) */
  /* (la profundidad vive en media precisión: pasos de ~2 mm entre 2 y 4 m. En las caras de frente al plano se verían
     terrazas; un tramado del tamaño del paso las deshace) */
  float zs = u_ver.y, Dt = Dor + (azar(vec3(q, u_bruma.z * 60.0)) - 0.5) * exp2(floor(log2(max(Dor, 0.1))) - 9.6);
  float fina = exp(-abs(Dt - zs) / clamp(fwidth(Dor) * 8.0, 0.016, 0.035));
  float cola = 0.25 * exp(-max(zs - Dor, 0.0) / 0.6);
  C += u_ver.x * (vec3(1.0, 0.98, 0.95) * fina * 1.05 * calma + C * cola * 1.6 + vec3(0.85, 0.92, 1.0) * Eb * exp(-abs(Dor - zs) / 0.12) * 0.6 * calma);

  /* el borde de la lámina se funde a negro (cuando el encuadre la achica, lo que sigue es sala a oscuras) */
  vec2 bo = smoothstep(vec2(0.0), vec2(0.03, 0.035), uvp) * smoothstep(vec2(0.0), vec2(0.008, 0.035), 1.0 - uvp);
  o_color = vec4(C * (bo.x * bo.y), 1.0);
  o_info = vec4(D, Mk, Eb, Mv);
}`;
}

/* Salida: suma el resplandor, viñeta hacia los bordes del escenario, lineal → sRGB con hombro suave, grano con
   tramado (que no toca el negro exacto) y fundido inferior hacia la página. */
const FS_SALIDA = CABEZA + `
uniform sampler2D u_t, u_r;
uniform vec2 u_lienzo;
uniform vec4 u_esc;      // escenario en px de búfer (origen arriba a la izquierda)
uniform vec4 u_par;      // semilla, fundido inferior y superior (fracción del alto), entrada
uniform vec4 u_post;     // fuerza del resplandor, viñeta, grano, —
uniform vec4 u_texto;    // bloque de texto (px de búfer): ahí el resplandor baja
uniform vec4 u_texto2;   // segunda caja de texto (botones y sellos, que pueden ser más anchos que el titular)
out vec4 o;
float azar(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
void main(){
  vec2 q = vec2(gl_FragCoord.x, u_lienzo.y - gl_FragCoord.y);
  vec3 c = max(texelFetch(u_t, ivec2(gl_FragCoord.xy), 0).rgb, 0.0);
  vec2 dq = max(u_texto.xy - q, q - u_texto.zw);
  if (u_post.x > 0.0) c += u_post.x * mix(0.2, 1.0, smoothstep(-0.01, 0.05, max(dq.x, dq.y) / u_lienzo.x)) * texture(u_r, gl_FragCoord.xy / u_lienzo).rgb;
  vec2 e = (q - u_esc.xy) / u_esc.zw;
  c *= 1.0 - u_post.y * smoothstep(0.7, 1.3, length((e - 0.5) * vec2(2.0, 1.7)));
  /* garantía de lectura: detrás del bloque de texto nada supera 0,019 de luz (lineal). Con eso, aunque coincidan
     una línea, una mota y el resplandor, el texto marfil queda a más de 12:1, el secundario a más de 5,5:1 y el
     verbo activo (cereza, que sobre negro puro mide 6,19:1) nunca baja de 4,5:1. */
  vec2 dq2 = max(u_texto2.xy - q, q - u_texto2.zw);
  float tope = mix(0.019, 8.0, smoothstep(0.0, 0.02, min(max(dq.x, dq.y), max(dq2.x, dq2.y)) / u_lienzo.x));
  float mx = max(c.r, max(c.g, c.b));
  if (mx > tope) c *= tope / mx;
  c = mix(c, 0.8 + 0.2 * (1.0 - exp(-(c - 0.8) / 0.2)), step(0.8, c));
  c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  /* grano de película (proporcional a la luz) + tramado triangular: el negro exacto queda en negro */
  float n1 = azar(q + u_par.x), n2 = azar(q * 1.37 + 11.0 - u_par.x);
  float hay = smoothstep(0.0, 1.5 / 255.0, max(c.r, max(c.g, c.b)));
  c *= 1.0 + u_post.z * (n1 - 0.5);
  c += (n1 + n2 - 1.0) / 255.0 * hay;
  /* abajo se funde con la página (transparente); arriba, en vertical, se funde a negro: el héroe sigue siendo sala */
  float a = (1.0 - smoothstep(1.0 - u_par.y, 1.0, e.y)) * u_par.w;
  if (u_par.z > 0.0) c *= smoothstep(0.0, u_par.z, e.y);
  o = vec4(max(c, 0.0) * a, a);
}`;

/* ---------- Sala ---------- */

export function crearSala(motor, datos, formato, base) {
  const gl = motor.gl;
  const cam = crearCamara(datos);
  const vista = new Float32Array(datos.camara.vista);
  /* inversa de una matriz rígida (por columnas) */
  const vInv = new Float32Array(16);
  {
    const v = vista;
    vInv[0] = v[0]; vInv[1] = v[4]; vInv[2] = v[8];
    vInv[4] = v[1]; vInv[5] = v[5]; vInv[6] = v[9];
    vInv[8] = v[2]; vInv[9] = v[6]; vInv[10] = v[10];
    vInv[12] = -(v[0] * v[12] + v[1] * v[13] + v[2] * v[14]);
    vInv[13] = -(v[4] * v[12] + v[5] * v[13] + v[6] * v[14]);
    vInv[14] = -(v[8] * v[12] + v[9] * v[13] + v[10] * v[14]);
    vInv[15] = 1;
  }
  cam.vista = vista; cam.vistaInv = vInv; cam.vistaViva = new Float32Array(vista);
  cam.proyeccion = new Float32Array(datos.camara.proyeccion);

  const zs = IDS.map((id) => zDeCapa(datos, id));
  const sala = {
    formato, datos, cam, zs,
    enc: encuadrar(datos, 0, 0, 1, 1, {}),
    /* parámetros animables: los maneja index.js */
    p: { L: 0, fL: -0.3, fM: -0.4, filo: 0, V: 0, zs: 0, sombra: 1, penumbra: 0.05, q: 1 / datos.foco.distancia, apertura: 1, bruma: 1, entrada: 1, fundido: 0.16, fundidoArriba: 0 },
    /* reluz: hasta 8 luces; por luz x, y, z (mundo), intensidad; color lineal aparte */
    luces: new Float32Array(32), coloresLuz: new Float32Array(24).fill(1), nLuces: 0,
    texto: new Float32Array(4),   // bloque de texto en px CSS del lienzo: x0, y0, x1, y1 (lo pone index.js)
    texto2: new Float32Array(4),  // segunda caja (botones y sellos); en cero si no hay
    brillo: new Float32Array(4),  // por obra (orden de la máscara: cathedra, fortal, athleteiq, coro): la sube el enjambre
    resplandor: null, fuerzaResplandor: 0, vineta: 0.28, grano: 0.03, // los pone post.js
    heroeY: null,                 // borde superior del héroe en px CSS del lienzo, si el escenario no lo ocupa entero (vertical): ahí va negro
    listoDatos: false, listoColor: false, vivo: true,
    texColor: null, texInfo: null, fbSala: null, fbColor: null, ancho: 0, alto: 0,
  };

  const progDatos = motor.programa(FS_DATOS, 'datos de lámina');
  const progPre = motor.programa(FS_PREMULTIPLICA, 'premultiplica');
  const progDes = motor.programa(FS_DESENFOQUE, 'desenfoque');
  const progSal = motor.programa(FS_SALIDA, 'salida');
  /* El programa de la sala es grande (compilarlo lleva más de un segundo): se compila aparte, sin trabar la página.
     Al arrancar se espera con `sala.programaListo()`; al cambiar de nivel se sigue dibujando con el anterior hasta
     que el nuevo esté. `Pprog` = la fila de niveles con la que se compiló el que está en uso. */
  let prog = null, nivelProg = 0, Pprog = motor.P, enCurso = null, nivelEnCurso = 0;
  function programaSala() {
    if (nivelProg !== motor.nivel) {
      if (nivelEnCurso !== motor.nivel) {
        if (enCurso) gl.deleteProgram(enCurso.p);
        enCurso = motor.programaAparte(fuenteSala(motor.P), 'sala (nivel ' + motor.nivel + ')');
        enCurso.P = motor.P; nivelEnCurso = motor.nivel;
      }
      if (enCurso.listo()) {
        if (prog) gl.deleteProgram(prog.p);
        prog = enCurso; Pprog = enCurso.P; nivelProg = nivelEnCurso; enCurso = null; nivelEnCurso = 0;
        gl.useProgram(prog.p);
        for (let i = 0; i < 4; i++) { gl.uniform1i(prog.u['u_c' + i], i); gl.uniform1i(prog.u['u_d' + i], 4 + i); gl.uniform1i(prog.u['u_n' + i], 8 + i); }
      }
    }
    return prog;
  }
  programaSala();
  /* Se cumple cuando el programa ya se puede usar (o falla con el registro del compilador). */
  sala.programaListo = () => new Promise((ok, mal) => {
    const f = () => { try { if (!sala.vivo || motor.perdido || programaSala()) ok(); else setTimeout(f, 16); } catch (e) { mal(e); } };
    f();
  });

  const negro = motor.pixel(0, 0, 0, 0), normalPlana = motor.pixel(128, 128, 255, 255);
  const capas = IDS.map(() => ({ color: negro, datos: null, normal: normalPlana, alto: 1 }));
  const url = (nombre) => new URL(`${formato}-${nombre}`, base);
  const conNormal = datos.datos?.normales || ['fondo', 'medio'];

  function pase(fb, w, h) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
  }
  function ligar(unidad, tex) { gl.activeTexture(gl.TEXTURE0 + unidad); gl.bindTexture(gl.TEXTURE_2D, tex); }

  /* -p.png (+ -n.webp) → textura de datos con contornos precalculados y su cadena de niveles (resplandor del trazo). */
  function armarDatos(i, mapaP, mapaN) {
    const w = mapaP.width, h = mapaP.height;
    const crudo = motor.texturaDeImagen(mapaP, gl.RGBA8, { filtro: gl.NEAREST });
    if (mapaN) capas[i].normal = motor.texturaDeImagen(mapaN, gl.RGBA8);
    const niveles = Math.min(5, Math.floor(Math.log2(Math.max(w, h))) + 1);
    const tex = motor.textura(w, h, gl.RGBA16F, { niveles });
    const fb = motor.destinoEnNivel(tex, 0);
    pase(fb, w, h);
    gl.useProgram(progDatos.p);
    ligar(0, crudo); ligar(1, capas[i].normal);
    gl.uniform1i(progDatos.u.u_p, 0); gl.uniform1i(progDatos.u.u_n, 1);
    gl.uniform3f(progDatos.u.u_cl, datos.camara.cerca, datos.camara.lejos, zs[i]);
    gl.uniform1f(progDatos.u.u_hayN, mapaN ? 1 : 0);
    motor.triangulo();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb); gl.deleteTexture(crudo);
    gl.bindTexture(gl.TEXTURE_2D, tex); gl.generateMipmap(gl.TEXTURE_2D);
    capas[i].datos = tex;
  }

  /* Color → premultiplicado en lineal + pirámide de desenfoque en los niveles de la misma textura. */
  function armarColor(i, mapa) {
    const w = mapa.width, h = mapa.height;
    const crudo = motor.texturaDeImagen(mapa, gl.SRGB8_ALPHA8, { filtro: gl.NEAREST });
    const N = Math.min(motor.P.piramide, Math.floor(Math.log2(Math.min(w, h))));
    const tex = motor.textura(w, h, gl.SRGB8_ALPHA8, { niveles: N + 1 });
    let fb = motor.destinoEnNivel(tex, 0);
    pase(fb, w, h);
    gl.useProgram(progPre.p); ligar(0, crudo); gl.uniform1i(progPre.u.u_t, 0);
    motor.triangulo();
    gl.deleteFramebuffer(fb); gl.deleteTexture(crudo);
    gl.useProgram(progDes.p); gl.uniform1i(progDes.u.u_t, 0);
    for (let n = 1; n <= N; n++) {
      const wa = Math.max(1, w >> (n - 1)), ha = Math.max(1, h >> (n - 1)), wn = Math.max(1, w >> n), hn = Math.max(1, h >> n);
      const tmp = motor.destino(wn, ha, [gl.SRGB8_ALPHA8]);
      pase(tmp.fb, wn, ha);
      ligar(0, tex);
      gl.uniform2f(progDes.u.u_dir, 1 / wa, 0); gl.uniform2f(progDes.u.u_tam, wn, ha); gl.uniform1f(progDes.u.u_lod, n - 1);
      motor.triangulo();
      fb = motor.destinoEnNivel(tex, n);
      pase(fb, wn, hn);
      ligar(0, tmp.tex[0]);
      gl.uniform2f(progDes.u.u_dir, 0, 1 / ha); gl.uniform2f(progDes.u.u_tam, wn, hn); gl.uniform1f(progDes.u.u_lod, 0);
      motor.triangulo();
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fb); tmp.liberar();
    }
    capas[i].color = tex; capas[i].alto = h;
  }

  const cuadroLibre = () => new Promise((ok) => requestAnimationFrame(ok));

  /* Datos primero (livianos): con esto ya corre el acto «defino». */
  sala.cargarDatos = async () => {
    const ps = IDS.map((id) => motor.cargarImagen(url(id + '-p.png')));
    const ns = IDS.map((id) => (conNormal.includes(id) ? motor.cargarImagen(url(id + '-n.webp')).catch(() => null) : null));
    const mp = await Promise.all(ps), mn = await Promise.all(ns);
    if (!sala.vivo) return;
    for (let i = 0; i < 4; i++) { armarDatos(i, mp[i], mn[i]); mp[i].close(); mn[i]?.close(); }
    sala.listoDatos = true;
  };
  /* Colores: se piden ya, se suben de a una lámina por cuadro para no trabar el acto en curso. */
  sala.pedirColor = () => IDS.map((id) => motor.cargarImagen(url(id + '.webp'), motor.P.lado));
  sala.cargarColor = async (pedidos) => {
    const mapas = await Promise.all(pedidos);
    for (let i = 0; i < 4; i++) {
      if (!sala.vivo || motor.perdido) return;
      armarColor(i, mapas[i]); mapas[i].close();
      if (!motor.quieto) await cuadroLibre();
    }
    sala.listoColor = true;
  };

  /* Destinos: color HDR lineal + info (R = distancia a la cámara viva en m, G = máscara, B = línea, A = materia). */
  let dest = null;
  function destinos() {
    if (dest && dest.ancho === motor.ancho && dest.alto === motor.alto) return;
    if (dest) { dest.liberar(); gl.deleteFramebuffer(sala.fbColor); }
    dest = motor.destino(motor.ancho, motor.alto, [gl.RGBA16F, gl.RGBA16F]);
    sala.fbSala = dest.fb; sala.texColor = dest.tex[0]; sala.texInfo = dest.tex[1];
    sala.fbColor = motor.destinoEnNivel(dest.tex[0], 0);   // sólo color: para sumar encima leyendo texInfo
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    sala.ancho = dest.ancho; sala.alto = dest.alto;
  }

  /* Escenario en px CSS del lienzo (el rectángulo del héroe). */
  sala.encuadrar = (Sx, Sy, Sw, Sh, anchoMax) => encuadrar(datos, Sx, Sy, Sw, Sh, sala.enc, anchoMax);

  /* Recorte al escenario ∩ lienzo. Devuelve false si no queda nada a la vista. */
  sala.recortar = () => {
    const E = motor.escala, e = sala.enc;
    const x0 = Math.max(0, Math.floor(e.Sx * E)), y0 = Math.max(0, Math.floor(e.Sy * E));
    const x1 = Math.min(motor.ancho, Math.ceil((e.Sx + e.Sw) * E)), y1 = Math.min(motor.alto, Math.ceil((e.Sy + e.Sh) * E));
    if (x1 <= x0 || y1 <= y0) return false;
    gl.enable(gl.SCISSOR_TEST); gl.scissor(x0, motor.alto - y1, x1 - x0, y1 - y0);
    return true;
  };
  sala.aLaVista = () => { const e = sala.enc; return e.Sy + e.Sh > 0 && e.Sy < motor.altoCss && e.Sw > 0; };

  /* Cámara viva: vista' = T(−t)·vista (en ejes de vista). Llamar después de tocar cam.tx/ty/tz. */
  const v4 = new Float32Array(4), lucesVista = new Float32Array(32), uZ = new Float32Array(zs), uVis = new Float32Array(4), uLod = new Float32Array(4), uRazon = new Float32Array(4);
  sala.moverCamara = () => {
    const v = cam.vistaViva;
    v[12] = vista[12] - cam.tx; v[13] = vista[13] - cam.ty; v[14] = vista[14] + cam.tz;
  };
  function aVista(x, y, z, out, o) {
    const v = cam.vistaViva;
    out[o] = v[0] * x + v[4] * y + v[8] * z + v[12];
    out[o + 1] = v[1] * x + v[5] * y + v[9] * z + v[13];
    out[o + 2] = v[2] * x + v[6] * y + v[10] * z + v[14];
  }
  /* Punto de mundo → px CSS del lienzo y distancia a la cámara viva: out = [x, y, d]. */
  sala.aPantalla = (x, y, z, out) => {
    aVista(x, y, z, v4, 0);
    const d = -v4[2], e = sala.enc;
    out[0] = e.x0 + ((v4[0] / (d * cam.Tx) + 1) / 2) * e.W;
    out[1] = e.y0 + ((1 - v4[1] / (d * cam.Ty)) / 2) * e.H;
    out[2] = d;
    return out;
  };
  sala.rectObra = (obra, out) => rectObra(sala.enc, cam, obra.pantalla, zDeCapa(datos, obra.capa), out);

  /* Dibuja la sala en sus destinos. Devuelve false si el escenario no está a la vista (queda todo en 0). */
  sala.dibujar = () => {
    destinos();
    const pr = programaSala();
    if (!pr) return false;
    const u = pr.u, E = motor.escala, e = sala.enc, p = sala.p;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dest.fb);
    gl.drawBuffers(dest.bufs);
    gl.viewport(0, 0, dest.ancho, dest.alto);
    gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (!sala.listoDatos || !sala.recortar()) return false;
    sala.moverCamara();
    gl.useProgram(pr.p);
    for (let i = 0; i < 4; i++) { ligar(i, capas[i].color); ligar(4 + i, capas[i].datos); ligar(8 + i, capas[i].normal); }
    for (let i = 0; i < 4; i++) {
      const zz = zs[i] - cam.tz;
      const x = Math.min(1, Math.max(0, (zz - 0.12) / 0.33));
      uVis[i] = i === 0 ? 1 : x * x * (3 - 2 * x);
      const razon = capas[i].alto / (e.H * E * (i === 0 ? 1 : zs[i] / Math.max(zz, 0.05)));
      uRazon[i] = razon; uLod[i] = Math.max(0, Math.log2(razon) - 1);
    }
    gl.uniform2f(u.u_lienzo, dest.ancho, dest.alto);
    gl.uniform4f(u.u_enc, e.x0 * E, e.y0 * E, e.W * E, e.H * E);
    gl.uniform3f(u.u_t, cam.tx, cam.ty, cam.tz);
    gl.uniform2f(u.u_T, cam.Tx, cam.Ty);
    gl.uniform4fv(u.u_z, uZ); gl.uniform4fv(u.u_vis, uVis); gl.uniform4fv(u.u_lod0, uLod); gl.uniform4fv(u.u_razon, uRazon);
    gl.uniform3f(u.u_foco, p.q, KF * capas[2].alto * p.apertura, sala.listoColor ? 1 : 0);
    gl.uniform4f(u.u_acto, p.L, p.fL, p.fM, p.filo);
    gl.uniform4f(u.u_ver, p.V, p.zs, p.sombra, p.penumbra);
    gl.uniform2f(u.u_dn, D_MIN, 1 / Math.log(zs[0] / D_MIN));
    gl.uniformMatrix4fv(u.u_vInv, false, vInv);
    gl.uniform1f(u.u_piso, datos.piso?.y || 0);
    const po = datos.portal;
    aVista(po.pos[0], po.pos[1], po.pos[2], v4, 0);
    gl.uniform4f(u.u_portal, v4[0], v4[1], v4[2], 1.8);
    gl.uniform3f(u.u_portalColor, po.color[0], po.color[1], po.color[2]);
    gl.uniform4f(u.u_texto, sala.texto[0] * E, sala.texto[1] * E, sala.texto[2] * E, sala.texto[3] * E);
    gl.uniform2f(u.u_eje, vista[0], vista[8]);
    gl.uniform4fv(u.u_brillo, sala.brillo);
    gl.uniform3f(u.u_bruma, 0.022 * p.bruma, 0.07 * p.bruma * (0.25 + 0.75 * Math.min(1, p.sombra)), motor.t);
    if (Pprog.luces > 0) {
      const n = Math.min(sala.nLuces, Pprog.luces);
      for (let i = 0; i < n; i++) { aVista(sala.luces[i * 4], sala.luces[i * 4 + 1], sala.luces[i * 4 + 2], lucesVista, i * 4); lucesVista[i * 4 + 3] = sala.luces[i * 4 + 3]; }
      gl.uniform4fv(u.u_luz, lucesVista); gl.uniform3fv(u.u_luzC, sala.coloresLuz); gl.uniform1i(u.u_nLuces, n);
    }
    motor.triangulo();
    gl.disable(gl.SCISSOR_TEST);
    return true;
  };

  /* Salida al lienzo. `tex` = color lineal a mostrar (por defecto el de la sala; el post pasa el suyo). */
  sala.salida = (tex = sala.texColor) => {
    const E = motor.escala, e = sala.enc, p = sala.p;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, motor.ancho, motor.alto);
    gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    if (!sala.listoDatos) return;
    /* vertical: entre el borde de arriba del héroe y el escenario va negro (el texto del héroe es claro en los dos temas) */
    if (sala.heroeY != null && sala.heroeY < e.Sy - 0.5) {
      const ya = Math.max(0, Math.floor(sala.heroeY * E)), yb = Math.min(motor.alto, Math.ceil(e.Sy * E));
      if (yb > ya) {
        gl.enable(gl.SCISSOR_TEST); gl.scissor(Math.floor(e.Sx * E), motor.alto - yb, Math.ceil(e.Sw * E), yb - ya);
        gl.clearColor(0, 0, 0, p.entrada); gl.clear(gl.COLOR_BUFFER_BIT); gl.clearColor(0, 0, 0, 0);
        gl.disable(gl.SCISSOR_TEST);
      }
    }
    if (!sala.recortar()) return;
    gl.useProgram(progSal.p);
    const res = sala.resplandor && sala.fuerzaResplandor > 0;
    ligar(1, res ? sala.resplandor : negro); gl.uniform1i(progSal.u.u_r, 1);
    ligar(0, tex); gl.uniform1i(progSal.u.u_t, 0);
    gl.uniform4f(progSal.u.u_post, res ? sala.fuerzaResplandor : 0, sala.vineta, sala.grano, 0);
    gl.uniform4f(progSal.u.u_texto, sala.texto[0] * E, sala.texto[1] * E, sala.texto[2] * E, sala.texto[3] * E);
    gl.uniform4f(progSal.u.u_texto2, sala.texto2[0] * E, sala.texto2[1] * E, sala.texto2[2] * E, sala.texto2[3] * E);
    gl.uniform2f(progSal.u.u_lienzo, motor.ancho, motor.alto);
    gl.uniform4f(progSal.u.u_esc, e.Sx * E, e.Sy * E, e.Sw * E, e.Sh * E);
    gl.uniform4f(progSal.u.u_par, (motor.t * 61.7) % 97, p.fundido, p.fundidoArriba, p.entrada);
    motor.triangulo();
    gl.disable(gl.SCISSOR_TEST);
  };

  /* Lee un píxel de info en px CSS del lienzo: out = [distancia m, máscara 0..1, línea, materia]. Caro: ≤ 10 por segundo. */
  const lectura = new Float32Array(4);
  sala.leer = (x, y, out = lectura) => {
    if (!dest) return out;
    const E = motor.escala;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dest.fb);
    gl.readBuffer(gl.COLOR_ATTACHMENT1);
    gl.readPixels(Math.round(x * E), dest.alto - 1 - Math.round(y * E), 1, 1, gl.RGBA, gl.FLOAT, out);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out;
  };

  sala.liberar = () => {
    sala.vivo = false;
    if (gl.isContextLost()) return;
    for (const c of capas) { if (c.color !== negro) gl.deleteTexture(c.color); if (c.datos) gl.deleteTexture(c.datos); if (c.normal !== normalPlana) gl.deleteTexture(c.normal); }
    if (dest) { dest.liberar(); gl.deleteFramebuffer(sala.fbColor); }
    for (const pr of [progDatos, progPre, progDes, progSal, prog, enCurso]) if (pr) gl.deleteProgram(pr.p);
  };

  return sala;
}
