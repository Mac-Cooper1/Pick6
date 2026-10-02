// ESLint flat config for the client (`npm run lint`; the PR check runs it).
// ESLint + typescript-eslint recommended plus the React hooks rules, with
// the deliberate choices noted below. No `any`: API responses are typed in
// services/api.ts, and failed calls go through apiErrorMessage().
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
      // A leading underscore marks a parameter that has to exist
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
]);
