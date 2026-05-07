import { describe, it, expect } from 'vitest';

// Mirror of the helpers added to client/main.js. Kept in-file so the test
// suite is self-contained (the client module is ESM with browser globals).
function _splitHostNum(s) {
    const m = (s || "").match(/^(.*?)(\d+)$/);
    if (!m) return { prefix: s || "", num: 0, hasNum: false };
    return { prefix: m[1], num: parseInt(m[2], 10), hasNum: true };
}
function hostnameLess(a, b) {
    const A = _splitHostNum(a), B = _splitHostNum(b);
    if (A.prefix !== B.prefix) return A.prefix.localeCompare(B.prefix);
    if (A.hasNum && B.hasNum) return A.num - B.num;
    return (a || "").localeCompare(b || "");
}
function fuzzyMatch(haystack, needle) {
    if (!needle) return true;
    const h = (haystack || "").toLowerCase();
    const n = needle.toLowerCase();
    if (h.includes(n)) return true;
    if (n.length < 4) return false;
    const m = h.length, k = n.length;
    if (Math.abs(m - k) > 1) return false;
    let prev = new Array(k + 1);
    let curr = new Array(k + 1);
    for (let j = 0; j <= k; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
        curr[0] = i;
        let rowMin = curr[0];
        for (let j = 1; j <= k; j++) {
            const cost = h[i - 1] === n[j - 1] ? 0 : 1;
            curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
            if (curr[j] < rowMin) rowMin = curr[j];
        }
        if (rowMin > 1) return false;
        [prev, curr] = [curr, prev];
    }
    return prev[k] <= 1;
}

describe('hostnameLess (ClassSend2-style sort)', () => {
    it('sorts numeric suffixes naturally (Lab1, Lab2, Lab10)', () => {
        const arr = ['Lab10', 'Lab2', 'Lab1', 'Lab20'].sort(hostnameLess);
        expect(arr).toEqual(['Lab1', 'Lab2', 'Lab10', 'Lab20']);
    });
    it('groups by prefix first', () => {
        const arr = ['B-1', 'A-2', 'A-1', 'B-2'].sort(hostnameLess);
        expect(arr).toEqual(['A-1', 'A-2', 'B-1', 'B-2']);
    });
    it('falls back to lexicographic for non-numeric names', () => {
        const arr = ['charlie', 'alice', 'bob'].sort(hostnameLess);
        expect(arr).toEqual(['alice', 'bob', 'charlie']);
    });
});

describe('fuzzyMatch (search filter)', () => {
    it('matches case-insensitive substring', () => {
        expect(fuzzyMatch('PC-Lab12 - Maria', 'lab')).toBe(true);
        expect(fuzzyMatch('PC-Lab12 - Maria', 'maria')).toBe(true);
    });
    it('returns true for empty query', () => {
        expect(fuzzyMatch('anything', '')).toBe(true);
    });
    it('rejects non-matching strings', () => {
        expect(fuzzyMatch('Lab12', 'xyz')).toBe(false);
    });
    it('tolerates a single typo for queries >=4 chars', () => {
        expect(fuzzyMatch('Maria', 'mari')).toBe(true);   // substring
        expect(fuzzyMatch('Maria', 'Marix')).toBe(true);  // substitution
    });
    it('does not fuzzy-match very short queries', () => {
        expect(fuzzyMatch('abc', 'xy')).toBe(false);
    });
});
