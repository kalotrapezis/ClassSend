/**
 * Pure-logic tests for the client-side subnet helpers (client/subnet-match.js).
 *
 * These functions decide whether a probe candidate is on the same LAN as the
 * student. Bugs here cause the student to either (a) waste seconds probing the
 * other subnet first, or (b) skip the teacher entirely. Hence we cover edge
 * cases aggressively: garbage IPs, /16 + /22 netmasks, IPv6-looking strings,
 * and large candidate lists for "potato PC" performance assurance.
 */

import { describe, it, expect } from 'vitest';

const sm = await import('../../client/subnet-match.js');

// --- ipv4ToInt --------------------------------------------------------------

describe('ipv4ToInt', () => {
    it('parses standard dotted-quad', () => {
        expect(sm.ipv4ToInt('0.0.0.0')).toBe(0);
        expect(sm.ipv4ToInt('255.255.255.255')).toBe(0xFFFFFFFF >>> 0);
        expect(sm.ipv4ToInt('192.168.1.1')).toBe((192 << 24 | 168 << 16 | 1 << 8 | 1) >>> 0);
    });

    it('returns null (never NaN) on garbage', () => {
        for (const bad of [null, undefined, '', 'hello', '1.2.3', '1.2.3.4.5',
                           '1.2.3.256', '1.2.3.-1', '1.2.3.a', '999.0.0.0']) {
            expect(sm.ipv4ToInt(bad)).toBeNull();
        }
    });

    it('does not interpret IPv6 as IPv4', () => {
        expect(sm.ipv4ToInt('::1')).toBeNull();
        expect(sm.ipv4ToInt('fe80::1')).toBeNull();
    });
});

// --- isSameSubnet -----------------------------------------------------------

describe('isSameSubnet', () => {
    const A = { ip: '192.168.1.10', netmask: '255.255.255.0' };
    const B = { ip: '10.0.0.10',    netmask: '255.255.255.0' };
    const big = { ip: '172.16.0.1', netmask: '255.255.0.0' }; // /16
    const tiny = { ip: '10.5.0.1',  netmask: '255.255.255.252' }; // /30

    it('matches a /24 subnet', () => {
        expect(sm.isSameSubnet('192.168.1.50', [A])).toBe(true);
        expect(sm.isSameSubnet('192.168.2.50', [A])).toBe(false);
    });

    it('matches across multiple NICs (first hit wins)', () => {
        expect(sm.isSameSubnet('10.0.0.99', [A, B])).toBe(true);
    });

    it('respects a /16 netmask', () => {
        expect(sm.isSameSubnet('172.16.99.99', [big])).toBe(true);
        expect(sm.isSameSubnet('172.17.0.1', [big])).toBe(false);
    });

    it('respects a /30 netmask (point-to-point)', () => {
        // 10.5.0.0/30 covers .0, .1, .2, .3
        expect(sm.isSameSubnet('10.5.0.2', [tiny])).toBe(true);
        expect(sm.isSameSubnet('10.5.0.4', [tiny])).toBe(false);
    });

    it('returns false for an empty NIC list (cold start)', () => {
        expect(sm.isSameSubnet('192.168.1.1', [])).toBe(false);
    });

    it('returns false (no throw) on garbage NIC entries', () => {
        const bad = [null, {}, { ip: 'bad' }, { netmask: 'bad' }, { ip: '1.2.3.4', netmask: 'bad' }];
        expect(() => sm.isSameSubnet('1.2.3.4', bad)).not.toThrow();
        expect(sm.isSameSubnet('1.2.3.4', bad)).toBe(false);
    });

    it('returns false for non-IPv4 candidate strings', () => {
        expect(sm.isSameSubnet('::1', [A])).toBe(false);
        expect(sm.isSameSubnet('teacher.local', [A])).toBe(false);
    });

    it('does not match when nics arg is not an array', () => {
        expect(sm.isSameSubnet('1.2.3.4', null)).toBe(false);
        expect(sm.isSameSubnet('1.2.3.4', undefined)).toBe(false);
        expect(sm.isSameSubnet('1.2.3.4', 'oops')).toBe(false);
    });
});

// --- extractIPv4 ------------------------------------------------------------

