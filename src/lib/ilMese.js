// ── «Quanto hai guadagnato questo mese, e perché» ───────────────────────
//
// La prima pagina della nuova Analisi (ANALISI_DESIGN.md §5). Il titolare,
// 03/10/2026: «la parte di analisi è fatta male e inutile»; la prima domanda
// a cui rispondere è «quanto guadagno e perché».
//
// L'audit del vecchio P&L sui dati veri di Mara: utile all'82% dei ricavi,
// perché (1) le 3.104 fatture fornitori non entravano mai nel conto,
// (2) il personale contava zero — un solo dipendente attivo, con stipendio
// zero, e tre con stipendio segnati non attivi —, (3) gli incassi erano
// stimati senza dirlo e con l'IVA dentro, mentre i costi sono senza IVA.
//
// Qui il conto si fa con quello che c'è, e quello che manca si dice:
//
//   • gli INCASSI dalla cassa, se ci sono le chiusure del mese; altrimenti
//     stimati dall'inventario (venduto × prezzo medio dei formati), e la
//     parola «stimato» va con il numero. In tutti e due i casi senza IVA:
//     pasticceria e gelateria al 10%, aliquota che si può cambiare;
//   • le SPESE dalle fatture, per natura, senza IVA, per data della fattura
//     (motore in `contoEconomico.js`); gli investimenti stanno fuori dal
//     conto del mese e le spese senza categoria si contano a parte;
//   • il PERSONALE dalla pagina Personale, contando chi c'era quel mese. Se
//     non si sa, l'utile non si dà: un utile senza personale è falso.
//
// Tutto qui dentro è puro: niente rete, niente schermo. La lettura dei dati
// sta in `ilMeseArchivio.js`.

import { costoPersonaleMensile } from './stipendiCalc'
import { euro, euroSegno, quota, aMese, variazione } from './formatoAnalisi'

export const ALIQUOTA_IVA_INCASSI = 10

/** Obiettivi indicativi: la ricerca del 03/10 non ha trovato benchmark
 *  italiani solidi per la pasticceria artigianale. Si confronta il cliente
 *  con sé stesso; questi numeri sono solo il riferimento della barra. */
export const OBIETTIVI = { materiePrime: 30, personale: 30, primeCost: 60 }

/**
 * Il nome degli incassi, uguale in tutte le pagine dell'Analisi: «Incassi
 * stimati» quando vengono dall'inventario, «Incassi» dalla cassa. Audit del
 * 04/10 (§7): lo stesso numero si chiamava «Incassi senza IVA», «Incassi
 * stimati» e «Incassi (stimati)» in tre posti. «Senza IVA» si dice sotto il
 * numero, non nel nome.
 */
export const nomeIncassi = (stimati) => (stimati ? 'Incassi stimati' : 'Incassi')

const NF0 = new Intl.NumberFormat('it-IT', { useGrouping: 'always', maximumFractionDigits: 0 })

/**
 * Le spese del mese hanno l'IVA dentro? Le fatture importate da WebDesk hanno
 * l'imponibile a zero finché non arriva lo ZIP dell'Agenzia (a Mara 3.042 su
 * 3.104), e il conto le prende col totale. Audit del 04/10: la pagina diceva
 * «senza IVA» su spese che l'IVA ce l'avevano, e lo diceva solo la copertura,
 * chiusa. ANALISI_DESIGN §6: l'avvertimento sta nella riga sotto il numero.
 *
 * @returns {{ stato: 'senza'|'tutte'|'parte', breve: string, riga: string }}
 *   `breve` per le frasi («spese IVA compresa»), `riga` per sotto il numero.
 */
export function ivaDelleSpese(costi) {
  const c = costi?.copertura
  if (!c || !(Number(c.importoIvaCompresa) > 0) || !(c.nSenzaImponibile > 0)) {
    return { stato: 'senza', breve: 'senza IVA', riga: '' }
  }
  if (c.nSenzaImponibile >= c.nFatture) {
    return { stato: 'tutte', breve: 'IVA compresa', riga: `IVA compresa: ${NF0.format(c.nSenzaImponibile)} fatture senza imponibile` }
  }
  return {
    stato: 'parte', breve: 'in parte IVA compresa',
    riga: `di cui ${euro(c.importoIvaCompresa)} IVA compresa: ${NF0.format(c.nSenzaImponibile)} fatture su ${NF0.format(c.nFatture)} senza imponibile`,
  }
}

