/* lente.js — lente de rayos X de «la sala negra» (motor.md §4.4): con puntero fino, un disco con inercia muestra
   el plano de líneas debajo de la materia, con aumento 1,15 y desfase cromático en el borde; al lado, la lectura
   real de profundidad en metros bajo el cursor y el nombre del producto. Nunca aparece sobre el texto, no atrapa
   eventos y no reemplaza el cursor. Sin asignaciones por cuadro. */

const RADIO = 92;                 // px CSS
const NOMBRES = ['Cathedra', 'Fortal', 'AthleteIQ', 'coro'];   // orden de la máscara (32, 64, 96, 128)

const FS_LENTE = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D u_c, u_i;   // color lineal de la sala; info (R = distancia, G = máscara, B = línea, A = materia)
uniform vec2 u_lienzo;
uniform vec4 u_lente;         // centro (px de búfer, origen arriba a la izquierda), radio, opacidad
uniform float u_e;            // px de búfer por px CSS
out vec4 o;
vec2 uvDe(vec2 q){ return vec2(q.x, u_lienzo.y - q.y) / u_lienzo; }
/* vista de líneas en un punto: materia oscurecida + contornos y grilla + curvas de nivel de la profundidad */
vec3 rayos(vec2 q){
  vec2 uv = uvDe(q);
  vec3 c = max(texture(u_c, uv).rgb, 0.0);
  vec4 inf = texture(u_i, uv);
  /* curvas de nivel de la profundidad: una fina cada 5 cm y una marcada cada 25 cm (el relieve de la escena, como en un plano) */
  float d = inf.r * 20.0, w = max(fwidth(d), 1e-4);
  float fina = (1.0 - smoothstep(0.0, 1.2, abs(fract(d - 0.5) - 0.5) / w)) * (1.0 - smoothstep(0.25, 0.6, w));
  float d5 = d / 5.0, w5 = max(fwidth(d5), 1e-4);
  float marcada = (1.0 - smoothstep(0.0, 1.4, abs(fract(d5 - 0.5) - 0.5) / w5)) * (1.0 - smoothstep(0.3, 0.7, w5));
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return vec3(lum * 0.09) + c * 0.06 + vec3(0.80, 0.90, 1.0) * (inf.b * 1.5 + (fina * 0.22 + marcada * 0.5) * step(0.01, inf.r));
}
void main(){
  vec2 q = vec2(gl_FragCoord.x, u_lienzo.y - gl_FragCoord.y);
  vec2 r = q - u_lente.xy;
  float l = length(r), R = u_lente.z;
  if (l > R + 14.0 * u_e) discard;
  if (l > R + 2.0 * u_e) {   // sombra corta alrededor: separa el disco de una pantalla clara
    float s = 1.0 - (l - R) / (14.0 * u_e);
    o = vec4(0.0, 0.0, 0.0, 0.4 * s * s * u_lente.w); return;
  }
  vec2 dir = r / max(l, 1e-3);
  float borde = smoothstep(R * 0.72, R, l);
  /* aumento 1,15 (un poco más hacia el borde, como una lupa) y desfase cromático de 2 px en el borde */
  vec2 f = u_lente.xy + r / (1.15 + 0.1 * borde * borde);
  vec2 des = dir * (2.0 * u_e) * borde;
  vec3 c = vec3(rayos(f - des).r, rayos(f).g, rayos(f + des).b);
  c += vec3(0.010, 0.014, 0.022) * (1.0 - borde);             // el vidrio apenas se ve
  c *= 1.0 - 0.35 * borde * borde;
  /* aro de 1 px, también con el desfase: rojo adentro, azul afuera */
  vec3 aro = vec3(1.0 - smoothstep(0.0, 0.9 * u_e, abs(l - (R - 1.2 * u_e))),
                  1.0 - smoothstep(0.0, 0.9 * u_e, abs(l - R)),
                  1.0 - smoothstep(0.0, 0.9 * u_e, abs(l - (R + 1.2 * u_e))));
  c += aro * 0.55;
  c = mix(c, 0.8 + 0.2 * (1.0 - exp(-(c - 0.8) / 0.2)), step(0.8, c));
  c = mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  float a = u_lente.w * (1.0 - smoothstep(R + 0.5 * u_e, R + 2.0 * u_e, l));
  o = vec4(c * a, max(a, 0.4 * u_lente.w));
}`;

/* `ctx` (lo arma index.js): { puntero: { x, y, fino, dentro, sobreTexto }, heroe } */
export function crearLente(motor, ctx) {
  const gl = motor.gl;
  let listo = false, prog;
  const pos = { x: 0, y: 0, vx: 0, vy: 0, puesta: false };
  let opacidad = 0, ultLectura = 0, textoM = '', textoObra = '', lx = -1e9, ly = -1e9, visible = false;
  const lectura = new Float32Array(4);
  const coma = () => (document.documentElement.lang || 'es').startsWith('en') ? '.' : ',';

  /* la lectura es DOM (texto nítido), decorativa: fuera del árbol de accesibilidad */
  const caja = document.createElement('div');
  caja.className = 'lente__lectura'; caja.setAttribute('aria-hidden', 'true');
  const elM = document.createElement('span'); elM.className = 'lente__metros';
  const elObra = document.createElement('span'); elObra.className = 'lente__obra';
  caja.append(elM, elObra);
  ctx.heroe.appendChild(caja);

  function armar() { prog = motor.programaAparte(FS_LENTE, 'lente'); listo = true; }

  function gancho(m, sala) {
    const pu = ctx.puntero;
    const quiere = m.P.lente && pu.fino && pu.dentro && !pu.sobreTexto && !m.quieto && sala.listoColor && sala.aLaVista();
    const dt = m.dtReal;
    opacidad += ((quiere ? 1 : 0) - opacidad) * (1 - Math.exp(-dt * (quiere ? 9 : 14)));
    if (m.tiempoFijo != null && quiere) opacidad = 1;   // capturas: sin esperar al fundido
    if (opacidad < 0.004) {
      opacidad = 0; pos.puesta = false;
      if (visible) { visible = false; caja.classList.remove('visible'); }
      return;
    }
    if (m.perdido) return;
    if (!listo) armar();
    if (!prog.listo()) return;
    /* inercia: resorte críticamente amortiguado hacia el puntero */
    if (!pos.puesta) { pos.x = pu.x; pos.y = pu.y; pos.vx = pos.vy = 0; pos.puesta = true; }
    const w = 15, e = Math.exp(-w * dt);
    let d = pos.x - pu.x, b = (pos.vx + w * d) * dt;
    pos.x = pu.x + (d + b) * e; pos.vx = (pos.vx - w * b) * e;
    d = pos.y - pu.y; b = (pos.vy + w * d) * dt;
    pos.y = pu.y + (d + b) * e; pos.vy = (pos.vy - w * b) * e;

    const E = m.escala;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, m.ancho, m.alto);
    if (!sala.recortar()) return;
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(prog.p);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, sala.texInfo); gl.uniform1i(prog.u.u_i, 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sala.texColor); gl.uniform1i(prog.u.u_c, 0);
    gl.uniform2f(prog.u.u_lienzo, m.ancho, m.alto);
    gl.uniform4f(prog.u.u_lente, pos.x * E, pos.y * E, RADIO * E, opacidad);
    gl.uniform1f(prog.u.u_e, E);
    motor.triangulo();
    gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);

    /* lectura: un píxel de la profundidad compuesta, a lo sumo 10 veces por segundo */
    const ahora = performance.now();
    if (ahora - ultLectura > 100) {
      ultLectura = ahora;
      sala.leer(pu.x, pu.y, lectura);
      const metros = lectura[0] + sala.cam.tz;             // distancia a la cámara de la foto
      const tm = metros > 0.05 ? metros.toFixed(2).replace('.', coma()) + ' m' : '';
      if (tm !== textoM) { textoM = tm; elM.textContent = tm; }
      const i = Math.round(lectura[1] * 255 / 32) - 1;
      const to = i >= 0 && i < 4 && Math.abs(lectura[1] * 255 - (i + 1) * 32) < 3 ? NOMBRES[i] : '';
      if (to !== textoObra) { textoObra = to; elObra.textContent = to; }
    }
    /* al costado del disco (del otro lado si no entra) */
    const hx = pos.x + RADIO * 0.78 + 150 > m.anchoCss ? pos.x - RADIO * 0.78 - 150 : pos.x + RADIO * 0.78;
    const hy = pos.y + RADIO * 0.78 - ctx.topeHeroe();
    if (Math.abs(hx - lx) > 0.5 || Math.abs(hy - ly) > 0.5) { lx = hx; ly = hy; caja.style.transform = `translate3d(${hx.toFixed(1)}px,${hy.toFixed(1)}px,0)`; }
    const ver = opacidad > 0.5 && quiere;
    if (ver !== visible) { visible = ver; caja.classList.toggle('visible', ver); }
  }

  motor.ganchos.sobreSalida.push(gancho);
  motor.ganchos.alPerder.push(() => { listo = false; });
  armar();
  return { pos };
}
