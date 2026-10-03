// ── Conto economico dalle fatture: le letture e le scritture ────────────
//
// Il conto sta in `contoEconomico.js`, dove si prova senza database. Qui ci
// sono solo le cose che toccano l'archivio, con il client che arriva da chi
// chiama (così le prove ne passano uno finto):
//
//   • leggiFatturePeriodo(supabase, orgId, { dal, al, conDescrizioni })
//       → { fatture, eccezioniDisponibili }
//     mille alla volta, solo le colonne del conto. `eccezioniDisponibili` è
//     falso finché la colonna `fatture.categoria_spesa` non c'è (migration
//     20261003b, scritta e non applicata): il conto funziona lo stesso, solo
//     senza le voci decise fattura per fattura.
//   • leggiCategorieFornitori(supabase, orgId)
//       → { fornitori, categoriePerFornitore, etichetteNonRiconosciute }
//     LANCIA se la lettura non riesce: una lettura fallita non è «nessuna
//     categoria». Presa per vuota, la schermata riproporrebbe da classificare
//     fornitori già classificati, e il conto metterebbe tutto in
//     «da classificare» senza dire che è un errore di rete.
//   • produzionePerSedeMese(supabase, orgId, { dal, al })
//       → { 'AAAA-MM': { idSede: grammi } }
//     i grammi prodotti, per dividere le spese condivise mese per mese:
//     `costiPerMese(…, { produzionePerSede: (m) => prod[m] })`.
//   • salvaCategorieFornitori(supabase, orgId, scelte, fornitori)
//       → { salvati, creati, errori, righe }
//   • salvaCategoriaFattura(supabase, orgId, fatturaId, categoriaId | null)
//       → { ok, motivo?, messaggio? }
//
// In `fornitori.categoria` si scrive il NOME della voce («Materie prime»),
// non l'id: la pagina Fornitori mostra quel campo così com'è, e lo usava già
// per le etichette di prodotto («Latticini»), che `categoriaDaEtichetta`
// continua a capire. In `fatture.categoria_spesa` si scrive l'id: è una
// colonna nuova, che nessuno mostra a mano.
import { colonnaMancante } from './fattureImport'
import { normPiva } from './societaSedi'
import { categoriaDaEtichetta, categoriaPerId, chiaveFornitore } from './contoEconomico'

const PAGINA = 1000
const COLONNE = 'id, numero_rif, fornitore, piva, data_fattura, totale, imponibile, imposta, tipo, sede_id, sedi_condivise'
// Le prime tre righe bastano a proporre la voce di un fornitore: scaricarle
// tutte vorrebbe dire decine di migliaia di righe per una proposta.
const DESCRIZIONI = ', d0:righe->0->>descrizione, t0:righe->0->>totale, d1:righe->1->>descrizione, t1:righe->1->>totale, d2:righe->2->>descrizione, t2:righe->2->>totale'

const giornoValido = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? ''))

function conDescrizioniDa(r) {
  const { d0, t0, d1, t1, d2, t2, ...resto } = r
  const descrizioni = [[d0, t0], [d1, t1], [d2, t2]]
    .filter(([d]) => d != null && String(d).trim())
    .map(([descrizione, totale]) => ({ descrizione, totale: totale == null || totale === '' ? null : Number(totale) }))
  return { ...resto, descrizioni }
}

/**
 * Le fatture di un periodo, per data della fattura, con le sole colonne del
 * conto. `dal`/`al` ('AAAA-MM-GG', compresi) sono facoltativi: senza, tutte.
 */
export async function leggiFatturePeriodo(supabase, orgId, { dal = null, al = null, conDescrizioni = false, onProgresso } = {}) {
  if (!orgId) throw new Error('manca l\'azienda')
  if ((dal && !giornoValido(dal)) || (al && !giornoValido(al))) throw new Error('periodo non valido: servono date AAAA-MM-GG')
  const base = COLONNE + (conDescrizioni ? DESCRIZIONI : '')
  let colonne = base + ', categoria_spesa'
  let eccezioniDisponibili = true
  const fatture = []

  const pagina = (offset) => {
    let q = supabase.from('fatture').select(colonne).eq('organization_id', orgId)
    if (dal) q = q.gte('data_fattura', dal)
    if (al) q = q.lte('data_fattura', al)
    return q.order('data_fattura', { ascending: true }).order('id', { ascending: true }).range(offset, offset + PAGINA - 1)
  }

  for (let offset = 0; offset < 200000; offset += PAGINA) {
    let { data, error } = await pagina(offset)
    // Prima della migration la colonna non c'è: si rilegge senza, e lo si
    // dice a chi chiama invece di fermare tutto il conto.
    if (error && eccezioniDisponibili && colonnaMancante(error) === 'categoria_spesa') {
      eccezioniDisponibili = false
      colonne = base
      ;({ data, error } = await pagina(offset))
    }
    if (error) throw new Error(error.message || 'lettura delle fatture non riuscita')
    for (const r of (data || [])) fatture.push(conDescrizioni ? conDescrizioniDa(r) : r)
    onProgresso?.(fatture.length)
    if (!data || data.length < PAGINA) break
  }
  return { fatture, eccezioniDisponibili }
}