/** Le categorie di spesa come passi della cascata, nell'ordine del conto. */
export const PASSI_SPESA = [
  { ids: ['materie-prime'], etichetta: 'Materie prime', chiave: 'materiePrime' },
  { ids: ['confezionamento'], etichetta: 'Confezioni', chiave: 'confezioni' },
  { ids: ['affitto', 'utenze'], etichetta: 'Affitto e utenze', chiave: 'locale' },
  { ids: ['servizi', 'commissioni', 'marketing', 'personale-esterno'], etichetta: 'Servizi e commissioni', chiave: 'servizi' },
  { ids: ['manutenzione', 'altro'], etichetta: 'Altre spese', chiave: 'altre' },
]

const tonda = (n) => Math.round(Number(n) * 100) / 100
// Esportata il 04/10/2026: la Produzione e «Torna il conto?» scrivono il
// ricavo stimato senza IVA con questa stessa funzione e la stessa aliquota
// (decisione del titolare: lo stesso numero in tutte le pagine).
export const senzaIva = (lordo, aliquota = ALIQUOTA_IVA_INCASSI) => tonda(Number(lordo) / (1 + aliquota / 100))

/**
 * Gli incassi del mese, senza IVA.
 *
 * @param {object} o
 * @param {{ totV: number, giorni: number }|null} o.cassa  somma delle chiusure del mese
 * @param {{ ricavi: number|null, motivo?: string, ultimoGiorno?: string }|null} o.stima  da `ricaviDaInventario`
 * @param {number} [o.giorniDelMese]
 * @param {number} [o.aliquota]
 * @returns {{ valore: number|null, lordo: number|null, fonte: 'cassa'|'stima'|null, testo: string, giorni?: number }}
 */
export function incassiDelMese({ cassa = null, stima = null, giorniDelMese = 30, aliquota = ALIQUOTA_IVA_INCASSI } = {}) {
  if (cassa && cassa.giorni > 0 && Number(cassa.totV) > 0) {
    const parziale = cassa.giorni < giorniDelMese
    return {
      valore: senzaIva(cassa.totV, aliquota), lordo: tonda(cassa.totV), fonte: 'cassa', giorni: cassa.giorni,
      testo: parziale
        ? `dalla cassa: ${cassa.giorni} giorni su ${giorniDelMese} registrati`
        : 'dalla cassa, tutti i giorni registrati',
      parziale,
    }
  }
  if (stima && stima.ricavi != null && Number(stima.ricavi) > 0) {
    return {
      valore: senzaIva(stima.ricavi, aliquota), lordo: tonda(stima.ricavi), fonte: 'stima',
      testo: `stimati dall'inventario (venduto × prezzo medio dei formati)${stima.ultimoGiorno ? `, dati fino al ${stima.ultimoGiorno.slice(8, 10)}/${stima.ultimoGiorno.slice(5, 7)}` : ''}`,
      parziale: !!stima.parziale,
    }
  }
  return {
    valore: null, lordo: null, fonte: null, parziale: false,
    testo: stima?.motivo ? `nessuna chiusura di cassa e ${stima.motivo}` : 'nessuna chiusura di cassa e nessun inventario',
  }
}

/**
 * Gli incassi del mese messi insieme sede per sede (senza IVA).
 *
 * In ogni sede i giorni con la chiusura di cassa valgono la cassa, gli altri
 * la stima dall'inventario; quelli senza nessuno dei due restano scoperti.
 * Le parti le prepara `incassiSedeDelMese` (ilMeseArchivio.js).
 *
 * 05/10/2026: caricate 40 chiusure vere di Carlina (18 giorni d'agosto), il
 * Mese usava solo quelle anche per tutta l'azienda — `incassiDelMese` sceglie
 * la cassa appena ce n'è un giorno — e gli incassi d'agosto scendevano da
 * 124.553 € (stima delle tre sedi) a 28.490 €, contro le spese di tre sedi
 * per un mese intero: una perdita di 22.000 € che non esisteva.
 *
 * @param {{ nome?: string, cassa: { totV: number, giorni: number }, stima: { ricavi: number|null, giorni: number, ultimoGiorno?: string|null }, scoperti: number }[]} parti
 * @returns {{ valore: number|null, lordo: number|null, fonte: 'cassa'|'stima'|'misto'|null, giorni: number, giorniStimati: number, scoperti: number, parziale: boolean, completo: boolean, testo: string }}
 */
