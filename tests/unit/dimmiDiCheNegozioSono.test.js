// ── «Sei sicuro che queste fatture sono di…» ───────────────────────────
//
// Richiesta del titolare, 17/09/2026, e nasce da un danno misurato.
//
// Le 3.104 fatture di Mara dei Boschi sono finite **tutte su Carlina**. Non
// perché qualcuno l'avesse deciso: perché era la sede attiva nel momento in
// cui è stato premuto Importa. E le 142 del secondo account Webdesk — quelle
// di Berthollet e De Gasperi — sono rimaste senza sede e sono sparite da ogni
// pagina che ragiona per negozio: **189.458,40 € invisibili**.
//
// Il selettore in alto serve a GUARDARE. Nessuno immagina che decida anche
// dove finiscono i documenti che sta caricando, e non c'è niente che lo dica.
//
// La correzione non è solo un sì/no: si può cambiare, e si possono scegliere
// DUE negozi. È il caso di un account fornitore che ne copre due — allora la
// spesa si dichiara condivisa e si divide sui chili prodotti, invece di
// essere attribuita a caso a uno dei due.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SCAD = readFileSync(join(__dirname, '..', '..', 'src', 'components', 'Scadenzario.jsx'), 'utf8')

describe('non si importa più senza dire dove', () => {
  it('ogni scelta di file passa dalla conferma, non importa dritto', () => {
    // Se ne restasse UNA che chiama direttamente l'import, quella strada
    // continuerebbe a scrivere in silenzio: sono cinque punti nel file.
    expect(SCAD).not.toMatch(/if \(files\.length\) handleImportExcel\(files\)/)
    expect(SCAD).not.toMatch(/if \(files\.length\) handleImportXML\(files\)/)
    expect(SCAD).toMatch(/chiediSede\(files, handleImportExcel\)/)
    expect(SCAD).toMatch(/chiediSede\(files, handleImportXML\)/)
    expect(SCAD).toMatch(/chiediSede\(files, handleImportSMART\)/)
  })

  it('le tre strade di import accettano la destinazione, non la deducono', () => {
    for (const f of ['handleImportExcel', 'handleImportXML', 'handleImportSMART']) {
      expect(SCAD, f).toContain(`async function ${f}(files, sediDestinazione = null)`)
    }
  })

  it('e il file non viene toccato finché non si risponde', () => {
    // `chiediSede` mette da parte i file e apre la finestra: la scrittura
    // avviene solo nel gestore del pulsante di conferma.
    expect(SCAD).toMatch(/function chiediSede\(files, avvia\)/)
    expect(SCAD).toMatch(/setConfermaSede\(\{ files, avvia \}\)/)
    expect(SCAD).toMatch(/avvia\(files, sediScelte\)/)
  })
})

describe('due negozi insieme si dichiarano, non si tirano a sorte', () => {
  it('una sede sola finisce in sede_id, due o più in sedi_condivise', () => {
    expect(SCAD).toMatch(/const unaSola = dest\.length === 1 \? dest\[0\] : null/)
    expect(SCAD).toMatch(/dest\.length > 1 \? \{ sedi_condivise: dest \}/)
  })

  it('e a chi sceglie due negozi si spiega cosa succederà', () => {
    // Senza questa frase, «ne scelgo due» sembra «le metto in tutt'e due»,
    // che raddoppierebbe la spesa.
    expect(SCAD).toContain('in proporzione ai chili prodotti')
    expect(SCAD).toContain('Spesa di ')
  })

  it('e a chi non ne sceglie nessuno si dice che spariranno dalle pagine per sede', () => {
    // È esattamente quello che è successo alle 142 di Mara.
    expect(SCAD).toMatch(/non compariranno/)
  })
})

describe('la finestra si usa anche col dito', () => {
  it('i pulsanti dei negozi sono alti 44px', () => {
    const blocco = SCAD.slice(SCAD.indexOf('Di quale negozio sono queste fatture'))
    expect((blocco.match(/minHeight: 44/g) || []).length,
      'le scelte e i due pulsanti finali').toBeGreaterThanOrEqual(3)
  })

  it('il pulsante di conferma dice il nome del negozio, non «Ok»', () => {
    // «Sì, sono di Carlina» si rilegge prima di premere. «Ok» no.
    expect(SCAD).toMatch(/Sì, sono di \$\{/)
  })
})
