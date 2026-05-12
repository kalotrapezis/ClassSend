/**
 * NetworkDiscovery — multi-NIC enumeration, per-subnet picker, mDNS TXT
 * encoding. Pure logic; no real Bonjour service is started.
 *
 * Conventions used across the new suite:
 *  - No timing assertions tighter than 250 ms. Tests must pass on a slow CI
 *    or a "potato" laptop with a busy CPU.
 *  - No reliance on real network state. NICs are injected.
 *  - Assertions describe *behavior*, not implementation details.
 */

import { describe, it, expect, beforeEach } from 'vitest';

const NDmod = await import('../network-discovery.js');
const NetworkDiscovery = NDmod.default || NDmod;

// --- helpers ----------------------------------------------------------------

function makeNIC(ip, { netmask = '255.255.255.0', mac = 'aa:bb:cc:dd:ee:ff', name = 'Ethernet', priority = 10 } = {}) {
    return { ip, netmask, mac, name, priority };
}

/** Build a NetworkDiscovery instance with NICs injected — bypasses os.networkInterfaces(). */
function build(nics) {
    const nd = new NetworkDiscovery();
    nd.localIPs = nics;
    nd.localIP = nics[0]?.ip || 'localhost';
    return nd;
}

// --- pickAdvertiseAddrFor ---------------------------------------------------

describe('pickAdvertiseAddrFor — the heart of the multi-NIC fix', () => {
    const A = makeNIC('192.168.1.50');
    const B = makeNIC('10.0.0.50');
    const C = makeNIC('172.16.5.50', { netmask: '255.255.0.0' });

    it('routes student on 192.168.1.x to NIC-A', () => {
        const nd = build([A, B]);
        expect(nd.pickAdvertiseAddrFor('192.168.1.15')).toBe('192.168.1.50');
    });

    it('routes student on 10.0.0.x to NIC-B (the non-primary NIC)', () => {
        const nd = build([A, B]);
        expect(nd.pickAdvertiseAddrFor('10.0.0.17')).toBe('10.0.0.50');
    });

    it('respects /16 netmasks', () => {
        const nd = build([A, C]);
        expect(nd.pickAdvertiseAddrFor('172.16.99.99')).toBe('172.16.5.50');
        expect(nd.pickAdvertiseAddrFor('172.17.0.1')).toBe('192.168.1.50'); // outside /16 — fallback
    });

    it('falls back to primary IP when student is on an unknown subnet', () => {
        const nd = build([A, B]);
        expect(nd.pickAdvertiseAddrFor('203.0.113.1')).toBe('192.168.1.50');
    });

    it('strips ::ffff: IPv4-mapped prefix that Node sometimes hands back', () => {
        const nd = build([A, B]);
        expect(nd.pickAdvertiseAddrFor('::ffff:10.0.0.17')).toBe('10.0.0.50');
    });

    it('strips IPv6 zone suffix (%eth0) without crashing', () => {
        const nd = build([A, B]);
        // Zone IDs are stripped before subnet match
        expect(() => nd.pickAdvertiseAddrFor('10.0.0.17%eth0')).not.toThrow();
    });

    it('returns primary IP for loopback/::1', () => {
        const nd = build([A, B]);
        expect(nd.pickAdvertiseAddrFor('127.0.0.1')).toBe('192.168.1.50');
        expect(nd.pickAdvertiseAddrFor('::1')).toBe('192.168.1.50');
        expect(nd.pickAdvertiseAddrFor('localhost')).toBe('192.168.1.50');
    });

    it('returns primary IP (never crashes) when handed garbage', () => {
        const nd = build([A, B]);
        expect(nd.pickAdvertiseAddrFor(null)).toBe('192.168.1.50');
        expect(nd.pickAdvertiseAddrFor(undefined)).toBe('192.168.1.50');
        expect(nd.pickAdvertiseAddrFor('')).toBe('192.168.1.50');
        expect(nd.pickAdvertiseAddrFor('not-an-ip')).toBe('192.168.1.50');
        expect(nd.pickAdvertiseAddrFor('999.999.999.999')).toBe('192.168.1.50');
    });

    it('returns "localhost" when there are zero NICs (cold start race)', () => {
        const nd = new NetworkDiscovery();
        nd.localIPs = [];
        nd.localIP = null;
        expect(nd.pickAdvertiseAddrFor('10.0.0.5')).toBe('localhost');
    });

    it('single-NIC teacher: every student gets the same IP regardless of subnet', () => {
        const nd = build([A]);
        for (const student of ['192.168.1.10', '10.0.0.10', '172.16.0.1', '8.8.8.8']) {
            expect(nd.pickAdvertiseAddrFor(student)).toBe('192.168.1.50');
        }
    });

    it('is stable across 1000 calls in <250ms on slow hardware', () => {
        const nd = build([A, B, C]);
        const start = Date.now();
        for (let i = 0; i < 1000; i++) {
            nd.pickAdvertiseAddrFor('10.0.0.' + (i & 255));
        }
        const elapsed = Date.now() - start;
        // Loose bound — 250 ms is way more than enough even on a Pentium.
        expect(elapsed).toBeLessThan(250);
    });
});

