import config from '@faheem/config/eslint';

export default [
    ...config,
    {
        // Local Node scripts (not bundled into the Worker).
        files: ['scripts/**/*.mjs'],
        languageOptions: {
            globals: { console: 'readonly', process: 'readonly' },
        },
    },
];
