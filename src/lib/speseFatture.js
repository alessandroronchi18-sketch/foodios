// Le spese di cassa «(F)» e le fatture: la stessa spesa non si conta due volte.
//
// Nel registro il titolare scrive «(F)» accanto alla spesa di cui ha la
// fattura. Se la spesa entra in prima nota come costo e la fattura entra come
// costo, a settembre 304,74 € contano doppio (audit incassi, 09/10/2026).
// Regola del titolare (D3): si caricano tutte le spese, e ognuna con la
// fattura dello stesso fornitore, stesso importo, data entro 3 giorni è «già in
// fattura»: nei costi si conta la fattura, non la spesa.
//
// Il fornitore nel registro è scritto a mano («koko» = WDD): gli alias stanno
// in `fornitori.alias` (migration 20261009a) e li completa il titolare.
//
// Due livelli, perché fidarsi troppo qui vuol dire nascondere un costo vero:
//   'sicuro'    fornitore riconosciuto + importo uguale + entro 3 giorni
//   'probabile' importo uguale e data entro 14 giorni (fornitore riconosciuto)
//               oppure fornitore non scritto/sconosciuto e UNA sola fattura con
//               quell'importo. Si propone, non si applica da solo.

export const GIORNI_SICURO = 3
export const GIORNI_PROBABILE = 14

const FORME = /\b(s\.?p\.?a\.?|s\.?r\.?l\.?s?|s\.?n\.?c\.?|s\.?a\.?s\.?|di|e c)\b\.?/g

/** «LA MACCHIA NERA S.n.c.» → «la macchia nera»; senza accenti né punteggiatura. */
export function normalizzaNome(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9. ]+/g, ' ')
    .replace(FORME, ' ')
    .replace(/[.]/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

const giorni = (a, b) => Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / 86400000))
const stessoImporto = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005
const contiene = (testo, chiave) => chiave.length >= 3 && (` ${testo} `).includes(` ${chiave} `)

/**
 * Le chiavi con cui un fornitore si riconosce nel registro: il suo nome e i
 * suoi alias. `fornitori`: [{ nome, alias: [] }].
 */
export function chiaviFornitore(nomeFattura, fornitori = []) {
  const n = normalizzaNome(nomeFattura)
  const chiavi = new Set()
  if (n) chiavi.add(n)
  for (const f of fornitori) {
    const nf = normalizzaNome(f.nome)
    if (nf && n && (nf === n || nf.includes(n) || n.includes(nf))) {
      chiavi.add(nf)
      for (const a of f.alias || []) { const na = normalizzaNome(a); if (na) chiavi.add(na) }
    }
  }
  return [...chiavi]
}

/**
 * Propone i collegamenti spesa → fattura.
 * `spese`: movimenti con { id, data, importo, descrizione, fornitore, documento, fattura_id? }
 * `fatture`: { id, fornitore, data_fattura, totale }
 * Ritorna { collegamenti: [{ spesaId, fatturaId, livello, giorni, importo }],
 *           senzaFattura: [spese (F) senza fattura trovata] }.
 * Ogni fattura copre una spesa sola; si assegna prima il livello più forte e,
 * a parità, la data più vicina.
 */
