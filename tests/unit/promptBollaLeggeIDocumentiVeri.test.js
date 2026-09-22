// ── Quello che il lettore di bolle DEVE cercare sul documento ───────────
//
// Il 22/09/2026 il titolare ha fotografato **32 bolle vere** di Mara dei
// Boschi: cinque fornitori, cinque impaginazioni diverse. Leggendole una per
// una sono venute fuori dieci cose che il lettore non cercava, e ognuna
// sbaglia un numero che poi nessuno va più a controllare.
//
// Questo file non prova il riconoscimento (quello lo fa un modello, e non si
// prova con un test unitario): prova che **le istruzioni ci siano ancora**.
// Un prompt è codice che nessun compilatore controlla — si può cancellare
// mezza istruzione e tutto continua a sembrare a posto, finché una bolla
// entra sbagliata.
//
// ── Le dieci cose, e il danno che fa ognuna se manca ───────────────────
//
//  1. LORDA / TARA / NETTA (La Foglia, 5 documenti su 32)
//     «LIMONE FOGLIA COSTI-IT | KG | 9,70 | 0,50 | 9,20 | 5,80 | 53,36»
//     9,20 × 5,80 = 53,36 esatto. Prendendo la lorda entrano in magazzino
//     mezzo chilo di limoni mai arrivati, e il prezzo al chilo esce sbagliato
//     del 5%. Verificato su tutte e cinque le bolle.
//
//  2. LA COLONNA T (DESA) — in fondo a ogni bolla c'è la legenda:
//     (V)=Vendita (M)=Sconto in merce (O)=Omaggio (I)=Omaggio Riv. Iva
//     (R)=Reso (N)=Reso Inv. Un reso letto come acquisto viene **caricato**
//     invece che scaricato: la giacenza sbaglia del doppio.
//
//  3. IL CODICE ARTICOLO — DESA taglia le descrizioni alla larghezza della
//     colonna: «LATTE UHT INTERO FRASCHERI B», «PANNA FRESCA DENSA ALBERTI 1».
//     Il dato stabile è «Cod. 1007», stampato sulla riga SOTTO.
//
//  4. LA DESTINAZIONE MERCE — il 19/09/2026 DESA ha consegnato tre bolle lo
//     stesso giorno a tre indirizzi diversi (004615 Berthollet, 004616 De
//     Gasperi, 004617 Piazza Carlo Emanuele II). Senza, la merce finisce nel
//     negozio sbagliato.
//
//  5. LE COLONNE SFASATE (ConoArtic) — la prima riga della descrizione è
//     «ORDINE CLIENTE 65139 DEL 14/09/26», che non è un prodotto: da lì in
//     giù le descrizioni scendono di una riga rispetto ai codici.
//
//  6. LA PUBBLICITÀ CHE SEMBRA MERCE (DESA) — stampata in grande in mezzo
//     alla pagina: «OFFERTA FINO AD ESAURIMENTO PROSC.CRUDO ANTICA
//     PIEVE(7208) A 8,98 EURO AL KG». Ha un codice fra parentesi e un prezzo
//     al chilo. Non ha una quantità, ed è l'unica cosa che la distingue.
//
//  7. LE BOLLE SENZA PREZZI — Vecchio Enrico e ConoArtic, **metà dei
//     documenti**: solo quantità, i prezzi arrivano con la fattura dopo.
//
//  8. IL RIFERIMENTO AL DDT — la fattura Vecchio Enrico n. 28 ha come prima
//     riga «Ddt nr. 20/26 del 05-06-2026». Caricando tutt'e due la giacenza
//     raddoppia.
//
//  9. I PEZZI PER CONFEZIONE — ConoArtic li scrive dentro la descrizione:
//     «COPPETTA BIO 16/B MARA N.250», «TOVAGLIOLO MARA N. 12.000». Con
//     quelli, dalla fattura esce il costo di UNA coppetta: oggi nei formati
//     del design partner costa 0,002 €.
//
// 10. L'ANNO A DUE CIFRE — «19/09/26». Senza la regola, 26 potrebbe essere
//     il 1926, e la bolla finisce fuori da ogni conto.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = readFileSync(join(RADICE, 'src/components/FotoOCR.jsx'), 'utf8')

