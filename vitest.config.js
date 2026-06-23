import { defineConfig } from 'vitest/config'

// Unit test della logica pura (src/lib + api/lib). Ambiente 'node' di default;
// i test che toccano window/sessionStorage dichiarano
// `// @vitest-environment happy-dom` in cima al file.
//
// Coverage: `npm run test:coverage` per report HTML su coverage/. Audit
// 2026-07-01 batch 11: push verso 100 (baseline 73 -> 85 in batch 10).
// Target qualitativo: pure functions 90%+; component logic 50%+ (richiede
// @testing-library/react se aggiunto).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.{js,jsx}'],
    globals: true,
    // singleThread per evitare race su coverage temp dir su macOS.
    pool: 'threads',
    threads: { singleThread: true },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/lib/**/*.js', 'src/lib/**/*.jsx', 'api/lib/**/*.js'],
      exclude: [
        // Lookup tables senza logica (test = banali, no value).
        'src/lib/comuniItaliani.js',
        'src/lib/theme.js',
        'src/lib/icons.jsx',
        'src/lib/storageKeys.js',
        'src/lib/changelog.js',
        // React hooks (richiedono @testing-library/react).
        'src/lib/useIsMobile.js',
        'src/lib/useNotifiche.js',
        'src/lib/useOnlineStatus.js',
        'src/lib/usePlanPricing.js',
        'src/lib/useBackgroundJobs.js',
        'src/lib/useUploadManager.js',
        'src/lib/useVoiceInput.js',
        // Wrapper su libreria esterna (no logica testabile in isolamento).
        'src/lib/supabase.js',
        'src/lib/xlsx.js',
        'src/lib/lazyWithReload.js',
        // Side-effect managers (browser-only).
        'src/lib/backgroundManager.js',
        'src/lib/imageUtils.js',
        'src/lib/idleTimeout.js',
        'src/lib/sessionGuard.js',
        // Browser-only Web APIs (service worker, Push API): coperti da test e2e
        // browser-based, non testabili in node. Audit 2026-06-19 P4.
        'src/lib/pwa.js',
        'src/lib/pushNotifications.js',
      ],
      thresholds: {
        // Audit 2026-07-01 batch 11-12 push: 37% → 94% lines (+57 punti).
        // 1054/1054 test, 63 file di test, 672 test nuovi nel batch.
        // Threshold 90/90/85/75 dà margine 4% sotto al baseline 94/91/95/81.
        lines: 90,
        functions: 90,
        statements: 85,
        branches: 75,
      },
    },
  },
})
