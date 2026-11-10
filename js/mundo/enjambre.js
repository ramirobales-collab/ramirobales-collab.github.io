/* enjambre.js — el enjambre de luz de «la sala negra»: miles de motas simuladas en GPU (transform feedback)
   y ocho guías simuladas en JS que además iluminan la escena (reluz de sala.js).
   Motas de luz BLANCA con variación de temperatura (3500–7500 K): nunca de colores.
   Reglas (motor.md §5): flujo con ruido rotacional, corriente que sale del portal, remolino en cada obra,
   formaciones por acto (carriles / remolinos / lámina), puntero que dirige, eventos sin período, renacer en el portal.
   Dibujo (motor.md §4.2): disco fotográfico (grande y tenue fuera de foco, destello fino en foco, energía conservada),
   oclusión contra la profundidad compuesta y reflejo en el piso. Sin asignaciones por cuadro. */

const N_MAX = 12000, GUIAS = 8;
const ORDEN = ['cathedra', 'fortal', 'athleteiq', 'coro'];   // el orden de la máscara (32, 64, 96, 128)

const RUIDO = `
float azar(float n){ n = fract(n * 0.1031); n *= n + 33.33; n *= n + n; return fract(n); }
vec3 azar3(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float ruido1(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(azar(i), azar(i + 1.0), f); }
/* oficio de cada mota (sale de su semilla): 0 corriente del portal a un producto, 1 carril sobre una junta del piso,
   2 ronda por los cantos de una pantalla, 3 polvo en el aire (pocas, tenues) */
/* (las rondas eran el 9 %: pegadas al canto formaban una escarcha; ahora son pocas, a 4–9 cm del contorno) */
float rolDe(float s){ float r = azar(s * 5.31 + 0.7); return r < 0.42 ? 0.0 : (r < 0.64 ? 1.0 : (r < 0.675 ? 2.0 : 3.0)); }
float vidaDe(float s){ float r = rolDe(s), h = azar(s * 37.3 + 4.1); return r < 0.5 ? 22.0 + 10.0 * h : (r < 1.5 ? 70.0 : (r < 2.5 ? 12.0 + 14.0 * h : 40.0 + 55.0 * h)); }
int obraDe(float s){ float h = azar(s * 3.77 + 1.1); return h < 0.34 ? 0 : (h < 0.58 ? 1 : (h < 0.8 ? 2 : 3)); }
`;

