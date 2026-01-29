/**
 * Deep Learning Filter Module
 * Uses Transformers.js for zero-shot classification
 * Designed for modern hardware with 2GB+ RAM
 */

// Dynamic import for ESM module
let pipeline = null;
let env = null;

// Model state
let classifier = null;
let isLoading = false;
let loadProgress = 0;


// Greek stopwords (common words to ignore when extracting suspicious words)
const GREEK_STOPWORDS = new Set([
    'και', 'το', 'τα', 'η', 'οι', 'ο', 'του', 'της', 'των', 'τον', 'την',
    'στο', 'στη', 'στα', 'στον', 'στην', 'με', 'για', 'να', 'θα', 'είναι',
    'έχει', 'από', 'που', 'αυτό', 'αυτά', 'αυτός', 'αυτή', 'εγώ', 'εσύ',
    'εμείς', 'εσείς', 'αυτοί', 'αυτές', 'μου', 'σου', 'του', 'της', 'μας',
    'σας', 'τους', 'δεν', 'μην', 'πως', 'πώς', 'τι', 'ποιος', 'ποια', 'ποιο',
    'πότε', 'πού', 'γιατί', 'αν', 'όταν', 'ενώ', 'αλλά', 'όμως', 'λοιπόν',
    'ήδη', 'ακόμα', 'πολύ', 'λίγο', 'πάρα', 'πιο', 'πρέπει', 'μπορώ', 'μπορείς',
    'καλά', 'ωραία', 'εντάξει', 'ναι', 'όχι', 'ίσως', 'μάλλον', 'σίγουρα'
]);

// English stopwords
const ENGLISH_STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
    'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
    'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there',
    'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other',
    'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
    'too', 'very', 'just', 'also', 'now', 'i', 'you', 'he', 'she', 'it', 'we',
    'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our',
    'their', 'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom'
]);

// Combined stopwords
const ALL_STOPWORDS = new Set([...GREEK_STOPWORDS, ...ENGLISH_STOPWORDS]);

/**
 * Load the zero-shot classification model
 * @param {Function} progressCallback - Called with progress updates (0-100)
 * @returns {Promise<boolean>} - True if model loaded successfully
 */
async function loadModel(progressCallback) {
    if (classifier) {
        return true; // Already loaded
    }

    if (isLoading) {
        return false; // Already loading
    }

    isLoading = true;
    loadProgress = 0;

    try {
        console.log('🧠 Loading Deep Learning model...');

        // Dynamic import for ESM module
        if (!pipeline) {
            console.log('🧠 Importing Transformers.js...');
            const transformers = await import('@xenova/transformers');
            pipeline = transformers.pipeline;
            env = transformers.env;

            // Configure Transformers.js
            env.useBrowserCache = false;
            env.allowLocalModels = true;
        }

        classifier = await pipeline(
            'text-classification',
            'Xenova/toxic-bert',
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
                        console.log(`🧠 Model download: ${loadProgress}%`);
                    } else if (progress.status === 'done') {
                        if (progressCallback) {
                            progressCallback({ status: 'ready', progress: 100 });
                        }
                    }
                }
            }
        );

        console.log('✅ Deep Learning model loaded successfully!');
        isLoading = false;
        return true;
    } catch (error) {
        console.error('❌ Failed to load Deep Learning model:', error);
        isLoading = false;
        classifier = null;
        return false;
    }
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
 * Classify a message using toxic-bert text classification
 * @param {string} message - The message to classify
 * @returns {Promise<{isProfane: boolean, confidence: number, category: string, tier: string}>}
 */
async function classifyMessage(message) {
    if (!classifier) {
        return { isProfane: false, confidence: 0, category: 'unknown', tier: 'safe' };
    }

    try {
        // toxic-bert returns: { label: 'toxic' or 'non-toxic', score: 0.0-1.0 }
        const result = await classifier(message);

        // Handle array or single result
        const output = Array.isArray(result) ? result[0] : result;
        const label = output.label?.toLowerCase() || '';
        const score = output.score || 0;

        // Determine if profane (toxic-bert labels: toxic, severe_toxic, obscene, threat, insult, identity_hate)
        const toxicLabels = ['toxic', 'severe_toxic', 'obscene', 'threat', 'insult', 'identity_hate'];
        const isProfane = toxicLabels.some(l => label.includes(l)) || label === 'label_1';

        // Determine tier based on confidence
        let tier = 'safe';
        if (isProfane && score > 0.90) {
            tier = 'high';
        } else if (isProfane && score > 0.60) {
            tier = 'medium';
        }

        console.log(`🧠 Classification: "${message.substring(0, 30)}..." → ${label} (${Math.round(score * 100)}%)`);

        return {
            isProfane,
            confidence: Math.round(score * 100),
            category: label,
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
