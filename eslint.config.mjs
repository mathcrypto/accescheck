import js from '@eslint/js';
import globals from 'globals';
import { defineConfig } from 'eslint/config';

export default defineConfig([
  {
    ignores: ['worker/**', 'dist/**', 'output/**', 'node_modules/**'],
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    files: [
      'src/companion.js',
      'src/assistant.js',
      'src/chat-content.js',
      'src/page-speech.js',
      'src/search-results.js',
      'src/review-cards.js',
      'src/home.js',
      'src/i18n.js',
      'src/ambient.js',
      'scripts/live-reload-client.js',
      'prototype/client.js',
      'prototype/mock-call.js',
    ],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['scripts/*check*.mjs', 'prototype/check-end-to-end.mjs'],
    languageOptions: { globals: globals.browser },
  },
]);