export function incassiDaSedi(parti = [], { aliquota = ALIQUOTA_IVA_INCASSI } = {}) {
  const ps = (parti || []).filter(Boolean)
  const gCassa = ps.reduce((s, p) => s + (Number(p.cassa?.giorni) || 0), 0)
  const lCassa = ps.reduce((s, p) => s + (Number(p.cassa?.totV) || 0), 0)
  const gStima = ps.reduce((s, p) => s + (p.stima?.ricavi != null ? Number(p.stima.giorni) || 0 : 0), 0)
  const lStima = ps.reduce((s, p) => s + (p.stima?.ricavi != null ? Number(p.stima.ricavi) || 0 : 0), 0)
  const scoperti = ps.reduce((s, p) => s + (Number(p.scoperti) || 0), 0)
  if (!(lCassa > 0) && !(lStima > 0)) {
    const motivo = ps.map(p => p.motivo).find(Boolean)
    return { valore: null, lordo: null, fonte: null, giorni: 0, giorniStimati: 0, scoperti, parziale: false, completo: false,
      testo: motivo ? `nessuna chiusura di cassa e ${motivo}` : 'nessuna chiusura di cassa e nessun inventario' }
  }
  const lordo = tonda(lCassa + lStima)
  const fonte = gCassa > 0 && gStima === 0 ? 'cassa' : gCassa === 0 ? 'stima' : 'misto'
  const gg = (n) => `${n} ${n === 1 ? 'giorno' : 'giorni'}`
  const dataBreve = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '')
  const descrivi = (p) => {
    const c = Number(p.cassa?.giorni) || 0
    const s = p.stima?.ricavi != null ? Number(p.stima.giorni) || 0 : 0
    const pezzi = []
    if (c) pezzi.push(`${gg(c)} dalla cassa`)
    if (s) pezzi.push(c ? `${s} stimati dall'inventario` : `stimati dall'inventario${p.scoperti && p.stima?.ultimoGiorno ? `, dati fino al ${dataBreve(p.stima.ultimoGiorno)}` : ''}`)
    if (p.scoperti && (c || !s)) pezzi.push(`${gg(p.scoperti)} senza dati`)
    return pezzi.join(', ') || 'nessun dato'
  }
  const testo = ps.length === 1 || !ps.some(p => p.nome)
    ? descrivi(ps[0])
    : ps.map(p => `${p.nome}: ${descrivi(p)}`).join(' · ')
  return { valore: senzaIva(lordo, aliquota), lordo, fonte, giorni: gCassa, giorniStimati: gStima, scoperti,
    parziale: scoperti > 0, completo: scoperti === 0, testo }
}

/**
 * Il personale del mese, e quello che non torna.
 *
 * `costoPersonaleMensile` conta solo gli attivi: chi è segnato non attivo
 * sparisce anche dai mesi in cui lavorava. Sui dati di Mara sono tre persone
 * con 8.039 € lordi al mese: qui si contano a parte e si dice.
 */
