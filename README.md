# ClassSend (v3.9.0 Laterst) Vibe Codes with Antigravity Gemini 3 pro and Claude 4.5
## The moment the models start segmenting their code and compressing their "thoughts" to fit inside the context window vibe coding is not a  thing. Clause it shelf acknowledged that it could not make a single line change I asked it to, and suggested to me to just make it by hand 😊. But all and all is a big improvement, I would consider it a proper app with a few bugs, not a simple mockup of an application.

**ClassSend** is a local network file sharing and chat application designed for classrooms. It allows teachers and students to communicate and share files instantly without needing an internet connection or external servers.

## 🚀 New Features (v3.9.0)
- **Automatic Network Discovery**: Server automatically broadcasts on LAN. No need to type IP addresses!
- **Zero-Typing Join**: Students see available classes automatically and join with one click.
- **Drag-and-Drop**: Share files by dragging them directly into the chat. (it doesn't work yet)
- **TLS/HTTPS Encryption**: Optional secure connection mode (toggle in tray menu).
- **File Sharing**: Students can share files with the class.
- **The students can connect by using the browser and typing the IP address of the server. No application is needed.**

## 🌟 Core Features
- **Real-time Chat**: Teams-like interface with @mentions and role-based colors.
- **Class Management**: Teachers can create classes; students can join multiple classes.
- **Local Network**: Runs entirely on your local network (LAN). No internet required.
- **Cross-Platform**: Windows (exe), Mac, and Linux support via Electron.

## 📦 Download & Install
Go to the [Releases](../../releases) page or check the `out/make` folder.

- **Windows Installer (64-bit)**: `ClassSend-3.9.0 Setup64.exe`
- **Windows Installer (32-bit)**: `ClassSend-3.9.0 Setup32.exe`
- **Windows Portable (64-bit)**: `ClassSend-win32-x64-3.9.0.zip`
- **Windows Portable (32-bit)**: `ClassSend-win32-ia32-3.9.0.zip`

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
