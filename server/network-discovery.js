const Bonjour = require('bonjour-service');
const os = require('os');

class NetworkDiscovery {
    constructor() {
        this.bonjour = null;
        this.service = null;
        this.localIP = null;
        this.port = null;
        this.getClassesCallback = null;
    }

    // Fallback method to get local IP using os.networkInterfaces()
    getLocalIPFallback() {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                // Skip internal (loopback) and non-IPv4 addresses
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
        return 'localhost';
    }

    async initialize(port, getClassesCallback) {
        this.port = port;
        this.getClassesCallback = getClassesCallback;

        // Get local IP address using fallback method (more reliable)
        this.localIP = this.getLocalIPFallback();
        console.log(`Local IP: ${this.localIP}`);

        // Initialize Bonjour
        this.bonjour = new Bonjour.default();

        // Publish the service
        this.publishService();

        return this.localIP;
    }

    publishService() {
        if (this.service) {
            this.service.stop();
        }

        const classes = this.getClassesCallback ? this.getClassesCallback() : [];

        this.service = this.bonjour.publish({
            name: 'ClassSend Server',
            type: 'classsend',
            port: this.port,
            txt: {
                version: '3.6.0',
                classes: JSON.stringify(classes),
                ip: this.localIP
            }
        });

        console.log(`Broadcasting ClassSend service on ${this.localIP}:${this.port}`);
    }

    // Update service when classes change
    updateClasses() {
        if (this.service) {
            this.publishService();
        }
    }

    // Find other ClassSend servers on the network
    findServers(onServerFound, onServerLost) {
        const browser = this.bonjour.find({ type: 'classsend' });

        browser.on('up', (service) => {
            // Don't report ourselves
            if (service.port === this.port && service.host === this.localIP) {
                return;
            }

            const serverInfo = {
                name: service.name,
                ip: service.referer?.address || service.host,
                port: service.port,
                classes: [],
                version: service.txt?.version || 'unknown'
            };

            // Parse classes from TXT record
            try {
                if (service.txt?.classes) {
                    serverInfo.classes = JSON.parse(service.txt.classes);
                }
            } catch (e) {
                console.error('Failed to parse classes:', e);
            }

            if (onServerFound) {
                onServerFound(serverInfo);
            }
        });

        browser.on('down', (service) => {
            const serverInfo = {
                name: service.name,
                ip: service.referer?.address || service.host,
                port: service.port
            };

            if (onServerLost) {
                onServerLost(serverInfo);
            }
        });

        return browser;
    }

    stop() {
        if (this.service) {
            this.service.stop();
            console.log('Stopped broadcasting service');
        }
        if (this.bonjour) {
            this.bonjour.destroy();
        }
    }

    getLocalIP() {
        return this.localIP;
    }
}

module.exports = NetworkDiscovery;
