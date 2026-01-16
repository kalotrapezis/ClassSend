import { io } from "socket.io-client";

// Connect to server dynamically - works for both localhost and LAN
const serverUrl = window.location.origin;
const socket = io(serverUrl);

console.log(`Connecting to ClassSend server at: ${serverUrl}`);


// State
let currentRole = null; // 'teacher' or 'student'
let userName = null;
let currentClassId = null;
let joinedClasses = new Map(); // classId -> { messages: [], users: [], teacherName: string }
let availableClasses = []; // [{ id, teacherName }]

// DOM Elements - Screens
const roleSelection = document.getElementById("role-selection");
const classSetup = document.getElementById("class-setup");
const availableClassesScreen = document.getElementById("available-classes");
const chatInterface = document.getElementById("chat-interface");

// DOM Elements - Setup
const setupTitle = document.getElementById("setup-title");
const classIdInput = document.getElementById("class-id-input");
const userNameInput = document.getElementById("user-name-input");
const btnSubmitSetup = document.getElementById("btn-submit-setup");
const btnBack = document.getElementById("btn-back");
const btnBackFromClasses = document.getElementById("btn-back-from-classes");

// DOM Elements - Available Classes
const availableClassesList = document.getElementById("available-classes-list");



// DOM Elements - Chat
const classesListContainer = document.querySelector(".classes-list");
const userNameBtn = document.getElementById("user-name-btn");
const userNameDropdown = document.getElementById("user-name-dropdown");
const newNameInput = document.getElementById("new-name-input");
const btnChangeName = document.getElementById("btn-change-name");
const messagesContainer = document.getElementById("messages-container");
const messageInput = document.getElementById("message-input");
const btnSendMessage = document.getElementById("btn-send-message");
const btnAttachFile = document.getElementById("btn-attach-file");
const fileInput = document.getElementById("file-input");
const usersList = document.getElementById("users-list");
const userCount = document.getElementById("user-count");
const connectionStatus = document.getElementById("connection-status");

// Hand-Raising Elements
const btnRaiseHand = document.getElementById("btn-raise-hand");
const btnHandsDown = document.getElementById("btn-hands-down");

// Media History
const mediaList = document.getElementById("media-list");
const btnMediaToggle = document.getElementById("btn-media-toggle");
const mediaPopup = document.getElementById("media-popup");
const btnShowUrl = document.getElementById("btn-show-url");

// Connection Info Modal
const connectionModal = document.getElementById("connection-modal");
const btnCloseConnection = document.getElementById("btn-close-connection");
const connectionUrl = document.getElementById("connection-url");
const btnCopyUrl = document.getElementById("btn-copy-url");
const hostnameToggle = document.getElementById("hostname-toggle");

let serverInfo = null; // { ip, port, hostname }

if (btnShowUrl) {
    btnShowUrl.addEventListener("click", () => {
        // Close Media Library if open
        mediaPopup.classList.add("hidden");

        socket.emit("get-server-info", { classId: currentClassId }, (info) => {
            serverInfo = info;
            updateConnectionUrl();
            connectionModal.classList.remove("hidden");
        });
    });
}

function updateConnectionUrl() {
    if (!serverInfo) return;

    let url = "";
    if (hostnameToggle.checked && serverInfo.hostname) {
        url = `http://${serverInfo.hostname}:${serverInfo.port}`;
    } else {
        url = `http://${serverInfo.ip}:${serverInfo.port}`;
    }
    connectionUrl.textContent = url;
}

hostnameToggle.addEventListener("change", updateConnectionUrl);

btnCopyUrl.addEventListener("click", async () => {
    const url = connectionUrl.textContent;
    try {
        await navigator.clipboard.writeText(url);
        const originalText = btnCopyUrl.textContent;
        btnCopyUrl.textContent = "✅";
        setTimeout(() => {
            btnCopyUrl.textContent = originalText;
        }, 1500);
    } catch (err) {
        console.error("Failed to copy: ", err);
    }
});

btnCloseConnection.addEventListener("click", () => {
    connectionModal.classList.add("hidden");
});

// Close modal when clicking outside
connectionModal.addEventListener("click", (e) => {
    if (e.target === connectionModal) {
        connectionModal.classList.add("hidden");
    }
});

// Emoji Picker
const btnEmoji = document.getElementById("btn-emoji");
const emojiPicker = document.getElementById("emoji-picker");
const emojis = [
    "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃",
    "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙",
    "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔",
    "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥",
    "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮",
    "🤧", "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "😎", "🤓",
    "🧐", "😕", "😟", "🙁", "😮", "😯", "😲", "😳", "🥺", "😦",
    "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣", "😞",
    "😓", "😩", "😫", "🥱", "😤", "😡", "😠", "🤬", "😈", "👿",
    "💀", "☠️", "💩", "🤡", "👹", "👺", "👻", "👽", "👾", "🤖",
    "👋", "🤚", "🖐", "✋", "🖖", "👌", "🤏", "✌️", "🤞", "🤟",
    "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍", "👎",
    "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏",
    "✍️", "💅", "🤳", "💪", "🦾", "🦿", "🦵", "🦶", "👂", "🦻",
    "👃", "🧠", "🫀", "🫁", "🦷", "🦴", "👀", "👁", "👅", "👄"
];

// Initialize Emoji Picker
function initEmojiPicker() {
    emojiPicker.innerHTML = "";
    emojis.forEach(emoji => {
        const span = document.createElement("span");
        span.textContent = emoji;
        span.classList.add("emoji-item");
        span.addEventListener("click", () => {
            insertEmoji(emoji);
            emojiPicker.classList.add("hidden");
        });
        emojiPicker.appendChild(span);
    });
}

initEmojiPicker();

btnEmoji.addEventListener("click", (e) => {
    e.stopPropagation();
    emojiPicker.classList.toggle("hidden");
});

document.addEventListener("click", (e) => {
    if (!btnEmoji.contains(e.target) && !emojiPicker.contains(e.target)) {
        emojiPicker.classList.add("hidden");
    }
});

function insertEmoji(emoji) {
    const start = messageInput.selectionStart;
    const end = messageInput.selectionEnd;
    const text = messageInput.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);
    messageInput.value = before + emoji + after;
    messageInput.selectionStart = messageInput.selectionEnd = start + emoji.length;
    messageInput.focus();
}

// Hamburger Menu & Mobile Sidebar
const btnMenuToggle = document.getElementById("btn-menu-toggle");
const sidebarLeft = document.getElementById("sidebar-left");
const sidebarOverlay = document.getElementById("sidebar-overlay");

if (btnMenuToggle) {
    btnMenuToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        sidebarLeft.classList.toggle("active");
        sidebarOverlay.classList.toggle("active");
    });
}

if (sidebarOverlay) {
    sidebarOverlay.addEventListener("click", () => {
        sidebarLeft.classList.remove("active");
        sidebarOverlay.classList.remove("active");
    });
}

// Close sidebar when selecting a class on mobile
function closeMobileSidebar() {
    if (window.innerWidth <= 768) {
        sidebarLeft.classList.remove("active");
        sidebarOverlay.classList.remove("active");
    }
}

// Media Modal Toggle
const btnCloseMedia = document.getElementById("btn-close-media");
const btnDownloadAll = document.getElementById("btn-download-all");

btnMediaToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    // Close Connection Modal if open
    connectionModal.classList.add("hidden");
    mediaPopup.classList.remove("hidden");
});

btnCloseMedia.addEventListener("click", () => {
    mediaPopup.classList.add("hidden");
});

// Download All Files
btnDownloadAll.addEventListener("click", () => {
    if (!currentClassId || !joinedClasses.has(currentClassId)) return;

    const messages = joinedClasses.get(currentClassId).messages;
    const fileMessages = messages.filter(msg => msg.type === 'file');

    if (fileMessages.length === 0) return;

    // Download each file with a small delay to avoid browser blocking
    fileMessages.forEach((msg, index) => {
        setTimeout(() => {
            downloadFile(msg.fileData.data, msg.fileData.name);
        }, index * 100); // 100ms delay between downloads
    });
});

// Close modal when clicking outside the content (on the backdrop)
mediaPopup.addEventListener("click", (e) => {
    if (e.target === mediaPopup) {
        mediaPopup.classList.add("hidden");
    }
});

// Socket Connection
socket.on("connect", () => {
    connectionStatus.classList.remove("disconnected");
    connectionStatus.classList.add("connected");
    connectionStatus.textContent = "Connected";
    connectionStatus.title = "Connected";

    // Re-join if we were in a class
    if (currentClassId && userName) {
        console.log("Reconnecting to class", currentClassId);
        joinClass(currentClassId, userName);
    }

    // Refresh active classes
    socket.emit("get-active-classes");
});

socket.on("disconnect", () => {
    connectionStatus.classList.remove("connected");
    connectionStatus.classList.add("disconnected");
    connectionStatus.textContent = "Disconnected";
    connectionStatus.title = "Disconnected";
});

socket.on("active-classes", (classes) => {
    availableClasses = classes;
    if (currentRole) {
        renderSidebar();
    }
    // Update available classes screen if student is viewing it
    if (currentRole === 'student' && !availableClassesScreen.classList.contains('hidden')) {
        renderAvailableClasses();
    }
});

// Hand-Raising Socket Events
socket.on("hand-raised", ({ userId, handRaised, users, classId }) => {
    if (joinedClasses.has(classId)) {
        const classData = joinedClasses.get(classId);
        classData.users = users;
        if (currentClassId === classId) {
            renderUsersList();
        }

        if (userId === socket.id && btnRaiseHand) {
            btnRaiseHand.classList.toggle("active", handRaised);
            btnRaiseHand.title = handRaised ? "Lower Hand" : "Raise Hand";
        }
    }
});

socket.on("hand-lowered", ({ userId, users, classId }) => {
    if (joinedClasses.has(classId)) {
        const classData = joinedClasses.get(classId);
        classData.users = users;
        if (currentClassId === classId) {
            renderUsersList();
        }

        if (userId === socket.id && btnRaiseHand) {
            btnRaiseHand.classList.remove("active");
            btnRaiseHand.title = "Raise Hand";
        }
    }
});

socket.on("all-hands-lowered", ({ users, classId }) => {
    if (joinedClasses.has(classId)) {
        const classData = joinedClasses.get(classId);
        classData.users = users;
        if (currentClassId === classId) {
            renderUsersList();
        }

        if (btnRaiseHand) {
            btnRaiseHand.classList.remove("active");
            btnRaiseHand.title = "Raise Hand";
        }
    }
});

// Role Selection
document.getElementById("btn-teacher").addEventListener("click", () => {
    currentRole = "teacher";
    showClassSetup();
});

document.getElementById("btn-student").addEventListener("click", () => {
    currentRole = "student";
    showClassSetup();
});

function showClassSetup() {
    roleSelection.classList.add("hidden");
    classSetup.classList.remove("hidden");

    if (currentRole === "teacher") {
        setupTitle.textContent = "Create Class";
        btnSubmitSetup.textContent = "Create Class";
        // Show Class ID input for teachers
        classIdInput.parentElement.style.display = 'flex';
    } else {
        setupTitle.textContent = "Enter Your Name";
        btnSubmitSetup.textContent = "Continue";
        // Hide Class ID input for students
        classIdInput.parentElement.style.display = 'none';
    }
}

btnBack.addEventListener("click", () => {
    classSetup.classList.add("hidden");
    roleSelection.classList.remove("hidden");
    currentRole = null;
    classIdInput.value = "";
    userNameInput.value = "";
});

btnBackFromClasses.addEventListener("click", () => {
    availableClassesScreen.classList.add("hidden");
    classSetup.classList.remove("hidden");
});

// Class Setup Submit
btnSubmitSetup.addEventListener("click", () => {
    const enteredUserName = userNameInput.value.trim();

    if (!enteredUserName) return alert("Please enter your name");

    userName = enteredUserName;

    if (currentRole === "teacher") {
        const enteredClassId = classIdInput.value.trim();
        if (!enteredClassId) return alert("Please enter a Class ID");

        // If already joined, just switch
        if (joinedClasses.has(enteredClassId)) {
            switchClass(enteredClassId);
            return;
        }

        socket.emit("create-class", { classId: enteredClassId, userName }, (response) => {
            if (response.success) {
                joinedClasses.set(enteredClassId, {
                    messages: [],
                    users: [{ id: socket.id, name: userName, role: "teacher" }],
                    teacherName: userName,
                    blockedUsers: new Set() // Initialize empty blocked users set
                });

                // Update UI with user name immediately
                userNameBtn.textContent = `${userName} ▼`;

                switchClass(enteredClassId);
            } else {
                alert(response.message);
            }
        });
    } else {
        // Student: show available classes screen
        classSetup.classList.add("hidden");
        availableClassesScreen.classList.remove("hidden");
        // Request active classes from server
        socket.emit("get-active-classes");
        renderAvailableClasses();
    }
});

// Render Available Classes for Students
function renderAvailableClasses() {
    availableClassesList.innerHTML = "";

    if (availableClasses.length === 0) {
        availableClassesList.innerHTML = `
            <div class="empty-state">
                <div class="spinner"></div>
                <div>No classes available. Waiting for teacher...</div>
            </div>`;
        return;
    }

    availableClasses.forEach(classInfo => {
        const classCard = document.createElement("div");
        classCard.classList.add("available-class-card");

        classCard.innerHTML = `
            <div class="class-card-icon">📚</div>
            <div class="class-card-info">
                <div class="class-card-name">${escapeHtml(classInfo.id)}</div>
                <div class="class-card-teacher">Teacher: ${escapeHtml(classInfo.teacherName)}</div>
            </div>
            <button class="class-card-join-btn">Join →</button>
        `;

        classCard.addEventListener("click", () => {
            joinClass(classInfo.id, userName);
        });

        availableClassesList.appendChild(classCard);
    });
}

function joinClass(classIdToJoin, nameToUse) {
    socket.emit("join-class", { classId: classIdToJoin, userName: nameToUse }, (response) => {
        if (response.success) {
            joinedClasses.set(classIdToJoin, {
                messages: response.messages || [],
                users: response.users || [],
                teacherName: response.users.find(u => u.role === 'teacher')?.name || 'Unknown',
                blockedUsers: new Set(response.blockedUsers || []) // Store blocked users
            });
            switchClass(classIdToJoin);
        } else {
            alert(response.message);
        }
    });
}

