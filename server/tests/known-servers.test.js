/**
 * known-servers — the student's persisted memory of teacher PCs.
 *
 * Why this matters in the field:
 *  - School DHCP rotates IPs nightly. Students must find the teacher tomorrow
 *    even if the IP changed.
 *  - Multi-NIC teachers advertise several IPs; we must remember all of them.
 *  - Quota-exceeded localStorage on shared/old PCs must NEVER throw.
 *  - Concurrent writes (two probes hitting the same teacher) must not corrupt.
 */

import { describe, it, expect, beforeEach } from 'vitest';

class MemStorage {
    constructor(opts = {}) {
        this._m = new Map();
        this.failOnNextSet = opts.failOnNextSet || false;
    }
    getItem(k) { return this._m.has(k) ? this._m.get(k) : null; }
    setItem(k, v) {
        if (this.failOnNextSet) { this.failOnNextSet = false; throw new Error('QuotaExceededError'); }
        this._m.set(k, String(v));
    }
    removeItem(k) { this._m.delete(k); }
    clear() { this._m.clear(); }
}
globalThis.localStorage = new MemStorage();

const ks = await import('../../client/known-servers.js');

beforeEach(() => { globalThis.localStorage = new MemStorage(); });

// --- load & migrate ---------------------------------------------------------

describe('loadKnownServers — migration & resilience', () => {
    it('returns [] on a fresh install', () => {
        expect(ks.loadKnownServers()).toEqual([]);
    });

    it('migrates legacy string[] to rich-object format', () => {
        globalThis.localStorage.setItem('classsend-known-servers',
            JSON.stringify(['http://10.0.0.5:3000', 'http://10.0.0.6:3000/']));
        const list = ks.loadKnownServers();
        expect(list).toHaveLength(2);
        expect(list[0]).toMatchObject({ url: 'http://10.0.0.5:3000', mac: null, lastSeen: 0 });
        // Trailing slash normalized away
        expect(list[1].url).toBe('http://10.0.0.6:3000');
    });

    it('never throws on malformed JSON', () => {
        globalThis.localStorage.setItem('classsend-known-servers', '{not-json');
        expect(() => ks.loadKnownServers()).not.toThrow();
        expect(ks.loadKnownServers()).toEqual([]);
    });

    it('never throws on a non-array root', () => {
        globalThis.localStorage.setItem('classsend-known-servers', '{"oops":true}');
        expect(ks.loadKnownServers()).toEqual([]);
    });

    it('drops entries without a url (legacy garbage)', () => {
        globalThis.localStorage.setItem('classsend-known-servers',
            JSON.stringify([{ noUrl: true }, { url: 'http://ok:3000' }, null, 42]));
        const list = ks.loadKnownServers();
        expect(list).toHaveLength(1);
        expect(list[0].url).toBe('http://ok:3000');
    });

    it('coerces non-array ips to []', () => {
        globalThis.localStorage.setItem('classsend-known-servers', JSON.stringify([
            { url: 'http://a:3000', ips: 'not-an-array' },
            { url: 'http://b:3000', ips: null }
        ]));
        const list = ks.loadKnownServers();
        expect(list[0].ips).toEqual([]);
        expect(list[1].ips).toEqual([]);
    });
});

// --- upsert -----------------------------------------------------------------

