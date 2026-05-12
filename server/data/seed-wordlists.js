/**
 * First-boot seed for the custom forbidden / whitelisted wordlists.
 *
 * Source: real-world classroom data captured 2026-04-29.
 *
 * Rules (per product owner):
 *  - On a fresh install, both files are seeded so the filter is not
 *    overprotective out of the box. Without the whitelist hard-pass, common
 *    Greek/English words trigger false positives from n-gram collisions.
 *  - Only blacklist entries are *trained* into the Naive Bayes classifier
 *    as `profane`. Whitelist entries are NOT trained as `clean` — their job
 *    is to short-circuit the AI step entirely via the hard-pass match in
 *    `checkMessageWithAI` / message filtering.
 *  - If the user has already curated either file (file exists, even empty),
 *    we do NOT overwrite. This is "seed if missing" only.
 */

const SEED_VERSION = '2026-04-29';

const BLACKLIST = [
    '.\n🖕', 'μαλάκακα αλβανέ', 'sone of a beac', 'κόλος', 'μαλάκκακακακα',
    'καραγκίοζη', 'γελίε', 'άχριστε', 'παπάρας', 'ηλίθιο', 'χαζός', '🤕😈🖕',
    'καραγκιόζηςςς', 'μακακια', 'κακκα', 'κκαακα', 'κακα', 'κακά', 'μακακία',
    'makakia', 'ο γιωργος ειναι χαζός', 'μαλάκακα', 'πούτσο', 'πίπα', 'χαζή',
    'γίφτος', 'γαμημένο', 'βλαμένο', 'βλαμαίνο', 'περιορισμένης', 'ευθήνης',
    'αρχίδι', 'stupid', 'bitch', 'fuck', 'sex', 'moring', 'φαψκ', 'βλαμμένο',
    'πόρνη', 'μακάκα', 'γαμότο', 'πουτσας', 'παπαρ', 'πούτσα', 'παπάρα',
    'fustis', 'farts', 'dics', 'fuccsake', 'beech'
];

const WHITELIST = [
    'ασδ', 'σδσδ', 'κάνετε', 'κοντός', 'καμήλα', 'βηβλίο', 'βόμβα', 'πίτσα',
    'ρούφα', 'σάκς', 'μασκα', 'καλημέρα', 'students', 'tudent', 'student',
    'μαθητές', 'studies', 'μαθήματα', 'μαθήτριας', 'φακός', 'μαδέρι', 'πατέρας',
    'faster', 'fast', 'parasite', 'καλή', 'γεια', 'what', 'περάσετε', 'γιεα',
    'γειά', 'ghg', 'gfd', 'xcvcxv', 'ccvxvcxv', 'cxc', 'hi', 'καλά', 'τασάκι',
    'ηι', 'wolf', 'go go', 'hello'
];

function asEntries(words) {
    return words.map(w => ({ word: String(w).trim().toLowerCase(), addedAt: SEED_VERSION }));
}

module.exports = {
    SEED_VERSION,
    BLACKLIST,
    WHITELIST,
    blacklistEntries: () => asEntries(BLACKLIST),
    whitelistEntries: () => asEntries(WHITELIST)
};