export function personaleDelMese(dipendenti = [], { mese, sedeId = null } = {}) {
  const asOf = `${mese}-15`
  const attivi = costoPersonaleMensile(dipendenti, { sedeId, asOf })
  const inattiviConStipendio = (dipendenti || []).filter(d =>
    d && d.attivo === false && !d.data_fine && (Number(d.stipendio_lordo_mensile) > 0 || Number(d.costo_orario) > 0)
    && (!sedeId || !d.sede_id || d.sede_id === sedeId))
  const lordoInattivi = tonda(inattiviConStipendio.reduce((s, d) => s + (Number(d.stipendio_lordo_mensile) || 0), 0))
  const nAttivi = attivi.contati + attivi.senzaDato
  let valore = attivi.contati > 0 ? attivi.totale : null
  let stato = 'ok'
  let testo = ''
  if (!nAttivi && !inattiviConStipendio.length) {
    stato = 'manca'; testo = 'nessun dipendente nella pagina Personale'
  } else if (!attivi.contati) {
    stato = 'manca'
    testo = attivi.senzaDato
      ? `${attivi.senzaDato === 1 ? '1 persona attiva' : `${attivi.senzaDato} persone attive`} senza stipendio`
      : 'nessuna persona attiva con lo stipendio'
  } else if (attivi.senzaDato) {
    stato = 'parziale'
    testo = `${attivi.contati} con lo stipendio, ${attivi.senzaDato} senza`
  } else {
    testo = `${attivi.contati === 1 ? '1 persona' : `${attivi.contati} persone`}, costo azienda`
  }
  if (inattiviConStipendio.length) {
    if (stato === 'ok') stato = 'parziale'
    testo += `${testo ? ' · ' : ''}${inattiviConStipendio.length === 1 ? 'una persona con stipendio è segnata' : `${inattiviConStipendio.length} persone con stipendio sono segnate`} ${inattiviConStipendio.length === 1 ? 'non attiva' : 'non attive'} (${euro(lordoInattivi)} lordi al mese)`
  }
  // Con qualcuno senza stipendio il costo è un minimo, non il costo: l'utile
  // calcolato sopra sarebbe più alto del vero. Lo si dà, ma come «almeno».
  return { valore, stato, testo, contati: attivi.contati, senzaDato: attivi.senzaDato, inattivi: inattiviConStipendio.length, lordoInattivi }
}

/** Le spese di un gruppo di categorie, dal risultato di `costiPerMese`. */
function sommaCategorie(costi, ids) {
  const voci = (costi?.perCategoria || []).filter(c => ids.includes(c.id))
  if (!voci.length) return { importo: 0, voci: [] }
  return { importo: tonda(voci.reduce((s, c) => s + (Number(c.importo) || 0), 0)), voci }
}

/**
 * Il conto del mese: le righe, l'utile, le quote, i passi della cascata.
 *
 * @param {object} o
 * @param {ReturnType<typeof incassiDelMese>} o.incassi
 * @param {object|null} o.costi  risultato di `costiPerMese` (null = non letto)
 * @param {ReturnType<typeof personaleDelMese>} o.personale
 * @param {{ importo: number, voci?: object[] }|null} [o.speseFisse]  spese senza fattura
 */
