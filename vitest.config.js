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
    // I test girano in parallelo su tutti i core.
    //
    // Prima c'era `threads: { singleThread: true }`, messo per evitare una
    // corsa sulla cartella temporanea del calcolo della COPERTURA su macOS. Ma
    // la copertura si calcola solo con `npm run test:coverage`: nella suite
    // normale quel vincolo non serviva, e teneva 2.531 test in fila su un core
    // solo mentre gli altri tre stavano fermi.
    //
    // La sintassi era anche vecchia (Vitest 1.x): dalla 2 in poi si scrive
    // sotto `poolOptions`, quindi quella riga non faceva nemmeno quello che
    // diceva. Qui la forma è quella giusta, e il vincolo resta solo dove serve.
    pool: 'threads',
    // In Vitest 4 `poolOptions` è stato rimosso e queste opzioni stanno al
    // primo livello: scriverlo alla vecchia maniera non dava errore, dava un
    // avviso di deprecazione e veniva **ignorato**. Cioè lo stesso genere di
    // problema che c'era prima — una riga che sembra decidere qualcosa e non
    // decide niente.
    //
    // `fileParallelism: false` è l'equivalente del vecchio thread singolo, e
    // serve solo quando si calcola la copertura (su macOS due processi si
    // contendono la stessa cartella temporanea). Nella suite normale i file
    // girano in parallelo su tutti i core.
    fileParallelism: !process.env.VITEST_COVERAGE,
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
      // ── Un cricchetto, non un traguardo ──────────────────────────────
      //
      // Queste soglie devono dire una cosa sola: «non si scende». Se sono più
      // alte di dove siamo, il comando fallisce **sempre**, nessuno lo lancia
      // più, e smette di proteggere qualsiasi cosa.
      //
      // Era esattamente la situazione fino al 15/09/2026: `functions: 50` e
      // `branches: 60` con la copertura vera al 27%. `npm run test:coverage`
      // finiva in rosso a ogni esecuzione da quando `src/components` e
      // `src/views` erano stati inclusi nel conteggio (giugno 2026), e nessuno
      // se n'era accorto perché il comando non gira né in CI né nel gate di
      // push: falliva in silenzio sul portatile di chi lo lanciava.
      //
      // Ora sono un paio di punti sotto la misura reale del 15/09/2026
      // (statements 39,4 · branches 28,7 · functions 28,5 · lines 42,3): un
      // calo vero le fa scattare, un giro normale no. Quando la copertura
      // sale, si alzano — a mano, e si scrive la data.
      thresholds: {
        lines: 40,
        statements: 37,
        functions: 26,
        branches: 27,
      },
    },
  },
})