function switchClass(id) {
    currentClassId = id;
    classSetup.classList.add("hidden");
    availableClassesScreen.classList.add("hidden");
    chatInterface.classList.remove("hidden");

    userNameBtn.textContent = `${userName} ▼`;

    renderSidebar();
    renderMessages();
    renderUsersList();
    renderMediaHistory(); // Render media history
    messageInput.focus();

    closeMobileSidebar(); // Close sidebar on mobile

    // Update dictionary button visibility for teacher
    if (typeof updateDictionaryButtonVisibility === 'function') {
        updateDictionaryButtonVisibility();
    }
}

function deleteClass(id) {
    if (!confirm(`Are you sure you want to DELETE class ${id}? This will remove the class for everyone.`)) return;

    socket.emit("delete-class", { classId: id }, (response) => {
        if (response.success) {
            joinedClasses.delete(id);
            if (currentClassId === id) {
                currentClassId = null;
                // If no classes left, go back to setup
                if (joinedClasses.size === 0) {
                    chatInterface.classList.add("hidden");
                    classSetup.classList.remove("hidden");
                    // Reset to role selection if completely empty? Or stay in setup?
                    // Requirement: "returns the app state to the class creation"
                    // Let's go back to role selection to be safe/clean
                    classSetup.classList.add("hidden");
                    roleSelection.classList.remove("hidden");
                    currentRole = null;
                } else {
                    switchClass(joinedClasses.keys().next().value);
                }
            } else {
                renderSidebar();
            }
        } else {
            alert(response.message);
        }
    });
}

function leaveClass(id) {
    if (!confirm(`Are you sure you want to leave ${id}?`)) return;

    socket.emit("leave-class", { classId: id }, (response) => {
        if (response.success) {
            joinedClasses.delete(id);
            if (currentClassId === id) {
                currentClassId = null;
                // If no classes left, go back to setup
                if (joinedClasses.size === 0) {
                    chatInterface.classList.add("hidden");
                    classSetup.classList.remove("hidden");
                } else {
                    // Switch to first available class
                    switchClass(joinedClasses.keys().next().value);
                }
            } else {
                renderSidebar();
            }
        }
    });
}

function renderSidebar() {
    classesListContainer.innerHTML = "";

    // Combine joined and available classes
    const allClassIds = new Set([...joinedClasses.keys(), ...availableClasses.map(c => c.id)]);

    allClassIds.forEach(id => {
        const isActive = id === currentClassId;
        // Robust check: We are joined if it's in the map OR if it's the currently active class
        const isJoined = joinedClasses.has(id) || isActive;

        const item = document.createElement("div");
        item.classList.add("class-item");
        if (isActive) item.classList.add("active");
        if (isJoined) item.classList.add("joined");

        // Determine if I am the teacher
        let isTeacher = false;
        if (joinedClasses.has(id)) {
            const classData = joinedClasses.get(id);
            const users = classData.users || [];
            isTeacher = users.find(u => u.id === socket.id && u.role === 'teacher');
        } else if (isActive) {
            // Fallback: if we are in the class but not in map (rare), use currentRole
            isTeacher = (currentRole === 'teacher');
        }

        // Icon logic
        let leftIcon = '';
        let rightIcon = '';

        if (isJoined) {
            // Show checkmark for joined classes
            leftIcon = `<span class="class-icon status-icon joined-icon">✅</span>`;

            if (isTeacher) {
                rightIcon = `<span class="class-icon status-icon delete-icon" title="Delete Class" style="margin-left: auto;">🗑️ Delete</span>`;
            } else {
                rightIcon = `<span class="class-icon status-icon leave-icon" title="Leave Class" style="margin-left: auto;">❌ Leave</span>`;
            }
        } else {
            leftIcon = `<span class="class-icon status-icon">➕</span>`;
        }

        item.innerHTML = `
            ${leftIcon}
            <span class="class-name">${escapeHtml(id)}</span>
            ${rightIcon}
        `;

        // Click handlers
        if (isJoined) {
            item.addEventListener("click", (e) => {
                if (e.target.classList.contains("leave-icon")) {
                    e.stopPropagation();
                    leaveClass(id);
                } else if (e.target.classList.contains("delete-icon")) {
                    e.stopPropagation();
                    deleteClass(id);
                } else {
                    switchClass(id);
                }
            });
        } else {
            item.addEventListener("click", () => {
                if (userName) {
                    joinClass(id, userName);
                } else {
                    alert("Please setup your name first");
                }
            });
        }

        classesListContainer.appendChild(item);
    });
}


// User Name Change
userNameBtn.addEventListener("click", () => {
    userNameDropdown.classList.toggle("hidden");
    if (!userNameDropdown.classList.contains("hidden")) {
        newNameInput.value = "";
        newNameInput.focus();
    }
});

btnChangeName.addEventListener("click", () => {
    const newName = newNameInput.value.trim();
    if (!newName) return alert("Please enter a new name");
    if (newName === userName) {
        userNameDropdown.classList.add("hidden");
        return;
    }

    // Change name in ALL joined classes? Or just current?
    // Requirement says "names are editable", implies global identity for the user session.
    // We'll iterate and emit for all joined classes.
    // Actually server handles it per class. Let's just do it for current class for now or all?
    // Simpler: Change for current class.
    if (!currentClassId) return;

    socket.emit("change-user-name", { classId: currentClassId, newName }, (response) => {
        if (response.success) {
            userName = newName;
            userNameBtn.textContent = `${userName} ▼`;
            userNameDropdown.classList.add("hidden");
            // Update local state
            if (joinedClasses.has(currentClassId)) {
                const classData = joinedClasses.get(currentClassId);
                const me = classData.users.find(u => u.id === socket.id);
                if (me) me.name = newName;
            }
        } else {
            alert(response.message);
        }
    });
});

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
    if (!userNameBtn.contains(e.target) && !userNameDropdown.contains(e.target)) {
        userNameDropdown.classList.add("hidden");
    }
});

// Send Message
function sendMessage() {
    const content = messageInput.value.trim();
    if (!content) return;
    if (!currentClassId) return;

    socket.emit("send-message", {
        classId: currentClassId,
        content,
        type: "text"
    });

    messageInput.value = "";
    messageInput.focus();
}

btnSendMessage.addEventListener("click", sendMessage);

messageInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// File Attachment
btnAttachFile.addEventListener("click", () => {
    fileInput.click();
});

fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!currentClassId) return;

    // Warn for files > 500MB
    const MAX_RECOMMENDED_SIZE = 500 * 1024 * 1024; // 500MB
    if (file.size > MAX_RECOMMENDED_SIZE) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(0);
        if (!confirm(`This file is ${sizeMB}MB. Large files may take a while to upload and download. Continue?`)) {
            fileInput.value = "";
            return;
        }
    }

    // Use HTTP upload with XHR for progress tracking
    uploadFileXHR(file);
    fileInput.value = "";
});

