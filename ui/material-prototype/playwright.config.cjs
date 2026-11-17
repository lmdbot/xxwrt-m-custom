const { defineConfig, devices } = require('@playwright/test')
module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 1,
  // Tests use isolated Playwright browser contexts; run two at once to
  // reduce Android CI latency without overloading the hosted runner.
  workers: 2,
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
    reuseExistingServer: !process.env.CI,
    timeout: 60000
  }
})
