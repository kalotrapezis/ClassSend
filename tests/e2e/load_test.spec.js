
const { test, expect } = require('@playwright/test');

test.describe('Load Testing', () => {
    // Only run these in serial or carefully managed contexts

    async function runLoadTest(numberOfClients, browser) {
        const contexts = [];
        const pages = [];

        // 1. Teacher creates class
        const teacherContext = await browser.newContext();
        const teacherPage = await teacherContext.newPage();
        await teacherPage.goto('/?role=teacher');
        const classId = await teacherPage.locator('.class-item.active .class-name').textContent();
        expect(classId).toBeTruthy();
        console.log(`[LoadTest] Teacher started class: ${classId}`);

        // 2. Spawn Clients
        for (let i = 0; i < numberOfClients; i++) {
            const context = await browser.newContext();
            const page = await context.newPage();
            contexts.push(context);
            pages.push(page);

            await page.goto('/?role=student');

            // Join class
            await page.locator(`.class-item .class-name`).filter({ hasText: classId }).click();

            // Verify joined
            await expect(page.locator('#chat-interface')).toBeVisible({ timeout: 20000 });
            console.log(`[LoadTest] Client ${i + 1}/${numberOfClients} joined.`);
        }

        // 3. Verify Teacher sees all students
        // user count = clients + 1 (teacher)
        await expect(teacherPage.locator('#user-count')).toHaveText(String(numberOfClients + 1), { timeout: 30000 });
        console.log(`[LoadTest] Teacher sees ${numberOfClients + 1} users.`);

        // Cleanup
        for (const context of contexts) await context.close();
        await teacherContext.close();
    }

    test('Load Test: 5 Clients', async ({ browser }) => {
        test.setTimeout(60000);
        await runLoadTest(5, browser);
    });

    test('Load Test: 10 Clients', async ({ browser }) => {
        test.setTimeout(90000);
        await runLoadTest(10, browser);
    });

    test('Load Test: 15 Clients', async ({ browser }) => {
        test.setTimeout(120000);
        await runLoadTest(15, browser);
    });
});
