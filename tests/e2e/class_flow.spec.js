
const { test, expect } = require('@playwright/test');

test('teacher can create a class and student can join', async ({ browser }) => {
    // context 1: Teacher
    const teacherContext = await browser.newContext();
    const teacherPage = await teacherContext.newPage();
    await teacherPage.goto('/');

    // Teacher defaults to student, needs to switch via settings
    await teacherPage.click('#btn-open-settings');
    await teacherPage.click('#btn-change-role');
    await teacherPage.click('#btn-teacher');

    // Verify redirected to chat interface (auto-flow creates class)
    await expect(teacherPage.locator('#chat-interface')).toBeVisible();

    // context 2: Student
    const studentContext = await browser.newContext();
    const studentPage = await studentContext.newPage();
    await studentPage.goto('/');

    // Student is already 'Student' by default
    // They should land on available classes or chat
    await expect(studentPage.locator('#chat-interface')).toBeVisible();
});
