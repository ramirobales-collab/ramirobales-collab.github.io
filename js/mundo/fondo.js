/* fondo.js — fondo vivo de «la sala negra» (motor.md §4, modo fondo): pasado el héroe, el mismo lienzo sigue
   detrás de toda la página. Enjambre lejano en tres planos (puntos finos, discos medios, discos grandes y
   tenues) + bruma tenue, con paralaje al deslizar: lo más cercano se mueve más, y la velocidad de scroll estira
   apenas los discos. En tema claro: motas de tinta muy suaves, sin bruma. Luz blanca con variación de temperatura.
   Las motas no guardan estado: su lugar sale de su número, del viento acumulado (ruido, sin período) y del scroll.
   Todo el contenido de la página queda por encima del lienzo. Sin asignaciones por cuadro. */

const CANTIDAD = { 1: 220, 2: 460, 3: 720 };

const COMUN = `
uniform vec2 u_lienzo;
uniform vec4 u_esc;       // escenario (px de búfer, origen arriba a la izquierda)
uniform vec4 u_par;       // fundido inferior del escenario, entrada del escenario, tema (0 oscuro, 1 claro), px de búfer por px CSS
/* cuánto tapa el escenario (el héroe) en este píxel: el fondo aparece donde la sala se funde */
float tapa(vec2 q){
  vec2 e = (q - u_esc.xy) / u_esc.zw;
  if (e.x < 0.0 || e.x > 1.0 || e.y < 0.0 || e.y > 1.0) return 0.0;
  return (1.0 - smoothstep(1.0 - u_par.x, 1.0, e.y)) * u_par.y;
}
float azar(float n){ n = fract(n * 0.1031); n *= n + 33.33; n *= n + n; return fract(n); }
float ruido1(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(azar(i), azar(i + 1.0), f); }
`;

