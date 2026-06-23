// ESLint config v9 flat — audit 2026-06-22.
// Focus: catch automaticamente i bug della classe "isTablet undefined"
// (top-level component che usa variabile non destrutturata dai props).
// + regole hooks anti stale-closure.

import js from '@eslint/js'
import reactPlugin from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}', 'api/**/*.{js,jsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        // Browser
        window: 'readonly', document: 'readonly', navigator: 'readonly',
        localStorage: 'readonly', sessionStorage: 'readonly', location: 'readonly',
        fetch: 'readonly', Request: 'readonly', Response: 'readonly', Headers: 'readonly',
        URL: 'readonly', URLSearchParams: 'readonly', FormData: 'readonly',
        File: 'readonly', FileReader: 'readonly', Blob: 'readonly',
        Image: 'readonly', Audio: 'readonly', HTMLElement: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly',
        requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
        console: 'readonly', alert: 'readonly', confirm: 'readonly', prompt: 'readonly',
        crypto: 'readonly', btoa: 'readonly', atob: 'readonly',
        TextEncoder: 'readonly', TextDecoder: 'readonly',
        AbortController: 'readonly', AbortSignal: 'readonly',
        Notification: 'readonly', IntersectionObserver: 'readonly',
        ResizeObserver: 'readonly', MutationObserver: 'readonly',
        ServiceWorker: 'readonly', PushManager: 'readonly',
        WebSocket: 'readonly', EventSource: 'readonly',
        performance: 'readonly', queueMicrotask: 'readonly',
        DOMParser: 'readonly', XMLSerializer: 'readonly', XPathResult: 'readonly',
        Node: 'readonly', NodeList: 'readonly', Element: 'readonly',
        SVGElement: 'readonly', HTMLCanvasElement: 'readonly',
        HTMLImageElement: 'readonly', HTMLInputElement: 'readonly',
        getComputedStyle: 'readonly', matchMedia: 'readonly',
        CustomEvent: 'readonly', Event: 'readonly', PopStateEvent: 'readonly',
        // React (some files)
        React: 'readonly',
        // Node (api/)
        process: 'readonly', Buffer: 'readonly', global: 'readonly',
        __dirname: 'readonly', __filename: 'readonly',
        // Edge runtime
        Deno: 'readonly',
      },
    },
    rules: {
      // BUG CRITICO catch: variabile non dichiarata (HeaderPersonale.isTablet style)
      'no-undef': 'error',

      // Hook rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // React safety
      'react/jsx-no-undef': 'error',
      'react/jsx-key': ['warn', { checkFragmentShorthand: true }],
      'react/no-children-prop': 'warn',

      // Common bugs
      'no-unused-vars': 'off',  // troppi false positive su props destructuring
      'no-cond-assign': 'warn',
      'no-constant-binary-expression': 'error',
      'no-dupe-keys': 'error',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-fallthrough': 'error',
      'no-irregular-whitespace': 'error',
      'no-self-assign': 'error',
      'no-unreachable': 'error',
      'no-useless-escape': 'warn',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      // Niente regola che richiede semi colons etc — focus solo su bug detection

      // Skip prop-types (non li usiamo, troppi warning)
      'react/prop-types': 'off',
      // Skip style rules (focus solo bug detection)
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
    },
    settings: {
      react: { version: 'detect' },
    },
  },
  {
    // Test files: rilasso
    files: ['tests/**/*.{js,jsx}'],
    languageOptions: {
      globals: {
        describe: 'readonly', it: 'readonly', test: 'readonly',
        expect: 'readonly', beforeEach: 'readonly', afterEach: 'readonly',
        beforeAll: 'readonly', afterAll: 'readonly', vi: 'readonly',
      },
    },
    rules: {
      'no-undef': 'error',
    },
  },
  {
    ignores: [
      'dist/**', 'node_modules/**', 'coverage/**',
      '.vercel/**', 'public/**',
      '**/*.config.js',  // self
    ],
  },
]
