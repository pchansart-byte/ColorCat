#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ColorCat · servidor local
===========================

Sirve la aplicación en http://127.0.0.1:<puerto> y abre el navegador.
No necesita instalar nada: usa solo la biblioteca estándar de Python.

Uso:
    python app.py                abre el navegador en un puerto libre
    python app.py --port 9000    usa un puerto concreto
    python app.py --no-browser   solo arranca el servidor
"""

import argparse
import http.server
import mimetypes
import os
import socket
import sys
import threading
import time
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
HOST = "127.0.0.1"
FIRST_PORT = 8765


# --------------------------------------------------------------------------
# Tipos MIME: en Windows el registro a veces asigna "text/plain" a .js/.css
# y el navegador se niega a cargar la aplicación.
# --------------------------------------------------------------------------
EXTRA_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".md": "text/plain; charset=utf-8",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    """Servidor estático con caché desactivada (útil al editar la app)."""

    extensions_map = dict(mimetypes.types_map)
    extensions_map.update(EXTRA_TYPES)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Silencio en el uso normal; solo se muestran los errores.
        status = args[1] if len(args) > 1 else ""
        if str(status).startswith(("4", "5")):
            sys.stderr.write("  [%s] %s\n" % (status, fmt % args))

    def log_error(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))


def find_port(start=FIRST_PORT, tries=60):
    for port in range(start, start + tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            try:
                probe.bind((HOST, port))
                return port
            except OSError:
                continue
    return 0


def open_browser_later(url, delay=0.7):
    time.sleep(delay)
    try:
        webbrowser.open(url)
    except Exception:
        pass


def main():
    parser = argparse.ArgumentParser(description="ColorCat · servidor local")
    parser.add_argument("--port", type=int, default=0, help="puerto (0 = buscar uno libre)")
    parser.add_argument("--no-browser", action="store_true", help="no abrir el navegador")
    args = parser.parse_args()

    if not os.path.isfile(os.path.join(ROOT, "index.html")):
        print("No se encontró index.html junto a app.py.")
        return 1

    port = args.port or find_port()
    if not port:
        print("No hay puertos libres entre %d y %d." % (FIRST_PORT, FIRST_PORT + 59))
        return 1

    handler = lambda *a, **kw: Handler(*a, directory=ROOT, **kw)  # noqa: E731
    try:
        server = http.server.ThreadingHTTPServer((HOST, port), handler)
    except OSError as exc:
        print("No se pudo iniciar el servidor: %s" % exc)
        return 1

    url = "http://%s:%d/" % (HOST, port)

    print("")
    print("  ============================================")
    print("   C O L O R C A T")
    print("   estudio de color para arte")
    print("  ============================================")
    print("")
    print("   Abre en el navegador:  %s" % url)
    print("   Carpeta:               %s" % ROOT)
    print("")
    print("   Todo el procesado ocurre en tu equipo.")
    print("   Pulsa Ctrl+C en esta ventana para detenerlo.")
    print("")

    if not args.no_browser:
        threading.Thread(target=open_browser_later, args=(url,), daemon=True).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Servidor detenido. ¡Hasta la próxima!")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