export function contoDelMese({ incassi, costi, personale, speseFisse = null }) {
  const ricavi = incassi?.valore ?? null
  // Incassi a cui mancano dei giorni (nessuna cassa e nessun inventario):
  // contro le spese di un mese intero darebbero un utile — o una perdita —
  // che non esiste (05/10/2026, vedi incassiDaSedi). Si mostrano, non si
  // sottraggono.
  const incassiCompleti = incassi?.completo !== false
  const gruppi = PASSI_SPESA.map(p => ({ ...p, ...sommaCategorie(costi, p.ids) }))
  // Le categorie che il motore conosce e questa pagina no finiscono in
  // «Altre spese», non spariscono.
  const noti = new Set(PASSI_SPESA.flatMap(p => p.ids))
  const extra = (costi?.perCategoria || []).filter(c => !noti.has(c.id) && c.tipo !== 'investimento')
  if (extra.length) {
    const altre = gruppi.find(g => g.chiave === 'altre')
    altre.importo = tonda(altre.importo + extra.reduce((s, c) => s + (Number(c.importo) || 0), 0))
    altre.voci = [...altre.voci, ...extra]
  }
  const daClassificare = costi ? tonda(costi.daClassificare?.importo || 0) : null
  const fisse = speseFisse ? tonda(speseFisse.importo || 0) : 0
  const speseFatture = costi ? tonda(gruppi.reduce((s, g) => s + g.importo, 0) + daClassificare) : null
  const pers = personale?.valore ?? null
  const spese = speseFatture == null ? null : tonda(speseFatture + fisse + (pers ?? 0))
  // L'utile si dà solo se si sanno incassi, spese in fattura e personale.
  const utile = incassiCompleti && ricavi != null && speseFatture != null && pers != null ? tonda(ricavi - speseFatture - fisse - pers) : null
  const q = (x) => (ricavi > 0 && x != null ? (x / ricavi) * 100 : null)
  const materiePrime = gruppi.find(g => g.chiave === 'materiePrime').importo
  const passi = [
    { etichetta: nomeIncassi(incassi?.fonte === 'stima' || incassi?.fonte === 'misto'), valore: ricavi, tipo: 'inizio', chiave: 'incassi' },
    // Le materie prime restano anche a zero solo se le fatture non si sanno
    // (per dire «non lo so»); a zero con le fatture lette sono una riga «−0 €».
    ...gruppi.filter(g => g.importo > 0 || (g.chiave === 'materiePrime' && !costi)).map(g => ({ etichetta: g.etichetta, valore: costi ? g.importo : null, tipo: 'meno', chiave: g.chiave })),
    ...(daClassificare > 0 ? [{ etichetta: 'Da classificare', valore: daClassificare, tipo: 'meno', chiave: 'daClassificare' }] : []),
    ...(fisse > 0 ? [{ etichetta: 'Spese senza fattura', valore: fisse, tipo: 'meno', chiave: 'fisse' }] : []),
    { etichetta: 'Personale', valore: pers, tipo: 'meno', chiave: 'personale' },
    { etichetta: 'Utile', valore: utile, tipo: 'fine', chiave: 'utile' },
  ]
  return {
    ricavi, utile, spese, speseFatture, personale: pers, speseFisse: fisse, daClassificare,
    gruppi, passi,
    quote: {
      utile: q(utile),
      materiePrime: costi ? q(materiePrime) : null,
      personale: q(pers),
      primeCost: costi && pers != null ? q(materiePrime + pers) : null,
    },
    investimenti: costi?.investimenti?.importo ?? 0,
    // Chi c'è dentro «Da classificare»: serve alla tabella per dire a chi
    // dare una categoria per primo.
    fornitoriDaClassificare: (costi?.daClassificare?.fornitori || []).map(f => ({ nome: f.nome, importo: Number(f.importo) || 0 })),
    // Quanto resta prima del personale: un numero vero anche quando il
    // personale manca, e chiamato col suo nome non si scambia per l'utile.
    primaDelPersonale: incassiCompleti && ricavi != null && speseFatture != null ? tonda(ricavi - speseFatture - fisse) : null,
    // «stimato» anche quando una parte dei giorni viene dall'inventario.
    stimato: incassi?.fonte === 'stima' || incassi?.fonte === 'misto',
    incassiIncompleti: !incassiCompleti,
  }
}

/** Perché manca l'utile, in una frase. */
export function motivoSenzaUtile(conto, { personale, costi } = {}) {
  if (conto.utile != null) return null
  const manca = []
  if (conto.ricavi == null) manca.push('gli incassi')
  else if (conto.incassiIncompleti) manca.push('gli incassi di alcuni giorni')
  if (!costi) manca.push('le fatture')
  if (personale?.valore == null) manca.push('il personale')
  if (!manca.length) return 'non ho tutti i dati'
  return manca.length === 1 ? `manca ${manca[0]}` : `mancano ${manca.slice(0, -1).join(', ')} e ${manca.at(-1)}`
}

/**
 * Perché questo mese è diverso da quello di confronto: le voci che spostano
 * l'utile, in €, dalla più pesante. Un incasso in più alza l'utile, una spesa
 * in più lo abbassa. Voci che non si sanno in uno dei due mesi non entrano.
 *
 * @returns {{ chiave, etichetta, effetto: number, attuale: number, prima: number, fornitori?: object[] }[]}
 */
export function causeDelCambio(attuale, prima, { soglia = 50, massimo = 5 } = {}) {
  if (!attuale || !prima) return []
  const out = []
  if (attuale.ricavi != null && prima.ricavi != null) {
    out.push({ chiave: 'incassi', etichetta: nomeIncassi(attuale.stimato), effetto: tonda(attuale.ricavi - prima.ricavi), attuale: attuale.ricavi, prima: prima.ricavi })
  }
  for (const g of attuale.gruppi || []) {
    const p = (prima.gruppi || []).find(x => x.chiave === g.chiave)
    if (!p || attuale.speseFatture == null || prima.speseFatture == null) continue
    const fornitori = confrontaFornitori(g.voci, p.voci)
    out.push({ chiave: g.chiave, etichetta: g.etichetta, effetto: tonda(p.importo - g.importo), attuale: g.importo, prima: p.importo, fornitori })
  }
  if (attuale.personale != null && prima.personale != null) {
    out.push({ chiave: 'personale', etichetta: 'Personale', effetto: tonda(prima.personale - attuale.personale), attuale: attuale.personale, prima: prima.personale })
  }
  return out.filter(c => Math.abs(c.effetto) >= soglia)
    .sort((a, b) => Math.abs(b.effetto) - Math.abs(a.effetto))
    .slice(0, massimo)
}

