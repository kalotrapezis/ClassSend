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
        title: 'Multi-NIC Discovery',
        desc: 'A teacher PC with two network adapters on different subnets (e.g. Wi-Fi + Ethernet) is now reachable from both subnets. The server advertises every non-virtual IPv4 address via mDNS and HTTP discovery, and the student auto-join races them in parallel and redirects to the first that responds.',
    },
    {
        title: 'Connection State Banner',
        desc: 'A coloured banner above the chat now surfaces what is actually happening: Searching for a class, Waiting for the teacher to join, Disconnected, No network connection, Connecting. Replaces the silent spinner that left students wondering why chat was disabled.',
    },
    {
        title: 'No More Lobby Gate',
        desc: 'The chat shell now renders immediately in "searching" mode when no class is found, instead of force-joining a fake Lobby room. The old gate existed only to paper over missing identity at boot — with the new bootstrap below, it is no longer needed.',
    },
    {
        title: 'Deterministic Identity Bootstrap',
        desc: 'Name and role are applied synchronously from cached values so the app unblocks instantly. OS hostname and installer-registry reads race a 1.5s timeout and upgrade identity if they win — a hung IPC can no longer leave you on a blank screen.',
    },
    {
        title: 'Teacher: Mute All PCs',
        desc: 'New tool in Administration mutes the system master volume on every student PC via the Windows Core Audio API. Press again to unmute. Late joiners and reconnects inherit the current state automatically.',
    },
    {
        title: 'Overload Protection (Rate Limiter)',
        desc: 'The student client hard-drops teacher commands that exceed configured per-event limits — caps a buggy or hostile session that would otherwise spam shutdown / lock-screen / launch-app and DOS the student PC. A throttled toast appears when limits trigger.',
    },
    {
        title: 'Self-Healing Join Lock',
        desc: 'Joining a class or the lobby now has a hard ACK timeout. If the server goes silent the lock clears automatically and auto-flow re-arms — students can no longer get stranded waiting forever for a reply that never comes.',
    },
    {
        title: 'Restart if Unresponsive',
        desc: 'New toggle in Settings → Administration registers ClassSend with Windows so that it is automatically relaunched if Windows terminates it for being unresponsive. Enabled by default.',
    },
    {
        title: 'Internet Cutoff Persistence: Off by Default',
        desc: 'The "Persist Internet Cutoff After Reboot" toggle now defaults to OFF. Internet blocking is no longer automatically restored after a student PC reboots unless the teacher explicitly enables it.',
    },
    {
        title: 'Internet Whitelist: Quick-Add Presets',
        desc: 'New "Quick add" buttons (Google, YouTube, Microsoft) in the Internet Cutoff whitelist automatically add all domains a service needs to load — fixing cases where google.gr worked but Google still failed due to missing gstatic.com and googleapis.com.',
    },
    {
        title: 'Internet Whitelist: www. Fix',
        desc: 'Entering a domain with a www. prefix (e.g. www.google.com) now correctly strips it to google.com, ensuring the proxy bypass covers the bare domain and all subdomains.',
    },
    {
        title: 'Auto-Recovery from Frozen App',
        desc: 'The app now detects when its renderer process becomes unresponsive (the frozen state previously fixed manually with Ctrl+R) and reloads itself automatically — no teacher or student action needed.',
    },
    {
        title: 'Monitoring: Sequential Image Sending',
        desc: 'Student PCs now send screenshots in a staggered sequence (1.2 s apart) instead of all at once, eliminating network bursts that caused slow or missing thumbnails in large classes.',
    },
    {
        title: 'Monitoring: Late-Joining Students',
        desc: 'Students who join a class after monitoring is already enabled now receive screenshots automatically — previously they were silently skipped until the teacher restarted monitoring.',
    },
    {
        title: 'Monitoring: Thumbnail Quality Setting',
        desc: 'A new "Thumbnail Quality" selector in Settings → Screen Sharing lets the teacher choose between Very Low (160×90) and Low (320×180). The setting syncs to all connected students instantly.',
    },
    {
        title: 'Focus View Without Prior Image',
        desc: 'The teacher can now click any student card to open the focus/high-res view even if no thumbnail has arrived yet — the high-res frame is requested immediately on click.',
    },
    {
        title: 'Internet Cutoff Persistence Toggle',
        desc: 'A new toggle in Settings → Connection lets the teacher control whether internet blocking is restored on student PCs after a reboot. Syncs to all connected students. A manual recovery command is displayed below the toggle for edge cases.',
    },
    {
        title: 'Advanced Filter Fix',
        desc: 'Fixed a bug where the AI content filter blocked every message regardless of the sensitivity threshold. Words not in the classifier\'s vocabulary no longer fall back to the skewed training prior.',
    },
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
