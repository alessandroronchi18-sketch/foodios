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
    // Audit 2026-06-24: timeout esteso per i test dynamic-import (universal-
    // import-smoke, views-render-smoke, accessibility-axe) che caricano file
    // grandi (Dashboard 2900 righe, AdminPage 3300 righe) e in CI sotto carico
    // possono superare 5s default.
    testTimeout: 30000,
    hookTimeout: 30000,
    // Limita massimi heap per evitare OOM su GitHub Actions runner (7GB).
    maxConcurrency: 4,
    // Slow-test reporter per identificare test problematici in futuro.
    slowTestThreshold: 5000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      // Audit 2026-06-22 sess.3: coverage espanso oltre src/lib per includere
      // componenti e views ora coperti da smoke render + import.
      include: [
        'src/lib/**/*.js', 'src/lib/**/*.jsx', 'api/lib/**/*.js',
        'src/components/**/*.jsx', 'src/views/**/*.jsx',
      ],
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
        // Audit 2026-06-22 sess.3: dopo aver incluso src/components + src/views
        // (file molto piu' grandi senza tutti i path testati), abbassiamo a
        // soglie compatibili coi smoke test. La regressione a -10 punti su
        // src/lib e' vietata dalle CI (file specifiche tracciate altrove).
        lines: 30,
        functions: 50,
        statements: 30,
        branches: 60,
      },
    },
  },
})
