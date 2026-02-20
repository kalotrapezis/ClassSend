# ClassSend 9.3.7
![Version](https://img.shields.io/badge/version-v9.3.7-blue)
![Platform](https://img.shields.io/badge/platform-Windows-blue)
![License](https://img.shields.io/badge/license-ISC-green)

**ClassSend** is a lightweight, local network file sharing and chat application designed for classrooms. It now features a high-performance **N-gram AI Classifier** for intelligent content filtering without the bloat.

## 🚀 Features
- **🖼️ In-App Web Viewer**: The "Link" button opens websites securely in an internal, full-screen capable web-viewer.
- **🎨 SVG Transition**: High-quality SVG icons replace emojis in file and web viewing panes.
- **🛡️ Improved Moderation UI**: Message area darkens when "Block All" is active for clear visual feedback.
- **📂 Persistent Media Library**: Dedicated installation folder for shared files that persists across restarts. Features teacher-only "Delete-Clear" and "Download All" controls.
- **⚙️ Persisted Settings**: Log settings and Advanced Filter configurations are saved securely upon changes.
- **📌 Pinned Comments**: Improved UI, styling, and action button propagation for pinned messages.
- **🏷️ Consistent Styling**: Action buttons feature unified labels, hover states, colors, and layout across all message types.
- **� Smart Auto-Connect**: The app dynamically probes for known servers from history and seamlessly routes students and teachers to the right place.
- **� Instant Start**: New students skip the setup screens and go straight to finding a class.
- **✨ Visual Polish**: Progress bars for sending/receiving files, and system messages that auto-delete with a sleek visual timer.
- **🌍 Enhanced Localization**: Full Greek translations for Themes, Connection Status, and interactive buttons.
- **🧠 Enhanced AI (N-gram)**: Upgraded Naive Bayes classifier with N-gram tokenization and a bundled offline Deep Learning model (`toxic-bert`).
- **📋 List Management**: Full control over Blacklist (Forbidden words) and Whitelist (Good list) with Import/Export capabilities.

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
- **Linux AppImage**: `ClassSend-9.3.7-x64.AppImage`
- **Linux Zip**: `ClassSend-linux-x64-9.3.7.zip`
- **Windows Installer (64-bit)**: `ClassSend-9.3.7 Setup.exe`
- **Windows Portable (64-bit)**: `ClassSend-win32-x64-9.3.7.zip`

## 🧠 Offline AI Setup (Required for Deep Learning)
The "Deep Learning" filter requires the `toxic-bert` model, which is excluded from this repository due to size limits.

To enable it:
1.  Download the **Xenova/toxic-bert** model (ONNX quantized) from Hugging Face.
2.  Place the files in: `server/models/Xenova/toxic-bert/onnx/`
3.  Ensure `model_quantized.onnx` is present in that folder.


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
    To create the `.exe` installer:
    ```bash
    cd server
    npm run make
    ```

    **Build Linux AppImage**:
    ```bash
    cd server
    npm run make:appimage
    ```

    **Build Windows 32-bit Zip** (on Linux):
    ```bash
    cd server
    npx electron-forge package --arch=ia32 --platform=win32
    mkdir -p out/make/zip/win32-ia32
    cd out/ClassSend-win32-ia32 && zip -r ../make/zip/win32-ia32/ClassSend-win32-ia32-7.0.0.zip .
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
- **[@xenova/transformers](https://huggingface.co/docs/transformers.js)**: Powering our Deep Learning filters with `toxic-bert`.
- **[bayes](https://github.com/ttezel/bayes)**: Providing our adaptable Naive Bayes classification layer.
- **[bad-words](https://github.com/web-mech/badwords)**: The foundation of our legacy quick-fiter.
- **[Socket.IO](https://socket.io/)**: Real-time bidirectional event-based communication.
- **[Express](https://expressjs.com/)**: Fast, unopinionated, minimalist web framework for Node.js.
- **[Electron](https://www.electronjs.org/)**: Framework for building cross-platform desktop apps.
- **[Bonjour Service](https://github.com/onewith7/bonjour-service)**: For local network discovery.

## 📄 License
This project is licensed under the **GNU General Public License v3.0 (GPLv3)**.
This guarantees that ClassSend remains free and open-source software forever. Anyone can use, modify, and distribute it, provided that all changes remain open-source under the same license.
