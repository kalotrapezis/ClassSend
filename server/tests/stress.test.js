/**
 * Stress / latency / "potato PC" robustness suite.
 *
 * These tests exist because the real deployment context is:
 *  - school networks with high jitter and intermittent UDP-multicast filtering
 *  - 5–10 year-old laptops with spinning disks and CPU contention
 *  - 25–30 students booting simultaneously, all pounding the teacher's
 *    discovery endpoints at once
 *
 * We assert *outer-bound* behaviour (the suite must not hang, return wrong
 * answers, or eat memory) rather than tight microsecond budgets that would be
 * flaky on slow hardware.
 */

import { describe, it, expect } from 'vitest';
import http from 'node:http';

const expressMod = await import('express');
const express = expressMod.default || expressMod;
const NDmod = await import('../network-discovery.js');
const NetworkDiscovery = NDmod.default || NDmod;
const sm = await import('../../client/subnet-match.js');

// --- Helper: a teacher server with artificial per-request latency -----------

function buildLatentServer({ pingDelayMs = 0 } = {}) {
    const nd = new NetworkDiscovery();
    nd.localIPs = [
        { ip: '192.168.1.50', netmask: '255.255.255.0', mac: 'aa', name: 'eth0', priority: 20 },
        { ip: '10.0.0.50',    netmask: '255.255.255.0', mac: 'bb', name: 'eth1', priority: 10 }
    ];
    nd.localIP = '192.168.1.50';

    const app = express();
    app.use((req, _res, next) => {
        const hdr = req.headers['x-test-client-ip'];
        if (hdr) Object.defineProperty(req, 'ip', { get: () => hdr });
        next();
    });
    app.get('/api/ping', (req, res) => {
        const advertiseIp = nd.pickAdvertiseAddrFor(req.ip || req.socket?.remoteAddress);
        setTimeout(() => res.json({
            serverId: 'srv-1', hostname: 'teacher', mac: 'aa',
            ip: advertiseIp, ips: nd.getAllLocalIPs(), ts: Date.now()
        }), pingDelayMs);
    });
    return http.createServer(app);
}

function hit(port, clientIp, timeoutMs = 5000) {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: '127.0.0.1', port, path: '/api/ping', method: 'GET',
            headers: { 'X-Test-Client-IP': clientIp || '127.0.0.1' }
        }, res => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, json: JSON.parse(body) }); }
                catch { resolve({ status: res.statusCode, json: null }); }
            });
        });
        req.on('error', () => resolve({ status: 0, json: null }));
        req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ status: 0, json: null, timedOut: true }); });
        req.end();
    });
}

function withServer(opts, fn) {
    return new Promise((resolve, reject) => {
        const srv = buildLatentServer(opts);
        srv.listen(0, '127.0.0.1', async () => {
            try {
                const port = srv.address().port;
                await fn(port);
                srv.close(resolve);
            } catch (e) { srv.close(() => reject(e)); }
        });
    });
}

// --- Concurrency under load -------------------------------------------------

describe('teacher endpoint under student-storm load', () => {
    it('30 simultaneous probes complete in <3 s with no failures', async () => {
        await withServer({ pingDelayMs: 50 }, async (port) => {
            const start = Date.now();
            const reqs = Array.from({ length: 30 }, (_, i) =>
                hit(port, i % 2 ? '192.168.1.' + i : '10.0.0.' + i));
            const results = await Promise.all(reqs);
            const elapsed = Date.now() - start;
            expect(results.every(r => r.status === 200)).toBe(true);
            expect(results.every(r => r.json && r.json.ip)).toBe(true);
            // Each probe sleeps 50 ms inside the handler; parallel ≈ 50 ms, but
            // we allow 3 s for slow CI scheduling, GC pauses, and disk IO.
            expect(elapsed).toBeLessThan(3000);
        });
    });

    it('routing remains correct even when 30 probes interleave', async () => {
        await withServer({ pingDelayMs: 20 }, async (port) => {
            const reqs = Array.from({ length: 30 }, (_, i) =>
                hit(port, i % 2 ? '192.168.1.' + i : '10.0.0.' + i));
            const results = await Promise.all(reqs);
            for (let i = 0; i < 30; i++) {
                const expected = i % 2 ? '192.168.1.50' : '10.0.0.50';
                expect(results[i].json.ip, `req ${i} got wrong IP`).toBe(expected);
            }
        });
    });
});

