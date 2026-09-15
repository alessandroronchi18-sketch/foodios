// Quando l'app si aggiorna sul telefono.
//
// Il 16/09/2026 il titolare ha scritto: «se accedo da mobile vedo tutto come
// prima». La produzione serviva il codice nuovo — verificato scaricando il
// pacchetto vero — ma il telefono mostrava ancora quello di prima.
//
// Due cause, tutte e due qui:
//
//   1. All'avvio, un aggiornamento già pronto veniva solo **proposto** con un
//      avviso, non applicato. Su un telefono, dove l'app si riapre venti volte
//      al giorno, quell'avviso resta lì per giorni.
//   2. Quando l'aggiornamento partiva, l'app diceva al service worker di
//      cancellare **tutta** la cache — compreso il magazzino dei file con
//      l'impronta, che esiste apposta per non riscaricare quello che non è
//      cambiato. Il miglioramento del giorno prima si annullava da solo.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RADICE = join(import.meta.dirname, '../..')
const leggi = (f) => readFileSync(join(RADICE, f), 'utf8')
const vive = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(r => !/^\s*(\/\/|\*)/.test(r)).join('\n')

const PWA = vive(leggi('src/lib/pwa.js'))
const SW = vive(leggi('public/sw.js'))

describe('un aggiornamento pronto si applica, non si propone soltanto', () => {
  it('all\'avvio, se si può applicare, si applica', () => {
    expect(PWA).toMatch(/if \(reg\.waiting\) \{\s*\n\s*if \(_autoUpdateConsentito\) applyUpdate\(\)/)
  })

  it('e se non si può, allora si propone', () => {
    // Chi sta lavorando non dev'essere sbalzato all'inizio della pagina.
    expect(PWA).toMatch(/else notifyUpdate\(\)/)
  })

  it('rientrando dopo mezza giornata si applica senza aspettare il controllo', () => {
    expect(PWA).toMatch(/if \(_autoUpdateConsentito && reg\.waiting\) \{ applyUpdate\(\); return \}/)
  })

  it('il freno sui controlli non vale quando si torna dopo tanto tempo', () => {
    // È esattamente il momento in cui vale la pena guardare.
    expect(PWA).toMatch(/if \(!_autoUpdateConsentito && Date\.now\(\) - _ultimoControllo < MIN_TRA_CONTROLLI_MS\) return/)
  })

  it('chi sta lavorando non viene ricaricato di colpo', () => {
    // La regola di partenza, che resta: dopo il primo minuto un
    // ricaricamento improvviso butta l'utente fuori da dove era, e sembra
    // un logout.
    expect(PWA).toMatch(/setTimeout\(\(\) => \{ _autoUpdateConsentito = false \}, 60_000\)/)
    expect(PWA).toMatch(/if \(!_autoUpdateConsentito\) \{ notifyUpdate\(\); return \}/)
  })

  it('e c\'è un freno contro i ricaricamenti a catena', () => {
    expect(PWA).toMatch(/foodos_sw_reload_ts/)
    expect(PWA).toMatch(/60_000/)
  })
})

describe('svuotare la cache non butta quello che non serve buttare', () => {
  it('il magazzino dei file con l\'impronta sopravvive', () => {
    // Un file il cui nome contiene l'impronta del contenuto non può MAI
    // essere obsoleto: se cambia, cambia il nome. Buttarlo è lavoro
    // sprecato — e sono 1,5 MB riscaricati su rete mobile.
    const blocco = SW.slice(SW.indexOf("CLEAR_CACHE"), SW.indexOf("CLEAR_CACHE") + 500)
    expect(blocco).toMatch(/keys\.filter\(\(k\) => k !== ASSET_CACHE\)/)
  })

  it('mentre la pagina e i file dal nome stabile si buttano davvero', () => {
    // Lì una copia vecchia è un problema vero.
    const blocco = SW.slice(SW.indexOf("CLEAR_CACHE"), SW.indexOf("CLEAR_CACHE") + 500)
    expect(blocco).toMatch(/caches\.delete\(k\)/)
  })

  it('e il magazzino non si svuota nemmeno all\'avvio del service worker', () => {
    expect(SW).toMatch(/\.filter\(\(k\) => k !== ASSET_CACHE && !k\.startsWith\(CACHE_VERSION\)\)/)
  })
})

describe('il controllo periodico', () => {
  it('c\'è, perché Safari da solo ricontrolla al massimo ogni 24 ore', () => {
    expect(PWA).toMatch(/SW_POLL_MS = 15 \* 60 \* 1000/)
    expect(PWA).toMatch(/setInterval\(/)
  })

  it('e c\'è anche al rientro in primo piano, perché Safari sospende il timer', () => {
    expect(PWA).toMatch(/visibilitychange/)
    expect(PWA).toMatch(/visibilityState === 'hidden'/)
  })
})
