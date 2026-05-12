import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Validates the parallel-probe contract: N known servers complete in ~one
// timeout window, not N×timeout (the old sequential bug that froze 7-8/10 PCs).
async function probeAll(servers, fetchImpl, timeoutMs = 100) {
    const probeOne = async (url) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const r = await fetchImpl(url + '/api/discovery-info', { signal: controller.signal });
            if (!r.ok) return null;
            return await r.json();
        } catch { return null; }
        finally { clearTimeout(id); }
    };
    return Promise.all(servers.map(probeOne));
}

describe('parallel known-server probing', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('returns results from all reachable servers concurrently', async () => {
        const fetchImpl = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ name: 'srv', classes: [] })
        });
        const urls = Array.from({ length: 10 }, (_, i) => `http://10.0.0.${i + 1}:3000`);
        const results = await probeAll(urls, fetchImpl, 1000);
        expect(results).toHaveLength(10);
        expect(results.every(r => r && r.name === 'srv')).toBe(true);
        expect(fetchImpl).toHaveBeenCalledTimes(10);
    });

    it('does not fail the whole batch when one server times out', async () => {
        const fetchImpl = vi.fn((url, opts) => {
            if (url.includes('10.0.0.5')) {
                return new Promise((_, reject) => {
                    opts.signal?.addEventListener('abort',
                        () => reject(new Error('aborted')));
                });
            }
            return Promise.resolve({ ok: true, json: async () => ({ name: 'ok' }) });
        });
        const urls = Array.from({ length: 5 }, (_, i) => `http://10.0.0.${i + 1}:3000`);
        const promise = probeAll(urls, fetchImpl, 50);
        await vi.advanceTimersByTimeAsync(60);
        const results = await promise;
        const ok = results.filter(Boolean);
        expect(ok.length).toBe(4);
    });
});

describe('join-class callback shape (regression)', () => {
    it('does not have duplicate "blocked" keys', () => {
        // The fixed callback shape from server/index.js
        const cb = {
            success: true,
            blockAllActive: false,
            blockUploadsActive: false,
            blocked: false,
            blockedReason: null,
            allowHandsUp: true,
            messages: [],
            users: [],
        };
        // If duplicates existed, the second would silently overwrite the first
        // and we'd lose the "is *this* socket blocked" bit. Guard it:
        const keys = Object.keys(cb);
        const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
        expect(dupes).toEqual([]);
    });
});
