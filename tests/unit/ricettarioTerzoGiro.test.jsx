// @vitest-environment happy-dom
//
// ── Il Ricettario, terzo giro di correzioni ───────────────────────────────
//
// Dieci richieste del titolare del 17/09/2026, tutte nate guardando la pagina
// vera con i suoi 58 prodotti. Quelle che questo file protegge:
//
//  · la tessera «Semilavorati» a destra non serviva — i semilavorati hanno
//    una scheda tutta loro — ed è diventata «Da completare», cioè quante
//    ricette non si riescono ancora a valutare;
//  · le quattro tessere dei numeri vanno a quadrato, non in fila;
//  · via la riga grigia che ripeteva costo e ricavo già scritti nelle
//    tessere a venti centimetri di distanza;
//  · gli allergeni dietro un pulsante, non quattordici etichette colorate
//    aperte sotto ogni riga;
//  · nella vista a riquadri il nome in grassetto e nel bordeaux del marchio;
//  · i nomi degli ingredienti con la prima maiuscola e il resto minuscolo.
//
// E un difetto trovato per strada, della stessa famiglia di quelli già
// corretti: nei riquadri, sotto ogni nome, c'era scritto «? pz · 0,00 €».
// Per un gusto di gelateria quel prezzo non esiste — vive sui formati di
// vendita — e zero euro scritto accanto a un prodotto non è un dato che
// manca, è un dato falso.
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RicettarioView from '../../src/views/RicettarioView.jsx'
import { formatNome } from '../../src/views/_shared.jsx'

const ricettario = {
  ingredienti_costi: { PANNA: { prezzoKg: 4.2 }, ZUCCHERO: { prezzoKg: 1.1 } },
  ricette: {
    'FIOR DI LATTE': {
      nome: 'FIOR DI LATTE', tipo: 'gusto', unita: 1, prezzo: 0,
      categoria: 'Gusto', allergeni: ['latte', 'uova'],
      ingredienti: [
        { nome: 'PANNA', qty1stampo: 300 },
        { nome: 'ZUCCHERO', qty1stampo: 180 },
      ],
    },
  },
}

/** Apre la scheda del gusto, come fa chi clicca sulla barra nell'elenco.
 *  Nell'elenco ogni scheda parte chiusa e mostra solo nome, avvisi e un
 *  numero: tessere e allergeni vivono nella scheda aperta. */
function apriGusto(utils) {
  const barra = utils.getByRole('button', { name: /FIOR DI LATTE/i })
  fireEvent.click(barra)
  return utils
}

function apri() {
  return render(
    <RicettarioView
      ricettario={ricettario}
      onUpdateRegola={() => {}}
      onUpload={() => {}}
      onEditRicetta={() => {}}
      onNuovaRicetta={() => {}}
      orgId="org-1"
      sedi={[]}
      sedeAttiva={null}
      notify={() => {}}
      metodoProduzione="stampi"
    />
  )
}

describe('La tessera che contava i semilavorati è diventata utile', () => {
  it('non conta più i semilavorati: hanno una scheda tutta loro', () => {
    apri()
    // Se tornasse, tornerebbe come etichetta di una tessera in cima.
    const etichette = screen.queryAllByText('Semilavorati')
    expect(etichette.length).toBe(0)
  })

  it('al suo posto dice quante ricette non si possono ancora valutare', () => {
    apri()
    expect(screen.getByText('Da completare')).toBeTruthy()
  })
})

