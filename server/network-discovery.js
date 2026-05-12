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
        this.perNicServices = []; // mDNS: one service per real NIC so each subnet hears us
        this.classServices = new Map(); // classId -> service
        this.localIP = null;
        this.localIPs = [];      // all real IPv4s, [{iface, ip, mac}, ...]
        this.port = null;
        this.getClassesCallback = null;
        this.monitoringInterval = null;
    }

    /**
     * Enumerate every usable IPv4 NIC on this machine.
     *
     * Returns: [{ ip, netmask, mac, name, iface, priority }]
     *  - `iface` is an alias for `name` so older callers (multi-NIC publish
     *    code in `publishMainService`) still work.
     *  - `netmask` is REQUIRED — without it `pickAdvertiseAddrFor` cannot
     *    subnet-match and silently falls back to the primary IP, which
     *    re-breaks the entire multi-NIC fix. This was the regression that
     *    11.5.1's first merge introduced.
     *  - Sorted descending by `priority`: scoring penalizes virtual adapters,
     *    VirtualBox 192.168.56.x, link-local 169.254.x.x; rewards Wi-Fi and
     *    Ethernet by name.
     */
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
                if (p <= -500) continue; // hopeless — drop entirely
                found.push({
                    ip: iface.address,
                    netmask: iface.netmask,
                    mac: iface.mac || null,
                    name,
                    iface: name, // alias for the per-NIC publish code below
                    priority: p
                });
            }
        }
        found.sort((a, b) => b.priority - a.priority);
        return found;
    }

    /** Back-compat: returns the single best IP string. */
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

    /**
     * Given a remote (student) IP, return the local NIC IP whose subnet
     * contains it. Falls back to the primary IP. This is the heart of the
     * multi-NIC fix: a student on subnet B must be told the teacher's IP on
     * subnet B's NIC, not on subnet A's.
     */
    pickAdvertiseAddrFor(remoteIP) {
        if (!remoteIP) return this.localIP || 'localhost';
        // Strip IPv6-mapped prefix and zone — node sometimes hands back "::ffff:192.168.1.10"
        const clean = String(remoteIP).replace(/^::ffff:/, '').split('%')[0];
        if (clean === '127.0.0.1' || clean === '::1' || clean === 'localhost') {
            return this.localIP || '127.0.0.1';
        }
        for (const nic of this.localIPs) {
            if (_ipInNICSubnet(clean, nic)) return nic.ip;
        }
        return this.localIP || 'localhost';
    }

    /** All advertise-able IPv4 addresses as plain strings (for TXT / API). */
    getAllLocalIPs() {
        return this.localIPs.map(n => n.ip);
    }

    async initialize(port, getClassesCallback) {
        this.port = port;
        this.getClassesCallback = getClassesCallback;

        // Multi-NIC: enumerate every real IPv4 adapter as objects with
        // netmask (required by `pickAdvertiseAddrFor`). The "best" one is
        // kept as `localIP` for legacy single-IP callers (UI display), but
        // the full list drives mDNS and the HTTP discovery endpoints so
        // students on any subnet can reach us.
        this.localIPs = this.getAllLocalNICs();
        this.localIP = this.localIPs[0]?.ip || 'localhost';
        console.log(`Local IPs (${this.localIPs.length}):`, this.localIPs.map(n => `${n.iface}=${n.ip}/${n.netmask}`).join(', '));
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
        this.localIPs = this.getAllLocalNICs();
        const ipList = this.localIPs.map(n => n.ip);
        const addressesField = ipList.join(',');

        // 1) Main service (single record, includes addresses[] in TXT for clients
        //    that read TXT). Backwards compat: `ip` still carries the primary.
        //    `version` is bumped per release; old clients ignore unknown TXT keys.
        this.mainService = this.bonjour.publish({
            name: 'ClassSend Server',
            type: 'classsend',
            port: this.port,
            txt: {
                version: '11.5.3',
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
                            version: '11.5.3',
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

            // Multi-NIC: TXT.`addresses` is the comma-separated list of every
            // IP the server can be reached on. The single TXT.`ip` (and the
            // mDNS-level referer address) are kept as fallbacks for older
            // servers / single-NIC setups.
            const primaryIp = service.referer?.address || service.host;
            let addresses = [primaryIp].filter(Boolean);
            if (service.txt?.addresses) {
                const list = String(service.txt.addresses).split(',').map(s => s.trim()).filter(Boolean);
                addresses = Array.from(new Set([...list, ...addresses]));
            }
            const serverInfo = {
                name: service.name,
                ip: addresses[0] || primaryIp,
                ips: addresses,         // legacy alias for clients shipped in 11.5.1
                addresses,              // canonical field name (11.5.0+)
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
