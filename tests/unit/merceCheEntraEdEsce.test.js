// I movimenti di merce che il prodotto perdeva per strada.
//
// ── Audit magazzino, 16/09/2026 ─────────────────────────────────────────
//
// 1. LA MERCE CHE ARRIVA DA UN'ALTRA SEDE. La tabella `inventario_produzione`
//    aveva `spedito_g` e non aveva il suo contrario. Chi spedisce scala i
//    chili dal proprio venduto (giusto); chi riceve non li registra da
//    nessuna parte: la rimanenza del giorno dopo sale senza una riga che lo
//    spieghi, e il venduto della sede che riceve esce negativo.
//
//    Quanto pesa, misurato sui dati veri di Mara dei Boschi: rifacendo la
//    partita doppia SOMMANDO le tre sedi (stesso gusto, stesso giorno) il
//    buco passa da −2.587,9 kg a −1.324,8 kg. Cioè 1.263 kg, il 49%,
//    spariscono appena si smette di trattare le sedi come separate: è gelato
//    che si sposta fra Carlina, Berthollet e De Gasperi senza lasciare
//    traccia. E combacia col calendario: Berthollet non produce il mercoledì
//    (solo il 27,9% delle righe di quel giorno ha produzione), De Gasperi non
//    produce il giovedì — e sono i due giorni in cui le loro caselle negative
//    si concentrano (40,4% e 55,7%).
//
//    `confermaRicezione` (TrasferimentiView.jsx:396) chiude il trasferimento
//    e aggiorna lo stock dei prodotti finiti, ma nell'inventario della sede
//    di arrivo non scrive niente: non aveva una colonna dove scriverlo.
//    La colonna `ricevuto_g` la aggiunge la migrazione 20260916c.
//
//    Sui dati di Mara la pagina trasferimenti è di fatto inutilizzata — UNA
//    riga in tutto, del 15/09 — quindi i casi qui sotto sono COSTRUITI. La
//    misura dei 1.263 kg invece è vera e viene dal database.
//
// 2. I CHILI ALL'INGROSSO VALUTATI AL PREZZO DEL BANCO. I chili che escono
//    dall'inventario sono tutti i chili usciti: quelli venduti in coppetta e
//    quelli consegnati a un ristorante. La pagina Quadratura lo sapeva già e
//    toglieva i kg B2B prima di confrontarsi con la cassa; `ricaviDaInventario`
//    — che alimenta il conto economico e il confronto fra sedi — no. Lo stesso
//    gelato produceva due ricavi diversi in due pagine diverse.
//
//    NON misurabile su Mara: nel suo database `vendite_b2b` ha ZERO righe,
//    quindi oggi da lei l'errore vale 0 €. Caso costruito.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

// Tutti i .js/.jsx sotto una cartella, ricorsivamente. Serve ai controlli che
// devono guardare TUTTO il sorgente e non un elenco di file scelti a mano —
// gli elenchi scelti a mano sono esattamente il modo in cui questo difetto è
// rimasto nascosto in tre query su quattro.
function elencaSorgenti(dirUrl) {
  const out = []
  for (const voce of readdirSync(dirUrl, { withFileTypes: true })) {
    if (voce.isDirectory()) out.push(...elencaSorgenti(new URL(`${voce.name}/`, dirUrl)))
    else if (/\.jsx?$/.test(voce.name)) out.push(new URL(voce.name, dirUrl).pathname)
  }
  return out
}

// La lettura delle vendite B2B parla col database: qui il database è finto e
// registra la query che riceve.
let risposta = { data: [], error: null }
let ultimaQuery = { eq: [], select: null, gte: null, lte: null, or: null }
vi.mock('../../src/lib/supabase', () => ({
  supabase: { from: () => catenaFinta() },
}))

// Una catena finta che si comporta come il client Supabase e si ricorda cosa
// le è stato chiesto.
function catenaFinta() {
  const chain = {
    select: (c) => { ultimaQuery.select = c; return chain },
    eq: (k, v) => { ultimaQuery.eq.push([k, v]); return chain },
    gte: (k, v) => { ultimaQuery.gte = [k, v]; return chain },
    lte: (k, v) => { ultimaQuery.lte = [k, v]; return chain },
    or: (c) => { ultimaQuery.or = c; return chain },
    then: (cb) => Promise.resolve(risposta).then(cb),
  }
  return chain
}
import {
  calcolaVendutoSettimana,
  serieVendutoGusto,
  serieVendutoMultiSede,
  ricaviDaInventario,
  kpiQuadraturaSettimana,
  kgB2B,
  scorporaB2B,
  COLONNE_VENDUTO,
  colonneSenzaRicevuto,
  eColonnaRicevutoMancante,
} from '../../src/lib/inventarioProduzione'
import { venditeB2BPeriodo } from '../../src/lib/venditeB2B'

const riga = (gusto, data, p = {}) => ({
  gusto_nome: gusto, data,
  produzione_g: p.prod ?? 0,
  rimanenza_g: 'riman' in p ? p.riman : 0,
  scarto_g: p.scarto ?? 0,
  spedito_g: p.spedito ?? 0,
  ...(p.ricevuto != null ? { ricevuto_g: p.ricevuto } : {}),
})

// ── 1. La merce che arriva da un'altra sede ──────────────────────────────

