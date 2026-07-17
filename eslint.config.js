import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

// Correctness-focused config, deliberately not a style/formatting linter —
// this codebase has an established dense coding convention (long one-liners,
// minimal whitespace) that isn't worth churning through. Rules here target
// exactly the bug classes found repeatedly across this project's review
// history: unused/dead code, undefined references, stale closures in
// effects/hooks, and missing dependency arrays.
export default [
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // React 18 automatic JSX runtime
      'react/prop-types': 'off', // no TypeScript/PropTypes convention in this codebase
      'react/no-unescaped-entities': 'off', // noisy on this codebase's prose-heavy JSX text
      'react/display-name': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-fallthrough': 'error',
      'no-dupe-keys': 'error',
      'no-const-assign': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }], // this codebase consistently uses catch{} for optional/non-critical operations
      'react-hooks/exhaustive-deps': 'warn',
    },
    settings: { react: { version: '18.2.0' } },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'supabase/**', '*.config.js'],
  },
];
