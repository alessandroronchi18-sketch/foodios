// @vitest-environment happy-dom
//
// ── La domanda «a quali sedi vanno?» e la pagina Impostazioni → Società ──
//
// 03/10/2026. La regola che manda ogni fattura alla sede della sua società è
// provata in `fattureDiDueSocieta.test.js`; qui le due schermate che la
// fanno vedere al titolare. Le cose che contano, e perché:
//
//   • per una società mai vista NESSUNA sede è già scelta: il danno del
//     17/09/2026 (3.104 fatture finite su Carlina «perché era la sede
//     attiva») è nato da una scelta che nessuno aveva fatto davvero;
//   • senza una sede per ogni società non si può confermare;
//   • Annulla, Esc e il clic fuori valgono «non caricare»: la risposta è
//     `null`, e l'import non scrive niente;
//   • le fatture GIÀ in archivio si spostano solo dopo aver visto i numeri
//     e detto sì: Annulla non tocca niente.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup, waitFor } from '@testing-library/react'
import React, { useState } from 'react'

const archivio = vi.hoisted(() => ({
  mappa: {}, fatture: { colonna: true, fatture: [] }, spostate: [], aggiornamenti: 0,
}))
vi.mock('../../src/lib/societaSediArchivio', () => ({
  caricaSocieta: vi.fn(async () => archivio.mappa),
  aggiornaSocieta: vi.fn(async (_org, fn) => { archivio.mappa = fn(archivio.mappa); archivio.aggiornamenti++; return archivio.mappa }),
  fattureConSocieta: vi.fn(async () => archivio.fatture),
  spostaFatture: vi.fn(async (_s, _o, g) => { archivio.spostate.push(g); return { spostate: g.ids.length, errori: [] } }),
}))
vi.mock('../../src/lib/supabase', () => ({ supabase: {} }))

const { useDomandaSedi } = await import('../../src/components/DomandaSocietaSedi.jsx')
const { default: ImpostazioniSocieta } = await import('../../src/components/ImpostazioniSocieta.jsx')

const SEDI = [
  { id: 's-carlina', nome: 'Carlina', attiva: true },
  { id: 's-degasperi', nome: 'De Gasperi', attiva: true },
  { id: 's-berthollet', nome: 'Berthollet', attiva: true },
]
const PIVA_B = '22222222222'

afterEach(cleanup)

/** Una pagina finta che fa la domanda e mostra la risposta. */
function Banco({ domande, preselezione }) {
  const [chiedi, dialogo] = useDomandaSedi(SEDI)
  const [risposta, setRisposta] = useState('in attesa')
  return (
    <div>
      <button type="button" onClick={async () => setRisposta(JSON.stringify(await chiedi(domande, { preselezione })))}>chiedi</button>
      <output data-testid="risposta">{risposta}</output>
      {dialogo}
    </div>
  )
}

const DOMANDA_B = { chiave: PIVA_B, piva: PIVA_B, nome: 'BETA SRL', n: 12, dal: '2026-03-02', al: '2026-08-30' }
const DOMANDA_SENZA = { chiave: '', piva: null, nome: '', n: 3, dal: null, al: null }

