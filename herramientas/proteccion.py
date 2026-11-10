"""Política de seguridad de contenido (CSP) y de referente para un sitio estático sin cabeceras.

GitHub Pages no deja poner cabeceras HTTP, así que la política va en cada página como
<meta http-equiv="Content-Security-Policy">, justo después de <meta charset>. Este guion:

  1. Repara lo único que sabe reparar sin decidir nada: el patrón de hoja diferida que escribe
     herramientas/critico.py (media="print" onload="this.media='all'") pasa a
     media="print" data-diferida, y un cargador en línea de una línea (con su hash) le cambia
     el media al cargar. Cualquier otro manejador en línea es un error que se arregla a mano.
  2. Calcula el sha256 de cada <script> ejecutable y de cada <style> en línea (con los saltos
     de línea normalizados a LF, como hace el navegador al leer el HTML) y escribe la política.
  3. Escribe <meta name="referrer" content="no-referrer">.
  4. Pone rel="noopener noreferrer" en todo enlace con target="_blank" (conserva otros valores, p. ej. «me»).

Es idempotente: correrlo dos veces deja el mismo archivo. Corre SIEMPRE al final, después de
herramientas/critico.py y de cualquier cambio de HTML, porque el CSS crítico en línea cambia el hash.

Uso:
  python herramientas/proteccion.py                    # escribe en todas las páginas
  python herramientas/proteccion.py --comprobar        # no escribe; sale 1 si algo está desactualizado o prohibido
  python herramientas/proteccion.py --informe          # tabla por página
  python herramientas/proteccion.py --solo index.html  # sólo esas páginas (se puede repetir)
  python herramientas/proteccion.py --raiz <carpeta>   # trabaja sobre otra copia del sitio
  python herramientas/proteccion.py --sin-rel          # no toca los rel de los enlaces (sólo los informa)

Sólo biblioteca estándar. pruebas/politica.mjs comprueba lo mismo con una implementación
independiente en JavaScript: si las dos no coinciden, las pruebas fallan.
"""
import argparse
import base64
import hashlib
import io
import os
import re
import sys

RAIZ_REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Carpetas que no son sitio publicado (o que no hay que tocar).
NO_PAGINAS = {".git", "node_modules", "pruebas", "herramientas", ".github"}
EXCLUIR = set()  # rutas relativas con «/» que se saltean a propósito (vacío: se protege todo)

REFERENTE = "no-referrer"

# Política base, la más estricta que el sitio aguanta. Orden fijo para que la salida sea estable.
BASE = [
    ("default-src", ["'none'"]),
    ("script-src", ["'self'"]),          # + hashes de los <script> en línea
    ("style-src", ["'self'"]),           # + hashes de los <style> en línea (sin 'unsafe-inline': bloquea style="")
    ("img-src", ["'self'"]),             # sin data: (el código propio no lo usa; medido); va sólo donde está en EXTRA
    ("font-src", ["'self'"]),
    ("connect-src", ["'self'"]),         # fetch de i18n, mundo.json y láminas del motor (mismo origen)
    ("media-src", ["'self'"]),
    ("manifest-src", ["'self'"]),
    ("object-src", ["'none'"]),
    ("base-uri", ["'none'"]),            # no cae en default-src: hay que nombrarla
    ("form-action", ["'none'"]),         # ídem; los formularios de las demos responden en el navegador
]
# Agregados por página, cada uno con su motivo. Nunca 'unsafe-inline' en script-src ni 'unsafe-eval'.
EXTRA = {
    # GLTFLoader abre las texturas internas del .glb como blob: (imagen y fetch), medido; data: por las pruebas
    # de formato de three.js (no medido que haga falta: se deja por prudencia en las dos páginas con three.js).
    "demos/configurador/index.html": {"img-src": ["data:", "blob:"], "connect-src": ["blob:"]},
    "demos/athleteiq/index.html": {"img-src": ["data:"]},
}
# Una página sin ningún <script> (p. ej. el CV) cierra también script-src y connect-src, y manifest-src si
# no enlaza un manifiesto: no hay código que pueda pedir nada.
# Directivas que en <meta> se ignoran (y el navegador avisa): no se escriben nunca.
IGNORADAS_EN_META = ("frame-ancestors", "report-uri", "report-to", "sandbox")

