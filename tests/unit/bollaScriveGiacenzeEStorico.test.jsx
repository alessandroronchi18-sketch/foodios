// @vitest-environment happy-dom
// ── La bolla, montata davvero ─────────────────────────────────────────────
//
// La schermata che si apre dopo aver fotografato una bolla. Qui non si prova
// il conto (quello sta in `prezziDallaBolla.test.js`): si prova che **quello
// che si vede è quello che verrà scritto**, e che niente parte senza che una
// persona abbia guardato.
//
// Il difetto che ha fatto nascere questa schermata: prima i prezzi letti da
// una foto finivano dritti in `ingredienti_costi` senza passare da nessuna
// parte e senza lasciare una riga nello storico. Nessuno li rivedeva e
// nessuno poteva risalire a da dove venissero.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

const LETTO = {
  fornitore: 'Molino Rossi',
  numero: '1234/A',
  data: '2026-09-19',
  righe: [
    { nome: 'farina 00', quantita: 5, unita: 'SACCHI', pesoConfezioneG: 25000, imponibile: '92,50' },
    { nome: 'burro', quantita: 10, unita: 'KG', imponibile: '95,00' },
  ],
}

function monta(extra = {}) {
  const onRegistra = extra.onRegistra || vi.fn(async () => ({ ok: true, caricati: 2, applicati: 2, storicizzati: 2 }))
  const r = render(
    <BollaInArrivo
      letto={extra.letto || LETTO}
      ricettario={extra.ricettario || RICETTARIO}
      logPrezzi={extra.logPrezzi || []}
      logRif={extra.logRif || []}
      onRegistra={onRegistra}
      onAnnulla={extra.onAnnulla || (() => {})}
      notify={extra.notify || (() => {})}
    />
  )
  return { ...r, onRegistra }
}

const testi = (c) => [...c.querySelectorAll('div, li, span, button, strong')]
  .map(e => (e.textContent || '').trim())

const bottone = (c, etichetta) => [...c.querySelectorAll('button')]
  .find(b => (b.textContent || '').trim().includes(etichetta))

afterEach(() => cleanup())

describe('Prima di scrivere, si vede cosa si sta per scrivere', () => {
  it('mostra il prezzo al chilo calcolato e quello di prima', async () => {
    const { container } = monta()
    const tutto = testi(container).join(' | ')
    // 92,50 € su 125 kg = 0,74 €/kg, contro gli 0,70 di prima.
    expect(tutto).toMatch(/0,74/)
    expect(tutto).toMatch(/prima 0,70/)
  })

  it('dice quante voci entrano in magazzino e quanti prezzi cambiano', async () => {
    const { container } = monta()
    const tutto = testi(container).join(' | ')
    expect(tutto).toMatch(/2 voci entrano nel magazzino/)
    expect(tutto).toMatch(/2 prezzi cambiano/)
  })

  it('il conto si può aprire e mostra i passaggi, non solo il risultato', async () => {
    const { container } = monta()
    const apri = bottone(container, 'Come l\'ho calcolato')
    expect(apri).toBeTruthy()
    act(() => { fireEvent.click(apri) })
    const tutto = testi(container).join(' | ')
    expect(tutto).toMatch(/125 kg/)
    expect(tutto).toMatch(/92,5/)
  })
})

describe('Niente parte senza che una persona guardi', () => {
  it('non scrive niente finché non si preme Registra', async () => {
    const { onRegistra } = monta()
    expect(onRegistra).not.toHaveBeenCalled()
  })

  it('premendo Registra passa le righe e il documento', async () => {
    const { container, onRegistra } = monta()
    await act(async () => { fireEvent.click(bottone(container, 'Registra la bolla')) })
    expect(onRegistra).toHaveBeenCalledTimes(1)
    const [righe, documento] = onRegistra.mock.calls[0]
    expect(righe).toHaveLength(2)
    expect(documento.fornitore).toBe('Molino Rossi')
    expect(documento.numero).toBe('1234/A')
    expect(documento.data).toBe('2026-09-19')
    expect(documento.identita).toBeTruthy()
  })

  it('una riga saltata non viene registrata', async () => {
    const { container, onRegistra } = monta()
    const salta = container.querySelector('input[type="checkbox"]')
    act(() => { fireEvent.click(salta) })
    await act(async () => { fireEvent.click(bottone(container, 'Registra la bolla')) })
    const [righe] = onRegistra.mock.calls[0]
    expect(righe).toHaveLength(1)
    expect(righe[0].nome).toBe('burro')
  })
})

describe('Quello che la schermata si rifiuta di fare da sola', () => {
  it('una materia prima che non è nell\'elenco resta fuori, e lo dice', async () => {
    // È la regola del 18/09: una bolla non può creare materie prime. È così
    // che nascono «aceto balsamicp» e i food cost che scendono in silenzio.
    const { container, onRegistra } = monta({
      letto: { ...LETTO, righe: [
        { nome: 'farina 0000', quantita: 1, unita: 'KG', imponibile: '1,00' },
      ] },
    })
    expect(testi(container).join(' | ')).toMatch(/non è fra le tue materie prime/)
    const btn = bottone(container, 'Registra la bolla')
    expect(btn.disabled).toBe(true)
    expect(onRegistra).not.toHaveBeenCalled()
  })

  it('avvisa se la stessa bolla risulta già caricata', async () => {
    const { container } = monta({
      logRif: [{ id: 'r1', bolla: 'molinorossi|1234a|2026-09-19', ingrediente: 'farina 00', quantita_g: 1000 }],
    })
    expect(testi(container).join(' | ')).toMatch(/già caricata/)
  })

  it('avvisa se manca la data, perché senza non sa da quando valgono i prezzi', async () => {
    const { container } = monta({ letto: { ...LETTO, data: '' } })
    expect(testi(container).join(' | ')).toMatch(/Senza la data non so da quando valgono/)
  })

  it('avvisa se manca il numero, perché senza non riconosce una bolla doppia', async () => {
    const { container } = monta({ letto: { ...LETTO, numero: '' } })
    expect(testi(container).join(' | ')).toMatch(/non posso riconoscere questa bolla/)
  })
})

describe('Le correzioni a mano ricalcolano davanti agli occhi', () => {
  it('scrivere il peso del sacco fa comparire il prezzo che prima mancava', async () => {
    const { container } = monta({
      letto: { ...LETTO, righe: [
        // Senza il peso di un sacco il prezzo non si può calcolare.
        { nome: 'farina 00', quantita: 5, unita: 'SACCHI', imponibile: '92,50' },
      ] },
    })
    expect(testi(container).join(' | ')).toMatch(/manca il peso di uno/)

    act(() => { fireEvent.click(bottone(container, 'Come l\'ho calcolato')) })
    const campo = container.querySelector('input[inputmode="numeric"]')
    expect(campo).toBeTruthy()
    act(() => { fireEvent.change(campo, { target: { value: '25000' } }) })

    await waitFor(() => {
      expect(testi(container).join(' | ')).toMatch(/0,74/)
    })
  })
})

describe('Una bolla più vecchia dell\'ultimo cambio', () => {
  it('lo dice a schermo, invece di cambiare il prezzo di oggi di nascosto', async () => {
    const { container } = monta({
      letto: { ...LETTO, data: '2026-09-10' },
      logPrezzi: [{ ingrediente: 'burro', decorre_da: '2026-09-18T00:00:00.000Z', prezzoNuovo: 9 }],
    })
    const tutto = testi(container).join(' | ')
    expect(tutto).toMatch(/solo nello storico/)
    expect(tutto).toMatch(/10\/09\/2026/)
  })
})
