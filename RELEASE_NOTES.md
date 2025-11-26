# ClassSend Release Notes

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
