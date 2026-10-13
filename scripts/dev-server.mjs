// Serves the timer and proxies /companion-api to the local worker.
// The production page keeps its existing connect-src. This proxy is
// localhost only, so the browser talks to its own origin.

import { createServer } from 'node:http';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT || 8006);
const worker = workerEndpoint();
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

function localPath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  const cleaned = decoded.replace(/^\/+/, '');
  if (cleaned.includes('\0')) return null;
  const filePath = resolve(root, cleaned);
  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) return null;
  return filePath;
}

function workerEndpoint() {
  const raw = process.env.COMPANION_WORKER_URL;
  if (!raw) {
    const workerPort = Number(process.env.WORKER_PORT || 8787);
    return {
      request: httpRequest,
      hostname: '127.0.0.1',
      port: workerPort,
      host: `127.0.0.1:${workerPort}`,
      mode: 'local',
    };
  }
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('COMPANION_WORKER_URL must be http or https');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('COMPANION_WORKER_URL must be an origin without credentials');
  }
  const secure = url.protocol === 'https:';
  const portNumber = Number(url.port || (secure ? 443 : 80));
  const defaultPort = secure ? 443 : 80;
  const localHost = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  return {
    request: secure ? httpsRequest : httpRequest,
    hostname: url.hostname,
    port: portNumber,
    host: portNumber === defaultPort ? url.hostname : `${url.hostname}:${portNumber}`,
    mode: localHost ? 'local' : 'remote',
  };
}

function proxyPath(url) {
  const next = url.replace(/^\/companion-api/, '') || '/';
  return next.startsWith('/') ? next : `/${next}`;
}

function proxyHeaders(headers) {
  return { ...headers, host: worker.host };
}

const server = createServer(async (req, res) => {
  const pathOnly = (req.url || '/').split('?')[0];
  if (pathOnly === '/companion-dev-target') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ mode: worker.mode, host: worker.hostname }));
    return;
  }
  if (req.url.startsWith('/companion-api')) {
    const proxy = worker.request(
      {
        hostname: worker.hostname,
        port: worker.port,
        path: proxyPath(req.url),
        method: req.method,
        headers: proxyHeaders(req.headers),
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );
    proxy.on('error', () => {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'worker-unavailable' }));
    });
    req.pipe(proxy);
    return;
  }

  const requested = pathOnly === '/' ? '/index.html' : pathOnly;
  const filePath = localPath(requested);
  if (!filePath) {
    res.writeHead(400);
    res.end();
    return;
  }
  try {
    const body = await readFile(filePath);
    const type = types[extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});

server.on('upgrade', (req, socket, head) => {
  if (!req.url?.startsWith('/companion-api')) {
    socket.destroy();
    return;
  }
  const proxy = worker.request({
    hostname: worker.hostname,
    port: worker.port,
    path: proxyPath(req.url),
    method: 'GET',
    headers: proxyHeaders(req.headers),
  });
  proxy.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    const lines = [`HTTP/1.1 101 ${proxyRes.statusMessage || 'Switching Protocols'}`];
    for (const [key, value] of Object.entries(proxyRes.headers)) {
      const values = Array.isArray(value) ? value : [value];
      for (const item of values) {
        if (item != null) lines.push(`${key}: ${item}`);
      }
    }
    socket.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (proxyHead?.length) socket.write(proxyHead);
    if (head?.length) proxySocket.write(head);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
    proxySocket.on('error', () => socket.destroy());
    socket.on('error', () => proxySocket.destroy());
  });
  proxy.on('error', () => socket.destroy());
  proxy.end();
});

server.listen(port, '127.0.0.1');
