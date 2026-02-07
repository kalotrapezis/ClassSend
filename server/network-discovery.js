const Bonjour = require('bonjour-service');
const os = require('os');

class NetworkDiscovery {
    constructor() {
        this.bonjour = null;
        this.mainService = null;
        this.classServices = new Map(); // classId -> service
        this.localIP = null;
        this.port = null;
        this.getClassesCallback = null;
    }

    // Fallback method to get local IP using os.networkInterfaces()
    getLocalIPFallback() {
        const interfaces = os.networkInterfaces();
        // Virtual adapter keywords to skip
        const virtualKeywords = ['virtual', 'vmware', 'vbox', 'hyperv', 'vethernet', 'wsl', 'loopback', 'docker', 'radmin', 'vpn', 'hamachi'];

        let bestIP = null;
        let bestPriority = -100;

        console.log('--- Network Interface Discovery ---');

        for (const name of Object.keys(interfaces)) {
            const lowerName = name.toLowerCase();
            let priority = 0;

            // 1. Heuristics based on name
            if (virtualKeywords.some(keyword => lowerName.includes(keyword))) {
                priority -= 50; // Heavy penalty for virtual adapters
            }
            if (lowerName.includes('wi-fi') || lowerName.includes('wireless')) priority += 20;
            else if (lowerName.includes('ethernet')) priority += 10;

            for (const iface of interfaces[name]) {
                // Skip internal (loopback) and non-IPv4 addresses
                if (iface.family === 'IPv4' && !iface.internal) {
                    let currentPriority = priority;

                    // 2. Penalize specific subnets (VirtualBox default is 192.168.56.x)
                    if (iface.address.startsWith('192.168.56.')) currentPriority -= 100;
                    if (iface.address.startsWith('169.254.')) currentPriority -= 1000; // Link-local (useless)

                    console.log(`Found Interface: ${name} (${iface.address}) - Priority: ${currentPriority}`);

                    if (currentPriority > bestPriority) {
                        bestPriority = currentPriority;
                        bestIP = iface.address;
                    }
                }
            }
        }

        console.log(`Selected Best IP: ${bestIP || 'localhost'}`);
        console.log('-----------------------------------');

        return bestIP || 'localhost';
    }

    async initialize(port, getClassesCallback) {
        this.port = port;
        this.getClassesCallback = getClassesCallback;

        // Get local IP address using fallback method (more reliable)
        this.localIP = this.getLocalIPFallback();
        console.log(`Local IP: ${this.localIP}`);

        // Initialize Bonjour
        this.bonjour = new Bonjour.default();

        // Publish the main service
        this.publishMainService();

        return this.localIP;
    }

    publishMainService() {
        if (this.mainService) {
            this.mainService.stop();
        }

        const classes = this.getClassesCallback ? this.getClassesCallback() : [];

        this.mainService = this.bonjour.publish({
            name: 'ClassSend Server',
            type: 'classsend',
            port: this.port,
            txt: {
                version: '4.0.0',
                classes: JSON.stringify(classes),
                ip: this.localIP
            }
        });

        console.log(`Broadcasting main ClassSend service on ${this.localIP}:${this.port}`);
    }

    // Publish a hostname for a specific class (e.g., c-math.local)
    publishClassHostname(classId, hostname) {
        try {
            // Sanitize hostname to ensure it ends with .local
            if (!hostname.endsWith('.local')) {
                hostname += '.local';
            }

            // Stop existing service for this class if any
            if (this.classServices.has(classId)) {
                this.classServices.get(classId).stop();
            }

            console.log(`Publishing hostname ${hostname} for class ${classId}`);

            // Publish a service that advertises this hostname
            // We use a distinct type or name to avoid confusion, but the key is the 'host' field
            const service = this.bonjour.publish({
                name: `ClassSend-${classId}`,
                type: 'http', // Standard HTTP type
                port: this.port,
                host: hostname, // This triggers the A-record for c-math.local
                txt: {
                    classId: classId
                }
            });

            this.classServices.set(classId, service);
        } catch (err) {
            console.error(`Failed to publish hostname for class ${classId}:`, err);
        }
    }

    unpublishClassHostname(classId) {
        try {
            if (this.classServices.has(classId)) {
                console.log(`Unpublishing hostname for class ${classId}`);
                this.classServices.get(classId).stop();
                this.classServices.delete(classId);
            }
        } catch (err) {
            console.error(`Failed to unpublish hostname for class ${classId}:`, err);
        }
    }

    // Update service when classes change
    updateClasses() {
        if (this.mainService) {
            this.publishMainService();
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
        if (this.mainService) {
            this.mainService.stop();
        }

        for (const service of this.classServices.values()) {
            service.stop();
        }
        this.classServices.clear();

        if (this.bonjour) {
            this.bonjour.destroy();
        }
        console.log('Stopped broadcasting services');
    }

    getLocalIP() {
        return this.localIP;
    }
}

module.exports = NetworkDiscovery;
