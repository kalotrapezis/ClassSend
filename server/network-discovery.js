const Bonjour = require('bonjour-service');
const os = require('os');
const EventEmitter = require('events');

class NetworkDiscovery extends EventEmitter {
    constructor() {
        super();
        this.bonjour = null;
        this.mainService = null;
        this.perNicServices = []; // mDNS: one service per real NIC so each subnet hears us
        this.classServices = new Map(); // classId -> service
        this.localIP = null;
        this.localIPs = [];      // all real IPv4s, [{iface, ip, mac}, ...]
        this.port = null;
        this.getClassesCallback = null;
        this.monitoringInterval = null;
    }

    // Enumerate every non-virtual IPv4 NIC. Returns [{iface, ip, mac}].
    // This is the multi-NIC fix: a teacher PC with both Wi-Fi and Ethernet
    // (or two ethernet adapters on different subnets) needs to advertise on
    // each of them so students from either subnet can reach the server.
    // Mirrors the ClassSend2 v0.0.5 multi-NIC fix.
    getAllLocalIPs() {
        const interfaces = os.networkInterfaces();
        const virtualKeywords = ['virtual', 'vmware', 'vbox', 'hyperv', 'vethernet', 'wsl', 'loopback', 'docker', 'radmin', 'vpn', 'hamachi'];
        const out = [];
        for (const name of Object.keys(interfaces)) {
            const lower = name.toLowerCase();
            if (virtualKeywords.some(k => lower.includes(k))) continue;
            for (const iface of interfaces[name]) {
                if (iface.family !== 'IPv4' || iface.internal) continue;
                if (iface.address.startsWith('169.254.')) continue;        // link-local
                if (iface.address.startsWith('192.168.56.')) continue;     // VirtualBox default
                out.push({ iface: name, ip: iface.address, mac: iface.mac || null });
            }
        }
        return out;
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

        // Multi-NIC: enumerate every real IPv4 adapter. The "best" one is kept
        // for legacy callers (single-IP UI), but the full list drives mDNS and
        // the HTTP discovery endpoints so students on any subnet can reach us.
        this.localIPs = this.getAllLocalIPs();
        this.localIP = this.getLocalIPFallback();
        console.log(`Local IPs (${this.localIPs.length}):`, this.localIPs.map(n => `${n.iface}=${n.ip}`).join(', '));
        console.log(`Primary IP: ${this.localIP}`);

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

    // Helper to safely encode classes to Base64
    encodeClasses(classes) {
        try {
            const jsonString = JSON.stringify(classes);
            return Buffer.from(jsonString).toString('base64');
        } catch (e) {
            console.error('Failed to encode classes:', e);
            return '[]';
        }
    }

    // Helper to safely decode classes from Base64 or JSON
    decodeClasses(txtClasses) {
        if (!txtClasses) return [];

        try {
            // Try standard JSON first (backward compatibility)
            if (txtClasses.trim().startsWith('[') || txtClasses.trim().startsWith('{')) {
                return JSON.parse(txtClasses);
            }

            // Try Base64 decode
            const decoded = Buffer.from(txtClasses, 'base64').toString('utf-8');
            // Validate if it looks like JSON
            if (decoded.trim().startsWith('[') || decoded.trim().startsWith('{')) {
                return JSON.parse(decoded);
            }

            // If not JSON after decode, maybe it wasn't valid?
            return [];
        } catch (e) {
            console.error('Failed to decode classes from TXT:', e);
            return [];
        }
    }

    publishMainService() {
        if (this.mainService) {
            this.mainService.stop();
            this.mainService = null;
        }
        // Stop any per-NIC services from a previous publish (NIC list may have changed)
        for (const s of this.perNicServices) {
            try { s.stop(); } catch (e) {}
        }
        this.perNicServices = [];

        const classes = this.getClassesCallback ? this.getClassesCallback() : [];
        const classesEncoded = this.encodeClasses(classes);

        // Refresh NIC list each publish — handles laptops moving between
        // networks mid-session without needing a restart.
        this.localIPs = this.getAllLocalIPs();
        const ipList = this.localIPs.map(n => n.ip);
        const addressesField = ipList.join(',');

        // 1) Main service (single record, includes addresses[] in TXT for clients
        //    that read TXT). Backwards compat: `ip` still carries the primary.
        this.mainService = this.bonjour.publish({
            name: 'ClassSend Server',
            type: 'classsend',
            port: this.port,
            txt: {
                version: '4.0.0',
                classes: classesEncoded,
                ip: this.localIP,
                addresses: addressesField
            }
        });
        console.log(`Broadcasting main ClassSend service on ${this.localIP}:${this.port} (addresses: ${addressesField || '<none>'})`);

        // 2) One service per NIC so each subnet receives a discovery packet
        //    advertising the IP it can actually route to. bonjour-service binds
        //    to all interfaces by default, but the *advertised* address still
        //    needs to be subnet-correct or students dial-back to the wrong IP.
        if (this.localIPs.length > 1) {
            for (const nic of this.localIPs) {
                try {
                    const svc = this.bonjour.publish({
                        name: `ClassSend Server (${nic.iface})`,
                        type: 'classsend',
                        port: this.port,
                        // Force the A-record for this service to point at this NIC's IP
                        host: nic.ip,
                        txt: {
                            version: '4.0.0',
                            classes: classesEncoded,
                            ip: nic.ip,
                            addresses: addressesField,
                            iface: nic.iface
                        }
                    });
                    this.perNicServices.push(svc);
                    console.log(`Broadcasting per-NIC service: ${nic.iface} -> ${nic.ip}`);
                } catch (err) {
                    console.warn(`Failed to publish per-NIC service for ${nic.iface}:`, err.message);
                }
            }
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
                addresses: [],
                version: service.txt?.version || 'unknown'
            };

            // Parse classes from TXT record
            try {
                if (service.txt?.classes) {
                    serverInfo.classes = this.decodeClasses(service.txt.classes);
                }
            } catch (e) {
                console.error('Failed to parse classes:', e);
            }

            // Multi-NIC: TXT carries the comma-separated address list. If
            // missing (older server), fall back to the single advertised IP.
            try {
                if (service.txt?.addresses) {
                    serverInfo.addresses = String(service.txt.addresses)
                        .split(',').map(s => s.trim()).filter(Boolean);
                } else if (serverInfo.ip) {
                    serverInfo.addresses = [serverInfo.ip];
                }
            } catch (e) {
                serverInfo.addresses = serverInfo.ip ? [serverInfo.ip] : [];
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
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        if (this.mainService) {
            this.mainService.stop();
        }

        for (const s of this.perNicServices) {
            try { s.stop(); } catch (e) {}
        }
        this.perNicServices = [];

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

    // All real IPv4s the server can be reached on. Mirrors ClassSend2's
    // LocalAddrs() — students should try each in order on dial-back.
    getLocalIPs() {
        return this.localIPs.map(n => n.ip);
    }

    startNetworkMonitoring(intervalMs = 5000) {
        if (this.monitoringInterval) return;

        console.log('Starting network monitoring...');
        this.monitoringInterval = setInterval(() => {
            const currentIP = this.getLocalIPFallback();
            if (currentIP !== this.localIP) {
                console.log(`Network Change Detected! Old: ${this.localIP}, New: ${currentIP}`);
                const oldIP = this.localIP;
                this.localIP = currentIP;

                // Re-publish services with new IP
                if (this.bonjour) {
                    this.publishMainService();
                    // Re-publish class hostnames if any
                    for (const [classId, service] of this.classServices.entries()) {
                        // We don't have the hostname here easily, but publishClassHostname handles it
                        // For now, re-publishing main is most important for discovery
                    }
                }

                this.emit('ip-changed', { newIP: currentIP, oldIP: oldIP });
            }
        }, intervalMs);
    }
}

module.exports = NetworkDiscovery;
