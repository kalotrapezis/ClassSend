import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Tests live in server/tests/. Worktrees under .claude/ contain stale
        // duplicates from earlier branches — exclude them so the run is
        // deterministic.
        include: ['server/tests/**/*.test.js'],
        exclude: ['**/.claude/**', '**/node_modules/**']
    }
});
