// Real-GPU benchmark driver: launches a separate desktop Chrome (own profile, GPU on) with a CDP port, emulates a 1920x1080 viewport at
// DPR 1, opens the in-page benchmark (src/perf/bench.js) and writes its result JSON. Needs only Node 22+ (global WebSocket, fetch).
// Run it where Chrome and the GPU are, e.g. on Windows (also from WSL: `node.exe tests/perf/gpu-bench.mjs ...` with a Windows --out path):
//   node tests/perf/gpu-bench.mjs --url "http://localhost:8830/?debug=1&perf=1" --out bench.json [--uncap] [--chrome <chrome.exe>] [--port 9333]
// --headless runs Chrome without a window but on the same GPU (ANGLE D3D11): nothing can minimise it (a minimised window gets no frames).
// --uncap adds --disable-gpu-vsync --disable-frame-rate-limit and &uncap=1: frame times then show the cost above the display's refresh.
// Serve the game first (`npm run build && HIDE_SECS=1 SEEK_SECS=900 PORT=8830 node server/index.js`) so the bench can host a bot round.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const has = (k) => process.argv.includes('--' + k);
const PORT = +arg('port', 9333), UNCAP = has('uncap'), HEADLESS = has('headless');
let url = arg('url', 'http://localhost:8830/?debug=1&perf=1');
if (UNCAP && !/[?&]uncap=1/.test(url)) url += '&uncap=1';
const OUT = arg('out', 'bench.json'), W = +arg('w', 1920), H = +arg('h', 1080);
const CHROME = arg('chrome', process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const flags = [`--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(os.tmpdir(), `hs-bench-${PORT}`)}`, '--no-first-run', '--no-default-browser-check',
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required',
  `--window-size=${W + 16},${H + 140}`, '--window-position=0,0', ...(UNCAP ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : []),
  ...(HEADLESS ? ['--headless=new', '--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] : []), 'about:blank'];
const chrome = spawn(CHROME, flags, { stdio: 'ignore', detached: false });
let done = false;
chrome.on('exit', (c) => { if (!done) { console.error('chrome exited early, code', c); process.exit(1); } });
let ver = null;
for (let i = 0; i < 60 && !ver; i++) { await sleep(500); ver = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json()).catch(() => null); }
if (!ver) { console.error('no CDP endpoint on port', PORT); process.exit(1); }
const tgt = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const wait = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); }
  else if (d.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(d.params.type)) console.log('[page]', d.params.type, d.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300));
  else if (d.method === 'Runtime.exceptionThrown') console.log('[page] exception', d.params.exceptionDetails.exception?.description?.slice(0, 300));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
ws.onclose = () => { if (!done) { console.error('CDP connection closed'); process.exit(1); } };
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;

await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.bringToFront');
await send('Page.navigate', { url });
console.log('chrome', ver.Browser, '->', url);
const t0 = Date.now(); let last = '', ok = false, failed = false;
while (Date.now() - t0 < 30 * 60_000) {
  await sleep(3000);
  const s = await evaluate(`(() => { const b = window.__bench; if (b?.done) return b.error ? 'ERROR ' + b.error : JSON.stringify(b.result); const s = sessionStorage.getItem('hs-bench'); return 'run ' + (s ? JSON.parse(s).i : '?') + ' gpu ' + (window.__perf?.perf?.rendererName || '?'); })()`).catch(() => null);
  if (s?.startsWith('{')) { fs.writeFileSync(OUT, s); console.log('wrote', OUT); ok = true; break; }
  if (s?.startsWith('ERROR')) { console.error('bench failed in the page:', s.slice(6, 600)); failed = true; break; }
  if (s && s !== last) { console.log(s); last = s; }
}
if (!ok && !failed) console.error('no result (timed out after 30 min)');
done = true; ws.close(); chrome.kill(); process.exit(ok ? 0 : 1);
