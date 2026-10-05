// @vitest-environment happy-dom
//
// ── «Di che cosa sono queste spese?»: scegliere in fretta, salvare sicuro ──
//
// 05/10/2026, pagina a 80 nel giro «sopra 95». Con 146 fornitori senza voce
// (DESA, PRONTOSERVICE, VERSOUNICO… nessuna proposta) la pagina diceva solo
// «Nessuna proposta: scegli tu», con una tendina per riga: due tocchi a
// fornitore e nessun indizio per decidere. E non diceva quanto mancava né
// cosa si sbloccava.
// Difetto vero nel salvataggio: le voci si scrivono una richiesta per voce.
// Se la rete cadeva a metà (la richiesta lancia invece di rispondere con un
// errore) le prime erano già scritte, ma `salvaCategorieFornitori` lanciava:
// lo schermo diceva «Non ho salvato niente» e lasciava da rifare fornitori già
// salvati. Idem per la fattura singola: l'eccezione non diceva niente.
// Ora ogni richiesta che cade diventa un errore per quei fornitori, gli altri
// restano salvati e lo schermo lo dice.
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'

vi.mock('../../src/lib/supabase', () => ({ supabase: { from: () => { throw new Error('client vero usato in una prova') } } }))

import ClassificaSpese, { fornitoriDaFatture } from '../../src/components/analisi/ClassificaSpese'
import { salvaCategorieFornitori, salvaCategoriaFattura } from '../../src/lib/contoEconomicoArchivio'

afterEach(() => cleanup())
const ORG = 'o'
const OGGI = new Date('2026-10-05T10:00:00')
let n = 0
const fat = (fornitore, data, totale, extra = {}) => ({ id: `f${++n}`, fornitore, data_fattura: data, totale, imponibile: 0, imposta: 0, tipo: 'fattura', sede_id: 's', sedi_condivise: null, numero_rif: String(n), categoria_spesa: null, ...extra })

// Un finto database che alla N-esima scrittura lancia (rete caduta).
function db({ fornitori, fatture = [], lanciaDalla = Infinity }) {
  let scritture = 0
  const from = (t) => {
    const st = { op: 'select', patch: null, filtri: [] }
    const q = {
      select() { return q }, update(p) { st.op = 'update'; st.patch = p; return q }, insert() { st.op = 'insert'; return q },
      eq(k, v) { st.filtri.push([k, v]); return q }, in(k, v) { st.filtri.push([k, v, true]); return q },
      gte() { return q }, lte() { return q }, order() { return q }, range() { return q },
      then(ok, ko) {
        return new Promise((res, rej) => {
          if (st.op !== 'select' && ++scritture >= lanciaDalla) return rej(new Error('rete caduta'))
          const dati = t === 'fornitori' ? fornitori : fatture
          if (st.op === 'update') for (const r of dati.filter(x => st.filtri.every(([k, v, inn]) => (inn ? v.includes(x[k]) : x[k] === v)))) Object.assign(r, st.patch)
          res({ data: st.op === 'select' ? dati : null, error: null })
        }).then(ok, ko)
      },
    }
    return q
  }
  return { from }
}
const sched = (id, nome, categoria = null) => ({ id, organization_id: ORG, nome, partita_iva: null, categoria })