describe('upsertKnownServer — identity & merge', () => {
    it('inserts a fresh entry at the front', () => {
        ks.upsertKnownServer({ url: 'http://a:3000', mac: 'm-a' });
        expect(ks.loadKnownServers()[0].url).toBe('http://a:3000');
    });

    it('matches by serverId before mac (most stable identity)', () => {
        ks.upsertKnownServer({ url: 'http://old-ip:3000', mac: 'm-1', serverId: 'sid-X', teacherName: 'Maria' });
        ks.upsertKnownServer({ url: 'http://new-ip:3000', mac: 'm-2', serverId: 'sid-X' });
        const list = ks.loadKnownServers();
        expect(list).toHaveLength(1);
        expect(list[0].url).toBe('http://new-ip:3000');
        expect(list[0].teacherName).toBe('Maria'); // preserved from earlier entry
    });

    it('matches by mac when serverId is missing (DHCP IP change)', () => {
        ks.upsertKnownServer({ url: 'http://10.0.0.5:3000', host: 'lab-01', mac: 'aa:bb', teacherName: 'Maria' });
        ks.upsertKnownServer({ url: 'http://10.0.0.99:3000', host: 'lab-01', mac: 'aa:bb' });
        const list = ks.loadKnownServers();
        expect(list).toHaveLength(1);
        expect(list[0].url).toBe('http://10.0.0.99:3000');
        expect(list[0].teacherName).toBe('Maria');
    });

    it('matches by host when mac is missing', () => {
        ks.upsertKnownServer({ url: 'http://10.0.0.5:3000', host: 'lab-01' });
        ks.upsertKnownServer({ url: 'http://10.0.0.6:3000', host: 'lab-01' });
        expect(ks.loadKnownServers()).toHaveLength(1);
    });

    it('host match is case-insensitive (mDNS sometimes UPPERCASES)', () => {
        ks.upsertKnownServer({ url: 'http://a:3000', host: 'Lab-01' });
        ks.upsertKnownServer({ url: 'http://b:3000', host: 'LAB-01' });
        expect(ks.loadKnownServers()).toHaveLength(1);
    });

    it('never overwrites known fields with null on merge', () => {
        ks.upsertKnownServer({ url: 'http://a:3000', mac: 'm-a', teacherName: 'Maria', host: 'lab-01' });
        ks.upsertKnownServer({ url: 'http://a:3000', mac: 'm-a' }); // skinny re-probe
        const e = ks.loadKnownServers()[0];
        expect(e.teacherName).toBe('Maria');
        expect(e.host).toBe('lab-01');
    });

    it('promotes most-recent entry to the front', () => {
        ks.upsertKnownServer({ url: 'http://a:3000', mac: 'm-a' });
        ks.upsertKnownServer({ url: 'http://b:3000', mac: 'm-b' });
        ks.upsertKnownServer({ url: 'http://a:3000', mac: 'm-a' });
        expect(ks.loadKnownServers().map(e => e.url)).toEqual(['http://a:3000', 'http://b:3000']);
    });

    it('updates lastSeen on every upsert', async () => {
        ks.upsertKnownServer({ url: 'http://a:3000', mac: 'm-a' });
        const t1 = ks.loadKnownServers()[0].lastSeen;
        await new Promise(r => setTimeout(r, 5)); // tiny gap, well within slow-PC budget
        ks.upsertKnownServer({ url: 'http://a:3000', mac: 'm-a' });
        const t2 = ks.loadKnownServers()[0].lastSeen;
        expect(t2).toBeGreaterThanOrEqual(t1);
    });

    it('silently no-ops on entry without url', () => {
        expect(() => ks.upsertKnownServer({})).not.toThrow();
        expect(() => ks.upsertKnownServer(null)).not.toThrow();
        expect(ks.loadKnownServers()).toEqual([]);
    });
});

// --- multi-NIC ips merge ---------------------------------------------------

describe('upsertKnownServer — multi-NIC ips merge', () => {
    it('persists ips on first save', () => {
        ks.upsertKnownServer({ url: 'http://192.168.1.50:3000', mac: 'm-1', ips: ['192.168.1.50', '10.0.0.50'] });
        expect(ks.loadKnownServers()[0].ips.sort()).toEqual(['10.0.0.50', '192.168.1.50']);
    });

    it('merges newly seen ips without losing old ones', () => {
        ks.upsertKnownServer({ url: 'http://192.168.1.50:3000', mac: 'm-1', ips: ['192.168.1.50', '10.0.0.50'] });
        // Next probe only reaches the teacher via the second NIC — must NOT erase the first
        ks.upsertKnownServer({ url: 'http://10.0.0.50:3000', mac: 'm-1', ips: ['10.0.0.50'] });
        expect(ks.loadKnownServers()[0].ips.sort()).toEqual(['10.0.0.50', '192.168.1.50']);
    });

    it('dedupes when the same IP comes in twice', () => {
        ks.upsertKnownServer({ url: 'http://a:3000', mac: 'm-1', ips: ['1.1.1.1'] });
        ks.upsertKnownServer({ url: 'http://a:3000', mac: 'm-1', ips: ['1.1.1.1', '2.2.2.2'] });
        const ips = ks.loadKnownServers()[0].ips;
        expect(ips.length).toBe(new Set(ips).size);
        expect(ips.sort()).toEqual(['1.1.1.1', '2.2.2.2']);
    });

    it('rejects falsy items in the ips array', () => {
        ks.upsertKnownServer({ url: 'http://a:3000', mac: 'm-1', ips: ['1.1.1.1', null, '', undefined, '2.2.2.2'] });
        expect(ks.loadKnownServers()[0].ips.sort()).toEqual(['1.1.1.1', '2.2.2.2']);
    });
});

