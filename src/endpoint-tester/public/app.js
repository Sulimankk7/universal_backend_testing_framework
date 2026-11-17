const $ = (id) => document.getElementById(id);
const form = $('test-form');
const methodsWithBody = new Set(['POST', 'PUT', 'PATCH']);

$('add-header').addEventListener('click', () => {
  const row = document.createElement('div');
  row.className = 'header-row';
  row.innerHTML = '<input aria-label="Header name" placeholder="Header name"><input aria-label="Header value" placeholder="Header value"><button type="button" aria-label="Remove header">×</button>';
  row.querySelector('button').onclick = () => row.remove();
  $('headers').append(row);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  $('form-error').textContent = '';
  const expectedResponseJSON = $('expected-response').value;
  if (expectedResponseJSON.trim()) {
    try {
      const expectedValue = JSON.parse(expectedResponseJSON);
      if (expectedValue === null || typeof expectedValue !== 'object') {
        throw new Error('Expected response JSON must be a JSON object or array.');
      }
    } catch (error) {
      $('form-error').textContent = error.message.startsWith('Expected response JSON')
        ? error.message
        : `Expected response JSON must be valid JSON: ${error.message}`;
      return;
    }
  }
  const run = document.querySelector('.run');
  run.disabled = true;
  run.textContent = 'Running…';
  $('results').innerHTML = '<h2 id="response-title">Response</h2><p class="empty">Request in progress…</p>';

  const config = {
    url: $('url').value.trim(),
    method: $('method').value,
    expectedStatus: $('status').value,
    body: methodsWithBody.has($('method').value) ? $('body').value : '',
    expectedResponseJSON,
    bearerToken: $('token').value,
    headers: [...document.querySelectorAll('.header-row')].map((row) => ({ key: row.children[0].value, value: row.children[1].value })),
  };

  try {
    const response = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    renderResult(result);
  } catch (error) {
    $('results').innerHTML = `<h2 id="response-title">Response</h2><p class="failure-reason">${escapeHtml(error.message)}</p>`;
  } finally {
    run.disabled = false;
    run.textContent = 'Run Test';
  }
});

function renderResult(result) {
  const passed = result.status === 'passed';
  const failedAssertions = result.assertions.filter((assertion) => !assertion.passed);
  const failureReason = result.execution.success ? failedAssertions[0]?.reason : null;
  const body = result.response?.body;
  const bodyMarkup = renderBody(body, result.response?.headers?.['content-type']);
  const actualStatus = result.response?.status === undefined ? 'No response' : `${result.response.status}${result.response.statusText ? ` ${result.response.statusText}` : ''}`;
  const debug = {
    expectedStatus: result.request.expectedStatus,
    responseTimeMs: result.response?.durationMs ?? null,
    responseSizeBytes: result.response?.sizeBytes ?? null,
    responseHeaders: result.response?.headers ?? {},
    assertions: result.assertions,
  };

  $('results').innerHTML = `
    <h2 id="response-title">Response</h2>
    <div class="result-head">
      <strong class="status ${passed ? 'success' : 'failure'}">${passed ? 'PASSED' : 'FAILED'}</strong>
      <span class="actual-status">Actual status: <strong class="${passed ? 'green' : 'red'}">${escapeHtml(actualStatus)}</strong></span>
      ${result.response ? `<span class="duration">${Math.round(result.response.durationMs)} ms</span>` : ''}
    </div>
    <p class="endpoint">${escapeHtml(result.request.method)} ${escapeHtml(result.request.url)}</p>
    ${failureReason ? `<p class="failure-reason">${escapeHtml(failureReason)}</p>` : ''}
    ${failedAssertions.map((assertion) => `<div class="failure-values"><span>${escapeHtml(assertion.name)} · Expected<code>${escapeHtml(format(assertion.expected))}</code></span><span>Actual<code>${escapeHtml(format(assertion.actual))}</code></span></div>`).join('')}
    ${result.execution.success ? '' : `<p class="failure-reason">Request execution failed: ${escapeHtml(result.execution.error)}</p>`}
    <div class="response-body"><h3>Response Body</h3><pre>${bodyMarkup}</pre></div>
    <details class="response-meta"><summary>Response details</summary><pre>${escapeHtml(format(debug))}</pre></details>`;
}

function format(value) {
  if (value === undefined) return '(missing)';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function renderBody(body, contentType = '') {
  if (body === undefined || body === null) return '(empty response)';
  if (typeof body === 'string') {
    if (!/\b(?:application|text)\/[^;]*\+?json\b|application\/json\b/i.test(contentType)) return escapeHtml(body);
    try {
      return highlightJSON(JSON.parse(body));
    } catch {
      return escapeHtml(body);
    }
  }
  return highlightJSON(body);
}

function highlightJSON(value) {
  const source = JSON.stringify(value, null, 2);
  const tokens = /("(?:\\.|[^"\\])*")|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;
  let output = '';
  let lastIndex = 0;
  for (const match of source.matchAll(tokens)) {
    const index = match.index;
    const token = match[0];
    output += escapeHtml(source.slice(lastIndex, index));
    const isKey = Boolean(match[1]) && /^\s*:/.test(source.slice(index + token.length));
    const kind = isKey ? 'json-key' : match[1] ? 'json-string' : match[2] ? 'json-number' : 'json-literal';
    output += `<span class="${kind}">${escapeHtml(token)}</span>`;
    lastIndex = index + token.length;
  }
  return output + escapeHtml(source.slice(lastIndex));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}
