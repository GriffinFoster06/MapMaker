import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const TRANSCENDENTALS = ['sin','cos','tan','asin','acos','atan','atan2','sinh','cosh','tanh','asinh','acosh','atanh','exp','expm1','log','log2','log10','log1p','pow','cbrt','hypot'];

export default tseslint.config(
  { ignores: ['**/dist/**', '**/dist-types/**', 'upstream/**', 'spikes/**', 'audit/**', '.tools/**', 'node_modules/**', '**/vendor/**', '**/public/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // §3.5: Math.random is banned in every engine package.
    files: ['packages/**/*.ts'],
    rules: {
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'Math.random is banned in engine packages; use ctx.rng(name) (ARCHITECTURE §3.5).' },
      ],
    },
  },
  {
    // §3.5: simulation code calls dmath.* for transcendental functions. Pass-through lives in dmath.ts.
    files: ['packages/**/*.ts'],
    ignores: ['packages/core/src/dmath.ts', '**/*.test.ts'],
    rules: {
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'Math.random is banned in engine packages; use ctx.rng(name) (ARCHITECTURE §3.5).' },
        ...TRANSCENDENTALS.map((property) => ({ object: 'Math', property, message: `Use dmath.${property} (ARCHITECTURE §3.5).` })),
      ],
      // `x ** y` is Math.pow in disguise (engine-dependent for non-integer exponents).
      'no-restricted-syntax': ['error', { selector: "BinaryExpression[operator='**'], AssignmentExpression[operator='**=']", message: 'Use dmath.pow, or multiply (ARCHITECTURE §3.5).' }],
    },
  },
);
