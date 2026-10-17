// `npm run test:server`: start server/index.js on a free port (HIDE_SECS=1 SEEK_SECS=20), run every test script against it, kill the server by PID.
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

const free = () => new Promise((res) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
const tests = ['core.test.js', 'worlddata.test.js', 'mp-test.js', 'mp-test2.js', 'mp-test3.js', 'netcode.test.js'];

(async () => {
  const port = await free();
  const server = spawn('node', [path.join(__dirname, '..', '..', 'server', 'index.js')], { env: { ...process.env, PORT: String(port), HIDE_SECS: '1', SEEK_SECS: '20', RECONNECT_SECS: '3' }, stdio: 'ignore' });
  let bad = 0;
  try {
    await new Promise((r) => setTimeout(r, 1500));
    for (const t of tests) {
      const r = spawnSync('node', [path.join(__dirname, t)], { env: { ...process.env, RECONNECT_SECS: '3', PORT: String(port), URL: `ws://localhost:${port}/ws` }, encoding: 'utf8' });
      const out = r.stdout + r.stderr, pass = (out.match(/^PASS/gm) || []).length, fail = (out.match(/^FAIL/gm) || []).length;
      console.log(`${t}: ${pass} pass, ${fail} fail, exit ${r.status}`);
      if (r.status !== 0 || fail) { bad++; console.log(out.split('\n').filter((l) => /FAIL|Error/.test(l)).join('\n')); }
    }
  } finally { server.kill('SIGTERM'); }
  process.exit(bad ? 1 : 0);
})();