// --- expandCandidates -------------------------------------------------------

describe('expandCandidates', () => {
    it('emits url + hostname + .local variants', () => {
        const cands = ks.expandCandidates([
            { url: 'http://10.0.0.5:3000', host: 'lab-01' }
        ], 'http://localhost:5173');
        expect(cands).toEqual(expect.arrayContaining([
            'http://10.0.0.5:3000',
            'http://lab-01:3000',
            'http://lab-01.local:3000'
        ]));
    });

    it('emits one URL per cached NIC IP (multi-NIC teacher)', () => {
        const cands = ks.expandCandidates([{
            url: 'http://192.168.1.50:3000', host: 'teacher', ips: ['192.168.1.50', '10.0.0.50']
        }], 'http://localhost:5173');
        expect(cands).toContain('http://10.0.0.50:3000');
        expect(cands).toContain('http://192.168.1.50:3000');
    });

    it('does not double-up when .local is already present on host', () => {
        const cands = ks.expandCandidates([{
            url: 'http://lab-01.local:3000', host: 'lab-01.local'
        }], 'http://localhost:5173');
        // No duplicate ".local.local"
        expect(cands.every(u => !/\.local\.local/.test(u))).toBe(true);
    });

    it('excludes own origin and dedupes across overlapping entries', () => {
        const cands = ks.expandCandidates([
            { url: 'http://localhost:5173' },
            { url: 'http://10.0.0.5:3000' },
            { url: 'http://10.0.0.5:3000/' }
        ], 'http://localhost:5173');
        expect(cands).toEqual(['http://10.0.0.5:3000']);
    });

    it('handles malformed url in an entry without throwing', () => {
        expect(() => ks.expandCandidates([{ url: 'not a url', ips: ['1.2.3.4'] }], 'http://localhost'))
            .not.toThrow();
    });
});

// --- robustness against bad storage -----------------------------------------

describe('robustness', () => {
    it('save swallows quota-exceeded errors silently', () => {
        const bad = new MemStorage({ failOnNextSet: true });
        globalThis.localStorage = bad;
        // Must NOT crash the student renderer
        expect(() => ks.saveKnownServers([{ url: 'http://a:3000', lastSeen: 1 }])).not.toThrow();
    });

    it('caps stored entries to MAX_ENTRIES (no unbounded growth)', () => {
        const many = Array.from({ length: 50 }, (_, i) => ({ url: `http://h${i}:3000`, lastSeen: i }));
        ks.saveKnownServers(many);
        const stored = ks.loadKnownServers();
        expect(stored.length).toBeLessThanOrEqual(20);
    });

    it('upserts 200 unique entries in <250ms (potato-PC budget)', () => {
        const start = Date.now();
        for (let i = 0; i < 200; i++) {
            ks.upsertKnownServer({ url: `http://h${i}:3000`, mac: `m-${i}` });
        }
        expect(Date.now() - start).toBeLessThan(250);
    });
});

// --- removeKnownServer ------------------------------------------------------

describe('removeKnownServer', () => {
    it('removes entries matching the predicate', () => {
        ks.upsertKnownServer({ url: 'http://a:3000', mac: 'm-a' });
        ks.upsertKnownServer({ url: 'http://b:3000', mac: 'm-b' });
        ks.removeKnownServer(e => e.mac === 'm-a');
        expect(ks.loadKnownServers().map(e => e.mac)).toEqual(['m-b']);
    });

    it('is a no-op when nothing matches', () => {
        ks.upsertKnownServer({ url: 'http://a:3000', mac: 'm-a' });
        ks.removeKnownServer(e => e.mac === 'never');
        expect(ks.loadKnownServers()).toHaveLength(1);
    });
});
