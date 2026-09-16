// ── Una scrittura che fallisce non deve tacere ─────────────────────────
//
// Difetto vero, 16/09/2026. Entrando in produzione con l'account del titolare,
// la prima schermata era la procedura di benvenuto — quella del primo accesso
// — a un'attività che usa Foodos da mesi.
//
// La causa prima era una migrazione mai applicata: la colonna
// `organizations.onboarding_completato_at` non esisteva. Ma il motivo per cui
// il difetto è VISSUTO DUE MESI senza che nessuno se ne accorgesse è un altro,
// e sta in `src/App.jsx`:
//
//     try {
//       await supabase.from('organizations').update({ onboarding_completato_at: ... })
//     } catch { /* fail-soft: localStorage già setato sopra */ }
//
// Il `catch` vuoto ingoiava tutto. E c'è un dettaglio in più che lo rendeva
// ancora più muto: **Supabase non lancia un'eccezione quando una query
// fallisce**, restituisce l'errore dentro `error`. Quindi quel `catch` non
// vedeva niente nemmeno quando c'era qualcosa da vedere.
//
// Il «fail-soft» era la scelta giusta — non ha senso bloccare l'utente perché
// un flag non si salva. Sbagliato era tacere.
//
// Ho passato al setaccio tutto il prodotto cercando lo stesso schema. Primo
// rilevatore: 51 punti. Era tarato male — cercava un `catch` vuoto e una
// scrittura nelle 14 righe precedenti, senza verificare che appartenessero
// allo stesso `try`: in `Haccp.jsx` attribuiva a una scrittura dei `catch`
// che stavano su `JSON.parse` e `getUser`. Abbinando `try` e `catch` contando
// le graffe: **45**, e in tutto il frontend **uno solo** nascondeva una
// scrittura di dati veri che l'utente crede riuscita. Era questo.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RADICE = join(__dirname, '..', '..')
const leggi = (...p) => readFileSync(join(RADICE, ...p), 'utf8')

// Abbina ogni `catch` vuoto al SUO `try`, e dice se dentro c'è una scrittura.
function scrittureMute(testo) {
  const CATCH_VUOTO = /\}\s*catch\s*(\([^)]*\))?\s*\{\s*(\/\*[\s\S]*?\*\/|\/\/[^\n]*)?\s*\}/g
  const SCRITTURA = /\.(insert|update|upsert|delete|rpc)\s*\(/
  const out = []
  for (const m of testo.matchAll(CATCH_VUOTO)) {
    // Dalla graffa che chiude il try, indietro fino alla sua apertura.
    let livello = 0, j = m.index
    while (j >= 0) {
      const c = testo[j]
      if (c === '}') livello++
      else if (c === '{') { livello--; if (livello === 0) break }
      j--
    }
    if (j < 0) continue
    if (!/try\s*$/.test(testo.slice(Math.max(0, j - 8), j))) continue
    const corpo = testo.slice(j, m.index)
    const s = corpo.match(SCRITTURA)
    if (s) out.push({ operazione: s[1], riga: testo.slice(0, j).split('\n').length })
  }
  return out
}

describe('il difetto: il salvataggio del benvenuto era muto', () => {
  const APP = leggi('src', 'App.jsx')

  it('il catch vuoto attorno a quella scrittura non c’è più', () => {
    expect(APP).not.toContain('} catch { /* fail-soft: localStorage già setato sopra */ }')
    expect(scrittureMute(APP)).toHaveLength(0)
  })

  it('e l’errore di Supabase viene letto, non solo intercettato', () => {
    // Supabase NON lancia: mette l'errore in `error`. Un try/catch da solo,
    // per quanto ben scritto, non avrebbe visto niente.
    expect(APP).toMatch(/const \{ error \} = await supabase\s*\n?\s*\.from\('organizations'\)|const \{ error \} = await supabase\.from\('organizations'\)/)
    expect(APP).toContain('onboarding_completato_at')
  })

  it('se fallisce si scrive nel registro, e l’utente non si blocca lo stesso', () => {
    const blocco = APP.slice(APP.indexOf('async function completaOnboarding'), APP.indexOf('async function completaOnboarding') + 2200)
    expect(blocco).toContain('logger.warn')
    expect(blocco).toContain('Benvenuto: flag non salvato sul database')
    // Il comportamento per chi usa il prodotto non cambia: si va avanti.
    expect(blocco).toContain('setOnboardingVisto(true)')
  })
})

describe('e non se ne aggiungono altri — cricchetto', () => {
  // Restano dei `catch` vuoti attorno a scritture, ma sono di tre specie
  // che vanno bene così, e il motivo va scritto o fra sei mesi qualcuno li
  // «sistema» rompendo qualcosa:
  //   · i seminatori di dati dimostrativi: se falliscono, la demo è storta,
  //     non i dati di un cliente;
  //   · la telemetria (notifiche push, conteggio aperture): non deve mai
  //     far saltare l'operazione vera dell'utente;
  //   · i registri di sincronizzazione: stessa ragione.
  const AMMESSI = [
    'src/lib/demoSeed.js', 'src/lib/demoSeedFull.js',
    'src/lib/pushNotifications.js', 'src/lib/usageTracking.js',
  ]

  function tuttiIFile(dir, acc = []) {
    for (const n of readdirSync(join(RADICE, dir))) {
      const rel = `${dir}/${n}`
      if (statSync(join(RADICE, rel)).isDirectory()) tuttiIFile(rel, acc)
      else if (/\.(js|jsx)$/.test(n)) acc.push(rel)
    }
    return acc
  }

  const sospetti = tuttiIFile('src')
    .filter(f => !AMMESSI.includes(f))
    .map(f => ({ f, mute: scrittureMute(readFileSync(join(RADICE, f), 'utf8')) }))
    .filter(x => x.mute.length)

  it('il rilevatore sa davvero trovarne una (taratura)', () => {
    // Se questo controllo non sapesse riconoscere lo schema, i test qui sotto
    // passerebbero sempre senza proteggere niente. È successo davvero, oggi,
    // con la prima versione di questo stesso rilevatore.
    const finto = `async function salva() { try { await supabase.from('x').insert({ a: 1 }) } catch {} }`
    expect(scrittureMute(finto)).toHaveLength(1)
    expect(scrittureMute(finto)[0].operazione).toBe('insert')
  })

  it('e sa NON trovarne dove non ce ne sono (taratura al contrario)', () => {
    // Il caso che il primo rilevatore sbagliava: il catch appartiene a
    // un'altra istruzione, non alla scrittura.
    const innocente = `async function salva() {
      await supabase.from('x').insert({ a: 1 })
      let chi = null
      try { chi = JSON.parse(localStorage.getItem('k')) } catch {}
    }`
    expect(scrittureMute(innocente)).toHaveLength(0)
  })

  it('fuori dalle specie ammesse non se ne aggiungono', () => {
    // Baseline 16/09/2026: 3 punti, tutti su pagine secondarie. Il numero può
    // solo scendere. Se sale, qualcuno ha appena reso muto un salvataggio.
    const elenco = sospetti.map(x => `${x.f}:${x.mute.map(m => m.riga).join(',')}`).join(' · ')
    expect(sospetti.reduce((n, x) => n + x.mute.length, 0), elenco).toBeLessThanOrEqual(3)
  })

  it('e mai in App.jsx, che è il file dove il difetto è nato', () => {
    expect(sospetti.find(x => x.f === 'src/App.jsx')).toBeUndefined()
  })
})
