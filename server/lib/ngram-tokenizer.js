/**
 * N-gram Tokenizer for Greek/English Text
 * Splits words into 3-character chunks (trigrams) to improve morphological matching.
 * This helps the Naive Bayes classifier recognize word roots (e.g. "μαλάκ")
 * regardless of the suffix (e.g. "μαλάκας", "μαλάκες", "μαλάκα").
 */

/**
 * Clean and normalize text
 * @param {string} text 
 * @returns {string}
 */
function normalize(text) {
    return text
        .normalize('NFD').replace(/[\u0300-\u036f]/g, "") // Remove accents
        .toLowerCase()
        // Keep letters (including Greek), numbers, and spaces. Remove punctuation.
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .trim();
}

/**
 * Generate trigrams from a word
 * @param {string} word 
 * @returns {string[]}
 */
function getTrigrams(word) {
    if (word.length < 3) return [word]; // Keep short words as-is

    const grams = [];
    // Standard trigrams
    for (let i = 0; i <= word.length - 3; i++) {
        grams.push(word.substring(i, i + 3));
    }

    // Optional: Add the full word too, to boost exact matches?
    // For now, let's stick to grams to emphasize roots.
    // Actually, adding the full word helps if the word is short or very specific.
    // Let's add the full word as a "special" token if it's not too long.
    grams.push(word);

    return grams;
}

/**
 * Tokenize text into an array of features (N-grams)
 * @param {string} text 
 * @returns {string[]}
 */
function tokenize(text) {
    if (!text) return [];

    const words = normalize(text).split(/\s+/);
    let allTokens = [];

    words.forEach(word => {
        if (!word) return;
        const grams = getTrigrams(word);
        allTokens = allTokens.concat(grams);
    });

    return allTokens;
}

module.exports = {
    tokenize
};