describe('salvataggio con la rete che cade a metà', () => {
  const fornitori = [sched('a', 'ALFA'), sched('b', 'BETA'), sched('c', 'GAMMA')]
  const scelte = [{ nome: 'ALFA', categoria: 'servizi' }, { nome: 'BETA', categoria: 'utenze' }, { nome: 'GAMMA', categoria: 'manutenzione' }]

  it('la seconda richiesta cade: la prima resta salvata, le altre dette, niente eccezione', async () => {
    const r = await salvaCategorieFornitori(db({ fornitori, lanciaDalla: 2 }), ORG, scelte, fornitori)
    expect(r.salvati).toBe(1)
    expect(r.righe.map(x => x.nome)).toEqual(['ALFA'])
    expect(r.errori.map(e => e.nome).sort()).toEqual(['BETA', 'GAMMA'])
  })
  it('intorno: se non cade niente, salva tutte e tre; la voce della fattura che lancia diventa un errore', async () => {
    const r = await salvaCategorieFornitori(db({ fornitori: fornitori.map(f => ({ ...f })) }), ORG, scelte, fornitori)
    expect(r.salvati).toBe(3)
    expect(r.errori).toEqual([])
    const f = await salvaCategoriaFattura(db({ fornitori: [], fatture: [fat('X', '2026-01-01', 1, { id: 'zz' })], lanciaDalla: 1 }), ORG, 'zz', 'attrezzature')
    expect(f.ok).toBe(false)
    expect(f.messaggio).toMatch(/rete caduta/)
  })
  it('a schermo: le voci riuscite escono dall\'elenco, quella caduta resta e il messaggio dice quante', async () => {
    const forn = [sched('a', 'ALFA'), sched('b', 'BETA')]
    const fatture = [fat('ALFA', '2026-09-01', 500), fat('BETA', '2026-09-01', 400)]
    const notify = vi.fn()
    render(<ClassificaSpese orgId={ORG} client={db({ fornitori: forn, fatture, lanciaDalla: 2 })} oggi={OGGI} notify={notify} />)
    await screen.findByRole('list', { name: 'Fornitori senza voce' })
    fireEvent.change(screen.getByLabelText('Voce di spesa di ALFA'), { target: { value: 'servizi' } })
    fireEvent.change(screen.getByLabelText('Voce di spesa di BETA'), { target: { value: 'utenze' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salva 2 voci' }))
    await waitFor(() => expect(notify).toHaveBeenCalled())
    expect(notify.mock.calls[0][0]).toMatch(/1 voce salvata, 1 no \(rete caduta\)/)
    const nomi = within(screen.getByRole('list', { name: 'Fornitori senza voce' })).getAllByRole('listitem').map(l => l.textContent)
    expect(nomi.length).toBe(1)
    expect(nomi[0]).toMatch(/BETA/)
  })
})

describe('scegliere in fretta', () => {
  const forn = [sched('d', 'DESA SRL'), sched('e', 'Enel Energia S.p.A.')]
  const fatture = [
    fat('DESA SRL', '2026-06-01', 3000), fat('DESA SRL', '2026-07-01', 1000), fat('DESA SRL', '2026-08-01', 2000),
    fat('Enel Energia S.p.A.', '2026-07-12', 1000),
  ]
  const monta = () => render(<ClassificaSpese orgId={ORG} client={db({ fornitori: forn, fatture })} oggi={OGGI} notify={() => {}} />)

  it('dice quanti restano, quanta spesa pesano e cosa si sblocca', async () => {
    monta()
    await screen.findByRole('list', { name: 'Fornitori senza voce' })
    expect(document.body.textContent).toMatch(/Ne restano 2, il 100% della spesa\. .*Conto economico/)
  })
  it('ogni riga ha l\'indizio: peso, importo medio, mesi su dodici', async () => {
    monta()
    const l = await screen.findByRole('list', { name: 'Fornitori senza voce' })
    const desa = within(l).getAllByRole('listitem')[0].textContent
    expect(desa).toMatch(/DESA/)
    expect(desa).toMatch(/85,7% della spesa/)
    expect(desa).toMatch(/media 2\.000 €/)
    expect(desa).toMatch(/3 mesi su 12/)
  })
  it('senza proposta: un tocco sulla voce, e la riga è scelta e spuntata', async () => {
    monta()
    const l = await screen.findByRole('list', { name: 'Fornitori senza voce' })
    fireEvent.click(within(l).getByRole('button', { name: 'Metti DESA SRL in Servizi' }))
    expect(screen.getByLabelText('Voce di spesa di DESA SRL').value).toBe('servizi')
    expect(screen.getByLabelText('Conferma la voce di DESA SRL').checked).toBe(true)
    expect(screen.getByRole('button', { name: 'Salva 2 voci' })).toBeTruthy()
    // scelta fatta: le voci rapide spariscono da quella riga
    expect(within(l).queryByRole('button', { name: 'Metti DESA SRL in Servizi' })).toBeNull()
  })
  it('intorno: con la proposta (Enel) non ci sono voci rapide; fornitoriDaFatture dà mesi e media', () => {
    monta()
    return screen.findByRole('list', { name: 'Fornitori senza voce' }).then(l => {
      expect(within(l).queryByRole('group', { name: 'Voci rapide per Enel Energia S.p.A.' })).toBeNull()
      const g = fornitoriDaFatture(fatture, { dal12: '2025-10-05' }).find(x => x.nome.startsWith('DESA'))
      expect(g.mesi12).toBe(3)
      expect(g.medio12).toBe(2000)
    })
  })
})