/** I fornitori che spiegano la differenza di una voce, dal più pesante. */
function confrontaFornitori(vociA = [], vociB = []) {
  const somma = (voci) => {
    const m = new Map()
    for (const c of voci || []) for (const f of c.fornitori || []) m.set(f.nome, (m.get(f.nome) || 0) + (Number(f.importo) || 0))
    return m
  }
  const a = somma(vociA), b = somma(vociB)
  const nomi = new Set([...a.keys(), ...b.keys()])
  return [...nomi].map(nome => ({ nome, delta: tonda((a.get(nome) || 0) - (b.get(nome) || 0)) }))
    .filter(f => Math.abs(f.delta) >= 1)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
    .slice(0, 2)
}

/**
 * Il titolo-conclusione di «Cosa è cambiato», in dieci parole al massimo
 * (ANALISI_DESIGN §6): la voce che ha spostato di più l'utile.
 * «Confezioni: +11.542 € di spesa rispetto ad agosto 2025»,
 * «Hai incassato 10.000 € in più rispetto ad agosto 2025».
 */
export function titoloCause(cause = [], meseConfronto) {
  const c = cause[0]
  if (!c) return meseConfronto ? `Il confronto con ${aMese(meseConfronto).replace(/^ad? /, '')}` : 'Il confronto'
  const rispetto = meseConfronto ? ` rispetto ${aMese(meseConfronto)}` : ''
  const diff = tonda(c.attuale - c.prima)
  if (c.chiave === 'incassi') return `Hai incassato ${euro(Math.abs(diff))} ${diff > 0 ? 'in più' : 'in meno'}${rispetto}`
  return `${c.etichetta}: ${euroSegno(diff)} di spesa${rispetto}`
}

/** La frase di una causa: «Materie prime +2.340 € di spesa, soprattutto DESA (+1.100 €)». */
export function fraseCausa(c, meseConfronto) {
  const rispetto = meseConfronto ? ` rispetto ${aMese(meseConfronto)}` : ''
  if (c.chiave === 'incassi') {
    return `Hai incassato ${euro(Math.abs(c.effetto))} ${c.effetto > 0 ? 'in più' : 'in meno'}${rispetto}.`
  }
  const spesa = -c.effetto
  const chi = c.fornitori?.length
    ? `, soprattutto ${c.fornitori.map(f => `${f.nome} (${euroSegno(f.delta)})`).join(' e ')}`
    : ''
  return `${c.etichetta}: ${euroSegno(spesa)} di spesa${rispetto}${chi}.`
}

/**
 * Il titolo-conclusione della cascata, in dieci parole al massimo. Senza
 * l'utile dice quanto pesano le fatture sugli incassi (prima ripeteva «Le
 * spese del mese: 50.497 €», lo stesso numero della tessera accanto, audit
 * 04/10 IM10), e se le spese hanno l'IVA dentro lo dice (`iva`, da
 * `ivaDelleSpese`).
 */
export function titoloCascata(conto, iva = null) {
  if (conto.ricavi > 0 && conto.utile != null) {
    const resta = Math.round((conto.utile / conto.ricavi) * 100)
    return resta >= 0
      ? `Su 100 € incassati te ne restano ${resta}`
      : `Su 100 € incassati ne hai spesi ${100 - resta}: il mese è in perdita`
  }
  const conIva = iva && iva.stato !== 'senza' ? `, ${iva.breve}` : ''
  if (conto.ricavi > 0 && conto.speseFatture != null) return `Le fatture valgono il ${quota((conto.speseFatture / conto.ricavi) * 100)} degli incassi${conIva}`
  if (conto.speseFatture != null) return `Le spese del mese: ${euro(conto.spese)}${conIva}`
  return 'Il conto del mese'
}

/** Il giudizio di un mese rispetto a un altro, per la tessera dell'utile. */
export function confrontoUtile(attuale, prima) {
  if (attuale?.utile == null || prima?.utile == null) return null
  return variazione({ attuale: attuale.utile, confronto: prima.utile })
}

export { quota }