/**
 * I fornitori con la loro voce di spesa, e la mappa che usa il conto:
 * `{ [chiaveFornitore(nome)]: id, ['piva:' + P.IVA]: id }`.
 */
export async function leggiCategorieFornitori(supabase, orgId) {
  if (!orgId) throw new Error('manca l\'azienda')
  const { data, error } = await supabase.from('fornitori')
    .select('id, nome, partita_iva, categoria')
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message || 'lettura dei fornitori non riuscita')
  const fornitori = Array.isArray(data) ? data : []
  return { fornitori, ...mappaCategorie(fornitori) }
}

/** La mappa del conto dai fornitori in memoria (si rifà dopo un salvataggio). */
export function mappaCategorie(fornitori) {
  const categoriePerFornitore = {}
  const etichetteNonRiconosciute = []
  for (const f of (fornitori || [])) {
    const testo = String(f?.categoria ?? '').trim()
    if (!testo) continue
    const id = categoriaDaEtichetta(testo)
    if (!id) { etichetteNonRiconosciute.push({ id: f.id, nome: f.nome, categoria: testo }); continue }
    const k = chiaveFornitore(f.nome)
    // Due schede con lo stesso nome e voci diverse: vince la prima, che è
    // anche quella che il conto ha sempre usato. Non si inventa una terza.
    if (k && !(k in categoriePerFornitore)) categoriePerFornitore[k] = id
    const piva = f.partita_iva ? normPiva(f.partita_iva) : ''
    if (piva && !(('piva:' + piva) in categoriePerFornitore)) categoriePerFornitore['piva:' + piva] = id
  }
  return { categoriePerFornitore, etichetteNonRiconosciute }
}

/**
 * I grammi prodotti per sede, mese per mese: la chiave con cui si dividono
 * le spese condivise (`costiCondivisi.js`, scelta del titolare il 17/09).
 */
export async function produzionePerSedeMese(supabase, orgId, { dal = null, al = null } = {}) {
  if (!orgId) throw new Error('manca l\'azienda')
  const out = {}
  for (let offset = 0; offset < 500000; offset += PAGINA) {
    let q = supabase.from('inventario_produzione').select('sede_id, data, produzione_g').eq('organization_id', orgId)
    if (dal) q = q.gte('data', dal)
    if (al) q = q.lte('data', al)
    const { data, error } = await q.order('data', { ascending: true }).order('id', { ascending: true }).range(offset, offset + PAGINA - 1)
    if (error) throw new Error(error.message || 'lettura della produzione non riuscita')
    for (const r of (data || [])) {
      const m = String(r?.data ?? '').slice(0, 7)
      const g = Number(r?.produzione_g) || 0
      if (!/^\d{4}-\d{2}$/.test(m) || !r?.sede_id || g <= 0) continue
      out[m] = out[m] || {}
      out[m][r.sede_id] = (out[m][r.sede_id] || 0) + g
    }
    if (!data || data.length < PAGINA) break
  }
  return out
}

/**
 * Scrive la voce di spesa di uno o più fornitori.
 *
 * Ogni scelta tocca tutte le schede dello stesso fornitore (stessa P.IVA o
 * stesso nome normalizzato: «DESA SRL» e «DESA S.r.l.» sono una ditta). Se
 * nessuna scheda c'è — il fornitore sta solo nelle fatture — se ne crea una
 * col nome della fattura: senza scheda la voce non avrebbe dove stare.
 * Una richiesta per voce, non una per fornitore: confermare in blocco
 * sessanta proposte fa dieci scritture, non sessanta.
 *
 * @param {{ nome: string, piva?: string|null, categoria: string|null }[]} scelte
 *   `categoria` è l'id della voce; `null` toglie la voce.
 * @param {{ id: string, nome: string, partita_iva?: string|null }[]} fornitori  le schede lette
 * @returns {Promise<{ salvati: number, creati: number, errori: { nome: string, messaggio: string }[],
 *   righe: { id: string, nome: string, partita_iva: string|null, categoria: string|null }[] }>}
 */