/** Il testo del prompt `bolla`, dal suo inizio al template successivo. */
function promptBolla() {
  const i = SRC.indexOf('bolla: `You are an OCR specialist')
  if (i < 0) return null
  const j = SRC.indexOf('magazzino: `You are an OCR', i)
  return SRC.slice(i, j < 0 ? undefined : j)
}

const P = promptBolla()

describe('Il prompt delle bolle esiste', () => {
  it('e non è sparito in un refactor', () => {
    expect(P, 'il prompt `bolla` non c\'è più: il riconoscimento delle bolle non ha istruzioni').toBeTruthy()
    expect(P.length).toBeGreaterThan(2000)
  })
})

describe('1. La quantità netta, non la lorda', () => {
  it('sa che le colonne possono essere tre', () => {
    expect(P).toMatch(/lorda/i)
    expect(P).toMatch(/tara/i)
    expect(P).toMatch(/netta/i)
  })
  it('e dice esplicitamente di prendere quella netta', () => {
    expect(P).toMatch(/REPORT THE NET ONE|take the NET|NET ONE/i)
  })
  it('e chiede anche le altre due, per poterle mostrare', () => {
    expect(P).toMatch(/quantitaLorda/)
  })
})

describe('2. La colonna del tipo di riga', () => {
  it('chiede il campo', () => {
    expect(P).toMatch(/"tipoRiga"/)
  })
  it('e riporta la legenda vera di DESA, tutte e sei le lettere', () => {
    // Senza la legenda il modello non sa che «R» vuol dire reso.
    for (const [lettera, parola] of [['V', 'Vendita'], ['M', 'Sconto in merce'], ['O', 'Omaggio'], ['I', 'Omaggio Riv'], ['R', 'Reso'], ['N', 'Reso Inv']]) {
      expect(P, `manca (${lettera})=${parola}`).toContain(`(${lettera})=`)
    }
  })
  it('e lo sconto scritto a parole, non a numero', () => {
    // Galatea scrive «Omaggio» nella colonna dello sconto.
    expect(P).toMatch(/"scontoTesto"/)
    expect(P).toMatch(/Omaggio/)
  })
})

describe('3. Il codice articolo', () => {
  it('lo chiede', () => {
    expect(P).toMatch(/"codice"/)
  })
  it('e sa che può stare sulla riga sotto', () => {
    expect(P).toMatch(/line BELOW|Cod\. 1007/)
  })
  it('e sa che la descrizione viene tagliata dalla colonna', () => {
    expect(P).toMatch(/truncated|cut off/i)
    expect(P).toMatch(/do not invent/i)
  })
})

describe('4. Dove va la merce', () => {
  it('chiede la destinazione, separata dal destinatario', () => {
    expect(P).toMatch(/"destinazione"/)
    expect(P).toMatch(/Destinazione merce|DESTINAZIONE DIVERSA/)
  })
  it('e dice che il fornitore NON è chi riceve', () => {
    // Il rischio è creare un fornitore che sei tu.
    expect(P).toMatch(/NOT the addressee|Spett\.le/)
  })
  it('e che la destinazione è spesso un negozio diverso', () => {
    expect(P).toMatch(/DIFFERENT shop|different shop/i)
  })
})

describe('5. Le colonne sfasate', () => {
  it('c\'è la regola di ancorarsi al codice e alla quantità', () => {
    expect(P).toMatch(/COLUMN ALIGNMENT|Anchor each line/i)
  })
  it('e l\'esempio vero della riga d\'ordine', () => {
    expect(P).toMatch(/ORDINE CLIENTE/)
  })
  it('e la regola che chiude: senza quantità non è merce', () => {
    expect(P).toMatch(/no quantity beside it is a note|not goods/i)
  })
})

