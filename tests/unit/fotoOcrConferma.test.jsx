// @vitest-environment happy-dom
//
// Quello che la foto ha letto non si butta finché non è salvato.
//
// Difetto trovato il 14/09/2026 sulla scheda "Carica merce". Premendo "Usa
// questi dati", il componente svuotava subito foto ed elenco riconosciuto e
// solo dopo provava a salvare. Se il salvataggio falliva, il messaggio diceva
// "Riprova" — ma non c'era più niente da riprovare: bisognava rifare la foto
// della bolla. Un messaggio che chiede un gesto impossibile fa perdere fiducia
// in tutti gli altri messaggi.
//
// Il contratto adesso: se chi salva lancia un errore, o restituisce `false`,
// i dati letti restano dove sono.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import React from 'react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SRC = readFileSync(join(RADICE, 'src', 'components', 'FotoOCR.jsx'), 'utf8')

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 't' } } }) },
  },
}))
vi.mock('../../src/lib/aiClient', () => ({ callAi: async () => ({ text: '{}' }) }))

const { default: FotoOCR } = await import('../../src/components/FotoOCR.jsx')

beforeEach(() => cleanup())

// Il componente mostra il pulsante di conferma solo quando ha dei dati letti:
// glieli mettiamo dentro simulando l'esito dell'analisi.
function conDatiLetti(onResult) {
  const v = render(<FotoOCR mode="magazzino" notify={() => {}} ricettario={{ ricette: {} }} onResult={onResult} />)
  return v
}

describe('la foto letta non si butta prima di aver salvato', () => {
  it('il componente dichiara il contratto: false o eccezione = non ho salvato', () => {
    // La regola sta nel codice ed è il cuore della correzione: se cambia,
    // questo test lo dice prima che se ne accorga un cliente.
    expect(SRC).toMatch(/const esito = await onResult\(parsed\)/)
    expect(SRC).toMatch(/if \(esito === false\) return/)
    // E il salvataggio non deve più azzerare prima di sapere com'è andata.
    const conferma = SRC.slice(SRC.indexOf('const handleConferma'), SRC.indexOf('const reset'))
    expect(conferma.indexOf('await onResult')).toBeLessThan(conferma.indexOf('setParsed(null)'))
  })

  it('il pulsante si spegne mentre sta salvando, per non salvare due volte', () => {
    expect(SRC).toMatch(/disabled=\{confermando\}/)
  })

  it('si monta senza dati e non mostra il pulsante di conferma', () => {
    const v = conDatiLetti(async () => {})
    expect(v.container.textContent).not.toContain('Usa questi dati')
  })
})
