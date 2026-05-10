/**
 * Known-Servers History (ClassSend2-style)
 *
 * Stores rich entries instead of bare URLs:
 *   { url, host, mac, serverId, teacherName, lastSeen }
 *
 * - `mac` / `serverId` make the entry survive DHCP IP changes (we can re-probe by
 *   hostname or fall back to mDNS lookup keyed by MAC).
 * - `teacherName` is shown in the auto-connect UI so a student PC remembers
 *   "this is Maria's PC" even when she's offline.
 * - `lastSeen` lets us prefer recent teachers and prune ancient entries.
 *
 * Backwards compatible: if localStorage holds the old `string[]`, it's
 * auto-migrated on first read.
 */

const STORAGE_KEY = 'classsend-known-servers';
const MAX_ENTRIES = 20;

function _normalizeUrl(u) {
    if (!u) return '';
    return String(u).split('?')[0].replace(/\/+$/, '');
}

export function loadKnownServers() {
    let raw;
    try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
    if (!Array.isArray(raw)) return [];

    // Migrate legacy string[] format
    const migrated = raw.map(entry => {
        if (typeof entry === 'string') {
            return { url: _normalizeUrl(entry), host: null, mac: null, serverId: null, teacherName: null, addresses: [], lastSeen: 0 };
        }
        if (entry && typeof entry === 'object' && entry.url) {
            return {
                url: _normalizeUrl(entry.url),
                host: entry.host || null,
                mac: entry.mac || null,
                serverId: entry.serverId || null,
                teacherName: entry.teacherName || null,
                // Multi-NIC: every IP the server is reachable on. Used by
                // expandCandidates so a teacher with two NICs is found from
                // either subnet.
                addresses: Array.isArray(entry.addresses) ? entry.addresses.filter(Boolean) : [],
                lastSeen: Number(entry.lastSeen) || 0
            };
        }
        return null;
    }).filter(Boolean);

    return migrated;
}

export function saveKnownServers(list) {
    try {
        const trimmed = list.slice(0, MAX_ENTRIES);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (e) { /* quota — ignore */ }
}

/**
 * Upsert a server entry. Identity priority: serverId > mac > host > url.
 * Moves the entry to the front and updates lastSeen.
 */
export function upsertKnownServer(entry) {
    if (!entry || !entry.url) return;
    entry = {
        url: _normalizeUrl(entry.url),
        host: entry.host || null,
        mac: entry.mac || null,
        serverId: entry.serverId || null,
        teacherName: entry.teacherName || null,
        addresses: Array.isArray(entry.addresses) ? entry.addresses.filter(Boolean) : [],
        lastSeen: Date.now()
    };

    const list = loadKnownServers();
    const matchIdx = list.findIndex(e =>
        (entry.serverId && e.serverId === entry.serverId) ||
        (entry.mac && e.mac && e.mac === entry.mac) ||
        (entry.host && e.host && e.host.toLowerCase() === entry.host.toLowerCase()) ||
        (e.url === entry.url)
    );
    if (matchIdx !== -1) {
        // Merge — never erase fields we already knew with nulls. For addresses
        // we union both lists so a server seen first via one NIC and then
        // another keeps both reachable IPs in history.
        const prev = list[matchIdx];
        const mergedAddrs = Array.from(new Set([
            ...(entry.addresses || []),
            ...(prev.addresses || [])
        ])).filter(Boolean);
        entry = {
            url: entry.url || prev.url,
            host: entry.host || prev.host,
            mac: entry.mac || prev.mac,
            serverId: entry.serverId || prev.serverId,
            teacherName: entry.teacherName || prev.teacherName,
            addresses: mergedAddrs,
            lastSeen: entry.lastSeen
        };
        list.splice(matchIdx, 1);
    }
    list.unshift(entry);
    saveKnownServers(list);
    return entry;
}

export function removeKnownServer(predicate) {
    const list = loadKnownServers().filter(e => !predicate(e));
    saveKnownServers(list);
}

/**
 * Build the candidate URL list for a probe pass. We expand each known entry
 * into multiple URLs so DHCP / hostname changes don't break reconnect:
 *   - the recorded URL
 *   - http://<host>:<port>   (mDNS resolves this if mac/IP changed)
 *   - http://<host>.local:<port>
 * Caller probes them all in parallel; first hit wins.
 */
export function expandCandidates(entries, ownOrigin) {
    const seen = new Set();
    const out = [];
    const ownNorm = _normalizeUrl(ownOrigin);
    const push = (u) => {
        const n = _normalizeUrl(u);
        if (!n || n === ownNorm || seen.has(n)) return;
        seen.add(n);
        out.push(n);
    };

    for (const e of entries) {
        push(e.url);
        // Multi-NIC: try every advertised address for this server. A teacher PC
        // with Wi-Fi and Ethernet on different subnets stores both IPs; the
        // student's network may only route to one of them.
        let port = '3000';
        try { port = new URL(e.url).port || '3000'; } catch { }
        if (Array.isArray(e.addresses)) {
            for (const ip of e.addresses) {
                if (ip) push(`http://${ip}:${port}`);
            }
        }
        if (e.host) {
            push(`http://${e.host}:${port}`);
            if (!e.host.endsWith('.local')) {
                push(`http://${e.host}.local:${port}`);
            }
        }
    }
    return out;
}
