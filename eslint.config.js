import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    ignores: [
      'dist/**',
      'build/**',
      '*.zip',
      'node_modules/**',
      // Gitignored local-tooling output. Flat config does not read
      // .gitignore, so without these entries `npm run lint` crawls the
      // Chrome profile left behind by `npm run screenshots` (and any
      // wrangler dev state) and fails on its unparseable bundled JS.
      '.tmp-store-screenshots-profile/**',
      '.wrangler/**',
    ],
  },
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        chrome: 'readonly',
      },
    },
    rules: {
      // Keep noise low; this is a browser extension codebase.
      'no-console': 'off',
    },
  },
  // Cloudflare Worker (token-broker) runs in a service-worker-like runtime
  {
    files: ['token-broker/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
      },
    },
  },
  // Tests (node)
  {
    files: ['tests/**/*.test.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];


