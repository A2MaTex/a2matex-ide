import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

const uiAndInfrastructureImports = [
  'react',
  'react/*',
  'electron',
  '@presentation/*',
  '@/presentation/*',
  '@infrastructure/*',
  '@/infrastructure/*',
  '@app/*',
  '@/app/*',
];

export default defineConfig([
  globalIgnores(['dist', 'dist-electron', 'coverage', 'playwright-report', 'test-results']),
  {
    files: ['**/*.{ts,tsx,cts,mts}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['src/domain/**/*.{ts,tsx,cts,mts}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [...uiAndInfrastructureImports, '@application/*', '@/application/*'],
              message: 'Domain may only depend on domain-safe shared modules.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/application/**/*.{ts,tsx,cts,mts}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: uiAndInfrastructureImports,
              message: 'Application must depend on ports, domain, and shared modules only.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['electron/**/*.cts', '*.{config,config.*}.{js,ts}', 'playwright.config.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
]);