describe('Gli allergeni stanno dietro un pulsante', () => {
  it('chiusi non si vedono', () => {
    apriGusto(apri())
    expect(screen.queryByText('Latte')).toBeNull()
  })

  it('il pulsante dice quanti sono e li apre', () => {
    apriGusto(apri())
    const bottone = screen.getByRole('button', { name: /allergeni/i })
    expect(bottone.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(bottone)
    expect(bottone.getAttribute('aria-expanded')).toBe('true')
  })
})

describe('I numeri non stanno più nell’intestazione', () => {
  // 18/09/2026. Stamattina queste quattro tessere erano state messe a
  // quadrato, su richiesta del titolare. Qualche ora dopo, guardandole nella
  // pagina vera: «i dati ricavo / kg, margine, margine % ecc non li si può
  // inserire in dettaglio? … anzi i dati sono già presenti in conto al kg,
  // bene tieni quelli e togli le quattro box».
  //
  // Controllato prima di toglierle, ed era esatto: il pannello «Conto al kg»
  // dentro Dettaglio mostra Ricavo/kg, Food cost/kg, Margine/kg e Margine %.
  // Erano gli stessi quattro numeri scritti due volte nella stessa scheda.
  it('l’intestazione non ha più la griglia delle tessere', () => {
    const { container } = apriGusto(apri())
    const griglia = [...container.querySelectorAll('div')]
      .find(el => (el.style.gridTemplateColumns || '').includes('minmax(86px'))
    expect(griglia).toBeUndefined()
  })

  it('il pannello «Conto al kg» esiste ed è dove sono finiti', () => {
    const utils = apriGusto(apri())
    fireEvent.click(utils.getByRole('button', { name: /dettaglio/i }))
    fireEvent.click(utils.getByRole('button', { name: /conto al kg/i }))
    // Questo gusto di prova non ha un formato vendita configurato, quindi il
    // pannello mostra la sua seconda faccia: il costo al kg e l'istruzione su
    // dove sistemare il resto. È il caso vero di Mara — i formati li ha solo
    // per alcune categorie — ed è giusto che il test lo copra.
    expect(utils.container.textContent).toContain('Food cost / kg')
  })

  it('i quattro numeri sono scritti nel pannello, non solo promessi', () => {
    // Quando il formato vendita c'è, il pannello mostra tutti e quattro. Il
    // dato di prova non può crearlo senza tirarsi dietro mezzo prodotto, ma
    // che il pannello li contenga si può verificare sul codice: è la ragione
    // per cui le tessere in cima si sono potute togliere.
    const fs = require('node:fs')
    const sorgente = fs.readFileSync('src/views/RicettarioView.jsx', 'utf8')
    const pannello = sorgente.slice(sorgente.indexOf("pannello === 'contoKg'"))
      .slice(0, 2500)
    for (const etichetta of ['Ricavo / kg', 'Food cost / kg', 'Margine / kg', 'Margine %']) {
      expect(pannello, `manca ${etichetta} nel pannello Conto al kg`).toContain(etichetta)
    }
  })
})

describe('Le azioni stanno in un quadrato', () => {
  it('due colonne, non una fila che va a capo come capita', () => {
    const { container } = apriGusto(apri())
    const quadrato = [...container.querySelectorAll('div')]
      .find(el => el.style.gridTemplateColumns === '1fr 1fr'
        && el.textContent.includes('PDF') && el.textContent.includes('Dettaglio'))
    expect(quadrato, 'il quadrato dei pulsanti non si trova').toBeTruthy()
  })

  it('i pulsanti sono scesi a 30px sul computer', () => {
    const { container } = apriGusto(apri())
    const pdf = [...container.querySelectorAll('button')].find(b => b.textContent.includes('PDF'))
    expect(pdf.style.height).toBe('30px')
  })

  it('«Riduci» sta fuori dal quadrato: non è un’azione sulla ricetta', () => {
    const { container } = apriGusto(apri())
    const riduci = container.querySelector('button[aria-label="Riduci scheda"]')
    expect(riduci).toBeTruthy()
    const quadrato = [...container.querySelectorAll('div')]
      .find(el => el.style.gridTemplateColumns === '1fr 1fr' && el.textContent.includes('PDF'))
    expect(quadrato.contains(riduci)).toBe(false)
  })
})

describe('Niente numeri ripetuti a venti centimetri di distanza', () => {
  it('sotto il nome non si ripete «costo … /kg»', () => {
    const { container } = apriGusto(apri())
    // La riga grigia diceva «Gusto · costo 2,39 €/kg · ricavo medio …», e le
    // stesse due cifre erano nelle tessere lì accanto.
    expect(container.textContent).not.toMatch(/Gusto · costo/)
  })
})

describe('I nomi degli ingredienti si leggono, non si urlano', () => {
  it('prima lettera maiuscola, resto minuscolo', () => {
    expect(formatNome('ZUCCHERO')).toBe('Zucchero')
    expect(formatNome('zucchero_canna')).toBe('Zucchero canna')
    expect(formatNome('PASTA NOCCIOLA')).toBe('Pasta nocciola')
  })

  it('regge il vuoto e il nulla senza rompersi', () => {
    expect(formatNome('')).toBe('')
    expect(formatNome(null)).toBe('')
    expect(formatNome(undefined)).toBe('')
  })

  it('lo usano tutt’e due le pagine, non una sola', async () => {
    const fs = await import('node:fs')
    for (const f of ['src/views/RicettarioView.jsx', 'src/views/NuovaRicettaView.jsx']) {
      expect(fs.readFileSync(f, 'utf8'), f).toMatch(/formatNome/)
    }
  })
})

describe('Il pulsante che riscrive tutto non è il più invitante', () => {
  it('«Nuovo gusto» è quello pieno, «Aggiorna» quello discreto', async () => {
    const fs = await import('node:fs')
    const s = fs.readFileSync('src/views/RicettarioView.jsx', 'utf8')
    const nuova = s.slice(s.indexOf('const nuovaBtn'), s.indexOf('const nuovaBtn') + 700)
    // Si taglia dove il blocco finisce davvero: piu' in la' comincia
    // `nuovaBtn`, che il bordeaux pieno ce l'ha per scelta.
    const aggiorna = s.slice(s.indexOf('const aggiornaBtn'), s.indexOf('const nuovaBtn'))
    expect(nuova).toContain('T.brandGradient')
    // «Aggiorna ricettario» apre un Excel e riscrive tutta la raccolta:
    // il colore pieno è una promessa, e non va messo lì.
    expect(aggiorna.slice(aggiorna.indexOf('<label'))).not.toContain('T.brandGradient')
  })
})

describe('La barra che si scorre è stretta davvero', () => {
  it('la riga chiusa ha il bordo a 8, non a 14', () => {
    const { container } = apri()
    const barra = container.querySelector('[role="button"].fos-tile')
    expect(barra, 'la barra chiusa del gusto non si trova').toBeTruthy()
    expect(barra.style.padding).toMatch(/^8px/)
  })

  it('resta premibile col dito: almeno 44px', () => {
    const { container } = apri()
    const barra = container.querySelector('[role="button"].fos-tile')
    expect(barra.style.minHeight).toBe('44px')
  })

  it('il nome sta in cima, non in mezzo a due righe di servizio', () => {
    const { container } = apri()
    const barra = container.querySelector('[role="button"].fos-tile')
    const colonna = barra.querySelector('div')
    // Il primo figlio della colonna di sinistra dev'essere il nome: è la sola
    // cosa che si cerca scorrendo cinquantotto gusti.
    expect(colonna.firstElementChild.textContent).toContain('FIOR DI LATTE')
  })
})

describe('La barra chiusa non ripete il ricavo', () => {
  it('sotto il nome non c’è più «Ricavo / kg: …», ma la barra c’è ancora', () => {
    const { container } = apri()
    // 18/09/2026: «togli la scritta grigia ricavo / kg : 28,91 nei gusti».
    // Lo stesso numero era già in grande sulla destra della stessa barra.
    //
    // 18/09, secondo giro: questo test era scritto solo in negativo, e un
    // controllo solo in negativo passa anche quando è sparito tutto — barra
    // compresa. Ora prima si verifica che la barra esista e dica quello che
    // deve dire, e POI che non ripeta il ricavo.
    const barra = container.querySelector('[role="button"].fos-tile')
    expect(barra, 'la barra del gusto non esiste più').toBeTruthy()
    expect(barra.textContent).toContain('FIOR DI LATTE')
    expect(barra.textContent).toContain('Costo / kg')
    expect(barra.textContent).not.toMatch(/Ricavo \/ kg:/)
  })
})

describe('I semilavorati vivono in una scheda sola', () => {
  // 18/09/2026: «in ricettario nella sezione gusti in fondo ci sono i
  // semilavorati, toglili da lì e lasciali nella sezione semilavorati».
  //
  // Era l'intera pagina «Semilavorati» ricopiata in fondo a questa, sotto
  // l'elenco dei gusti — e la scheda «Semilavorati» è quella di fianco. Due
  // elenchi della stessa cosa, e chi scorreva i gusti per arrivare in fondo
  // trovava dodici basi che non stava cercando.
  const conSemilavorato = {
    ingredienti_costi: { PANNA: { prezzoKg: 4.2 } },
    ricette: {
      ...ricettario.ricette,
      'BASE BIANCA': {
        nome: 'BASE BIANCA', tipo: 'semilavorato', unita: 0, prezzo: 0,
        ingredienti: [{ nome: 'PANNA', qty1stampo: 400 }],
      },
    },
  }

  function apriConBase() {
    return render(
      <RicettarioView ricettario={conSemilavorato} onUpdateRegola={() => {}} onUpload={() => {}}
        onEditRicetta={() => {}} onNuovaRicetta={() => {}} orgId="org-1" sedi={[]}
        sedeAttiva={null} notify={() => {}} metodoProduzione="stampi" />
    )
  }

  it('la scheda della base non compare in fondo ai gusti', () => {
    const { container } = apriConBase()
    expect(container.textContent).not.toContain('BASE BIANCA')
  })

  it('non c’è più l’intestazione «Impasti, creme e basi interne»', () => {
    const { container } = apriConBase()
    expect(container.textContent).not.toContain('Impasti, creme e basi interne')
  })

  it('il conto resta, ma come rimando alla scheda accanto', () => {
    const { container } = apriConBase()
    // L'informazione non si perde: si dice dove sono, invece di mostrarle qui.
    expect(container.textContent).toMatch(/1 semilavorato nella scheda accanto/)
  })
})
