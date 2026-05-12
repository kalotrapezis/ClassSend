import { describe, it, expect } from 'vitest';

// Live integration smoke — assumes the server is running on :3000 (see Bash
// instructions in PR notes). When the server is NOT running these tests are
// skipped so CI doesn't fail on the environment, only on real bugs.
const SERVER = process.env.CLASSSEND_TEST_URL || 'http://127.0.0.1:3000';

async function up() {
    try {
        const r = await fetch(`${SERVER}/api/ping`, { signal: AbortSignal.timeout(1000) });
        return r.ok;
    } catch { return false; }
}

describe('live server smoke (requires server on :3000)', async () => {
    const live = await up();
    const t = live ? it : it.skip;

    t('GET /api/ping returns serverId/hostname/mac', async () => {
        const r = await fetch(`${SERVER}/api/ping`);
        expect(r.ok).toBe(true);
        const j = await r.json();
        expect(j.serverId).toBeTruthy();
        expect(j.hostname).toBeTruthy();
        expect(j.mac).toBeTruthy();
        expect(typeof j.ts).toBe('number');
    });

    t('GET /api/discovery-info exposes the same identity', async () => {
        const ping = await (await fetch(`${SERVER}/api/ping`)).json();
        const info = await (await fetch(`${SERVER}/api/discovery-info`)).json();
        expect(info.serverId).toBe(ping.serverId);
        expect(info.hostname).toBe(ping.hostname);
        expect(info.mac).toBe(ping.mac);
        expect(Array.isArray(info.classes)).toBe(true);
    });

    t('parallel probe of 12 candidates completes <1.5s', async () => {
        const t0 = Date.now();
        const urls = Array.from({ length: 12 }, () => `${SERVER}/api/ping`);
        const results = await Promise.all(urls.map(u =>
            fetch(u).then(r => r.json()).catch(() => null)));
        expect(results.filter(Boolean).length).toBe(12);
        expect(Date.now() - t0).toBeLessThan(1500);
    });
});
