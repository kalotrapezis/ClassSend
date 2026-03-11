const bayes = require('./server/node_modules/bayes');
const ngramTokenizer = require('./server/lib/ngram-tokenizer');

let classifier = bayes({
    tokenizer: function (text) {
        return ngramTokenizer.tokenize(text);
    }
});

async function run() {
    const MILD_BAD_WORDS = [
        'βλάκας', 'βλακα', 'ηλίθιος', 'ηλίθια', 'χαζός', 'χαζή',
        'άσχετος', 'άσχετη', 'άχρηστος', 'άχρηστη', 'φλούφλης',
        'κοτούλα', 'μπέμπης', 'φυτό',
        'stupid', 'idiot', 'noob', 'nob', 'n00b', 'loser', 'bot',
        'trash', 'bad', 'lag', 'hack', 'hacker', 'cheater',
        'shut up', 'stfu', 'wtf', 'omg', 'hell'
    ];

    for (const word of MILD_BAD_WORDS) {
        await classifier.learn(word, 'profane');
    }

    const MILD_GOOD_WORDS = [
        'καλημέρα', 'καλησπέρα', 'ναι', 'όχι', 'ευχαριστώ', 'παρακαλώ',
        'γεια', 'hello', 'yes', 'no', 'thanks', 'please', 'good', 'ok',
        'εντάξει', 'τέλεια', 'μπράβο', 'σωστά',
        'ένα', 'δύο', 'τρία', 'τέσσερα', 'πέντε', 'έξι', 'εφτά', 'οχτώ', 'εννιά', 'δέκα'
    ];
    for (const word of MILD_GOOD_WORDS) {
        await classifier.learn(word, 'clean');
    }

    // Add unbalanced training data to simulate reality
    for (let i = 0; i < 100; i++) {
        await classifier.learn('κανονική λέξη ' + i, 'clean');
    }

    const BLOCK_THRESHOLD = 50;

    const tests = [
        // All-OOV words — the bug: these used to return ~87% (blocked). Should now be 0%.
        { label: 'OOV clean word (Greek)',   text: 'αυτοκινητοδρομος',      expectBelow: BLOCK_THRESHOLD },
        { label: 'OOV clean sentence (EN)',  text: 'what is the homework',   expectBelow: BLOCK_THRESHOLD },
        { label: 'OOV clean sentence (GR)',  text: 'ποια ειναι η απαντηση', expectBelow: BLOCK_THRESHOLD },
        // Known profane words — should still be detected.
        { label: 'Known profane word (EN)',  text: 'idiot',                  expectAbove: BLOCK_THRESHOLD },
        { label: 'Known profane word (GR)',  text: 'βλάκας',                 expectAbove: BLOCK_THRESHOLD },
        // Known clean words — should stay well below threshold.
        { label: 'Known clean word (EN)',    text: 'hello',                  expectBelow: BLOCK_THRESHOLD },
        { label: 'Known clean word (GR)',    text: 'καλημέρα',               expectBelow: BLOCK_THRESHOLD },
    ];

    let passed = 0;
    for (const t of tests) {
        const result = await categorizeWithConfidence(t.text);
        const conf = result.confidence.toFixed(1);
        let ok;
        if (t.expectBelow !== undefined) {
            ok = result.confidence < t.expectBelow;
            console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  [${t.label}]  "${t.text}"  →  ${conf}%  (expected < ${t.expectBelow}%)`);
        } else {
            ok = result.confidence > t.expectAbove;
            console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  [${t.label}]  "${t.text}"  →  ${conf}%  (expected > ${t.expectAbove}%)`);
        }
        if (ok) passed++;
    }

    console.log(`\n${passed}/${tests.length} tests passed`);
}

async function categorizeWithConfidence(text) {
    if (!classifier) return { category: 'clean', confidence: 0 };

    const tokens = await classifier.tokenizer(text);
    const frequencyTable = classifier.frequencyTable(tokens);

    const categories = Object.keys(classifier.categories);
    let logProbs = {};
    let maxLogProb = -Infinity;

    // FIX: bail out when no tokens are in the trained vocabulary.
    // Without this, the classifier falls back to the prior (~87% profane due to
    // training imbalance) and blocks every message with unknown words.
    const knownTokens = Object.keys(frequencyTable).filter(t => classifier.vocabulary[t]);
    if (knownTokens.length === 0) {
        return { category: 'clean', confidence: 0 };
    }

    categories.forEach(category => {
        let categoryProbability = classifier.docCount[category] / classifier.totalDocuments;
        let logProbability = Math.log(categoryProbability);

        Object.keys(frequencyTable).forEach(token => {
            if (!classifier.vocabulary[token]) return; // skip OOV tokens
            const frequencyInText = frequencyTable[token];
            const tokenProbability = classifier.tokenProbability(token, category);
            logProbability += frequencyInText * Math.log(tokenProbability);
        });

        logProbs[category] = logProbability;
        if (logProbability > maxLogProb) maxLogProb = logProbability;
    });

    let sumExp = 0;
    categories.forEach(cat => {
        sumExp += Math.exp(logProbs[cat] - maxLogProb);
    });

    let probs = {};
    categories.forEach(cat => {
        probs[cat] = Math.exp(logProbs[cat] - maxLogProb) / sumExp;
    });

    let winner = 'clean';
    let maxP = -1;

    Object.keys(probs).forEach(cat => {
        if (probs[cat] > maxP) {
            maxP = probs[cat];
            winner = cat;
        }
    });

    const profaneConfidence = (probs['profane'] || 0) * 100;

    return {
        category: winner,
        confidence: profaneConfidence,
        details: probs
    };
}

run();
