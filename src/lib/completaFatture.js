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
import { fatturaKey, pickFattura, colonnaMancante } from './fattureImport'
import { ibanIsValid, normalizeIban } from './sepa'

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
  // Di quale società è (03/10/2026). Si propone solo se la riga in archivio
  // HA la chiave, cioè se la colonna è stata letta: prima della migration la
  // colonna non c'è, e proporla farebbe risultare «da completare» ogni
  // fattura a ogni ricarica dello stesso ZIP.
  if ('cessionario_piva' in esistente && vuoto(esistente.cessionario_piva) && !vuoto(xml.cessionario_piva)) {
    patch.cessionario_piva = xml.cessionario_piva
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
const COLONNE_ABBINA = 'id, numero_rif, fornitore, data_fattura, totale, piva, cf, iban, data_scadenza, prima_riga:righe->0'

export async function fattureEsistentiPerAbbinare(supabase, orgId) {
  const tutte = []
  const PAGINA = 1000
  // `cessionario_piva` c'è solo dopo la migration del 03/10/2026. Se il
  // database non la conosce si rilegge senza, e le righe non portano la
  // chiave: `patchDaXml` allora non la propone.
  let colonne = COLONNE_ABBINA + ', cessionario_piva'
  for (let offset = 0; offset < 200000; offset += PAGINA) {
    let { data, error } = await supabase.from('fatture')
      .select(colonne)
      .eq('organization_id', orgId)
      .order('id')
      .range(offset, offset + PAGINA - 1)
    if (error && colonne !== COLONNE_ABBINA && colonnaMancante(error) === 'cessionario_piva') {
      colonne = COLONNE_ABBINA
      ;({ data, error } = await supabase.from('fatture')
        .select(colonne)
        .eq('organization_id', orgId)
        .order('id')
        .range(offset, offset + PAGINA - 1))
    }
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
  // Le colonne che il database non ha: si tolgono dal completamento invece
  // di perdere tutto il resto (righe, P.IVA, IBAN) per colpa di una.
  const tolte = new Set()
  const ripulita = (patch) => {
    const o = { ...patch }
    for (const c of tolte) delete o[c]
    return o
  }
  const scrivi = async (c) => {
    for (let giro = 0; giro < 5; giro++) {
      const patch = ripulita(c.patch)
      if (!Object.keys(patch).length) return 'vuota'
      const { error } = await supabase.from('fatture').update(patch).eq('id', c.id).eq('organization_id', orgId)
      if (!error) return null
      const col = colonnaMancante(error)
      if (col && col in patch) { tolte.add(col); continue }
      return error
    }
    return { message: 'colonne mancanti nel database' }
  }
  for (let i = 0; i < completa.length; i += parallele) {
    const blocco = completa.slice(i, i + parallele)
    const esiti = await Promise.all(blocco.map(c => scrivi(c).then(error => ({ c, error }))))
    for (const { c, error } of esiti) {
      // Restava solo una colonna che non c'è: niente da scrivere, e non è
      // un errore.
      if (error === 'vuota') continue
      if (error) errori.push({ id: c.id, numero: c.record?.numero_rif, messaggio: error.message })
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
      // Solo un IBAN che passa il controllo: uno sbagliato in anagrafica è
      // peggio di nessuno, perché il file dei bonifici lo scarta in silenzio.
      iban: ibanIsValid(r.iban) ? normalizeIban(r.iban) : null,
    }
    for (const [k, v] of Object.entries(da)) {
      if (vuoto(f[k]) && vuoto(p[k]) && !vuoto(v)) p[k] = v
    }
    if (Object.keys(p).length) patches.set(f.id, p)
  }
  return fornitori.filter(f => patches.has(f.id)).map(f => ({ id: f.id, nome: f.nome, patch: patches.get(f.id) }))
}

/** Le righe nuove, pronte per l'INSERT, tutte verso la stessa destinazione. */
export function righeNuove(nuove, orgId, sedeId, sediCondivise = null) {
  return righeNuoveVerso(nuove, orgId, () => ({ sedeId, sediCondivise }))
}

/**
 * Le righe nuove, ognuna verso la sua destinazione: con due società nella
 * stessa azienda, le fatture di uno stesso ZIP vanno in sedi diverse.
 *
 * @param {(r: object) => { sedeId: string|null, sediCondivise: string[]|null }} destinazioneDi
 */
export function righeNuoveVerso(nuove, orgId, destinazioneDi) {
  return nuove.map(r => {
    const { sedeId = null, sediCondivise = null } = destinazioneDi(r) || {}
    const condivisa = Array.isArray(sediCondivise) && sediCondivise.length > 1
    return {
      // Una spesa condivisa ha la sede vuota apposta: la divisione la fa la
      // ripartizione sui chili prodotti, non una sede scelta a caso.
      ...pickFattura(r, orgId, condivisa ? null : sedeId),
      ...(condivisa ? { sedi_condivise: sediCondivise } : null),
    }
  })
}
