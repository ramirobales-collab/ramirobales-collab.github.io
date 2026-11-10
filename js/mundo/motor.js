/* motor.js — base del motor de «la sala negra»: contexto WebGL2, programas, texturas, destinos,
   niveles de calidad, bucle con pausa y estados. Sin dependencias. No sabe nada de la sala:
   quien dibuja se engancha en `alCuadro` (ver index.js). Plano: portfolio-docs/v3/motor.md. */

export const VS = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

/* Tabla de niveles (motor.md §7). `lado` = lado largo máximo de una lámina en memoria.
   `particulas`, `resplandor` y `lente` son para la segunda mitad (enjambre, post, lente). */
export const NIVELES = {
  1: { dpr: 1.0, largo: 1280, piramide: 2, tomas: 1, luces: 0, bruma: 1, tope: 30, lado: 1280, particulas: 2000, resplandor: 3, lente: false },
  2: { dpr: 1.0, largo: 2560, piramide: 3, tomas: 4, luces: 4, bruma: 2, tope: 60, lado: 2560, particulas: 6000, resplandor: 4, lente: true },
  3: { dpr: 1.5, largo: 2560, piramide: 4, tomas: 4, luces: 8, bruma: 3, tope: 60, lado: 2560, particulas: 12000, resplandor: 5, lente: true },
};

