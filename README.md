# ClassSend 11.2.0
![Version](https://img.shields.io/badge/version-v11.2.0-blue)
![Platform](https://img.shields.io/badge/platform-Windows-blue)
![License](https://img.shields.io/badge/license-ISC-green)

<img width="1382" height="701" alt="image" src="https://github.com/user-attachments/assets/6c434b3c-2434-4861-9c14-8704e704b841" />
<img width="1383" height="751" alt="image" src="https://github.com/user-attachments/assets/4ebffff6-27fa-49aa-b359-bc3b9ba27f60" />
<img width="1390" height="744" alt="image" src="https://github.com/user-attachments/assets/0f4d2c30-0cca-4ab2-80f9-238148866038" />
<img width="1385" height="767" alt="image" src="https://github.com/user-attachments/assets/1ec13c56-00c7-4817-af05-5ca16d7a186f" />
<img width="1384" height="754" alt="image" src="https://github.com/user-attachments/assets/fb9112ff-efab-4871-8c43-92d7720381fb" />
<img width="1383" height="764" alt="image" src="https://github.com/user-attachments/assets/bde6ebb2-9831-435a-b962-08a0143ff6ad" />
<img width="1386" height="761" alt="image" src="https://github.com/user-attachments/assets/935433d1-b49c-4011-8f64-085c24a0b7cc" />
<img width="1386" height="737" alt="image" src="https://github.com/user-attachments/assets/0ed6b6ed-556c-47c3-832f-09214ffcebea" />
<img width="1383" height="712" alt="image" src="https://github.com/user-attachments/assets/d473d46d-b175-481e-b050-3c54982582a4" />
<img width="1381" height="754" alt="image" src="https://github.com/user-attachments/assets/22e4d8ad-5fca-41cd-885c-313821e1a2a3" />
<img width="1387" height="736" alt="image" src="https://github.com/user-attachments/assets/1cab1573-54bd-467c-8f9d-7ac83ff54257" />
<img width="1382" height="759" alt="image" src="https://github.com/user-attachments/assets/849ba928-c765-41a8-bcf1-82fbe5fc6cd9" />
<img width="1388" height="742" alt="image" src="https://github.com/user-attachments/assets/654a85ae-de0b-4f79-ad59-382c4ea5d3f4" />








> [!IMPORTANT]
> **Installation**: ClassSend 11.2.0 uses a proper installer that asks you to choose a role at setup time.
> - Run `ClassSend Setup.exe` and select **Teacher** or **Student** when prompted.
> - **Teacher** installs get the full control panel, monitoring, and all classroom tools.
> - **Student** installs get messaging, file sharing, and personal settings. The installer also silently registers a system-level WiFi guard that prevents students from disabling the network connection.
> - No per-machine configuration is needed after installation — the role is set once and remembered.

**ClassSend** is a lightweight, local network file sharing and chat application designed for classrooms. It now features a high-performance **N-gram AI Classifier** for intelligent content filtering without the bloat.

## 🚀 Features
- **🖼️ In-App Web Viewer**: The "Link" button opens websites securely in an internal, full-screen capable web-viewer.
- **🎨 SVG Transition**: High-quality SVG icons replace emojis in file and web viewing panes.
- **🛡️ Improved Moderation UI**: Message area darkens when "Block All" is active for clear visual feedback.
- **📂 Persistent Media Library**: Dedicated installation folder for shared files that persists across restarts. Features teacher-only "Delete-Clear" and "Download All" controls.
- **⚙️ Persisted Settings**: Log settings and Advanced Filter configurations are saved securely upon changes.
- **📌 Pinned Comments**: Improved UI, styling, and action button propagation for pinned messages.
- **🏷️ Consistent Styling**: Action buttons feature unified labels, hover states, colors, and layout across all message types.
- **🖥️ (New) Student Monitoring**: Periodic low-resolution screenshots for classroom oversight (Now accurately displays PC Names).
- **🌐 (New) App Launch Links**: The teacher can now type domain names without "http://" (e.g., google.com) to instantly launch URLs on all student computers at once.
- **📥 (New) Promptless File Distribution**: Files sent from the teacher automatically bypass browser prompts and save to the default Downloads folder when Enabled.
- **🔒 (New) Screen Lock**: "Κλείδωμα Οθόνης" to restrict student activity with a full-screen overlay.
- **⏳ (New) End of Day**: "Τερματισμός Τέλους Ημέρας" for bulk classroom termination.
- **🎯 (New) Focus Mode**: Automatic window restoration from the system tray.
- **📥 (New) Automatic Downloads**: Support for predetermined download locations across all PCs.
- **🎚️ (New) Sensitivity Controls**: Interactive sliders for moderation thresholds.
- **🖥️ (New) Monitor Focus Controls**: Individual Lock, Focus, No Internet, Close Apps, and Launch pills for student-specific classroom management.
- **🚫 (New) Close All Apps**: Teacher tool in the main menu and individual focus modal to close all running applications instantly.
- **🌐 (New) No Internet**: Teacher tool to disable and restore student internet access on demand while maintaining local classroom connectivity.
- **📁 (New) Improved File Actions**: "Send File" and "Open Action" buttons directly on file messages for better workflow.
- **🔍 (New) Monitoring Fixes**: Critical reliability and performance fixes for the student monitoring system.
- **� Smart Auto-Connect**: The app dynamically probes for known servers from history and seamlessly routes students and teachers to the right place.
- **� Instant Start**: New students skip the setup screens and go straight to finding a class.
- **✨ Visual Polish**: Progress bars for sending/receiving files, and system messages that auto-delete with a sleek visual timer.
- **🌍 Enhanced Localization**: Full Greek translations for Themes, Connection Status, and interactive buttons.
- **🧠 Enhanced AI (N-gram)**: Upgraded Naive Bayes classifier with N-gram tokenization.
- **📋 List Management**: Full control over Blacklist (Forbidden words) and Whitelist (Good list) with Import/Export capabilities.

## 🆕 What's New in 11.2.0

### Configuration File (`classsend.conf`)
ClassSend now ships with a plain-text configuration file placed next to the executable — similar to `/etc/` config files on Linux. IT administrators can edit it with any text editor before or after deployment; a restart applies the changes.

**Location after install:** `C:\Program Files\ClassSend\resources\classsend.conf`
**Location in development:** project root `classsend.conf`

All settings are documented with inline comments. Key options:

| Setting | Default | Description |
|---|---|---|
| `role` | `teacher` | Override installation role without reinstalling |
| `port` | `3000` | Server port |
| `use_tls` | `false` | Enable HTTPS |
| `autostart` | `true` | Windows startup registration |
| `restore_internet_on_startup` | `true` | Re-apply internet block after restart |
| `max_file_size_mb` | `1536` | Max upload size |
| `screen_capture_quality` | `low` | Overview grid resolution |
| `screen_capture_hires_quality` | `1080p` | Focused student resolution |
| `screen_capture_speed_mbit` | `16` | Streaming bandwidth target |
| `socket_buffer_size_mb` | `2048` | Socket.IO internal buffer |
| `enable_logging` | `false` | Console diagnostics |
| `auto_export_logs` | `false` | Save session logs to file |
| `block_threshold` | `90` | AI blocking sensitivity (0–100) |
| `report_threshold` | `20` | AI report flagging sensitivity (0–100) |

### Improved Screen Monitoring Quality
The student screen capture system now supports multiple resolutions and configurable JPEG compression:

**Resolutions:** `low` (320×180) · `1080p` (1920×1080) · `1440p` (2560×1440) · `4k` (3840×2160)

**Streaming speeds (Mbit/s → JPEG quality):**
- `8 Mbit` → quality 25 (light bandwidth, compressed)
- `16 Mbit` → quality 50 *(default)*
- `32 Mbit` → quality 72
- `64 Mbit` → quality 88 (near-lossless)

Captures are now sent as JPEG instead of PNG, significantly reducing per-frame payload.

### Bug Fixes

#### Tool Button Reliability
Teacher tools (Lock Screen, Internet Cutoff, Shutdown, Focus App, Close All Apps) would silently do nothing after a brief network reconnect because the internal class connection state was cleared but the buttons stayed active.

**Root cause:** A logic inversion in the auto-join recovery path set `autoFlowTriggered = true` (blocking retries) instead of resetting it. This left `currentClassId` as `null` indefinitely.

**Fix:** The flag is now correctly reset to `false`, the teacher triggers an auto-recovery after 2 seconds, and all five affected buttons now show a clear warning toast ("Not connected to a class – please wait for reconnection.") instead of silently doing nothing.

#### Window Focus Restoration
On Windows, clicking the ClassSend window with the mouse would not restore keyboard focus after the window lost it. Alt-Tab or closing and reopening via the tray icon was the only workaround.

**Root causes:**
- `app.disableHardwareAcceleration()` was applied on all platforms despite a "Linux only" comment — on Windows this forces software (WARP) rendering which disrupts `WM_MOUSEACTIVATE` handling.
- The tray icon's double-click handler called `show()` but not `focus()`.
- The `unlock-screen` handler destroyed the lock overlay but did not refocus the main window.
- No `show` event handler ensured focus when the window was programmatically shown.

**Fix:** Hardware acceleration is now disabled only on Linux. `focus()` is called after `show()` in the tray handler, in the `show` event, and after the lock screen is dismissed.

#### TAB Keyboard Navigation Order
When navigating with the keyboard, TAB would reach the buttons *inside* the Tools menu before reaching the toggle button that opens it. Keyboard-only users would move through all hidden tool buttons without the menu ever opening.

**Root causes:**
- The `#tools-menu` element appeared before `#btn-tools-toggle` in the DOM.
- Menu buttons had no `tabindex` attribute, so they were always focusable regardless of visibility.

**Fix:** The toggle button is now first in DOM order. All tool menu buttons carry `tabindex="-1"` by default and are promoted to `tabindex="0"` only while the menu is open, then reset when it closes.

---

## 📖 How to Use
1.  **Start the App**: Open ClassSend on the teacher's computer.
2.  **Create a Class**: Enter a Class ID (e.g., "Math") and your name.
3.  **Connect Students**:
    *   Click the **Globe Icon (🌐)** in the top header.
    *   **Option A (Easiest)**: Toggle "Short Name" ON. Students type `http://math.local:3000` in their browser.
    *   **Option B (Reliable)**: If on a **mobile hotspot** or if Option A fails, toggle "Standard IP" ON. Students type the IP address shown (e.g., `http://192.168.1.5:3000`).
4.  **Share**: Drag and drop files or type messages. Everything is shared instantly over the local network!

## 🌟 Core Features
- **Real-time Chat**: Teams-like interface with @mentions and role-based colors.
- **Class Management**: Teachers can create classes; students can join multiple classes.
- **Local Network**: Runs entirely on your local network (LAN). No internet required.
- **Windows Installer (64-bit)**: `ClassSend Setup 11.2.0.exe` — Teacher/Student role selected at install time




## 🛠️ Troubleshooting Connection Issues
If students cannot see the teacher's class automatically:

1.  **Check Network**: Ensure both Teacher and Students are on the **Same Wi-Fi Network**.
2.  **Firewall**: On the Teacher's computer, ensure **Windows Firewall** allows "Node.js" or "ClassSend" on Private Networks.
3.  **Manual Connect**:
    *   **Teacher**: Click the 🌐 icon -> Toggle "Standard IP". Note the IP (e.g., `10.17.3.125`).
    *   **Student**: Click "Manual Connect" (or 🌐) -> Enter that IP.
4.  **IP History**: Once a student connects successfully once, ClassSend remembers the IP.
    *   Students periodically probe this history every 10 seconds while waiting in the Lobby, so they will auto-connect even if the Teacher starts ClassSend *after* the students.

## 🛠️ How to Run (Development)


1.  **Install Dependencies**:
    ```bash
    npm install
    ```
    *(This installs dependencies for both client and server)*

2.  **Start the App**:
    ```bash
    npm start
    ```
    This will launch the Electron application window.

3.  **Build for Production**:
    To create the Windows installer (outputs to `server/dist_build/`):
    ```bash
    cd server
    npm run make
    ```

    To build a 32-bit installer:
    ```bash
    cd server
    npm run make:win32
    ```

## 🏗️ Architecture
ClassSend is built with:
- **Electron**: For the desktop application wrapper.
- **Node.js & Express**: For the internal server that handles socket connections.
- **Socket.IO**: For real-time bidirectional communication.
- **Vanilla JS / HTML / CSS**: For the frontend interface.

### Why Electron?
We use Electron to bundle the Node.js server *inside* the application. This means:
1.  **Zero Configuration**: Users don't need to install Node.js or configure IP addresses manually.
2.  **Standalone**: It runs as a single `.exe` file.
3.  **Offline Capable**: It creates its own local server, perfect for schools with restricted internet.

## 🙏 Credits & Technologies
ClassSend wouldn't be possible without these amazing open-source projects:
- **[bayes](https://github.com/ttezel/bayes)**: Providing our adaptable Naive Bayes classification layer.
- **[bad-words](https://github.com/web-mech/badwords)**: The foundation of our legacy quick-fiter.
- **[Socket.IO](https://socket.io/)**: Real-time bidirectional event-based communication.
- **[Express](https://expressjs.com/)**: Fast, unopinionated, minimalist web framework for Node.js.
- **[Electron](https://www.electronjs.org/)**: Framework for building cross-platform desktop apps.
- **[Bonjour Service](https://github.com/onewith7/bonjour-service)**: For local network discovery.

## 📄 License
This project is licensed under the **GNU General Public License v3.0 (GPLv3)**.
This guarantees that ClassSend remains free and open-source software forever. Anyone can use, modify, and distribute it, provided that all changes remain open-source under the same license.
