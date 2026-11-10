// Servidor de vista previa local. La web publicada usa solamente dist/.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const raiz = fileURLToPath(new URL('../dist/', import.meta.url));
const puerto = Number(process.env.PORT || 4177);
const tipos = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
http.createServer(async (peticion, respuesta) => {
  try {
    const url = new URL(peticion.url, 'http://localhost');
    const relativa = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const archivo = path.resolve(raiz, relativa);
    if (!archivo.startsWith(raiz)) { respuesta.writeHead(403).end(); return; }
    const contenido = await readFile(archivo);
    respuesta.writeHead(200, { 'Content-Type': tipos[path.extname(archivo)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    respuesta.end(contenido);
  } catch {
    respuesta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No se encontró el archivo.');
  }
}).listen(puerto, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${puerto}`));
