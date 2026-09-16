// Le fatture da pagare: quando scadono, quanto resta, quanto urge.
//
// Scorporato da `src/components/Scadenzario.jsx` il 16/09/2026. Quel file è a
// 3.199 righe ed era coperto dai test all'**1%**: dentro ci sono i conti che
// dicono al titolare quali fornitori sono in ritardo e quanto deve.
//
// ═══ Il difetto che si è visto scorporando ════════════════════════════════
//
// `src/lib/fatture.js` calcola già le scadenze, e sa distinguere i due modi in
// cui i fornitori contano i giorni:
//
//   «30 gg d.f.»      trenta giorni dalla data della fattura
//   «30 gg d.f. f.m.» trenta giorni dalla FINE DEL MESE della fattura — lo
//                     standard dei fornitori alimentari
//
// Una fattura del 3 marzo a «30 giorni fine mese» si paga il **30 aprile**,
// non il 2 aprile: ventotto giorni di differenza, che cambiano completamente
// quali fatture sono davvero in ritardo.
//
// Quel calcolo lo usava una pagina sola: la previsione di cassa. Lo
// Scadenzario aveva il suo, che ignorava il tipo di termine — e il commento
// scritto due righe sopra spiegava perché il tipo conta, mentre il codice
// sotto non ne teneva conto.
//
// Oggi non morde: tutti e 326 i fornitori in produzione sono a «netti». Ma la
// voce «giorni dalla fine del mese» è nel menu a tendina della pagina, e il
// giorno che qualcuno la sceglie le due pagine danno due scadenze diverse per
// la stessa fattura. Qui il calcolo è uno solo, quello di `fatture.js`.
//
// Un dato che vale la pena tenere a mente: in produzione **nessuna** delle
// 3.520 fatture porta la scadenza scritta nel documento (gli XML di questi
// fornitori non hanno il blocco DatiPagamento). Ogni data mostrata è una
// convenzione, e va detto a chi programma i pagamenti sopra.

import { scadenzaFattura, residuoFattura, GIORNI_PAGAMENTO_DEFAULT } from './fatture'

export { GIORNI_PAGAMENTO_DEFAULT }

/** Il nome del fornitore come chiave: maiuscolo, spazi normalizzati. */
export const normNome = s => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ')

/** La scadenza come oggetto Date (mezzogiorno, per non farsi spostare dal fuso). */
export function dataScadenza(f) {
  const { iso } = scadenzaFattura(f)
  if (!iso) return null
  const d = new Date(`${iso}T12:00:00`)
  return isNaN(d.getTime()) ? null : d
}

/** La scadenza come `AAAA-MM-GG`, o null se non si può sapere. */
export function isoScadenza(f) {
  return scadenzaFattura(f).iso
}

/**
 * Quanti giorni mancano. Negativo = già scaduta.
 * Si confrontano i GIORNI, non gli istanti: una fattura che scade oggi alle
 * 23:00 scade oggi, non «fra 0,04 giorni».
 */
export function giorniAllaScadenza(data, adesso = new Date()) {
  if (!data) return null
  const oggi = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate())
  const scad = new Date(data.getFullYear(), data.getMonth(), data.getDate())
  return Math.round((scad - oggi) / 86400000)
}

/**
 * In quale fascia di urgenza cade una fattura.
 * Le fasce sono quelle che userebbe una persona: già scaduta, questa
 * settimana, questo mese, più in là.
 */
export function urgenza(f, adesso = new Date()) {
  if (f?.stato === 'pagata') return 'pagata'
  const d = dataScadenza(f)
  if (!d) return 'futura'
  const g = giorniAllaScadenza(d, adesso)
  if (g < 0) return 'scaduta'
  if (g <= 7) return 'settimana'
  if (g <= 30) return 'mese'
  return 'futura'
}

/** «3 giorni fa», «oggi», «domani», «tra 12 giorni». */
export function quandoScade(giorni) {
  if (giorni === null || giorni === undefined) return ''
  if (giorni < 0) return Math.abs(giorni) === 1 ? '1 giorno fa' : `${Math.abs(giorni)} giorni fa`
  if (giorni === 0) return 'oggi'
  if (giorni === 1) return 'domani'
  return `tra ${giorni} giorni`
}

/**
 * Aggiunge a ogni fattura quello che serve per mostrarla: scadenza, urgenza,
 * quanto resta da pagare, se è una nota di credito.
 *
 * `anagrafiche` è la mappa `NOME FORNITORE → { termini_pagamento, termini_tipo,
 * iban }`: da lì arrivano i termini di pagamento concordati con quel fornitore.
 * Senza, valgono i trenta giorni predefiniti.
 */
