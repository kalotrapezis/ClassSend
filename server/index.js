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
const deepLearningFilter = require('./deep-learning-filter');
const Filter = require('bad-words');
const filter = new Filter();

// Try to load Electron (only works if running in Electron process)
let electronApp = null;
try {
  // eslint-disable-next-line global-require
  const { app } = require('electron');
  electronApp = app;
} catch (e) {
  console.log('Running in Node.js mode (no Electron features)');
}
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

  // Fix Greek/UTF-8 filename encoding (multer uses Latin-1 by default)
  let originalName = req.file.originalname;
  try {
    // Convert Latin-1 encoded string back to UTF-8
    originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  } catch (e) {
    // Keep original if conversion fails
    console.warn('Filename encoding conversion failed:', e.message);
  }

  const fileId = path.parse(req.file.filename).name;
  const metadata = {
    id: fileId,
    name: originalName,
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
    content: `Shared a file: ${originalName}`,
    type: 'file',
    fileData: {
      id: fileId,
      name: originalName,
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

  console.log(`File uploaded: ${originalName} (${fileId}) to class ${classId}`);
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

  // Set Content-Type manually if available, otherwise res.download will attempt to guess it
  if (file.type) {
    res.setHeader('Content-Type', file.type);
  }

  // Use res.download for a robust, standard way to serve files with proper encoding
  res.download(file.path, file.name, (err) => {
    if (err) {
      console.error(`[Download] Error during res.download:`, err);
      if (!res.headersSent) {
        res.status(404).json({ error: 'File download failed' });
      }
    } else {
      console.log(`[Download] File sent successfully: ${file.name}`);
    }
  });
});

const activeClasses = new Map(); // classId -> { teacherId, students: [], deletionTimeout: null }
const networkDiscovery = new NetworkDiscovery();

// Auto-incrementing class counter for auto-naming
let classCounter = 0;

// Grace period for teacher disconnections (10 seconds)
const TEACHER_DISCONNECT_GRACE_PERIOD = 10000;

// ===== FORBIDDEN WORDS MANAGEMENT =====
// ===== FORBIDDEN WORDS MANAGEMENT =====
const baseDir = process.env.USER_DATA_PATH || __dirname;
const CUSTOM_BLACKLIST_FILE = path.join(baseDir, 'data', 'custom-forbidden-words.json');
const CUSTOM_WHITELIST_FILE = path.join(baseDir, 'data', 'custom-whitelisted-words.json');

let customForbiddenWords = [];
let customWhitelistedWords = [];

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
    if (fs.existsSync(CUSTOM_BLACKLIST_FILE)) {
      const data = fs.readFileSync(CUSTOM_BLACKLIST_FILE, 'utf-8');
      customForbiddenWords = JSON.parse(data);
      console.log(`📚 Loaded ${customForbiddenWords.length} custom forbidden words`);
    } else {
      // Fallback for transition
      if (fs.existsSync(path.join(baseDir, 'data', 'custom-words.json'))) {
        // ... handle legacy if needed, but not critical now
      }
    }
  } catch (err) {
    console.error('Failed to load custom forbidden words:', err);
    customForbiddenWords = [];
  }
}

// Save custom forbidden words to file
function saveCustomForbiddenWords() {
  try {
    fs.writeFileSync(CUSTOM_BLACKLIST_FILE, JSON.stringify(customForbiddenWords, null, 2), 'utf-8');
    console.log(`💾 Saved ${customForbiddenWords.length} custom forbidden words`);
  } catch (err) {
    console.error('Failed to save custom forbidden words:', err);
  }
}

// Load custom whitelisted words from file
function loadCustomWhitelistedWords() {
  try {
    if (fs.existsSync(CUSTOM_WHITELIST_FILE)) {
      const data = fs.readFileSync(CUSTOM_WHITELIST_FILE, 'utf-8');
      customWhitelistedWords = JSON.parse(data);
      console.log(`🕊️ Loaded ${customWhitelistedWords.length} custom whitelisted words`);
    }
  } catch (err) {
    console.error('Failed to load custom whitelisted words:', err);
    customWhitelistedWords = [];
  }
}

