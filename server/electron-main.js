const { app, BrowserWindow, Tray, Menu, shell, ipcMain, desktopCapturer } = require('electron');
const path = require('path');

const fs = require('fs');
const os = require('os');
const { exec, execSync } = require('child_process');

// --- INSTALL MODE ---
// Written to HKLM\SOFTWARE\ClassSend\Mode by the installer (Teacher / Student).
// Can also be overridden in classsend.conf via the 'role' key.
// Defaults to 'teacher' in dev / if the key is missing.
function getInstallMode() {
    // classsend.conf takes priority if explicitly set (not the default 'teacher')
    const confRole = installConfig.get('role', null);

    try {
        const out = execSync(
            'reg query "HKLM\\SOFTWARE\\ClassSend" /v Mode',
            { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }
        );
        const regRole = out.toLowerCase().includes('student') ? 'student' : 'teacher';
        // conf file wins if it explicitly says 'student'
        if (confRole === 'student') return 'student';
        return regRole;
    } catch {
        // No registry key – use conf file value or default to 'teacher'
        if (confRole === 'student') return 'student';
        return 'teacher';
    }
}


// Set USER_DATA_PATH for the server to use (Must be before requiring index.js)
// This ensures we write to a writable location (e.g. ~/.config/...) instead of the read-only AppImage mount
// app.getPath('userData') is only available after app is ready or in main process, but we need it for top-level requires if they run immediately.
// Actually, app.getPath is available immediately in main process.
if (app) {
    process.env.USER_DATA_PATH = app.getPath('userData');

    // Resolve classsend.conf path before any require() reads it via install-config.js
    if (app.isPackaged) {
        // Packaged: lives in resources/ next to the exe (added via extraResources)
        process.env.INSTALL_CONFIG_PATH = path.join(process.resourcesPath, 'classsend.conf');
    } else {
        // Dev: project root, one level above server/
        process.env.INSTALL_CONFIG_PATH = path.join(__dirname, '..', 'classsend.conf');
    }
}

// --- CRASH REPORTING & LOGGING ---
// installConfig is loaded FIRST so that logging can be initialised before configManager.
// If the app won't open, set  auto_export_logs = true  (and optionally enable_logging = true)
// in classsend.conf, restart, then check ~/classSendReport.txt for the startup error.
const installConfig = require('./install-config');

// configManager is intentionally loaded AFTER logging is set up so that any error
// during its initialisation is captured in the log file.
let configManager = null;

const logFilePath = path.join(app.getPath('home'), 'classSendReport.txt');

// Initialise the log file immediately from classsend.conf (configManager not ready yet)
try {
    if (installConfig.get('auto_export_logs', false)) {
        const sessionHeader = `=== ClassSend Session Started: ${new Date().toISOString()} ===\n`;
        fs.writeFileSync(logFilePath, sessionHeader);
    }
} catch (e) {
    // Ignore permission errors
}

function logToFile(type, args) {
    // Use runtime configManager once available; fall back to installConfig during early startup
    const exportLogs = configManager
        ? configManager.get('autoExportLogs')
        : installConfig.get('auto_export_logs', false);
    if (!exportLogs) return;

    try {
        const message = args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        fs.appendFileSync(logFilePath, `[${new Date().toISOString()}] [${type}] ${message}\n`);
    } catch (e) {
        // Fallback
    }
}

// Override console methods to log to file
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = (...args) => {
    logToFile('INFO', args);
    originalLog.apply(console, args);
};

console.error = (...args) => {
    logToFile('ERROR', args);
    originalError.apply(console, args);
};

console.warn = (...args) => {
    logToFile('WARN', args);
    originalWarn.apply(console, args);
};

// Register crash handlers BEFORE loading configManager so startup errors are always captured
process.on('uncaughtException', (err) => {
    const stack = err?.stack || String(err);
    logToFile('FATAL', ['UNCAUGHT EXCEPTION:', stack]);
    originalError.apply(console, ['UNCAUGHT EXCEPTION:', err]);
});

process.on('unhandledRejection', (reason) => {
    const detail = reason?.stack || String(reason);
    logToFile('FATAL', ['UNHANDLED REJECTION:', detail]);
    originalError.apply(console, ['UNHANDLED REJECTION:', reason]);
});

// Load configManager — any error here is now captured by the handlers above
configManager = require('./config-manager');
// --------------------------------

