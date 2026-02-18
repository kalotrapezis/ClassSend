---
description: ClassSend Architecture, UI Standards, and Context Guide
---

# ClassSend Architecture & Context

This workflow provides a context table for the application structure and defines the strict UI/UX standards for ClassSend. Use this as a reference when creating new features or modifying existing ones.

## 1. Application Structure (Context Table)

The application is a single-page app (SPA) with distinct "screens" managed by showing/hiding DOM elements.

| View / Section | ID / Class | Key Components | Description |
| :--- | :--- | :--- | :--- |
| **Role Selection** | `#role-selection` | `#btn-teacher`, `#btn-student` | Initial screen to select user role. |
| **Class Setup** | `#class-setup` | `#class-id-input`, `#user-name-input`, `#btn-submit-setup` | Form for creating a new class (Teacher). |
| **Available Classes** | `#available-classes` | `#available-classes-list`, Smart IP Inputs | List of discoverable classes for students. |
| **Chat Interface** | `#chat-interface` | `.chat-header`, `#message-list`, `#chat-input-area` | Main application view for messaging and sharing. |
| **Header** | `.chat-header` | `#btn-show-url` (Connection), `#btn-media-toggle` (Library), `#btn-settings-toggle` (Settings) | Persistent top bar in Chat Interface. |

### Modals & Floating Windows
ClassSend uses custom-styled modals, not native alerts/prompts (except for critical confirmations).

| Modal Name | ID | Purpose |
| :--- | :--- | :--- |
| **Settings** | `#settings-modal` | Tabbed settings (Personalization, Connection, Admin, etc.). |
| **Media Library** | `#media-popup` | Grid view of shared files. Contains `#btn-download-all` and `#btn-clear-media`. |
| **Video Stream** | `#video-modal` | Teacher screen sharing viewer. |
| **Web Viewer** | `#web-viewer-modal` | In-app web browser (`<webview>`). |
| **PDF Viewer** | `#pdf-viewer-modal` | Inline PDF viewer. |

## 2. UI Standards & Aesthetics

**Goal:** create a design that "WOWs" the user. Premium, modern, and polished.

### Color Palettes (Theming Engine)
We use CSS variables for theming. The app must support all defined themes.

1.  **Deep Space (Default)**: Dark Slate / Cyan
    *   Bg: `#0f172a` -> `#172554`
    *   Accent: `#06b6d4`
2.  **Neon Tokyo**: Deep Violet / Hot Pink
    *   Bg: `#2e1065` -> `#4c1d95`
    *   Accent: `#e879f9`
3.  **Carbon**: Pure Black / Silver
    *   Bg: `#000000` -> `#111111`
    *   Accent: `#525252`
4.  **Solar**: Dark Ember / Bright Gold
    *   Bg: `#240d04` -> `#451a03`
    *   Accent: `#fb923c`
5.  **High Contrast**: Black / Yellow (Accessibility)

### Critical Design Rules
*   **NO EMOJIS**: Do not use text emojis (e.g., ❌, ⚙️). Always use **SVG Icons**.
*   **SVG Icons**: Use high-quality SVGs. Ensure they are colored correctly via CSS (usually `var(--text-primary)` or `var(--accent-primary)`).
*   **Glassmorphism**: Use `var(--glass-bg)` and `backdrop-filter: blur()` for overlays and floating panels.
*   **Micro-Animations**: Add hover states (`transform: translateY(-2px)`), active states, and smooth transitions.

### Specific UI Elements
*   **Toggles**: Do NOT use default checkboxes. Use the `.switch` class structure with specific sliders.
    ```html
    <label class="switch">
      <input type="checkbox" id="my-toggle">
      <span class="slider round"></span>
    </label>
    ```
*   **Floating Windows**: Use `.modal` and `.modal-content` with draggable headers (`.popup-header`).
*   **Toggle Buttons**: For complex states (like Block/Unblock), use dedicated button styles giving clear visual feedback (e.g., Red/Green gradients), not simple check toggles.

## 3. Translations (I18n)

**Mandatory**: Every visible text string MUST be translatable.

1.  **HTML**: Use `data-i18n="key-name"`.
    ```html
    <span data-i18n="btn-save">Save</span>
    ```
2.  **JavaScript**: Use `translations[currentLanguage]['key-name']`.
3.  **Dictionary**: Add English (`en`) and Greek (`el`) keys to `client/translations.js`.

## 4. Workflows

When implementing new features:
1.  **Plan**: Check `client/index.html` for placement.
2.  **Style**: Add styles to `client/style.css` using variables.
3.  **Translate**: Add keys to `translations.js`.
4.  **Logic**: Implement behavior in `client/main.js` or `server/index.js`.
