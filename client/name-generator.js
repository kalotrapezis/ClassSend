/**
 * Random Name Generator for ClassSend
 * Generates LocalSend-style names combining emotions and fruits
 * Example: "Happy Lemon", "Brave Mango", "Clever Cherry"
 */

// 20 Emotions - positive, friendly adjectives
const EMOTIONS = [
    'Happy', 'Joyful', 'Calm', 'Brave', 'Clever',
    'Curious', 'Eager', 'Friendly', 'Gentle', 'Hopeful',
    'Kind', 'Lively', 'Merry', 'Noble', 'Playful',
    'Proud', 'Quiet', 'Swift', 'Witty', 'Zesty'
];

// 20 Emotions (Greek)
// 19 Emotions (Greek - Neutral)
const EMOTIONS_EL = [
    'Χαριτωμένο', 'Ντροπαλό', 'Γκρινιάρικο', 'Υπναράδικο', 'Φλύαρο',
    'Σοφό', 'Τεμπέλικο', 'Ατίθασο', 'Μυστήριο', 'Γελαστό',
    'Περήφανο', 'Ζαλισμένο', 'Πεινασμένο', 'Βιαστικό', 'Αόρατο',
    'Πολύχρωμο', 'Γενναίο', 'Περίεργο', 'Δυνατό'
];

// 20 Fruits - common, easy to spell
const FRUITS = [
    'Apple', 'Banana', 'Cherry', 'Grape', 'Kiwi',
    'Lemon', 'Mango', 'Orange', 'Peach', 'Pear',
    'Plum', 'Berry', 'Melon', 'Lime', 'Fig',
    'Papaya', 'Guava', 'Apricot', 'Coconut', 'Olive'
];

// 20 Fruits (Greek - Neutral) - Keeping original 'Banana' as 'Μπανανάκι' or just user list?
// User list has 18 items.
const FRUITS_EL = [
    'Πορτοκάλι', 'Λεμόνι', 'Καρπούζι', 'Πεπόνι', 'Ακτινίδιο',
    'Μήλο', 'Αχλάδι', 'Κεράσι', 'Σύκο', 'Σταφύλι',
    'Μανταρίνι', 'Ροδάκινο', 'Βερίκοκο', 'Δαμάσκηνο', 'Μούρο',
    'Ρόδι', 'Κυδώνι', 'Βύσσινο'
];

/**
 * Generate a random name combining an emotion and a fruit
 * @param {string} lang - 'en' or 'el'
 * @returns {string} A name like "Happy Lemon" or "Χαρούμενο Μήλο"
 */
export function generateRandomName(lang = 'en') {
    const emotionsList = lang === 'el' ? EMOTIONS_EL : EMOTIONS;
    const fruitsList = lang === 'el' ? FRUITS_EL : FRUITS;

    const emotion = emotionsList[Math.floor(Math.random() * emotionsList.length)];
    const fruit = fruitsList[Math.floor(Math.random() * fruitsList.length)];
    return `${emotion} ${fruit}`;
}

/**
 * Get all available emotions (for UI display if needed)
 * @returns {string[]}
 */
export function getEmotions() {
    return [...EMOTIONS];
}

/**
 * Get all available fruits (for UI display if needed)
 * @returns {string[]}
 */
export function getFruits() {
    return [...FRUITS];
}
