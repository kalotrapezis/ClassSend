import { io } from "socket.io-client";
import * as mammoth from "mammoth";
import * as XLSX from "xlsx";
import { translations } from "./translations.js";
import { generateRandomName } from "./name-generator.js";

// Logger for Advanced Settings
const capturedLogs = [];
let isLogsPaused = false;
let isLoggingEnabled = false; // Default OFF as requested
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

// ONE-TIME: Parse URL params for cross-origin identity transfer
const urlParams = new URLSearchParams(window.location.search);
const paramRole = urlParams.get('role');
const paramName = urlParams.get('name');
const autoConnectIp = urlParams.get('ip'); // Auto-connect IP logic if needed

if (paramRole) {
    localStorage.setItem('classsend-role', paramRole);
    console.log(`[Identity] Imported role from URL: ${paramRole}`);
}
if (paramName) {
    localStorage.setItem('classsend-userName', paramName);
    console.log(`[Identity] Imported name from URL: ${paramName}`);
}

// Clean URL params if they were present to avoid sharing them
if (paramRole || paramName) {
    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.replaceState({ path: newUrl }, '', newUrl);
}

function formatLog(type, args) {
    const timestamp = new Date().toLocaleTimeString();
    const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    // Truncate very long messages
    if (message.length > 2000) return `[${timestamp}] [${type}] ${message.substring(0, 2000)}...`;
    return `[${timestamp}] [${type}] ${message}`;
}

const logToMemory = (type, args) => {
    if (!isLoggingEnabled) return; // Skip if disabled

    const logEntry = formatLog(type, args);
    capturedLogs.push(logEntry);
    // Keep last 1000 logs
    if (capturedLogs.length > 1000) capturedLogs.shift();

    // Auto-update logs viewer if open AND NOT PAUSED
    const logsContent = document.getElementById("logs-content");
    if (!isLogsPaused && logsContent && logsContent.offsetParent !== null) {
        logsContent.textContent = capturedLogs.join('\n');
        logsContent.scrollTop = logsContent.scrollHeight;
    }
}

console.log = (...args) => {
    logToMemory('INFO', args);
    originalConsoleLog.apply(console, args);
};

console.warn = (...args) => {
    logToMemory('WARN', args);
    originalConsoleWarn.apply(console, args);
};

console.error = (...args) => {
    logToMemory('ERROR', args);
    originalConsoleError.apply(console, args);
};

// Connect to server dynamically - works for both localhost and LAN
let currentServerUrl = window.location.origin;
let socket = io(currentServerUrl);
let debugModeActive = false;

console.log(`Connecting to ClassSend server at: ${currentServerUrl}`);

// Function to switch to a different server
function connectToServer(serverUrl) {
    if (currentServerUrl === serverUrl) return; // Already connected

    console.log(`Switching from ${currentServerUrl} to ${serverUrl}`);

    // Clean up current state
    stopClassRefreshInterval();
    stopNetworkDiscovery();
    discoveredServers.clear();
    joinedClasses.clear();
    availableClasses = [];
    currentClassId = null;
    autoFlowTriggered = false;

    // Disconnect from current server
    socket.disconnect();

    // Connect to new server
    currentServerUrl = serverUrl;
    socket = io(serverUrl);

    // Re-attach all socket event handlers
    attachSocketHandlers();

    // Persist IP to history
    saveKnownServer(serverUrl);

    console.log(`Connected to new server: ${serverUrl}`);

    // If we have a saved role, ensure role selection is hidden
    if (savedRole) {
        roleSelection.classList.add('hidden');
    }
}


// State - with localStorage persistence
let savedRole = localStorage.getItem('classsend-role'); // Persistent role
let currentRole = savedRole; // 'teacher' or 'student'
let userName = localStorage.getItem('classsend-userName');
let currentClassId = localStorage.getItem('classsend-classId'); // Restore saved class ID
let joinedClasses = new Map(); // classId -> { messages: [], users: [], teacherName: string }
let availableClasses = []; // [{ id, teacherName }]
let customWhitelistedWords = [];
let currentLanguage = localStorage.getItem('language') || 'en';
let pinnedFiles = new Set(); // Track pinned file IDs in media library
let autoFlowTriggered = false; // Prevent multiple auto-flow triggers

// Periodic refresh of active classes (every 5 seconds)
let classRefreshInterval = null;
function startClassRefreshInterval() {
    if (classRefreshInterval) return; // Already running
    classRefreshInterval = setInterval(() => {
        if (socket.connected) {
            socket.emit("get-active-classes");
        }

        // AUTO-CONNECT FIX: If we are in the Lobby (Waiting Room) or have no class,
        // and using IP history is viable, keep probing.
        // This handles cases where Teacher starts AFTER Student.
        if ((!currentClassId || currentClassId === 'Lobby') && currentRole === 'student') {
            // Only probe if we aren't already flooding the network
            probeKnownServers();
        }

    }, 5000);
}
function stopClassRefreshInterval() {
    if (classRefreshInterval) {
        clearInterval(classRefreshInterval);
        classRefreshInterval = null;
    }
}

// Network Discovery - Find other ClassSend servers on the network
let discoveredServers = new Map(); // ip:port -> { name, ip, port, classes, version }
let networkDiscoveryStarted = false;
let isAutoDiscoveryEnabled = localStorage.getItem('classsend-auto-discovery') === 'true'; // Default is FALSE now

function startNetworkDiscovery() {
    if (networkDiscoveryStarted) return;

    // Smart Network Check (Booting Process)
    // 1. Check if we are online immediately
    if (navigator.onLine) {
        console.log("Network status: ONLINE. Starting probe sequence...");
        // Small delay (500ms) to ensure socket/IO is ready even if "online" is true
        setTimeout(() => {
            startProbingSequence();
        }, 500);
    } else {
        console.log("Network status: OFFLINE. Waiting for network...");
        // Show scanning/offline state in UI (optional, but "Looking for classes" covers it)

        // 2. Wait for online event
        window.addEventListener('online', () => {
            console.log("Network status changed: ONLINE. Starting probe sequence...");
            // Wait a moment for connection to stabilize
            setTimeout(() => {
                startProbingSequence();
            }, 2000);
        }, { once: true }); // Only trigger once
    }

    if (isAutoDiscoveryEnabled) {
        // Broadcasting ON: also start UDP listener
        networkDiscoveryStarted = true;
        socket.emit("start-discovery");
    }
}

function startProbingSequence() {
    // If broadcasting is disabled, we rely solely on history probing
    // If broadcasting is enabled, we probe history AND listen for broadcasts
    probeKnownServers();
}

function stopNetworkDiscovery() {
    if (!networkDiscoveryStarted) return;
    networkDiscoveryStarted = false;
    socket.emit("stop-discovery");
    console.log("Stopped network discovery");
}

// Listen for discovered servers
socket.on("server-discovered", (serverInfo) => {
    const key = `${serverInfo.ip}:${serverInfo.port}`;
    discoveredServers.set(key, serverInfo);
    console.log(`Discovered ClassSend server: ${serverInfo.name} at ${key}`, serverInfo.classes);

    // If we have a role and are viewing classes, update the UI
    if (currentRole) {
        renderSidebar();
    }
    // Update available classes screen if visible
    if (currentRole === 'student' && !availableClassesScreen.classList.contains('hidden')) {
        renderAvailableClasses();
    }

    // Trigger auto-flow re-check when new servers are discovered
    handleAutoFlow();
});

socket.on("server-lost", (serverInfo) => {
    const key = `${serverInfo.ip}:${serverInfo.port}`;
    discoveredServers.delete(key);
    console.log(`Lost ClassSend server: ${serverInfo.name} at ${key}`);

    // Update UI
    if (currentRole) {
        renderSidebar();
    }
});

// ===== IP HISTORY & PROBING =====
function saveKnownServer(url) {
    try {
        let knownServers = JSON.parse(localStorage.getItem('classsend-known-servers') || '[]');
        // Add if unique
        if (!knownServers.includes(url)) {
            // Add to FRONT
            knownServers.unshift(url);
            // Limit to last 10
            if (knownServers.length > 10) knownServers.pop();
            localStorage.setItem('classsend-known-servers', JSON.stringify(knownServers));

            // Refresh UI
            renderGlobalHistoryLists();
        }
    } catch (e) {
        console.error("Failed to save known server:", e);
    }
}


// State for probing lock
let isProbing = false;

async function probeKnownServers() {
    if (isProbing) return; // Prevent overlapping probes
    isProbing = true;

    try {
        const knownServers = JSON.parse(localStorage.getItem('classsend-known-servers') || '[]');
        if (knownServers.length === 0) {
            // Only log this once or if discovery is explicitly starting, otherwise it spams
            // console.log("[Probing] No known servers in history.");
            isProbing = false;
            return;
        }

        console.log(`[Probing] Checking ${knownServers.length} known servers...`);
        let foundAny = false;

        // Parallel-ish probing would be faster, but sequential is safer to avoid congestion
        for (const serverUrl of knownServers) {
            if (serverUrl === window.location.origin) continue;

            const probeUrl = `${serverUrl}/api/discovery-info`;
            let probeSuccess = false;

            // Retry Logic: 1s, 2s, 4s
            const timeouts = [1000, 2000, 4000];

            for (let attempt = 0; attempt < timeouts.length && !probeSuccess; attempt++) {
                const timeoutMs = timeouts[attempt];
                console.log(`[Probing] ${serverUrl} - Attempt ${attempt + 1}/${timeouts.length} (Timeout: ${timeoutMs}ms)`);

                try {
                    const controller = new AbortController();
                    const id = setTimeout(() => controller.abort(), timeoutMs);

                    const response = await fetch(probeUrl, { signal: controller.signal });
                    clearTimeout(id);

                    if (response.ok) {
                        const info = await response.json();
                        let ip, port;
                        try {
                            const urlObj = new URL(serverUrl);
                            ip = urlObj.hostname;
                            port = urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80);
                        } catch (e) {
                            console.warn("Invalid known log URL", serverUrl);
                            break;
                        }

                        const serverInfo = {
                            name: info.name || "Known Server",
                            ip: ip,
                            port: port,
                            classes: info.classes || [],
                            version: info.version || "unknown"
                        };

                        const key = `${serverInfo.ip}:${serverInfo.port}`;
                        if (!discoveredServers.has(key)) {
                            discoveredServers.set(key, serverInfo);
                            console.log(`[Probing] SUCCESS: Found ${serverInfo.name} at ${key}`);
                            if (currentRole === 'student' && !availableClassesScreen.classList.contains('hidden')) {
                                renderAvailableClasses();
                            }
                        }
                        probeSuccess = true;
                        foundAny = true;
                    }
                } catch (err) {
                    console.log(`[Probing] Failed attempt ${attempt + 1} for ${serverUrl}: ${err.name}`);
                }
            }

            if (foundAny) {
                console.log("[Probing] Server found. Stopping chain.");
                handleAutoFlow();
                isProbing = false;
                return;
            }
        }

        handleAutoFlow();

        if (!foundAny && !isAutoDiscoveryEnabled && currentRole === 'student' && !currentClassId) {
            console.log("[Auto-Connect] All probes failed. Opening manual connect.");
            if (classSetup.classList.contains('hidden') && roleSelection.classList.contains('hidden')) {
                // if (btnShowUrl) btnShowUrl.click(); // REMOVED: User requested no automatic popups
            }
        }

    } catch (e) {
        console.error("Failed to probe known servers:", e);
    } finally {
        isProbing = false;
    }
}


// Auto-generate name if none exists
if (!userName) {
    userName = generateRandomName(currentLanguage);
    localStorage.setItem('classsend-userName', userName);
    console.log(`Generated random name (${currentLanguage}): ${userName}`);
}

// DOM Elements - Screens
const roleSelection = document.getElementById("role-selection");
const classSetup = document.getElementById("class-setup");
const availableClassesScreen = document.getElementById("available-classes");
const chatInterface = document.getElementById("chat-interface");

// Startup Logic
// Check if we have a saved role
// savedRole is already declared at top of file

// DEFAULT ROLE LOGIC: If no role is saved, default to 'student'
// DEFAULT ROLE LOGIC: Force 'student' if no role is saved
if (!savedRole) {
    console.log("No saved role found. Defaulting to 'student'.");
    savedRole = 'student';
    localStorage.setItem('classsend-role', 'student');
    currentRole = 'student';
    // Trigger auto-flow immediately
    setTimeout(() => {
        if (typeof handleAutoFlow === 'function') handleAutoFlow();
        // Also ensure UI is correct
        roleSelection.classList.add('hidden');
    }, 100);
}

if (savedRole) {
    // We have a role (from localStorage, URL params, or default), proceed automatically
    roleSelection.classList.add('hidden');
} else {
    // Fallback (should not happen with default logic above)
    roleSelection.classList.remove('hidden');
    chatInterface.classList.add('hidden');
}



// DOM Elements - Setup
const setupTitle = document.getElementById("setup-title");
const classIdInput = document.getElementById("class-id-input");
const userNameInput = document.getElementById("user-name-input");
const btnSubmitSetup = document.getElementById("btn-submit-setup");
const btnBack = document.getElementById("btn-back");
const btnBackFromClasses = document.getElementById("btn-back-from-classes");

// Trigger probing when entering "Available Classes" screen (Student) or starting discovery
function onStartDiscovery() {
    startNetworkDiscovery();
    probeKnownServers();
}

// In startNetworkDiscovery function modify call


// DOM Elements - Available Classes
const availableClassesList = document.getElementById("available-classes-list");

// --- THEME LOGIC RESTORATION ---
function initThemeSelector() {
    const themeCards = document.querySelectorAll('.theme-card');
    const storedTheme = localStorage.getItem('classsend-theme') || 'default';

    // Apply stored theme on startup
    applyTheme(storedTheme);

    themeCards.forEach(card => {
        card.addEventListener('click', () => {
            const theme = card.dataset.theme;
            applyTheme(theme);
        });
    });
}

function applyTheme(themeName) {
    // 1. Update HTML attribute
    if (themeName === 'default') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', themeName);
    }

    // 2. Update Active Card UI
    document.querySelectorAll('.theme-card').forEach(card => {
        if (card.dataset.theme === themeName) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    });

    // 3. Persist
    localStorage.setItem('classsend-theme', themeName);
    console.log(`🎨 Theme applied: ${themeName}`);
}

// Initialize themes immediately
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeSelector);
} else {
    initThemeSelector();
}



// DOM Elements - Chat
const classesListContainer = document.querySelector(".classes-list");
const settingsNameInput = document.getElementById("settings-name-input");
const btnSettingsChangeName = document.getElementById("btn-settings-change-name");
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

// Settings Elements
const btnSettingsToggle = document.getElementById("btn-settings-toggle");
const settingsModal = document.getElementById("settings-modal");
const btnCloseSettings = document.getElementById("btn-close-settings");
const languageSelect = document.getElementById("language-select");
const checkAutoOpenConnection = document.getElementById("auto-open-connection");
const checkAutoCloseConnection = document.getElementById("auto-close-connection");

// Advanced Settings Elements
const settingsAdvancedSection = document.getElementById("settings-advanced-section");
const btnViewLogs = document.getElementById("btn-view-logs");
const btnDownloadLogs = document.getElementById("btn-download-logs");
const logsViewer = document.getElementById("logs-viewer");
const logsContent = document.getElementById("logs-content");
const btnCopyLogs = document.getElementById("btn-copy-logs");
const btnCloseLogs = document.getElementById("btn-close-logs");

if (btnCopyLogs) {
    btnCopyLogs.addEventListener("click", () => {
        const logsText = logsContent.textContent;
        if (!logsText) return;

        copyToClipboard(logsText, () => {
            const originalHTML = btnCopyLogs.innerHTML;
            btnCopyLogs.innerHTML = '<img src="/assets/tick-circle-svgrepo-com.svg" class="icon-svg" style="width: 16px; height: 16px;" />';
            setTimeout(() => {
                btnCopyLogs.innerHTML = originalHTML;
            }, 1000);
        }, () => {
            console.error("Failed to copy logs");
            alert("Failed to copy logs to clipboard");
        });
    });
}

// Slider Elements
const modelBlockSlider = document.getElementById("model-block-threshold");
const modelReportSlider = document.getElementById("model-report-threshold");

// Blacklist Import/Export Elements
const btnImportBlacklist = document.getElementById("btn-import-blacklist");
const btnExportBlacklist = document.getElementById("btn-export-blacklist");
const fileImportBlacklist = document.getElementById("file-import-blacklist");

// Connection Info Modal
const connectionModal = document.getElementById("connection-modal");
const btnCloseConnection = document.getElementById("btn-close-connection");
const connectionUrl = document.getElementById("connection-url");
const btnCopyUrl = document.getElementById("btn-copy-url");
const hostnameToggle = document.getElementById("hostname-toggle");
const btnOpenHistoryModal = document.getElementById("btn-open-history-modal");
const historyModal = document.getElementById("history-modal");
const btnCloseHistoryModal = document.getElementById("btn-close-history-modal");
const settingsKnownServersList = document.getElementById("settings-known-servers-list");
const modalManualHistoryList = document.getElementById("modal-manual-history-list");
const smartIpHistoryList = document.getElementById("smart-ip-history-list");

// Teacher Tools Menu Elements
const teacherToolsSection = document.getElementById("teacher-tools-section");
const btnToolsToggle = document.getElementById("btn-tools-toggle");
const toolsMenu = document.getElementById("tools-menu");

// Teacher Tool Buttons (Consolidated)
const btnToolShareScreen = document.getElementById("btn-tool-share-screen");
const btnToolHandsDown = document.getElementById("btn-tool-hands-down");

const btnToolBlockMessages = document.getElementById("btn-tool-block-messages");
const btnToolAllowHands = document.getElementById("btn-tool-allow-hands");

let serverInfo = null; // { ip, port, hostname }

if (btnShowUrl) {
    btnShowUrl.addEventListener("click", () => {
        // Close Media Library if open
        mediaPopup.classList.add("hidden");

        socket.emit("get-server-info", { classId: currentClassId }, (info) => {
            serverInfo = info;
            updateConnectionUrl();

            // Hide manual join if teacher
            const modalManualJoin = document.getElementById("modal-manual-join");
            if (modalManualJoin) {
                if (currentRole === 'teacher') {
                    modalManualJoin.classList.add("hidden");
                } else {
                    modalManualJoin.classList.remove("hidden");
                }
            }

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

if (hostnameToggle) {
    hostnameToggle.addEventListener("change", updateConnectionUrl);
}

// Helper: Robust Copy to Clipboard
async function copyToClipboard(text, onSuccess, onError) {
    let copied = false;

    // Try modern Clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            copied = true;
        } catch (err) {
            console.warn("Clipboard API failed, trying fallback: ", err);
        }
    }

    // Fallback method using execCommand
    if (!copied) {
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            textArea.style.top = "-9999px";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            copied = document.execCommand("copy");
            document.body.removeChild(textArea);
        } catch (err) {
            console.error("Fallback copy failed: ", err);
        }
    }

    if (copied) {
        if (onSuccess) onSuccess();
    } else {
        if (onError) onError();
    }
}

if (btnCopyUrl) {
    btnCopyUrl.addEventListener("click", () => {
        const url = connectionUrl.textContent;
        copyToClipboard(url, () => {
            const originalContent = btnCopyUrl.innerHTML;
            btnCopyUrl.innerHTML = '<img src="/assets/tick-circle-svgrepo-com.svg" class="icon-svg" style="width: 16px; height: 16px;" />';
            if (checkAutoCloseConnection && checkAutoCloseConnection.checked) {
                setTimeout(() => {
                    connectionModal.classList.add("hidden");
                    btnCopyUrl.innerHTML = originalContent;
                }, 800);
            } else {
                setTimeout(() => {
                    btnCopyUrl.innerHTML = originalContent;
                }, 1500);
            }
        });
    });
}

if (btnCloseConnection) {
    btnCloseConnection.addEventListener("click", () => {
        connectionModal.classList.add("hidden");
    });
}

if (connectionModal) {
    connectionModal.addEventListener("click", (e) => {
        if (e.target === connectionModal) {
            connectionModal.classList.add("hidden");
        }
    });
}

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
        if (window.innerWidth > 1200) {
            sidebarLeft.classList.toggle("collapsed");
        } else {
            sidebarLeft.classList.toggle("active");
            sidebarOverlay.classList.toggle("active");
        }
    });
}

// Teacher Tools Menu Toggle
if (btnToolsToggle) {
    btnToolsToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        btnToolsToggle.classList.toggle("active");
        toolsMenu.classList.toggle("active");
    });
}

// Close tools menu when clicking outside
document.addEventListener("click", (e) => {
    if (toolsMenu && !toolsMenu.contains(e.target) && !btnToolsToggle.contains(e.target)) {
        toolsMenu.classList.remove("active");
        btnToolsToggle.classList.remove("active");
    }
});

// Teacher Tools Event Listeners


if (btnToolHandsDown) {
    btnToolHandsDown.addEventListener("click", () => {
        socket.emit("lower-all-hands", { classId: currentClassId });
        // toolsMenu.classList.remove("active"); // Removed to keep menu open
        // btnToolsToggle.classList.remove("active");
    });
}



if (btnToolBlockMessages) {
    btnToolBlockMessages.addEventListener("click", () => {
        const classData = joinedClasses.get(currentClassId);
        const newState = !classData.blockAllActive;
        socket.emit("toggle-block-all-messages", { classId: currentClassId, enabled: newState });
        // toolsMenu.classList.remove("active"); // Removed to keep menu open
        // btnToolsToggle.classList.remove("active");
    });
}

