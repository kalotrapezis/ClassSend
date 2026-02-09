const Bonjour = require('bonjour-service');

const instance = new Bonjour.default();
const greekClassId = "Τάξη-1";
// This logic matches server/index.js
const safeClassId = greekClassId.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
const hostname = `${safeClassId}.local`;

console.log(`Original Class ID: ${greekClassId}`);
console.log(`Sanitized Hostname: ${hostname}`);

console.log("--- Starting Bonjour Hostname Test ---");

try {
    const service = instance.publish({
        name: `ClassSend-${greekClassId}`,
        type: 'http',
        port: 3000,
        host: hostname, // Testing if this causes issues
        txt: {
            classId: greekClassId
        }
    });

    service.on('error', (err) => {
        console.log("❌ Service Error Event:", err);
    });

    console.log("Service publish called. Waiting...");

    setTimeout(() => {
        console.log("Timeout reached. If no error, it might be 'silent' failure or success.");
        service.stop();
        instance.destroy();
    }, 3000);

} catch (e) {
    console.error("❌ Exception during publish:", e);
}
