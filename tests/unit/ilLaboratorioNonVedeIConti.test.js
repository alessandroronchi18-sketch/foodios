// Quello che arriva in laboratorio non porta i conti, e «sospeso» vuol dire
// sospeso.
//
// Due difetti trovati il 16/09/2026 leggendo il database di produzione in sola
// lettura, tutti e due nella stessa famiglia: non si entra da fuori, si resta
// dentro più di quanto si dovrebbe.
//
// 1. Il dipendente non può leggere il ricettario né lo storico di produzione
//    (stanno in `is_chiave_sensibile`): li riceve ripuliti da due funzioni,
//    `fos_ricettario_dip()` e `fos_giornaliero_dip()`. Ripulivano per elenco
//    di cose da togliere, e l'elenco era rimasto indietro: usciva `foodCost1`
//    — il food cost della ricetta — e usciva `ricavoTot`, l'incasso della
//    giornata. Sul database di produzione: 96 ricette su 96 portavano fuori il
//    food cost (58 Mara dei Boschi, 23 Pasticceria Mara 1, 15 Gelateria Demo).
//    Provato per davvero, impersonando un profilo in sola lettura: la SACHER
//    di Mara dei Boschi arrivava con `foodCost1: 1.04`.
//
//    Perché la suite era verde: `tests/08-accessi-dipendenti.spec.js`
//    controlla che non escano `ingredienti` e `ingredienti_costi`, cioè le due
//    cose che la funzione toglieva davvero. Misurava il codice, non la regola.
//
// 2. Il pulsante «Sospendi» in Personale → Laboratori mette `approvato =
//    false`. Ogni regola di riga passa da `get_user_org_id()`, che chiede
//    `coalesce(approvato, true) = true`: per il database il sospeso è fuori.
//    Quattro funzioni SECURITY DEFINER invece si leggevano l'azienda da sole,
//    con `select organization_id from profiles where id = auth.uid()`, senza
//    guardare `approvato`. Il token di chi è appena stato sospeso resta valido,
//    quindi il tablet del laboratorio continuava a poter scrivere la spesa AI
//    dell'azienda (`ai_usage_increment`, tetto 5,00 $ al giorno e il costo lo
//    passa chi chiama: una chiamata sola spegne l'assistente fino a domani),
//    archiviare i suggerimenti del titolare, segnare come letto il riepilogo
//    del mattino e gonfiare le statistiche.
//
// La prova d'attacco sta in `tests/12-sicurezza-chiave-pubblica.spec.js`, che
// crea un'organizzazione finta, sospende un dipendente vero e prova a farlo
// davvero. Questo file guarda una cosa diversa: che la REGOLA resti scritta
// nelle migrazioni, perché un database si può ricreare da zero e se la
// migrazione sparisce il buco torna.

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DIR = join(RADICE, 'supabase', 'migrations')
// Le migrazioni si applicano in ordine di nome: l'ultima definizione vince.
const FILE = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort()

