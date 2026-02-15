
const bayes = require('bayes');
const ngramTokenizer = require('../lib/ngram-tokenizer');
const fs = require('fs');
const path = require('path');

// Mock data loading simulation
async function runFullTest() {
    console.log('🧪 Testing Full Data Training & Persistence');

    // Initialize
    const classifier = bayes({
        tokenizer: function (text) { return ngramTokenizer.tokenize(text); }
    });

    // 1. Load User Data (Simulated from C:\Users\Teo\Downloads\classsend-data-2026-02-02.json)
    // We'll read it from the source if possible
    const specificDataPath = 'C:\\Users\\Teo\\Downloads\\classsend-data-2026-02-02.json';
    if (fs.existsSync(specificDataPath)) {
        console.log(`📂 Reading user data from: ${specificDataPath}`);
        const raw = fs.readFileSync(specificDataPath, 'utf-8');
        const trainingData = JSON.parse(raw);

        // Train Blacklist
        console.log(`   Training ${trainingData.blacklist.length} blacklist items...`);
        for (const item of trainingData.blacklist) {
            await classifier.learn(item.word, 'profane');
        }

        // Train Whitelist
        console.log(`   Training ${trainingData.whitelist.length} whitelist items...`);
        for (const item of trainingData.whitelist) {
            await classifier.learn(item.word, 'clean');
        }
    } else {
        console.warn('⚠️ User data file not found for test.');
    }

    // 2. Add some diverse clean words to balance priors (Simulating what should happen)
    const commonClean = ['και', 'το', 'για', 'από', 'είναι', 'δεν', 'με', 'μου', 'που', 'μαθητής', 'δάσκαλος', 'τάξη', 'βιβλίο', 'στυλό', 'μολύβι', 'διαβάζω', 'γράφω'];
    for (const word of commonClean) {
        await classifier.learn(word, 'clean');
    }

    console.log('🧠 Training complete.');

    // 3. Test Cases (Real world)
    const cases = [
        { text: 'καλημέρα κύριε', expected: 'clean' },
        { text: 'είσαι πολύ καλός', expected: 'clean' },
        { text: 'είσαι βλάκας', expected: 'profane' },
        { text: 'βλακέντιε', expected: 'profane' }, // Derivative
        { text: 'άντε γαμήσου', expected: 'profane' },
        { text: 'γαμώ το σπίτι σου', expected: 'profane' },
        { text: 'το σπίτι είναι ωραίο', expected: 'clean' } // Contextual? Naive bayes might struggle here if 'σπίτι' is neutral
    ];

    console.log('\n📊 Real-world Validation:');
    for (const c of cases) {
        const result = await classifier.categorize(c.text);

        // Manual simple check for token overlaps to understand why
        const tokens = ngramTokenizer.tokenize(c.text);

        console.log(`"${c.text}" -> ${result} [Expected: ${c.expected}]`);
    }

    // 4. Persistence Test
    const json = classifier.toJson();
    console.log(`\n💾 Model JSON Size: ${(json.length / 1024).toFixed(2)} KB`);

    // Reload
    const reloaded = bayes.fromJson(json);
    reloaded.tokenizer = function (t) { return ngramTokenizer.tokenize(t); };

    const reloadCheck = await reloaded.categorize('βλάκας');
    console.log(`🔄 Reload Check ("βλάκας"): ${reloadCheck}`);
}

runFullTest();