export function arricchisci(fatture, anagrafiche = {}, adesso = new Date()) {
  const lista = Array.isArray(fatture) ? fatture : []
  return lista.map(f => {
    const anag = anagrafiche[normNome(f?.fornitore)]
    const conTermini = {
      ...f,
      _termini: Number.isFinite(anag?.termini_pagamento) ? anag.termini_pagamento : undefined,
      _terminiTipo: anag?.termini_tipo || 'netti',
      iban: f?.iban || anag?.iban || '',
    }
    const { iso, stimata, tipo } = scadenzaFattura(conTermini)
    const d = iso ? new Date(`${iso}T12:00:00`) : null
    // ── Una nota di credito riduce il debito ────────────────────────────────
    //
    // Il segno si prende dall'IMPORTO, non dall'etichetta. Prima era
    // `segno = tipo === 'nota_credito' ? -1 : 1` moltiplicato per il totale, e
    // quello dà il risultato giusto solo se le note di credito sono scritte
    // col totale POSITIVO. Nel database vero (16/09/2026) non c'è nemmeno una
    // riga con `tipo = 'nota_credito'`: tutte e 3.520 sono «fattura», e le
    // note di credito sono **fatture con l'importo negativo** — quattro, fino
    // a −365,55 €.
    //
    // Con le due convenzioni mescolate il conto sbagliava di due volte
    // l'importo: una nota di credito da 100 € dichiarata come tale e scritta
    // −100 diventava +100, e il dovuto al fornitore usciva 200 € più alto del
    // vero. Su una schermata da cui partono i bonifici, sono 200 € pagati in
    // più.
    //
    // Adesso: se è dichiarata nota di credito vale meno di zero comunque sia
    // scritta; se non è dichiarata ma l'importo è negativo, è una nota di
    // credito lo stesso — perché è quello che è.
    const totaleGrezzo = Number(f?.totale) || 0
    const importoNetto = f?.tipo === 'nota_credito' ? -Math.abs(totaleGrezzo) : totaleGrezzo
    const segno = importoNetto < 0 ? -1 : 1
    const pagato = Number(f?.importo_pagato) || 0
    // Le pagate non hanno residuo, qualunque cosa dicano i numeri.
    const residuo = f?.stato === 'pagata' ? 0 : importoNetto - segno * pagato
    return {
      ...conTermini,
      urgenza: urgenza(conTermini, adesso),
      dueIso: iso,
      // La scadenza è scritta nel documento o l'abbiamo dedotta noi? In
      // produzione è dedotta per tutte e 3.520: chi programma i pagamenti su
      // quelle date lavora su una convenzione, non su un accordo.
      dueStimata: stimata,
      dueTipo: tipo,
      dueDays: d ? giorniAllaScadenza(d, adesso) : null,
      segno,
      isNC: segno < 0,
      importoNetto,
      pagato,
      residuo,
    }
  })
}

/**
 * Le fatture divise per fascia, ognuna ordinata per scadenza e poi per
 * importo: in testa le più vecchie e le più grosse, che sono quelle da
 * guardare per prime.
 */
export function perUrgenza(fattureArricchite) {
  const out = { scaduta: [], settimana: [], mese: [], futura: [], pagata: [] }
  for (const f of fattureArricchite || []) {
    if (out[f?.urgenza]) out[f.urgenza].push(f)
  }
  for (const k of Object.keys(out)) {
    out[k].sort((a, b) => {
      const da = a.dueIso || '0000-00-00'
      const db = b.dueIso || '0000-00-00'
      if (da !== db) return da.localeCompare(db)
      return (Number(b.totale) || 0) - (Number(a.totale) || 0)
    })
  }
  return out
}

/**
 * Il riepilogo in cima alla pagina: quanto devi, quanto è già scaduto, quanto
 * scade questa settimana.
 *
 * I totali sono **netti**: le note di credito aperte scalano il debito, perché
 * è quello che succede davvero quando paghi. Ma si contano anche a parte, o
 * un totale più basso del previsto sembrerebbe un errore.
 */
export function riepilogo(gruppi) {
  const g = gruppi || {}
  const somma = arr => (arr || []).reduce((s, f) => s + (Number(f?.residuo) || 0), 0)
  const aperte = [...(g.scaduta || []), ...(g.settimana || []), ...(g.mese || []), ...(g.futura || [])]
  const arrotonda = n => Math.round(n * 100) / 100
  return {
    daPagare: arrotonda(somma(aperte)),
    scaduto: arrotonda(somma(g.scaduta)),
    settimanaTot: arrotonda(somma(g.settimana)),
    creditiNC: arrotonda(aperte.filter(f => f.isNC).reduce((s, f) => s + Math.abs(Number(f.residuo) || 0), 0)),
    nDaPagare: aperte.filter(f => !f.isNC).length,
    nScadute: (g.scaduta || []).filter(f => !f.isNC).length,
    nSettimana: (g.settimana || []).filter(f => !f.isNC).length,
    nNC: aperte.filter(f => f.isNC).length,
    // Quante di quelle scadenze sono dedotte da noi invece che lette dal
    // documento. Se sono tutte, il riepilogo è un'ipotesi e va detto.
    nStimate: aperte.filter(f => f.dueStimata).length,
  }
}

/** Le fasce, con come si chiamano e in che ordine si mostrano. */
export const FASCE = {
  scaduta:   { label: 'SCADUTA',          order: 0, header: 'Scadute',          sub: 'da pagare con urgenza' },
  settimana: { label: 'QUESTA SETTIMANA', order: 1, header: 'Questa settimana', sub: 'entro 7 giorni' },
  mese:      { label: 'QUESTO MESE',      order: 2, header: 'Questo mese',      sub: 'entro 30 giorni' },
  futura:    { label: 'FUTURA',           order: 3, header: 'Future',           sub: 'oltre 30 giorni' },
  pagata:    { label: 'PAGATA',           order: 4, header: 'Pagate',           sub: 'già saldate' },
}

/** I filtri in cima all'elenco, e quali fasce mostra ognuno. */
export const FILTRI = [
  { id: 'tutte',       label: 'Tutte',       gruppi: ['scaduta', 'settimana', 'mese', 'futura'] },
  { id: 'scadute',     label: 'Scadute',     gruppi: ['scaduta'] },
  { id: 'in_scadenza', label: 'In scadenza', gruppi: ['settimana', 'mese'] },
  { id: 'pagate',      label: 'Pagate',      gruppi: ['pagata'] },
]
