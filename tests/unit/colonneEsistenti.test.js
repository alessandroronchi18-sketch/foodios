// Le colonne che il codice chiede al database devono esistere.
//
// Il 09/09/2026 un censimento su tutte le `.from('fatture').select(...)` ha
// trovato SEI file che chiedevano colonne inesistenti: `importo_lordo`,
// `fornitore_nome`, `iva`, `importo`, `data_emissione`. PostgREST risponde 400
// con codice 42703 e mette `data` a null, quindi chi leggeva `res.data || []`
// vedeva zero fatture e dava il suo verdetto su zero:
//
//   CashflowView      KPI "Cassa fra 60 giorni" verde e nessun giorno rosso,
//                     mentre lo Scadenziario contava 81.079 € già scaduti
//   ExportContabilita `throw error`: l'export per il commercialista falliva
//                     SEMPRE, con un errore Postgres a schermo
//   BrainView, aiEngine  l'AI consigliava senza vedere le fatture da pagare
//   ConfrontoSedi     confronto fra sedi senza le fatture
//   api/admin.js      cinque query: KPI clienti e scadenziario del pannello
//                     admin calcolati su zero righe
//
// Nessuno di questi guasti era visibile: non c'è un errore rosso, c'è uno zero.
// Questo test legge lo schema dalle migration e verifica ogni select del
// codice, così un nome sbagliato si ferma qui invece di diventare un verdetto
// sbagliato in produzione.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// ── Schema dalle migration ─────────────────────────────────────────────────
// Le migration sono idempotenti e additive: leggendole in ordine di nome si
// ricostruisce lo stato delle tabelle senza toccare il database.
function leggiSchema() {
  const dir = join(RADICE, 'supabase', 'migrations')
  const files = readdirSync(dir).filter(f => f.endsWith('.sql')).sort()
  const tabelle = {}
  for (const f of files) {
    const sql = readFileSync(join(dir, f), 'utf8')

    // create table [if not exists] [public.]nome ( ... );
    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_0-9]+)\s*\(([\s\S]*?)\n\s*\);/gi)) {
      const nome = m[1].toLowerCase()
      const corpo = m[2]
      const cols = tabelle[nome] || new Set()
      for (const riga of corpo.split('\n')) {
        const t = riga.trim()
        if (!t || t.startsWith('--')) continue
        // salta i vincoli di tabella
        if (/^(primary|unique|foreign|constraint|check|exclude)\b/i.test(t)) continue
        const c = t.match(/^([a-z_0-9]+)\s+/i)
        if (c) cols.add(c[1].toLowerCase())
      }
      tabelle[nome] = cols
    }

    // alter table X add column a ..., add column b ..., add column c ...;
    // Un solo comando può aggiungere più colonne separate da virgola: va
    // letto fino al punto e virgola, non solo la prima.
    for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z_0-9]+)([\s\S]*?);/gi)) {
      const nome = m[1].toLowerCase()
      const corpo = m[2]
      for (const c of corpo.matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_0-9]+)/gi)) {
        if (!tabelle[nome]) tabelle[nome] = new Set()
        tabelle[nome].add(c[1].toLowerCase())
      }
    }

    // rename column vecchio to nuovo
    for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z_0-9]+)\s+rename\s+column\s+([a-z_0-9]+)\s+to\s+([a-z_0-9]+)/gi)) {
      const nome = m[1].toLowerCase()
      if (!tabelle[nome]) continue
      tabelle[nome].delete(m[2].toLowerCase())
      tabelle[nome].add(m[3].toLowerCase())
    }
  }
  return tabelle
}

// ── Select nel codice ──────────────────────────────────────────────────────
function elencaFile(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) elencaFile(p, out)
    else if (/\.(js|jsx)$/.test(e.name)) out.push(p)
  }
  return out
}

function trovaSelect() {
  const fonti = [join(RADICE, 'src'), join(RADICE, 'api')]
  const trovate = []
  for (const base of fonti) {
    for (const file of elencaFile(base)) {
      const testo = readFileSync(file, 'utf8')
      for (const m of testo.matchAll(/from\(['"]([a-z_0-9]+)['"]\)\s*(?:\n\s*)?\.?\s*select\(\s*['"]([^'"]+)['"]/gi)) {
        trovate.push({
          file: file.replace(RADICE + '/', ''),
          riga: testo.slice(0, m.index).split('\n').length,
          tabella: m[1].toLowerCase(),
          colonne: m[2],
        })
      }
    }
  }
  return trovate
}

// Una voce di select può essere: "col", "*", "alias:col", "rel(sub)",
// "col.eq.x" (nei filtri or), "count". Ci interessano solo i nomi di colonna.
function colonneSemplici(spec) {
  const out = []
  // via le relazioni annidate: rel(a,b) e rel!inner(a,b)
  const senzaRel = spec.replace(/[a-z_0-9!]+\s*\([^)]*\)/gi, '')
  for (let pezzo of senzaRel.split(',')) {
    pezzo = pezzo.trim()
    if (!pezzo || pezzo === '*') continue
    if (pezzo.includes(':')) pezzo = pezzo.split(':').pop().trim()  // alias:colonna
    if (!/^[a-z_0-9]+$/i.test(pezzo)) continue
    out.push(pezzo.toLowerCase())
  }
  return out
}

const schema = leggiSchema()
const selects = trovaSelect()

describe('le colonne chieste al database esistono nello schema', () => {
  it('le migration descrivono le tabelle che il codice interroga', () => {
    // Se questo si rompe, il parser dello schema ha smesso di funzionare e il
    // resto del test non varrebbe niente.
    expect(Object.keys(schema).length).toBeGreaterThan(20)
    expect(schema['fatture']).toBeTruthy()
    expect(schema['fatture'].has('totale')).toBe(true)
    expect(schema['fatture'].has('importo_lordo')).toBe(false)
  })

  it('trova le select nel codice', () => {
    expect(selects.length).toBeGreaterThan(30)
  })

  it('nessuna select chiede una colonna che non esiste', () => {
    const guasti = []
    for (const s of selects) {
      const cols = schema[s.tabella]
      // Tabella non descritta dalle migration (vista, tabella di sistema,
      // tabella creata altrove): non possiamo giudicare, la saltiamo.
      if (!cols) continue
      for (const c of colonneSemplici(s.colonne)) {
        if (!cols.has(c)) guasti.push(`${s.file}:${s.riga} → ${s.tabella}.${c}`)
      }
    }
    expect(guasti, `colonne inesistenti:\n  ${guasti.join('\n  ')}`).toEqual([])
  })
})
