import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // `ignoreRestSiblings` allows the idiomatic omit pattern
      // `const { dropped, ...rest } = obj`, which this codebase uses in
      // App.jsx (budget map) and in tests that drop a field before validating.
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^[A-Z_]', ignoreRestSiblings: true },
      ],
    },
  },
  {
    // Context files intentionally export both a Provider component and its
    // `use*` hook. Fast Refresh only complains about the non-component export;
    // splitting them into separate files would be churn for no benefit.
    files: ['src/context/*.jsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