// XHR File Upload with Progress
function uploadFileXHR(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('classId', currentClassId);
    formData.append('userName', userName);
    formData.append('socketId', socket.id);
    formData.append('role', currentRole);

    const xhr = new XMLHttpRequest();

    // Show Progress Modal
    const progressModal = document.getElementById('progress-modal');
    const progressTitle = document.getElementById('progress-title');
    const progressBar = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const btnCancel = document.getElementById('btn-cancel-progress');

    progressTitle.textContent = `Uploading ${file.name}...`;
    progressBar.style.width = '0%';
    progressText.textContent = '0%';
    progressModal.classList.remove('hidden');

    // Cancel Button
    btnCancel.onclick = () => {
        xhr.abort();
        progressModal.classList.add('hidden');
        alert('Upload cancelled');
    };

    // Progress Event
    xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            progressBar.style.width = percentComplete + '%';
            progressText.textContent = percentComplete + '%';
        }
    };

    // Load/Error/Abort Events
    xhr.onload = () => {
        progressModal.classList.add('hidden');
        if (xhr.status === 200) {
            try {
                const result = JSON.parse(xhr.responseText);
                console.log('File uploaded successfully:', result.fileId);
            } catch (e) {
                console.error('Error parsing response:', e);
            }
        } else {
            console.error('Upload failed:', xhr.statusText);
            alert(`Upload failed: ${xhr.statusText}`);
        }
    };

    xhr.onerror = () => {
        progressModal.classList.add('hidden');
        console.error('Upload error');
        alert('Upload failed due to network error');
    };

    xhr.open('POST', '/api/upload', true);
    xhr.send(formData);
}


// Hand-Raising Buttons
if (btnRaiseHand) {
    btnRaiseHand.addEventListener("click", () => {
        if (!currentClassId) return;
        socket.emit("raise-hand", { classId: currentClassId });
    });
}

if (btnHandsDown) {
    btnHandsDown.addEventListener("click", () => {
        if (!currentClassId) return;
        socket.emit("lower-all-hands", { classId: currentClassId });
    });
}

// Drag-and-Drop File Upload
let dragCounter = 0;

// Create drag overlay
const dragOverlay = document.createElement('div');
dragOverlay.className = 'drag-overlay hidden';
dragOverlay.innerHTML = `
    <div class="drag-overlay-content">
        <div class="drag-icon">📁</div>
        <div class="drag-text">Drop files here to send</div>
    </div>
`;
document.body.appendChild(dragOverlay);

// Prevent default drag behavior and handle drag-and-drop
document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter++;
    if (currentClassId && chatInterface && !chatInterface.classList.contains('hidden')) {
        dragOverlay.classList.remove('hidden');
    }
}, false);

document.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter--;
    if (dragCounter === 0) {
        dragOverlay.classList.add('hidden');
    }
}, false);

document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
}, false);

document.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounter = 0;
    dragOverlay.classList.add('hidden');

    if (!currentClassId) return;
    if (chatInterface.classList.contains('hidden')) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Send each file via HTTP
    for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('classId', currentClassId);
        formData.append('userName', userName);
        formData.append('socketId', socket.id);
        formData.append('role', currentRole);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Upload failed');
            }

            const result = await response.json();
            console.log('File uploaded successfully:', result.fileId);
        } catch (error) {
            console.error('Upload error:', error);
            alert(`Failed to upload ${file.name}: ${error.message}`);
        }
    }
}, false);


// Receive Message
socket.on("new-message", (message) => {
    if (joinedClasses.has(message.classId)) {
        joinedClasses.get(message.classId).messages.push(message);
        if (currentClassId === message.classId) {
            renderMessage(message);
            scrollToBottom();
            if (message.type === 'file') {
                renderMediaHistory(); // Update history on new file
            }
        }
    }
});

function renderMessages() {
    messagesContainer.innerHTML = "";
    if (!currentClassId || !joinedClasses.has(currentClassId)) return;

    const messages = joinedClasses.get(currentClassId).messages;
    messages.forEach(msg => renderMessage(msg));
    scrollToBottom();
}

function renderMessage(message) {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message");

    if (message.type === "file") {
        const isImage = message.fileData.type && message.fileData.type.startsWith('image/');

        messageDiv.innerHTML = `
      <div class="message-header">
        <span class="message-sender ${message.senderRole}">${escapeHtml(message.senderName)}</span>
        <span class="message-time">${formatTime(message.timestamp)}</span>
      </div>
      <div class="file-message">
        <span class="file-icon">${isImage ? '🖼️' : '📄'}</span>
        <div class="file-info">
          <div class="file-name">${escapeHtml(message.fileData.name)}</div>
          <div class="file-size">${formatFileSize(message.fileData.size)}</div>
          <div class="message-actions">
            ${isImage ? '<button class="action-btn open-btn" title="Open Image">👁️</button>' : ''}
            <button class="action-btn download-btn" title="Download">⬇️</button>
          </div>
        </div>
      </div>
    `;

        // Add event listeners
        const downloadBtn = messageDiv.querySelector('.download-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => downloadFile(message.fileData.id || message.fileData.data, message.fileData.name));
        }

        if (isImage) {
            const openBtn = messageDiv.querySelector('.open-btn');
            if (openBtn) {
                openBtn.addEventListener('click', () => {
                    const win = window.open();
                    win.document.write(`<img src="${message.fileData.data}" style="max-width:100%; height:auto;" />`);
                });
            }
        }
    } else {
        const contentWithMentions = highlightMentions(message.content);

        // Detect URLs
        const urlRegex = /(https?:\/\/[^\s]+)/gi;
        const hasUrl = urlRegex.test(message.content);

        // Detect emails
        const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
        const hasEmail = emailRegex.test(message.content);

        messageDiv.innerHTML = `
      <div class="message-header">
        <span class="message-sender ${message.senderRole}">${escapeHtml(message.senderName)}</span>
        <span class="message-time">${formatTime(message.timestamp)}</span>
      </div>
      <div class="message-content">
        ${contentWithMentions}
        <div class="message-actions">
          <button class="action-btn copy-btn" title="Copy">📋</button>
          ${hasEmail ? '<button class="action-btn mailto-btn" title="Email">✉️</button>' : ''}
          ${hasUrl ? '<button class="action-btn url-btn" title="Open Link">🔗</button>' : ''}
          ${currentRole === 'teacher' ? `<button class="action-btn pin-action-btn" data-message-id="${message.id}" title="Toggle Pin">📌</button>` : ''}
        </div>
      </div>
    `;

        // Copy button
        const copyBtn = messageDiv.querySelector('.copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(message.content);
                    copyBtn.textContent = '✅';
                    setTimeout(() => copyBtn.textContent = '📋', 1500);
                } catch (err) {
                    alert('Failed to copy');
                }
            });
        }

        // Mailto button
        if (hasEmail) {
            const mailtoBtn = messageDiv.querySelector('.mailto-btn');
            if (mailtoBtn) {
                mailtoBtn.addEventListener('click', () => {
                    const emails = message.content.match(emailRegex);
                    if (emails) window.location.href = `mailto:${emails[0]}`;
                });
            }
        }

        // URL button
        if (hasUrl) {
            const urlBtn = messageDiv.querySelector('.url-btn');
            if (urlBtn) {
                urlBtn.addEventListener('click', () => {
                    const urls = message.content.match(urlRegex);
                    if (urls) window.open(urls[0], '_blank');
                });
            }
        }
    }

    messagesContainer.appendChild(messageDiv);

    // Pin button toggle for teachers
    if (currentRole === 'teacher') {
        const pinBtn = messageDiv.querySelector('.pin-action-btn');
        if (pinBtn) {
            pinBtn.addEventListener('click', () => {
                const msgId = parseFloat(pinBtn.dataset.messageId);
                const isPinned = pinnedMessages.some(m => m.id === msgId);
                isPinned ? unpinMessage(msgId) : pinMessage(msgId);
            });
        }
    }
}

