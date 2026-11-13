# Ramiro Bales — portfolio

Sitio de Ramiro Bales, AI Product Builder: <https://ramirobales-collab.github.io/>

Es un sitio estático, sin frameworks ni dependencias de compilación, publicado con GitHub Pages. La portada es una sala de estudio renderizada en Blender por capas con profundidad que un motor WebGL2 propio compone en el navegador: paralaje real por capa, foco que cambia de plano y miles de partículas que se esconden detrás de los objetos. Todo es mejora progresiva: sin WebGL2, con ahorro de datos o con movimiento reducido queda la foto final y el sitio funciona igual.

*English summary at the end.*

## Estructura

```
index.html                portada
proyectos/                los seis casos y la revisión de seguridad (ES y EN)
demos/                    demos para marcas (configurador 3D, asistente, bots) y la demo de AthleteIQ
js/comun.js               idioma, tema, navegación (módulo ES)
js/movimiento.js          transiciones de texto
js/mundo/                 motor WebGL2 propio: motor, sala, enjambre, post, lente, fondo, index
css/                      variables (paleta), base, componentes, mundo, caso
i18n/                     diccionarios ES/EN
assets/mundo/             láminas por capa (color, profundidad, normales) en horizontal y vertical,
                          pósters, mundo.json (cámara y zonas de cada producto) e imagen para compartir
lib/                      bibliotecas de terceros servidas desde el mismo origen (three.js, sólo en demos)
cv/                       CV en PDF y HTML (ES y EN)
herramientas/critico.py   CSS crítico en línea
herramientas/proteccion.py política de seguridad de contenido por página
herramientas/sitemap.py   lastmod del sitemap a partir de git
herramientas/ci/          flujo de integración continua y dependabot, listos para activar
pruebas/                  pruebas sin dependencias
.gitattributes            LF en todo el texto, binarios marcados
.well-known/security.txt  contacto de seguridad (RFC 9116)
SEGURIDAD.md · LICENSE
```

## Verlo en local

Hace falta un servidor (los módulos ES no cargan desde `file://`). Cualquiera de los dos:

```
node pruebas/lib/servidor.mjs 8800      # se porta como GitHub Pages: 404.html con código 404
python -m http.server 8800
```

y abrir <http://127.0.0.1:8800/>. Parámetros útiles: `?quieto=1` (sin animación), `?mundo=0` (sin motor, foto final), `?tema=light|dark`, `?idioma=es|en`, `?t=12` (tiempo congelado para capturas), `?acto=defino|diseno|verifico`.

## Cómo se verifica

```
node pruebas/correr.mjs                  # todas; sale con 1 si algo falla
node pruebas/correr.mjs --sin-navegador  # sólo las estáticas (segundos)
node pruebas/correr.mjs --gpu            # humo y vitales con la placa de video real
node pruebas/correr.mjs --rapido         # sin recorrer el historial de git
node pruebas/correr.mjs --solo=politica  # una sola
python herramientas/proteccion.py --comprobar
```

Requisitos: Node 22 o más nuevo y, para humo y vitales, Edge, Chrome o Chromium instalado (o `NAVEGADOR=<ruta>`). No se instala nada. Ninguna llamada al navegador espera para siempre: cada mensaje tiene un tope de 30 s y cada visita uno de 60 s, y una pestaña colgada se informa con su URL y la corrida sigue.

