/**
 * Deep Learning Filter Module
 * Uses Transformers.js for zero-shot classification with MobileBERT
 * Designed for modern hardware with 2GB+ RAM
 * Supports English primarily, with reasonable multilingual capability
 */

const path = require('path');

// Dynamic import for ESM module
let pipeline = null;
let env = null;

// Model state
let classifier = null;
let isLoading = false;
let loadProgress = 0;
let loadPromise = null; // Track the current load promise for waiting

// Candidate labels for zero-shot classification
const CANDIDATE_LABELS = [
    'profanity and swear words',   // Explicit profanity detection
    'offensive language',          // Catches slurs, insults
    'bullying or harassment',      // Catches threats
    'inappropriate content',       // Catches sexual/violent content
    'normal conversation'          // Safe messages
];

// Labels that indicate harmful content
const HARMFUL_LABELS = ['profanity and swear words', 'offensive language', 'bullying or harassment', 'inappropriate content'];

// Greek stopwords (common words to ignore when extracting suspicious words)
const GREEK_STOPWORDS = new Set([
    // Άρθρα & Αντωνυμίες
    'ο', 'η', 'το', 'οι', 'τα', 'τους', 'τις', 'των', 'τον', 'την', 'ένας', 'μια', 'ένα',
    'εγώ', 'εσύ', 'αυτός', 'αυτή', 'αυτό', 'εμείς', 'εσείς', 'αυτοί', 'αυτές', 'αυτά',
    'μου', 'σου', 'του', 'της', 'μας', 'σας', 'με', 'σε',
    'ποιος', 'ποια', 'ποιο', 'τι', 'που', 'πως', 'πώς', 'πότε', 'γιατί',

    // Συνδετικές & Ρήματα
    'και', 'κι', 'ή', 'αλλά', 'αν', 'όμως', 'ενώ', 'για', 'από', 'προς', 'κατά', 'μετά',
    'πριν', 'μέχρι', 'σαν', 'ως', 'δίχως', 'χωρίς', 'στο', 'στη', 'στα', 'στον', 'στην',
    'είμαι', 'είσαι', 'είναι', 'είμαστε', 'είστε', 'ήμουν', 'ήσουν', 'ήταν',
    'έχω', 'έχεις', 'έχει', 'έχουμε', 'έχετε', 'έχουν',
    'θα', 'να', 'δεν', 'μην', 'ναι', 'όχι', 'μάλιστα', 'εντάξει', 'οκ', 'ρε', 'έλα',
    'ήδη', 'ακόμα', 'πολύ', 'λίγο', 'πάρα', 'πιο', 'πρέπει', 'μπορώ', 'μπορείς',
    'καλά', 'ωραία', 'ίσως', 'μάλλον', 'σίγουρα', 'λοιπόν', 'όταν', 'αυτό', 'αυτά', 'πού',

    // Σχολείο & Τεχνολογία
    'κύριε', 'κυρία', 'δάσκαλε', 'δασκάλα', 'καθηγητή', 'μαθητής', 'μαθήτρια',
    'σχολείο', 'τάξη', 'μάθημα', 'διάλειμμα', 'άσκηση', 'εργασία', 'τεστ',
    'υπολογιστής', 'οθόνη', 'ποντίκι', 'πληκτρολόγιο', 'ίντερνετ', 'πρόγραμμα',
    'βοήθεια', 'απορία', 'ερώτηση', 'απάντηση', 'σωστό', 'λάθος',
    'πρώτος', 'δεύτερος', 'τρίτος', 'τελευταίος', 'αρχή', 'τέλος',
    'πάνω', 'κάτω', 'μέσα', 'έξω', 'εδώ', 'εκεί'
]);

// Greeklish stopwords
const GREEKLISH_STOPWORDS = new Set([
    'kai', 'ki', 'dn', 'den', 'tha', 'na', 're', 'nai', 'oxi', 'ok', 'entaxei',
    'ego', 'esy', 'emeis', 'eseis', 'einai', 'eimai', 'exw', 'exeis', 'exei',
    'ti', 'pos', 'pote', 'giati', 'pou', 'me', 'se', 'gia', 'apo',
    'o', 'i', 'to', 'oi', 'ta', 'tous', 'tis', 'ton', 'tin',
    'ela', 'tpt', 'tespa', 'kalimera', 'geia',
    'prwtos', 'deuteros', 'tritos', 'teleutaios', 'arxi', 'telos'
]);

