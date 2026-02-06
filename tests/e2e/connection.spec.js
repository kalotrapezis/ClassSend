
const { test, expect } = require('@playwright/test');

test('client can connect to server', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/ClassSend/);
    // Wait for connection status indicator
    await expect(page.locator('#connection-status')).toHaveClass(/connected/);
});