// Estrae il corpo di una funzione da un file di migrazione. I delimitatori
// cambiano da file a file ($$ nelle vecchie, $function$ nelle nuove): si legge
// quello che c'è invece di darlo per scontato.
function corpoIn(file, nomeFunzione) {
  const sql = readFileSync(join(DIR, file), 'utf8')
  const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${nomeFunzione}\\s*\\(`, 'i')
  const inizio = sql.search(re)
  if (inizio === -1) return null
  const resto = sql.slice(inizio)
  const tag = resto.match(/\bas\s+(\$[a-z_]*\$)/i)
  if (!tag) return null
  const dopoApertura = resto.indexOf(tag[1]) + tag[1].length
  const chiusura = resto.indexOf(tag[1], dopoApertura)
  const corpo = resto.slice(dopoApertura, chiusura === -1 ? undefined : chiusura)
  // Via i commenti prima di leggere: un apostrofo italiano dentro un commento
  // («dov'è andato») sballa il conteggio degli apici e fa leggere un elenco
  // per un altro. Ci è successo mentre si scriveva questo file, e per un
  // minuto il test ha detto che «data» non usciva quando invece usciva.
  return corpo.replace(/--[^\n]*/g, '')
}

function definizioni(nomeFunzione) {
  return FILE.map(f => ({ file: f, corpo: corpoIn(f, nomeFunzione) })).filter(d => d.corpo)
}

function ultimaDefinizione(nomeFunzione) {
  const tutte = definizioni(nomeFunzione)
  if (!tutte.length) throw new Error(`nessuna definizione di ${nomeFunzione} nelle migrazioni`)
  return tutte[tutte.length - 1]
}

// Il campo `campo` esce da questa funzione?
//
// Due modi di scrivere un filtro, e li legge tutti e due:
//  - a sottrazione (il vecchio):  `elem - 'fcTot' - 'ingredientiUsati'`
//    esce tutto quello che non è stato sottratto;
//  - a elenco di ammessi (il nuovo): `where c.key in ('nome', 'prezzo', …)`
//    esce solo quello che è nell'elenco.
function esce(corpo, campo) {
  const elenco = corpo.match(/\bkey\s+in\s*\(([\s\S]*?)\)/i)
  if (elenco) {
    const ammessi = (elenco[1].match(/'[^']+'/g) || []).map(s => s.slice(1, -1))
    return ammessi.includes(campo)
  }
  return !new RegExp(`-\\s*'${campo}'`).test(corpo)
}

describe('il righello: le migrazioni si leggono davvero', () => {
  it('trova le due funzioni che il laboratorio usa, vecchie e nuove', () => {
    // Se il lettore qui sopra si rompe (un file rinominato, un delimitatore
    // diverso), tutti i controlli sotto passerebbero a vuoto.
    expect(definizioni('fos_ricettario_dip').length,
      'devono esserci almeno due definizioni: quella di prima e la correzione').toBeGreaterThan(1)
    expect(definizioni('fos_giornaliero_dip').length).toBeGreaterThan(1)
    expect(ultimaDefinizione('fos_ricettario_dip').corpo).toContain('ricette')
  })

  it('e sa riconoscere il difetto quando c\'è: sulla versione del 07/06/2026 lo trova', () => {
    // La verifica del righello, sul caso vero e non su uno finto: la prima
    // definizione di queste due funzioni il difetto ce l'aveva, e il controllo
    // qui sotto lo deve vedere.
    const ricVecchio = definizioni('fos_ricettario_dip')[0]
    const giorVecchio = definizioni('fos_giornaliero_dip')[0]
    expect(esce(ricVecchio.corpo, 'foodCost1'),
      `il food cost usciva dalla versione in ${ricVecchio.file}`).toBe(true)
    expect(esce(giorVecchio.corpo, 'ricavoTot'),
      `l'incasso usciva dalla versione in ${giorVecchio.file}`).toBe(true)
  })
})

describe('il ricettario che arriva in laboratorio', () => {
  const { corpo } = ultimaDefinizione('fos_ricettario_dip')

  it('non porta fuori il food cost', () => {
    expect(esce(corpo, 'foodCost1'), 'il food cost della ricetta è del titolare').toBe(false)
  })

  it('non porta fuori ingredienti e quantità', () => {
    // Quello che c'era intorno: la parte che già funzionava deve continuare a
    // funzionare. È la ricetta vera, il valore dell'azienda.
    expect(esce(corpo, 'ingredienti')).toBe(false)
    expect(esce(corpo, 'ingredienti_semilavorati')).toBe(false)
    expect(corpo).not.toContain('ingredienti_costi')
  })

  it('porta fuori quello che serve per lavorare e per vendere al banco', () => {
    // Il controllo opposto, che vale quanto gli altri: se la pulizia svuota la
    // ricetta, il laboratorio non sa più cosa produrre. Il prezzo resta perché
    // è scritto sul cartellino in vetrina e le schermate del dipendente lo
    // usano (REGOLE[nome] in Dashboard.jsx).
    for (const campo of ['nome', 'prezzo', 'numStampi', 'totImpasto1', 'unita', 'allergeni']) {
      expect(esce(corpo, campo), `«${campo}» serve in laboratorio e deve passare`).toBe(true)
    }
  })
})

