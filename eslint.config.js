import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/'] },
  js.configs.recommended,
  { languageOptions: { globals: globals.node, ecmaVersion: 2024, sourceType: 'module' }, rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
];
