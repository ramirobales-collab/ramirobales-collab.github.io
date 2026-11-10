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
uniform vec4 u_iman[6];   // placas con data-iman a la vista (px CSS del lienzo): x0, y0, x1, y1
uniform vec4 u_imanP;     // cuántas, cuál es la más cercana al centro, sentido de la corriente (scroll), su luz (0..1)
uniform float u_fin;      // dónde termina la sala (fracción del alto de u_esc)
uniform vec4 u_texto;     // bloque de texto del héroe (px de búfer): ahí el fondo vivo no aparece aunque la sala se funda
/* cuánto tapa el escenario (el héroe) en este píxel: el fondo aparece donde la sala se funde, con la MISMA curva que
   la salida de sala.js (así no queda una franja negra entre la sala y el fondo vivo) */
float tapa(vec2 q){
  vec2 e = (q - u_esc.xy) / u_esc.zw;
  if (e.x < 0.0 || e.x > 1.0 || e.y < 0.0 || e.y > 1.0) return 0.0;
  float f = clamp((u_fin - e.y) / max(u_par.x, 1e-3), 0.0, 1.0);
  vec2 dq = max(u_texto.xy - q, q - u_texto.zw);
  float enTexto = 1.0 - smoothstep(0.0, 24.0 * u_par.w, max(dq.x, dq.y));   // ninguna mota detrás de un renglón del héroe
  return max(f * f * f * (f * (f * 6.0 - 15.0) + 10.0), enTexto) * u_par.y;
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
  /* motas del canto: una parte del enjambre recorre el borde de las placas marcadas (data-iman), con el sentido que
     marca el scroll; las que rondan la placa más cercana al centro de la pantalla son más y más brillantes */
  int nI = int(u_imanP.x);
  float canto = 0.0;
  if (nI > 0 && plano < 1.5 && h5 < (plano < 0.5 ? 0.42 : 0.3)) {
    int k = int(floor(azar(id * 9.13) * float(nI) * 1.6)); if (k >= nI) k = int(u_imanP.y);
    vec4 R = u_iman[k];
    vec2 lado = R.zw - R.xy;
    float L = 2.0 * (lado.x + lado.y);
    if (L > 40.0) {
      float off = 3.0 + 22.0 * h3 * h3 + 5.0 * ruido1(t * 0.2 + id * 1.7);
      float vel = (14.0 + 22.0 * h4) * u_imanP.z;
      float u = fract(h2 + t * vel / L + u_mov.z * 0.25 / L * u_imanP.z) * L;   // también avanza con el scroll
      vec2 q;
      if (u < lado.x) q = vec2(R.x + u, R.y - off);
      else if (u < lado.x + lado.y) q = vec2(R.z + off, R.y + (u - lado.x));
      else if (u < 2.0 * lado.x + lado.y) q = vec2(R.z - (u - lado.x - lado.y), R.w + off);
      else q = vec2(R.x - off, R.w - (u - 2.0 * lado.x - lado.y));
      p = q; canto = (k == int(u_imanP.y) ? 1.0 : 0.6) * smoothstep(0.0, 0.25, u_imanP.w + 0.25);
    }
  }
  /* evento: una ráfaga cruza la pantalla y empuja lo que encuentra */
  float fr = (p.x - u_ev.x) / 260.0;
  p.x += u_ev.z * u_ev.y * (30.0 + 300.0 * par) * exp(-fr * fr);
  /* con el scroll sólo se estiran las motas chicas del plano lejano (≤ 1,2 radios, como un barrido de cámara) y todas
     bajan de opacidad con la velocidad; los discos de bokeh nunca se estiran (se leían como lluvia sobre un vidrio) */
  float rapidez = min(abs(u_mov.w) / 900.0, 1.0);
  float estiron = plano < 0.5 ? radio * 1.2 * rapidez : 0.0;
  float r = radio * E;
  gl_Position = vec4(p.x / css.x * 2.0 - 1.0, 1.0 - p.y / css.y * 2.0, 0.0, 1.0);
  gl_PointSize = 2.0 * (r + estiron * E) + 2.0;
  float titila = 0.55 + 0.9 * pow(ruido1(t * mix(0.2, 1.3, h5) + id * 17.0), 2.0);
  float op = plano < 0.5 ? 0.5 * titila : (plano < 1.5 ? 0.10 * titila : 0.035 + 0.02 * titila);
  op *= 1.0 + 1.5 * u_ev.y * exp(-fr * fr);                              // la ráfaga las enciende un momento
  if (canto > 0.0) op *= 0.55 + 0.9 * canto * (0.6 + 0.4 * u_imanP.w);
  op *= r * r / (r * r + 0.64 * r * estiron * E);                        // la energía se conserva al estirarse
  op *= 1.0 - 0.65 * rapidez;
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
  /* la placa más cercana al centro junta algo de luz en su borde superior (filo de luz que respira con ruido) */
  if (u_imanP.x > 0.5 && u_imanP.w > 0.01) {
    vec4 R = u_iman[int(u_imanP.y)];
    float an = R.z - R.x;
    vec2 pc = q / u_par.w;
    float dy = pc.y - R.y;
    float x = clamp((pc.x - R.x) / max(an, 1.0), 0.0, 1.0);
    float largo = smoothstep(0.0, 0.18, x) * smoothstep(1.0, 0.82, x) * step(R.x, pc.x) * step(pc.x, R.z);
    float vivo = 0.55 + 0.45 * ruido2(vec2(pc.x / 140.0 - u_t * 0.06, u_t * 0.03));
    a += u_imanP.w * largo * vivo * (0.10 * exp(-dy * dy / 24.0) + 0.05 * exp(-max(-dy, 0.0) / 30.0) * step(dy, 0.0)) * (1.0 - tapa(q));
  }
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

  /* Placas marcadas con data-iman (las pone la página): cuáles están a la vista (IntersectionObserver) y sus rectángulos
     (se releen sólo si cambió el scroll o el tamaño). Sin ninguna, el fondo sigue igual que siempre. */
  const imanes = new Float32Array(24), vistas = new Set();
  let nImanes = 0, focal = 0, luzFocal = 0, sentido = 1, yLeida = -1, anchoLeido = -1;
  let observador = null;
  function buscarImanes() {
    if (!('IntersectionObserver' in window)) return;
    observador?.disconnect();
    observador = new IntersectionObserver((es) => { for (const e of es) e.isIntersecting ? vistas.add(e.target) : vistas.delete(e.target); yLeida = -1; motor.despertar(); }, { rootMargin: '80px 0px' });
    for (const el of document.querySelectorAll('[data-iman]')) observador.observe(el);
  }
  buscarImanes();
  if ('MutationObserver' in window) {
    let tm = 0;
    new MutationObserver((ms) => {
      if (!ms.some((m) => m.attributeName === 'data-iman' || [...m.addedNodes].some((n) => n.nodeType === 1 && (n.matches?.('[data-iman]') || n.querySelector?.('[data-iman]'))))) return;
      clearTimeout(tm); tm = setTimeout(buscarImanes, 200);
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-iman'] });
  }
  function leerImanes(m) {
    if (scrollY === yLeida && m.anchoCss === anchoLeido) return;
    yLeida = scrollY; anchoLeido = m.anchoCss;
    nImanes = 0; let mejor = 1e9;
    const cx = m.anchoCss / 2, cy = m.altoCss / 2;
    for (const el of vistas) {
      if (nImanes >= 6) break;
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 30 || r.bottom < 0 || r.top > m.altoCss) continue;
      const o = nImanes * 4;
      imanes[o] = r.left; imanes[o + 1] = r.top; imanes[o + 2] = r.right; imanes[o + 3] = r.bottom;
      const d = Math.hypot(Math.max(r.left - cx, 0, cx - r.right), Math.max(r.top - cy, 0, cy - r.bottom) * 1.4);
      if (d < mejor) { mejor = d; focal = nImanes; }
      nImanes++;
    }
  }

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
    gl.uniform1f(u.u_fin, (e.Sy + e.Sh * (sala.p.fin ?? 1) - y0) / Math.max(alto, 1));
    const tx = sala.texto;
    if (tx && tx[2] > tx[0]) gl.uniform4f(u.u_texto, tx[0] * E, tx[1] * E, tx[2] * E, tx[3] * E); else gl.uniform4f(u.u_texto, -1e5, -1e5, -1e5, -1e5);
    gl.uniform4f(u.u_mov, vientoX, vientoY, scrollVisto, velScroll);
    gl.uniform4fv(u.u_iman, imanes); gl.uniform4f(u.u_imanP, nImanes, focal, sentido, luzFocal);
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
    /* la corriente responde al scroll: el viento se suma a su dirección y el sentido de las motas del canto lo sigue */
    vientoY -= velScroll * 0.06 * m.dtReal;
    if (Math.abs(velScroll) > 30) sentido += ((velScroll > 0 ? 1 : -1) - sentido) * (1 - Math.exp(-m.dtReal * 2.5));
    leerImanes(m);
    luzFocal += ((nImanes ? 1 : 0) - luzFocal) * (1 - Math.exp(-m.dtReal * 1.5));
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
    const yLibre = Math.max(0, Math.min(m.alto, Math.floor((e.Sy + e.Sh * ((sala.p.fin ?? 1) - sala.p.fundido)) * E)));
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
