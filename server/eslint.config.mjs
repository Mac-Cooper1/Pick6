// ESLint flat config for the server (`npm run lint`; the PR check runs it).
// ESLint + typescript-eslint recommended, with the deliberate choices below.
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
      // A leading underscore marks a parameter that has to exist (Express
      // only treats 4-argument middleware as an error handler)
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // `any` only where untyped outside JSON is parsed (ESPN, The Odds API)
    // and in dev scripts. Everywhere else uses real types; caught errors
    // are `unknown` and go through utils/errors.ts.
    files: [
      'src/services/espnClient.ts',
      'src/services/oddsClient.ts',
      'src/services/seasonService.ts',
      'scripts/**',
      'prisma/**',
    ],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
]);
