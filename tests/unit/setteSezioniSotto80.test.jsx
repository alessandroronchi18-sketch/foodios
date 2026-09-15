// Le sette sezioni sotto l'80, riviste il 14/09/2026 (notte).
//
// Il filo comune di quello che non andava non era estetico: erano pagine che
// dicevano al cliente cose non vere. Un numero WhatsApp inventato da salvare in
// rubrica, un piano che non è più in listino, una prova gratuita raccontata
// meno di metà di quello che è, accenti scritti con l'apostrofo su pagine
// pubbliche. Questi controlli tengono ferme le correzioni.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const leggi = (...p) => readFileSync(join(RADICE, ...p), 'utf8')

describe('WhatsApp: niente numeri inventati', () => {
  const WA = leggi('src', 'views', 'WhatsAppView.jsx')

  it('il numero finto che diceva di salvare in rubrica non c\'è più', () => {
    // Era `+39 351 234 5678`, scritto nel codice come "placeholder finché non
    // attivi Twilio". La pagina diceva al cliente di salvarlo e mandargli
    // "aiuto": quel numero, se esiste, è di un'altra persona.
    expect(WA).not.toMatch(/\+39\s*351\s*234\s*5678/)
    expect(WA).not.toMatch(/351234/)
  })

  it('nessun numero di telefono è scritto a mano nella pagina', () => {
    const numeri = WA.match(/'\+\d[\d\s]{7,}'/g) || []
    expect(numeri, `numeri scritti a mano: ${numeri.join(', ')}`).toHaveLength(0)
  })

  it('il numero arriva da fuori, e finché non c\'è la pagina lo dice', () => {
    expect(WA).toMatch(/VITE_WA_NUMERO/)
    expect(WA).toMatch(/const ACCESO = WA_NUMERO\.length > 0/)
    // Le istruzioni "salva il contatto e scrivigli" esistono solo nel ramo acceso.
    const iSalva = WA.indexOf('Salva in rubrica')
    const iAltrimenti = WA.indexOf(') : (')
    expect(iSalva).toBeGreaterThan(-1)
    expect(iSalva).toBeLessThan(iAltrimenti)
  })
})

describe('i nomi dei piani sono quelli del listino', () => {
  const FILE_UI = [
    ['src', 'components', 'WhiteLabel.jsx'],
    ['src', 'components', 'ReferralPanel.jsx'],
    ['src', 'components', 'ChainBadge.jsx'],
    ['src', 'components', 'UpgradeGate.jsx'],
    ['src', 'components', 'Impostazioni.jsx'],
    ['src', 'components', 'AbbonamentoPanel.jsx'],
    ['src', 'views', 'AiHubView.jsx'],
    ['src', 'admin', 'AdminPage.jsx'],
    ['src', 'pages', 'TerminiServizio.jsx'],
  ]

  it('nessuna pagina offre ancora "piano Chain" o "piano Pro"', () => {
    // Rinominati in Bottega/Maestro/Insegna il 21/06/2026. Per tre mesi il
    // tool ha continuato a offrire al cliente piani che non esistevano più.
    for (const parti of FILE_UI) {
      const s = leggi(...parti)
      expect(s, `${parti.join('/')}: dice ancora "piano Chain"`).not.toMatch(/piano\s+Chain/)
      expect(s, `${parti.join('/')}: dice ancora "piano Pro"`).not.toMatch(/piano\s+Pro\b/)
    }
  })

  it('le etichette si leggono da PLAN_LABEL, non scritte a mano', () => {
    for (const parti of FILE_UI.filter(p => !p.includes('TerminiServizio.jsx'))) {
      const s = leggi(...parti)
      if (/Chain|Bottega|Maestro|Insegna/.test(s)) {
        expect(s, `${parti.join('/')}: usa i nomi ma non importa PLAN_LABEL`).toMatch(/PLAN_LABEL/)
      }
    }
  })

  it('i prezzi nel pannello admin arrivano dal listino, non da due numeri scritti a mano', () => {
    // Mostrava "Pro (€89)" e "Chain (€149)": nomi vecchi e prezzi che non
    // corrispondevano a PLAN_PRICE_EUR (69 / 149 / 399).
    const s = leggi('src', 'admin', 'AdminPage.jsx')
    expect(s).toMatch(/PLAN_PRICE_EUR/)
    expect(s).not.toMatch(/'Pro \(€89\)'/)
    expect(s).not.toMatch(/'Chain \(€149\)'/)
  })

  it('i termini di servizio elencano il piano in vendita, al prezzo vero', async () => {
    // 15/09/2026: in vendita c'è solo il Plus. Il contratto deve descrivere
    // quello che si vende davvero — prima elencava due piani che non
    // esistevano più (Pro €89, Chain €149) da tre mesi.
    const s = leggi('src', 'pages', 'TerminiServizio.jsx')
    const { PLAN_LABEL, PLAN_PRICE_EUR, PIANI_IN_VENDITA } = await import('../../src/lib/planAccess.js')
    for (const chiave of PIANI_IN_VENDITA) {
      expect(s, `manca il piano ${PLAN_LABEL[chiave]}`).toContain(PLAN_LABEL[chiave])
      expect(s, `prezzo sbagliato per ${PLAN_LABEL[chiave]}`).toContain(`€${PLAN_PRICE_EUR[chiave]}/mese`)
    }
    // E non deve promettere piani che non si possono comprare.
    for (const chiave of ['base', 'enterprise']) {
      if (PIANI_IN_VENDITA.includes(chiave)) continue
      expect(s, `${PLAN_LABEL[chiave]} non è in vendita: non va offerto nel contratto`)
        .not.toContain(`<strong>${PLAN_LABEL[chiave]}</strong> - €`)
    }
    expect(s).toMatch(/offre un solo piano/)
  })
})

