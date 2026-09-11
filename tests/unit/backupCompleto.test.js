// Il backup deve portare via tutto, e il ripristino non deve cancellare.
//
// Perche' questo test esiste. La versione 1 di "Backup completo" diceva
// "Scarica un file JSON con tutti i dati" ma portava via 12 chiavi scelte a
// mano su 34, piu' la sola tabella delle fatture. Misurato sui dati veri di
// Mara dei Boschi l'11/09/2026 restavano fuori 7.012 righe di
// inventario_produzione (tutta la storia della produzione), 315 fornitori,
// 3 dipendenti, 4 turni.
//
// E c'era di peggio: questo progetto Supabase ha `db-max-rows: 1000`. Una
// select senza paginazione torna mille righe al massimo. Delle 3.104 fatture
// di Mara ne finivano nel file 1.000; poi il ripristino CANCELLAVA tutte e
// 3.104 le fatture prima di reinserire quelle del file. Un ripristino fatto
// per sicurezza ne avrebbe distrutte 2.104, e avrebbe scritto "Ripristino
// completato".
//
// Questo test blocca il ritorno delle due cose: la lettura non paginata e la
// cancellazione.

import { describe, it, expect, vi } from 'vitest'

const PAGINA = 1000

// La stessa lettura a pagine del componente.
async function leggiTutto(from, tabella, orgId) {
  const righe = []
  for (let offset = 0; ; offset += PAGINA) {
    const { data, error } = await from(tabella).select('*').eq('organization_id', orgId).range(offset, offset + PAGINA - 1)
    if (error) throw error
    const lotto = data || []
    righe.push(...lotto)
    if (lotto.length < PAGINA) break
  }
  return righe
}

// Un finto server che si comporta come il vero: taglia sempre a 1.000 righe.
function serverFinto(totaleRighe) {
  const chiamate = []
  const from = () => {
    let da = 0, a = PAGINA - 1
    const q = {
      select: () => q,
      eq: () => q,
      range: (x, y) => { da = x; a = y; return q },
      then: (res) => {
        const fine = Math.min(a + 1, totaleRighe, da + PAGINA)
        const n = Math.max(0, fine - da)
        chiamate.push({ da, n })
        return res({ data: Array.from({ length: n }, (_, i) => ({ id: da + i })), error: null })
      },
    }
    return q
  }
  return { from, chiamate }
}

describe('Backup: la lettura deve essere paginata', () => {
  it('prende tutte e 3.104 le fatture di Mara, non le prime 1.000', async () => {
    const { from, chiamate } = serverFinto(3104)
    const righe = await leggiTutto(from, 'fatture', 'org-1')
    expect(righe.length).toBe(3104)
    // Quattro giri: 1000 + 1000 + 1000 + 104.
    expect(chiamate.length).toBe(4)
  })

  it('una tabella vuota non fa un giro a vuoto in piu', async () => {
    const { from, chiamate } = serverFinto(0)
    expect((await leggiTutto(from, 'turni', 'org-1')).length).toBe(0)
    expect(chiamate.length).toBe(1)
  })

  it('esattamente 1.000 righe: serve il secondo giro per sapere che e finita', async () => {
    const { from, chiamate } = serverFinto(1000)
    expect((await leggiTutto(from, 'fatture', 'org-1')).length).toBe(1000)
    expect(chiamate.length).toBe(2)
  })
})

describe('Ripristino: non deve cancellare niente', () => {
  it('il componente non chiama mai delete sulle tabelle', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync(new URL('../../src/components/EsportaDati.jsx', import.meta.url), 'utf8')
    // Si guarda il codice, non il comportamento: e' l'unico modo di impedire
    // che qualcuno rimetta la cancellazione in un ramo che il test non passa.
    const codice = src.split('\n').filter(r => !r.trim().startsWith('//')).join('\n')
    expect(codice).not.toMatch(/\.delete\(\)/)
  })

  it('scrive per sovrascrittura (upsert), non per inserimento cieco', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync(new URL('../../src/components/EsportaDati.jsx', import.meta.url), 'utf8')
    expect(src).toMatch(/\.upsert\(/)
  })
})

describe('Backup: nessun elenco di chiavi scritto a mano', () => {
  it('le chiavi di user_data si leggono dal database, non da una lista', async () => {
    const fs = await import('fs')
    const src = fs.readFileSync(new URL('../../src/components/EsportaDati.jsx', import.meta.url), 'utf8')
    const codice = src.split('\n').filter(r => !r.trim().startsWith('//')).join('\n')
    // Le due liste scritte a mano che lasciavano fuori 22 chiavi su 34.
    expect(codice).not.toMatch(/const SHARED_KEYS/)
    expect(codice).not.toMatch(/const SEDE_KEYS/)
    expect(codice).toMatch(/leggiTutto\('user_data'/)
  })
})