describe('lo storico di produzione che arriva in laboratorio', () => {
  const { corpo } = ultimaDefinizione('fos_giornaliero_dip')

  it('non porta fuori i soldi della giornata', () => {
    expect(esce(corpo, 'ricavoTot'), 'l\'incasso della giornata è del titolare').toBe(false)
    expect(esce(corpo, 'fcTot')).toBe(false)
    expect(esce(corpo, 'ingredientiUsati')).toBe(false)
  })

  it('porta fuori cosa si è prodotto e quando', () => {
    for (const campo of ['data', 'ricette', 'prodotti', 'note']) {
      expect(esce(corpo, campo), `«${campo}» serve in laboratorio e deve passare`).toBe(true)
    }
  })
})

describe('«sospeso» vuol dire sospeso anche per le funzioni che saltano la RLS', () => {
  // Una sola definizione di «chi è dentro». Se una funzione se la riscrive da
  // sola, prima o poi le due si contraddicono — ed è esattamente quello che è
  // successo qui e, lo stesso giorno, in `api/lib/auth.js`.
  const QUATTRO = ['ai_usage_increment', 'ai_usage_today_total', 'track_view_open', 'brief_mark_opened', 'suggestion_set_state']

  it('il righello: la versione di prima leggeva i profili da sola', () => {
    for (const nome of QUATTRO) {
      const prima = definizioni(nome)[0]
      expect(prima.corpo.replace(/\s+/g, ' '),
        `${nome} in ${prima.file} doveva leggere i profili da solo`).toMatch(/from public\.profiles/i)
    }
  })

  it('adesso chiedono l\'azienda a get_user_org_id(), che guarda l\'approvazione', () => {
    for (const nome of QUATTRO) {
      const { corpo, file } = ultimaDefinizione(nome)
      const piatto = corpo.replace(/\s+/g, ' ')
      expect(piatto, `${nome} (${file}) deve passare da get_user_org_id()`).toMatch(/get_user_org_id\(\)/)
      expect(piatto, `${nome} (${file}) non deve più leggersi i profili da solo`).not.toMatch(/from public\.profiles/i)
    }
  })
})

describe('le due funzioni AI che nessuno chiama non restano a portata di browser', () => {
  // Si cercano le revoche in TUTTE le migrazioni, non nel file che le ha
  // introdotte: un giorno quel file verrà rinominato o accorpato, e il test
  // deve continuare a difendere la regola invece del nome di un file.
  const righeDiTutte = FILE.flatMap(f => readFileSync(join(DIR, f), 'utf8').split('\n'))

  it('a `ai_usage_increment` e `ai_usage_today_total` è tolto il permesso', () => {
    // Il costo lo passa chi chiama e il tetto è 5,00 $ al giorno per azienda:
    // da lì si spegne l'assistente di un cliente con una richiesta sola.
    for (const nome of ['ai_usage_increment', 'ai_usage_today_total']) {
      const revoche = righeDiTutte.filter(r => r.includes('revoke execute') && r.includes(`public.${nome}(`))
      expect(revoche.length, `manca la revoca su ${nome}`).toBeGreaterThan(0)
      expect(revoche.join(' '), `${nome} deve essere tolta ad anon e a authenticated`).toMatch(/anon/)
      expect(revoche.join(' ')).toMatch(/authenticated/)
    }
  })

  it('e infatti il prodotto non le chiama da nessuna parte', () => {
    // La ragione per cui togliere il permesso non rompe niente: il server usa
    // le versioni `_org`, che sono di service_role. Se un giorno qualcuno
    // rimettesse una chiamata dal browser, questo test glielo dice subito
    // invece di lasciargliela trovare come «permission denied» in produzione.
    const daControllare = []
    const scendi = (dir) => {
      for (const voce of readdirSync(dir, { withFileTypes: true })) {
        if (voce.name === 'node_modules' || voce.name.startsWith('.')) continue
        const p = join(dir, voce.name)
        if (voce.isDirectory()) scendi(p)
        else if (/\.(js|jsx)$/.test(voce.name)) daControllare.push(p)
      }
    }
    scendi(join(RADICE, 'src'))
    const colpevoli = daControllare.filter(p => {
      const testo = readFileSync(p, 'utf8')
      return /rpc\(\s*['"]ai_usage_(increment|today_total)['"]/.test(testo)
    })
    expect(colpevoli, 'nessuna pagina deve chiamare le due funzioni AI di prima').toEqual([])
  })
})
