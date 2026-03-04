const bayes = require('./server/node_modules/bayes');

let classifier = bayes();

async function run() {
    for (let i = 0; i < 1000; i++) {
        await classifier.learn(`clean_word_${i}`, 'clean');
    }

    for (let i = 0; i < 10; i++) {
        await classifier.learn(`profane_word_${i}`, 'profane');
    }

    const testWord = "completely_unseen_word_12345";

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
            // FIX: Ignore Out-Of-Vocabulary tokens
            if (!classifier.vocabulary[token]) {
                return; // Skip this token, it provides no information
            }

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
