// I due bottoni in basso a destra: assistente e feedback.
//
// Sono l'unico canale diretto fra chi usa il programma e chi lo scrive.
// L'audit del 15/09/2026 ha trovato che il più caro dei difetti non era in
// nessuno dei due, ma sotto: **il tetto di spesa dell'AI non contava niente.**

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { costruisciIstruzioni } from '../../src/components/AIAssistant.jsx'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const leggi = (...p) => readFileSync(join(RADICE, ...p), 'utf8')

const AI = leggi('src', 'components', 'AIAssistant.jsx')
const FAB = leggi('src', 'components', 'FloatingActions.jsx')
const FB = leggi('src', 'components', 'FeedbackButton.jsx')
const BUDGET = leggi('api', 'lib', 'aiBudget.js')
const APIAI = leggi('api', 'ai.js')

describe('il tetto di spesa AI adesso conta davvero', () => {
  it('l\'organizzazione si passa in modo esplicito', () => {
    // Le funzioni sul database cercavano l'azienda con
    // `where id = auth.uid()`, ma chi le chiama è il SERVER con la chiave di
    // servizio, dove auth.uid() è vuoto: l'incremento usciva senza scrivere e
    // il totale tornava sempre 0. `0 >= tetto` non è mai vero.
    //
    // Prova sul database: `ai_usage_daily` vuota con 327 organizzazioni, e
    // sette chiavi `ai:…` in `rate_limits` che dimostrano che le chiamate
    // c'erano state. Si spendeva, e il contatore restava a zero.
    expect(BUDGET).toMatch(/checkAndIncrementAiBudget\(\{ supabase, orgId,/)
    expect(BUDGET).toMatch(/ai_usage_today_total_org', \{ p_org: orgId \}/)
    expect(BUDGET).toMatch(/ai_usage_increment_org'/)
    expect(APIAI).toMatch(/orgId: profile\.organization_id/)
  })

  it('senza organizzazione non blocca, ma lo dice forte', () => {
    expect(BUDGET).toMatch(/spesa non conteggiata/)
    expect(BUDGET).toMatch(/error: 'org_mancante'/)
  })

  it('il tetto è quello deciso dal titolare: 5 $ al giorno', () => {
    const blocco = BUDGET.slice(BUDGET.indexOf('DEFAULT_BUDGETS_USD = {'), BUDGET.indexOf('}', BUDGET.indexOf('DEFAULT_BUDGETS_USD = {')))
    for (const piano of ['trial', 'base', 'pro', 'enterprise']) {
      expect(blocco, `${piano} non è a 5 $`).toMatch(new RegExp(`${piano}: 5\\.0`))
    }
  })

  it('i pacchetti comprati si consumano prima del tetto', () => {
    // La migration del 06/07 lo dichiarava già ("se org ha credit_remaining > 0
    // NON conta sul cap") ma quel codice non è mai esistito, e la funzione sul
    // database non c'era. Un cliente che paga per mille chiamate sarebbe stato
    // tagliato fuori lo stesso.
    expect(BUDGET).toMatch(/ai_credit_consuma', \{ p_org: orgId \}/)
    expect(BUDGET).toMatch(/daPacchetto: true, charged: 0/)
    const DIR = join(RADICE, 'supabase', 'migrations')
    const M = readFileSync(join(DIR, readdirSync(DIR).find(f => f.includes('ai_budget_conta_davvero'))), 'utf8')
    expect(M).toMatch(/create or replace function public\.ai_credit_consuma/)
    expect(M).toMatch(/for update skip locked/)
    // Le funzioni con l'organizzazione esplicita sono solo del server: dal
    // browser sarebbero un modo per scrivere nel contatore di un'altra azienda.
    expect(M).toMatch(/revoke execute on function public\.ai_usage_increment_org[^;]*from public, anon, authenticated/)
  })

  it('la ricerca rapida non paga più la tariffa del modello grosso', () => {
    // `feature` arrivava alla funzione ma non finiva nel corpo della richiesta:
    // il server addebitava sempre `ai_proxy` (0,012 $) anche a chi usa un
    // modello quindici volte più economico.
    expect(leggi('src', 'lib', 'aiClient.js')).toMatch(/\.\.\.\(feature \? \{ feature \} : \{\}\)/)
    expect(APIAI).toMatch(/typeof body\?\.feature === 'string' \? body\.feature\.slice\(0, 40\) : 'ai_proxy'/)
  })
})

describe('le chiamate AI lasciano una traccia', () => {
  it('ogni scrittura nel registro valorizza la colonna obbligatoria', () => {
    // `audit_log.table_name` è NOT NULL senza valore predefinito: l'inserimento
    // falliva SEMPRE, e il risultato non veniva controllato. Verificato: 9.825
    // righe in audit_log e ZERO con operazione che comincia per `ai`. Il blocco
    // "richiesta sui dati di un'altra azienda" è scritto apposta per lasciare
    // una prova, e non ne lasciava nessuna.
    for (const f of ['ai.js', 'login-guard.js', 'audit-export.js']) {
      const s = leggi('api', f)
      const inserimenti = s.split("from('audit_log')").slice(1)
      for (const i of inserimenti) {
        expect(i.slice(0, 400), `${f}: un inserimento senza table_name`).toMatch(/table_name:/)
      }
    }
  })
})

describe('la chat non smette di ascoltare dopo dieci domande', () => {
  it('si tengono gli ULTIMI messaggi, non i primi', () => {
    // Con `slice(0, 20)`, superata la ventesima riga la domanda appena scritta
    // veniva tagliata via e l'ultimo messaggio rimasto era una risposta
    // dell'assistente: Claude proseguiva la vecchia risposta invece di
    // rispondere. Sembrava impazzito.
    expect(APIAI).toMatch(/\.slice\(-MAX_MESSAGES\)/)
    expect(APIAI).not.toMatch(/\.slice\(0, MAX_MESSAGES\)/)
  })
})

describe('l\'assistente non racconta al dipendente le pagine che gli sono chiuse', () => {
  it('le istruzioni si costruiscono su chi sta chiedendo', () => {
    const tutte = costruisciIstruzioni()
    expect(tutte).toContain('Profitti (P&L)')
    expect(tutte).toContain('Personale & stipendi')

    const dipendente = costruisciIstruzioni(new Set(['giornaliero', 'chiusura', 'magazzino']))
    expect(dipendente).toContain('Produzione')
    expect(dipendente).not.toContain('Profitti')
    expect(dipendente).not.toContain('Personale')
    expect(dipendente).not.toContain('Costi aziendali')
  })

  it('e dice al modello di non nominare altro', () => {
    expect(costruisciIstruzioni()).toMatch(/Non nominare nessun'altra pagina/)
  })

  it('il Dashboard e App gli passano le pagine permesse', () => {
    expect(AI).toMatch(/vistePermesse = null/)
    expect(AI).toMatch(/costruisciIstruzioni\(vistePermesse\)/)
    expect(FAB).toMatch(/vistePermesse=\{vistePermesse\}/)
    expect(leggi('src', 'App.jsx')).toMatch(/vistePermesse=\{auth\.profile\?\.ruolo === 'dipendente' \? DIPENDENTE_VIEWS : null\}/)
  })
})

describe('l\'assistente non manda su pagine che non esistono', () => {
  const t = costruisciIstruzioni()

  it('niente allergeni e niente menù: sono spenti dal 09/09', () => {
    expect(t).not.toMatch(/allergeni/i)
    expect(t).not.toMatch(/\bMenù\b/)
    expect(t).not.toMatch(/haccp/i)
  })

  it('e i nomi sono quelli veri del menu, non approssimazioni', () => {
    // Prima diceva "Food Cost" dove c'è "Food Cost simulatore", "P&L" dove c'è
    // "Profitti (P&L)", "Personale" dove c'è "Personale & stipendi". L'utente
    // cercava una voce che non c'era e pensava che il programma fosse rotto.
    for (const nome of ['Food Cost simulatore', 'Profitti (P&L)', 'Personale & stipendi',
                        'Scadenzario fatture', 'Previsione domanda', 'Storico produzione']) {
      expect(t, `manca "${nome}"`).toContain(nome)
    }
  })
})

describe('l\'assistente non inventa numeri', () => {
  it('gli si dice che i dati non ce li ha', () => {
    // Non li riceve davvero — nella chiamata partono solo le istruzioni e
    // quello che scrive l'utente — ma senza un divieto esplicito, a «quanto ho
    // incassato ieri?» risponderebbe con una cifra di esempio che sembra un
    // dato. Il fratello maggiore (Foodos Brain) questa riga ce l'ha già.
    const t = costruisciIstruzioni()
    expect(t).toMatch(/NON HAI ACCESSO AI DATI/)
    expect(t).toMatch(/\*\*non inventarlo\*\*/)
  })

  it('e come deve scrivere: niente emoji, numeri all\'italiana, euro dopo', () => {
    const t = costruisciIstruzioni()
    expect(t).toMatch(/niente emoji, mai/)
    expect(t).toMatch(/1\.477, non 1,477/)
    expect(t).toMatch(/1\.477 €, non € 1\.477/)
    expect(t).toMatch(/niente tabelle/)
    // E non spinge più verso il tono da AI.
    expect(t).not.toMatch(/Usa elenchi puntati quando aiutano/)
    expect(t).toMatch(/Mai "Certamente!"/)
  })
})

describe('il feedback dice da dove arriva', () => {
  it('la pagina corrente viene pubblicata e letta', () => {
    // `<FloatingActions />` era montato senza la vista: ogni segnalazione
    // "questa cosa non funziona" arrivava senza sapere in quale schermata
    // fosse l'utente. Su un canale che serve a capire i guasti è il campo più
    // importante.
    expect(leggi('src', 'Dashboard.jsx')).toMatch(/impostaVistaCorrente\(vista\)/)
    expect(FAB).toMatch(/iscrivitiVistaCorrente\(setViewCorrente\)/)
    expect(FAB).toMatch(/viewCorrente=\{viewCorrente\}/)
  })
})

describe('tastiera, contrasto e sovrapposizioni', () => {
  it('Esc chiude tutti e tre', () => {
    for (const [nome, s] of [['menu', FAB], ['assistente', AI], ['feedback', FB]]) {
      expect(s, `${nome}: Esc non chiude`).toMatch(/e\.key === 'Escape'/)
    }
  })

  it('i due bottoncini nascosti non si raggiungono col Tab', () => {
    // Da chiusi restavano nel DOM con `opacity: 0` e `pointerEvents: none`:
    // invisibili al mouse ma non alla tastiera. Si tabulava su un bottone che
    // non si vede e premendo Invio si apriva.
    expect(FAB).toMatch(/tabIndex=\{expanded \? 0 : -1\}/)
    expect(FAB).toMatch(/visibility: expanded \? 'visible' : 'hidden'/)
  })

  it('i bottoni non restano sopra ai modali', () => {
    // 1003 scritto a mano li teneva sopra la ricerca rapida, la finestra di
    // upgrade e persino il modale del feedback stesso: cliccabili sopra il velo.
    expect(FAB).toMatch(/zIndex: z\.fab/)
    expect(FAB).toMatch(/display: \(aiOpen \|\| feedbackOpen\) \? 'none' : 'block'/)
    expect(AI).toMatch(/zIndex: z\.modal/)
    expect(FB).toMatch(/zIndex: z\.modal/)
    for (const s of [FAB, AI, FB]) expect(s).not.toMatch(/zIndex: 100[0-9]/)
  })

  it('e non finiscono sotto la barra di sistema dell\'iPhone', () => {
    expect(FAB).toMatch(/env\(safe-area-inset-bottom/)
  })

  it('il modale del feedback si annuncia come tale', () => {
    expect(FB).toMatch(/role="dialog" aria-modal="true" aria-labelledby="fb-titolo"/)
    // La × era un carattere senza etichetta: uno screen reader leggeva
    // "moltiplicato".
    expect(FB).toMatch(/aria-label="Chiudi"/)
    expect(FB).not.toMatch(/\}\}>×<\/button>/)
  })

  it('i colori arrivano dai token, non scritti a mano', () => {
    // `#8B95A7` era il valore che theme.js dichiara di aver abbandonato perché
    // sotto la soglia di contrasto WCAG AA.
    const viveAI = AI.split('\n').filter(r => !r.trim().startsWith('//')).join('\n')
    expect(viveAI).not.toMatch(/#8B95A7/)
    const viveFAB = FAB.split('\n').filter(r => !r.trim().startsWith('//')).join('\n')
    expect(viveFAB).not.toMatch(/#4A0810/)
    expect(AI).toMatch(/color as T/)
    expect(FAB).toMatch(/color as T/)
  })
})

describe('gli errori si leggono in italiano', () => {
  it('il feedback non mostra più "Failed to fetch"', () => {
    expect(FB).toMatch(/function messaggioUmano/)
    expect(FB).toMatch(/controlla la connessione e riprova/)
    expect(FB).not.toMatch(/setErr\(e\.message\)/)
  })

  it('e non promette più che arrivano "direttamente al team"', () => {
    expect(FB).not.toMatch(/arrivano direttamente al team/)
  })

  it('l\'assistente non dichiara di essere "sempre online"', () => {
    // Era una promessa che il tetto e il limite al minuto smentiscono.
    expect(AI).not.toMatch(/Sempre online/)
  })
})