# Cargador de hojas diferidas (sustituye a onload="this.media='all'"). Escucha en captura los
# «load» de los <link data-diferida> que todavía no existen: va antes de cualquier hoja.
CARGADOR_ID = "hojas-diferidas"
CARGADOR = ("document.addEventListener('load',function(e){var l=e.target;"
            "if(l.tagName==='LINK'&&l.hasAttribute('data-diferida'))l.media='all'},true)")

TIPOS_JS = {"", "text/javascript", "application/javascript", "module", "importmap", "speculationrules",
            "text/ecmascript", "application/ecmascript", "text/jscript", "text/livescript"}

RE_COMENTARIO = re.compile(r"<!--.*?-->", re.S)
RE_CRUDO = re.compile(r"<(script|style)\b([^>]*)>(.*?)</\1\s*>", re.S | re.I)
RE_ETIQUETA = re.compile(
    r"<([a-zA-Z][\w:-]*)((?:\s+[^\s=>/\"']+(?:\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>\"']+))?)*)\s*/?>")
RE_ATRIBUTO = re.compile(r"([^\s=>/\"']+)(?:\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>\"']+))?")
RE_META_CSP = re.compile(r"[ \t]*<meta\s+http-equiv=[\"']?content-security-policy[\"']?[^>]*>[ \t]*\n?", re.I)
RE_META_REF = re.compile(r"[ \t]*<meta\s+name=[\"']?referrer[\"']?[^>]*>[ \t]*\n?", re.I)
RE_CARGADOR = re.compile(r"[ \t]*<script id=\"" + CARGADOR_ID + r"\">.*?</script>[ \t]*\n?", re.S)
RE_CHARSET = re.compile(r"<meta\s+charset=[\"']?utf-8[\"']?\s*/?>[ \t]*\n?", re.I)
RE_ONLOAD_DIFERIDA = re.compile(r"\s+onload=(\"this\.media='all'\"|'this\.media=\"all\"')", re.I)


# ---------------------------------------------------------------- utilidades
def leer(ruta):
    with io.open(ruta, "rb") as f:
        crudo = f.read()
    texto = crudo.decode("utf-8-sig")
    eol = "\r\n" if b"\r\n" in crudo else "\n"
    bom = crudo.startswith(b"\xef\xbb\xbf")
    return texto.replace("\r\n", "\n").replace("\r", "\n"), eol, bom


def escribir(ruta, texto, eol, bom):
    datos = texto.replace("\n", eol).encode("utf-8")
    with io.open(ruta, "wb") as f:
        f.write((b"\xef\xbb\xbf" if bom else b"") + datos)


def sha(texto):
    return "'sha256-" + base64.b64encode(hashlib.sha256(texto.encode("utf-8")).digest()).decode() + "'"


def linea(texto, pos):
    return texto.count("\n", 0, pos) + 1


def atributos(cadena):
    out = {}
    for m in RE_ATRIBUTO.finditer(cadena or ""):
        nombre, valor = m.group(1).lower(), m.group(2)
        if valor is None:
            valor = ""
        elif valor[:1] in "\"'":
            valor = valor[1:-1]
        out.setdefault(nombre, valor)
    return out


def enmascarar(texto):
    """Mismo largo y mismos saltos: borra comentarios y el contenido de <script>/<style>
    para que las búsquedas de atributos no miren dentro del código."""
    def tapar(m, desde, hasta):
        trozo = m.string[desde:hasta]
        return re.sub(r"[^\n]", " ", trozo)
    salida = RE_COMENTARIO.sub(lambda m: tapar(m, m.start(), m.end()), texto)
    def crudo(m):
        ini = m.start(3) - m.start()
        fin = m.end(3) - m.start()
        s = m.group(0)
        return s[:ini] + re.sub(r"[^\n]", " ", s[ini:fin]) + s[fin:]
    return RE_CRUDO.sub(crudo, salida)


def paginas(raiz, solo):
    if solo:
        return sorted(p.replace("\\", "/").lstrip("./") for p in solo)
    out = []
    for base, dirs, archivos in os.walk(raiz):
        rel = os.path.relpath(base, raiz).replace("\\", "/")
        dirs[:] = sorted(d for d in dirs if not (rel == "." and d in NO_PAGINAS) and d not in {".git", "node_modules"})
        for a in sorted(archivos):
            if a.lower().endswith(".html"):
                r = a if rel == "." else rel + "/" + a
                if r not in EXCLUIR:
                    out.append(r)
    return out


