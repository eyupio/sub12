import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // eslint-plugin-react-hooks 7 folded the React Compiler diagnostics into
      // its recommended set. They report ~70 pre-existing findings here, and
      // each one is a behavioural change (moving state out of an effect, or a
      // ref read out of render) rather than anything a dependency bump should
      // be making. The two classic rules — rules-of-hooks and exhaustive-deps —
      // stay on, so the gate enforces exactly what it enforced under v5.
      // Re-enable these one rule at a time, with the refactor each needs.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/use-memo': 'off',
      'react-hooks/preserve-manual-memoization': 'off',

      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // The route tree is a manifest of route objects, not a component module;
    // Fast Refresh has nothing to preserve in it. react-refresh 0.5 counts each
    // of its ~85 exports as a violation, which is noise rather than a finding.
    files: ['src/routeTree.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
)