describe('la prova gratuita dura quanto dice il database', () => {
  it('il pannello invito non parla più di una prova da 30 giorni', () => {
    // Il database dà 90 giorni; il codice invito ne AGGIUNGE 60, quindi 150.
    // Il pannello prometteva "60 giorni invece di 30": meno della metà del
    // vero, e con un numero di partenza mai esistito.
    const s = leggi('src', 'components', 'ReferralPanel.jsx')
    expect(s).not.toMatch(/invece di 30/)
    expect(s).not.toMatch(/60 giorni di trial/)
    expect(s).not.toMatch(/trial a 60 giorni/)
  })

  it('la migrazione di base conferma i 90 giorni', () => {
    const dir = join(RADICE, 'supabase', 'migrations')
    const f = readdirSync(dir).find(x => x.includes('baseline_tabelle_core'))
    expect(readFileSync(join(dir, f), 'utf8')).toMatch(/trial_ends_at[^,]*'90 days'/)
  })
})

describe('la pagina della prova scaduta non promette scadenze inventate', () => {
  const APP = leggi('src', 'App.jsx')

  it('non dice più "i tuoi dati restano al sicuro per 60 giorni"', () => {
    // Faceva capire che al sessantunesimo giorno sparissero. Non c'è niente,
    // in tutto il prodotto, che li cancelli.
    expect(APP).not.toMatch(/al sicuro per <strong>60 giorni<\/strong>/)
  })

  it('si adatta alla rotazione del telefono come il resto del tool', () => {
    // Prima `window.innerWidth` si leggeva una volta sola al primo render.
    expect(APP).not.toMatch(/const isMobile = typeof window !== 'undefined' && window\.innerWidth < 768/)
    expect(APP).toMatch(/import useIsMobile from '\.\/lib\/useIsMobile'/)
  })

  it('una sola scrittura della casella di supporto in tutto il prodotto', () => {
    // C'erano `support@` (16 volte) e `supporto@` (5): quando la casella
    // esisterà davvero, una delle due rimbalzerà.
    for (const p of [['src','App.jsx'], ['src','components','DeleteAccountModal.jsx'], ['src','pages','Contatti.jsx']]) {
      expect(leggi(...p), `${p.join('/')}: usa ancora supporto@`).not.toMatch(/supporto@foodos/)
    }
  })
})

describe('il testo parla italiano, con gli accenti', () => {
  const PUBBLICHE = ['Contatti', 'TerminiServizio', 'CookiePolicy', 'PrivacyPolicy', 'ChiSiamo', 'Rimborsi']
  const PAROLE = ['piu', 'perche', 'cosi', 'pero', 'gia', 'puo', 'cioe', 'sara', 'verra',
    'attivita', 'quantita', 'qualita', 'citta', 'unita', 'verita', 'possibilita',
    'responsabilita', 'eta', 'societa', 'novita', 'funzionalita', 'e']

  for (const pagina of PUBBLICHE) {
    it(`${pagina}: nessun accento scritto con l'apostrofo`, () => {
      const s = leggi('src', 'pages', `${pagina}.jsx`)
      for (const w of PAROLE) {
        // "parola' " seguita da un'altra parola = prosa, non una stringa di codice.
        const rx = new RegExp(`(?<![A-Za-z0-9#_])${w}' +[a-zàèéìòù]`, 'i')
        expect(s, `${pagina}: "${w}'" invece di accento`).not.toMatch(rx)
      }
    })
  }

  it('le due schede Impostazioni non scrivono più "non funzionera piu"', () => {
    const tv = leggi('src', 'components', 'ImpostazioniTv.jsx')
    const wa = leggi('src', 'components', 'WhatsAppReportPanel.jsx')
    for (const s of [tv, wa]) {
      expect(s).not.toMatch(/funzionera |sara piu|finche non|verra rimosso|non riceverai piu/)
    }
  })
})

