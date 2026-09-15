// I file delle casse: la funzione c'era, il filo no.
//
// `autoDetectCassaFormat` esiste in src/lib/importCassa.js dal giorno uno,
// riconosce dodici formati, e **non era chiamata da nessuna parte del
// progetto**. INTEGRAZIONI_CASSE.md la dava per fatta con una spunta verde su
// tredici marche. Nei fatti chi caricava un CSV da Tilby, RCH, Olivetti,
// Custom, Salvi, Indaco, Polotouch, Eko, Wolf, Cassa in Cloud, Cassanova o
// "Cassa generica" leggeva «Questo file non l'ho saputo leggere».
//
// E una volta collegata si è scoperto che non avrebbe funzionato lo stesso:
// i nomi delle colonne si cercavano con maiuscole e punteggiatura esatte.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  autoDetectCassaFormat, trovaColonna,
  parseTilby, parseRCH, parseOlivetti,
} from '../../src/lib/importCassa.js'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const leggi = (...p) => readFileSync(join(RADICE, ...p), 'utf8')

describe('il filo c\'è', () => {
  const UI = leggi('src', 'components', 'Integrazioni.jsx')

  it('la pagina Integrazioni chiama davvero il riconoscimento', () => {
    expect(UI).toMatch(/import \{[^}]*autoDetectCassaFormat[^}]*\} from '\.\.\/lib\/importCassa'/)
    expect(UI).toMatch(/const rilevato = autoDetectCassaFormat\(testo\)/)
  })

  it('e il ramo copre tutte le casse, non tre marche scelte a mano', () => {
    expect(UI).toMatch(/\} else if \(cfg\.tipo === 'kassa' \|\| cfg\.id === 'pos_universal'\) \{/)
  })

  it('le giornate finiscono nelle chiusure, non in un angolo che nessuno legge', () => {
    const ramo = UI.split("cfg.tipo === 'kassa' || cfg.id === 'pos_universal'")[1].slice(0, 2000)
    expect(ramo).toMatch(/importaChiusureIncassi\(orgId, sedeId, righeChiusura\)/)
    // I metodi del registratore diventano i canali della chiusura.
    expect(ramo).toMatch(/pos: sommaMetodi\(g\.metodi/)
    expect(ramo).toMatch(/contanti: sommaMetodi\(g\.metodi/)
  })

  it('quando il riconoscimento è incerto lo dice', () => {
    const ramo = UI.split("cfg.tipo === 'kassa' || cfg.id === 'pos_universal'")[1].slice(0, 2000)
    expect(ramo).toMatch(/rilevato\.confidence < 0\.6/)
  })
})

describe('i nomi delle colonne si riconoscono come li scrive il registratore', () => {
  // Il confronto era esatto: "Metodo pagamento" con la p minuscola non
  // trovava 'Metodo Pagamento', e la colonna finiva a null in silenzio.
  const riga = { 'Data': '', 'Metodo pagamento': '', 'TOTALE €': '', 'Tipo_Pag': '' }

  it('funziona sia con l\'elenco delle intestazioni sia con una riga', () => {
    // I parser hanno sottomano entrambe le cose: si cercano nelle
    // INTESTAZIONI, così un file con l'intestazione e nessuna riga di dati
    // non risulta illeggibile.
    expect(trovaColonna(['Data', 'Metodo pagamento'], ['Metodo Pagamento'])).toBe('Metodo pagamento')
    expect(trovaColonna([], ['Data'])).toBeNull()
  })

  it('ignora maiuscole, spazi, punteggiatura e accenti', () => {
    expect(trovaColonna(riga, ['Metodo Pagamento'])).toBe('Metodo pagamento')
    expect(trovaColonna(riga, ['totale €'])).toBe('TOTALE €')
    expect(trovaColonna(riga, ['Tipo Pag.'])).toBe('Tipo_Pag')
  })

  it('prova il primo candidato prima degli altri', () => {
    expect(trovaColonna({ 'Totale': '', 'Importo': '' }, ['Importo', 'Totale'])).toBe('Importo')
  })

  it('se proprio non c\'è, dice di no invece di indovinare', () => {
    expect(trovaColonna({ 'Pippo': '' }, ['Data'])).toBeNull()
    expect(trovaColonna(null, ['Data'])).toBeNull()
  })
})

