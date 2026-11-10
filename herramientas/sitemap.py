"""Pone al día el <lastmod> de cada página de sitemap.xml a partir de git (sólo lectura de git).

lastmod = fecha del último commit que tocó la página; si la página tiene cambios sin commit, la fecha de
hoy (es la que va a tener el commit que los suba). pruebas/basicos.mjs falla si un lastmod queda más
viejo que su último commit. Correrlo antes de cada commit que cambie páginas.

Uso:
  python herramientas/sitemap.py               # escribe sitemap.xml
  python herramientas/sitemap.py --comprobar   # no escribe; sale 1 si algún lastmod cambiaría
  python herramientas/sitemap.py --raiz <carpeta>

Sólo biblioteca estándar.
"""
import argparse
import datetime
import io
import os
import re
import subprocess
import sys

RAIZ_REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITIO = "https://ramirobales-collab.github.io/"
RE_URL = re.compile(r"(<loc>([^<]+)</loc>\s*<lastmod>)([^<]+)(</lastmod>)")


def git(raiz, *args):
    try:
        return subprocess.run(["git", "-C", raiz, *args], capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def fecha(raiz, ruta, hoy):
    if git(raiz, "status", "--porcelain", "--", ruta):
        return hoy
    return git(raiz, "log", "-1", "--format=%cs", "--", ruta) or None


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--comprobar", action="store_true")
    ap.add_argument("--raiz", default=RAIZ_REPO)
    a = ap.parse_args()
    raiz = os.path.abspath(a.raiz)
    ruta_sm = os.path.join(raiz, "sitemap.xml")
    with io.open(ruta_sm, encoding="utf-8") as f:
        texto = f.read()
    hoy = datetime.date.today().isoformat()
    cambios = []

    def poner(m):
        url = m.group(2)
        rel = url[len(SITIO):] if url.startswith(SITIO) else None
        if rel is None:
            return m.group(0)
        if rel == "" or rel.endswith("/"):
            rel += "index.html"
        if not os.path.isfile(os.path.join(raiz, rel)):
            print(f"aviso: {rel} no existe", file=sys.stderr)
            return m.group(0)
        nueva = fecha(raiz, rel, hoy)
        if not nueva or nueva == m.group(3):
            return m.group(0)
        cambios.append(f"{rel}: {m.group(3)} → {nueva}")
        return m.group(1) + nueva + m.group(4)

    nuevo = RE_URL.sub(poner, texto)
    for c in cambios:
        print(c)
    if a.comprobar:
        print("sitemap.xml al día" if not cambios else f"{len(cambios)} lastmod desactualizados")
        sys.exit(1 if cambios else 0)
    if cambios:
        with io.open(ruta_sm, "w", encoding="utf-8", newline="\n") as f:
            f.write(nuevo)
    print(f"sitemap.xml: {len(cambios)} cambios")


if __name__ == "__main__":
    main()
