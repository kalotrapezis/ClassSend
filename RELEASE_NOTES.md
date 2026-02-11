# Release Notes - v8.7.3

## 🛠️ Connection Stability & UX Polish
- **Role Selection Polish**: Clicking "Change Role" in settings now shows the selection card in-place without a page reload, preventing race conditions where the app auto-selected student on slow machines.
- **SmartIP Connection Retries**: Increased connection timeout to 2s with 3 automatic retries per server for greater reliability in busy school networks.
- **History Link Fix**: The "Connect" button in the connection history list now correctly performs a full page redirect with identity parameters (`role`, `name`).
- **Debugging Tools**: Added `server/debug.bat` (visible console) and `server/debug_log.bat` (outputs logs + system info to `%USERPROFILE%\ClassSend_debug_log.txt`) for easier troubleshooting on deployed PCs.
- **Network Compatibility**: Relaxed CSP headers to ensure reliable connections when the app is accessed via different IP addresses or hostnames.

---

# Release Notes - v8.7.2

## 🛠️ Randomizer & Nickname Localization
- **Greek Nicknames Fixed**: Fixed an issue where the nickname randomizer defaulted to English even when the interface was set to Greek.
- **Improved Randomization**: The "Regenerate Name" button now correctly respects the current application language.

---

# Release Notes - v8.7.1

## ⚡ Reliability & Path Handling
- **Path Improvements**: Enhanced cross-platform path handling for configuration and data files.
- **Model Loading**: Improved robust model discovery for offline AI filtering.

---

# Release Notes - v8.7.0

## 🚀 Student-First Experience & Debug Tools

### 🎓 Smart Default Role
- **Student-First**: The application now defaults to the **Student** role on launch, bypassing the role selection screen to get students into class faster.
- **Teacher Switch**: Easily switch to Teacher mode via the **Settings > Personalization** menu.
- **Saved Roles**: Your last used role is remembered for future sessions.

### 🖼️ UI Refinements & Fixes
- **Modern Branding**: Replaced the generic rocket emoji with the official application logo (`icon.ico`) on the About page.
- **Enhanced Icons**: Replaced the "Block Messages" tool icon with a cleaner, more intuitive SVG asset.

### 🛠️ Hidden Debug Unlock
- **Troubleshooting Power**: Introducing a hidden debug mechanism for advanced users and support.
- **5-Click Activation**: Rapidly click the application icon on the **About** page 5 times to instantly unlock all hidden settings (System, Data, Streaming) and enable session logs, regardless of your current role.

---

# Release Notes - v8.6.0

## 🌐 Smart Network Improvements

### 🧠 Intelligent IP History
- **Smart Learning**: ClassSend now keeps track of servers you've successfully connected to in the past.
- **Auto-Retry**: If the automatic network discovery fails (common on some restricted Wi-Fi networks), the app automatically checks your history and reconnects you to known classes.

### 🛡️ Cross-Network Identity
- **Seamless Role Switching**: Fixed a bug where switching between different server IPs (e.g., WiFi to Hotspot) would make the app forget your Role (Student/Teacher). Your identity now travels with you!
- **Identity Transfer**: Securely passes your role and name when redirecting to a remote class, ensuring you land in the chat immediately without needing to re-select your role.

### 🛠️ Developer
- **Discovery API**: Added a new lightweight API endpoint for faster server probing and diagnostics.

---

# Release Notes - v8.5.0

## 🎨 Visual Overhaul & Media Support

### 🖼️ Enhanced File Icons
- **SVG Integration**: Replaced all generic file type emojis with high-quality SVG icons for a cleaner, more professional look.
- **Specific Media Icons**: Added dedicated icons for **Audio** (`.mp3`, `.wav`) and **Video** (`.mp4`, `.avi`) files, making it easier to identify media at a glance.
- **Application Support**: Added specific icons for executables and installers (`.exe`, `.apk`).

