# ClassSend (v8.4.0 Latest)
**ClassSend** is a local network file sharing and chat application designed for classrooms. It allows teachers and students to communicate and share files instantly without needing an internet connection or external servers.

## 🚀 Latest Features (v8.4.0)
- **🌐 Smart IP Entry**: Manual connection now auto-detects network prefix and port.
- **🇬🇷 Greek Networking**: Full Greek localization for manual connection tools.
- **🛡️ Role-Aware UI**: Manual connection helper is automatically hidden for Teachers.
- **📥 Auto Backups**: Word lists are automatically backed up to the server.

## 🚀 Previous Features (v8.3.0)

## 🚀 Previous Features (v8.2.0)
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
- **Linux AppImage**: `ClassSend-7.0.1-x64.AppImage`
- **Linux Zip**: `ClassSend-linux-x64-7.0.1.zip`
- **Windows Installer (64-bit)**: `ClassSend-7.0.1 Setup.exe`
- **Windows Portable (64-bit)**: `ClassSend-win32-x64-7.0.1.zip`

## 🧠 Offline AI Setup (Required for Deep Learning)
The "Deep Learning" filter requires the `toxic-bert` model, which is excluded from this repository due to size limits.

To enable it:
1.  Download the **Xenova/toxic-bert** model (ONNX quantized) from Hugging Face.
2.  Place the files in: `server/models/Xenova/toxic-bert/onnx/`
3.  Ensure `model_quantized.onnx` is present in that folder.

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

This project was **vibecoded** using **Antigravity Gemini 3 Pro** and **Claude 4.5**, showcasing the capabilities and limitations of modern AI-assisted development.

### Architectural Evolution: Monolithic vs. Modular

During development, we attempted to transition from a **monolithic structure** to a more **modular architecture**. This experiment revealed interesting insights about AI-assisted development:

#### Monolithic Architecture
- **Challenge**: Memory and context window limitations with too many lines of code in single files
- **Impact**: As files grew larger, the AI models struggled to maintain full context
- **Result**: Slower development and increased error rates as codebase expanded

#### Modular Architecture
- **Advantages**: 
  - Files were coded **faster** with **fewer errors** initially
  - Clearer separation of concerns
  - Easier for AI to focus on individual components
- **Challenges**: 
  - **Lost connection context**: As the number of modules increased, the meaning and relationships between files became harder to track
  - **Integration complexity**: Understanding how components interact across multiple files proved difficult
  - **Context fragmentation**: AI models lost sight of the "big picture" when dealing with many small files

#### The Verdict

While both approaches presented challenges, we found that:
- **Errors increase** with codebase size **regardless of architecture**
- **Modular structure** enabled faster initial development and fewer syntax errors
- **Understanding and maintaining** a modular file structure proved **slightly more difficult** in the end
- **Context coherence**: The monolithic approach, despite its limitations, sometimes maintained better overall understanding of system state

This experience highlights an important consideration for AI-assisted development: **architectural choices should balance AI capabilities with human maintainability**. The "perfect" structure may depend on project size, team composition, and the specific AI tools being used.

### What We Learned
- AI coding assistants excel at **focused, well-defined tasks** in smaller files
- **Cross-file relationships** and **system-wide state** remain challenging for current AI models
- **Hybrid approaches** may be optimal: modular where possible, but not at the expense of coherence
- **Clear documentation** and **explicit interfaces** become even more critical with AI-assisted development
