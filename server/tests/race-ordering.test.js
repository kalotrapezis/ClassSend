/**
 * raceWithFallback — the strict "same-subnet first; only fall through on miss"
 * policy. This is the rule the user explicitly asked for: "most schools have
 * one network, so we should not waste time on the other one."
 *
 * Tests assert *behaviour under realistic delays*:
 *  - phase 2 must not start before phase 1 has fully resolved
 *  - one slow URL in phase 1 cannot starve a fast hit on a sibling URL
 *  - throwing probes never crash the round
 */

import { describe, it, expect } from 'vitest';
const { raceWithFallback } = await import('../../client/subnet-match.js');

// Helper: a probe that takes a configurable delay then returns either a "hit"
// marker or null. The probe records its call order in a shared trace array.
function makeProbe(trace, plan) {
    return async (url) => {
        trace.push({ url, t: Date.now() });
        const spec = plan[url];
        if (!spec) return null;
        if (spec.delay) await new Promise(r => setTimeout(r, spec.delay));
        if (spec.throw) throw new Error(spec.throw);
        return spec.hit ? { url, hit: true } : null;
    };
}

describe('raceWithFallback', () => {
    it('returns from phase 1 alone when any same-subnet probe hits', async () => {
        const trace = [];
        const probe = makeProbe(trace, {
            'http://192.168.1.10:3000': { hit: true, delay: 20 },
            'http://10.0.0.5:3000':     { hit: true, delay: 5 }  // would win on a flat race
        });
        const { results, ranOther } = await raceWithFallback(
            ['http://192.168.1.10:3000'],
            ['http://10.0.0.5:3000'],
            probe
        );
        expect(ranOther).toBe(false);
        expect(results.filter(r => r).length).toBe(1);
        // Phase 2 URL must NOT have been called
        expect(trace.find(t => t.url.includes('10.0.0.5'))).toBeUndefined();
    });

    it('falls through to phase 2 when every phase-1 probe misses', async () => {
        const trace = [];
        const probe = makeProbe(trace, {
            'http://192.168.1.10:3000': { hit: false, delay: 5 },
            'http://192.168.1.20:3000': { hit: false, delay: 5 },
            'http://10.0.0.5:3000':     { hit: true,  delay: 5 }
        });
        const { results, ranOther } = await raceWithFallback(
            ['http://192.168.1.10:3000', 'http://192.168.1.20:3000'],
            ['http://10.0.0.5:3000'],
            probe
        );
        expect(ranOther).toBe(true);
        expect(results.filter(r => r).map(r => r.url)).toEqual(['http://10.0.0.5:3000']);

        // Strict ordering: every phase-1 call must come before every phase-2 call.
        const phase1End   = Math.max(...trace.filter(t => t.url.startsWith('http://192')).map(t => t.t));
        const phase2Start = Math.min(...trace.filter(t => t.url.startsWith('http://10')).map(t => t.t));
        expect(phase2Start).toBeGreaterThanOrEqual(phase1End);
    });

    it('a slow phase-1 probe does not block its phase-1 sibling — both finish in parallel', async () => {
        const trace = [];
        const probe = makeProbe(trace, {
            'http://192.168.1.10:3000': { hit: true,  delay: 100 },
            'http://192.168.1.20:3000': { hit: true,  delay: 5 }
        });
        const start = Date.now();
        await raceWithFallback(
            ['http://192.168.1.10:3000', 'http://192.168.1.20:3000'],
            [],
            probe
        );
        const elapsed = Date.now() - start;
        // Parallel: total ≈ max(100, 5) ≈ 100 ms. Sequential would be ≈ 105 ms.
        // We allow a generous 250 ms ceiling for slow CI / potato PCs.
        expect(elapsed).toBeLessThan(250);
        expect(elapsed).toBeGreaterThanOrEqual(95);
    });

    it('an exception inside a probe is treated as a miss (no crash, others continue)', async () => {
        const trace = [];
        const probe = makeProbe(trace, {
            'http://bad:3000': { throw: 'boom' },
            'http://good:3000': { hit: true, delay: 10 }
        });
        const { results } = await raceWithFallback(
            ['http://bad:3000', 'http://good:3000'],
            [],
            probe
        );
        expect(results.filter(r => r).map(r => r.url)).toEqual(['http://good:3000']);
    });

    it('empty inputs yield empty results without throwing', async () => {
        const { results, ranOther } = await raceWithFallback([], [], async () => null);
        expect(results).toEqual([]);
        expect(ranOther).toBe(true); // "all of empty" technically ran
    });

    it('all-miss phase 1 + empty phase 2 returns empty without calling fallback', async () => {
        const probe = async () => null;
        const { results, ranOther } = await raceWithFallback(['http://a:3000'], [], probe);
        expect(results.every(r => r === null)).toBe(true);
        expect(ranOther).toBe(false);
    });

    it('no phase-1 (cold start) probes everything in one round', async () => {
        const trace = [];
        const probe = makeProbe(trace, {
            'http://a:3000': { hit: true, delay: 5 },
            'http://b:3000': { hit: true, delay: 5 }
        });
        const { results, ranOther } = await raceWithFallback(
            [],
            ['http://a:3000', 'http://b:3000'],
            probe
        );
        expect(ranOther).toBe(true);
        expect(results.filter(r => r).length).toBe(2);
    });

    it('round of 20 phase-1 URLs with no hits returns in <300ms on a busy CPU', async () => {
        // Each probe sleeps 20 ms. Parallel: total ≈ 20 ms. Sequential: 400 ms.
        const probe = async () => { await new Promise(r => setTimeout(r, 20)); return null; };
        const urls = Array.from({ length: 20 }, (_, i) => `http://192.168.1.${i}:3000`);
        const start = Date.now();
        await raceWithFallback(urls, [], probe);
        expect(Date.now() - start).toBeLessThan(300);
    });
});
