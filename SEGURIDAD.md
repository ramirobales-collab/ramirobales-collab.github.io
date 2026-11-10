# Seguridad

Este repositorio es el sitio de Ramiro Bales, publicado en <https://ramirobales-collab.github.io/>. Es un sitio **estático** servido por GitHub Pages: no tiene servidor propio, ni cuentas, ni base de datos, ni formularios que envíen algo. Este documento dice cómo reportar un problema, qué está protegido, cómo se comprueba y qué no se puede hacer en este alojamiento.

*English summary at the end.*

## Cómo reportar un problema

- Escribí a **ramirobales@gmail.com** (también en [`/.well-known/security.txt`](.well-known/security.txt)), en español o en inglés.
- Contá qué página, qué pasos y qué viste. Si podés, una captura o la URL exacta.
- Respuesta dentro de los 7 días. Divulgación coordinada: pido no publicar el detalle hasta que esté arreglado o hayan pasado 90 días.
- No hay programa de recompensas. Gracias igual: si querés, figurás en el registro de abajo.

**Alcance:** las páginas de este repositorio (portada, casos, demos, créditos, legales, CV). **Fuera de alcance:** la infraestructura de GitHub, la cuenta de GitHub del dueño, los sitios externos que se enlazan y los ataques que requieren acceso físico o un navegador ya comprometido.

## Modelo de amenazas

Lo que se consideró, de más a menos probable para un sitio así:

| amenaza | cómo se cubre |
|---|---|
| Código inyectado (por contenido o por parámetros de la URL) | Política de seguridad de contenido estricta en cada página; sin `eval`, `new Function`, `document.write` ni manejadores en línea; los parámetros que llegan al DOM tienen lista blanca (abajo) |
| Un tercero comprometido (CDN, analítica, fuentes) | No hay terceros: todo se sirve del mismo origen (fuentes, bibliotecas, imágenes). La política lo impone y las pruebas lo verifican |
| Secretos en el repositorio o en su historial | Prueba que busca credenciales, archivos de claves, rutas locales y correos no declarados en el árbol y en todo el historial de git |
| Filtrar a dónde va el visitante | `referrer` en `no-referrer` y `rel="noopener noreferrer"` en los enlaces que abren pestaña nueva |
| Datos personales de más | Sin cookies, sin analítica, sin formularios que envíen; en el navegador sólo se guardan preferencias (abajo) |
| Enmarcado (clickjacking) | No se puede bloquear por cabecera desde GitHub Pages (ver «Límites»). Todas las páginas HTML del sitio (portada, casos, seguridad ES/EN, 404, legal, créditos y las cuatro demos; no los CV) llevan un guion al inicio del `<head>` que sale del marco o, si no puede, oculta la página y deja sólo un aviso con la dirección real (el riesgo es una copia con otro correo encima). Comprobado enmarcando las páginas desde otro origen: se ve sólo el aviso. Un `iframe` con `sandbox` sin scripts lo esquiva. El sitio no tiene sesión ni acciones con efecto |

## Qué se hizo

### Política de seguridad de contenido (CSP)

Cada página lleva, justo después de `<meta charset>`, una política por `<meta http-equiv="Content-Security-Policy">` que escribe [`herramientas/proteccion.py`](herramientas/proteccion.py):

```
default-src 'none'; script-src 'self' 'sha256-…'; style-src 'self' 'sha256-…';
img-src 'self'; font-src 'self'; connect-src 'self'; media-src 'self';
manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'
```

- `default-src 'none'`: todo lo que no se nombra está prohibido.
- `script-src` y `style-src`: sólo archivos del propio sitio y los bloques en línea cuyo **hash sha256** coincide (calculado con los saltos de línea normalizados a LF, como hace el navegador). Sin `'unsafe-inline'` ni `'unsafe-eval'`. Esto además bloquea todo atributo `style=""` y todo manejador `on…=""`: el sitio no usa ninguno.
- `img-src 'self'`: sin `data:`, porque el código propio no lo usa (probado sin él en 12 páginas recorridas enteras, demos incluidas: 0 violaciones).
- `connect-src 'self'`: los únicos pedidos por código son al propio sitio (diccionarios de idioma, la descripción de la escena y las láminas del motor WebGL, que se leen con `fetch` + `createImageBitmap`).
- `base-uri 'none'`, `form-action 'none'`, `object-src 'none'`: no se puede cambiar la base de las URL, enviar formularios a ningún lado ni incrustar plugins.
- Excepciones vigentes (están en el diccionario `EXTRA` del guion, con su motivo):
  - `demos/configurador/index.html`: `img-src data: blob:` y `connect-src blob:`, porque el cargador de modelos abre las texturas internas del `.glb` como `blob:`; `data:` queda por prudencia en las dos páginas que usan three.js.
  - `demos/athleteiq/index.html`: `img-src data:` (three.js, ídem).
