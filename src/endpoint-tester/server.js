import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runEndpointTest } from './run-endpoint-test.js';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, 'public');
const server = createServer(async (request, response) => {
  try {
    if (request.method === 'POST' && request.url === '/api/run') {
      const config = JSON.parse(await readBody(request));
      const result = await runEndpointTest(config);
      send(response, 200, 'application/json', JSON.stringify(result));
      return;
    }
    if (request.method === 'GET' && request.url === '/') {
      send(response, 200, 'text/html; charset=utf-8', await readFile(resolve(publicDir, 'index.html')));
      return;
    }
    if (request.method === 'GET' && request.url === '/app.js') {
      send(response, 200, 'text/javascript; charset=utf-8', await readFile(resolve(publicDir, 'app.js')));
      return;
    }
    if (request.method === 'GET' && request.url === '/style.css') {
      send(response, 200, 'text/css; charset=utf-8', await readFile(resolve(publicDir, 'style.css')));
      return;
    }
    send(response, 404, 'text/plain; charset=utf-8', 'Not found');
  } catch (error) {
    send(response, 400, 'application/json', JSON.stringify({ error: error.message ?? 'Request failed.' }));
  }
});
const port = Number(process.env.UBTF_PORT) || 4173;
server.listen(port, '127.0.0.1', () => console.log(`Universal REST Endpoint Tester: http://127.0.0.1:${port}`));

function send(res, status, type, body) { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'" }); res.end(body); }
async function readBody(req) { let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 1_000_000) throw new Error('Request configuration is too large.'); } return body; }
