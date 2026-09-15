// La misura scritta una volta sola, per le tre versioni.
//
// Il titolare l'ha messo come requisito: computer, tablet e telefono «devono
// essere aggiornati in tempo reale» fra loro, cioè non devono divergere.
//
// Il 15/09/2026 divergevano eccome: 109 punti in 51 file scrivevano la stessa
// misura tre volte (`isMobile ? X : isTablet ? Y : Z`) e 1.619 la scrivevano
// due. Chi ne cambia una sola fa divergere le altre — ed era già successo: il
// tablet aveva 95 campi di testo sotto i 16px perché la regola anti-zoom era
// scritta `isMobile ? 16 : 13`, e su iPad `isMobile` è falso.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { ui, per, ui3 } from '../../src/lib/theme.js'
import { uiInput, uiTextarea, uiBtn } from '../../src/lib/uiKit.js'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const leggi = (...p) => readFileSync(join(RADICE, ...p), 'utf8')

describe('un interruttore solo, non due che si contraddicono', () => {
  const H = leggi('src', 'lib', 'useIsMobile.js')

  it('`useDevice` esiste e risponde con una parola sola', () => {
    // Prima erano due sottoscrizioni separate con due stati: passando una
    // soglia potevano rispondere in ordine diverso, e per un fotogramma il
    // componente credeva di essere su due dispositivi insieme.
    expect(H).toMatch(/export function useDevice\(\)/)
    expect(H).toMatch(/return 'telefono'/)
    expect(H).toMatch(/return 'tablet'/)
    expect(H).toMatch(/return 'computer'/)
  })

  it('e una sola sottoscrizione per entrambe le soglie', () => {
    const f = H.slice(H.indexOf('export function useDevice'), H.indexOf('export default function useIsMobile'))
    expect((f.match(/useState/g) || []).length, 'un solo stato').toBe(1)
  })

  it('le soglie sono quelle di sempre', () => {
    expect(H).toMatch(/TELEFONO_MAX = 767/)
    expect(H).toMatch(/TABLET_MAX = 1023/)
  })

  it('fuori dal browser non esplode', () => {
    expect(H).toMatch(/typeof window === 'undefined'/)
  })
})

describe('i token a tre vie', () => {
  it('ogni misura ha tutte e tre le versioni', () => {
    for (const [nome, t] of Object.entries(ui)) {
      for (const d of ['telefono', 'tablet', 'computer']) {
        expect(t[d], `${nome} non ha il valore per ${d}`).toBeDefined()
      }
    }
  })

  it('`per` prende il valore giusto', () => {
    expect(per('telefono')(ui.ctrlH)).toBe(44)
    expect(per('tablet')(ui.ctrlH)).toBe(44)
    expect(per('computer')(ui.ctrlH)).toBe(36)
  })

  it('e su un dispositivo che non conosce ricade sul computer', () => {
    // La versione più conservativa: meglio un controllo piccolo che nessuna
    // misura.
    expect(per('boh')(ui.ctrlH)).toBe(36)
    expect(per(undefined)(ui.ctrlH)).toBe(36)
  })

  it('quello che si tocca ha 44px, telefono E tablet', () => {
    // È il punto che si era perso: 44px è la misura di un polpastrello, e
    // l'iPad si tocca esattamente come un telefono.
    expect(per('telefono')(ui.ctrlH)).toBe(per('tablet')(ui.ctrlH))
  })

  it('i campi di testo hanno 16px su tutto quello che si tocca', () => {
    // Sotto i 16px iOS ingrandisce la pagina da solo.
    expect(per('telefono')(ui.inputFs)).toBe(16)
    expect(per('tablet')(ui.inputFs)).toBe(16)
  })

  it('le griglie perdono colonne man mano che lo schermo si stringe', () => {
    expect(per('computer')(ui.grid4)).toContain('4')
    expect(per('tablet')(ui.grid4)).toContain('2')
    expect(per('telefono')(ui.grid4)).toBe('1fr 1fr')
  })
})

