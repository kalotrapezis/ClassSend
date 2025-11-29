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
