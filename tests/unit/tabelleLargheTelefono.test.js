// Nessuna tabella più larga del telefono.
//
// Il 16/09/2026, misurando tutte le 35 pagine a 390px, ne restavano sei da
// 720 a 1.215 pixel: due o tre schermate di scorrimento laterale per leggere
// una riga sola, e intanto l'intestazione della colonna era uscita a sinistra,
// quindi non si sapeva nemmeno più che numero si stava guardando. È il difetto
// che il titolare aveva segnalato su «Produzione» — «non riesco a leggere
// nulla» — e che era identico in altre quattro pagine.
//
// Ora tutte passano da `TabellaOSchede`: tabella sul computer, elenco di
// schede sul telefono. Questo test impedisce che ne rientri una dalla finestra:
// una `<table>` con una larghezza minima maggiore di 390 deve stare dentro
// quel componente, che sul telefono non la disegna proprio.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const LARGHEZZA_TELEFONO = 390

// Fuori dal conto, con motivo:
const ESENTI = [
  // Il pannello di amministrazione lo apro io, dal computer. Non è il
  // prodotto che usano i clienti.
  'src/admin/',
  // La dashboard da muro: lo schermo è grande per definizione.
  'src/pages/TvDashboard.jsx',
]

function file(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) { if (n !== 'node_modules') file(p, out) }
    else if (/\.jsx?$/.test(n)) out.push(p)
  }
  return out
}

describe('tabelle larghe sul telefono', () => {
  // ── Prova di controllo sul righello (audit 16/09/2026) ────────────────
  // Un censimento che dice «nessun colpevole» va bene solo se ha davvero
  // guardato dentro il progetto. Se il cammino sbaglia, l'elenco di partenza
  // è vuoto, il censimento resta verde e non protegge più niente: è successo
  // con `views-render-smoke`, lo stesso giorno.
  it('il setaccio guarda davvero dentro il progetto', () => {
    expect(file(join(RADICE, 'src')).length).toBeGreaterThan(150)
  })

  it('ogni tabella più larga di 390px passa da TabellaOSchede', () => {
    const colpevoli = []
    for (const p of file(join(RADICE, 'src'))) {
      const rel = relative(RADICE, p)
      if (ESENTI.some(e => rel.startsWith(e) || rel === e)) continue
      const src = readFileSync(p, 'utf8')
      // `minWidth` dichiarato su una <table> o passato a TabellaOSchede.
      for (const m of src.matchAll(/<table[^>]*?minWidth:\s*(\d+)/gs)) {
        const larg = Number(m[1])
        if (larg <= LARGHEZZA_TELEFONO) continue
        // Due modi leciti di non disegnarla sul telefono:
        //  - starci dentro `TabellaOSchede`;
        //  - avere una versione a schede scritta a mano, dichiarata con il
        //    marcatore `telefono: schede` nel commento sopra la tabella.
        //    Serve per le pagine dove le schede sono troppo particolari per
        //    il componente generico (l'inventario settimanale: sette giorni
        //    per due campi scrivibili dentro ogni scheda).
        const prima = src.slice(Math.max(0, m.index - 2500), m.index)
        if (prima.includes('<TabellaOSchede')) continue
        if (src.slice(Math.max(0, m.index - 900), m.index).includes('telefono: schede')) continue
        const riga = src.slice(0, m.index).split('\n').length
        colpevoli.push(`${rel}:${riga} → tabella larga ${larg}px`)
      }
    }
    expect(colpevoli).toEqual([])
  })

  it('TabellaOSchede sul telefono non disegna la tabella', () => {
    const src = readFileSync(join(RADICE, 'src', 'views', '_shared.jsx'), 'utf8')
    const comp = src.slice(src.indexOf('export function TabellaOSchede'))
    // Sul computer: la tabella. Sul telefono: si esce prima di arrivarci.
    expect(comp).toMatch(/if \(!isMobile\) \{[\s\S]{0,400}<table/)
    // E le schede non contengono nessun <table>.
    const schede = comp.slice(comp.indexOf('const visibili'))
    expect(schede).not.toMatch(/<table/)
  })
})
