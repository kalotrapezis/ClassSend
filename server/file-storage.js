const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class FileStorage {
    constructor() {
        // Store in the installation root directory as "media"
        const baseDir = process.cwd();
        this.uploadDir = path.join(baseDir, 'media');
        this.metadataFile = path.join(this.uploadDir, 'files.json');
        this.files = new Map(); // fileId → { name, size, type, path, classId, uploadedBy, timestamp }

        // Create uploads directory
        if (!fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, { recursive: true });
        }

        this.loadMetadata();
    }

    loadMetadata() {
        try {
            if (fs.existsSync(this.metadataFile)) {
                const data = fs.readFileSync(this.metadataFile, 'utf8');
                const fileList = JSON.parse(data);
                fileList.forEach(file => {
                    // Verify file existence on disk before adding to memory
                    if (fs.existsSync(file.path)) {
                        this.files.set(file.id, file);
                    }
                });
                console.log(`[MediaLibrary] Loaded ${this.files.size} files from persistence.`);
            }
        } catch (err) {
            console.error('[MediaLibrary] Failed to load metadata:', err);
        }
    }

    saveMetadata() {
        try {
            const fileList = Array.from(this.files.values());
            fs.writeFileSync(this.metadataFile, JSON.stringify(fileList, null, 2));
        } catch (err) {
            console.error('[MediaLibrary] Failed to save metadata:', err);
        }
    }

    generateFileId() {
        return crypto.randomBytes(16).toString('hex');
    }

    saveFile(fileId, metadata) {
        this.files.set(fileId, metadata);
        this.saveMetadata();
    }

    getFile(fileId) {
        return this.files.get(fileId);
    }

    deleteFile(fileId) {
        const file = this.files.get(fileId);
        if (file && fs.existsSync(file.path)) {
            try {
                fs.unlinkSync(file.path);
            } catch (err) {
                console.error(`Failed to delete file ${file.path}:`, err);
            }
        }
        this.files.delete(fileId);
        this.saveMetadata();
    }

    // Clean up old files (optional - can be called periodically)
    cleanupOldFiles(maxAgeMs = 24 * 60 * 60 * 1000) {
        const now = Date.now();
        let changed = false;
        for (const [fileId, file] of this.files.entries()) {
            if (now - file.timestamp > maxAgeMs) {
                this.deleteFile(fileId); // deleteFile handles saveMetadata, but efficient batching would be better
                changed = true;
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
        // deleteFile saves metadata each time, essentially correct but could be optimized.
    }

    // Clear all data (Admin feature)
    clearAllFiles() {
        console.log("⚠️ Deleting all files from MediaLibrary...");
        // Delete all physical files
        for (const [fileId, file] of this.files.entries()) {
            if (file && fs.existsSync(file.path)) {
                try {
                    fs.unlinkSync(file.path);
                } catch (err) {
                    console.error(`Failed to delete file ${file.path}:`, err);
                }
            }
        }
        this.files.clear();
        this.saveMetadata();
        console.log("✅ MediaLibrary cleared.");
    }
}

module.exports = FileStorage;
