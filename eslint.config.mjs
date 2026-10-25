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
    files: ['src/companion.js', 'src/search.js', 'prototype/client.js', 'prototype/mock-call.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['scripts/*check*.mjs', 'prototype/check-end-to-end.mjs'],
    languageOptions: { globals: globals.browser },
  },
  {
    // The compiler places these exported helpers before the browser controller.
    files: ['src/companion.js'],
    languageOptions: {
      globals: {
        speakerLabel: 'readonly',
        validateMessage: 'readonly',
        buildDraft: 'readonly',
        speechError: 'readonly',
        safeCallUrl: 'readonly',
        supportsCallAudio: 'readonly',
      },
    },
  },
  {
    // This worker template receives its data and helpers from scripts/compile.mjs.
    files: ['src/handler.mjs'],
    languageOptions: {
      globals: {
        search: 'readonly',
        practices: 'readonly',
        evidenceState: 'readonly',
        validateInput: 'readonly',
        briefing: 'readonly',
        parseNeeds: 'readonly',
        html: 'readonly',
        searchHtml: 'readonly',
        consultationHtml: 'readonly',
        speechConfig: 'readonly',
        safeDoctolib: 'readonly',
        generateSpeech: 'readonly',
      },
    },
  },
]);