describe('extractIPv4', () => {
    it('extracts the host when it is an IPv4 literal', () => {
        expect(sm.extractIPv4('http://192.168.1.50:3000')).toBe('192.168.1.50');
        expect(sm.extractIPv4('http://10.0.0.5')).toBe('10.0.0.5');
        expect(sm.extractIPv4('https://1.2.3.4:443/path?q=1')).toBe('1.2.3.4');
    });

    it('returns null for hostname URLs (they must defer to phase 2)', () => {
        expect(sm.extractIPv4('http://lab-01:3000')).toBeNull();
        expect(sm.extractIPv4('http://teacher.local:3000')).toBeNull();
    });

    it('returns null for malformed input', () => {
        expect(sm.extractIPv4('')).toBeNull();
        expect(sm.extractIPv4(null)).toBeNull();
        expect(sm.extractIPv4('not a url')).toBeNull();
        expect(sm.extractIPv4('http://')).toBeNull();
    });

    it('returns null for IPv4-shaped-but-invalid octets', () => {
        // The URL parser may accept "999.0.0.0" as a hostname; we must catch this.
        expect(sm.extractIPv4('http://999.0.0.0:3000')).toBeNull();
    });
});

// --- partitionCandidates ----------------------------------------------------

describe('partitionCandidates — the policy that drives the same-subnet-first race', () => {
    const myNICs = [
        { ip: '192.168.1.50', netmask: '255.255.255.0' }
    ];

    it('puts IPv4 candidates on my subnet into "same"', () => {
        const { same, other } = sm.partitionCandidates([
            'http://192.168.1.10:3000',
            'http://192.168.1.99:3000'
        ], myNICs);
        expect(same).toHaveLength(2);
        expect(other).toHaveLength(0);
    });

    it('puts foreign-subnet IPv4 candidates into "other"', () => {
        const { same, other } = sm.partitionCandidates([
            'http://10.0.0.5:3000',
            'http://172.16.0.5:3000'
        ], myNICs);
        expect(same).toHaveLength(0);
        expect(other).toHaveLength(2);
    });

    it('puts hostnames and .local always into "other" (cannot decide statically)', () => {
        const { same, other } = sm.partitionCandidates([
            'http://lab-01:3000',
            'http://teacher.local:3000'
        ], myNICs);
        expect(same).toEqual([]);
        expect(other).toHaveLength(2);
    });

    it('falls back to all-in-other when student has no NICs (offline cold start)', () => {
        const { same, other } = sm.partitionCandidates([
            'http://192.168.1.10:3000',
            'http://10.0.0.5:3000'
        ], []);
        expect(same).toEqual([]);
        expect(other).toHaveLength(2);
    });

    it('preserves original ordering within each bucket', () => {
        const urls = [
            'http://10.0.0.5:3000',         // other
            'http://192.168.1.20:3000',     // same
            'http://10.0.0.6:3000',         // other
            'http://192.168.1.30:3000'      // same
        ];
        const { same, other } = sm.partitionCandidates(urls, myNICs);
        expect(same).toEqual(['http://192.168.1.20:3000', 'http://192.168.1.30:3000']);
        expect(other).toEqual(['http://10.0.0.5:3000', 'http://10.0.0.6:3000']);
    });

    it('mixed multi-NIC student: candidates matching either NIC go to "same"', () => {
        const dual = [
            { ip: '192.168.1.50', netmask: '255.255.255.0' },
            { ip: '10.0.0.50',    netmask: '255.255.255.0' }
        ];
        const { same, other } = sm.partitionCandidates([
            'http://192.168.1.10:3000',
            'http://10.0.0.20:3000',
            'http://172.16.0.5:3000'
        ], dual);
        expect(same).toHaveLength(2);
        expect(other).toEqual(['http://172.16.0.5:3000']);
    });

    it('does not throw on non-array urls input', () => {
        expect(() => sm.partitionCandidates(null, myNICs)).not.toThrow();
        const { same, other } = sm.partitionCandidates(null, myNICs);
        expect(same).toEqual([]);
        expect(other).toEqual([]);
    });

    it('partitions 5000 candidates in <250 ms (potato-PC budget)', () => {
        const urls = Array.from({ length: 5000 }, (_, i) =>
            `http://${i % 2 === 0 ? '192.168.1' : '10.0.0'}.${i & 255}:3000`);
        const start = Date.now();
        const { same, other } = sm.partitionCandidates(urls, myNICs);
        expect(Date.now() - start).toBeLessThan(250);
        expect(same.length + other.length).toBe(5000);
    });
});