if (btnToolAllowHands) {
    btnToolAllowHands.addEventListener("click", () => {
        const classData = joinedClasses.get(currentClassId);
        const newState = !classData.allowHandsUp;
        socket.emit("toggle-allow-hands-up", { classId: currentClassId, enabled: newState });
        // toolsMenu.classList.remove("active"); // Removed to keep menu open
        // btnToolsToggle.classList.remove("active");
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

// Clear Media Library (Admin/Teacher)
const btnClearMedia = document.getElementById("btn-clear-media");
if (btnClearMedia) {
    btnClearMedia.addEventListener("click", () => {
        // Optional: specific check if user is teacher
        if (currentRole !== 'teacher') {
            alert("Only teachers can clear the media library.");
            return;
        }

        if (confirm("Are you sure you want to clear the entire Media Library? This action cannot be undone.")) {
            socket.emit("clear-media-library");
        }
    });
}

socket.on("media-library-cleared", () => {
    const mediaList = document.getElementById("media-list");
    if (mediaList) {
        mediaList.innerHTML = `<div class="empty-media-state" data-i18n="library-empty">No media shared yet</div>`;
    }
    showToast("Media Library cleared", "success");

    // Check if we need to hide the clear button based on role (though it should be handled by role switches)
    if (currentRole !== 'teacher' && btnClearMedia) {
        btnClearMedia.style.display = 'none';
    }
});

// --- Settings Management ---
socket.on('settings-updated', (settings) => {
    if (settings.enableLogging !== undefined) {
        const toggle = document.getElementById('toggle-log-history');
        if (toggle) toggle.checked = settings.enableLogging;
        isLoggingEnabled = settings.enableLogging;
    }
    if (settings.autoExportLogs !== undefined) {
        const toggle = document.getElementById('toggle-auto-export');
        if (toggle) toggle.checked = settings.autoExportLogs;
    }
});

// Initial settings fetch
socket.emit('get-settings', (settings) => {
    if (settings) {
        if (settings.enableLogging !== undefined) {
            const toggle = document.getElementById('toggle-log-history');
            if (toggle) toggle.checked = settings.enableLogging;
            isLoggingEnabled = settings.enableLogging;
        }
        if (settings.autoExportLogs !== undefined) {
            const toggle = document.getElementById('toggle-auto-export');
            if (toggle) toggle.checked = settings.autoExportLogs;
        }
    }
});

// Wire up Toggle
const toggleLogHistory = document.getElementById('toggle-log-history');
if (toggleLogHistory) {
    toggleLogHistory.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        isLoggingEnabled = enabled; // Update local state immediately
        socket.emit('update-settings', { enableLogging: enabled });
        showToast(enabled ? "Session Logging Enabled" : "Session Logging Disabled", "info");
    });
}

const toggleAutoExport = document.getElementById('toggle-auto-export');
if (toggleAutoExport) {
    toggleAutoExport.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        socket.emit('update-settings', { autoExportLogs: enabled });
        showToast(enabled ? "Automatic Export Enabled" : "Automatic Export Disabled", "info");
    });
}

socket.on("connect", () => {
    connectionStatus.classList.remove("disconnected");
    connectionStatus.classList.add("connected");

    // Localization-aware update
    connectionStatus.setAttribute('data-i18n', 'status-connected');
    const statusText = connectionStatus.querySelector(".status-text");
    if (statusText) {
        statusText.setAttribute('data-i18n', 'status-connected');
        // If translations available, use them immediately
        if (typeof translations !== 'undefined' && currentLanguage && translations[currentLanguage]) {
            statusText.textContent = translations[currentLanguage]['status-connected'] || "Connected";
        } else {
            statusText.textContent = "Connected";
        }
    }
    connectionStatus.title = "Connected";

    // Re-join if we were in a class
    if (currentClassId && userName) {
        console.log("Reconnecting to class", currentClassId);
        joinClass(currentClassId, userName, true);
    }

    // Refresh active classes
    socket.emit("get-active-classes");

    // Re-fetch settings on reconnect
    socket.emit('get-settings', (settings) => {
        if (settings) {
            if (settings.enableLogging !== undefined) {
                const toggle = document.getElementById('toggle-log-history');
                if (toggle) toggle.checked = settings.enableLogging;
                isLoggingEnabled = settings.enableLogging;
            }
            if (settings.autoExportLogs !== undefined) {
                const toggle = document.getElementById('toggle-auto-export');
                if (toggle) toggle.checked = settings.autoExportLogs;
            }
        }
    });

    // Start periodic refresh of class list
    startClassRefreshInterval();

    // Start network discovery to find other ClassSend servers
    startNetworkDiscovery();

    // Auto-flow: if role is saved, trigger auto-flow
    if (savedRole && !autoFlowTriggered && !currentClassId) {
        autoFlowTriggered = true;
        console.log(`Auto-flow: Role is ${savedRole}, starting auto-flow...`);

        if (savedRole === 'teacher') {
            // Teacher: auto-create class and go to chat
            triggerTeacherAutoFlow();
        }
        // Student auto-flow handled in active-classes event
    }
});

socket.on("disconnect", () => {
    connectionStatus.classList.remove("connected");
    connectionStatus.classList.add("disconnected");

    // Localization-aware update
    connectionStatus.setAttribute('data-i18n', 'status-disconnected');
    const statusText = connectionStatus.querySelector(".status-text");
    if (statusText) {
        statusText.setAttribute('data-i18n', 'status-disconnected');
        // If translations available, use them immediately
        if (typeof translations !== 'undefined' && currentLanguage && translations[currentLanguage]) {
            statusText.textContent = translations[currentLanguage]['status-disconnected'] || "Disconnected";
        } else {
            statusText.textContent = "Disconnected";
        }
    }
    connectionStatus.title = "Disconnected";

    // Stop periodic refresh when disconnected
    stopClassRefreshInterval();

    // Stop network discovery
    stopNetworkDiscovery();
    discoveredServers.clear();
});

socket.on("active-classes", (classes) => {
    availableClasses = classes;
    availableClasses = classes;
    const classNames = classes.map(c => c.id).join(', ');
    console.log(`[Network] Received ${classes.length} active class(es): ${classNames}`);

    handleAutoFlow();

    if (currentRole) {
        renderSidebar();
    }
    // Update available classes screen if student is viewing it
    if (currentRole === 'student' && !availableClassesScreen.classList.contains('hidden')) {
        renderAvailableClasses();
    }
});

// Helper to get ALL classes (Local + Remote)
function getAllAvailableClasses() {
    const allClasses = [...availableClasses];

    // Add discovered classes
    discoveredServers.forEach((serverInfo) => {
        if (serverInfo.classes && Array.isArray(serverInfo.classes)) {
            serverInfo.classes.forEach(cls => {
                if (!cls || !cls.id) return; // Skip invalid classes

                // Avoid duplicates if multiple discovery packets come in or local server is discovered
                // Use lenient string comparison for IDs to be safe
                const exists = allClasses.some(c => String(c.id) === String(cls.id));

                if (!exists) {
                    allClasses.push({
                        ...cls,
                        isRemote: true,
                        serverIp: serverInfo.ip,
                        serverPort: serverInfo.port
                    });
                }
            });
        }
    });

    return allClasses;
}

// Centralized Auto-Flow Logic
// Centralized Auto-Flow Logic
function handleAutoFlow() {
    // Allow auto-flow if (no class OR in Lobby) to enable switching from Lobby to partial class
    if (savedRole === 'student' && autoFlowTriggered && (!currentClassId || currentClassId === 'Lobby') && !window.joiningInProgress) {

        const allClasses = getAllAvailableClasses();
        const savedTargetId = localStorage.getItem('classsend-classId');

        // Priority 1: If we have a saved target AND it's in the list -> AUTO-JOIN
        const targetedClass = savedTargetId ? allClasses.find(c => c.id === savedTargetId) : null;

        if (targetedClass) {
            window.joiningInProgress = true;
            console.log(`Auto-flow: Found saved target ${targetedClass.id}, auto-joining...`);
            roleSelection.classList.add('hidden');
            classSetup.classList.add('hidden');
            availableClassesScreen.classList.add('hidden');

            if (targetedClass.isRemote) {
                let serverUrl = `http://${targetedClass.serverIp}:${targetedClass.serverPort}`;
                if (savedRole && userName) {
                    serverUrl += `?role=${encodeURIComponent(savedRole)}&name=${encodeURIComponent(userName)}`;
                }
                saveKnownServer(serverUrl);
                window.location.href = serverUrl;
            } else {
                joinClass(targetedClass.id, userName, true);
            }
            return;
        }

        // Priority 2: Only one REAL class available (excluding Lobby) -> AUTO-JOIN
        const realClasses = allClasses.filter(c => c.id !== 'Lobby');
        if (realClasses.length === 1) {
            window.joiningInProgress = true;
            const targetClass = realClasses[0];
            console.log(`Auto-flow: Only one class available (${targetClass.id}), auto-joining...`);
            roleSelection.classList.add('hidden');
            classSetup.classList.add('hidden');
            availableClassesScreen.classList.add('hidden');

            if (targetClass.isRemote) {
                let serverUrl = `http://${targetClass.serverIp}:${targetClass.serverPort}`;
                if (savedRole && userName) {
                    serverUrl += `?role=${encodeURIComponent(savedRole)}&name=${encodeURIComponent(userName)}`;
                }
                saveKnownServer(serverUrl);
                window.location.href = serverUrl;
            } else {
                joinClass(targetClass.id, userName, true);
            }
        } else if (realClasses.length > 1) {
            // Priority 3: Multiple choice -> Show selection
            console.log(`Auto-flow: Multiple classes available (${realClasses.length}), showing selection...`);
            roleSelection.classList.add('hidden');
            classSetup.classList.add('hidden');
            availableClassesScreen.classList.remove('hidden');
            renderAvailableClasses();
        } else {
            // Priority 4: No REAL classes -> Wait in Lobby
            if (currentClassId !== 'Lobby') {
                console.log('Auto-flow: No classes available, joining Lobby as waiting room...');
                joinOrCreateLobby();
            }
        }
    }
}

// Auto-flow helper: Teacher joins or creates Lobby
// Auto-flow helper: Teacher Auto-Creates Class
function triggerTeacherAutoFlow() {
    roleSelection.classList.add('hidden');
    classSetup.classList.add('hidden');

    // Auto-create class (Class-01, etc.)
    socket.emit("auto-create-class", { userName }, (response) => {
        if (response.success) {
            const classId = response.classId;
            joinedClasses.set(classId, {
                messages: [],
                users: [{ id: socket.id, name: userName, role: "teacher" }],
                teacherName: userName,
                blockedUsers: new Set(),
                hasTeacher: true,
                blockAllActive: false
            });

            if (settingsNameInput) settingsNameInput.value = userName;
            switchClass(classId);
            console.log(`Auto-flow: Teacher created class ${classId}`);

            // Rename if saved preference exists
            const savedClassName = localStorage.getItem('classsend-classId');
            if (savedClassName && savedClassName !== classId && savedClassName !== 'Lobby') {
                socket.emit("rename-class", { classId, newName: savedClassName }, (renameResponse) => {
                    if (renameResponse.success) {
                        console.log(`Auto-renamed to ${savedClassName}`);
                    }
                });
            }
        } else {
            console.error('Auto-flow failed:', response.message);
            roleSelection.classList.remove('hidden');
        }
    });
}

// Auto-flow helper: Join or create shared Lobby for students
function joinOrCreateLobby() {
    if (window.joiningInProgress) return; // Prevent duplicate joins
    window.joiningInProgress = true;

    socket.emit("join-or-create-lobby", { userName }, (response) => {
        if (response.success) {
            const classId = response.classId;
            joinedClasses.set(classId, {
                messages: response.messages || [],
                users: response.users || [{ id: socket.id, name: userName, role: "student" }],
                teacherName: response.teacherName || null,
                blockedUsers: new Set(),
                hasTeacher: response.hasTeacher || false
            });

            if (settingsNameInput) settingsNameInput.value = userName;
            switchClass(classId);

            // Check if chat should be disabled (no teacher yet)
            updateChatDisabledState();

            console.log(`Auto-flow: Joined Lobby ${classId}, hasTeacher: ${response.hasTeacher}`);
        } else {
            console.error('Auto-flow: Failed to join/create Lobby', response.message);
            window.joiningInProgress = false; // RESET LOCK
            showWaitingForClass();
        }
    });
}

// Update chat disabled state based on teacher presence and user count
function updateChatDisabledState() {
    if (!currentClassId) return;

    const classData = joinedClasses.get(currentClassId);
    const hasTeacher = classData?.hasTeacher || classData?.users?.some(u => u.role === 'teacher');
    const isAlone = classData?.users?.length === 1;

    // Check if we need to show the Searching Overlay
    const searchingOverlay = document.getElementById("searching-overlay");

    // REFINEMENT: If Auto-Discovery is OFF and History is EMPTY, skip overlay and open Connection Modal
    const knownServers = JSON.parse(localStorage.getItem('classsend-known-servers') || '[]');
    const isDiscoveryOff = !isAutoDiscoveryEnabled;
    const isHistoryEmpty = knownServers.length === 0;

    // Show overlay if (Student AND in Lobby)
    if (currentRole === 'student' && currentClassId === 'Lobby') {
        if (searchingOverlay) searchingOverlay.classList.remove("hidden");

        // Also disable input to be safe, though overlay covers it
        messageInput.disabled = true;
        btnSendMessage.disabled = true;
        btnSendMessage.style.opacity = '0.5';
    } else {
        if (searchingOverlay) searchingOverlay.classList.add("hidden");

        // Disable if (Student AND (No Teacher OR Alone)) - Normal logic for regular classes
        if (currentRole === 'student' && (!hasTeacher || isAlone)) {
            // Disable chat input
            messageInput.disabled = true;

            if (isAlone) {
                messageInput.placeholder = "Waiting for teacher/others...";
            } else {
                messageInput.placeholder = "Waiting for teacher to join...";
            }

            btnSendMessage.disabled = true;
            btnSendMessage.style.opacity = '0.5';
        } else {
            // Enable chat
            messageInput.disabled = false;
            messageInput.placeholder = "Type a message...";
            btnSendMessage.disabled = false;
            btnSendMessage.style.opacity = '1';
        }
    }
}

// Auto-flow helper: Show waiting screen for students
function showWaitingForClass() {
    availableClassesList.innerHTML = `
        <div class="empty-state">
            <div class="spinner"></div>
            <div>Connecting to Lobby...</div>
            <p style="margin-top: 1rem; color: var(--text-secondary); font-size: 0.9rem;">
                Please wait while we set up the class.
            </p>
        </div>
    `;
}

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
            // Title handled by tooltip, icon handled by CSS or static HTML
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
            // Toggle state reset
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
            // Toggle state reset
        }
    }
});

socket.on("block-all-messages-updated", (data) => {
    const classData = joinedClasses.get(data.classId);
    if (classData) {
        classData.blockAllActive = data.enabled;
        if (data.classId === currentClassId) {
            // UI Feedback for Students
            if (currentRole === 'student') {
                if (data.enabled) {
                    messagesContainer.classList.add("blocked");
                    messageInput.disabled = true;
                    messageInput.placeholder = "Messages are blocked by teacher";
                } else {
                    messagesContainer.classList.remove("blocked");
                    messageInput.disabled = false;
                    messageInput.placeholder = "Type a message...";
                }
            }
            updateToolStates();
            const lang = currentLanguage;
            const msg = data.enabled ?
                translations[lang]['toast-block-enabled'] :
                translations[lang]['toast-block-disabled'];
            showToast(msg, data.enabled ? "warning" : "success");
        }
    }
});

socket.on("allow-hands-up-updated", (data) => {
    const classData = joinedClasses.get(data.classId);
    if (classData) {
        classData.allowHandsUp = data.enabled;
        if (data.classId === currentClassId) {
            updateToolStates();
        }
    }
});

socket.on("error", (data) => {
    if (data && data.message) {
        showToast(data.message, "error");
    }
});

// Role Selection
document.getElementById("btn-teacher").addEventListener("click", () => {
    currentRole = "teacher";
    savedRole = "teacher";
    localStorage.setItem('classsend-role', 'teacher');
    // Skip class setup, immediately join Lobby
    autoFlowTriggered = true;
    triggerTeacherAutoFlow();
});

document.getElementById("btn-student").addEventListener("click", () => {
    currentRole = "student";
    savedRole = "student";
    localStorage.setItem('classsend-role', 'student');
    // Skip class setup, immediately check flow
    autoFlowTriggered = true;
    roleSelection.classList.add('hidden');
    handleAutoFlow();
});

function showClassSetup() {
    roleSelection.classList.add("hidden");
    classSetup.classList.remove("hidden");

    // Load saved values from localStorage
    const savedClassId = localStorage.getItem('classsend-classId');
    const savedUserName = localStorage.getItem('classsend-userName');
    if (savedClassId) classIdInput.value = savedClassId;
    if (savedUserName) userNameInput.value = savedUserName;

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
    // Clearing saved role allows user to re-select if they made a mistake
    // Only clear if they explicitly go back, not on refresh
    localStorage.removeItem('classsend-role');
    savedRole = null;
    autoFlowTriggered = false;

    classIdInput.value = "";
    userNameInput.value = "";
});

btnBackFromClasses.addEventListener("click", () => {
    availableClassesScreen.classList.add("hidden");

    // logic: If we have a saved name/role, and we hit back here, we probably want to change role or name
    // But currently this button just goes back to Class Setup, which might be skipped in auto-flow.
    // If auto-flow skipped Setup, back should go to Role Selection (and clear persistence).

    if (savedRole && userName) {
        // We came here via auto-flow likely.
        // Go back to Role Selection so they can change "Student/Teacher" choice
        roleSelection.classList.remove("hidden");
        localStorage.removeItem('classsend-role');
        savedRole = null;
        autoFlowTriggered = false;
        currentRole = null;
    } else {
        classSetup.classList.remove("hidden");
    }
});

