const { app, BrowserWindow, Tray, Menu, shell, ipcMain, desktopCapturer } = require('electron');
const path = require('path');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// eslint-disable-next-line global-require
if (require('electron-squirrel-startup')) {
    app.quit();
    process.exit(0); // Ensure immediate exit
}

const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');

// Set USER_DATA_PATH for the server to use (Must be before requiring index.js)
// This ensures we write to a writable location (e.g. ~/.config/...) instead of the read-only AppImage mount
// app.getPath('userData') is only available after app is ready or in main process, but we need it for top-level requires if they run immediately.
// Actually, app.getPath is available immediately in main process.
if (app) {
    process.env.USER_DATA_PATH = app.getPath('userData');
}

// --- CRASH REPORTING & LOGGING ---
const configManager = require('./config-manager'); // Import ConfigManager

// --- CRASH REPORTING & LOGGING ---
const logFilePath = path.join(app.getPath('home'), 'classSendReport.txt');

// Initialize logs: Overwrite if enabled, otherwise do nothing
try {
    if (configManager.get('autoExportLogs')) {
        const sessionHeader = `=== ClassSend Session Started: ${new Date().toISOString()} ===\n`;
        fs.writeFileSync(logFilePath, sessionHeader); // Overwrite mode
    }
} catch (e) {
    // Ignore if fails (permissions etc)
}

function logToFile(type, args) {
    // Check config before writing to disk
    if (!configManager.get('autoExportLogs')) return;

    try {
        const message = args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' ');
        const logLine = `[${new Date().toISOString()}] [${type}] ${message}\n`;
        fs.appendFileSync(logFilePath, logLine);
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

// Catch unhandled exceptions
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
    logToFile('FATAL', ['UNCAUGHT EXCEPTION:', err]);
});
// --------------------------------

// Disable hardware acceleration to prevent GPU process crashes on Linux
app.disableHardwareAcceleration();

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

function checkServerReady(port) {
    return new Promise((resolve, reject) => {
        const client = new net.Socket();
        client.once('connect', () => {
            client.destroy();
            resolve(true);
        });
        client.once('error', (err) => {
            client.destroy();
            reject(err);
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

    // Create splash screen first
    const splashWindow = new BrowserWindow({
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
    const port = 3000; // Standard port
    const protocol = process.env.USE_TLS === 'true' ? 'https' : 'http';
    const serverUrl = `${protocol}://localhost:${port}`;

    // Poll for server readiness
    pollServer(port)
        .then((isReady) => {
            if (isReady) {
                console.log(`Server ready. Loading window from: ${serverUrl}`);
                mainWindow.loadURL(serverUrl);
            } else {
                console.error("Server failed to start within timeout.");
                // Optionally show an error dialog or quit
                // mainWindow.loadFile(path.join(__dirname, 'error.html')); // If you had one
            }
        })
        .catch(err => console.error("Polling error:", err));


    // When main window is ready, close splash and show main
    mainWindow.once('ready-to-show', () => {
        setTimeout(() => {
            if (splashWindow && !splashWindow.isDestroyed()) {
                splashWindow.close();
            }
            mainWindow.show();
            mainWindow.focus();
        }, 500);
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
    ipcMain.handle('lock-screen', async () => {
        try {
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
    background: #0a0a0a;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    height: 100vh; width: 100vw;
    font-family: 'Segoe UI', sans-serif;
    color: white; overflow: hidden;
  }
  .lock-icon { font-size: 72px; margin-bottom: 24px; animation: pulse 2s infinite; }
  h1 { font-size: 2.5rem; font-weight: 700; color: #ff4444; margin-bottom: 8px; letter-spacing: 2px; }
  p { font-size: 1.1rem; color: rgba(255,255,255,0.6); margin-top: 8px; }
  .divider { width: 80px; height: 3px; background: #ff4444; margin: 16px auto; border-radius: 2px; }
  @keyframes pulse { 0%,100%{opacity:1;} 50%{opacity:0.5;} }
</style>
</head><body>
  <div class="lock-icon">🔒</div>
  <h1>Screen Locked</h1>
  <div class="divider"></div>
  <p>Your screen has been locked by the teacher.</p>
  <p>Please wait for the teacher to unlock your screen.</p>
<script>
  // Block all keyboard shortcuts
  document.addEventListener('keydown', e => e.preventDefault(), true);
  document.addEventListener('contextmenu', e => e.preventDefault(), true);
<\/script>
</body></html>`;

                lockWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(lockHtml));
                lockWindow.setAlwaysOnTop(true, 'screen-saver', 1);
                lockWindow.focus();

                console.log('[Lock Screen] Custom overlay window created');
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
            mainWindow.maximize();
            mainWindow.focus();
            mainWindow.setAlwaysOnTop(true);
            setTimeout(() => {
                mainWindow.setAlwaysOnTop(false);
            }, 1000);
            return { success: true };
        }
        return { success: false, error: "Window not found" };
    });

    // Auto-download file creation
    ipcMain.handle('auto-download', async (event, { url, filename, customPath }) => {
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
            // Determine size based on requested quality
            const width = quality === 'low' ? 320 : 1920;
            const height = quality === 'low' ? 180 : 1080;

            const sources = await desktopCapturer.getSources({
                types: ['screen'],
                thumbnailSize: { width, height }
            });

            if (sources.length > 0) {
                // Returns a base64 string of the JPEG thumbnail
                return sources[0].thumbnail.toDataURL();
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
        console.log(`Creating tray with icon: ${iconPath}`);
        const icon = require('electron').nativeImage.createFromPath(iconPath);

        if (icon.isEmpty()) {
            console.warn(`Tray icon is empty or invalid format: ${iconPath}`);
        }

        tray = new Tray(icon);
        tray.setToolTip('ClassSend Server');

        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Open',
                click: () => {
                    if (mainWindow) {
                        mainWindow.show();
                    } else {
                        createWindow();
                    }
                }
            },
            {
                type: 'separator'
            },
            {
                label: 'Start on Login',
                type: 'checkbox',
                checked: app.getLoginItemSettings().openAtLogin,
                click: (menuItem) => {
                    app.setLoginItemSettings({
                        openAtLogin: menuItem.checked
                    });
                }
            },
            {
                type: 'separator'
            },
            {
                label: 'Enable TLS/HTTPS',
                type: 'checkbox',
                checked: process.env.USE_TLS === 'true',
                click: async (menuItem) => {
                    const { dialog } = require('electron');
                    const result = await dialog.showMessageBox({
                        type: 'question',
                        buttons: ['Yes', 'No'],
                        title: 'Restart Required',
                        message: 'Changing TLS settings requires restarting the application. Continue?'
                    });

                    if (result.response === 0) {
                        // Set environment variable
                        process.env.USE_TLS = menuItem.checked ? 'true' : 'false';

                        // Restart app
                        app.relaunch();
                        app.exit(0);
                    } else {
                        // Revert checkbox
                        menuItem.checked = !menuItem.checked;
                    }
                }
            },
            {
                type: 'separator'
            },
            {
                label: 'Close',
                click: async () => {
                    isQuitting = true;
                    try {
                        if (stopServerFunc) await stopServerFunc();
                    } catch (error) {
                        console.error('Error stopping server:', error);
                    }
                    app.quit();
                }
            }
        ]);

        tray.setContextMenu(contextMenu);

        // Double-click to show window
        tray.on('double-click', () => {
            if (mainWindow) {
                mainWindow.show();
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

