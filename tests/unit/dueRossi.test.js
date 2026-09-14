// Il rosso del marchio e il rosso d'allarme sono due cose diverse.
//
// Scelta del titolare, 14/09/2026. Prima li faceva lo stesso bordeaux: in una
// pagina con un allarme vero — una giacenza sotto zero, una fattura scaduta —
// il riquadro dell'errore e il pulsante dell'azione avevano lo stesso colore, e
// l'occhio non sapeva dove guardare.
//
//   bordeaux #6E0E1A → azioni: pulsanti principali, voce attiva, link
//   rosso    #DC2626 → allarmi: sotto zero, esaurito, scaduto, salvataggio fallito

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { color as T } from '../../src/lib/theme.js'
import { C } from '../../src/views/_shared.jsx'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('i due rossi', () => {
  it('sono due colori diversi, e ognuno ha il suo nome', () => {
    expect(T.brand).toBe('#6E0E1A')
    expect(T.red).toBe('#DC2626')
    expect(T.brand).not.toBe(T.red)
    // `C.red` resta il bordeaux per ragioni storiche (lo usano i pulsanti),
    // `C.alert` è quello degli allarmi.
    expect(C.red).toBe(T.brand)
    expect(C.alert).toBe(T.red)
    expect(C.alertLight).toBe(T.redLight)
  })

  it('gli stati rotti del magazzino usano il rosso d\'allarme', () => {
    const src = readFileSync(join(RADICE, 'src', 'views', 'MagazzinoView.jsx'), 'utf8')
    // "negativo" = giacenza sotto zero, "esaurito" = finito: due allarmi.
    expect(src).toMatch(/statoColor = s => s === 'negativo' \? C\.alert/)
    expect(src).toMatch(/s === 'esaurito' \? C\.alert/)
    expect(src).toMatch(/statoBg = s => s === 'negativo' \? C\.alertLight/)
  })

  it('una fattura scaduta usa il rosso d\'allarme, non quello del marchio', () => {
    const src = readFileSync(join(RADICE, 'src', 'components', 'Scadenzario.jsx'), 'utf8')
    expect(src).toMatch(/label: 'SCADUTA',[^}]*accent: T\.red/)
    expect(src).not.toMatch(/isScaduta \? T\.brand/)
  })
})