function renderMediaHistory() {
    mediaList.innerHTML = "";
    if (!currentClassId || !joinedClasses.has(currentClassId)) {
        mediaList.innerHTML = '<div class="empty-media-state">No media shared yet</div>';
        btnDownloadAll.disabled = true;
        return;
    }

    const messages = joinedClasses.get(currentClassId).messages;
    const fileMessages = messages.filter(msg => msg.type === 'file');

    if (fileMessages.length === 0) {
        mediaList.innerHTML = '<div class="empty-media-state">No media shared yet</div>';
        btnDownloadAll.disabled = true;
        return;
    }

    // Enable download all button
    btnDownloadAll.disabled = false;

    // Show newest first
    fileMessages.slice().reverse().forEach(msg => {
        const item = document.createElement("div");
        item.classList.add("media-item");
        item.innerHTML = `
            <div class="media-icon">📄</div>
            <div class="media-info">
                <div class="media-name" title="${escapeHtml(msg.fileData.name)}">${escapeHtml(msg.fileData.name)}</div>
                <div class="media-meta">
                    <span>${formatFileSize(msg.fileData.size)}</span>
                    <span>${msg.senderName}</span>
                </div>
            </div>
            <button class="media-download-btn" title="Download" onclick="downloadFile('${msg.fileData.id || msg.fileData.data}', '${escapeHtml(msg.fileData.name)}')">
                ⬇️
            </button>
        `;
        mediaList.appendChild(item);
    });
}

function highlightMentions(text) {
    // Escape HTML first
    let escaped = escapeHtml(text);
    // Then highlight @mentions
    return escaped.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Users List
function renderUsersList() {
    usersList.innerHTML = "";
    if (!currentClassId || !joinedClasses.has(currentClassId)) {
        userCount.textContent = "0";
        return;
    }

    const classData = joinedClasses.get(currentClassId);
    const users = classData.users;
    const blockedUsers = classData.blockedUsers || new Set();
    const isTeacher = currentRole === 'teacher';

    userCount.textContent = users.length;

    // Add teacher controls header if teacher
    if (isTeacher) {
        const usersHeader = document.querySelector('#users-header-container h3');
        // Remove existing controls if any
        const existingControls = document.querySelector('.teacher-controls');
        if (existingControls) existingControls.remove();

        const controls = document.createElement('div');
        controls.className = 'teacher-controls';
        controls.style.cssText = 'display: flex; gap: 8px; margin-left: auto;';

        // Check if all students are blocked
        const students = users.filter(u => u.role === 'student');
        const allBlocked = students.length > 0 && students.every(s => blockedUsers.has(s.id));

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'toggle-block-all-btn';
        toggleBtn.style.cssText = 'padding: 6px 12px; font-size: 0.9rem; cursor: pointer; background: rgba(0,0,0,0.3); color: white; border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; display: flex; align-items: center; gap: 6px; transition: background 0.2s;';

        if (allBlocked) {
            toggleBtn.innerHTML = '✅ Unblock All';
            toggleBtn.title = 'Unblock All Students';
            toggleBtn.onclick = (e) => {
                e.stopPropagation();
                socket.emit('unblock-all-users', { classId: currentClassId });
            };
        } else {
            toggleBtn.innerHTML = '⛔ Block All';
            toggleBtn.title = 'Block All Students';
            toggleBtn.onclick = (e) => {
                e.stopPropagation();
                socket.emit('block-all-users', { classId: currentClassId });
            };
        }

        toggleBtn.onmouseover = () => toggleBtn.style.background = 'rgba(0,0,0,0.5)';
        toggleBtn.onmouseout = () => toggleBtn.style.background = 'rgba(0,0,0,0.3)';

        controls.appendChild(toggleBtn);

        if (usersHeader && usersHeader.parentElement) {
            usersHeader.parentElement.style.display = 'flex';
            usersHeader.parentElement.style.alignItems = 'center';
            usersHeader.parentElement.appendChild(controls);
        }
    }

    users.forEach(user => {
        const userDiv = document.createElement("div");
        userDiv.classList.add("user-item");

        const isBlocked = blockedUsers.has(user.id);
        const isStudent = user.role === 'student';

        // Add blocked class if user is blocked
        if (isBlocked) {
            userDiv.classList.add('blocked');
        }

        const handIcon = user.handRaised ? ' <span class="hand-raised-icon">🖐️</span>' : '';

        userDiv.innerHTML = `
            <span class="user-status"></span>
            <span class="user-name">${escapeHtml(user.name)}</span>${handIcon}
        `;

        // Add block/unblock button for teachers (only for students)
        if (isTeacher && isStudent) {
            const blockBtn = document.createElement('button');
            blockBtn.textContent = isBlocked ? '✅' : '⛔';
            blockBtn.title = isBlocked ? 'Unblock user' : 'Block user';
            blockBtn.style.cssText = 'margin-left: auto; padding: 2px 6px; font-size: 0.9rem; cursor: pointer; background: transparent; border: none;';
            blockBtn.onclick = (e) => {
                e.stopPropagation();
                if (isBlocked) {
                    socket.emit('unblock-user', { classId: currentClassId, userId: user.id });
                } else {
                    socket.emit('block-user', { classId: currentClassId, userId: user.id });
                }
            };
            userDiv.appendChild(blockBtn);
        }

        usersList.appendChild(userDiv);
    });

    // Show/hide hands-down button for teachers
    if (btnHandsDown && isTeacher) {
        const students = users.filter(u => u.role === 'student');
        const anyHandRaised = students.some(s => s.handRaised);
        if (anyHandRaised) {
            btnHandsDown.classList.remove("hidden");
        } else {
            btnHandsDown.classList.add("hidden");
        }
    }

    // Show/hide raise-hand button based on role
    if (btnRaiseHand) {
        if (currentRole === 'student') {
            btnRaiseHand.classList.remove("hidden");
        } else {
            btnRaiseHand.classList.add("hidden");
        }
    }
}

function tagUser(name) {
    const currentValue = messageInput.value;
    const mention = `@${name} `;

    // Add mention at cursor position or end
    if (currentValue.endsWith(" ") || currentValue === "") {
        messageInput.value = currentValue + mention;
    } else {
        messageInput.value = currentValue + " " + mention;
    }

    messageInput.focus();
}

// Socket Events - User Management
socket.on("user-joined", ({ user, users: updatedUsers, classId }) => {
    if (joinedClasses.has(classId)) {
        joinedClasses.get(classId).users = updatedUsers;
        if (currentClassId === classId) {
            renderUsersList();

            const systemMsg = {
                senderName: "System",
                senderRole: "system",
                content: `${user.name} joined the class`,
                timestamp: new Date().toISOString(),
                type: "text"
            };
            renderMessage(systemMsg); // Just render, don't save system messages for now? Or save?
            // Better to not save system messages in history for simplicity or save them?
            // Let's just render them ephemerally for now as they are not in DB.
            scrollToBottom();
        }
    }
});

socket.on("user-left", ({ user, users: updatedUsers, classId }) => {
    if (joinedClasses.has(classId)) {
        joinedClasses.get(classId).users = updatedUsers;
        if (currentClassId === classId) {
            renderUsersList();

            const systemMsg = {
                senderName: "System",
                senderRole: "system",
                content: `${user.name} left the class`,
                timestamp: new Date().toISOString(),
                type: "text"
            };
            renderMessage(systemMsg);
            scrollToBottom();
        }
    }
});

socket.on("user-name-changed", ({ oldName, newName, users: updatedUsers, classId }) => {
    if (joinedClasses.has(classId)) {
        joinedClasses.get(classId).users = updatedUsers;
        if (currentClassId === classId) {
            renderUsersList();

            const systemMsg = {
                senderName: "System",
                senderRole: "system",
                content: `${oldName} changed their name to ${newName}`,
                timestamp: new Date().toISOString(),
                type: "text"
            };
            renderMessage(systemMsg);
            scrollToBottom();
        }
    }
});

socket.on("class-ended", ({ message, classId }) => {
    if (joinedClasses.has(classId)) {
        alert(message || `Class ${classId} has ended`);
        joinedClasses.delete(classId);
        if (currentClassId === classId) {
            currentClassId = null;
            if (joinedClasses.size > 0) {
                switchClass(joinedClasses.keys().next().value);
            } else {
                chatInterface.classList.add("hidden");
                // Reset to role selection
                classSetup.classList.add("hidden");
                roleSelection.classList.remove("hidden");
                currentRole = null;
            }
        } else {
            renderSidebar();
        }
    }
});

// Blocking Events
socket.on('user-blocked', ({ userId, classId }) => {
    if (joinedClasses.has(classId)) {
        const classData = joinedClasses.get(classId);
        if (!classData.blockedUsers) classData.blockedUsers = new Set();
        classData.blockedUsers.add(userId);

        if (currentClassId === classId) {
            renderUsersList();
            updateChatInputState();
        }
    }
});

socket.on('user-unblocked', ({ userId, classId }) => {
    if (joinedClasses.has(classId)) {
        const classData = joinedClasses.get(classId);
        if (classData.blockedUsers) {
            classData.blockedUsers.delete(userId);
        }

        if (currentClassId === classId) {
            renderUsersList();
            updateChatInputState();
        }
    }
});

socket.on('all-users-blocked', ({ blockedUserIds, classId }) => {
    if (joinedClasses.has(classId)) {
        const classData = joinedClasses.get(classId);
        classData.blockedUsers = new Set(blockedUserIds);

        if (currentClassId === classId) {
            renderUsersList();
            updateChatInputState();
        }
    }
});

socket.on('all-users-unblocked', ({ classId }) => {
    if (joinedClasses.has(classId)) {
        const classData = joinedClasses.get(classId);
        classData.blockedUsers = new Set();

        if (currentClassId === classId) {
            renderUsersList();
            updateChatInputState();
        }
    }
});

// Update chat input state based on blocked status
function updateChatInputState() {
    if (!currentClassId || !joinedClasses.has(currentClassId)) return;

    const classData = joinedClasses.get(currentClassId);
    const blockedUsers = classData.blockedUsers || new Set();
    const isBlocked = blockedUsers.has(socket.id);

    const inputs = [messageInput, btnSendMessage, btnAttachFile, btnEmoji];

    if (isBlocked) {
        inputs.forEach(el => {
            if (el) {
                el.disabled = true;
                el.style.opacity = '0.5';
                el.style.cursor = 'not-allowed';
            }
        });
        messageInput.placeholder = "You are blocked from chatting.";
    } else {
        inputs.forEach(el => {
            if (el) {
                el.disabled = false;
                el.style.opacity = '1';
                el.style.cursor = '';
            }
        });
        messageInput.placeholder = "Type a message...";
    }
}

// Utility Functions
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// Global function for file download
// Global function for file download with progress
window.downloadFile = function (fileIdOrData, fileName) {
    // Check if it's base64 data (legacy)
    if (fileIdOrData.startsWith('data:')) {
        const a = document.createElement('a');
        a.href = fileIdOrData;
        a.download = fileName;
        a.click();
        return;
    }

    // Use XHR for download progress
    const xhr = new XMLHttpRequest();
    const url = `/api/download/${fileIdOrData}`;

    // Show Progress Modal
    const progressModal = document.getElementById('progress-modal');
    const progressTitle = document.getElementById('progress-title');
    const progressBar = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const btnCancel = document.getElementById('btn-cancel-progress');

    progressTitle.textContent = `Downloading ${fileName}...`;
    progressBar.style.width = '0%';
    progressText.textContent = '0%';
    progressModal.classList.remove('hidden');

    // Cancel Button
    btnCancel.onclick = () => {
        xhr.abort();
        progressModal.classList.add('hidden');
    };

    xhr.responseType = 'blob'; // Important for binary files

    xhr.onprogress = (event) => {
        if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            progressBar.style.width = percentComplete + '%';
            progressText.textContent = percentComplete + '%';
        } else {
            // If total size is unknown, show indeterminate state
            progressBar.style.width = '100%';
            progressText.textContent = 'Downloading...';
            progressBar.classList.add('indeterminate');
        }
    };

    xhr.onload = () => {
        progressModal.classList.add('hidden');
        if (xhr.status === 200) {
            const blob = xhr.response;
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(downloadUrl);
            }, 100);
        } else {
            console.error('Download failed:', xhr.status);
            alert('Download failed');
        }
    };

    xhr.onerror = () => {
        progressModal.classList.add('hidden');
        console.error('Download network error');
        alert('Download failed due to network error');
    };

    xhr.open('GET', url, true);
    xhr.send();
};


