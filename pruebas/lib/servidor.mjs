// Servidor estático mínimo, sin dependencias, que se porta como GitHub Pages en lo que importa:
// tipos MIME por extensión, «carpeta/» → «carpeta/index.html», 404 → 404.html con código 404,
// sin listado de carpetas y sin salir de la raíz.
//
// Uso suelto:  node pruebas/lib/servidor.mjs [puerto=8800] [raíz=repo]
// Como módulo: const s = await servir({ raiz, puerto: 0 }); s.url; await s.cerrar();
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ_REPO = resolve(fileURLToPath(new URL('../../', import.meta.url)));

export const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json', '.hdr': 'application/octet-stream', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

export async function servir({ raiz = RAIZ_REPO, puerto = 0, host = '127.0.0.1' } = {}) {
  const base = resolve(raiz);
  const servidor = createServer(async (req, res) => {
    try {
      const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let archivo = normalize(join(base, ruta));
      if (archivo !== base && !archivo.startsWith(base + sep)) throw Object.assign(new Error('fuera'), { code: 'ENOENT' });
      let info = await stat(archivo).catch(() => null);
      if (info?.isDirectory()) {
        if (!ruta.endsWith('/')) { res.writeHead(301, { Location: ruta + '/' }); return res.end(); }
        archivo = join(archivo, 'index.html');
        info = await stat(archivo).catch(() => null);
      }
      if (!info?.isFile()) throw Object.assign(new Error('no existe'), { code: 'ENOENT' });
      const datos = await readFile(archivo);
      res.writeHead(200, { 'Content-Type': MIME[extname(archivo).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : datos);
    } catch {
      const pagina = await readFile(join(base, '404.html')).catch(() => Buffer.from('404'));
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : pagina);
    }
  });
  await new Promise((ok, mal) => { servidor.once('error', mal); servidor.listen(puerto, host, ok); });
  const { port } = servidor.address();
  return { url: `http://${host}:${port}/`, puerto: port, cerrar: () => new Promise((ok) => servidor.close(ok)) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , p = '8800', r = RAIZ_REPO] = process.argv;
  const s = await servir({ raiz: r, puerto: +p });
  console.log(`sirviendo ${resolve(r)} en ${s.url} (Ctrl+C para cortar)`);
}
