// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
    site: 'https://bugs.faheemnaeem.dev',
    output: 'static',
    outDir: './dist',
    build: {
        format: 'directory',
        // Keep CSS in external files so the CSP needs no 'unsafe-inline' styles.
        inlineStylesheets: 'never',
    },
});
