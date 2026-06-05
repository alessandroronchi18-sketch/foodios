import { lazy } from 'react'

// Avvolge React.lazy per gestire il fallimento del caricamento di un chunk.
//
// Scenario tipico: dopo un deploy, l'index.html ancora aperto nel browser punta
// ad hash di chunk che non esistono piu sul server. Il caricamento lazy fallisce
// con "Failed to fetch dynamically imported module". Qui, invece di mostrare un
// errore, ricarichiamo la pagina UNA volta per prendere l'index.html aggiornato.
//
// Anti-loop: salviamo un timestamp in sessionStorage e ricarichiamo al massimo
// una volta ogni 15s. Se il chunk si carica con successo azzeriamo il flag, cosi
// il prossimo deploy potra di nuovo ricaricare. Se invece fallisce ancora subito
// dopo il reload (errore reale, non solo cache), rilanciamo l'errore vero.
const FLAG = 'foodos_chunk_reload_ts'

export function lazyWithReload(factory) {
  return lazy(() =>
    factory()
      .then(mod => {
        try { sessionStorage.removeItem(FLAG) } catch { /* storage off */ }
        return mod
      })
      .catch(err => {
        let last = 0
        try { last = Number(sessionStorage.getItem(FLAG)) || 0 } catch { /* storage off */ }
        if (Date.now() - last > 15000) {
          try { sessionStorage.setItem(FLAG, String(Date.now())) } catch { /* storage off */ }
          window.location.reload()
          return new Promise(() => {}) // sospende il render: la pagina si ricarica
        }
        throw err // gia ricaricato di recente: errore reale, non insistere
      })
  )
}