# ---------------------------------------------------------------- análisis
def en_linea(texto):
    """Hashes de los <script> ejecutables y <style> en línea (fuera de comentarios)."""
    sin_coment = RE_COMENTARIO.sub(lambda m: " " * len(m.group(0)), texto)
    scripts, estilos = set(), set()
    for m in RE_CRUDO.finditer(sin_coment):
        etiqueta, attrs = m.group(1).lower(), atributos(m.group(2))
        contenido = texto[m.start(3):m.end(3)]  # del texto original (el enmascarado sólo ubica)
        if etiqueta == "script":
            if "src" in attrs:
                continue
            if attrs.get("type", "").strip().lower() not in TIPOS_JS:
                continue  # bloque de datos (p. ej. application/ld+json): el navegador no lo ejecuta ni lo controla
            scripts.add(sha(contenido))
        else:
            estilos.add(sha(contenido))
    return sorted(scripts), sorted(estilos)


def es_externa(url):
    u = (url or "").strip().lower()
    return u.startswith("http://") or u.startswith("https://") or u.startswith("//")


def problemas(texto):
    """Lo que la política bloquearía y no se repara solo: [(línea, motivo)]."""
    out = []
    masc = enmascarar(texto)
    for m in RE_ETIQUETA.finditer(masc):
        tag = m.group(1).lower()
        attrs = atributos(m.group(2))
        n = linea(masc, m.start())
        for a in attrs:
            if tag == "link" and a == "onload" and attrs[a].replace('"', "'") == "this.media='all'":
                continue  # hoja diferida de critico.py: la repara proteger()
            if re.fullmatch(r"on[a-z]+", a):
                out.append((n, f"manejador en línea {a}= en <{tag}> (pasarlo a addEventListener en un .js)"))
            if a == "style":
                out.append((n, f"atributo style= en <{tag}> (pasarlo a una clase o a el.style.setProperty)"))
        for a in ("href", "src", "action", "formaction", "xlink:href"):
            if attrs.get(a, "").strip().lower().startswith("javascript:"):
                out.append((n, f"URL javascript: en {a}="))
        if tag in ("base", "iframe", "frame", "object", "embed"):
            out.append((n, f"<{tag}> no permitido"))
        if tag in ("script", "img", "source", "video", "audio", "track", "input") and es_externa(attrs.get("src")):
            out.append((n, f"recurso de terceros en <{tag} src>"))
        if tag in ("img", "source") and any(es_externa(p.strip().split(" ")[0]) for p in attrs.get("srcset", "").split(",") if p.strip()):
            out.append((n, f"recurso de terceros en <{tag} srcset>"))
        if tag == "video" and es_externa(attrs.get("poster")):
            out.append((n, "recurso de terceros en <video poster>"))
        if tag == "link":
            rel = attrs.get("rel", "").lower().split()
            if es_externa(attrs.get("href")) and not set(rel) & {"canonical", "alternate", "me", "author", "license"}:
                out.append((n, f"recurso de terceros en <link rel=\"{' '.join(rel)}\">"))
    for m in re.finditer(r"@import|url\(\s*['\"]?(?:https?:)?//", texto, re.I):
        # sólo dentro de <style>; en el resto del HTML no aplica
        dentro = any(s.start(3) <= m.start() < s.end(3) and s.group(1).lower() == "style" for s in RE_CRUDO.finditer(texto))
        if dentro and "//" in m.group(0):
            out.append((linea(texto, m.start()), "url() de terceros en <style>"))
    return out


def rel_pendientes(texto):
    """Enlaces target=_blank sin noopener/noreferrer: [(inicio, fin, etiqueta_nueva, línea)]."""
    out = []
    masc = enmascarar(texto)
    for m in RE_ETIQUETA.finditer(masc):
        if m.group(1).lower() != "a":
            continue
        attrs = atributos(m.group(2))
        if attrs.get("target", "").lower() != "_blank":
            continue
        tokens = attrs.get("rel", "").split()
        faltan = [t for t in ("noopener", "noreferrer") if t not in [x.lower() for x in tokens]]
        if not faltan:
            continue
        original = texto[m.start():m.end()]
        nuevo_rel = " ".join(tokens + faltan)
        if "rel" in attrs:
            nueva = re.sub(r"(\srel\s*=\s*)(\"[^\"]*\"|'[^']*'|[^\s>\"']+)", lambda r: r.group(1) + '"' + nuevo_rel + '"', original, count=1, flags=re.I)
        else:
            nueva = re.sub(r"^<a\b", '<a rel="' + nuevo_rel + '"', original, count=1, flags=re.I)
        out.append((m.start(), m.end(), nueva, linea(texto, m.start())))
    return out


