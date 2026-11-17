import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const STATUS_LABELS = {
  passed: 'Passed',
  failed: 'Failed',
  skipped: 'Skipped',
  todo: 'Pending',
};

/** Render normalized test results as a self-contained HTML document. */
export function renderHtmlReport(results, {
  generatedAt = new Date(),
  runErrors = [],
  runStatus = 'passed',
  projectName = 'Universal Backend Testing Framework',
} = {}) {
  if (!Array.isArray(results)) {
    throw new TypeError('Test results must be provided as an array.');
  }
  if (!Array.isArray(runErrors)) {
    throw new TypeError('Run errors must be provided as an array.');
  }

  const generatedDate = generatedAt instanceof Date ? generatedAt : new Date(generatedAt);
  if (Number.isNaN(generatedDate.getTime())) {
    throw new TypeError('generatedAt must be a valid date.');
  }

  const counts = countStatuses(results);
  const successRate = results.length === 0
    ? '0.0'
    : ((counts.passed / results.length) * 100).toFixed(1);
  const completedDisplay = generatedDate.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC',
  }).replace(/, (?=\d{2}:)/, ' ·');

  const groups = groupResultsByFile(results);
  const fileNavigation = renderFileNavigation(groups, results.length);
  const renderedGroups = groups.length === 0
    ? '<p class="empty-state">No test results are available for this run.</p>'
    : groups.map(renderResultGroup).join('\n');
  const renderedRunErrors = runErrors.length === 0
    ? ''
    : `<section class="section run-errors" aria-labelledby="run-errors-title">
  <div class="section-heading"><h2 id="run-errors-title">Vitest run errors</h2><span class="result-count">${runErrors.length} ${runErrors.length === 1 ? 'error' : 'errors'}</span></div>
  <div class="run-error-list">${runErrors.map(renderRunError).join('\n')}</div>
</section>`;
  const runStatusNotice = runStatus === 'interrupted'
    ? '<p class="run-status-notice" role="status">Vitest run was interrupted before all tests completed.</p>'
    : runStatus === 'failed' && runErrors.length === 0 && counts.failed === 0
      ? '<p class="run-status-notice" role="status">Vitest marked the run as failed without a captured test or module error.</p>'
      : '';

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
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-synthesis: none;
      text-rendering: optimizeLegibility;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--page); color: var(--text); }
    .shell { width: min(1400px, calc(100% - 40px)); margin: 0 auto; padding: 26px 0 36px; }
    .header { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 22px; padding-bottom: 18px; border-bottom: 1px solid var(--border); }
    .brand { display: flex; align-items: center; gap: 14px; min-width: 0; }
    .brand-mark { display: grid; width: 38px; height: 38px; flex: 0 0 auto; place-items: center; border-radius: 6px; background: var(--text); color: var(--surface); font-size: 13px; font-weight: 800; }
    .brand-copy { min-width: 0; }
    .eyebrow { margin: 3px 0 0; color: var(--muted); font-size: 13px; }
    h1 { margin: 0; font-size: clamp(19px, 2.3vw, 23px); letter-spacing: -.025em; line-height: 1.2; }
    .run-meta { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 7px 18px; color: var(--muted); font-size: 12px; }
    .run-meta strong { margin-right: 5px; color: var(--text); font-weight: 600; }
    .summary { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); margin-bottom: 22px; overflow: hidden; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); }
    .report-layout { display: grid; grid-template-columns: minmax(220px, 273px) minmax(0, 1fr); align-items: start; gap: 22px; }
    .report-main { min-width: 0; }
    .file-navigation { position: sticky; top: 16px; max-height: calc(100vh - 32px); overflow: auto; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); }
    .file-navigation-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 0; padding: 17px 18px; border-bottom: 1px solid var(--border); }
    .file-navigation-heading h2 { font-size: 14px; }
    .file-navigation-total { color: var(--muted); font-size: 12px; }
    .file-navigation-list { display: grid; gap: 0; margin: 0; padding: 8px; list-style: none; }
    .file-navigation-link { display: grid; grid-template-columns: 8px minmax(0, 1fr) auto auto; align-items: center; gap: 8px; border-radius: 4px; padding: 9px 10px; color: var(--text); font-size: 12px; line-height: 1.35; text-decoration: none; }
    .file-navigation-link:hover, .file-navigation-link[aria-current="location"], .file-navigation-link[aria-current="page"] { background: var(--surface-muted); }
    .file-navigation-link:focus-visible, .file-group summary:focus-visible { outline: 3px solid #3478c5; outline-offset: 2px; }
    .file-navigation-name { min-width: 0; overflow-wrap: anywhere; }
    .file-navigation-count { color: var(--muted); font-size: 11px; }
    .file-status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); }
    .file-status-dot.passed { background-color: var(--green); }
    .file-status-label.passed { color: var(--green); }
    .file-status-dot.failed { background-color: var(--red); }
    .file-status-label.failed { color: var(--red); }
    .file-status-dot.mixed { background-color: var(--amber); }
    .file-status-label.mixed { color: var(--amber); }
    .file-status-label { color: var(--muted); font-size: 10px; text-transform: uppercase; }
    .file-navigation-link .file-status { padding: 0; font-size: 10px; }
    .all-files-link { grid-template-columns: minmax(0, 1fr) auto; margin: 0 8px; border-radius: 4px; background: var(--surface-muted); }
    .all-files-link .file-navigation-count { margin-left: auto; }
    .card { display: flex; min-width: 0; min-height: 82px; flex-direction: column; justify-content: center; padding: 12px 20px; border-right: 1px solid var(--border); background: transparent; }
    .card:first-child { padding-left: 20px; }
    .card:last-child { border-right: 0; }
    .card-label { color: var(--muted); font-size: 11px; font-weight: 600; letter-spacing: .035em; text-transform: uppercase; }
    .card-value { margin-top: 5px; font-size: 25px; font-weight: 750; letter-spacing: -.035em; line-height: 1; }
    .card.passed .card-value { color: var(--green); }
    .card.failed .card-value { color: var(--red); }
    .card.skipped .card-value, .card.todo .card-value { color: var(--amber); }
    .section { overflow: hidden; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); }
    .section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 15px 18px 13px; border-bottom: 1px solid var(--border); }
    .section-heading-copy { min-width: 0; }
    .section-heading .meta { margin-top: 4px; font-size: 12px; }
    h2 { margin: 0; font-size: 14px; letter-spacing: -.015em; }
    .result-count { color: var(--muted); font-size: 12px; white-space: nowrap; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; min-width: 980px; table-layout: fixed; border-collapse: collapse; text-align: left; }
    th { background: var(--surface-muted); color: var(--muted); font-size: 11px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
    th, td { padding: 11px 14px; border-bottom: 1px solid var(--border); vertical-align: top; }
    td { font-size: 13px; }
    th:nth-child(1), td:nth-child(1) { width: 24%; min-width: 220px; }
    th:nth-child(2), td:nth-child(2) { width: 19%; min-width: 190px; }
    th:nth-child(3), td:nth-child(3) { width: 11%; min-width: 110px; }
    th:nth-child(4), td:nth-child(4) { width: 10%; min-width: 100px; }
    th:nth-child(5), td:nth-child(5) { width: 36%; min-width: 300px; }
    .test-name { font-weight: 650; overflow-wrap: anywhere; }
    .test-path { margin-top: 4px; color: var(--muted); font-size: 11px; font-weight: 400; line-height: 1.35; overflow-wrap: anywhere; }
    .meta { color: var(--muted); line-height: 1.65; overflow-wrap: anywhere; }
    .type-source { word-break: normal; overflow-wrap: normal; }
    .type-source .source-value { margin-top: 4px; color: var(--muted); overflow-wrap: anywhere; }
    .file-groups { display: grid; gap: 0; }
    details.file-group { overflow: hidden; border-bottom: 1px solid var(--border); background: var(--surface); }
    .file-group summary { display: flex; align-items: center; gap: 8px; min-height: 35px; padding: 6px 14px; background: var(--surface-muted); cursor: pointer; list-style-position: inside; }
    .file-group summary::marker { color: var(--muted); }
    .file-group-title { min-width: 0; font-size: 13px; font-weight: 700; overflow-wrap: anywhere; }
    .file-group-count, .file-group-status { display: none; }
    .file-status { display: inline-flex; align-items: center; gap: 5px; border-radius: 999px; padding: 4px 8px; font-size: 10px; font-weight: 750; white-space: nowrap; }
    .file-status.passed { color: var(--green); background: var(--green-bg); }
    .file-status.failed { color: var(--red); background: var(--red-bg); }
    .file-status.mixed { color: #714900; background: var(--amber-bg); }
    .file-status.skipped, .file-status.todo, .file-status.unknown { color: var(--muted); background: #edf1f4; }
    .file-group-table { border-top: 1px solid var(--border); }
    .file-group-table .table-wrap { overflow-x: auto; }
    .file-group-table table { border: 0; }
    .file-group-table tbody tr:last-child td { border-bottom: 0; }
    .status { display: inline-flex; align-items: center; gap: 6px; padding: 0; font-size: 10px; font-weight: 750; letter-spacing: .035em; text-transform: uppercase; white-space: nowrap; }
    .status span[aria-hidden="true"] { font-size: 0; }
    .status span[aria-hidden="true"]::before { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: currentColor; content: ""; }
    .status.passed { color: var(--green); }
    .status.failed { color: var(--red); }
    .status.skipped, .status.todo { color: var(--amber); }
    .rate-value { display: flex; align-items: center; gap: 14px; }
    .rate-track { height: 4px; flex: 1; min-width: 35px; overflow: hidden; border-radius: 999px; background: var(--border); }
    .rate-fill { height: 100%; background: var(--green); }
    .duration { color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
    details.failure { border-left: 2px solid var(--red); padding: 6px 9px; background: var(--red-bg); }
    details.failure summary { color: #79202b; cursor: pointer; font-size: 12px; font-weight: 700; }
    .failure-content { display: grid; gap: 7px; margin-top: 7px; }
    .run-errors { margin-bottom: 18px; border-color: #e4b8bd; }
    .run-status-notice { margin: 0 0 18px; border: 1px solid var(--amber); border-radius: 10px; background: var(--amber-bg); padding: 14px 18px; color: var(--text); font-size: 13px; }
    .run-error-list { display: grid; }
    .run-error { padding: 16px 20px; border-bottom: 1px solid var(--border); }
    .run-error:last-child { border-bottom: 0; }
    .run-error-file { margin: 0 0 12px; color: var(--muted); font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; }
    .failure-block { min-width: 0; }
    .failure-label { margin-bottom: 4px; color: #79202b; font-size: 11px; font-weight: 750; text-transform: uppercase; letter-spacing: .045em; }
    .failure-value { color: #3c2024; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; white-space: pre-wrap; }
    .error-message .failure-value { font-weight: 600; }
    details.stack-trace { border-top: 1px solid rgb(121 32 43 / 18%); padding-top: 10px; }
    details.stack-trace summary { color: #79202b; cursor: pointer; font-size: 11px; font-weight: 700; }
    .stack-content { max-height: 260px; overflow: auto; margin: 9px 0 0; border-radius: 6px; background: rgb(255 255 255 / 72%); padding: 10px; color: #3c2024; font: 11px/1.55 ui-monospace, SFMono-Regular, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
    .empty-state { padding: 24px 10px; color: var(--muted); }
    @media (max-width: 1000px) { .summary { grid-template-columns: repeat(3, minmax(0, 1fr)); } .card:nth-child(3) { border-right: 0; } .card:nth-child(n+4) { border-top: 1px solid var(--border); } }
    @media (max-width: 820px) {
      .header { align-items: flex-start; flex-wrap: wrap; }
      .run-meta { justify-content: flex-start; }
      .report-layout { grid-template-columns: minmax(0, 1fr); }
      .report-main { order: 1; }
      .file-navigation { position: static; order: 2; max-height: none; }
      .file-navigation-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 620px) {
      .shell { width: min(100% - 24px, 1400px); padding-top: 20px; }
      .header { flex-wrap: wrap; gap: 7px 12px; margin-bottom: 14px; }
      .summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .card { min-height: 70px; padding: 10px 12px; }
      .card:first-child { padding-left: 12px; }
      .card:nth-child(odd) { border-right: 1px solid var(--border); }
      .card:nth-child(even) { border-right: 0; }
      .card:nth-child(n+3) { border-top: 1px solid var(--border); }
      .card-value { font-size: 22px; }
      .section-heading { padding: 13px 12px; }
      th, td { padding: 8px; }
      .test-name { min-width: 180px; }
      .file-navigation-list { grid-template-columns: minmax(0, 1fr); }
      .file-group summary { flex-wrap: wrap; gap: 7px; padding: 8px 12px; }
      .run-meta { justify-content: flex-start; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="header">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">UB</span>
        <div class="brand-copy">
          <h1>Universal Backend Testing Framework</h1>
          <p class="eyebrow">HTML Test Execution Report</p>
        </div>
      </div>
      <div class="run-meta" aria-label="Run information">
        <span><strong>Project</strong>${escapeHtml(projectName)}</span>
        <span><strong>Completed</strong><time datetime="${escapeHtml(generatedDate.toISOString())}">${escapeHtml(completedDisplay)} UTC</time></span>
      </div>
    </header>

    <div class="report-layout">
      ${fileNavigation}
      <div class="report-main">
        ${runStatusNotice}
        ${renderedRunErrors}
        <section class="summary" aria-label="Test summary">
          ${renderSummaryCard('Total Tests', results.length, 'total')}
          ${renderSummaryCard('Passed', counts.passed, 'passed')}
          ${renderSummaryCard('Failed', counts.failed, 'failed')}
          ${renderSummaryCard('Skipped', counts.skipped, 'skipped')}
          ${renderSummaryCard('Pending', counts.todo, 'todo')}
          ${renderSummaryCard('Success Rate', `${successRate}%`, 'rate')}
        </section>

        <section class="section" id="test-results" aria-labelledby="results-title">
          <div class="section-heading">
            <div class="section-heading-copy"><h2 id="results-title">Test results</h2><p class="meta">All test files</p></div>
            <span class="result-count">${results.length} ${results.length === 1 ? 'result' : 'results'}</span>
          </div>
          <div class="file-groups">${renderedGroups}</div>
        </section>
      </div>
    </div>
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
          else if (!window.location.hash && link.hash === '#test-results') link.setAttribute('aria-current', 'page');
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
  {
    outputPath = process.env.UBTF_HTML_REPORT_PATH || 'reports/test-report.html',
    generatedAt = new Date(),
    runErrors = [],
    runStatus = 'passed',
    projectName = 'Universal Backend Testing Framework',
  } = {},
) {
  const resolvedPath = resolve(outputPath);
  const html = renderHtmlReport(results, { generatedAt, runErrors, runStatus, projectName });

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
  const content = kind === 'rate'
    ? `<div class="card-value rate-value"><span>${escapeHtml(value)}</span><span class="rate-track" role="progressbar" aria-label="Success rate" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${escapeHtml(Number.parseFloat(value))}"><span class="rate-fill" style="width:${escapeHtml(value)}"></span></span></div>`
    : `<div class="card-value">${escapeHtml(value)}</div>`;
  return `<article class="card ${kind}" data-summary="${kind}"><div class="card-label">${escapeHtml(label)}</div>${content}</article>`;
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

function renderFileNavigation(groups, resultCount) {
  const links = groups.map(({ file, results, id, status }) => `<li><a class="file-navigation-link" href="#${escapeHtml(id)}"><span class="file-status-dot ${status.className}" aria-hidden="true"></span><span class="file-navigation-name">${escapeHtml(file)}</span><span class="file-navigation-count">${results.length}</span><span class="file-status-label ${status.className}">${escapeHtml(status.label)}</span></a></li>`).join('\n');
  return `<nav class="file-navigation" aria-label="Test files">
  <div class="file-navigation-heading"><h2>Test files</h2><span class="file-navigation-total">${groups.length}</span></div>
  <ul class="file-navigation-list"><li><a class="file-navigation-link all-files-link" href="#test-results" aria-current="page"><span class="file-navigation-name">All test files</span><span class="file-navigation-count">${resultCount}</span></a></li>${links}</ul>
</nav>`;
}

function renderResultGroup({ file, results, id }) {
  return `<details class="file-group" id="${escapeHtml(id)}" open>
  <summary><span class="file-group-title">${escapeHtml(file)}</span></summary>
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
  <td class="test-name">${escapeHtml(result?.name || name)}${result?.file ? `<div class="test-path">${escapeHtml(result.file)}</div>` : ''}</td>
  <td class="type-source">${escapeHtml(type)}<div class="source-value">${escapeHtml(source)}</div></td>
  <td><span class="status ${status}" aria-label="${escapeHtml(label)}"><span aria-hidden="true">${icon}</span>${escapeHtml(label)}</span></td>
  <td class="duration">${escapeHtml(duration)}</td>
  <td>${details}</td>
</tr>`;
}

function renderRunError(error) {
  const analysis = error?.failureAnalysis;
  return `<article class="run-error">
  <h3 class="run-error-file">${escapeHtml(error?.file || 'Vitest run')}</h3>
  <div class="failure-content">${renderFailure(error, analysis)}</div>
</article>`;
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
