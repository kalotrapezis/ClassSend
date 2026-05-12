import { describe, it, expect } from 'vitest';
const NetworkDiscovery = (await import('../network-discovery.js'));
const Ctor = NetworkDiscovery.default || NetworkDiscovery;

describe('NetworkDiscovery.pickAdvertiseAddrFor (multi-NIC)', () => {
    function build(localIPs) {
        const nd = new Ctor();
        nd.localIPs = localIPs;
        nd.localIP = localIPs[0]?.ip || 'localhost';
        return nd;
    }

    const NIC_A = { ip: '192.168.1.50', netmask: '255.255.255.0', mac: 'aa', name: 'Ethernet 1', priority: 10 };
    const NIC_B = { ip: '10.0.0.50',    netmask: '255.255.255.0', mac: 'bb', name: 'Ethernet 2', priority: 10 };

    it('picks NIC-A for a student on 192.168.1.x', () => {
        const nd = build([NIC_A, NIC_B]);
        expect(nd.pickAdvertiseAddrFor('192.168.1.15')).toBe('192.168.1.50');
    });

    it('picks NIC-B for a student on 10.0.0.x', () => {
        const nd = build([NIC_A, NIC_B]);
        expect(nd.pickAdvertiseAddrFor('10.0.0.17')).toBe('10.0.0.50');
    });

    it('falls back to primary IP for an unreachable subnet', () => {
        const nd = build([NIC_A, NIC_B]);
        expect(nd.pickAdvertiseAddrFor('172.16.5.5')).toBe('192.168.1.50');
    });

    it('strips ::ffff: IPv4-mapped prefix before subnet match', () => {
        const nd = build([NIC_A, NIC_B]);
        expect(nd.pickAdvertiseAddrFor('::ffff:10.0.0.17')).toBe('10.0.0.50');
    });

    it('returns primary for loopback', () => {
        const nd = build([NIC_A, NIC_B]);
        expect(nd.pickAdvertiseAddrFor('127.0.0.1')).toBe('192.168.1.50');
        expect(nd.pickAdvertiseAddrFor('::1')).toBe('192.168.1.50');
    });

    it('single-NIC teacher always returns its only IP', () => {
        const nd = build([NIC_A]);
        expect(nd.pickAdvertiseAddrFor('10.0.0.17')).toBe('192.168.1.50');
        expect(nd.pickAdvertiseAddrFor('192.168.1.99')).toBe('192.168.1.50');
    });
});