def politica(ruta_rel, scripts, estilos, sin_js=False, sin_manifiesto=False):
    extra = EXTRA.get(ruta_rel, {})
    cerradas = ({"script-src", "connect-src"} | ({"manifest-src"} if sin_manifiesto else set())) if sin_js else set()
    partes = []
    for directiva, fuentes in BASE:
        if directiva in cerradas:
            if extra.get(directiva) or (directiva == "script-src" and scripts):
                raise ValueError(f"{ruta_rel}: {directiva} cerrada (página sin scripts) pero con fuentes")
            partes.append(directiva + " 'none'")
            continue
        valores = list(fuentes) + [f for f in extra.get(directiva, []) if f not in fuentes]
        if directiva == "script-src":
            valores += scripts
        elif directiva == "style-src":
            valores += estilos
        partes.append(directiva + " " + " ".join(valores))
    for directiva, fuentes in extra.items():
        if directiva not in dict(BASE):
            if directiva in IGNORADAS_EN_META:
                raise ValueError(f"{ruta_rel}: {directiva} no sirve en <meta>")
            partes.append(directiva + " " + " ".join(fuentes))
    return "; ".join(partes)


def declarada(texto):
    m = re.search(r"<meta\s+http-equiv=[\"']?content-security-policy[\"']?\s+content=\"([^\"]*)\"", texto, re.I)
    return m.group(1) if m else None


def fuentes_de(pol, directiva):
    for parte in (pol or "").split(";"):
        p = parte.strip().split()
        if p and p[0] == directiva:
            return p[1:]
    return []


# ---------------------------------------------------------------- transformación
def proteger(ruta_rel, texto, con_rel=True):
    """Devuelve (texto_nuevo, avisos). No lanza por problemas: los informa aparte."""
    avisos = []
    # 1. hojas diferidas sin manejador
    def reparar(m):
        etiqueta = m.group(0)
        if not re.match(r"<link\b", etiqueta, re.I) or not RE_ONLOAD_DIFERIDA.search(etiqueta):
            return etiqueta
        nueva = RE_ONLOAD_DIFERIDA.sub("" if "data-diferida" in etiqueta else " data-diferida", etiqueta, count=1)
        avisos.append("hoja diferida: onload → data-diferida")
        return nueva
    texto = re.sub(r"<link\b[^>]*>", reparar, texto, flags=re.I)

    # 2. sacar lo que escribimos antes
    texto = RE_META_CSP.sub("", texto)
    texto = RE_META_REF.sub("", texto)
    texto = RE_CARGADOR.sub("", texto)

    # 3. rel de enlaces externos
    if con_rel:
        for ini, fin, nueva, _ in reversed(rel_pendientes(texto)):
            texto = texto[:ini] + nueva + texto[fin:]

    # 4. insertar después de <meta charset>
    m = RE_CHARSET.search(texto)
    if not m:
        raise ValueError(f"{ruta_rel}: falta <meta charset=\"utf-8\">")
    antes = texto[:m.start()]
    if re.search(r"<(script|style|link)\b", antes, re.I):
        raise ValueError(f"{ruta_rel}: hay <script>/<style>/<link> antes de <meta charset>; la política no los cubriría")
    masc = enmascarar(texto)
    diferidas = any(re.search(r"\sdata-diferida\b", e.group(0)) for e in re.finditer(r"<link\b[^>]*>", masc, re.I))
    bloque_cargador = f'<script id="{CARGADOR_ID}">{CARGADOR}</script>\n' if diferidas else ""
    texto = texto[:m.end()] + "\x00CSP\x00" + f'<meta name="referrer" content="{REFERENTE}">\n' + bloque_cargador + texto[m.end():]
    scripts, estilos = en_linea(texto.replace("\x00CSP\x00", ""))
    sin_js = not re.search(r"<script\b", masc, re.I) and not bloque_cargador
    sin_manifiesto = not re.search(r"<link\b[^>]*\brel=[\"']?manifest\b", masc, re.I)
    meta = f'<meta http-equiv="Content-Security-Policy" content="{politica(ruta_rel, scripts, estilos, sin_js, sin_manifiesto)}">\n'
    return texto.replace("\x00CSP\x00", meta), avisos