describe('il gelato arrivato da un\'altra sede', () => {
  it('senza registrarlo, il venduto della sede che riceve esce negativo', () => {
    // È il difetto, nella forma esatta in cui si vede su Berthollet il
    // mercoledì: 0 rimasti martedì sera, nessuna produzione mercoledì, e
    // mercoledì sera in vetrina ci sono 4,8 kg.
    const righe = [
      riga('MAROTTO', '2026-08-04', { prod: 8000, riman: 0 }),
      riga('MAROTTO', '2026-08-05', { prod: 0, riman: 4800 }),
    ]
    const m = calcolaVendutoSettimana(righe, '2026-08-03')
    expect(m.MAROTTO['2026-08-05'].venduto).toBe(-4800)
  })

  it('registrando la merce ricevuta, il conto torna', () => {
    const righe = [
      riga('MAROTTO', '2026-08-04', { prod: 8000, riman: 0 }),
      riga('MAROTTO', '2026-08-05', { prod: 0, riman: 4800, ricevuto: 6000 }),
    ]
    const m = calcolaVendutoSettimana(righe, '2026-08-03')
    // 0 rimasti + 0 prodotti + 6.000 ricevuti − 4.800 rimasti = 1.200 venduti.
    expect(m.MAROTTO['2026-08-05'].venduto).toBe(1200)
    expect(m.MAROTTO['2026-08-05'].quadra).toBe(true)
  })

  it('spedito e ricevuto hanno segno opposto e si compensano fra sedi', () => {
    // La sede che manda 6 kg li toglie dal proprio venduto, quella che li
    // riceve se li aggiunge: sommando le due, i chili non si creano né si
    // distruggono.
    const mittente = calcolaVendutoSettimana([
      riga('MAROTTO', '2026-08-04', { prod: 0, riman: 10000 }),
      riga('MAROTTO', '2026-08-05', { prod: 0, riman: 4000, spedito: 6000 }),
    ], '2026-08-03')
    const destinatario = calcolaVendutoSettimana([
      riga('MAROTTO', '2026-08-04', { prod: 0, riman: 0 }),
      riga('MAROTTO', '2026-08-05', { prod: 0, riman: 6000, ricevuto: 6000 }),
    ], '2026-08-03')
    expect(mittente.MAROTTO['2026-08-05'].venduto).toBe(0)
    expect(destinatario.MAROTTO['2026-08-05'].venduto).toBe(0)
  })

  it('una riga senza la colonna nuova vale zero, non rompe niente', () => {
    // Finché la migrazione 20260916c non è applicata, le righe non hanno
    // `ricevuto_g`: il conto deve restare quello di prima.
    const righe = [
      riga('MAROTTO', '2026-08-04', { prod: 0, riman: 5000 }),
      riga('MAROTTO', '2026-08-05', { prod: 1000, riman: 4000 }),
    ]
    const m = calcolaVendutoSettimana(righe, '2026-08-03')
    expect(m.MAROTTO['2026-08-05'].venduto).toBe(2000)
    expect(m.MAROTTO['2026-08-05'].ricevuto).toBe(0)
  })
})

describe('leggere `ricevuto_g` da un database che non ce l\'ha ancora', () => {
  // Postgres non risponde «campo vuoto» per una colonna che non esiste:
  // rifiuta l'intera query (errore 42703). Senza il ripiego, pubblicare il
  // codice prima della migrazione lasciava la pagina inventario vuota.
  it('riconosce l\'errore della colonna mancante', () => {
    const err = { code: '42703', message: 'column inventario_produzione.ricevuto_g does not exist' }
    expect(eColonnaRicevutoMancante(err, 'gusto_nome, ricevuto_g')).toBe(true)
  })

  it('non scambia un altro errore per la colonna mancante', () => {
    expect(eColonnaRicevutoMancante({ code: '42501', message: 'permission denied' }, 'gusto_nome, ricevuto_g')).toBe(false)
    expect(eColonnaRicevutoMancante(null, 'gusto_nome, ricevuto_g')).toBe(false)
    // Se la colonna non era nemmeno stata chiesta, l'errore è di un altro.
    expect(eColonnaRicevutoMancante({ code: '42703' }, 'gusto_nome, data')).toBe(false)
  })

  it('l\'elenco di ripiego toglie solo quella colonna', () => {
    expect(colonneSenzaRicevuto('gusto_nome, data, ricevuto_g, spedito_g'))
      .toBe('gusto_nome, data, spedito_g')
    expect(colonneSenzaRicevuto('gusto_nome, data')).toBe('gusto_nome, data')
  })
})

// ── 2. I chili venduti all'ingrosso ──────────────────────────────────────

describe('i chili venduti all\'ingrosso non valgono il prezzo del banco', () => {
  // 10 kg usciti dall'inventario in una settimana, di cui 4 consegnati a un
  // ristorante e fatturati 60 € (15 €/kg all'ingrosso contro i 30 €/kg del
  // banco).
  const righe = [
    riga('NOCCIOLA', '2026-06-14', { prod: 0, riman: 10000 }),
    riga('NOCCIOLA', '2026-06-15', { prod: 0, riman: 0 }),
  ]
  const formati = [{ baseQtaG: 1000, prezzoDefault: 30 }]
  const b2b = [{ totale: 60, righe: [{ prodotto: 'NOCCIOLA', qta: 4, prezzo: 15 }] }]

  it('senza le righe B2B il ricavo è il vecchio, e il risultato lo dichiara', () => {
    const r = ricaviDaInventario(righe, formati, { da: '2026-06-15', a: '2026-06-15' })
    expect(r.kg).toBe(10)
    expect(r.ricavi).toBe(300)
    // La cosa che conta: chi legge sa che l'ingrosso non è stato considerato.
    expect(r.b2bConsiderato).toBe(false)
  })

  it('con le righe B2B i chili dell\'ingrosso valgono il loro prezzo', () => {
    const r = ricaviDaInventario(righe, formati, { da: '2026-06-15', a: '2026-06-15', venditeB2B: b2b })
    // 6 kg al banco × 30 €/kg = 180 €, più i 60 € fatturati all'ingrosso.
    expect(r.ricavi).toBe(240)
    expect(r.kgRetail).toBe(6)
    expect(r.b2bKg).toBe(4)
    expect(r.ricaviB2b).toBe(60)
    expect(r.b2bConsiderato).toBe(true)
  })

  it('60 € di differenza su 300: il conto economico sbagliava del 25%', () => {
    const senza = ricaviDaInventario(righe, formati, { da: '2026-06-15', a: '2026-06-15' })
    const con = ricaviDaInventario(righe, formati, { da: '2026-06-15', a: '2026-06-15', venditeB2B: b2b })
    expect(senza.ricavi - con.ricavi).toBe(60)
  })

  it('se le righe B2B superano i chili usciti lo dice, non mostra un negativo', () => {
    const troppo = [{ totale: 300, righe: [{ prodotto: 'NOCCIOLA', qta: 20, prezzo: 15 }] }]
    const r = ricaviDaInventario(righe, formati, { da: '2026-06-15', a: '2026-06-15', venditeB2B: troppo })
    expect(r.kgRetail).toBe(0)
    expect(r.b2bOltreInventario).toBe(true)
    expect(r.ricavi).toBeGreaterThanOrEqual(0)
  })

  it('la Quadratura e il conto economico contano i kg B2B allo stesso modo', () => {
    // Erano due cicli scritti in due punti: bastava che uno cambiasse per
    // avere due numeri diversi sullo stesso gelato. Ora la funzione è una.
    const m = calcolaVendutoSettimana(righe, '2026-06-15')
    const k = kpiQuadraturaSettimana(m, [], 30, b2b)
    const r = ricaviDaInventario(righe, formati, { da: '2026-06-15', a: '2026-06-15', venditeB2B: b2b })
    expect(k.b2bKg).toBe(r.b2bKg)
    expect(kgB2B(b2b)).toBe(4)
    expect(kgB2B(null)).toBe(0)
    expect(kgB2B([{ totale: 10 }])).toBe(0)
  })
})

