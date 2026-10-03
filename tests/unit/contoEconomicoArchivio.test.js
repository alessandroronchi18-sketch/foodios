// ── Conto economico dalle fatture: l'archivio ───────────────────────────
//
// 03/10/2026. Il motore dei costi (`contoEconomico.js`) ha bisogno di tre
// letture e due scritture. I difetti che queste prove tengono lontani sono
// quelli già visti altrove in Foodos, nella stessa famiglia:
//
//   • una lettura fallita presa per «niente»: il 09/09/2026 sei file
//     leggevano `fatture` con colonne inesistenti, PostgREST rispondeva
//     errore, `data` arrivava null e la pagina dava un verdetto su zero
//     fatture. Qui una lettura dei fornitori che non riesce deve FERMARSI:
//     presa per «nessuna categoria», la schermata riproporrebbe da
//     classificare fornitori già classificati e il conto metterebbe tutto in
//     «da classificare» senza dire che è la rete;
//   • una colonna nuova che fa cadere tutto: `fatture.categoria_spesa` nasce
//     con la migration 20261003b, scritta e non applicata. Senza, il conto
//     deve funzionare lo stesso, e la scrittura deve dire che non ha salvato;
//   • la ricerca del fornitore per nome scritto in un altro modo: «DESA SRL»
//     e «DESA S.r.l.» sono la stessa ditta, e la voce va su tutte e due le
//     schede, con una richiesta per voce e non una per fornitore.
import { describe, it, expect } from 'vitest'
import {
  leggiFatturePeriodo, leggiCategorieFornitori, mappaCategorie, produzionePerSedeMese,
  salvaCategorieFornitori, salvaCategoriaFattura,
} from '../../src/lib/contoEconomicoArchivio'
import { costiPerMese, chiaveFornitore } from '../../src/lib/contoEconomico'

// Un database finto: tiene le tabelle in memoria, registra ogni richiesta, e
// può rifiutare una colonna (come PostgREST prima della migration) o fallire.
function fintoDb({ tabelle = {}, colonneMancanti = [], fallisci = null } = {}) {
  const log = []
  const errColonna = (c) => ({ message: `Could not find the '${c}' column of 'fatture' in the schema cache`, code: 'PGRST204' })
  const from = (tabella) => {
    const st = { tabella, filtri: [], range: null, op: 'select', colonne: '', patch: null, righe: null }
    const q = {
      select(c) { if (st.op === 'insert') st.restituisci = c; else st.colonne = c; return q },
      update(p) { st.op = 'update'; st.patch = p; return q },
      insert(r) { st.op = 'insert'; st.righe = r; return q },
      eq(k, v) { st.filtri.push(['eq', k, v]); return q },
      in(k, v) { st.filtri.push(['in', k, v]); return q },
      gte(k, v) { st.filtri.push(['gte', k, v]); return q },
      lte(k, v) { st.filtri.push(['lte', k, v]); return q },
      order() { return q },
      range(a, b) { st.range = [a, b]; return q },
      then(ok, ko) { return Promise.resolve(esegui(st)).then(ok, ko) },
    }
    return q
  }
  const passa = (r, filtri) => filtri.every(([op, k, v]) => (
    op === 'eq' ? r[k] === v : op === 'in' ? v.includes(r[k]) : op === 'gte' ? r[k] >= v : r[k] <= v
  ))
  function esegui(st) {
    log.push({ ...st })
    if (fallisci && fallisci(st)) return { data: null, error: { message: 'rete assente' } }
    const dati = tabelle[st.tabella] || (tabelle[st.tabella] = [])
    if (st.op === 'select') {
      const mancante = colonneMancanti.find(c => st.colonne.includes(c))
      if (mancante) return { data: null, error: errColonna(mancante) }
      const tutte = dati.filter(r => passa(r, st.filtri))
      return { data: st.range ? tutte.slice(st.range[0], st.range[1] + 1) : tutte, error: null }
    }
    if (st.op === 'update') {
      const mancante = colonneMancanti.find(c => c in st.patch)
      if (mancante) return { data: null, error: errColonna(mancante) }
      for (const r of dati.filter(x => passa(x, st.filtri))) Object.assign(r, st.patch)
      return { data: null, error: null }
    }
    const nuove = st.righe.map((r, i) => ({ id: `nuovo${dati.length + i}`, ...r }))
    dati.push(...nuove)
    return { data: nuove, error: null }
  }
  return { supabase: { from }, log, tabelle }
}

const ORG = 'org1'

