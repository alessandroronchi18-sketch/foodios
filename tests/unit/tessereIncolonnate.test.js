// ── Le tessere affiancate devono incolonnarsi ──────────────────────────
//
// Richiesta esplicita del titolare: «tutto incolonnato bene, i caratteri di
// grandezza uguale, i colori uguali quando è necessario e collocati uguali
// quando necessario».
//
// Misurando le 19 pagine dentro l'account vero, il 16/09/2026, con un
// rilevatore tarato (i primi giri confrontavano il pannello del menu col
// contenuto: 19 falsi allarmi), sono rimasti due difetti veri.
//
// 1. RICETTARIO, a telefono. «GUSTI» e «FOOD COST MEDIO», una accanto
//    all'altra, partivano a 8px di distanza. Colpa di `alignItems: center`
//    nell'etichetta di `KPI`: l'altezza minima di 30px tiene incolonnati i
//    valori — e va benissimo — ma il testo dentro veniva centrato. Etichetta
//    corta su una riga: resta a mezz'aria, parte 7,5px più in basso.
//    Etichetta lunga: va a capo, riempie i 30px, parte da zero. Due tessere
//    accanto, due quote diverse.
//
// 2. P&L, a monitor. Nella fila «Costi mensili · Costi annui · Margine lordo
//    · Margine netto» l'ultimo riquadro aveva dimenticato `small`: bordo
//    interno 14px invece di 10, numero 20px invece di 16. Etichette sfalsate
//    di 4px e numeri di due grandezze diverse nella stessa riga.
//
// Il secondo è la classe di difetto più insidiosa: una proprietà che vale
// per una fila intera, ma scritta una tessera alla volta. Basta dimenticarla
// una volta e la fila si storta.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RADICE = join(__dirname, '..', '..')
const leggi = (...p) => readFileSync(join(RADICE, ...p), 'utf8')

describe('le etichette delle tessere partono tutte dalla stessa quota', () => {
  const SHARED = leggi('src', 'views', '_shared.jsx')
  // Solo il <div> contenitore dell'etichetta: il pallino dell'icona, dentro,
  // centra la sua icona ed e' giusto che lo faccia.
  const inizio = SHARED.indexOf("textTransform: 'uppercase',", SHARED.indexOf('export function KPI'))
  const contenitore = SHARED.slice(inizio, SHARED.indexOf('>', SHARED.indexOf('gap: 8', inizio)))
  const etichetta = SHARED.slice(inizio, inizio + 900)

  it('non sono più centrate verticalmente', () => {
    expect(contenitore).not.toContain("alignItems: 'center'")
  })

  it('sono allineate in cima, così una che va a capo non sposta le altre', () => {
    expect(etichetta).toContain("alignItems: 'flex-start'")
  })

  it('l’altezza minima resta: è quella che incolonna i valori', () => {
    // Toglierla romperebbe l'allineamento dei numeri, che è l'altra metà.
    expect(etichetta).toContain('minHeight: 30')
  })

  it('sul telefono il pallino dell’icona resta in asse con la prima riga', () => {
    expect(etichetta).toMatch(/paddingTop: \(icon && isMobile\) \? 5 : 0/)
  })
})

describe('in una fila di riquadri la taglia è la stessa per tutti', () => {
  const PL = leggi('src', 'views', 'PLView.jsx')
  const righe = PL.split('\n')

  // Raggruppa i <BoxKpi> per il contenitore che li tiene: si risale alla
  // riga con `display: 'grid'` più vicina sopra di loro.
  const gruppi = new Map()
  righe.forEach((riga, i) => {
    if (!riga.includes('<BoxKpi')) return
    let g = -1
    for (let j = i; j >= 0 && i - j < 40; j--) {
      if (/display: 'grid'|display:'grid'/.test(righe[j])) { g = j; break }
    }
    // Il tag può occupare più righe: si legge fino alla chiusura.
    let tag = '', k = i
    while (k < righe.length && k < i + 12) { tag += righe[k]; if (righe[k].includes('/>')) break; k++ }
    if (!gruppi.has(g)) gruppi.set(g, [])
    gruppi.get(g).push({ riga: i + 1, small: /\bsmall\b/.test(tag) })
  })

  it('i riquadri del P&L sono raggruppati per fila (controllo del metodo)', () => {
    // Se questo test smette di trovare gruppi, quelli sotto diventano vuoti
    // e passerebbero senza controllare niente.
    expect(gruppi.size).toBeGreaterThanOrEqual(2)
    expect([...gruppi.values()].every(g => g.length >= 2)).toBe(true)
  })

  it('dentro ogni fila, o sono tutti «small» o nessuno lo è', () => {
    for (const [g, membri] of gruppi) {
      const taglie = [...new Set(membri.map(m => m.small))]
      expect(taglie.length,
        `fila che parte a riga ${g + 1}: ${membri.map(m => `riga ${m.riga}=${m.small ? 'small' : 'normale'}`).join(', ')}`
      ).toBe(1)
    }
  })

  it('e la fila dei costi è tutta small, com’era previsto', () => {
    // Si parte dal contenitore, non dal primo riquadro: partendo
    // dall'etichetta il primo <BoxKpi resterebbe fuori dalla fetta.
    const etich = PL.indexOf('label="Costi mensili"')
    const da = PL.lastIndexOf('<BoxKpi', etich)
    const a = PL.indexOf('</div>', PL.indexOf('highlight={haMargine}', da))
    const costi = PL.slice(da, a)
    expect((costi.match(/<BoxKpi/g) || []).length, 'la fila deve avere 4 riquadri').toBe(4)
    expect((costi.match(/\bsmall\b/g) || []).length, 'tutti e 4 devono essere small').toBe(4)
  })
})
