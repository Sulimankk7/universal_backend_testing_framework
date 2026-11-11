import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const STATUS_LABELS = {
  passed: 'Passed',
  failed: 'Failed',
  skipped: 'Skipped',
  todo: 'Pending',
};

/** Render normalized test results as a self-contained HTML document. */
export function renderHtmlReport(results, { generatedAt = new Date() } = {}) {
  if (!Array.isArray(results)) {
    throw new TypeError('Test results must be provided as an array.');
  }

  const generatedDate = generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
  if (Number.isNaN(generatedDate.getTime())) {
    throw new TypeError('generatedAt must be a valid date.');
  }

  const counts = countStatuses(results);
  const successRate = results.length === 0
    ? '0.0'
    : ((counts.passed / results.length) * 100).toFixed(1);
  const overallStatus = results.length === 0
    ? 'No results'
    : counts.failed > 0
      ? 'Failed'
      : 'Passed';
  const generatedIso = generatedDate.toISOString();
  const generatedDisplay = generatedDate.toLocaleString();

  const groups = groupResultsByFile(results);
  const fileNavigation = renderFileNavigation(groups);
  const renderedGroups = groups.length === 0
    ? '<p class="empty-state">No test results are available for this run.</p>'
    : groups.map(renderResultGroup).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>Universal Backend Testing Framework — Test Report</title>
  <style>
    :root {
      color-scheme: light;
      --page: #f4f6f8;
      --surface: #ffffff;
      --surface-muted: #f8fafb;
      --text: #17212b;
      --muted: #5d6b78;
      --border: #dce3e8;
      --green: #147d52;
      --green-bg: #e7f5ee;
      --red: #b42332;
      --red-bg: #fff0f0;
      --amber: #9a5b00;
      --amber-bg: #fff5df;
      --shadow: 0 8px 24px rgb(20 34 48 / 5%);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-synthesis: none;
      text-rendering: optimizeLegibility;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--page); color: var(--text); }
    .shell { width: min(1400px, calc(100% - 40px)); margin: 0 auto; padding: 42px 0 56px; }
    .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
    .eyebrow { margin: 0 0 8px; color: var(--muted); font-size: 12px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(25px, 4vw, 34px); letter-spacing: -.035em; line-height: 1.15; }
    .generated { margin: 10px 0 0; color: var(--muted); font-size: 14px; }
    .overall { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 9px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); padding: 9px 14px; font-size: 13px; font-weight: 700; box-shadow: var(--shadow); }
    .overall::before { width: 9px; height: 9px; border-radius: 50%; background: var(--green); content: ""; }
    .overall.failed::before { background: var(--red); }
    .overall.empty::before { background: var(--amber); }
    .summary { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 14px; margin-bottom: 25px; }
    .report-layout { display: grid; grid-template-columns: minmax(210px, 250px) minmax(0, 1fr); align-items: start; gap: 22px; }
    .report-main { min-width: 0; }
    .file-navigation { position: sticky; top: 20px; max-height: calc(100vh - 40px); overflow: auto; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); padding: 17px 14px; box-shadow: var(--shadow); }
    .file-navigation-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 0 4px 12px; }
    .file-navigation-heading h2 { font-size: 15px; }
    .file-navigation-total { color: var(--muted); font-size: 12px; white-space: nowrap; }
    .file-navigation-list { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
    .file-navigation-link { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 7px; border-radius: 7px; padding: 8px 7px; color: var(--text); font-size: 12px; line-height: 1.45; text-decoration: none; }
    .file-navigation-link:hover, .file-navigation-link[aria-current="location"] { background: var(--surface-muted); }
    .file-navigation-link:focus-visible, .file-group summary:focus-visible { outline: 3px solid #3478c5; outline-offset: 2px; }
    .file-navigation-name { min-width: 0; overflow-wrap: anywhere; }
    .file-navigation-count { display: block; margin-top: 2px; color: var(--muted); font-size: 10px; }
    .file-navigation-link .file-status { padding: 3px 6px; font-size: 9px; }
    .card { min-height: 112px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); padding: 18px; box-shadow: var(--shadow); }
    .card-label { color: var(--muted); font-size: 12px; font-weight: 650; }
    .card-value { margin-top: 12px; font-size: 27px; font-weight: 750; letter-spacing: -.04em; }
    .card.passed .card-value { color: var(--green); }
    .card.failed .card-value { color: var(--red); }
    .card.skipped .card-value, .card.todo .card-value { color: var(--amber); }
    .section { overflow: hidden; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); box-shadow: var(--shadow); }
    .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px 22px; border-bottom: 1px solid var(--border); }
    h2 { margin: 0; font-size: 17px; letter-spacing: -.015em; }
    .result-count { color: var(--muted); font-size: 13px; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; min-width: 980px; table-layout: fixed; border-collapse: collapse; text-align: left; }
    th { background: var(--surface-muted); color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
    th, td { padding: 14px 18px; border-bottom: 1px solid var(--border); vertical-align: top; }
    td { font-size: 13px; }
    th:nth-child(1), td:nth-child(1) { width: 24%; min-width: 220px; }
    th:nth-child(2), td:nth-child(2) { width: 19%; min-width: 190px; }
    th:nth-child(3), td:nth-child(3) { width: 11%; min-width: 110px; }
    th:nth-child(4), td:nth-child(4) { width: 10%; min-width: 100px; }
    th:nth-child(5), td:nth-child(5) { width: 36%; min-width: 300px; }
    .test-name { font-weight: 650; overflow-wrap: anywhere; }
    .meta { color: var(--muted); line-height: 1.65; overflow-wrap: anywhere; }
    .type-source { word-break: normal; overflow-wrap: normal; }
    .type-source .source-value { margin-top: 4px; color: var(--muted); overflow-wrap: anywhere; }
    .file-groups { display: grid; gap: 12px; }
    details.file-group { overflow: hidden; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
    .file-group summary { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 12px 16px; background: var(--surface-muted); cursor: pointer; list-style-position: inside; }
    .file-group summary::marker { color: var(--muted); }
    .file-group-title { min-width: 0; font-size: 13px; font-weight: 700; overflow-wrap: anywhere; }
    .file-group-count { color: var(--muted); font-size: 12px; font-weight: 500; white-space: nowrap; }
    .file-group-status { margin-left: auto; }
    .file-status { display: inline-flex; align-items: center; gap: 5px; border-radius: 999px; padding: 4px 8px; font-size: 10px; font-weight: 750; white-space: nowrap; }
    .file-status.passed { color: var(--green); background: var(--green-bg); }
    .file-status.failed { color: var(--red); background: var(--red-bg); }
    .file-status.mixed { color: #714900; background: var(--amber-bg); }
    .file-status.skipped, .file-status.todo, .file-status.unknown { color: var(--muted); background: #edf1f4; }
    .file-group-table { border-top: 1px solid var(--border); }
    .file-group-table .table-wrap { overflow-x: auto; }
    .file-group-table table { border: 0; }
    .file-group-table tbody tr:last-child td { border-bottom: 0; }
    .status { display: inline-flex; align-items: center; gap: 7px; border-radius: 999px; padding: 5px 9px; font-size: 11px; font-weight: 750; white-space: nowrap; }
    .status.passed { color: var(--green); background: var(--green-bg); }
    .status.failed { color: var(--red); background: var(--red-bg); }
    .status.skipped, .status.todo { color: var(--amber); background: var(--amber-bg); }
    .duration { color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
    details.failure { border-left: 3px solid var(--red); padding: 10px 12px 12px; background: var(--red-bg); }
    details.failure summary { color: #79202b; cursor: pointer; font-size: 12px; font-weight: 700; }
    .failure-content { display: grid; gap: 14px; margin-top: 14px; }
    .failure-block { min-width: 0; }
    .failure-label { margin-bottom: 4px; color: #79202b; font-size: 11px; font-weight: 750; text-transform: uppercase; letter-spacing: .045em; }
    .failure-value { color: #3c2024; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; white-space: pre-wrap; }
    .error-message .failure-value { font-weight: 600; }
    details.stack-trace { border-top: 1px solid rgb(121 32 43 / 18%); padding-top: 10px; }
    details.stack-trace summary { color: #79202b; cursor: pointer; font-size: 11px; font-weight: 700; }
    .stack-content { max-height: 260px; overflow: auto; margin: 9px 0 0; border-radius: 6px; background: rgb(255 255 255 / 72%); padding: 10px; color: #3c2024; font: 11px/1.55 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
    .empty-state { padding: 48px 20px; color: var(--muted); text-align: center; }
    .footer { margin-top: 16px; color: var(--muted); font-size: 11px; text-align: right; }
    @media (max-width: 920px) { .summary { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 820px) {
      .report-layout { grid-template-columns: minmax(0, 1fr); }
      .file-navigation { position: static; max-height: none; }
      .file-navigation-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 620px) {
      .shell { width: min(100% - 24px, 1400px); padding-top: 26px; }
      .header { flex-direction: column; gap: 16px; }
      .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .card { min-height: 95px; padding: 14px; }
      .card-value { font-size: 24px; }
      .section-heading { padding: 16px; }
      th, td { padding: 12px; }
      .test-name { min-width: 180px; }
      .file-navigation-list { grid-template-columns: minmax(0, 1fr); }
      .file-group summary { flex-wrap: wrap; gap: 7px; padding: 12px; }
      .file-group-status { margin-left: 0; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="header">
      <div>
        <p class="eyebrow">Test execution report</p>
        <h1>Universal Backend Testing Framework</h1>
        <p class="generated">Generated <time datetime="${escapeHtml(generatedIso)}">${escapeHtml(generatedDisplay)}</time></p>
      </div>
      <div class="overall ${results.length === 0 ? 'empty' : counts.failed > 0 ? 'failed' : 'passed'}" role="status">${escapeHtml(overallStatus)}</div>
    </header>

    <div class="report-layout">
      ${fileNavigation}
      <div class="report-main">
        <section class="summary" aria-label="Test summary">
          ${renderSummaryCard('Total tests', results.length, 'total')}
          ${renderSummaryCard('Passed', counts.passed, 'passed')}
          ${renderSummaryCard('Failed', counts.failed, 'failed')}
          ${renderSummaryCard('Skipped', counts.skipped, 'skipped')}
          ${renderSummaryCard('Pending', counts.todo, 'todo')}
          ${renderSummaryCard('Success rate', `${successRate}%`, 'rate')}
        </section>

        <section class="section" aria-labelledby="results-title">
          <div class="section-heading">
            <h2 id="results-title">Test results</h2>
            <span class="result-count">${results.length} ${results.length === 1 ? 'result' : 'results'}</span>
          </div>
          <div class="file-groups">${renderedGroups}</div>
        </section>
      </div>
    </div>
    <footer class="footer">Generated by Universal Backend Testing Framework</footer>
  </main>
  <script>
    (() => {
      const navigation = document.querySelector('.file-navigation');
      if (!navigation) return;
      const links = [...navigation.querySelectorAll('a[href^="#"]')];
      const syncFileNavigation = () => {
        const targetId = window.location.hash.slice(1);
        const target = targetId ? document.getElementById(targetId) : null;
        if (target?.matches('details.file-group')) target.open = true;
        for (const link of links) {
          if (link.hash === window.location.hash && window.location.hash) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        }
      };
      navigation.addEventListener('click', (event) => {
        const link = event.target.closest('a[href^="#"]');
        if (!link) return;
        const target = document.getElementById(link.hash.slice(1));
        if (target?.matches('details.file-group')) target.open = true;
        for (const candidate of links) candidate.removeAttribute('aria-current');
        link.setAttribute('aria-current', 'location');
      });
      window.addEventListener('hashchange', syncFileNavigation);
      syncFileNavigation();
    })();
  </script>
</body>
</html>`;
}

/** Write a self-contained report and return its resolved output path. */
export async function writeHtmlReport(
  results,
  { outputPath = process.env.UBTF_HTML_REPORT_PATH || 'reports/test-report.html', generatedAt = new Date() } = {},
) {
  const resolvedPath = resolve(outputPath);
  const html = renderHtmlReport(results, { generatedAt });

  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, html, 'utf8');

  return resolvedPath;
}

function countStatuses(results) {
  return results.reduce((counts, result) => {
    if (Object.hasOwn(counts, result?.status)) counts[result.status] += 1;
    return counts;
  }, { passed: 0, failed: 0, skipped: 0, todo: 0 });
}

function renderSummaryCard(label, value, kind) {
  return `<article class="card ${kind}" data-summary="${kind}"><div class="card-label">${escapeHtml(label)}</div><div class="card-value">${escapeHtml(value)}</div></article>`;
}

function groupResultsByFile(results) {
  const groups = new Map();

  for (const result of results) {
    const file = typeof result?.file === 'string' && result.file.trim()
      ? result.file
      : 'Unknown Source';
    if (!groups.has(file)) groups.set(file, []);
    groups.get(file).push(result);
  }

  return [...groups.entries()].map(([file, fileResults], index) => ({
    file,
    results: fileResults,
    id: `test-file-group-${index + 1}`,
    status: summarizeFileStatus(fileResults),
  }));
}

function summarizeFileStatus(results) {
  const hasPassed = results.some((result) => result?.status === 'passed');
  const hasFailed = results.some((result) => result?.status === 'failed');
  if (hasPassed && hasFailed) return { label: 'Mixed', className: 'mixed', symbol: '±' };
  if (hasFailed) return { label: 'Failed', className: 'failed', symbol: '×' };
  if (hasPassed) return { label: 'Passed', className: 'passed', symbol: '✓' };
  if (results.some((result) => result?.status === 'skipped')) return { label: 'Skipped', className: 'skipped', symbol: '–' };
  if (results.some((result) => result?.status === 'todo')) return { label: 'Pending', className: 'todo', symbol: '…' };
  return { label: 'Unknown', className: 'unknown', symbol: '?' };
}

function renderFileNavigation(groups) {
  const links = groups.map(({ file, results, id, status }) => `<li><a class="file-navigation-link" href="#${escapeHtml(id)}"><span class="file-navigation-name">${escapeHtml(file)}<span class="file-navigation-count">${results.length} ${results.length === 1 ? 'test' : 'tests'}</span></span><span class="file-status ${status.className}"><span aria-hidden="true">${status.symbol}</span>${escapeHtml(status.label)}</span></a></li>`).join('\n');
  return `<nav class="file-navigation" aria-label="Test files">
  <div class="file-navigation-heading"><h2>Test Files</h2><span class="file-navigation-total">${groups.length} ${groups.length === 1 ? 'file' : 'files'}</span></div>
  ${groups.length ? `<ul class="file-navigation-list">${links}</ul>` : '<p class="meta">No test files</p>'}
</nav>`;
}

function renderResultGroup({ file, results, id, status }) {
  return `<details class="file-group" id="${escapeHtml(id)}" open>
  <summary><span class="file-group-title">${escapeHtml(file)}</span><span class="file-group-count">${results.length} ${results.length === 1 ? 'test' : 'tests'}</span><span class="file-status ${status.className} file-group-status"><span aria-hidden="true">${status.symbol}</span>${escapeHtml(status.label)}</span></summary>
  <div class="file-group-table"><div class="table-wrap"><table>
    <thead><tr><th scope="col">Test</th><th scope="col">Type / source</th><th scope="col">Status</th><th scope="col">Duration</th><th scope="col">Failure details</th></tr></thead>
    <tbody>${results.map(renderResultRow).join('\n')}</tbody>
  </table></div></div>
</details>`;
}

function renderResultRow(result) {
  const status = STATUS_LABELS[result?.status] ? result.status : 'todo';
  const label = STATUS_LABELS[status];
  const icon = status === 'passed' ? '✓' : status === 'failed' ? '×' : status === 'skipped' ? '–' : '…';
  const name = result?.fullName || result?.name || 'Unnamed test';
  const type = result?.testType || '—';
  const source = result?.source || '—';
  const duration = Number.isFinite(result?.durationMs) ? `${result.durationMs.toFixed(2)} ms` : '—';
  const errors = Array.isArray(result?.errors) ? result.errors : [];
  const analyses = Array.isArray(result?.failureAnalysis) ? result.failureAnalysis : [];
  const details = errors.length > 0
    ? `<details class="failure" open><summary>${errors.length} ${errors.length === 1 ? 'error' : 'errors'}</summary><div class="failure-content">${errors.map((error, index) => renderFailure(error, analyses[index])).join('')}</div></details>`
    : '<span class="meta">—</span>';

  return `<tr>
  <td class="test-name">${escapeHtml(name)}${result?.file ? `<div class="meta">${escapeHtml(result.file)}</div>` : ''}</td>
  <td class="type-source">${escapeHtml(type)}<div class="source-value">${escapeHtml(source)}</div></td>
  <td><span class="status ${status}" aria-label="${escapeHtml(label)}"><span aria-hidden="true">${icon}</span>${escapeHtml(label)}</span></td>
  <td class="duration">${escapeHtml(duration)}</td>
  <td>${details}</td>
</tr>`;
}

function renderFailure(error, analysis) {
  const expectedExists = analysis?.evidence && Object.hasOwn(analysis.evidence, 'expected');
  const actualExists = analysis?.evidence && Object.hasOwn(analysis.evidence, 'actual');
  const comparison = expectedExists || actualExists
    ? `<div class="failure-block"><div class="failure-label">Expected / actual</div><div class="failure-value">Expected: ${expectedExists ? renderValue(analysis.evidence.expected) : '—'}<br>Actual: ${actualExists ? renderValue(analysis.evidence.actual) : '—'}</div></div>`
    : '';
  const classification = analysis?.category
    ? `<div class="failure-block"><div class="failure-label">Classification</div><div class="failure-value">${escapeHtml(analysis.category)}${analysis.summary ? ` — ${escapeHtml(analysis.summary)}` : ''}</div></div>`
    : '';
  const recommendation = analysis?.recommendation
    ? `<div class="failure-block"><div class="failure-label">Recommended action</div><div class="failure-value">${escapeHtml(analysis.recommendation)}</div></div>`
    : '';
  const stack = error?.stack
    ? `<details class="stack-trace"><summary>Show stack trace</summary><pre class="stack-content">${escapeHtml(error.stack)}</pre></details>`
    : '';

  return `<div class="failure-block error-message"><div class="failure-label">${escapeHtml(error?.name || 'Error')}</div><div class="failure-value">${escapeHtml(error?.message || 'No error message available.')}</div></div>${comparison}${classification}${recommendation}${stack}`;
}

function renderValue(value) {
  if (typeof value === 'string') return escapeHtml(value);
  try {
    return escapeHtml(JSON.stringify(value));
  } catch {
    return escapeHtml(String(value));
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
