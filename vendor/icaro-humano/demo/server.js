// Servidor da demo (Node 18+, sem dependências): node demo/server.js  →  http://localhost:3000
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createTtsTimestampsHandler } = require('../server/tts-timestamps');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' };
const tts = createTtsTimestampsHandler();

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/tts-ts' && req.method === 'POST') return tts(req, res);
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/demo/index.html';
  const file = path.resolve(ROOT, '.' + p);
  const allowed = [path.join(ROOT, 'avatar'), path.join(ROOT, 'demo')];
  if (!allowed.some(d => file.startsWith(d + path.sep))) { res.writeHead(404); return res.end('não encontrado'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('não encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`Demo do rosto em http://localhost:${PORT}  (voz real: ${process.env.ELEVENLABS_API_KEY ? 'sim' : 'defina ELEVENLABS_API_KEY/ELEVENLABS_VOICE_ID'})`));
