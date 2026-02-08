
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
        emptyOutDir: true
    },
    define: {
        '__APP_VERSION__': JSON.stringify(process.env.npm_package_version)
    }
});
