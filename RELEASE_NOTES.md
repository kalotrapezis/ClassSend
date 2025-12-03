## Version 4.5.4 - Critical Bug Fixes & Gallery Enhancements
**Release Date:** December 3, 2025

### 🐛 Critical Bug Fixes

#### Filtering System Restored
- **Issue:** Content filtering system completely stopped working in the last build (v4.5.3)
- **Symptoms:** Inappropriate words were not being detected, send button remained enabled
- **Root Cause:** Script loading order issue caused filter initialization to fail
- **Solution:** Fixed script import sequence and dependency chain in `index.html`
- **Verification:** Tested with 2875+ filter words - all detection working correctly
- **Impact:** Content filtering now fully operational:
  - Real-time monitoring of message input
  - Automatic send button disable on inappropriate content
  - User warning messages displayed properly
  - Filter word loading confirmed on startup

#### Pinned Comments Action Buttons Fixed
- **Issue:** Action buttons (copy, email, link) were not appearing on pinned comments themselves
- **Previous Behavior:** Users had to scroll down to find the original message to use action buttons
- **New Behavior:** Pinned messages now display action buttons directly:
  - **📋 Copy Button** - Copy message content to clipboard
  - **✉️ Email Button** - Open mailto link (auto-detected from content)
  - **🔗 Link Button** - Open URL in new tab (auto-detected from content)
  - **❌ Unpin Button** - Remove pin (teacher only)
- **Benefits:**
  - No more scrolling to find original message
  - Quick access to common actions
  - Consistent UX with regular chat messages
  - Smart content detection for context-aware buttons

### ✨ New Features

#### Download All as ZIP (Alpha)
- **Feature:** Bulk download capability in Media Library/Gallery
- **Implementation:** Click "Download All" button to download all shared files as a single ZIP archive
- **Status:** Alpha - initial release for testing
- **Technical Details:**
  - Server-side ZIP creation using streaming compression
  - Automatic filename generation with class name and timestamp
  - Memory-efficient streaming for large file collections
  - Progress indication during download
- **Known Limitations (Alpha):**
  - Large file collections may take time to compress
  - Limited error handling for failed downloads
  - No resume capability for interrupted downloads
- **Future Improvements:**
  - Download progress percentage
  - Selective file download (choose which files to include)
  - Multiple archive format support (7z, tar.gz)

### 📁 File Changes

**Modified Files:**
- `client/index.html` - Fixed script loading order for content filter
- `client/src/main.js` - Enhanced `renderPinnedMessages()` with action buttons
- `server/index.js` - Added ZIP download endpoint and streaming logic
- `client/index.html` - Added Download All button to gallery section
- `server/package.json` - Version bump to 4.5.4

### 🔄 Upgrade Notes
- **Critical:** Clean install required due to filtering system changes
- Run `npm install` in server directory
- Rebuild client: `npm run build` in client directory
- Full application restart recommended to ensure all fixes are applied

### 📊 Statistics
- **Build time:** ~360ms (client)
- **Bundle size:** ~69 KB (JavaScript), ~24 KB (CSS)
- **Filter database:** 2875+ inappropriate words (multi-language)

### ⚠️ Known Issues
- Download All feature (alpha) may timeout on very large file collections (>500MB)
- ZIP compression is CPU-intensive and may briefly slow down the server

---

## Version 4.5.2 - Bug Fixes & Pinned Message Enhancements
**Release Date:** December 2, 2025

### 🐛 Bug Fixes

#### Word Filter Fixed
- **Issue:** Content filter was not working - inappropriate words were not being detected
- **Root Cause:** The `content-filter.js` file existed but was never imported in `index.html`
- **Solution:** Added missing script import to enable word filtering functionality
- **Impact:** Word filter now properly:
  - Loads 2875+ filter words on startup
  - Monitors message input in real-time
  - Disables send button when inappropriate content detected
  - Shows warning message to users
  - Flags users who attempt inappropriate content

### ✨ Enhancements

#### Pinned Message Action Buttons
- **Feature:** Added action buttons directly to pinned messages displayed at top of chat
- **Previous Behavior:** Users had to scroll to find original message to interact with it
- **New Behavior:** Pinned messages now include:
  - **📋 Copy Button** - Copy message content to clipboard
  - **✉️ Email Button** - Open mailto link (auto-detected)
  - **🔗 Link Button** - Open URL in new tab (auto-detected)
  - **❌ Unpin Button** - Remove pin (teacher only)
- **Benefits:**
  - Quick access to common actions without scrolling
  - Consistent UX with regular messages
  - Smart detection of URLs and emails

### 📁 File Changes

**Modified Files:**
- `client/index.html` - Added content-filter.js script import
- `client/main.js` - Enhanced renderPinnedMessages() with action buttons
- `server/package.json` - Version bump to 4.5.2

