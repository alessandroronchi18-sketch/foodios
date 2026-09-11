// Il selettore delle sedi deve stare dove serve, e solo li'.
//
// Perche' questo test esiste. Audit dell'11/09/2026, su richiesta del
// proprietario. La regola e' semplice: il selettore si mostra dove i dati
// della pagina CAMBIANO al cambio sede, e si nasconde dove non cambiano.
// Sbagliare in un verso o nell'altro fa danni diversi ma entrambi veri:
//
//  - Mostrarlo su una pagina che lo ignora: sembra un comando e non lo e'.
//    Era il caso di Vendite B2B (caricava tutte le vendite dell'azienda) e
//    di Prezzi concorrenti (li salvava per sede e li rileggeva tutti).
//  - Nasconderlo su una pagina che lavora sui dati di una sede: chi legge non
//    sa di quale sede siano i numeri, e non puo' cambiarla. Era il caso della
//    Previsione domanda e delle Azioni, che girano su giornaliero e chiusure.
//
// Questo test legge il Dashboard e verifica che le due liste restino
// coerenti. Non e' un test di comportamento: e' un test di configurazione, ed
// e' fatto apposta, perche' il difetto sta li'.

import { describe, it, expect } from 'vitest'
import fs from 'fs'

const dash = fs.readFileSync(new URL('../../src/Dashboard.jsx', import.meta.url), 'utf8')

function leggiSet(nome) {
  const m = dash.match(new RegExp(`const ${nome} = new Set\\(\\[([\\s\\S]*?)\\]\\)`))
  if (!m) throw new Error(`${nome} non trovato nel Dashboard`)
  // Via i commenti, poi le stringhe.
  const corpo = m[1].split('\n').filter(r => !r.trim().startsWith('//')).join('\n')
  return new Set([...corpo.matchAll(/'([^']+)'/g)].map(x => x[1]))
}

// Le viste montate: view==="xxx" && <Componente ...props... />
function vistaMontate() {
  const out = []
  for (const m of dash.matchAll(/view==="([a-z0-9-]+)"\s*&&[^\n]*?<([A-Z][A-Za-z0-9_]*)([\s\S]*?)\/>/g)) {
    out.push({ vista: m[1], componente: m[2], props: m[3] })
  }
  return out
}

// Le prop che contengono dati che cambiano da una sede all'altra.
const PROP_PER_SEDE = ['giornaliero', 'chiusure', 'magazzino', 'logRif', 'prod', 'sedeId']

const NO_SEDE_SELECTOR = leggiSet('NO_SEDE_SELECTOR')
const MONTATE = vistaMontate()

describe('Selettore sedi: dove deve esserci', () => {
  it('il Dashboard monta un numero plausibile di viste', () => {
    // Se questo salta, la regex qui sopra non sta piu' leggendo il file e
    // tutti gli altri controlli diventerebbero verdi per finta.
    expect(MONTATE.length).toBeGreaterThan(30)
  })

  it('ogni pagina che riceve dati per-sede mostra il selettore', () => {
    const colpevoli = MONTATE
      .filter(v => NO_SEDE_SELECTOR.has(v.vista))
      .filter(v => PROP_PER_SEDE.some(p => new RegExp(`\\b${p}=\\{`).test(v.props)))
      .map(v => v.vista)
      // Eccezioni vere, non dimenticanze:
      //  impostazioni  -> passa sedeId al pannello Integrazioni che incorpora,
      //                   non e' una pagina di dati
      //  confronto-sedi, trasferimenti -> mostrano tutte le sedi insieme per
      //                   loro natura, la scelta e' dentro la pagina
      //  home-dipendente -> la sede e' forzata dal turno, non si sceglie
      //  registro-attivita -> ha il suo filtro sede dentro la pagina
      .filter(v => !['impostazioni', 'confronto-sedi', 'trasferimenti', 'home-dipendente', 'registro-attivita'].includes(v))
    expect(colpevoli).toEqual([])
  })

  it('Previsione domanda e Azioni hanno il selettore: girano su dati di una sede', () => {
    expect(NO_SEDE_SELECTOR.has('previsione')).toBe(false)
    expect(NO_SEDE_SELECTOR.has('azioni')).toBe(false)
  })

  it('Integrazioni ha il selettore: le fatture importate finiscono su una sede', () => {
    expect(NO_SEDE_SELECTOR.has('integrazioni')).toBe(false)
  })

  it('Registro attivita NON ha il selettore globale: ne ha gia uno suo', () => {
    // Due comandi con lo stesso nome sulla stessa schermata, di cui uno finto.
    expect(NO_SEDE_SELECTOR.has('registro-attivita')).toBe(true)
  })

  it('il ricettario resta shared: niente selettore quando la sede e una sola', () => {
    const m = dash.match(/const SEDE_SELECTOR_MULTI_ONLY = new Set\(\[([\s\S]*?)\]\)/)
    expect(m).toBeTruthy()
    expect(m[1]).toContain("'ricettario'")
  })
})

describe('Selettore sedi: le pagine che lo ignorano', () => {
  // Le due pagine che avevano il selettore e non lo usavano. Ora filtrano per
  // sede: si controlla sul codice, perche' e' li' che il difetto torna.
  it('Vendite B2B carica filtrando per sede e si ricarica al cambio', () => {
    const src = fs.readFileSync(new URL('../../src/views/VenditeB2BView.jsx', import.meta.url), 'utf8')
    expect(src).toMatch(/loadVenditeB2B\(orgId, \{ sedeId/)
    expect(src).toMatch(/\}, \[orgId, sedeFiltro\]\)/)
  })

  it('Prezzi concorrenti filtra per sede e si ricarica al cambio', () => {
    const src = fs.readFileSync(new URL('../../src/views/CompetitorPricingView.jsx', import.meta.url), 'utf8')
    expect(src).toMatch(/sede_id\.eq\.\$\{sedeId\},sede_id\.is\.null/)
    expect(src).toMatch(/\}, \[orgId, sedeId\]\)/)
  })
})