describe('niente gergo da programmatore addosso al cliente', () => {
  it('le due schede Impostazioni non dicono cron, token, sender, sandbox, opt-in, KPI', () => {
    const paroleVietate = [
      [/\bil cron\b/i, 'cron'],
      [/rotazione token/i, 'rotazione token'],
      [/sender Twilio/i, 'sender Twilio'],
      [/in sandbox/i, 'sandbox'],
      [/opt-in/i, 'opt-in'],
      [/riepilogo KPI/i, 'KPI'],
      [/dashboard pubblica/i, 'dashboard pubblica'],
    ]
    for (const nome of ['ImpostazioniTv.jsx', 'WhatsAppReportPanel.jsx']) {
      const s = leggi('src', 'components', nome)
      for (const [rx, parola] of paroleVietate) {
        expect(s, `${nome}: mostra ancora "${parola}"`).not.toMatch(rx)
      }
    }
  })

  it('la tendina dei prefissi si chiude cliccando fuori e con Esc', () => {
    const s = leggi('src', 'components', 'WhatsAppReportPanel.jsx')
    expect(s).toMatch(/mousedown/)
    expect(s).toMatch(/e\.key === 'Escape'/)
    expect(s).toMatch(/aria-expanded=\{open\}/)
  })

  it('un numero troppo corto non si salva più in silenzio', () => {
    const s = leggi('src', 'components', 'WhatsAppReportPanel.jsx')
    expect(s).toMatch(/function numeroPlausibile/)
    expect(s).toMatch(/if \(numero && !numeroPlausibile\(numero\)\)/)
  })

  it('la TV dice da quando gira quel link', () => {
    const s = leggi('src', 'components', 'ImpostazioniTv.jsx')
    expect(s).toMatch(/setGeneratoIl/)
    expect(s).toMatch(/link creato il/)
  })

  it('gli errori della TV non spariscono più dentro un messaggio generico', () => {
    const s = leggi('src', 'components', 'ImpostazioniTv.jsx')
    expect(s).not.toMatch(/'Errore generazione link'/)
    expect(s).not.toMatch(/'Errore revoca link'/)
    expect(s).toMatch(/e\?\.message/)
  })
})

describe('Recensioni: le stelle sono un comando, non un disegno', () => {
  const REC = leggi('src', 'views', 'RecensioniView.jsx')

  it('le stelle sono icone con un\'etichetta, non il carattere ★', () => {
    expect(REC).not.toContain('★')
    expect(REC).toMatch(/<Icon name="star"/)
    expect(REC).toMatch(/role="radiogroup"/)
    expect(REC).toMatch(/aria-checked=\{n === stelle\}/)
  })

  it('quante stelle sono selezionate si legge anche scritto', () => {
    // Il valore parte da 5: chi incolla una recensione da una stella e non
    // tocca niente faceva scrivere all'AI la risposta di un cliente contento.
    expect(REC).toMatch(/stelle === 1 \? '1 stella' : `\$\{stelle\} stelle`/)
  })

  it('il prompt mandato all\'AI è scritto in italiano corretto', () => {
    // Chiedeva "italiano impeccabile" scrivendo "attivita'" e "dara'".
    expect(REC).toMatch(/consulente di customer experience per attività/)
    expect(REC).toMatch(/ti darà una recensione/)
    expect(REC).not.toMatch(/Attivita':/)
  })

  it('un testo troppo lungo viene fermato prima di partire', () => {
    expect(REC).toMatch(/const MAX_RECENSIONE = 2000/)
    expect(REC).toMatch(/if \(testo\.length > MAX_RECENSIONE\)/)
  })
})

describe('la chat di onboarding non è più un ramo morto', () => {
  it('il file non c\'è più', () => {
    // Nessuno poteva aprirla: non era importata da nessuna parte. Creava
    // l'organizzazione — cosa che oggi succede alla registrazione — e se il
    // salvataggio del profilo falliva a metà ne creava una SECONDA.
    expect(existsSync(join(RADICE, 'src', 'onboarding', 'OnboardingChat.jsx'))).toBe(false)
  })

  it('e nessuno la cerca', () => {
    const dir = join(RADICE, 'src')
    const cerca = (d) => readdirSync(d, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? cerca(join(d, e.name))
        : /\.jsx?$/.test(e.name) ? [join(d, e.name)] : [])
    for (const f of cerca(dir)) {
      expect(readFileSync(f, 'utf8'), `${f} importa ancora OnboardingChat`).not.toMatch(/OnboardingChat/)
    }
  })
})
