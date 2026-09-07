// Lettura dei registri incassi tenuti a mano su foglio di calcolo.
//
// Il banco di prova è il file vero del design partner: quattro tabelle
// affiancate nello stesso foglio, intestazioni sfalsate, notazione contabile
// dentro il testo libero. I numeri usati qui sono i suoi.

import { describe, it, expect } from 'vitest'
import {
  estraiIncassi, analizzaFoglioIncassi, spesaDaCella, documentoDaTesto,
  descrizionePulita, nomeSedeDaIntestazione, chiaveSede, isRigaTotale,
  trovaBlocchi, trovaColonnaGiorno, profiloColonna,
  annoMeseDaNomeFile, etichettaAnnoMese,
} from '../../src/lib/importIncassi'

// Riproduzione fedele della forma del foglio reale, ridotta a pochi giorni.
// Da notare: il blocco delle spese NON ha l'intestazione "GIORNO", e le
// etichette sono sfalsate — "Berthollet" sta sopra gli importi e "spesa" sopra
// le descrizioni. Era esattamente ciò che faceva fallire il riconoscimento.
const FOGLIO = [
  ['GIORNO','Berthollet POS','Berthollet- Contanti','Totale Berthollet','De Gasperi- POS','De Gasperi Contanti','Totale De Gasperi ','Totale Giornaliero',null,'GIORNO','delivery berthollet','delivery de gasperi',null,null,null,'Berthollet','spesa',null,'De Gasperi','spesa'],
  [1, 788.1, 288.3, 1076.4, 1202.55, 369.15, 1571.7, 2648.1, null, 1, 70, 277.4, null, null, 1, null, null, 1, null, null],
  [2, 1129.5, 424.1, 1553.6, 1301.1, 499.2, 1800.3, 3353.9, null, 2, 122.7, 120.8, null, null, 2, 10, 'limoni (No F)', 2, null, null],
  [3, 1652.9, 577.3, 2230.2, 1670.8, 662.2, 2333, 4563.2, null, 3, 136.6, 169.7, null, null, 3, 60, 'PESCHE E ANGURIA(NO F)', 3, 30, 'timut(F)'],
  ['TOTALE MESE', 3570.5, 1289.7, 4860.2, 4174.45, 1530.55, 5705, 10565.2, null, 'TOT MESE', 329.3, 567.9, null, null, 'TOT', 70, null, 'TOT', 30],
]

describe('riconoscimento della struttura', () => {
  it('separa le tabelle affiancate guardando le colonne vuote', () => {
    const b = trovaBlocchi(FOGLIO)
    expect(b.length).toBe(3)
    expect(b[0]).toEqual({ da: 0, a: 7 })
  })

  it('trova la colonna del giorno anche dove manca l\'intestazione', () => {
    // Il blocco delle spese non ha "GIORNO" scritto da nessuna parte: senza
    // riconoscerlo per contenuto, l'intero blocco veniva scartato.
    const c = trovaColonnaGiorno(FOGLIO, { da: 14, a: 19 }, FOGLIO[0], 0)
    expect(c).toBe(14)
  })

  it('distingue una colonna di importi da una di descrizioni guardando i dati', () => {
    expect(profiloColonna(FOGLIO, 15, 0).numeri).toBeGreaterThan(0)
    expect(profiloColonna(FOGLIO, 16, 0).testi).toBeGreaterThan(0)
  })

  it('riconosce le due sedi con POS, contanti e totale', () => {
    const p = analizzaFoglioIncassi(FOGLIO, '2026-07')
    expect(p.incassi.map(i => i.sede).sort()).toEqual(['Berthollet', 'De Gasperi'])
  })

  it('non scambia "Totale Giornaliero" per una sede', () => {
    const p = analizzaFoglioIncassi(FOGLIO, '2026-07')
    expect(p.incassi.some(i => /giornalier/i.test(i.sede))).toBe(false)
  })
})