// ── 3. Lo stesso gelato, due ricavi diversi in due pagine ────────────────
//
// Audit magazzino, 17/09/2026. La regola «i chili dell'ingrosso non valgono
// il prezzo del banco» stava scritta due volte (Quadratura e
// `ricaviDaInventario`) e mancava del tutto nel conto economico. Ora è una
// funzione sola, `scorporaB2B`, e le pagine la chiamano.
//
// Numeri del caso costruito: 100 kg usciti dall'inventario, valorizzati 3.000 €
// (30 €/kg medio). Di quei 100 kg, 20 sono andati a un ristorante e sono stati
// fatturati 300 € (15 €/kg, la metà del banco).
//   sbagliato: 100 × 30            = 3.000 €
//   giusto:     80 × 30 + 300      = 2.700 €
// Trecento euro di ricavo inventato su tremila, il 10%, e cresce con la quota
// di ingrosso: a parità di chili, con un prezzo all'ingrosso metà del banco,
// l'errore è metà del fatturato dell'ingrosso.

describe('scorporaB2B — i chili dell\'ingrosso, una regola sola', () => {
  const b2b20kg = [{ totale: 300, righe: [{ prodotto: 'NOCCIOLA', qta: 12, prezzo: 15 }, { prodotto: 'MANGO', qta: 8, prezzo: 15 }] }]

  it('IL DIFETTO: senza scorporo i 20 kg dell\'ingrosso valgono il prezzo del banco', () => {
    // È il conto che faceva il P&L: tutti i chili per il prezzo medio.
    expect(100 * 30).toBe(3000)
    const s = scorporaB2B({ kg: 100, euroKg: 30, venditeB2B: b2b20kg })
    expect(s.ricaviTotali).toBe(2700)
    expect(3000 - s.ricaviTotali).toBe(300)
  })

  it('LA CORREZIONE: banco al prezzo del banco, ingrosso al prezzo fatturato', () => {
    const s = scorporaB2B({ kg: 100, euroKg: 30, venditeB2B: b2b20kg })
    expect(s.b2bKg).toBe(20)
    expect(s.kgRetail).toBe(80)
    expect(s.ricaviRetail).toBe(2400)
    expect(s.ricaviB2b).toBe(300)
    expect(s.b2bConsiderato).toBe(true)
  })

  it('il prezzo medio si può passare o far ricavare dal ricavo (è il conto del P&L)', () => {
    // Il conto economico calcola il ricavo gusto per gusto, ognuno col suo
    // prezzo: il prezzo medio del periodo è ricavo diviso chili.
    const a = scorporaB2B({ kg: 100, ricavi: 3000, venditeB2B: b2b20kg })
    const b = scorporaB2B({ kg: 100, euroKg: 30, venditeB2B: b2b20kg })
    expect(a.euroKg).toBe(30)
    expect(a.ricaviTotali).toBe(b.ricaviTotali)
  })

  it('NON SO ≠ ZERO: senza righe B2B non tocca niente e lo dichiara', () => {
    for (const nulla of [undefined, null]) {
      const s = scorporaB2B({ kg: 100, euroKg: 30, venditeB2B: nulla })
      expect(s.b2bConsiderato).toBe(false)
      expect(s.ricaviTotali).toBe(3000)
      expect(s.b2bKg).toBe(0)
    }
    // L'elenco VUOTO invece è un'informazione: all'ingrosso non è uscito
    // niente. Il risultato numerico coincide, la dichiarazione no.
    const vuoto = scorporaB2B({ kg: 100, euroKg: 30, venditeB2B: [] })
    expect(vuoto.b2bConsiderato).toBe(true)
    expect(vuoto.ricaviTotali).toBe(3000)
  })

  it('più chili fatturati che usciti: lo dice, non mostra un ricavo negativo', () => {
    const s = scorporaB2B({ kg: 10, euroKg: 30, venditeB2B: b2b20kg })
    expect(s.kgRetail).toBe(0)
    expect(s.ricaviRetail).toBe(0)
    expect(s.b2bOltreInventario).toBe(true)
    expect(s.ricaviTotali).toBe(300)
  })

  it('zero chili usciti non fa dividere per zero', () => {
    const s = scorporaB2B({ kg: 0, ricavi: 0, venditeB2B: [] })
    expect(Number.isFinite(s.euroKg)).toBe(true)
    expect(s.ricaviTotali).toBe(0)
  })

  it('INTORNO: `ricaviDaInventario` usa la stessa regola, non una copia', () => {
    const righe = [
      riga('NOCCIOLA', '2026-06-14', { prod: 0, riman: 100000 }),
      riga('NOCCIOLA', '2026-06-15', { prod: 0, riman: 0 }),
    ]
    const formati = [{ baseQtaG: 1000, prezzoDefault: 30 }]
    const r = ricaviDaInventario(righe, formati, { da: '2026-06-15', a: '2026-06-15', venditeB2B: b2b20kg })
    const s = scorporaB2B({ kg: r.kg, euroKg: r.euroKg, venditeB2B: b2b20kg })
    expect(r.kg).toBe(100)
    expect(r.ricavi).toBe(s.ricaviTotali)
    expect(r.kgRetail).toBe(s.kgRetail)
    expect(r.b2bOltreInventario).toBe(s.b2bOltreInventario)
  })
})

