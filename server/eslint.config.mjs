// ESLint flat config for the server (`npm run lint`; the PR check runs it).
// ESLint + typescript-eslint recommended, with two deliberate choices below.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.node },
    rules: {
      // `any` is deliberate at the edges: untyped ESPN / Odds API JSON and
      // caught errors
      '@typescript-eslint/no-explicit-any': 'off',
      // A leading underscore marks a parameter that has to exist (Express
      // only treats 4-argument middleware as an error handler)
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
]);