describe('estrazione degli incassi', () => {
  const { chiusure } = estraiIncassi(FOGLIO, '2026-07')

  it('una riga per sede e per giorno, senza la riga dei totali', () => {
    expect(chiusure.length).toBe(6)   // 2 sedi x 3 giorni
    expect(chiusure.some(c => String(c.data).includes('NaN'))).toBe(false)
  })

  it('i numeri del foglio non vengono alterati', () => {
    const c = chiusure.find(c => c.sede === 'Berthollet' && c.data === '2026-07-01')
    expect(c.pos).toBe(788.1)
    expect(c.contanti).toBe(288.3)
    expect(c.totale).toBe(1076.4)
  })

  it('il delivery si aggancia alla sede giusta anche se scritto in minuscolo', () => {
    // Nel foglio è "delivery berthollet": senza normalizzare il nome finiva su
    // una sede fantasma invece che sulla giornata.
    const c = chiusure.find(c => c.sede === 'Berthollet' && c.data === '2026-07-01')
    expect(c.delivery).toBe(70)
  })

  it('la riga TOTALE MESE non diventa una giornata', () => {
    expect(chiusure.every(c => /^\d{4}-\d{2}-\d{2}$/.test(c.data))).toBe(true)
  })
})

describe('il foglio è scritto a mano: gli errori vanno segnalati, non corretti', () => {
  it('avvisa se POS più contanti non fa il totale scritto', () => {
    const foglio = FOGLIO.map(r => [...r])
    foglio[1][3] = 999    // totale incoerente con 788.1 + 288.3
    const { avvisi } = estraiIncassi(foglio, '2026-07')
    expect(avvisi.some(a => a.tipo === 'totale_non_quadra')).toBe(true)
  })

  it('in caso di discordanza tiene il totale scritto, senza scegliere in silenzio', () => {
    const foglio = FOGLIO.map(r => [...r])
    foglio[1][3] = 999
    const { chiusure } = estraiIncassi(foglio, '2026-07')
    expect(chiusure.find(c => c.data === '2026-07-01' && c.sede === 'Berthollet').totale).toBe(999)
  })
})

describe('notazione contabile dentro il testo', () => {
  it.each([
    ['limoni (No F)', 'senza'],
    ['carrefour(f)', 'fattura'],
    ['timut(F)', 'fattura'],
    ['frutta(?)carta', 'incerto'],
    ['pesche', 'incerto'],
  ])('%s → %s', (testo, atteso) => {
    expect(documentoDaTesto(testo)).toBe(atteso)
  })

  it('senza notazione non si presume la fattura', () => {
    // Dichiarare documentata una spesa che nessuno ha visto sarebbe peggio che
    // ammettere di non saperlo.
    expect(documentoDaTesto('spesa qualsiasi')).toBe('incerto')
  })

  it('la descrizione resta leggibile una volta tolta la notazione', () => {
    expect(descrizionePulita('PESCHE E ANGURIA(NO F)')).toBe('PESCHE E ANGURIA')
    expect(descrizionePulita('carrefour(f)')).toBe('carrefour')
  })
})

describe('più spese nella stessa cella', () => {
  it('le separa e ne legge gli importi', () => {
    const r = spesaDaCella(60, '36,4 koko(F);23,6 carta(no F)')
    expect(r).toHaveLength(2)
    expect(r[0].importo).toBeCloseTo(36.4, 2)
    expect(r[0].documento).toBe('fattura')
    expect(r[1].documento).toBe('senza')
  })

  it('il denaro non sparisce: il resto non dettagliato diventa una voce', () => {
    // Se i pezzi sommano meno del totale della colonna, la differenza sono
    // soldi usciti davvero dalla cassa e va tenuta, non buttata.
    const r = spesaDaCella(100, '36,4 koko(F);20 carta(F)')
    const somma = r.reduce((s, x) => s + x.importo, 0)
    expect(somma).toBeCloseTo(100, 2)
    expect(r.some(x => x.importoResiduo)).toBe(true)
  })

  it('i pezzi senza importo si dividono il residuo, ed è dichiarato una stima', () => {
    const r = spesaDaCella(30, 'limoni(no F);pesche(no F)')
    expect(r.every(x => x.importoStimato)).toBe(true)
    expect(r.reduce((s, x) => s + x.importo, 0)).toBeCloseTo(30, 2)
  })

  it('una cella vuota non produce movimenti', () => {
    expect(spesaDaCella(null, null)).toEqual([])
    expect(spesaDaCella(0, '')).toEqual([])
  })
})

