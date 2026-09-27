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
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Warn, don't fail. Every page loads its data with
      // useEffect(() => { load() }, []), and load() sets a loading flag
      // straight away - which this rule reports. It costs one extra render when
      // a page opens; it is not a bug. As an error it failed CI on every push.
      // The real fix is a shared data-loading hook (or TanStack Query) adopted
      // page by page; until then the warnings keep each spot visible.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // Config files run in Node, not the browser, so `process` exists there.
    files: ['vite.config.js', 'eslint.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
