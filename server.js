import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('.', import.meta.url).pathname;
const mime = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json' };

createServer(async (request, response) => {
  const pathname = request.url === '/' ? '/index.html' : request.url.split('?')[0];
  const vendorFiles = {
    '/vendor/pouchdb.js': join(root, 'node_modules/pouchdb/dist/pouchdb.min.js'),
    '/vendor/pouchdb-indexeddb.js': join(root, 'node_modules/pouchdb/dist/pouchdb.indexeddb.js')
  };
  const file = vendorFiles[pathname] || normalize(join(root, 'public', pathname));
  if (!vendorFiles[pathname] && !file.startsWith(join(root, 'public'))) {
    response.writeHead(403); response.end(); return;
  }
  try {
    const content = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    response.end(content);
  } catch {
    response.writeHead(404); response.end('Not found');
  }
}).listen(3000, '127.0.0.1', () => console.log('Steward is available at http://127.0.0.1:3000'));
