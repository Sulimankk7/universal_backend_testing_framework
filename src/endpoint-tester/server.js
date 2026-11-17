import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runEndpointTest } from './run-endpoint-test.js';
import { renderHtmlReport } from '../reporting/html/html-report.js';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, 'public');
const server = createServer(async (request, response) => {
  try {
    if (request.method === 'POST' && request.url === '/api/run') {
      const config = JSON.parse(await readBody(request));
      const result = await runEndpointTest(config);
      const report = addEndpointDetails(renderHtmlReport([result], { generatedAt: result.request.timestamp }), result);
      send(response, 200, 'application/json', JSON.stringify({ ...result, report }));
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
function addEndpointDetails(report, result) {
  const assertions = result.assertions.map((item) => `<li><b>${escapeHtml(item.name)} — ${item.passed ? 'Passed' : 'Failed'}</b>${item.passed ? '' : `<p>${escapeHtml(item.reason)}</p><pre>Expected: ${escapeHtml(JSON.stringify(item.expected))}\nActual: ${escapeHtml(JSON.stringify(item.actual))}</pre>`}</li>`).join('');
  const details = `<section style="font:14px system-ui;margin:32px auto;max-width:1100px;padding:24px;border:1px solid #dce3e8;border-radius:12px;background:white;color:#17212b"><h2>Endpoint response details</h2><p><b>${escapeHtml(result.request.method)}</b> ${escapeHtml(result.request.url)}</p><p>Timestamp: ${escapeHtml(result.request.timestamp)} · Expected status: ${result.request.expectedStatus} · Actual status: ${result.response?.status ?? 'Request failed'} · Response time: ${Math.round(result.response?.durationMs ?? 0)} ms · Response size: ${result.response?.sizeBytes ?? 0} bytes</p><h3>Assertions</h3><ul>${assertions || '<li>No response assertions configured.</li>'}</ul><h3>Response headers</h3><pre>${escapeHtml(JSON.stringify(result.response?.headers ?? {}, null, 2))}</pre><h3>Response body</h3><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(result.response ? JSON.stringify(result.response.body, null, 2) : result.execution.error)}</pre></section>`;
  return report.replace('</body>', `${details}</body>`);
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
