import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  },
  // In produzione drop dei console.log e debugger residui — i console.error
  // restano (servono per Sentry/Vercel logs). Riduce ~5KB di bundle e
  // soprattutto evita di esporre informazioni di debug ai clienti via DevTools.
  esbuild: {
    pure: ['console.log', 'console.debug', 'console.info', 'console.trace'],
  },
  build: {
    // Chunk size warning: alziamo a 1500KB visto che `vendor` + `pdf` finiscono
    // sotto questo tetto. Senza, Vite avvisa anche su chunk legittimi.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Code splitting manuale per ridurre il main bundle.
        // - react/react-dom + supabase-js + recharts → vendor (caricato sempre)
        // - jspdf + jspdf-autotable + html2canvas → pdf (lazy: solo per export)
        // - xlsx caricato gia' dinamicamente da CDN, non incluso qui
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('dompurify')) return 'pdf'
            if (id.includes('recharts') || id.includes('d3-')) return 'charts'
            if (id.includes('@supabase')) return 'supabase'
            // @xyflow PRIMA dei check 'react': il suo path contiene "react/" e
            // finirebbe nel chunk 'react' rompendo React↔ReactDOM (__SECRET_INTERNALS).
            if (id.includes('@xyflow')) return 'xyflow'
            if (id.includes('react-dom')) return 'react-dom'
            if (id.includes('react/') || id.includes('/react.') || id.includes('scheduler')) return 'react'
          }
        },
      },
    },
  },
})
