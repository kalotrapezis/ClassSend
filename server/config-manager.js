const fs = require('fs');
const path = require('path');
const installConfig = require('./install-config');
let app = null;
try {
    app = require('electron').app;
} catch (e) {
    // Not electron
}

class ConfigManager {
    constructor() {
        if (app) {
            this.userDataPath = app.getPath('userData');
        } else {
            this.userDataPath = path.join(__dirname, '..', 'data');
            if (!fs.existsSync(this.userDataPath)) {
                fs.mkdirSync(this.userDataPath, { recursive: true });
            }
        }
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
            startupConfigured: false,
            autoRestartOnUnresponsive: true,
            persistInternetBlock: false,
            enableLogging:    installConfig.get('enable_logging',    false),
            autoExportLogs:   installConfig.get('auto_export_logs',  false),
            maxFileSizeMb:    installConfig.get('max_file_size_mb',  1536),
            socketBufferSizeMb: installConfig.get('socket_buffer_size_mb', 2048),
            screenCaptureQuality:      installConfig.get('screen_capture_quality',       'low'),
            screenCaptureHiresQuality: installConfig.get('screen_capture_hires_quality', '1080p'),
            screenCaptureSpeedMbit:    installConfig.get('screen_capture_speed_mbit',    16),
            advancedSettings: {
                blockEnabled:    installConfig.get('block_enabled',    true),
                blockThreshold:  installConfig.get('block_threshold',  90),
                reportEnabled:   installConfig.get('report_enabled',   true),
                reportThreshold: installConfig.get('report_threshold', 20)
            }
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
