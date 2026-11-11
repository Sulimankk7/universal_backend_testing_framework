import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { openHtmlReport } from '../../src/reporting/html/open-html-report.js';

describe('openHtmlReport', () => {
  it('skips browser opening in CI and Linux headless environments', async () => {
    const spawnProcess = vi.fn();

    expect(await openHtmlReport('report.html', {
      platform: 'win32',
      env: { CI: 'true' },
      spawnProcess,
    })).toBe(false);
    expect(await openHtmlReport('report.html', {
      platform: 'linux',
      env: {},
      spawnProcess,
    })).toBe(false);
    expect(await openHtmlReport('report.html', {
      platform: 'win32',
      env: { TERM: 'dumb' },
      spawnProcess,
    })).toBe(false);
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it('uses the platform browser opener and report path', async () => {
    const spawnProcess = vi.fn(() => {
      const child = new EventEmitter();
      child.unref = vi.fn();
      queueMicrotask(() => child.emit('spawn'));
      return child;
    });

    expect(await openHtmlReport('C:\\reports\\custom report.html', {
      platform: 'win32',
      env: { SESSIONNAME: 'Console' },
      spawnProcess,
    })).toBe(true);
    expect(spawnProcess).toHaveBeenCalledWith(
      'cmd',
      ['/c', 'start', '', 'C:\\reports\\custom report.html'],
      { detached: true, stdio: 'ignore' },
    );
  });

  it('handles browser opener errors without throwing', async () => {
    const spawnProcess = vi.fn(() => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('error', new Error('opener unavailable')));
      return child;
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await openHtmlReport('/tmp/report.html', {
      platform: 'darwin',
      env: {},
      spawnProcess,
    })).toBe(false);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('opener unavailable'));
    warning.mockRestore();
  });
});