### 📱 Tablet Optimization
- **Image Viewer Fixes**: The image viewer is now properly sized for tablet screens, ensuring the close button and zoom controls are always accessible.
- **Better Zoom Controls**: Zoom In/Out buttons are now larger, centered, and have better visibility with a frosted glass background.

### 🛠️ Usability Improvements
- **Teacher Tools Menu**: Consolidated all teacher actions (Share Screen, Block Messages, etc.) into a convenient popup menu for cleaner UI.
- **Minimize Wrappers**: Added "Minimize" buttons to both Image and PDF viewers, allowing you to keep files open in the background while chatting.

### Fixed
- **Network Discovery**: Fixed an issue where classes with Greek/Latin characters were not discoverable by students.
- **Background**: Fixed `bonjour` hostname generation for non-Latin names and implemented Base64 encoding for class lists.
- **Minimize Buttons**: Fixed Minimize buttons for Video and PDF viewers.

---

# Release Notes - v8.4.0

## 🚀 Smart Connectivity & UI Polish

### 🌐 Smart IP Entry (Manual Connection)
- **Auto-Detection**: The manual connection screens now intelligently detect your local network prefix and pre-fill it for you (e.g., `192.168.1.`).
- **Port Visibility**: The current server port is now visible and automatically handled during manual connection, ensuring you always connect to the right place.
- **Unified Helper**: The Smart IP tool is now available both in the "Available Classes" screen and directly within the **Connection Info** modal for instant access.
- **Greek Localization**: Full Greek translations added for the entire Smart IP feature set.

### 🛡️ Smart UI & Role Awareness
- **Teacher Polish**: Manual connection tools are automatically hidden when logged in as a **Teacher**, keeping the interface clean and focused.
- **Improved Overlay**: The "Searching for Class..." overlay is now constrained to the chat area, ensuring header buttons (Settings, Connection Info) remain clickable while searching.

### 📥 Automated Word List Backups
- **Server-Side Backups**: Word lists are now automatically backed up to the server whenever a teacher switches roles or exits. No more manual CSV downloads required!
- **Auto-Pruning**: The server intelligently keeps the last 10 backups to save space while ensuring your data is safe.

---

# Release Notes - v8.3.1

## 🛠️ Critical Fixes & Improvements

### 📥 Import/Export Reliability
- **Smart Import Refresh**: Fixed an issue where imported word lists would not appear immediately in the settings. The app now intelligently forces a refresh from the server to ensure all imported words are visible and ready for export.
- **Unified List Import**: Importing a single file now correctly populates both the **Blacklist** and **Whitelist** simultaneously.
- **Crash Prevention**: Resolved a server crash that occurred during the import process due to missing callbacks.

### 🔄 Role Switching Stability
- **Clean State Transitions**: Fixed potential state leakage when switching between Teacher and Student roles, ensuring a fresh session every time.

---

# Release Notes - v8.3.0

## 🧪 Advanced Automation & Testing

### 🏗️ E2E Testing Suite (Playwright)
- **Comprehensive Coverage**: Added automated end-to-end tests for Connection, Messaging, Class Flow, and Role Management.
- **Load Testing**: Verified server stability with 5-10 concurrent virtual clients.
- **Filter Tuning**: Specific tests to verify AI sensitivity levels (Strict/Lenient) and Teacher warnings for borderline content.

### ⚙️ Dynamic UI Enhancements
- **Auto-Version Injection**: The "About" page now pulls the version number automatically from `package.json` during the build process. No more manual HTML updates!
- **Vite Build Integration**: Optimized the build pipeline to define global app constants.

---

# Release Notes - v8.2.5

## 🚀 Streamlined Network & Stability

### ⚡ Direct Network Flow
- **No More Lobby**: We've simplified the connection process. Teachers now skip the Lobby and directly create a class. Students automatically scan for available classes.
- **Smart Auto-Join**: If only one class is found, students join it automatically for a seamless experience.

