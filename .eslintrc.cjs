/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2020: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist/', 'dist-electron/', 'release/', 'node_modules/'],
  rules: {
    // Project is mid-migration; keep lint focused on correctness/safety.
    'react-refresh/only-export-components': 'off',

    // TypeScript compiler already enforces unused checks.
    '@typescript-eslint/no-unused-vars': 'off',

    // Codebase contains targeted uses of `any` and CommonJS requires (Electron main).
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/no-require-imports': 'off',
  },
};
