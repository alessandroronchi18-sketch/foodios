// ── Completa le fatture che ci sono già, crea solo quelle che mancano ────
//
// Il titolare, 24/09/2026: «ho tutte le fatture su webdesk ma non riesco a
// fare un export con tutte le info necessarie — prodotti, prezzo, dati del
// fornitore».
//
// Le 3.520 fatture del design partner sono entrate dall'Excel di WebDesk:
// fornitore, numero, data e totali, **nessuna riga e nessuna P.IVA**. Il
// dettaglio sta negli XML, che si scaricano in blocco dall'Agenzia delle
// Entrate. Ma caricarli col percorso di prima era peggio che inutile:
//
//   • le fatture già presenti venivano **scartate come doppioni**, righe
//     comprese — cioè proprio il dato che si voleva aggiungere;
//   • quando l'Excel e l'XML scrivono il fornitore in modo diverso
//     («ACME SRL» / «Acme S.r.l.»), la chiave non combaciava e la fattura
//     entrava **una seconda volta**.
//
// Qui ogni XML viene prima cercato fra le fatture esistenti. Se c'è, si
// riempiono i campi vuoti (righe, P.IVA, IBAN, scadenza) e **nient'altro**:
// numero, fornitore, totale, stato, pagamenti restano quelli che il titolare
// ha già — possono essere stati corretti a mano. Se non c'è, si crea. Se ce
// ne sono due possibili, non si tocca niente e lo si dice: meglio una fattura
// da guardare che una scritta sulla riga sbagliata.
import { fatturaKey, pickFattura } from './fattureImport'

// Le forme societarie e la punteggiatura cambiano da un programma all'altro;
// il nome no. Quello che viene dopo «di» invece resta: «Bar di Mario» e «Bar
// di Luigi» sono due fornitori, e tagliarlo li farebbe diventare uno.
const FORME = /\b(s\.?\s?r\.?\s?l\.?s?|s\.?\s?p\.?\s?a\.?|s\.?\s?n\.?\s?c\.?|s\.?\s?a\.?\s?s\.?|s\.?\s?c\.?\s?a?\.?\s?r\.?\s?l\.?|soc(ieta)?\.?\s*coop(erativa)?\.?|a\s+socio\s+unico|unipersonale|in\s+liquidazione)/gi

