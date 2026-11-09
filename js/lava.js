/* Fondo del inicio: fluido tipo lámpara de lava en WebGL, escrito a mano y sin dependencias.
   Masas (metaballs) con gradiente analítico sobre un dominio deformado con ruido: el borde recibe fresnel
   violeta iridiscente y el centro queda profundo. Se dibuja a media resolución, se pausa fuera de vista y baja
   la calidad sola si la placa no llega. Con movimiento reducido o ?quieto=1 pinta un solo cuadro. */
const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#define N 8
uniform vec2 uRes;
uniform vec3 uB[N];
uniform float uT;
uniform float uClaro;
uniform float uApaisado;

vec3 permuta(vec3 x){return mod(((x*34.)+1.)*x,289.);}
float ruido(vec2 v){
  const vec4 C=vec4(.211324865,.366025404,-.577350269,.024390244);
  vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=x0.x>x0.y?vec2(1.,0.):vec2(0.,1.);
  vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod(i,289.);
  vec3 p=permuta(permuta(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
  vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);m=m*m;m=m*m;
  vec3 x=2.*fract(p*C.www)-1.;vec3 h=abs(x)-.5;vec3 a0=x-floor(x+.5);
  m*=1.79284291-.85373472*(a0*a0+h*h);
  vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.*dot(m,g);
}
float azar(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}

void main(){
  vec2 uv=gl_FragCoord.xy/uRes;
  float asp=uRes.x/uRes.y;
  vec2 p=(gl_FragCoord.xy-.5*uRes)/uRes.y;

  /* Dominio deformado: es lo que saca a las masas de la forma de círculo perfecto. */
  float t=uT;
  vec2 w=p+.085*vec2(ruido(p*1.25+vec2(0.,t*.05)),ruido(p*1.25+vec2(5.2,-t*.04)));
  w+=.022*vec2(ruido(w*3.3+vec2(t*.04,1.7)),ruido(w*3.3+vec2(8.3,t*.035)));

  /* Campo y gradiente analítico: una sola pasada, sin evaluar el campo tres veces. */
  float f=0.;vec2 g=vec2(0.);
  for(int i=0;i<N;i++){
    vec2 d=w-uB[i].xy;float r2=uB[i].z*uB[i].z;float q=dot(d,d)+.012;
    f+=r2/q;g-=2.*r2*d/(q*q);
  }
  float suave=1./((1.+f)*(1.+f));
  vec3 n=normalize(vec3(-g*suave*.62,1.));
  float cuerpo=smoothstep(.88,1.07,f);
  float halo=smoothstep(.16,.98,f)*(1.-cuerpo);
  float rim=pow(1.-n.z,1.55);

  /* Iridiscencia acotada a la familia violeta: nunca arcoíris. */
  float fase=n.x*1.15+n.y*.8+f*.05+t*.012+p.x*.25;
  vec3 violeta=vec3(.50,.27,.98),magenta=vec3(.85,.32,.92),indigo=vec3(.27,.36,.98);
  vec3 iris=mix(violeta,magenta,.5+.5*sin(fase*3.1));
  iris=mix(iris,indigo,.5+.5*sin(fase*2.2+1.9));

  vec3 l=normalize(vec3(.38,.72,.58));
  vec3 h=normalize(l+vec3(0.,0.,1.));
  float brillo=pow(max(dot(n,h),0.),120.);
  float brillo2=pow(max(dot(n,normalize(vec3(-.5,-.45,.74))),0.),26.);

  /* Luz de lámpara: viene de abajo y atraviesa las masas. */
  float base=clamp(.62-uv.y,0.,1.);
  vec3 col;float alfa;

  /* Tema oscuro: centro profundo, borde que emite. */
  vec3 o=vec3(.026,.018,.046)+vec3(.018,.008,.04)*(1.-uv.y);
  vec3 interior=mix(vec3(.052,.024,.11),vec3(.2,.055,.33),base*base*1.7);
  o=mix(o,interior,cuerpo);
  o+=iris*rim*cuerpo*1.55;
  o+=iris*iris*pow(rim,3.)*cuerpo*1.1;
  o+=vec3(.97,.9,1.)*brillo*cuerpo*.42;
  o+=magenta*brillo2*cuerpo*.13;
  o+=mix(violeta,magenta,base)*halo*halo*.42;

  /* Tema claro: perla y lila sobre el marfil de la página. */
  vec3 c=mix(vec3(.93,.90,1.),vec3(.75,.67,.99),clamp(rim*1.6+base*.5,0.,1.));
  c=mix(c,vec3(.40,.17,.84),pow(rim,1.8)*.86);
  c+=vec3(1.)*brillo*.35;
  c=mix(mix(violeta,vec3(.9,.86,1.),.72),c,cuerpo);
  float ac=max(cuerpo*.96,halo*halo*.26);

  /* El texto vive a la izquierda: ahí el fondo se apaga. En vertical el texto ocupa la parte de arriba: ahí se
     apaga más (la bajada daba 3,57:1 en celular) y abajo, donde están las capturas, conserva el brillo. */
  float vertical=mix(.6,.34,smoothstep(.3,.56,uv.y));
  float apaga=mix(vertical,mix(.2,1.,smoothstep(-.28*asp,.14*asp,p.x)),uApaisado);
  o*=apaga;
  o+=vec3(.026,.018,.046)*(1.-apaga);
  ac*=apaga;

  /* La parte de abajo se funde con la página. */
  float funde=smoothstep(0.,.2,uv.y);
  col=mix(o,c,uClaro);
  alfa=mix(1.,ac,uClaro)*funde;
  col+=(azar(gl_FragCoord.xy+fract(t))-.5)/255.*2.;
  gl_FragColor=vec4(col*alfa,alfa);
}`;

const BOLAS = [
  // x, amplitud x, período x, y, amplitud y, período y, radio
  [0.34, 0.1, 71, -0.05, 0.42, 53, 0.17],
  [0.1, 0.13, 83, 0.1, 0.46, 67, 0.125],
  [0.52, 0.08, 61, 0.14, 0.38, 47, 0.115],
  [0.2, 0.09, 59, -0.26, 0.3, 79, 0.125],
  [0.44, 0.11, 97, -0.32, 0.26, 59, 0.13],
  [-0.08, 0.1, 89, -0.2, 0.44, 73, 0.1],
  [0.62, 0.05, 53, -0.1, 0.5, 41, 0.095],
];
const QS = new URLSearchParams(location.search);

export function iniciar(lienzo, cabecera) {
  const reducido = matchMedia('(prefers-reduced-motion: reduce)');
  const tFijo = QS.has('t') ? parseFloat(QS.get('t')) : null;
  const quieto = () => QS.get('quieto') === '1' || reducido.matches || tFijo !== null;
  const opciones = { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' };
  // Cada salida deja su estado en data-estado y en la consola: sin esto, un fallo en el celular no dejaba rastro.
  const fallar = (estado, detalle) => { lienzo.dataset.estado = estado; console.warn(`fondo líquido: ${estado}`, detalle || ''); return false; };
  let gl = null;
  try { gl = lienzo.getContext('webgl', opciones) || lienzo.getContext('experimental-webgl', opciones); } catch (e) { return fallar('sin-webgl', e); }
  if (!gl) return fallar('sin-webgl', 'el navegador no dio un contexto WebGL');
  const U = {};
  const preparar = () => {
    const compilar = (tipo, src, nombre) => {
      const sh = gl.createShader(tipo); gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(`${nombre}: ${gl.getShaderInfoLog(sh)}`);
      return sh;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compilar(gl.VERTEX_SHADER, VERT, 'vértices'));
    gl.attachShader(prog, compilar(gl.FRAGMENT_SHADER, FRAG, 'fragmentos'));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'no enlazó');
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    gl.clearColor(0, 0, 0, 0);
    ['uRes', 'uB', 'uT', 'uClaro', 'uApaisado'].forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
  };
  try { preparar(); } catch (e) { return fallar('error-shader', e.message); }

  const datos = new Float32Array(8 * 3);
  const puntero = { x: 0, y: 0, ax: 0, ay: 0, fuerza: 0, objetivo: 0 };
  let calidad = 1, ancho = 0, alto = 0, asp = 1, t0 = performance.now() / 1000 + 37, cuadro = 0, activo = true, raf = 0;
  let muestras = 0, acumulado = 0, previo = 0;

  const esClaro = () => {
    const tema = document.documentElement.dataset.theme;
    return tema === 'light' || (tema !== 'dark' && matchMedia('(prefers-color-scheme: light)').matches);
  };
  const medir = () => {
    const bajo = cabecera.getBoundingClientRect().bottom + scrollY;
    lienzo.style.height = `${Math.ceil(bajo)}px`;
    const css = lienzo.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const escala = Math.min(0.62 * dpr * calidad, 1000 / Math.max(css.width, 1));
    const w = Math.max(2, Math.round(css.width * escala));
    const h = Math.max(2, Math.round(css.height * escala));
    if (w !== ancho || h !== alto) { ancho = w; alto = h; lienzo.width = w; lienzo.height = h; }
    gl.viewport(0, 0, w, h);
    asp = w / h;
    gl.uniform2f(U.uRes, w, h);
    gl.uniform1f(U.uApaisado, asp > 1.1 ? 1 : 0);
  };
  const pintar = (t) => {
    const ap = asp > 1.1;
    const ex = ap ? asp : 1.05;
    const cx = ap ? 0 : -0.1;
    const er = ap ? 1 : 0.86;
    for (let i = 0; i < BOLAS.length; i++) {
      const b = BOLAS[i];
      const x = (b[0] * 0.92 + cx + b[1] * Math.sin((t * 6.283) / b[2] + i * 1.7)) * ex;
      const y = b[3] + b[4] * Math.sin((t * 6.283) / b[5] + i * 2.3);
      datos[i * 3] = x; datos[i * 3 + 1] = y;
      datos[i * 3 + 2] = b[6] * er * (1 + 0.1 * Math.sin((t * 6.283) / (b[5] * 0.7) + i));
    }
    puntero.ax += (puntero.x - puntero.ax) * 0.05;
    puntero.ay += (puntero.y - puntero.ay) * 0.05;
    puntero.fuerza += (puntero.objetivo - puntero.fuerza) * 0.04;
    datos[21] = puntero.ax; datos[22] = puntero.ay; datos[23] = 0.095 * puntero.fuerza;
    gl.uniform3fv(U.uB, datos);
    gl.uniform1f(U.uT, t);
    gl.uniform1f(U.uClaro, esClaro() ? 1 : 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  const un_cuadro = () => pintar(tFijo !== null ? tFijo : t0);
  const bucle = (ms) => {
    raf = activo ? requestAnimationFrame(bucle) : 0;
    if (!activo) return;
    cuadro++;
    if (cuadro % 2) return; // unos 30 cuadros por segundo alcanzan para algo que se mueve tan lento
    const d = previo ? ms - previo : 33; previo = ms;
    // Si la placa no llega, baja la resolución antes de que se note.
    if (d < 250) { acumulado += d; muestras++; }
    if (muestras === 40) {
      if (acumulado / muestras > 48 && calidad > 0.5) { calidad = Math.max(0.5, calidad - 0.25); medir(); }
      muestras = 0; acumulado = 0;
    }
    pintar(ms / 1000 + 37);
  };
  const arrancar = () => { if (!raf && activo && !quieto()) { previo = 0; raf = requestAnimationFrame(bucle); } };

  medir();
  un_cuadro();
  lienzo.classList.add('listo');
  lienzo.dataset.estado = 'listo';
  arrancar();

  new ResizeObserver(() => { medir(); if (quieto()) un_cuadro(); }).observe(cabecera);
  addEventListener('resize', () => { medir(); if (quieto()) un_cuadro(); }, { passive: true });
  new IntersectionObserver(([e]) => { activo = e.isIntersecting && !document.hidden; arrancar(); }).observe(lienzo);
  document.addEventListener('visibilitychange', () => { activo = !document.hidden; arrancar(); });
  new MutationObserver(un_cuadro).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  reducido.addEventListener('change', () => { if (quieto()) { cancelAnimationFrame(raf); raf = 0; un_cuadro(); } else arrancar(); });
  lienzo.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); activo = false; cancelAnimationFrame(raf); raf = 0;
    lienzo.classList.remove('listo'); fallar('contexto-perdido', 'el sistema liberó la placa; se rearma al volver');
  });
  lienzo.addEventListener('webglcontextrestored', () => {
    try { preparar(); } catch (e) { fallar('error-shader', e.message); return; }
    ancho = 0; medir(); un_cuadro(); lienzo.classList.add('listo'); lienzo.dataset.estado = 'listo';
    activo = !document.hidden; arrancar();
  });

  const obras = reducido.matches ? null : cabecera.querySelector('.heroe__obras');
  if (matchMedia('(hover: hover)').matches) {
    addEventListener('pointermove', (e) => {
      const r = lienzo.getBoundingClientRect();
      if (e.clientY > r.bottom) { puntero.objetivo = 0; return; }
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = 0.5 - (e.clientY - r.top) / r.height;
      puntero.x = nx * asp; puntero.y = ny; puntero.objetivo = 1;
      if (obras) { obras.style.setProperty('--px', (nx * -14).toFixed(2)); obras.style.setProperty('--py', (ny * 10).toFixed(2)); }
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { puntero.objetivo = 0; });
  }
  return true;
}
