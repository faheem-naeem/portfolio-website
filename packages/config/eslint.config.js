// Shared ESLint flat config. Use in an app with:
//   import config from '@faheem/config/eslint';
//   export default config;
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['**/dist/**', '**/public/**', '**/.astro/**', '**/.wrangler/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
);
