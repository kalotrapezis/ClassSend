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

// 20 Fruits - common, easy to spell
const FRUITS = [
    'Apple', 'Banana', 'Cherry', 'Grape', 'Kiwi',
    'Lemon', 'Mango', 'Orange', 'Peach', 'Pear',
    'Plum', 'Berry', 'Melon', 'Lime', 'Fig',
    'Papaya', 'Guava', 'Apricot', 'Coconut', 'Olive'
];

/**
 * Generate a random name combining an emotion and a fruit
 * @returns {string} A name like "Happy Lemon"
 */
export function generateRandomName() {
    const emotion = EMOTIONS[Math.floor(Math.random() * EMOTIONS.length)];
    const fruit = FRUITS[Math.floor(Math.random() * FRUITS.length)];
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