export function collegaSpeseAFatture(spese, fatture, fornitori = []) {
  const candidate = (spese || []).filter(s => s.documento === 'fattura' && !s.fattura_id && Number(s.importo) > 0)
  const chiaviPerFattura = new Map((fatture || []).map(f => [f.id, chiaviFornitore(f.fornitore, fornitori)]))
  const proposte = []
  for (const s of candidate) {
    const testo = normalizzaNome(`${s.fornitore || ''} ${s.descrizione || ''}`)
    const stessi = (fatture || []).filter(f => stessoImporto(f.totale, s.importo))
    for (const f of stessi) {
      const d = giorni(s.data, f.data_fattura)
      if (d > GIORNI_PROBABILE) continue
      const noto = (chiaviPerFattura.get(f.id) || []).some(k => contiene(testo, k))
      let livello = null
      if (noto && d <= GIORNI_SICURO) livello = 'sicuro'
      else if (noto) livello = 'probabile'
      else if (stessi.length === 1) livello = 'probabile'
      if (livello) proposte.push({ spesaId: s.id, fatturaId: f.id, livello, giorni: d, importo: Number(s.importo) })
    }
  }
  proposte.sort((a, b) => (a.livello === b.livello ? 0 : a.livello === 'sicuro' ? -1 : 1) || a.giorni - b.giorni)
  const spesaUsata = new Set(), fatturaUsata = new Set(), collegamenti = []
  for (const p of proposte) {
    if (spesaUsata.has(p.spesaId) || fatturaUsata.has(p.fatturaId)) continue
    spesaUsata.add(p.spesaId); fatturaUsata.add(p.fatturaId); collegamenti.push(p)
  }
  return { collegamenti, senzaFattura: candidate.filter(s => !spesaUsata.has(s.id)) }
}

/** Somma per livello: serve a dire «x € già in fattura, y € da confermare». */
export function riassuntoCollegamenti(collegamenti) {
  const c2 = (n) => Math.round(n * 100) / 100
  const r = { sicuro: 0, probabile: 0, nSicuro: 0, nProbabile: 0 }
  for (const c of collegamenti) {
    r[c.livello] += c.importo
    r[c.livello === 'sicuro' ? 'nSicuro' : 'nProbabile']++
  }
  return { ...r, sicuro: c2(r.sicuro), probabile: c2(r.probabile) }
}

/**
 * Scrive i collegamenti sul database: solo i livelli chiesti (di default il
 * 'sicuro'). Se la migration non è ancora applicata (colonna `fattura_id`
 * assente) non scrive niente e lo dice, senza far fallire l'import.
 */
export async function salvaCollegamenti(supabase, orgId, collegamenti, { livelli = ['sicuro'] } = {}) {
  let scritti = 0
  for (const c of collegamenti.filter(x => livelli.includes(x.livello))) {
    const { error } = await supabase.from('movimenti_cassa')
      .update({ fattura_id: c.fatturaId }).eq('id', c.spesaId).eq('organization_id', orgId)
    if (error) {
      if (/fattura_id|schema cache|does not exist/i.test(error.message || '')) return { scritti, migrationMancante: true }
      throw new Error(error.message)
    }
    scritti++
  }
  return { scritti, migrationMancante: false }
}

/**
 * Collega le spese (F) di un periodo alle fatture. Legge, propone, scrive il
 * livello 'sicuro'. Torna la proposta intera, perché il 'probabile' si mostra.
 */
export async function collegaSpesePeriodo(supabase, orgId, { dal, al }) {
  const [mov, fat, forn] = await Promise.all([
    supabase.from('movimenti_cassa').select('id, data, importo, descrizione, fornitore, documento, fattura_id')
      .eq('organization_id', orgId).eq('documento', 'fattura').gte('data', dal).lte('data', al),
    supabase.from('fatture').select('id, fornitore, data_fattura, totale').eq('organization_id', orgId)
      .gte('data_fattura', shift(dal, -GIORNI_PROBABILE)).lte('data_fattura', shift(al, GIORNI_PROBABILE)),
    supabase.from('fornitori').select('nome, alias').eq('organization_id', orgId),
  ])
  if (mov.error) return { collegamenti: [], senzaFattura: [], migrationMancante: /fattura_id/.test(mov.error.message || '') }
  const fornitori = forn.error ? [] : (forn.data || [])
  const prop = collegaSpeseAFatture(mov.data || [], (fat.data || []).map(f => ({ ...f, totale: Number(f.totale) })), fornitori)
  const esito = await salvaCollegamenti(supabase, orgId, prop.collegamenti)
  return { ...prop, ...esito }
}

function shift(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