const VS_MOTA = `#version 300 es
precision highp float;
${COMUN}
uniform vec4 u_mov;       // viento acumulado (px CSS), scroll (px CSS), velocidad de scroll (px CSS por s)
uniform vec4 u_ev;        // ráfaga: posición del frente (px CSS), fuerza, sentido, tiempo
out vec4 v_c;             // color, opacidad
out vec3 v_g;             // radio (px de búfer), medio estirón, plano
vec3 temperatura(float k){
  const vec3 a = vec3(1.0, 0.62, 0.34), b = vec3(1.0, 0.84, 0.745), c = vec3(1.0, 0.965, 0.97), e = vec3(0.83, 0.855, 1.0);
  return k < 0.5 ? mix(a, b, k * 2.0) : (k < 0.75 ? mix(b, c, (k - 0.5) * 4.0) : mix(c, e, (k - 0.75) * 4.0));
}
void main(){
  float id = float(gl_VertexID) + 1.0, t = u_ev.w, E = u_par.w;
  float h1 = azar(id * 1.13), h2 = azar(id * 2.71 + 5.0), h3 = azar(id * 3.37 + 9.0), h4 = azar(id * 5.19 + 2.0), h5 = azar(id * 7.77 + 4.0);
  /* tres planos: lejos (muchas, finas), medio, cerca (pocas, grandes y tenues) */
  float plano = h1 < 0.62 ? 0.0 : (h1 < 0.9 ? 1.0 : 2.0);
  float par = plano < 0.5 ? 0.05 : (plano < 1.5 ? 0.14 : 0.36);
  float radio = plano < 0.5 ? 0.9 + 1.0 * h4 : (plano < 1.5 ? 3.0 + 5.0 * h4 : 14.0 + 26.0 * h4);
  vec2 css = u_lienzo / E, campo = css + 2.0 * (radio + 60.0);
  vec2 p = vec2(h2, h3) * campo;
  p += u_mov.xy * (0.35 + par * 4.0);                                   // corriente lenta: el viento acumulado
  float lento = mix(0.06, 0.17, h5);
  p += (vec2(ruido1(t * lento + id * 3.1), ruido1(t * lento * 0.83 + id * 5.7 + 40.0)) - 0.5) * (60.0 + 420.0 * par);
  p.y -= u_mov.z * par;                                                  // paralaje con el scroll
  p = mod(p, campo) - (radio + 60.0);
  /* evento: una ráfaga cruza la pantalla y empuja lo que encuentra */
  float fr = (p.x - u_ev.x) / 260.0;
  p.x += u_ev.z * u_ev.y * (30.0 + 300.0 * par) * exp(-fr * fr);
  float estiron = min(abs(u_mov.w) * par * 0.02, radio * 1.5 + 6.0);     // el scroll estira apenas los discos
  float r = radio * E;
  gl_Position = vec4(p.x / css.x * 2.0 - 1.0, 1.0 - p.y / css.y * 2.0, 0.0, 1.0);
  gl_PointSize = 2.0 * (r + estiron * E) + 2.0;
  float titila = 0.55 + 0.9 * pow(ruido1(t * mix(0.2, 1.3, h5) + id * 17.0), 2.0);
  float op = plano < 0.5 ? 0.5 * titila : (plano < 1.5 ? 0.10 * titila : 0.035 + 0.02 * titila);
  op *= 1.0 + 1.5 * u_ev.y * exp(-fr * fr);                              // la ráfaga las enciende un momento
  op *= r * r / (r * r + 0.64 * r * estiron * E);                        // la energía se conserva al estirarse
  float g = h4 * 2.0 - 1.0;
  vec3 col = temperatura(clamp(0.62 + 0.62 * g * abs(g), 0.0, 1.0));
  if (u_par.z > 0.5) { col = vec3(0.045, 0.040, 0.035); op = min(op * 0.5, 0.10) * (plano < 0.5 ? 1.0 : 0.7); }   // tinta: gris cálido oscuro, opacidad ≤ 0,10
  v_c = vec4(col, op);
  v_g = vec3(r, estiron * E, plano);
}`;
const FS_MOTA = `#version 300 es
precision highp float;
${COMUN}
in vec4 v_c;
in vec3 v_g;
out vec4 o;
void main(){
  float tam = 2.0 * (v_g.x + v_g.y) + 2.0;
  vec2 c = (gl_PointCoord - 0.5) * tam;
  c.y -= clamp(c.y, -v_g.y, v_g.y);
  float x = length(c) / v_g.x;
  if (x >= 1.6) discard;
  float f = v_g.z < 0.5 ? 1.6 * exp(-x * x * 2.2) : (1.0 - smoothstep(0.5, 1.0, x)) * (0.95 + 0.16 * smoothstep(0.3, 0.7, x));
  vec2 q = vec2(gl_FragCoord.x, u_lienzo.y - gl_FragCoord.y);
  float a = min(v_c.a * f, 1.0) * (1.0 - tapa(q));
  /* oscuro: luz (casi suma); claro: tinta (mezcla normal). Premultiplicado, en sRGB. */
  o = u_par.z > 0.5 ? vec4(v_c.rgb * a, a) : vec4(v_c.rgb * a, a * 0.35);
}`;
const FS_BRUMA = `#version 300 es
precision highp float;
${COMUN}
uniform vec4 u_mov;
uniform float u_t;
out vec4 o;
float azar2(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float ruido2(vec2 x){
  vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(azar2(i), azar2(i + vec2(1, 0)), f.x), mix(azar2(i + vec2(0, 1)), azar2(i + vec2(1, 1)), f.x), f.y);
}
void main(){
  vec2 q = vec2(gl_FragCoord.x, u_lienzo.y - gl_FragCoord.y);
  vec2 p = q / u_par.w;                                   // px CSS
  p.y += u_mov.z * 0.1;                                   // la bruma queda lejos: casi no acompaña al scroll
  p += u_mov.xy * 0.5;
  float n = ruido2(p / 520.0 + vec2(u_t * 0.011, -u_t * 0.006)) * 0.65 + ruido2(p / 190.0 + vec2(-u_t * 0.017, u_t * 0.012) + 7.0) * 0.35;
  float a = 0.085 * smoothstep(0.38, 0.95, n) * (1.0 - tapa(q));
  a += (azar2(q + u_t) + azar2(q * 1.37 + 11.0 - u_t) - 1.0) / 255.0 * step(0.002, a);   // tramado: sin bandas
  a = max(a, 0.0);
  o = vec4(vec3(0.86, 0.90, 1.0) * a, a * 0.25);
}`;

function azar1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function ruido1(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f), a = azar1(i); return (a + (azar1(i + 1) - a) * u) * 2 - 1; }

