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
    include: ['tests/unit/**/*.test.js'],
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
        // React hooks (richiedono @testing-library/react).
        'src/lib/useIsMobile.js',
        'src/lib/useNotifiche.js',
        'src/lib/useOnlineStatus.js',
        'src/lib/usePlanPricing.js',
        'src/lib/useBackgroundJobs.js',
        'src/lib/useUploadManager.js',
        // Wrapper su libreria esterna (no logica testabile in isolamento).
        'src/lib/supabase.js',
        'src/lib/xlsx.js',
        'src/lib/lazyWithReload.js',
        // Side-effect managers (browser-only).
        'src/lib/backgroundManager.js',
        'src/lib/imageUtils.js',
        'src/lib/idleTimeout.js',
        'src/lib/sessionGuard.js',
      ],
      thresholds: {
        // Audit 2026-07-01 batch 11 push: 37% → 73% lines (+36 punti, +481 test).
        // Threshold 70 dà margine 3% per modifiche minori senza rompere CI.
        // Per salire ulteriormente: testare storage.js (1%, supabase mock) +
        // auth.js (1%, supabase auth mock) + componenti React (richiede
        // @testing-library/react).
        lines: 70,
        functions: 75,
        statements: 70,
        branches: 60,
      },
    },
  },
})
