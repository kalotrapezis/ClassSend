# Release Notes

## [11.5.0] - 2026-05-10

### NEW
- **Multi-NIC Discovery (ClassSend2 v0.0.5 parity)**: A teacher PC with two network adapters on different subnets (e.g. Wi-Fi `192.168.1.x` + Ethernet `10.0.0.x`) is now reachable from **both** subnets. The server enumerates every non-virtual IPv4 NIC, advertises one mDNS service per NIC, and exposes the full address list via `addresses[]` in `/api/ping`, `/api/discovery-info`, and the mDNS TXT record. The student's known-servers history persists every advertised IP and the auto-join flow runs a parallel `/api/ping` race over them, redirecting to the first responsive address. Single-NIC machines behave identically — the new code only kicks in when there is more than one real adapter.
- **Connection State Banner (flow v2)**: A new banner above the chat surfaces real connection state — *Searching for a class…*, *Waiting for the teacher to join…*, *Disconnected — trying to reconnect…*, *No network connection*, *Connecting…*, *Joining ClassName…*. Replaces the silent spinner that previously gave students no idea why chat was disabled. Wired into `online`/`offline` browser events, socket connect/disconnect, probe results, and class join.
- **Lobby Gate Removed**: When no real classes are found, the chat shell now renders immediately in "searching" mode instead of force-joining a fake `Lobby` socket room. The old workaround existed to give the UI *something* to render before identity was resolved; with the new identity bootstrap below, the gate is unnecessary. The server-side `join-or-create-lobby` handler is kept for backward compatibility — old clients still work.
- **Deterministic Identity Bootstrap**: Name and role are now applied synchronously from cached values (`PC-XXXX` fallback, `student` role) so the chat shell unblocks instantly. The OS hostname (`get-hostname`) and installer registry (`get-install-mode`) IPC reads race against a 1.5 s timeout and *upgrade* identity if they win. A hung IPC can no longer leave the user staring at a blank screen.
- **Teacher → Mute All PCs**: New tool in the Administration column of the teacher's tools menu. Hitting the speaker icon mutes the system master volume on every student PC in the class via the Windows Core Audio API (PowerShell `audio-mute.ps1`). State is persisted on the class so late-joining and reconnecting students inherit the muted state. Press again to unmute. Icon flips between `speaker.svg` and `speaker-mute.svg`.
- **Per-Event Rate Limiter (overload protection)**: The student client hard-drops teacher-triggered remote commands that exceed configured per-event limits. Caps a buggy or hostile teacher session that would otherwise spam `execute-shutdown`, `launch-app`, `execute-lock-screen`, `request-high-res-frame`, etc., and DOS the student PC. Throttled toast surfaces when limits trigger. Tunable per-event in one place (`_rateConfig` in `client/main.js`).

### FIXES
- **Frozen `joiningInProgress` lock**: `joinClass` and `joinOrCreateLobby` previously had no ACK timeout, so a silent server could leave the lock `true` forever. Both paths now use `socketEmitWithAck()` with a hard timeout (4–5 s); on timeout the lock is cleared, the client re-enters searching mode, and auto-flow is re-armed. Students no longer get stranded when the server doesn't reply.
- **Visible Network-Loss UX**: Going offline now shows a red banner with a clear message instead of the silent console log + spinner. Coming back online resumes the probe sequence and reconnects the socket automatically.
- **Empty-/Null-Class Handling**: `updateChatDisabledState()` now treats `currentClassId === null` as "searching" with the right placeholder ("Searching for a class…" or "Offline — waiting for network…"), instead of returning early with a half-rendered composer.

