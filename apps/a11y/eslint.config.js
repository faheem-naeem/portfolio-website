import config from '@faheem/config/eslint';

// scripts/*.mjs run in plain Node (GitHub Actions), so allow Node globals there.
const nodeGlobals = {
    process: 'readonly',
    console: 'readonly',
    URL: 'readonly',
    AbortSignal: 'readonly',
    fetch: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
};

export default [
    ...config,
    {
        files: ['scripts/**/*.mjs'],
        languageOptions: { globals: nodeGlobals },
    },
];