### 🛡️ Crash Prevention & Fixes
- **Block All Sync**: The "Block All Communications" button now correctly reflects the active state when joining or refreshing.
- **Single Class Protection**: Prevents accidental deletion or leaving of the class if it's the only one active, avoiding application crashes.
- **Role Switch Stability**: Fixed a critical crash during role switching by handling missing socket callbacks on the server.
- **Clean State Reload**: Implemented a full application reload when changing roles to ensure a completely clean environment and prevent state residues (like blocked message status).

---

# Release Notes - v8.2.0

## 🚀 Enhancements & Polish

### 🌐 Localization & UI
- **Full Greek Localization in Gallery**: Added missing Greek translations for the Media Library title and empty state.
- **Improved i18n Coverage**: Ensured UI consistency when switching languages.

### ⚙️ Settings Synchronization
- **Teacher-Student Sync**: Verified that critical settings like Language and Filter Mode are correctly synchronized from the teacher to all students in the class.

---

# Release Notes - v8.1.1

## 🚀 Streamlined Lobby & Localization

### 🖥️ Auto-Lobby Flow
- **Direct Entry**: Both Teachers and Students now skip the class setup screen and join a shared "Lobby" immediately after role selection.
- **Auto-Generated Identity**: Users receive a random temporary name instantly, reducing friction for first-time use.
- **Consolidated Connection**: Fixed issues where teachers and students would end up in different "rooms," ensuring everyone lands in the Lobby by default.

### ⚙️ Persistence & Rename
- **Saved Class Names**: Teachers can rename the Lobby, and this name is now saved locally. Upon return, the app automatically takes over the Lobby and restores the saved class name.

### 🌍 Enhanced Greek Localization
- **100% Translated Settings**: The entire settings menu, including advanced AI filtering and administration tools, is now fully localized in Greek.
- **Localized Placeholders**: Improved hint text and placeholders in Greek for better usability.

### 🛠️ Fixes
- **Tablet Discovery**: Resolved discovery issues on mobile devices that prevented them from seeing or joining classes automatically.
- **Version Clarity**: Updated all info panels to correctly reflect version 8.1.1.

---

# Release Notes - v8.1.0

## 🚀 Enhancements & Polish

### 🖥️ Improved User Experience
- **Custom Splash Screen**: The application now starts with a custom-branded animation, replacing the default "green" installer experience.
- **No Menu Bar**: The top menu bar has been removed for a cleaner, more immersive app interface.
- **Desktop Shortcut**: The installer now automatically creates a desktop shortcut for easier access.

### ⚙️ New Settings
- **Open on Startup**: Added a new "Start on Login" toggle in the Administration settings. Teachers can now choose to have ClassSend launch automatically when they log in to Windows.

### 🛠️ Fixes
- **Startup Stability**: Resolved issues where the app would restart or loop during the initial launch.
- **Visual Improvements**: Fixed the "green flash" during startup by syncing the window background color with the dark theme.

---

# Release Notes - v7.2.0
## ✨ UI Redesign & UX Improvements
This release focuses on a major UI overhaul of the Media Library and Settings modal.

### 📋 Media Library List View
- **Redesigned Layout**: Switched from cards to a horizontal list layout matching the User List.
- **Pill Shape**: Items now use a modern pill shape with glassmorphism (blur) effects.
- **Quick Actions**: "Pin" and "Download" buttons are now neatly grouped on the right.
- **Better Alignment**: File name and metadata (size/sender) are horizontal for better space utilization.

### ⚙️ Redesigned Settings Modal
- **Categorized Sidebar**: Added a sidebar to the settings modal for better organization (Personalization, Moderation, Connection, etc.).
- **Smooth Navigation**: Fast tab switching with clear SVG icons for each category.
- **About Page**: Updated with version information and a direct link to GitHub Releases.

### ⚡ Technical Improvements
- **CSS Versioning**: Added version query strings to CSS links to force cache refreshes.
- **Consolidated Styles**: Cleaned up conflicting CSS to ensure a consistent look and feel.

