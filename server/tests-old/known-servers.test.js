import { describe, it, expect, beforeEach } from 'vitest';

// Lightweight localStorage shim so the ESM module under test runs in Node.
class MemStorage {
    constructor() { this._m = new Map(); }
    getItem(k) { return this._m.has(k) ? this._m.get(k) : null; }
    setItem(k, v) { this._m.set(k, String(v)); }
    removeItem(k) { this._m.delete(k); }
    clear() { this._m.clear(); }
}
globalThis.localStorage = new MemStorage();

const ks = await import('../../client/known-servers.js');

beforeEach(() => globalThis.localStorage.clear());

describe('known-servers (rich history)', () => {
    it('migrates legacy string[] format', () => {
        globalThis.localStorage.setItem('classsend-known-servers',
            JSON.stringify(['http://10.0.0.5:3000', 'http://10.0.0.6:3000/']));
        const list = ks.loadKnownServers();
        expect(list).toHaveLength(2);
        expect(list[0]).toMatchObject({
            url: 'http://10.0.0.5:3000', host: null, mac: null, lastSeen: 0
        });
        expect(list[1].url).toBe('http://10.0.0.6:3000');
    });

    it('upserts and merges by mac across changing IPs (DHCP)', () => {
        ks.upsertKnownServer({
            url: 'http://10.0.0.5:3000',
            host: 'lab-01', mac: 'aa:bb:cc:dd:ee:01', teacherName: 'Maria'
        });
        // Same machine, new IP — merge by mac, keep teacherName
        ks.upsertKnownServer({
            url: 'http://10.0.0.99:3000',
            host: 'lab-01', mac: 'aa:bb:cc:dd:ee:01'
        });
        const list = ks.loadKnownServers();
        expect(list).toHaveLength(1);
        expect(list[0].url).toBe('http://10.0.0.99:3000');
        expect(list[0].teacherName).toBe('Maria');
        expect(list[0].mac).toBe('aa:bb:cc:dd:ee:01');
    });

    it('promotes most-recent entry to the front', () => {
        ks.upsertKnownServer({ url: 'http://a:3000', mac: 'm-a' });
        ks.upsertKnownServer({ url: 'http://b:3000', mac: 'm-b' });
        ks.upsertKnownServer({ url: 'http://a:3000', mac: 'm-a' });
        const list = ks.loadKnownServers();
        expect(list.map(e => e.url)).toEqual(['http://a:3000', 'http://b:3000']);
    });

    it('expandCandidates produces url + hostname + .local variants', () => {
        const cands = ks.expandCandidates([{
            url: 'http://10.0.0.5:3000', host: 'lab-01', mac: 'aa:bb', serverId: null
        }], 'http://localhost:5173');
        expect(cands).toContain('http://10.0.0.5:3000');
        expect(cands).toContain('http://lab-01:3000');
        expect(cands).toContain('http://lab-01.local:3000');
    });

    it('expandCandidates excludes own origin and dedupes', () => {
        const cands = ks.expandCandidates([
            { url: 'http://localhost:5173', host: null, mac: null },
            { url: 'http://10.0.0.5:3000', host: null, mac: null },
            { url: 'http://10.0.0.5:3000/', host: null, mac: null }
        ], 'http://localhost:5173');
        expect(cands).toEqual(['http://10.0.0.5:3000']);
    });

    it('persists and merges ips[] across upserts (multi-NIC teacher)', () => {
        ks.upsertKnownServer({
            url: 'http://192.168.1.50:3000', mac: 'aa:bb:cc:dd:ee:01',
            ips: ['192.168.1.50', '10.0.0.50']
        });
        // Next probe only sees one of the IPs — the other must not be erased.
        ks.upsertKnownServer({
            url: 'http://10.0.0.50:3000', mac: 'aa:bb:cc:dd:ee:01',
            ips: ['10.0.0.50']
        });
        const list = ks.loadKnownServers();
        expect(list).toHaveLength(1);
        expect(list[0].ips.sort()).toEqual(['10.0.0.50', '192.168.1.50']);
    });

    it('expandCandidates emits one URL per cached NIC IP', () => {
        const cands = ks.expandCandidates([{
            url: 'http://192.168.1.50:3000', host: 'teacher-pc', mac: 'aa:bb',
            ips: ['192.168.1.50', '10.0.0.50']
        }], 'http://localhost:5173');
        expect(cands).toContain('http://192.168.1.50:3000');
        expect(cands).toContain('http://10.0.0.50:3000');
        expect(cands).toContain('http://teacher-pc:3000');
    });

    it('handles malformed storage without throwing', () => {
        globalThis.localStorage.setItem('classsend-known-servers', '{not-json');
        expect(() => ks.loadKnownServers()).not.toThrow();
        expect(ks.loadKnownServers()).toEqual([]);
    });
});