// Save custom whitelisted words to file
function saveCustomWhitelistedWords() {
  try {
    fs.writeFileSync(CUSTOM_WHITELIST_FILE, JSON.stringify(customWhitelistedWords, null, 2), 'utf-8');
    console.log(`💾 Saved ${customWhitelistedWords.length} custom whitelisted words`);
  } catch (err) {
    console.error('Failed to save custom whitelisted words:', err);
  }
}

// Load words on startup
loadCustomForbiddenWords();
loadCustomWhitelistedWords();

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
    // Broadcast update to all connected clients (client filters by role)
    if (io) io.emit('pending-reports-updated', pendingReports);
  } catch (err) {
    console.error('Failed to save pending reports:', err);
  }
}

// Load reports on startup
loadPendingReports();

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

    // 3. Train with mild bad words (Bullying/Gaming terms common in schools)
    const MILD_BAD_WORDS = [
      // --- Greek Bullying/School ---
      'βλάκας', 'βλακα', 'ηλίθιος', 'ηλίθια', 'χαζός', 'χαζή',
      'άσχετος', 'άσχετη', 'άχρηστος', 'άχρηστη', 'φλούφλης',
      'κοτούλα', 'μπέμπης', 'φυτό',

      // --- English/Gaming (Πολύ συχνά σε μαθητές) ---
      'stupid', 'idiot', 'noob', 'nob', 'n00b', 'loser', 'bot',
      'trash', 'bad', 'lag', 'hack', 'hacker', 'cheater',
      'shut up', 'stfu', 'wtf', 'omg', 'hell'
    ];

    for (const word of MILD_BAD_WORDS) {
      await classifier.learn(word.toLowerCase(), 'profane');
    }
    console.log(`🧠 Added ${MILD_BAD_WORDS.length} mild bad words (bullying/gaming terms)`);

    // 4. Train with custom forbidden words (Teacher added)
    // Train on custom blacklist
    customForbiddenWords.forEach(item => {
      classifier.learn(item.word, 'profane');
    });

    // Train on custom whitelist (Good List)
    customWhitelistedWords.forEach(item => {
      classifier.learn(item.word, 'clean');
    });

    console.log(`🧠 Added ${customForbiddenWords.length} custom user words to training (profane)`);
    console.log(`🧠 Added ${customWhitelistedWords.length} custom safe words to training (clean)`);

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
      deletionTimeout: null, // Initialize deletion timeout
      // Advanced Model Settings (Default: 50% block, 30% report)
      advancedSettings: {
        blockEnabled: true,
        blockThreshold: 90, // Low Sensitivity (10%) = High Threshold
        reportEnabled: true,
        reportThreshold: 10 // High Sensitivity (90%) = Low Threshold
      }
    });
    socket.join(classId);
    console.log(`Class created: ${classId} by ${userName} (${socket.id})`);

    // Publish mDNS hostname for the class
    if (networkDiscovery) {
      try {
        // Sanitize classId to be hostname-safe (alphanumeric + hyphens)
        const safeClassId = classId.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
        const hostname = `${safeClassId}.local`;
        networkDiscovery.publishClassHostname(classId, hostname);
      } catch (e) {
        console.error('Failed to publish hostname (non-fatal):', e);
      }
    }

    broadcastActiveClasses();
    callback({ success: true });
  });

  // Auto-create class with auto-generated name (Class-01, Class-02, etc.)
  socket.on('auto-create-class', ({ userName }, callback) => {
    classCounter++;
    const classId = `Class-${String(classCounter).padStart(2, '0')}`;

    // Ensure unique class ID
    while (activeClasses.has(classId)) {
      classCounter++;
    }
    const finalClassId = `Class-${String(classCounter).padStart(2, '0')}`;

    activeClasses.set(finalClassId, {
      teacherId: socket.id,
      teacherName: userName,
      students: [],
      messages: [],
      users: [{ id: socket.id, name: userName, role: 'teacher', handRaised: false }],
      deletionTimeout: null,
      advancedSettings: {
        blockEnabled: true,
        blockThreshold: 90,
        reportEnabled: true,
        reportThreshold: 10
      }
    });
    socket.join(finalClassId);
    console.log(`Auto-created class: ${finalClassId} by ${userName} (${socket.id})`);

    // Publish mDNS hostname
    if (networkDiscovery) {
      try {
        const safeClassId = finalClassId.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
        const hostname = `${safeClassId}.local`;
        networkDiscovery.publishClassHostname(finalClassId, hostname);
      } catch (e) {
        console.error('Failed to publish hostname (non-fatal):', e);
      }
    }

    broadcastActiveClasses();
    callback({ success: true, classId: finalClassId });
  });

  // Rename class (teacher only)
  socket.on('rename-class', ({ classId, newName }, callback) => {
    const classData = activeClasses.get(classId);
    if (!classData) {
      return callback({ success: false, message: 'Class not found' });
    }

    // Verify teacher
    if (classData.teacherId !== socket.id) {
      return callback({ success: false, message: 'Only the teacher can rename the class' });
    }

    // Check if new name already exists
    if (activeClasses.has(newName) && newName !== classId) {
      return callback({ success: false, message: 'A class with this name already exists' });
    }

    // Rename the class
    activeClasses.delete(classId);
    activeClasses.set(newName, classData);

    // Update mDNS
    if (networkDiscovery) {
      try {
        networkDiscovery.unpublishClassHostname(classId);
        const safeNewName = newName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
        networkDiscovery.publishClassHostname(newName, `${safeNewName}.local`);
      } catch (e) {
        console.error('Failed to update hostname (non-fatal):', e);
      }
    }

    // Notify all participants
    io.to(classId).emit('class-renamed', { oldName: classId, newName });

    // Move all sockets to new room
    const socketsInRoom = io.sockets.adapter.rooms.get(classId);
    if (socketsInRoom) {
      for (const socketId of socketsInRoom) {
        const s = io.sockets.sockets.get(socketId);
        if (s) {
          s.leave(classId);
          s.join(newName);
        }
      }
    }

    console.log(`Class renamed: ${classId} -> ${newName}`);
    broadcastActiveClasses();
    callback({ success: true, newName });
  });

  // Join or create a shared Lobby (for students when no classes exist)
  socket.on('join-or-create-lobby', ({ userName }, callback) => {
    const lobbyId = 'Lobby';

    // Check if Lobby exists
    if (!activeClasses.has(lobbyId)) {
      // Create Lobby without a teacher
      activeClasses.set(lobbyId, {
        teacherId: null,
        teacherName: null,
        students: [],
        messages: [],
        users: [],
        deletionTimeout: null,
        advancedSettings: {
          blockEnabled: true,
          blockThreshold: 90,
          reportEnabled: true,
          reportThreshold: 10
        }
      });
      console.log(`Lobby created by student ${userName}`);
      broadcastActiveClasses();
    }

    const classData = activeClasses.get(lobbyId);

    // Add user as student
    const existingUser = classData.users.find(u => u.id === socket.id);
    if (!existingUser) {
      classData.users.push({ id: socket.id, name: userName, role: 'student', handRaised: false });
      classData.students.push(socket.id);
    }

    socket.join(lobbyId);

    // Notify others
    io.to(lobbyId).emit('user-list', classData.users);

    const hasTeacher = classData.teacherId !== null;

    callback({
      success: true,
      classId: lobbyId,
      messages: classData.messages,
      users: classData.users,
      teacherName: classData.teacherName,
      hasTeacher: hasTeacher
    });

    console.log(`Student ${userName} joined Lobby (hasTeacher: ${hasTeacher})`);
  });

  // Teacher takes over an existing Lobby (or creates it if missing)
  socket.on('take-over-lobby', ({ userName }, callback) => {
    const lobbyId = 'Lobby';

    // If Lobby doesn't exist, create it
    if (!activeClasses.has(lobbyId)) {
      activeClasses.set(lobbyId, {
        teacherId: socket.id,
        teacherName: userName,
        students: [],
        messages: [],
        users: [{ id: socket.id, name: userName, role: 'teacher', handRaised: false }],
        deletionTimeout: null,
        advancedSettings: {
          blockEnabled: true,
          blockThreshold: 90,
          reportEnabled: true,
          reportThreshold: 10
        }
      });
      socket.join(lobbyId);
      console.log(`Lobby created and taken over by teacher ${userName}`);
      broadcastActiveClasses();
      return callback({
        success: true,
        classId: lobbyId,
        messages: [],
        users: [{ id: socket.id, name: userName, role: 'teacher' }]
      });
    }

    const classData = activeClasses.get(lobbyId);

    // Check if Lobby already has a teacher
    if (classData.teacherId !== null) {
      return callback({ success: false, message: 'Lobby already has a teacher' });
    }

    // Take over as teacher
    classData.teacherId = socket.id;
    classData.teacherName = userName;

    // Update user in the users list or add as teacher
    const existingUser = classData.users.find(u => u.id === socket.id);
    if (existingUser) {
      existingUser.role = 'teacher';
      existingUser.name = userName;
    } else {
      classData.users.push({ id: socket.id, name: userName, role: 'teacher', handRaised: false });
    }

    socket.join(lobbyId);

    // Notify all participants that teacher has joined
    io.to(lobbyId).emit('user-joined', {
      user: { id: socket.id, name: userName, role: 'teacher' },
      users: classData.users,
      classId: lobbyId
    });

    broadcastActiveClasses();

    callback({
      success: true,
      classId: lobbyId,
      messages: classData.messages,
      users: classData.users
    });

    console.log(`Teacher ${userName} took over Lobby`);
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
  socket.on('send-message', async ({ classId, content, type = 'text', fileData = null }) => {
    try {
      if (!activeClasses.has(classId)) {
        console.warn(`Attempted to send message to non-existent class: ${classId}`);
        return;
      }

      const classData = activeClasses.get(classId);
      const user = classData.users.find(u => u.id === socket.id);
      if (!user) {
        console.warn(`User ${socket.id} not found in class ${classId}`);
        return;
      }

      // Generate message object first so we have the ID to link with reports
      const messageId = Date.now() + Math.random();

      const message = {
        id: messageId,
        classId, // Include classId
        senderId: socket.id,
        senderName: user.name,
        senderRole: user.role,
        content,
        type, // 'text' or 'file'
        fileData, // { name, size, type, url } for files
        timestamp: new Date().toISOString()
      };

      // === DEEP LEARNING FILTER CHECK ===
      // Only check text messages, not files, and only if deep-learning mode is active
      if (type === 'text' && classData.filterMode === 'deep-learning') {
        const settings = classData.advancedSettings || {
          blockEnabled: true,
          blockThreshold: 50,
          reportEnabled: true,
          reportThreshold: 30
        };

        // 0. Check against Whitelist first (Priority)
        const lowerContent = content.toLowerCase();
        const isWhitelisted = customWhitelistedWords.some(item => lowerContent.includes(item.word.toLowerCase()));

        if (isWhitelisted) {
          console.log(`[DEBUG] Message whitelisted: "${content}"`);
          // Skip all other filters
        } else {
          // 1. Check against blacklist/basic filter (Fast & Explicit)
          // Check custom blacklist
          const isBlacklisted = customForbiddenWords.some(item => lowerContent.includes(item.word));
          // Check basic filter if enabled (assuming we want to combine logic)
          const isBasicProfane = filter.isProfane(content);

          if (isBlacklisted || isBasicProfane) {

            console.log(`🚫 Blocked by Blacklist/Basic Filter: "${content}"`);

            // Block immediately
            socket.emit('message-blocked', {
              content,
              reason: 'profanity (explicit)',
              confidence: 100,
              classId
            });

            if (classData.teacherId) {
              io.to(classData.teacherId).emit('auto-blocked-message', {
                message: content,
                senderName: user.name,
                confidence: 100,
                category: 'explicit profanity',
                addedWords: [], // Already known
                classId
              });
            }

            // Flag the user
            io.to(classId).emit('user-was-flagged', { userId: socket.id, userName: user.name });

            console.log(`[DEBUG] Message blocked (Blacklist): "${content}" from ${user.name}`);
            return;
          }
        }



        // 2. AI Content Filtering (Deep Learning) (if ready)
        if (deepLearningFilter.isModelReady()) {
          console.log(`[DEBUG] AI Analyzing: "${content}"`);
          const result = await deepLearningFilter.classifyMessage(content);
          console.log(`[DEBUG] AI Result: ${result.tier} (${result.confidence}%)`);

          // Helper to check thresholds
          const shouldBlock = settings.blockEnabled && result.confidence >= settings.blockThreshold;
          const shouldReport = settings.reportEnabled && result.confidence >= settings.reportThreshold;

          if (shouldBlock) {
            // High confidence toxic: Block the message, notify sender
            socket.emit('message-blocked', {
              content,
              reason: result.category,
              confidence: result.confidence,
              classId
            });

            // Auto-add suspicious words to blacklist
            const suspiciousWords = deepLearningFilter.extractSuspiciousWords(content);
            for (const word of suspiciousWords) {
              if (!customForbiddenWords.some(w => w.word === word)) {
                customForbiddenWords.push({
                  word: word,
                  addedAt: new Date().toISOString(),
                  source: 'deep-learning-auto'
                });
              }
            }
            if (suspiciousWords.length > 0) {
              saveCustomForbiddenWords();
              io.emit('forbidden-words-updated', customForbiddenWords);
              console.log(`🧠 Auto-blocked: "${content.substring(0, 30)}..." (${result.confidence}% ${result.category})`);
            }

            // Notify teacher
            if (classData.teacherId) {
              io.to(classData.teacherId).emit('auto-blocked-message', {
                message: content,
                senderName: user.name,
                confidence: result.confidence,
                category: result.category,
                addedWords: suspiciousWords,
                classId
              });
            }

            // Flag the user
            io.to(classId).emit('user-was-flagged', { userId: socket.id, userName: user.name });

            console.log(`[DEBUG] Message blocked (AI High): "${content}" from ${user.name}`);
            return; // Don't broadcast the message
          } else if (shouldReport) {
            // Medium confidence: Send but create a report for teacher
            const suspiciousWords = deepLearningFilter.extractSuspiciousWords(content);
            if (suspiciousWords.length > 0) {
              const report = {
                id: Date.now().toString(),
                word: suspiciousWords[0],
                context: content,
                messageId: messageId, // Link to the message for deletion
                reporterName: 'AI Detection',
                reporterId: 'deep-learning',
                senderName: user.name,
                classId,
                timestamp: new Date().toISOString(),
                aiConfidence: result.confidence,
                aiCategory: result.category
              };
              pendingReports.push(report);
              savePendingReports();

              if (classData.teacherId) {
                io.to(classData.teacherId).emit('new-report', report);
              }
              console.log(`🧠 AI flagged for review: "${content.substring(0, 30)}..." (${result.confidence}% ${result.category})`);
            }
            // Continue to broadcast the message (medium tier doesn't block)
          }
          // Safe tier: Just continue normally
          console.log(`[DEBUG] Message passed AI (Safe/Low): "${content}"`);
        }
      }

      // Message object already created above


      classData.messages.push(message);

      // Broadcast to all participants in the class
      io.to(classId).emit('new-message', message);
      console.log(`[DEBUG] Broadcasted new-message: "${content}" to ${classId}`);

      console.log(`Message from ${user.name} in ${classId}: ${type === 'text' ? content : 'file'}`);
    } catch (error) {
      console.error('❌ Error in send-message handler:', error);
    }
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

  // Get Filter Mode
  socket.on('get-filter-mode', ({ classId }, callback) => {
    if (activeClasses.has(classId)) {
      callback(activeClasses.get(classId).filterMode);
    } else {
      callback('legacy');
    }
  });

  // Get Advanced Settings
  socket.on('get-advanced-settings', ({ classId }, callback) => {
    if (activeClasses.has(classId)) {
      callback(activeClasses.get(classId).advancedSettings);
    } else {
      callback(null);
    }
  });

  // Set Filter Mode
  socket.on('set-filter-mode', ({ classId, mode }, callback) => {
    if (!activeClasses.has(classId)) return callback({ success: false, message: 'Class not found' });

    const classData = activeClasses.get(classId);

    // Only teacher
    if (classData.teacherId !== socket.id) return callback({ success: false, message: 'Unauthorized' });

    classData.filterMode = mode;
    io.to(classId).emit('filter-mode-changed', { classId, mode });

    console.log(`Filter mode for class ${classId} set to ${mode}`);
    callback({ success: true });
  });

  // Update Advanced Settings
  socket.on('update-advanced-settings', ({ classId, settings }) => {
    if (!activeClasses.has(classId)) return;
    const classData = activeClasses.get(classId);

    // Only teacher
    if (classData.teacherId !== socket.id) return;

    classData.advancedSettings = {
      ...classData.advancedSettings,
      ...settings
    };

    console.log(`Advanced settings updated for class ${classId}:`, classData.advancedSettings);
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
      try {
        networkDiscovery.unpublishClassHostname(classId);
      } catch (e) {
        console.error('Failed to unpublish hostname (non-fatal):', e);
      }
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

  // Get Whitelist
  socket.on('get-whitelisted-words', (callback) => {
    if (typeof callback === 'function') {
      callback(customWhitelistedWords);
    }
  });

  // Add Whitelisted Word
  socket.on('add-whitelisted-word', ({ word }, callback) => {
    if (!word) return callback({ success: false });
    const normalized = word.trim().toLowerCase();

    if (customWhitelistedWords.some(w => w.word === normalized)) {
      return callback({ success: false, message: 'Word already exists' });
    }

    customWhitelistedWords.push({
      word: normalized,
      addedAt: new Date().toISOString(),
      source: 'manual'
    });
    saveCustomWhitelistedWords();
    io.emit('whitelisted-words-updated', customWhitelistedWords);

    // Retrain logic could go here, or use triggerBatchTraining if available
    triggerBatchTraining();

    // Check if it exists in Blacklist and remove it
    const blacklistIndex = customForbiddenWords.findIndex(w => w.word === normalized);
    if (blacklistIndex !== -1) {
      customForbiddenWords.splice(blacklistIndex, 1);
      saveCustomForbiddenWords();
      io.emit('forbidden-words-updated', customForbiddenWords); // Notify clients to update blacklist UI
      console.log(`🔄 Auto-removed "${normalized}" from Blacklist because it was added to Whitelist`);
    }

    callback({ success: true });
  });

  // Remove Whitelisted Word
  socket.on('remove-whitelisted-word', ({ word }, callback) => {
    const initialLen = customWhitelistedWords.length;
    customWhitelistedWords = customWhitelistedWords.filter(w => w.word !== word);

    if (customWhitelistedWords.length !== initialLen) {
      saveCustomWhitelistedWords();
      io.emit('whitelisted-words-updated', customWhitelistedWords);
      triggerBatchTraining();
    }

    callback({ success: true });
  });

  // ===== FILTER MODE & AI CHECK =====
  // Set filter mode for a class (Teacher only)
  socket.on('set-filter-mode', ({ classId, mode }, callback) => {
    if (!activeClasses.has(classId)) {
      if (typeof callback === 'function') callback({ success: false, message: 'Class not found' });
      return;
    }

    const classData = activeClasses.get(classId);
    if (classData.teacherId !== socket.id) {
      if (typeof callback === 'function') callback({ success: false, message: 'Only teacher can change filter mode' });
      return;
    }

    classData.filterMode = mode; // 'legacy', 'advanced', or 'deep-learning'

    // Broadcast to all class members
    io.to(classId).emit('filter-mode-changed', { classId, mode });

    console.log(`🔧 Filter mode set to '${mode}' in class ${classId}`);
    if (typeof callback === 'function') callback({ success: true });
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
    if (typeof callback === 'function') callback(result);
  });

  // ===== DEEP LEARNING FILTER EVENTS =====
  // Load the deep learning model
  socket.on('load-deep-learning-model', async (data, callback) => {
    // Handle (callback) or (data, callback) patterns
    if (typeof data === 'function') {
      callback = data;
      data = {};
    }

    if (deepLearningFilter.isModelReady()) {
      if (typeof callback === 'function') callback({ success: true, status: 'ready' });
      return;
    }

    if (deepLearningFilter.isModelReady()) {
      if (typeof callback === 'function') callback({ success: true, status: 'ready', logs: ['Model already ready via check'] });
      return;
    }

    // REMOVED isModelLoading check - let loadModel handle downstream waiting
    // if (deepLearningFilter.isModelLoading()) { ... }

    // Start loading with progress updates
    const result = await deepLearningFilter.loadModel((progress) => {
      socket.emit('deep-learning-progress', progress);
    });

    if (typeof callback === 'function') {
      callback({
        success: result.success,
        status: result.success ? 'ready' : 'error',
        logs: result.logs,
        error: result.error
      });
    }
  });

  // Check model status
  socket.on('get-deep-learning-status', (callback) => {
    if (typeof callback !== 'function') return;
    callback({
      ready: deepLearningFilter.isModelReady(),
      loading: deepLearningFilter.isModelLoading(),
      progress: deepLearningFilter.getLoadProgress()
    });
  });

  // Check message with deep learning (for deep-learning mode)
  socket.on('check-message-deep-ai', async ({ message, classId }, callback) => {
    if (!deepLearningFilter.isModelReady()) {
      if (typeof callback === 'function') callback({ isProfane: false, tier: 'safe', message: 'Model not loaded' });
      return;
    }

    const result = await deepLearningFilter.classifyMessage(message);

    // Handle tiered response
    if (result.tier === 'high') {
      // High confidence toxic: Auto-block and extract words
      const suspiciousWords = deepLearningFilter.extractSuspiciousWords(message);

      // Auto-add words to blacklist
      for (const word of suspiciousWords) {
        if (!customForbiddenWords.some(w => w.word === word)) {
          customForbiddenWords.push({
            word: word,
            addedAt: new Date().toISOString(),
            source: 'deep-learning-auto'
          });
        }
      }

      if (suspiciousWords.length > 0) {
        saveCustomForbiddenWords();
        io.emit('forbidden-words-updated', customForbiddenWords);
        console.log(`🧠 Auto-added words from deep learning: ${suspiciousWords.join(', ')}`);
      }

      // Notify teacher
      if (classId && activeClasses.has(classId)) {
        const classData = activeClasses.get(classId);
        if (classData.teacherId) {
          io.to(classData.teacherId).emit('auto-blocked-message', {
            message,
            confidence: result.confidence,
            category: result.category,
            addedWords: suspiciousWords,
            classId
          });
        }
      }
    } else if (result.tier === 'medium') {
      // Medium confidence: Create report for teacher
      if (classId) {
        const user = getSocketUser(socket.id, classId);
        const suspiciousWords = deepLearningFilter.extractSuspiciousWords(message);

        // Create a report for the first suspicious word
        if (suspiciousWords.length > 0) {
          const report = {
            id: Date.now().toString(),
            word: suspiciousWords[0],
            context: message,
            reporterName: user?.name || 'AI Detection',
            reporterId: 'deep-learning',
            classId,
            timestamp: new Date().toISOString(),
            aiConfidence: result.confidence,
            aiCategory: result.category
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

          console.log(`🧠 AI report created for: ${suspiciousWords[0]} (${result.confidence}% ${result.category})`);
        }
      }
    }

    if (typeof callback === 'function') callback(result);
  });

  // Helper function to get user from socket
  function getSocketUser(socketId, classId) {
    if (!activeClasses.has(classId)) return null;
    const classData = activeClasses.get(classId);
    return classData.users.find(u => u.id === socketId);
  }

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
    if (typeof callback === 'function') callback({ success: true });
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

    if (typeof callback === 'function') callback({ success: true });
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

    // Auto-add to Whitelist (Good List) for future training
    const exists = customWhitelistedWords.some(w => w.word === report.word.toLowerCase());
    if (!exists) {
      customWhitelistedWords.push({
        word: report.word.toLowerCase(),
        addedAt: new Date().toISOString(),
        source: 'rejected-report'
      });
      saveCustomWhitelistedWords();
      io.emit('whitelisted-words-updated', customWhitelistedWords);
      console.log(`🕊️ Auto-added safe word: '${report.word}' to Good List`);

      // Trigger Batch Training
      triggerBatchTraining();
    }

    if (typeof callback === 'function') callback({ success: true });
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

  // STARTUP SETTINGS HANDLERS
  socket.on('get-startup-status', (callback) => {
    if (electronApp) {
      const settings = electronApp.getLoginItemSettings();
      callback({ success: true, openAtLogin: settings.openAtLogin });
    } else {
      callback({ success: false, message: 'Not supported in browser mode' });
    }
  });

  socket.on('set-startup-status', ({ openAtLogin }, callback) => {
    if (electronApp) {
      if (typeof openAtLogin === 'boolean') {
        electronApp.setLoginItemSettings({
          openAtLogin: openAtLogin,
          openAsHidden: false // Optional: start hidden?
        });
        console.log(`Startup setting changed: ${openAtLogin}`);
        callback({ success: true });
      } else {
        callback({ success: false, message: 'Invalid value' });
      }
    } else {
      callback({ success: false, message: 'Not supported in browser mode' });
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

