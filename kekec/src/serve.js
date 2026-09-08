// Dev server for dist/. Static hosts serve <dir>/index.html for a directory URL;
// this does the same so local previews match GitHub Pages (§11, open question 6).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT ?? 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};

if (!fs.existsSync(DIST)) {
  console.error('dist/ does not exist. Run: npm run build');
  process.exit(1);
}

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let file = path.join(DIST, url);

  // Refuse anything that escapes dist/.
  if (!file.startsWith(DIST)) { res.writeHead(403).end('Forbidden'); return; }

  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<h1>404</h1><p><a href="/">Kekec</a></p>');
    return;
  }

  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  res.end(fs.readFileSync(file));
}).listen(PORT, () => console.log(`http://localhost:${PORT}/`));