# ---------------------------------------------------------------- comandos
def comparar(ruta_rel, actual, deseado):
    """Explica por qué una página está desactualizada."""
    motivos = []
    pa, pd = declarada(actual), declarada(deseado)
    if pa is None:
        motivos.append("falta la política (meta CSP)")
    else:
        for d in ("script-src", "style-src"):
            sa = {f for f in fuentes_de(pa, d) if f.startswith("'sha")}
            sd = {f for f in fuentes_de(pd, d) if f.startswith("'sha")}
            if sd - sa:
                motivos.append(f"{d}: usado sin declarar {sorted(sd - sa)}")
            if sa - sd:
                motivos.append(f"{d}: declarado sin uso {sorted(sa - sd)}")
        quitar_hash = lambda p: re.sub(r" 'sha256-[^']+'", "", p)
        if quitar_hash(pa) != quitar_hash(pd):
            motivos.append("directivas distintas de las de proteccion.py")
    if f'<meta name="referrer" content="{REFERENTE}">' not in actual:
        motivos.append(f"falta <meta name=\"referrer\" content=\"{REFERENTE}\">")
    if RE_ONLOAD_DIFERIDA.search(actual):
        motivos.append("hoja diferida con onload (la repara proteccion.py)")
    for _, _, _, n in rel_pendientes(actual):
        motivos.append(f"línea {n}: enlace target=_blank sin rel=\"noopener noreferrer\"")
    if not motivos:
        motivos.append("orden o ubicación de las metas distinta")
    return motivos


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--comprobar", action="store_true")
    ap.add_argument("--informe", action="store_true")
    ap.add_argument("--solo", action="append")
    ap.add_argument("--raiz", default=RAIZ_REPO)
    ap.add_argument("--sin-rel", action="store_true")
    args = ap.parse_args()
    raiz = os.path.abspath(args.raiz)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    fallas, cambios, filas = 0, 0, []
    for rel in paginas(raiz, args.solo):
        ruta = os.path.join(raiz, rel)
        if not os.path.exists(ruta):
            print(f"FALLA  {rel}: no existe")
            fallas += 1
            continue
        texto, eol, bom = leer(ruta)
        try:
            nuevo, avisos = proteger(rel, texto, con_rel=not args.sin_rel)
        except ValueError as e:
            print(f"FALLA  {e}")
            fallas += 1
            continue
        probs = problemas(texto)  # sobre el original: las líneas coinciden con el archivo
        for n, motivo in probs:
            print(f"FALLA  {rel}:{n}: {motivo}")
        fallas += len(probs)
        pol = declarada(nuevo)
        filas.append((rel, len(fuentes_de(pol, "script-src")) - 1, len(fuentes_de(pol, "style-src")) - 1, len(pol), len(probs)))
        if args.sin_rel:
            for _, _, _, n in rel_pendientes(nuevo):
                print(f"AVISO  {rel}:{n}: enlace target=_blank sin rel=\"noopener noreferrer\" (no se tocó por --sin-rel)")
        if nuevo != texto:
            if args.comprobar:
                for motivo in comparar(rel, texto, nuevo):
                    print(f"FALLA  {rel}: {motivo}")
                fallas += 1
            elif args.informe:
                print(f"desact. {rel} (corré proteccion.py para escribirla)")
            else:
                # releer justo antes de escribir: si otro proceso lo cambió en el medio, se recalcula
                actual, eol, bom = leer(ruta)
                if actual != texto:
                    nuevo, avisos = proteger(rel, actual, con_rel=not args.sin_rel)
                escribir(ruta, nuevo, eol, bom)
                cambios += 1
                print(f"escrita {rel}" + (f" ({'; '.join(sorted(set(avisos)))})" if avisos else ""))
        elif not args.comprobar and not args.informe:
            print(f"al día  {rel}")

    if args.informe:
        print(f"\n{'página':42} {'scripts':>7} {'estilos':>7} {'largo':>6} {'problemas':>9}")
        for f in filas:
            print(f"{f[0]:42} {f[1]:>7} {f[2]:>7} {f[3]:>6} {f[4]:>9}")
    total = len(filas)
    if args.comprobar or args.informe:
        print(f"\n{'OK' if not fallas else 'FALLA'}: {total} páginas comprobadas, {fallas} problema(s)")
    else:
        print(f"\n{cambios} página(s) escritas de {total}; {fallas} problema(s) que hay que arreglar a mano")
    sys.exit(1 if fallas else 0)


if __name__ == "__main__":
    main()
