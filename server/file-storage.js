const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class FileStorage {
    constructor() {
        // Use USER_DATA_PATH if set (Electron), otherwise fallback to __dirname (Node/Dev)
        const baseDir = process.env.USER_DATA_PATH || __dirname;
        this.uploadDir = path.join(baseDir, 'uploads');
        this.files = new Map(); // fileId → { name, size, type, path, classId, uploadedBy, timestamp }

        // Create uploads directory
        if (!fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, { recursive: true });
        }
    }

    generateFileId() {
        return crypto.randomBytes(16).toString('hex');
    }

    saveFile(fileId, metadata) {
        this.files.set(fileId, metadata);
    }

    getFile(fileId) {
        return this.files.get(fileId);
    }

    deleteFile(fileId) {
        const file = this.files.get(fileId);
        if (file && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
        this.files.delete(fileId);
    }

    // Clean up old files (optional - can be called periodically)
    cleanupOldFiles(maxAgeMs = 24 * 60 * 60 * 1000) {
        const now = Date.now();
        for (const [fileId, file] of this.files.entries()) {
            if (now - file.timestamp > maxAgeMs) {
                this.deleteFile(fileId);
            }
        }
    }

    // Get all files for a class
    getClassFiles(classId) {
        const classFiles = [];
        for (const [fileId, file] of this.files.entries()) {
            if (file.classId === classId) {
                classFiles.push({ id: fileId, ...file });
            }
        }
        return classFiles;
    }

    // Delete all files for a class
    deleteClassFiles(classId) {
        const fileIds = [];
        for (const [fileId, file] of this.files.entries()) {
            if (file.classId === classId) {
                fileIds.push(fileId);
            }
        }
        fileIds.forEach(id => this.deleteFile(id));
    }
}

module.exports = FileStorage;
