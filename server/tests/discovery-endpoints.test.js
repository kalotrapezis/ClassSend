import { describe, it, expect } from 'vitest';
import os from 'os';

// Re-derive the same identity logic as server/index.js so this test stays
// self-contained (we don't want to spin up the full server here).
function deriveIdentity() {
    const ifaces = os.networkInterfaces();
    const virtualKw = ['virtual', 'vmware', 'vbox', 'hyperv', 'vethernet', 'wsl', 'loopback', 'docker', 'radmin', 'vpn', 'hamachi'];
    let mac = '00:00:00:00:00:00';
    for (const name of Object.keys(ifaces)) {
        if (virtualKw.some(k => name.toLowerCase().includes(k))) continue;
        for (const i of ifaces[name]) {
            if (i.family === 'IPv4' && !i.internal && i.mac && i.mac !== '00:00:00:00:00:00') {
                mac = i.mac;
                break;
            }
        }
        if (mac !== '00:00:00:00:00:00') break;
    }
    const hostname = os.hostname();
    const serverId = `${mac.replace(/:/g, '').toLowerCase()}-${hostname}`.slice(0, 64);
    return { mac, hostname, serverId };
}

describe('server identity (used by /api/ping & /api/discovery-info)', () => {
    it('produces a stable serverId of the right shape', () => {
        const id1 = deriveIdentity();
        const id2 = deriveIdentity();
        expect(id1.serverId).toBe(id2.serverId);
        expect(id1.serverId.length).toBeGreaterThan(0);
        expect(id1.serverId.length).toBeLessThanOrEqual(64);
    });

    it('returns a non-empty hostname', () => {
        const { hostname } = deriveIdentity();
        expect(hostname).toBeTruthy();
        expect(typeof hostname).toBe('string');
    });

    it('mac is in canonical form or the zero MAC', () => {
        const { mac } = deriveIdentity();
        // Either zero (no usable iface in this CI runner) or a real MAC
        expect(mac === '00:00:00:00:00:00' || /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(mac)).toBe(true);
    });
});
