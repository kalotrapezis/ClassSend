const Bonjour = require('bonjour-service');
const os = require('os');
const dgram = require('dgram');

console.log("=== ClassSend Network Discovery Debugger ===");

// 1. List Interfaces
console.log("\n[1] Network Interfaces:");
const interfaces = os.networkInterfaces();
let bestIP = null;

for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
            console.log(` - ${name}: ${iface.address} (Netmask: ${iface.netmask})`);
            // Heuristic (skipping 169.254)
            if (!iface.address.startsWith('169.254')) {
                bestIP = iface.address;
            }
        }
    }
}
console.log(`Detected Best IP: ${bestIP}`);

// 2. Test Multicast Binding
console.log("\n[2] Testing mDNS Multicast Binding...");
const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

socket.bind(5353, () => {
    console.log("✅ UDP Port 5353 bind successful.");
    socket.close();
    startBonjourTest();
});

socket.on('error', (err) => {
    console.error(`❌ UDP Bind Error (Port 5353): ${err.message}`);
    console.log("   -> This usually means another app (or ClassSend itself) is using the port.");
    console.log("   -> If ClassSend is running, this is expected.");
    startBonjourTest();
});

function startBonjourTest() {
    console.log("\n[3] Publishing Test Service 'ClassSend-Debug'...");
    const bonjour = new Bonjour.default();

    try {
        const service = bonjour.publish({
            name: 'ClassSend-Debug',
            type: 'classsend-debug',
            port: 3000,
            txt: { info: "debug-test" }
        });

        console.log("   -> Service published. Listening for self...");

        const browser = bonjour.find({ type: 'classsend-debug' });

        let found = false;
        browser.on('up', (svc) => {
            if (svc.name === 'ClassSend-Debug') {
                console.log("✅ SUCCESS: Discovered own service via mDNS.");
                console.log(`   -> Name: ${svc.name}`);
                console.log(`   -> IP: ${svc.referer ? svc.referer.address : 'unknown'}`);
                found = true;
                cleanup(bonjour, service);
            }
        });

        setTimeout(() => {
            if (!found) {
                console.log("❌ TIMEOUT: Could not discover own service.");
                console.log("   -> Possible Firewall block on UDP 5353.");
                console.log("   -> Possible Multicast blocked by Router.");
            }
            cleanup(bonjour, service);
        }, 5000);

    } catch (e) {
        console.error("❌ Bonjour Publish Error:", e.message);
    }
}

function cleanup(bonjour, service) {
    if (service) service.stop();
    bonjour.destroy();
    console.log("\n=== End Debug ===");
}