// Class Setup Submit
btnSubmitSetup.addEventListener("click", () => {
    const enteredUserName = userNameInput.value.trim();

    if (!enteredUserName) return alert("Please enter your name");

    userName = enteredUserName;
    // Save to localStorage
    localStorage.setItem('classsend-userName', enteredUserName);

    if (currentRole === "teacher") {
        const enteredClassId = classIdInput.value.trim();
        if (!enteredClassId) return alert("Please enter a Class ID");

        // Save class ID to localStorage
        localStorage.setItem('classsend-classId', enteredClassId);

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

                // Update settings input with user name
                if (settingsNameInput) settingsNameInput.value = userName;

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
// Render Available Classes for Students
function renderAvailableClasses() {
    availableClassesList.innerHTML = "";

    // Combine local and remote classes
    const allClasses = getAllAvailableClasses();

    if (allClasses.length === 0) {
        availableClassesList.innerHTML = `
            <div class="empty-state">
                <div class="spinner"></div>
                <div data-i18n="searching-classes">Looking for classes...</div>
            </div>`;
        return;
    }

    allClasses.forEach(classInfo => {
        try {
            if (!classInfo || !classInfo.id) return;
            if (classInfo.id === 'Lobby') return; // Never show Lobby in the list


            const classCard = document.createElement("div");
            classCard.classList.add("available-class-card");
            if (classInfo.isRemote) {
                classCard.classList.add("remote-class-card");
            }

            const locationLabel = classInfo.isRemote ? `Running on ${classInfo.serverIp}` : 'Local Network';
            const safeStartedName = classInfo.teacherName ? escapeHtml(classInfo.teacherName) : 'Unknown';

            classCard.innerHTML = `
                <div class="class-card-icon">📚</div>
                <div class="class-card-info">
                    <div class="class-card-name">${escapeHtml(String(classInfo.id))}</div>
                    <div class="class-card-teacher">Teacher: ${safeStartedName}</div>
                    <div class="class-card-location" style="font-size: 0.8em; opacity: 0.7;">${escapeHtml(locationLabel)}</div>
                </div>
                <button class="class-card-join-btn">${translations[currentLanguage]['btn-join']} →</button>
            `;

            classCard.addEventListener("click", () => {
                if (classInfo.isRemote) {
                    // Redirect to the other server
                    const serverUrl = `http://${classInfo.serverIp}:${classInfo.serverPort}`;
                    window.location.href = serverUrl;
                } else {
                    joinClass(classInfo.id, userName);
                }
            });

            availableClassesList.appendChild(classCard);
        } catch (err) {
            console.error("Failed to render class card:", err, classInfo);
        }
    });
}

// Render Scanning UI (replaces Lobby)
function renderScanningForTeacher() {
    // Instead of showing a card, we show the main chat interface
    // with a status message
    availableClassesScreen.classList.add('hidden');
    roleSelection.classList.add('hidden');
    classSetup.classList.add('hidden');
    chatInterface.classList.remove('hidden');

    // Set UI to "Scanning" state
    renderScanningStateInChat();
}

function renderScanningStateInChat() {
    // Clear chat area
    messagesContainer.innerHTML = '';

    // Add a visual indicator in the chat area
    const scanningIndicator = document.createElement('div');
    scanningIndicator.className = 'scanning-indicator';
    scanningIndicator.style.textAlign = 'center';
    scanningIndicator.style.padding = '2rem';
    scanningIndicator.style.color = 'var(--text-secondary)';

    scanningIndicator.innerHTML = `
        <div class="spinner" style="margin: 0 auto 1rem auto;"></div>
        <h3>Looking for teachers...</h3>
        <p>We are scanning the network for available classes.</p>
        <button id="btn-cancel-scan-chat" class="secondary-btn" style="margin-top: 1rem;">Back / Change Role</button>
    `;

    messagesContainer.appendChild(scanningIndicator);

    // Disable inputs
    messageInput.disabled = true;
    messageInput.placeholder = "Scanning for teachers...";
    btnSendMessage.disabled = true;

    // Cancel button handler
    const btnCancel = document.getElementById('btn-cancel-scan-chat');
    if (btnCancel) {
        btnCancel.onclick = () => {
            chatInterface.classList.add('hidden');
            roleSelection.classList.remove('hidden');
            localStorage.removeItem('classsend-role');
            savedRole = null;
            autoFlowTriggered = false;
        };
    }
}

function joinClass(classIdToJoin, nameToUse, isAutoJoin = false) {
    socket.emit("join-class", { classId: classIdToJoin, userName: nameToUse }, (response) => {
        if (response.success) {
            const hasTeacher = response.users?.some(u => u.role === 'teacher') || false;
            joinedClasses.set(classIdToJoin, {
                messages: response.messages || [],
                users: response.users || [],
                teacherName: response.users?.find(u => u.role === 'teacher')?.name || 'Unknown',
                pinnedMessages: response.pinnedMessages || [],
                blockedUsers: new Set(response.blockedUsers || []),
                hasTeacher: hasTeacher,
                blockAllActive: response.blockAllActive || false,
                allowHandsUp: response.allowHandsUp !== undefined ? response.allowHandsUp : true
            });

            // Handle auto-blocked state
            if (response.blocked) {
                // Manually trigger blocked UI
                messageInput.disabled = true;
                messageInput.placeholder = t('You have been blocked by the teacher.');
                messageInput.style.backgroundImage = "url('/assets/message-block.svg')";
                messageInput.style.backgroundRepeat = "no-repeat";
                messageInput.style.backgroundPosition = "right 10px center";
                messageInput.style.backgroundSize = "20px";
                messageInput.classList.add('blocked');
                btnSendMessage.disabled = true;
                if (btnAttachFile) btnAttachFile.disabled = true;
                if (btnEmoji) btnEmoji.disabled = true;
            } else {
                // Reset if not blocked (in case of re-join)
                messageInput.disabled = false;
                messageInput.placeholder = t('placeholder-message');
                messageInput.style.backgroundImage = "none";
                messageInput.classList.remove('blocked');
                btnSendMessage.disabled = false;
                if (btnAttachFile) btnAttachFile.disabled = false;
                if (btnEmoji) btnEmoji.disabled = false;
            }

            switchClass(classIdToJoin);
        } else {
            if (isAutoJoin) {
                console.warn(`Auto-join to ${classIdToJoin} failed: ${response.message}`);
                // If the class doesn't exist, we should probably reset the UI to avoid being stuck
                // But only if we were trying to rejoin the current class
                if (classIdToJoin === currentClassId) {
                    currentClassId = null;
                    if (handleAutoFlow && typeof handleAutoFlow === 'function') {
                        // Resetting currentClassId allows handleAutoFlow to run again
                        window.joiningInProgress = false; // Reset flag so auto-flow can run
                        autoFlowTriggered = true; // FORCE auto-flow to retry since we are "starting fresh"

                        // SILENT RETRY: Just log and wait for next active-classes or server-discovery
                        console.log("Auto-join failed, waiting for next discovery cycle...");
                    }
                }
            } else {
                alert(response.message);
                window.joiningInProgress = false; // Reset lock on manual join failure too
            }
        }
    });
}

function switchClass(id) {
    currentClassId = id;
    classSetup.classList.add("hidden");
    availableClassesScreen.classList.add("hidden");
    chatInterface.classList.remove("hidden");

    if (settingsNameInput) settingsNameInput.value = userName;

    // Update role display in settings
    if (typeof updateRoleDisplay === 'function') {
        updateRoleDisplay();
    }

    // Update class name input for teachers
    if (renameClassInput) {
        renameClassInput.value = id;
    }

    // Show/hide class management section based on role
    if (classManagementSection) {
        if (currentRole === 'teacher') {
            classManagementSection.classList.remove('hidden');
        } else {
            classManagementSection.classList.add('hidden');
        }
    }

    // Load pinned messages for this class
    const classData = joinedClasses.get(id);
    if (classData) {
        pinnedMessages = classData.pinnedMessages || [];
    } else {
        pinnedMessages = [];
    }

    renderSidebar();
    renderMessages();
    renderUsersList();
    renderMediaHistory(); // Render media history
    renderPinnedMessages(); // Render pinned messages at top of chat
    messageInput.focus();

    closeMobileSidebar(); // Close sidebar on mobile

    // Update blacklist button visibility for teacher
    if (typeof updateBlacklistButtonVisibility === 'function') {
        updateBlacklistButtonVisibility();
    }

    updateToolStates();
    updateChatDisabledState();

    // Auto-open connection info if enabled
    if (checkAutoOpenConnection && checkAutoOpenConnection.checked) {
        // Use a small timeout to let UI settle
        setTimeout(() => {
            if (btnShowUrl) btnShowUrl.click();
        }, 500);
    }
}

function deleteClass(id) {
    if (joinedClasses.size <= 1) {
        alert(t('Cannot delete the only active class.'));
        return;
    }
    if (!confirm(`Are you sure you want to DELETE class ${id}? This will remove the class for everyone.`)) return;

    socket.emit("delete-class", { classId: id }, (response) => {
        if (response.success) {
            joinedClasses.delete(id);
            if (currentClassId === id) {
                currentClassId = null;
                // Switch to first available class (guaranteed to exist due to check above)
                if (joinedClasses.size > 0) {
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
    if (joinedClasses.size <= 1) {
        alert(t('Cannot leave the only joined class. Join another class first.'));
        return;
    }
    if (!confirm(`Are you sure you want to leave ${id}?`)) return;

    socket.emit("leave-class", { classId: id }, (response) => {
        if (response.success) {
            joinedClasses.delete(id);
            if (currentClassId === id) {
                currentClassId = null;
                // Switch to first available class (guaranteed to exist due to check above)
                if (joinedClasses.size > 0) {
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

    // Combine joined, available (local), and discovered (network) classes
    // Filter out 'Lobby' for teachers from available classes
    const visibleAvailable = availableClasses.filter(c => currentRole !== 'teacher' || c.id !== 'Lobby');
    const allClassIds = new Set([...joinedClasses.keys(), ...visibleAvailable.map(c => c.id)]);

    // Also add classes from discovered servers
    const networkClasses = new Map(); // classId -> { serverIp, serverPort, teacherName }
    discoveredServers.forEach((serverInfo, serverKey) => {
        if (serverInfo.classes && Array.isArray(serverInfo.classes)) {
            serverInfo.classes.forEach(cls => {
                const classId = cls.id || cls;

                // Filter out 'Lobby' for teachers here too
                if (currentRole === 'teacher' && classId === 'Lobby') return;

                if (!allClassIds.has(classId)) {
                    allClassIds.add(classId);
                    networkClasses.set(classId, {
                        serverIp: serverInfo.ip,
                        serverPort: serverInfo.port,
                        teacherName: cls.teacherName || 'Unknown'
                    });
                }
            });
        }
    });

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
            leftIcon = `<span class="class-icon status-icon joined-icon"><img src="/assets/tick-circle-svgrepo-com.svg" class="icon-svg" style="width: 16px; height: 16px;" /></span>`;

            if (isTeacher) {
                rightIcon = `<span class="class-icon status-icon delete-icon" title="Delete Class" style="margin-left: auto; display: flex; align-items: center;"><img src="/assets/delete-left-svgrepo-com.svg" class="icon-svg" style="width: 16px; height: 16px; margin-right: 4px;" /> Delete</span>`;
            } else {
                rightIcon = `<span class="class-icon status-icon leave-icon" title="Leave Class" style="margin-left: auto; display: flex; align-items: center;"><img src="/assets/exit-svgrepo-com.svg" class="icon-svg" style="width: 16px; height: 16px; margin-right: 4px;" /> Leave</span>`;
            }
        } else {
            leftIcon = `<span class="class-icon status-icon"><img src="/assets/plus-circle-svgrepo-com.svg" class="icon-svg" style="width: 16px; height: 16px;" /></span>`;
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
            // Check if this is a network class (on another server)
            const networkClassInfo = networkClasses.get(id);
            if (networkClassInfo) {
                item.addEventListener("click", () => {
                    // Redirect to the other server (stays in same window/app)
                    const serverUrl = `http://${networkClassInfo.serverIp}:${networkClassInfo.serverPort}`;
                    window.location.href = serverUrl;
                });
                // Add visual indicator that this is on another server
                item.title = `On server ${networkClassInfo.serverIp}:${networkClassInfo.serverPort}`;
                item.classList.add("network-class");
            } else {
                item.addEventListener("click", () => {
                    if (userName) {
                        joinClass(id, userName);
                    } else {
                        alert("Please setup your name first");
                    }
                });
            }
        }

        classesListContainer.appendChild(item);
    });

    // Hide manual connection section if teacher
    const manualConnectionSection = document.querySelector(".manual-connection-section");
    if (manualConnectionSection) {
        if (currentRole === 'teacher') {
            manualConnectionSection.classList.add("hidden");
        } else {
            manualConnectionSection.classList.remove("hidden");
        }
    }
}


// User Name Change from Settings
if (btnSettingsChangeName) {
    btnSettingsChangeName.addEventListener("click", () => {
        const newName = settingsNameInput.value.trim();
        if (!newName) return alert("Please enter a new name");
        if (newName === userName) return;

        if (!currentClassId) {
            // Just update local state if not in a class
            userName = newName;
            localStorage.setItem('classsend-userName', newName);
            showToast(translations[currentLanguage]["toast-name-updated-local"], "success");
            return;
        }

        socket.emit("change-user-name", { classId: currentClassId, newName }, (response) => {
            if (response.success) {
                userName = newName;
                localStorage.setItem('classsend-userName', newName);
                if (joinedClasses.has(currentClassId)) {
                    const classData = joinedClasses.get(currentClassId);
                    const me = classData.users.find(u => u.id === socket.id);
                    if (me) me.name = newName;
                }
                showToast(translations[currentLanguage]["toast-name-updated-success"], "success");
            } else {
                alert(response.message);
                settingsNameInput.value = userName; // Revert
            }
        });
    });
}

// Regenerate Random Name
const btnRegenerateName = document.getElementById("btn-regenerate-name");
if (btnRegenerateName) {
    btnRegenerateName.addEventListener("click", () => {
        const newName = generateRandomName(currentLanguage);
        settingsNameInput.value = newName;
        userName = newName;
        localStorage.setItem('classsend-userName', newName);
        showToast(`${translations[currentLanguage]["label-name"]}: ${newName}`, "success");

        // Update on server if in a class
        if (currentClassId) {
            socket.emit("change-user-name", { classId: currentClassId, newName }, (response) => {
                if (!response.success) {
                    console.warn("Failed to update name on server:", response.message);
                }
            });
        }
    });
}

// Change Role
const btnChangeRole = document.getElementById("btn-change-role");
const currentRoleDisplay = document.getElementById("current-role-display");

if (btnChangeRole) {
    btnChangeRole.addEventListener("click", () => {
        // Hide Settings
        if (settingsModal) settingsModal.classList.add("hidden");

        // Show Role Selection Screen mechanisms
        // We do NOT reload, as that would trigger the default-to-student logic again.
        // Instead, we manually reset the state and show the screen.

        // 1. Clear saved role
        localStorage.removeItem('classsend-role');
        savedRole = null;
        currentRole = null;
        autoFlowTriggered = false;

        // 2. Hide all other screens
        if (chatInterface) chatInterface.classList.add("hidden");
        if (classSetup) classSetup.classList.add("hidden");
        if (availableClassesScreen) availableClassesScreen.classList.add("hidden");

        // 3. Show Role Selection
        if (roleSelection) roleSelection.classList.remove("hidden");

        console.log("User requested role change. Showing selection screen.");
    });
}

// Update role display
function updateRoleDisplay() {
    if (currentRoleDisplay) {
        const lang = translations[currentLanguage] ? currentLanguage : 'en';
        if (currentRole === 'teacher') {
            currentRoleDisplay.innerHTML = `<img src="/assets/teacher-svgrepo-com.svg" class="icon-svg" style="width: 24px; height: 24px; margin-right: 8px;" /> ${translations[lang]['role-teacher']}`;
            currentRoleDisplay.className = 'role-badge teacher';
        } else if (currentRole === 'student') {
            currentRoleDisplay.innerHTML = `<img src="/assets/student-person-svgrepo-com.svg" class="icon-svg" style="width: 24px; height: 24px; margin-right: 8px;" /> ${translations[lang]['role-student']}`;
            currentRoleDisplay.className = 'role-badge student';
        } else {
            currentRoleDisplay.textContent = '-';
            currentRoleDisplay.className = 'role-badge';
        }
    }
}

// Helper: Backup Words to Server
function backupWordsToServer(callback) {
    // Check if there are any words to export
    if (customForbiddenWords.size === 0 && customWhitelistedWords.size === 0) {
        console.log("No custom words to backup.");
        if (callback) callback(false);
        return;
    }

    const backupData = {
        forbidden: Array.from(customForbiddenWords),
        whitelisted: Array.from(customWhitelistedWords),
        timestamp: new Date().toISOString()
    };

    console.log("Backing up words to server...");

    // Set a timeout to not block role switch indefinitely
    let responded = false;
    const timeout = setTimeout(() => {
        if (!responded) {
            console.warn("Backup timed out");
            if (callback) callback(false);
        }
    }, 2000);

    socket.emit("backup-word-lists", backupData, (response) => {
        if (responded) return;
        responded = true;
        clearTimeout(timeout);

        if (response && response.success) {
            console.log("Backup successful:", response.filename);
            if (callback) callback(true);
        } else {
            console.error("Backup failed:", response?.error);
            if (callback) callback(false);
        }
    });
}

if (btnChangeRole) {
    btnChangeRole.addEventListener("click", () => {
        // Close settings modal immediately to feedback action
        if (settingsModal) settingsModal.classList.add("hidden");

        if (!confirm("Changing your role will disconnect you from the current class. Continue?")) {
            return;
        }

        const showRoleSelection = () => {
            // Clean up in-memory state without reloading
            localStorage.removeItem('classsend-role');
            localStorage.removeItem('classsend-classId');
            savedRole = null;
            currentRole = null;
            currentClassId = null;
            autoFlowTriggered = false;
            window.joiningInProgress = false;
            joinedClasses.clear();
            availableClasses = [];
            stopClassRefreshInterval();
            stopNetworkDiscovery();
            discoveredServers.clear();

            // Hide all screens, show role selection
            chatInterface.classList.add('hidden');
            classSetup.classList.add('hidden');
            availableClassesScreen.classList.add('hidden');
            roleSelection.classList.remove('hidden');

            console.log("Role switch: showing role selection screen.");
        };

        const handleSwitchSequence = () => {
            // 1. Try to backup words (if Teacher)
            if (currentRole === 'teacher') {
                backupWordsToServer((success) => {
                    showRoleSelection();
                });
                return;
            }
            // 2. Immediate switch if not teacher
            showRoleSelection();
        };

        // If Teacher, DELETE the class
        if (currentRole === 'teacher' && currentClassId) {
            console.log("Teacher switching role, deleting class...");
            socket.emit("delete-class", { classId: currentClassId }, (response) => {
                handleSwitchSequence();
            });
            // Fallback in case server doesn't respond
            setTimeout(handleSwitchSequence, 1000);
        }
        // If Student (or other), just LEAVE
        else if (currentClassId) {
            socket.emit("leave-class", { classId: currentClassId });
            handleSwitchSequence();
        } else {
            handleSwitchSequence();
        }
    });
}

// Rename Class (Teacher only)
const btnRenameClass = document.getElementById("btn-rename-class");
const renameClassInput = document.getElementById("rename-class-input");
const classManagementSection = document.getElementById("class-management-section");

if (btnRenameClass) {
    btnRenameClass.addEventListener("click", () => {
        const newName = renameClassInput.value.trim();
        if (!newName) return alert("Please enter a class name");
        if (!currentClassId) return alert("No class to rename");
        if (newName === currentClassId) return;

        socket.emit("rename-class", { classId: currentClassId, newName }, (response) => {
            if (response.success) {
                // Update local state
                const classData = joinedClasses.get(currentClassId);
                joinedClasses.delete(currentClassId);
                joinedClasses.set(newName, classData);
                currentClassId = newName;

                renderSidebar();
                showToast(`${translations[currentLanguage]["toast-class-renamed"]} ${newName}`, "success");
            } else {
                alert(response.message);
            }
        });
    });
}

// Handle class-renamed event from server
socket.on("class-renamed", ({ oldName, newName }) => {
    console.log(`Class renamed: ${oldName} -> ${newName}`);
    if (currentClassId === oldName) {
        currentClassId = newName;
        // Save new class name for persistence (teacher's saved preference)
        if (currentRole === 'teacher') {
            localStorage.setItem('classsend-classId', newName);
            console.log(`Saved class name: ${newName}`);
        }
    }
    if (joinedClasses.has(oldName)) {
        const classData = joinedClasses.get(oldName);
        joinedClasses.delete(oldName);
        joinedClasses.set(newName, classData);
    }
    renderSidebar();
});

// Send Message
function sendMessage() {
    const content = messageInput.value.trim();
    if (!content) return;
    if (!currentClassId) return;

    // Check if sending is blocked (e.g. by filter)
    if (btnSendMessage.disabled) {
        console.warn(`[DEBUG] Send blocked: Button disabled`);
        return;
    }

    console.log(`[DEBUG] Sending message: "${content}"`);
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

    // Load/Error/Abort Events
    xhr.onload = () => {
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
    console.log(`[DEBUG] Received new-message: "${message.content}" from ${message.senderName}`);
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
    messageDiv.dataset.id = message.id; // Essential for deletion finding

    if (message.type === "file") {
        const isImage = message.fileData.type && message.fileData.type.startsWith('image/');
        const isPDF = message.fileData.type === 'application/pdf';

        // New Supported Types
        const lowerName = message.fileData.name.toLowerCase();
        const isDoc = lowerName.endsWith('.docx');
        const isXls = lowerName.endsWith('.xlsx');
        const isTxt = lowerName.endsWith('.txt');
        const isVideo = message.fileData.type && message.fileData.type.startsWith('video/');
        const isAudio = message.fileData.type && message.fileData.type.startsWith('audio/');

        // Determine file icon based on type/extension
        let fileIconSrc = '/assets/files-svgrepo-com.svg'; // Default format

        if (isImage) {
            fileIconSrc = '/assets/image-square-svgrepo-com.svg';
        } else if (isPDF) {
            fileIconSrc = '/assets/pdf-svgrepo-com.svg';
        } else if (lowerName.endsWith('.doc') || isDoc) {
            fileIconSrc = '/assets/word-file-svgrepo-com.svg';
        } else if (lowerName.endsWith('.xls') || isXls || lowerName.endsWith('.csv')) {
            fileIconSrc = '/assets/excel-file-svgrepo-com.svg';
        } else if (lowerName.endsWith('.ppt') || lowerName.endsWith('.pptx')) {
            fileIconSrc = '/assets/powerpoint-file-svgrepo-com.svg';
        } else if (lowerName.endsWith('.exe') || lowerName.endsWith('.msi') || lowerName.endsWith('.apk') || lowerName.endsWith('.app')) {
            fileIconSrc = '/assets/application-x-executable-svgrepo-com.svg';
        } else if (lowerName.endsWith('.mp3') || lowerName.endsWith('.wav') || lowerName.endsWith('.ogg') || lowerName.endsWith('.m4a') || lowerName.endsWith('.flac')) {
            fileIconSrc = '/assets/music-note-svgrepo-com.svg';
        } else if (lowerName.endsWith('.mp4') || lowerName.endsWith('.avi') || lowerName.endsWith('.mov') || lowerName.endsWith('.mkv') || lowerName.endsWith('.webm')) {
            fileIconSrc = '/assets/video-frame-play-horizontal-svgrepo-com.svg';
        }

        messageDiv.innerHTML = `
      <div class="message-header">
        <span class="message-sender ${message.senderRole}">${escapeHtml(message.senderName)}</span>
        <span class="message-time">${formatTime(message.timestamp)}</span>
      </div>
      <div class="file-message">
        <span class="file-icon"><img src="${fileIconSrc}" class="icon-svg" style="width: 32px; height: 32px;" /></span>
        <div class="file-info">
          <div class="file-name">${escapeHtml(message.fileData.name)}</div>
          <div class="file-size">${formatFileSize(message.fileData.size)}</div>
          <div class="message-actions">
            ${isImage ? '<button class="action-btn open-btn" title="View Image"><img src="/assets/view-svgrepo-com.svg" class="icon-svg" alt="View" /></button>' : ''}
            ${isPDF ? '<button class="action-btn open-pdf-btn" title="Open PDF"><img src="/assets/view-svgrepo-com.svg" class="icon-svg" alt="Open" /></button>' : ''}
            ${isDoc ? '<button class="action-btn open-doc-btn" title="View Document"><img src="/assets/view-svgrepo-com.svg" class="icon-svg" alt="View" /></button>' : ''}
            ${isXls ? '<button class="action-btn open-xls-btn" title="View Spreadsheet"><img src="/assets/view-svgrepo-com.svg" class="icon-svg" alt="View" /></button>' : ''}
            ${isTxt ? '<button class="action-btn open-txt-btn" title="View Text"><img src="/assets/view-svgrepo-com.svg" class="icon-svg" alt="View" /></button>' : ''}
            ${isVideo ? '<button class="action-btn open-video-btn" title="Play Video"><img src="/assets/view-svgrepo-com.svg" class="icon-svg" alt="Play" /></button>' : ''}
            ${isAudio ? '<button class="action-btn open-audio-btn" title="Play Audio"><img src="/assets/view-svgrepo-com.svg" class="icon-svg" alt="Play" /></button>' : ''}
            <button class="action-btn download-btn" title="Download"><img src="/assets/download-square-svgrepo-com.svg" class="icon-svg" alt="Download" /></button>
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
                    const imageUrl = `/api/download/${message.fileData.id}?inline=true`;
                    openImageViewer(imageUrl);
                });
            }
        }

        if (isPDF) {
            const pdfBtn = messageDiv.querySelector('.open-pdf-btn');
            if (pdfBtn) {
                pdfBtn.addEventListener('click', () => {
                    const pdfUrl = `/api/download/${message.fileData.id}?inline=true`;
                    openPdfViewer(pdfUrl);
                });
            }
        }

        // Helper to attach viewer listener
        const attachViewerListener = (cls, viewerFn, typeArg) => {
            const btn = messageDiv.querySelector(cls);
            if (btn) {
                btn.addEventListener('click', () => {
                    const url = `/api/download/${message.fileData.id}?inline=true`;
                    viewerFn(url, message.fileData.name, typeArg);
                });
            }
        };

        if (isDoc) attachViewerListener('.open-doc-btn', openDocumentViewer, 'docx');
        if (isXls) attachViewerListener('.open-xls-btn', openDocumentViewer, 'xlsx');
        if (isTxt) attachViewerListener('.open-txt-btn', openDocumentViewer, 'txt');
        if (isVideo) attachViewerListener('.open-video-btn', openMediaPlayer, message.fileData.type);
        if (isAudio) attachViewerListener('.open-audio-btn', openMediaPlayer, message.fileData.type);


    } else {
        messageDiv.classList.add("text-message");
        const contentWithMentions = highlightMentions(message.content);

        // Detect URLs
        const urlRegex = /(https?:\/\/[^\s]+)/gi;
        const hasUrl = urlRegex.test(message.content);

        // Detect emails
        const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
        const hasEmail = emailRegex.test(message.content);

        const t = (key) => translations[currentLanguage][key] || key;

        messageDiv.innerHTML = `
      <div class="message-header">
        <span class="message-sender ${message.senderRole}">${escapeHtml(message.senderName)}</span>
        <span class="message-time">${formatTime(message.timestamp)}</span>
      </div>
      <div class="message-content">
        ${contentWithMentions}
        <div class="message-actions">
          <button class="action-btn copy-btn" title="${t('btn-copy-label')}"><img src="/assets/copy-svgrepo-com.svg" class="icon-svg" alt="Copy" style="width: 16px; height: 16px;" /><span class="btn-label">${t('btn-copy-label')}</span></button>
          ${hasEmail ? `<button class="action-btn mailto-btn" title="${t('btn-email-label')}" data-i18n-title="btn-email-label">✉️<span class="btn-label">${t('btn-email-label')}</span></button>` : ''}
          ${hasUrl ? `<button class="action-btn url-btn" title="${t('btn-open-link-label')}" data-i18n-title="btn-open-link-label"><img src="/assets/link-circle.svg" class="icon-svg" style="width: 16px; height: 16px;" /><span class="btn-label">${t('btn-open-link-label')}</span></button>` : ''}
          ${currentRole === 'teacher' ? `<button class="action-btn pin-action-btn" data-message-id="${message.id}" title="${t('btn-pin-label')}"><img src="/assets/pin-svgrepo-com.svg" class="icon-svg" alt="Pin" style="width: 16px; height: 16px;" /><span class="btn-label">${t('btn-pin-label')}</span></button>` : ''}
          ${currentRole === 'teacher' ? `<button class="action-btn ban-action-btn" data-message-id="${message.id}" data-message-content="${escapeHtml(message.content)}" title="${t('btn-block-label')}"><img src="/assets/block-1-svgrepo-com.svg" class="icon-svg" alt="Block" style="width: 16px; height: 16px;" /><span class="btn-label">${t('btn-block-label')}</span></button>` : ''}
          ${currentRole === 'student' ? `<button class="action-btn report-action-btn" data-message-id="${message.id}" data-message-content="${escapeHtml(message.content)}" title="${t('btn-report-label')}"><img src="/assets/report-svgrepo-com.svg" class="icon-svg" alt="Report" style="width: 16px; height: 16px;" /><span class="btn-label">${t('btn-report-label')}</span></button>` : ''}
        </div>
      </div>
    `;

        // Copy button
        const copyBtn = messageDiv.querySelector('.copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                copyToClipboard(message.content, () => {
                    copyBtn.innerHTML = `<img src="/assets/tick-circle-svgrepo-com.svg" class="icon-svg" style="width: 16px; height: 16px;" /><span class="btn-label">${t('btn-copy-label')}</span>`;
                    copyBtn.classList.add('success');
                    setTimeout(() => {
                        copyBtn.innerHTML = `<img src="/assets/copy-svgrepo-com.svg" class="icon-svg" style="width: 16px; height: 16px;" /><span class="btn-label">${t('btn-copy-label')}</span>`;
                        copyBtn.classList.remove('success');
                    }, 1500);
                }, () => {
                    alert('Failed to copy');
                });
            });
        }

        // Mailto button
        if (hasEmail) {
            const mailtoBtn = messageDiv.querySelector('.mailto-btn');
            if (mailtoBtn) {
                mailtoBtn.addEventListener('click', () => {
                    const emails = message.content.match(emailRegex);
                    if (emails) window.open(`mailto:${emails[0]}`, '_blank');
                });
            }
        }

        // URL button
        if (hasUrl) {
            const urlBtn = messageDiv.querySelector('.url-btn');
            if (urlBtn) {
                urlBtn.addEventListener('click', () => {
                    const urls = message.content.match(urlRegex);
                    if (urls) openWebViewer(urls[0]);
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

    // Ban button for teachers
    if (currentRole === 'teacher') {
        const banBtn = messageDiv.querySelector('.ban-action-btn');
        if (banBtn) {
            banBtn.addEventListener('click', () => {
                const msgId = banBtn.dataset.messageId;
                const content = banBtn.dataset.messageContent;
                if (confirm(`Block this word and delete message?\n\n"${content}"`)) {
                    socket.emit('teacher-ban-message', {
                        classId: currentClassId,
                        messageId: msgId,
                        word: content
                    });
                }
            });
        }
    }

    // Auto-delete System Messages after 10 seconds
    if (message.senderRole === 'system') {
        // Add timer UI
        const timerDiv = document.createElement('div');
        timerDiv.className = 'system-message-timer';
        timerDiv.innerHTML = `
            <svg class="timer-svg" viewBox="0 0 20 20">
                <circle class="timer-circle-bg" cx="10" cy="10" r="9"></circle>
                <circle class="timer-circle-progress" cx="10" cy="10" r="9"></circle>
            </svg>
        `;
        messageDiv.appendChild(timerDiv);

        setTimeout(() => {
            messageDiv.style.transition = "opacity 0.5s ease-out";
            messageDiv.style.opacity = "0";
            setTimeout(() => messageDiv.remove(), 500);
        }, 10000);
    }

    // Report button for students
    if (currentRole === 'student') {
        const reportBtn = messageDiv.querySelector('.report-action-btn');
        if (reportBtn) {
            reportBtn.addEventListener('click', () => {
                const messageContent = reportBtn.dataset.messageContent;
                if (!messageContent) return;

                // Show confirmation dialog
                const confirmed = confirm(`Are you sure you want to report this message?\n\n"${messageContent.substring(0, 100)}${messageContent.length > 100 ? '...' : ''}"`);
                if (!confirmed) return;

                // Send report to server
                socket.emit('report-word', {
                    classId: currentClassId,
                    word: messageContent,
                    context: 'Message Report',
                    messageId: reportBtn.dataset.messageId, // Send message ID for deletion
                    reporterName: userName
                }, (response) => {
                    if (response && response.success) {
                        reportBtn.textContent = '✅ ' + (translations[currentLanguage]['btn-reported-label'] || 'Reported');
                        reportBtn.disabled = true;
                        console.log(`✅ Message reported: ${messageContent.substring(0, 30)}...`);
                    } else {
                        alert(response?.message || 'Failed to report message');
                    }
                });
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

    // Sort: pinned first, then by newest
    const sortedFiles = fileMessages.slice().reverse().sort((a, b) => {
        const aId = a.fileData.id || a.id;
        const bId = b.fileData.id || b.id;
        const aPinned = pinnedFiles.has(aId);
        const bPinned = pinnedFiles.has(bId);
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;
        return 0;
    });

    sortedFiles.forEach(msg => {
        const fileId = msg.fileData.id || msg.id;
        const isPinned = pinnedFiles.has(fileId);
        const fileName = msg.fileData.name.toLowerCase();
        const fileType = msg.fileData.type || '';

        const isImage = fileType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName);
        const isPdf = fileType === 'application/pdf' || fileName.endsWith('.pdf');
        const isDoc = fileName.endsWith('.docx');
        const isXls = fileName.endsWith('.xlsx');
        const isTxt = fileName.endsWith('.txt');
        const isVideo = fileType.startsWith('video/') || /\.(mp4|avi|mov|mkv|webm)$/i.test(fileName);
        const isAudio = fileType.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac)$/i.test(fileName);

        const isViewable = isImage || isPdf || isDoc || isXls || isTxt || isVideo || isAudio;

        const item = document.createElement("div");
        item.classList.add("media-item");
        if (isPinned) item.classList.add("pinned");

        const pinBtn = currentRole === 'teacher' ? `
            <button class="media-pin-btn" title="${isPinned ? 'Unpin' : 'Pin'}" data-file-id="${fileId}">
                <img src="/assets/pin-svgrepo-com.svg" class="icon-svg ${isPinned ? 'active' : ''}" alt="Pin" />
            </button>
        ` : '';

        const viewBtn = isViewable ? `
            <button class="media-view-btn" title="View" data-file-id="${fileId}">
                <img src="/assets/view-svgrepo-com.svg" class="icon-svg" alt="View" />
            </button>
        ` : '';

        item.innerHTML = `
            <div class="media-icon">${isPinned ? '<img src="/assets/pin-svgrepo-com.svg" class="icon-svg" />' : '<img src="/assets/files-svgrepo-com.svg" class="icon-svg" />'}</div>
            <div class="media-info">
                <div class="media-name" title="${escapeHtml(msg.fileData.name)}">${escapeHtml(msg.fileData.name)}</div>
                <div class="media-meta">
                    <span>${formatFileSize(msg.fileData.size)}</span>
                    <span>${msg.senderName}</span>
                </div>
            </div>
            <div class="media-actions-group">
                ${viewBtn}
                ${pinBtn}
                <button class="media-download-btn" title="Download" onclick="downloadFile('${msg.fileData.id || msg.fileData.data}', '${escapeHtml(msg.fileData.name)}')">
                    <img src="/assets/download-square-svgrepo-com.svg" class="icon-svg" alt="Download" />
                </button>
            </div>
        `;

        // Add view button listener
        const viewButton = item.querySelector('.media-view-btn');
        if (viewButton) {
            viewButton.addEventListener('click', (e) => {
                e.stopPropagation();
                const fId = msg.fileData.id || msg.id;
                const url = `/api/download/${fId}?inline=true`;

                if (isPdf) {
                    openPdfViewer(url);
                } else if (isImage) {
                    openImageViewer(url);
                } else if (isDoc) {
                    openDocumentViewer(url, msg.fileData.name, 'docx');
                } else if (isXls) {
                    openDocumentViewer(url, msg.fileData.name, 'xlsx');
                } else if (isTxt) {
                    openDocumentViewer(url, msg.fileData.name, 'txt');
                } else if (isVideo) {
                    openMediaPlayer(url, msg.fileData.name, 'video');
                } else if (isAudio) {
                    openMediaPlayer(url, msg.fileData.name, 'audio');
                }

                // Close Media Library if viewing
                if (mediaPopup) mediaPopup.classList.add("hidden");
            });
        }

        // Add pin button listener
        const pinButton = item.querySelector('.media-pin-btn');
        if (pinButton) {
            pinButton.addEventListener('click', (e) => {
                e.stopPropagation();
                const fId = pinButton.dataset.fileId;
                if (pinnedFiles.has(fId)) {
                    pinnedFiles.delete(fId);
                } else {
                    pinnedFiles.add(fId);
                }
                renderMediaHistory();
            });
        }

        mediaList.appendChild(item);
    });
}

function highlightMentions(text) {
    // Escape HTML first
    let escaped = escapeHtml(text);
    // Mentions disabled to prevent email interference
    return escaped;
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



    users.forEach(user => {
        const userDiv = document.createElement("div");
        userDiv.classList.add("user-item");

        const isBlocked = blockedUsers.has(user.id);
        const isStudent = user.role === 'student';

        // Add blocked class if user is blocked
        if (isBlocked) {
            userDiv.classList.add('blocked');
        }

        const handIcon = user.handRaised ? ' <span class="hand-raised-icon" title="Hand Raised"><img src="/assets/hand-shake-svgrepo-com.svg" class="icon-svg" style="width: 16px; height: 16px;" /></span>' : '';
        const blockedIcon = isBlocked ? ' <span class="blocked-icon" title="Blocked"><img src="/assets/message-block.svg" class="icon-svg" style="width: 16px; height: 16px;" /></span>' : '';

        userDiv.innerHTML = `
            <span class="user-status"></span>
            <span class="user-name">${escapeHtml(user.name)}</span>${handIcon}${blockedIcon}
        `;

        // Add block/unblock button for teachers (only for students)
        if (isTeacher && isStudent) {
            const blockBtn = document.createElement('button');
            blockBtn.innerHTML = isBlocked ? '<img src="/assets/tick-circle-svgrepo-com.svg" class="icon-svg" style="width: 16px; height: 16px;" />' : '<img src="/assets/block-1-svgrepo-com.svg" class="icon-svg" style="width: 16px; height: 16px;" />';
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

        // Check if a teacher joined - update hasTeacher flag
        if (user.role === 'teacher') {
            joinedClasses.get(classId).hasTeacher = true;
        }

        if (currentClassId === classId) {
            renderUsersList();

            // Update chat disabled state (enables chat when teacher joins)
            updateChatDisabledState();

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
                // If no classes left, Go to Scanning UI (Student) or Role Selection (Teacher fallback)
                chatInterface.classList.add("hidden");
                classSetup.classList.add("hidden");

                if (currentRole === 'student') {
                    // Go to scanning
                    availableClassesScreen.classList.remove('hidden');
                    renderScanningForTeacher();
                } else {
                    // Teacher fallback
                    roleSelection.classList.remove("hidden");
                }
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
// Listen for message deletion (e.g. from report approval)
socket.on('delete-message', ({ messageId, classId }) => {
    if (classId === currentClassId) {
        const msgDiv = document.querySelector(`.message[data-id="${messageId}"]`);
        if (msgDiv) {
            msgDiv.style.opacity = '0';
            setTimeout(() => msgDiv.remove(), 500); // Fade out effect
        }
        // Also remove from local messages array
        if (joinedClasses.has(currentClassId)) {
            const messages = joinedClasses.get(currentClassId).messages;
            const idx = messages.findIndex(m => m.id === messageId || m.id === parseFloat(messageId));
            if (idx !== -1) messages.splice(idx, 1);
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

// Old Image Viewer Logic Removed - Replaced by Enhanced Logic below

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

// Global function for file download with progress
window.downloadFile = function (fileIdOrData, fileName) {
    console.log(`[Download] Initiating download for: ${fileName} (ID/Data: ${fileIdOrData.substring(0, 50)}...)`);

    // Check if it's base64 data (legacy)
    if (fileIdOrData.startsWith('data:')) {
        console.log('[Download] Detected Base64 data, using direct link click');
        const a = document.createElement('a');
        a.href = fileIdOrData;
        a.download = fileName;
        a.click();
        return;
    }

    // Use XHR for download progress
    const xhr = new XMLHttpRequest();
    const url = `/api/download/${fileIdOrData}`;
    console.log(`[Download] Requesting URL: ${url}`);

    // Show Progress Modal
    const progressModal = document.getElementById('progress-modal');
    const progressTitle = document.getElementById('progress-title');
    const progressBar = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const btnCancel = document.getElementById('btn-cancel-progress');

    if (progressTitle) progressTitle.textContent = `Downloading ${fileName}...`;
    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.textContent = '0%';
    if (progressModal) progressModal.classList.remove('hidden');

    // Cancel Button
    if (btnCancel) {
        btnCancel.onclick = () => {
            console.log('[Download] Cancelled by user');
            xhr.abort();
            if (progressModal) progressModal.classList.add('hidden');
        };
    }

    xhr.responseType = 'blob'; // Important for binary files

    xhr.onprogress = (event) => {
        if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            if (progressBar) progressBar.style.width = percentComplete + '%';
            if (progressText) progressText.textContent = percentComplete + '%';
        } else {
            // If total size is unknown, show indeterminate state
            if (progressBar) {
                progressBar.style.width = '100%';
                progressBar.classList.add('indeterminate');
            }
            if (progressText) progressText.textContent = 'Downloading...';
        }
    };

    xhr.onload = () => {
        if (progressModal) progressModal.classList.add('hidden');
        if (xhr.status === 200) {
            console.log(`[Download] Download successful (Status 200). Processing blob...`);
            const blob = xhr.response;
            console.log(`[Download] Blob size: ${blob.size}, type: ${blob.type}`);
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            console.log('[Download] Anchor clicked, cleanup starting...');
            setTimeout(() => {
                document.body.removeChild(a);
                window.URL.revokeObjectURL(downloadUrl);
                console.log('[Download] Cleanup done');
            }, 100);
        } else {
            console.error(`[Download] Download failed. Status: ${xhr.status}, StatusText: ${xhr.statusText}`);
            alert('Download failed');
        }
    };

    xhr.onerror = () => {
        if (progressModal) progressModal.classList.add('hidden');
        console.error('[Download] Network error occurred during download request');
        alert('Download failed due to network error');
    };

    xhr.open('GET', url, true);
    xhr.send();
    console.log('[Download] XHR Request sent');
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
        // Ping response received, just keep connection alive
        // const latency = Date.now() - start;
        // console.log(`Ping: ${latency}ms`);
    });
}, 5000);
// Content Filtering Module
// Add this to the end of main.js

// ===== INTERNATIONALIZATION =====

function t(key) {
    return translations[currentLanguage][key] || key;
}

function updateUIText() {
    // Update elements with data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (translations[currentLanguage][key]) {
            el.textContent = translations[currentLanguage][key];
        }
    });

    // Update placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (translations[currentLanguage][key]) {
            el.placeholder = translations[currentLanguage][key];
        }
    });

    // Update titles
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (translations[currentLanguage][key]) {
            el.title = translations[currentLanguage][key];
        }
    });

    // Toggle greek font class for better styling if needed
    if (currentLanguage === 'el') {
        document.body.classList.add('lang-el');
    } else {
        document.body.classList.remove('lang-el');
    }
}

// Initialize Language
if (languageSelect) {
    languageSelect.value = currentLanguage;
    languageSelect.addEventListener('change', (e) => {
        currentLanguage = e.target.value;
        localStorage.setItem('language', currentLanguage);

        // Auto-regenerate name in new language
        const newName = generateRandomName(currentLanguage);
        userName = newName;
        localStorage.setItem('classsend-userName', newName);
        if (settingsNameInput) settingsNameInput.value = newName;

        updateUIText();
        updateRoleDisplay(); // Update role text

        // If teacher in a class, sync language to all students
        if (currentRole === 'teacher' && currentClassId) {
            socket.emit('set-class-language', { classId: currentClassId, language: currentLanguage });
        } else if (currentRole === 'student' && currentClassId) {
            // If student, update name on server
            socket.emit("change-user-name", { classId: currentClassId, newName }, (response) => { });
        }
    });
}

// Initialize Personalization Settings
if (checkAutoOpenConnection) {
    const saved = localStorage.getItem('autoOpenConnection');
    checkAutoOpenConnection.checked = saved === 'true'; // Default to false if not set
    checkAutoOpenConnection.addEventListener('change', (e) => {
        localStorage.setItem('autoOpenConnection', e.target.checked);
    });
}

if (checkAutoCloseConnection) {
    const saved = localStorage.getItem('autoCloseConnection');
    checkAutoCloseConnection.checked = saved === 'true'; // Default to false if not set
    checkAutoCloseConnection.addEventListener('change', (e) => {
        localStorage.setItem('autoCloseConnection', e.target.checked);
    });
}

// Listen for language sync from teacher
socket.on('language-changed', ({ language, classId }) => {
    if (classId === currentClassId) {
        currentLanguage = language;
        localStorage.setItem('language', currentLanguage);
        if (languageSelect) languageSelect.value = currentLanguage;
        updateUIText();
        updateRoleDisplay(); // Update role text
        console.log(`Language synced to ${language} from teacher`);
    }
});

// Screen Share Quality Setting
const screenShareQualitySelect = document.getElementById("screen-share-quality");
let screenShareQuality = localStorage.getItem('screenShareQuality') || 'auto';

if (screenShareQualitySelect) {
    screenShareQualitySelect.value = screenShareQuality;
    screenShareQualitySelect.addEventListener('change', (e) => {
        screenShareQuality = e.target.value;
        localStorage.setItem('screenShareQuality', screenShareQuality);
        console.log('Screen share quality set to:', screenShareQuality);
    });
}

// Clear Data Button (Admin)
const btnClearData = document.getElementById('btn-clear-data');
if (btnClearData) {
    btnClearData.addEventListener('click', () => {
        if (confirm("⚠️ WARNING: This will delete ALL files in the MediaLibrary and reset all class data.\n\nAre you sure you want to proceed?")) {
            // 1. Clear Local State immediately
            localStorage.removeItem('classsend-classId');
            localStorage.removeItem('classsend-userName');

            // 2. Visual Feedback
            const originalText = btnClearData.textContent;
            btnClearData.textContent = '⏳ Deleting...';

            // 3. Request Server Clear
            socket.emit('clear-data');
        }
    });
}

// Handle Data Cleared Event
socket.on('data-cleared', () => {
    alert("✅ All data has been cleared. The application will now reload.");
    window.location.reload();
});

// Settings Toggle
if (btnSettingsToggle) {
    btnSettingsToggle.addEventListener('click', () => {
        if (settingsModal.classList.contains('hidden')) {
            settingsModal.classList.remove('hidden');
        } else {
            settingsModal.classList.add('hidden');
        }
    });
}

if (btnCloseSettings) {
    btnCloseSettings.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });
}

// Apply translations on load
document.addEventListener('DOMContentLoaded', () => {
    updateUIText();


});

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

            // 2. Fuzzy match
            // SKIP fuzzy matching in Deep Learning mode to avoid false positives (e.g. 'good' -> 'gook')
            // Let the server AI handle subtle cases.
            if (filterMode !== 'deep-learning' && inputWord.length > 3 && bannedWord.length > 3) {
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

    // Ensure translations are applied to any new dynamic elements
    updateUIText();
};

// Slider Fill Logic
function updateSliderFill(slider) {
    if (!slider) return;
    const val = (slider.value - slider.min) / (slider.max - slider.min) * 100;
    slider.style.background = `linear-gradient(to right, var(--accent-primary) ${val}%, var(--bg-tertiary) ${val}%)`;
}

if (modelBlockSlider) {
    modelBlockSlider.addEventListener('input', () => updateSliderFill(modelBlockSlider));
    // Initialize
    updateSliderFill(modelBlockSlider);
}

if (modelReportSlider) {
    modelReportSlider.addEventListener('input', () => updateSliderFill(modelReportSlider));
    // Initialize
    updateSliderFill(modelReportSlider);
}

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

    const t = (key) => translations[currentLanguage][key] || key;

    container.innerHTML = `
        <div class="pinned-header">
            <span class="pinned-icon"><img src="/assets/pin-svgrepo-com.svg" class="icon-svg" alt="Pin" /></span>
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
                        <span class="pinned-text">${escapeHtml(translations[currentLanguage][msg.content] || t(msg.content) || msg.content)}</span>
                    </div>
                    <div class="pinned-message-actions">
                        <button class="action-btn copy-btn-pinned" data-content="${escapeHtml(msg.content)}" title="${t('btn-copy-label')}"><img src="/assets/copy-svgrepo-com.svg" class="icon-svg" style="width: 14px; height: 14px;" /><span class="btn-label">${t('btn-copy-label')}</span></button>
                        ${hasEmail ? `<button class="action-btn mailto-btn-pinned" data-content="${escapeHtml(msg.content)}" title="${t('btn-email-label')}"><img src="/assets/sms-4-svgrepo-com.svg" class="icon-svg" style="width: 14px; height: 14px;" /><span class="btn-label">${t('btn-email-label')}</span></button>` : ''}
                        ${hasUrl ? `<button class="action-btn url-btn-pinned" data-content="${escapeHtml(msg.content)}" title="${t('btn-open-link-label')}"><img src="/assets/link-circle.svg" class="icon-svg" style="width: 14px; height: 14px;" /><span class="btn-label">${t('btn-open-link-label')}</span></button>` : ''}
                        ${msg.action === 'join-stream' ? `<button class="action-btn join-stream-btn-pinned" title="${t('btn-join-stream')}">${t('btn-join-stream')}</button>` : ''}
                        ${currentRole === 'teacher' ? `<button class="action-btn unpin-btn" data-message-id="${msg.id}" title="${t('btn-unpin-label') || 'Unpin'}"><img src="/assets/pin-svgrepo-com.svg" class="icon-svg" style="width: 14px; height: 14px;" /><span class="btn-label">${t('btn-unpin-label') || 'Unpin'}</span></button>` : ''}
                    </div>
                </div>
            `}).join('')}
        </div>
    `;

    // Add event listeners for action buttons
    const pinnedContainer = document.getElementById('pinned-messages-container');

    // Join Stream buttons
    pinnedContainer.querySelectorAll('.join-stream-btn-pinned').forEach(btn => {
        btn.addEventListener('click', () => {
            videoModal.classList.remove("hidden");
            videoStatus.textContent = "Connecting to stream...";
            // If we already have a connection, it might just show up.
            // If we need to signal readiness, we could emit 'request-join-stream' here.
            // But for now, teacher sends offers to everyone, so we just show the modal.
            // Wait... if we hid the modal, the connection might still be active or closed.
        });
    });

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
            if (urls) openWebViewer(urls[0]);
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


// ===== blacklist (FORBIDDEN WORDS) FEATURE =====
// Custom forbidden words added by teacher
let customForbiddenWords = [];

// DOM Elements for blacklist
const blacklistModal = document.getElementById('blacklist-modal');
const btnBlacklist = document.getElementById('btn-blacklist');
const btnCloseBlacklist = document.getElementById('btn-close-blacklist');
const blacklistWordInput = document.getElementById('blacklist-word-input');
const btnAddWord = document.getElementById('btn-add-word');
const blacklistWordList = document.getElementById('blacklist-word-list');
const textSelectionPopup = document.getElementById('text-selection-popup');
const btnAddSelectionToblacklist = document.getElementById('btn-add-selection-to-blacklist');

// Show/hide blacklist button based on role
// Show/hide teacher actions based on role
function updateBlacklistButtonVisibility() {
    const teacherActions = document.getElementById("teacher-actions");
    if (teacherActions) {
        if (currentRole === 'teacher') {
            teacherActions.classList.remove('hidden');
        } else {
            teacherActions.classList.add('hidden');
        }
    }

    // New layout: handle individual buttons in the chat bar
    if (btnShareScreen) {
        if (currentRole === 'teacher') {
            btnShareScreen.classList.remove('hidden');
        } else {
            btnShareScreen.classList.add('hidden');
        }
    }
}

// Open blacklist Modal
if (btnBlacklist) {
    btnBlacklist.addEventListener('click', () => {
        // Close other modals
        if (mediaPopup) mediaPopup.classList.add('hidden');
        if (connectionModal) connectionModal.classList.add('hidden');

        // Load words and show modal
        loadForbiddenWords();
        blacklistModal.classList.remove('hidden');
    });
}

// Close blacklist Modal
if (btnCloseBlacklist) {
    btnCloseBlacklist.addEventListener('click', () => {
        blacklistModal.classList.add('hidden');
    });
}

// Close modal when clicking outside
if (blacklistModal) {
    blacklistModal.addEventListener('click', (e) => {
        if (e.target === blacklistModal) {
            blacklistModal.classList.add('hidden');
        }
    });
}

// Load forbidden words from server
function loadForbiddenWords() {
    socket.emit('get-forbidden-words', (words) => {
        customForbiddenWords = words || [];
        renderForbiddenWordsList();
    });
}

socket.on('forbidden-words-updated', (words) => {
    customForbiddenWords = words || [];
    renderForbiddenWordsList();
});

// Render Forbidden Words List
function renderForbiddenWordsList() {
    if (!blacklistWordList) return;
    blacklistWordList.innerHTML = "";

    if (customForbiddenWords.length === 0) {
        blacklistWordList.innerHTML = '<div class="empty-blacklist-state">No custom words added yet</div>';
        return;
    }

    // Sort by newest first
    customForbiddenWords.slice().reverse().forEach(item => {
        const row = document.createElement("div");
        row.className = "blacklist-word-item";
        row.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #333; margin-bottom: 5px; border-radius: 5px;";

        const dateStr = item.addedAt ? new Date(item.addedAt).toLocaleDateString() : '';
        const sourceIcon = item.source === 'report' ? '🛡️' : '';

        row.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-weight: bold; color: #ff6b6b;">${escapeHtml(item.word)}</span>
                ${sourceIcon ? `<span title="From Report">${sourceIcon}</span>` : ''}
            </div>
            <div style="display: flex; align-items: center; gap: 15px;">
                <span style="color: #888; font-size: 0.85rem;">${dateStr}</span>
                <button class="remove-word-btn" style="background: none; border: none; color: #ff4444; cursor: pointer; font-size: 1.1rem;">✖</button>
            </div>
        `;

        row.querySelector(".remove-word-btn").addEventListener("click", () => {
            if (confirm(`Remove '${item.word}' from blacklist?`)) {
                socket.emit('remove-forbidden-word', { word: item.word }, (res) => {
                    if (!res.success) alert(res.message || "Failed to remove");
                });
            }
        });

        blacklistWordList.appendChild(row);
    });
}

// Add Blacklist Word
if (btnAddWord) {
    btnAddWord.addEventListener("click", () => {
        if (!blacklistWordInput) return;
        const word = blacklistWordInput.value.trim();
        if (!word) return;

        socket.emit('add-forbidden-word', { word }, (res) => {
            if (res.success) {
                blacklistWordInput.value = "";
                blacklistWordInput.focus();
            } else {
                alert(res.message || "Failed to add word");
            }
        });
    });
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

// Add selected text to blacklist
if (btnAddSelectionToblacklist) {
    btnAddSelectionToblacklist.addEventListener('click', () => {
        if (selectedText) {
            addForbiddenWord(selectedText);
            hideTextSelectionPopup();
            window.getSelection().removeAllRanges();
        }
    });
}

// Note: updateBlacklistButtonVisibility is called from within switchClass function

// Enhanced containsInappropriateContent to include custom words
const originalContainsInappropriateContent = containsInappropriateContent;
containsInappropriateContent = function (text) {
    // Check custom whitelist FIRST
    if (customWhitelistedWords && customWhitelistedWords.length > 0) {
        const lowerText = text.toLowerCase();
        const isWhitelisted = customWhitelistedWords.some(w => lowerText.includes(w.word.toLowerCase()));
        if (isWhitelisted) return false;
    }

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

// ===== WEB RTC SCREEN SHARING =====

const btnShareScreen = document.getElementById("btn-tool-share-screen");
const videoModal = document.getElementById("video-modal");
const btnCloseVideo = document.getElementById("btn-close-video");
const remoteVideo = document.getElementById("remote-video");
const videoStatus = document.getElementById("video-status");
const streamTitle = document.getElementById("stream-title");

// Video Controls
const btnMinimizeVideo = document.getElementById("btn-minimize-video");
const btnViewStream = document.getElementById("btn-view-stream");
const btnZoomIn = document.getElementById("btn-zoom-in");
const btnZoomOut = document.getElementById("btn-zoom-out");
const btnZoomReset = document.getElementById("btn-zoom-reset");
const btnFullscreen = document.getElementById("btn-fullscreen");

let videoZoomLevel = 1;

let localStream = null;
let isScreenSharing = false;
let peerConnections = {}; // Map<socketId, RTCPeerConnection> (Teacher side)
let myPeerConnection = null; // RTCPeerConnection (Student side)

const RTC_CONFIG = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:global.stun.twilio.com:3478" }
    ],
    // Prefer local network paths for lower latency
    iceTransportPolicy: 'all',
    // Bundle policy for better performance
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require',
    // Enable ICE candidate pooling for faster connection
    iceCandidatePoolSize: 2
};

// ===== COMPRESSION & QUALITY OPTIMIZATION =====

// Target bitrates based on quality settings (in bps)
// ethernet: High bandwidth, low latency for wired connections
// auto: Balanced defaults that adapt to network
// wifi: Conservative for slower/congested wireless networks
const BITRATE_PRESETS = {
    ethernet: { min: 2000000, target: 4000000, max: 6000000 },  // 2-6 Mbps (fast, high quality)
    auto: { min: 400000, target: 1000000, max: 1500000 },       // 0.4-1.5 Mbps (balanced)
    wifi: { min: 150000, target: 400000, max: 800000 }          // 0.15-0.8 Mbps (conservative)
};

// Network state tracking for adaptive quality
let networkQualityLevel = 'good'; // 'good', 'medium', 'poor'
let qualityMonitoringInterval = null;

// Prefer VP9 codec in SDP for better compression (~30-40% smaller than VP8)
function preferVP9Codec(sdp) {
    // Split SDP into lines
    const lines = sdp.split('\r\n');
    const videoMLineIndex = lines.findIndex(line => line.startsWith('m=video'));

    if (videoMLineIndex === -1) return sdp;

    // Find VP9 payload types
    const vp9Lines = lines.filter(line => line.toLowerCase().includes('vp9'));
    if (vp9Lines.length === 0) return sdp; // VP9 not supported

    // Find VP9 payload type from rtpmap
    let vp9PayloadType = null;
    for (const line of lines) {
        const match = line.match(/^a=rtpmap:(\d+)\s+VP9\//i);
        if (match) {
            vp9PayloadType = match[1];
            break;
        }
    }

    if (!vp9PayloadType) return sdp;

    // Reorder codecs in m=video line to prefer VP9
    const mLine = lines[videoMLineIndex];
    const parts = mLine.split(' ');
    // parts[0] = 'm=video', parts[1] = port, parts[2] = protocol, rest are payload types
    if (parts.length > 3) {
        const payloadTypes = parts.slice(3);
        const vp9Index = payloadTypes.indexOf(vp9PayloadType);
        if (vp9Index > 0) {
            // Move VP9 to first position
            payloadTypes.splice(vp9Index, 1);
            payloadTypes.unshift(vp9PayloadType);
            lines[videoMLineIndex] = parts.slice(0, 3).concat(payloadTypes).join(' ');
        }
    }

    return lines.join('\r\n');
}

// Get current bitrate preset based on quality setting
function getCurrentBitratePreset() {
    const qualitySetting = localStorage.getItem('screenShareQuality') || 'auto';
    return BITRATE_PRESETS[qualitySetting] || BITRATE_PRESETS.auto;
}

// Calculate target bitrate based on network quality
function calculateTargetBitrate() {
    const preset = getCurrentBitratePreset();

    switch (networkQualityLevel) {
        case 'poor':
            return preset.min;
        case 'medium':
            return Math.round((preset.min + preset.target) / 2);
        case 'good':
        default:
            return preset.target;
    }
}

// Apply optimized encoding parameters to sender
async function applyEncodingOptimizations(sender, isInitial = true) {
    if (sender.track?.kind !== 'video') return;

    const targetBitrate = calculateTargetBitrate();
    const preset = getCurrentBitratePreset();
    const qualitySetting = localStorage.getItem('screenShareQuality') || 'auto';

    try {
        const parameters = sender.getParameters();

        if (!parameters.encodings || parameters.encodings.length === 0) {
            parameters.encodings = [{}];
        }

        // Apply compression-optimized encoding params
        parameters.encodings[0] = {
            ...parameters.encodings[0],
            maxBitrate: targetBitrate,
            // Scale down resolution on poor networks
            scaleResolutionDownBy: networkQualityLevel === 'poor' ? 1.5 : 1.0,
            // Adaptive framerate: lower on poor network, higher on ethernet
            maxFramerate: networkQualityLevel === 'poor' ? 12 :
                (qualitySetting === 'ethernet' ? 30 : 20),
            // Network priority for QoS
            networkPriority: 'high',
            priority: 'high'
        };

        await sender.setParameters(parameters);

        if (isInitial) {
            console.log(`📹 Applied encoding: ${Math.round(targetBitrate / 1000)}kbps, network: ${networkQualityLevel}`);
        }
    } catch (err) {
        console.warn('Failed to apply encoding optimizations:', err);
    }
}

// Monitor connection quality and adapt encoding dynamically
async function monitorAndAdaptQuality(pc, sender) {
    if (!pc || pc.connectionState === 'closed') return;

    try {
        const stats = await pc.getStats(sender);
        let rtt = 0;
        let packetsLost = 0;
        let packetsSent = 0;
        let bytesSent = 0;

        stats.forEach(report => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                rtt = report.currentRoundTripTime * 1000 || rtt; // Convert to ms
            }
            if (report.type === 'outbound-rtp' && report.kind === 'video') {
                packetsLost = report.packetsLost || 0;
                packetsSent = report.packetsSent || 0;
                bytesSent = report.bytesSent || 0;
            }
        });

        const packetLossRate = packetsSent > 0 ? (packetsLost / packetsSent) * 100 : 0;

        // Determine network quality level
        let newQualityLevel = 'good';
        if (rtt > 300 || packetLossRate > 5) {
            newQualityLevel = 'poor';
        } else if (rtt > 150 || packetLossRate > 2) {
            newQualityLevel = 'medium';
        }

        // Only update if quality changed
        if (newQualityLevel !== networkQualityLevel) {
            const previousLevel = networkQualityLevel;
            networkQualityLevel = newQualityLevel;
            console.log(`📊 Network quality: ${previousLevel} → ${newQualityLevel} (RTT: ${Math.round(rtt)}ms, Loss: ${packetLossRate.toFixed(1)}%)`);

            // Re-apply encoding with new quality level
            await applyEncodingOptimizations(sender, false);
        }
    } catch (err) {
        // Stats might not be available, that's ok
    }
}

// Start quality monitoring for a peer connection
function startQualityMonitoring(pc, sender) {
    // Clear any existing monitoring
    stopQualityMonitoring();

    // Monitor every 3 seconds
    qualityMonitoringInterval = setInterval(() => {
        monitorAndAdaptQuality(pc, sender);
    }, 3000);

    console.log('📈 Started quality monitoring');
}

function stopQualityMonitoring() {
    if (qualityMonitoringInterval) {
        clearInterval(qualityMonitoringInterval);
        qualityMonitoringInterval = null;
        networkQualityLevel = 'good'; // Reset for next session
        console.log('📉 Stopped quality monitoring');
    }
}

// --- TEACHER SIDE ---

if (btnShareScreen) {
    btnShareScreen.addEventListener("click", async () => {
        if (isScreenSharing) {
            stopScreenShare();
        } else {
            startScreenShare();
        }
    });
}

async function startScreenShare() {
    try {
        // Get video constraints based on quality setting
        const qualitySetting = localStorage.getItem('screenShareQuality') || 'auto';
        let videoConstraints;

        switch (qualitySetting) {
            case 'ethernet':
                // Ethernet (Fast): High quality, higher framerate for wired connections
                videoConstraints = {
                    cursor: "always",
                    width: { ideal: 1920, max: 1920 },
                    height: { ideal: 1080, max: 1080 },
                    frameRate: { ideal: 30, max: 60 }
                };
                console.log("Screen share: Ethernet mode (1080p, 30fps, high bitrate)");
                break;
            case 'wifi':
                // WiFi (Slow): Conservative for slower/congested wireless networks
                videoConstraints = {
                    cursor: "always",
                    width: { ideal: 1280, max: 1280 },
                    height: { ideal: 720, max: 720 },
                    frameRate: { ideal: 15, max: 20 }
                };
                console.log("Screen share: WiFi mode (720p, 15fps, low bitrate)");
                break;
            case 'auto':
            default:
                // Balanced: adaptive resolution
                videoConstraints = {
                    cursor: "always",
                    width: { ideal: 1280, max: 1920 },
                    height: { ideal: 720, max: 1080 },
                    frameRate: { ideal: 20, max: 30 }
                };
                console.log("Screen share: Auto mode (adaptive)");
                break;
        }

        localStream = await navigator.mediaDevices.getDisplayMedia({
            video: videoConstraints,
            audio: false
        });

        // Set content hint for screen optimization (prioritizes sharp text over smooth motion)
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack && 'contentHint' in videoTrack) {
            videoTrack.contentHint = 'detail'; // Optimize for screen content (text, sharp edges)
            console.log('📺 Content hint set to "detail" for screen optimization');
        }

        isScreenSharing = true;
        updateScreenShareButton();

        // Broadcast status
        socket.emit("screen-share-status", { classId: currentClassId, isSharing: true });

        // Handle user stopping via browser UI
        localStream.getVideoTracks()[0].onended = () => {
            stopScreenShare();
        };

        // Initialize connections for all existing students
        const classData = joinedClasses.get(currentClassId);
        if (classData && classData.users) {
            classData.users.forEach(user => {
                if (user.id !== socket.id && user.role === 'student') {
                    initiatePeerConnection(user.id);
                }
            });
        }

        console.log("Screen sharing started with compression optimizations");

    } catch (err) {
        console.error("Error starting screen share:", err);
        isScreenSharing = false;
    }
}

function stopScreenShare() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    isScreenSharing = false;
    updateScreenShareButton();

    // Stop quality monitoring
    stopQualityMonitoring();

    // Close all peer connections
    Object.values(peerConnections).forEach(pc => pc.close());
    peerConnections = {};

    // Broadcast status
    socket.emit("screen-share-status", { classId: currentClassId, isSharing: false });
    console.log("Screen sharing stopped");
}

function updateScreenShareButton() {
    const label = btnShareScreen.querySelector('.btn-label');
    const toolBtn = document.getElementById("btn-tool-share-screen");
    // Aligning with 'Block Hands' pattern: Only toggle active state, do NOT change text.
    // This allows updateUIText() to handle localization centrally and consistently.
    // Text will remain "Screen Sharing" (localized) but button will light up when active.

    if (isScreenSharing) {
        if (toolBtn) toolBtn.classList.add("active");
        if (btnShareScreen && btnShareScreen !== toolBtn) btnShareScreen.classList.add("active");
    } else {
        if (toolBtn) toolBtn.classList.remove("active");
        if (btnShareScreen && btnShareScreen !== toolBtn) btnShareScreen.classList.remove("active");
    }
}

async function initiatePeerConnection(studentSocketId) {
    console.log("Initiating peer connection to:", studentSocketId);
    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerConnections[studentSocketId] = pc;

    let videoSender = null;

    // Add local stream tracks with optimized parameters
    if (localStream) {
        localStream.getTracks().forEach(track => {
            const sender = pc.addTrack(track, localStream);

            // Apply encoding optimizations for video
            if (track.kind === 'video') {
                videoSender = sender;
                applyEncodingOptimizations(sender, true);
            }
        });
    }

    // Start quality monitoring for this connection
    if (videoSender) {
        startQualityMonitoring(pc, videoSender);
    }

    // ICE Candidates
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("signal", {
                to: studentSocketId,
                from: socket.id,
                signal: { type: "candidate", candidate: event.candidate }
            });
        }
    };

    // Create Offer with VP9 preference
    try {
        const offer = await pc.createOffer();

        // Use default codec preference (VP8 usually) for lower latency
        const modifiedSdp = offer.sdp; // preferVP9Codec(offer.sdp);
        const optimizedOffer = new RTCSessionDescription({
            type: offer.type,
            sdp: modifiedSdp
        });

        await pc.setLocalDescription(optimizedOffer);

        socket.emit("signal", {
            to: studentSocketId,
            from: socket.id,
            signal: { type: "offer", sdp: optimizedOffer }
        });

        console.log("📦 Sent offer (Default codec preference)");
    } catch (err) {
        console.error("Error creating offer:", err);
    }
}

// --- STUDENT SIDE ---

// Handle incoming signal (Offer, Answer, Candidate)
socket.on("signal", async ({ from, signal }) => {
    // If Teacher: Handle Answer or Candidate from Student
    if (currentRole === 'teacher') {
        const pc = peerConnections[from];
        if (!pc) return;

        if (signal.type === "answer") {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        } else if (signal.type === "candidate") {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
    }
    // If Student: Handle Offer or Candidate from Teacher
    else if (currentRole === 'student') {
        if (!myPeerConnection) createStudentPeerConnection(from);

        if (signal.type === "offer") {
            await myPeerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
            // Create Answer
            const answer = await myPeerConnection.createAnswer();
            await myPeerConnection.setLocalDescription(answer);
            socket.emit("signal", {
                to: from,
                from: socket.id,
                signal: { type: "answer", sdp: answer }
            });
            // Open modal automatically on offer (stream starting)
            // DISABLED: User must click "Join" in pinned message
            // videoModal.classList.remove("hidden");
            videoStatus.textContent = "Connecting to stream...";
        } else if (signal.type === "candidate") {
            await myPeerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
    }
});

function createStudentPeerConnection(teacherId) {
    if (myPeerConnection) myPeerConnection.close();

    myPeerConnection = new RTCPeerConnection(RTC_CONFIG);

    myPeerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit("signal", {
                to: teacherId,
                from: socket.id,
                signal: { type: "candidate", candidate: event.candidate }
            });
        }
    };

    myPeerConnection.ontrack = (event) => {
        console.log("🎥 Stream received! Tracks:", event.streams[0].getTracks());
        const stream = event.streams[0];
        remoteVideo.srcObject = stream;

        remoteVideo.onloadedmetadata = () => {
            console.log("🎥 Video metadata loaded. Dimensions:", remoteVideo.videoWidth, "x", remoteVideo.videoHeight);
        };

        remoteVideo.onplaying = () => {
            console.log("🎥 Video is playing!");
        };

        remoteVideo.onerror = (e) => {
            console.error("🎥 Video error:", e);
        };

        const playPromise = remoteVideo.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                console.log("🎥 Video playback started successfully");
                videoStatus.classList.add("hidden");
            }).catch(e => {
                console.error("🎥 Error auto-playing video:", e);
                // Auto-play failed, show a manual play button or muted hint
            });
        }
    };

    // Handle stream end
    myPeerConnection.onconnectionstatechange = () => {
        if (myPeerConnection.connectionState === 'disconnected' ||
            myPeerConnection.connectionState === 'closed') {
            videoModal.classList.add("hidden");
            remoteVideo.srcObject = null;
        }
    };
}

// Smart IP Entry Logic (Shared)
const smartIpPrefix = document.getElementById('smart-ip-prefix');
const smartIpSuffix = document.getElementById('smart-ip-suffix');
const btnManualConnect = document.getElementById('btn-manual-connect');

const smartIpPrefixModal = document.getElementById('smart-ip-prefix-modal');
const smartIpSuffixModal = document.getElementById('smart-ip-suffix-modal');
const btnManualConnectModal = document.getElementById('btn-manual-connect-modal');

const smartIpPort = document.getElementById('smart-ip-port');
const smartIpPortModal = document.getElementById('smart-ip-port-modal');

let currentIpPrefix = '';
let currentServerPort = 3000;

socket.on('network-info', (data) => {
    if (data.prefix) {
        currentIpPrefix = data.prefix;
        if (smartIpPrefix) smartIpPrefix.textContent = currentIpPrefix;
        if (smartIpPrefixModal) smartIpPrefixModal.textContent = currentIpPrefix;
    }
    if (data.port) {
        currentServerPort = data.port;
        if (smartIpPort) smartIpPort.textContent = currentServerPort;
        if (smartIpPortModal) smartIpPortModal.textContent = currentServerPort;
    }
});

const handleManualIpConnect = (suffix) => {
    if (!suffix) return alert('Please enter the last number of the IP address');
    const fullIp = `${currentIpPrefix}${suffix}`;
    let targetUrl = `http://${fullIp}:${currentServerPort}`;

    console.log(`Manual connection to: ${targetUrl}`);
    saveKnownServer(targetUrl); // Save history on CURRENT origin

    // Append identity
    if (currentRole && userName) {
        targetUrl += `?role=${encodeURIComponent(currentRole)}&name=${encodeURIComponent(userName)}`;
    }

    window.location.href = targetUrl;
};

if (btnManualConnect) {
    btnManualConnect.addEventListener('click', () => {
        handleManualIpConnect(smartIpSuffix.value.trim());
    });
    smartIpSuffix.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') btnManualConnect.click();
    });
}



if (btnManualConnectModal) {
    btnManualConnectModal.addEventListener('click', () => {
        handleManualIpConnect(smartIpSuffixModal.value.trim());
    });
    smartIpSuffixModal.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') btnManualConnectModal.click();
    });
}

// ===== IP HISTORY UI LOGIC =====

function renderHistoryList(container, isMini = false) {
    if (!container) return;
    container.innerHTML = "";

    try {
        const knownServers = JSON.parse(localStorage.getItem('classsend-known-servers') || '[]');

        if (knownServers.length === 0) {
            container.innerHTML = `<div class="empty-state-small" data-i18n="history-empty">No history yet</div>`;
            return;
        }

        // For mini lists (dialogs), show max 3
        const listToShow = isMini ? knownServers.slice(0, 3) : knownServers;

        listToShow.forEach(serverUrl => {
            const item = document.createElement("div");
            item.className = "blacklist-word-item history-item"; // Reusing styles
            item.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 10px; background: rgba(255, 255, 255, 0.05); margin-bottom: 5px; border-radius: 5px;";

            // Parse IP/Port for display
            let displayUrl = serverUrl.replace(/^http:\/\//, '').replace(/\/$/, '');

            item.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="/assets/history-svgrepo-com.svg" class="icon-svg" style="width: 16px; height: 16px; opacity: 0.7;" alt="History" />
                    <span style="font-weight: bold; color: #fff;">${escapeHtml(displayUrl)}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <button class="history-btn connect" title="Connect" style="background: none; border: none; color: #4db8ff; cursor: pointer; font-size: 1.1rem; display: flex; align-items: center; padding: 5px;">
                        <img src="/assets/connection-pattern-1104-svgrepo-com.svg" class="icon-svg" style="width: 18px; height: 18px;" />
                    </button>
                    <button class="history-btn delete" title="Delete" style="background: none; border: none; color: #ff4444; cursor: pointer; font-size: 1.1rem; display: flex; align-items: center; padding: 5px;">
                        ✖
                    </button>
                </div>
            `;

            // Actions
            item.querySelector(".connect").addEventListener("click", () => {
                // Redirect to server (same as manual IP connect behavior)
                let targetUrl = serverUrl;
                if (currentRole && userName) {
                    targetUrl += `?role=${encodeURIComponent(currentRole)}&name=${encodeURIComponent(userName)}`;
                }
                saveKnownServer(serverUrl); // Ensure it stays at top of history
                window.location.href = targetUrl;
            });

            item.querySelector(".delete").addEventListener("click", (e) => {
                e.stopPropagation();
                deleteKnownServer(serverUrl);
            });

            container.appendChild(item);
        });
    } catch (e) {
        console.error("Failed to render history", e);
    }
}

function deleteKnownServer(urlToDelete) {
    try {
        let knownServers = JSON.parse(localStorage.getItem('classsend-known-servers') || '[]');
        knownServers = knownServers.filter(url => url !== urlToDelete);
        localStorage.setItem('classsend-known-servers', JSON.stringify(knownServers));

        // Refresh all lists
        renderGlobalHistoryLists();
    } catch (e) { console.error(e); }
}

function renderGlobalHistoryLists() {
    if (settingsKnownServersList) renderHistoryList(settingsKnownServersList, false);
    if (modalManualHistoryList) renderHistoryList(modalManualHistoryList, true);
    if (smartIpHistoryList) renderHistoryList(smartIpHistoryList, true);

    // Update visibility of containers
    const knownServers = JSON.parse(localStorage.getItem('classsend-known-servers') || '[]');
    if (knownServers.length > 0) {
        if (modalManualHistoryList) modalManualHistoryList.classList.remove("hidden");
        if (smartIpHistoryList) smartIpHistoryList.classList.remove("hidden");
    } else {
        if (modalManualHistoryList) modalManualHistoryList.classList.add("hidden");
        if (smartIpHistoryList) smartIpHistoryList.classList.add("hidden");
    }
}

// History Modal Events
if (btnOpenHistoryModal) {
    btnOpenHistoryModal.addEventListener("click", () => {
        if (historyModal) {
            historyModal.classList.remove("hidden");
            renderGlobalHistoryLists();
        }
    });
}

if (btnCloseHistoryModal) {
    btnCloseHistoryModal.addEventListener("click", () => {
        if (historyModal) historyModal.classList.add("hidden");
    });
}

if (historyModal) {
    historyModal.addEventListener("click", (e) => {
        if (e.target === historyModal) historyModal.classList.add("hidden");
    });
}

// Initial Render
renderGlobalHistoryLists();

// Auto-Discovery Toggle Logic
const autoDiscoveryToggle = document.getElementById("auto-discovery-toggle");
if (autoDiscoveryToggle) {
    autoDiscoveryToggle.checked = isAutoDiscoveryEnabled;
    autoDiscoveryToggle.addEventListener("change", (e) => {
        isAutoDiscoveryEnabled = e.target.checked;
        localStorage.setItem('classsend-auto-discovery', isAutoDiscoveryEnabled);

        if (isAutoDiscoveryEnabled) {
            startNetworkDiscovery();
            console.log("Auto-discovery enabled");
        } else {
            stopNetworkDiscovery();
            console.log("Auto-discovery disabled");
        }
    });
}


// Global Event: Screen Share Status Update
socket.on("screen-share-status-update", ({ isSharing, classId }) => {
    if (classId !== currentClassId) return;

    if (currentRole === 'student') {
        if (isSharing) {
            // Wait for offer to open modal, or show a toast "Stream Available"
            console.log("Teacher started screen sharing");
        } else {
            console.log("Teacher stopped screen sharing");
            videoModal.classList.add("hidden");
            if (myPeerConnection) {
                myPeerConnection.close();
                myPeerConnection = null;
            }
        }
    }
});

// Clean up on user join
socket.on("user-joined", ({ user, classId }) => {
    // If I am teacher and sharing, connect to new student
    if (currentRole === 'teacher' && isScreenSharing && user.id !== socket.id) {
        initiatePeerConnection(user.id);
    }
});

// UI Handlers
btnCloseVideo.addEventListener("click", () => {
    videoModal.classList.add("hidden");
    // Ideally we don't close the connection, just hide the video?
    // Or we should allow re-opening.
    // For now, let's keep it simple: Hide.
});

// Update visibility logic for new sidebar container
const teacherActions = document.getElementById("teacher-actions");

window.updateTeacherActionsVisibility = function () {
    if (currentRole === 'teacher') {
        if (teacherToolsSection) teacherToolsSection.classList.remove('hidden');
    } else {
        if (teacherToolsSection) teacherToolsSection.classList.add('hidden');
    }
};

// Hook into existing events
document.getElementById("btn-teacher").addEventListener("click", () => {
    updateTeacherActionsVisibility();
});

document.getElementById("btn-student").addEventListener("click", () => {
    updateTeacherActionsVisibility();
});

// ===== VIDEO CONTROLS LOGIC =====

let videoTranslateX = 0;
let videoTranslateY = 0;
let isDraggingVideo = false;
let startDragX = 0;
let startDragY = 0;

function updateVideoZoom() {
    if (remoteVideo) {
        remoteVideo.style.transform = `translate(${videoTranslateX}px, ${videoTranslateY}px) scale(${videoZoomLevel})`;

        // Update cursor based on zoom level
        if (videoZoomLevel > 1) {
            remoteVideo.style.cursor = isDraggingVideo ? "grabbing" : "grab";
        } else {
            remoteVideo.style.cursor = "default";
            // Reset translation if we zoom out to 1 or less
            if (videoZoomLevel <= 1 && (videoTranslateX !== 0 || videoTranslateY !== 0)) {
                videoTranslateX = 0;
                videoTranslateY = 0;
                remoteVideo.style.transform = `translate(0px, 0px) scale(${videoZoomLevel})`;
            }
        }
    }
    if (btnZoomReset) {
        btnZoomReset.textContent = `${Math.round(videoZoomLevel * 100)}%`;
    }
}

// Drag functionality for video
if (remoteVideo) {
    remoteVideo.addEventListener("mousedown", (e) => {
        if (videoZoomLevel > 1) {
            isDraggingVideo = true;
            startDragX = e.clientX - videoTranslateX;
            startDragY = e.clientY - videoTranslateY;
            remoteVideo.style.cursor = "grabbing";
            e.preventDefault(); // Prevent default drag behavior
        }
    });

    window.addEventListener("mousemove", (e) => {
        if (isDraggingVideo) {
            videoTranslateX = e.clientX - startDragX;
            videoTranslateY = e.clientY - startDragY;
            updateVideoZoom();
        }
    });

    window.addEventListener("mouseup", () => {
        if (isDraggingVideo) {
            isDraggingVideo = false;
            if (remoteVideo) remoteVideo.style.cursor = "grab";
        }
    });
}

if (btnZoomIn) {
    btnZoomIn.addEventListener("click", () => {
        if (videoZoomLevel < 3) {
            videoZoomLevel = Math.min(3, videoZoomLevel + 0.25);
            updateVideoZoom();
        }
    });
}

if (btnZoomOut) {
    btnZoomOut.addEventListener("click", () => {
        if (videoZoomLevel > 0.5) {
            videoZoomLevel = Math.max(0.5, videoZoomLevel - 0.25);
            updateVideoZoom();
        }
    });
}

if (btnZoomReset) {
    btnZoomReset.addEventListener("click", () => {
        videoZoomLevel = 1;
        videoTranslateX = 0;
        videoTranslateY = 0;
        updateVideoZoom();
    });
}

// Fullscreen
if (btnFullscreen) {
    btnFullscreen.addEventListener("click", () => {
        if (videoModal) {
            videoModal.classList.toggle("fullscreen");
            btnFullscreen.textContent = videoModal.classList.contains("fullscreen") ? "❌" : "⛶";
            btnFullscreen.title = videoModal.classList.contains("fullscreen") ? "Exit Fullscreen" : "Fullscreen";
        }
    });
}

// Exit fullscreen on Escape
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && videoModal && videoModal.classList.contains("fullscreen")) {
        videoModal.classList.remove("fullscreen");
        if (btnFullscreen) btnFullscreen.textContent = "⛶";
    }
});

// Minimize Video
if (btnMinimizeVideo) {
    btnMinimizeVideo.addEventListener("click", () => {
        videoModal.classList.add("hidden");
        // Show view stream button
        if (btnViewStream && myPeerConnection && !myPeerConnection.connectionState.includes("closed")) {
            btnViewStream.classList.remove("hidden");
            btnViewStream.classList.add("active");
        }
    });
}

// Restore Stream
if (btnViewStream) {
    btnViewStream.addEventListener("click", () => {
        videoModal.classList.remove("hidden");
        btnViewStream.classList.add("hidden");
        btnViewStream.classList.remove("active");
    });
}

// Update stream cleanup to hide the button
// We'll update the cleanup locations

// Let's monkey-patch the socket event handler logic by adding a check
socket.on("screen-share-status-update", ({ isSharing, classId }) => {
    if (classId === currentClassId && currentRole === 'student' && !isSharing) {
        if (btnViewStream) {
            btnViewStream.classList.add("hidden");
            btnViewStream.classList.remove("active");
        }
        // Also reset zoom and position when stream ends
        videoZoomLevel = 1;
        videoTranslateX = 0;
        videoTranslateY = 0;
        updateVideoZoom();
    }
});

// ===== ADVANCED SETTINGS & LOGS =====

// ===== SETTINGS MODAL & NAVIGATION =====

const settingsSidebar = document.querySelector('.settings-sidebar');
const settingsTabs = document.querySelectorAll('.settings-tab-btn');
const settingsPages = document.querySelectorAll('.settings-page');

// Tab Switching Logic
if (settingsSidebar) {
    settingsSidebar.addEventListener('click', (e) => {
        const btn = e.target.closest('.settings-tab-btn');
        if (btn) {
            const targetTab = btn.dataset.tab;
            if (btn.classList.contains('active')) return; // Avoid redundant switches
            switchSettingsTab(targetTab);
        }
    });
}

function switchSettingsTab(tabName) {
    // Update active tab
    settingsTabs.forEach(btn => {
        if (btn.dataset.tab === tabName) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Update active page
    // Update active page
    settingsPages.forEach(page => {
        if (page.id === `settings-page-${tabName}`) {
            page.classList.remove('hidden');
            page.classList.add('active');
        } else {
            page.classList.add('hidden');
            page.classList.remove('active');
        }
    });
}

// Open Settings & Handle Role Visibility
// Open Settings & Handle Role Visibility
if (btnSettingsToggle) {
    btnSettingsToggle.addEventListener("click", () => {
        if (settingsModal) {
            settingsModal.classList.remove("hidden");

            // Default to Personalization
            switchSettingsTab('personalization');

            // --- ROLE BASED VISIBILITY ---
            // Students: ONLY Personalization & About
            // Teachers: All tabs

            if (currentRole === 'student') {
                // Students: ONLY Personalization, Connection & About
                settingsTabs.forEach(btn => {
                    if (btn.dataset.tab === 'personalization' || btn.dataset.tab === 'connection' || btn.dataset.tab === 'about') {
                        btn.classList.remove('hidden');
                    } else {
                        btn.classList.add('hidden');
                    }
                });
            } else {
                // Teacher: Show all tabs
                settingsTabs.forEach(btn => btn.classList.remove('hidden'));
            }
        }
    });
}

// Close Settings
if (btnCloseSettings) {
    btnCloseSettings.addEventListener("click", () => {
        if (settingsModal) settingsModal.classList.add("hidden");
    });
}

// Hook up Manage Buttons in Content Moderation
const btnOpenBlacklistModal = document.getElementById('btn-open-blacklist-modal');
const btnOpenWhitelistModal = document.getElementById('btn-open-whitelist-modal');

if (btnOpenBlacklistModal) {
    btnOpenBlacklistModal.addEventListener('click', () => {
        if (blacklistModal) {
            blacklistModal.classList.remove('hidden');
            renderForbiddenWordsList();
            blacklistWordInput.focus();
        }
    });
}

if (btnOpenWhitelistModal) {
    btnOpenWhitelistModal.addEventListener('click', () => {
        if (whitelistModal) {
            whitelistModal.classList.remove("hidden");
            renderWhitelistWordsList();
            whitelistWordInput.focus();
        }
    });
}

// Logs Viewer Logic
if (btnViewLogs) {
    btnViewLogs.addEventListener("click", () => {
        if (logsViewer) {
            logsViewer.classList.remove("hidden");
            if (logsContent) {
                logsContent.textContent = capturedLogs.join('\n');
                logsContent.scrollTop = logsContent.scrollHeight;
            }
        }
    });
}

const btnPauseLogs = document.getElementById("btn-pause-logs");
if (btnPauseLogs) {
    btnPauseLogs.addEventListener("click", () => {
        isLogsPaused = !isLogsPaused;
        btnPauseLogs.innerHTML = isLogsPaused ? '<img src="/assets/play-svgrepo-com.svg" class="icon-svg" alt="Play" style="width: 16px; height: 16px;" />' : '<img src="/assets/pause-svgrepo-com.svg" class="icon-svg" alt="Pause" style="width: 16px; height: 16px;" />';
        btnPauseLogs.title = isLogsPaused ? "Resume Logs" : "Pause Logs";

        // If resuming, immediately flush logs
        if (!isLogsPaused) {
            const logsContent = document.getElementById("logs-content");
            if (logsContent) {
                logsContent.textContent = capturedLogs.join('\n');
                logsContent.scrollTop = logsContent.scrollHeight;
            }
        }
    });
}

if (btnDownloadLogs) {
    btnDownloadLogs.addEventListener("click", () => {
        const logText = capturedLogs.join('\n');
        const blob = new Blob([logText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `classsend-logs-${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
}

if (btnCopyLogs) {
    btnCopyLogs.addEventListener("click", async () => {
        const logText = capturedLogs.join('\n');
        try {
            await navigator.clipboard.writeText(logText);
            const originalText = btnCopyLogs.textContent;
            btnCopyLogs.textContent = "✅";
            setTimeout(() => btnCopyLogs.textContent = originalText, 1500);
        } catch (err) {
            console.error("Failed to copy logs:", err);
            btnCopyLogs.textContent = "❌";
        }
    });
}

if (btnCloseLogs) {
    btnCloseLogs.addEventListener("click", () => {
        logsViewer.classList.add("hidden");
    });
}



// ===== UNIFIED IMPORT/EXPORT LOGIC =====
const btnImportData = document.getElementById("btn-import-data");
const btnExportData = document.getElementById("btn-export-data");
const fileImportData = document.getElementById("file-import-data");

if (btnExportData) {
    btnExportData.addEventListener("click", () => {
        const blacklist = customForbiddenWords || [];
        const whitelist = customWhitelistedWords || [];

        if (blacklist.length === 0 && whitelist.length === 0) {
            alert("No data to export (both lists are empty)");
            return;
        }

        const exportData = {
            version: 1,
            exportedAt: new Date().toISOString(),
            blacklist: blacklist,
            whitelist: whitelist
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `classsend-data-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
}

if (btnImportData) {
    btnImportData.addEventListener("click", () => {
        if (fileImportData) fileImportData.click();
    });
}

if (fileImportData) {
    fileImportData.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);

                // Handle legacy array format (assume blacklist)
                if (Array.isArray(data)) {
                    if (confirm("Legacy format detected. Import as Blacklist?")) {
                        importList(data, 'blacklist');
                        setTimeout(() => {
                            console.log("🔄 Refreshing lists after legacy import...");
                            loadForbiddenWords();
                        }, 1000);
                    }
                    fileImportData.value = "";
                    return;
                }

                if (typeof data !== 'object') {
                    alert("Invalid file format");
                    return;
                }

                let totalBlacklist = 0;
                let totalWhitelist = 0;

                if (data.blacklist && Array.isArray(data.blacklist)) {
                    totalBlacklist = importList(data.blacklist, 'blacklist');
                }

                if (data.whitelist && Array.isArray(data.whitelist)) {
                    totalWhitelist = importList(data.whitelist, 'whitelist');
                }

                console.log(`✅ Import finished. Triggering list refresh in 1s...`);
                setTimeout(() => {
                    console.log("🔄 Refreshing blacklist and whitelist from server...");
                    loadForbiddenWords();
                    loadWhitelistedWords();
                }, 1000);

                alert(`Import Complete!\n🚫 Blacklist: ${totalBlacklist} requests sent\n✅ Whitelist: ${totalWhitelist} requests sent\n\nLists should update shortly.`);

            } catch (err) {
                console.error("Import failed", err);
                alert("Failed to parse file");
            }
        };
        reader.readAsText(file);
        fileImportData.value = "";
    });
}

function importList(items, type) {
    let count = 0;
    items.forEach(item => {
        const str = typeof item === 'object' ? item.word : item;
        if (str && typeof str === 'string') {
            const word = str.trim(); // Case sensitive/insensitive logic handled by server usually, sending as is

            if (type === 'blacklist') {
                // Check duplicates client side to save calls? Server handles it too.
                // Fire and forget mostly, but we use callbacks usually.
                socket.emit('add-forbidden-word', { word }, () => { });
                count++;
            } else if (type === 'whitelist') {
                socket.emit('add-whitelisted-word', { word }, () => { });
                count++;
            }
        }
    });

    // Refresh UI immediately if possible, but servers will broadcast updates anyway.
    // However, for bulk import, broadcasts come one by one.
    // The lists will update automatically due to socket listeners.
    return count;
}



const btnCloseWhitelistModal = document.getElementById("btn-close-whitelist-modal");
const whitelistModal = document.getElementById("whitelist-modal");
const whitelistWordsListModalElement = document.getElementById("whitelist-words-list-modal");
const whitelistWordInput = document.getElementById("whitelist-word-input");
const btnAddWhitelistWordModal = document.getElementById("btn-add-whitelist-word-modal");
// Legacy references removed (btnImportWhitelist, btnExportWhitelist, etc.)

// Close Modal
if (btnCloseWhitelistModal) {
    btnCloseWhitelistModal.addEventListener("click", () => {
        if (whitelistModal) whitelistModal.classList.add("hidden");
    });
}

// Render List
function renderWhitelistWordsList() {
    if (!whitelistWordsListModalElement) return;
    whitelistWordsListModalElement.innerHTML = "";

    if (customWhitelistedWords.length === 0) {
        whitelistWordsListModalElement.innerHTML = '<div class="empty-blacklist-state">No safe words added yet</div>';
        return;
    }

    customWhitelistedWords.slice().reverse().forEach(item => {
        const row = document.createElement("div");
        row.className = "blacklist-word-item"; // Reusing Blacklist style class if available, or we will define it
        row.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #333; margin-bottom: 5px; border-radius: 5px;";

        const dateStr = item.addedAt ? new Date(item.addedAt).toLocaleDateString() : '';

        row.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-weight: bold; color: #fff;">${escapeHtml(item.word)}</span>
                ${item.source === 'rejected-report' ? '<span title="Added from Report" style="font-size: 12px;">🛡️</span>' : ''}
            </div>
            <div style="display: flex; align-items: center; gap: 15px;">
                <span style="color: #888; font-size: 0.85rem;">${dateStr}</span>
                <button class="remove-word-btn" style="background: none; border: none; color: #ff4444; cursor: pointer; font-size: 1.1rem;">✖</button>
            </div>
        `;

        row.querySelector(".remove-word-btn").addEventListener("click", () => {
            if (confirm(`Remove '${item.word}' from whitelist?`)) {
                socket.emit('remove-whitelisted-word', { word: item.word }, (res) => {
                    if (!res.success) alert(res.message || "Failed to remove");
                });
            }
        });

        whitelistWordsListModalElement.appendChild(row);
    });
}

function loadWhitelistedWords() {
    socket.emit('get-whitelisted-words', (words) => {
        customWhitelistedWords = words || [];
        renderWhitelistWordsList();
    });
}

socket.on('whitelisted-words-updated', (words) => {
    customWhitelistedWords = words || [];
    renderWhitelistWordsList();
});

// Add Word (Modal)
if (btnAddWhitelistWordModal) {
    btnAddWhitelistWordModal.addEventListener("click", () => {
        const word = whitelistWordInput.value.trim();
        if (!word) return;

        socket.emit('add-whitelisted-word', { word }, (res) => {
            if (res.success) {
                whitelistWordInput.value = "";
                whitelistWordInput.focus();
            } else {
                alert(res.message || "Failed to add word");
            }
        });
    });

    // Also allow Enter key
    whitelistWordInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && btnAddWhitelistWordModal) btnAddWhitelistWordModal.click();
    });
}

// ... (Import/Export handlers removed, handled by unified logic)



// ===== AI FILTERING & REPORTING FEATURE =====

// State for filter mode
let filterMode = 'legacy'; // 'legacy', 'advanced', or 'deep-learning'
let pendingReports = []; // Array of pending word reports
let deepLearningReady = false; // Track if deep learning model is loaded

// AI Loading Modal Elements
const aiLoadingModal = document.getElementById('ai-loading-modal');
const aiLoadingStatus = document.getElementById('ai-loading-status');
const aiLoadingProgress = document.getElementById('ai-loading-progress');

// DOM Elements for Filter Mode and Reports
const filterModeSelect = document.getElementById('filter-mode-select');
const settingsFilterSection = document.getElementById('settings-filter-section');
const btnReportToggle = document.getElementById('btn-report-toggle');
const reportPanel = document.getElementById('report-panel');
const reportList = document.getElementById('report-list');
const reportBadge = document.querySelector('.report-badge');

// Show/hide filter section and report button based on role
function updateFilterUIVisibility() {
    if (currentRole === 'teacher') {
        // Show filter section in settings
        if (settingsFilterSection) settingsFilterSection.classList.remove('hidden');
        // Show teacher tools section in sidebar
        if (teacherToolsSection) teacherToolsSection.classList.remove('hidden');

        // Show reports button in input area - TEACHER ONLY
        if (btnReportToggle) btnReportToggle.classList.remove('hidden');



        // Request current filter mode and pending reports
        socket.emit('get-filter-mode', { classId: currentClassId }, (mode) => {
            // Check local preference first if server has no strong opinion (default)
            const savedMode = localStorage.getItem('classsend-filter-mode');
            if (savedMode && (!mode || mode === 'legacy') && savedMode !== 'legacy') {
                console.log(`Applying saved filter preference: ${savedMode}`);
                socket.emit('set-filter-mode', { classId: currentClassId, mode: savedMode }, () => { });
                filterMode = savedMode;
            } else {
                filterMode = mode || 'legacy';
            }
            if (filterModeSelect) filterModeSelect.value = filterMode;

            // Auto-load model if needed (check in ALL cases)
            if (filterMode === 'deep-learning' && !deepLearningReady) {
                console.log('🧠 Auto-loading Deep Learning model based on preference...');
                loadDeepLearningModel();
            }

            // Update UI visibility based on loaded mode
            updateAdvancedModelPreferencesVisibility();
        });
        loadPendingReports();
        loadWhitelistedWords();
        loadForbiddenWords();
    } else {
        // Hide filter section and report button for students
        if (settingsFilterSection) settingsFilterSection.classList.add('hidden');
        if (btnReportToggle) btnReportToggle.classList.add('hidden');
        if (reportPanel) reportPanel.classList.add('hidden');
    }

    updateToolStates();
}

/**
 * Updates the active/inactive state of buttons in the Teacher Tools menu
 */
function updateToolStates() {
    const classData = joinedClasses.get(currentClassId);
    if (!classData || currentRole !== 'teacher') return;

    // Messaging Block Status
    if (btnToolBlockMessages) {
        btnToolBlockMessages.classList.toggle("active", classData.blockAllActive);
    }

    // Allow Hands Status
    if (btnToolAllowHands) {
        btnToolAllowHands.classList.toggle("active", classData.allowHandsUp);
    }
}

// Update report badge count
function updateReportBadge() {
    if (!reportBadge) return;

    // Also update badges on both buttons (header/input) if we have multiple
    const badges = document.querySelectorAll('.report-badge');

    badges.forEach(badge => {
        if (pendingReports.length > 0) {
            badge.textContent = pendingReports.length;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    });
}

// Load pending reports from server
function loadPendingReports() {
    if (currentRole !== 'teacher') return;

    socket.emit('get-pending-reports', (reports) => {
        pendingReports = reports || [];
        updateReportBadge();
        renderReportList();
    });
}

// Render the report list
function renderReportList() {
    if (!reportList) return;

    if (pendingReports.length === 0) {
        reportList.innerHTML = '<div class="empty-report-state" data-i18n="reports-empty">No pending reports</div>';
        return;
    }

    reportList.innerHTML = pendingReports.map(report => {
        const date = new Date(report.reportedAt);
        const dateStr = date.toLocaleDateString('el-GR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="report-item" data-report-id="${report.id}">
                <div>
                    <div class="report-word">${escapeHtml(report.word)}</div>
                    <div class="report-meta">Reported by ${escapeHtml(report.reporterName)}</div>
                </div>
                <div class="report-actions">
                    <button class="report-approve-btn" title="Block & Delete 🚫">🚫</button>
                    <button class="report-reject-btn" title="Allow 👌">👌</button>
                </div>
            </div>
        `;
    }).join('');

    // Add event listeners for approve/reject buttons
    reportList.querySelectorAll('.report-approve-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const reportItem = e.target.closest('.report-item');
            const reportId = reportItem.dataset.reportId;
            approveReport(reportId, reportItem);
        });
    });

    reportList.querySelectorAll('.report-reject-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const reportItem = e.target.closest('.report-item');
            const reportId = reportItem.dataset.reportId;
            rejectReport(reportId, reportItem);
        });
    });
}

// Approve a report (add word to blacklist)
function approveReport(reportId, element) {
    if (element) {
        element.style.transition = 'all 0.5s ease-out';
        element.style.transform = 'translateX(100%)';
        element.style.opacity = '0';
        setTimeout(() => { if (element) element.remove(); }, 500);
    }
    socket.emit('approve-report', { reportId, classId: currentClassId }, (response) => {
        if (response && response.success) {
            console.log(`✅ Report approved, word added to blacklist`);
        } else {
            console.error('Failed to approve report:', response?.message);
        }
    });
}

// Reject a report
function rejectReport(reportId, element) {
    if (element) {
        element.style.transition = 'all 0.5s ease-out';
        element.style.transform = 'translateX(100%)';
        element.style.opacity = '0';
        setTimeout(() => { if (element) element.remove(); }, 500);
    }
    socket.emit('reject-report', { reportId, classId: currentClassId }, (response) => {
        if (response && response.success) {
            console.log(`✅ Report rejected`);
        } else {
            console.error('Failed to reject report:', response?.message);
        }
    });
}

// Filter Mode Select Change Handler
if (filterModeSelect) {
    filterModeSelect.addEventListener('change', async () => {
        const newMode = filterModeSelect.value;

        // If switching to deep-learning, load the model first
        if (newMode === 'deep-learning') {
            const loaded = await loadDeepLearningModel();
            if (!loaded) {
                // Failed to load, revert selection
                filterModeSelect.value = filterMode;
                return;
            }
        }

        socket.emit('set-filter-mode', { classId: currentClassId, mode: newMode }, (response) => {
            if (response && response.success) {
                filterMode = newMode;
                localStorage.setItem('classsend-filter-mode', newMode); // Persist preference
                console.log(`✅ Filter mode set to: ${newMode}`);

                // Show/Hide Advanced Model Preferences
                updateAdvancedModelPreferencesVisibility();
            } else {
                console.error('Failed to set filter mode:', response?.message);
                // Revert select to previous value
                filterModeSelect.value = filterMode;
            }
        });
    });
}

// ===== ADVANCED MODEL PREFERENCES LOGIC =====
const advancedModelPreferences = document.getElementById('advanced-model-preferences');
const modelBlockToggle = document.getElementById('model-block-toggle');
const modelBlockThreshold = document.getElementById('model-block-threshold');
const modelBlockVal = document.getElementById('model-block-val');
const modelReportToggle = document.getElementById('model-report-toggle');
const modelReportThreshold = document.getElementById('model-report-threshold');
const modelReportVal = document.getElementById('model-report-val');

function updateAdvancedModelPreferencesVisibility() {
    if (filterMode === 'deep-learning' && currentRole === 'teacher') {
        if (advancedModelPreferences) advancedModelPreferences.classList.remove('hidden');
    } else {
        if (advancedModelPreferences) advancedModelPreferences.classList.add('hidden');
    }
}

// ===== SETTINGS VISIBILITY LOGIC =====
const settingsStreamingSection = document.getElementById('settings-streaming-section');
const settingsDataSection = document.getElementById('settings-data-section');

function updateSettingsVisibility() {
    if (currentRole === 'teacher' || debugModeActive) {
        // Show everything for teacher or debug mode
        if (settingsStreamingSection) settingsStreamingSection.classList.remove('hidden');
        if (settingsDataSection) settingsDataSection.classList.remove('hidden');
        if (settingsFilterSection) settingsFilterSection.classList.remove('hidden');
        if (advancedModelPreferences && (filterMode === 'deep-learning' || debugModeActive)) advancedModelPreferences.classList.remove('hidden');
        if (settingsAdvancedSection) settingsAdvancedSection.classList.remove('hidden');

        // Also show all sidebar tabs
        document.querySelectorAll('.settings-tab-btn').forEach(btn => btn.classList.remove('hidden'));
    } else {
        // Hide everything except Language for student
        if (settingsStreamingSection) settingsStreamingSection.classList.add('hidden');
        if (settingsDataSection) settingsDataSection.classList.add('hidden');
        if (settingsFilterSection) settingsFilterSection.classList.add('hidden');
        if (advancedModelPreferences) advancedModelPreferences.classList.add('hidden');
        if (settingsAdvancedSection) settingsAdvancedSection.classList.add('hidden');

        // Hide specific tabs for student
        const tabModeration = document.getElementById('tab-moderation');
        const tabSystem = document.getElementById('tab-system');
        if (tabModeration) tabModeration.classList.add('hidden');
        if (tabSystem) tabSystem.classList.add('hidden');
    }
}

// Hook into updateFilterUIVisibility to also check general settings visibility
const originalUpdateFilterUIVisibility = updateFilterUIVisibility;
updateFilterUIVisibility = function () {
    originalUpdateFilterUIVisibility();
    updateSettingsVisibility();

    // Also load current advanced settings from server if teacher
    if (currentRole === 'teacher') {
        socket.emit('get-advanced-settings', { classId: currentClassId }, (settings) => {
            if (settings) {
                if (modelBlockToggle) modelBlockToggle.checked = settings.blockEnabled;
                if (modelBlockThreshold) {
                    // Invert: Threshold (server) -> Sensitivity (client)
                    // High Threshold (90) = Low Sensitivity (10)
                    const sensitivity = 100 - settings.blockThreshold;
                    modelBlockThreshold.value = sensitivity;
                    if (modelBlockVal) modelBlockVal.textContent = sensitivity + '%';
                }

                if (modelReportToggle) modelReportToggle.checked = settings.reportEnabled;
                if (modelReportThreshold) {
                    // Invert
                    const sensitivity = 100 - settings.reportThreshold;
                    modelReportThreshold.value = sensitivity;
                    if (modelReportVal) modelReportVal.textContent = sensitivity + '%';
                }
            }
        });
    }
};

// Listeners for Advanced Settings changes
function sendAdvancedSettingsUpdate() {
    if (!currentClassId || currentRole !== 'teacher') return;

    // Invert: Sensitivity (client) -> Threshold (server)
    // High Sensitivity (100) = Low Threshold (0)
    const blockSensitivity = modelBlockThreshold ? parseInt(modelBlockThreshold.value) : 50;
    const reportSensitivity = modelReportThreshold ? parseInt(modelReportThreshold.value) : 70;

    const settings = {
        blockEnabled: modelBlockToggle ? modelBlockToggle.checked : true,
        blockThreshold: 100 - blockSensitivity,
        reportEnabled: modelReportToggle ? modelReportToggle.checked : true,
        reportThreshold: 100 - reportSensitivity
    };

    socket.emit('update-advanced-settings', { classId: currentClassId, settings });
}

if (modelBlockToggle) {
    modelBlockToggle.addEventListener('change', sendAdvancedSettingsUpdate);
}

if (modelBlockThreshold) {
    modelBlockThreshold.addEventListener('input', (e) => {
        if (modelBlockVal) modelBlockVal.textContent = e.target.value + '%';
    });
    modelBlockThreshold.addEventListener('change', sendAdvancedSettingsUpdate);
}

if (modelReportToggle) {
    modelReportToggle.addEventListener('change', sendAdvancedSettingsUpdate);
}

if (modelReportThreshold) {
    modelReportThreshold.addEventListener('input', (e) => {
        if (modelReportVal) modelReportVal.textContent = e.target.value + '%';
    });
    modelReportThreshold.addEventListener('change', sendAdvancedSettingsUpdate);
}

// Load deep learning model with progress display
async function loadDeepLearningModel() {
    return new Promise((resolve) => {
        // Check if already ready
        socket.emit('get-deep-learning-status', (status) => {
            if (status && status.ready) {
                deepLearningReady = true;
                resolve(true);
                return;
            }

            // Show loading modal
            if (aiLoadingModal) aiLoadingModal.classList.remove('hidden');
            if (aiLoadingProgress) aiLoadingProgress.style.width = '0%';
            if (aiLoadingStatus) aiLoadingStatus.textContent = translations[currentLanguage]['status-connecting'];

            // Request model load
            socket.emit('load-deep-learning-model', (result) => {
                if (aiLoadingModal) aiLoadingModal.classList.add('hidden');

                // Log server-side debug logs if available
                if (result && result.logs && Array.isArray(result.logs)) {
                    console.log('--- SERVER SIDE MODEL LOADING LOGS ---');
                    result.logs.forEach(log => console.log(log));
                    console.log('--------------------------------------');
                }

                if (result && result.success) {
                    deepLearningReady = true;
                    console.log('🧠 Deep Learning model ready!');
                    resolve(true);
                } else {
                    console.error('❌ Failed to load Deep Learning model');
                    if (result && result.error) {
                        console.error('SERVER ERROR:', result.error);
                    }
                    alert('Failed to load AI model. Check the logs for "SERVER SIDE MODEL LOADING LOGS".');
                    resolve(false);
                }
            });
        });
    });
}

// Listen for model loading progress
socket.on('deep-learning-progress', (progress) => {
    if (progress.status === 'downloading') {
        if (aiLoadingStatus) aiLoadingStatus.textContent = `Downloading model (${progress.progress}%)`;
        if (aiLoadingProgress) aiLoadingProgress.style.width = `${progress.progress}%`;
    } else if (progress.status === 'ready') {
        if (aiLoadingStatus) aiLoadingStatus.textContent = translations[currentLanguage]['status-connected'];
        if (aiLoadingProgress) aiLoadingProgress.style.width = '100%';
    }
});

// Toast Notification Helper
function showToast(message, type = 'info', duration = 4000) {
    // Create toast container if it doesn't exist
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%); z-index: 9999; display: flex; flex-direction: column; gap: 10px; align-items: center; pointer-events: none;';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
        background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : type === 'warning' ? '#eab308' : '#3b82f6'};
        color: white;
        padding: 10px 20px;
        border-radius: 20px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        font-weight: 500;
        opacity: 0;
        transform: translateY(20px);
        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        display: flex;
        align-items: center;
        gap: 8px;
        pointer-events: auto;
    `;

    // Add icon based on type
    const icon = type === 'error' ? '🚫' : type === 'success' ? '✅' : type === 'warning' ? '⚠️' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    // Remove after duration
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Listen for auto-blocked messages (teacher notification)
socket.on('auto-blocked-message', (data) => {
    if (currentRole === 'teacher') {
        console.log(`🚫 Auto-blocked: "${data.message}" (${data.confidence}% ${data.category})`);
        showToast(`${translations[currentLanguage]["toast-auto-blocked"]}: "${data.message.substring(0, 20)}..."`, 'error');
        if (data.addedWords && data.addedWords.length > 0) {
            console.log(`🧠 Auto-added words: ${data.addedWords.join(', ')}`);
        }
    }
});

// Report Toggle Button Handler (Panel Popup)
if (btnReportToggle) {
    btnReportToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close emoji picker if open
        if (emojiPicker && !emojiPicker.classList.contains('hidden')) {
            emojiPicker.classList.add('hidden');
        }

        // Toggle report panel
        if (reportPanel) {
            if (reportPanel.classList.contains('hidden')) {
                loadPendingReports(); // Refresh data when opening
                reportPanel.classList.remove('hidden');
            } else {
                reportPanel.classList.add('hidden');
            }
        }
    });
}

// Close panel when clicking outside
document.addEventListener('click', (e) => {
    if (reportPanel && !reportPanel.classList.contains('hidden')) {
        if (!reportPanel.contains(e.target) && !btnReportToggle.contains(e.target)) {
            reportPanel.classList.add('hidden');
        }
    }
});

// Remove Text Selection Popup Report Handler (User requested removal)
// The text selection popup will now only show "Add to blacklist" for teachers
// Students report via message action button.

// Text selection popup removed as per user request (replaced by direct buttons)
/*
    messagesContainer.addEventListener('mouseup', (e) => {
        // ... (legacy code removed) ...
    });
*/

// Listen for filter mode changes from server
socket.on('filter-mode-changed', (data) => {
    if (data.classId === currentClassId) {
        filterMode = data.mode;
        if (filterModeSelect) filterModeSelect.value = filterMode;
        console.log(`🔄 Filter mode changed to: ${filterMode}`);
    }
});

// Listen for pending reports updates from server
socket.on('pending-reports-updated', (reports) => {
    pendingReports = reports || [];
    updateReportBadge();
    if (currentRole === 'teacher' && reportPanel && !reportPanel.classList.contains('hidden')) {
        renderReportList();
    }
});

// Listen for new reports (for teachers)
socket.on('new-report', (report) => {
    if (currentRole === 'teacher') {
        pendingReports.push(report);
        updateReportBadge();
        if (reportPanel && !reportPanel.classList.contains('hidden')) {
            renderReportList();
        }
        console.log(`📝 New word report: "${report.word}" from ${report.reporterName}`);

        // Show visual notification
        showToast(`${translations[currentLanguage]["toast-ai-flagged"]} "${report.word}"`, 'warning');
    }
});

// Hook into existing role selection to update UI visibility
const originalTeacherClick = document.getElementById("btn-teacher").onclick;
document.getElementById("btn-teacher").addEventListener("click", () => {
    setTimeout(updateFilterUIVisibility, 100);
});

const originalStudentClick = document.getElementById("btn-student").onclick;
document.getElementById("btn-student").addEventListener("click", () => {
    setTimeout(updateFilterUIVisibility, 100);
});

// Also update when switching classes
const originalSwitchClass = switchClass;
window.switchClassWithFilter = switchClass;
switchClass = function (id) {
    originalSwitchClass(id);
    setTimeout(updateFilterUIVisibility, 100);
};


// Training Notification Listeners
socket.on('training-started', () => {
    const notify = document.getElementById('training-notification');
    if (notify) notify.classList.remove('hidden');

    // Animate badge
    const badge = document.querySelector('.report-toggle-btn .report-badge');
    if (badge) {
        if (badge.classList.contains('hidden')) badge.classList.remove('hidden');
        badge.dataset.originalCount = badge.textContent;
        badge.innerHTML = '↻';
        const consolidatingText = translations[currentLanguage]['ai-consolidating'] || 'Consolidating AI Model...';
        const infoMsg = document.querySelector('.training-notification span:last-child');
        if (infoMsg) infoMsg.textContent = consolidatingText;
        badge.style.background = '#eab308';
    }
});

socket.on('training-ended', () => {
    const notify = document.getElementById('training-notification');
    if (notify) notify.classList.add('hidden');
    // Refresh badge
    loadPendingReports();
});
// STARTUP SETTINGS HANDLING
const startupToggle = document.getElementById("startup-toggle");

if (startupToggle) {
    startupToggle.addEventListener("change", (e) => {
        console.log("Toggling startup:", e.target.checked);
        socket.emit("set-startup-status", { openAtLogin: e.target.checked }, (response) => {
            if (!response.success) {
                e.target.checked = !e.target.checked; // Revert
                alert("Failed to update startup setting: " + response.message || "Unknown error");
            }
        });
    });
}

// Fetch startup status when opening settings
if (btnSettingsToggle) {
    btnSettingsToggle.addEventListener("click", () => {
        if (startupToggle) {
            socket.emit("get-startup-status", (response) => {
                if (response.success) {
                    startupToggle.checked = response.openAtLogin;
                    console.log("Startup status loaded:", response.openAtLogin);
                }
            });
        }
    });
}

// Set Version from Build
const versionDisplay = document.getElementById('app-version-display');
if (versionDisplay && typeof __APP_VERSION__ !== 'undefined') {
    versionDisplay.textContent = __APP_VERSION__;
}

// Expose for testing
if (window.Playwright) {
    window.connectToServer = connectToServer;
    window.discoveredServers = discoveredServers;
    window.renderSidebar = renderSidebar;
    window.renderSidebar = renderSidebar;
}

// ===== UNIFIED FILE VIEWER LOGIC =====
const pdfViewerModal = document.getElementById("pdf-viewer-modal");
const btnClosePdf = document.getElementById("btn-close-pdf");
const btnMinimizePdf = document.getElementById("btn-minimize-pdf");
const pdfFrame = document.getElementById("pdf-frame");
const btnPdfZoomIn = document.getElementById("btn-pdf-zoom-in");
const btnPdfZoomOut = document.getElementById("btn-pdf-zoom-out");
const btnPdfZoomReset = document.getElementById("btn-pdf-zoom-reset");

const imageViewerModal = document.getElementById("image-viewer-modal");
const btnCloseImage = document.getElementById("btn-close-image-modal");
const btnMinimizeImage = document.getElementById("btn-minimize-image");
const fullImage = document.getElementById("full-image");
const btnImageZoomIn = document.getElementById("btn-image-zoom-in");
const btnImageZoomOut = document.getElementById("btn-image-zoom-out");
const btnImageZoomReset = document.getElementById("btn-image-zoom-reset");
const imageContainer = document.querySelector(".image-container-enhanced");

const documentViewerModal = document.getElementById("document-viewer-modal");
const btnCloseDoc = document.getElementById("btn-close-doc");
const btnMinimizeDoc = document.getElementById("btn-minimize-doc");
const docContent = document.getElementById("doc-content");

const mediaPlayerModal = document.getElementById("media-player-modal");
const btnCloseMediaPlayer = document.getElementById("btn-close-media-player");
const btnMinimizeMediaPlayer = document.getElementById("btn-minimize-media-player");
const mediaPlayerContainer = document.getElementById("media-player-container");

const btnRestoreFile = document.getElementById("btn-restore-file");

let activeViewer = null; // 'pdf' or 'image'
let pdfZoomLevel = 1;
let imageZoomLevel = 1;
let imageIsDragging = false;
let imageStartX, imageStartY;
let imageTranslateX = 0, imageTranslateY = 0;

function closeAllViewers() {
    // Hide Modals
    if (pdfViewerModal) pdfViewerModal.classList.add("hidden");
    if (imageViewerModal) imageViewerModal.classList.add("hidden");
    if (documentViewerModal) documentViewerModal.classList.add("hidden");
    if (mediaPlayerModal) mediaPlayerModal.classList.add("hidden");
    if (mediaPlayerContainer) mediaPlayerContainer.innerHTML = '';

    // Reset Sources
    if (pdfFrame) pdfFrame.src = "";
    if (fullImage) fullImage.src = "";

    // Hide Restore Button
    if (btnRestoreFile) {
        btnRestoreFile.classList.add("hidden");
        btnRestoreFile.classList.remove("active");
    }

    // Reset State
    activeViewer = null;
    pdfZoomLevel = 1;
    imageZoomLevel = 1;
    imageTranslateX = 0;
    imageTranslateY = 0;

    // Clear Web Frame
    const webFrame = document.getElementById("web-frame");
    if (webFrame) webFrame.src = "about:blank";
    if (webViewerModal) webViewerModal.classList.add("hidden");
}

function openPdfViewer(url) {
    closeAllViewers(); // Auto-close others
    if (pdfViewerModal && pdfFrame) {
        activeViewer = 'pdf';
        pdfFrame.src = url;
        pdfViewerModal.classList.remove("hidden");
        updatePdfZoom();
    }
}

function openImageViewer(url) {
    closeAllViewers(); // Auto-close others
    if (imageViewerModal && fullImage) {
        activeViewer = 'image';
        fullImage.src = url;
        imageViewerModal.classList.remove("hidden");
        updateImageTransform();
    }
}

function updatePdfZoom() {
    if (pdfFrame) {
        pdfFrame.style.transform = `scale(${pdfZoomLevel})`;
    }
    if (btnPdfZoomReset) {
        btnPdfZoomReset.textContent = `${Math.round(pdfZoomLevel * 100)}%`;
    }
}

function updateImageTransform() {
    if (fullImage) {
        fullImage.style.transform = `translate(${imageTranslateX}px, ${imageTranslateY}px) scale(${imageZoomLevel})`;
    }
    if (btnImageZoomReset) {
        btnImageZoomReset.textContent = `${Math.round(imageZoomLevel * 100)}%`;
    }
}

// --- PDF Handlers ---
if (btnClosePdf) {
    btnClosePdf.addEventListener("click", closeAllViewers);
}

if (btnMinimizePdf) {
    btnMinimizePdf.addEventListener("click", () => {
        if (pdfViewerModal) pdfViewerModal.classList.add("hidden");
        if (btnRestoreFile) {
            btnRestoreFile.classList.remove("hidden");
            btnRestoreFile.classList.add("active");
        }
    });
}

if (btnPdfZoomIn) {
    btnPdfZoomIn.addEventListener("click", () => {
        if (pdfZoomLevel < 3) {
            pdfZoomLevel = Math.min(3, pdfZoomLevel + 0.25);
            updatePdfZoom();
        }
    });
}

if (btnPdfZoomOut) {
    btnPdfZoomOut.addEventListener("click", () => {
        if (pdfZoomLevel > 0.5) {
            pdfZoomLevel = Math.max(0.5, pdfZoomLevel - 0.25);
            updatePdfZoom();
        }
    });
}

if (btnPdfZoomReset) {
    btnPdfZoomReset.addEventListener("click", () => {
        pdfZoomLevel = 1;
        updatePdfZoom();
    });
}

// --- Image Handlers ---
if (btnCloseImage) {
    btnCloseImage.addEventListener("click", closeAllViewers);
}

if (btnMinimizeImage) {
    btnMinimizeImage.addEventListener("click", () => {
        if (imageViewerModal) imageViewerModal.classList.add("hidden");
        if (btnRestoreFile) {
            btnRestoreFile.classList.remove("hidden");
            btnRestoreFile.classList.add("active");
        }
    });
}

if (btnImageZoomIn) {
    btnImageZoomIn.addEventListener("click", () => {
        if (imageZoomLevel < 5) {
            imageZoomLevel += 0.25;
            updateImageTransform();
        }
    });
}

if (btnImageZoomOut) {
    btnImageZoomOut.addEventListener("click", () => {
        if (imageZoomLevel > 0.25) {
            imageZoomLevel -= 0.25;
            updateImageTransform();
        }
    });
}

if (btnImageZoomReset) {
    btnImageZoomReset.addEventListener("click", () => {
        imageZoomLevel = 1;
        imageTranslateX = 0;
        imageTranslateY = 0;
        updateImageTransform();
    });
}

// --- Restore Handler ---
if (btnRestoreFile) {
    btnRestoreFile.addEventListener("click", () => {
        if (activeViewer === 'pdf' && pdfViewerModal) {
            pdfViewerModal.classList.remove("hidden");
        } else if (activeViewer === 'image' && imageViewerModal) {
            imageViewerModal.classList.remove("hidden");
        } else if (activeViewer === 'document' && documentViewerModal) {
            documentViewerModal.classList.remove("hidden");
        } else if (activeViewer === 'media' && mediaPlayerModal) {
            mediaPlayerModal.classList.remove("hidden");
        } else if (activeViewer === 'web' && webViewerModal) {
            webViewerModal.classList.remove("hidden");
        }
        btnRestoreFile.classList.add("hidden");
        btnRestoreFile.classList.remove("active");
    });
}

// --- Image Drag Logic ---
if (imageContainer) {
    imageContainer.addEventListener("mousedown", (e) => {
        if (imageZoomLevel > 1) {
            imageIsDragging = true;
            imageStartX = e.clientX - imageTranslateX;
            imageStartY = e.clientY - imageTranslateY;
            imageContainer.style.cursor = "grabbing";
        }
    });

    window.addEventListener("mouseup", () => {
        imageIsDragging = false;
        if (imageContainer) imageContainer.style.cursor = "grab";
    });

    window.addEventListener("mousemove", (e) => {
        if (!imageIsDragging) return;
        e.preventDefault();
        imageTranslateX = e.clientX - imageStartX;
        imageTranslateY = e.clientY - imageStartY;
        updateImageTransform();
    });
}

// --- Document Viewer Functions ---
async function openDocumentViewer(url, filename, type) {
    closeAllViewers();
    if (documentViewerModal) {
        activeViewer = 'document';
        documentViewerModal.classList.remove("hidden");

        if (docContent) {
            docContent.innerHTML = '<div class="spinner"></div><p style="text-align:center; color:white;">Loading preview...</p>';

            try {
                // Fetch file data
                const response = await fetch(url);
                if (!response.ok) throw new Error("Failed to load file");
                const arrayBuffer = await response.arrayBuffer();

                docContent.innerHTML = ''; // Clear loader

                if (type === 'docx' || filename.toLowerCase().endsWith('.docx')) {
                    // Render DOCX with Mammoth
                    const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
                    const wrapper = document.createElement('div');
                    wrapper.className = 'document-content-wrapper';
                    // Styling to make it look like a document (white page)
                    wrapper.style.cssText = "background: white; color: black; padding: 2rem; overflow-y: auto; height: 100%; border-radius: 4px; box-shadow: 0 0 10px rgba(0,0,0,0.5); max-width: 800px; margin: 0 auto;";
                    wrapper.innerHTML = result.value;
                    docContent.appendChild(wrapper);

                } else if (type === 'xlsx' || filename.toLowerCase().endsWith('.xlsx')) {
                    // Render Excel with XLSX
                    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const html = XLSX.utils.sheet_to_html(firstSheet);

                    const wrapper = document.createElement('div');
                    wrapper.className = 'document-content-wrapper excel-wrapper';
                    wrapper.style.cssText = "background: white; color: black; padding: 1rem; overflow: auto; height: 100%; border-radius: 4px;";
                    wrapper.innerHTML = html;
                    docContent.appendChild(wrapper);

                } else if (type === 'txt' || filename.toLowerCase().endsWith('.txt')) {
                    // Render Text
                    const decoder = new TextDecoder('utf-8');
                    const text = decoder.decode(arrayBuffer);
                    const wrapper = document.createElement('pre');
                    wrapper.style.cssText = "background: white; color: black; padding: 1rem; overflow: auto; height: 100%; white-space: pre-wrap; border-radius: 4px; font-family: monospace;";
                    wrapper.textContent = text;
                    docContent.appendChild(wrapper);
                } else {
                    throw new Error("Unsupported format for preview");
                }

            } catch (error) {
                console.error("Preview error:", error);
                docContent.innerHTML = '';
                const wrapper = document.createElement('div');
                wrapper.style.cssText = "text-align: center; padding: 2rem; color: white;";
                wrapper.innerHTML = `<div style="font-size: 4rem; margin-bottom: 1rem;">📄</div><h3 style="margin-bottom: 0.5rem;">${filename}</h3><p style="margin-bottom: 2rem; color: #ccc;">Preview not available: ${error.message}</p>`;

                const btn = document.createElement('button');
                btn.className = 'primary-btn';
                btn.style.padding = '10px 20px';
                btn.textContent = 'Download File';
                // Extract ID from URL: /api/download/FILE_ID?inline=true
                const fileId = url.split('?')[0].split('/').pop();
                btn.onclick = () => downloadFile(fileId, filename);

                wrapper.appendChild(btn);
                docContent.appendChild(wrapper);
            }
        }
    }
}

if (btnCloseDoc) btnCloseDoc.addEventListener("click", closeAllViewers);
if (btnMinimizeDoc) btnMinimizeDoc.addEventListener("click", () => {
    if (documentViewerModal) documentViewerModal.classList.add("hidden");
    if (btnRestoreFile) {
        btnRestoreFile.classList.remove("hidden");
        btnRestoreFile.classList.add("active");
    }
});

// --- Media Player Functions ---
function openMediaPlayer(url, filename, type) {
    closeAllViewers();
    if (mediaPlayerModal && mediaPlayerContainer) {
        activeViewer = 'media';
        mediaPlayerModal.classList.remove("hidden");
        mediaPlayerContainer.innerHTML = '';

        let element;
        if (type && type.startsWith('audio/')) {
            element = document.createElement('audio');
            element.style.width = '100%';
            element.style.marginTop = '2rem';
        } else {
            element = document.createElement('video');
            element.style.maxWidth = '100%';
            element.style.maxHeight = '100%';
        }
        element.src = url;
        element.controls = true;
        element.autoplay = true;
        element.name = 'media';

        mediaPlayerContainer.appendChild(element);
    }
}

if (btnCloseMediaPlayer) btnCloseMediaPlayer.addEventListener("click", () => {
    closeAllViewers();
    // Stop playback
    if (mediaPlayerContainer) mediaPlayerContainer.innerHTML = '';
});

if (btnMinimizeMediaPlayer) btnMinimizeMediaPlayer.addEventListener("click", () => {
    if (mediaPlayerModal) mediaPlayerModal.classList.add("hidden");
    if (btnRestoreFile) {
        btnRestoreFile.classList.remove("hidden");
        btnRestoreFile.classList.add("active");
    }
});

// Debug Unlock Feature (5x Clicks on About Icon)
const aboutAppIcon = document.getElementById("about-app-icon");
let debugClickCount = 0;
let debugClickTimer = null;

if (aboutAppIcon) {
    aboutAppIcon.addEventListener("click", () => {
        debugClickCount++;

        // Visual feedback (optional - small shake or scale)
        aboutAppIcon.style.transform = `scale(${1 + (debugClickCount * 0.05)})`;
        setTimeout(() => aboutAppIcon.style.transform = 'scale(1)', 150);

        if (debugClickTimer) clearTimeout(debugClickTimer);
        debugClickTimer = setTimeout(() => {
            debugClickCount = 0;
            aboutAppIcon.style.transform = 'scale(1)';
        }, 2000); // 2 seconds reset window

        if (debugClickCount >= 5) {
            debugClickCount = 0;
            if (debugClickTimer) clearTimeout(debugClickTimer);

            // Unlock hidden settings via global flag
            debugModeActive = true;
            if (typeof updateSettingsVisibility === 'function') {
                updateSettingsVisibility();
                console.log("Debug mode: Sidebar tabs should now be visible.");
            }

            // Show logs button explicitly just in case
            const btnViewLogs = document.getElementById("btn-view-logs");
            if (btnViewLogs) btnViewLogs.classList.remove("hidden");

            // Show toast
            showToast(translations[currentLanguage]["toast-debug-unlocked"], "success");
            console.log("Debug mode unlocked by user (global flag set).");
        }
    });
}
// --- Web Viewer Functions ---
const webViewerModal = document.getElementById("web-viewer-modal");
// const webFrame = document.getElementById("web-frame"); // Removed to support dynamic creation
const btnCloseWeb = document.getElementById("btn-close-web");
const btnMinimizeWeb = document.getElementById("btn-minimize-web");
const btnWebBack = document.getElementById("btn-web-back");
const btnWebForward = document.getElementById("btn-web-forward");
const btnWebRefresh = document.getElementById("btn-web-refresh");
const btnWebFullscreen = document.getElementById("btn-web-fullscreen");

function openWebViewer(url) {
    if (!url) return;

    // Ensure URL has protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }

    closeAllViewers();
    activeViewer = 'web';

    if (webViewerModal) {
        webViewerModal.classList.remove("hidden");

        // --- WEBVİEWER CROSS-PLATFORM FIX ---
        const isElectron = navigator.userAgent.toLowerCase().indexOf(' electron/') > -1;
        const webContainer = webViewerModal.querySelector('.web-container');

        let frame = document.getElementById("web-frame");

        if (isElectron) {
            // Ensure it is a webview
            if (frame && frame.tagName !== 'WEBVIEW') {
                frame.remove();
                frame = null;
            }
            if (!frame) {
                frame = document.createElement('webview');
                frame.id = 'web-frame';
                frame.setAttribute('allowpopups', '');
                frame.style.cssText = "width:100%; height:100%; display:inline-flex;";
                webContainer.prepend(frame);
            }
        } else {
            // Browser mode - use iframe
            if (frame && frame.tagName !== 'IFRAME') {
                frame.remove();
                frame = null;
            }
            if (!frame) {
                frame = document.createElement('iframe');
                frame.id = 'web-frame';
                frame.style.cssText = "width:100%; height:100%; border:none;";
                webContainer.prepend(frame);
            }
        }

        setTimeout(() => {
            const currentFrame = document.getElementById("web-frame");
            if (currentFrame) currentFrame.src = url;
        }, 10);
    }
}

if (btnCloseWeb) {
    btnCloseWeb.addEventListener("click", () => {
        closeAllViewers();
        const frame = document.getElementById("web-frame");
        if (frame) frame.src = "about:blank";
    });
}

if (btnMinimizeWeb) {
    btnMinimizeWeb.addEventListener("click", () => {
        if (webViewerModal) webViewerModal.classList.add("hidden");
        if (btnRestoreFile) {
            btnRestoreFile.classList.remove("hidden");
            btnRestoreFile.classList.add("active");
        }
    });
}

// Web Navigation Controls
if (btnWebBack) {
    btnWebBack.addEventListener("click", () => {
        const frame = document.getElementById("web-frame");
        if (!frame) return;
        try {
            if (frame.tagName === 'WEBVIEW') {
                if (frame.canGoBack()) frame.goBack();
            } else if (frame.contentWindow) {
                frame.contentWindow.history.back();
            }
        } catch (e) {
            console.warn("Navigation failed:", e);
        }
    });
}

if (btnWebForward) {
    btnWebForward.addEventListener("click", () => {
        const frame = document.getElementById("web-frame");
        if (!frame) return;
        try {
            if (frame.tagName === 'WEBVIEW') {
                if (frame.canGoForward()) frame.goForward();
            } else if (frame.contentWindow) {
                frame.contentWindow.history.forward();
            }
        } catch (e) {
            console.warn("Navigation failed:", e);
        }
    });
}

if (btnWebRefresh) {
    btnWebRefresh.addEventListener("click", () => {
        const frame = document.getElementById("web-frame");
        if (!frame) return;
        try {
            if (frame.tagName === 'WEBVIEW') {
                frame.reload();
            } else if (frame.contentWindow) {
                frame.contentWindow.location.reload();
            }
        } catch (e) {
            console.warn('Reload failed:', e);
        }
    });
}

// Fullscreen for Web Viewer
if (btnWebFullscreen) {
    btnWebFullscreen.addEventListener("click", () => {
        if (webViewerModal) {
            webViewerModal.classList.toggle("fullscreen");

            // Only toggle title/icon if needed, but styling handles the view.
            // SVG change logic if we want to change the icon (optional, matching video player)
            // btnWebFullscreen.innerHTML = webViewerModal.classList.contains("fullscreen") ? '<img src="/assets/minimize-square-3-svgrepo-com.svg" class="icon-video-ctrl" />' : '<img src="/assets/full-screen-square-svgrepo-com.svg" class="icon-video-ctrl" />';
        }
    });

    // Escape listener for web viewer fullscreen
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && webViewerModal && webViewerModal.classList.contains("fullscreen")) {
            webViewerModal.classList.remove("fullscreen");
        }
    });
}

// SAFETY UI UNLOCK
setTimeout(() => {
    const isRoleSelectionVisible = !roleSelection.classList.contains('hidden');
    const isAvailableClassesVisible = !availableClassesScreen.classList.contains('hidden');
    const isChatVisible = !chatInterface.classList.contains('hidden');
    const isSetupVisible = !classSetup.classList.contains('hidden');

    if (!isRoleSelectionVisible && !isAvailableClassesVisible && !isChatVisible && !isSetupVisible) {
        console.warn('⚠️ Safety UI Unlock: All screens were hidden! Forcing UI to show.');
        if (currentClassId && currentClassId !== 'Lobby') {
            availableClassesScreen.classList.remove('hidden');
            if (typeof renderAvailableClasses === 'function') renderAvailableClasses();
        } else if (savedRole === 'student') {
            availableClassesScreen.classList.remove('hidden');
            if (typeof renderAvailableClasses === 'function') renderAvailableClasses();
        } else {
            roleSelection.classList.remove('hidden');
        }
    }
}, 2000);