### INTERNALS
- New helpers in `client/main.js`: `_ipcWithTimeout()`, `setConnectionState()` (state machine), `socketEmitWithAck()`, `enterSearchingMode()`, `pickReachableAddress()` (multi-NIC race), `rateGuard()`.
- New helpers in `server/network-discovery.js`: `getAllLocalIPs()` (multi-NIC enumeration), `getLocalIPs()` (getter for the list). `publishMainService()` now publishes one extra service per NIC on multi-adapter machines.
- New IPC handler `set-system-mute` in `server/electron-main.js`; new `server/audio-mute.ps1` (Windows Core Audio API via inline C#, no external deps).
- New socket event `trigger-system-mute` (teacher → server) and `execute-set-system-mute` (server → student) with retry-on-no-ACK via the existing `sendCommandWithAck` harness.
- `addresses[]` field added to `/api/ping`, `/api/discovery-info`, mDNS TXT records, and known-servers history entries.

### PACKAGING
- `audio-mute.ps1` added to `server/package.json`'s `extraResources` so it ships next to `wifi-guard.ps1` in `resources/`.

---

## [11.4.0] - 2026-05-07

### NEW
- **MAC + Hostname Aware Discovery**: The server now exposes a stable identity (`serverId`, `hostname`, `mac`) on `GET /api/discovery-info` and a new lightweight `GET /api/ping` used for fast first-hit probing. The client persists this rich info per known server so a teacher PC whose IP changes via DHCP is still found instantly via its hostname or MAC.
- **Race-Based Parallel Probing**: Each known-server entry expands to multiple candidate URLs (recorded IP, `http://hostname:port`, `http://hostname.local:port`) and all are probed concurrently with a 2.5 s ceiling. Results are deduplicated by `serverId`. This fully replaces the old sequential `7s × N` probe loop that caused 7-8 of 10 PCs to freeze on cold start.
- **Continuous Background Discovery**: A 6-second heartbeat re-probes known servers while the student is in the Lobby, so a teacher who comes online *after* the students are already booted is auto-detected within seconds. The heartbeat stops automatically once the student joins a real class — no idle cost at steady state.
- **Three-Path Auto-Connect**:
  1. **History probe** (always on, plain HTTP — works in locked-down school networks).
  2. **mDNS broadcast** (toggle, default ON — for first-ever boot when no history exists; harmless if blocked by school firewall).
  3. **Manual-connect fallback** — if neither yields a class within 12 s, the manual IP entry dialog opens automatically so the user can type the teacher's IP/hostname.
- **Users-List Search Bar (ClassSend2-style)**: New search input above the users list with substring + Levenshtein-≤1 fuzzy matching. Hostname-aware sort means `Lab1, Lab2, Lab10` instead of `Lab1, Lab10, Lab2`.
- **Hostname as Default Username**: First-time users now get the machine hostname (via `os.hostname()`) instead of a random "Happy Lemon"-style name. The dice button in Settings now resets to hostname rather than rolling random.

### FIXES
- **Name Auto-Overwrite**: Changing the language no longer regenerates the username, which was silently overwriting names users had typed in.
- **Duplicate `blocked` Key in `join-class` Callback**: The server's join callback had two `blocked` keys; the second silently overwrote the first, losing the per-socket "is this user blocked" bit. Removed the duplicate.
- **Bounded Join History**: The server now caps the message history sent to joiners at the most recent 200 messages. Joins were sending the entire log (including media references) to every joiner — a hidden bottleneck under burst joins of 10+ students.

### PERFORMANCE
- Removed the 500 ms artificial delay on boot probe — discovery now fires immediately when the network is online.
- New `/api/ping` is a tiny JSON identity-only endpoint, used for first-hit detection before fetching the heavier `/api/discovery-info`.
- Probe candidate set deduplicates own origin and (host / .local / IP) variants of the same machine before issuing requests.
- Capped 200-message join history reduces per-joiner payload from unbounded to ≤ 200 messages.

### TESTS
- New unit suite: `hostname-sort.test.js`, `known-servers.test.js`, `connection-probe.test.js`, `discovery-endpoints.test.js`, `smoke.test.js` (live integration). 21 unit tests + 3 live smoke tests, all passing.

---

## [11.3.1] - 2026-03-19

### FIXES
- **Students Stuck After Teacher Disconnect**: When the teacher left and created a new class, 8 out of 9 students would stay frozen in the dead class instead of automatically finding and joining the new one. Two separate bugs caused this:
  1. The `class-ended` handler called the browser's built-in `alert()` dialog, which freezes JavaScript completely while it waits for a click. While the dialog sat open, the server sent the `active-classes` broadcast containing the teacher's new class. That event executed after the dialog was dismissed — but at that point `currentClassId` was still the old class, so `handleAutoFlow()` silently returned without doing anything. Students ended up staring at the scanning spinner with no further trigger. Fixed by removing the blocking `alert()` and immediately re-arming and calling `handleAutoFlow()` after going to the scanning state.
  2. For students whose socket reconnected after the class was already deleted: `joinClass()` would fail, set `autoFlowTriggered = false`, and wait for the next socket reconnect to retry. But no reconnect was coming — the socket was already connected. The next `active-classes` event called `handleAutoFlow()`, which immediately returned because `autoFlowTriggered` was false. Fixed by keeping `autoFlowTriggered = true` and calling `handleAutoFlow()` directly after the failed join instead of waiting.

---

## [11.3.0] - 2026-03-18

### NEW
- **Command Acknowledgment (Handshake)**: When the teacher sends a command (lock screen, cut internet, open app, close all apps, shutdown, etc.), each student PC now sends back a confirmation after executing it. The teacher's PC receives a per-student acknowledgment showing the student's **name** and **PC name**. If a student's confirmation does not arrive within 5 seconds, the server automatically resends the command to that student — up to 3 retries — before giving up. This ensures commands reliably reach every PC even on flaky classroom networks.
- **Active State Applied to Late Joiners**: Students who join a class after the teacher has already issued a class-wide command now receive the current state immediately on join. Specifically: if internet cutoff is active when a student connects, their internet is blocked automatically; if screen lock is active, their screen is locked automatically. Previously these students would join in an unlocked/unrestricted state until the teacher re-issued the command.

### INTERNALS
- Added `pendingCommandAcks` map and `sendCommandWithAck` / `removePendingAcksForSocket` / `clearPendingAcksForClass` helpers in `server/index.js`.
- `classData` objects now carry `internetCutActive`, `internetCutPayload`, and `lockScreenActive` fields to persist class-wide command state across joins.
- All seven command handlers (`trigger-lock-screen`, `trigger-unlock-screen`, `trigger-disable-internet`, `trigger-enable-internet`, `trigger-shutdown`, `trigger-focus`, `trigger-close-all-apps`) route through `sendCommandWithAck`.
- Pending ack entries are cleaned up immediately when a student leaves/disconnects or when a class is deleted, preventing stale retry timers.
- Client-side `execute-*` handlers emit `command-ack` after execution; internet commands wait for the Electron IPC promise to resolve before acking; shutdown acks before invoking (the PC won't be online to ack afterwards).

---

## [11.2.4] - 2026-03-18

### FIXES
- **Heartbeat Watchdog (corrected)**: The watchdog now only arms itself after the first heartbeat arrives from the renderer — preventing a false-positive reload loop that occurred during startup when the preload script hadn't yet exposed `ipcRenderer`. The previous implementation started the 20-second countdown immediately on `did-finish-load`, which could cause the app to reload before the heartbeat sender had a chance to initialize, creating an infinite reload cycle that disconnected students.
- **Auto-Connect Race Condition**: Fixed a timing issue where students on the teacher's server would sit in the Lobby instead of auto-joining the class. When the socket first connected, `handleAutoFlow()` ran before the class list arrived from the server (`active-classes` is async). This blocked the class list response from triggering auto-join via `joiningInProgress`. After the Lobby join completes, the app now immediately re-requests the class list so `handleAutoFlow()` gets a clean, unblocked attempt.

---

## [11.2.3] - 2026-03-16

### FIXES
- **Heartbeat Watchdog**: The app now actively monitors whether the renderer is alive via a heartbeat signal sent every 5 seconds. If the renderer goes silent for 20 seconds (soft freeze, stuck promise, or silent crash) the main process automatically reloads it. This complements the existing `unresponsive` event handler, which only catches hard input-blocking freezes.
- **Emergency Internet Recovery Command**: The "Persist Internet Cutoff" helper command now also deletes the `ProxyServer` and `ProxyOverride` registry keys in addition to disabling `ProxyEnable`. Previously, only disabling the proxy flag left the `127.0.0.1:81` proxy address in the registry, causing the app to crash after running the command and requiring a manual trip to Windows Internet Settings to fully clear the proxy.

---

## [11.2.2] - 2026-03-12

### NEW
- **Restart if Unresponsive**: A new toggle in Settings → Administration lets you register ClassSend with Windows Error Reporting so that Windows automatically relaunches the app if it is terminated for being unresponsive. Enabled by default on new installs.

### CHANGES
- **Internet Cutoff Persistence: Off by Default**: The "Persist Internet Cutoff After Reboot" toggle now defaults to OFF on new installs. Internet blocking is no longer automatically restored after a student PC reboots unless the teacher explicitly enables the setting.

---

## [11.2.1] - 2026-03-11

### NEW
- **Internet Whitelist Quick-Add Presets**: New "Quick add" buttons (Google, YouTube, Microsoft) in the Internet Cutoff whitelist automatically add all domains a service needs — fixing cases where google.gr worked but Google still failed due to missing gstatic.com and googleapis.com.
- **Internet Whitelist www. Fix**: Entering a domain with a www. prefix (e.g. www.google.com) now correctly strips it to google.com, ensuring the proxy bypass covers the bare domain and all subdomains.
- **Auto-Recovery from Frozen App**: The app now detects when its renderer process becomes unresponsive and reloads itself automatically — no teacher or student action needed.
- **Monitoring: Sequential Image Sending**: Student PCs now send screenshots in a staggered sequence (1.2 s apart) instead of all at once, eliminating network bursts that caused slow or missing thumbnails in large classes.
- **Monitoring: Late-Joining Students**: Students who join a class after monitoring is already enabled now receive screenshots automatically — previously they were silently skipped until the teacher restarted monitoring.
- **Monitoring: Thumbnail Quality Setting**: A new "Thumbnail Quality" selector in Settings → Screen Sharing lets the teacher choose between Very Low (160×90) and Low (320×180). The setting syncs to all connected students instantly.
- **Focus View Without Prior Image**: The teacher can now click any student card to open the focus/high-res view even if no thumbnail has arrived yet — the high-res frame is requested immediately on click.
- **Internet Cutoff Persistence Toggle**: A new toggle in Settings → Connection lets the teacher control whether internet blocking is restored on student PCs after a reboot. Syncs to all connected students.

### FIXES
- **Advanced Filter Fix**: Fixed a bug where the AI content filter blocked every message regardless of the sensitivity threshold. Words not in the classifier's vocabulary no longer fall back to the skewed training prior.

## [11.2.0] - 2026-03-10

### NEW
- **Config File (`classsend.conf`)**: A plain-text configuration file is now placed next to the executable after installation (`C:\Program Files\ClassSend\resources\classsend.conf`). IT administrators can edit it with any text editor before or after deployment; a restart applies the changes. Configurable options include: role, port, TLS, auto-start, internet restore on startup, max file size, screen capture quality and resolution, socket buffer size, logging, and AI thresholds.
- **Improved Monitoring Quality**: Student screen capture now supports configurable resolution (`low` 320×180 · `1080p` · `1440p` · `4k`) and JPEG compression tied to streaming bandwidth (8 / 16 / 32 / 64 Mbit → quality 25 / 50 / 72 / 88). Frames are sent as JPEG instead of PNG, significantly reducing per-frame payload.
- **Dynamic About Page**: The version number and "Recent Improvements" list in Settings → About are now injected at build time from `client/package.json` and `client/release-notes.js` respectively — no more manual HTML edits per release.

### FIXES
- **Tool Button Reliability**: Teacher tools (Lock Screen, Internet Cutoff, Shutdown, Focus App, Close All Apps) would silently do nothing after a brief network reconnect because an internal logic inversion (`autoFlowTriggered = true` instead of `false`) left `currentClassId` as `null` indefinitely. The flag is now correctly reset, the teacher triggers auto-recovery after 2 seconds, and all five affected buttons show a clear warning toast instead of silently failing.
- **Window Focus Restoration**: Clicking the ClassSend window with the mouse no longer fails to restore keyboard focus on Windows. Root causes fixed: `app.disableHardwareAcceleration()` is now Linux-only (on Windows it forced software/WARP rendering which broke `WM_MOUSEACTIVATE`); `focus()` is now called after tray `show()`, on the `show` event, and after the lock screen overlay is dismissed.
- **TAB Keyboard Navigation**: TAB order corrected — the Tools toggle button is now first in DOM order and reached before the hidden menu items inside it. Tool menu buttons carry `tabindex="-1"` by default and are promoted to `tabindex="0"` only while the menu is open.

## [11.1.2] - 2026-03-09
### FIXES
- **Auto Client Build**: `npm run make` now automatically builds the client (Vite) before packaging the installer. Previously the client had to be built manually first, causing stale bundles to ship if the step was skipped.

## [11.1.1] - 2026-03-09
### FIXES
- **Missing Modules on Install**: `network-discovery.js` and `file-storage.js` were not included in the electron-builder file list, causing the server to fail on startup with "Cannot find module" after installation. Both files are now correctly packed into the app bundle.
- **Role Not Persisting (Teacher)**: After installation, the Teacher role was not being retained between launches. On every startup the app would show the role selection screen again, forcing the teacher to re-select their role manually. Fixed by routing the `socket.on('connect')` auto-flow to `triggerTeacherAutoFlow()` for teachers instead of the student-only `handleAutoFlow()`.
- **Wrong Role on First Launch**: Fresh installs always defaulted to the Student role regardless of what was selected during the installer's Teacher/Student setup page. The installer-chosen role (stored in `HKLM\SOFTWARE\ClassSend\Mode`) is now read via IPC on first launch and saved to local storage, so the app opens with the correct role immediately without any user interaction.
- **EPERM on Startup (Media Directory)**: The server failed to start after installation with `EPERM: operation not permitted, mkdir 'C:\Program Files\ClassSend\media'`. Both `file-storage.js` and `index.js` were trying to create the media folder inside the read-only `Program Files` installation directory. Both now use the writable `userData` path (`AppData\Roaming\ClassSend\`) instead.

## [11.1.0] - 2026-03-08
### CONNECTION BLOCKING WHITELIST
- **Whitelist Modal**: The "No Internet" tool is now a persistent modal instead of a simple toggle. Teachers can manage a URL whitelist alongside the on/off switch — adding a domain (e.g. `google.gr`) automatically allows all paths and subdomains without extra configuration.
- **Persistent State**: Internet blocking state is saved and restored automatically on app restart. If blocking was active when the app closed, it re-applies on next launch with the same whitelist.
- **Translations**: All modal text is fully translated into English and Greek and respects the app language setting.

## [11.0.0] - 2026-03-08
### INSTALLER & ROLE MANAGEMENT
- **Proper Windows Installer**: Migrated from the silent Squirrel installer to a full NSIS wizard (electron-builder). Shows a proper installation dialog with progress and options.
- **Teacher / Student Role Selection**: The installer now asks "Who will use ClassSend on this computer?" during setup. The selected role is written to the registry and remembered permanently — no more hidden unlock codes or manual role switching after install.
- **System-wide Installation**: ClassSend now installs to `Program Files` (per-machine) instead of the user's AppData folder, making it available to all accounts on the machine.
- **No-prompt Auto-start**: Auto-start on login is registered as a Windows Scheduled Task during installation. The app launches at login without any UAC consent popup.

### STUDENT NETWORK PROTECTION
- **WiFi Guard Service**: Student installations register a background system task (`ClassSend WiFi Guard`) that starts at boot as the SYSTEM account. It silently reverts any attempt to enable Airplane mode or administratively disable the WiFi adapter every 5 seconds. Students cannot stop or modify this process.
- **Automatic Cleanup**: Uninstalling ClassSend removes both the app startup task and the WiFi Guard task.

## [10.5.7] - 2026-03-06
### NETWORK RESILIENCE & STARTUP
- **Wait for Network**: The application now intelligently waits for a valid LAN IP at startup. If the PC is in Airplane mode or still searching for WiFi, the splash screen will display a status message instead of showing a blank screen.
- **Auto-Restart Recovery**: Implemented a 30-second watchdog that automatically restarts the application if a network connection or local server cannot be established within the timeout period.
- **Dynamic IP Monitoring**: The server now actively monitors for network interface changes (e.g., switching from WiFi to Ethernet). It automatically updates its IP, re-publishes mDNS services, and notifies all connected clients in real-time.
- **Connection Error Screen**: Replaced the "blank screen" failure mode with a modern, user-friendly "Connection Lost" recovery page, allowing users to manually retry the connection.
- **Improved Splash Status**: Added real-time status updates to the splash screen including "Waiting for local server..." and "Waiting for network (WiFi/LAN)...".
## [10.5.6] - 2026-03-06
### FIXES & IMPROVEMENTS
- **Promptless File Downloads**: Synced the "Predetermined Location" setting to the student app. When the teacher sends a file to the chat, it now automatically downloads in the background for all students without a browser prompt.
- **App Launch Domains**: The "Advanced" App Launch UI now automatically prefixes basic domain inputs (e.g., `google.gr`) with `http://` so they successfully launch via the default edge browser.
- **Monitoring PC Names**: Fixed an issue where the student's PC name (`os.hostname()`) was not being correctly passed to the grid, resulting in UI cards only showing the username.
- **DevTools Error**: Fixed the missing `filterWarning` DOM element reference that was producing a silent console error.
## [10.5.5-beta] - 2026-03-04
### NEW
- **Native PDF Viewer**: Completely removed the custom PDF.js implementation and reverted to Chromium's high-performance native PDF viewer. This resolves all "ERR_ABORTED" and worker-related loading issues.
- **Lock Screen Labels**: Updated "Lock Screen" buttons to "Lock all screens" (and Greek "Κλείδωμα όλων των οθονών") to better reflect its class-wide functionality.
- **Translation Restore**: Restored legacy translation keys (`btn-tool-lock-all-screens`, etc.) for better compatibility and consistency.

### FIXES
- **Viewer Stability**: Added internal guards to prevent unnecessary webview resets, eliminating console noise and potential browser crashes.
- **Cleanup**: Removed over 150 unused PDF.js library files and obsolete viewer logic.

## [10.5.2-beta2] - 2026-03-04
### FIXES
- **Settings Persistence**: Fixed "Auto-download" and "Startup" settings not persisting across application restarts.
- **Auto-download Default**: Blank download paths now correctly default to `[Desktop]`.
- **Registry Sync**: Fixed the "Start on Login" toggle to accurately reflect the Windows registry state on startup.

### UI/UX
- **System Tray**: Completely removed the right-click context menu from the tray icon for a cleaner experience (Double-click still opens the window).

## [10.5-beta] - 2026-03-02
### NEW
- **No Internet Tool**: Added a global and individual teacher tool to disable and restore student web access while maintaining local network communication.
- **PC Names**: New PC Name fild in the settings hidden and shown in the monitoring screens only for the teacher. PC names are asigned automaticaly with the order the PCs join the class the first time.

## [10.4-beta] - 2026-03-02
### NEW
- **Close All Apps**: Added a global and individual feature for teachers to close all running applications instantly.
- **Improved File Actions**: Enhanced file messages with "Send File" and "Open Action" buttons for better workflow.

### FIXES
- **Monitoring System**: Implemented critical fixes for the student monitoring system to improve reliability and performance.

## [10.3.0-beta] - 2026-03-01
### IMPROVEMENTS
- **Screen Share Bitrate**: Replaced connection-type presets (Auto/Ethernet/WiFi) with explicit bitrate options: 8, 16, 24, 32, and 64 Mbps. Default is 16 Mbps.
- **Slider Fix**: AI moderation threshold sliders now correctly reflect saved values on load (fill position was not updating after settings were fetched from server).
- **Bitrate Dropdown Fix**: Dropdown no longer appears empty when a previously cached bitrate value is no longer valid — falls back to 16 Mbps automatically.
- **PDF Viewer**: Removed the floating black zoom toolbar. Maximize button moved to the modal header (Minimize / Maximize / Close).

## [10.2.1] - 2026-02-28
### IMPROVEMENTS
- **Individual Controls**: Added fixes for targeting specific student devices with lock/focus/launch commands.
- **Locking UI**: Improved visual feedback for local and remote lock screen states.
- **Documentation**: Updated README and help documentation for clarity.
- **App Cards Fixes**: Resolved layout and state issues in the student monitoring grid.
- **Launching Improvements**: Enhanced application execution reliability from the teacher console.
- **UI Enhancements**: Refined the modern glassmorphism pill designs and animations.
- **Asset Fixes**: Resolved 404 error by restoring missing `lock-svgrepo-com.svg` asset.

## [10.2.0-beta.1] - 2026-02-28
### NEW
- **Monitor Focus Controls**: Added individual Lock, App Focus, and Remote Launch pill controls to the focused monitoring view.
- **Individual Targeting**: Server-side support for targeting specific students with lock, focus, and launch commands (no longer just class-wide broadcast).
- **Favorites Integration**: Quick-access favorite apps now available directly within the student focus view.
- **Improved UI**: Modern glassmorphism pill design for focus mode controls with smooth transition animations.

## [10.1.0] - 2026-02-28
### NEW
- **Beta Release**: Updated version and preparing for beta branch deployment.

## [10.0.1] - 2026-02-28
### FIXES
- **Translation Fixes**: Corrected missing and incorrect translations across the application.
- **Label Wording Fixes**: Updated label wording for clarity and consistency.

## [10.0.0] - 2026-02-27
### FIXES
- **Advanced Filtering**: Resolved core logic issues to ensure stable profanity detection.
- **Sensitivity Controls**: Added interactive sliders for "Warning" and "Block" thresholds in the moderation settings.
- **UI State**: Fixed a bug where teacher tools remained highlighted even when not active.

### NEW (Windows)
- **Student Monitoring**: Enhanced monitoring system that periodically sends low-resolution screenshots (5, 10, 15, 20 sec intervals).
- **Screen Lock**: Added "Κλείδωμα Οθόνης" - a full-screen, always-on-top plane to restrict student activity.
- **End of Day**: Implemented "Τερματισμός Τέλους Ημέρας" for bulk classroom termination.
- **Focus Mode**: Automatic window restoration from the system tray when focus is requested.
- **Automatic Downloads**: Predetermined download location support across all classroom PCs.

### COMING SOON
- **Remote Execution**: Direct application execution on all student PCs from the teacher console.


## [9.5.1] - 2026-02-25
### Added
- **Media Library Deletion**: Implemented both individual and library-wide media deletion with physical file removal.
- **Chat Sync**: Enhanced socket listeners to ensure file messages are removed from the chat UI immediately upon deletion.
- **Server Cleanup**: Updated server-side handlers to proactively clean up metadata and file-type messages when the library is cleared.

## [9.5.0] - 2026-02-25
### Added
- **Teacher Control**: Added ability to block student file uploads via teacher tools.
- **Media Library**: Teachers can now delete individual files from the shared media history.
- **Fullscreen Access**: Implemented fullscreen mode for all file viewers including Video, PDF, Word, Excel, and Images.
- **Maintenance**: General code cleanup, performance optimizations, and lazy loading implementation.

## [9.4.0] - 2026-02-21
### Added
- **System Messaging Redesign**: Completely overhauled the appearance of internal system messages (e.g. "User joined", "User left") to be contained within modern, centered pill designs. 
- **Dynamic Toasts**: Replaced bottom-floating, screen-blocking toasts with inline, color-coded notification pills that insert smoothly directly into the chat stream sequence.
- **File Transfer Progress Integration**: Unified the file upload and download indicator progress bars with the new "pill" design, creating a wholly consistent notification experience across the application.
- **Development Tools**: Added a hidden developer tools menu (Click the app logo in "About" 5 times) to simulate various UI components without needing multiple active device connections.

## [9.3.7] - 2026-02-20
- **Persisted Log Settings**: Log settings are now persisted across application restarts.
- **Persistent Media Library**: The media library is now saved to a "media" folder in the teacher's installation directory. Students mirror the teacher's media library, and all file transfers correspond directly with this folder.
- **Media Management**: The Media Library now features "Delete-Clear" and "Download All" buttons (available to teachers only).
- **Pinned Comments**: Improved UI and behavior for pinned messages, including better action button handling.
- **SVG Transition**: Replaced various action icons with premium SVG assets.
- **UI Enhancements**:
    - Added text labels to action buttons. The labels are placed on the right, keeping content on the left, with a smooth fade-out effect for overflowing content.
    - Updated message action buttons and new elements to use the same consistent styling, roundness, and colors.
    - Added progress bars to indicate when a file is being sent or received in the chat.
    - Consistent UI styling across all message types.
- **In-App Web Viewer**:
    - The "Link" button now opens websites securely in the internal web-viewer.
    - Added a full-screen option to the right side of the web-viewer controls.

## [9.3.5] - 2026-02-20
### Fixed
- **Auto-Connection**: Fixed a critical bug where the `joiningInProgress` lock was not cleared after joining the Lobby, permanently blocking automatic redirection to the teacher's server from history.
- **Version Update**: Internal consistency update for v9.3.5.
### Fixed
- **Class Duplication**: Fixed a bug where the same class could appear twice in the list (once from network, once from history), forcing the user to manually select it instead of auto-joining.
- **Hidden Lobby**: Ensured that internal "Lobby" classes are strictly hidden from the class list to prevent confusion.

### Added
- **Single Instance Lock**: Prevent multiple instances of the application. When clicking the shortcut while the app is active, the existing window is now restored and brought to focus.
- **Auto-Connect Enhancement**: Students now periodically check their history for known teachers while waiting in the Lobby. This ensures they connect automatically even if the teacher starts ClassSend after the students.


## [9.3.0] - 2026-02-18
### Added
- **SVG Transition**: Replaced emojis with high-quality SVG icons in file and web viewing panes for a more professional and consistent visual experience.
- **Improved Moderation UI**: The message area now dynamically darkens when "Block All" is active, providing clear visual feedback that communication is disabled.
- **Persistent Media Library**: Implemented a dedicated folder in the installation directory for file transfers, ensuring shared media persists across application restarts.
- **Enhanced Web Viewer**: Added partial fixes for the web viewer on non-Windows devices (tablets, etc.), improving accessibility outside the main desktop app.
- **Teacher Tool Menu**: Improved menu behavior; the tool menu now remains open after interaction (hand blocking, disabling, message blocking, screen sharing), allowing for multiple rapid adjustments.
- **Diagnostic Enhancements**:
    - Debugging logs are now enabled by default for easier troubleshooting.
    - Enhanced feedback for automatic scanning and connection status.
    - **Automatic Log Export**: The application now automatically exports logs to a text file in the user's directory upon startup and shutdown.
- **Connection Improvements**:
    - Resolved issues with automatic connection from history when podcasting is off.
    - The connection information popup now strictly respects the user's settings toggle.
- **Media Library Management**: Added a "Clear" button to easily manage and reset shared media files.

## [9.2.0] - 2026-02-16
### Added
- **Smart Auto-Connect**: The app now intelligently probes for known servers from history and handles offline/online states automatically, reducing the need for manual IP entry.
- **Auto-Setup**: First-time users are now automatically set to the "Student" role and taken directly to the class search screen, skipping the role selection step.
- **Auto-Delete System Messages**: System messages (User joined/left) now automatically fade out after 10 seconds to keep the chat clean.
- **Visual Timer**: A circular countdown timer appears on system messages before they disappear.
- **Refined Localization**:
    - **Themes**: Theme names now display correctly in the selected language (e.g., Greek).
    - **Connection Status**: Fixed an issue where the status text would revert to English when switching languages.
    - **Screen Share**: The "Share Screen" button text now updates dynamically when toggled or when the language changes.
- **Refined Name Generator**: The random name generator now produces grammatically correct adjectives and nouns in Greek.

## [9.1.2] - 2026-02-15
### Fixed
- **Email Display**: Fixed visual glitch where email addresses were broken by mention highlighting.
- **Email Action**: The "Email" button now correctly opens the default OS mail client.
- **Auto-Connect**: Improved reliability of auto-connection and retry logic.
- **Translations**: Added missing translations for action buttons (Copy, Pin, Block, Report, Email, Open).

## [9.0.1] - 2026-02-15
### Added
- **In-App Browser**: Replaced external link opening with a secure, modal web viewer to keep students focused within the app.
- **In-App Browser Controls**: Added navigation (Back, Forward, Refresh) to the internal web viewer.
- **Build Update**: Bug fixes and performance improvements.

## [9.0.0] - 2026-02-15
### Added
- **Dark Themes**: Introduced 4 new stunning dark themes: Deep Space, Neon Tokyo, Carbon, and Solar.
- **Persistent Media Library**: Uploaded files now persist in a `MediaLibrary` folder in the installation root.
- **Clear Data Feature**: Admin tool to delete all media files and reset server state.
- **Native Document Rendering**: Restored in-browser rendering for DOCX and XLSX files.
- **Text Overflow Fix**: Resolved issues with long message content breaking the layout.
- **Tray Fix**: The system tray "Close" button now correctly terminates the application.
- **UI Improvements**: Blurred communication interface for students who are blocked by the teacher.
- **Theme Selection Fix**: Resolved regression where themes were not clickable.

## [8.8.0] - 2026-02-15
### Maintenance
- **Version Correction**: Fixed a versioning mistake in the previous release.
- **General Stability**: Improvements to cleanup routines.

---

# Release Notes - v8.8

## 🧠 N-gram Classifier & Persistence
- **Greek Morphology Support**: The "Advanced" (Naive Bayes) filter now uses N-gram (trigram) tokenization. This allows it to detect variations of words (suffixes, prefixes) without needing every single form in the blacklist.
  - *Example*: Training on `βλάκας` now automatically helps detect `βλακέντιε` or `μαλάκες` from `μαλάκας`.
- **Model Persistence**: The trained AI model is now saved to `server/data/classifier-model.json`. It loads instantly on startup, preserving all "Learned" words from reports and teacher bans.
- **Pipeline Integration**: The N-gram classifier is now correctly invoked in the `send-message` pipeline when the class is in "Advanced" mode.

---

# Release Notes - v8.3.7
## 🔧 Maintenance
- **Stability**: Improvements to network discovery and file handling.

---

# Release Notes - v8.3.1
## 🛠️ Critical Fixes & Improvements

### 📥 Import/Export Reliability
- **Smart Import Refresh**: Fixed an issue where imported word lists would not appear immediately in the settings. The app now intelligently forces a refresh from the server to ensure all imported words are visible and ready for export.
- **Unified List Import**: Importing a single file now correctly populates both the **Blacklist** and **Whitelist** simultaneously.
- **Crash Prevention**: Resolved a server crash that occurred during the import process due to missing callbacks.

### 🔄 Role Switching Stability
- **Clean State Transitions**: Fixed potential state leakage when switching between Teacher and Student roles, ensuring a fresh session every time.

---

# Release Notes - v8.3.0

## 🧪 Advanced Automation & Testing

### 🏗️ E2E Testing Suite (Playwright)
- **Comprehensive Coverage**: Added automated end-to-end tests for Connection, Messaging, Class Flow, and Role Management.
- **Load Testing**: Verified server stability with 5-10 concurrent virtual clients.
- **Filter Tuning**: Specific tests to verify AI sensitivity levels (Strict/Lenient) and Teacher warnings for borderline content.

### ⚙️ Dynamic UI Enhancements
- **Auto-Version Injection**: The "About" page now pulls the version number automatically from `package.json` during the build process. No more manual HTML updates!
- **Vite Build Integration**: Optimized the build pipeline to define global app constants.

---

# Release Notes - v8.2.5

## 🚀 Streamlined Network & Stability

### ⚡ Direct Network Flow
- **No More Lobby**: We've simplified the connection process. Teachers now skip the Lobby and directly create a class. Students automatically scan for available classes.
- **Smart Auto-Join**: If only one class is found, students join it automatically for a seamless experience.

### 🛡️ Crash Prevention & Fixes
- **Block All Sync**: The "Block All Communications" button now correctly reflects the active state when joining or refreshing.
- **Single Class Protection**: Prevents accidental deletion or leaving of the class if it's the only one active, avoiding application crashes.
- **Role Switch Stability**: Fixed a critical crash during role switching by handling missing socket callbacks on the server.
- **Clean State Reload**: Implemented a full application reload when changing roles to ensure a completely clean environment and prevent state residues (like blocked message status).

---

# Release Notes - v8.2.0

## 🚀 Enhancements & Polish

### 🌐 Localization & UI
- **Full Greek Localization in Gallery**: Added missing Greek translations for the Media Library title and empty state.
- **Improved i18n Coverage**: Ensured UI consistency when switching languages.

### ⚙️ Settings Synchronization
- **Teacher-Student Sync**: Verified that critical settings like Language and Filter Mode are correctly synchronized from the teacher to all students in the class.

---

# Release Notes - v8.1.1

## 🚀 Streamlined Lobby & Localization

### 🖥️ Auto-Lobby Flow
- **Direct Entry**: Both Teachers and Students now skip the class setup screen and join a shared "Lobby" immediately after role selection.
- **Auto-Generated Identity**: Users receive a random temporary name instantly, reducing friction for first-time use.
- **Consolidated Connection**: Fixed issues where teachers and students would end up in different "rooms," ensuring everyone lands in the Lobby by default.

### ⚙️ Persistence & Rename
- **Saved Class Names**: Teachers can rename the Lobby, and this name is now saved locally. Upon return, the app automatically takes over the Lobby and restores the saved class name.

### 🌍 Enhanced Greek Localization
- **100% Translated Settings**: The entire settings menu, including advanced AI filtering and administration tools, is now fully localized in Greek.
- **Localized Placeholders**: Improved hint text and placeholders in Greek for better usability.

### 🛠️ Fixes
- **Tablet Discovery**: Resolved discovery issues on mobile devices that prevented them from seeing or joining classes automatically.
- **Version Clarity**: Updated all info panels to correctly reflect version 8.1.1.

---

# Release Notes - v8.1.0

## 🚀 Enhancements & Polish

### 🖥️ Improved User Experience
- **Custom Splash Screen**: The application now starts with a custom-branded animation, replacing the default "green" installer experience.
- **No Menu Bar**: The top menu bar has been removed for a cleaner, more immersive app interface.
- **Desktop Shortcut**: The installer now automatically creates a desktop shortcut for easier access.

### ⚙️ New Settings
- **Open on Startup**: Added a new "Start on Login" toggle in the Administration settings. Teachers can now choose to have ClassSend launch automatically when they log in to Windows.

### 🛠️ Fixes
- **Startup Stability**: Resolved issues where the app would restart or loop during the initial launch.
- **Visual Improvements**: Fixed the "green flash" during startup by syncing the window background color with the dark theme.

---

# Release Notes - v7.2.0
## ✨ UI Redesign & UX Improvements
This release focuses on a major UI overhaul of the Media Library and Settings modal.

### 📋 Media Library List View
- **Redesigned Layout**: Switched from cards to a horizontal list layout matching the User List.
- **Pill Shape**: Items now use a modern pill shape with glassmorphism (blur) effects.
- **Quick Actions**: "Pin" and "Download" buttons are now neatly grouped on the right.
- **Better Alignment**: File name and metadata (size/sender) are horizontal for better space utilization.

### ⚙️ Redesigned Settings Modal
- **Categorized Sidebar**: Added a sidebar to the settings modal for better organization (Personalization, Moderation, Connection, etc.).
- **Smooth Navigation**: Fast tab switching with clear SVG icons for each category.
- **About Page**: Updated with version information and a direct link to GitHub Releases.

### ⚡ Technical Improvements
- **CSS Versioning**: Added version query strings to CSS links to force cache refreshes.
- **Consolidated Styles**: Cleaned up conflicting CSS to ensure a consistent look and feel.

### 🚫 Moderation Updates
- **Blacklist Terminology**: Renamed "dictionary" to "Blacklist" throughout the app for clarity.
- **Whitelist Renaming**: Renamed "Good List" to "Whitelist" to match industry standard terminology.
- **Priority Filtering**: Whitelisted words now bypass ALL filters (including AI and Blacklist), ensuring safe words are never blocked.
- **Auto-Cleanup**: Adding a word to the Whitelist automatically removes it from the Blacklist.

### 🐛 Bug Fixes
- **Message Blocking**: Fixed a critical bug where approving a report would not delete the message from the chat.
- **Toast Notifications**: Repositioned notifications to the bottom-center for better visibility and less obstruction.
- **Client Validation**: Fixed an issue where the client would show a warning for whitelisted words even if they were allowed by the server.

---

# Release Notes - v7.0.1
## 📦 Offline AI & Engine Improvements
ClassSend is now fully optimized for offline use and modern hardware!

### 🌍 Truly Offline AI
- **Bundled Model**: The Deep Learning AI model (`~100MB`) is now embedded directly inside the application.
- **No Internet Required**: ClassSend detects the bundled model and loads it instantly from your local disk, requiring **zero** internet connection at runtime.
- **Fail-Safe**: Smart fallback logic ensures the app keeps working even if the model files are moved or corrupted.

### 🛠️ Architecture Upgrade (x64)
- **64-bit Exclusive**: We have upgraded the Windows build to **64-bit (x64)** to fully leverage modern processors and RAM for AI tasks.
- **Native Performance**: Native modules (`sharp`, `onnxruntime`) are now properly compiled and unpacked, resolving all previous "missing module" errors.
- **Concurrency Fix**: Fixed a race condition where quickly toggling the filter could cause silent failures.

### 🔍 Debugging Tools
- **Deep Server Logs**: Server-side model loading logs are now piped directly to the client's debug console, giving you full visibility into what the AI engine is doing.

---

# Release Notes - v7.0.0

## 🚀 Major Features

### 3-Layer AI Filtering Architecture
We've completely overhauled the content filtering engine to provide three distinct levels of security:
- **Legacy (Fast)**: Standard client-side blacklist filtering for older devices.
- **Advanced (Adaptive)**: Server-side Naive Bayes classification that learns from your corrections.
- **Deep Learning (Smart)**: **New** integration of `Toxic-BERT` (via Transformers.js) for human-like understanding of context, insults, and harassment.

### ⚙️ Customizable Model Sensitivity
Teachers are now in full control of the AI's behavior:
- **Blocking Sensitivity**: Set how strict the model should be when blocking messages (10% - 100%).
- **Reporting Sensitivity**: Configure the threshold for flagging suspicious content for review.
- **Defaults**: Tuned for optimal safety (10% Blocking, 90% Reporting).

### 🛡️ Role-Based Interface
- **student View**: Simplified interface hiding all administrative settings (Streaming, Data, Filtering). Students only see Language options.
- **Teacher View**: Full control panel with automatic setting synchronization to all connected students.

### 📋 Enhanced List Management
- **Good List (Whitelist)**: Explicitly allow safe words that might otherwise be flagged.
- **Blacklist (Forbidden)**: Add custom words to be blocked instantly.
- **Data Portability**: Import and Export both lists as JSON files to share between classrooms.

### ⚡ Performance & Privacy
- **Memory-Only Logs**: Application logs are now stored in RAM and automatically cleared when the app closes, ensuring privacy and reducing disk usage.
- **Optimized MobileBERT**: The Deep Learning model is optimized for minimal resource usage while maintaining high accuracy.

---

# Release Notes - v6.7.0

## 🚀 New Features

### 🧠 Deep Learning Profanity Filter (NEW)
Experience the next level of classroom moderation with our context-aware AI.
- **Transformers.js Integration**: Uses state-of-the-art Deep Learning (`toxic-bert`) to detect toxicity, insults, and harassment with high accuracy.
- **Tiered Response System**: 
  - **Auto-Block**: Messages with >90% toxicity are automatically blocked.
  - **Self-Learning**: Suspicious words from blocked messages are automatically extracted and added to the blacklist.
  - **Teacher Reporting**: Borderline messages (60-90%) are flagged for teacher review in the report panel.
- **Dynamic Loading**: The AI model (~108MB) is loaded on-demand with a visual progress bar, ensuring the app remains lightweight when the filter is not in use.

### 🛡️ Enhanced Moderation & Training
- **Naive Bayes Refinement**: Improved the core "Advanced" filter with better Greek/English training data and batch processing (2 words at a time).
- **Safe State Management**: The application now prevents closure during active AI training cycles to protect your model's data integrity.
- **Greek Localization**: Full Greek translations for all new AI settings and notifications.

### 🐛 Bug Fixes
- **Socket Callbacks**: Fixed a critical "callback is not a function" error that could crash the server when specific settings were changed.
- **UI Consistency**: Fixed the hamburger menu behavior and sidebar overlay to remain consistent across desktop and mobile views.

---

# Release Notes - v6.5.0

## 🚀 Improvements & Fixes

### 📺 Optimized Streaming (NEW)
Experience smoother screen sharing with significantly reduced delay.
- **Latency Optimization**: Disabled forced VP9 codec in favor of more efficient defaults (VP8/H.264), reducing CPU load and lag.
- **Adaptive Bitrates**: Tuned streaming bitrates for different network conditions (Auto/WiFi) to minimize buffering and drops.

### ⚙️ Enhanced Settings & Diagnostics (NEW)
New tools for teachers to manage the classroom and debug issues.
- **Session Logs**: Teachers can now view, copy, and download real-time application logs directly from the "Advanced" settings section.
- **Blacklist Portability**: Added ability to **Import** and **Export** the custom forbidden words list (JSON format) for easy backup or sharing between classes.

### 🐛 Critical Bug Fixes
- **Server Stability**: Fixed a critical `EPIPE` error that could cause the server to crash when logging output in certain environments.

---

# Release Notes - v6.2.0

## 🚀 New Features

### 💾 Smart Persistence (NEW)
Your information is now remembered for a smoother experience.
- **Auto-Fill Class Setup**: Class ID and Your Name are saved and automatically pre-filled when you return to the setup screen.
- **Language Sync**: When a teacher changes the interface language, it automatically updates for all students in the class instantly.
- **Clear Data**: A new "Clear Saved Data" option in Settings lets you easily wipe stored credentials.

###  File Pinning (NEW)
Keep important documents front and center.
- **Pin Files**: Teachers can now pin important files in the Media Library. Pinned files appear at the top of the list with a highlighted border and pin icon.
- **Visual Indicators**: Clear visual distinction for pinned vs. regular files.

### 🖐️ Enhanced Status Visibility (NEW)
Better awareness of classroom state for everyone.
- **Visible Status Icons**: Students can now see who has their hand raised (🖐️) and who is blocked (🔇) directly in the user list.
- **Improved Feedback**: Users now see a "🔒 Blocked" status when the teacher has blocked all users, even if no students are currently in the class.

## 🐛 Bug Fixes
- **Hamburger Menu**: Fixed an issue where the dark overlay would incorrectly cover header buttons on some screens.
- **Overlay Behavior**: The menu overlay now only appears on mobile/tablet screens where the sidebar slides over content, and stays hidden on desktop.

---

# Release Notes - v6.1.0

## 🚀 New Features

### 🎨 Improved UI & Tablet Support (NEW)
- **Tablet Optimization**: The sidebar is now collapsible on all devices (including desktop and tablet) via the hamburger menu (`☰`).
- **Responsive Layout**: Fixed layout issues ("squished" view) when video is active.
- **Enhanced Video Controls**: Zoom, Fullscreen, and Minimize controls are now always visible and easier to use in the video modal.
- **Pan & Drag**: When zoomed in on a screen share, you can now click and drag to move the video around.

---
