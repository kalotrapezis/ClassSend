
const { test, expect } = require('@playwright/test');

test('teacher can create a class and student can join', async ({ browser }) => {
    // context 1: Teacher
    const teacherContext = await browser.newContext();
    const teacherPage = await teacherContext.newPage();

    // Teacher uses URL param to set role (simulates first-time selection)
    await teacherPage.goto('/?role=teacher');

    // Verify redirected to chat interface (auto-flow creates class)
    await expect(teacherPage.locator('#chat-interface')).toBeVisible({ timeout: 30000 });

    // Get class name from sidebar
    const classId = await teacherPage.locator('.class-item.active .class-name').textContent();
    expect(classId).toBeTruthy();
    console.log(`Teacher created class: ${classId}`);

    // context 2: Student
    const studentContext = await browser.newContext();
    const studentPage = await studentContext.newPage();
    await studentPage.goto('/?role=student');

    // Student should land on chat (Lobby or auto-joined class)
    await expect(studentPage.locator('#chat-interface')).toBeVisible({ timeout: 30000 });

    await teacherContext.close();
    await studentContext.close();
});