### 🚫 Moderation Updates
- **Blacklist Terminology**: Renamed "dictionary" to "Blacklist" throughout the app for clarity.
- **Whitelist Renaming**: Renamed "Good List" to "Whitelist" to match industry standard terminology.
- **Priority Filtering**: Whitelisted words now bypass ALL filters (including AI and Blacklist), ensuring safe words are never blocked.
- **Auto-Cleanup**: Adding a word to the Whitelist automatically removes it from the Blacklist.

### 🐛 Bug Fixes
- **Message Blocking**: Fixed a critical bug where approving a report would not delete the message from the chat.
- **Toast Notifications**: Repositioned notifications to the bottom-center for better visibility and less obstruction.
- **Client Validation**: Fixed an issue where the client would show a warning for whitelisted words even if they were allowed by the server.

---

# Release Notes - v7.0.1
## 📦 Offline AI & Engine Improvements
ClassSend is now fully optimized for offline use and modern hardware!

### 🌍 Truly Offline AI
- **Bundled Model**: The Deep Learning AI model (`~100MB`) is now embedded directly inside the application.
- **No Internet Required**: ClassSend detects the bundled model and loads it instantly from your local disk, requiring **zero** internet connection at runtime.
- **Fail-Safe**: Smart fallback logic ensures the app keeps working even if the model files are moved or corrupted.

### 🛠️ Architecture Upgrade (x64)
- **64-bit Exclusive**: We have upgraded the Windows build to **64-bit (x64)** to fully leverage modern processors and RAM for AI tasks.
- **Native Performance**: Native modules (`sharp`, `onnxruntime`) are now properly compiled and unpacked, resolving all previous "missing module" errors.
- **Concurrency Fix**: Fixed a race condition where quickly toggling the filter could cause silent failures.

### 🔍 Debugging Tools
- **Deep Server Logs**: Server-side model loading logs are now piped directly to the client's debug console, giving you full visibility into what the AI engine is doing.

---

# Release Notes - v7.0.0

## 🚀 Major Features

### 3-Layer AI Filtering Architecture
We've completely overhauled the content filtering engine to provide three distinct levels of security:
- **Legacy (Fast)**: Standard client-side blacklist filtering for older devices.
- **Advanced (Adaptive)**: Server-side Naive Bayes classification that learns from your corrections.
- **Deep Learning (Smart)**: **New** integration of `Toxic-BERT` (via Transformers.js) for human-like understanding of context, insults, and harassment.

### ⚙️ Customizable Model Sensitivity
Teachers are now in full control of the AI's behavior:
- **Blocking Sensitivity**: Set how strict the model should be when blocking messages (10% - 100%).
- **Reporting Sensitivity**: Configure the threshold for flagging suspicious content for review.
- **Defaults**: Tuned for optimal safety (10% Blocking, 90% Reporting).

### 🛡️ Role-Based Interface
- **student View**: Simplified interface hiding all administrative settings (Streaming, Data, Filtering). Students only see Language options.
- **Teacher View**: Full control panel with automatic setting synchronization to all connected students.

### 📋 Enhanced List Management
- **Good List (Whitelist)**: Explicitly allow safe words that might otherwise be flagged.
- **Blacklist (Forbidden)**: Add custom words to be blocked instantly.
- **Data Portability**: Import and Export both lists as JSON files to share between classrooms.

### ⚡ Performance & Privacy
- **Memory-Only Logs**: Application logs are now stored in RAM and automatically cleared when the app closes, ensuring privacy and reducing disk usage.
- **Optimized MobileBERT**: The Deep Learning model is optimized for minimal resource usage while maintaining high accuracy.

---

# Release Notes - v6.7.0

## 🚀 New Features

### 🧠 Deep Learning Profanity Filter (NEW)
Experience the next level of classroom moderation with our context-aware AI.
- **Transformers.js Integration**: Uses state-of-the-art Deep Learning (`toxic-bert`) to detect toxicity, insults, and harassment with high accuracy.
- **Tiered Response System**: 
  - **Auto-Block**: Messages with >90% toxicity are automatically blocked.
  - **Self-Learning**: Suspicious words from blocked messages are automatically extracted and added to the blacklist.
  - **Teacher Reporting**: Borderline messages (60-90%) are flagged for teacher review in the report panel.