| prueba | qué comprueba |
|---|---|
| `enlaces` | todo `href`, `src`, `srcset`, `poster`, `url()` del CSS, `import` del JS, ícono del manifest y URL del sitemap apunta a un archivo que existe, y toda ancla a un `id` de la página destino |
| `i18n` | los diccionarios ES y EN tienen las mismas claves, sin vacíos ni marcadores distintos, y toda clave que usa una página existe |
| `politica` | cada página tiene su política de seguridad justo después de `charset`, con los hashes **recalculados en JavaScript** iguales a los declarados (independiente del guion de Python), sin `unsafe-*`, sin manejadores ni `style=` en línea; `referrer` estricto; `security.txt` válido y vigente |
| `basicos` | `lang`, `title`, descripción, `viewport`, un solo `h1`, `alt` en toda imagen, ids sin repetir, `noopener noreferrer` en pestañas nuevas, JSON-LD válido, sitemap igual a las páginas indexables |
| `terceros` | ningún recurso ni pedido a otro origen en HTML, CSS ni JS propio |
| `veracidad` | límites de contenido del sitio (nombres que no se publican, lo que no se dice de cada producto, cifras declaradas: una sola cifra de pruebas en miles y las de coro). Lo que no se puede nombrar se compara por **huella** (`pruebas/lib/huella.mjs`), así la lista no queda escrita en el repo; se revisa también en `pruebas/` y `herramientas/` |
| `contraste` | sin navegador: lee los tokens de `css/variables.css` (oklch, alfa, `light-dark()`), compone las superficies translúcidas sobre el fondo y mide 44 pares texto/fondo en claro y oscuro con la fórmula de WCAG. Vara: claro, texto 7:1, secundario 4,5:1, bordes, foco y texto grande 3:1; oscuro, 4,5:1 y 3:1 |
| `presupuestos` | pesos de las láminas, los pósters, el CSS crítico y la primera carga de la portada (abajo) |
| `secretos` | sin credenciales, archivos de claves, servicios propios (por huella), rutas de una máquina local ni correos no declarados, en el árbol y en todo el historial de git |
| `humo` | cada página en el navegador, en oscuro/ES y claro/EN, recorrida entera: 0 violaciones de la política, 0 errores de consola, 0 pedidos fallidos o a terceros, sin desborde horizontal, almacenamiento dentro de lo declarado, 0 cookies. En la portada además: el motor llega a `listo`, los respaldos (`?mundo=0`, sin WebGL, `?quieto=1`) dejan la foto y los enlaces, celular, `?idioma=zz` se ignora, y la primera carga medida en red |
| `vitales` | en frío (perfil nuevo, sin caché, red de 150 ms y 1,6 Mbit/s, CPU ×4): salto de maquetado ≤ 0,05 en portada, 404, créditos y legal; ninguna tarea larga de más de 250 ms después del primer pintado; en la portada, la primera vista del motor a menos de 3 s de empezar a cargar; con movimiento reducido, un verbo cambia la sala; sin placa de video (SwiftShader), el motor da 10 cuadros por segundo o cae al póster |
| `pausa` | el motor de la portada sobrevive a quedar sin cuadros o sin tamaño sin aviso (panel oculto, ventana tapada, pestaña de fondo): cuadros a uno por segundo durante el arranque, ventana en cero con el motor listo, carga con la ventana en cero, pestaña de fondo y respaldo por lentitud que se recupera al volver. Con placa real queda `listo` y dibujando; por software va al póster sin excepciones |

Las excepciones y varas de cada prueba están en `pruebas/config.json`, cada una con su motivo. En CI (`CI=1`) la de humo visita cada página interior una vez, alternando oscuro/ES y claro/EN, para entrar en el tope del flujo.

## Presupuestos (medidos el 10/11/2026)

| qué | medido | tope |
|---|---|---|
| Juego de láminas horizontal (`assets/mundo/h-*`) | 398 KB | 1,9 MB |
| Juego de láminas vertical (`assets/mundo/v-*`) | 395 KB | 0,95 MB |
| Pósters (`poster-h/v`, AVIF y WebP) | 92–110 KB cada uno | 160 KB |
| CSS crítico en línea de la portada | 13,6 KiB | 14 KiB |
| Primera carga de la portada, cálculo estático (HTML, CSS, JS con su grafo de `import`, fuentes precargadas, `mundo.json`, póster y juego horizontal) | 981 KB | 1,1 MB |
| Primera carga de la portada, medida en red hasta que el motor está listo (sin caché, sin deslizar) | 1.072 KB | 1,1 MB |

KB = 1000 bytes. Las imágenes de más abajo se cargan al deslizar (`loading="lazy"`).

## CSS crítico y política de seguridad: cómo se regeneran

El orden importa, porque el CSS en línea cambia el hash que declara la política:

