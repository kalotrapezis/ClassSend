/**
 * install-config.js
 * Reads classsend.conf from the installation directory and exposes settings
 * as a simple get(key, default) API.
 *
 * Path resolution (highest priority first):
 *   1. process.env.INSTALL_CONFIG_PATH  (set by electron-main.js)
 *   2. <project-root>/classsend.conf    (dev fallback, one level above server/)
 */

const fs = require('fs');
const path = require('path');

function resolveConfigPath() {
    if (process.env.INSTALL_CONFIG_PATH) {
        return process.env.INSTALL_CONFIG_PATH;
    }
    // Dev / standalone-node fallback: project root
    return path.join(__dirname, '..', 'classsend.conf');
}

function parseIni(content) {
    const result = {};
    for (const raw of content.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#') || line.startsWith(';')) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        const val = line.slice(eq + 1).trim();
        if (key) result[key] = val;
    }
    return result;
}

function coerce(val) {
    if (val === 'true')  return true;
    if (val === 'false') return false;
    const n = Number(val);
    if (val !== '' && !isNaN(n)) return n;
    return val;
}

class InstallConfig {
    constructor() {
        this._data = {};
        this._path = resolveConfigPath();
        this._load();
    }

    _load() {
        try {
            if (fs.existsSync(this._path)) {
                const raw = parseIni(fs.readFileSync(this._path, 'utf8'));
                for (const [k, v] of Object.entries(raw)) {
                    this._data[k] = coerce(v);
                }
                console.log(`[InstallConfig] Loaded from: ${this._path}`);
            } else {
                console.log(`[InstallConfig] No config file at ${this._path} – using built-in defaults`);
            }
        } catch (err) {
            console.error('[InstallConfig] Failed to read config file:', err.message);
        }
    }

    /** Return the value for key, or defaultValue if not set in the conf file. */
    get(key, defaultValue) {
        return Object.prototype.hasOwnProperty.call(this._data, key)
            ? this._data[key]
            : defaultValue;
    }

    /** Full path to the loaded config file (useful for log messages). */
    get path() {
        return this._path;
    }
}

module.exports = new InstallConfig();