describe('tre export realistici, letti fino in fondo', () => {
  it('Tilby: importi e metodi di pagamento', () => {
    const csv = 'Data;Numero scontrino;Cassiere;Totale;IVA;Metodo pagamento\n' +
      '2026-09-14;A-001;Marco;12,50;1,13;CONTANTI\n' +
      '2026-09-14;A-002;Marco;8,00;0,73;CARTA\n' +
      '2026-09-15;A-003;Lucia;20,00;1,82;BANCOMAT'
    const r = autoDetectCassaFormat(csv)
    expect(r.provider).toBe('Tilby')
    const g = parseTilby(csv)
    expect(g).toHaveLength(2)
    expect(g[0].importo).toBe(20.5)
    // Il pezzo che prima usciva sempre vuoto.
    expect(g[0].metodi).toEqual({ CONTANTI: 12.5, CARTA: 8 })
    expect(g[1].metodi).toEqual({ BANCOMAT: 20 })
  })

  it('RCH: prima l\'intera giornata usciva a 0 €', () => {
    // L'export scrive "Importo", il parser cercava solo "Totale": non
    // trovandolo leggeva `undefined`, che diventa 0. Una giornata da 100 € che
    // entra come 0 € è peggio di un errore, perché sembra un dato.
    const csv = 'Data;Importo;Tipo pag.;Chiusura giornaliera\n2026-09-14;100,00;CONTANTI;SI'
    const g = parseRCH(csv)
    expect(g[0].importo).toBe(100)
    expect(g[0].metodi).toEqual({ CONTANTI: 100 })
  })

  it('Olivetti: il metodo di pagamento non si leggeva proprio', () => {
    // Era passato `null` fisso al motore: anche con la colonna presente,
    // POS e contanti della chiusura restavano vuoti.
    const csv = 'DATA;IMPORTO;ALIQ IVA;PAGAMENTO\n14/09/2026;45,00;10;CONTANTI\n15/09/2026;30,00;10;CARTE'
    const g = parseOlivetti(csv)
    expect(g).toHaveLength(2)
    expect(g[0].metodi).toEqual({ CONTANTI: 45 })
    expect(g[1].metodi).toEqual({ CARTE: 30 })
  })
})

describe('un file vuoto non è un errore', () => {
  it('senza righe si torna vuoti, senza spaventare nessuno', () => {
    // Chi esporta un periodo in cui era chiuso non deve leggere un errore.
    expect(parseTilby('')).toEqual([])
    expect(parseTilby('Data;Totale')).toEqual([])
  })
})

describe('un file che non si sa leggere non entra a zero euro', () => {
  it('senza la colonna dell\'importo si alza un errore', () => {
    const csv = 'Data;Pippo\n2026-09-14;ciao'
    expect(() => parseTilby(csv)).toThrow(/colonna dell'importo/)
  })

  it('senza la colonna della data idem', () => {
    const csv = 'Pippo;Totale\nciao;10,00'
    expect(() => parseTilby(csv)).toThrow(/colonna della data/)
  })
})

describe('il documento non promette più di quanto il codice faccia', () => {
  it('le marche con la spunta sono quelle che il riconoscimento conosce', () => {
    const doc = leggi('INTEGRAZIONI_CASSE.md')
    const SRC = leggi('src', 'lib', 'importCassa.js')
    // Ogni marca dichiarata con ✅ nella colonna dell'import deve avere un
    // pattern nel riconoscimento. Prima erano tredici spunte e zero fili.
    for (const marca of ['Tilby', 'RCH', 'Olivetti', 'Custom', 'Satispay', 'Square', 'SumUp']) {
      expect(doc, `${marca} non è più nel documento`).toContain(marca)
      expect(SRC, `${marca} non è nel riconoscimento`).toMatch(new RegExp(`n: '${marca}`, 'i'))
    }
  })
})
