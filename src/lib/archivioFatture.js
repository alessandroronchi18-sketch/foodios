// ── L'archivio delle fatture: tutte, pagate e da pagare ─────────────────
//
// 05/10/2026, il titolare: «mi manca una pagina in Fornitori dove vedo tutte
// le fatture insieme, tutte, pagate e non pagate». Lo Scadenzario guarda
// quello che c'è da pagare; qui c'è tutto lo storico. Le funzioni sono
// pure (si provano senza database); la lettura prende il client da chi
// chiama, come `contoEconomicoArchivio.js`.
import { colonnaMancante } from './fattureImport'
import { categoriaDellaFattura, categoriaPerId } from './contoEconomico'

export const PAGINA_LETTURA = 1000
export const RIGHE_PER_VOLTA = 50

const COLONNE_BASE = 'id, fornitore, numero_rif, data_fattura, totale, imponibile, imposta, stato, data_pagamento, data_scadenza, tipo, sede_id, sedi_condivise, piva'
// Colonne che possono non esserci ancora in un database vecchio.
const FACOLTATIVE = ['categoria_spesa', 'note']

const giornoValido = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? ''))

/**
 * Le fatture di un periodo (per data della fattura), mille alla volta.
 * Una colonna facoltativa che manca si toglie e si rilegge, senza fermarsi.
 */
export async function leggiArchivioFatture(supabase, orgId, { dal = null, al = null } = {}) {
  if (!orgId) throw new Error('manca l\'azienda')
  if ((dal && !giornoValido(dal)) || (al && !giornoValido(al))) throw new Error('periodo non valido: servono date AAAA-MM-GG')
  let extra = [...FACOLTATIVE]
  const fatture = []
  for (let offset = 0; offset < 200000; offset += PAGINA_LETTURA) {
    let data, error
    for (let giri = 0; giri <= FACOLTATIVE.length; giri++) {
      let q = supabase.from('fatture').select([COLONNE_BASE, ...extra].join(', ')).eq('organization_id', orgId)
      if (dal) q = q.gte('data_fattura', dal)
      if (al) q = q.lte('data_fattura', al)
      ;({ data, error } = await q.order('data_fattura', { ascending: false }).order('id', { ascending: true })
        .range(offset, offset + PAGINA_LETTURA - 1))
      const mancante = error ? colonnaMancante(error) : null
      if (mancante && extra.includes(mancante)) { extra = extra.filter(c => c !== mancante); continue }
      break
    }
    if (error) throw new Error(error.message || 'lettura delle fatture non riuscita')
    fatture.push(...(data || []))
    if (!data || data.length < PAGINA_LETTURA) break
  }
  return { fatture, conNote: extra.includes('note') }
}

const piano = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const eNumero = (x) => x != null && x !== '' && Number.isFinite(Number(x))

export const SENZA_SEDE = 'senza-sede'
export const SENZA_VOCE = 'senza-voce'

/** Pagata o da pagare: ogni stato che non è «pagata» è ancora da pagare. */
export const ePagata = (f) => String(f?.stato ?? '').toLowerCase() === 'pagata'

const sediDi = (f) => {
  const c = Array.isArray(f?.sedi_condivise) ? f.sedi_condivise.filter(Boolean) : []
  if (c.length) return c
  return f?.sede_id ? [f.sede_id] : []
}

/** Aggiunge a ogni fattura la voce di spesa (propria o del fornitore). */
export function conLaVoce(fatture, categoriePerFornitore) {
  return (fatture || []).map(f => ({ ...f, voce: categoriaDellaFattura(f, categoriePerFornitore) }))
}

/**
 * Filtra. `stato`: 'tutte' | 'pagate' | 'da-pagare'. `sede`: id, SENZA_SEDE o ''.
 * `voce`: id della voce, SENZA_VOCE o ''. `cerca`: pezzo del fornitore o del numero.
 */
export function filtraFatture(fatture, { cerca = '', stato = 'tutte', sede = '', voce = '' } = {}) {
  const q = piano(cerca)
  return (fatture || []).filter(f => {
    if (stato === 'pagate' && !ePagata(f)) return false
    if (stato === 'da-pagare' && ePagata(f)) return false
    if (sede) {
      const s = sediDi(f)
      if (sede === SENZA_SEDE ? s.length > 0 : !s.includes(sede)) return false
    }
    if (voce) {
      const v = f.voce ?? null
      if (voce === SENZA_VOCE ? v != null : v !== voce) return false
    }
    if (q && !piano(f.fornitore).includes(q) && !piano(f.numero_rif).includes(q)) return false
    return true
  })
}

