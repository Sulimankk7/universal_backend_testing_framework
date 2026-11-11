import { spawn } from 'node:child_process';

/** Open a written report in the default browser when a local GUI is available. */
export function openHtmlReport(reportPath, {
  platform = process.platform,
  env = process.env,
  spawnProcess = spawn,
} = {}) {
  if (!reportPath || shouldSkipBrowserOpen(platform, env)) return Promise.resolve(false);

  const [command, args] = platform === 'win32'
    ? ['cmd', ['/c', 'start', '', reportPath]]
    : platform === 'darwin'
      ? ['open', [reportPath]]
      : ['xdg-open', [reportPath]];

  return new Promise((resolve) => {
    try {
      const child = spawnProcess(command, args, { detached: true, stdio: 'ignore' });
      child.once('error', (error) => {
        console.warn(`[Universal Framework] Could not open HTML report: ${error.message}`);
        resolve(false);
      });
      child.once('spawn', () => {
        child.unref();
        resolve(true);
      });
    } catch (error) {
      console.warn(`[Universal Framework] Could not open HTML report: ${error.message}`);
      resolve(false);
    }
  });
}

function shouldSkipBrowserOpen(platform, env) {
  if (env.CI || env.UBTF_OPEN_HTML_REPORT === 'false' || env.UBTF_OPEN_HTML_REPORT === '0') return true;
  if (env.TERM === 'dumb') return true;
  if (platform === 'linux' && !env.DISPLAY && !env.WAYLAND_DISPLAY) return true;
  return false;
}
