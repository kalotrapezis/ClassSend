# ClassSend (v4.5.4 Latest)
**ClassSend** is a local network file sharing and chat application designed for classrooms. It allows teachers and students to communicate and share files instantly without needing an internet connection or external servers.

## 🚀 Latest Features (v4.5.4)
- **🐛 Critical Fixes**:
  - **Content Filtering Restored**: Fixed filtering system that stopped working - now properly blocks inappropriate content
  - **Pinned Message Actions**: Action buttons now appear directly on pinned messages (no more scrolling!)
- **📦 Download All as ZIP (Alpha)**: Bulk download all shared files from the gallery as a single ZIP archive
- **🖐️ Hand Raising System**: Students can raise hands to signal teachers; teachers can lower all hands at once
- **📌 Enhanced Pinned Messages**: Direct action buttons on pinned comments (Copy, Email, Link, Unpin)
- **⛔ User Blocking**: Teachers can block users individually or **Block All** users at once
- **🎨 UI Improvements**:
  - **Unified Button Styles**: Consistent, modern look for all action buttons
  - **Refined Layout**: Improved placement of class and user action buttons
  - **Visual Clarity**: Clearer status indicators and role-based coloring
- **🌐 Network Flexibility**: Switch between **Standard IP** (works everywhere) and **Short Name** (e.g., `math.local`)
- **🛡️ Advanced Content Filtering**: Real-time detection of inappropriate content (2875+ words, multi-language)
- **⚡ Smart Action Buttons**: Context-aware buttons for Copy 📋, Email ✉️, Open Link 🔗, and Download ⬇️

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
- **Cross-Platform**: Windows (exe), Mac, and Linux support via Electron.

## 📦 Download & Install
Go to the [Releases](../../releases) page or check the `out/make` folder.

- **Windows Installer (64-bit)**: `ClassSend-4.5.4 Setup.exe`
- **Windows Installer (32-bit)**: `ClassSend-4.5.4 Setup-x32.exe`
- **Windows Portable (64-bit)**: `ClassSend-win32-x64-4.5.4.zip`
- **Windows Portable (32-bit)**: `ClassSend-win32-ia32-4.5.4.zip`

## 🛠️ How to Run (Development)
If you want to modify the code or contribute:

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
    npm run make
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