describe('leggiFatturePeriodo', () => {
  const fatture = Array.from({ length: 2500 }, (_, i) => ({
    id: `f${String(i).padStart(4, '0')}`, organization_id: ORG, fornitore: 'DESA SRL',
    data_fattura: i < 2400 ? '2026-06-15' : '2026-07-15', totale: 10, categoria_spesa: null,
  }))

  it('legge a pagine da mille, solo il periodo, solo le colonne del conto', async () => {
    const db = fintoDb({ tabelle: { fatture: [...fatture, { id: 'altra', organization_id: 'org2', data_fattura: '2026-06-15' }] } })
    const r = await leggiFatturePeriodo(db.supabase, ORG, { dal: '2026-06-01', al: '2026-06-30' })
    expect(r.fatture).toHaveLength(2400)
    expect(r.eccezioniDisponibili).toBe(true)
    expect(db.log).toHaveLength(3)
    expect(db.log[0].colonne).toMatch(/imponibile, imposta, tipo, sede_id, sedi_condivise, categoria_spesa/)
    expect(db.log[0].colonne).not.toMatch(/righe/)
  })

  it('senza la colonna nuova rilegge senza, e lo dice', async () => {
    const db = fintoDb({ tabelle: { fatture }, colonneMancanti: ['categoria_spesa'] })
    const r = await leggiFatturePeriodo(db.supabase, ORG, { dal: '2026-07-01', al: '2026-07-31' })
    expect(r.fatture).toHaveLength(100)
    expect(r.eccezioniDisponibili).toBe(false)
    // e il conto funziona lo stesso
    expect(costiPerMese(r.fatture, { mese: '2026-07' }).daClassificare.importo).toBe(1000)
  })

  it('una lettura che non riesce è un errore, non zero fatture', async () => {
    const db = fintoDb({ tabelle: { fatture }, fallisci: (st) => st.tabella === 'fatture' })
    await expect(leggiFatturePeriodo(db.supabase, ORG, {})).rejects.toThrow(/rete assente/)
  })

  it('con le descrizioni porta le prime righe, pronte per la proposta della voce', async () => {
    const db = fintoDb({ tabelle: { fatture: [{ id: 'x', organization_id: ORG, data_fattura: '2026-06-01', d0: 'PANNA', t0: '800.5', d1: 'CONI', t1: null, d2: null, t2: null }] } })
    const r = await leggiFatturePeriodo(db.supabase, ORG, { conDescrizioni: true })
    expect(db.log[0].colonne).toMatch(/d0:righe->0->>descrizione/)
    expect(r.fatture[0].descrizioni).toEqual([{ descrizione: 'PANNA', totale: 800.5 }, { descrizione: 'CONI', totale: null }])
    expect(r.fatture[0]).not.toHaveProperty('d0')
  })

  it('una data scritta male non parte nemmeno', async () => {
    await expect(leggiFatturePeriodo(fintoDb().supabase, ORG, { dal: '1/6/2026' })).rejects.toThrow(/periodo/)
  })
})

describe('leggiCategorieFornitori e mappaCategorie', () => {
  const fornitori = [
    { id: 'a', organization_id: ORG, nome: 'DESA SRL', partita_iva: null, categoria: 'Materie prime' },
    { id: 'b', organization_id: ORG, nome: 'Enel Energia S.p.A.', partita_iva: 'IT 06655971007', categoria: 'Utenze' },
    { id: 'c', organization_id: ORG, nome: 'CASEIFICIO X', partita_iva: null, categoria: 'Latticini' },
    { id: 'd', organization_id: ORG, nome: 'ACME', partita_iva: null, categoria: 'Attrezzature' },
    { id: 'e', organization_id: ORG, nome: 'SUQQO S.R.L.', partita_iva: null, categoria: null },
  ]

  it('la mappa del conto: per nome normalizzato e per P.IVA; le vecchie etichette valgono', async () => {
    const db = fintoDb({ tabelle: { fornitori } })
    const r = await leggiCategorieFornitori(db.supabase, ORG)
    expect(r.fornitori).toHaveLength(5)
    expect(r.categoriePerFornitore[chiaveFornitore('DESA S.r.l.')]).toBe('materie-prime')
    expect(r.categoriePerFornitore['piva:06655971007']).toBe('utenze')
    expect(r.categoriePerFornitore[chiaveFornitore('CASEIFICIO X')]).toBe('materie-prime')
  })

  it("un'etichetta che non si capisce (o ambigua) si elenca, non diventa una voce", async () => {
    const r = await leggiCategorieFornitori(fintoDb({ tabelle: { fornitori } }).supabase, ORG)
    expect(r.categoriePerFornitore).not.toHaveProperty(chiaveFornitore('ACME'))
    expect(r.etichetteNonRiconosciute).toEqual([{ id: 'd', nome: 'ACME', categoria: 'Attrezzature' }])
  })

  it('una lettura che non riesce LANCIA: non è «nessuna categoria»', async () => {
    const db = fintoDb({ tabelle: { fornitori }, fallisci: (st) => st.tabella === 'fornitori' })
    await expect(leggiCategorieFornitori(db.supabase, ORG)).rejects.toThrow(/rete assente/)
  })

  it('due schede con lo stesso nome e voci diverse: vale la prima', () => {
    const { categoriePerFornitore } = mappaCategorie([
      { id: '1', nome: 'DESA SRL', categoria: 'Materie prime' },
      { id: '2', nome: 'DESA S.r.l.', categoria: 'Servizi' },
    ])
    expect(categoriePerFornitore[chiaveFornitore('DESA')]).toBe('materie-prime')
  })
})