// Connection Test (Ping)
setInterval(() => {
    if (!socket.connected) return;

    const start = Date.now();
    const timeout = setTimeout(() => {
        console.warn("Ping timed out!");
    }, 1000);

    socket.emit('ping', () => {
        clearTimeout(timeout);
        const latency = Date.now() - start;
        console.log(`Ping: ${latency}ms`);
    });
}, 5000);
// Content Filtering Module
// Add this to the end of main.js

// Helper to remove accents/diacritics
function normalizeText(text) {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Load filter words on startup
let filterWords = [];
let flaggedUsers = new Set();
let currentUserFlagged = false;

fetch('/filter-words.json')
    .then(response => response.json())
    .then(words => {
        // Store normalized versions of words
        filterWords = words.map(w => normalizeText(w));
        console.log(`✅ Loaded ${filterWords.length} filter words (normalized)`);
    })
    .catch(err => console.error('Failed to load filter words:', err));

// Check if text contains inappropriate words
// Levenshtein distance for fuzzy matching
function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    // increment along the first column of each row
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    // increment each column in the first row
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1 // deletion
                    )
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

// Check if text contains inappropriate words (Exact + Fuzzy)
function containsInappropriateContent(text) {
    if (!text || filterWords.length === 0) return false;

    // Normalize input text
    const normalizedInput = normalizeText(text);

    // Split into words for fuzzy matching
    // \p{L} matches any Unicode letter, \p{N} matches any number
    const words = normalizedInput.match(/[\p{L}\p{N}]+/gu) || [];

    for (const inputWord of words) {
        for (const bannedWord of filterWords) {
            // 1. Exact match
            if (inputWord === bannedWord) return true;

            // 2. Fuzzy match (only for words > 3 chars to avoid false positives like 'hell' vs 'hello')
            if (inputWord.length > 3 && bannedWord.length > 3) {
                // Optimization: Skip if length difference is > 1
                if (Math.abs(inputWord.length - bannedWord.length) > 1) continue;

                const distance = levenshteinDistance(inputWord, bannedWord);
                if (distance <= 1) {
                    console.log(`Fuzzy match detected: '${inputWord}' ~= '${bannedWord}' (dist: ${distance})`);
                    return true;
                }
            }
        }
    }

    return false;
}

