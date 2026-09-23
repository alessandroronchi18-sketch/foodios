// @vitest-environment happy-dom
//
// ── L'anagrafica che la bolla compila, e la pagina deve mostrare ─────────
//
// Il titolare, 22/09/2026: «ci sarebbe da creare un tool che caricando una
// bolla prende tutti i dati e compila la scheda del fornitore». Il tool è
// stato costruito: `datiFornitoreDaBolla` legge indirizzo, CAP, città,
// provincia, codice fiscale, PEC, sito e WhatsApp dalla testata del
// documento, e `SchedaFornitoreProposta` li scrive sul database.
//
// IL DIFETTO, trovato dall'audit del 23/09/2026: la pagina Fornitori non
// conosceva **nessuna** di quelle otto colonne. Otto colonne aggiunte al
// database, un estrattore che le riempie, un pannello che le salva — e
// nessuna schermata che le mostri. Il dato entrava e spariva dalla vista.
//
// È la quinta volta in due giorni che esce la stessa forma: **una metà che
// decide e una metà che agisce, giuste tutte e due, mai collegate.** Nessun
// test la vede, perché ogni file preso da solo è corretto.
//
// Due conseguenze pratiche, ed è per quelle che questo file esiste:
//
//   1. un dato letto male dalla foto (una PEC con una lettera sbagliata) non
//      si poteva **correggere**: non c'era nessun campo dove scriverlo;
//   2. peggio — aprire il fornitore per modificare qualsiasi altra cosa e
//      salvare avrebbe **svuotato** quelle otto colonne, se il form fosse
//      partito vuoto. La prova che conta di questo file è la terza.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act, cleanup } from '@testing-library/react'
import React from 'react'

const db = vi.hoisted(() => ({
  tabelle: {},
  scritture: [],
  reset() {
    this.tabelle = { fornitori: [], ordini_fornitori: [], righe_ordine: [], fatture: [] }
    this.scritture = []
  },
}))

vi.mock('../../src/lib/supabase', () => {
  const applica = (righe, filtri) => righe.filter(r => filtri.every(f => {
    if (f[0] === 'eq') return String(r[f[1]] ?? '') === String(f[2] ?? '')
    return true
  }))
  function costruisci(tabella) {
    const q = { tabella, op: 'select', payload: null, filtri: [], conteggio: false }
    const chiudi = (singolo) => {
      db.scritture.push({ tabella, op: q.op, payload: q.payload, filtri: q.filtri })
      const righe = db.tabelle[tabella] || (db.tabelle[tabella] = [])
      if (q.op === 'select') {
        const out = applica(righe, q.filtri)
        if (q.conteggio) return { data: null, error: null, count: out.length }
        return { data: singolo ? (out[0] ?? null) : out, error: null, count: out.length }
      }
      if (q.op === 'insert') {
        const nuove = (Array.isArray(q.payload) ? q.payload : [q.payload])
          .map((r, i) => ({ id: r.id || `${tabella}-${righe.length + i + 1}`, attivo: true, ...r }))
        righe.push(...nuove)
        return { data: singolo ? nuove[0] : nuove, error: null, count: nuove.length }
      }
      if (q.op === 'update') {
        const tocche = applica(righe, q.filtri)
        for (const r of tocche) Object.assign(r, q.payload)
        return { data: tocche, error: null, count: tocche.length }
      }
      return { data: null, error: null, count: 0 }
    }
    const c = {
      select(_cols, opts) { if (opts?.count) q.conteggio = true; return c },
      insert(p) { q.op = 'insert'; q.payload = p; return c },
      update(p) { q.op = 'update'; q.payload = p; return c },
      delete() { q.op = 'delete'; return c },
      eq(col, val) { q.filtri.push(['eq', col, val]); return c },
      gte(col, val) { q.filtri.push(['gte', col, val]); return c },
      or() { return c },
      order() { return c },
      limit() { return c },
      single: async () => chiudi(true),
      maybeSingle: async () => chiudi(true),
      then: (res, rej) => Promise.resolve(chiudi(false)).then(res, rej),
    }
    return c
  }
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) },
      from: (t) => costruisci(t),
      rpc: async () => ({ data: null, error: null }),
    },
  }
})

vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, sload: async () => null,
  ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))
vi.mock('../../src/lib/useIsMobile', () => ({ default: () => false, useIsTablet: () => false }))

const ORG = 'org-mara'

async function renderizza(props = {}) {
  const { default: Fornitori } = await import('../../src/components/Fornitori.jsx')
  let v
  await act(async () => {
    v = render(<Fornitori orgId={ORG} sedeId={null} sedi={[]} notify={() => {}} {...props} />)
  })
  await act(async () => { await new Promise(r => setTimeout(r, 40)) })
  return v
}

/** I campi nuovi si prendono per etichetta, non per posizione: una prova che
 *  conta gli `input` si rompe alla prima riga aggiunta al form, e allora
 *  qualcuno la "aggiusta" spostando gli indici invece di guardare cosa è
 *  cambiato. È successo il 22/09 con le tendine dei trasferimenti. */