### 🔄 Upgrade Notes
- Clean install recommended: `npm install` in server directory
- Rebuild required: Run `npm run build` in client directory
- Restart application to see all fixes

### 📊 Statistics
- **Build time:** ~360ms (client)
- **Bundle size:** 68.56 KB (JavaScript), 23.98 KB (CSS)

---

## Version 4.5.1 - Build Configuration Fix
**Release Date:** November 29, 2025

###  Bug Fixes
- Fixed Electron Forge build configuration
- Corrected icon path in package.json (setupIcon now points to ./assets/icon.ico)
- Ensured proper icon.ico file in public directory for builds
- Clean rebuild of all executables with correct version numbering

###  Distributables
- **Windows 64-bit Setup:** ClassSend-4.5.1 Setup.exe (143.36 MB)
- **Windows 64-bit ZIP:** ClassSend-win32-x64-4.5.1.zip (146.7 MB)
- **Windows 32-bit Setup:** ClassSend-4.5.1 Setup-x32.exe
- **Windows 32-bit ZIP:** ClassSend-win32-ia32-4.5.1.zip

---
# ClassSend Release Notes

## Version 4.5.0 - Hand-Raising & UI Improvements
**Release Date:** November 29, 2025

### 🎉 Major Features

#### Hand-Raising System
Students can now signal teachers they want to speak with a new hand-raising feature:
- **Student Interface**: Hand-raise button (🖐️) next to message input area
  - Click to raise hand, click again to lower
  - Button shows active state with pulse animation when raised
- **Teacher Interface**: Visual indicators and controls
  - Hand icon (🖐️) appears next to students who raised their hands
  - Animated waving hand icon for visual feedback
  - "Hands Down" button to reset all raised hands at once
- **Real-time Updates**: Hand states sync instantly across all connected clients
- **State Persistence**: Hand-raising state persists when switching between classes

### 🎨 UI/UX Improvements

#### Sidebar Enhancements
- **Increased width** from 300px to 350px for better spacing
- Improved button layout in users header
- Better accommodation for teacher control buttons

#### User List Refinements
- **Removed duplicate role text** - cleaner user display
- **Fixed button positioning** - "Block All" and "Hands Down" buttons no longer conflict
- Better visual hierarchy with proper spacing

#### Visual Polish
- Pulse animation for active hand-raise button
- Waving animation for raised hand indicators
- Smooth transitions and hover effects
- Consistent styling across all new components

### 🔧 Technical Improvements

#### Server-Side
- New socket event handlers:
  - `raise-hand` - Toggle individual student hand state
  - `lower-hand` - Lower specific student's hand
  - `lower-all-hands` - Teacher-only bulk hand reset
- Added `handRaised` property to user objects
- Real-time state broadcasting to all class participants

#### Client-Side
- Integrated hand-raising with existing user management
- Dynamic button visibility based on user role
- Proper state management across class switches
- Optimized re-rendering for performance

#### Electron App
- **Fixed tray icon** - Now properly displays ClassSend icon
- Changed from `tray.png` to `icon.ico` for better compatibility
- Resolved "Tray icon is empty" warning

### 📁 File Changes

**Modified Files:**
- `server/index.js` - Socket handlers and user state management
- `server/electron-main.js` - Tray icon path fix
- `client/index.html` - Hand-raise and hands-down button elements
- `client/main.js` - Event handlers and user list rendering
- `client/style.css` - Styling for all new components and sidebar width
- `server/package.json` - Version bump to 4.5.0
- `client/package.json` - Version bump to 4.5.0

### 🐛 Bug Fixes
- Fixed duplicate student name display in user list
- Fixed "Block All" button displacement issue
- Resolved tray icon loading error
- Corrected button layout conflicts in users header

### 💡 Usage

**For Students:**
1. Click the hand icon (🖐️) at the bottom of the chat to raise your hand
2. Your name will show a waving hand icon to the teacher
3. Click again to lower your hand

**For Teachers:**
1. See hand icons next to students who raised their hands
2. Click "Hands Down" button to reset all raised hands
3. Button only appears when at least one hand is raised

### 🔄 Upgrade Notes
- Clean install recommended: `npm install` in both client and server directories
- Rebuild required: Run `npm run build` in client directory
- Restart Electron app to see tray icon fix

### 📊 Statistics
- **Lines of code added:** ~250
- **New socket events:** 3
- **New UI components:** 2 buttons + hand icon indicators
- **CSS animations:** 2 (pulse, wave)
- **Build time:** ~370ms (client)
- **Bundle size:** 66.96 KB (JavaScript), 23.98 KB (CSS)

---

## Version 4.3.0 - Previous Release
Content filtering, smart action buttons, and enhanced media management.

---

## Version 4.0.0 - Previous Release
Advanced content filtering and smart action buttons.

---

**Full Changelog:** [View on GitHub](https://github.com/kalotrapezis/ClassSend/compare/v4.3.0...v4.5.0)