export function normFornitore(nome) {
  return String(nome ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(FORME, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Numero documento senza spazi e senza differenza di maiuscole. */
export function normNumero(n) {
  return String(n ?? '').replace(/\s+/g, '').toUpperCase()
}

const stessoTotale = (a, b) => a != null && b != null && Math.abs(Number(a) - Number(b)) <= 0.011

const vuoto = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0)

/**
 * I campi che un XML può aggiungere a una fattura che c'è già. Solo quelli
 * vuoti: mai sovrascrivere un dato che qualcuno può aver corretto a mano.
 */
export function patchDaXml(esistente, xml) {
  const patch = {}
  if (!esistente.ha_righe && Array.isArray(xml.righe) && xml.righe.length) patch.righe = xml.righe
  for (const k of ['piva', 'cf', 'iban', 'data_scadenza']) {
    if (vuoto(esistente[k]) && !vuoto(xml[k])) patch[k] = xml[k]
  }
  return patch
}

/**
 * Decide, per ogni fattura letta dagli XML, se completa una esistente, se è
 * nuova, se è già completa o se è ambigua.
 *
 * @param {object[]} records  fatture lette dagli XML (parseFatturaXML)
 * @param {object[]} esistenti fatture in archivio: { id, numero_rif,
 *   fornitore, data_fattura, totale, piva, cf, iban, data_scadenza, ha_righe }
 * @returns {{ completa: {id, patch, record}[], nuove: object[],
 *   giaComplete: number, ambigue: object[], doppieNelFile: number }}
 */
export function abbinaFatture(records, esistenti) {
  const perChiave = new Map()
  const perNumeroData = new Map()
  for (const e of esistenti) {
    const k = fatturaKey(e)
    if (!perChiave.has(k)) perChiave.set(k, [])
    perChiave.get(k).push(e)
    const nd = normNumero(e.numero_rif) + '|' + (e.data_fattura || '')
    if (!perNumeroData.has(nd)) perNumeroData.set(nd, [])
    perNumeroData.get(nd).push(e)
  }

  const out = { completa: [], nuove: [], giaComplete: 0, ambigue: [], doppieNelFile: 0 }
  const visti = new Set()
  // Una fattura esistente si completa una volta sola, anche se due XML
  // diversi la reclamano.
  const toccate = new Set()

  for (const r of records) {
    const k = fatturaKey(r)
    if (visti.has(k)) { out.doppieNelFile++; continue }
    visti.add(k)

    let candidati = perChiave.get(k) || []
    if (!candidati.length) {
      // Piano B: stesso numero e stessa data, e poi o lo stesso nome del
      // fornitore scritto diversamente, o lo stesso totale.
      const stessi = perNumeroData.get(normNumero(r.numero_rif) + '|' + (r.data_fattura || '')) || []
      const nf = normFornitore(r.fornitore)
      const perNome = stessi.filter(e => nf && normFornitore(e.fornitore) === nf)
      candidati = perNome.length ? perNome : stessi.filter(e => stessoTotale(e.totale, r.totale))
    }

    if (candidati.length > 1) { out.ambigue.push({ record: r, candidati: candidati.map(c => c.id) }); continue }
    if (!candidati.length) { out.nuove.push(r); continue }

    const e = candidati[0]
    if (toccate.has(e.id)) { out.doppieNelFile++; continue }
    toccate.add(e.id)
    const patch = patchDaXml(e, r)
    if (Object.keys(patch).length) out.completa.push({ id: e.id, patch, record: r })
    else out.giaComplete++
  }
  return out
}

/**
 * Le fatture esistenti, con quel che serve per abbinarle. Le righe non si
 * scaricano: basta sapere se ce ne sono (`righe->0`), altrimenti con lo
 * storico completo si porterebbero giù decine di migliaia di righe.
 */
export async function fattureEsistentiPerAbbinare(supabase, orgId) {
  const tutte = []
  const PAGINA = 1000
  for (let offset = 0; offset < 200000; offset += PAGINA) {
    const { data, error } = await supabase.from('fatture')
      .select('id, numero_rif, fornitore, data_fattura, totale, piva, cf, iban, data_scadenza, prima_riga:righe->0')
      .eq('organization_id', orgId)
      .order('id')
      .range(offset, offset + PAGINA - 1)
    if (error) throw new Error(error.message)
    for (const r of (data || [])) {
      const { prima_riga, ...resto } = r
      tutte.push({ ...resto, ha_righe: prima_riga != null })
    }
    if (!data || data.length < PAGINA) break
  }
  return tutte
}

/**
 * Scrive i completamenti, qualche richiesta alla volta. Un errore su una
 * fattura non ferma le altre: si contano e si riportano.
 */
export async function applicaCompletamenti(supabase, orgId, completa, { parallele = 8, onProgresso } = {}) {
  let fatte = 0
  const errori = []
  for (let i = 0; i < completa.length; i += parallele) {
    const blocco = completa.slice(i, i + parallele)
    const esiti = await Promise.all(blocco.map(c =>
      supabase.from('fatture').update(c.patch).eq('id', c.id).eq('organization_id', orgId)
        .then(({ error }) => error ? { c, error } : null)))
    for (const e of esiti) {
      if (e) errori.push({ id: e.c.id, numero: e.c.record?.numero_rif, messaggio: e.error.message })
      else fatte++
    }
    onProgresso?.(Math.min(i + parallele, completa.length), completa.length)
  }
  return { fatte, errori }
}

/**
 * Cosa aggiungere all'anagrafica dei fornitori che ci sono già: solo i campi
 * vuoti, dal primo XML che li ha. I fornitori nuovi non si creano qui — lo fa
 * già il percorso delle fatture, con le sue conferme.
 *
 * @returns {{ id: string, nome: string, patch: object }[]}
 */
export function completaAnagraficaFornitori(fornitori, records) {
  const perNome = new Map()
  const perPiva = new Map()
  for (const f of fornitori) {
    perNome.set(normFornitore(f.nome), f)
    if (f.partita_iva) perPiva.set(String(f.partita_iva).replace(/\s+/g, ''), f)
  }
  const patches = new Map()
  for (const r of records) {
    const f = (r.piva && perPiva.get(String(r.piva).replace(/\s+/g, ''))) || perNome.get(normFornitore(r.fornitore))
    if (!f) continue
    const p = patches.get(f.id) || {}
    const d = r.fornitore_dati || {}
    const da = {
      partita_iva: r.piva, codice_fiscale: r.cf,
      indirizzo: d.indirizzo, cap: d.cap, citta: d.citta, provincia: d.provincia,
      email: d.email, telefono: d.telefono,
    }
    for (const [k, v] of Object.entries(da)) {
      if (vuoto(f[k]) && vuoto(p[k]) && !vuoto(v)) p[k] = v
    }
    if (Object.keys(p).length) patches.set(f.id, p)
  }
  return fornitori.filter(f => patches.has(f.id)).map(f => ({ id: f.id, nome: f.nome, patch: patches.get(f.id) }))
}

/** Le righe nuove, pronte per l'INSERT. */
export function righeNuove(nuove, orgId, sedeId, sediCondivise = null) {
  return nuove.map(r => ({
    ...pickFattura(r, orgId, sedeId),
    ...(sediCondivise && sediCondivise.length > 1 ? { sedi_condivise: sediCondivise } : null),
  }))
}
