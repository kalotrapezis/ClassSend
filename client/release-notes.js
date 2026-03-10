/**
 * release-notes.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for the "Recent Improvements" list shown on the
 * About page in Settings.
 *
 * To update for a new release:
 *   1. Edit the entries below (title + desc).
 *   2. Bump the version in client/package.json  ← drives __APP_VERSION__ in build
 *   3. Run `npm run build` inside /client.
 *
 * Each entry renders as:  <li><strong>title</strong>: desc</li>
 */

export const releaseNotes = [
    {
        title: 'Tool Button Reliability',
        desc: 'Lock Screen, Internet Cutoff, and other teacher tools now warn and auto-recover when the class connection is briefly lost — no more silent failures or app restart required.',
    },
    {
        title: 'Window Focus Fix',
        desc: 'Clicking the app window with the mouse now reliably restores keyboard focus on Windows; tray restore and post-lock-screen return are also fixed.',
    },
    {
        title: 'Keyboard Navigation (TAB)',
        desc: 'TAB order corrected — the Tools toggle button is reached before the menu items inside it, so keyboard-only users no longer traverse hidden buttons.',
    },
    {
        title: 'Config File (classsend.conf)',
        desc: 'Plain-text configuration file for IT admins — role, port, TLS, monitoring quality, AI thresholds, and more. Edit with any text editor; restart to apply.',
    },
    {
        title: 'Improved Monitoring Quality',
        desc: 'Configurable resolution (320p → 4K) and JPEG streaming with bandwidth-aware quality levels (8 → 64 Mbit).',
    },
    {
        title: 'Proper Windows Installer',
        desc: 'NSIS wizard with role selection (Teacher / Student) — installs to Program Files for all users with no UAC prompts at launch.',
    },
    {
        title: 'WiFi Guard Service',
        desc: 'Persistent background service prevents students from disabling network access, surviving app restarts and Windows sessions.',
    },
    {
        title: 'Connection Lost Screen',
        desc: 'Modern full-screen recovery page with a manual retry button replaces the old blank screen when the teacher server is unreachable.',
    },
];
