
// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
    server: {
        proxy: {
            '/socket.io': {
                target: 'http://localhost:3000',
                ws: true
            },
            '/api': {
                target: 'http://localhost:3000'
            }
        }
    },
    build: {
        outDir: '../server/public',
        emptyOutDir: true,
        chunkSizeWarningLimit: 2048, // Electron loads from disk, no network penalty
        target: ['es2015', 'chrome98'] // Electron 22 uses Chromium 108 — es2015 for Win7 safety
    },
    define: {
        '__APP_VERSION__': JSON.stringify(process.env.npm_package_version)
    }
});
