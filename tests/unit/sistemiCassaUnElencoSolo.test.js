// @vitest-environment happy-dom
//
// Quindici casse scritte, sei nel menu, sette nel dispatch.
//
// ── Audit magazzino, 16/09/2026 ─────────────────────────────────────────
//
// `importCassa.js` contiene quindici parser funzionanti e testati: Zucchetti
// (CSV e XML), Cassa in Cloud, Tilby, RCH, Olivetti, Custom Q3X, Salvi,
// Indaco, Polotouch, Eko POS, Wolf, Lightspeed, Square, SumUp, Satispay, più
// la fattura elettronica.
//
// Il menu «Importa da sistema cassa» in Cassa ne offriva SEI, scritti a mano
// nel JSX di `ChiusuraView.jsx`. Il dispatch `parseFile` ne riconosceva SETTE,
// scritti a mano in uno `switch`, e su tutto il resto lanciava
// «Sistema non riconosciuto: …».
//
// Due elenchi tenuti a mano in due file diversi si allontanano sempre. Il
// danno non è tecnico: una gelateria con una cassa Tilby apre quella finestra,
// non trova la propria marca e conclude che FoodOS non la legge — mentre il
// parser c'è, è scritto e passa i test. Il prodotto sembrava più povero di
// quello che è, e la cosa non la segnalava nessuno perché non è un errore:
// è un'assenza.
//
// Un difetto fratello, nello stesso file: cinque marche (Salvi, Indaco,
// Polotouch, Eko POS, Wolf) condividono lo stesso schema CSV e non sono
// distinguibili fra loro dalle intestazioni. Il riconoscimento automatico
// scriveva «Salvi/Indaco/Polotouch» anche quando il file era di una Eko o di
// una Wolf: il totale era giusto, ma il nome era falso, e un nome falso su un
// numero giusto fa dubitare del numero.
//
// Da qui la regola: un elenco solo, in `importCassa.js`, e questi test che
// controllano che chi lo usa non se ne stacchi più.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  SISTEMI_CASSA,
  parseFile,
  autoDetectCassaFormat,
} from '../../src/lib/importCassa'

// File finto: `parseFile` legge il contenuto con `readTextSmart`, che chiede
// solo `arrayBuffer()`, e il nome serve a Zucchetti per capire se è XML.
const finto = (testo, nome = 'export.csv') => {
  const u8 = new TextEncoder().encode(testo)
  return {
    name: nome,
    arrayBuffer: async () => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength),
  }
}

const CSV_GENERICO = 'Data;Totale;IVA;Pagamento\n01/09/2026;100,00;10;Contanti\n'
const CSV_PER_ID = {
  zucchetti: 'Data;Importo;IVA\n01/09/2026;100,00;10\n',
  cassaincloud: 'Data;Totale;Metodo pagamento\n01/09/2026;100,00;Contanti\n',
  sumup: 'Date;Amount;Transaction type\n01/09/2026;100,00;Sale\n',
  satispay: 'Data;Importo;Id transazione\n01/09/2026;100,00;abc\n',
  lightspeed: 'Date;Total;Receipt number\n01/09/2026;100,00;7\n',
  square: 'Date;Amount;Fee\n01/09/2026;100,00;2,50\n',
  olivetti: 'DATA OPERAZIONE;TOTALE €;ALIQ. IVA;PAGAMENTO\n01/09/2026;100,00;10;Contanti\n',
  custom: 'dt;tot;iva;pag\n01/09/2026;100,00;10;Contanti\n',
  fattura_xml: '<?xml version="1.0"?><FatturaElettronica><Data>2026-09-01</Data><ImportoPagamento>100.00</ImportoPagamento><Imposta>10</Imposta></FatturaElettronica>',
}

describe('l\'elenco dei sistemi cassa', () => {
  it('ha almeno quindici voci, come i parser che esistono', () => {
    expect(SISTEMI_CASSA.length).toBeGreaterThanOrEqual(15)
  })

  it('ogni voce ha identificativo, nome leggibile e estensioni accettate', () => {
    for (const s of SISTEMI_CASSA) {
      expect(typeof s.id, JSON.stringify(s)).toBe('string')
      expect(s.id.length).toBeGreaterThan(0)
      expect(typeof s.nome).toBe('string')
      expect(s.nome.length).toBeGreaterThan(2)
      expect(s.accetta).toMatch(/^\.[a-z0-9,.]+$/)
    }
  })

  it('nessun identificativo ripetuto e nessun nome ripetuto', () => {
    const ids = SISTEMI_CASSA.map(s => s.id)
    const nomi = SISTEMI_CASSA.map(s => s.nome)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(nomi).size).toBe(nomi.length)
  })

  it('le marche che prima non erano nel menu ci sono', () => {
    // Sono esattamente quelle che una gelateria italiana si trova in negozio
    // e che il prodotto sapeva già leggere senza dirlo.
    const ids = SISTEMI_CASSA.map(s => s.id)
    for (const atteso of ['tilby', 'rch', 'olivetti', 'custom', 'salvi', 'indaco', 'polotouch', 'ekopos', 'wolf']) {
      expect(ids, atteso).toContain(atteso)
    }
  })
})