describe('la domanda: una società mai vista', () => {
  it('dice chi, quante e di che periodo, e nessuna sede è già scelta', async () => {
    const r = render(<Banco domande={[DOMANDA_B]} preselezione={['s-carlina']} />)
    fireEvent.click(r.getByText('chiedi'))
    expect(r.getByText('Fatture intestate a BETA SRL')).toBeTruthy()
    expect(r.getByText(`P.IVA ${PIVA_B} · 12 fatture nuove · dal 02/03/2026 al 30/08/2026`)).toBeTruthy()
    for (const s of SEDI) expect(r.getByRole('button', { name: s.nome }).getAttribute('aria-pressed')).toBe('false')
    expect(r.getByRole('button', { name: 'Carica le fatture' }).disabled).toBe(true)
  })

  it('due sedi: si spiega che è una spesa condivisa, e la risposta arriva', async () => {
    const r = render(<Banco domande={[DOMANDA_B]} preselezione={[]} />)
    fireEvent.click(r.getByText('chiedi'))
    fireEvent.click(r.getByRole('button', { name: 'De Gasperi' }))
    fireEvent.click(r.getByRole('button', { name: 'Berthollet' }))
    expect(r.getByText(/Spesa di 2 negozi insieme/)).toBeTruthy()
    await act(async () => { fireEvent.click(r.getByRole('button', { name: 'Carica le fatture' })) })
    expect(JSON.parse(r.getByTestId('risposta').textContent)).toEqual({ [PIVA_B]: ['s-degasperi', 's-berthollet'] })
    expect(r.queryByRole('dialog')).toBeNull()
  })

  it('Annulla, Esc e il clic fuori: risposta nulla, non si carica niente', async () => {
    for (const chiudi of [
      (r) => fireEvent.click(r.getByRole('button', { name: 'Annulla' })),
      () => fireEvent.keyDown(document, { key: 'Escape' }),
      (r) => fireEvent.click(r.getByRole('button', { name: 'Chiudi senza caricare' })),
    ]) {
      const r = render(<Banco domande={[DOMANDA_B]} preselezione={[]} />)
      fireEvent.click(r.getByText('chiedi'))
      await act(async () => { chiudi(r) })
      expect(r.getByTestId('risposta').textContent).toBe('null')
      cleanup()
    }
  })

  it('se la pagina si chiude con la domanda aperta, l\'import non resta appeso', async () => {
    let promessa
    function Appeso() {
      const [chiedi, dialogo] = useDomandaSedi(SEDI)
      return <div><button type="button" onClick={() => { promessa = chiedi([DOMANDA_B]) }}>chiedi</button>{dialogo}</div>
    }
    const r = render(<Appeso />)
    fireEvent.click(r.getByText('chiedi'))
    r.unmount()
    await expect(promessa).resolves.toBeNull()
  })
})

describe('la domanda: fatture senza P.IVA di chi le riceve', () => {
  it('parte dalla sede attiva, come prima, e si può caricare subito', async () => {
    const r = render(<Banco domande={[DOMANDA_SENZA]} preselezione={['s-carlina']} />)
    fireEvent.click(r.getByText('chiedi'))
    expect(r.getByText('3 fatture senza la P.IVA di chi le riceve')).toBeTruthy()
    expect(r.getByRole('button', { name: 'Carlina' }).getAttribute('aria-pressed')).toBe('true')
    expect(r.getByText('Vale solo per questo caricamento.')).toBeTruthy()
    await act(async () => { fireEvent.click(r.getByRole('button', { name: 'Carica le fatture' })) })
    expect(JSON.parse(r.getByTestId('risposta').textContent)).toEqual({ '': ['s-carlina'] })
  })

  it('togliendo la sede si dice che spariranno dalle pagine per sede', () => {
    const r = render(<Banco domande={[DOMANDA_SENZA]} preselezione={['s-carlina']} />)
    fireEvent.click(r.getByText('chiedi'))
    fireEvent.click(r.getByRole('button', { name: 'Carlina' }))
    expect(r.getByText(/non compaiono nelle pagine per sede/)).toBeTruthy()
  })
})

