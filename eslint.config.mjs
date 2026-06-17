import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

/**
 * Architecture boundaries are enforced by lint, not by convention, so the
 * layering cannot silently rot. Dependency direction (innermost first):
 *
 *   domain  <-  state/viz/ai/workers  <-  ui  <-  app
 *
 * The domain layer is pure TypeScript: no React, no Next, no DOM, no vendor
 * SDKs. If a domain file needs one of those, the boundary is being violated.
 */
const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  // Allow intentionally-unused args/vars when underscore-prefixed.
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // --- domain/ : pure, framework-free, the product's brain ----------------
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['react', 'react-dom', 'next', 'next/*'], message: 'domain/ must stay framework-free (no React/Next).' },
            { group: ['three', '@react-three/*', 'recharts'], message: 'domain/ must not import visualization libraries.' },
            { group: ['openai', '@anthropic-ai/*'], message: 'domain/ must not import AI/vendor SDKs.' },
            { group: ['zustand', 'zustand/*'], message: 'domain/ must not depend on the state library.' },
            { group: ['@/state/*', '@/ui/*', '@/viz/*', '@/ai/*', '@/app/*'], message: 'domain/ must not import outer layers.' },
          ],
        },
      ],
    },
  },

  // --- ui/ : presentation only, no engine internals or business logic -----
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/domain/simulation/analytical/*'], message: 'ui/ must not reach into engine internals — go through state/.' },
            { group: ['@/workers/*'], message: 'ui/ must not talk to workers directly — go through state/.' },
          ],
        },
      ],
    },
  },

  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts'],
  },
];

export default eslintConfig;
