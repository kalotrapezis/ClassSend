/**
 * Endpoint behaviour tests. We stand up a minimal Express app that mirrors the
 * exact wiring used in server/index.js for the discovery endpoints, with a fake
 * `req.ip` injected via header so we can simulate students arriving from
 * different subnets. The endpoint handlers under test are imported logic; the
 * point is to lock in the contract students depend on.
 *
 * What we're NOT doing: starting the full server/index.js (it requires Electron,
 * Bonjour, sockets, file storage). That's appropriate for an integration test,
 * not a unit test — and integration tests should not depend on hardware NICs.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';

// Express ships as CJS; vitest resolves it via the parent node_modules tree.
const expressMod = await import('express');
const express = expressMod.default || expressMod;
const NDmod = await import('../network-discovery.js');
const NetworkDiscovery = NDmod.default || NDmod;

function makeApp() {
    const nd = new NetworkDiscovery();
    nd.localIPs = [
        { ip: '192.168.1.50', netmask: '255.255.255.0', mac: 'aa', name: 'eth0', priority: 20 },
        { ip: '10.0.0.50',    netmask: '255.255.255.0', mac: 'bb', name: 'eth1', priority: 10 }
    ];
    nd.localIP = '192.168.1.50';

    const app = express();
    // Override req.ip via X-Test-Client-IP so we can simulate students from
    // different subnets without actually binding to two interfaces in the test.
    app.use((req, _res, next) => {
        const hdr = req.headers['x-test-client-ip'];
        if (hdr) Object.defineProperty(req, 'ip', { get: () => hdr });
        next();
    });

    const identity = { serverId: 'srv-1', hostname: 'teacher-pc', mac: 'aa:bb:cc:dd:ee:ff' };

    // Mirrors server/index.js handlers exactly — see the file for source.
    app.get('/api/ping', (req, res) => {
        const advertiseIp = nd.pickAdvertiseAddrFor(req.ip || req.socket?.remoteAddress);
        res.json({
            serverId: identity.serverId,
            hostname: identity.hostname,
            mac: identity.mac,
            ip: advertiseIp,
            ips: nd.getAllLocalIPs(),
            ts: Date.now()
        });
    });
    app.get('/api/discovery-info', (req, res) => {
        const advertiseIp = nd.pickAdvertiseAddrFor(req.ip || req.socket?.remoteAddress);
        res.json({
            name: 'ClassSend Server',
            version: 'test',
            serverId: identity.serverId,
            hostname: identity.hostname,
            mac: identity.mac,
            ip: advertiseIp,
            ips: nd.getAllLocalIPs(),
            classes: [{ id: 'math', teacherName: 'Maria' }]
        });
    });
    return { app, nd };
}

let server, port;

beforeAll(() => new Promise(resolve => {
    const { app } = makeApp();
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        resolve();
    });
}));

afterAll(() => new Promise(resolve => server.close(resolve)));

function hit(path, clientIp) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1', port, path, method: 'GET',
            headers: clientIp ? { 'X-Test-Client-IP': clientIp } : {}
        }, res => {
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, json: JSON.parse(body) }); }
                catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.setTimeout(5000, () => req.destroy(new Error('timeout')));
        req.end();
    });
}

describe('/api/ping', () => {
    it('returns identity fields', async () => {
        const { json } = await hit('/api/ping', '192.168.1.10');
        expect(json).toMatchObject({ serverId: 'srv-1', hostname: 'teacher-pc' });
        expect(typeof json.ts).toBe('number');
    });

    it('hands a 192.168.1.x student the 192.168.1.50 NIC IP', async () => {
        const { json } = await hit('/api/ping', '192.168.1.10');
        expect(json.ip).toBe('192.168.1.50');
    });

    it('hands a 10.0.0.x student the 10.0.0.50 NIC IP (multi-NIC fix)', async () => {
        const { json } = await hit('/api/ping', '10.0.0.17');
        expect(json.ip).toBe('10.0.0.50');
    });

    it('falls back to primary IP for unroutable subnets', async () => {
        const { json } = await hit('/api/ping', '203.0.113.5');
        expect(json.ip).toBe('192.168.1.50');
    });

    it('always advertises the full ips[] list', async () => {
        const { json } = await hit('/api/ping', '10.0.0.17');
        expect(json.ips).toEqual(['192.168.1.50', '10.0.0.50']);
    });
});

describe('/api/discovery-info', () => {
    it('returns class list and identity', async () => {
        const { json } = await hit('/api/discovery-info', '192.168.1.10');
        expect(json.classes).toEqual([{ id: 'math', teacherName: 'Maria' }]);
        expect(json.serverId).toBe('srv-1');
    });

    it('also routes ip per-subnet', async () => {
        const a = (await hit('/api/discovery-info', '192.168.1.10')).json;
        const b = (await hit('/api/discovery-info', '10.0.0.17')).json;
        expect(a.ip).toBe('192.168.1.50');
        expect(b.ip).toBe('10.0.0.50');
    });
});

describe('endpoints under load', () => {
    it('handles 50 concurrent /api/ping in under 2 s on a busy machine', async () => {
        const start = Date.now();
        // Mix subnets to exercise the picker
        const reqs = Array.from({ length: 50 }, (_, i) =>
            hit('/api/ping', i % 2 ? '192.168.1.' + (i & 255) : '10.0.0.' + (i & 255))
        );
        const results = await Promise.all(reqs);
        expect(Date.now() - start).toBeLessThan(2000);
        expect(results.every(r => r.status === 200)).toBe(true);
        // Quick spot check of routing correctness
        const odd = results[1].json;
        expect(odd.ip).toBe('192.168.1.50');
        const even = results[0].json;
        expect(even.ip).toBe('10.0.0.50');
    });
});
