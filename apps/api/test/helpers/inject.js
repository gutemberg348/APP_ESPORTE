import { IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';

// Exercise the real Express middleware with Node request/response streams.
// There is no listener, network request, port or database connection.
export function inject(app, path, { method = 'GET', headers = {}, body, ip = '127.0.0.1' } = {}) {
  return new Promise((resolve, reject) => {
    const socket = new Duplex({ read() {}, write(chunk, encoding, callback) { callback(); } });
    socket.remoteAddress = ip;
    const req = new IncomingMessage(socket);
    req.method = method; req.url = path;
    req.httpVersion = '1.1'; req.httpVersionMajor = 1; req.httpVersionMinor = 1;
    req.headers = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
    const payload = body === undefined ? null : Buffer.from(body);
    if (payload && req.headers['content-length'] === undefined) req.headers['content-length'] = String(payload.length);
    req.rawHeaders = Object.entries(req.headers).flat();
    const res = new ServerResponse(req);
    res.assignSocket(socket);
    const chunks = [];
    const write = res.write, end = res.end;
    res.write = function (chunk, ...args) { if (chunk) chunks.push(Buffer.from(chunk)); return write.call(this, chunk, ...args); };
    res.end = function (chunk, ...args) { if (chunk) chunks.push(Buffer.from(chunk)); return end.call(this, chunk, ...args); };
    const timeout = setTimeout(() => { socket.destroy(); reject(new Error('In-memory request timed out')); }, 3000);
    res.on('error', reject);
    res.on('finish', () => {
      clearTimeout(timeout);
      const text = Buffer.concat(chunks).toString('utf8');
      const response = { status: res.statusCode, headers: new Headers(res.getHeaders()), text: async () => text, json: async () => JSON.parse(text) };
      socket.destroy(); resolve(response);
    });
    app.handle(req, res);
    queueMicrotask(() => { if (payload) req.push(payload); req.complete = true; req.push(null); });
  });
}
