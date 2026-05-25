// Caricamento dinamico di SheetJS (XLSX) da CDN con SRI hash.
// Usiamo CDN invece del npm package perché ha vulnerabilità high senza fix.
// Cache su window.XLSX per evitare richieste multiple.

export function loadXLSX() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('XLSX richiede browser'))
    if (window.XLSX) return resolve(window.XLSX)
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.integrity = 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw'
    s.crossOrigin = 'anonymous'
    s.onload = () => resolve(window.XLSX)
    s.onerror = () => reject(new Error('Impossibile caricare XLSX'))
    document.head.appendChild(s)
  })
}
