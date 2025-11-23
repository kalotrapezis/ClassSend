const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for local network dev
    methods: ["GET", "POST"]
  }
});

const activeClasses = new Map(); // classId -> { teacherId, students: [] }

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Broadcast active classes to all clients
  function broadcastActiveClasses() {
    const classesList = Array.from(activeClasses.entries()).map(([id, data]) => ({
      id,
      teacherName: data.teacherName
    }));
    io.emit('active-classes', classesList);
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
      users: [{ id: socket.id, name: userName, role: 'teacher' }]
    });
    socket.join(classId);
    console.log(`Class created: ${classId} by ${userName} (${socket.id})`);
    broadcastActiveClasses();
    callback({ success: true });
  });

  socket.on('join-class', ({ classId, userName }, callback) => {
    if (!activeClasses.has(classId)) {
      return callback({ success: false, message: 'Class not found' });
    }
    const classData = activeClasses.get(classId);

    // Check if name is already taken
    const nameTaken = classData.users.some(user => user.name.toLowerCase() === userName.toLowerCase());
    if (nameTaken) {
      return callback({ success: false, message: 'Name already taken in this class' });
    }

    const studentData = { id: socket.id, name: userName, role: 'student' };
    classData.students.push(studentData);
    classData.users.push(studentData);
    socket.join(classId);

    // Notify all participants that a new user joined
    io.to(classId).emit('user-joined', {
      user: studentData,
      users: classData.users,
      classId // Include classId so client knows which class to update
    });

    console.log(`Student ${userName} (${socket.id}) joined class ${classId}`);

    // Send message history and user list to the new student
    callback({
      success: true,
      messages: classData.messages,
      users: classData.users
    });
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

  // Delete class (Teacher only)
  socket.on('delete-class', ({ classId }, callback) => {
    if (!activeClasses.has(classId)) {
      return callback({ success: false, message: 'Class not found' });
    }

    const classData = activeClasses.get(classId);
    if (classData.teacherId !== socket.id) {
      return callback({ success: false, message: 'Only the teacher can delete the class' });
    }

    // Notify all students that the class has ended
    io.to(classId).emit('class-ended', { message: 'Teacher has deleted the class', classId });

    activeClasses.delete(classId);
    broadcastActiveClasses();
    console.log(`Class ${classId} deleted by teacher ${classData.teacherName} (${socket.id})`);

    // Disconnect all sockets in the room from the room? 
    // Actually, clients will handle the 'class-ended' event and leave/reset.
    // But good practice to clear the room.
    io.in(classId).socketsLeave(classId);

    callback({ success: true });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    // Check if user was a teacher and remove their class
    for (const [classId, classData] of activeClasses.entries()) {
      if (classData.teacherId === socket.id) {
        // Notify all students that the class has ended
        io.to(classId).emit('class-ended', { message: 'Teacher has disconnected', classId });
        activeClasses.delete(classId);
        broadcastActiveClasses();
        console.log(`Class ${classId} removed (teacher disconnected)`);
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
        // Don't return here, user might be in multiple classes (future proofing)
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
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

module.exports = { server, stopServer };
