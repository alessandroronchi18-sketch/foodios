// ── Le due scritture della bolla: registrare e annullare ──────────────────
//
// Il conto sta in `src/lib/bolle.js`, dove si prova senza disegnare niente.
// Qui c'è solo la scrittura, ed è la stessa per tutte e due le strade:
// **quattro pezzi di dati in una sola chiamata al database** — giacenze e
// registro dei rifornimenti (della sede), listino e storico dei prezzi
// (dell'azienda). O entrano tutti o non entra niente: una bolla che scrive il
// magazzino e non il listino lascia il food cost indietro di una consegna, e
// non se ne accorge nessuno.
//
// Stavano tutte e due dentro `Dashboard.jsx`, che ha un tetto di righe tenuto
// fermo da una prova — e il messaggio di quella prova dice «è il momento di
// scorporare, non di alzare il tetto».
import { useCallback } from 'react'
import { preparaScrittureBolla, annullaBolla } from '../lib/bolle'

/**
 * @param {object} ctx  lo stato e chi lo sa scrivere:
 *   `{ magazzino, logRif, ricettario, logPrezzi, utente, chiavi, ssaveTutto, set }`
 *   dove `chiavi` è `{ SK_RIC, SK_LOG_PRZ, SK_MAG, SK_LOGRIF }` e `set` è
 *   `{ ric, logPrezzi, magazzino, logRif }`.
 */
export default function useBolle(ctx) {
  const { magazzino, logRif, ricettario, logPrezzi, utente, chiavi, ssaveTutto, set } = ctx

  const stato = () => ({
    magazzino: magazzino || {},
    logRif: logRif || [],
    ingredientiCosti: ricettario?.ingredienti_costi || {},
    logPrezzi: logPrezzi || [],
    utente: utente || null,
  })

  /** Scrive i quattro pezzi, o nessuno. Torna l'errore invece di lanciarlo:
   *  chi chiama è una schermata, e deve poter dire cosa è andato storto. */
  const scrivi = useCallback(async (p, soloSeCarichi) => {
    const base = ricettario || { ricette: {}, ingredienti_costi: {} }
    const nuovoRic = { ...base, ricette: base.ricette || {}, ingredienti_costi: p.ingredientiCosti }
    try {
      await ssaveTutto([
        { key: chiavi.SK_RIC, value: nuovoRic },
        { key: chiavi.SK_LOG_PRZ, value: p.logPrezzi },
        ...(soloSeCarichi && p.caricati === 0 ? [] : [
          { key: chiavi.SK_MAG, value: p.magazzino },
          { key: chiavi.SK_LOGRIF, value: p.logRif },
        ]),
      ])
    } catch (e) {
      return { ok: false, errore: e?.message || 'rete' }
    }
    set.ric(nuovoRic)
    set.logPrezzi(p.logPrezzi)
    if (!(soloSeCarichi && p.caricati === 0)) { set.magazzino(p.magazzino); set.logRif(p.logRif) }
    return { ok: true }
  }, [ricettario, ssaveTutto, chiavi, set])

  const registra = useCallback(async (righe, documento) => {
    if (!(righe || []).some(r => r?.chiave)) return { ok: false, errore: 'non c\'è niente da registrare' }
    const p = preparaScrittureBolla(righe, documento, stato())
    const esito = await scrivi(p, true)
    if (!esito.ok) return esito
    return { ok: true, caricati: p.caricati, applicati: p.applicati, storicizzati: p.storicizzati }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magazzino, logRif, ricettario, logPrezzi, utente, scrivi])

  const annulla = useCallback(async (identita) => {
    const p = annullaBolla(identita, stato())
    if (!p.trovata) return { ok: false, errore: 'di questa bolla non risulta nessun carico da annullare' }
    const esito = await scrivi(p, false)
    if (!esito.ok) return esito
    return { ok: true, tolti: p.tolti, prezziRimessi: p.prezziRimessi, prezziNonRimessi: p.prezziNonRimessi }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [magazzino, logRif, ricettario, logPrezzi, utente, scrivi])

  return { registra, annulla }
}
