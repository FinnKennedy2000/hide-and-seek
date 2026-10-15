const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PUBLIC = new Set(['index.html', 'game.js', 'style.css']);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end('Method Not Allowed');
  }
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    res.writeHead(400);
    return res.end('Bad Request');
  }
  if (rel.includes('\0')) {
    res.writeHead(400);
    return res.end('Bad Request');
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(ROOT, '.' + path.sep + path.normalize(rel));
  // reject traversal outside root, and only serve the game's own files
  if (!file.startsWith(ROOT + path.sep) || !PUBLIC.has(path.relative(ROOT, file))) {
    res.writeHead(file.startsWith(ROOT + path.sep) ? 404 : 403);
    return res.end(file.startsWith(ROOT + path.sep) ? 'Not Found' : 'Forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not Found');
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Hide & Seek on http://localhost:${port}`));
