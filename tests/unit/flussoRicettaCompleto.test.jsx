// @vitest-environment happy-dom
//
// Il flusso che il titolare sta vivendo in questi giorni: caricare il
// ricettario.
//
// Non è un test di una funzione: è il giro intero, come lo fa lui. Creare una
// ricetta, riaprirla, cambiarle un ingrediente, cambiarle il nome, e
// cancellarla. In quel giro, il 16/09/2026, sono usciti TRE difetti in poche
// ore — la rinomina che ne lasciava due, il popup dopo la cancellazione, e il
// tipo che da gusto passava a fette. Tre difetti nello stesso giro vogliono
// dire che quel giro non era mai stato percorso per intero.
//
// Adesso lo si percorre a ogni esecuzione dei test.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false }))
vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, sload: async () => null, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))
vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u' } } }) },
    from: () => { const h = { get(_t, p) { if (p === 'then') return (r) => r({ data: [], error: null }); return () => new Proxy({}, h) } }; return new Proxy({}, h) },
    rpc: () => Promise.resolve({ data: null, error: null }),
  },
}))
vi.mock('../../src/components/ConfirmModal', () => ({ useConfirm: () => async () => true }))

// Il ricettario com'è quello vero: una gelateria, con dentro una base che ha
// il prezzo scritto a mano e dei gusti senza il campo `tipo` (arrivati da un
// file, con la categoria compilata).
const ricettarioIniziale = {
  ricette: {
    'BASE BIANCA': { nome: 'BASE BIANCA', tipo: 'interno', categoria: 'Base', ingredienti: [{ nome: 'latte intero', qty1stampo: 800 }] },
    'NOCCIOLA': { nome: 'NOCCIOLA', categoria: 'Gusto', ingredienti: [{ nome: 'BASE BIANCA', qty1stampo: 1000 }, { nome: 'pasta nocciola', qty1stampo: 100 }] },
    'PISTACCHIO': { nome: 'PISTACCHIO', categoria: 'Gusto', ingredienti: [{ nome: 'BASE BIANCA', qty1stampo: 1000 }] },
  },
  ingredienti_costi: {
    'latte intero': { costoKg: 1.35, costoG: 0.00135 },
    'pasta nocciola': { costoKg: 28, costoG: 0.028 },
    'base bianca': { costoKg: 2.31, costoG: 0.00231 },
  },
}

let NuovaRicettaView
beforeEach(async () => {
  vi.resetModules()
  NuovaRicettaView = (await import('../../src/views/NuovaRicettaView')).default
})

// Monta la scheda con un ricettario che si aggiorna davvero a ogni
// salvataggio: è quello che rende il giro un giro, e non tre prove separate.
function montaScheda({ iniziale = ricettarioIniziale, apri = null } = {}) {
  const stato = { ricettario: JSON.parse(JSON.stringify(iniziale)), salvataggi: 0 }
  function Contenitore() {
    const [ric, setRic] = React.useState(stato.ricettario)
    const onSave = async (nuovo) => { stato.salvataggi++; stato.ricettario = nuovo; setRic(nuovo) }
    // `editingRicetta` è la strada vera: è quello che passa il Dashboard
    // quando si tocca una ricetta nel Ricettario.
    return <NuovaRicettaView ricettario={ric} onSave={onSave} notify={() => {}}
      tipoAttivita="gelateria" editingRicetta={apri} onEditConsumed={() => {}} />
  }
  const v = render(<Contenitore />)
  return { ...v, stato }
}

const scrivi = (etichetta, valore) => {
  const campo = screen.getByLabelText(etichetta)
  fireEvent.change(campo, { target: { value: valore } })
  return campo
}

