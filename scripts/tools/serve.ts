// Test tool: serves a built site (out/) the way GitHub Pages does, so the browser tests run on the real build.
// Usage: tsx scripts/tools/serve.ts <dir> <port> [base]   e.g. tsx scripts/tools/serve.ts out 4173 /gc-map
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const [dir = 'out', port = '4173', base = ''] = process.argv.slice(2);
const root = resolve(dir);
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon',
};

createServer((req, res) => {
  let path = decodeURIComponent((req.url ?? '/').split('?')[0]!);
  if (base && path.startsWith(base)) path = path.slice(base.length) || '/';
  let file = normalize(join(root, path));
  if (!file.startsWith(root)) return void res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    // GitHub Pages: unknown paths get the site's 404 page
    res.writeHead(404, { 'content-type': TYPES['.html']! });
    return void createReadStream(join(root, '404.html')).pipe(res);
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(Number(port));