// Real-time input monitoring
messageInput.addEventListener('input', () => {
    const hasInappropriate = containsInappropriateContent(messageInput.value);

    if (hasInappropriate) {
        // Disable send button
        btnSendMessage.disabled = true;
        btnSendMessage.style.opacity = '0.5';
        btnSendMessage.style.cursor = 'not-allowed';

        // Show warning
        filterWarning.classList.remove('hidden');

        // Add red border to input
        messageInput.style.borderColor = '#ef4444';

        // Flag current user if not already flagged
        if (!currentUserFlagged) {
            currentUserFlagged = true;
            flaggedUsers.add(socket.id);

            // Broadcast flag to all users
            socket.emit('user-flagged', {
                classId: currentClassId,
                userId: socket.id,
                userName: userName
            });

            console.warn('⚠️ User flagged for inappropriate content');
        }
    } else {
        // Enable send button
        btnSendMessage.disabled = false;
        btnSendMessage.style.opacity = '1';
        btnSendMessage.style.cursor = 'pointer';

        // Hide warning
        filterWarning.classList.add('hidden');

        // Remove red border
        messageInput.style.borderColor = '';
    }
});

// Listen for flagged users from server
socket.on('user-was-flagged', ({ userId, userName }) => {
    flaggedUsers.add(userId);
    renderUsersList(); // Re-render to show flags
});

// Update renderUsersList to show flags
const originalRenderUsersList = renderUsersList;
renderUsersList = function () {
    originalRenderUsersList();

    // Add flags to flagged users
    if (!currentClassId || !joinedClasses.has(currentClassId)) return;

    const users = joinedClasses.get(currentClassId).users;
    users.forEach(user => {
        if (flaggedUsers.has(user.id)) {
            const userItems = usersList.querySelectorAll('.user-item');
            userItems.forEach(item => {
                const nameEl = item.querySelector('.user-name');
                if (nameEl && nameEl.textContent === user.name && !nameEl.textContent.includes('🚩')) {
                    nameEl.textContent = '🚩 ' + nameEl.textContent;
                }
            });
        }
    });
};

// Update renderMessage to show flags in message headers
const originalRenderMessage = renderMessage;
renderMessage = function (message) {
    originalRenderMessage(message);

    // Add flag to message sender if they're flagged
    if (message.senderId && flaggedUsers.has(message.senderId)) {
        const lastMessage = messagesContainer.lastElementChild;
        if (lastMessage) {
            const senderEl = lastMessage.querySelector('.message-sender');
            if (senderEl && !senderEl.textContent.includes('🚩')) {
                senderEl.textContent = '🚩 ' + senderEl.textContent;
            }
        }
    }
};

// ===== PINNED MESSAGES FEATURE =====

// ===== PINNED MESSAGES FEATURE =====
let pinnedMessages = [];

function pinMessage(messageId) {
    socket.emit('pin-message', { classId: currentClassId, messageId }, (response) => {
        if (!response || !response.success) console.error('Pin failed:', response?.message);
    });
}

function unpinMessage(messageId) {
    socket.emit('unpin-message', { classId: currentClassId, messageId }, (response) => {
        if (!response || !response.success) console.error('Unpin failed:', response?.message);
    });
}

// Expose unpinMessage globally for the onclick handler in renderPinnedMessages
window.unpinMessage = unpinMessage;

socket.on('message-pinned', ({ message }) => {
    pinnedMessages.push(message);
    renderPinnedMessages();
});

socket.on('message-unpinned', ({ messageId }) => {
    pinnedMessages = pinnedMessages.filter(m => m.id !== messageId);
    renderPinnedMessages();
});

// Render pinned messages at top of chat
function renderPinnedMessages() {
    // Create container if doesn't exist
    let container = document.getElementById('pinned-messages-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'pinned-messages-container';
        container.className = 'pinned-messages-container';
        messagesContainer.parentNode.insertBefore(container, messagesContainer);
    }

    if (pinnedMessages.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    container.innerHTML = `
        <div class="pinned-header">
            <span class="pinned-icon">📌</span>
            <span>Pinned Messages</span>
        </div>
        <div class="pinned-messages-list">
            ${pinnedMessages.map(msg => {
        // Detect URLs and emails
        const urlRegex = /(https?:\/\/[^\s]+)/gi;
        const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
        const hasUrl = urlRegex.test(msg.content);
        const hasEmail = emailRegex.test(msg.content);

        return `
                <div class="pinned-message" data-message-id="${msg.id}">
                    <div class="pinned-message-header">
                        <span class="pinned-sender">${escapeHtml(msg.senderName)}:</span>
                        <span class="pinned-text">${escapeHtml(msg.content)}</span>
                    </div>
                    <div class="pinned-message-actions">
                        <button class="action-btn copy-btn-pinned" data-content="${escapeHtml(msg.content)}" title="Copy">📋</button>
                        ${hasEmail ? `<button class="action-btn mailto-btn-pinned" data-content="${escapeHtml(msg.content)}" title="Email">✉️</button>` : ''}
                        ${hasUrl ? `<button class="action-btn url-btn-pinned" data-content="${escapeHtml(msg.content)}" title="Open Link">🔗</button>` : ''}
                        ${currentRole === 'teacher' ? `<button class="action-btn unpin-btn" data-message-id="${msg.id}" title="Unpin">❌</button>` : ''}
                    </div>
                </div>
            `}).join('')}
        </div>
    `;

    // Add event listeners for action buttons
    const pinnedContainer = document.getElementById('pinned-messages-container');

    // Copy buttons
    pinnedContainer.querySelectorAll('.copy-btn-pinned').forEach(btn => {
        btn.addEventListener('click', async () => {
            const content = btn.dataset.content;
            try {
                await navigator.clipboard.writeText(content);
                btn.textContent = '✅';
                setTimeout(() => btn.textContent = '📋', 1500);
            } catch (err) {
                alert('Failed to copy');
            }
        });
    });

    // Email buttons
    pinnedContainer.querySelectorAll('.mailto-btn-pinned').forEach(btn => {
        btn.addEventListener('click', () => {
            const content = btn.dataset.content;
            const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
            const emails = content.match(emailRegex);
            if (emails) window.location.href = `mailto:${emails[0]}`;
        });
    });

    // URL buttons
    pinnedContainer.querySelectorAll('.url-btn-pinned').forEach(btn => {
        btn.addEventListener('click', () => {
            const content = btn.dataset.content;
            const urlRegex = /(https?:\/\/[^\s]+)/gi;
            const urls = content.match(urlRegex);
            if (urls) window.open(urls[0], '_blank');
        });
    });

    // Unpin buttons
    pinnedContainer.querySelectorAll('.unpin-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const messageId = parseFloat(btn.dataset.messageId);
            unpinMessage(messageId);
        });
    });
}


// ===== DICTIONARY (FORBIDDEN WORDS) FEATURE =====
// Custom forbidden words added by teacher
let customForbiddenWords = [];

