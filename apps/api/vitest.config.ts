import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            // Workers runtime module; replaced by a small fake in tests.
            'cloudflare:email': fileURLToPath(
                new URL('./test/fakes/cloudflare-email.ts', import.meta.url),
            ),
        },
    },
    test: { include: ['test/**/*.test.ts'] },
});
