import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    root: '.',
    build: {
        outDir: '../server/public',
        emptyOutDir: true,
    },
    server: {
        port: 3000
    }
});
