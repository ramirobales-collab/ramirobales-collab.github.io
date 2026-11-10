/* post.js — resplandor de «la sala negra»: umbral suave, cadena de reducciones y vuelta sumando (motor.md §4.3).
   Deja el resultado en `sala.resplandor`; lo suma la salida de sala.js, que además pone la viñeta y el grano con
   tramado. Los negros quedan en negro: lo que no pasa el umbral no suma nada. Sin asignaciones por cuadro. */

const CABEZA = `#version 300 es
precision highp float;
precision highp sampler2D;
uniform sampler2D u_t;
uniform vec2 u_px;      // tamaño de un texel de la fuente
out vec4 o;
`;
/* Primera reducción: cuatro tomas bilineales (16 texeles), umbral con rodilla y promedio de Karis (una mota sola no parpadea). */
const FS_UMBRAL = CABEZA + `
uniform vec2 u_umbral;  // umbral, rodilla
vec4 toma(vec2 uv){
  vec3 c = min(max(texture(u_t, uv).rgb, 0.0), 24.0);
  float b = max(c.r, max(c.g, c.b));
  float r = clamp(b - u_umbral.x + u_umbral.y, 0.0, 2.0 * u_umbral.y);
  c *= max(r * r / (4.0 * u_umbral.y + 1e-4), b - u_umbral.x) / max(b, 1e-4);
  float w = 1.0 / (1.0 + max(c.r, max(c.g, c.b)));
  return vec4(c * w, w);
}
void main(){
  vec2 uv = gl_FragCoord.xy * 2.0 * u_px;
  vec4 s = toma(uv + u_px * vec2(-1.0, -1.0)) + toma(uv + u_px * vec2(1.0, -1.0)) + toma(uv + u_px * vec2(-1.0, 1.0)) + toma(uv + u_px * vec2(1.0, 1.0));
  o = vec4(s.rgb / max(s.a, 1e-4), 1.0);
}`;
/* Reducción a la mitad: centro + cuatro diagonales. */
const FS_BAJA = CABEZA + `
void main(){
  vec2 uv = gl_FragCoord.xy * 2.0 * u_px;
  vec3 c = texture(u_t, uv).rgb * 4.0;
  c += texture(u_t, uv + u_px * vec2(-2.0, -2.0)).rgb + texture(u_t, uv + u_px * vec2(2.0, -2.0)).rgb;
  c += texture(u_t, uv + u_px * vec2(-2.0, 2.0)).rgb + texture(u_t, uv + u_px * vec2(2.0, 2.0)).rgb;
  o = vec4(c / 8.0, 1.0);
}`;
/* Vuelta: carpa de 3×3 sobre el nivel más chico; se suma al nivel que sigue. */
const FS_SUBE = CABEZA + `
uniform float u_peso;
void main(){
  vec2 uv = gl_FragCoord.xy * 0.5 * u_px;
  vec3 c = texture(u_t, uv).rgb * 4.0;
  c += (texture(u_t, uv + u_px * vec2(-1.0, 0.0)).rgb + texture(u_t, uv + u_px * vec2(1.0, 0.0)).rgb
      + texture(u_t, uv + u_px * vec2(0.0, -1.0)).rgb + texture(u_t, uv + u_px * vec2(0.0, 1.0)).rgb) * 2.0;
  c += texture(u_t, uv + u_px * vec2(-1.0, -1.0)).rgb + texture(u_t, uv + u_px * vec2(1.0, -1.0)).rgb
     + texture(u_t, uv + u_px * vec2(-1.0, 1.0)).rgb + texture(u_t, uv + u_px * vec2(1.0, 1.0)).rgb;
  o = vec4(c / 16.0 * u_peso, 1.0);
}`;

export function crearPost(motor) {
  const gl = motor.gl;
  let listo = false, pUmbral, pBaja, pSube, cadena = [], anchoC = 0, altoC = 0, nivelesC = 0;

  function armar() {
    pUmbral = motor.programaAparte(FS_UMBRAL, 'resplandor (umbral)');
    pBaja = motor.programaAparte(FS_BAJA, 'resplandor (baja)');
    pSube = motor.programaAparte(FS_SUBE, 'resplandor (sube)');
    cadena = []; anchoC = 0; listo = true;
  }
  function destinos(w, h, n) {
    if (w === anchoC && h === altoC && n === nivelesC) return;
    for (const d of cadena) d.liberar();
    cadena = [];
    let a = w, b = h;
    for (let i = 0; i < n; i++) {
      a = Math.max(2, a >> 1); b = Math.max(2, b >> 1);
      cadena.push(motor.destino(a, b, [gl.RGBA16F]));
    }
    anchoC = w; altoC = h; nivelesC = n;
  }
  function pase(d) { gl.bindFramebuffer(gl.FRAMEBUFFER, d.fb); gl.viewport(0, 0, d.ancho, d.alto); }

  /* Gancho de post: recibe el color lineal de la sala (ya con el enjambre) y devuelve la textura a mostrar. */
  function gancho(m, sala) {
    if (m.perdido) return sala.texColor;
    if (!listo) armar();
    if (!pUmbral.listo() || !pBaja.listo() || !pSube.listo()) { sala.fuerzaResplandor = 0; return sala.texColor; }
    const n = m.P.resplandor;
    destinos(sala.ancho, sala.alto, n);
    gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
    gl.activeTexture(gl.TEXTURE0);
    /* baja */
    pase(cadena[0]);
    gl.useProgram(pUmbral.p); gl.uniform1i(pUmbral.u.u_t, 0);
    gl.bindTexture(gl.TEXTURE_2D, sala.texColor);
    gl.uniform2f(pUmbral.u.u_px, 1 / sala.ancho, 1 / sala.alto);
    gl.uniform2f(pUmbral.u.u_umbral, 0.62, 0.38);
    motor.triangulo();
    gl.useProgram(pBaja.p); gl.uniform1i(pBaja.u.u_t, 0);
    for (let i = 1; i < n; i++) {
      pase(cadena[i]);
      gl.bindTexture(gl.TEXTURE_2D, cadena[i - 1].tex[0]);
      gl.uniform2f(pBaja.u.u_px, 1 / cadena[i - 1].ancho, 1 / cadena[i - 1].alto);
      motor.triangulo();
    }
    /* sube sumando: cada nivel aporta un halo más ancho */
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(pSube.p); gl.uniform1i(pSube.u.u_t, 0);
    for (let i = n - 1; i > 0; i--) {
      pase(cadena[i - 1]);
      gl.bindTexture(gl.TEXTURE_2D, cadena[i].tex[0]);
      gl.uniform2f(pSube.u.u_px, 1 / cadena[i].ancho, 1 / cadena[i].alto);
      gl.uniform1f(pSube.u.u_peso, 1.0);
      motor.triangulo();
    }
    gl.disable(gl.BLEND);
    sala.resplandor = cadena[0].tex[0];
    sala.fuerzaResplandor = 0.5 / n * (0.5 + 0.5 * sala.p.entrada);
    api.dibujo = true;
    return sala.texColor;
  }

  motor.ganchos.post = gancho;
  motor.ganchos.alPerder.push(() => { listo = false; cadena = []; anchoC = 0; });
  armar();
  const api = { dibujo: false, listo: () => listo && pUmbral.listo() && pBaja.listo() && pSube.listo() };
  return api;
}