- **Dynamic Loading**: The AI model (~108MB) is loaded on-demand with a visual progress bar, ensuring the app remains lightweight when the filter is not in use.

### 🛡️ Enhanced Moderation & Training
- **Naive Bayes Refinement**: Improved the core "Advanced" filter with better Greek/English training data and batch processing (2 words at a time).
- **Safe State Management**: The application now prevents closure during active AI training cycles to protect your model's data integrity.
- **Greek Localization**: Full Greek translations for all new AI settings and notifications.

### 🐛 Bug Fixes
- **Socket Callbacks**: Fixed a critical "callback is not a function" error that could crash the server when specific settings were changed.
- **UI Consistency**: Fixed the hamburger menu behavior and sidebar overlay to remain consistent across desktop and mobile views.

---

# Release Notes - v6.5.0

## 🚀 Improvements & Fixes

### 📺 Optimized Streaming (NEW)
Experience smoother screen sharing with significantly reduced delay.
- **Latency Optimization**: Disabled forced VP9 codec in favor of more efficient defaults (VP8/H.264), reducing CPU load and lag.
- **Adaptive Bitrates**: Tuned streaming bitrates for different network conditions (Auto/WiFi) to minimize buffering and drops.

### ⚙️ Enhanced Settings & Diagnostics (NEW)
New tools for teachers to manage the classroom and debug issues.
- **Session Logs**: Teachers can now view, copy, and download real-time application logs directly from the "Advanced" settings section.
- **Blacklist Portability**: Added ability to **Import** and **Export** the custom forbidden words list (JSON format) for easy backup or sharing between classes.

### 🐛 Critical Bug Fixes
- **Server Stability**: Fixed a critical `EPIPE` error that could cause the server to crash when logging output in certain environments.

---

# Release Notes - v6.2.0

## 🚀 New Features

### 💾 Smart Persistence (NEW)
Your information is now remembered for a smoother experience.
- **Auto-Fill Class Setup**: Class ID and Your Name are saved and automatically pre-filled when you return to the setup screen.
- **Language Sync**: When a teacher changes the interface language, it automatically updates for all students in the class instantly.
- **Clear Data**: A new "Clear Saved Data" option in Settings lets you easily wipe stored credentials.

### � File Pinning (NEW)
Keep important documents front and center.
- **Pin Files**: Teachers can now pin important files in the Media Library. Pinned files appear at the top of the list with a highlighted border and pin icon.
- **Visual Indicators**: Clear visual distinction for pinned vs. regular files.

### 🖐️ Enhanced Status Visibility (NEW)
Better awareness of classroom state for everyone.
- **Visible Status Icons**: Students can now see who has their hand raised (🖐️) and who is blocked (🔇) directly in the user list.
- **Improved Feedback**: Users now see a "🔒 Blocked" status when the teacher has blocked all users, even if no students are currently in the class.

## 🐛 Bug Fixes
- **Hamburger Menu**: Fixed an issue where the dark overlay would incorrectly cover header buttons on some screens.
- **Overlay Behavior**: The menu overlay now only appears on mobile/tablet screens where the sidebar slides over content, and stays hidden on desktop.

---

# Release Notes - v6.1.0

## 🚀 New Features

### 🎨 Improved UI & Tablet Support (NEW)
- **Tablet Optimization**: The sidebar is now collapsible on all devices (including desktop and tablet) via the hamburger menu (`☰`).
- **Responsive Layout**: Fixed layout issues ("squished" view) when video is active.
- **Enhanced Video Controls**: Zoom, Fullscreen, and Minimize controls are now always visible and easier to use in the video modal.
- **Pan & Drag**: When zoomed in on a screen share, you can now click and drag to move the video around.

---