describe('6. La pubblicità non diventa una materia prima', () => {
  it('l\'esempio vero di DESA è nel prompt', () => {
    expect(P).toMatch(/OFFERTA FINO AD ESAURIMENTO/)
    expect(P).toMatch(/ANTICA PIEVE/)
  })
  it('col motivo: ha un codice e un prezzo al chilo', () => {
    expect(P).toMatch(/ADVERTISING/i)
    expect(P).toMatch(/even when they contain an article code/i)
  })
  it('e il testo legale che sta dentro la colonna descrizione', () => {
    expect(P).toMatch(/Assolve gli obblighi/)
    expect(P).toMatch(/NON SI ACCETTANO RECLAMI/)
    expect(P).toMatch(/ORARIO DI SCARICO/)
  })
})

describe('7. Le bolle senza nessun prezzo', () => {
  it('il campo c\'è', () => {
    expect(P).toMatch(/"senzaPrezzi"/)
  })
  it('e distingue «non c\'è la colonna» da «la colonna è vuota su questa riga»', () => {
    // Sono due cose diverse: la prima è un DDT puro, la seconda è un buco.
    expect(P).toMatch(/Do not confuse this with a price column that exists but is empty/i)
  })
})

describe('8. Il riferimento al DDT, per non caricare due volte', () => {
  it('il campo c\'è', () => {
    expect(P).toMatch(/"riferimentoDdt"/)
  })
  it('con l\'esempio vero della fattura Vecchio Enrico n. 28', () => {
    expect(P).toMatch(/Ddt nr\. 20\/26/)
  })
  it('e dice cosa vuol dire: la merce è già stata consegnata', () => {
    expect(P).toMatch(/already delivered/i)
  })
})

describe('9. I pezzi per confezione', () => {
  it('il campo c\'è, separato dal peso della confezione', () => {
    expect(P).toMatch(/"pezziPerConfezione"/)
    expect(P).toMatch(/"pesoConfezioneG"/)
  })
  it('con i quattro modi veri di scriverlo, presi dalle bolle ConoArtic', () => {
    expect(P).toMatch(/N\.250/)
    expect(P).toMatch(/N\. 12\.000/)
    expect(P).toMatch(/BOX 288 PZ/)
    expect(P).toMatch(/pz500/)
  })
  it('e il divieto di indovinarlo', () => {
    expect(P).toMatch(/NEVER guess it/)
  })
})

describe('10. L\'anno a due cifre', () => {
  it('19/09/26 è il 2026, non il 1926', () => {
    expect(P).toMatch(/two-digit year/i)
    expect(P).toMatch(/2026-09-19/)
  })
})

describe('Quello che c\'era prima e deve restare', () => {
  it('niente conti fatti dal modello', () => {
    // Una conversione fatta qui è invisibile e non si può controllare.
    expect(P).toMatch(/do NOT do arithmetic/i)
  })
  it('i numeri restano scritti all\'italiana', () => {
    expect(P).toMatch(/1\.250,50/)
    expect(P).toMatch(/Do NOT reformat/i)
  })
  it('un campo che non si legge si omette, non si indovina', () => {
    expect(P).toMatch(/a guessed field is a wrong price nobody will notice/i)
  })
  it('e i campi del conto ci sono tutti', () => {
    for (const c of ['"quantita"', '"unita"', '"prezzoUnitario"', '"imponibile"', '"totaleConIva"', '"aliquotaIva"', '"scontoPct"']) {
      expect(P, `manca ${c}`).toContain(c)
    }
  })
  it('e le unità vere delle cinque bolle sono nell\'elenco', () => {
    // SC (scatola) e PA (pacco) di ConoArtic, NR de La Foglia, CF di DESA.
    for (const u of ['KG', 'LT', 'CF', 'PZ', 'NR', 'SC', 'PA', 'CT']) {
      expect(P, `manca l'unità ${u}`).toContain(`"${u}"`)
    }
  })
})

describe('Quello che NON si deve chiedere', () => {
  it('i lotti: il titolare ha detto che non li usa', () => {
    // 22/09/2026, domanda 8: «non li uso». Chiederli costa attenzione al
    // modello e non serve a nessuno.
    expect(P).toMatch(/Do NOT extract lot numbers/i)
  })
})