/* ---------- Simulación ---------- */
const VS_PASO = `#version 300 es
precision highp float;
layout(location = 0) in vec4 a_p;   // posición (mundo, m), semilla
layout(location = 1) in vec4 a_v;   // velocidad (m/s), edad (s)
out vec4 o_p;
out vec4 o_v;
uniform float u_dt, u_t, u_flujo;
uniform vec3 u_peso;        // carriles (defino), oficios (diseño), —
uniform vec4 u_obra[4];     // centro y semieje horizontal
uniform vec4 u_obraB[4];    // semieje vertical, peso (1 = normal; más = ronda), sentido de giro, —
uniform vec4 u_panC[4];     // pantalla de cada obra: centro (w = 1 si existe)
uniform vec4 u_panU[4];     // medio ancho (vector de mundo)
uniform vec4 u_panV[4];     // medio alto (vector de mundo)
uniform vec3 u_ejeR, u_ejeF, u_cam, u_mira;   // derecha y fondo de la sala (horizontales), cámara de la lámina, dirección de vista
uniform vec4 u_portal;      // centro, alto
uniform vec4 u_rayo;        // dirección del rayo del puntero, peso
uniform vec4 u_lamina;      // lámina de verificación: profundidad (m) y peso; frente de materia: profundidad y peso
uniform vec4 u_corriente;   // corriente que cruza: fuerza a lo ancho, hacia arriba, posición a lo largo de la sala, ancho de la banda
${RUIDO}
vec3 ruido3(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(azar3(i), azar3(i + vec3(1, 0, 0)), f.x), mix(azar3(i + vec3(0, 1, 0)), azar3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(azar3(i + vec3(0, 0, 1)), azar3(i + vec3(1, 0, 1)), f.x), mix(azar3(i + vec3(0, 1, 1)), azar3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
/* rotacional de un potencial de ruido: divergencia cero, las motas giran en vórtices sin amontonarse */
vec3 rot(vec3 p){
  const float e = 0.11;
  vec3 dx = ruido3(p + vec3(e, 0, 0)) - ruido3(p - vec3(e, 0, 0));
  vec3 dy = ruido3(p + vec3(0, e, 0)) - ruido3(p - vec3(0, e, 0));
  vec3 dz = ruido3(p + vec3(0, 0, e)) - ruido3(p - vec3(0, 0, e));
  return vec3(dy.z - dz.y, dz.x - dx.z, dx.y - dy.x) / (2.0 * e);
}
/* Canto de la pantalla k: el punto más cercano del rectángulo (redondeado) que la rodea a «off» metros, apenas delante
   del vidrio, y la tangente para recorrerlo. */
void canto(int k, vec3 x, float off, float sentido, out vec3 punto, out vec3 tang){
  vec3 C = u_panC[k].xyz, U = u_panU[k].xyz, V = u_panV[k].xyz;
  float lu = length(U), lv = length(V);
  vec3 eu = U / lu, ev = V / lv, en = normalize(cross(eu, ev));
  vec3 r = x - C;
  vec2 p = vec2(dot(r, eu), dot(r, ev)), sg = vec2(p.x < 0.0 ? -1.0 : 1.0, p.y < 0.0 ? -1.0 : 1.0);
  vec2 h = vec2(lu, lv) + off;
  const float rad = 0.03;
  vec2 q = abs(p) - h + rad, cerca, g;
  if (q.x > 0.0 && q.y > 0.0) { g = normalize(q); cerca = (h - rad + g * rad) * sg; g *= sg; }
  else if (q.x > q.y) { g = vec2(sg.x, 0.0); cerca = vec2(sg.x * h.x, clamp(p.y, -h.y + rad, h.y - rad)); }
  else { g = vec2(0.0, sg.y); cerca = vec2(clamp(p.x, -h.x + rad, h.x - rad), sg.y * h.y); }
  vec2 t2 = vec2(-g.y, g.x) * sentido;
  punto = C + eu * cerca.x + ev * cerca.y + en * 0.012;
  tang = eu * t2.x + ev * t2.y;
}
void main(){
  vec3 x = a_p.xyz, v = a_v.xyz;
  float s = a_p.w, edad = a_v.w;
  float h1 = azar(s * 91.7), h2 = azar(s * 37.3 + 4.1), h3 = azar(s * 53.9 + 9.2), h4 = azar(s * 17.1 + 2.7);
  float rol = rolDe(s);
  int k = obraDe(s);
  if (u_panC[k].w < 0.5) k = 0;
  vec3 rel = x - u_cam;
  float d = dot(rel, u_mira);                       // profundidad de vista (cámara de la lámina)
  float cu = dot(rel, u_ejeR), cv = dot(rel, u_ejeF);   // coordenadas de sala
  float sentido = h4 < 0.5 ? -1.0 : 1.0;
  float resp = 4.5;                                  // qué tan rápido la mota toma la velocidad que pide su oficio
  vec3 obj = vec3(0.0), a = vec3(0.0);
  float ronda = u_obraB[k].y;
  /* flujo rotacional de dos octavas, con deriva lenta (todas lo sienten; el polvo, entero) */
  vec3 flujo = rot(x * 0.55 + vec3(0.0, u_t * 0.045, u_t * 0.03)) * (0.06 * u_flujo) + rot(x * 1.7 + vec3(u_t * 0.07, 11.0, -u_t * 0.05)) * 0.02;

  if (rol < 0.5) {
    /* corriente: del portal al producto, baja sobre el piso y sube al final; al llegar, ronda su canto */
    vec3 P0 = u_portal.xyz - u_ejeF * 0.3, P2 = u_panC[k].xyz - u_panV[k].xyz;
    float cv0 = dot(P0 - u_cam, u_ejeF), cvk = dot(P2 - u_cam, u_ejeF) + 0.15;
    float cu0 = dot(P0 - u_cam, u_ejeR), cuk = dot(P2 - u_cam, u_ejeR);
    float sp = clamp((cv0 - cv) / max(cv0 - cvk, 0.5), 0.0, 1.0);
    if (sp > 0.96) {
      /* al llegar hace una sola pasada de inspección por fuera del contorno (4–9 cm) y se apaga en ≈ 3 s: un trazo
         corto que recorre el canto, no una cáscara de motas pegada a la silueta */
      vec3 pt, tg; canto(k, x, 0.04 + 0.05 * h3, sentido, pt, tg);
      obj = tg * (0.12 + 0.08 * h2) * (0.7 + 0.5 * ronda) + (pt - x) * 2.2;
      edad = max(edad, vidaDe(s) - 3.2);
    } else {
      float s2 = min(sp + 0.07, 1.0), e2 = s2 * s2 * (3.0 - 2.0 * s2);
      float serp = (ruido1(s2 * 3.2 + float(k) * 7.3) - 0.5) * 0.9 * s2 * (1.0 - s2);   // la corriente serpentea (forma fija en el espacio)
      float cuT = mix(cu0, cuk, e2) + serp + (h1 - 0.5) * 0.14;
      float yT = mix(0.035 + 0.05 * h2, P2.y + 0.02, smoothstep(0.62, 1.0, s2)) + h3 * 0.03;
      vec3 T = u_cam + u_ejeR * cuT + u_ejeF * mix(cv0, cvk, s2);
      T.y = yT;
      float vel = mix(0.16, 0.55, smoothstep(2.0, 8.0, cv)) * (0.8 + 0.4 * h3);
      obj = normalize(T - x) * vel + flujo * 0.25;
    }
  } else if (rol < 1.5) {
    /* carril sobre una junta del piso (siete juntas centrales): avanza hacia la cámara a ras de la piedra */
    float j = floor(h1 * 7.0) - 3.0, ul = 0.225 + 0.45 * j;
    a += u_ejeR * ((ul - cu) * 9.0) + vec3(0.0, (0.012 + 0.012 * h3 - x.y) * 9.0, 0.0);
    obj = -u_ejeF * (0.11 + 0.1 * h3) * mix(0.6, 1.4, smoothstep(2.0, 8.0, cv)) + flujo * 0.1;
  } else if (rol < 2.5) {
    /* ronda por los cantos de una pantalla */
    vec3 pt, tg; canto(k, x, 0.04 + 0.05 * h3, sentido, pt, tg);
    obj = tg * (0.07 + 0.09 * h2) * (0.7 + 0.5 * ronda) + (pt - x) * 2.0 + flujo * 0.15;
  } else {
    /* polvo: deriva lenta en el haz y en la sala, hacia un destino propio a media distancia (no se viene encima) */
    vec3 destino = u_cam + u_ejeF * (1.8 + 2.5 * h2) + u_ejeR * ((h1 - 0.5) * 3.4 + 0.3);
    destino.y = 0.05 + h2 * h2 * 1.4;
    obj = normalize(destino - x) * mix(0.02, 0.14, smoothstep(1.0, 9.0, d)) * (0.55 + 0.9 * h3) + flujo;
    resp = 2.2;
    /* si una obra está «en ronda» (evento o foco), el polvo que pasa cerca se suma a su canto */
    for (int i = 0; i < 4; i++) {
      if (u_obraB[i].y > 1.2 && u_panC[i].w > 0.5) {
        vec3 r = x - u_obra[i].xyz;
        float w = (u_obraB[i].y - 1.0) * (1.0 - smoothstep(0.4, 1.3, length(r)));
        if (w > 0.01) { vec3 pt, tg; canto(i, x, 0.05 + 0.08 * h3, sentido, pt, tg); obj = mix(obj, tg * 0.14 + (pt - x) * 2.0, clamp(w, 0.0, 0.9)); resp = 3.5; }
      }
    }
  }
  obj *= mix(0.6, 1.0, u_peso.y);

  /* defino → carriles: todas sobre las juntas del piso, a dos alturas bajas, velocidad constante hacia la cámara */
  float wl = u_peso.x;
  if (wl > 0.001) {
    float ul = floor((cu - 0.225) / 0.45 + 0.5) * 0.45 + 0.225;
    float yl = h4 < 0.6 ? 0.03 : 0.15;
    a = mix(a, u_ejeR * ((ul - cu) * 10.0) + vec3(0.0, (yl - x.y) * 8.0, 0.0), wl);
    obj = mix(obj, -u_ejeF * (0.34 + 0.2 * h3), wl * 0.94);
  }

  /* verifico → la lámina: las motas que el plano de luz alcanza se ordenan sobre él */
  float wz = u_lamina.y * exp(-pow((d - u_lamina.x) / 0.6, 2.0));
  a += u_mira * ((u_lamina.x - d) * 46.0 * wz);
  /* diseño → más densidad en el frente de materia */
  a += u_mira * ((u_lamina.z - d) * 5.0 * u_lamina.w * exp(-pow((d - u_lamina.z) / 0.8, 2.0)));

  /* puntero: atracción al punto más cercano de su rayo, con algo de órbita (se «dirige» el enjambre) */
  if (u_rayo.w > 0.001) {
    vec3 e = u_cam + u_rayo.xyz * max(dot(rel, u_rayo.xyz), 0.4) - x;
    float le = length(e) + 1e-4;
    float w = u_rayo.w * (1.0 - smoothstep(0.1, 0.9, le)) * (rol > 2.5 ? 1.0 : 0.55);
    a += e * (4.5 * w);
    obj = mix(obj, cross(u_rayo.xyz, e / le) * 0.3, w * 0.6);
  }

  /* evento: una corriente que cruza la sala */
  float evento = clamp(abs(u_corriente.x) / 1.5, 0.0, 1.0);
  a += (u_ejeR * u_corriente.x + vec3(0.0, u_corriente.y, 0.0)) * exp(-pow((cv - u_corriente.z) / u_corriente.w, 2.0)) * (rol > 0.5 && rol < 2.5 ? 0.3 : 1.0);

  /* caja blanda de la sala (el cono de vista con margen, el piso y un techo que sube con la distancia) */
  float ex = abs(cu) - (0.44 * max(cv, 0.0) + 0.55);
  if (ex > 0.0) a -= u_ejeR * (sign(cu) * ex * 3.0);
  if (x.y < 0.008) a.y += (0.008 - x.y) * 80.0;
  float techo = 0.5 + 0.3 * max(cv, 0.0);
  if (x.y > techo) a.y -= (x.y - techo) * 3.0;
  if (cv > 11.7) a -= u_ejeF * ((cv - 11.7) * 4.0);

  v += (obj - v) * (1.0 - exp(-u_dt * resp)) + a * u_dt;
  v -= u_mira * (dot(v, u_mira) * (1.0 - exp(-u_dt * 13.0)) * wz);
  /* calma: nada cruza la pantalla a más de un tercio de su ancho por segundo (salvo los eventos y el plano) */
  float vmax = (0.1 + 0.26 * max(d, 0.3)) * (1.0 + 2.0 * evento + 2.0 * wz + 1.5 * wl);
  float vel = length(v);
  if (vel > vmax) v *= vmax / vel;
  x += v * u_dt;
  edad += u_dt;

  /* al salir o morir, renace: la corriente y el polvo en el portal, el carril al fondo de su junta, la ronda en su canto */
  float vida = vidaDe(s);
  if (edad > vida || d < (rol > 2.5 && h2 < 0.97 ? 0.6 : 0.3) || abs(cu) > 0.44 * max(cv, 0.0) + 1.7 || x.y > 5.0 || cv > 12.8) {
    float kk = fract(s * 7.31 + u_t * 0.37);
    float a1 = azar(kk * 91.0 + s), a2 = azar(kk * 47.0 + 3.0 + s), a3 = azar(kk * 29.0 + 7.0 + s);
    if (wl > 0.5 || rol > 2.5 || rol < 0.5) {
      x = u_portal.xyz + u_ejeR * ((a1 - 0.5) * (0.3 + 4.4 * wl)) - u_ejeF * (0.12 + a3 * 0.5);
      x.y = mix(rol < 0.5 ? mix(0.04, 0.3, a2) : mix(0.05, u_portal.w * 0.94, a2), 0.03 + 0.2 * a2, wl);
      v = -u_ejeF * 0.2;
    } else if (rol < 1.5) {
      float j = floor(h1 * 7.0) - 3.0;
      x = u_cam + u_ejeF * (8.0 + 3.0 * a3) + u_ejeR * (0.225 + 0.45 * j); x.y = 0.015;
      v = -u_ejeF * 0.12;
    } else {
      float ang = a1 * 6.2832;
      vec3 C = u_panC[k].xyz, U = u_panU[k].xyz, V = u_panV[k].xyz;
      vec2 dir = vec2(cos(ang), sin(ang)); dir /= max(abs(dir.x), abs(dir.y));
      x = C + U * dir.x * 1.05 + V * dir.y * 1.05;
      v = vec3(0.0);
    }
    edad = 0.0;
  }
  o_p = vec4(x, s);
  o_v = vec4(v, edad);
}`;
const FS_PASO = `#version 300 es
precision mediump float;
out vec4 o;
void main(){ o = vec4(0.0); }`;

