// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
    site: 'https://a11y.faheemnaeem.dev',
    output: 'static',
    outDir: './dist',
    build: {
        // Always emit external CSS so the CSP can stay at style-src 'self'.
        inlineStylesheets: 'never',
    },
    devToolbar: { enabled: false },
});