export async function salvaCategorieFornitori(supabase, orgId, scelte, fornitori) {
  if (!orgId) throw new Error('manca l\'azienda')
  const esito = { salvati: 0, creati: 0, errori: [], righe: [] }
  const perPiva = new Map()
  const perNome = new Map()
  for (const f of (fornitori || [])) {
    const p = f?.partita_iva ? normPiva(f.partita_iva) : ''
    if (p) perPiva.set(p, [...(perPiva.get(p) || []), f])
    const k = chiaveFornitore(f?.nome)
    if (k) perNome.set(k, [...(perNome.get(k) || []), f])
  }

  const aggiornare = new Map()    // testo da scrivere → { ids:Set, scelte:[] }
  const creare = []
  for (const s of (scelte || [])) {
    const nome = String(s?.nome ?? '').trim()
    if (!nome) continue
    if (s.categoria != null && !categoriaPerId(s.categoria)) {
      esito.errori.push({ nome, messaggio: `voce sconosciuta: ${s.categoria}` })
      continue
    }
    const testo = s.categoria == null ? null : categoriaPerId(s.categoria).nome
    const p = s.piva ? normPiva(s.piva) : ''
    const schede = new Map()
    for (const f of [...(p ? perPiva.get(p) || [] : []), ...(perNome.get(chiaveFornitore(nome)) || [])]) schede.set(f.id, f)
    if (!schede.size) {
      if (testo) creare.push({ s, nome, piva: p || null, testo })
      continue
    }
    const chiave = testo ?? ''
    const gruppo = aggiornare.get(chiave) || { testo, ids: new Set(), scelte: [] }
    for (const id of schede.keys()) gruppo.ids.add(id)
    gruppo.scelte.push({ nome, schede: [...schede.values()] })
    aggiornare.set(chiave, gruppo)
  }

  for (const g of aggiornare.values()) {
    const ids = [...g.ids]
    const { error } = await supabase.from('fornitori')
      .update({ categoria: g.testo })
      .eq('organization_id', orgId)
      .in('id', ids)
    if (error) {
      for (const sc of g.scelte) esito.errori.push({ nome: sc.nome, messaggio: error.message || 'scrittura non riuscita' })
      continue
    }
    esito.salvati += g.scelte.length
    for (const sc of g.scelte) {
      for (const f of sc.schede) esito.righe.push({ id: f.id, nome: f.nome, partita_iva: f.partita_iva ?? null, categoria: g.testo })
    }
  }

  if (creare.length) {
    const nuove = creare.map(c => ({ organization_id: orgId, nome: c.nome, partita_iva: c.piva, categoria: c.testo }))
    const { data, error } = await supabase.from('fornitori').insert(nuove).select('id, nome, partita_iva, categoria')
    if (error) {
      for (const c of creare) esito.errori.push({ nome: c.nome, messaggio: error.message || 'scheda fornitore non creata' })
    } else {
      esito.creati += creare.length
      esito.salvati += creare.length
      esito.righe.push(...(data || []))
    }
  }
  return esito
}

/**
 * La voce di una fattura sola: per segnare come investimento la fattura
 * eccezionale di un fornitore che di solito è un costo (o il contrario).
 * `null` la riporta alla voce del fornitore.
 *
 * Senza la migration 20261003b la colonna non c'è: si risponde
 * `{ ok: false, motivo: 'colonna_mancante' }` e chi chiama lo dice, invece
 * di far credere che sia salvato.
 */
export async function salvaCategoriaFattura(supabase, orgId, fatturaId, categoriaId) {
  if (!orgId || !fatturaId) return { ok: false, motivo: 'dati_mancanti', messaggio: 'manca la fattura' }
  if (categoriaId != null && !categoriaPerId(categoriaId)) return { ok: false, motivo: 'voce_sconosciuta', messaggio: `voce sconosciuta: ${categoriaId}` }
  const { error } = await supabase.from('fatture')
    .update({ categoria_spesa: categoriaId ?? null })
    .eq('organization_id', orgId)
    .eq('id', fatturaId)
  if (!error) return { ok: true }
  if (colonnaMancante(error) === 'categoria_spesa') return { ok: false, motivo: 'colonna_mancante', messaggio: error.message }
  return { ok: false, motivo: 'errore', messaggio: error.message || 'scrittura non riuscita' }
}
