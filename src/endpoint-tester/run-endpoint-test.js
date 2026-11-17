import { createRestClient } from '../adapters/rest/rest-client.js';
import { createRestAdapter } from '../adapters/rest/rest-adapter.js';
import { createRestTestAdapter } from '../adapters/rest/rest-test-adapter.js';
import { compareJSON } from '../adapters/rest/assertions/json-comparison.js';
import ResultCollector from '../core/collection/result-collector.js';

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

export function validateEndpointConfig(config) {
  if (!config || typeof config.url !== 'string') throw new TypeError('Enter an endpoint URL.');
  let url;
  try { url = new URL(config.url); } catch { throw new TypeError('Enter a valid absolute URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new TypeError('Use an HTTP or HTTPS URL without embedded credentials.');
  if (!METHODS.has(config.method)) throw new TypeError('Choose a supported HTTP method.');
  const status = Number(config.expectedStatus);
  if (!Number.isInteger(status) || status < 100 || status > 599) throw new TypeError('Expected status must be an HTTP status code from 100 to 599.');
  if (BODY_METHODS.has(config.method) && config.body?.trim()) parseJSON(config.body, 'Request body');
  if (!BODY_METHODS.has(config.method) && config.body?.trim()) throw new TypeError(`${config.method} requests do not accept a request body.`);
  parseExpectedResponse(config.expectedResponseJSON);
  if (process.env.UBTF_HOSTED === 'true' && isPrivateHost(url.hostname)) throw new TypeError('Hosted runner requests cannot target private or local network addresses.');
  return url;
}

export async function runEndpointTest(config) {
  const url = validateEndpointConfig(config);
  const headers = Object.fromEntries((config.headers ?? []).filter(({ key }) => key?.trim()).map(({ key, value }) => [key.trim(), value ?? '']));
  if (config.bearerToken?.trim()) headers.Authorization = `Bearer ${config.bearerToken.trim()}`;
  const credentials = [config.bearerToken?.trim(), ...Object.entries(headers).filter(([key]) => /authorization|token|api[-_]?key|secret|password/i.test(key)).map(([, value]) => value)].filter(Boolean);
  const body = BODY_METHODS.has(config.method) && config.body?.trim() ? parseJSON(config.body, 'Request body') : undefined;
  const expectedResponse = parseExpectedResponse(config.expectedResponseJSON);
  const collector = new ResultCollector();
  const restTests = createRestTestAdapter({ collector, testType: 'endpoint' });
  const rest = createRestAdapter(createRestClient({ baseURL: url.origin }));
  let response;
  let executionError;
  const started = new Date();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('Request timed out.')), Math.max(1, Math.min(Number(config.timeoutMs) || 15000, 120000)));
    try {
      const options = { headers, signal: controller.signal, redirect: 'error' };
      const method = config.method.toLowerCase();
      response = BODY_METHODS.has(config.method) ? await rest[method](url.pathname + url.search, body, options) : await rest[method](url.pathname + url.search, options);
    } catch (error) {
      executionError = safeError(error, credentials);
    } finally { clearTimeout(timeout); }
  } catch (error) { executionError = safeError(error, credentials); }

  const assertions = [];
  if (response) {
    const expectedStatus = Number(config.expectedStatus);
    const passed = response.status === expectedStatus;
    assertions.push({
      name: 'Expected HTTP status',
      passed,
      expected: expectedStatus,
      actual: response.status,
      reason: passed ? null : `Expected HTTP status ${expectedStatus}, but received ${response.status}.`,
    });
    if (expectedResponse !== undefined) {
      const mismatches = compareJSON(expectedResponse, response.body);
      for (const mismatch of mismatches) {
        assertions.push({
          name: `Expected response JSON at ${mismatch.path}`,
          passed: false,
          expected: scrub(mismatch.expected, credentials),
          actual: scrub(mismatch.actual, credentials),
          reason: `${mismatch.reason} Expected response JSON at ${mismatch.path}.`,
        });
      }
      if (mismatches.length === 0) {
        assertions.push({ name: 'Expected response JSON', passed: true, expected: scrub(expectedResponse, credentials), actual: scrub(response.body, credentials), reason: null });
      }
    }
  }
  const assertionFailed = assertions.some((a) => !a.passed);
  const testError = executionError ?? assertions.find((a) => !a.passed)?.reason ?? null;
  const collected = await restTests.run({ name: `${config.method} ${redactURL(url)}`, file: 'Universal REST Endpoint Tester', callback: async () => {
    if (executionError) throw new Error(executionError);
    if (assertionFailed) throw new Error(testError);
  }});
  // Collection is the canonical execution record. Assertion detail remains in this run's report payload.
  const record = collected;
  const result = {
    ...record,
    status: executionError || assertionFailed ? 'failed' : 'passed',
    assertions,
    request: { url: redactURL(url), method: config.method, timestamp: started.toISOString(), expectedStatus: Number(config.expectedStatus) },
    response: response ? { status: response.status, statusText: response.statusText, headers: scrub(response.headers, credentials), durationMs: response.responseTimeMs, sizeBytes: byteSize(response.body), body: scrub(response.body, credentials) } : null,
    execution: executionError ? { success: false, error: executionError } : { success: true },
    summaryError: testError,
  };
  return result;
}

function parseJSON(value, label) { try { return JSON.parse(value); } catch (error) { throw new TypeError(`${label} must be valid JSON: ${error.message}`); } }
function parseExpectedResponse(value) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = parseJSON(value, 'Expected response JSON');
  if (parsed === null || typeof parsed !== 'object') throw new TypeError('Expected response JSON must be a JSON object or array.');
  return parsed;
}
function byteSize(body) { return body === null ? 0 : Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body)); }
function safeError(error, secrets) { let message = error?.name === 'AbortError' || error?.cause?.name === 'AbortError' || /timed out/i.test(error?.message ?? '') ? 'Request timed out.' : error?.message ?? String(error); for (const secret of secrets) if (secret) message = message.split(secret).join('[REDACTED]'); return message; }
function scrub(value, secrets) { if (typeof value === 'string') { for (const secret of secrets) if (secret) value = value.split(secret).join('[REDACTED]'); return value; } if (Array.isArray(value)) return value.map((entry) => scrub(entry, secrets)); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, scrub(entry, secrets)])); return value; }
function redactURL(url) { const copy = new URL(url); for (const key of copy.searchParams.keys()) if (/token|key|secret|auth|password/i.test(key)) copy.searchParams.set(key, '[REDACTED]'); return copy.href; }
function isPrivateHost(host) { const name = host.toLowerCase().replace(/^\[|\]$/g, ''); if (['localhost', '::1'].includes(name) || name.endsWith('.localhost') || name.endsWith('.local')) return true; const parts = name.split('.').map(Number); if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return name.includes(':') && (/^(fc|fd|fe80)/i.test(name)); const [a,b] = parts; return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224; }
