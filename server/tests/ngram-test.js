
const bayes = require('bayes');
const ngramTokenizer = require('../lib/ngram-tokenizer');

// Initialize classifier with our tokenizer
const classifier = bayes({
    tokenizer: function (text) {
        return ngramTokenizer.tokenize(text);
    }
});

async function runTest() {
    console.log('🧪 Testing N-gram Classifier for Greek Morphology');

    // Train on a single form
    const trainWord = 'μαλάκας';
    console.log(`📚 Training on: "${trainWord}" (profane)`);
    await classifier.learn(trainWord, 'profane');

    // Train on some clean words to provide balance
    await classifier.learn('καλημέρα', 'clean');
    await classifier.learn('σχολείο', 'clean');
    await classifier.learn('μάθημα', 'clean');

    // Test variations
    const testWords = [
        'μαλάκας',   // Exact match
        'μαλάκες',   // Plural
        'μαλάκα',    // Vocative
        'μαλακισμένο', // Derivative
        'καλημέρα',  // Clean match
        'σπίτι',     // Unknown clean
        'μαθητής'    // Unknown clean similar to clean
    ];

    console.log('\n📊 Results:');
    for (const word of testWords) {
        const category = await classifier.categorize(word);
        // Note: bayes library doesn't easily give probability in standard categorize,
        // but let's see the classification.
        const tokens = ngramTokenizer.tokenize(word);
        console.log(`Word: "${word}" -> Category: ${category}`);
        // console.log(`   Tokens: ${JSON.stringify(tokens)}`);
    }
}

runTest();
