import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
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
    // The content model's whole job is Traditional Chinese text where
    // U+3000 IDEOGRAPHIC SPACE is meaningful data (script indentation,
    // heading separators). The irregular-whitespace rule would force
    // escaping the exact bytes the package exists to preserve.
    files: ['packages/content-model/**/*.ts'],
    rules: {
      'no-irregular-whitespace': 'off',
    },
  },
])
