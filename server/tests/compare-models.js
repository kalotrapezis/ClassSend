
const path = require('path');
const fs = require('fs');
const bayes = require('bayes');
const { pipeline } = require('@xenova/transformers');
const ngramTokenizer = require('../lib/ngram-tokenizer');

// --- Configuration ---
const TEST_DATA = require('./expanded-test-data');

async function loadData() {
    // Transform the structured data into the flat format expected by the test
    let data = { en: [], gr: [] };

    // Process English
    TEST_DATA.en.profane.forEach(text => data.en.push({ text, label: 'profane' }));
    TEST_DATA.en.clean.forEach(text => data.en.push({ text, label: 'clean' }));

    // Process Greek
    TEST_DATA.gr.profane.forEach(text => data.gr.push({ text, label: 'profane' }));
    TEST_DATA.gr.clean.forEach(text => data.gr.push({ text, label: 'clean' }));


    return data;
}

async function runComparison() {
    console.log("🚀 Starting Model Comparison (N-gram vs Deep Learning)...");

    const fullData = await loadData();

    // Split Data 20/80
    const splitData = (items) => {
        // Shuffle
        for (let i = items.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
        }
        const splitIndex = Math.floor(items.length * 0.2);
        return {
            train: items.slice(0, splitIndex),
            test: items.slice(splitIndex)
        };
    };

    const enSplit = splitData(fullData.en);
    const grSplit = splitData(fullData.gr);

    console.log(`📊 Data Split:`);
    console.log(`   English: ${enSplit.train.length} train, ${enSplit.test.length} test`);
    console.log(`   Greek:   ${grSplit.train.length} train, ${grSplit.test.length} test`);

    // --- 1. Train N-gram Classifier ---
    console.log(`\n🧠 Training N-gram Naive Bayes...`);
    const classifier = bayes({
        tokenizer: function (text) { return ngramTokenizer.tokenize(text); }
    });

    const trainSet = [...enSplit.train, ...grSplit.train];
    for (const item of trainSet) {
        await classifier.learn(item.text, item.label);
    }
    console.log(`   Trained on ${trainSet.length} items.`);

    // --- 2. Load Deep Learning Model ---
    console.log(`\n🧠 Loading Deep Learning Model (Xenova/toxic-bert)...`);
    let toxicityClassifier;
    try {
        toxicityClassifier = await pipeline('text-classification', 'Xenova/toxic-bert');
    } catch (e) {
        console.error("   Failed to load Deep Learning model. Aborting comparison.", e);
        return;
    }

    // --- 3. Evaluation ---
    async function evaluate(modelName, testSet, lang) {
        let correct = 0;
        let total = testSet.length;
        let fp = 0; // False Positives (Clean -> Profane)
        let fn = 0; // False Negatives (Profane -> Clean)

        console.log(`\n   Creating predictions for ${modelName} (${lang})...`);

        // Helper to Calculate Confidence (Copy-Paste from server for test isolation)
        const getConfidence = async (text) => {
            const tokens = await classifier.tokenizer(text);
            const frequencyTable = classifier.frequencyTable(tokens);
            const categories = Object.keys(classifier.categories);
            let logProbs = {};
            let maxLogProb = -Infinity;
            categories.forEach(category => {
                let categoryProbability = classifier.docCount[category] / classifier.totalDocuments;
                let logProbability = Math.log(categoryProbability);
                Object.keys(frequencyTable).forEach(token => {
                    const frequencyInText = frequencyTable[token];
                    const tokenProbability = classifier.tokenProbability(token, category);
                    logProbability += frequencyInText * Math.log(tokenProbability);
                });
                logProbs[category] = logProbability;
                if (logProbability > maxLogProb) maxLogProb = logProbability;
            });
            let sumExp = 0;
            categories.forEach(cat => sumExp += Math.exp(logProbs[cat] - maxLogProb));
            let probs = {};
            categories.forEach(cat => probs[cat] = Math.exp(logProbs[cat] - maxLogProb) / sumExp);
            return (probs['profane'] || 0) * 100;
        };

        for (const item of testSet) {
            let isProfane = false;

            if (modelName === 'N-gram') {
                // Use Confidence > 50%
                const conf = await getConfidence(item.text);
                isProfane = conf > 50;
            } else {
                // DL
                const results = await toxicityClassifier(item.text);
                const label = results[0].label;
                isProfane = label === 'LABEL_1' || label === 'toxic';
            }

            const actualProfane = item.label === 'profane';

            if (isProfane === actualProfane) {
                correct++;
            } else {
                if (isProfane && !actualProfane) fp++;
                if (!isProfane && actualProfane) fn++;
            }
        }

        const score = (correct / total) * 100;
        console.log(`   => ${modelName} (${lang}) Score: ${score.toFixed(2)}% | FP: ${fp} | FN: ${fn}`);
        return { score, fp, fn };
    }

    const ngramScoreEN = await evaluate('N-gram', enSplit.test, 'English');
    const dlScoreEN = await evaluate('DeepLearning', enSplit.test, 'English');

    const ngramScoreGR = await evaluate('N-gram', grSplit.test, 'Greek');
    const dlScoreGR = await evaluate('DeepLearning', grSplit.test, 'Greek');

    // --- 4. Final Verdict ---
    console.log(`\n🏆 Final Results:`);
    console.log(`   English: N-gram (${ngramScoreEN.score.toFixed(1)}%) vs DL (${dlScoreEN.score.toFixed(1)}%)`);
    console.log(`   Greek:   N-gram (${ngramScoreGR.score.toFixed(1)}%) vs DL (${dlScoreGR.score.toFixed(1)}%)`);

    if (ngramScoreEN.score > dlScoreEN.score && ngramScoreGR.score > dlScoreGR.score) {
        console.log(`\n✅ N-gram Classifier WINS in BOTH languages.`);
        console.log(`   Recommendation: REMOVE Deep Learning Model.`);
        process.exit(0); // Success code 0 for "Remove"
    } else {
        console.log(`\n❌ N-gram Classifier did NOT win in both.`);
        console.log(`   Recommendation: KEEP Deep Learning Model.`);
        process.exit(1); // Non-zero for "Keep"
    }
}

runComparison();