// Disable hardware acceleration to prevent GPU process crashes on Linux
// Only disable on Linux — disabling on Windows causes software rendering which
// breaks window focus/click handling on some systems.
if (process.platform === 'linux') {
    app.disableHardwareAcceleration();
}

// Ignore certificate errors for self-signed certificates (development only)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {

    // Only for localhost
    if (url.startsWith('https://localhost')) {
        event.preventDefault();
        callback(true); // Trust the certificate
    } else {
        callback(false);
    }
});

// Server import moved to startServer function to avoid blocking startup
let serverInstance;
let stopServerFunc;
let getTrainingStatusFunc;

let mainWindow;
let tray;
let isQuitting = false;

function startAppServer() {
    console.log("Starting server...");
    // Wrap in setTimeout(0) to allow current event loop to finish (rendering splash)
    setTimeout(() => {
        try {
            console.log("Loading server module...");
            const { server, stopServer, getTrainingStatus } = require('./index.js');
            // Store references
            serverInstance = server;
            stopServerFunc = stopServer;
            getTrainingStatusFunc = getTrainingStatus;

            console.log("Server module loaded.");
        } catch (err) {
            console.error("Failed to start server:", err);
            // Show error dialog
            const { dialog } = require('electron');
            dialog.showErrorBox("Startup Error", "Failed to start the server:\n" + err.message);
        }
    }, 10);
}

const net = require('net');

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    const virtualKeywords = ['virtual', 'vmware', 'vbox', 'hyperv', 'vethernet', 'wsl', 'loopback', 'docker', 'radmin', 'vpn', 'hamachi'];

    for (const name of Object.keys(interfaces)) {
        const lowerName = name.toLowerCase();
        if (virtualKeywords.some(keyword => lowerName.includes(keyword))) continue;

        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                if (iface.address.startsWith('169.254.')) continue;
                return iface.address;
            }
        }
    }
    return null;
}

function checkServerReady(port) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        client.setTimeout(1000);
        client.once('connect', () => {
            client.destroy();
            resolve(true);
        });
        client.once('error', (err) => {
            client.destroy();
            reject(err);
        });
        client.once('timeout', () => {
            client.destroy();
            reject(new Error('Timeout'));
        });
        client.connect(port, '127.0.0.1');
    });
}


async function pollServer(port, retries = 30, interval = 500) {
    for (let i = 0; i < retries; i++) {
        try {
            await checkServerReady(port);
            return true;
        } catch (err) {
            console.log(`Waiting for server on port ${port}... (${i + 1}/${retries})`);
            await new Promise(resolve => setTimeout(resolve, interval));
        }
    }
    return false;
}

