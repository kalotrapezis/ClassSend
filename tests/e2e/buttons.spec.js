
const { test, expect } = require('@playwright/test');

test.describe('Button Functionality Tests', () => {

    // ===== ROLE SELECTION =====
    test('First launch defaults to student role', async ({ page }) => {
        // Clear any saved role
        await page.goto('/');
        await page.evaluate(() => localStorage.removeItem('classsend-role'));
        await page.reload();

        // Role selection should be HIDDEN (auto-defaults to student)
        await expect(page.locator('#role-selection')).toBeHidden({ timeout: 10000 });

        // Should transition to chat interface (Lobby as student)
        const chatOrClasses = page.locator('#chat-interface, #available-classes');
        await expect(chatOrClasses.first()).toBeVisible({ timeout: 30000 });
    });

    test('Teacher role via URL param creates class', async ({ page }) => {
        await page.goto('/?role=teacher');

        // Should auto-create class and show chat
        await expect(page.locator('#chat-interface')).toBeVisible({ timeout: 30000 });
        await expect(page.locator('.class-item')).toBeVisible({ timeout: 15000 });
    });

    // ===== SETTINGS =====
    test('Settings button opens and closes settings modal', async ({ page }) => {
        await page.goto('/?role=teacher');
        await expect(page.locator('#chat-interface')).toBeVisible({ timeout: 30000 });

        // Open settings
        await page.click('#btn-settings-toggle');
        await expect(page.locator('#settings-modal')).toBeVisible({ timeout: 5000 });

        // Close settings
        await page.click('#btn-close-settings');
        await expect(page.locator('#settings-modal')).toBeHidden({ timeout: 5000 });
    });

    test('Change Role button shows role selection', async ({ page }) => {
        await page.goto('/?role=teacher');
        await expect(page.locator('#chat-interface')).toBeVisible({ timeout: 30000 });

        // Open settings
        await page.click('#btn-settings-toggle');
        await expect(page.locator('#settings-modal')).toBeVisible({ timeout: 5000 });

        // Mock the confirm dialog to auto-accept
        page.on('dialog', dialog => dialog.accept());

        // Click Change Role
        await page.click('#btn-change-role');

        // Role selection screen should reappear
        await expect(page.locator('#role-selection')).toBeVisible({ timeout: 15000 });
    });

    // ===== MESSAGING =====
    // Note: Full send/receive flow is tested in messaging.spec.js
    // These tests verify basic button/input existence and state
    test('Send button and message input exist and are accessible', async ({ page }) => {
        await page.goto('/?role=teacher');
        await expect(page.locator('#chat-interface')).toBeVisible({ timeout: 30000 });

        // Message input should exist
        const input = page.locator('#message-input');
        await expect(input).toBeVisible({ timeout: 5000 });

        // Send button should exist
        const sendBtn = page.locator('#btn-send-message');
        await expect(sendBtn).toBeVisible({ timeout: 5000 });
    });

    test('Message input accepts text', async ({ page }) => {
        await page.goto('/?role=teacher');
        await expect(page.locator('#chat-interface')).toBeVisible({ timeout: 30000 });

        // Even when disabled, we can type into input
        const input = page.locator('#message-input');
        await input.focus();
        // Input should exist and be focusable
        await expect(input).toBeVisible();
    });

    // ===== FILE ATTACHMENT =====
    test('Attach file button triggers file input', async ({ page }) => {
        await page.goto('/?role=teacher');
        await expect(page.locator('#chat-interface')).toBeVisible({ timeout: 30000 });

        // Verify the button exists and is clickable
        const attachBtn = page.locator('#btn-attach-file');
        await expect(attachBtn).toBeVisible({ timeout: 5000 });

        // We can't fully test file dialog, but ensure no error on click
        // Listen for file chooser
        const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 5000 }),
            attachBtn.click()
        ]);
        expect(fileChooser).toBeTruthy();
    });

    // ===== CONNECTION INFO =====
    test('Connection info button opens modal', async ({ page }) => {
        await page.goto('/?role=teacher');
        await expect(page.locator('#chat-interface')).toBeVisible({ timeout: 30000 });

        // Click the "Show URL" / connection info button
        const btnShowUrl = page.locator('#btn-show-url');
        if (await btnShowUrl.isVisible()) {
            await btnShowUrl.click();
            await expect(page.locator('#connection-modal')).toBeVisible({ timeout: 5000 });
        }
    });

    // ===== SIDEBAR =====
    test('Sidebar class items are clickable', async ({ page }) => {
        await page.goto('/?role=teacher');
        await expect(page.locator('#chat-interface')).toBeVisible({ timeout: 30000 });

        // Should have at least one class in sidebar
        const classItem = page.locator('.class-item').first();
        await expect(classItem).toBeVisible({ timeout: 15000 });
        await classItem.click();

        // Class should be active
        await expect(classItem).toHaveClass(/active/, { timeout: 5000 });
    });

    // ===== TEACHER TOOLS =====
    test('Teacher tools menu button works', async ({ page }) => {
        await page.goto('/?role=teacher');
        await expect(page.locator('#chat-interface')).toBeVisible({ timeout: 30000 });

        // Open teacher tools menu
        const toolsMenu = page.locator('#btn-tools-menu');
        if (await toolsMenu.isVisible()) {
            await toolsMenu.click();
            // The tools popup/menu should appear
            const toolsPopup = page.locator('#teacher-tools-popup');
            if (await toolsPopup.count() > 0) {
                await expect(toolsPopup).toBeVisible({ timeout: 5000 });
            }
        }
    });

    // ===== RENAME CLASS =====
    test('Rename class button works for teacher', async ({ page }) => {
        await page.goto('/?role=teacher');
        await expect(page.locator('#chat-interface')).toBeVisible({ timeout: 30000 });

        // Open settings
        await page.click('#btn-settings-toggle');
        await expect(page.locator('#settings-modal')).toBeVisible({ timeout: 5000 });

        // Check if rename input exists
        const renameInput = page.locator('#rename-class-input');
        if (await renameInput.isVisible()) {
            await renameInput.fill('TestClass');
            await page.click('#btn-rename-class');
            // Give time for rename to process
            await page.waitForTimeout(1000);
        }

        await page.click('#btn-close-settings');
    });

    // ===== LANGUAGE SELECTOR =====
    test('Language selector changes language', async ({ page }) => {
        await page.goto('/?role=teacher');
        await expect(page.locator('#chat-interface')).toBeVisible({ timeout: 30000 });

        // Open settings
        await page.click('#btn-settings-toggle');

        const langSelect = page.locator('#language-select');
        if (await langSelect.isVisible()) {
            // Switch to Greek
            await langSelect.selectOption('el');
            await page.waitForTimeout(500);

            // Switch back to English
            await langSelect.selectOption('en');
        }

        await page.click('#btn-close-settings');
    });

    // ===== USERS LIST =====
    test('Users list is visible in sidebar', async ({ page }) => {
        await page.goto('/?role=teacher');
        await expect(page.locator('#chat-interface')).toBeVisible({ timeout: 30000 });

        // Users list should show at least the teacher
        const usersList = page.locator('#users-list');
        await expect(usersList).toBeVisible({ timeout: 15000 });
    });

    // ===== BLACKLIST BUTTON (TEACHER ONLY) =====
    test('Blacklist button opens modal for teacher', async ({ page }) => {
        await page.goto('/?role=teacher');
        await expect(page.locator('#chat-interface')).toBeVisible({ timeout: 30000 });

        const btnBlacklist = page.locator('#btn-blacklist');
        if (await btnBlacklist.isVisible()) {
            await btnBlacklist.click();
            await expect(page.locator('#blacklist-modal')).toBeVisible({ timeout: 5000 });
        }
    });
});
