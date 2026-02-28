# Release Notes

## [10.2.1-beta] - 2026-02-28
### IMPROVEMENTS
- **Documentation**: Updated README and help documentation for clarity.
- **App Cards Fixes**: Resolved layout and state issues in the student monitoring grid.
- **Launching Improvements**: Enhanced application execution reliability from the teacher console.
- **UI Enhancements**: Refined the modern glassmorphism pill designs and animations.
- **Asset Fixes**: Resolved 404 error by restoring missing `lock-svgrepo-com.svg` asset.

## [10.2.0-beta.1] - 2026-02-28
### NEW
- **Monitor Focus Controls**: Added individual Lock, App Focus, and Remote Launch pill controls to the focused monitoring view.
- **Individual Targeting**: Server-side support for targeting specific students with lock, focus, and launch commands (no longer just class-wide broadcast).
- **Favorites Integration**: Quick-access favorite apps now available directly within the student focus view.
- **Improved UI**: Modern glassmorphism pill design for focus mode controls with smooth transition animations.

## [10.1.0] - 2026-02-28
### NEW
- **Beta Release**: Updated version and preparing for beta branch deployment.

## [10.0.1] - 2026-02-28
### FIXES
- **Translation Fixes**: Corrected missing and incorrect translations across the application.
- **Label Wording Fixes**: Updated label wording for clarity and consistency.

## [10.0.0] - 2026-02-27
### FIXES
- **Advanced Filtering**: Resolved core logic issues to ensure stable profanity detection.
- **Sensitivity Controls**: Added interactive sliders for "Warning" and "Block" thresholds in the moderation settings.
- **UI State**: Fixed a bug where teacher tools remained highlighted even when not active.

### NEW (Windows)
- **Student Monitoring**: Enhanced monitoring system that periodically sends low-resolution screenshots (5, 10, 15, 20 sec intervals).
- **Screen Lock**: Added "Κλείδωμα Οθόνης" - a full-screen, always-on-top plane to restrict student activity.
- **End of Day**: Implemented "Τερματισμός Τέλους Ημέρας" for bulk classroom termination.
- **Focus Mode**: Automatic window restoration from the system tray when focus is requested.
- **Automatic Downloads**: Predetermined download location support across all classroom PCs.

### COMING SOON
- **Remote Execution**: Direct application execution on all student PCs from the teacher console.


## [9.5.1] - 2026-02-25
### Added
- **Media Library Deletion**: Implemented both individual and library-wide media deletion with physical file removal.
- **Chat Sync**: Enhanced socket listeners to ensure file messages are removed from the chat UI immediately upon deletion.
- **Server Cleanup**: Updated server-side handlers to proactively clean up metadata and file-type messages when the library is cleared.

## [9.5.0] - 2026-02-25
### Added
- **Teacher Control**: Added ability to block student file uploads via teacher tools.
- **Media Library**: Teachers can now delete individual files from the shared media history.
- **Fullscreen Access**: Implemented fullscreen mode for all file viewers including Video, PDF, Word, Excel, and Images.
- **Maintenance**: General code cleanup, performance optimizations, and lazy loading implementation.

## [9.4.0] - 2026-02-21
### Added
- **System Messaging Redesign**: Completely overhauled the appearance of internal system messages (e.g. "User joined", "User left") to be contained within modern, centered pill designs. 
- **Dynamic Toasts**: Replaced bottom-floating, screen-blocking toasts with inline, color-coded notification pills that insert smoothly directly into the chat stream sequence.
- **File Transfer Progress Integration**: Unified the file upload and download indicator progress bars with the new "pill" design, creating a wholly consistent notification experience across the application.
- **Development Tools**: Added a hidden developer tools menu (Click the app logo in "About" 5 times) to simulate various UI components without needing multiple active device connections.

## [9.3.7] - 2026-02-20
- **Persisted Log Settings**: Log settings are now persisted across application restarts.
- **Persistent Media Library**: The media library is now saved to a "media" folder in the teacher's installation directory. Students mirror the teacher's media library, and all file transfers correspond directly with this folder.
- **Media Management**: The Media Library now features "Delete-Clear" and "Download All" buttons (available to teachers only).
- **Pinned Comments**: Improved UI and behavior for pinned messages, including better action button handling.
- **SVG Transition**: Replaced various action icons with premium SVG assets.
- **UI Enhancements**:
    - Added text labels to action buttons. The labels are placed on the right, keeping content on the left, with a smooth fade-out effect for overflowing content.
    - Updated message action buttons and new elements to use the same consistent styling, roundness, and colors.
    - Added progress bars to indicate when a file is being sent or received in the chat.
    - Consistent UI styling across all message types.
- **In-App Web Viewer**:
    - The "Link" button now opens websites securely in the internal web-viewer.
    - Added a full-screen option to the right side of the web-viewer controls.

## [9.3.5] - 2026-02-20
### Fixed
- **Auto-Connection**: Fixed a critical bug where the `joiningInProgress` lock was not cleared after joining the Lobby, permanently blocking automatic redirection to the teacher's server from history.
- **Version Update**: Internal consistency update for v9.3.5.
### Fixed
- **Class Duplication**: Fixed a bug where the same class could appear twice in the list (once from network, once from history), forcing the user to manually select it instead of auto-joining.
- **Hidden Lobby**: Ensured that internal "Lobby" classes are strictly hidden from the class list to prevent confusion.

