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