describe('Il righello di questo file', () => {
  it('legge davvero il prompt, non una stringa vuota', () => {
    expect(P).toContain('You are an OCR specialist')
    expect(P.split('\n').length).toBeGreaterThan(30)
  })
  it('e saprebbe accorgersi se cercasse nel posto sbagliato', () => {
    // Taratura: una frase inventata non si trova.
    expect(P).not.toMatch(/questa frase non esiste nel prompt/i)
  })
})

describe('Una bolla fotografata in più scatti non perde la testata', () => {
  // Trovato dall'audit del 22/09/2026. Un DDT su due pagine si fotografa due
  // volte: l'intestazione sta sulla prima, le righe su tutte. La fusione
  // teneva solo fornitore, numero, data e righe, e buttava via gli altri
  // sette campi **in silenzio**.
  //
  // Il peggiore è `senzaPrezzi`: un DDT di Vecchio Enrico o ConoArtic
  // fotografato in due scatti lo perdeva, e allora **nessuna riga entrava in
  // magazzino** — il contrario esatto di quello che la schermata promette e
  // di quello che il titolare ha deciso. Sparivano anche il collegamento
  // fattura-bolla, la destinazione e la testata del fornitore.
  const FUSIONE = SRC.slice(SRC.indexOf("} else if (mode === 'bolla') {"), SRC.indexOf("} else if (mode === 'prezzi') {"))

  it('tiene tutti i campi della testata, non solo tre', () => {
    for (const campo of ['tipoDocumento', 'destinazione', 'testataFornitore',
      'riferimentoDdt', 'totaleScrittoAMano', 'senzaPrezzi', 'piuDocumenti']) {
      expect(FUSIONE, `«${campo}» si perde fondendo le foto`).toContain(campo)
    }
  })

  it('e basta che UNA foto dica «senza prezzi» perché lo sia', () => {
    // La pagina delle righe può non avere la colonna del prezzo: se si
    // pretendesse che lo dicessero tutte, il caso non scatterebbe mai.
    expect(FUSIONE).toMatch(/senzaPrezzi: results\.some\(/)
  })

  it('gli altri campi si prendono dalla prima foto che ce li ha', () => {
    expect(FUSIONE).toMatch(/const primo = \(campo\) =>/)
  })
})

describe('Il codice cliente del fornitore', () => {
  // Il titolare, 22/09/2026: «marama è sia berthollet che de gasperi,
  // dobbiamo capire come fare a distinguerle».
  //
  // Due negozi, stessa ragione sociale, stessa partita IVA (13338490017).
  // Sul nome non si distinguono. Ma il 19/09 DESA ha consegnato tre bolle in
  // tre minuti, e ognuna porta il suo codice cliente:
  //
  //     004615  09:29  MARAMA SRL   Via Berthollet 30 H   0001098521
  //     004616  09:31  MARAMA SRL   C.so De Gasperi       0001098522
  //     004617  09:32  CARLINA21    P.za Carlo Emanuele   0001093134
  //
  // È l'unica cosa stampata che li separa quando l'indirizzo del negozio non
  // c'è. Un numero non si scrive in venti modi e non si legge male.
  it('lo chiede', () => {
    expect(P).toMatch(/"codiceCliente"/)
  })

  it('e spiega dove si trova, con le etichette vere dei due fornitori', () => {
    expect(P).toMatch(/CODICE CLI\.\/FOR\./)
    expect(P).toMatch(/0001098521/)
  })

  it('e dice perché conta, se no il modello lo salta come un numero qualunque', () => {
    expect(P).toMatch(/two shops of the same company apart/i)
    expect(P).toMatch(/do not clean it up/i)
  })

  it('e non si perde fondendo più foto', () => {
    const FUSIONE = SRC.slice(SRC.indexOf("} else if (mode === 'bolla') {"), SRC.indexOf("} else if (mode === 'prezzi') {"))
    expect(FUSIONE).toContain('codiceCliente')
  })
})
