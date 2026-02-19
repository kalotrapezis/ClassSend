# ClassSend 9.3.1
![Version](https://img.shields.io/badge/version-v9.3.1-blue)
![Platform](https://img.shields.io/badge/platform-Windows-blue)
![License](https://img.shields.io/badge/license-ISC-green)

**ClassSend** is a lightweight, local network file sharing and chat application designed for classrooms. It now features a high-performance **N-gram AI Classifier** for intelligent content filtering without the bloat.

## 🚀 Latest Features (v9.3.0)
- **🎨 SVG Transition**: High-quality SVG icons replace emojis in file and web viewing panes.
- **🛡️ Improved Moderation UI**: Message area darkens when "Block All" is active for clear visual feedback.
- **📂 Persistent Media Library**: Dedicated installation folder for shared files that persists across restarts.
- **🌐 Non-Windows Webviewer**: Partial fixes for tablet and across-platform web viewing.
- **🛠️ Persistent Teacher Tools**: Tool menu stays open for multiple rapid adjustments.
- **🔍 Diagnostic Tools**: Debugging logs enabled by default with automatic log export to text files.
- **🔄 Connection Fixes**: Improved auto-connection from history and better respect for connection info settings.

## 🚀 Previous Features (v9.2.0)
- **⚡ Smart Auto-Connect**: The app now intelligently probes for known servers from history and handles offline/online states automatically.
- **🎓 Instant Start**: New students skip the setup screens and go straight to finding a class.
- **✨ Visual Polish**: System messages now auto-delete with a sleek visual timer.
- **🌍 Enhanced Localization**: Improved translations for Themes, Connection Status, and interactive buttons.

## 🚀 Previous Features (v9.0)
- **Persistent Media Library**: Uploaded files now persist in a `MediaLibrary` folder in the installation root.
- **Clear Data Feature**: Admin tool to delete all media files and reset server state.
- **Theme Selection Fix**: Resolved regression where themes were not clickable.
- **Native Document Rendering**: Restored in-browser rendering for DOCX and XLSX files.
- **🧠 Enhanced AI (N-gram)**: Upgraded Naive Bayes classifier with N-gram tokenization.

## 🚀 Previous Features (v8.3.7)
- **� Maintenance Release**: Stability improvements and minor bug fixes.

🚀 Latest Features (v8.7.2)
🎲 Randomizer Fix: Nickname randomizer now correctly supports Greek and localized word lists.
⚡ reliability: Improved cross-platform data path handling and model discovery.

## 🚀 Previous Features (v8.3.0)
- **🇬🇷 Complete Greek Gallery**: Fixed missing translations in the Media Library.
- **🔄 Settings Sync**: Teachers' language and filter settings now push to students automatically.

## 🚀 Previous Features (v8.1.1)
- **🌍 Auto-Lobby**: Streamlined flow where everyone joins a shared lobby automatically.
- **🇬🇷 Greek Localization**: Full translation of the entire settings menu and administration tools.
- **💾 Class Persistence**: Renamed Lobby names are saved and restored automatically.

## 🚀 Previous Features (v8.0.0)
- **🏢 Lobby Mode**: Students can now create and join a shared "Lobby" if no class exists. Chat is disabled until a teacher joins and takes ownership.
- **🇬🇷 Extended Character Support**: Fixed filename encoding issues for Greek and other non-Latin characters.
- **🚿 Splash Screen**: New animated splash screen for a smoother loading experience.
- **⚡ Improved Auto-Flow**: Smart detection automatically routes students to the Lobby or available classes, and teachers to their class creation flow.
- **🎲 Random Identities**: Students get fun, auto-generated names (e.g., "Happy Lemon") on first launch.

## 🚀 Previous Features (v7.2.0)
- **📋 New Media Library List View**: Redesigned for a cleaner, horizontal "name list" look with quick action buttons.
- **⚙️ Redesigned Settings Modal**: Categorized sidebar layout for easier navigation and feature discoverability.
- **✨ UI Polish**: Refined action buttons with glassmorphism effects and improved alignment throughout the app.
- **⚡ Performance**: Faster loading and forced cache refreshes for CSS updates.

## 🚀 Previous Features (v7.0.1)
- **📦 Offline AI**: Deep Learning model is now fully bundled and works without internet.
- **⚡ Native x64 Performance**: Rebuilt for 64-bit Windows systems for faster AI inference.
- **🧠 3-Layer AI Filtering**:
    - **Legacy**: Lightweight client-side word matching.
    - **Advanced (Naive Bayes)**: Probabilistic filtering that learns from context.
    - **Deep Learning (New)**: MobileBERT Transformer model for state-of-the-art toxicity detection.
- **⚙️ Advanced Model Settings**: Teachers can fine-tune the AI's sensitivity (Lenient vs. Strict) for both blocking and reporting.
- **🛡️ Role-Based Settings**: Admin settings (Network, Filtering, Data) are now hidden from students, who only see Language options.
- **📋 List Management**: Full control over **Blacklist** (Forbidden words) and **Good List** (Whitelisted words), with Import/Export capabilities.
- **⚠️ Smart Notifications**: Real-time warnings when content is blocked or reported for review.
- **⚡ Memory-Only Logs**: Session logs are stored in RAM for privacy and performance, automatically clearing when the app closes. 

## 🚀 Previous Features (v7.0.0)
- **⚠️ Reporting System**: Students can report inappropriate messages directly to the teacher via a "Report ⚠️" button.
- **🚫 Teacher Moderation**: New "Block & Delete" button in messages for instant action, plus a sliding report panel for resolving student reports.
- **🔄 Batch Training**: AI automatically retrains in background batches of 2 words with a visual progress indicator.
- **🛡️ Safe Shutdown**: Application prevents accidental closure during active AI training cycles to ensure data integrity.
- **✨ UI Polish**: Smooth slide-away animations for resolved reports and improved icon feedback (🚫 and 👌).
- **💾 Settings Persistence**: AI Filter mode (Legacy/Advanced/Deep Learning) is now saved across sessions.

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
- **Linux AppImage**: `ClassSend-8.4-temp-x64.AppImage`
- **Linux Zip**: `ClassSend-linux-x64-8.4-temp.zip`
- **Windows Installer (64-bit)**: `ClassSend-8.4-temp Setup.exe`
- **Windows Portable (64-bit)**: `ClassSend-win32-x64-8.4-temp.zip`

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
    *   **New in v9.3.1**: Students now periodically probe this history every 10 seconds while waiting in the Lobby, so they will auto-connect even if the Teacher starts ClassSend *after* the students.

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
