// @vitest-environment happy-dom
// ── La schermata della bolla dice quello che ha capito ────────────────────
//
// Audit del 21/09/2026 sul motore dei prezzi da bolla. Il conto
// (`src/lib/bolle.js`) era stato corretto in otto punti; restavano quattro
// difetti **della schermata**, cioè del pezzo che una persona guarda prima di
// dire «sì, è giusto». Sono questi, con i numeri veri con cui sono stati
// misurati:
//
// D7 — «Peso di una confezione» passava da `Number(v) || null`, che è il modo
//      inglese di leggere un numero italiano. Chi scriveva «25.000» (un sacco
//      di farina da 25 kg, scritto come si scrive in Italia) otteneva
//      venticinque **grammi**: cinque sacchi diventavano 125 g invece di
//      125 kg, e il prezzo al chilo 740,00 €/kg invece di 0,74 €/kg. Mille
//      volte, dentro il food cost di ogni ricetta con quella materia prima.
//      E chi scriveva «12,5» non otteneva niente: `Number('12,5')` è `NaN`,
//      `|| null` lo trasformava in campo vuoto, senza dire perché.
//
// D8 — il menù «Unità» aveva quattro voci (kg, g, litri, pezzi), ma il valore
//      della riga è l'unità **come l'ha scritta il fornitore**. Sulle bolle
//      vere c'è SACCHI, CF, LT, CT: tre delle sei unità che il
//      riconoscimento della foto è istruito a restituire non erano nel menù,
//      e una riga letta «SACCHI» mostrava il menù **vuoto** — come se l'unità
//      non l'avesse letta nessuno.
//
// avvisi — il conto aveva imparato a dire cosa aveva dovuto dedurre (il peso
//      del sacco letto dalla descrizione) e cosa non gli tornava (l'imponibile
//      che non quadra con quantità × prezzo unitario: 10 kg × 10,00 €/kg con
//      imponibile «1.000,00» dava 100 €/kg, dieci volte, in silenzio). Nessuno
//      li mostrava: restavano nell'oggetto e morivano lì.
//
// doppia — l'avviso «già caricata» c'era, ma il bottone restava premibile: un
//      clic e la giacenza della farina passava da 25 a 50 kg.
//
// Il conto in sé si prova in `prezziDallaBolla.test.js`; qui si monta la
// schermata vera e si guarda quello che si legge.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup, fireEvent, act, waitFor } from '@testing-library/react'
import React from 'react'
import BollaInArrivo from '../../src/views/BollaInArrivo'

const RICETTARIO = {
  ricette: {},
  ingredienti_costi: {
    'farina 00': { costoKg: 0.70, costoG: 0.0007 },
    burro: { costoKg: 9.0, costoG: 0.009 },
  },
}

function monta(extra = {}) {
  const onRegistra = extra.onRegistra
    || vi.fn(async () => ({ ok: true, caricati: 1, applicati: 1, storicizzati: 1 }))
  const notify = extra.notify || vi.fn()
  const r = render(
    <BollaInArrivo
      letto={extra.letto || { fornitore: 'Molino Rossi', numero: '1234/A', data: '2026-09-19', righe: [] }}
      ricettario={extra.ricettario || RICETTARIO}
      logPrezzi={extra.logPrezzi || []}
      logRif={extra.logRif || []}
      onRegistra={onRegistra}
      onAnnulla={extra.onAnnulla || (() => {})}
      notify={notify}
    />
  )
  return { ...r, onRegistra, notify }
}

const testo = (c) => [...c.querySelectorAll('div, li, span, button, strong, option, label')]
  .map(e => (e.textContent || '').trim()).join(' | ')

const bottone = (c, etichetta) => [...c.querySelectorAll('button')]
  .find(b => (b.textContent || '').trim().includes(etichetta))

/** Le righe della bolla, come gruppi separati: ognuna col suo nome. */
const gruppi = (c) => [...c.querySelectorAll('[role="group"]')]

