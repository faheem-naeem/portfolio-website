import config from '@faheem/config/eslint';

export default [
    ...config,
    {
        files: ['scripts/**/*.mjs'],
        languageOptions: { globals: { console: 'readonly', URL: 'readonly' } },
    },
];
