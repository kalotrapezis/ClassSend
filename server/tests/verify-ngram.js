const bayes = require('bayes');
const fs = require('fs');
const path = require('path');
const ngramTokenizer = require('../lib/ngram-tokenizer');

// --- Configuration ---
const MODEL_FILE = path.join(__dirname, '../data/classifier-model.json');
const BLOCK_THRESHOLD = 90; // High confidence -> Block
const REPORT_THRESHOLD = 20; // Low confidence -> Warn/Report

// --- Test Data (Subset of expanded data) ---
const TEST_CASES = [
    // Clearly Clean
    "Hello world",
    "How are you?",
    "Science class is great",
    "Καλημέρα δάσκαλε",
    "Μου αρέσει το σχολείο",

    // Clearly Profane (English)
    "fuck",
    "shit",
    "asshole",
    "bastard",

    // Clearly Profane (Greek)
    "μαλάκας",
    "γαμώ",
    "πουτάνα",
    "καριόλη",

    // Borderline / Mild (Should Warn?)
    "damn",
    "hell",
    "idiot",
    "stupid",
    "βλάκας", // Mild in Greek schools?
    "χαζός"
];

const TEST_DATA = require('./expanded-test-data');

// --- Main Verification Function ---
async function runVerification() {
    console.log("🚀 Starting N-gram Threshold Verification...");
    console.log(`⚙️ Settings: Block > ${BLOCK_THRESHOLD}%, Warn > ${REPORT_THRESHOLD}%`);

    let classifier;

    // 1. Try Load Model or Train New
    if (fs.existsSync(MODEL_FILE)) {
        console.log("📂 Loading trained model from disk...");
        const json = fs.readFileSync(MODEL_FILE, 'utf-8');
        classifier = bayes.fromJson(json);
        classifier.tokenizer = (text) => ngramTokenizer.tokenize(text);
    } else {
        console.log("⚠️  Model file not found. Training fresh model for verification...");
        classifier = bayes({
            tokenizer: (text) => ngramTokenizer.tokenize(text)
        });

        // Train with Expanded Data
        const { en, gr } = TEST_DATA;

        const train = async (list, label) => {
            if (!list) return;
            for (const text of list) {
                await classifier.learn(text, label);
            }
        };

        await train(en.profane, 'profane');
        await train(en.clean, 'clean');
        await train(gr.profane, 'profane');
        await train(gr.clean, 'clean');

        console.log("✅ Model trained in memory.");
    }

    // 2. Helper: Confidence Scorer (Same as server)
    const getConfidence = async (text) => {
        const tokens = await classifier.tokenizer(text);
        const frequencyTable = classifier.frequencyTable(tokens);
        const categories = Object.keys(classifier.categories);

        if (categories.length === 0) return 0;

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

        // Softmax
        let sumExp = 0;
        categories.forEach(cat => {
            if (Number.isFinite(logProbs[cat])) { // Guard against -Infinity
                sumExp += Math.exp(logProbs[cat] - maxLogProb);
            }
        });

        let probs = {};
        categories.forEach(cat => {
            if (Number.isFinite(logProbs[cat])) {
                probs[cat] = Math.exp(logProbs[cat] - maxLogProb) / sumExp;
            } else {
                probs[cat] = 0;
            }
        });

        return (probs['profane'] || 0) * 100;
    };

    // 3. Run Tests
    console.log("\n--- Results ---");
    console.log("Text".padEnd(25) + " | Score".padEnd(10) + " | Action");
    console.log("-".repeat(55));

    for (const text of TEST_CASES) {
        const score = await getConfidence(text.toLowerCase());
        let action = "✅ ALLOW";

        if (score >= BLOCK_THRESHOLD) {
            action = "🚫 BLOCK";
        } else if (score >= REPORT_THRESHOLD) {
            action = "⚠️ WARN";
        }

        console.log(`${text.padEnd(25)} | ${score.toFixed(1)}%`.padEnd(38) + ` | ${action}`);
    }
}

runVerification();
