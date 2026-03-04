const bayes = require('./server/node_modules/bayes');

// Let's test the Laplace smoothing theory
// Create a new classifier
let classifier = bayes();

async function run() {
    // Train with many clean words
    for (let i = 0; i < 1000; i++) {
        await classifier.learn(`clean_word_${i}`, 'clean');
    }

    // Train with very few profane words
    for (let i = 0; i < 10; i++) {
        await classifier.learn(`profane_word_${i}`, 'profane');
    }

    const testWord = "completely_unseen_word_12345";

    // Check internal probabilities
    const pClean = classifier.tokenProbability(testWord, 'clean');
    const pProfane = classifier.tokenProbability(testWord, 'profane');

    console.log(`Unseen Token Prob for Clean: ${pClean}`);
    console.log(`Unseen Token Prob for Profane: ${pProfane}`);
    console.log(`Ratio (Profane / Clean): ${pProfane / pClean}`);

    // It's giving high probability to profane because it has fewer total words!
}

run();