// English stopwords
const ENGLISH_STOPWORDS = new Set([
    // Grammar & Pronouns
    'i', 'me', 'my', 'you', 'your', 'he', 'him', 'she', 'her', 'it', 'we', 'us', 'they', 'them',
    'a', 'an', 'the', 'and', 'but', 'if', 'or', 'because', 'so', 'to', 'for', 'with', 'from', 'in', 'on', 'at',
    'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
    'can', 'will', 'should', 'would', 'could', 'not', 'no', 'yes', 'ok', 'okay',
    'hello', 'hi', 'hey', 'bye', 'goodbye', 'please', 'thanks', 'sorry',
    'of', 'by', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there',
    'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other',
    'some', 'such', 'nor', 'only', 'own', 'same', 'than',
    'too', 'very', 'just', 'also', 'now', 'its', 'our',
    'their', 'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom',
    'may', 'might', 'must', 'shall', 'need', 'dare', 'ought', 'used', 'being',

    // Common Nouns/Verbs (often false positives)
    'son', 'daughter', 'father', 'mother', 'parent', 'brother', 'sister', 'family',
    'first', 'second', 'third', 'last', 'start', 'end', 'beginning', 'middle',
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'day', 'night', 'morning', 'afternoon', 'evening', 'time', 'year', 'month', 'week',
    'word', 'text', 'message', 'chat', 'say', 'tell', 'ask', 'answer', 'speak', 'talk',
    'school', 'class', 'student', 'teacher', 'homework', 'exam', 'test', 'grade',
    'computer', 'internet', 'phone', 'game', 'play', 'video', 'watch', 'look', 'see',
    'go', 'come', 'get', 'give', 'make', 'do', 'work', 'try', 'help', 'use',
    'thing', 'way', 'life', 'world', 'hand', 'eye', 'head', 'face', 'body',
    'good', 'bad', 'great', 'nice', 'cool', 'fun', 'happy', 'sad', 'angry'
]);

// Combined stopwords
const ALL_STOPWORDS = new Set([...GREEK_STOPWORDS, ...GREEKLISH_STOPWORDS, ...ENGLISH_STOPWORDS]);

/**
 * Load the zero-shot classification model (multilingual mDeBERTa)
 * @param {Function} progressCallback - Called with progress updates (0-100)
 * @returns {Promise<boolean>} - True if model loaded successfully
 */
async function loadModel(progressCallback) {
    if (classifier) {
        return true; // Already loaded
    }

    // If already loading, wait for the existing load to complete
    if (isLoading && loadPromise) {
        console.log('🧠 Model load already in progress, waiting...');
        try {
            await loadPromise;
            return classifier !== null;
        } catch (error) {
            return false;
        }
    }

    isLoading = true;
    loadProgress = 0;

    // Create the load promise so other callers can wait on it
    loadPromise = (async () => {
        try {
            console.log('🧠 Loading Deep Learning model (MobileBERT)...');

            // Dynamic import for ESM module
            if (!pipeline) {
                console.log('🧠 Importing Transformers.js...');
                const transformers = await import('@xenova/transformers');
                pipeline = transformers.pipeline;
                env = transformers.env;

                // Configure Transformers.js for bundled model
                env.useBrowserCache = false;
                env.allowLocalModels = true;

                // Point to bundled model directory
                const modelsPath = path.join(__dirname, 'models');
                env.localModelPath = modelsPath;

                // Check if bundled model exists, otherwise allow remote download
                const fs = require('fs');
                const modelPath = path.join(modelsPath, 'Xenova', 'mobilebert-uncased-mnli', 'config.json');
                if (fs.existsSync(modelPath)) {
                    env.allowRemoteModels = false;
                    console.log('🧠 Using bundled model from:', modelsPath);
                } else {
                    env.allowRemoteModels = true;
                    console.log('🧠 Bundled model not found. Downloading MobileBERT from Hugging Face...');
                    console.log('🧠 Model will be cached for future use.');
                }
            }

            classifier = await pipeline(
                'zero-shot-classification',
                'Xenova/mobilebert-uncased-mnli',
                {
                    quantized: true,
                    progress_callback: (progress) => {
                        if (progress.status === 'progress' && progress.total) {
                            loadProgress = Math.round((progress.loaded / progress.total) * 100);
                            if (progressCallback) {
                                progressCallback({
                                    status: 'downloading',
                                    progress: loadProgress,
                                    file: progress.file || 'model'
                                });
                            }
                            console.log(`🧠 Model loading: ${loadProgress}%`);
                        } else if (progress.status === 'done') {
                            if (progressCallback) {
                                progressCallback({ status: 'ready', progress: 100 });
                            }
                        }
                    }
                }
            );

            console.log('✅ Multilingual Deep Learning model loaded successfully!');
            return true;
        } catch (error) {
            console.error('❌ Failed to load Deep Learning model:', error);
            classifier = null;
            return false;
        } finally {
            isLoading = false;
            loadPromise = null;
        }
    })();

    return loadPromise;
}