// DOM Elements for Dictionary
const dictionaryModal = document.getElementById('dictionary-modal');
const btnDictionary = document.getElementById('btn-dictionary');
const btnCloseDictionary = document.getElementById('btn-close-dictionary');
const dictionaryWordInput = document.getElementById('dictionary-word-input');
const btnAddWord = document.getElementById('btn-add-word');
const dictionaryWordList = document.getElementById('dictionary-word-list');
const textSelectionPopup = document.getElementById('text-selection-popup');
const btnAddSelectionToDictionary = document.getElementById('btn-add-selection-to-dictionary');

// Show/hide dictionary button based on role
function updateDictionaryButtonVisibility() {
    if (btnDictionary) {
        if (currentRole === 'teacher') {
            btnDictionary.classList.remove('hidden');
        } else {
            btnDictionary.classList.add('hidden');
        }
    }
}

// Open Dictionary Modal
if (btnDictionary) {
    btnDictionary.addEventListener('click', () => {
        // Close other modals
        if (mediaPopup) mediaPopup.classList.add('hidden');
        if (connectionModal) connectionModal.classList.add('hidden');

        // Load words and show modal
        loadForbiddenWords();
        dictionaryModal.classList.remove('hidden');
    });
}

// Close Dictionary Modal
if (btnCloseDictionary) {
    btnCloseDictionary.addEventListener('click', () => {
        dictionaryModal.classList.add('hidden');
    });
}

// Close modal when clicking outside
if (dictionaryModal) {
    dictionaryModal.addEventListener('click', (e) => {
        if (e.target === dictionaryModal) {
            dictionaryModal.classList.add('hidden');
        }
    });
}

// Load forbidden words from server
function loadForbiddenWords() {
    socket.emit('get-forbidden-words', (words) => {
        customForbiddenWords = words || [];
        renderDictionaryWordList();
    });
}

// Render the word list in the modal
function renderDictionaryWordList() {
    if (!dictionaryWordList) return;

    if (customForbiddenWords.length === 0) {
        dictionaryWordList.innerHTML = '<div class="empty-dictionary-state">No custom words added yet</div>';
        return;
    }

    dictionaryWordList.innerHTML = customForbiddenWords.map(item => {
        const date = new Date(item.addedAt);
        const dateStr = date.toLocaleDateString('el-GR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        return `
            <div class="dictionary-word-item" data-word="${escapeHtml(item.word)}">
                <span class="dictionary-word-text">${escapeHtml(item.word)}</span>
                <span class="dictionary-word-date">${dateStr}</span>
                <button class="dictionary-delete-btn" title="Delete">❌</button>
            </div>
        `;
    }).join('');

    // Add delete button listeners
    dictionaryWordList.querySelectorAll('.dictionary-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const wordItem = e.target.closest('.dictionary-word-item');
            const word = wordItem.dataset.word;
            removeForbiddenWord(word);
        });
    });
}

// Add a forbidden word
function addForbiddenWord(word) {
    if (!word || word.trim() === '') return;

    const trimmedWord = word.trim().toLowerCase();

    // Check if already exists
    if (customForbiddenWords.some(w => w.word === trimmedWord)) {
        alert('This word is already in the list!');
        return;
    }

    socket.emit('add-forbidden-word', { word: trimmedWord }, (response) => {
        if (response && response.success) {
            console.log(`✅ Added forbidden word: ${trimmedWord}`);
            if (dictionaryWordInput) dictionaryWordInput.value = '';
        } else {
            console.error('Failed to add word:', response?.message);
        }
    });
}

// Remove a forbidden word
function removeForbiddenWord(word) {
    socket.emit('remove-forbidden-word', { word }, (response) => {
        if (response && response.success) {
            console.log(`✅ Removed forbidden word: ${word}`);
        } else {
            console.error('Failed to remove word:', response?.message);
        }
    });
}

// Add word button click
if (btnAddWord) {
    btnAddWord.addEventListener('click', () => {
        addForbiddenWord(dictionaryWordInput.value);
    });
}

// Add word on Enter key
if (dictionaryWordInput) {
    dictionaryWordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addForbiddenWord(dictionaryWordInput.value);
        }
    });
}

// Listen for updates from server
socket.on('forbidden-words-updated', (words) => {
    customForbiddenWords = words || [];
    renderDictionaryWordList();

    // Update the filter words array to include custom words
    updateFilterWithCustomWords();
});

// Update filter words to include custom words
function updateFilterWithCustomWords() {
    // The custom words will be checked separately for now
    // This could be merged with the main filterWords array if needed
    console.log(`🔄 Custom forbidden words updated: ${customForbiddenWords.length} words`);
}

// ===== TEXT SELECTION POPUP =====
let selectedText = '';

// Show popup when text is selected in messages container (Teacher only)
if (messagesContainer) {
    messagesContainer.addEventListener('mouseup', (e) => {
        // Only for teachers
        if (currentRole !== 'teacher') {
            hideTextSelectionPopup();
            return;
        }

        const selection = window.getSelection();
        const text = selection.toString().trim();

        if (text && text.length > 0 && text.length < 50) {
            selectedText = text;
            showTextSelectionPopup(e.clientX, e.clientY);
        } else {
            hideTextSelectionPopup();
        }
    });
}

// Hide popup when clicking elsewhere
document.addEventListener('mousedown', (e) => {
    if (textSelectionPopup && !textSelectionPopup.contains(e.target)) {
        hideTextSelectionPopup();
    }
});

function showTextSelectionPopup(x, y) {
    if (!textSelectionPopup) return;

    textSelectionPopup.style.left = `${x + 10}px`;
    textSelectionPopup.style.top = `${y - 40}px`;
    textSelectionPopup.classList.remove('hidden');
}

function hideTextSelectionPopup() {
    if (textSelectionPopup) {
        textSelectionPopup.classList.add('hidden');
    }
    selectedText = '';
}

// Add selected text to dictionary
if (btnAddSelectionToDictionary) {
    btnAddSelectionToDictionary.addEventListener('click', () => {
        if (selectedText) {
            addForbiddenWord(selectedText);
            hideTextSelectionPopup();
            window.getSelection().removeAllRanges();
        }
    });
}

// Note: updateDictionaryButtonVisibility is called from within switchClass function

// Enhanced containsInappropriateContent to include custom words
const originalContainsInappropriateContent = containsInappropriateContent;
containsInappropriateContent = function (text) {
    // First check original filter
    if (originalContainsInappropriateContent(text)) return true;

    // Then check custom words
    if (!text || customForbiddenWords.length === 0) return false;

    const normalizedInput = normalizeText(text);
    const words = normalizedInput.match(/[\p{L}\p{N}]+/gu) || [];

    for (const inputWord of words) {
        for (const customWord of customForbiddenWords) {
            const normalizedBanned = normalizeText(customWord.word);

            // Exact match
            if (inputWord === normalizedBanned) return true;

            // Fuzzy match for longer words
            if (inputWord.length > 3 && normalizedBanned.length > 3) {
                if (Math.abs(inputWord.length - normalizedBanned.length) <= 1) {
                    const distance = levenshteinDistance(inputWord, normalizedBanned);
                    if (distance <= 1) {
                        console.log(`Custom word fuzzy match: '${inputWord}' ~= '${normalizedBanned}'`);
                        return true;
                    }
                }
            }
        }
    }

    return false;
};
