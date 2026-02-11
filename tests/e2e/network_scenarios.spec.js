
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
        // Simulating manual redirect to a specific IP
        await page.goto('/?role=student&name=TestUser');
        await page.goto('http://127.0.0.1:3000/?role=student&name=TestUser');

        // Verify reconnection with timeout
        await expect(page.locator('#connection-status')).toHaveClass(/connected/, { timeout: 15000 });

        // Verify socket connected to new URL
        const isConnected = await page.evaluate(async () => {
            // Wait for socket to be initialized if needed
            for (let i = 0; i < 20; i++) {
                if (window.socket && window.socket.connected) return true;
                await new Promise(r => setTimeout(r, 500));
            }
            return window.socket ? window.socket.connected : false;
        });
        expect(isConnected).toBe(true);
    });

});
