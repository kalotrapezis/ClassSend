# Release Notes - v5.1.0

## 🚀 New Features

### 📤 1GB+ File Upload Support
We have completely overhauled the file transfer system!
- **Large File Support**: You can now upload files up to **1.5GB** (previously limited to ~100MB).
- **Improved Reliability**: Replaced legacy socket-based transfer with robust HTTP streaming.
- **Progress Tracking**: Better visibility during large transfers.

### 🐧 Linux System Tray Support
Critical improvements for Linux users:
- **Tray Icon**: Fixed the missing tray icon on Linux distributions (including Ubuntu/AppImage).
- **Clean Exit**: You can now properly close the application via the tray menu, solving "Port 3000 in use" errors.

### 🛠️ Linux AppImage Fixes
- **Read-Only Filesystem Fix**: The AppImage no longer crashes on startup due to write permission errors.
- **User Data Storage**: Application data (uploads, forbidden words) is now correctly stored in your system's configuration folder (`~/.config/ClassSend/`).

## 🐛 Bug Fixes
- Fixed `EADDRINUSE` errors on application restart.
- Fixed `ENOENT` crash when running as AppImage.
- Improved startup reliability on all platforms.
