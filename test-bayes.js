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

    // Now test an unknown word
    const testWord = "αυτοκινητοδρομος";
    const result = await categorizeWithConfidence(testWord);
    console.log(`Test Word: ${testWord}`);
    console.log(`Profane Confidence: ${result.confidence}%`);
    console.log(`Category: ${result.category}`);
}

async function categorizeWithConfidence(text) {
    if (!classifier) return { category: 'clean', confidence: 0 };

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
        confidence: profaneConfidence, // 0-100
        details: probs
    };
}

run();