/* ---------- Dibujo ---------- */
const VS_MOTA = `#version 300 es
precision highp float;
layout(location = 0) in vec4 a_p;
layout(location = 1) in vec4 a_v;
uniform mat4 u_vista;       // vista viva
uniform vec2 u_T, u_lienzo;
uniform vec4 u_enc;         // x0, y0, ancho, alto de la lámina en px de búfer (origen arriba a la izquierda)
uniform vec4 u_foco;        // 1/df, radio de confusión en px por dioptría, radio de una mota a 1 m (px), radio máximo
uniform vec4 u_luz;         // brillo, tiempo, modo (0 motas, 1 reflejo, 2 guías), piso
uniform vec4 u_lamina;      // profundidad de la lámina (cámara viva), peso, —, —
uniform vec4 u_portal;      // xyz en vista viva, —
uniform vec4 u_texto;       // bloque de texto (px de búfer): ahí el enjambre se calma
uniform vec4 u_obra[4];     // centro y radio de cada obra: sus pantallas iluminan las motas que las rondan
uniform vec4 u_pant[4];     // rectángulo de cada pantalla en px de búfer (x0, y0, x1, y1): delante de ellas el enjambre se aparta
uniform vec4 u_pantD;       // distancia de cada pantalla a la cámara viva (m)
out vec4 v_c;               // color · intensidad, profundidad
out vec4 v_g;               // radio (px), medio largo de la estela (px), dirección
out float v_h;              // altura sobre el piso (m), para el reflejo
${RUIDO}
/* k en 0..1 ↔ 3500..7500 K: color de un cuerpo negro, en lineal y normalizado al canal mayor */
vec3 temperatura(float k){
  const vec3 a = vec3(1.0, 0.62, 0.34), b = vec3(1.0, 0.84, 0.745), c = vec3(1.0, 0.965, 0.97), e = vec3(0.83, 0.855, 1.0);
  return k < 0.5 ? mix(a, b, k * 2.0) : (k < 0.75 ? mix(b, c, (k - 0.5) * 4.0) : mix(c, e, (k - 0.75) * 4.0));
}
void main(){
  vec3 X = a_p.xyz;
  float s = a_p.w, edad = a_v.w, modo = u_luz.z;
  v_h = max(X.y - u_luz.w, 0.0);
  vec3 V = a_v.xyz;
  if (modo > 0.5 && modo < 1.5) { X.y = 2.0 * u_luz.w - X.y; V.y = -V.y; }
  vec4 Xv = u_vista * vec4(X, 1.0);
  float d = -Xv.z;
  float h1 = azar(s * 23.7 + 1.3), h2 = azar(s * 37.3 + 4.1), h3 = azar(s * 71.9 + 0.4);
  float vida = vidaDe(s), rol = rolDe(s);
  float guia = step(1.5, modo);
  float vivo = mix(smoothstep(0.0, 1.6, edad) * (1.0 - smoothstep(vida - 3.0, vida, edad)), 1.0, guia) * smoothstep(0.35, 1.1, d);
  if (d < 0.25 || vivo <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 1.0; v_c = vec4(0.0); v_g = vec4(1.0, 0.0, 1.0, 0.0); return; }
  vec2 pp = Xv.xy / (d * u_T);
  vec2 px = u_enc.xy + vec2(pp.x * 0.5 + 0.5, 0.5 - pp.y * 0.5) * u_enc.zw;
  gl_Position = vec4(px.x / u_lienzo.x * 2.0 - 1.0, 1.0 - px.y / u_lienzo.y * 2.0, 0.0, 1.0);

  /* óptica: radio propio + círculo de confusión; la energía se conserva (∝ 1/r²) */
  float r0 = u_foco.z / d * (1.0 + 1.3 * guia) * (rol > 1.5 && rol < 2.5 ? 0.72 : 1.0);   // las rondas, más finas
  float coc = u_foco.y * abs(u_foco.x - 1.0 / d);
  float r = min(r0 + coc, u_foco.w);
  if (modo > 0.5 && modo < 1.5) r = min(r * 1.5 + v_h * u_foco.z * 0.9 / d * 40.0, u_foco.w * 1.4);   // el piso no es un espejo: el reflejo es más ancho
  float rd = max(r, 0.85);
  /* estela: el obturador abierto 1/50 s */
  vec3 Vv = mat3(u_vista) * V;
  vec2 vp = vec2(Vv.x, -Vv.y) / (d * u_T) * 0.5 * u_enc.zw;
  float largo = clamp(length(vp) * 0.02 - 1.2, 0.0, 9.0);   // lenta = redonda (sin guiones): la estela aparece recién con velocidad
  vec2 dir = largo > 0.01 ? normalize(vp) : vec2(1.0, 0.0);
  gl_PointSize = 2.0 * (rd + largo * 0.5) + 2.0;

  /* luz: más flujo cerca (∝ 1/d^1,15), más en el haz del portal, titila con ruido (sin período) */
  float rref = u_foco.z / 2.3;
  float E = rref * rref * pow(2.3 / max(d, 0.45), 0.9);
  vec3 ap = Xv.xyz - u_portal.xyz; ap.y *= 0.25;
  float haz = 1.0 + 2.2 / (1.0 + dot(ap.xy, ap.xy) * 1.2) * smoothstep(1.5, 7.0, d);
  float titila = 0.5 + 1.1 * pow(ruido1(u_luz.y * mix(0.25, 2.1, h1) + s * 61.0), 2.0);
  float lam = 1.0 + 3.5 * u_lamina.y * exp(-abs(d - u_lamina.x) / 0.06);
  for (int i = 0; i < 4; i++) { vec3 ro = (a_p.xyz - u_obra[i].xyz) / (u_obra[i].w * 1.7); haz += 1.5 * clamp(u_obra[i].w * 3.0, 0.3, 1.0) * exp(-dot(ro, ro)); }
  /* detrás del bloque de texto el enjambre baja a un octavo y con tope (ninguna mota aclara el fondo del texto
     por encima de lo que pide un contraste de 7:1): acompaña, no compite con la lectura */
  vec2 dq = max(u_texto.xy - px, px - u_texto.zw);
  float calma = mix(0.12, 1.0, smoothstep(-0.01, 0.06, max(dq.x, dq.y) / u_lienzo.x));
  /* delante de una pantalla, casi nada: la interfaz de cada captura se lee (las que rondan el canto quedan afuera) */
  float tapa = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 R = u_pant[i];
    if (R.z <= R.x || d > u_pantD[i] - 0.015) continue;
    vec2 e = max(R.xy - px, px - R.zw);
    tapa = max(tapa, 1.0 - smoothstep(-10.0, 2.0, max(e.x, e.y)));
  }
  float oficio = rol < 0.5 ? 1.0 : (rol < 1.5 ? 0.6 : (rol < 2.5 ? 0.5 : (h2 > 0.97 ? 0.9 : 0.3)));
  float I = u_luz.x * E * haz * titila * lam * vivo * calma * oficio * mix(1.0, 0.1, tapa * (1.0 - guia)) * (0.12 + 1.3 * h3 * h3 * h3) / (rd * rd + 0.64 * rd * largo);
  float g = h1 * 2.0 - 1.0;
  vec3 col = temperatura(clamp(0.6 + 0.42 * g * g * g + 0.1 * g, 0.0, 1.0));   // casi todas entre 4800 y 6800 K; pocas en los extremos
  if (guia > 0.5) { I *= 9.0; col = temperatura(0.45 + 0.4 * h1); }
  if (calma < 0.5) I = min(I, 0.026);
  v_c = vec4(col * I, d);
  v_g = vec4(rd, largo * 0.5, dir);
}`;
const FS_MOTA = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec4 v_c;
in vec4 v_g;
in float v_h;
uniform sampler2D u_info;   // sala.texInfo: R = distancia a la cámara viva, G = máscara, A = materia
uniform vec2 u_T, u_lienzo;
uniform vec4 u_enc, u_luz, u_filaY;
out vec4 o;
void main(){
  float tam = 2.0 * (v_g.x + v_g.y) + 2.0;
  vec2 c = (gl_PointCoord - 0.5) * tam;
  vec2 e = c - v_g.zw * clamp(dot(c, v_g.zw), -v_g.y, v_g.y);
  float x = length(e) / v_g.x;
  if (x >= 1.6) discard;
  float destello = 2.2 * exp(-x * x * 2.2);                                                   // en foco: punto fino
  float disco = (1.0 - smoothstep(0.62, 1.0, x)) * (0.92 + 0.22 * smoothstep(0.4, 0.8, x));   // fuera de foco: disco con el aro apenas más claro
  float f = mix(destello, disco, smoothstep(1.6, 5.0, v_g.x));
  vec4 inf = texelFetch(u_info, ivec2(gl_FragCoord.xy), 0);
  float vis;
  if (u_luz.z > 0.5 && u_luz.z < 1.5) {
    /* reflejo: sólo donde el píxel visible es piso (se reconstruye su altura de mundo) */
    vec2 q = vec2(gl_FragCoord.x, u_lienzo.y - gl_FragCoord.y);
    vec2 uv = (q - u_enc.xy) / u_enc.zw;
    vec3 Xv = vec3(vec2(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0) * inf.r * u_T, -inf.r);
    float y = dot(u_filaY.xyz, Xv) + u_filaY.w;
    vis = (1.0 - smoothstep(0.015, 0.05, abs(y - u_luz.w))) * 0.55 * (0.3 + 0.7 * inf.a) * exp(-v_h * 1.4);
  } else vis = clamp((inf.r - v_c.a) / 0.04 + 0.5, 0.0, 1.0);                                 // pasa por detrás de los objetos (borde de 4 cm)
  /* sobre un contorno (silueta o canto, inf.b) la mota se apaga: nada de brillantina pegada a los bordes (las guías no) */
  if (u_luz.z < 1.5) vis *= 1.0 - 0.75 * smoothstep(0.15, 0.6, inf.b);
  o = vec4(v_c.rgb * (f * vis), 0.0);
}`;

/* ---------- Ruido en JS (para las guías y los relojes): mismo carácter que el de GPU ---------- */
function azar1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function ruido1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f), a = azar1(i); return (a + (azar1(i + 1) - a) * u) * 2 - 1; }
function pulso(x) { // 0 → 1 → 0 con subida rápida y caída larga, x en 0..1
  if (x <= 0 || x >= 1) return 0;
  const s = x < 0.22 ? x / 0.22 : 1 - (x - 0.22) / 0.78;
  return s * s * (3 - 2 * s);
}

/* `ctx` (lo arma index.js): { val, puntero: { x, y, peso }, apuntada() } */
export function crearEnjambre(motor, ctx) {
  const gl = motor.gl;
  let listo = false, progPaso, progMota, bufs, vaos, tf, bufGuias, vaoGuias, turno = 0;
  let salaVista = null, precalentado = false;
  const G = new Float32Array(GUIAS * 8);                 // guías: mismo formato que las motas (p, semilla, v, edad)
  const gObra = new Uint8Array(GUIAS), gCambio = new Float32Array(GUIAS);
  const uObra = new Float32Array(16), uObraB = new Float32Array(16);
  const ejeR = new Float32Array(3), ejeF = new Float32Array(3), camPos = new Float32Array(3), mira = new Float32Array(3);
  const rayo = new Float32Array(4), portal = new Float32Array(4), tmp = new Float32Array(3), filaY = new Float32Array(4), portalV = new Float32Array(3);
  const panC = new Float32Array(16), panU = new Float32Array(16), panV = new Float32Array(16), pant = new Float32Array(16), pantD = new Float32Array(4), r4 = new Float32Array(4);
  const centros = new Float32Array(12), semi = new Float32Array(8);   // por obra (orden de la máscara): centro; semieje horizontal y vertical
  const hay = [false, false, false, false];
  const ev = { tipo: 0, t0: 0, dur: 1, obra: 0, signo: 1, prox: 6 };   // 1 = corriente que cruza, 2 = ronda sobre una obra
  let semilla = 12345;
  const azarFijo = () => { semilla = (semilla * 1664525 + 1013904223) >>> 0; return semilla / 4294967296; }; // capturas repetibles

  function armar() {
    /* se compilan aparte (el de la simulación tarda más de un segundo): el gancho espera a que estén */
    progPaso = motor.programaAparte(FS_PASO, 'enjambre (paso)', VS_PASO, ['o_p', 'o_v']);
    progMota = motor.programaAparte(FS_MOTA, 'enjambre (motas)', VS_MOTA);
    bufs = [gl.createBuffer(), gl.createBuffer()];
    vaos = [gl.createVertexArray(), gl.createVertexArray()];
    tf = gl.createTransformFeedback();
    for (let i = 0; i < 2; i++) {
      gl.bindVertexArray(vaos[i]);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs[i]);
      gl.bufferData(gl.ARRAY_BUFFER, N_MAX * 32, gl.DYNAMIC_COPY);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
    }
    bufGuias = gl.createBuffer(); vaoGuias = gl.createVertexArray();
    gl.bindVertexArray(vaoGuias);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufGuias);
    gl.bufferData(gl.ARRAY_BUFFER, GUIAS * 32, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
    gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
    listo = true; salaVista = null;
  }

  /* Datos de la sala (cambian con el formato): ejes, portal, obras; y el estado inicial repartido por todo el cono de vista. */
  function configurar(sala) {
    salaVista = sala; precalentado = false; turno = 0;
    const d = sala.datos, v = sala.cam.vista, vi = sala.cam.vistaInv;
    ejeR[0] = v[0]; ejeR[1] = 0; ejeR[2] = v[8];
    const n = Math.hypot(ejeR[0], ejeR[2]); ejeR[0] /= n; ejeR[2] /= n;
    ejeF[0] = ejeR[2]; ejeF[1] = 0; ejeF[2] = -ejeR[0];
    camPos[0] = vi[12]; camPos[1] = vi[13]; camPos[2] = vi[14];
    mira[0] = -v[2]; mira[1] = -v[6]; mira[2] = -v[10];
    portal[0] = d.portal.pos[0]; portal[1] = d.portal.pos[1]; portal[2] = d.portal.pos[2]; portal[3] = d.portal.alto;
    hay.fill(false); panC.fill(0); panU.fill(0); panV.fill(0);
    for (let i = 0; i < 4; i++) { uObra[i * 4] = 0; uObra[i * 4 + 1] = -50; uObra[i * 4 + 2] = 0; uObra[i * 4 + 3] = 0.3; uObraB[i * 4] = 0.3; uObraB[i * 4 + 1] = 0; uObraB[i * 4 + 2] = i % 2 ? -1 : 1; }
    for (const o of d.obras) {
      const i = ORDEN.indexOf(o.id);
      if (i < 0) continue;
      hay[i] = true;
      centros[i * 3] = o.centro[0]; centros[i * 3 + 1] = o.centro[1]; centros[i * 3 + 2] = o.centro[2];
      semi[i * 2] = Math.max(o.caja[0], o.caja[2]) * 0.62 + 0.05; semi[i * 2 + 1] = o.caja[1] * 0.66 + 0.05;
      uObra[i * 4] = o.centro[0]; uObra[i * 4 + 1] = o.centro[1]; uObra[i * 4 + 2] = o.centro[2]; uObra[i * 4 + 3] = semi[i * 2];
      uObraB[i * 4] = semi[i * 2 + 1]; uObraB[i * 4 + 1] = 1;
      /* pantalla en el mundo (esquinas arriba-izq, arriba-der, abajo-der, abajo-izq): centro y medios ejes */
      const c = o.pantallaMundo;
      for (let j = 0; j < 3; j++) {
        if (c) {
          panC[i * 4 + j] = (c[0][j] + c[1][j] + c[2][j] + c[3][j]) / 4;
          panU[i * 4 + j] = (c[1][j] - c[0][j] + c[2][j] - c[3][j]) / 4;
          panV[i * 4 + j] = (c[0][j] - c[3][j] + c[1][j] - c[2][j]) / 4;
        } else { panC[i * 4 + j] = o.centro[j]; panU[i * 4 + j] = j === 0 ? o.caja[0] / 2 : 0; panV[i * 4 + j] = j === 1 ? o.caja[1] / 2 : 0; }
      }
      panC[i * 4 + 3] = 1;
    }
    semilla = 12345;
    const ini = new Float32Array(N_MAX * 8); // una vez por sala, no por cuadro
    const Tx = sala.cam.Tx, Ty = sala.cam.Ty;
    for (let i = 0; i < N_MAX; i++) {
      const s = azarFijo() * 1000 + 1, dd = 0.7 + 11 * Math.pow(azarFijo(), 0.8);
      const a = (azarFijo() * 2 - 1) * (Tx * dd + 0.5), b = azarFijo();
      const y = 0.04 + b * b * (Ty * dd + 0.5 + 0.2 * dd);
      const o = i * 8;
      ini[o] = camPos[0] + ejeF[0] * dd + ejeR[0] * a; ini[o + 1] = y; ini[o + 2] = camPos[2] + ejeF[2] * dd + ejeR[2] * a;
      ini[o + 3] = s;
      ini[o + 4] = -ejeF[0] * 0.1; ini[o + 5] = 0; ini[o + 6] = -ejeF[2] * 0.1;
      ini[o + 7] = azarFijo() * 38;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs[0]); gl.bufferSubData(gl.ARRAY_BUFFER, 0, ini);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs[1]); gl.bufferSubData(gl.ARRAY_BUFFER, 0, ini);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    /* guías: dos por obra, repartidas; las cuatro primeras cubren las cuatro obras (el nivel 2 usa cuatro luces) */
    const K = sala.coloresLuz, temp = [0.55, 0.8, 0.45, 0.68, 0.88, 0.5, 0.74, 0.6];
    for (let i = 0; i < GUIAS; i++) {
      let ob = i % 4;
      while (!hay[ob]) ob = (ob + 1) % 4;
      gObra[i] = ob; gCambio[i] = 5 + 9 * azarFijo();
      const o = i * 8, ang = azarFijo() * 6.283, R = semi[ob * 2] * 1.1;
      G[o] = centros[ob * 3] + Math.cos(ang) * R; G[o + 1] = centros[ob * 3 + 1] + (azarFijo() - 0.5) * semi[ob * 2 + 1]; G[o + 2] = centros[ob * 3 + 2] + Math.sin(ang) * R;
      G[o + 3] = 100 + i * 31.7 + temp[i];   // la parte decimal de la semilla no importa: el color sale de azar(semilla)
      G[o + 4] = G[o + 5] = G[o + 6] = 0; G[o + 7] = 10;
      /* color de la luz: el mismo blanco por temperatura (3500–7500 K) */
      const k = temp[i], c = k < 0.5 ? [1, 0.62 + 0.44 * k, 0.34 + 0.81 * k] : k < 0.75 ? [1, 0.84 + 0.5 * (k - 0.5), 0.745 + 0.9 * (k - 0.5)] : [1 - 0.68 * (k - 0.75), 0.965 - 0.44 * (k - 0.75), 0.97 + 0.12 * (k - 0.75)];
      K[i * 3] = c[0]; K[i * 3 + 1] = c[1]; K[i * 3 + 2] = c[2];
    }
    sala.nLuces = GUIAS; sala.lucesDePrueba = false;
    ev.tipo = 0; ev.prox = 3 + 3 * azarFijo();
  }

  /* Pesos de las formaciones a partir de la máquina de actos (val de index.js). */
  let wL = 0, wM = 1, wV = 0, frente = 0, wFrente = 0, zLam = 0;
  function pesos(sala) {
    const p = sala.p;
    wL = Math.min(1, Math.max(0, p.L));
    wV = Math.min(1, Math.max(0, p.V));
    wM = Math.max(0.15, 1 - wL) * (1 - 0.5 * wV);
    zLam = p.zs;
    /* el frente de materia (llave logarítmica de sala.js: 0 cerca, 1 en el portal) → metros */
    const zf = sala.zs[0], f = Math.min(1, Math.max(0, p.fM));
    frente = 0.4 * Math.pow(zf / 0.4, f);
    wFrente = p.filo * (p.fM > 0 && p.fM < 1 ? 1 : 0);
  }

  /* Eventos sin período: reloj con azar, entre 3 y 8 s después del anterior. */
  let cruzaX = 0, cruzaY = 0, cruzaV = 0, focoPeso = 0, focoObra = -1;
  function eventos(m, sala) {
    cruzaX = 0; cruzaY = 0;
    for (let i = 0; i < 4; i++) { uObraB[i * 4 + 1] = hay[i] ? 1 : 0; sala.brillo[i] = 0; }
    const foco = ctx.enfocada ? ctx.enfocada() : null, fi = foco ? ORDEN.indexOf(foco) : -1;
    if (fi >= 0 && hay[fi]) { focoPeso += (1 - focoPeso) * (1 - Math.exp(-m.dtReal * 2)); focoObra = fi; }
    else focoPeso *= Math.exp(-m.dtReal * 1.5);
    if (focoObra >= 0 && focoPeso > 0.01) { uObraB[focoObra * 4 + 1] = 1 + 0.8 * focoPeso; sala.brillo[focoObra] = 0.06 * focoPeso; }
    if (m.dt <= 0) return;
    const t = m.t;
    if (!ev.tipo && t >= ev.prox) {
      ev.tipo = Math.random() < 0.45 ? 1 : 2; ev.t0 = t;
      if (ev.tipo === 1) { ev.dur = 3.6; ev.signo = Math.random() < 0.5 ? -1 : 1; }
      else { ev.dur = 4.2; let o = (Math.random() * 4) | 0; while (!hay[o]) o = (o + 1) % 4; ev.obra = o; }
    }
    if (!ev.tipo) return;
    const x = (t - ev.t0) / ev.dur;
    if (x >= 1) { ev.tipo = 0; ev.prox = t + 3 + 5 * Math.random(); return; }   // sucesos chicos seguidos (3–8 s, sin período)
    const e = pulso(x);
    if (ev.tipo === 1) { cruzaX = ev.signo * 1.5 * e; cruzaY = 0.25 * e; cruzaV = 9.5 - 8.5 * x; }
    else { uObraB[ev.obra * 4 + 1] = 1 + 1.8 * e; sala.brillo[ev.obra] = 0.2 * e; }
  }

  /* Rayo del puntero (dirección de mundo) y su peso. */
  function apuntar(sala) {
    const pu = ctx.puntero, e = sala.enc, c = sala.cam, v = c.vista;
    rayo[3] = pu.peso;
    if (pu.peso <= 0.001) return;
    const ax = ((pu.x - e.x0) / e.W * 2 - 1) * c.Tx, ay = (1 - (pu.y - e.y0) / e.H * 2) * c.Ty;
    const n = 1 / Math.hypot(ax, ay, 1);
    rayo[0] = (v[0] * ax + v[1] * ay - v[2]) * n; rayo[1] = (v[4] * ax + v[5] * ay - v[6]) * n; rayo[2] = (v[8] * ax + v[9] * ay - v[10]) * n;
  }

  /* Un paso de simulación en GPU: lee un búfer y graba el otro. */
  function paso(dt, t) {
    const u = progPaso.u;
    gl.uniform1f(u.u_dt, dt); gl.uniform1f(u.u_t, t);
    gl.uniform1f(u.u_flujo, 0.95 + 0.4 * ruido1(t * 0.23 + 3.1));   // la fuerza del flujo respira con ruido, no con un seno
    gl.bindVertexArray(vaos[turno]);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, bufs[1 - turno]);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, motor.P.particulas);
    gl.endTransformFeedback();
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    turno = 1 - turno;
  }
  function uniformesPaso() {
    const u = progPaso.u;
    gl.useProgram(progPaso.p);
    gl.uniform3f(u.u_peso, wL, wM, 0);
    gl.uniform4fv(u.u_obra, uObra); gl.uniform4fv(u.u_obraB, uObraB);
    gl.uniform4fv(u.u_panC, panC); gl.uniform4fv(u.u_panU, panU); gl.uniform4fv(u.u_panV, panV);
    gl.uniform3fv(u.u_ejeR, ejeR); gl.uniform3fv(u.u_ejeF, ejeF); gl.uniform3fv(u.u_cam, camPos); gl.uniform3fv(u.u_mira, mira);
    gl.uniform4fv(u.u_portal, portal);
    gl.uniform4fv(u.u_rayo, rayo);
    gl.uniform4f(u.u_lamina, zLam, wV, frente, wFrente);
    gl.uniform4f(u.u_corriente, cruzaX, cruzaY, cruzaV, 1.5);
  }

  /* Guías: las mismas reglas, en JS (son ocho). Rondan una obra pegadas a sus cantos y cada tanto cruzan a otra a ras del piso. */
  function guias(dt, t, sala) {
    const L = sala.luces;
    for (let i = 0; i < GUIAS; i++) {
      const o = i * 8;
      let x = G[o], y = G[o + 1], z = G[o + 2], vx = G[o + 4], vy = G[o + 5], vz = G[o + 6];
      if (dt > 0) {
        gCambio[i] -= dt;
        if (gCambio[i] <= 0) { // cambia de obra, sin período
          let ob = (gObra[i] + 1 + ((azarFijo() * 3) | 0)) % 4;
          while (!hay[ob]) ob = (ob + 1) % 4;
          gObra[i] = ob; gCambio[i] = 4 + 7 * azarFijo();   // viajan seguido de un producto a otro: carriles de luz entre ellos
        }
        /* recorren el canto de la pantalla de su obra (el reluz hace brillar los biseles a su paso); para cambiar
           de obra viajan derecho, bajando hacia el piso */
        const ob = gObra[i];
        cantoJS(ob, x, y, z, 0.02 + 0.015 * (i % 3), i % 2 ? -1 : 1);
        const px = cPt[0] - x, py = cPt[1] - y, pz = cPt[2] - z, dist = Math.hypot(px, py, pz) + 1e-4;
        let ox, oy, oz, ax = 0, ay = 0, az = 0;
        if (dist > 0.3) { // de viaje
          const vv = Math.min(0.45, dist * 0.9);
          ox = px / dist * vv; oz = pz / dist * vv; oy = ((dist > 0.7 ? 0.06 : cPt[1]) - y) * 2.5;
        } else {
          const spd = 0.11 + 0.05 * ruido1(t * 0.31 + i * 11.3);
          ox = cTg[0] * spd + px * 3; oy = cTg[1] * spd + py * 3; oz = cTg[2] * spd + pz * 3;
        }
        /* carriles */
        if (wL > 0.001) {
          const cu = (x - camPos[0]) * ejeR[0] + (z - camPos[2]) * ejeR[2], cv = (x - camPos[0]) * ejeF[0] + (z - camPos[2]) * ejeF[2];
          const ul = Math.floor((cu - 0.225) / 0.45 + 0.5) * 0.45 + 0.225, m = wL * 0.94;
          ax = ax * (1 - wL) + ejeR[0] * (ul - cu) * 10 * wL; az = az * (1 - wL) + ejeR[2] * (ul - cu) * 10 * wL; ay = ay * (1 - wL) + (0.05 - y) * 8 * wL;
          ox += (-ejeF[0] * 0.4 - ox) * m; oy += (0 - oy) * m; oz += (-ejeF[2] * 0.4 - oz) * m;
          if (cv < 0.6) { x = portal[0] + ejeR[0] * (i - 3.5) * 0.45; y = 0.05; z = portal[2] + ejeR[2] * (i - 3.5) * 0.45; vx = vy = vz = 0; } // renace en el portal
        }
        /* lámina de verificación */
        const d = (x - camPos[0]) * mira[0] + (y - camPos[1]) * mira[1] + (z - camPos[2]) * mira[2];
        const wz = wV * Math.exp(-Math.pow((d - zLam) / 0.45, 2)), kz = (zLam - d) * 46 * wz;
        ax += mira[0] * kz; ay += mira[1] * kz; az += mira[2] * kz;
        if (y < 0.03) ay += (0.03 - y) * 80;
        const f = 1 - Math.exp(-dt * 5);
        vx += (ox - vx) * f + ax * dt; vy += (oy - vy) * f + ay * dt; vz += (oz - vz) * f + az * dt;
        const fr = dot3(vx, vy, vz, mira) * (1 - Math.exp(-dt * 13)) * wz;
        vx -= mira[0] * fr; vy -= mira[1] * fr; vz -= mira[2] * fr;
        x += vx * dt; y += vy * dt; z += vz * dt;
        G[o] = x; G[o + 1] = y; G[o + 2] = z; G[o + 4] = vx; G[o + 5] = vy; G[o + 6] = vz;
      }
      const tit = 0.75 + 0.25 * ruido1(t * 0.9 + i * 13.1);
      L[i * 4] = x; L[i * 4 + 1] = y; L[i * 4 + 2] = z; L[i * 4 + 3] = 0.42 * tit * (i < 4 ? 1 : 0.8);
    }
  }
  function dot3(x, y, z, a) { return x * a[0] + y * a[1] + z * a[2]; }
  /* el mismo canto que la simulación (VS_PASO → canto), en JS, para las guías: deja el punto en cPt y la tangente en cTg */
  const cPt = new Float32Array(3), cTg = new Float32Array(3), eu = new Float32Array(3), eV = new Float32Array(3), en = new Float32Array(3);
  function cantoJS(k, x, y, z, off, sentido) {   // sin asignaciones: los vectores de trabajo se reservan una vez
    const o = k * 4;
    const lu = Math.hypot(panU[o], panU[o + 1], panU[o + 2]) || 1e-3, lv = Math.hypot(panV[o], panV[o + 1], panV[o + 2]) || 1e-3;
    for (let j = 0; j < 3; j++) { eu[j] = panU[o + j] / lu; eV[j] = panV[o + j] / lv; }
    en[0] = eu[1] * eV[2] - eu[2] * eV[1]; en[1] = eu[2] * eV[0] - eu[0] * eV[2]; en[2] = eu[0] * eV[1] - eu[1] * eV[0];
    const rx = x - panC[o], ry = y - panC[o + 1], rz = z - panC[o + 2];
    const pu = rx * eu[0] + ry * eu[1] + rz * eu[2], pv = rx * eV[0] + ry * eV[1] + rz * eV[2];
    const su = pu < 0 ? -1 : 1, sv = pv < 0 ? -1 : 1, hu = lu + off, hv = lv + off, rad = 0.03;
    const qu = Math.abs(pu) - hu + rad, qv = Math.abs(pv) - hv + rad;
    let cu, cv, gu, gv;
    if (qu > 0 && qv > 0) { const l = Math.hypot(qu, qv); gu = qu / l; gv = qv / l; cu = (hu - rad + gu * rad) * su; cv = (hv - rad + gv * rad) * sv; gu *= su; gv *= sv; }
    else if (qu > qv) { gu = su; gv = 0; cu = su * hu; cv = Math.min(hv - rad, Math.max(-hv + rad, pv)); }
    else { gu = 0; gv = sv; cu = Math.min(hu - rad, Math.max(-hu + rad, pu)); cv = sv * hv; }
    const tu = -gv * sentido, tv = gu * sentido;
    for (let j = 0; j < 3; j++) { cPt[j] = panC[o + j] + eu[j] * cu + eV[j] * cv + en[j] * 0.015; cTg[j] = eu[j] * tu + eV[j] * tv; }
  }

  function dibujar(m, sala) {
    const u = progMota.u, E = m.escala, e = sala.enc, c = sala.cam, v = c.vistaViva, P = m.P;
    gl.bindFramebuffer(gl.FRAMEBUFFER, sala.fbColor);
    gl.viewport(0, 0, sala.ancho, sala.alto);
    if (!sala.recortar()) return;
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(progMota.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sala.texInfo); gl.uniform1i(u.u_info, 0);
    gl.uniformMatrix4fv(u.u_vista, false, v);
    gl.uniform2f(u.u_T, c.Tx, c.Ty); gl.uniform2f(u.u_lienzo, sala.ancho, sala.alto);
    gl.uniform4f(u.u_enc, e.x0 * E, e.y0 * E, e.W * E, e.H * E);
    const alto = e.H * E;
    /* mismo foco que las láminas (KF = 0,005 del alto por dioptría en σ; el disco mide ≈ 2,4 σ); mota de 1,1 mm de radio */
    gl.uniform4f(u.u_foco, sala.p.q, 0.005 * alto * sala.p.apertura * 2.4, 0.0011 / c.Ty * alto * 0.5, 0.034 * alto);
    gl.uniform4f(u.u_lamina, zLam - c.tz, wV, 0, 0);
    gl.uniform4fv(u.u_obra, uObra);
    /* rectángulos de las pantallas (los mismos de las zonas activas) */
    pant.fill(0);
    for (const o of sala.datos.obras) {
      const i = ORDEN.indexOf(o.id);
      if (i < 0) continue;
      sala.rectObra(o, r4);
      pant[i * 4] = r4[0] * E; pant[i * 4 + 1] = r4[1] * E; pant[i * 4 + 2] = (r4[0] + r4[2]) * E; pant[i * 4 + 3] = (r4[1] + r4[3]) * E;
      pantD[i] = (o.distancia || 2) - c.tz;
    }
    gl.uniform4fv(u.u_pant, pant); gl.uniform4fv(u.u_pantD, pantD);
    gl.uniform4f(u.u_texto, sala.texto[0] * E, sala.texto[1] * E, sala.texto[2] * E, sala.texto[3] * E);
    tmp[0] = v[0] * portal[0] + v[4] * portal[1] + v[8] * portal[2] + v[12];
    tmp[1] = v[1] * portal[0] + v[5] * portal[1] + v[9] * portal[2] + v[13];
    tmp[2] = v[2] * portal[0] + v[6] * portal[1] + v[10] * portal[2] + v[14];
    gl.uniform4f(u.u_portal, tmp[0], tmp[1], tmp[2], 0);
    filaY[0] = v[4]; filaY[1] = v[5]; filaY[2] = v[6]; filaY[3] = -(v[4] * v[12] + v[5] * v[13] + v[6] * v[14]);
    gl.uniform4fv(u.u_filaY, filaY);
    const piso = sala.datos.piso?.y || 0, brillo = 1.5 * sala.p.entrada * (0.45 + 0.55 * Math.min(1, sala.p.sombra));
    gl.bindVertexArray(vaos[turno]);
    if (P.luces > 0) { // reflejo en el piso (niveles 2 y 3)
      gl.uniform4f(u.u_luz, brillo, m.t, 1, piso);
      gl.drawArrays(gl.POINTS, 0, P.particulas);
    }
    gl.uniform4f(u.u_luz, brillo, m.t, 0, piso);
    gl.drawArrays(gl.POINTS, 0, P.particulas);
    /* guías */
    gl.bindVertexArray(vaoGuias);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufGuias); gl.bufferSubData(gl.ARRAY_BUFFER, 0, G);
    if (P.luces > 0) { gl.uniform4f(u.u_luz, brillo * 3, m.t, 1, piso); gl.drawArrays(gl.POINTS, 0, GUIAS); }
    gl.uniform4f(u.u_luz, brillo, m.t, 2, piso);
    gl.drawArrays(gl.POINTS, 0, GUIAS);
    gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
  }

  /* Gancho «sobre la sala»: simula y dibuja sumando sobre el color de la sala. */
  function gancho(m, sala) {
    if (m.perdido) return;
    if (!listo) armar();
    if (!progPaso.listo() || !progMota.listo()) return;
    if (sala !== salaVista) configurar(sala);
    pesos(sala);
    eventos(m, sala);
    apuntar(sala);
    gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
    gl.enable(gl.RASTERIZER_DISCARD);
    uniformesPaso();
    if (m.dt > 0) {
      const dt = Math.min(m.dt, 1 / 30);
      paso(dt, m.t); guias(dt, m.t, sala);
    } else {
      if (!precalentado) {
        /* tiempo congelado (?t=, movimiento reducido): se simulan 14 s de una vez para que la formación del acto se vea */
        precalentado = true;
        const pasos = 420;
        for (let i = 0; i < pasos; i++) { const t = m.t - (pasos - i) / 30; paso(1 / 30, t); guias(1 / 30, t, sala); }
      }
      guias(0, m.t, sala);
    }
    gl.disable(gl.RASTERIZER_DISCARD);
    dibujar(m, sala);
    api.dibujo = true;
  }

  motor.ganchos.sobreSala.push(gancho);
  motor.ganchos.alPerder.push(() => { listo = false; salaVista = null; });
  armar();   // ya: los programas se compilan mientras bajan las láminas
  const api = { guias: G, evento: ev, dibujo: false };   // `dibujo`: ya dibujó una vez (la placa ya tiene sus programas listos)
  return api;
}
