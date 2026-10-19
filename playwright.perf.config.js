const { defineConfig } = require('@playwright/test');

// `npm run test:perf`: draw-call / triangle / JS-frame-time budget per map x tier. Builds dist/ and serves it with server/index.js.
process.env.SMOKE_PORT ||= String(3602);
const url = process.env.SMOKE_URL || `http://localhost:${process.env.SMOKE_PORT}`;

module.exports = defineConfig({
  testDir: 'tests/perf',
  testMatch: /(budget|clone)\.spec\.js$/,
  timeout: 2_700_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: url,
    launchOptions: { args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] },
  },
  webServer: process.env.SMOKE_URL ? undefined : {
    command: 'npm run build --silent && node server/index.js',
    env: { PORT: process.env.SMOKE_PORT },
    url: `${url}/health`,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
