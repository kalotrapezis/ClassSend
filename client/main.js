import { io } from "socket.io-client";

const socket = io("http://localhost:3000");

// State
let currentRole = null; // 'teacher' or 'student'
let userName = null;
let currentClassId = null;
let joinedClasses = new Map(); // classId -> { messages: [], users: [], teacherName: string }
let availableClasses = []; // [{ id, teacherName }]

// DOM Elements - Screens
const roleSelection = document.getElementById("role-selection");
const classSetup = document.getElementById("class-setup");
const chatInterface = document.getElementById("chat-interface");

// DOM Elements - Setup
const setupTitle = document.getElementById("setup-title");
const classIdInput = document.getElementById("class-id-input");
const userNameInput = document.getElementById("user-name-input");
const btnSubmitSetup = document.getElementById("btn-submit-setup");
const btnBack = document.getElementById("btn-back");

// DOM Elements - Chat
const connectionStatus = document.getElementById("connection-status");
const currentClassName = document.getElementById("current-class-name");
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

// Socket Connection
socket.on("connect", () => {
    connectionStatus.classList.remove("disconnected");
    connectionStatus.classList.add("connected");
    console.log("Connected to server:", socket.id);
    socket.emit("get-active-classes");
});

socket.on("disconnect", () => {
    connectionStatus.classList.remove("connected");
    connectionStatus.classList.add("disconnected");
});

socket.on("active-classes", (classes) => {
    availableClasses = classes;
    if (currentRole) {
        renderSidebar();
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
    } else {
        setupTitle.textContent = "Join Class";
        btnSubmitSetup.textContent = "Join Class";
    }
}

btnBack.addEventListener("click", () => {
    classSetup.classList.add("hidden");
    roleSelection.classList.remove("hidden");
    currentRole = null;
    classIdInput.value = "";
    userNameInput.value = "";
});

// Class Setup Submit
btnSubmitSetup.addEventListener("click", () => {
    const enteredClassId = classIdInput.value.trim();
    const enteredUserName = userNameInput.value.trim();

    if (!enteredClassId) return alert("Please enter a Class ID");
    if (!enteredUserName) return alert("Please enter your name");

    // If already joined, just switch
    if (joinedClasses.has(enteredClassId)) {
        switchClass(enteredClassId);
        return;
    }

    userName = enteredUserName;

    if (currentRole === "teacher") {
        socket.emit("create-class", { classId: enteredClassId, userName }, (response) => {
            if (response.success) {
                joinedClasses.set(enteredClassId, {
                    messages: [],
                    users: [{ id: socket.id, name: userName, role: "teacher" }],
                    teacherName: userName
                });
                switchClass(enteredClassId);
            } else {
                alert(response.message);
            }
        });
    } else {
        joinClass(enteredClassId, userName);
    }
});

function joinClass(classIdToJoin, nameToUse) {
    socket.emit("join-class", { classId: classIdToJoin, userName: nameToUse }, (response) => {
        if (response.success) {
            joinedClasses.set(classIdToJoin, {
                messages: response.messages || [],
                users: response.users || [],
                teacherName: response.users.find(u => u.role === 'teacher')?.name || 'Unknown'
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
    chatInterface.classList.remove("hidden");

    currentClassName.textContent = currentClassId;
    userNameBtn.textContent = `${userName} ▼`;

    renderSidebar();
    renderMessages();
    renderUsersList();
    messageInput.focus();
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
    // Use a Set to track unique IDs to avoid duplicates if a class is in both lists (shouldn't happen logic-wise but good safety)
    const allClassIds = new Set([...joinedClasses.keys(), ...availableClasses.map(c => c.id)]);

    allClassIds.forEach(id => {
        const isJoined = joinedClasses.has(id);
        const isActive = id === currentClassId;

        const item = document.createElement("div");
        item.classList.add("class-item");
        if (isActive) item.classList.add("active");
        if (isJoined) item.classList.add("joined");

        // Icon logic
        let iconHtml = '';
        if (isJoined) {
            iconHtml = `
                <span class="class-icon status-icon joined-icon">✅</span>
                <span class="class-icon status-icon leave-icon" title="Leave Class">❌</span>
            `;
        } else {
            iconHtml = `<span class="class-icon status-icon">➕</span>`;
        }

        item.innerHTML = `
            ${iconHtml}
            <span class="class-name">${escapeHtml(id)}</span>
        `;

        // Click handlers
        if (isJoined) {
            item.addEventListener("click", (e) => {
                if (e.target.classList.contains("leave-icon")) {
                    e.stopPropagation();
                    leaveClass(id);
                } else {
                    switchClass(id);
                }
            });
        } else {
            item.addEventListener("click", () => {
                // Join with current name if already set, otherwise ask (or go back to setup?)
                // For now assume we use the name set in setup if available, or prompt?
                // Actually, if we are in chat view, 'userName' is already set.
                if (userName) {
                    joinClass(id, userName);
                } else {
                    // Should not happen if we are in chat view
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

    // Convert file to base64
    const reader = new FileReader();
    reader.onload = () => {
        const base64 = reader.result;

        socket.emit("send-message", {
            classId: currentClassId,
            content: `Shared a file: ${file.name}`,
            type: "file",
            fileData: {
                name: file.name,
                size: file.size,
                type: file.type,
                data: base64
            }
        });

        fileInput.value = "";
    };
    reader.readAsDataURL(file);
});

// Receive Message
socket.on("new-message", (message) => {
    if (joinedClasses.has(message.classId)) {
        joinedClasses.get(message.classId).messages.push(message);
        if (currentClassId === message.classId) {
            renderMessage(message);
            scrollToBottom();
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
        messageDiv.innerHTML = `
      <div class="message-header">
        <span class="message-sender ${message.senderRole}">${escapeHtml(message.senderName)}</span>
        <span class="message-time">${formatTime(message.timestamp)}</span>
      </div>
      <div class="file-message">
        <span class="file-icon">📄</span>
        <div class="file-info">
          <div class="file-name">${escapeHtml(message.fileData.name)}</div>
          <div class="file-size">${formatFileSize(message.fileData.size)}</div>
        </div>
        <button class="file-download" onclick="downloadFile('${message.fileData.data}', '${escapeHtml(message.fileData.name)}')">
          Download
        </button>
      </div>
    `;
    } else {
        const contentWithMentions = highlightMentions(message.content);
        messageDiv.innerHTML = `
      <div class="message-header">
        <span class="message-sender ${message.senderRole}">${escapeHtml(message.senderName)}</span>
        <span class="message-time">${formatTime(message.timestamp)}</span>
      </div>
      <div class="message-content">${contentWithMentions}</div>
    `;
    }

    messagesContainer.appendChild(messageDiv);
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

    const users = joinedClasses.get(currentClassId).users;
    userCount.textContent = users.length;

    users.forEach(user => {
        const userDiv = document.createElement("div");
        userDiv.classList.add("user-item");
        userDiv.innerHTML = `
      <span class="user-status"></span>
      <span class="user-name">${escapeHtml(user.name)}</span>
      <span class="user-role">${user.role}</span>
    `;

        userDiv.addEventListener("click", () => {
            tagUser(user.name);
        });

        usersList.appendChild(userDiv);
    });
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
                classSetup.classList.remove("hidden");
            }
        } else {
            renderSidebar();
        }
    }
});

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
window.downloadFile = function (base64Data, fileName) {
    const link = document.createElement("a");
    link.href = base64Data;
    link.download = fileName;
    link.click();
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
