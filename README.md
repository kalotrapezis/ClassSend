# ClassSend (This App is vibecoded with Gemini 3 just for fun and personal use!)

**ClassSend** is a local network file sharing and chat application designed for classrooms. It allows teachers and students to communicate and share files instantly without needing an internet connection or external servers.

## 🚀 Features
- **Real-time Chat**: Teams-like interface with @mentions and role-based colors.
- **File Sharing**: Drag-and-drop file sharing directly in the chat.
- **Class Management**: Teachers can create classes; students can join multiple classes.
- **Local Network**: Runs entirely on your local network (LAN). No internet required.
- **Cross-Platform**: Windows (exe), Mac, and Linux support via Electron.

## 📦 Download & Install
Go to the [Releases](../../releases) page (if applicable) or check the `out/make` folder if you built it locally.

- **Windows Installer**: `ClassSend-3.0.0 Setup.exe`
- **Portable Zip**: `ClassSend-win32-x64-3.0.0.zip`

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
