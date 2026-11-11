import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';

import { renderHtmlReport, writeHtmlReport } from '../../src/reporting/html/html-report.js';

const generatedAt = new Date('2025-04-05T06:07:08.000Z');
const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ));
});

function result(overrides = {}) {
  return {
    id: 'test-1',
    name: 'creates a record',
    fullName: 'Records > creates a record',
    file: 'tests/records.test.js',
    testType: 'unit',
    source: 'vitest',
    status: 'passed',
    durationMs: 12.5,
    errors: [],
    ...overrides,
  };
}

describe('HTML test report', () => {
  it('renders a successful result with report identity and summary', () => {
    const html = renderHtmlReport([result()], { generatedAt });

    expect(html).toContain('Universal Backend Testing Framework');
    expect(html).toContain('Records &gt; creates a record');
    expect(html).toContain('Generated');
    expect(html).toContain('data-summary="total"><div class="card-label">Total tests</div><div class="card-value">1</div>');
    expect(html).toContain('data-summary="passed"><div class="card-label">Passed</div><div class="card-value">1</div>');
    expect(html).toContain('100.0%');
    expect(html).toContain('class="overall passed"');
  });

  it('renders error messages, expected and actual values, and analyzer guidance', () => {
    const html = renderHtmlReport([result({
      status: 'failed',
      errors: [{ name: 'AssertionError', message: 'expected 3 to be 4' }],
      failureAnalysis: [{
        category: 'assertion_failure',
        summary: 'The actual value does not match the expected value.',
        evidence: { actual: 3, expected: 4 },
        recommendation: 'Review the expected value and the logic producing the actual value.',
      }],
    })], { generatedAt });

    expect(html).toContain('expected 3 to be 4');
    expect(html).toContain('assertion_failure');
    expect(html).toContain('Expected: 4');
    expect(html).toContain('Actual: 3');
    expect(html).toContain('Review the expected value');
    expect(html).toContain('<details class="failure" open>');
    expect(html).toContain('class="overall failed"');
  });

  it('calculates counts for passed, failed, skipped, and pending results', () => {
    const html = renderHtmlReport([
      result({ id: 'pass-1' }),
      result({ id: 'pass-2' }),
      result({ id: 'fail', status: 'failed', errors: [{ name: 'Error', message: 'failure' }] }),
      result({ id: 'skip', status: 'skipped' }),
      result({ id: 'todo', status: 'todo' }),
    ], { generatedAt });

    expect(html).toContain('data-summary="total"><div class="card-label">Total tests</div><div class="card-value">5</div>');
    expect(html).toContain('data-summary="passed"><div class="card-label">Passed</div><div class="card-value">2</div>');
    expect(html).toContain('data-summary="failed"><div class="card-label">Failed</div><div class="card-value">1</div>');
    expect(html).toContain('data-summary="skipped"><div class="card-label">Skipped</div><div class="card-value">1</div>');
    expect(html).toContain('data-summary="todo"><div class="card-label">Pending</div><div class="card-value">1</div>');
    expect(html).toContain('40.0%');
  });

  it('renders sensible placeholders when optional report fields are missing', () => {
    const html = renderHtmlReport([{
      id: 'partial',
      name: 'minimal result',
      status: 'passed',
      errors: [],
    }], { generatedAt });

    expect(html).toContain('minimal result');
    expect(html).toContain('class="meta">—</span>');
    expect(html).toContain('class="duration">—</td>');
    expect(html).toContain('data-summary="total"');
  });

  it('renders an explicit empty state and zero success rate', () => {
    const html = renderHtmlReport([], { generatedAt });

    expect(html).toContain('No results');
    expect(html).toContain('No test results are available for this run.');
    expect(html).toContain('data-summary="total"><div class="card-label">Total tests</div><div class="card-value">0</div>');
    expect(html).toContain('0.0%');
  });

  it('escapes test names and error content before embedding them in HTML', () => {
    const html = renderHtmlReport([
      result({
        name: '<script>alert("name")</script>',
        fullName: '<script>alert("name")</script>',
        file: '<svg onload="alert(1)">.test.js',
        status: 'failed',
        errors: [{ name: '<b>Error</b>', message: '<script>alert("message")</script>' }],
      }),
      result({ id: 'test-2', name: '<img src=x onerror="alert(1)">', fullName: '' }),
    ], { generatedAt });

    expect(html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(html).toContain('&lt;script&gt;alert(&quot;name&quot;)&lt;/script&gt;');
    expect(html).toContain('&lt;script&gt;alert(&quot;message&quot;)&lt;/script&gt;');
    expect(html).toContain('&lt;svg onload=&quot;alert(1)&quot;&gt;.test.js');
    expect(html).not.toContain('<script>alert(');
    expect(html).not.toContain('<img src=x');
  });

  it('writes a complete report to the requested output path', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ubtf-html-report-'));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, 'nested', 'test-report.html');

    const savedPath = await writeHtmlReport([result()], { outputPath, generatedAt });
    const html = await readFile(outputPath, 'utf8');

    expect(savedPath).toBe(outputPath);
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('creates a record');
    expect(html).toContain('<style>');
  });

  it('does not mutate the supplied result objects', () => {
    const results = [result({
      status: 'failed',
      errors: [{ name: 'AssertionError', message: 'expected 3 to be 4' }],
      failureAnalysis: [{ category: 'assertion_failure', evidence: { actual: 3, expected: 4 } }],
    })];
    const original = structuredClone(results);

    renderHtmlReport(results, { generatedAt });

    expect(results).toEqual(original);
  });

  it('groups results by their actual source file and preserves order within each group', () => {
    const html = renderHtmlReport([
      result({ id: 'records-1', name: 'first record test', fullName: 'first record test' }),
      result({ id: 'rest-1', file: 'tests/rest-client.test.js', name: 'first REST test', fullName: 'first REST test' }),
      result({ id: 'records-2', name: 'second record test', fullName: 'second record test' }),
    ], { generatedAt });
    const groups = [...html.matchAll(/<details class="file-group" id="([^"]+)" open>([\s\S]*?)<\/details>/g)];

    expect(groups).toHaveLength(2);
    expect(groups[0][2]).toContain('tests/records.test.js');
    expect(groups[0][2]).toContain('2 tests');
    expect(groups[1][2]).toContain('tests/rest-client.test.js');
    expect(groups[1][2]).toContain('1 test');
    expect(groups[0][2].indexOf('first record test')).toBeLessThan(groups[0][2].indexOf('second record test'));
    expect(html.indexOf('tests/records.test.js')).toBeLessThan(html.indexOf('tests/rest-client.test.js'));
  });

  it('puts results without source-file metadata in an Unknown Source group', () => {
    const html = renderHtmlReport([
      result({ id: 'unknown-1', file: undefined }),
      result({ id: 'unknown-2', file: '' }),
    ], { generatedAt });

    expect(html.match(/Unknown Source/g)).toHaveLength(2);
    expect(html).toContain('2 tests');
  });

  it('keeps failure details visible while leaving stack traces collapsed by default', () => {
    const html = renderHtmlReport([result({
      status: 'failed',
      errors: [{ name: 'AssertionError', message: 'expected 3 to be 4', stack: 'AssertionError: expected 3 to be 4\n    at long/path.js:10:2' }],
      failureAnalysis: [{
        category: 'assertion_failure',
        summary: 'The actual value does not match the expected value.',
        evidence: { actual: 3, expected: 4 },
        recommendation: 'Review the expected value.',
      }],
    })], { generatedAt });

    expect(html).toContain('<details class="failure" open>');
    expect(html).toContain('expected 3 to be 4');
    expect(html).toContain('assertion_failure');
    expect(html).toContain('Review the expected value.');
    expect(html).toContain('<details class="stack-trace"><summary>Show stack trace</summary>');
    expect(html).toContain('<pre class="stack-content">AssertionError: expected 3 to be 4\n    at long/path.js:10:2</pre>');
    expect(html).not.toContain('<details class="stack-trace" open>');
  });

  it('uses readable type/source widths and allows long report content to wrap safely', () => {
    const longStack = `Error: ${'long-stack-segment/'.repeat(100)}`;
    const html = renderHtmlReport([result({
      testType: 'integration-test-type-with-a-long-name',
      source: 'vitest-source-with-a-long-name',
      status: 'failed',
      errors: [{ name: 'Error', message: 'Long <detail> '.repeat(80), stack: longStack }],
    })], { generatedAt });

    expect(html).toContain('min-width: 980px');
    expect(html).toContain('td:nth-child(2) { width: 19%; min-width: 190px; }');
    expect(html).toContain('overflow-wrap: anywhere');
    expect(html).toContain(escapeForHtml(longStack));
    expect(html).toContain('Long &lt;detail&gt;');
  });

  it('lists every file in the sidebar and links to a unique stable group id', () => {
    const results = [
      result({ id: 'one', file: 'tests/a.test.js' }),
      result({ id: 'two', file: 'tests/b.test.js' }),
    ];
    const html = renderHtmlReport(results, { generatedAt });
    const rerendered = renderHtmlReport(results, { generatedAt });
    const groupIds = [...html.matchAll(/<details class="file-group" id="([^"]+)" open>/g)].map((match) => match[1]);
    const links = [...html.matchAll(/<a class="file-navigation-link" href="#([^"]+)">([\s\S]*?)<\/a>/g)];

    expect(html).toContain('<nav class="file-navigation" aria-label="Test files">');
    expect(html).toContain('2 files');
    expect(links).toHaveLength(2);
    expect(links[0][2]).toContain('tests/a.test.js');
    expect(links[1][2]).toContain('tests/b.test.js');
    expect(links.map((link) => link[1])).toEqual(groupIds);
    expect(new Set(groupIds).size).toBe(2);
    expect(rerendered.match(/<details class="file-group" id="([^"]+)" open>/g)).toEqual(
      html.match(/<details class="file-group" id="([^"]+)" open>/g),
    );
  });

  it('renders expanded native details groups and expands a collapsed target on navigation', () => {
    const html = renderHtmlReport([result()], { generatedAt });

    expect(html).toContain('<details class="file-group" id="test-file-group-1" open>');
    expect(html).toContain('<summary><span class="file-group-title">tests/records.test.js</span>');
    expect(html).toContain("target.open = true");
    expect(html).toContain("window.addEventListener('hashchange', syncFileNavigation)");
    expect(html).toContain("navigation.addEventListener('click'");
    expect(html).toContain('file-group summary:focus-visible');
  });

  it('opens a collapsed group when its sidebar link is clicked or its hash is navigated to', () => {
    const html = renderHtmlReport([result()], { generatedAt });
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    let clickHandler;
    let hashChangeHandler;
    let currentHash = '';
    const targetGroup = {
      open: false,
      matches: (selector) => selector === 'details.file-group',
    };
    const attributes = new Set();
    const link = {
      hash: '#test-file-group-1',
      setAttribute: (name, value) => attributes.add(`${name}=${value}`),
      removeAttribute: (name) => {
        for (const attribute of attributes) if (attribute.startsWith(`${name}=`)) attributes.delete(attribute);
      },
    };
    const navigation = {
      querySelectorAll: () => [link],
      addEventListener: (_name, handler) => { clickHandler = handler; },
    };
    const document = {
      querySelector: () => navigation,
      getElementById: (id) => id === 'test-file-group-1' ? targetGroup : null,
    };
    const window = {
      get location() { return { get hash() { return currentHash; } }; },
      addEventListener: (_name, handler) => { hashChangeHandler = handler; },
    };

    runInNewContext(script, { document, window });
    targetGroup.open = false;
    clickHandler({ target: { closest: () => link } });

    expect(targetGroup.open).toBe(true);
    expect(attributes.has('aria-current=location')).toBe(true);

    targetGroup.open = false;
    currentHash = link.hash;
    hashChangeHandler();

    expect(targetGroup.open).toBe(true);
    expect(attributes.has('aria-current=location')).toBe(true);
  });

  it('summarizes each file as passed, failed, or mixed without relying on color alone', () => {
    const html = renderHtmlReport([
      result({ id: 'passed', file: 'tests/passed.test.js', status: 'passed' }),
      result({ id: 'failed', file: 'tests/failed.test.js', status: 'failed', errors: [{ name: 'Error', message: 'failed' }] }),
      result({ id: 'mixed-pass', file: 'tests/mixed.test.js', status: 'passed' }),
      result({ id: 'mixed-fail', file: 'tests/mixed.test.js', status: 'failed', errors: [{ name: 'Error', message: 'failed' }] }),
    ], { generatedAt });

    expect(html).toContain('file-status passed');
    expect(html).toContain('file-status failed');
    expect(html).toContain('file-status mixed');
    expect(html).toContain('>Passed</span>');
    expect(html).toContain('>Failed</span>');
    expect(html).toContain('>Mixed</span>');
  });

  it('keeps unknown-source navigation and its corresponding group linked', () => {
    const html = renderHtmlReport([result({ file: undefined })], { generatedAt });

    expect(html).toContain('<a class="file-navigation-link" href="#test-file-group-1">');
    expect(html).toContain('<details class="file-group" id="test-file-group-1" open>');
    expect(html).toContain('Unknown Source');
  });
});

function escapeForHtml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
