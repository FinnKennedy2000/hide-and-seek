const { defineConfig } = require('@playwright/test');

// SMOKE_URL points at an already-running server; otherwise build dist/ and start server/index.js on a private port
// (each run picks its own port so parallel worktrees never reuse each other's server).
process.env.SMOKE_PORT ||= String(4100 + Math.floor(Math.random() * 800));
const url = process.env.SMOKE_URL || `http://localhost:${process.env.SMOKE_PORT}`;

module.exports = defineConfig({
  testDir: 'tests',
  testMatch: /(smoke|chars|ui)\.spec\.js$/,
  timeout: 1_500_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: url,
    launchOptions: { args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] },
  },
  webServer: process.env.SMOKE_URL ? undefined : {
    command: 'npm run build --silent && node server/index.js',
    env: { PORT: process.env.SMOKE_PORT, HIDE_SECS: '2' }, // short hiding phase so online specs reach SEEK quickly
    url: `${url}/health`,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