```
python herramientas/critico.py      # 1. CSS crítico en línea (≤ 14 KiB) en las páginas que lo usan
python herramientas/proteccion.py   # 2. siempre al final: hashes, política, referrer, rel de los enlaces
python herramientas/sitemap.py      # 3. antes del commit: lastmod de cada página según git
```

Los hashes y los pesos se calculan sobre los bytes del disco; `.gitattributes` fija LF para todo el texto, así esos bytes son los mismos que publica GitHub Pages en cualquier máquina (también con `core.autocrlf=true`).

`proteccion.py` es idempotente y además convierte el patrón de hoja diferida que escribe `critico.py` (`media="print" onload=…`, que la política bloquearía) en `media="print" data-diferida` más un cargador de una línea con su hash. Opciones: `--comprobar` (no escribe; sale 1 si algo quedó viejo), `--informe`, `--solo <página>`, `--raiz <carpeta>`, `--sin-rel`.

## Integración continua

El flujo está listo en [`herramientas/ci/pruebas.yml`](herramientas/ci/pruebas.yml) (no en `.github/workflows/` porque el acceso con que se preparó no puede subir flujos). Para activarlo, una vez:

```
mkdir -p .github/workflows
cp herramientas/ci/pruebas.yml .github/workflows/pruebas.yml
cp herramientas/ci/dependabot.yml .github/dependabot.yml
git add .github && git commit -m "CI: pruebas del sitio" && git push
```

Corre en cada push y pull request (y una vez por mes, para avisar si `security.txt` está por vencer): `proteccion.py --comprobar` y `node pruebas/correr.mjs` con Chrome sin ventana, sin instalar dependencias. Las acciones van fijadas por el SHA completo de su commit (una etiqueta se puede mover) y `dependabot.yml` propone cada mes un pull request para actualizarlas. El flujo sólo tiene permiso de lectura y no guarda credenciales.

## Seguridad

Política de seguridad de contenido estricta por página (`default-src 'none'`, scripts y estilos sólo propios o por hash), `no-referrer`, cero terceros, cero cookies y cero analítica. Cómo reportar, qué se guarda en el navegador y los límites del alojamiento: [`SEGURIDAD.md`](SEGURIDAD.md).

### Límites conocidos

- GitHub Pages no permite cabeceras HTTP: la política va por `<meta>`, así que **no** se puede usar `frame-ancestors` (el navegador lo ignora en `<meta>`), ni `report-uri`, ni `X-Content-Type-Options`, ni `Permissions-Policy`. Detalle y mitigaciones en `SEGURIDAD.md`.
- La caché la fija GitHub Pages (10 minutos) y no se puede configurar; los módulos van sin versión en la ruta.
- Las pruebas de humo y vitales con renderizado por software (sin `--gpu`) tardan varios minutos: el motor WebGL corre en CPU.

## Licencia

El código propio, bajo MIT; los textos, imágenes, renders, capturas e identidad visual, con todos los derechos reservados. Material de terceros con su licencia. Detalle en [`LICENSE`](LICENSE) y en `creditos.html`.

---

## English summary

Personal site of Ramiro Bales (AI Product Builder), static, no build step, on GitHub Pages. The home page is a studio room rendered in Blender as depth layers and composited live by a custom WebGL2 engine (no libraries), with a poster fallback. Serve it with `node pruebas/lib/servidor.mjs 8800` and run every check with `node pruebas/correr.mjs` (Node 22+, plus Edge/Chrome/Chromium for the browser tests; zero dependencies): links, i18n parity, CSP hashes (re-computed in JavaScript), HTML basics, no third parties, content rules (forbidden words checked by hash), static WCAG contrast of the colour tokens, weight budgets, secrets in the tree and the whole git history, a browser smoke test of every page, and cold-load vitals (layout shift, long tasks, reduced motion, software-rendering fallback). Every page carries a strict hash-based Content-Security-Policy written by `herramientas/proteccion.py` (run it after `herramientas/critico.py`). Security policy and reporting: `SEGURIDAD.md`. License: own code MIT; content all rights reserved; third-party material under its own license.
