const { app, BrowserWindow, Tray, Menu } = require('electron');
const path = require('path');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// eslint-disable-next-line global-require
if (require('electron-squirrel-startup')) {
    app.quit();
    process.exit(0); // Ensure immediate exit
}

// Set USER_DATA_PATH for the server to use (Must be before requiring index.js)
// This ensures we write to a writable location (e.g. ~/.config/...) instead of the read-only AppImage mount
// app.getPath('userData') is only available after app is ready or in main process, but we need it for top-level requires if they run immediately.
// Actually, app.getPath is available immediately in main process.
if (app) {
    process.env.USER_DATA_PATH = app.getPath('userData');
}

// Server import moved to startServer function to avoid blocking startup
let serverInstance;
let stopServerFunc;
let getTrainingStatusFunc;

let mainWindow;
let tray;
let isQuitting = false;

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

function startAppServer() {
    console.log("Starting server...");
    try {
        const { server, stopServer, getTrainingStatus } = require('./index.js');
        // Store references
        serverInstance = server;
        stopServerFunc = stopServer;
        getTrainingStatusFunc = getTrainingStatus;

        console.log("Server module loaded.");
    } catch (err) {
        console.error("Failed to start server:", err);
    }
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
    setTimeout(() => {
        startAppServer();
    }, 100);

    // Create main window (hidden initially)
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: iconPath,
        show: false, // Don't show until ready
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
        backgroundColor: '#0f172a' // Prevent white flash on load
    });

    // Load the local server URL
    // Use HTTPS if TLS is enabled, otherwise HTTP
    const protocol = process.env.USE_TLS === 'true' ? 'https' : 'http';
    const serverUrl = `${protocol}://localhost:3000`;

    console.log(`Loading window from: ${serverUrl}`);
    mainWindow.loadURL(serverUrl);

    // When main window is ready, close splash and show main
    mainWindow.once('ready-to-show', () => {
        setTimeout(() => {
            if (splashWindow && !splashWindow.isDestroyed()) {
                splashWindow.close();
            }
            mainWindow.show();
            mainWindow.focus();
        }, 500); // Small delay for smoother transition
    });

    // Hide the menu bar (User request)
    mainWindow.setMenu(null);


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
    const { desktopCapturer } = require('electron');
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

app.whenReady().then(() => {
    createWindow();
    createTray();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

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

