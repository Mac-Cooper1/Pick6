// ESLint flat config for the client (`npm run lint`; the PR check runs it).
// ESLint + typescript-eslint recommended plus the React hooks rules, with
// the deliberate choices noted below.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The two classic hooks rules. The plugin's newer React Compiler rules
      // assume the compiler, which this app doesn't use.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // `any` is deliberate at the edges (untyped API JSON, caught errors)
      '@typescript-eslint/no-explicit-any': 'off',
      // A leading underscore marks a parameter that has to exist
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
]);
