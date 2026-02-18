const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class ConfigManager {
    constructor() {
        this.userDataPath = app.getPath('userData');
        this.configPath = path.join(this.userDataPath, 'config.json');
        this.config = this.loadConfig();
    }

    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf8');
                return { ...this.getDefaults(), ...JSON.parse(data) };
            }
        } catch (error) {
            console.error('Error loading config:', error);
        }
        return this.getDefaults();
    }

    getDefaults() {
        return {
            enableLogging: true, // Default: On
            autoExportLogs: true // Default: On
        };
    }

    saveConfig() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
        } catch (error) {
            console.error('Error saving config:', error);
        }
    }

    get(key) {
        return this.config[key];
    }

    set(key, value) {
        this.config[key] = value;
        this.saveConfig();
        console.log(`[Config] Setting updated: ${key} = ${value}`);
    }

    getAll() {
        return this.config;
    }
}

// Singleton instance
module.exports = new ConfigManager();
