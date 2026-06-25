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

if (typeof Number !== 'undefined' && Number.prototype.toLocaleString) {
  const orig = Number.prototype.toLocaleString
  Number.prototype.toLocaleString = function (locale, options) {
    const isIT = locale === 'it-IT' || locale === 'it' ||
                 (Array.isArray(locale) && locale.some(l => l === 'it-IT' || l === 'it'))
    if (isIT && (!options || options.useGrouping === undefined)) {
      return orig.call(this, locale, Object.assign({}, options || {}, { useGrouping: 'always' }))
    }
    return orig.call(this, locale, options)
  }
}
