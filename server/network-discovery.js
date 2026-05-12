const Bonjour = require('bonjour-service');
const os = require('os');
const EventEmitter = require('events');

// Convert an IPv4 netmask string ("255.255.255.0") to prefix length (24).
function _maskToPrefix(mask) {
    if (!mask) return 24;
    const parts = mask.split('.').map(n => parseInt(n, 10));
    if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return 24;
    let total = 0;
    for (const p of parts) {
        let n = p;
        while (n) { total += n & 1; n >>>= 1; }
    }
    return total;
}

function _ipv4ToInt(ip) {
    const parts = ip.split('.').map(n => parseInt(n, 10));
    if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) return 0;
    return (((parts[0] << 24) >>> 0) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

// True if `ip` is on the subnet of `nic` (cidr derived from nic.netmask).
function _ipInNICSubnet(ip, nic) {
    if (!ip || !nic) return false;
    const nicIp = nic.ip || nic.address;
    if (!nicIp || !nic.netmask) return false;
    const a = _ipv4ToInt(ip);
    const b = _ipv4ToInt(nicIp);
    const m = _ipv4ToInt(nic.netmask);
    return (a & m) === (b & m);
}

class NetworkDiscovery extends EventEmitter {
    constructor() {
        super();
        this.bonjour = null;
        this.mainService = null;
        this.classServices = new Map(); // classId -> service
        this.localIP = null;           // primary (highest priority) IP — kept for back-compat
        this.localIPs = [];            // [{ ip, mac, netmask, name, priority }] — all real NICs, sorted desc by priority
        this.port = null;
        this.getClassesCallback = null;
        this.monitoringInterval = null;
    }

    // Enumerate every usable IPv4 NIC, scored by the same heuristic as before.
    // Returns array sorted by priority descending. Primary IP is [0].
    getAllLocalNICs() {
        const interfaces = os.networkInterfaces();
        const virtualKeywords = ['virtual', 'vmware', 'vbox', 'hyperv', 'vethernet', 'wsl', 'loopback', 'docker', 'radmin', 'vpn', 'hamachi'];
        const found = [];

        for (const name of Object.keys(interfaces)) {
            const lowerName = name.toLowerCase();
            let priority = 0;
            if (virtualKeywords.some(k => lowerName.includes(k))) priority -= 50;
            if (lowerName.includes('wi-fi') || lowerName.includes('wireless')) priority += 20;
            else if (lowerName.includes('ethernet')) priority += 10;

            for (const iface of interfaces[name]) {
                if (iface.family !== 'IPv4' || iface.internal) continue;
                let p = priority;
                if (iface.address.startsWith('192.168.56.')) p -= 100;
                if (iface.address.startsWith('169.254.')) p -= 1000;
                // Drop hopeless ones entirely
                if (p <= -500) continue;
                found.push({
                    ip: iface.address,
                    mac: iface.mac,
                    netmask: iface.netmask,
                    name,
                    priority: p
                });
            }
        }
        found.sort((a, b) => b.priority - a.priority);
        return found;
    }

    // Back-compat: still returns the single best IP string.
    getLocalIPFallback() {
        const nics = this.getAllLocalNICs();
        console.log('--- Network Interface Discovery ---');
        for (const n of nics) {
            console.log(`Found Interface: ${n.name} (${n.ip}/${n.netmask}) - Priority: ${n.priority}`);
        }
        const bestIP = nics.length > 0 ? nics[0].ip : null;
        console.log(`Selected Best IP: ${bestIP || 'localhost'} (of ${nics.length} usable NIC${nics.length === 1 ? '' : 's'})`);
        console.log('-----------------------------------');
        return bestIP || 'localhost';
    }

    // Given a remote (student) IP, pick the local NIC IP whose subnet contains it.
    // Falls back to the primary IP. This is the multi-NIC advertise-fix in one helper.
    pickAdvertiseAddrFor(remoteIP) {
        if (!remoteIP) return this.localIP || 'localhost';
        // Strip IPv6-mapped prefix and zone — node sometimes hands back "::ffff:192.168.1.10"
        const clean = String(remoteIP).replace(/^::ffff:/, '').split('%')[0];
        // Local connections (loopback / IPv6 ::1) — just hand back localhost
        if (clean === '127.0.0.1' || clean === '::1' || clean === 'localhost') {
            return this.localIP || '127.0.0.1';
        }
        for (const nic of this.localIPs) {
            if (_ipInNICSubnet(clean, nic)) return nic.ip;
        }
        return this.localIP || 'localhost';
    }

    // Returns all advertise-able IPv4 addresses (just the IP strings).
    getAllLocalIPs() {
        return this.localIPs.map(n => n.ip);
    }

    async initialize(port, getClassesCallback) {
        this.port = port;
        this.getClassesCallback = getClassesCallback;

        // Enumerate every NIC, then keep the primary as `localIP` for back-compat.
        this.localIPs = this.getAllLocalNICs();
        this.localIP = this.getLocalIPFallback(); // logs + returns primary
        if (this.localIPs.length > 1) {
            console.log(`Multi-NIC teacher: advertising ${this.localIPs.length} IPs: ${this.getAllLocalIPs().join(', ')}`);
        }

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
        }

        const classes = this.getClassesCallback ? this.getClassesCallback() : [];
        const classesEncoded = this.encodeClasses(classes);

        // Multi-NIC: advertise every usable IP via `ips` (CSV). `ip` stays as the
        // primary for old clients that only know one field.
        const allIPs = this.getAllLocalIPs();
        this.mainService = this.bonjour.publish({
            name: 'ClassSend Server',
            type: 'classsend',
            port: this.port,
            txt: {
                version: '4.0.0',
                classes: classesEncoded, // Sent as Base64 to support all characters
                ip: this.localIP,
                ips: allIPs.join(',')
            }
        });

        console.log(`Broadcasting main ClassSend service on ${this.localIP}:${this.port}`);
    }

    // Find other ClassSend servers on the network
    findServers(onServerFound, onServerLost) {
        const browser = this.bonjour.find({ type: 'classsend' });

        browser.on('up', (service) => {
            // Don't report ourselves
            if (service.port === this.port && service.host === this.localIP) {
                return;
            }

            const primaryIp = service.referer?.address || service.host;
            let ips = [primaryIp].filter(Boolean);
            if (service.txt?.ips) {
                const list = String(service.txt.ips).split(',').map(s => s.trim()).filter(Boolean);
                // Put advertised IPs first; keep referer as a fallback so we never lose
                // the one IP we *know* reached us via mDNS.
                ips = Array.from(new Set([...list, ...ips]));
            }
            const serverInfo = {
                name: service.name,
                ip: ips[0] || primaryIp,
                ips,
                port: service.port,
                classes: [],
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

    startNetworkMonitoring(intervalMs = 5000) {
        if (this.monitoringInterval) return;

        console.log('Starting network monitoring...');
        this.monitoringInterval = setInterval(() => {
            const currentNICs = this.getAllLocalNICs();
            const currentIPs = currentNICs.map(n => n.ip).join(',');
            const previousIPs = this.localIPs.map(n => n.ip).join(',');
            const currentIP = currentNICs.length > 0 ? currentNICs[0].ip : 'localhost';
            if (currentIPs !== previousIPs || currentIP !== this.localIP) {
                console.log(`Network Change Detected! Old: [${previousIPs}], New: [${currentIPs}]`);
                const oldIP = this.localIP;
                this.localIPs = currentNICs;
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