describe('Impostazioni → Società', () => {
  beforeEach(() => {
    archivio.mappa = {
      '11111111111': { nome: 'ALFA SRL', sedi: ['s-carlina'] },
      [PIVA_B]: { nome: 'BETA SRL', sedi: ['s-degasperi', 's-berthollet'] },
    }
    archivio.fatture = { colonna: true, fatture: [] }
    archivio.spostate = []
    archivio.aggiornamenti = 0
  })

  it('con una sede sola non c\'è niente da impostare, e lo dice', async () => {
    const r = render(<ImpostazioniSocieta orgId="org" sedi={[SEDI[0]]} notify={() => {}} />)
    expect(r.getByText(/Hai una sede sola/)).toBeTruthy()
  })

  it('mostra le società con le loro sedi', async () => {
    const r = render(<ImpostazioniSocieta orgId="org" sedi={SEDI} notify={() => {}} />)
    await waitFor(() => expect(r.getByText('BETA SRL')).toBeTruthy())
    expect(r.getByText(`P.IVA ${PIVA_B} · condivise fra De Gasperi e Berthollet`)).toBeTruthy()
    expect(r.getByText('P.IVA 11111111111 · Carlina')).toBeTruthy()
  })

  it('aggiungere una società: P.IVA di 11 cifre e almeno una sede', async () => {
    const notify = vi.fn()
    const r = render(<ImpostazioniSocieta orgId="org" sedi={SEDI} notify={notify} />)
    await waitFor(() => r.getByText('BETA SRL'))
    const aggiungi = r.getByRole('button', { name: 'Aggiungi' })
    fireEvent.change(r.getByPlaceholderText('11 cifre'), { target: { value: '123' } })
    expect(r.getByText('La partita IVA ha 11 cifre.')).toBeTruthy()
    fireEvent.change(r.getByPlaceholderText('11 cifre'), { target: { value: 'IT 33333333333' } })
    fireEvent.change(r.getByPlaceholderText('Come sulla fattura'), { target: { value: 'GAMMA SRL' } })
    expect(aggiungi.disabled).toBe(true)
    // Le caselle dei negozi sono ripetute per ogni società: si prende l'ultima serie.
    const carline = r.getAllByRole('button', { name: 'Carlina' })
    fireEvent.click(carline[carline.length - 1])
    await act(async () => { fireEvent.click(aggiungi) })
    expect(archivio.mappa['33333333333']).toEqual({ nome: 'GAMMA SRL', sedi: ['s-carlina'] })
    expect(notify).toHaveBeenCalledWith('GAMMA SRL aggiunta.', true)
  })

  it('prima della migration: lo dice, invece di dire che è tutto a posto', async () => {
    archivio.fatture = { colonna: false, fatture: [] }
    const r = render(<ImpostazioniSocieta orgId="org" sedi={SEDI} notify={() => {}} />)
    await waitFor(() => expect(r.getByText(/sarà disponibile dopo il prossimo aggiornamento del database/)).toBeTruthy())
  })

  it('fatture già caricate fuori posto: la proposta coi numeri, e si sposta solo dopo il sì', async () => {
    archivio.fatture = {
      colonna: true,
      fatture: [
        { id: 'f1', sede_id: 's-carlina', sedi_condivise: null, cessionario_piva: PIVA_B, totale: 1000 },
        { id: 'f2', sede_id: 's-carlina', sedi_condivise: null, cessionario_piva: PIVA_B, totale: 234.5 },
        { id: 'f3', sede_id: 's-carlina', sedi_condivise: null, cessionario_piva: '11111111111', totale: 50 },
      ],
    }
    const notify = vi.fn()
    const r = render(<ImpostazioniSocieta orgId="org" sedi={SEDI} notify={notify} />)
    await waitFor(() => expect(r.getByText('2 fatture di BETA SRL oggi su Carlina → condivise fra De Gasperi e Berthollet · 1.235 €')).toBeTruthy())

    // Annulla non tocca niente.
    fireEvent.click(r.getByRole('button', { name: 'Sposta 2 fatture' }))
    expect(r.getByRole('dialog', { name: 'Spostare 2 fatture?' })).toBeTruthy()
    expect(r.getAllByText('1.235 €').length).toBeGreaterThanOrEqual(1)
    fireEvent.click(r.getByRole('button', { name: 'Annulla' }))
    expect(archivio.spostate).toEqual([])

    // Il sì sposta quelle due, e lo dice.
    fireEvent.click(r.getByRole('button', { name: 'Sposta 2 fatture' }))
    await act(async () => { fireEvent.click(r.getByRole('button', { name: 'Sì, sposta 2 fatture' })) })
    expect(archivio.spostate).toHaveLength(1)
    expect(archivio.spostate[0].ids.sort()).toEqual(['f1', 'f2'])
    expect(archivio.spostate[0].verso).toEqual({ sedeId: null, sediCondivise: ['s-degasperi', 's-berthollet'] })
    expect(notify).toHaveBeenCalledWith('Spostate 2 fatture di BETA SRL: ora condivise fra De Gasperi e Berthollet.', true)
  })

  it('tutto al suo posto: lo dice coi numeri', async () => {
    archivio.fatture = { colonna: true, fatture: [{ id: 'f3', sede_id: 's-carlina', sedi_condivise: null, cessionario_piva: '11111111111', totale: 50 }] }
    const r = render(<ImpostazioniSocieta orgId="org" sedi={SEDI} notify={() => {}} />)
    await waitFor(() => expect(r.getByText(/1 fattura sa di quale società è, e sta già nella sede giusta/)).toBeTruthy())
  })
})
