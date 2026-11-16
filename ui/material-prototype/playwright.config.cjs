const { defineConfig, devices } = require('@playwright/test')
const inCI = Boolean(process.env.CI)
module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 1,
  // Every Playwright test receives its own browser context. Run independent
  // specs concurrently in CI instead of serialising all 24 cases in one worker.
  // File-local mutable RPC mocks are loaded separately in worker processes.
  fullyParallel: inCI,
  workers: inCI ? 3 : 1,
  reporter: inCI
    ? [['line'], ['json', { outputFile: 'test-results/playwright-report.json' }]]
    : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    ...devices['Pixel 7'],
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    port: 5173,
    reuseExistingServer: !inCI,
    timeout: 60000
  }
})
