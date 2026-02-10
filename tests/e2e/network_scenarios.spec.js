
const { test, expect } = require('@playwright/test');

test.describe('Network Scenarios', () => {

    test('Classic Localhost Connection', async ({ browser }) => {
        // Standard flow: Teacher creates, Student joins locally
        const teacherContext = await browser.newContext();
        const page1 = await teacherContext.newPage();
        await page1.goto('/?role=teacher');

        const classId = await page1.locator('.class-item.active .class-name').textContent();
        expect(classId).toBeTruthy();

        const studentContext = await browser.newContext();
        const page2 = await studentContext.newPage();
        await page2.goto('/?role=student');

        // Student sees class in local list and joins
        await page2.locator(`.class-item .class-name`).filter({ hasText: classId }).click();
        await expect(page2.locator('#connection-status')).toHaveClass(/connected/);
    });

    test('IP Connection (Simulated)', async ({ page }) => {
        // Verify client can handle explicit connection to an IP (simulated by localhost IP)
        await page.goto('/?role=student');

        // Simulate switching server via console/code since manual input might be hidden or auto-detected
        // We connect to 127.0.0.1 explicitly to differentiate from 'localhost' string if possible,
        // though practically it's the same server instance in this test env.
        await page.evaluate(() => {
            // @ts-ignore
            connectToServer('http://127.0.0.1:3000');
        });

        // Verify reconnection
        await expect(page.locator('#connection-status')).toHaveClass(/connected/);

        // Verify socket connected to new URL
        const isConnected = await page.evaluate(() => socket.connected);
        expect(isConnected).toBe(true);
    });

});