describe('produzionePerSedeMese', () => {
  it('somma i grammi per mese e per sede, salta righe vuote e altre aziende', async () => {
    const db = fintoDb({ tabelle: { inventario_produzione: [
      { id: '1', organization_id: ORG, sede_id: 'dg', data: '2026-06-01', produzione_g: 1000 },
      { id: '2', organization_id: ORG, sede_id: 'dg', data: '2026-06-30', produzione_g: 500 },
      { id: '3', organization_id: ORG, sede_id: 'be', data: '2026-06-02', produzione_g: 700 },
      { id: '4', organization_id: ORG, sede_id: 'be', data: '2026-07-02', produzione_g: 0 },
      { id: '5', organization_id: 'org2', sede_id: 'dg', data: '2026-06-02', produzione_g: 9999 },
    ] } })
    expect(await produzionePerSedeMese(db.supabase, ORG, { dal: '2026-06-01', al: '2026-07-31' })).toEqual({ '2026-06': { dg: 1500, be: 700 } })
  })

  it('una lettura che non riesce è un errore', async () => {
    const db = fintoDb({ fallisci: () => true })
    await expect(produzionePerSedeMese(db.supabase, ORG)).rejects.toThrow()
  })
})

describe('salvaCategorieFornitori', () => {
  const schede = () => [
    { id: 'a', organization_id: ORG, nome: 'DESA SRL', partita_iva: null, categoria: null },
    { id: 'a2', organization_id: ORG, nome: 'DESA S.r.l.', partita_iva: null, categoria: null },
    { id: 'b', organization_id: ORG, nome: 'Enel Energia S.p.A.', partita_iva: '06655971007', categoria: null },
    { id: 'c', organization_id: ORG, nome: 'Foodinho S.R.L.', partita_iva: null, categoria: null },
    { id: 'd', organization_id: ORG, nome: 'Deliveroo Italy S.R.L.', partita_iva: null, categoria: null },
  ]

  it('scrive il NOME della voce su tutte le schede della ditta, una richiesta per voce', async () => {
    const db = fintoDb({ tabelle: { fornitori: schede() } })
    const r = await salvaCategorieFornitori(db.supabase, ORG, [
      { nome: 'DESA SRL', categoria: 'materie-prime' },
      { nome: 'Foodinho S.R.L.', categoria: 'commissioni' },
      { nome: 'Deliveroo Italy S.R.L.', categoria: 'commissioni' },
      { nome: 'ENEL ENERGIA', piva: 'IT06655971007', categoria: 'utenze' },
    ], db.tabelle.fornitori)
    expect(r).toMatchObject({ salvati: 4, creati: 0, errori: [] })
    const aggiornamenti = db.log.filter(l => l.op === 'update')
    expect(aggiornamenti).toHaveLength(3)                           // tre voci, non quattro fornitori
    expect(db.tabelle.fornitori.find(f => f.id === 'a2').categoria).toBe('Materie prime')
    expect(db.tabelle.fornitori.find(f => f.id === 'b').categoria).toBe('Utenze')
    expect(aggiornamenti.every(u => u.filtri.some(([op, k, v]) => op === 'eq' && k === 'organization_id' && v === ORG))).toBe(true)
    expect(r.righe.map(x => x.id).sort()).toEqual(['a', 'a2', 'b', 'c', 'd'])
    // e quello che si è scritto si rilegge come la voce giusta
    expect(mappaCategorie(db.tabelle.fornitori).categoriePerFornitore[chiaveFornitore('DESA')]).toBe('materie-prime')
  })

  it('il fornitore che sta solo nelle fatture: si crea la scheda con la voce', async () => {
    const db = fintoDb({ tabelle: { fornitori: schede() } })
    const r = await salvaCategorieFornitori(db.supabase, ORG, [{ nome: 'NUOVO SRL', piva: '12345678901', categoria: 'servizi' }], db.tabelle.fornitori)
    expect(r).toMatchObject({ salvati: 1, creati: 1 })
    expect(db.tabelle.fornitori.at(-1)).toMatchObject({ organization_id: ORG, nome: 'NUOVO SRL', partita_iva: '12345678901', categoria: 'Servizi' })
  })

  it('togliere la voce scrive null, e non crea schede', async () => {
    const db = fintoDb({ tabelle: { fornitori: schede().map(f => ({ ...f, categoria: 'Servizi' })) } })
    const r = await salvaCategorieFornitori(db.supabase, ORG, [{ nome: 'DESA SRL', categoria: null }, { nome: 'NON C\'È', categoria: null }], db.tabelle.fornitori)
    expect(r.salvati).toBe(1)
    expect(r.creati).toBe(0)
    expect(db.tabelle.fornitori.find(f => f.id === 'a').categoria).toBeNull()
  })

  it('una voce che non esiste non si scrive', async () => {
    const db = fintoDb({ tabelle: { fornitori: schede() } })
    const r = await salvaCategorieFornitori(db.supabase, ORG, [{ nome: 'DESA SRL', categoria: 'pasticcini' }], db.tabelle.fornitori)
    expect(r.salvati).toBe(0)
    expect(r.errori[0].messaggio).toMatch(/voce sconosciuta/)
    expect(db.log.filter(l => l.op === 'update')).toEqual([])
  })

  it('una scrittura che non riesce si conta per fornitore, le altre voci passano', async () => {
    const db = fintoDb({ tabelle: { fornitori: schede() }, fallisci: (st) => st.op === 'update' && st.patch.categoria === 'Commissioni' })
    const r = await salvaCategorieFornitori(db.supabase, ORG, [
      { nome: 'DESA SRL', categoria: 'materie-prime' },
      { nome: 'Foodinho S.R.L.', categoria: 'commissioni' },
      { nome: 'Deliveroo Italy S.R.L.', categoria: 'commissioni' },
    ], db.tabelle.fornitori)
    expect(r.salvati).toBe(1)
    expect(r.errori.map(e => e.nome)).toEqual(['Foodinho S.R.L.', 'Deliveroo Italy S.R.L.'])
    expect(r.righe.map(x => x.id).sort()).toEqual(['a', 'a2'])
  })
})

