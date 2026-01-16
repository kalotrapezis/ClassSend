const { app, BrowserWindow, Tray, Menu } = require('electron');
const path = require('path');

// Set USER_DATA_PATH for the server to use (Must be before requiring index.js)
// This ensures we write to a writable location (e.g. ~/.config/...) instead of the read-only AppImage mount
// app.getPath('userData') is only available after app is ready or in main process, but we need it for top-level requires if they run immediately.
// Actually, app.getPath is available immediately in main process.
process.env.USER_DATA_PATH = app.getPath('userData');

const { server, stopServer } = require('./index.js'); // Import the server to start it and stop it

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

function createWindow() {
    let iconFilename = 'icon.ico';
    if (process.platform === 'linux' || process.platform === 'darwin') {
        iconFilename = 'tray.png';
    }
    const iconPath = path.join(__dirname, 'assets', iconFilename);
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: iconPath,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    // Load the local server URL
    // Use HTTPS if TLS is enabled, otherwise HTTP
    const protocol = process.env.USE_TLS === 'true' ? 'https' : 'http';
    const serverUrl = `${protocol}://localhost:3000`;

    console.log(`Loading window from: ${serverUrl}`);
    mainWindow.loadURL(serverUrl);


    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
            return false;
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
                        await stopServer();
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
        await stopServer();
        console.log('Server stopped successfully');
    } catch (error) {
        console.error('Error stopping server during quit:', error);
    }
});

