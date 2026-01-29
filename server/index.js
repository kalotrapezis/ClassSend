const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const NetworkDiscovery = require('./network-discovery');
const TLSConfig = require('./tls-config');
const multer = require('multer');
const FileStorage = require('./file-storage');
const bayes = require('bayes');

// ===== NAIVE BAYES CLASSIFIER FOR ADVANCED FILTERING =====
let classifier = bayes();
let classifierTrained = false;


const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize file storage
const fileStorage = new FileStorage();

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// TLS/HTTPS support (optional)
const USE_TLS = process.env.USE_TLS === 'true' || false;
let server;
let serverProtocol = 'http';

if (USE_TLS) {
  const tlsConfig = new TLSConfig();
  const credentials = tlsConfig.getCredentials();
  server = https.createServer(credentials, app);
  serverProtocol = 'https';
  console.log('Server running with TLS/HTTPS enabled');
} else {
  server = http.createServer(app);
  console.log('Server running with HTTP (no encryption)');
}

const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for local network dev
    methods: ["GET", "POST"]
  },
  maxHttpBufferSize: 2 * 1024 * 1024 * 1024 // 2GB max message size (accounts for base64 encoding ~33% overhead)
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, fileStorage.uploadDir);
  },
  filename: (req, file, cb) => {
    const fileId = fileStorage.generateFileId();
    const ext = path.extname(file.originalname);
    cb(null, `${fileId}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 1.5 * 1024 * 1024 * 1024 // 1.5GB limit
  }
});

// ===== HTTP FILE UPLOAD/DOWNLOAD ENDPOINTS =====

// File upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { classId, userName, socketId, role } = req.body;
  if (!classId) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Class ID required' });
  }

  const fileId = path.parse(req.file.filename).name;
  const metadata = {
    id: fileId,
    name: req.file.originalname,
    size: req.file.size,
    type: req.file.mimetype,
    path: req.file.path,
    classId: classId,
    uploadedBy: userName,
    timestamp: Date.now()
  };

  fileStorage.saveFile(fileId, metadata);

  // Create message object
  const message = {
    id: Date.now() + Math.random(),
    classId: classId,
    senderId: socketId,
    senderName: userName,
    senderRole: role,
    content: `Shared a file: ${req.file.originalname}`,
    type: 'file',
    fileData: {
      id: fileId,
      name: req.file.originalname,
      size: req.file.size,
      type: req.file.mimetype
    },
    timestamp: new Date().toISOString()
  };

  // Store message in class data
  if (activeClasses.has(classId)) {
    activeClasses.get(classId).messages.push(message);
  }

  // Notify class via Socket.IO
  io.to(classId).emit('new-message', message);

  console.log(`File uploaded: ${req.file.originalname} (${fileId}) to class ${classId}`);
  res.json({ success: true, fileId: fileId });
});

// File download endpoint
app.get('/api/download/:fileId', (req, res) => {
  console.log(`[Download] Request for fileId: ${req.params.fileId}`);
  const file = fileStorage.getFile(req.params.fileId);

  if (!file) {
    console.error(`[Download] File metadata not found for ID: ${req.params.fileId}`);
    return res.status(404).json({ error: 'File not found' });
  }

  console.log(`[Download] Found metadata:`, file);

  if (!fs.existsSync(file.path)) {
    console.error(`[Download] File does not exist on disk: ${file.path}`);
    return res.status(404).json({ error: 'File not found' });
  }

  console.log(`[Download] Sending file from: ${file.path}`);

  // Set headers manually for download
  res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
  res.setHeader('Content-Type', file.type || 'application/octet-stream');

  // Use sendFile with root option to avoid path resolution issues
  const rootDir = path.dirname(file.path);
  const fileName = path.basename(file.path);

  res.sendFile(fileName, { root: rootDir }, (err) => {
    if (err) {
      console.error(`[Download] Error sending file:`, err);
      if (!res.headersSent) {
        res.status(404).json({ error: 'File sending failed' });
      }
    } else {
      console.log(`[Download] File sent successfully: ${file.name}`);
    }
  });
});

const activeClasses = new Map(); // classId -> { teacherId, students: [], deletionTimeout: null }
const networkDiscovery = new NetworkDiscovery();

// Grace period for teacher disconnections (10 seconds)
const TEACHER_DISCONNECT_GRACE_PERIOD = 10000;

// ===== FORBIDDEN WORDS MANAGEMENT =====
const baseDir = process.env.USER_DATA_PATH || __dirname;
const CUSTOM_WORDS_FILE = path.join(baseDir, 'data', 'custom-forbidden-words.json');
let customForbiddenWords = [];

// AI Training State
let isTraining = false;
let newWordsCount = 0;
const TRAINING_BATCH_SIZE = 2; // User requested 2

function getTrainingStatus() {
  return isTraining;
}

// Batch Training Simulation
function triggerBatchTraining() {
  newWordsCount++;
  console.log(`🧠 Words since last training: ${newWordsCount}/${TRAINING_BATCH_SIZE}`);
  if (newWordsCount >= TRAINING_BATCH_SIZE) {
    newWordsCount = 0;
    isTraining = true;
    console.log("🔄 Starting AI Retraining Batch...");
    // Broadcast start
    if (io) io.emit('training-started', { estimatedTime: 3000 });

    // Simulate training delay (3s)
    setTimeout(() => {
      isTraining = false;
      if (io) io.emit('training-ended');
      console.log("✅ AI Retraining Batch Complete");
    }, 3000);
  }
}



// Ensure data directory exists
const dataDir = path.join(baseDir, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Load custom forbidden words from file
function loadCustomForbiddenWords() {
  try {
    if (fs.existsSync(CUSTOM_WORDS_FILE)) {
      const data = fs.readFileSync(CUSTOM_WORDS_FILE, 'utf-8');
      customForbiddenWords = JSON.parse(data);
      console.log(`📚 Loaded ${customForbiddenWords.length} custom forbidden words`);
    }
  } catch (err) {
    console.error('Failed to load custom forbidden words:', err);
    customForbiddenWords = [];
  }
}

// Save custom forbidden words to file
function saveCustomForbiddenWords() {
  try {
    fs.writeFileSync(CUSTOM_WORDS_FILE, JSON.stringify(customForbiddenWords, null, 2), 'utf-8');
    console.log(`💾 Saved ${customForbiddenWords.length} custom forbidden words`);
  } catch (err) {
    console.error('Failed to save custom forbidden words:', err);
  }
}

// Load words on startup
loadCustomForbiddenWords();

// ===== PENDING REPORTS MANAGEMENT =====
const PENDING_REPORTS_FILE = path.join(baseDir, 'data', 'pending-reports.json');
let pendingReports = [];

// Load pending reports from file
function loadPendingReports() {
  try {
    if (fs.existsSync(PENDING_REPORTS_FILE)) {
      const data = fs.readFileSync(PENDING_REPORTS_FILE, 'utf-8');
      pendingReports = JSON.parse(data);
      console.log(`📋 Loaded ${pendingReports.length} pending reports`);
    }
  } catch (err) {
    console.error('Failed to load pending reports:', err);
    pendingReports = [];
  }
}

// Save pending reports to file
function savePendingReports() {
  try {
    fs.writeFileSync(PENDING_REPORTS_FILE, JSON.stringify(pendingReports, null, 2), 'utf-8');
    console.log(`💾 Saved ${pendingReports.length} pending reports`);
  } catch (err) {
    console.error('Failed to save pending reports:', err);
  }
}

// Load reports on startup
loadPendingReports();

// ===== NAIVE BAYES CLASSIFIER TRAINING =====
// Train the classifier with filter words and custom words
// ===== NAIVE BAYES CLASSIFIER TRAINING =====
// Train the classifier with filter words and custom words
async function trainClassifier() {
  try {
    // Reset classifier
    classifier = bayes();

    // 1. Load basic filter words from JSON file (Single words)
    const filterWordsPath = path.join(__dirname, 'public', 'filter-words.json');
    if (fs.existsSync(filterWordsPath)) {
      let filterData = fs.readFileSync(filterWordsPath, 'utf-8');
      filterData = filterData.replace(/^\uFEFF/, '');
      const filterWords = JSON.parse(filterData);

      for (const word of filterWords) {
        await classifier.learn(word.toLowerCase(), 'profane');
      }
      console.log(`🧠 Trained classifier with ${filterWords.length} basic filter words`);
    }

    // 2. Load RICH training data (Phrases, Emojis, Clean/Profane categories)
    const trainingDataPath = path.join(__dirname, 'public', 'training-data.json');
    if (fs.existsSync(trainingDataPath)) {
      let trainingDataRaw = fs.readFileSync(trainingDataPath, 'utf-8');
      trainingDataRaw = trainingDataRaw.replace(/^\uFEFF/, '');
      const trainingData = JSON.parse(trainingDataRaw);

      // Train clean examples
      if (trainingData.clean && Array.isArray(trainingData.clean)) {
        for (const phrase of trainingData.clean) {
          await classifier.learn(phrase.toLowerCase(), 'clean');
        }
        console.log(`🧠 Added ${trainingData.clean.length} CLEAN training examples (Phrases/Emojis)`);
      }

      // Train profane examples
      if (trainingData.profane && Array.isArray(trainingData.profane)) {
        for (const phrase of trainingData.profane) {
          await classifier.learn(phrase.toLowerCase(), 'profane');
        }
        console.log(`🧠 Added ${trainingData.profane.length} PROFANE training examples (Phrases/Emojis)`);
      }
    }

    // 3. Train with custom forbidden words (Teacher added)
    for (const item of customForbiddenWords) {
      await classifier.learn(item.word.toLowerCase(), 'profane');
    }
    console.log(`🧠 Added ${customForbiddenWords.length} custom user words to training`);

    classifierTrained = true;
    console.log('✅ Naive Bayes classifier training complete!');
  } catch (err) {
    console.error('Failed to train classifier:', err);
    classifierTrained = false;
  }
}

// Train classifier on startup
trainClassifier();

// Function to check message with classifier (for advanced mode)
async function checkMessageWithAI(message) {
  if (!classifierTrained) {
    return { isProfane: false, confidence: 0 };
  }

  try {
    const result = await classifier.categorize(message.toLowerCase());
    return {
      isProfane: result === 'profane',
      category: result
    };
  } catch (err) {
    console.error('AI check failed:', err);
    return { isProfane: false, confidence: 0 };
  }
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Broadcast active classes to all clients
  function broadcastActiveClasses() {
    const classesList = Array.from(activeClasses.entries()).map(([id, data]) => ({
      id,
      teacherName: data.teacherName
    }));
    io.emit('active-classes', classesList);

    // Update network discovery broadcast
    if (networkDiscovery) {
      networkDiscovery.updateClasses();
    }
  }


  socket.on('create-class', ({ classId, userName }, callback) => {
    if (activeClasses.has(classId)) {
      return callback({ success: false, message: 'Class ID already exists' });
    }
    activeClasses.set(classId, {
      teacherId: socket.id,
      teacherName: userName,
      students: [],
      messages: [],
      users: [{ id: socket.id, name: userName, role: 'teacher', handRaised: false }],
      deletionTimeout: null // Initialize deletion timeout
    });
    socket.join(classId);
    console.log(`Class created: ${classId} by ${userName} (${socket.id})`);

    // Publish mDNS hostname for the class
    if (networkDiscovery) {
      // Sanitize classId to be hostname-safe (alphanumeric + hyphens)
      const safeClassId = classId.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
      const hostname = `${safeClassId}.local`;
      networkDiscovery.publishClassHostname(classId, hostname);
    }

    broadcastActiveClasses();
    callback({ success: true });
  });

  socket.on('join-class', ({ classId, userName }, callback) => {
    const classData = activeClasses.get(classId);
    if (!classData) {
      return callback({ success: false, message: 'Class not found' });
    }

    // If teacher is reconnecting, cancel deletion timeout
    if (userName === classData.teacherName && classData.deletionTimeout) {
      console.log(`Teacher ${userName} reconnected to class ${classId}, cancelling deletion`);
      clearTimeout(classData.deletionTimeout);
      classData.deletionTimeout = null;
    }

    // Check if name is taken
    const existingUserIndex = classData.users.findIndex(u => u.name === userName);
    if (existingUserIndex !== -1) {
      const existingUser = classData.users[existingUserIndex];
      // Check if the existing user's socket is still active
      const existingSocket = io.sockets.sockets.get(existingUser.id);

      if (!existingSocket) {
        // Socket is dead (ghost session), remove old user and allow rejoin
        console.log(`Removing ghost user ${userName} (${existingUser.id}) from class ${classId}`);
        classData.users.splice(existingUserIndex, 1);

        // Also remove from students list if present
        const studentIndex = classData.students.findIndex(s => s.id === existingUser.id);
        if (studentIndex !== -1) {
          classData.students.splice(studentIndex, 1);
        }

        // If it was the teacher, update teacherId? 
        if (existingUser.role === 'teacher') {
          classData.teacherId = socket.id;
        }
      } else {
        return callback({ success: false, message: 'Name already taken in this class' });
      }
    }

    // Add user to class
    let role = 'student';
    if (userName === classData.teacherName) {
      role = 'teacher';
      classData.teacherId = socket.id; // Update teacher socket ID
    }

    const newUser = { id: socket.id, name: userName, role, handRaised: false };
    if (role === 'student') {
      classData.students.push(newUser);

      // Auto-block if Block All is active
      if (classData.blockAllActive) {
        if (!classData.blockedUsers) classData.blockedUsers = new Set();
        classData.blockedUsers.add(socket.id);
      }
    }
    classData.users.push(newUser);
    socket.join(classId);

    // Notify others
    socket.to(classId).emit('user-joined', {
      user: newUser,
      users: classData.users,
      classId
    });

    // Broadcast blocked status if needed
    if (role === 'student' && classData.blockAllActive) {
      io.to(classId).emit('user-blocked', { userId: socket.id, classId });
    }

    console.log(`User ${userName} (${socket.id}) joined class ${classId} as ${role}`);

    // Send history and user list to joiner
    callback({
      success: true,
      blocked: classData.blockedUsers && classData.blockedUsers.has(socket.id),
      messages: classData.messages,
      users: classData.users,
      pinnedMessages: classData.pinnedMessages || []
    });

    // Broadcast update to everyone (to update user counts)
    broadcastActiveClasses();
  });

  // Leave class
  socket.on('leave-class', ({ classId }, callback) => {
    if (!activeClasses.has(classId)) {
      return callback({ success: false });
    }
    const classData = activeClasses.get(classId);
    const userIndex = classData.users.findIndex(u => u.id === socket.id);

    if (userIndex !== -1) {
      const user = classData.users[userIndex];
      classData.users.splice(userIndex, 1);

      const studentIndex = classData.students.findIndex(s => s.id === socket.id);
      if (studentIndex !== -1) {
        classData.students.splice(studentIndex, 1);
      }

      socket.leave(classId);

      // Notify remaining participants
      io.to(classId).emit('user-left', {
        user,
        users: classData.users,
        classId
      });

      console.log(`User ${user.name} (${socket.id}) left class ${classId}`);
      callback({ success: true });
    } else {
      callback({ success: false, message: 'User not in class' });
    }
  });

  // Send chat message
  socket.on('send-message', ({ classId, content, type = 'text', fileData = null }) => {
    if (!activeClasses.has(classId)) return;

    const classData = activeClasses.get(classId);
    const user = classData.users.find(u => u.id === socket.id);
    if (!user) return;

    const message = {
      id: Date.now() + Math.random(),
      classId, // Include classId
      senderId: socket.id,
      senderName: user.name,
      senderRole: user.role,
      content,
      type, // 'text' or 'file'
      fileData, // { name, size, type, url } for files
      timestamp: new Date().toISOString()
    };

    classData.messages.push(message);

    // Broadcast to all participants in the class
    io.to(classId).emit('new-message', message);

    console.log(`Message from ${user.name} in ${classId}: ${type === 'text' ? content : 'file'}`);
  });

  // User flagged for inappropriate content
  socket.on('user-flagged', ({ classId, userId, userName }) => {
    if (!activeClasses.has(classId)) return;

    // Broadcast to all participants in the class
    io.to(classId).emit('user-was-flagged', { userId, userName });
    console.log(`User ${userName} (${userId}) flagged in class ${classId}`);
  });

  // Pin message (Teacher only)
  socket.on('pin-message', ({ classId, messageId }, callback) => {
    if (!activeClasses.has(classId)) {
      return callback({ success: false, message: 'Class not found' });
    }

    const classData = activeClasses.get(classId);

    // Check if user is teacher
    if (classData.teacherId !== socket.id) {
      return callback({ success: false, message: 'Only teachers can pin messages' });
    }

    // Find the message
    const message = classData.messages.find(m => m.id === messageId);
    if (!message) {
      return callback({ success: false, message: 'Message not found' });
    }

    // Check if already pinned
    if (!classData.pinnedMessages) {
      classData.pinnedMessages = [];
    }

    const alreadyPinned = classData.pinnedMessages.some(m => m.id === messageId);
    if (alreadyPinned) {
      return callback({ success: false, message: 'Message already pinned' });
    }

    // Add to pinned messages
    classData.pinnedMessages.push(message);


    // Broadcast to all participants
    io.to(classId).emit('message-pinned', { message, classId });

    console.log(`Message ${messageId} pinned in class ${classId}`);
    callback({ success: true });
  });

  // Unpin message (Teacher only)
  socket.on('unpin-message', ({ classId, messageId }, callback) => {
    if (!activeClasses.has(classId)) {
      return callback({ success: false, message: 'Class not found' });
    }

    const classData = activeClasses.get(classId);

    // Check if user is teacher
    if (classData.teacherId !== socket.id) {
      return callback({ success: false, message: 'Only teachers can unpin messages' });
    }

    // Remove from pinned messages
    if (!classData.pinnedMessages) {
      classData.pinnedMessages = [];
    }

    const index = classData.pinnedMessages.findIndex(m => m.id === messageId);
    if (index === -1) {
      return callback({ success: false, message: 'Message not pinned' });
    }

    // Remove from pinned messages
    classData.pinnedMessages.splice(index, 1);

    // Broadcast to all participants
    io.to(classId).emit('message-unpinned', { messageId, classId });

    console.log(`Message ${messageId} unpinned in class ${classId}`);
    callback({ success: true });
  });

  // Change user name
  socket.on('change-user-name', ({ classId, newName }, callback) => {
    if (!activeClasses.has(classId)) {
      return callback({ success: false, message: 'Class not found' });
    }

    const classData = activeClasses.get(classId);
    const user = classData.users.find(u => u.id === socket.id);
    if (!user) {
      return callback({ success: false, message: 'User not found' });
    }

    // Check if name is already taken
    const nameTaken = classData.users.some(u => u.id !== socket.id && u.name.toLowerCase() === newName.toLowerCase());
    if (nameTaken) {
      return callback({ success: false, message: 'Name already taken' });
    }

    const oldName = user.name;
    user.name = newName;

    // Update in students array if student
    if (user.role === 'student') {
      const student = classData.students.find(s => s.id === socket.id);
      if (student) student.name = newName;
    } else {
      classData.teacherName = newName;
      broadcastActiveClasses(); // Update teacher name in class list
    }

    // Broadcast name change to all participants
    io.to(classId).emit('user-name-changed', {
      userId: socket.id,
      oldName,
      newName,
      users: classData.users,
      classId
    });

    console.log(`User ${oldName} changed name to ${newName} in ${classId}`);
    callback({ success: true });
  });

  // File Transfer Events (legacy - now integrated into messages)
  socket.on('file-meta', (data) => {
    const { classId, metadata } = data;
    if (activeClasses.has(classId)) {
      socket.to(classId).emit('file-meta', metadata);
    }
  });

  socket.on('file-chunk', (data) => {
    const { classId, chunk } = data;
    if (activeClasses.has(classId)) {
      socket.to(classId).emit('file-chunk', chunk);
    }
  });

  // Request active classes
  socket.on('get-active-classes', () => {
    const classesList = Array.from(activeClasses.entries()).map(([id, data]) => ({
      id,
      teacherName: data.teacherName
    }));
    socket.emit('active-classes', classesList);
  });

  socket.on('ping', (callback) => {
    callback();
  });

  // Get Server Info (IP/Port)
  // Get Server Info (IP/Port)
  socket.on('get-server-info', (arg1, arg2) => {
    // Handle variable arguments: (callback) or (data, callback)
    let data = {};
    let callback = arg1;

    if (typeof arg1 === 'object' && arg1 !== null) {
      data = arg1;
      callback = arg2;
    }

    if (typeof callback !== 'function') {
      console.error('get-server-info: callback is not a function');
      return;
    }

    const { classId } = data;
    let hostname = null;
    if (classId) {
      const safeClassId = classId.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
      hostname = `${safeClassId}.local`;
    }

    callback({
      ip: networkDiscovery.localIP || 'localhost',
      port: process.env.PORT || 3000,
      hostname: hostname
    });
  });

  // Delete class (Teacher only)
  socket.on('delete-class', ({ classId }, callback) => {
    if (!activeClasses.has(classId)) {
      return callback({ success: false, message: 'Class not found' });
    }

    const classData = activeClasses.get(classId);
    if (classData.teacherId !== socket.id) {
      return callback({ success: false, message: 'Only the teacher can delete the class' });
    }

    // Cancel any pending deletion timeout
    if (classData.deletionTimeout) {
      clearTimeout(classData.deletionTimeout);
      classData.deletionTimeout = null;
    }

    // Notify all students that the class has ended
    io.to(classId).emit('class-ended', { message: 'Teacher has deleted the class', classId });

    activeClasses.delete(classId);

    // Unpublish mDNS hostname
    if (networkDiscovery) {
      networkDiscovery.unpublishClassHostname(classId);
    }

    broadcastActiveClasses();
    console.log(`Class ${classId} deleted by teacher ${classData.teacherName} (${socket.id})`);

    io.in(classId).socketsLeave(classId);

    callback({ success: true });
  });

  // User Blocking Events (Teacher only)
  socket.on('block-user', ({ classId, userId }) => {
    if (!activeClasses.has(classId)) return;
    const classData = activeClasses.get(classId);
    if (classData.teacherId !== socket.id) return;
    if (!classData.blockedUsers) classData.blockedUsers = new Set();
    classData.blockedUsers.add(userId);
    io.to(classId).emit('user-blocked', { userId, classId });
    console.log(`User ${userId} blocked in class ${classId}`);
  });

  socket.on('unblock-user', ({ classId, userId }) => {
    if (!activeClasses.has(classId)) return;
    const classData = activeClasses.get(classId);
    if (classData.teacherId !== socket.id) return;
    if (classData.blockedUsers) classData.blockedUsers.delete(userId);
    io.to(classId).emit('user-unblocked', { userId, classId });
    console.log(`User ${userId} unblocked in class ${classId}`);
  });

  socket.on('block-all-users', ({ classId }) => {
    if (!activeClasses.has(classId)) return;
    const classData = activeClasses.get(classId);
    if (classData.teacherId !== socket.id) return;
    const studentIds = classData.students.map(s => s.id);
    classData.blockedUsers = new Set(studentIds);
    classData.blockAllActive = true; // NEW: Persist block-all state
    io.to(classId).emit('all-users-blocked', { blockedUserIds: studentIds, classId });
    console.log(`All users blocked in class ${classId}`);
  });

  socket.on('unblock-all-users', ({ classId }) => {
    if (!activeClasses.has(classId)) return;
    const classData = activeClasses.get(classId);
    if (classData.teacherId !== socket.id) return;
    classData.blockedUsers = new Set();
    classData.blockAllActive = false; // NEW: Clear block-all state
    io.to(classId).emit('all-users-unblocked', { classId });
    console.log(`All users unblocked in class ${classId}`);
  });

  // Hand-Raising Events
  socket.on('raise-hand', ({ classId }) => {
    if (!activeClasses.has(classId)) return;
    const classData = activeClasses.get(classId);
    const user = classData.users.find(u => u.id === socket.id);
    if (!user) return;

    // Toggle hand raised state
    user.handRaised = !user.handRaised;

    // Broadcast to all participants
    io.to(classId).emit('hand-raised', {
      userId: socket.id,
      handRaised: user.handRaised,
      users: classData.users,
      classId
    });
    console.log(`User ${user.name} (${socket.id}) ${user.handRaised ? 'raised' : 'lowered'} hand in class ${classId}`);
  });

  socket.on('lower-hand', ({ classId, userId }) => {
    if (!activeClasses.has(classId)) return;
    const classData = activeClasses.get(classId);
    const user = classData.users.find(u => u.id === userId);
    if (!user) return;

    user.handRaised = false;

    // Broadcast to all participants
    io.to(classId).emit('hand-lowered', {
      userId,
      users: classData.users,
      classId
    });
    console.log(`Hand lowered for user ${user.name} (${userId}) in class ${classId}`);
  });

  socket.on('lower-all-hands', ({ classId }) => {
    if (!activeClasses.has(classId)) return;
    const classData = activeClasses.get(classId);

    // Only teacher can lower all hands
    if (classData.teacherId !== socket.id) return;

    // Lower all students' hands
    classData.users.forEach(user => {
      if (user.role === 'student') {
        user.handRaised = false;
      }
    });

    // Broadcast to all participants
    io.to(classId).emit('all-hands-lowered', {
      users: classData.users,
      classId
    });
    console.log(`All hands lowered in class ${classId} by teacher`);
  });

  // Language sync (Teacher to students)
  socket.on('set-class-language', ({ classId, language }) => {
    if (!activeClasses.has(classId)) return;
    const classData = activeClasses.get(classId);
    if (classData.teacherId !== socket.id) return; // Only teacher can change

    // Broadcast language change to all students in the class
    socket.to(classId).emit('language-changed', { language, classId });
    console.log(`Language set to ${language} in class ${classId} by teacher`);
  });

  // Network Discovery Events
  let discoveryBrowser = null;

  socket.on('start-discovery', () => {
    // Stop existing browser if any
    if (discoveryBrowser) {
      discoveryBrowser.stop();
    }

    console.log(`Client ${socket.id} started network discovery`);

    // Start scanning for other servers
    discoveryBrowser = networkDiscovery.findServers(
      (serverInfo) => {
        // Server found
        socket.emit('server-discovered', serverInfo);
      },
      (serverInfo) => {
        // Server lost
        socket.emit('server-lost', serverInfo);
      }
    );
  });

  socket.on('stop-discovery', () => {
    if (discoveryBrowser) {
      discoveryBrowser.stop();
      discoveryBrowser = null;
      console.log(`Client ${socket.id} stopped network discovery`);
    }
  });

  // ===== FORBIDDEN WORDS SOCKET EVENTS =====
  socket.on('add-forbidden-word', ({ word }, callback) => {
    if (!word || typeof word !== 'string') {
      return callback({ success: false, message: 'Invalid word' });
    }

    const trimmedWord = word.trim().toLowerCase();

    // Check if already exists
    if (customForbiddenWords.some(w => w.word === trimmedWord)) {
      return callback({ success: false, message: 'Word already exists' });
    }

    // Add word with timestamp
    customForbiddenWords.push({
      word: trimmedWord,
      addedAt: new Date().toISOString()
    });

    // Save to file
    saveCustomForbiddenWords();

    // Broadcast to all clients
    io.emit('forbidden-words-updated', customForbiddenWords);

    console.log(`📚 Added forbidden word: ${trimmedWord}`);
    callback({ success: true });
  });

  socket.on('remove-forbidden-word', ({ word }, callback) => {
    if (!word || typeof word !== 'string') {
      return callback({ success: false, message: 'Invalid word' });
    }

    const trimmedWord = word.trim().toLowerCase();
    const initialLength = customForbiddenWords.length;

    // Remove word
    customForbiddenWords = customForbiddenWords.filter(w => w.word !== trimmedWord);

    if (customForbiddenWords.length === initialLength) {
      return callback({ success: false, message: 'Word not found' });
    }

    // Save to file
    saveCustomForbiddenWords();

    // Broadcast to all clients
    io.emit('forbidden-words-updated', customForbiddenWords);

    console.log(`📚 Removed forbidden word: ${trimmedWord}`);
    callback({ success: true });
  });

  socket.on('get-forbidden-words', (callback) => {
    if (typeof callback === 'function') {
      callback(customForbiddenWords);
    }
  });

  // ===== FILTER MODE & AI CHECK =====
  // Set filter mode for a class (Teacher only)
  socket.on('set-filter-mode', ({ classId, mode }, callback) => {
    if (!activeClasses.has(classId)) {
      return callback({ success: false, message: 'Class not found' });
    }

    const classData = activeClasses.get(classId);
    if (classData.teacherId !== socket.id) {
      return callback({ success: false, message: 'Only teacher can change filter mode' });
    }

    classData.filterMode = mode; // 'legacy' or 'advanced'

    // Broadcast to all class members
    io.to(classId).emit('filter-mode-changed', { classId, mode });

    console.log(`🔧 Filter mode set to '${mode}' in class ${classId}`);
    callback({ success: true });
  });

  // Get filter mode for a class
  socket.on('get-filter-mode', (data, callback) => {
    // Handle both (callback) and (data, callback) patterns
    if (typeof data === 'function') {
      callback = data;
      data = {};
    }
    if (typeof callback !== 'function') return;

    const classId = data?.classId;
    if (!classId || !activeClasses.has(classId)) {
      return callback('legacy');
    }

    const classData = activeClasses.get(classId);
    callback(classData.filterMode || 'legacy');
  });

  // Check message with AI (for advanced mode)
  socket.on('check-message-ai', async ({ message }, callback) => {
    const result = await checkMessageWithAI(message);
    callback(result);
  });

  // ===== WORD REPORTING SYSTEM =====
  // Student reports a word
  socket.on('report-word', ({ classId, word, context, messageId, reporterName }, callback) => {
    if (!classId || !word) {
      return callback({ success: false, message: 'Missing required fields' });
    }

    const trimmedWord = word.trim().toLowerCase();

    // Check if already reported
    const alreadyReported = pendingReports.some(
      r => r.word === trimmedWord && r.classId === classId
    );

    if (alreadyReported) {
      return callback({ success: false, message: 'Word already reported' });
    }

    // Add to pending reports
    const report = {
      id: Date.now().toString(),
      word: trimmedWord,
      context: context || '',
      messageId: messageId || null, // Store confirmation message ID
      reporterName: reporterName || 'Anonymous',
      reporterId: socket.id,
      classId,
      timestamp: new Date().toISOString()
    };

    pendingReports.push(report);
    savePendingReports();

    // Notify teacher
    if (activeClasses.has(classId)) {
      const classData = activeClasses.get(classId);
      if (classData.teacherId) {
        io.to(classData.teacherId).emit('new-report', report);
      }
    }

    console.log(`⚠️ Word reported: '${trimmedWord}' by ${reporterName} in class ${classId}`);
    callback({ success: true });
  });

  // Get pending reports (Teacher only)
  socket.on('get-pending-reports', (callback) => {
    if (typeof callback !== 'function') return;

    // Return all pending reports for this teacher's classes
    const teacherReports = pendingReports.filter(r => {
      if (!activeClasses.has(r.classId)) return false;
      const classData = activeClasses.get(r.classId);
      return classData.teacherId === socket.id;
    });

    callback(teacherReports);
  });

  // Approve a report (add word to blacklist + train AI)
  socket.on('approve-report', async ({ reportId, classId }, callback) => {
    if (!activeClasses.has(classId)) {
      return callback({ success: false, message: 'Class not found' });
    }

    const classData = activeClasses.get(classId);
    if (classData.teacherId !== socket.id) {
      return callback({ success: false, message: 'Only teacher can approve reports' });
    }

    // Find the report
    const reportIndex = pendingReports.findIndex(r => r.id === reportId);
    if (reportIndex === -1) {
      return callback({ success: false, message: 'Report not found' });
    }

    const report = pendingReports[reportIndex];

    // Add to custom forbidden words if not already there
    if (!customForbiddenWords.some(w => w.word === report.word)) {
      customForbiddenWords.push({
        word: report.word,
        addedAt: new Date().toISOString(),
        source: 'report'
      });
      saveCustomForbiddenWords();

      // Train the AI with this new word
      await classifier.learn(report.word, 'profane');
      console.log(`🧠 AI trained with new profane word: ${report.word}`);

      // Broadcast updated forbidden words
      io.emit('forbidden-words-updated', customForbiddenWords);
    }

    // Remove from pending reports
    pendingReports.splice(reportIndex, 1);
    savePendingReports();

    // Notify teacher of update
    io.to(classData.teacherId).emit('report-resolved', { reportId, action: 'approved' });

    // If report has a messageId, broadcast deletion event
    if (report.messageId) {
      io.to(classId).emit('delete-message', { messageId: report.messageId, classId });
      console.log(`🗑️ Deleted reported message ${report.messageId}`);
    }

    console.log(`✅ Report approved: '${report.word}' added to blacklist`);

    // Trigger batch training check
    triggerBatchTraining();

    callback({ success: true });
  });

  // Reject a report
  socket.on('reject-report', ({ reportId, classId }, callback) => {
    if (!activeClasses.has(classId)) {
      return callback({ success: false, message: 'Class not found' });
    }

    const classData = activeClasses.get(classId);
    if (classData.teacherId !== socket.id) {
      return callback({ success: false, message: 'Only teacher can reject reports' });
    }

    // Find and remove the report
    const reportIndex = pendingReports.findIndex(r => r.id === reportId);
    if (reportIndex === -1) {
      return callback({ success: false, message: 'Report not found' });
    }

    const report = pendingReports[reportIndex];
    pendingReports.splice(reportIndex, 1);
    savePendingReports();

    // Notify teacher of update
    io.to(classData.teacherId).emit('report-resolved', { reportId, action: 'rejected' });

    console.log(`❌ Report rejected: '${report.word}'`);
    callback({ success: true });
  });

  // Teacher instantly blocks a message (from chat)
  socket.on('teacher-ban-message', ({ classId, messageId, word }) => {
    if (!activeClasses.has(classId)) return;
    const classData = activeClasses.get(classId);
    if (classData.teacherId !== socket.id) return; // Security check

    if (!word) return;
    const trimmedWord = word.trim().toLowerCase();

    // Add to forbiddden words if not exists
    if (!customForbiddenWords.some(w => w.word === trimmedWord)) {
      customForbiddenWords.push({
        word: trimmedWord,
        addedAt: new Date().toISOString(),
        source: 'teacher-ban'
      });
      saveCustomForbiddenWords();
      io.emit('forbidden-words-updated', customForbiddenWords);
    }

    // Train AI
    classifier.learn(trimmedWord, 'profane');
    console.log(`🧠 AI trained with banned word: ${trimmedWord}`);

    // Broadcast delete
    io.to(classId).emit('delete-message', { messageId, classId });
    console.log(`🚫 Teacher banned message: '${trimmedWord}'`);

    // Trigger batch training check
    triggerBatchTraining();
  });

  // ===== WEB RTC SCREEN SHARING =====
  // ===== WEB RTC SCREEN SHARING =====
  socket.on('screen-share-status', ({ classId, isSharing }) => {
    if (!activeClasses.has(classId)) return;
    const classData = activeClasses.get(classId);

    // Only teacher can broadcast screen share status
    if (classData.teacherId !== socket.id) return;

    classData.isScreenSharing = isSharing;

    if (isSharing) {
      // Create a system message
      const message = {
        id: Date.now() + Math.random(),
        classId,
        senderId: 'system',
        senderName: 'System',
        senderRole: 'system',
        content: 'msg-teacher-share-start',
        type: 'system',
        action: 'join-stream', // Custom field for client to render button
        timestamp: new Date().toISOString()
      };

      classData.messages.push(message);

      // Pin IT
      if (!classData.pinnedMessages) classData.pinnedMessages = [];
      classData.pinnedMessages.push(message);
      classData.screenShareMessageId = message.id; // Track it

      io.to(classId).emit('new-message', message);
      io.to(classId).emit('message-pinned', { message, classId });

    } else {
      // Stop sharing - remove pinned message
      if (classData.screenShareMessageId) {
        // Unpin
        if (classData.pinnedMessages) {
          const index = classData.pinnedMessages.findIndex(m => m.id === classData.screenShareMessageId);
          if (index !== -1) {
            classData.pinnedMessages.splice(index, 1);
            io.to(classId).emit('message-unpinned', { messageId: classData.screenShareMessageId, classId });
          }
        }
        classData.screenShareMessageId = null;
      }
    }

    // Still broadcast status for other UI updates if needed (e.g. sidebar state)
    io.to(classId).emit('screen-share-status-update', { isSharing, classId });
    console.log(`Screen share ${isSharing ? 'started' : 'stopped'} in class ${classId}`);
  });

  // Relay WebRTC keys between peers
  socket.on('signal', ({ to, from, signal }) => {
    // Determine target socket
    const targetSocket = io.sockets.sockets.get(to);
    if (targetSocket) {
      targetSocket.emit('signal', {
        signal,
        from // Send the ID of the sender
      });
      // console.log(`Signal relayed from ${from} to ${to} (${signal.type || 'candidate'})`);
    } else {
      console.log(`Signal failed: Target ${to} not found`);
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    if (discoveryBrowser) {
      discoveryBrowser.stop();
    }

    // Check if user was a teacher and schedule class deletion with grace period
    for (const [classId, classData] of activeClasses.entries()) {
      if (classData.teacherId === socket.id) {
        // Don't delete immediately - give teacher time to reconnect (e.g., during file upload)
        console.log(`Teacher disconnected from class ${classId}, starting ${TEACHER_DISCONNECT_GRACE_PERIOD}ms grace period`);

        classData.deletionTimeout = setTimeout(() => {
          // Only delete if class still exists and timeout wasn't cancelled
          if (activeClasses.has(classId)) {
            console.log(`Grace period expired for class ${classId}, deleting class`);
            // Notify all students that the class has ended
            io.to(classId).emit('class-ended', { message: 'Teacher has disconnected', classId });
            activeClasses.delete(classId);
            broadcastActiveClasses();
          }
        }, TEACHER_DISCONNECT_GRACE_PERIOD);

        return;
      }

      // Check if user was a student and remove them from the class
      const userIndex = classData.users.findIndex(u => u.id === socket.id);
      if (userIndex !== -1) {
        const user = classData.users[userIndex];
        classData.users.splice(userIndex, 1);

        const studentIndex = classData.students.findIndex(s => s.id === socket.id);
        if (studentIndex !== -1) {
          classData.students.splice(studentIndex, 1);
        }

        // Notify all participants that user left
        io.to(classId).emit('user-left', {
          user,
          users: classData.users,
          classId
        });

        console.log(`User ${user.name} (${socket.id}) left class ${classId}`);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;

// Listen on all network interfaces (0.0.0.0) to accept connections from LAN
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Protocol: ${serverProtocol}`);

  // Initialize network discovery
  try {
    const localIP = await networkDiscovery.initialize(PORT, () => {
      return Array.from(activeClasses.entries()).map(([id, data]) => ({
        id,
        teacherName: data.teacherName,
        userCount: data.users.length
      }));
    });

    console.log(`Server accessible at ${serverProtocol}://${localIP}:${PORT}`);
    console.log(`Broadcasting service on local network...`);
  } catch (error) {
    console.error('Failed to initialize network discovery:', error);
  }
});



const sockets = new Set();

server.on('connection', (socket) => {
  sockets.add(socket);
  socket.on('close', () => {
    sockets.delete(socket);
  });
});

function stopServer() {
  return new Promise((resolve, reject) => {
    console.log('Closing ' + sockets.size + ' active sockets');

    // Stop network discovery
    if (networkDiscovery) {
      networkDiscovery.stop();
    }

    for (const socket of sockets) {
      socket.destroy();
      sockets.delete(socket);
    }

    server.close((err) => {
      if (err) {
        console.error('Error closing server:', err);
        reject(err);
      } else {
        console.log('Server stopped');
        resolve();
      }
    });
  });
}

// Handle graceful shutdown signals (for standalone execution)
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down...');
  await stopServer();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Shutting down...');
  await stopServer();
  process.exit(0);
});

// Prevent crash on EPIPE (broken pipe)
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') {
    // Ignore EPIPE errors (broken pipe)
    return;
  }
  process.stderr.write(`Stdout error: ${err.message}\n`);
});

process.stderr.on('error', (err) => {
  if (err.code === 'EPIPE') return;
  // We cannot log here if stderr is broken
});

module.exports = { server, stopServer, getTrainingStatus };

