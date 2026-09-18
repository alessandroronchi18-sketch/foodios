// ── Un'icona dentro un pulsante quadrato sta al centro ────────────────────
//
// Il difetto, 17/09/2026. Il titolare, guardando la pagina Listino: «centra
// l'immagine del cestino della spazzatura nei pulsanti dove è presente, ora
// sono tutti spostati a sinistra».
//
// La causa era di una riga. Il pulsante è un quadrato di 32px (40 sul
// telefono) con dentro una sola icona da 14. Aveva `display: 'inline-flex'` e
// `alignItems: 'center'` — che centra in verticale — ma non `justifyContent`,
// che centra in orizzontale. Senza quello il contenuto si appoggia al bordo
// sinistro, e restano 18px di vuoto a destra: il cestino sembra spinto in un
// angolo.
//
// È una famiglia, non un caso isolato: cercandoli tutti ne sono saltati fuori
// due, il cestino del Listino e la × che toglie una riga dalla chiusura di
// cassa. Questo test tiene la regola per tutti quelli che verranno: se
// qualcuno scrive un altro pulsante quadrato con un'icona dentro e si
// dimentica la centratura, qui si vede prima che lo veda il titolare.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { globSync } from 'glob'

/** I pulsanti con larghezza E altezza fissate, che contengono un'icona e
 *  non dicono come centrare il contenuto in orizzontale. */
function pulsantiScentrati() {
  const trovati = []
  for (const file of globSync('src/**/*.jsx')) {
    const testo = fs.readFileSync(file, 'utf8')
    const righe = testo.split('\n')
    const stili = testo.matchAll(/style=\{\{((?:[^{}]|\{[^{}]*\})*)\}\}/g)
    for (const m of stili) {
      const s = m[1]
      if (s.includes('justifyContent')) continue
      if (!s.includes('flex')) continue
      const w = /(?<!min)(?<!max)[wW]idth:\s*(isMobile\s*\?\s*)?\d+/.test(s)
      const h = /(?<!min)(?<!max)[hH]eight:\s*(isMobile\s*\?\s*)?\d+/.test(s)
      if (!w || !h) continue
      const n = testo.slice(0, m.index).split('\n').length - 1
      const indietro = righe.slice(Math.max(0, n - 6), n + 1).join('\n')
      const tag = [...indietro.matchAll(/<([A-Za-z][\w.]*)/g)].map(x => x[1])
      if (tag[tag.length - 1] !== 'button') continue
      const avanti = righe.slice(n, n + 6).join('\n')
      if (!avanti.includes('<Icon') && !avanti.includes('ic(')) continue
      trovati.push(`${file}:${n + 1}`)
    }
  }
  return trovati
}

describe('Le icone nei pulsanti quadrati stanno al centro', () => {
  it('nessun pulsante quadrato con un’icona dentro dimentica la centratura', () => {
    expect(pulsantiScentrati()).toEqual([])
  })

  // 18/09, secondo giro: queste due prove erano inchiodate alla stringa
  // letterale `width: isMobile ? 40 : 32`. Bastava cambiare quella misura —
  // ed è successo lo stesso giorno, portando il tablet da 32 a 44 perché si
  // tocca col dito come un telefono — per farle cadere senza che nulla fosse
  // rotto. Adesso il pulsante si trova dal suo `aria-label`, che è quello che
  // lo identifica davvero, e si guarda lo stile che ha.
  const rigaStileDi = (file, ancora) => {
    const righe = fs.readFileSync(file, 'utf8').split('\n')
    const i = righe.findIndex(r => r.includes(ancora))
    if (i < 0) return null
    return righe.slice(i, i + 4).find(r => r.includes('style={{'))
  }

  it('il cestino del Listino è centrato — è quello che il titolare ha visto storto', () => {
    const riga = rigaStileDi('src/components/FormatiVendita.jsx', 'aria-label={`Elimina il formato')
    expect(riga, 'il pulsante che elimina un formato non si trova più: aggiorna il test').toBeTruthy()
    expect(riga).toContain("justifyContent: 'center'")
  })

  it('il `gap` sparisce dai pulsanti con un figlio solo: non regolava niente', () => {
    const riga = rigaStileDi('src/components/FormatiVendita.jsx', 'aria-label={`Elimina il formato')
    expect(riga).not.toContain('gap:')
  })

  it('e su tablet è grande abbastanza per un dito', () => {
    // Il difetto del 18/09: «tutto quello che non è telefono» comprendeva
    // l'iPad, e lì il cestino restava 32px.
    const riga = rigaStileDi('src/components/FormatiVendita.jsx', 'aria-label={`Elimina il formato')
    expect(riga).toMatch(/width: dito \? 44/)
  })
})