describe('il giro intero: creo, modifico, rinomino, cancello', () => {
  // 17/09/2026 — «Parti da una che hai già» è stato TOLTO su richiesta del
  // titolare. Erano scorciatoie buone in teoria, ma stavano sopra il campo del
  // nome: la prima cosa che si vedeva aprendo «Nuovo gusto» era un elenco di
  // gusti vecchi.
  //
  // Il test non si cancella, si gira: adesso pretende che NON ci siano più.
  // Un test cancellato non dice niente a chi un domani le rimettesse per
  // sbaglio; questo dice che è stata una scelta.
  it('non si parte più da una ricetta che c’è già: le scorciatoie sono state tolte', () => {
    const { container } = montaScheda()
    const chip = [...container.querySelectorAll('button')].find(x => x.textContent.trim() === 'NOCCIOLA')
    expect(chip, 'i punti di partenza rapidi non devono più comparire').toBeFalsy()
    expect(container.textContent).not.toMatch(/Parti da una che hai già/i)
  })

  it('la categoria mostra tutte le voci, non solo quella già scritta', () => {
    const { container } = montaScheda()
    fireEvent.click(screen.getByLabelText('Categoria'))
    const voci = [...container.querySelectorAll('[role="option"]')].map(o => o.textContent.trim())
    expect(voci.length).toBeGreaterThan(1)
    expect(voci.some(v => v.startsWith('Gusto'))).toBe(true)
    expect(voci.some(v => v.startsWith('Frutta'))).toBe(true)
  })

  it('aprendo un gusto senza `tipo`, il tipo resta «gusto» e non diventa «fetta»', async () => {
    // Il difetto vero: nel ricettario di Mara venti ricette su trenta non
    // hanno il campo `tipo`, e aprendole per cambiare una quantità uscivano
    // come torte da otto fette — e da lì in poi ricavo, margine, cassa e
    // produzione contavano un'altra cosa.
    montaScheda({ apri: 'PISTACCHIO' })
    await waitFor(() => expect(screen.getByLabelText('Nome ricetta').value).toBe('PISTACCHIO'))
    expect(screen.getByLabelText(/Tipo unit/i).value, 'il tipo si è scassinato aprendo la ricetta').toBe('gusto')
  })

  it('e la categoria che aveva resta quella', async () => {
    montaScheda({ apri: 'PISTACCHIO' })
    await waitFor(() => expect(screen.getByLabelText('Categoria').value).toBe('Gusto'))
  })
})

describe('il costo che la scheda mostra mentre scrivo', () => {
  it('usa il prezzo scritto a mano per la base, non il calcolo incompleto', async () => {
    // 17/09/2026: la ricetta si apriva cliccando un punto di partenza rapido,
    // che non esiste più. Si apre dalla strada vera — `editingRicetta`, cioè
    // quello che passa il Dashboard quando si tocca una ricetta nel
    // Ricettario. Il test guadagna: prima provava la scorciatoia, adesso
    // prova il percorso che fa il titolare.
    const { container } = montaScheda({ apri: 'NOCCIOLA' })
    await new Promise(r => setTimeout(r, 80))
    // 1000 g di base a 2,31 €/kg + 100 g di pasta a 28 €/kg = 5,11 €.
    // Col calcolo ricorsivo (che ignora il prezzo scritto) farebbe 3,88.
    expect(container.textContent).toMatch(/5,11|5\.11/)
  })
})

describe('cambio il nome a una ricetta e salvo', () => {
  it('nel ricettario ne resta UNA, con il nome nuovo', async () => {
    const { container, stato } = montaScheda({ apri: 'NOCCIOLA' })
    await waitFor(() => expect(screen.getByLabelText('Nome ricetta').value).toBe('NOCCIOLA'))
    scrivi('Nome ricetta', 'NOCCIOLA PIEMONTE')
    const salva = [...container.querySelectorAll('button')].find(b => /Salva modifiche|Salva/.test(b.textContent))
    expect(salva).toBeTruthy()
    fireEvent.click(salva)
    await waitFor(() => expect(stato.salvataggi).toBeGreaterThan(0))
    const nomi = Object.keys(stato.ricettario.ricette)
    expect(nomi).toContain('NOCCIOLA PIEMONTE')
    expect(nomi, 'la vecchia è rimasta: sono due').not.toContain('NOCCIOLA')
  })

  it('e chi la usava come ingrediente segue il nome nuovo', async () => {
    // Il danno che non si vede: PISTACCHIO usa BASE BIANCA. Rinominando la
    // base, se il riferimento non segue, PISTACCHIO perde quel costo in
    // silenzio — il food cost cala e sembra un miglioramento.
    const { container, stato } = montaScheda({ apri: 'BASE BIANCA' })
    await waitFor(() => expect(screen.getByLabelText('Nome ricetta').value).toBe('BASE BIANCA'))
    scrivi('Nome ricetta', 'BASE LATTE')
    const salva = [...container.querySelectorAll('button')].find(b => /Salva modifiche|Salva/.test(b.textContent))
    fireEvent.click(salva)
    await waitFor(() => expect(stato.salvataggi).toBeGreaterThan(0))
    const pistacchio = stato.ricettario.ricette['PISTACCHIO']
    expect(pistacchio.ingredienti[0].nome, 'il riferimento è rimasto al nome vecchio').toBe('BASE LATTE')
    // E il costo che la base aveva nel listino non resta col nome vecchio.
    expect(stato.ricettario.ingredienti_costi['base bianca']).toBeUndefined()
  })
})