const campo = (v, etichetta) => v.container.querySelector(`input[aria-label="${etichetta}"]`)
const campiNuovi = (v) => ({
  indirizzo: campo(v, 'Indirizzo del fornitore'),
  cap: campo(v, 'CAP del fornitore'),
  citta: campo(v, 'Città del fornitore'),
  provincia: campo(v, 'Provincia del fornitore'),
  cf: campo(v, 'Codice fiscale del fornitore'),
  pec: campo(v, 'PEC del fornitore'),
  sito: campo(v, 'Sito del fornitore'),
  whatsapp: campo(v, 'Numero WhatsApp del fornitore'),
})
const nomeFornitore = (v) => [...v.container.querySelectorAll('input[type="text"]')][0]
const salva = (v) => [...v.container.querySelectorAll('button')]
  .find(b => /^(Aggiungi|Salva modifiche)$/.test(b.textContent.trim()))
const ultimaScrittura = (op) => [...db.scritture].reverse().find(s => s.tabella === 'fornitori' && s.op === op)

beforeEach(() => { db.reset(); vi.clearAllMocks() })
afterEach(() => cleanup())

describe('I campi che la bolla compila esistono nella pagina', () => {
  it('tutti e otto, e si possono scrivere a mano', async () => {
    const v = await renderizza()
    const c = campiNuovi(v)
    for (const [nome, el] of Object.entries(c)) {
      expect(el, `manca il campo «${nome}»: il dato entra dal database e non lo vede nessuno`).toBeTruthy()
    }
  })

  it('e non sono di sola lettura: una PEC letta male dalla foto si corregge', async () => {
    // Il motivo per cui questi campi devono essere **scrivibili** e non solo
    // mostrati: l'estrazione dalla foto sbaglia, e se sbaglia deve esistere
    // il posto dove rimediare.
    const v = await renderizza()
    expect(campiNuovi(v).pec.readOnly).toBe(false)
    expect(campiNuovi(v).pec.disabled).toBe(false)
  })
})

describe('Quello che si scrive arriva al database, ripulito', () => {
  it('un fornitore nuovo salva tutte e otto le colonne', async () => {
    const v = await renderizza()
    const c = campiNuovi(v)
    await act(async () => {
      fireEvent.change(nomeFornitore(v), { target: { value: 'Molino Rossetto' } })
      fireEvent.change(c.indirizzo, { target: { value: '  Via Roma 12 ' } })
      fireEvent.change(c.citta, { target: { value: 'Torino' } })
      fireEvent.change(c.cap, { target: { value: '10123' } })
      fireEvent.change(c.provincia, { target: { value: 'to' } })
      fireEvent.change(c.cf, { target: { value: 'rss mra 80a01 l219k' } })
      fireEvent.change(c.pec, { target: { value: '  Molino@PEC.IT ' } })
      fireEvent.change(c.sito, { target: { value: 'www.molino.it' } })
      fireEvent.change(c.whatsapp, { target: { value: '+39 333 1234567' } })
    })
    await act(async () => { fireEvent.click(salva(v)) })
    await act(async () => { await new Promise(r => setTimeout(r, 30)) })

    const p = ultimaScrittura('insert')?.payload
    expect(p, 'il fornitore non è stato salvato').toBeTruthy()
    expect(p.indirizzo).toBe('Via Roma 12')
    expect(p.citta).toBe('Torino')
    expect(p.cap).toBe('10123')
    // La provincia è una sigla di due lettere maiuscole: «to» e «TO» sono la
    // stessa cosa, e due scritture diverse dello stesso dato fanno sembrare
    // due fornitori quello che è uno solo.
    expect(p.provincia).toBe('TO')
    // Il codice fiscale con gli spazi dentro non combacia con quello della
    // fattura elettronica, ed è così che il commercialista si ritrova due
    // anagrafiche per la stessa ditta.
    expect(p.codice_fiscale).toBe('RSSMRA80A01L219K')
    // Gli indirizzi di posta non hanno maiuscole: se si salva com'è scritto,
    // due PEC uguali sembrano diverse.
    expect(p.pec).toBe('molino@pec.it')
    expect(p.sito).toBe('www.molino.it')
    expect(p.whatsapp).toBe('+39 333 1234567')
  })

  it('un campo lasciato vuoto resta NULL, non diventa stringa vuota', async () => {
    // «Non lo so» e «è vuoto» sono cose diverse: sul database la differenza
    // fra NULL e '' decide se un domani si può dire «questo fornitore non ha
    // la PEC» oppure «non gliel'abbiamo mai chiesta».
    const v = await renderizza()
    await act(async () => { fireEvent.change(nomeFornitore(v), { target: { value: 'Ditta Nuda' } }) })
    await act(async () => { fireEvent.click(salva(v)) })
    await act(async () => { await new Promise(r => setTimeout(r, 30)) })
    const p = ultimaScrittura('insert')?.payload
    expect(p.pec).toBe(null)
    expect(p.indirizzo).toBe(null)
    expect(p.cap).toBe(null)
  })

  it('il CAP tiene solo le cifre e si ferma a cinque', async () => {
    const v = await renderizza()
    const c = campiNuovi(v)
    await act(async () => {
      fireEvent.change(nomeFornitore(v), { target: { value: 'Ditta CAP' } })
      fireEvent.change(c.cap, { target: { value: '10-123 456' } })
    })
    await act(async () => { fireEvent.click(salva(v)) })
    await act(async () => { await new Promise(r => setTimeout(r, 30)) })
    expect(ultimaScrittura('insert')?.payload.cap).toBe('10123')
  })
})