// ── 4. La regola c'è ma non è collegata ──────────────────────────────────
//
// Il difetto che si ripete in questo progetto non è la formula sbagliata: è
// la formula giusta scritta in un file che nessuna pagina chiama. Era già
// successo con i quindici parser di cassa (sei nel menu), con
// `inventarioImport.js` (nessuno lo importa) e con `ricaviDaInventario`, che
// accettava le righe B2B mentre i due chiamanti non gliele passavano: il
// risultato diceva onestamente `b2bConsiderato: false`, e restava false per
// sempre. Questi test guardano il codice sorgente, non il comportamento:
// servono a far fallire il prossimo scollegamento.

describe('le pagine passano davvero le righe dell\'ingrosso', () => {
  const leggi = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

  it('il conto economico carica le vendite B2B del periodo e le scorpora', () => {
    const src = leggi('../../src/views/PLView.jsx')
    expect(src).toMatch(/venditeB2BPeriodo\(/)
    expect(src).toMatch(/scorporaB2B\(/)
  })

  it('il confronto fra sedi le passa a `ricaviDaInventario`', () => {
    const src = leggi('../../src/components/ConfrontoSedi.jsx')
    expect(src).toMatch(/venditeB2BPeriodo\(/)
    // La chiamata deve ricevere l'elenco, non solo caricarlo.
    expect(src).toMatch(/ricaviDaInventario\([\s\S]{0,400}venditeB2B,/)
  })

  it('confrontando le sedi le vendite senza sede non si tolgono a tutte', () => {
    // Le righe salvate prima che il campo sede esistesse hanno `sede_id`
    // nullo: in una pagina che mette i negozi uno accanto all'altro
    // andrebbero tolte tre volte, una per negozio.
    const src = leggi('../../src/components/ConfrontoSedi.jsx')
    expect(src).toMatch(/includiSenzaSede: false/)
  })
})

describe('le SELECT dell\'inventario chiedono tutte le colonne che servono', () => {
  const leggi = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

  // Tutti i sorgenti di `src/`, non un elenco scritto a mano.
  //
  // IL RIGHELLO ERA ROTTO, ed è la parte più istruttiva di questo test.
  // La prima versione guardava tre file (`inventarioProduzione.js`, `PLView`,
  // `ConfrontoSedi`) e solo le stringhe scritte dopo `columns:`. Passava
  // verde mentre nello stesso momento TRE query se ne stavano fuori dal suo
  // campo visivo: `StoricoProduzioneView.jsx` (un quarto elenco a mano, senza
  // `ricevuto_g`), e due `.select(...)` dentro `InventarioSettimanaleView.jsx`
  // — una delle quali, quella del pannello di dettaglio di un gusto, non
  // aveva nemmeno `spedito_g`.
  //
  // Un controllo che guarda solo dove il difetto non c'è non è un controllo.
  // Adesso cammina su tutto `src/` e legge sia `columns:` sia `.select(...)`.
  const FILE = elencaSorgenti(new URL('../../src/', import.meta.url))

  // Ogni stringa del sorgente che elenca le colonne dell'inventario, ovunque
  // si trovi: dentro `.select(...)`, dopo `columns:`, o assegnata a una
  // costante. L'ultima forma è quella che contava: il quarto elenco a mano
  // stava in `const COLONNE_INV = '...'`, e un controllo che guardasse solo
  // `columns:` non l'avrebbe mai visto — perché lì `columns` riceve il NOME
  // della costante, non la stringa.
  const elenchiColonne = (src) => {
    const out = []
    for (const riga of src.split('\n')) {
      // La riga che DEFINISCE la base condivisa: è lei che `COLONNE_VENDUTO`
      // completa aggiungendo `ricevuto_g`. Chiederle di contenersi già sarebbe
      // un cane che si morde la coda.
      if (riga.includes('COL_INVENTARIO_BASE')) continue
      for (const m of riga.matchAll(/(['"`])([^'"`\n]*)\1/g)) {
        const cols = m[2]
        // Una stringa che elenca le colonne dell'inventario si riconosce da
        // queste due insieme: le letture parziali (solo `id`, solo
        // `produzione_g`) non calcolano il venduto e non c'entrano.
        if (cols.includes('rimanenza_g') && cols.includes('produzione_g')) out.push(cols)
      }
    }
    return out
  }

  it('nessuna colonna scritta a mano dimentica `ricevuto_g` o `spedito_g`', () => {
    // Il difetto vero: l'elenco delle colonne del venduto ricopiato a mano in
    // più punti. `spedito_g` era arrivato in alcuni e `ricevuto_g` in nessuno,
    // così quelle pagine contavano come venduta la merce arrivata da un altro
    // negozio. Ora l'elenco è uno solo (`COLONNE_VENDUTO`) e chi ne vuole di
    // più lo allunga in coda.
    const mancanti = []
    for (const f of FILE) {
      for (const cols of elenchiColonne(leggi(f))) {
        if (!cols.includes('ricevuto_g') || !cols.includes('spedito_g')) {
          mancanti.push(`${f.replace(/.*\/src\//, 'src/')}: ${cols}`)
        }
      }
    }
    expect(mancanti).toEqual([])
  })

  it('il righello vede davvero un elenco a cui manca una colonna', () => {
    // REGOLE.md: un controllo che trova zero problemi deve dimostrare che
    // saprebbe trovarne uno. Queste sono le tre righe esatte che stavano nel
    // sorgente fino al 17/09/2026, nelle tre forme diverse in cui si erano
    // nascoste.
    const primaDellaCorrezione = [
      // 1. StoricoProduzioneView: una costante, non un `columns:`.
      "    const COLONNE_INV = 'gusto_nome, data, produzione_g, rimanenza_g, scarto_g, spedito_g, scostamento_accettato, sede_id'",
      // 2. InventarioSettimanaleView, rilettura prima del salvataggio.
      "        .select('produzione_g, rimanenza_g, scarto_g, spedito_g')",
      // 3. InventarioSettimanaleView, pannello di dettaglio di un gusto: qui
      //    mancava anche `spedito_g`, cioè tutti e due i movimenti fra negozi.
      "      .select('data, produzione_g, rimanenza_g, scarto_g, sede_id')",
    ].join('\n')
    const trovati = elenchiColonne(primaDellaCorrezione)
    expect(trovati).toHaveLength(3)
    const bocciati = trovati.filter(c => !c.includes('ricevuto_g') || !c.includes('spedito_g'))
    expect(bocciati).toHaveLength(3)
  })

  it('la base condivisa è l\'unica stringa a cui è concesso non avere `ricevuto_g`', () => {
    // È l'eccezione che il controllo si concede: se domani sparisse il salto
    // su `COL_INVENTARIO_BASE`, questo test direbbe perché c'era.
    const base = "const COL_INVENTARIO_BASE = 'gusto_nome, data, produzione_g, rimanenza_g, scarto_g, spedito_g'"
    expect(elenchiColonne(base)).toEqual([])
    expect(COLONNE_VENDUTO).toContain('ricevuto_g')
  })

  it('le pagine che calcolano il venduto usano l\'elenco condiviso, non una copia', () => {
    // Il difetto si ripresenta ogni volta che qualcuno riscrive le colonne a
    // mano. Queste quattro pagine leggono l'inventario per calcolare quanto è
    // stato venduto: devono partire da `COLONNE_VENDUTO`.
    for (const f of [
      '../../src/views/PLView.jsx',
      '../../src/views/StoricoProduzioneView.jsx',
      '../../src/views/InventarioSettimanaleView.jsx',
      '../../src/components/ConfrontoSedi.jsx',
    ]) {
      expect(leggi(f), f).toMatch(/COLONNE_VENDUTO/)
    }
  })

  it('l\'elenco condiviso contiene le sei colonne del venduto', () => {
    for (const c of ['gusto_nome', 'data', 'produzione_g', 'rimanenza_g', 'scarto_g', 'spedito_g', 'ricevuto_g']) {
      expect(COLONNE_VENDUTO).toContain(c)
    }
  })
})

// ── 5. «Non lo so» deve poter uscire anche dalla lettura ─────────────────
//
// `venditeB2BPeriodo` è la lettura condivisa delle vendite all'ingrosso di un
// periodo. Torna `null` quando la lettura fallisce e `[]` quando all'ingrosso
// non è uscito niente: sono due cose diverse, e chi la usa le tratta in modo
// diverso (con `null` i chili restano dove sono e la pagina lo scrive).
// Se tornasse `[]` in tutti e due i casi, un errore di rete diventerebbe
// «questo mese non ha venduto all'ingrosso», e i conti tornerebbero per finta.

describe('venditeB2BPeriodo — leggere le vendite all\'ingrosso di un periodo', () => {
  beforeEach(() => {
    ultimaQuery = { eq: [], select: null, gte: null, lte: null, or: null }
    risposta = { data: [], error: null }
  })

  it('senza organizzazione o senza periodo non inventa un elenco vuoto', async () => {
    expect(await venditeB2BPeriodo(null, { da: '2026-06-01', a: '2026-06-30' })).toBe(null)
    expect(await venditeB2BPeriodo('org', { da: null, a: '2026-06-30' })).toBe(null)
  })

  it('se la lettura fallisce torna «non lo so», non «zero ingrosso»', async () => {
    risposta = { data: null, error: { message: 'rete' } }
    expect(await venditeB2BPeriodo('org', { sedeId: 's1', da: '2026-06-01', a: '2026-06-30' })).toBe(null)
  })

  it('nessuna vendita nel periodo è un\'informazione: elenco vuoto', async () => {
    const r = await venditeB2BPeriodo('org', { sedeId: 's1', da: '2026-06-01', a: '2026-06-30' })
    expect(Array.isArray(r)).toBe(true)
    expect(r).toHaveLength(0)
  })

  it('chiede solo il periodo giusto e le colonne che servono al conto', async () => {
    await venditeB2BPeriodo('org', { sedeId: 's1', da: '2026-06-01', a: '2026-06-30' })
    expect(ultimaQuery.gte).toEqual(['data', '2026-06-01'])
    expect(ultimaQuery.lte).toEqual(['data', '2026-06-30'])
    expect(ultimaQuery.select).toContain('righe')
    expect(ultimaQuery.select).toContain('totale')
  })

  it('le vendite senza sede si includono o no, e la differenza è voluta', async () => {
    await venditeB2BPeriodo('org', { sedeId: 's1', da: '2026-06-01', a: '2026-06-30' })
    expect(ultimaQuery.or).toBe('sede_id.eq.s1,sede_id.is.null')

    ultimaQuery = { eq: [], select: null, gte: null, lte: null, or: null }
    await venditeB2BPeriodo('org', { sedeId: 's1', da: '2026-06-01', a: '2026-06-30', includiSenzaSede: false })
    expect(ultimaQuery.or).toBe(null)
    expect(ultimaQuery.eq).toContainEqual(['sede_id', 's1'])
  })
})


// ── 6. La spedizione scriveva l'arrivo dentro la rimanenza ───────────────
//
// Audit magazzino, 17/09/2026. In `InventarioSettimanaleView.jsx` c'è il
// comando «spedisci a un'altra sede»: scarica il negozio che manda e carica
// quello che riceve. Lo scarico era giusto (somma a `spedito_g`). Il carico no:
//
//     rimanenza_g: (cellDest?.rimanenza_g || 0) + qtaG
//
// cioè i chili arrivati venivano sommati a QUANTO È RIMASTO IN VETRINA
// STASERA. Due affermazioni false in una riga sola:
//
//   1. che stasera in vetrina ci fossero esattamente quei chili — e nessuno
//      li ha ancora pesati, la spedizione si registra durante il giorno;
//   2. che fossero sempre stati lì — cioè che non siano entrati da nessuna
//      parte, che è l'opposto di quello che è appena successo.
//
// Nel conto del venduto le due cose non si equivalgono. Con la rimanenza
// gonfiata il negozio che riceve risulta vendere MENO DI ZERO il giorno
// dell'arrivo e troppo il giorno dopo; con `ricevuto_g` il conto torna. Sui
// dati di Mara i movimenti fra negozi non registrati valgono 1.263 kg, il 49%
// di tutto lo scostamento della partita doppia.
//
// E c'è il difetto dentro il difetto: `|| 0`. Se la cella di destinazione non
// esisteva ancora, la rimanenza nasceva uguale ai chili arrivati — la stessa
// casella-vuota-letta-come-zero che è costata 2.470 kg, entrata qui da
// un'altra porta.
//
// Su Mara NON è misurabile: la pagina trasferimenti ha UNA riga in tutto (del
// 15/09). I casi qui sotto sono COSTRUITI.

describe('spedire gelato a un altro negozio', () => {
  // Il negozio che riceve, con la vetrina contata a 2 kg la sera prima.
  const vigilia = riga('MAROTTO', '2026-08-04', { prod: 0, riman: 2000 })

  it('IL DIFETTO: sommando i chili arrivati alla rimanenza, chi riceve vende meno di zero', () => {
    // Quello che scriveva il codice vecchio: 6 kg arrivati, cella nuova,
    // rimanenza = 0 + 6.000.
    const m = calcolaVendutoSettimana([
      vigilia,
      riga('MAROTTO', '2026-08-05', { prod: 0, riman: 6000 }),
    ], '2026-08-03')
    expect(m.MAROTTO['2026-08-05'].venduto).toBe(-4000)
    expect(m.MAROTTO['2026-08-05'].quadra).toBe(false)
  })

  it('e resta sbagliato anche quando la sera qualcuno pesa davvero la vetrina', () => {
    // Il commesso la sera conta 5 kg e li scrive. I 6 kg arrivati non sono
    // registrati da nessuna parte, quindi il conto continua a non tornare:
    // non è un errore di chi ha pesato, è un movimento che manca.
    const m = calcolaVendutoSettimana([
      vigilia,
      riga('MAROTTO', '2026-08-05', { prod: 0, riman: 5000 }),
    ], '2026-08-03')
    expect(m.MAROTTO['2026-08-05'].venduto).toBe(-3000)
  })

  it('LA CORREZIONE: i chili arrivati in `ricevuto_g`, la rimanenza lasciata in bianco', () => {
    // Quello che scrive il codice nuovo nel momento della spedizione: la
    // rimanenza non la sappiamo ancora e non si inventa.
    const m = calcolaVendutoSettimana([
      vigilia,
      riga('MAROTTO', '2026-08-05', { prod: 0, riman: null, ricevuto: 6000 }),
    ], '2026-08-03')
    const cella = m.MAROTTO['2026-08-05']
    expect(cella.venduto).toBeNull()
    expect(cella.ricevuto).toBe(6000)
    expect(cella.motivo).toMatch(/non è stata scritta/)
    // «Non lo so» non è un allarme: non va nell'elenco delle cose da
    // controllare insieme agli errori veri.
    expect(cella.quadra).toBe(true)
  })

  it('e quando la sera la vetrina viene pesata, il conto torna', () => {
    const m = calcolaVendutoSettimana([
      vigilia,
      riga('MAROTTO', '2026-08-05', { prod: 0, riman: 5000, ricevuto: 6000 }),
    ], '2026-08-03')
    // 2.000 c'erano + 6.000 arrivati − 5.000 rimasti = 3.000 venduti.
    expect(m.MAROTTO['2026-08-05'].venduto).toBe(3000)
    expect(m.MAROTTO['2026-08-05'].quadra).toBe(true)
  })

  it('INTORNO: due spedizioni nello stesso giorno si sommano, non si sovrascrivono', () => {
    // La seconda consegna non deve cancellare la prima: è la stessa regola di
    // `aggiungiSpedito`, e nel codice si legge `(cellDest?.ricevuto_g || 0) + qtaG`.
    const m = calcolaVendutoSettimana([
      vigilia,
      riga('MAROTTO', '2026-08-05', { prod: 0, riman: 5000, ricevuto: 6000 + 1500 }),
    ], '2026-08-03')
    expect(m.MAROTTO['2026-08-05'].venduto).toBe(4500)
  })

  it('INTORNO: anche chi SPEDISCE non deve dichiarare la vetrina vuota', () => {
    // Stessa `|| 0`, dall'altro lato: registrare una spedizione non è pesare
    // la vetrina. Con lo 0 il giorno dopo il venduto usciva negativo di tutto
    // il gelato che invece c'era.
    const conZero = calcolaVendutoSettimana([
      riga('MAROTTO', '2026-08-04', { prod: 0, riman: 0, spedito: 2000 }),
      riga('MAROTTO', '2026-08-05', { prod: 0, riman: 3000 }),
    ], '2026-08-03')
    expect(conZero.MAROTTO['2026-08-05'].venduto).toBe(-3000)

    const conNull = calcolaVendutoSettimana([
      riga('MAROTTO', '2026-08-04', { prod: 0, riman: null, spedito: 2000 }),
      riga('MAROTTO', '2026-08-05', { prod: 0, riman: 3000 }),
    ], '2026-08-03')
    expect(conNull.MAROTTO['2026-08-05'].venduto).toBeNull()
    expect(conNull.MAROTTO['2026-08-05'].motivo).toMatch(/giorno prima non è stata scritta/)
  })

  it('INTORNO: i chili non si creano né si distruggono fra i due negozi', () => {
    // 6 kg partono da A e arrivano a B. Nessuno dei due ne ha venduto uno.
    const mittente = calcolaVendutoSettimana([
      riga('MAROTTO', '2026-08-04', { prod: 0, riman: 10000 }),
      riga('MAROTTO', '2026-08-05', { prod: 0, riman: 4000, spedito: 6000 }),
    ], '2026-08-03')
    const destinatario = calcolaVendutoSettimana([
      vigilia,
      riga('MAROTTO', '2026-08-05', { prod: 0, riman: 8000, ricevuto: 6000 }),
    ], '2026-08-03')
    expect(mittente.MAROTTO['2026-08-05'].venduto).toBe(0)
    expect(destinatario.MAROTTO['2026-08-05'].venduto).toBe(0)
  })

  it('la pagina scrive davvero `ricevuto_g` e non gonfia più la rimanenza', () => {
    const src = readFileSync(new URL('../../src/views/InventarioSettimanaleView.jsx', import.meta.url), 'utf8')
    // La riga del difetto non deve tornare.
    expect(src).not.toMatch(/rimanenza_g:\s*\(cellDest\?\.rimanenza_g\s*\|\|\s*0\)/)
    expect(src).toMatch(/ricevuto_g:\s*\(cellDest\?\.ricevuto_g\s*\|\|\s*0\)\s*\+\s*qtaG/)
    // E nessuno dei due lati inventa più uno zero al posto della rimanenza.
    expect(src).toMatch(/rimanenza_g:\s*cellDest\?\.rimanenza_g\s*\?\?\s*null/)
    expect(src).toMatch(/rimanenza_g:\s*cella\?\.rimanenza_g\s*\?\?\s*null/)
  })
})

// ── 7. Il pannello di un gusto schiacciava i negozi prima del conto ──────
//
// Audit magazzino, 17/09/2026. `DrilldownGustoModal` è la scheda che si apre
// cliccando il nome di un gusto: 90 giorni di storia, e con «tutte le sedi»
// attivo legge le righe di tutti i negozi. Le passava a `serieVendutoGusto`
// dopo averle schiacciate su una chiave sola — cioè SOMMAVA i negozi PRIMA di
// calcolare il venduto.
//
// Il resto del prodotto fa il contrario, e il perché è scritto in
// `serieVendutoMultiSede`: si calcola negozio per negozio e si somma dopo.
// Sommare prima funziona solo se tutti i negozi hanno registrato lo stesso
// giorno. Quando uno dei due salta un giorno — e Mara ne salta: Berthollet il
// mercoledì, De Gasperi il giovedì — la rimanenza del negozio assente resta
// nella somma di ieri e sparisce da quella di oggi, e la differenza esce come
// «venduto».

describe('il pannello di un gusto conta negozio per negozio', () => {
  // Due negozi, stesso gusto. Carlina registra tutti i giorni; Berthollet il
  // mercoledì non apre la scheda e quel giorno non lo scrive.
  const righeDueSedi = [
    { ...riga('MAROTTO', '2026-08-04', { prod: 0, riman: 1000 }), sede_id: 'carlina' },
    { ...riga('MAROTTO', '2026-08-05', { prod: 0, riman: 800 }), sede_id: 'carlina' },
    { ...riga('MAROTTO', '2026-08-04', { prod: 0, riman: 5000 }), sede_id: 'berthollet' },
    // Berthollet il 05/08 non c'è.
  ]

  it('IL DIFETTO: sommando i negozi prima del conto, 5,2 kg risultano venduti da nessuno', () => {
    // È quello che faceva il pannello: una chiave sola, sedi mischiate.
    const merged = serieVendutoGusto(righeDueSedi.map(r => ({ ...r, gusto_nome: 'MAROTTO' })))
    const cella = merged.MAROTTO.find(c => c.data === '2026-08-05')
    // ieri 1.000 + 5.000 = 6.000, oggi 800: 5.200 «venduti». I 5 kg di
    // Berthollet sono ancora nella sua vetrina.
    expect(cella.venduto).toBe(5200)
  })

  it('LA CORREZIONE: contando negozio per negozio, il venduto è quello vero', () => {
    const perSede = serieVendutoMultiSede(righeDueSedi)
    const cella = perSede.MAROTTO.find(c => c.data === '2026-08-05')
    // Solo Carlina ha registrato il 05/08: 1.000 − 800 = 200.
    expect(cella.venduto).toBe(200)
  })

  it('INTORNO: quando tutti i negozi registrano, i due conti coincidono', () => {
    // La differenza non è un'opinione sul metodo: nasce solo dai buchi. Se
    // nessuno salta un giorno, sommare prima o dopo dà lo stesso numero — ed
    // è la ragione per cui il difetto non si vedeva sui dati completi.
    const completi = [
      ...righeDueSedi,
      { ...riga('MAROTTO', '2026-08-05', { prod: 0, riman: 4500 }), sede_id: 'berthollet' },
    ]
    const merged = serieVendutoGusto(completi.map(r => ({ ...r, gusto_nome: 'MAROTTO' })))
    const perSede = serieVendutoMultiSede(completi)
    expect(merged.MAROTTO.find(c => c.data === '2026-08-05').venduto).toBe(700)
    expect(perSede.MAROTTO.find(c => c.data === '2026-08-05').venduto).toBe(700)
  })

  it('INTORNO: se un negozio non ha scritto la rimanenza, la somma non la inventa', () => {
    const perSede = serieVendutoMultiSede([
      { ...riga('MAROTTO', '2026-08-04', { prod: 0, riman: 1000 }), sede_id: 'carlina' },
      { ...riga('MAROTTO', '2026-08-05', { prod: 0, riman: 800 }), sede_id: 'carlina' },
      { ...riga('MAROTTO', '2026-08-04', { prod: 0, riman: 5000 }), sede_id: 'berthollet' },
      { ...riga('MAROTTO', '2026-08-05', { prod: 0, riman: null }), sede_id: 'berthollet' },
    ])
    const cella = perSede.MAROTTO.find(c => c.data === '2026-08-05')
    // Carlina sa il suo venduto (200), Berthollet no: il totale dice quanto sa
    // e quante celle non sa, invece di spacciare 200 per il totale di due
    // negozi.
    expect(cella.venduto).toBe(200)
    expect(cella.nonCalcolabili).toBe(1)
    expect(cella.riman).toBeNull()
  })

  it('il pannello usa il motore multi-sede, non la versione schiacciata', () => {
    const src = readFileSync(new URL('../../src/views/InventarioSettimanaleView.jsx', import.meta.url), 'utf8')
    // Dentro DrilldownGustoModal deve comparire serieVendutoMultiSede, e la
    // SELECT deve portarsi dietro sede_id (senza, il motore vedrebbe un solo
    // negozio finto).
    const modal = src.slice(src.indexOf('function DrilldownGustoModal'))
    expect(modal).toMatch(/serieVendutoMultiSede\(/)
    expect(modal).toMatch(/COLONNE_VENDUTO\}, sede_id/)
  })
})

// ── 8. I parser scritti e mai collegati ──────────────────────────────────
//
// Audit magazzino, 17/09/2026. `src/lib/inventarioImport.js` è un file da 700
// righe che sa leggere il file Excel VERO di Mara dei Boschi: riconosce i
// fogli per struttura (un foglio per negozio, uno TOTALI, uno RISTORANTI, uno
// GELATO ELIMINATO), legge gusti e giorni, controlla i propri totali contro il
// foglio di riepilogo del cliente e dice cosa cambia rispetto al database.
//
// **Nessun file di `src/` lo importa.** Lo importano solo i test.
//
// Quello che arriva davvero nel database passa dal percorso generico
// (`ImportWizard` -> `importUnpivot` -> `importSchemas`), che di schemi ne ha
// tre: fornitori, dipendenti e produzione a inventario. Non ha uno schema per
// gli scarti e non ne ha uno per le consegne all'ingrosso, e non guarda i nomi
// dei fogli: legge solo le colonne PROD/RIMAN.
//
// Il conto, misurato sul database di Mara il 17/09/2026:
//
//     7.013 righe di inventario, 3 negozi, 32 gusti, dal 01/05 al 15/09
//     scarto_g:      0 g su tutte e 7.013 le righe
//     vendite_b2b:   0 righe
//
// Quattro mesi e mezzo di gelateria senza un grammo buttato e senza una
// consegna a un ristorante. Non è un dato: è un foglio che nessuno ha letto.
// E si ripercuote sul resto: è per questo che lo scorporo dell'ingrosso dal
// conto economico (sezione 2 di questo file) su Mara vale 0 € e va provato su
// un caso costruito.
//
// Questo elenco è il libro mastro di cosa il prodotto sa importare davvero.
// Se qualcuno collega uno di questi parser, il test diventa rosso e l'elenco
// va aggiornato: è esattamente quello che deve succedere.

describe('i movimenti di merce che il prodotto sa importare', () => {
  const leggi = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
  const sorgenti = elencaSorgenti(new URL('../../src/', import.meta.url))

  const importatoDaSrc = (modulo) => sorgenti.some(f => {
    if (f.endsWith(`/${modulo}`)) return false
    return new RegExp(`from\\s+['"\`][^'"\`]*${modulo.replace('.js', '')}['"\`]`).test(leggi(f))
  })

  it('IL DIFETTO: `inventarioImport.js` non è importato da nessuna pagina', () => {
    expect(importatoDaSrc('inventarioImport.js')).toBe(false)
  })

  it('il righello sa riconoscere un modulo collegato', () => {
    // Se il controllo qui sopra dicesse «non importato» per tutti, non
    // direbbe niente. `inventarioProduzione.js` è collegato, e si vede.
    expect(importatoDaSrc('inventarioProduzione.js')).toBe(true)
    expect(importatoDaSrc('importUnpivot.js')).toBe(true)
  })

  it('i parser rimasti scollegati sono questi, e riguardano movimenti veri', () => {
    // Non sono funzioni di comodo: leggono scarti e consegne all'ingrosso,
    // cioè merce che esce e non torna più.
    const src = leggi('../../src/lib/inventarioImport.js')
    for (const fn of [
      'parseFoglioInventario',    // produzione e rimanenza dal foglio vero
      'parseFoglioSprechi',       // GELATO ELIMINATO -> scarti
      'parseFoglioRistoranti',    // RISTORANTI -> consegne all'ingrosso
      'parseFoglioAltriProdotti', // pastorizzata, cioccolata, zabaione
      'checkTotaliCrossSheet',    // il file controlla i propri totali
      'diffConDb',                // cosa cambia rispetto a quello che c'è
    ]) {
      expect(src, fn).toMatch(new RegExp(`export function ${fn}\\b`))
    }
  })

  it('il percorso vivo non ha uno schema per gli scarti né per l\'ingrosso', () => {
    // È la ragione per cui quei due fogli non arrivano nel database: non c'è
    // dove metterli. Se domani si aggiunge lo schema, questo test lo dice.
    const schemi = leggi('../../src/lib/importSchemas.js')
    const tabelle = [...schemi.matchAll(/table:\s*'([^']+)'/g)].map(m => m[1])
    expect(tabelle).toContain('inventario_produzione')
    expect(tabelle).not.toContain('vendite_b2b')
    expect(tabelle).not.toContain('sprechi')
  })

  it('e non guarda i nomi dei fogli: legge solo le colonne PROD/RIMAN', () => {
    // `classificaSheet` — quella che sa distinguere il foglio di un negozio da
    // quello degli scarti — vive nel file scollegato. La configurazione viva
    // non ha nessun filtro sui fogli.
    const cfg = leggi('../../src/lib/importUnpivot.js')
    const blocco = cfg.slice(cfg.indexOf('export function defaultGelateriaWideConfig'))
    expect(blocco).toMatch(/PROD/)
    expect(blocco).toMatch(/RIMAN\./)
    expect(blocco).not.toMatch(/sheets_to_process/)
  })
})