describe('cancello una ricetta', () => {
  // ── Questa prova non provava niente, e lo diceva lei stessa ───────────
  //
  // 22/09/2026. Il corpo era: cerca il pulsante «Elimina», e **se non lo
  // trovi, esci con un `return`**. Poi premilo e aspetta sessanta
  // millisecondi. Nessuna verifica: né che la ricetta fosse sparita, né che
  // il modulo si fosse svuotato — le due cose scritte nel titolo.
  //
  // Una prova che esce di soppiatto quando non trova quello che cerca è
  // verde sempre, anche il giorno che la cancellazione smette di funzionare.
  // Ed era la sola che guardava la cancellazione dal vivo: l'altra qui sotto
  // legge il sorgente.
  //
  // Il `stato` che l'impalcatura restituisce — il ricettario dopo il
  // salvataggio — era destrutturato e mai letto. Era lì che stava la
  // risposta, a due righe di distanza.
  it('sparisce dal ricettario e il modulo si svuota', async () => {
    const { container, stato } = montaScheda({ apri: 'PISTACCHIO' })
    await waitFor(() => expect(screen.getByLabelText('Nome ricetta').value).toBe('PISTACCHIO'))
    expect(stato.ricettario.ricette.PISTACCHIO, 'la ricetta di partenza non c\'è').toBeTruthy()

    // Il giro vero della cancellazione, tre passi. Saltarne uno vuol dire
    // provare un prodotto che non esiste.
    //   1. si apre l'elenco «Elimina ricetta»
    //   2. si sceglie QUALE ricetta
    //   3. si scrive ELIMINA in maiuscolo, e solo allora il pulsante si accende
    const elimina = [...container.querySelectorAll('button')]
      .find(b => /Elimina ricetta/i.test(b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent || ''))
    expect(elimina, 'il comando per aprire la cancellazione non si trova').toBeTruthy()
    fireEvent.click(elimina)

    // La cancellazione ha due porte in fila: l'icona apre il pannello, e
    // dentro c'è l'elenco delle ricette che si apre a sua volta.
    //
    // La seconda porta va **aspettata**: cercarla subito vuol dire cercarla
    // prima che React abbia ridisegnato, non trovarla, e tirare avanti con
    // l'elenco chiuso. È il motivo per cui questa prova ha sbagliato bersaglio
    // tre volte prima di funzionare.
    // Le due porte si chiamano tutte e due «Elimina ricetta», e si
    // distinguono da un dettaglio: l'icona in alto è un interruttore
    // (`aria-pressed`), quella del pannello no. Cercare «il pulsante nuovo»
    // non funziona: l'icona viene **ricreata** a ogni disegno — è definita
    // dentro il corpo del componente — quindi risulta nuova anche lei, e
    // premerla di nuovo richiude il pannello appena aperto.
    const secondaPorta = await waitFor(() => {
      const x = [...document.querySelectorAll('button')]
        .find(b => b.getAttribute('aria-pressed') == null
          && /Elimina ricetta/i.test((b.textContent || '') + (b.getAttribute('aria-label') || '')))
      expect(x, 'il pannello della cancellazione non si è aperto').toBeTruthy()
      return x
    }, { timeout: 3000 })
    fireEvent.click(secondaPorta)

    // PISTACCHIO compare in più elenchi della pagina: quello giusto è quello
    // **comparso adesso**, cioè non c'era prima di aprire la cancellazione.
    // Cliccare il primo che si trova vuol dire aprire la ricetta invece di
    // cancellarla, e la prova passerebbe guardando la cosa sbagliata.
    const scegli = await waitFor(() => {
      const b = [...document.querySelectorAll('button')]
        .filter(x => /PISTACCHIO/i.test((x.textContent || '').trim()))
        .find(x => x.getAttribute('aria-pressed') == null)
      expect(b, 'nell\'elenco da cancellare non è comparso PISTACCHIO').toBeTruthy()
      return b
    }, { timeout: 3000 })
    fireEvent.click(scegli)

    // La cancellazione ha un doppio controllo: bisogna **scrivere ELIMINA in
    // maiuscolo** prima che il pulsante si accenda. È il comportamento giusto
    // — cancellare una ricetta è permanente — e una prova che non ci passa
    // sta provando un prodotto che non esiste.
    //
    // Nota di metodo: il pulsante si aspetta e **poi** si preme, una volta
    // sola. Premere dentro un'attesa che si ripete vuol dire premerlo venti
    // volte, e la prima stesura di questa riga ha fatto morire il processo.
    // Prima di scrivere ELIMINA: il pannello deve dire di QUALE ricetta si
    // tratta. Senza questo controllo si può confermare la cancellazione di
    // «niente» — e il programma salverebbe un ricettario identico dicendo che
    // ha cancellato.
    await waitFor(() => {
      expect(document.body.textContent).toMatch(/Stai per eliminare/i)
      expect(document.body.textContent).toMatch(/PISTACCHIO/)
    }, { timeout: 3000 })

    const campoPin = await waitFor(() => {
      const c = [...document.querySelectorAll('input')].find(i => i.placeholder === 'ELIMINA')
      expect(c, 'non compare il campo dove si scrive ELIMINA').toBeTruthy()
      return c
    }, { timeout: 3000 })
    // Il pulsante giusto è **quello che si accende scrivendo**: prima era
    // spento, dopo no. Cercarlo per testo non funziona — in pagina ci sono
    // altri pulsanti che dicono «elimina» e sono già accesi (l'icona in alto,
    // il comando che apre l'elenco), e premere quelli richiude tutto.
    const spentiPrima = new Set([...document.querySelectorAll('button')].filter(b => b.disabled))
    expect(spentiPrima.size, 'nessun pulsante è spento: il doppio controllo non c\'è').toBeGreaterThan(0)
    fireEvent.change(campoPin, { target: { value: 'ELIMINA' } })

    const conferma = await waitFor(() => {
      const b = [...document.querySelectorAll('button')]
        .find(x => !x.disabled && spentiPrima.has(x))
      expect(b, 'il pulsante di conferma non si è acceso dopo aver scritto ELIMINA').toBeTruthy()
      return b
    }, { timeout: 3000 })
    fireEvent.click(conferma)

    await waitFor(() => {
      expect(stato.ricettario.ricette.PISTACCHIO, 'la ricetta è ancora nel ricettario').toBeFalsy()
    }, { timeout: 3000 })

    // E il modulo resta vuoto: se tenesse il nome di una ricetta che non
    // esiste più, il salvataggio dopo la ricreerebbe.
    expect(screen.getByLabelText('Nome ricetta').value).toBe('')
  })

  it('e la guardia delle modifiche non salvate non resta accesa', () => {
    // «Ho cancellato la ricetta semplicemente» — e cambiando pagina compariva
    // il popup «hai modifiche non salvate», per un modulo vuoto e una ricetta
    // che non esiste più.
    const src = readFileSync(join(RADICE, 'src', 'views', 'NuovaRicettaView.jsx'), 'utf8')
    const blocco = src.slice(src.indexOf('const handleDeleteRicetta'), src.indexOf('const doSaveRicetta'))
    expect(blocco).toMatch(/initialFormRef\.current = empty/)
  })
})