- Más cerrado que la base: una página sin ningún `<script>` (hoy, el CV en HTML) lleva `script-src 'none'; connect-src 'none'; manifest-src 'none'`. `pruebas/politica.mjs` lo exige y falla si `data:` aparece en otra página.
- Las hojas de estilo que no bloquean el primer pintado se cargan con `media="print" data-diferida` y un cargador de una línea, con su hash, que les cambia el `media` al cargar. Reemplaza al clásico `onload="this.media='all'"`, que la política bloquearía.

`python herramientas/proteccion.py --comprobar` falla si algún hash quedó viejo, y `pruebas/politica.mjs` recalcula lo mismo **con otra implementación, en JavaScript**: si Python y Node no coinciden, la prueba falla.

### Referente y enlaces externos

`<meta name="referrer" content="no-referrer">` en cada página y `rel="noopener noreferrer"` en todo enlace con `target="_blank"` (el guion lo agrega solo).

### Parámetros de URL que el sitio lee

Todos con lista blanca o como número; ninguno se inserta como HTML:

| parámetro | dónde | valores |
|---|---|---|
| `tema` | todas | `light`, `dark` (las demos aceptan además `claro`, `oscuro`) |
| `idioma` | todas | `es`, `en`; cualquier otro se ignora y **no se guarda** |
| `quieto` | portada | `1` (sin animación) |
| `ir` | portada | sólo se usa con `getElementById` |
| `mundo`, `fondo`, `tope` | portada | `0` / `1` |
| `acto` | portada | `defino`, `diseno`, `verifico` |
| `t`, `sec`, `nivel` | portada | número (capturas deterministas y nivel de calidad) |
| `q`, `ficha`, `evento`, `hora`, `escena`, `producto` | demos | lista blanca o escapado antes de insertar |

### Qué guarda el sitio en tu navegador (comprobado en el código)

| almacenamiento | clave | qué | dónde se escribe |
|---|---|---|---|
| `localStorage` | `idioma` | `es` o `en`, cuando elegís idioma | `js/comun.js`, demos, páginas de seguridad |
| `localStorage` | `tema` | `light` o `dark`, cuando tocás el conmutador | `js/comun.js`, demos |
| `sessionStorage` | `mundo-visto` | `1` después de la secuencia de entrada de la portada, para no repetirla en la misma pestaña; se borra al cerrarla | `js/mundo/index.js` |

Nada más: **0 cookies, 0 IndexedDB, 0 service workers, 0 analítica, 0 pedidos a otros sitios.** La prueba de humo lo verifica en el navegador (falla si aparece otra clave o una cookie). Los formularios de las demos responden en tu navegador y no envían nada. GitHub Pages, como cualquier alojamiento, puede registrar la IP y el navegador de cada visita en sus propios registros ([declaración de privacidad de GitHub](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement)).

### Secretos y datos

- `node pruebas/correr.mjs --solo=secretos` busca tokens de GitHub, claves de AWS/Google/Slack/modelos/pagos, claves privadas, webhooks, JWT, cadenas de conexión, rutas de una máquina local y correos no declarados, en el árbol y en **todo el historial de git**. Las excepciones están en `pruebas/config.json` con su motivo.
- Lo que el sitio no puede nombrar (nombres internos, servicios propios, proveedores junto a ciertos productos) se busca por **huella** (sha256 de la palabra normalizada, `pruebas/lib/huella.mjs`): la lista no está escrita en el repo, así que la guardia no publica lo que esconde. Es una ocultación, no un secreto: quien adivine una palabra puede calcular su huella.
- Las páginas HTML del CV llevan `noindex` y se dejan rastrear para que el buscador lo lea; los PDF del CV no se rastrean (`robots.txt`), porque un PDF no puede llevar `noindex`.
- Las imágenes y los PDF publicados no llevan metadatos con rutas ni autor.
- Datos personales publicados a propósito: nombre, correo de contacto, LinkedIn y localidad. El CV (`cv/`) lleva además un teléfono, por decisión del dueño; la prueba lo informa como aviso.

### Bibliotecas

Todas copiadas en `lib/` y servidas desde el mismo origen (sin CDN): three.js r160 (MIT, sólo en las demos). La portada usa un motor WebGL2 propio, sin dependencias. Licencias de terceros: [`LICENSE`](LICENSE) y `creditos.html`.

## Límites del alojamiento (honestos)

GitHub Pages no deja configurar cabeceras HTTP. Lo que eso implica:

| protección | estado | por qué / mitigación |
|---|---|---|
| CSP | **sí**, por `<meta>` | rige desde el `<meta>` en adelante: por eso va inmediatamente después de `charset`, antes de cualquier script u hoja |
| `frame-ancestors` / `X-Frame-Options` (enmarcado) | **no** | el navegador ignora `frame-ancestors` en `<meta>`. Sin sesión ni acciones, el riesgo real es bajo |
| `report-uri` / `report-to` | no | no funcionan en `<meta>`; las violaciones se detectan en las pruebas de humo (escuchan `securitypolicyviolation`) |
| `Referrer-Policy` | **sí**, por `<meta name="referrer">` | — |
| HTTPS y HSTS | sí, los pone GitHub | `github.io` además está en la lista de precarga HSTS de los navegadores. Por eso no se usa `upgrade-insecure-requests` (rompería el servidor local de pruebas, que es `http`) |
| `X-Content-Type-Options: nosniff` | no | no hay archivos subidos por terceros y los tipos salen bien por la extensión |
| `Permissions-Policy` | no | no tiene equivalente en `<meta>`; el sitio no pide cámara, micrófono, ubicación ni sensores |
| COOP / COEP / CORP | no | no se necesitan (no se usa `SharedArrayBuffer`) |
| Trusted Types | todavía no | funciona por `<meta>` en Chromium. Medido con `require-trusted-types-for 'script'` agregado a la política: casos, legal, créditos, 404, seguridad, CV y la demo de AthleteIQ, 0 violaciones; la portada, 1 (un `innerHTML` con texto fijo en `js/mundo/index.js`); las demos asistente, bots y configurador arman su HTML con `innerHTML` y necesitan más trabajo. Falta: cambiar ese sumidero por `createElement`, una política única para los textos con formato de los diccionarios (`data-i18n-html`, mismo origen) y agregar la directiva a las páginas que no son demos |
| Caché | la fija GitHub Pages | `Cache-Control: max-age=600` (medido con `curl -I` el 10/11/2026) y los módulos, hojas y JSON van sin versión en la ruta: quien entró en los 10 minutos previos a una publicación puede mezclar HTML nuevo con JS o CSS viejos hasta que venza la caché. Se acepta: la ventana es de 10 minutos y sólo afecta a quien ya había entrado. Para cerrarlo haría falta publicar los módulos bajo una carpeta con la versión del commit |
| Origen compartido | aviso | el sitio es la página de usuario de la cuenta (`ramirobales-collab.github.io`): cualquier otro repositorio de esa cuenta publicado como página de proyecto (`/<repo>/`) comparte el origen, así que sus scripts entrarían por `'self'` y podrían leer `idioma` y `tema` del `localStorage`. Regla: no publicar en esta cuenta páginas de proyecto con código de terceros. Para cerrarlo del todo, `script-src` por rutas (`/js/`, `/lib/`, `/demos/`) en lugar de `'self'` |
| SRI (`integrity`) | no | todo es del mismo origen y lo cubre la CSP; no agrega protección real |

## Cómo se verifica

```
node pruebas/correr.mjs                     # todas (la de humo usa Edge/Chrome/Chromium sin ventana)
python herramientas/proteccion.py --comprobar
curl -sI https://ramirobales-collab.github.io/   # cabeceras reales del alojamiento
```

El detalle de cada prueba está en el [`README.md`](README.md).

## Registro

| fecha | cambio | resultado |
|---|---|---|
| 10/11/2026 | Política estricta por `<meta>` con hashes, `no-referrer`, cargador de hojas sin manejador en línea, `security.txt`, pruebas sin dependencias | las 16 páginas con política por hash (`proteccion.py --comprobar` OK); barrido de 160 visitas (16 páginas × oscuro/claro × ES/EN × escritorio/celular, más `?mundo=0`): 0 violaciones de la política, 0 errores de consola, 0 pedidos a terceros |
| 10/11/2026 | `img-src` sin `data:` (salvo las dos demos con three.js); CV sin scripts con `script-src`, `connect-src` y `manifest-src` en `'none'`; guardia de contenido por huellas; acciones de la integración continua fijadas por SHA; pruebas nuevas de contraste (estática) y de vitales en frío; tiempos límite en el cliente CDP | sobre una copia del sitio con la política regenerada: `proteccion.py --comprobar` OK en 16/16 e idempotente; prueba de humo en Chrome sin placa (23 visitas, cada página recorrida entera): 0 violaciones, 0 errores, 0 pedidos a terceros |

---

## English summary

Static site on GitHub Pages: no server, no accounts, no cookies, no analytics, no third-party requests, no forms that send data. Report issues to **ramirobales@gmail.com** (Spanish or English, reply within 7 days, coordinated disclosure, no bounty). Every page carries a strict Content-Security-Policy via `<meta>` (`default-src 'none'`, scripts and styles only from the same origin or by sha256 hash, no `unsafe-inline`/`unsafe-eval`, `img-src 'self'` without `data:` except the two three.js demos, `base-uri 'none'`, `form-action 'none'`, `object-src 'none'`; script-free pages such as the CV also close `script-src` and `connect-src`) plus `no-referrer`, written by `herramientas/proteccion.py` and independently re-checked by `pruebas/politica.mjs`. Words the site must not publish are checked by hash, so the guard does not publish them. The browser only stores `idioma` and `tema` in localStorage and `mundo-visto` in sessionStorage. Known hosting limits: no HTTP headers, so no `frame-ancestors`, `nosniff`, `Permissions-Policy` or CSP reporting; a 10-minute cache window after each release; the origin is shared with any project page of the same GitHub account (none with third-party code should be published there). Trusted Types: measured, pending on the home page and the demos.
