import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { describe, it, before, after } from 'node:test';
import { fileURLToPath } from 'node:url';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const root = fileURLToPath(new URL('..', import.meta.url));

function acceptValue(key) {
  return createHash('sha1').update(`${key}${GUID}`).digest('base64');
}

function textFrame(text) {
  const payload = Buffer.from(text);
  return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
}

function readClientFrame(buffer) {
  if (buffer.length < 6) return null;
  const length = buffer[1] & 0x7f;
  if ((buffer[1] & 0x80) === 0 || length > 125) return null;
  if (buffer.length < 6 + length) return null;
  const mask = buffer.subarray(2, 6);
  const payload = Buffer.alloc(length);
  for (let index = 0; index < length; index += 1) {
    payload[index] = buffer[6 + index] ^ mask[index % 4];
  }
  return payload.toString();
}

describe('companion dev proxy', () => {
  let upstream;
  let upstreamPort;
  let proxy;
  let proxyPort;
  const seen = [];

  before(async () => {
    upstream = createServer((req, res) => {
      const body = req.url.startsWith('/fail')
        ? JSON.stringify({ error: 'origin-rejected' })
        : 'ok';
      const status = req.url.startsWith('/fail') ? 403 : 200;
      res.writeHead(status, {
        'content-type': req.url.startsWith('/fail') ? 'application/json' : 'text/plain',
        'content-length': Buffer.byteLength(body),
        'alt-svc': 'h3=":443"; ma=86400',
      });
      res.end(body);
    });
    upstream.on('upgrade', (req, socket) => {
      if (req.url.startsWith('/fail')) {
        const body = JSON.stringify({ error: 'origin-rejected' });
        socket.write(
          'HTTP/1.1 403 Forbidden\r\n' +
          'Content-Type: application/json\r\n' +
          `Content-Length: ${Buffer.byteLength(body)}\r\n` +
          'Connection: close\r\n' +
          'alt-svc: h3=":443"; ma=86400\r\n' +
          '\r\n' +
          body
        );
        socket.end();
        return;
      }
      const key = req.headers['sec-websocket-key'];
      seen.push({
        upgrade: req.headers.upgrade,
        connection: req.headers.connection,
        origin: req.headers.origin,
        host: req.headers.host,
        acceptEncoding: req.headers['accept-encoding'] || null,
      });
      const headers = [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${acceptValue(key)}`,
        'alt-svc: h3=":443"; ma=86400',
        'report-to: {"group":"cf-nel","max_age":1,"endpoints":[{"url":"https://example.invalid/r"}]}',
        '',
        '',
      ];
      socket.write(headers.join('\r\n'));
      socket.write(textFrame('{"type":"snapshot","rev":1}'));
      const chunks = [];
      socket.on('data', (chunk) => {
        chunks.push(chunk);
        const text = readClientFrame(Buffer.concat(chunks));
        if (text === '{"type":"auth"}') socket.write(textFrame(text));
        if ((chunk[0] & 0x0f) === 0x8) socket.end();
      });
    });
    await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    upstreamPort = upstream.address().port;

    proxyPort = 18000 + (process.pid % 1000);
    proxy = spawn(process.execPath, ['scripts/dev-server.mjs'], {
      cwd: root,
      env: {
        ...process.env,
        PORT: String(proxyPort),
        COMPANION_WORKER_URL: `http://127.0.0.1:${upstreamPort}`,
      },
      stdio: 'ignore',
    });
    let ready = false;
    for (let attempt = 0; attempt < 30 && !ready; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${proxyPort}/companion-dev-target`);
        ready = response.ok;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    if (!ready) throw new Error('dev server did not start');
  });

  after(() => {
    proxy?.kill();
    upstream?.close();
  });

  it('completes a WebSocket handshake and carries both directions', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${proxyPort}/companion-api/sessions/ABCDEF`, {
      headers: { Origin: 'http://127.0.0.1:8006' },
    });
    const first = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`still ${socket.readyState}`)), 2000);
      socket.addEventListener('message', (event) => {
        clearTimeout(timer);
        resolve(String(event.data));
      });
      socket.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('handshake failed'));
      });
    });
    assert.equal(socket.readyState, WebSocket.OPEN);
    assert.equal(first, '{"type":"snapshot","rev":1}');
    assert.equal(socket.extensions, '');

    const reply = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no reply')), 2000);
      socket.addEventListener('message', (event) => {
        clearTimeout(timer);
        resolve(String(event.data));
      });
    });
    socket.send('{"type":"auth"}');
    assert.equal(await reply, '{"type":"auth"}');
    socket.close();
    await new Promise((resolve) => {
      socket.addEventListener('close', resolve);
      setTimeout(resolve, 500);
    });

    const again = new WebSocket(`ws://127.0.0.1:${proxyPort}/companion-api/sessions/ABCDEF`);
    const second = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`reconnect still ${again.readyState}`)), 2000);
      again.addEventListener('message', (event) => {
        clearTimeout(timer);
        resolve(String(event.data));
      });
      again.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('reconnect failed'));
      });
    });
    assert.equal(second, '{"type":"snapshot","rev":1}');
    again.close();
  });

  it('returns a refused upgrade instead of leaving the socket open', async () => {
    const key = randomBytes(16).toString('base64');
    const client = net.connect(proxyPort, '127.0.0.1');
    const request = [
      'GET /companion-api/fail HTTP/1.1',
      `Host: 127.0.0.1:${proxyPort}`,
      'Origin: https://evil.example',
      'Upgrade: websocket',
      'Connection: Upgrade',
      'Sec-WebSocket-Version: 13',
      `Sec-WebSocket-Key: ${key}`,
      '',
      '',
    ].join('\r\n');
    const response = await new Promise((resolve, reject) => {
      let buffer = Buffer.alloc(0);
      const timer = setTimeout(() => reject(new Error('refused upgrade stayed open')), 2000);
      client.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
      });
      client.on('end', () => {
        clearTimeout(timer);
        resolve(buffer.toString('latin1'));
      });
      client.on('error', reject);
      client.on('connect', () => client.write(request));
    });
    assert.match(response, /^HTTP\/1\.1 403 /);
    assert.match(response, /origin-rejected/);
    assert.doesNotMatch(response, /alt-svc/i);
  });

  it('does not advertise HTTP/3 on the local origin', async () => {
    const client = net.connect(proxyPort, '127.0.0.1');
    const key = randomBytes(16).toString('base64');
    const request = [
      'GET /companion-api/sessions/ABCDEF HTTP/1.1',
      `Host: 127.0.0.1:${proxyPort}`,
      'Upgrade: websocket',
      'Connection: Upgrade',
      'Sec-WebSocket-Version: 13',
      `Sec-WebSocket-Key: ${key}`,
      'Sec-WebSocket-Extensions: permessage-deflate; client_max_window_bits',
      '',
      '',
    ].join('\r\n');
    const head = await new Promise((resolve, reject) => {
      let buffer = Buffer.alloc(0);
      const timer = setTimeout(() => reject(new Error('no handshake')), 2000);
      client.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        const end = buffer.indexOf('\r\n\r\n');
        if (end !== -1) {
          clearTimeout(timer);
          client.end();
          resolve(buffer.subarray(0, end).toString('latin1'));
        }
      });
      client.on('error', reject);
      client.on('connect', () => client.write(request));
    });
    assert.match(head, /^HTTP\/1\.1 101 /);
    assert.match(head, /sec-websocket-accept:/i);
    assert.doesNotMatch(head, /alt-svc/i);
    assert.doesNotMatch(head, /report-to/i);
    assert.equal(seen.at(-1).upgrade, 'websocket');
    assert.match(seen.at(-1).connection, /upgrade/i);
    assert.equal(seen.at(-1).host, `127.0.0.1:${upstreamPort}`);
    assert.equal(seen.at(-1).acceptEncoding, null);

    const plain = await fetch(`http://127.0.0.1:${proxyPort}/companion-api/plain`);
    assert.equal(await plain.text(), 'ok');
    assert.equal(plain.headers.get('alt-svc'), null);
  });

  it('serves the companion page for /c, /c/ and /c/index.html', async () => {
    const home = await fetch(`http://127.0.0.1:${proxyPort}/`);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /id="startBtn"/);

    for (const path of ['/c', '/c/', '/c/index.html', '/c?code=ABC123']) {
      const response = await fetch(`http://127.0.0.1:${proxyPort}${path}`);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-type') || '', /text\/html/);
      const body = await response.text();
      assert.match(body, /Companion · Tower Timer/);
      assert.match(body, /\.\.\/css\/companion\.css\?v=/);
      assert.match(body, /\.\.\/js\/companion-page\.js\?v=/);
      assert.match(body, /clocktower-companion\.redmeeple\.workers\.dev/);
    }

    const stylesheet = await fetch(`http://127.0.0.1:${proxyPort}/css/companion.css`);
    assert.equal(stylesheet.status, 200);
    const script = await fetch(`http://127.0.0.1:${proxyPort}/js/companion-page.js`);
    assert.equal(script.status, 200);
    const removed = await fetch(`http://127.0.0.1:${proxyPort}/companion.html`);
    assert.equal(removed.status, 404);
  });
});
