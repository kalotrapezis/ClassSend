/**
 * Pure helpers for same-subnet-first probe ordering.
 *
 * Kept dependency-free (no DOM, no Electron) so they can be unit-tested in Node
 * and imported from `client/main.js` in the renderer.
 */

export function ipv4ToInt(ip) {
    if (typeof ip !== 'string') return null;
    const p = ip.split('.').map(n => parseInt(n, 10));
    if (p.length !== 4) return null;
    for (const n of p) {
        if (Number.isNaN(n) || n < 0 || n > 255) return null;
    }
    return (((p[0] << 24) >>> 0) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
}

/**
 * True if `candidateIp` shares a subnet with at least one NIC.
 * NICs: { ip, netmask } shape (matches Node's os.networkInterfaces() entries).
 * Returns false (not throws) on any malformed input.
 */
export function isSameSubnet(candidateIp, nics) {
    const a = ipv4ToInt(candidateIp);
    if (a === null || !Array.isArray(nics)) return false;
    for (const n of nics) {
        if (!n) continue;
        const b = ipv4ToInt(n.ip);
        const m = ipv4ToInt(n.netmask);
        if (b === null || m === null) continue;
        if ((a & m) === (b & m)) return true;
    }
    return false;
}

/**
 * If `url` is an `http(s)://A.B.C.D[:port]/...` URL, returns the IPv4 host.
 * Returns null for hostnames, .local, IPv6, malformed URLs.
 */
export function extractIPv4(url) {
    try {
        const h = new URL(url).hostname;
        return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h) && ipv4ToInt(h) !== null ? h : null;
    } catch { return null; }
}

/**
 * Split candidate URLs into [sameSubnet, other] given the student's NICs.
 * Non-IPv4 URLs (hostnames, .local) always go to `other` — we can't statically
 * decide which subnet they'll resolve to, so they're tried only after the
 * fast same-subnet round.
 */
/**
 * Two-phase race: probe every `sameSubnet` URL in parallel; only if every one
 * misses do we run a second parallel round over `other`. Mirrors the policy in
 * client/main.js so we can unit-test the ordering without a real network.
 *
 * `probe` is an async function taking a URL and resolving to a truthy result
 * on hit or null on miss. Errors inside probe are treated as misses (we never
 * let one bad URL block the others).
 *
 * Returns { results, ranOther } where `results` is the merged array
 * (same-phase first, then other-phase if it ran) and `ranOther` is true iff
 * the second phase was actually executed.
 */
export async function raceWithFallback(sameSubnet, other, probe) {
    const safe = async (u) => {
        try { return await probe(u); } catch { return null; }
    };
    if (sameSubnet.length > 0) {
        const first = await Promise.all(sameSubnet.map(safe));
        if (first.some(r => r)) return { results: first, ranOther: false };
        if (other.length === 0)  return { results: first, ranOther: false };
        const second = await Promise.all(other.map(safe));
        return { results: first.concat(second), ranOther: true };
    }
    // No same-subnet info — probe everything in one round.
    const all = await Promise.all(other.map(safe));
    return { results: all, ranOther: true };
}

export function partitionCandidates(urls, nics) {
    const same = [];
    const other = [];
    if (!Array.isArray(urls)) return { same, other };
    const haveNics = Array.isArray(nics) && nics.length > 0;
    for (const u of urls) {
        const ip = extractIPv4(u);
        if (ip && haveNics && isSameSubnet(ip, nics)) same.push(u);
        else other.push(u);
    }
    return { same, other };
}
