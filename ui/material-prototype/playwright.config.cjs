const { defineConfig, devices } = require('@playwright/test')
module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 1,
  // Run four isolated Chromium test workers in CI to shorten the
  // UI regression gate after APK signing; keep local runs conservative.
  workers: process.env.CI ? 4 : 2,
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
