import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import prettierPlugin from 'eslint-plugin-prettier'

const toISOStringMessage =
  'Använd todayLocal() från shared/date-utils istället för .toISOString().slice/.split/.substring — M13/M56/M60.'

export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      prettier: prettierPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      'prettier/prettier': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.callee.property.name='toISOString'][callee.property.name='slice']",
          message: toISOStringMessage,
        },
        {
          selector:
            "CallExpression[callee.object.callee.property.name='toISOString'][callee.property.name='split']",
          message: toISOStringMessage,
        },
        {
          selector:
            "CallExpression[callee.object.callee.property.name='toISOString'][callee.property.name='substring']",
          message: toISOStringMessage,
        },
      ],
    },
  },
  // Klass B-undantag (S59): filer som medvetet använder UTC-baserade toISOString
  {
    files: [
      'src/main/services/sie5/sie5-export-service.ts',
      'src/main/pre-update-backup.ts',
      'src/renderer/pages/PageSettings.tsx',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  // Test-filer: toISOString tillåtet för test-seeding och bugg-verifiering
  {
    files: [
      'tests/**/*.ts',
      'tests/**/*.tsx',
      'src/main/ipc/test-handlers.ts',
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
]
