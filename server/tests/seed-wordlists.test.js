/**
 * Seed wordlists — first-boot defaults so the filter is not overprotective.
 *
 * What we lock in here:
 *  - Both lists exist and are non-empty (broken JSON edit would zero them).
 *  - Seed entries lowercase and trimmed (mixing cases would defeat the
 *    case-insensitive substring match in the server filter pipeline).
 *  - addedAt is present (the UI sorts by date; missing field crashes that).
 *  - The two lists do NOT overlap — a word can't be both whitelisted and
 *    blacklisted at the same time. If a future seed edit introduces an
 *    overlap, this test fires.
 */

import { describe, it, expect } from 'vitest';
const seed = await import('../data/seed-wordlists.js');

const mod = seed.default || seed;

describe('seed wordlists', () => {
    it('exports non-empty blacklist and whitelist arrays', () => {
        expect(Array.isArray(mod.BLACKLIST)).toBe(true);
        expect(Array.isArray(mod.WHITELIST)).toBe(true);
        expect(mod.BLACKLIST.length).toBeGreaterThan(0);
        expect(mod.WHITELIST.length).toBeGreaterThan(0);
    });

    it('blacklistEntries / whitelistEntries produce { word, addedAt } objects', () => {
        const bl = mod.blacklistEntries();
        const wl = mod.whitelistEntries();
        for (const e of bl) {
            expect(typeof e.word).toBe('string');
            expect(typeof e.addedAt).toBe('string');
            expect(e.addedAt.length).toBeGreaterThan(0);
        }
        for (const e of wl) {
            expect(typeof e.word).toBe('string');
            expect(typeof e.addedAt).toBe('string');
        }
    });

    it('all entries are normalized: lowercase and trimmed', () => {
        for (const e of mod.blacklistEntries()) {
            expect(e.word).toBe(e.word.toLowerCase());
            expect(e.word).toBe(e.word.trim());
        }
        for (const e of mod.whitelistEntries()) {
            expect(e.word).toBe(e.word.toLowerCase());
            expect(e.word).toBe(e.word.trim());
        }
    });

    it('blacklist and whitelist do not contain duplicate words within their own list', () => {
        const seenB = new Set();
        for (const e of mod.blacklistEntries()) {
            expect(seenB.has(e.word), `duplicate blacklist word: ${e.word}`).toBe(false);
            seenB.add(e.word);
        }
        const seenW = new Set();
        for (const e of mod.whitelistEntries()) {
            expect(seenW.has(e.word), `duplicate whitelist word: ${e.word}`).toBe(false);
            seenW.add(e.word);
        }
    });

    it('no word appears in both blacklist and whitelist', () => {
        const bl = new Set(mod.blacklistEntries().map(e => e.word));
        for (const e of mod.whitelistEntries()) {
            expect(bl.has(e.word), `word "${e.word}" appears in both lists`).toBe(false);
        }
    });

    it('SEED_VERSION is a sortable date string', () => {
        expect(typeof mod.SEED_VERSION).toBe('string');
        // Loose: just confirm it parses to a valid date so the UI's "added on"
        // display does not show "Invalid Date".
        const d = new Date(mod.SEED_VERSION);
        expect(Number.isNaN(d.getTime())).toBe(false);
    });
});