describe('estrazione delle spese', () => {
  const { movimenti } = estraiIncassi(FOGLIO, '2026-07')

  it('legge le spese di entrambe le sedi', () => {
    expect(movimenti.length).toBe(3)
    expect(movimenti.map(m => m.sede).sort()).toEqual(['Berthollet', 'Berthollet', 'De Gasperi'])
  })

  it('ogni spesa porta data, importo e stato del documento', () => {
    const m = movimenti.find(m => m.descrizione === 'limoni')
    expect(m.data).toBe('2026-07-02')
    expect(m.importo).toBe(10)
    expect(m.documento).toBe('senza')
  })
})

describe('utilità sui nomi', () => {
  it('ricava il nome della sede togliendo la parola tecnica', () => {
    expect(nomeSedeDaIntestazione('Berthollet- Contanti')).toBe('Berthollet')
    expect(nomeSedeDaIntestazione('De Gasperi- POS')).toBe('De Gasperi')
    expect(nomeSedeDaIntestazione('Totale De Gasperi ')).toBe('De Gasperi')
  })

  it('confronta le sedi ignorando maiuscole e punteggiatura', () => {
    // Nel foglio la stessa sede compare come "Berthollet" negli incassi e
    // "delivery berthollet" nelle consegne: e' la combinazione delle due
    // funzioni a doverle far coincidere.
    expect(chiaveSede(nomeSedeDaIntestazione('delivery berthollet')))
      .toBe(chiaveSede(nomeSedeDaIntestazione('Berthollet')))
    expect(chiaveSede('De Gasperi')).toBe(chiaveSede('de  gasperi'))
  })

  it('riconosce le righe di totale', () => {
    expect(isRigaTotale('TOTALE MESE')).toBe(true)
    expect(isRigaTotale('TOT')).toBe(true)
    expect(isRigaTotale(5)).toBe(false)
  })
})

describe('periodo dedotto dal nome del file', () => {
  it('legge il mese scritto in italiano', () => {
    // È il caso vero: i registri si chiamano così.
    expect(annoMeseDaNomeFile('INCASSI MARAMA LUGLIO 2026.xlsx')).toBe('2026-07')
    expect(annoMeseDaNomeFile('incassi gennaio 2025.xls')).toBe('2025-01')
    expect(annoMeseDaNomeFile('2026 dicembre - cassa.xlsx')).toBe('2026-12')
  })

  it('legge anche le forme numeriche, in entrambi gli ordini', () => {
    expect(annoMeseDaNomeFile('registro 2026-07.xlsx')).toBe('2026-07')
    expect(annoMeseDaNomeFile('registro_2026_07.xlsx')).toBe('2026-07')
    expect(annoMeseDaNomeFile('incassi 07-2026.xlsx')).toBe('2026-07')
  })

  it('quando il nome non dice il mese non lo inventa', () => {
    // Meglio chiederlo che sbagliarlo: un mese sbagliato sposta tutti gli
    // incassi e non se ne accorge nessuno.
    expect(annoMeseDaNomeFile('incassi.xlsx')).toBeNull()
    expect(annoMeseDaNomeFile('registro 2026.xlsx')).toBeNull()
    expect(annoMeseDaNomeFile('')).toBeNull()
    expect(annoMeseDaNomeFile(undefined)).toBeNull()
  })

  it('un mese fuori scala non passa come valido', () => {
    expect(annoMeseDaNomeFile('registro 2026-13.xlsx')).toBeNull()
    expect(annoMeseDaNomeFile('registro 2026-00.xlsx')).toBeNull()
  })

  it('etichettaAnnoMese scrive il periodo in italiano', () => {
    expect(etichettaAnnoMese('2026-07')).toBe('luglio 2026')
    expect(etichettaAnnoMese('2026-13')).toBe('')
    expect(etichettaAnnoMese(null)).toBe('')
  })
})