export function crearFondo(motor) {
  const gl = motor.gl, html = document.documentElement;
  let listo = false, pMota, pBruma, vao;
  let vientoX = 0, vientoY = 0, scrollVisto = scrollY, velScroll = 0;
  const ev = { vivo: false, t0: 0, dur: 1, sentido: 1, prox: 7 };
  /* tema: lo fija el conmutador (data-theme) o, si no, la preferencia del sistema */
  const medio = matchMedia('(prefers-color-scheme: light)');
  let claro = false;
  const leerTema = () => { const t = html.dataset.theme; claro = t ? t === 'light' : medio.matches; motor.despertar(); };
  leerTema();
  medio.addEventListener?.('change', leerTema);
  if ('MutationObserver' in window) new MutationObserver(leerTema).observe(html, { attributes: true, attributeFilter: ['data-theme'] });

  function armar() {
    pMota = motor.programaAparte(FS_MOTA, 'fondo (motas)', VS_MOTA);
    pBruma = motor.programaAparte(FS_BRUMA, 'fondo (bruma)');
    vao = gl.createVertexArray();
    listo = true;
  }
  function comunes(u, m, sala) {
    const E = m.escala, e = sala.enc;
    /* lo que tapa es el héroe entero (en vertical, el escenario más el negro de arriba) */
    const y0 = sala.heroeY != null ? Math.min(sala.heroeY, e.Sy) : e.Sy, alto = e.Sy + e.Sh - y0;
    gl.uniform2f(u.u_lienzo, m.ancho, m.alto);
    gl.uniform4f(u.u_esc, e.Sx * E, y0 * E, e.Sw * E, alto * E);
    gl.uniform4f(u.u_par, sala.p.fundido * e.Sh / Math.max(alto, 1), sala.listoDatos ? sala.p.entrada : 0, claro ? 1 : 0, E);
    gl.uniform4f(u.u_mov, vientoX, vientoY, scrollVisto, velScroll);
  }

  /* Gancho de fondo: dibuja en el lienzo después de la salida, sólo donde el escenario no tapa. */
  function gancho(m, sala) {
    if (m.perdido) return;
    if (!listo) armar();
    if (!pMota.listo() || !pBruma.listo()) return;
    const dt = m.dt, t = m.t, E = m.escala, e = sala.enc;
    /* viento: ruido de una dimensión, acumulado (nunca vuelve sobre sus pasos con un período) */
    vientoX += (16 * ruido1(t * 0.05 + 2.3) + 7 * ruido1(t * 0.13 + 9.1) + 9) * dt;
    vientoY += (8 * ruido1(t * 0.043 + 7.7) - 5) * dt;
    const sy = m.quieto ? 0 : scrollY;                    // movimiento reducido: sin paralaje
    const v = m.dtReal > 0 ? (sy - scrollVisto) / m.dtReal : 0;
    velScroll += (v - velScroll) * (1 - Math.exp(-m.dtReal * 10));
    scrollVisto = sy;
    /* evento sin período: una ráfaga que cruza (cada 9 a 21 s) */
    let frente = -1e5, fuerza = 0;
    if (dt > 0) {
      if (!ev.vivo && t >= ev.prox) { ev.vivo = true; ev.t0 = t; ev.dur = 3.2 + 1.6 * Math.random(); ev.sentido = Math.random() < 0.5 ? -1 : 1; }
      if (ev.vivo) {
        const x = (t - ev.t0) / ev.dur;
        if (x >= 1) { ev.vivo = false; ev.prox = t + 9 + 12 * Math.random(); }
        else { const c = ev.sentido > 0 ? x : 1 - x; frente = -300 + c * (m.anchoCss + 600); fuerza = Math.sin(Math.PI * x); }
      }
    }
    /* el héroe entero en pantalla y opaco: no hay nada que dibujar más que la franja donde se funde */
    const yLibre = Math.max(0, Math.min(m.alto, Math.floor((e.Sy + e.Sh * (1 - sala.p.fundido)) * E)));
    const tapado = sala.listoDatos && sala.p.entrada >= 1 && (sala.heroeY != null ? Math.min(sala.heroeY, e.Sy) : e.Sy) <= 0 && e.Sx <= 0 && e.Sx + e.Sw >= m.anchoCss;
    if (tapado && yLibre >= m.alto) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, m.ancho, m.alto);
    gl.disable(gl.SCISSOR_TEST);
    if (tapado) { gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, m.ancho, m.alto - yLibre); }
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (!claro && m.nivel > 1) {
      gl.useProgram(pBruma.p);
      comunes(pBruma.u, m, sala);
      gl.uniform1f(pBruma.u.u_t, t);
      motor.triangulo();
    }
    gl.useProgram(pMota.p);
    comunes(pMota.u, m, sala);
    gl.uniform4f(pMota.u.u_ev, frente, fuerza, ev.sentido, t);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.POINTS, 0, CANTIDAD[m.nivel]);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
    api.dibujo = true;
  }

  motor.ganchos.fondo.push(gancho);
  motor.ganchos.alPerder.push(() => { listo = false; });
  armar();
  const api = { evento: ev, dibujo: false };
  return api;
}