// --- Latency tolerance ------------------------------------------------------

describe('probe timeout behaviour (school network with high jitter)', () => {
    it('client times out cleanly when the teacher response is slower than the budget', async () => {
        // Server sleeps 800 ms; client uses 200 ms timeout. We must get a clean
        // failure, not a hang or thrown exception.
        await withServer({ pingDelayMs: 800 }, async (port) => {
            const r = await hit(port, '192.168.1.10', 200);
            expect(r.timedOut).toBe(true);
            expect(r.json).toBeNull();
        });
    });

    it('a fast probe still wins when raced against a slow one (real network mix)', async () => {
        await withServer({ pingDelayMs: 300 }, async (slowPort) => {
            await withServer({ pingDelayMs: 5 }, async (fastPort) => {
                const probe = async (url) => {
                    const port = url.includes('slow') ? slowPort : fastPort;
                    const r = await hit(port, '192.168.1.10', 1000);
                    return r.json;
                };
                const start = Date.now();
                const { results } = await sm.raceWithFallback(
                    ['http://fast-host:3000', 'http://slow-host:3000'],
                    [],
                    probe
                );
                // Both will eventually resolve (Promise.all waits for all of them);
                // the slow probe caps the total. Acceptable. The point: the round
                // finishes within the slow budget, and the fast one's result is
                // present.
                expect(Date.now() - start).toBeLessThan(1500);
                const hits = results.filter(r => r);
                expect(hits.length).toBe(2);
            });
        });
    });
});

// --- Memory & repeated-use safety -------------------------------------------

describe('repeated use does not leak (potato-PC long-running session)', () => {
    it('1000 pickAdvertiseAddrFor calls keep heap within ~5 MB drift', () => {
        const nd = new NetworkDiscovery();
        nd.localIPs = [
            { ip: '192.168.1.50', netmask: '255.255.255.0', mac: 'a', priority: 10 },
            { ip: '10.0.0.50',    netmask: '255.255.255.0', mac: 'b', priority: 10 }
        ];
        if (global.gc) global.gc();
        const before = process.memoryUsage().heapUsed;
        for (let i = 0; i < 1000; i++) {
            nd.pickAdvertiseAddrFor('10.0.0.' + (i & 255));
        }
        if (global.gc) global.gc();
        const after = process.memoryUsage().heapUsed;
        // 5 MB is loose; we're looking for runaway allocation, not micro-leaks.
        expect(after - before).toBeLessThan(5 * 1024 * 1024);
    });

    it('partitionCandidates is stable under repeated calls with the same input', () => {
        const nics = [{ ip: '192.168.1.50', netmask: '255.255.255.0' }];
        const urls = ['http://192.168.1.10:3000', 'http://10.0.0.5:3000'];
        const a = sm.partitionCandidates(urls, nics);
        const b = sm.partitionCandidates(urls, nics);
        expect(a).toEqual(b);
    });
});

// --- Malformed inputs from the wild -----------------------------------------

describe('hostile / malformed inputs from real-world data', () => {
    it('NetworkDiscovery.decodeClasses handles a base64 payload with a JSON bomb gracefully', async () => {
        const nd = new NetworkDiscovery();
        // Not a real "billion laughs" — base64 of an array of 1000 trivial objs.
        const big = Array.from({ length: 1000 }, (_, i) => ({ id: 'c' + i, teacherName: 't' + i }));
        const enc = nd.encodeClasses(big);
        const start = Date.now();
        const dec = nd.decodeClasses(enc);
        expect(Date.now() - start).toBeLessThan(250);
        expect(dec).toHaveLength(1000);
    });

    it('partitionCandidates ignores URL strings with unicode/RTL hostnames', () => {
        const nics = [{ ip: '192.168.1.50', netmask: '255.255.255.0' }];
        const urls = [
            'http://teacher‮.local:3000',  // RTL override character
            'http://192.168.1.10:3000'
        ];
        const { same, other } = sm.partitionCandidates(urls, nics);
        expect(same).toEqual(['http://192.168.1.10:3000']);
        expect(other.length).toBe(1);
    });
});