describe('salvaCategoriaFattura', () => {
  it('scrive l\'id della voce sulla fattura dell\'azienda', async () => {
    const db = fintoDb({ tabelle: { fatture: [{ id: 'gecko', organization_id: ORG, categoria_spesa: null }] } })
    expect(await salvaCategoriaFattura(db.supabase, ORG, 'gecko', 'attrezzature')).toEqual({ ok: true })
    expect(db.tabelle.fatture[0].categoria_spesa).toBe('attrezzature')
    expect(await salvaCategoriaFattura(db.supabase, ORG, 'gecko', null)).toEqual({ ok: true })
    expect(db.tabelle.fatture[0].categoria_spesa).toBeNull()
  })

  it('senza la migration dice «colonna mancante», non «salvato»', async () => {
    const db = fintoDb({ tabelle: { fatture: [{ id: 'gecko', organization_id: ORG }] }, colonneMancanti: ['categoria_spesa'] })
    expect(await salvaCategoriaFattura(db.supabase, ORG, 'gecko', 'attrezzature')).toMatchObject({ ok: false, motivo: 'colonna_mancante' })
  })

  it('una voce sconosciuta o una fattura mancante non partono', async () => {
    const db = fintoDb()
    expect(await salvaCategoriaFattura(db.supabase, ORG, 'x', 'boh')).toMatchObject({ ok: false, motivo: 'voce_sconosciuta' })
    expect(await salvaCategoriaFattura(db.supabase, ORG, null, 'attrezzature')).toMatchObject({ ok: false })
    expect(db.log).toEqual([])
  })

  it('un altro errore è un errore, col suo messaggio', async () => {
    const db = fintoDb({ fallisci: () => true })
    expect(await salvaCategoriaFattura(db.supabase, ORG, 'x', 'attrezzature')).toMatchObject({ ok: false, motivo: 'errore', messaggio: 'rete assente' })
  })
})
