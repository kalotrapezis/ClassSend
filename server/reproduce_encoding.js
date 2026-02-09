const Bonjour = require('bonjour-service');

const instance = new Bonjour.default();
const greekClassId = "Τάξη-1";

const classes = [
    { id: greekClassId, teacherName: "Δάσκαλος" }
];

console.log("--- Starting Bonjour Encoding Test ---");
console.log("Original Classes:", classes);

// Publish
const service = instance.publish({
    name: 'ClassSend Test Encoding',
    type: 'classsend-test-enc',
    port: 3000,
    txt: {
        version: '4.0.0',
        classes: JSON.stringify(classes), // Sending raw JSON
        ip: '127.0.0.1'
    }
});

console.log("Service published. Searching...");

const browser = instance.find({ type: 'classsend-test-enc' });

let found = false;

browser.on('up', (svc) => {
    if (svc.name !== 'ClassSend Test Encoding') return;

    console.log(`Discovered Service: ${svc.name}`);
    console.log(`Raw TXT Classes:`, svc.txt.classes);

    try {
        const parsed = JSON.parse(svc.txt.classes);
        console.log("Parsed Classes:", parsed);

        if (parsed[0].id === greekClassId) {
            console.log("✅ SUCCESS: Greek characters preserved correctly.");
        } else {
            console.log("❌ FAILURE: Greek characters mismatched.");
            console.log(`Expected: ${greekClassId}`);
            console.log(`Got: ${parsed[0].id}`);
        }
    } catch (e) {
        console.log("❌ FAILURE: JSON Parse Parsing Error:", e.message);
    }
    found = true;
    cleanup();
});

function cleanup() {
    service.stop();
    instance.destroy();
    console.log("Test finished.");
    process.exit(0);
}

setTimeout(() => {
    if (!found) {
        console.log("❌ TIMEOUT: Service not found.");
        cleanup();
    }
}, 5000);