/** Dalla più recente; a parità di data, per fornitore e numero (ordine stabile). */
export function ordinaPerData(fatture) {
  return [...(fatture || [])].sort((a, b) => {
    const da = String(a.data_fattura ?? ''), db = String(b.data_fattura ?? '')
    if (da !== db) return da < db ? 1 : -1
    return String(a.fornitore ?? '').localeCompare(String(b.fornitore ?? '')) || String(a.numero_rif ?? '').localeCompare(String(b.numero_rif ?? ''))
  })
}

const eNotaDiCredito = (f) => String(f?.tipo ?? '').toLowerCase().includes('nota')
const conSegno = (f) => {
  const t = eNumero(f.totale) ? Number(f.totale) : 0
  return eNotaDiCredito(f) ? -Math.abs(t) : t
}

/**
 * I totali di quello che si vede. Una nota di credito entra col segno meno.
 * `senzaImponibile`: fatture il cui totale è IVA compresa perché manca
 * l'imponibile (vuoto o zero).
 */
export function totaliFatture(fatture) {
  let totale = 0, pagato = 0, daPagare = 0, senzaImponibile = 0, nPagate = 0, nDaPagare = 0
  for (const f of fatture || []) {
    const v = conSegno(f)
    totale += v
    if (ePagata(f)) { pagato += v; nPagate++ } else { daPagare += v; nDaPagare++ }
    if (!(eNumero(f.imponibile) && Number(f.imponibile) !== 0)) senzaImponibile++
  }
  const r = (x) => Math.round(x * 100) / 100
  return { quante: (fatture || []).length, totale: r(totale), pagato: r(pagato), daPagare: r(daPagare), nPagate, nDaPagare, senzaImponibile }
}

/** Le prime righe (50 per volta): `altre` dice quante restano. */
export function paginaFatture(fatture, volte = 1, perVolta = RIGHE_PER_VOLTA) {
  const fino = Math.max(1, volte) * perVolta
  const righe = (fatture || []).slice(0, fino)
  return { righe, altre: Math.max(0, (fatture || []).length - righe.length) }
}

/** La data della fattura più vecchia (AAAA-MM-GG), o null se non ce ne sono. */
export async function primaDataArchivio(supabase, orgId) {
  if (!orgId) throw new Error('manca l\'azienda')
  const { data, error } = await supabase.from('fatture').select('data_fattura').eq('organization_id', orgId)
    .not('data_fattura', 'is', null).order('data_fattura', { ascending: true }).limit(1)
  if (error) throw new Error(error.message || 'lettura della prima fattura non riuscita')
  const d = String(data?.[0]?.data_fattura ?? '').slice(0, 10)
  return giornoValido(d) ? d : null
}

export const nomeDellaVoce =(id) => categoriaPerId(id)?.nome || ''

/** Le sedi di una fattura, scritte: «Berthollet + De Gasperi». */
export function sedeScritta(f, sedi) {
  const s = sediDi(f).map(id => (sedi || []).find(x => x.id === id)?.nome).filter(Boolean)
  return s.join(' + ')
}

const cella = (v) => {
  const s = String(v ?? '')
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const virgola = (x) => (eNumero(x) ? Number(x).toFixed(2).replace('.', ',') : '')

/** Il CSV di quello che si vede: separatore «;», decimali con la virgola, BOM per Excel. */
export function csvFatture(fatture, sedi = []) {
  const testa = ['Data', 'Fornitore', 'Numero', 'Sede', 'Voce', 'Stato', 'Pagata il', 'Scadenza', 'Imponibile', 'IVA', 'Totale', 'Nota']
  const righe = (fatture || []).map(f => [
    f.data_fattura, f.fornitore, f.numero_rif, sedeScritta(f, sedi), nomeDellaVoce(f.voce),
    ePagata(f) ? 'pagata' : 'da pagare', f.data_pagamento, f.data_scadenza,
    virgola(f.imponibile), virgola(f.imposta), virgola(f.totale), f.note,
  ])
  return '﻿' + [testa, ...righe].map(r => r.map(cella).join(';')).join('\r\n')
}