describe('La prova che conta: modificare non deve cancellare', () => {
  it('apro un fornitore, cambio il telefono, salvo — indirizzo e PEC restano', async () => {
    // Questo è il difetto vero, ed è silenzioso: se `initEdit` non carica le
    // otto colonne, il form parte vuoto, il salvataggio scrive il vuoto
    // sopra, e quello che la bolla aveva letto sparisce. Nessun messaggio,
    // nessun errore: il dato semplicemente non c'è più.
    db.tabelle.fornitori = [{
      id: 'f1', organization_id: ORG, attivo: true, nome: 'SUQQO S.R.L.',
      telefono: '011 111111', email: 'ordini@suqqo.it',
      indirizzo: 'Corso Francia 100', cap: '10143', citta: 'Torino', provincia: 'TO',
      codice_fiscale: 'SQQ00000000000X', pec: 'suqqo@pec.it',
      sito: 'www.suqqo.it', whatsapp: '+39 011 111111',
      termini_pagamento: 30, termini_tipo: 'netti',
    }]
    const v = await renderizza()
    const modifica = [...v.container.querySelectorAll('button')]
      .find(b => b.getAttribute('aria-label') === 'Modifica fornitore')
    expect(modifica, 'non trovo il comando per modificare il fornitore').toBeTruthy()
    await act(async () => { fireEvent.click(modifica) })
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })

    // I campi si sono riempiti con quello che c'era: è la metà che mancava.
    const c = campiNuovi(v)
    expect(c.indirizzo.value).toBe('Corso Francia 100')
    expect(c.pec.value).toBe('suqqo@pec.it')
    expect(c.whatsapp.value).toBe('+39 011 111111')

    await act(async () => { fireEvent.click(salva(v)) })
    await act(async () => { await new Promise(r => setTimeout(r, 30)) })

    const p = ultimaScrittura('update')?.payload
    expect(p, 'il salvataggio non è arrivato al database').toBeTruthy()
    expect(p.indirizzo).toBe('Corso Francia 100')
    expect(p.pec).toBe('suqqo@pec.it')
    expect(p.codice_fiscale).toBe('SQQ00000000000X')
    expect(p.sito).toBe('www.suqqo.it')
    expect(p.whatsapp).toBe('+39 011 111111')
    expect(p.citta).toBe('Torino')
    expect(p.provincia).toBe('TO')
    expect(p.cap).toBe('10143')
  })
})

describe('E in elenco si vedono, se no non servono a niente', () => {
  it('la scheda scrive l\'indirizzo su una riga sola, come lo scriverebbe una persona', async () => {
    db.tabelle.fornitori = [{
      id: 'f1', organization_id: ORG, attivo: true, nome: 'SUQQO S.R.L.',
      indirizzo: 'Corso Francia 100', cap: '10143', citta: 'Torino', provincia: 'TO',
      whatsapp: '+39 011 111111', termini_pagamento: 30,
    }]
    const v = await renderizza()
    const t = v.container.textContent || ''
    expect(t).toContain('Corso Francia 100')
    expect(t).toMatch(/10143\s+Torino \(TO\)/)
    expect(t).toContain('+39 011 111111')
  })

  it('e i pezzi che mancano non lasciano buchi né punti a vuoto', async () => {
    // Un fornitore di cui si sa solo la città non deve leggersi
    // «· Torino ()» o «undefined».
    db.tabelle.fornitori = [{
      id: 'f1', organization_id: ORG, attivo: true, nome: 'Mezza Anagrafica',
      citta: 'Torino', termini_pagamento: 30,
    }]
    const v = await renderizza()
    const t = v.container.textContent || ''
    expect(t).toContain('Torino')
    expect(t).not.toMatch(/undefined|null|\(\)|· ·/)
  })

  it('un fornitore senza niente di tutto questo non mostra una riga vuota', async () => {
    db.tabelle.fornitori = [{
      id: 'f1', organization_id: ORG, attivo: true, nome: 'Solo Nome', termini_pagamento: 30,
    }]
    const v = await renderizza()
    expect(v.container.textContent).toContain('Solo Nome')
    expect(v.container.textContent).not.toMatch(/undefined|NaN/)
  })
})