/**
 * Check if the model is ready
 * @returns {boolean}
 */
function isModelReady() {
    return classifier !== null;
}

/**
 * Check if the model is currently loading
 * @returns {boolean}
 */
function isModelLoading() {
    return isLoading;
}

/**
 * Get current load progress
 * @returns {number} 0-100
 */
function getLoadProgress() {
    return loadProgress;
}

/**
 * Classify a message using zero-shot classification with mDeBERTa
 * @param {string} message - The message to classify
 * @returns {Promise<{isProfane: boolean, confidence: number, category: string, tier: string}>}
 */
async function classifyMessage(message) {
    if (!classifier) {
        return { isProfane: false, confidence: 0, category: 'unknown', tier: 'safe' };
    }

    try {
        // Zero-shot classification returns: { labels: [...], scores: [...] }
        const result = await classifier(message, CANDIDATE_LABELS);

        // Get the top label and score
        const topLabel = result.labels[0];
        const topScore = result.scores[0];

        // Check if top label is harmful
        const isHarmful = HARMFUL_LABELS.includes(topLabel);

        // Calculate max harmful score (for tier determination)
        let maxHarmfulScore = 0;
        for (let i = 0; i < result.labels.length; i++) {
            if (HARMFUL_LABELS.includes(result.labels[i])) {
                maxHarmfulScore = Math.max(maxHarmfulScore, result.scores[i]);
            }
        }

        // Determine tier based on zero-shot confidence
        // Lowered thresholds since MobileBERT gives lower scores
        let tier = 'safe';
        if (isHarmful && topScore > 0.50) {
            // High tier: Top label is harmful AND score > 0.50
            tier = 'high';
        } else if (isHarmful && topScore > 0.30) {
            // Medium tier: Top label is harmful AND score > 0.30
            tier = 'medium';
        } else if (topLabel !== 'normal conversation' && maxHarmfulScore > 0.30) {
            // Also medium if any harmful label has reasonable confidence
            tier = 'medium';
        }
        // Safe: Top label is "normal conversation" OR all harmful scores < 0.30

        const isProfane = tier !== 'safe';

        console.log(`🧠 Classification: "${message.substring(0, 30)}..." → ${topLabel} (${Math.round(topScore * 100)}%) [${tier}]`);

        return {
            isProfane,
            confidence: Math.round(topScore * 100),
            category: topLabel,
            tier
        };
    } catch (error) {
        console.error('❌ Classification error:', error);
        return { isProfane: false, confidence: 0, category: 'error', tier: 'safe' };
    }
}

/**
 * Extract suspicious words from a toxic message
 * Filters out common stopwords to find likely bad words
 * @param {string} message - The toxic message
 * @returns {string[]} - Array of suspicious words
 */
function extractSuspiciousWords(message) {
    // Normalize and split
    const words = message
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ') // Keep letters and numbers, remove punctuation
        .split(/\s+/)
        .filter(word => word.length > 2); // Ignore very short words

    // Filter out stopwords
    const suspiciousWords = words.filter(word => !ALL_STOPWORDS.has(word));

    // Return unique words
    return [...new Set(suspiciousWords)];
}

/**
 * Unload the model to free memory
 */
function unloadModel() {
    classifier = null;
    loadProgress = 0;
    isLoading = false;
    loadPromise = null;
    console.log('🧠 Deep Learning model unloaded');
}

module.exports = {
    loadModel,
    isModelReady,
    isModelLoading,
    getLoadProgress,
    classifyMessage,
    extractSuspiciousWords,
    unloadModel
};