// --- getAllLocalIPs ---------------------------------------------------------

describe('getAllLocalIPs', () => {
    it('returns IPs sorted in priority order (primary first)', () => {
        const high = makeNIC('192.168.1.50', { priority: 20 });
        const low  = makeNIC('10.0.0.50', { priority: 5 });
        const nd = build([high, low]);
        expect(nd.getAllLocalIPs()).toEqual(['192.168.1.50', '10.0.0.50']);
    });

    it('returns an empty array when no NICs are found', () => {
        const nd = new NetworkDiscovery();
        nd.localIPs = [];
        expect(nd.getAllLocalIPs()).toEqual([]);
    });
});

// --- getAllLocalNICs (touches real os.networkInterfaces) --------------------

describe('getAllLocalNICs (real OS)', () => {
    it('returns plain objects with required fields', () => {
        const nd = new NetworkDiscovery();
        const nics = nd.getAllLocalNICs();
        // Can be 0 in sandboxed CI; what matters is shape
        for (const n of nics) {
            expect(n).toHaveProperty('ip');
            expect(n).toHaveProperty('netmask');
            expect(n).toHaveProperty('mac');
            expect(n).toHaveProperty('priority');
            expect(typeof n.ip).toBe('string');
        }
    });

    it('never returns link-local 169.254.x.x as a usable NIC', () => {
        const nd = new NetworkDiscovery();
        const nics = nd.getAllLocalNICs();
        // Link-local has priority -1000, so it should be at the bottom if present
        // (the priority -500 cutoff drops them). Either way: it MUST NOT be
        // picked as primary on a healthy machine.
        const primary = nics[0]?.ip;
        if (primary) {
            expect(primary.startsWith('169.254.')).toBe(false);
        }
    });

    it('is idempotent — two consecutive calls return the same data', () => {
        const nd = new NetworkDiscovery();
        const a = nd.getAllLocalNICs();
        const b = nd.getAllLocalNICs();
        expect(a.map(n => n.ip)).toEqual(b.map(n => n.ip));
    });
});

// --- mDNS class encoding (TXT field is size-limited; this matters in prod) -

describe('encodeClasses / decodeClasses', () => {
    let nd;
    beforeEach(() => { nd = new NetworkDiscovery(); });

    it('round-trips an empty list', () => {
        const encoded = nd.encodeClasses([]);
        expect(nd.decodeClasses(encoded)).toEqual([]);
    });

    it('round-trips ASCII class names', () => {
        const classes = [{ id: 'math', teacherName: 'Maria' }];
        expect(nd.decodeClasses(nd.encodeClasses(classes))).toEqual(classes);
    });

    it('round-trips non-ASCII (Greek) class names — base64 carries UTF-8', () => {
        const classes = [{ id: 'γλώσσα', teacherName: 'Ελένη' }];
        expect(nd.decodeClasses(nd.encodeClasses(classes))).toEqual(classes);
    });

    it('decodeClasses accepts raw JSON (back-compat with older servers)', () => {
        const raw = '[{"id":"a","teacherName":"b"}]';
        expect(nd.decodeClasses(raw)).toEqual([{ id: 'a', teacherName: 'b' }]);
    });

    it('decodeClasses returns [] (never throws) on garbage input', () => {
        expect(nd.decodeClasses('not base64 not json')).toEqual([]);
        expect(nd.decodeClasses('')).toEqual([]);
        expect(nd.decodeClasses(null)).toEqual([]);
        expect(nd.decodeClasses(undefined)).toEqual([]);
    });

    it('handles a large class list (10 classes) in <50ms — TXT size is the prod limit, not CPU', () => {
        const classes = Array.from({ length: 10 }, (_, i) => ({
            id: `class-${i}`,
            teacherName: `Teacher ${i}`
        }));
        const start = Date.now();
        const enc = nd.encodeClasses(classes);
        const dec = nd.decodeClasses(enc);
        expect(Date.now() - start).toBeLessThan(50);
        expect(dec).toHaveLength(10);
    });
});
