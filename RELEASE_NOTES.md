# ClassSend Release Notes

## Version 3.9.1 (2025-11-27)

### Major Features

#### Smart Message Action Buttons
- **Mobile-Style Design**: Action buttons now appear inline on a second line within messages, similar to modern mobile messaging apps
- **Context-Aware Buttons**: Different buttons appear based on message content:
  - **Text Messages**: 📋 Copy to clipboard button (shows ✅ confirmation)
  - **Messages with Emails**: ✉️ Mailto button to open email client
  - **Messages with URLs**: 🔗 Open link button (opens in new tab)
  - **File Messages**: ⬇️ Download button
  - **Image Files**: 👁️ Open in viewer + ⬇️ Download buttons
- **Unified Style**: All buttons use consistent 28px height, rounded design, and smooth animations
- **Hover Effects**: Buttons fade in on hover (60% → 100% opacity) with scale animation

#### Enhanced File Upload System
- **Inline Upload Progress**: Progress bar now appears as a message bubble in the chat
  - Shows file name, size, and real-time upload percentage
  - Automatically disappears 1 second after completion
  - Smooth animated progress bar with status text
- **Increased File Size Limit**: Now supports files up to 10MB (increased from ~1MB)
- **File Size Validation**: Clear error messages for oversized files
- **Better Error Handling**: Improved feedback for upload failures

#### Improved Reliability
- **Grace Period for Disconnections**: 10-second grace period before deleting classes when teacher disconnects
  - Prevents class deletion during temporary network interruptions
  - Automatic reconnection without losing class data
  - Seamless file upload experience even with brief disconnections
- **Message Header Fix**: Sender names and timestamps now display correctly in all messages

### Technical Improvements
- Increased Socket.IO `maxHttpBufferSize` to 10MB for large file support
- Added URL detection with regex pattern matching
- Implemented proper event listeners for all action buttons (no inline onclick)
- Different icons for images (🖼️) vs documents (📄)
- Enhanced CSS with mobile-inspired button styles

### UI/UX Enhancements
- Cleaner message layout with inline action buttons
- Smaller, more compact button design
- Consistent spacing and sizing across all button types
- Smooth scale animations on button interactions
- Semi-transparent button backgrounds for modern look

---

## Version 3.9.0 (2025-11-26)

### New Features
- **Download All Button**: Added a convenient "Download All" button to the Media Library that allows users to download all shared files at once
  - Automatically disabled when no files are available
  - Downloads files sequentially with a 100ms delay to prevent browser blocking
  - Located in the Media Library header for easy access

### Improvements
- **Removed Class Badge**: Removed the redundant class badge from the top bar that had inconsistent hide behavior
  - Class name is still visible in the sidebar for context
  - Cleaner, more streamlined header design

### Technical Changes
- Updated UI components for better consistency
- Improved media library state management
- Enhanced download functionality with sequential file handling

---

## Version 3.8.1 (Previous Release)

### Features
- Real-time file sharing and messaging
- Class-based organization with join/leave functionality
- Media Library for viewing all shared files
- Drag-and-drop file upload support
- Emoji picker for messages
- User name customization
- Connection status indicator
- Mobile-responsive design with sidebar overlay
- Teacher and Student role separation
- Network discovery for easy class joining
- File download with individual file buttons

### User Interface
- Modern dark theme design
- Smooth animations and transitions
- Visual indicators for class membership (✅ joined, ➕ available)
- Hover effects for interactive elements
- Role-based color coding (Teachers: red, Students: green)

### Technical Features
- Socket.io for real-time communication
- Electron-based desktop application
- Local network file sharing
- Base64 file encoding for transfer
- Automatic reconnection handling
- Class persistence during reconnection

---

## Installation & Usage

1. Download the latest release for your platform
2. Run the ClassSend executable
3. Select your role (Teacher or Student)
4. Teachers: Create a class with a unique Class ID
5. Students: Join available classes from the list
6. Start sharing files and messages!

## System Requirements
- Windows (ia32/x64)
- Local network connection for multi-user functionality

## Known Issues
None reported for version 3.9.0

---

For more information, visit the [ClassSend GitHub Repository](https://github.com/kalotrapezis/ClassSend)
