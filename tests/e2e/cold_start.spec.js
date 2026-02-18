const { test, expect } = require('@playwright/test');

test('Cold start: Teacher creates class and Student joins', async ({ browser }) => {
    // 1. Create Teacher Context
    const teacherContext = await browser.newContext();
    const teacherPage = await teacherContext.newPage();
    await teacherPage.goto('/');

    // Teacher Flow
    await expect(teacherPage).toHaveTitle(/ClassSend/);

    // Select Teacher Role
    await teacherPage.click('#btn-teacher');

    // Expect Class Setup screen
    await expect(teacherPage.locator('#class-setup')).toBeVisible();

    const classId = 'TEST_' + Math.floor(Math.random() * 10000); // Random Class ID
    await teacherPage.fill('#class-id-input', classId);
    await teacherPage.fill('#user-name-input', 'Teacher Bot');
    await teacherPage.click('#btn-submit-setup');

    // Wait for Teacher to be ready (Chat interface visible)
    await expect(teacherPage.locator('#chat-interface')).toBeVisible({ timeout: 15000 });
    // Verify connection status
    await expect(teacherPage.locator('#connection-status')).toHaveClass(/connected/, { timeout: 10000 });

    // 2. Create Student Context
    const studentContext = await browser.newContext();
    const studentPage = await studentContext.newPage();
    await studentPage.goto('/');

    // Student Flow
    await expect(studentPage).toHaveTitle(/ClassSend/);

    // Select Student Role
    await studentPage.click('#btn-student');

    // Student should see "Available Classes" screen logic
    // Note: If no classes found quickly, it shows "Looking for classes..."
    await expect(studentPage.locator('#available-classes')).toBeVisible();

    // Wait for class to appear in list (Auto-discovery / Websocket update)
    // The list items are typically buttons with class "class-card" or similar
    // We look for the text of the classId
    const classButton = studentPage.locator(`.available-class-card:has-text("${classId}")`).first();
    await expect(classButton).toBeVisible({ timeout: 20000 });

    // Join Class
    await classButton.click();

    // Join Setup (Enter Name)
    await expect(studentPage.locator('#class-setup')).toBeVisible();
    await studentPage.fill('#user-name-input', 'Student Bot');
    await studentPage.click('#btn-submit-setup');

    // Verify Student Connected
    await expect(studentPage.locator('#chat-interface')).toBeVisible();
    await expect(studentPage.locator('#connection-status')).toHaveClass(/connected/, { timeout: 10000 });

    // Verify Teacher sees Student in User List
    await expect(teacherPage.locator('#users-list')).toContainText('Student Bot', { timeout: 10000 });

    // Cleanup
    await teacherContext.close();
    await studentContext.close();
});
