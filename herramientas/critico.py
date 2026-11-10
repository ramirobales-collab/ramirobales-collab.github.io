"""CSS crítico en línea (≤ 14 KB) para las páginas del portfolio.

Qué hace: inserta <style id="critico"> con los bloques de componentes.css que pintan la primera pantalla
de cada página (navegación, botones, sellos, folio, héroe / páginas chicas), minificados y sin las reglas
que sólo actúan tras el JS (WebGL, asentamiento, parallax). componentes.css (la hoja pesada) pasa a cargar
sin bloquear (media="print" + onload) con <noscript> de respaldo. variables.css y base.css (9,6 KB en crudo,
fuentes incluidas) siguen como <link> bloqueantes: son chicas, van en caché y así el bloque en línea cabe en 14 KB.
En la demo Ánfora se inserta estilo.css entero (11 KB) y su <link> pasa a diferido.
Reejecutable: reemplaza el bloque anterior. Correr después de tocar cualquier CSS.

Uso: python herramientas/critico.py
"""
import io, os, re, sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # raíz del repo
CSS = os.path.join(RAIZ, "css")
LIMITE = 14 * 1024

# Bloques de componentes.css por página (cabeceras «/* ---------- X ---------- */»).
BLOQUES = {
    "index.html": ["Navegación", "Botones", "Sellos de estado", "Folio de sección", "Héroe"],
    "creditos.html": ["Navegación", "Botones", "Folio de sección", "Páginas chicas"],
    "legal.html": ["Navegación", "Botones", "Folio de sección", "Páginas chicas"],
    "404.html": ["Navegación", "Botones", "Folio de sección", "Páginas chicas"],
}
# Reglas que no hacen falta para el primer pintado (las aplica el JS más tarde).
NO_CRITICO = (".webgl", ".heroe__canvas", ".asentar", "@keyframes", "animation-timeline")


def leer(p):
    return io.open(p, encoding="utf-8").read()


def minificar(css):
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    css = re.sub(r"\s+", " ", css)
    css = re.sub(r"\s*([{};:,>])\s*", r"\1", css)
    css = css.replace(";}", "}")
    return css.strip()


def bloques(css, nombres):
    """Texto de los bloques pedidos (cabecera hasta la siguiente cabecera) más el preámbulo."""
    partes = re.split(r"(/\* -{3,} .*? -{3,} \*/)", css)
    salida = [partes[0]]
    for i in range(1, len(partes), 2):
        titulo = re.sub(r"/\* -+ | -+ \*/", "", partes[i]).strip()
        if titulo in nombres:
            salida.append(partes[i + 1])
    return "\n".join(salida)


def reglas(css):
    """Parte CSS minificado en reglas de primer nivel [(cabecera, cuerpo)] respetando llaves anidadas."""
    out, i, n = [], 0, len(css)
    while i < n:
        j = css.find("{", i)
        if j < 0:
            break
        prof, k = 1, j + 1
        while k < n and prof:
            prof += {"{": 1, "}": -1}.get(css[k], 0)
            k += 1
        out.append((css[i:j].strip(), css[j + 1:k - 1]))
        i = k
    return out


def podar(css):
    """Quita reglas no críticas; dentro de @media/@supports las quita de a una."""
    salida = []
    for cab, cuerpo in reglas(css):
        if any(m in cab for m in NO_CRITICO):
            continue
        if cab.startswith("@media") or cab.startswith("@supports"):
            if "animation-timeline" in cab:
                continue
            internas = [(c, b) for c, b in reglas(cuerpo) if not any(m in c for m in NO_CRITICO)]
            if internas:
                salida.append(cab + "{" + "".join(c + "{" + b + "}" for c, b in internas) + "}")
        else:
            salida.append(cab + "{" + cuerpo + "}")
    return "".join(salida)


def inyectar(html, estilo, hoja_pesada, prefijo):
    html = re.sub(r"<style id=\"critico\">.*?</style>\n?", "", html, flags=re.S)
    html = re.sub(r"<noscript><link rel=\"stylesheet\" href=\"[^\"]*" + re.escape(hoja_pesada) + r"\"></noscript>\n?", "", html)
    enlace = f'<link rel="stylesheet" href="{prefijo}{hoja_pesada}">'
    patron = r'<link rel="stylesheet" href="' + re.escape(prefijo + hoja_pesada) + r'"( media="print" (onload="this\.media=\'all\'"|data-diferida))?>'
    previo = re.search(patron, html)
    # Si la página ya pasó por herramientas/proteccion.py, la hoja diferida usa data-diferida (sin manejador en
    # línea, que la política de contenido bloquea) y se conserva así; si no, la forma clásica con onload, que
    # proteccion.py convierte después (siempre corre después de este guion).
    forma = "data-diferida" if previo and "data-diferida" in previo.group(0) else "onload=\"this.media='all'\""
    diferido = (f'<link rel="stylesheet" href="{prefijo}{hoja_pesada}" media="print" {forma}>\n'
                f'<noscript>{enlace}</noscript>')
    html, n = re.subn(patron, lambda _m: diferido, html, count=1)
    assert n == 1, "no encontré el <link> de " + hoja_pesada
    m = re.search(r'<link rel="stylesheet"', html)
    html = html[:m.start()] + f'<style id="critico">{estilo}</style>\n' + html[m.start():]
    return html


def pagina(nombre):
    ruta = os.path.join(RAIZ, nombre)
    html = leer(ruta)
    prefijo = "/" if nombre == "404.html" else ""
    css = bloques(leer(os.path.join(CSS, "componentes.css")), BLOQUES[nombre])
    css = re.sub(r"url\((['\"]?)\.\./", lambda m: "url(" + m.group(1) + prefijo, css)
    estilo = podar(minificar(css))
    nuevo = inyectar(html, estilo, "css/componentes.css", prefijo)  # calcular antes de abrir: "w" vacía el archivo
    io.open(ruta, "w", encoding="utf-8", newline="\n").write(nuevo)
    return len(estilo.encode("utf-8"))


def demo():
    ruta = os.path.join(RAIZ, "demos", "producto", "index.html")
    if not os.path.exists(ruta):
        return
    html = leer(ruta)
    css = re.sub(r"url\((['\"]?)\.\./", r"url(\1", leer(os.path.join(RAIZ, "demos", "producto", "css", "estilo.css")))
    estilo = minificar(css)
    nuevo = inyectar(html, estilo, "css/estilo.css", "")
    io.open(ruta, "w", encoding="utf-8", newline="\n").write(nuevo)
    return len(estilo.encode("utf-8"))


if __name__ == "__main__":
    ok = True
    for n in BLOQUES:
        b = pagina(n)
        print(f"{n}: {b / 1024:.1f} KB {'OK' if b <= LIMITE else 'EXCEDE'}")
        ok &= b <= LIMITE
    b = demo()
    if b is not None:
        print(f"demos/producto/index.html: {b / 1024:.1f} KB {'OK' if b <= LIMITE else 'EXCEDE'}")
        ok &= b <= LIMITE
    sys.exit(0 if ok else 1)
