// Caricamento dinamico di SheetJS (XLSX) da CDN, con FALLBACK su più CDN e
// SENZA SRI integrity. Motivo del fix: l'hash SRI fisso (stale o non combaciante
// col file servito dal CDN) faceva RIFIUTARE lo script al browser → l'utente
// vedeva "Impossibile caricare il parser Excel (rete bloccata?)" e l'import si
// rompeva. Il npm package ha una vuln high non patchata sul registry, quindi
// restiamo su CDN affidabili, ma con più host di fallback per non dipendere da
// un singolo punto di rottura. Cache su window.XLSX per non ricaricarlo.
// Ordine: cloudflare per primo perche' e' l'unico CDN whitelistato nella CSP
// (`Content-Security-Policy: script-src ... https://cdnjs.cloudflare.com`
// in vercel.json). Gli altri sarebbero bloccati come fallback: teniamoli come
// backup teorico ma primary e' cloudflare, cosi' la console non si riempie
// di CSP violation errors ad ogni parse.
const CDN_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js',
]

function loadFrom(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = url
    s.async = true
    s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error('XLSX non inizializzato')))
    s.onerror = () => reject(new Error('script error: ' + url))
    document.head.appendChild(s)
  })
}

export async function loadXLSX() {
  if (typeof window === 'undefined') throw new Error('XLSX richiede browser')
  if (window.XLSX) return window.XLSX
  let lastErr
  for (const url of CDN_URLS) {
    try { return await loadFrom(url) }
    catch (e) { lastErr = e }
  }
  throw new Error('Impossibile caricare il parser Excel (tutti i CDN non raggiungibili). Controlla la connessione e riprova.')
}
