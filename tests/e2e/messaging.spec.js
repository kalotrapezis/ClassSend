
const { test, expect } = require('@playwright/test');

test('messages are sent and received', async ({ browser }) => {
    // Teacher launches and creates class
    const teacherContext = await browser.newContext();
    const page1 = await teacherContext.newPage();
    page1.on('console', msg => console.log(`[Teacher Page]: ${msg.text()}`));
    await page1.goto('/');
    await page1.click('#btn-teacher');
    await expect(page1.locator('#chat-interface')).toBeVisible();

    // Get the class ID of the class the teacher just made
    const classId = await page1.locator('.class-item.active .class-name').textContent();
    console.log(`Teacher created class: ${classId}`);
    expect(classId).toBeTruthy();

    // Student launches
    const studentContext = await browser.newContext();
    const page2 = await studentContext.newPage();
    page2.on('console', msg => console.log(`[Student Page]: ${msg.text()}`));
    await page2.goto('/');
    await page2.click('#btn-student');
    await expect(page2.locator('#chat-interface')).toBeVisible();

    // Student is likely in 'Lobby'. Need to switch to the Teacher's class.
    console.log(`Student joining class: ${classId}`);
    await page2.locator(`.class-item .class-name`).filter({ hasText: classId }).click();

    // Ensure student input is enabled
    await expect(page2.locator('#message-input')).toBeEnabled({ timeout: 15000 });

    // Teacher sends message
    await page1.fill('#message-input', 'Hello Student');
    await expect(page1.locator('#btn-send-message')).toBeEnabled();
    await page1.click('#btn-send-message');

    // Student receives message
    await expect(page2.locator('.message-content', { hasText: 'Hello Student' })).toBeVisible();
});

test('profanity filter blocks bad words', async ({ browser }) => {
    // Setup Teacher
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('/');
    await page.click('#btn-teacher');
    await expect(page.locator('#chat-interface')).toBeVisible();

    // Get Class ID
    const classId = await page.locator('.class-item.active .class-name').textContent();

    // Setup Student to join this class
    const studentContext = await browser.newContext();
    const page2 = await studentContext.newPage();
    await page2.goto('/');
    await page2.click('#btn-student');
    await page2.locator(`.class-item .class-name`).filter({ hasText: classId }).click();
    await expect(page2.locator('#message-input')).toBeEnabled({ timeout: 15000 });

    // Teacher sends bad word
    // Wait for input to be ready
    await expect(page.locator('#message-input')).toBeEnabled();

    // Using 'stupid' which is in the default mild bad words list
    await page.fill('#message-input', 'stupid');
    await page.click('#btn-send-message');

    // Verify it is NOT displayed on Student side
    await expect(page2.locator('.message-content', { hasText: 'stupid' })).not.toBeVisible();
    await expect(page.locator('.message-content', { hasText: 'stupid' })).not.toBeVisible();
});
