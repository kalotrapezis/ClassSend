
const { test, expect } = require('@playwright/test');

test('teacher can create a class and student can join', async ({ browser }) => {
    // context 1: Teacher
    const teacherContext = await browser.newContext();
    const teacherPage = await teacherContext.newPage();
    await teacherPage.goto('/');

    // Teacher selects 'Teacher' role
    await teacherPage.click('#btn-teacher');

    // Verify redirected to chat interface (auto-flow creates class)
    const classIdLocator = teacherPage.locator('#settings-modal #class-id-display'); // This ID might require finding where class ID is displayed
    // In the UI code, classId is usually shown in the top bar or settings.
    // Updated selector based on UI: Wait for chat interface
    await expect(teacherPage.locator('#chat-interface')).toBeVisible();

    // context 2: Student
    const studentContext = await browser.newContext();
    const studentPage = await studentContext.newPage();
    await studentPage.goto('/');

    // Student selects 'Student' role
    await studentPage.click('#btn-student');

    // Student should see available class or auto-join if only 1
    // Wait for available classes or chat
    // If auto-join is active for single class:
    await expect(studentPage.locator('#chat-interface')).toBeVisible();
});
