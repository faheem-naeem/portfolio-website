// Static Astro build for manual.faheemnaeem.dev. Served later as a Worker with
// static assets (see wrangler.jsonc). Stylesheets are never inlined so the CSP
// in public/_headers can stay strict (style-src 'self').
import { defineConfig } from 'astro/config';

export default defineConfig({
    site: 'https://manual.faheemnaeem.dev',
    output: 'static',
    outDir: './dist',
    build: { inlineStylesheets: 'never' },
    devToolbar: { enabled: false },
});