### Added
- **Single Instance Lock**: Prevent multiple instances of the application. When clicking the shortcut while the app is active, the existing window is now restored and brought to focus.
- **Auto-Connect Enhancement**: Students now periodically check their history for known teachers while waiting in the Lobby. This ensures they connect automatically even if the teacher starts ClassSend after the students.


## [9.3.0] - 2026-02-18
### Added
- **SVG Transition**: Replaced emojis with high-quality SVG icons in file and web viewing panes for a more professional and consistent visual experience.
- **Improved Moderation UI**: The message area now dynamically darkens when "Block All" is active, providing clear visual feedback that communication is disabled.
- **Persistent Media Library**: Implemented a dedicated folder in the installation directory for file transfers, ensuring shared media persists across application restarts.
- **Enhanced Web Viewer**: Added partial fixes for the web viewer on non-Windows devices (tablets, etc.), improving accessibility outside the main desktop app.
- **Teacher Tool Menu**: Improved menu behavior; the tool menu now remains open after interaction (hand blocking, disabling, message blocking, screen sharing), allowing for multiple rapid adjustments.
- **Diagnostic Enhancements**:
    - Debugging logs are now enabled by default for easier troubleshooting.
    - Enhanced feedback for automatic scanning and connection status.
    - **Automatic Log Export**: The application now automatically exports logs to a text file in the user's directory upon startup and shutdown.
- **Connection Improvements**:
    - Resolved issues with automatic connection from history when podcasting is off.
    - The connection information popup now strictly respects the user's settings toggle.
- **Media Library Management**: Added a "Clear" button to easily manage and reset shared media files.

## [9.2.0] - 2026-02-16
### Added
- **Smart Auto-Connect**: The app now intelligently probes for known servers from history and handles offline/online states automatically, reducing the need for manual IP entry.
- **Auto-Setup**: First-time users are now automatically set to the "Student" role and taken directly to the class search screen, skipping the role selection step.
- **Auto-Delete System Messages**: System messages (User joined/left) now automatically fade out after 10 seconds to keep the chat clean.
- **Visual Timer**: A circular countdown timer appears on system messages before they disappear.
- **Refined Localization**:
    - **Themes**: Theme names now display correctly in the selected language (e.g., Greek).
    - **Connection Status**: Fixed an issue where the status text would revert to English when switching languages.
    - **Screen Share**: The "Share Screen" button text now updates dynamically when toggled or when the language changes.
- **Refined Name Generator**: The random name generator now produces grammatically correct adjectives and nouns in Greek.

## [9.1.2] - 2026-02-15
### Fixed
- **Email Display**: Fixed visual glitch where email addresses were broken by mention highlighting.
- **Email Action**: The "Email" button now correctly opens the default OS mail client.
- **Auto-Connect**: Improved reliability of auto-connection and retry logic.
- **Translations**: Added missing translations for action buttons (Copy, Pin, Block, Report, Email, Open).

## [9.0.1] - 2026-02-15
### Added
- **In-App Browser**: Replaced external link opening with a secure, modal web viewer to keep students focused within the app.
- **In-App Browser Controls**: Added navigation (Back, Forward, Refresh) to the internal web viewer.
- **Build Update**: Bug fixes and performance improvements.

## [9.0.0] - 2026-02-15
### Added
- **Dark Themes**: Introduced 4 new stunning dark themes: Deep Space, Neon Tokyo, Carbon, and Solar.
- **Persistent Media Library**: Uploaded files now persist in a `MediaLibrary` folder in the installation root.
- **Clear Data Feature**: Admin tool to delete all media files and reset server state.
- **Native Document Rendering**: Restored in-browser rendering for DOCX and XLSX files.
- **Text Overflow Fix**: Resolved issues with long message content breaking the layout.
- **Tray Fix**: The system tray "Close" button now correctly terminates the application.
- **UI Improvements**: Blurred communication interface for students who are blocked by the teacher.
- **Theme Selection Fix**: Resolved regression where themes were not clickable.

## [8.8.0] - 2026-02-15
### Maintenance
- **Version Correction**: Fixed a versioning mistake in the previous release.
- **General Stability**: Improvements to cleanup routines.

---

# Release Notes - v8.8

## 🧠 N-gram Classifier & Persistence
- **Greek Morphology Support**: The "Advanced" (Naive Bayes) filter now uses N-gram (trigram) tokenization. This allows it to detect variations of words (suffixes, prefixes) without needing every single form in the blacklist.
  - *Example*: Training on `βλάκας` now automatically helps detect `βλακέντιε` or `μαλάκες` from `μαλάκας`.
- **Model Persistence**: The trained AI model is now saved to `server/data/classifier-model.json`. It loads instantly on startup, preserving all "Learned" words from reports and teacher bans.
- **Pipeline Integration**: The N-gram classifier is now correctly invoked in the `send-message` pipeline when the class is in "Advanced" mode.

---

# Release Notes - v8.3.7
## 🔧 Maintenance
- **Stability**: Improvements to network discovery and file handling.

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

###  File Pinning (NEW)
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
