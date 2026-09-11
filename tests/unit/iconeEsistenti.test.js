// Ogni <Icon name="..."> deve esistere davvero.
//
// Perché serve un controllo sul sorgente. Icon, quando non trova il nome,
// disegna un pallino neutro (src/components/Icon.jsx: "fallback: pallino
// neutro, così non si rompe mai il layout"). È la scelta giusta per non
// rompere la pagina, ma ha un prezzo: un nome sbagliato non dà nessun errore,
// né in console né nei test. Resta lì, e al posto dell'icona c'è un punto
// grigio che l'utente legge come "manca qualcosa".
//
// Nel giro del 10/09/2026 due nomi usati nel codice non esistevano (chevUp,
// minus) e per mesi avevano disegnato dei pallini. Sono stati aggiunti a mano
// dopo averli notati per caso su una schermata. Questo controllo fa il giro di
// tutti i file e li trova tutti in un secondo.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function tuttiIFile(dir, acc = []) {
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) tuttiIFile(p, acc)
    else if (/\.(js|jsx)$/.test(nome)) acc.push(p)
  }
  return acc
}

// I nomi disponibili si leggono dal sorgente di Icon: le chiavi dell'oggetto
// `P` (i tracciati SVG) più quelle di `ALIAS` (i vecchi nomi ancora accettati,
// compresi gli emoji che il componente traduce in icona). Si legge il sorgente
// invece di importare il componente per non dipendere da React qui.
function nomiDisponibili() {
  const src = readFileSync('src/components/Icon.jsx', 'utf-8')
  const nomi = new Set()
  for (const blocco of ['const P = {', 'const ALIAS = {']) {
    const inizio = src.indexOf(blocco)
    expect(inizio, `${blocco} non trovato in Icon.jsx`).toBeGreaterThan(-1)
    const fine = src.indexOf('\n}', inizio)
    for (const m of src.slice(inizio, fine).matchAll(/^\s{2}'?([A-Za-z][\w-]*)'?:\s*'/gm)) nomi.add(m[1])
  }
  return nomi
}

describe('nomi delle icone', () => {
  const disponibili = nomiDisponibili()

  it('Icon.jsx espone un elenco di nomi leggibile', () => {
    expect(disponibili.size).toBeGreaterThan(50)
    expect(disponibili.has('alert')).toBe(true)
    expect(disponibili.has('euro')).toBe(true)
  })

  it('nessun <Icon name="..."> punta a un nome che non esiste', () => {
    const mancanti = []
    for (const p of tuttiIFile('src')) {
      if (p.endsWith('Icon.jsx')) continue
      const src = readFileSync(p, 'utf-8')
      // Solo i nomi scritti come stringa letterale: name={variabile} non si
      // può controllare da qui.
      for (const m of src.matchAll(/<Icon\s[^>]*?name=["']([^"']+)["']/g)) {
        if (!disponibili.has(m[1])) mancanti.push(`${p}: name="${m[1]}"`)
      }
      // Anche la forma name={cond ? 'a' : 'b'}, comune nei bottoni che cambiano
      // stato.
      for (const m of src.matchAll(/<Icon\s[^>]*?name=\{[^}]*?\?\s*["']([^"']+)["']\s*:\s*["']([^"']+)["']/g)) {
        for (const n of [m[1], m[2]]) {
          if (!disponibili.has(n)) mancanti.push(`${p}: name={… ? "${n}" …}`)
        }
      }
    }
    expect(mancanti, `Icone inesistenti (disegnano un pallino grigio):\n  - ${mancanti.join('\n  - ')}`).toEqual([])
  })
})
