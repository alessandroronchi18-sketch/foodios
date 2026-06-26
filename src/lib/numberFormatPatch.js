// Patch globale: Number.prototype.toLocaleString('it-IT')
//
// In alcuni runtime (Safari iOS in private browsing, Node senza ICU full)
// `(4715).toLocaleString('it-IT')` ritorna "4715" SENZA il separatore migliaia.
// Per evitare di toccare 200+ call site nel codebase, patchamo il prototype
// una sola volta a startup: ogni chiamata con locale it/it-IT senza
// `useGrouping` esplicito riceve `useGrouping: 'always'` automaticamente.
//
// IMPORTANTE: questo file deve essere il PRIMO import di main.jsx, così la
// patch è installata prima di qualsiasi modulo che faccia toLocaleString
// al module-load time.
//
// Numeri < 1000 non sono visivamente toccati (nessun separatore necessario),
// ma siamo coperti automaticamente se in futuro crescono sopra 1000.

// Safety belt: anche se questo file dovrebbe runnare in un browser moderno con
// supporto a `useGrouping:'always'` (Chrome 108+, Safari 16.4+, FF 116+), in
// caso di runtime che non lo supporta verifichiamo prima e usiamo fallback.
;(function installPatch() {
  if (typeof Number === 'undefined' || !Number.prototype.toLocaleString) return
  // Idempotenza: se già patchato (es. doppio import) skip per evitare orig=patched.
  if (Number.prototype._foodios_locale_patched) return

  // Verifica che il runtime supporti useGrouping:'always' senza throw.
  try {
    const test = (12345).toLocaleString('it-IT', { useGrouping: 'always' })
    if (!test || typeof test !== 'string') return // unexpected: skip patch
  } catch {
    return // runtime non supporta: skip
  }

  const orig = Number.prototype.toLocaleString
  function patched(locale, options) {
    try {
      const isIT = locale === 'it-IT' || locale === 'it' ||
                   (Array.isArray(locale) && locale.some(l => l === 'it-IT' || l === 'it'))
      if (isIT && (!options || options.useGrouping === undefined)) {
        return orig.call(this, locale, Object.assign({}, options || {}, { useGrouping: 'always' }))
      }
    } catch {
      // Qualsiasi errore nel matcher → fallback all'originale: mai rompere il rendering.
    }
    return orig.call(this, locale, options)
  }
  // Sentinel anti-doppio-import
  Object.defineProperty(Number.prototype, '_foodios_locale_patched', { value: true, enumerable: false })
  Number.prototype.toLocaleString = patched
})()