describe('il kit condiviso, che esisteva e non lo importava nessuno', () => {
  it('parla il linguaggio dei tre dispositivi', () => {
    expect(uiInput('telefono').fontSize).toBe(16)
    expect(uiInput('tablet').fontSize).toBe(16)
    expect(uiInput('computer').fontSize).toBe(13)
  })

  it('e l\'altezza dei campi segue il token', () => {
    expect(uiInput('telefono').height).toBe(44)
    expect(uiInput('computer').height).toBe(36)
  })

  it('le vecchie chiamate col booleano continuano a funzionare', () => {
    // Così chi lo usava già non si rompe mentre si converte il resto.
    expect(uiInput(true).fontSize).toBe(16)
    expect(uiInput(false).fontSize).toBe(13)
    expect(uiInput().fontSize).toBe(13)
  })

  it('l\'area di testo eredita tutto dal campo', () => {
    expect(uiTextarea('telefono').fontSize).toBe(16)
    expect(uiTextarea('telefono').resize).toBe('vertical')
  })

  it('i bottoni si ingrandiscono dove si toccano', () => {
    expect(uiBtn({ dev: 'telefono' }).height).toBe(44)
    expect(uiBtn({ dev: 'tablet' }).height).toBe(44)
    expect(uiBtn({ dev: 'computer' }).height).toBe(36)
    // Anche quelli piccoli: 28px col dito non si centrano.
    expect(uiBtn({ size: 'sm', dev: 'telefono' }).height).toBeGreaterThanOrEqual(36)
    expect(uiBtn({ size: 'sm', dev: 'computer' }).height).toBe(28)
  })
})

describe('il ponte per convertire i punti esistenti', () => {
  it('`ui3` parte dai due booleani che i componenti hanno già', () => {
    // Serve a spostare la misura nei token subito, senza dover riscrivere ogni
    // componente perché usi `useDevice()`. Il passaggio si fa con calma.
    expect(ui3(true, false, ui.ctrlH)).toBe(44)
    expect(ui3(false, true, ui.ctrlH)).toBe(44)
    expect(ui3(false, false, ui.ctrlH)).toBe(36)
  })

  it('il telefono vince sul tablet se arrivassero veri tutti e due', () => {
    // Non dovrebbe succedere con `useDevice`, ma con i due hook separati sì:
    // meglio una regola dichiarata che un comportamento a caso.
    expect(ui3(true, true, ui.ctrlH)).toBe(44)
    expect(ui3(true, true, ui.grid4)).toBe('1fr 1fr')
  })
})

describe('le misure scritte tre volte stanno scendendo', () => {
  it('e i punti convertiti usano i token, non i numeri', async () => {
    const { readdirSync, statSync } = require('node:fs')
    let usi = 0
    const scorri = (d) => {
      for (const n of readdirSync(d)) {
        const f = join(d, n)
        if (statSync(f).isDirectory()) { scorri(f); continue }
        if (!n.endsWith('.jsx')) continue
        usi += (readFileSync(f, 'utf8').match(/ui3\(isMobile, isTablet, ui\./g) || []).length
      }
    }
    scorri(join(RADICE, 'src'))
    expect(usi, 'nessun punto convertito ai token').toBeGreaterThan(20)
  })

  it('e chi li usa importa davvero il token', () => {
    const { readdirSync, statSync } = require('node:fs')
    const mancanti = []
    const scorri = (d) => {
      for (const n of readdirSync(d)) {
        const f = join(d, n)
        if (statSync(f).isDirectory()) { scorri(f); continue }
        if (!n.endsWith('.jsx')) continue
        const s2 = readFileSync(f, 'utf8')
        if (s2.includes('ui3(isMobile') && !/import \{[^}]*\bui3\b/.test(s2)) mancanti.push(n)
      }
    }
    scorri(join(RADICE, 'src'))
    expect(mancanti, `usano ui3 senza importarlo: ${mancanti.join(', ')}`).toHaveLength(0)
  })
})

describe('i condizionali che non decidevano niente', () => {
  it('non ce ne sono più', () => {
    // 38 punti scrivevano `isMobile ? 12 : 12`: un condizionale che fa credere
    // a chi legge che su telefono la misura cambi, e che se un domani la si
    // vuole cambiare davvero fa cambiare il ramo sbagliato.
    const { readdirSync, statSync } = require('node:fs')
    const rx = /is(?:Mobile|Tablet)\s*\?\s*('[^']*'|"[^"]*"|[\w.]+)\s*:\s*('[^']*'|"[^"]*"|[\w.]+)/g
    const trovati = []
    const scorri = (d) => {
      for (const n of readdirSync(d)) {
        const f = join(d, n)
        if (statSync(f).isDirectory()) { scorri(f); continue }
        if (!/\.jsx?$/.test(n)) continue
        const s = readFileSync(f, 'utf8')
        for (const m of s.matchAll(rx)) {
          if (m[1] === m[2]) trovati.push(`${n}: ${m[0]}`)
        }
      }
    }
    scorri(join(RADICE, 'src'))
    expect(trovati, `condizionali inutili rimasti:\n${trovati.slice(0, 5).join('\n')}`).toHaveLength(0)
  })
})