function createWindow() {
    let iconFilename = 'icon.ico';
    if (process.platform === 'linux' || process.platform === 'darwin') {
        iconFilename = 'tray.png';
    }
    const iconPath = path.join(__dirname, 'assets', iconFilename);

    const isHiddenStartup = process.argv.includes('--hidden');

    let splashWindow = null;
    if (!isHiddenStartup) {
        // Create splash screen first
        splashWindow = new BrowserWindow({
            width: 450,
            height: 450,
            frame: false,
            transparent: true,
            alwaysOnTop: true,
            skipTaskbar: true,
            resizable: false,
            icon: iconPath,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
            },
        });

        splashWindow.loadFile(path.join(__dirname, 'splash.html'));
        splashWindow.center();
    }

    // Initialize server AFTER showing splash screen
    // Increased delay to ensure splash renders before heavy lifting
    setTimeout(() => {
        startAppServer();
    }, 500);

    // Create main window (hidden initially)
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: iconPath,
        show: false, // Don't show until ready
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webviewTag: true,
            preload: path.join(__dirname, 'preload.js')
        },
        backgroundColor: '#0f172a'
    });

    // Load URL with Polling Mechanism to prevent crash
    const port = installConfig.get('port', 3000);
    process.env.PORT = String(port); // pass to index.js via env
    const protocol = process.env.USE_TLS === 'true' ? 'https' : 'http';
    const serverUrl = `${protocol}://localhost:${port}`;

    // Poll for server readiness AND valid LAN IP
    const startTime = Date.now();
    const timeout = 30000; // 30 seconds as requested

    async function waitForStartup() {
        while (Date.now() - startTime < timeout) {
            const hasIP = !!getLocalIP();
            let serverReady = false;
            try {
                serverReady = await checkServerReady(port);
            } catch (e) { }

            if (serverReady && hasIP) {
                console.log(`Startup successful. IP: ${getLocalIP()}. Loading window.`);
                mainWindow.loadURL(serverUrl);
                return;
            }

            // Update splash status
            if (splashWindow && !splashWindow.isDestroyed()) {
                let status = "Starting...";
                if (!serverReady) status = "Waiting for local server...";
                else if (!hasIP) status = "Waiting for network (WiFi/LAN)...";

                splashWindow.webContents.executeJavaScript(`
                    const el = document.querySelector('.status-text');
                    if (el) el.textContent = "${status}";
                `).catch(() => { });
            }

            console.log(`Waiting for startup (Server: ${serverReady}, IP: ${hasIP})...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.error("Startup timeout reached. No network or server found.");
        if (!isHiddenStartup) {
            const { dialog } = require('electron');
            // Instead of just quitting, restart as requested
            console.log("Restarting app after 30s failure...");
            app.relaunch();
            app.exit(0);
        } else {
            app.quit();
        }
    }

    waitForStartup().catch(err => console.error("Startup polling error:", err));

    // Handle load failures
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.error(`Failed to load: ${validatedURL} (${errorCode}: ${errorDescription})`);
        // If it's our server URL, show error page
        if (validatedURL.startsWith(serverUrl)) {
            mainWindow.loadFile(path.join(__dirname, 'error.html'));
            mainWindow.show();
        }
    });


    // When main window is ready, close splash and show main
    mainWindow.once('ready-to-show', () => {
        setTimeout(() => {
            if (splashWindow && !splashWindow.isDestroyed()) {
                splashWindow.close();
            }
            if (!isHiddenStartup) {
                mainWindow.show();
                mainWindow.focus();
            }
            restoreInternetBlockingState();
            if (configManager.get('autoRestartOnUnresponsive')) {
                applyAutoRestartSetting(true);
            }
        }, 500);
    });

    // Re-focus whenever the window is shown (e.g. restored from tray, un-hidden).
    // On Windows with software rendering disabled, show() alone may not give input focus.
    mainWindow.on('show', () => {
        mainWindow.focus();
    });

    // ===== RENDERER WATCHDOG =====
    // Electron fires 'unresponsive' when the renderer process stops responding to input
    // (the same frozen state that Ctrl+R fixes manually). Auto-reload to recover.
    mainWindow.webContents.on('unresponsive', () => {
        console.warn('[Watchdog] Renderer became unresponsive — reloading automatically.');
        mainWindow.webContents.reload();
    });
    mainWindow.webContents.on('responsive', () => {
        console.log('[Watchdog] Renderer is responsive again.');
    });

    // Intercept window.open calls (e.g. for mailto links)
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('mailto:')) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        // For everything else, behave as normal (allow new window)
        return { action: 'allow' };
    });

    // Hide the menu bar (User request) - handled by autoHideMenuBar: true
    // mainWindow.setMenu(null);


    mainWindow.on('close', async (event) => {
        if (isQuitting) return;

        // Check if training is in progress
        if (getTrainingStatusFunc && getTrainingStatusFunc()) {
            event.preventDefault();
            const { dialog } = require('electron');
            const choice = await dialog.showMessageBox(mainWindow, {
                type: 'warning',
                buttons: ['Wait', 'Abandon & Close'],
                title: 'AI Training in Progress',
                message: 'The AI is currently retraining with new data.',
                detail: 'Closing now might result in data loss or incomplete training. Please wait ~3 seconds.',
                defaultId: 0,
                cancelId: 0
            });

            if (choice.response === 1) { // Abandon
                isQuitting = true;
                app.quit();
            }
            return;
        }

        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
            return false;
        }
    });

    // Handle screen sharing permissions
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'media') {
            return callback(true);
        }
        if (permission === 'display-capture') {
            return callback(true);
        }
        callback(false);
    });

    // Handle getDisplayMedia() in Electron - required for screen sharing to work
    mainWindow.webContents.session.setDisplayMediaRequestHandler(async (request, callback) => {
        try {
            const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
            if (sources.length > 0) {
                // Pick the first screen source automatically
                callback({ video: sources[0] });
            } else {
                callback(null);
            }
        } catch (err) {
            console.error('Error getting display sources:', err);
            callback(null);
        }
    });

    // Lock Screen State
    let lockWindow = null;
    let lockIntervalId = null;

    // Custom Lock Screen Overlay + Repeat System Lock
    ipcMain.handle('lock-screen', async (event, lockStrings) => {
        try {
            const strings = lockStrings || {
                title: "LOCKED OUT",
                message: "Your computer has been temporarily locked by the teacher.",
                footer: "Please remain at your seat and wait for further instructions.",
                status: "Security Protocol Active"
            };

            // 1. Create fullscreen always-on-top overlay window
            if (!lockWindow || lockWindow.isDestroyed()) {
                lockWindow = new BrowserWindow({
                    fullscreen: true,
                    alwaysOnTop: true,
                    frame: false,
                    skipTaskbar: true,
                    resizable: false,
                    movable: false,
                    closable: false,
                    focusable: true,
                    kiosk: true,
                    webPreferences: {
                        devTools: false,
                        nodeIntegration: false,
                    }
                });

                const lockHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; user-select: none; }
  body {
    background: radial-gradient(circle at center, #1e0505 0%, #050505 100%);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    height: 100vh; width: 100vw;
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    color: white; overflow: hidden;
  }
  .glass-card {
    background: rgba(255, 255, 255, 0.03);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 68, 68, 0.1);
    padding: 60px;
    border-radius: 24px;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    max-width: 600px;
    text-align: center;
  }
  .lock-icon { 
    font-size: 80px; 
    margin-bottom: 30px; 
    filter: drop-shadow(0 0 15px rgba(255, 68, 68, 0.4));
    animation: heartbeat 2s ease-in-out infinite; 
  }
  h1 { 
    font-size: 3rem; 
    font-weight: 800; 
    color: #ff4444; 
    margin-bottom: 12px; 
    letter-spacing: -0.02em;
    text-shadow: 0 0 20px rgba(255, 68, 68, 0.3);
  }
  p { font-size: 1.25rem; color: rgba(255,255,255,0.7); margin-top: 12px; line-height: 1.6; }
  .status-tag {
    background: rgba(255, 68, 68, 0.1);
    color: #ff4444;
    padding: 8px 16px;
    border-radius: 100px;
    font-size: 0.9rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 24px;
    border: 1px solid rgba(255, 68, 68, 0.2);
  }
  .divider { width: 60px; height: 4px; background: #ff4444; margin: 24px 0; border-radius: 4px; opacity: 0.6; }
  @keyframes heartbeat {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.05); opacity: 0.8; }
  }
</style>
</head><body>
  <div class="glass-card">
    <div class="status-tag">${strings.status}</div>
    <div class="lock-icon">🔒</div>
    <h1>${strings.title}</h1>
    <div class="divider"></div>
    <p>${strings.message}</p>
    <p style="font-size: 1rem; opacity: 0.5;">${strings.footer}</p>
  </div>
<script>
  // Block all keyboard shortcuts and interactions
  document.addEventListener('keydown', e => {
      // Allow nothing
      e.preventDefault();
      return false;
  }, true);
  document.addEventListener('contextmenu', e => e.preventDefault(), true);
  // Periodically force focus
  setInterval(() => { window.focus(); }, 500);
</script>
</body></html>`;

                lockWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(lockHtml));
                lockWindow.setAlwaysOnTop(true, 'screen-saver', 1);
                lockWindow.focus();

                console.log('[Lock Screen] Custom overlay window created with translations');
            }

            // 2. Also trigger system LockWorkStation every 5 seconds as unbypassable fallback
            if (!lockIntervalId) {
                const lockSystem = () => exec('rundll32.exe user32.dll,LockWorkStation');
                lockSystem(); // immediate first lock
                lockIntervalId = setInterval(lockSystem, 5000);
                console.log('[Lock Screen] Repeat system lock started (every 5s)');
            }

            return { success: true };
        } catch (err) {
            console.error('[Lock Screen] Error:', err);
            return { success: false, error: err.message };
        }
    });

    // Unlock Screen
    ipcMain.handle('unlock-screen', () => {
        if (lockIntervalId) {
            clearInterval(lockIntervalId);
            lockIntervalId = null;
            console.log('[Lock Screen] Repeat system lock stopped');
        }
        if (lockWindow && !lockWindow.isDestroyed()) {
            lockWindow.destroy();
            lockWindow = null;
            console.log('[Lock Screen] Overlay window closed');
        }
        // Restore focus to the main window after the lock overlay is removed.
        // On Windows, destroying a kiosk/alwaysOnTop window can leave the main
        // window visible but unresponsive to clicks until explicitly focused.
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.focus();
        }
        return { success: true };
    });

    // Windows End of Day Shutdown
    ipcMain.handle('shutdown-pc', async () => {
        return new Promise((resolve) => {
            // Shutdown immediately
            exec('shutdown /s /t 0', (error) => {
                if (error) {
                    console.error('Failed to shutdown PC:', error);
                    resolve({ success: false, error: error.message });
                } else {
                    resolve({ success: true });
                }
            });
        });
    });

    // Bring Window to Focus and Maximize
    ipcMain.handle('focus-window', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            // Force maximize to fill space
            mainWindow.setFullScreen(false); // ensured we aren't in kiosk/fullscreen first
            mainWindow.maximize();
            mainWindow.focus();
            mainWindow.setAlwaysOnTop(true);
            setTimeout(() => {
                mainWindow.setAlwaysOnTop(false);
            }, 1500);
            return { success: true };
        }
        return { success: false, error: "Window not found" };
    });

    // Close all user-facing applications except ClassSend
    ipcMain.handle('close-all-apps', () => {
        return new Promise((resolve) => {
            // Get ClassSend's own PID so we can exclude it
            const selfPid = process.pid;
            // Use taskkill to kill all user processes except system and ClassSend
            // /F = force, /T = include child processes
            // We enumerate visible windows via a PowerShell one-liner and kill their owning processes
            const ps = `
$selfPid = ${selfPid};
Get-Process | Where-Object {
    $_.MainWindowHandle -ne 0 -and
    $_.Id -ne $selfPid -and
    $_.Id -ne (Get-Process -Id $selfPid -ErrorAction SilentlyContinue).Parent.Id -and
    $_.Name -notmatch '^(explorer|dwm|winlogon|csrss|wininit|services|lsass|svchost|taskhostw|RuntimeBroker|SystemSettings|ShellExperienceHost|SearchUI|StartMenuExperienceHost|TextInputHost|ctfmon|sihost)$'
} | ForEach-Object {
    try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch {}
}
`.trim();
            exec(`powershell -NoProfile -NonInteractive -Command "${ps.replace(/\n/g, ' ')}"`, (error) => {
                if (error) {
                    console.error('[Close All Apps] Error:', error.message);
                    resolve({ success: false, error: error.message });
                } else {
                    console.log('[Close All Apps] Completed');
                    resolve({ success: true });
                }
            });
        });
    });

    // Toggle Internet via Windows Registry (Proxy Method)
    // Accepts either a boolean (legacy) or { disable, whitelist[] } object
    ipcMain.handle('toggle-internet', async (event, data) => {
        return new Promise((resolve) => {
            let disable, whitelist = [];
            if (typeof data === 'boolean') {
                disable = data;
            } else if (data && typeof data === 'object') {
                disable = data.disable;
                whitelist = Array.isArray(data.whitelist) ? data.whitelist : [];
            }

            let cmd = '';
            if (disable) {
                // Build ProxyOverride: <local> + whitelisted domains and their subdomains
                let proxyOverride = '<local>';
                whitelist.forEach(entry => {
                    let d = entry.toLowerCase().trim()
                        .replace(/^https?:\/\//i, '')
                        .replace(/\/.*$/, '')
                        .replace(/\*\./g, '');
                    if (d) proxyOverride += `;${d};*.${d}`;
                });
                cmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 1 /f && reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer /t REG_SZ /d "127.0.0.1:81" /f && reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyOverride /t REG_SZ /d "${proxyOverride}" /f`;
            } else {
                // Disable the proxy
                cmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f`;
            }

            console.log(`[Toggle Internet] Executing (whitelist: ${whitelist.length} entries)`);
            exec(cmd, (error) => {
                if (error) {
                    console.error('[Toggle Internet] Error:', error.message);
                    resolve({ success: false, error: error.message });
                } else {
                    console.log(`[Toggle Internet] Successfully ${disable ? 'disabled' : 'enabled'} internet`);
                    resolve({ success: true });
                }
            });
        });
    });

    // Get URL whitelist settings (persisted on teacher's machine)
    ipcMain.handle('get-url-whitelist', async () => {
        return configManager.get('urlWhitelist') || { enabled: false, whitelist: [] };
    });

    // Save URL whitelist settings
    ipcMain.handle('save-url-whitelist', async (event, { enabled, whitelist }) => {
        configManager.set('urlWhitelist', { enabled, whitelist: Array.isArray(whitelist) ? whitelist : [] });
        return { success: true };
    });

    // Save internet blocking persistence preference (pushed from teacher to students)
    ipcMain.handle('set-internet-persist', async (event, { persist }) => {
        configManager.set('persistInternetBlock', !!persist);
        console.log(`[InternetPersist] Saved persistInternetBlock = ${!!persist}`);
        return { success: true };
    });

    // Auto-restart on unresponsive setting
    ipcMain.handle('get-auto-restart', () => {
        return { enabled: !!configManager.get('autoRestartOnUnresponsive') };
    });

    ipcMain.handle('set-auto-restart', async (event, { enabled }) => {
        configManager.set('autoRestartOnUnresponsive', !!enabled);
        applyAutoRestartSetting(!!enabled);
        return { success: true };
    });

    // Restore internet blocking state on startup
    function restoreInternetBlockingState() {
        const saved = configManager.get('urlWhitelist');
        if (!saved || !saved.enabled) return;
        // Honour the teacher's persistence preference (defaults to true for backward compat)
        const persist = configManager.get('persistInternetBlock') !== false;
        if (!persist) {
            console.log('[Startup] Internet blocking NOT restored — persistence is disabled by teacher.');
            return;
        }
        const whitelist = Array.isArray(saved.whitelist) ? saved.whitelist : [];
        let proxyOverride = '<local>';
        whitelist.forEach(entry => {
            let d = entry.toLowerCase().trim()
                .replace(/^https?:\/\//i, '')
                .replace(/\/.*$/, '')
                .replace(/\*\./g, '');
            if (d) proxyOverride += `;${d};*.${d}`;
        });
        const cmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 1 /f && reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer /t REG_SZ /d "127.0.0.1:81" /f && reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyOverride /t REG_SZ /d "${proxyOverride}" /f`;
        exec(cmd, (error) => {
            if (error) {
                console.error('[Startup] Failed to restore internet blocking:', error.message);
            } else {
                console.log(`[Startup] Internet blocking restored (${whitelist.length} whitelist entries)`);
            }
        });
    }

    // Register (or unregister) the app with Windows Error Reporting so that
    // Windows automatically restarts it when it is terminated as unresponsive.
    // Uses PowerShell -EncodedCommand to call RegisterApplicationRestart via P/Invoke
    // with no shell-escaping issues.
    function applyAutoRestartSetting(enable) {
        if (process.platform !== 'win32') return;
        try {
            const typeDef = 'using System; using System.Runtime.InteropServices; ' +
                'public class WinRestart { ' +
                '[DllImport("kernel32.dll", CharSet = CharSet.Unicode)] ' +
                'public static extern uint RegisterApplicationRestart(string c, uint f); ' +
                '[DllImport("kernel32.dll")] ' +
                'public static extern uint UnregisterApplicationRestart(); }';
            const call = enable
                ? '[WinRestart]::RegisterApplicationRestart("", 0)'
                : '[WinRestart]::UnregisterApplicationRestart()';
            const psScript = `Add-Type -TypeDefinition '${typeDef}'\n${call}`;
            const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
            execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, {
                timeout: 15000, windowsHide: true
            });
            console.log(`[AutoRestart] RegisterApplicationRestart: ${enable}`);
        } catch (err) {
            console.error('[AutoRestart] Failed to apply restart registration:', err.message);
        }
    }

    // Helper function to resolve paths with environment variables and wildcards
    function resolveRobustPath(p) {
        if (!p) return p;

        // 1. Expand environment variables (case-insensitive lookup)
        let resolved = p.replace(/%([^%]+)%/g, (_, name) => {
            const upperName = name.toUpperCase();
            // Try specific case first, then fall back to case-insensitive search
            if (process.env[name]) return process.env[name];

            const envKey = Object.keys(process.env).find(k => k.toUpperCase() === upperName);
            return envKey ? process.env[envKey] : `%${name}%`;
        });

        // 2. Handle Wildcards for directories (e.g., SuperTuxKart*)
        if (resolved.includes('*')) {
            try {
                const parts = resolved.split(/[\\/]/);
                let current = '';

                for (let i = 0; i < parts.length; i++) {
                    const part = parts[i];
                    if (i === 0 && part.includes(':')) {
                        current = part + (part.endsWith('\\') ? '' : '\\');
                        continue;
                    }

                    if (part.includes('*')) {
                        const pattern = new RegExp('^' + part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
                        const entries = fs.readdirSync(current);
                        const match = entries.find(e => pattern.test(e));
                        if (match) {
                            current = path.join(current, match);
                        } else {
                            current = path.join(current, part);
                        }
                    } else {
                        current = current ? path.join(current, part) : part;
                    }
                }
                resolved = current;
            } catch (e) {
                console.error(`[AppLaunch] Wildcard resolution failed for ${resolved}:`, e);
            }
        }

        return resolved;
    }

    // Get Hostname for monitoring display
    ipcMain.handle('get-hostname', () => {
        return os.hostname();
    });

    // Get install mode so the frontend knows which UI to show
    ipcMain.handle('get-install-mode', () => {
        return getInstallMode();
    });


    // ===== REMOTE APP LAUNCH =====
    ipcMain.handle('launch-app', async (event, { command }) => {
        try {
            if (!command) return { success: false, error: 'No command provided' };

            let trimmedCmd = command.trim();
            let isUrl = /^(https?|ftp):\/\//i.test(trimmedCmd);

            if (!isUrl && !trimmedCmd.toLowerCase().endsWith('.exe') && !trimmedCmd.includes('\\') && trimmedCmd.includes('.')) {
                isUrl = true;
                trimmedCmd = 'http://' + trimmedCmd;
            }

            if (isUrl) {
                await shell.openExternal(trimmedCmd);
                console.log(`[AppLaunch] Opened URL: ${trimmedCmd}`);
                return { success: true, type: 'url' };
            }

            // Architecture-specific paths split by |
            let execPath = trimmedCmd;
            let fallbackPath = null;
            if (trimmedCmd.includes('|')) {
                const parts = trimmedCmd.split('|');
                execPath = parts[0].trim();
                fallbackPath = parts[1].trim();
            }

            const is64bit = os.arch() === 'x64' || os.arch() === 'arm64';
            let rawPath = is64bit ? execPath : (fallbackPath || execPath);
            let chosenPath = resolveRobustPath(rawPath);

            // If primary not found, try fallback
            if (fallbackPath && !fs.existsSync(chosenPath)) {
                let resolvedFallback = resolveRobustPath(fallbackPath);
                if (fs.existsSync(resolvedFallback)) {
                    console.log(`[AppLaunch] Primary not found, using fallback: ${resolvedFallback}`);
                    chosenPath = resolvedFallback;
                }
            }

            // EXECUTION
            if (fs.existsSync(chosenPath)) {
                // If it's a literal file path, use shell.openPath (more robust for Electron)
                console.log(`[AppLaunch] Launching file path: ${chosenPath}`);
                const error = await shell.openPath(chosenPath);
                if (error) {
                    console.error(`[AppLaunch] shell.openPath failed: ${error}`);
                    // Fallback to exec if shell failed
                    exec(`"${chosenPath}"`);
                }
                return { success: true, type: 'exe', method: 'shell', path: chosenPath };
            } else {
                // If not found as file, it might be in PATH (like 'mspaint' or 'calc')
                // Run WITHOUT quotes if it's a single word/no path separators
                const shouldQuote = chosenPath.includes(' ') || chosenPath.includes('\\') || chosenPath.includes('/');
                const finalCmd = shouldQuote ? `"${chosenPath}"` : chosenPath;

                console.log(`[AppLaunch] Launching command: ${finalCmd}`);
                exec(finalCmd, (err) => {
                    if (err) console.error(`[AppLaunch] exec failed for ${finalCmd}:`, err);
                });
                return { success: true, type: 'exe', method: 'exec', path: chosenPath };
            }
        } catch (err) {
            console.error('[AppLaunch] Error:', err);
            return { success: false, error: err.message };
        }
    });

    // Auto-download file creation
    ipcMain.handle('auto-download', async (event, { url, filename, customPath, openAfter }) => {
        try {
            const https = require('https');
            const http = require('http');

            let destFolder = path.join(os.homedir(), 'Downloads');
            if (customPath && customPath.trim() !== '') {
                // Resolve Keywords
                if (customPath === '[Desktop]') {
                    destFolder = path.join(os.homedir(), 'Desktop');
                } else if (customPath === '[Documents]') {
                    destFolder = path.join(os.homedir(), 'Documents');
                } else if (customPath === '[Downloads]') {
                    destFolder = path.join(os.homedir(), 'Downloads');
                } else if (!path.isAbsolute(customPath)) {
                    // Resolve custom path relative to home dir if it doesn't look absolute
                    destFolder = path.join(os.homedir(), customPath);
                } else {
                    destFolder = customPath;
                }
            }

            // Ensure destination folder exists recursively
            if (!fs.existsSync(destFolder)) {
                fs.mkdirSync(destFolder, { recursive: true });
            }

            const destPath = path.join(destFolder, filename);
            const fileStream = fs.createWriteStream(destPath);
            const protocol = url.startsWith('https') ? https : http;

            return new Promise((resolve) => {
                protocol.get(url, (response) => {
                    response.pipe(fileStream);
                    fileStream.on('finish', () => {
                        fileStream.close();
                        if (openAfter) {
                            console.log(`[Auto-Download] Opening file: ${destPath}`);
                            shell.openPath(destPath);
                        }
                        resolve({ success: true, path: destPath });
                    });
                }).on('error', (err) => {
                    fs.unlink(destPath, () => { }); // delete partial
                    resolve({ success: false, error: err.message });
                });
            });
        } catch (err) {
            console.error('Auto-download failed:', err);
            return { success: false, error: err.message };
        }
    });


    // Handle silent screen capture for monitoring feature
    ipcMain.handle('capture-screen', async (event, options) => {
        try {
            const { quality = 'low' } = options || {};

            // Resolution table
            const resolutions = {
                'verylow': { width: 160,  height: 90   },
                'low':     { width: 320,  height: 180  },
                '1080p':   { width: 1920, height: 1080 },
                '1440p':   { width: 2560, height: 1440 },
                '4k':      { width: 3840, height: 2160 },
            };

            // Map 'low'/'high' from the frontend to the configured resolution names
            let resName;
            if (quality === 'low') {
                resName = configManager.get('screenCaptureQuality') || 'low';
            } else {
                // 'high' or any explicit name ('1080p', '1440p', '4k')
                resName = (quality === 'high')
                    ? (configManager.get('screenCaptureHiresQuality') || '1080p')
                    : quality;
            }
            const { width, height } = resolutions[resName] || resolutions['1080p'];

            // Mbit/s → JPEG quality (0–100). Higher = sharper, larger payload.
            const mbit = configManager.get('screenCaptureSpeedMbit') || 16;
            const mbitToJpeg = { 8: 25, 16: 50, 32: 72, 64: 88 };
            const jpegQuality = mbitToJpeg[mbit] ?? 50;

            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: { width, height }
            });

            if (sources.length > 0) {
                const buf = sources[0].thumbnail.toJPEG(jpegQuality);
                return 'data:image/jpeg;base64,' + buf.toString('base64');
            }
            return null;
        } catch (err) {
            console.error('Failed to capture screen:', err);
            return null;
        }
    });
}

function createTray() {
    try {
        let iconFilename = 'icon.ico';
        if (process.platform === 'linux' || process.platform === 'darwin') {
            iconFilename = 'tray.png';
        }

        const iconPath = path.join(__dirname, 'assets', iconFilename);
        console.log(`Creating tray with icon: ${iconPath} `);
        const icon = require('electron').nativeImage.createFromPath(iconPath);

        if (icon.isEmpty()) {
            console.warn(`Tray icon is empty or invalid format: ${iconPath} `);
        }

        tray = new Tray(icon);
        tray.setToolTip('ClassSend Server');

        // Double-click to show window
        tray.on('double-click', () => {
            if (mainWindow) {
                mainWindow.show();
                mainWindow.focus();
            } else {
                createWindow();
            }
        });

    } catch (error) {
        console.error("Failed to create tray:", error);
    }
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });

    app.whenReady().then(() => {
        const installMode = getInstallMode();
        console.log(`[Mode] Running as: ${installMode}`);

        // In packaged (installed) builds the NSIS installer already registered a
        // Scheduled Task that starts the app elevated at login — no UAC popup.
        // Only fall back to the registry Run key in dev / unpackaged mode.
        if (!app.isPackaged && !configManager.get('startupConfigured')) {
            app.setLoginItemSettings({
                openAtLogin: true,
                args: ['--hidden']
            });
            configManager.set('startupConfigured', true);
        }

        createWindow();
        createTray();

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                createWindow();
            }
        });
    });
}

app.on('window-all-closed', () => {
    // On macOS, keep app running in tray until explicit quit
    if (process.platform !== 'darwin') {
        // For now, we want to keep it running in tray for other platforms too
        // unless explicitly quit. 
        // If you want it to close when window closes, uncomment app.quit()
    }
});

app.on('before-quit', async (event) => {
    // Prevent multiple calls
    if (isQuitting && !mainWindow) return;

    console.log('App is quitting, cleaning up...');
    isQuitting = true;

    // Attempt to stop server gracefully
    try {
        if (stopServerFunc) await stopServerFunc();
        console.log('Server stopped successfully');
    } catch (error) {
        console.error('Error stopping server during quit:', error);
    }
});

