// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
    testDir: './tests/e2e',
    timeout: 60 * 1000,
    expect: {
        timeout: 15000
    },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        /* Base URL to use in actions like `await page.goto('/')`. */
        baseURL: 'http://localhost:5173',

        /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
        trace: 'on-first-retry',
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    /* Run your local dev server before starting the tests */
    webServer: [
        {
            command: 'cd server && node index.js',
            port: 3000,
            timeout: 120 * 1000,
            reuseExistingServer: !process.env.CI,
        },
        {
            command: 'cd client && npm run dev -- --port 5173',
            port: 5173,
            timeout: 120 * 1000,
            reuseExistingServer: !process.env.CI,
        }
    ],
});