const apri = (c, i = 0) => act(() => {
  fireEvent.click([...c.querySelectorAll('button')].filter(b => /Come l'ho calcolato/.test(b.textContent))[i])
})

const scrivi = (c, selettore, valore) => act(() => {
  fireEvent.change(c.querySelector(selettore), { target: { value: valore } })
})

afterEach(() => cleanup())

// ── D7 ────────────────────────────────────────────────────────────────────
describe('Il peso della confezione scritto a mano si legge all\'italiana', () => {
  const CINQUE_SACCHI = {
    fornitore: 'Molino Rossi', numero: '1234/A', data: '2026-09-19',
    righe: [{ nome: 'farina 00', quantita: 5, unita: 'SACCHI', imponibile: '92,50' }],
  }

  it('«25.000» sono venticinquemila grammi, non venticinque', async () => {
    // Il difetto: 5 × 25 g = 125 g, e 92,50 € su 125 g fanno 740,00 €/kg.
    // Il conto giusto: 5 × 25 kg = 125 kg, cioè 0,74 €/kg.
    const { container } = monta({ letto: CINQUE_SACCHI })
    apri(container)
    scrivi(container, 'input[id^="bolla-peso-"]', '25.000')
    await waitFor(() => expect(testo(container)).toMatch(/0,74/))
    expect(testo(container)).not.toMatch(/740,00/)
    expect(testo(container)).toMatch(/125 kg/)
  })

  it('«12,5» si può scrivere: prima la virgola faceva sparire il dato', async () => {
    const { container } = monta({
      letto: {
        ...CINQUE_SACCHI,
        righe: [{ nome: 'burro', quantita: 200, unita: 'CF', imponibile: '25,00' }],
      },
    })
    expect(testo(container)).toMatch(/manca il peso di uno/)
    apri(container)
    scrivi(container, 'input[id^="bolla-peso-"]', '12,5')
    // 200 × 12,5 g = 2.500 g = 2,5 kg; 25,00 € ÷ 2,5 kg = 10,00 €/kg.
    await waitFor(() => expect(testo(container)).toMatch(/10,00/))
    expect(testo(container)).not.toMatch(/manca il peso di uno/)
  })

  it('quando «25.000» si può leggere in due modi, lo dice: non sceglie di nascosto', async () => {
    const { container } = monta({ letto: CINQUE_SACCHI })
    apri(container)
    scrivi(container, 'input[id^="bolla-peso-"]', '25.000')
    await waitFor(() => expect(testo(container)).toMatch(/25\.000 g/))
    expect(testo(container)).toMatch(/oppure 25 g/)
  })

  // ── Quello che c'è intorno ──────────────────────────────────────────────
  it('«25000» senza punto continua a funzionare come prima', async () => {
    const { container } = monta({ letto: CINQUE_SACCHI })
    apri(container)
    scrivi(container, 'input[id^="bolla-peso-"]', '25000')
    await waitFor(() => expect(testo(container)).toMatch(/0,74/))
    // Niente punto, niente da chiedere: nessun avviso sulle due letture.
    expect(testo(container)).not.toMatch(/oppure 25 g/)
  })

  it('cancellare il peso non vale zero: la riga torna a dire che manca', async () => {
    // «Un dato che manca non è zero»: con `Number(v) || null` il campo vuoto
    // e lo zero finivano nello stesso posto, e uno dei due è una risposta.
    const { container } = monta({ letto: CINQUE_SACCHI })
    apri(container)
    scrivi(container, 'input[id^="bolla-peso-"]', '25000')
    await waitFor(() => expect(testo(container)).toMatch(/0,74/))
    scrivi(container, 'input[id^="bolla-peso-"]', '')
    await waitFor(() => expect(testo(container)).toMatch(/manca il peso di uno/))
    expect(testo(container)).not.toMatch(/0,74/)
  })

  it('un peso a zero non diventa un prezzo: lo dice e si ferma', async () => {
    const { container } = monta({ letto: CINQUE_SACCHI })
    apri(container)
    scrivi(container, 'input[id^="bolla-peso-"]', '0')
    await waitFor(() => expect(testo(container)).toMatch(/manca il peso di uno/))
    expect(testo(container)).not.toMatch(/Infinity|NaN/)
  })

  it('quello che si scrive resta scritto nel campo', async () => {
    // Con `Number(v) || null` battere «12,» o «0» faceva sparire quello che
    // la persona aveva appena battuto, sotto le sue dita.
    const { container } = monta({ letto: CINQUE_SACCHI })
    apri(container)
    scrivi(container, 'input[id^="bolla-peso-"]', '12,')
    await waitFor(() => {
      expect(container.querySelector('input[id^="bolla-peso-"]').value).toBe('12,')
    })
  })
})

// ── D8 ────────────────────────────────────────────────────────────────────
describe('Il menù delle unità contiene anche quello che c\'è scritto sulla bolla', () => {
  const conUnita = (unita) => ({
    fornitore: 'Molino Rossi', numero: '1234/A', data: '2026-09-19',
    righe: [{ nome: 'farina 00', quantita: 5, unita, pesoConfezioneG: 25000, imponibile: '92,50' }],
  })

  it('«SACCHI» è nel menù e risulta scelta, invece di lasciarlo vuoto', async () => {
    const { container } = monta({ letto: conUnita('SACCHI') })
    apri(container)
    const menu = container.querySelector('select[id^="bolla-unita-"]')
    expect(menu.value).toBe('SACCHI')
    expect([...menu.options].map(o => o.value)).toContain('SACCHI')
  })

  it('e dice cosa ne fa: «la conto come pezzi o confezioni»', async () => {
    const { container } = monta({ letto: conUnita('SACCHI') })
    apri(container)
    const menu = container.querySelector('select[id^="bolla-unita-"]')
    const scelta = [...menu.options].find(o => o.value === 'SACCHI')
    expect(scelta.textContent).toMatch(/la conto come pezzi o confezioni/)
  })

  it('un\'unità che non sa leggere la dichiara, invece di far finta di niente', async () => {
    const { container } = monta({ letto: conUnita('COLLI') })
    apri(container)
    const menu = container.querySelector('select[id^="bolla-unita-"]')
    expect(menu.value).toBe('COLLI')
    expect([...menu.options].find(o => o.value === 'COLLI').textContent)
      .toMatch(/non la so leggere/)
    expect(testo(container)).toMatch(/unità di misura sconosciuta/)
  })

  it('le altre unità delle bolle vere ci sono tutte: CF, LT, PZ, CT', async () => {
    for (const u of ['CF', 'LT', 'PZ', 'CT']) {
      const { container } = monta({ letto: conUnita(u) })
      apri(container)
      const menu = container.querySelector('select[id^="bolla-unita-"]')
      expect(menu.value, `unità ${u}`).toBe(u)
      cleanup()
    }
  })

  it('senza unità il menù lo dice, invece di sembrare un campo mai compilato', async () => {
    const { container } = monta({ letto: conUnita('') })
    apri(container)
    const menu = container.querySelector('select[id^="bolla-unita-"]')
    expect(menu.value).toBe('')
    expect([...menu.options][0].textContent).toMatch(/Quale unità/)
  })

  // ── Quello che c'è intorno ──────────────────────────────────────────────
  it('un\'unità già nostra non viene ripetuta nel menù', async () => {
    const { container } = monta({ letto: conUnita('kg') })
    apri(container)
    const menu = container.querySelector('select[id^="bolla-unita-"]')
    expect(menu.value).toBe('kg')
    expect([...menu.options].filter(o => o.value === 'kg')).toHaveLength(1)
  })

  it('il menù offre tutte le unità che il conto sa trasformare in chili', async () => {
    const { container } = monta({ letto: conUnita('kg') })
    apri(container)
    const menu = container.querySelector('select[id^="bolla-unita-"]')
    expect([...menu.options].map(o => o.value).sort())
      .toEqual(['cl', 'g', 'hg', 'kg', 'l', 'ml', 'pz'])
  })

  it('scegliendo dal menù il conto si rifà davanti agli occhi', async () => {
    // Da «SACCHI» (5 × 25 kg = 125 kg) a «kg» (5 kg): 92,50 € ÷ 5 = 18,50 €/kg.
    const { container } = monta({ letto: conUnita('SACCHI') })
    apri(container)
    scrivi(container, 'select[id^="bolla-unita-"]', 'kg')
    await waitFor(() => expect(testo(container)).toMatch(/18,50/))
  })
})

// ── Gli avvisi ────────────────────────────────────────────────────────────
describe('Gli avvisi del conto stanno sulla riga a cui appartengono', () => {
  it('l\'imponibile che non torna con quantità × prezzo unitario si vede', async () => {
    const { container } = monta({
      letto: {
        fornitore: 'Molino Rossi', numero: '1234/A', data: '2026-09-19',
        righe: [{ nome: 'burro', quantita: 10, unita: 'KG', prezzoUnitario: '10,00', imponibile: '1.000,00' }],
      },
    })
    const tutto = testo(container)
    expect(tutto).toMatch(/non torna con 10 € × 10/)
    expect(tutto).toMatch(/uno dei due numeri è letto male/)
  })

  it('il peso letto dalla descrizione si dichiara, non si applica di nascosto', async () => {
    const { container } = monta({
      letto: {
        fornitore: 'Molino Rossi', numero: '1234/A', data: '2026-09-19',
        righe: [{
          nome: 'farina 00', quantita: 5, unita: 'SACCHI', imponibile: '92,50',
          descrizione: 'FARINA TIPO 00 SACCO 25 KG',
        }],
      },
    })
    const tutto = testo(container)
    expect(tutto).toMatch(/l'ho letto da «25 kg»/)
    expect(tutto).toMatch(/Se non è così, scrivilo tu/)
    // …e il conto è comunque andato avanti: l'avviso fa guardare, non ferma.
    expect(tutto).toMatch(/0,74/)
  })

  it('ogni avviso sta nel gruppo della sua riga, non in fondo alla pagina', async () => {
    const { container } = monta({
      letto: {
        fornitore: 'Molino Rossi', numero: '1234/A', data: '2026-09-19',
        righe: [
          { nome: 'burro', quantita: 10, unita: 'KG', prezzoUnitario: '10,00', imponibile: '1.000,00' },
          { nome: 'farina 00', quantita: 10, unita: 'KG', imponibile: '7,00' },
        ],
      },
    })
    const [primo, secondo] = gruppi(container)
    expect(primo.getAttribute('aria-label')).toMatch(/Burro/i)
    expect(primo.textContent).toMatch(/non torna con/)
    // La seconda riga non ha niente che non torni: non deve ereditare
    // l'avviso della prima, che è il modo in cui si smette di leggerli.
    expect(secondo.textContent).not.toMatch(/non torna con/)
  })

  it('una riga senza avvisi non ne mostra nessuno', async () => {
    const { container } = monta({
      letto: {
        fornitore: 'Molino Rossi', numero: '1234/A', data: '2026-09-19',
        righe: [{ nome: 'burro', quantita: 10, unita: 'KG', imponibile: '95,00' }],
      },
    })
    expect(testo(container)).not.toMatch(/controlla quale|non torna con|l'ho letto da/)
  })

  it('niente NaN, undefined o Invalid Date a schermo, nemmeno sulle righe rotte', async () => {
    const { container } = monta({
      letto: {
        fornitore: 'Molino Rossi', numero: '1234/A', data: '',
        righe: [
          { nome: 'burro', quantita: '', unita: '', imponibile: '' },
          { nome: 'farina 00', quantita: '0', unita: 'KG', imponibile: '10,00' },
          { nome: 'farina 00', quantita: '-5', unita: 'KG', imponibile: '-92,50' },
        ],
      },
    })
    const tutto = testo(container)
    expect(tutto).not.toMatch(/NaN|undefined|Invalid Date|Infinity|\[object/)
    expect(tutto).toMatch(/quantità zero/)
    expect(tutto).toMatch(/nota di credito/)
  })
})

// ── La bolla già caricata ─────────────────────────────────────────────────
describe('Una bolla già caricata non si registra per sbaglio', () => {
  const LETTO = {
    fornitore: 'Molino Rossi', numero: '1234/A', data: '2026-09-19',
    righe: [{ nome: 'burro', quantita: 10, unita: 'KG', imponibile: '95,00' }],
  }
  const GIA = [{ id: 'r1', bolla: 'molinorossi|1234a|2026-09-19', ingrediente: 'burro', quantita_g: 10000 }]

  it('il bottone «Registra la bolla» è spento', async () => {
    const { container } = monta({ letto: LETTO, logRif: GIA })
    expect(bottone(container, 'Registra la bolla').disabled).toBe(true)
  })

  it('e la schermata dice perché è spento, invece di lasciare un vicolo cieco', async () => {
    const { container } = monta({ letto: LETTO, logRif: GIA })
    const tutto = testo(container)
    expect(tutto).toMatch(/già caricata/)
    expect(tutto).toMatch(/Così non registro niente/)
    expect(tutto).toMatch(/spunta la casella/)
  })

  it('la casella per forzare esiste, ha la sua etichetta e si raggiunge da tastiera', async () => {
    const { container } = monta({ letto: LETTO, logRif: GIA })
    const casella = container.querySelector('#bolla-forza')
    expect(casella).toBeTruthy()
    expect(casella.type).toBe('checkbox')
    // L'etichetta è collegata: si può cliccare il testo, e la voce la legge.
    const etichetta = container.querySelector('label[for="bolla-forza"]')
    expect(etichetta).toBeTruthy()
    expect(etichetta.textContent).toMatch(/Registrala lo stesso/)
    // Una casella non ha bisogno di tabindex per essere raggiungibile, ma
    // non deve essere disattivata né nascosta.
    expect(casella.disabled).toBe(false)
  })

  it('spuntandola il bottone si accende e il documento porta «forza»', async () => {
    const { container, onRegistra } = monta({ letto: LETTO, logRif: GIA })
    act(() => { fireEvent.click(container.querySelector('#bolla-forza')) })
    await waitFor(() => expect(bottone(container, 'Registra la bolla').disabled).toBe(false))
    await act(async () => { fireEvent.click(bottone(container, 'Registra la bolla')) })
    expect(onRegistra).toHaveBeenCalledTimes(1)
    expect(onRegistra.mock.calls[0][1].forza).toBe(true)
  })

  // ── Quello che c'è intorno ──────────────────────────────────────────────
  it('una bolla mai caricata parte senza spuntare niente, e senza «forza»', async () => {
    const { container, onRegistra } = monta({ letto: LETTO, logRif: [] })
    expect(container.querySelector('#bolla-forza')).toBeNull()
    expect(bottone(container, 'Registra la bolla').disabled).toBe(false)
    await act(async () => { fireEvent.click(bottone(container, 'Registra la bolla')) })
    expect(onRegistra.mock.calls[0][1].forza).toBe(false)
  })

  it('cambiando il numero del documento la bolla non è più quella di prima', async () => {
    const { container } = monta({ letto: LETTO, logRif: GIA })
    expect(bottone(container, 'Registra la bolla').disabled).toBe(true)
    scrivi(container, '#bolla-numero', '1235/A')
    await waitFor(() => expect(bottone(container, 'Registra la bolla').disabled).toBe(false))
    expect(testo(container)).not.toMatch(/già caricata/)
  })

  it('il permesso di forzare non resta appiccicato a una bolla diversa', async () => {
    // Si spunta «registrala lo stesso», poi si corregge il numero perché era
    // quello sbagliato: la bolla adesso è un'altra, e il permesso dato per
    // quella di prima non deve valere anche per questa.
    const { container, onRegistra } = monta({ letto: LETTO, logRif: GIA })
    act(() => { fireEvent.click(container.querySelector('#bolla-forza')) })
    scrivi(container, '#bolla-numero', '1235/A')
    await waitFor(() => expect(container.querySelector('#bolla-forza')).toBeNull())
    await act(async () => { fireEvent.click(bottone(container, 'Registra la bolla')) })
    expect(onRegistra.mock.calls[0][1].forza).toBe(false)
  })

  it('se il calcolo non scrive niente, la schermata non dice «registrata»', async () => {
    // È il caso in cui il conto riconosce da solo la bolla doppia (l'ultimo
    // controllo prima del database) e si ferma: caricati 0, prezzi 0,
    // storico 0. Dire «Bolla registrata» fa smettere di cercare.
    const { container, notify } = monta({
      letto: LETTO,
      onRegistra: vi.fn(async () => ({ ok: true, caricati: 0, applicati: 0, storicizzati: 0 })),
    })
    await act(async () => { fireEvent.click(bottone(container, 'Registra la bolla')) })
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/Non è stato scritto niente/), false)
    expect(notify).not.toHaveBeenCalledWith(expect.stringMatching(/registrata/i))
  })

  it('senza numero del documento non si riconosce il doppione, e lo dice', async () => {
    const { container } = monta({ letto: { ...LETTO, numero: '' }, logRif: GIA })
    expect(testo(container)).toMatch(/non posso riconoscere questa bolla/)
    expect(bottone(container, 'Registra la bolla').disabled).toBe(false)
  })
})