/* Devuelve el motor, o null si no hay WebGL2 con destinos flotantes (el motivo queda en data-estado y en la consola). */
export function crearMotor(lienzo, op = {}) {
  const gl = lienzo.getContext('webgl2', {
    alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
    powerPreference: 'high-performance', preserveDrawingBuffer: false,
  });
  const m = {
    lienzo, gl,
    nivel: 2, nivelFijo: false, P: NIVELES[2],
    ancho: 0, alto: 0, escala: 1,              // búfer en px y px de búfer por px CSS
    anchoCss: 0, altoCss: 0,
    t: 0, dt: 0, dtReal: 0, dtActos: 0, cuadros: 0, ms: 0, // reloj de animación, su dt, dt real acotado (resortes), dt de los actos, promedio de cuadro
    medida: { n: 0, suma: 0, peor: 0, gpu: 0, nGpu: 0 },    // intervalos entre cuadros dibujados (ms) y tiempo de GPU; quien mide la pone en cero
    tiempoFijo: op.tiempoFijo ?? null,         // ?t=: el reloj de animación no avanza
    sinTope: !!op.sinTope,                     // ?tope=0: dibuja en cada cuadro de la pantalla (para medir)
    quieto: !!op.quieto,                       // un cuadro por pedido y nada más
    perdido: false,
    /* Ganchos para la segunda mitad (enjambre, post, lente, fondo vivo). Ver progreso-motor-1.md. */
    ganchos: { sobreSala: [], post: null, sobreSalida: [], fondo: [], alNivel: [], alTamano: [], alPerder: [], alRestaurar: [] },
    alCuadro: null,                            // function(m) → true si hay que seguir animando
  };

  m.hitos = {};                                // cuándo se llegó a cada estado (ms desde la navegación), para pruebas
  m.estado = (nombre, motivo) => {
    lienzo.dataset.estado = nombre; m.hitos[nombre] = Math.round(performance.now());
    const grave = nombre.startsWith('error') || nombre === 'contexto-perdido';
    (grave ? console.warn : console.info)('mundo:', nombre, motivo ? '— ' + motivo : '');
  };

  if (!gl) { m.estado('sin-webgl2', 'el navegador no dio contexto WebGL2'); return null; }
  const flotante = gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float');
  if (!flotante) { m.estado('sin-webgl2', 'sin destinos de media precisión flotante'); return null; }
  m.tamMax = gl.getParameter(gl.MAX_TEXTURE_SIZE);

  /* ---------- Nivel ---------- */
  const grueso = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
  m.celular = grueso;
  const pedido = +op.nivel;
  if (pedido >= 1 && pedido <= 3) { m.nivel = pedido; m.nivelFijo = true; } else m.nivel = grueso ? 1 : 2;
  m.P = NIVELES[m.nivel];
  if (m.tiempoFijo != null || m.quieto) m.nivelFijo = true; // capturas deterministas: no cambia solo
  let techo = grueso ? 1 : 3;
  let sucio = true;
  function ponerNivel(n) {
    if (n === m.nivel || n < 1 || n > 3) return;
    m.nivel = n; m.P = NIVELES[n]; sucio = true;
    console.info('mundo: nivel', n, `(${m.ms.toFixed(1)} ms por cuadro)`);
    for (const f of m.ganchos.alNivel) f(m);
  }

  /* ---------- Programas ---------- */
  function compilar(tipo, fuente, nombre) {
    const s = gl.createShader(tipo);
    gl.shaderSource(s, fuente); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      const info = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(`shader «${nombre}»: ${info}`);
    }
    return s;
  }
  /* Devuelve { p, u }: `u[nombre]` = ubicación de cada uniforme activo (los arreglos, sin «[0]»).
     `salidas` = nombres de las salidas del programa de vértices que se graban (transform feedback). */
  m.programa = (fs, nombre, vs = VS, salidas = null) => {
    const p = gl.createProgram();
    const a = compilar(gl.VERTEX_SHADER, vs, nombre + ' (vértices)');
    const b = compilar(gl.FRAGMENT_SHADER, fs, nombre);
    gl.attachShader(p, a); gl.attachShader(p, b);
    if (salidas) gl.transformFeedbackVaryings(p, salidas, gl.INTERLEAVED_ATTRIBS); // simulación en GPU (enjambre)
    gl.linkProgram(p);
    gl.deleteShader(a); gl.deleteShader(b);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error(`programa «${nombre}»: ${gl.getProgramInfoLog(p)}`);
    return { p, u: uniformes(p) };
  };
  function uniformes(p) {
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) || 0;
    for (let i = 0; i < n; i++) {
      const inf = gl.getActiveUniform(p, i);
      if (inf) u[inf.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, inf.name);
    }
    return u;
  }
  /* Programa que se compila aparte, sin trabar la página (el de la sala tarda más de un segundo en compilar):
     devuelve { p, u, listo() }; `listo()` dice si ya se puede usar (y recién ahí llena `u`, o lanza si no compiló).
     Sin KHR_parallel_shader_compile espera en el momento, como `programa`. */
  m.programaAparte = (fs, nombre, vs = VS, salidas = null) => {
    const par = gl.getExtension('KHR_parallel_shader_compile');
    const p = gl.createProgram();
    const a = gl.createShader(gl.VERTEX_SHADER), b = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(a, vs); gl.compileShader(a);
    gl.shaderSource(b, fs); gl.compileShader(b);
    gl.attachShader(p, a); gl.attachShader(p, b);
    if (salidas) gl.transformFeedbackVaryings(p, salidas, gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(p);
    const pr = {
      p, u: null,
      listo() {
        if (pr.u) return true;
        if (par && !gl.isContextLost() && !gl.getProgramParameter(p, par.COMPLETION_STATUS_KHR)) return false;
        if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
          throw new Error(`shader «${nombre}»: ${gl.getShaderInfoLog(b) || gl.getShaderInfoLog(a) || gl.getProgramInfoLog(p)}`);
        }
        gl.deleteShader(a); gl.deleteShader(b);
        pr.u = uniformes(p);
        return true;
      },
    };
    return pr;
  };

  /* ---------- Texturas y destinos ---------- */
  m.textura = (ancho, alto, formato, { filtro = gl.LINEAR, niveles = 1, envolver = gl.CLAMP_TO_EDGE } = {}) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, niveles, formato, ancho, alto);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, niveles > 1 && filtro === gl.LINEAR ? gl.LINEAR_MIPMAP_LINEAR : filtro);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filtro);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, envolver);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, envolver);
    return t;
  };
  /* Sube un ImageBitmap tal cual: sin voltear ni premultiplicar (uv con origen arriba a la izquierda). */
  m.texturaDeImagen = (mapa, formato, op2) => {
    const t = m.textura(mapa.width, mapa.height, formato, op2);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, mapa);
    return t;
  };
  m.pixel = (r, g, b, a) => {
    const t = m.textura(1, 1, gl.RGBA8, { filtro: gl.NEAREST });
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([r, g, b, a]));
    return t;
  };
  /* Destino con una o más texturas de color (`formatos`: formatos internos, uno por salida). */
  m.destino = (ancho, alto, formatos, op2) => {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    const tex = formatos.map((f, i) => {
      const t = m.textura(ancho, alto, f, op2);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
      return t;
    });
    const bufs = formatos.map((_, i) => gl.COLOR_ATTACHMENT0 + i);
    gl.drawBuffers(bufs);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE || gl.isContextLost();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok) throw new Error('destino incompleto ' + ancho + '×' + alto);
    return { fb, tex, ancho, alto, bufs, liberar() { gl.deleteFramebuffer(fb); tex.forEach((t) => gl.deleteTexture(t)); } };
  };
  /* Destino sobre un nivel de una textura que ya existe (para armar pirámides). */
  m.destinoEnNivel = (tex, nivel) => {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, nivel);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
    return fb;
  };
  let vao = gl.createVertexArray();
  m.triangulo = () => { gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3); };

  /* Imagen → ImageBitmap sin tocar (ni color ni alfa). `lado` acota el lado largo. */
  m.cargarImagen = async (url, lado = 0) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} en ${url}`);
    const blob = await r.blob();
    const crudo = { premultiplyAlpha: 'none', colorSpaceConversion: 'none' };
    let mapa = await createImageBitmap(blob, crudo);
    const largo = Math.max(mapa.width, mapa.height);
    const tope = Math.min(lado || largo, m.tamMax);
    if (largo > tope) {
      const k = tope / largo;
      const chico = await createImageBitmap(blob, { ...crudo, resizeWidth: Math.round(mapa.width * k), resizeHeight: Math.round(mapa.height * k), resizeQuality: 'high' });
      mapa.close(); mapa = chico;
    }
    return mapa;
  };

  /* ---------- Tamaño ---------- */
  m.ajustar = () => {
    const cw = lienzo.clientWidth || innerWidth, ch = lienzo.clientHeight || innerHeight;
    const e = Math.min(devicePixelRatio || 1, m.P.dpr, m.P.largo / Math.max(cw, ch), 2560 / Math.max(cw, ch), 1440 / Math.min(cw, ch));
    const w = Math.max(2, Math.round(cw * e)), h = Math.max(2, Math.round(ch * e));
    m.anchoCss = cw; m.altoCss = ch; m.escala = w / cw;
    sucio = false;
    if (w === m.ancho && h === m.alto) return false;
    m.ancho = w; m.alto = h; lienzo.width = w; lienzo.height = h;
    for (const f of m.ganchos.alTamano) f(m);
    return true;
  };
  if ('ResizeObserver' in window) new ResizeObserver(() => { sucio = true; m.despertar(); }).observe(lienzo);
  else addEventListener('resize', () => { sucio = true; m.despertar(); });

  /* ---------- Medición (tiempo de GPU si se puede; si no, intervalo entre cuadros) ---------- */
  let cron = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  let consulta = null, midiendo = false, pendiente = false, sumaMs = 0, nMs = 0, alTope = 0;
  function medirAntes() {
    if (!cron || pendiente) return;
    if (!consulta) consulta = gl.createQuery(); // una sola consulta, que se reutiliza
    gl.beginQuery(cron.TIME_ELAPSED_EXT, consulta); midiendo = true;
  }
  function medirDespues(dtCrudo) {
    let ms = -1;
    if (cron) {
      if (midiendo) { gl.endQuery(cron.TIME_ELAPSED_EXT); midiendo = false; pendiente = true; }
      else if (pendiente && gl.getQueryParameter(consulta, gl.QUERY_RESULT_AVAILABLE)) {
        if (!gl.getParameter(cron.GPU_DISJOINT_EXT)) ms = gl.getQueryParameter(consulta, gl.QUERY_RESULT) / 1e6;
        pendiente = false;
      }
      if (ms >= 0) { m.medida.gpu += ms; m.medida.nGpu++; }
    } else if (dtCrudo > 0 && dtCrudo < 0.25) ms = dtCrudo * 1000;
    if (ms < 0) return;
    sumaMs += ms; nMs++;
    if (nMs < 60) return;
    m.ms = sumaMs / nMs; sumaMs = 0; nMs = 0;
    if (m.nivelFijo) return;
    /* subir recompila la sala (un tirón): nunca durante la secuencia de carga */
    const holgado = (cron ? m.ms < 11 : m.ms < 17.6) && m.t > 7; // sin cronómetro de GPU sólo se ve el tope de la pantalla
    if (m.ms > 22 && m.nivel > 1) { techo = m.nivel - 1; alTope = 0; ponerNivel(m.nivel - 1); }
    else if (holgado && m.nivel < techo) { if (++alTope >= 3) { alTope = 0; ponerNivel(m.nivel + 1); } }
    else alTope = 0;
  }
  m.ponerNivel = (n) => { m.nivelFijo = true; ponerNivel(n); m.despertar(); }; // para pruebas: fija el nivel a mano

  /* ---------- Bucle ---------- */
  let raf = 0, ultimo = 0, ultimoDibujo = 0, visible = document.visibilityState !== 'hidden';
  function cuadro(ahora) {
    raf = 0;
    if (m.perdido || !visible || !m.alCuadro) return;
    /* tope de cuadros del nivel: en pantallas de 120 o 144 Hz se dibuja uno de cada dos (y en celular, a 30) */
    if (!m.quieto && !m.sinTope && ahora - ultimoDibujo < 1000 / m.P.tope - 3.4) { raf = requestAnimationFrame(cuadro); return; }
    const crudo = ultimo ? (ahora - ultimo) / 1000 : 0;
    if (crudo > 0) { const e = crudo * 1000; m.medida.n++; m.medida.suma += e; if (e > m.medida.peor) m.medida.peor = e; }
    ultimo = ahora; ultimoDibujo = ahora;
    const dt = Math.min(crudo, 0.05);
    m.dtReal = m.quieto ? 0 : dt;
    if (m.tiempoFijo != null) { m.t = m.tiempoFijo; m.dt = 0; } else if (m.quieto) m.dt = 0; else { m.t += dt; m.dt = dt; }
    m.dtActos = m.dt > 0 ? Math.min(crudo, 0.25) : 0; // los actos son curvas en el tiempo: toleran cuadros largos sin ir en cámara lenta
    if (sucio) m.ajustar();
    medirAntes();
    const seguir = m.alCuadro(m);
    medirDespues(crudo);
    m.cuadros++;
    if (seguir && !m.quieto) raf = requestAnimationFrame(cuadro); else ultimo = 0;
  }
  /* Pide un cuadro (y con eso reanuda el bucle si estaba dormido). */
  m.despertar = () => { if (!raf && !m.perdido && visible && m.alCuadro) raf = requestAnimationFrame(cuadro); };
  m.parar = () => { if (raf) cancelAnimationFrame(raf); raf = 0; ultimo = 0; };
  document.addEventListener('visibilitychange', () => {
    visible = document.visibilityState !== 'hidden';
    if (visible) m.despertar(); else m.parar();
  });

  /* ---------- Pérdida y recuperación del contexto ---------- */
  lienzo.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); m.perdido = true; m.parar(); pendiente = false; midiendo = false; consulta = null;
    m.estado('contexto-perdido', 'el navegador retiró el contexto; se rearma al volver');
    for (const f of m.ganchos.alPerder) f(m);
  });
  lienzo.addEventListener('webglcontextrestored', () => {
    /* un contexto recuperado vuelve sin extensiones ni objetos: se piden y se crean de nuevo */
    gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float');
    cron = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    m.perdido = false; m.ancho = 0; m.alto = 0; sucio = true; vao = gl.createVertexArray();
    for (const f of m.ganchos.alRestaurar) f(m);
  });

  m.ajustar();
  return m;
}