describe('il dispatch conosce tutto l\'elenco', () => {
  it('nessun identificativo dell\'elenco viene rifiutato', async () => {
    // È il test che riproduce il difetto: prima, otto di questi lanciavano
    // «Sistema non riconosciuto».
    for (const s of SISTEMI_CASSA) {
      const testo = CSV_PER_ID[s.id] || CSV_GENERICO
      const nome = s.id === 'fattura_xml' ? 'fattura.xml' : 'export.csv'
      await expect(
        parseFile(s.id, finto(testo, nome)),
        `${s.id} (${s.nome})`,
      ).resolves.toBeDefined()
    }
  })

  it('Zucchetti sceglie il parser dall\'estensione del file', async () => {
    const xml = '<?xml version="1.0"?><Vendite><Vendita><Data>01/09/2026</Data><Totale>100,00</Totale></Vendita></Vendite>'
    const daXml = await parseFile('zucchetti', finto(xml, 'export.xml'))
    expect(daXml[0].importo).toBeCloseTo(100, 2)
    const daCsv = await parseFile('zucchetti', finto(CSV_PER_ID.zucchetti, 'export.csv'))
    expect(daCsv[0].importo).toBeCloseTo(100, 2)
  })

  it('un identificativo sconosciuto dice anche cosa sappiamo leggere', async () => {
    // «Sistema non riconosciuto» da solo lascia l'utente senza la mossa dopo.
    await expect(parseFile('cassa-della-nonna', finto(CSV_GENERICO)))
      .rejects.toThrow(/non riconosciuto.*Tilby/s)
  })

  it('non si arriva ai prototipi passando "constructor" come sistema', async () => {
    for (const brutto of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      await expect(parseFile(brutto, finto(CSV_GENERICO)), brutto).rejects.toThrow(/non riconosciuto/)
    }
  })
})

describe('il menu di Cassa non si scrive più a mano', () => {
  const sorgente = fs.readFileSync(
    path.resolve(process.cwd(), 'src/views/ChiusuraView.jsx'), 'utf8',
  )

  it('legge l\'elenco condiviso', () => {
    expect(sorgente).toMatch(/SISTEMI_CASSA/)
    expect(sorgente).toMatch(/SISTEMI_CASSA\.map/)
  })

  it('non contiene più voci di cassa scritte a mano', () => {
    // Se qualcuno riaggiunge un <option value="cassaincloud"> fisso, i due
    // elenchi ricominciano ad allontanarsi: meglio saperlo subito. Gli altri
    // menu della pagina (le piattaforme delivery) non c'entrano.
    const fisse = SISTEMI_CASSA
      .map(s2 => s2.id)
      .filter(id => sorgente.includes(`<option value="${id}"`))
    expect(fisse).toEqual([])
  })
})

describe('il riconoscimento automatico non attribuisce una marca che non sa', () => {
  it('le cinque casse con lo stesso schema si annunciano tutte', () => {
    // Prima diceva «Salvi/Indaco/Polotouch» anche su un file Eko o Wolf.
    const r = autoDetectCassaFormat('Data;Scontrino;Reparto;Articolo;Qta;Prezzo;Totale;IVA;Pagamento\n')
    expect(r.provider).toMatch(/Eko POS/)
    expect(r.provider).toMatch(/Wolf/)
    expect(r.confidence).toBeLessThan(0.7)
  })

  it('quando una firma è chiara il nome resta preciso', () => {
    // Il righello: se il riconoscimento diventasse vago su tutto, questo test
    // se ne accorgerebbe.
    expect(autoDetectCassaFormat('Numero scontrino;Cassiere;Totale\n').provider).toBe('Tilby')
    expect(autoDetectCassaFormat('Data;Id transazione;Importo\n').provider).toBe('Satispay')
  })
})
