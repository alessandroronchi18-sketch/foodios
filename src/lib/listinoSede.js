// Listino prezzi PER-SEDE (audit 2026-07-28).
//
// Il ricettario e i formati vendita sono SHARED a livello org (una sola
// definizione per tutte le sedi). Ma alcune organizzazioni multi-sede hanno
// bisogno di prezzi di vendita diversi tra sedi — es. Milano centro €5 la
// fetta, Poggibonsi periferia €3.50 la fetta.
//
// Modello: chiave PER-SEDE `SK_LISTINO_SEDE` con override esplicito rispetto
// ai valori base (ricettario / formati). Se una sede non ha override per una
// ricetta, eredita il valore base — così le sedi appena create partono
// automaticamente col listino base senza setup.
//
// Struttura JSON:
// {
//   ricette: { [nomeRicetta]: { prezzo?: number, unita?: number } },
//   formati: { [formatoId]: { prezzoDefault?: number } },
// }
//
// Solo i campi presenti sono override; i mancanti fanno fallback al base.

import { useEffect, useState, useMemo, useCallback } from 'react'
import { sload, ssave } from './storage'
import { getR } from './foodcost'

export const SK_LISTINO_SEDE = 'pasticceria-listino-sede-v1' // PER-SEDE

// ── Getter puri ──────────────────────────────────────────────────────────────

// Ritorna reg (unita/prezzo/tipo) effettiva applicando eventuali override.
// - listino: oggetto SK_LISTINO_SEDE della sede attiva (o null se all-sedi)
// Regola: se override.prezzo o override.unita esistono → li usa; il tipo NON
// e' overridabile (definisce la struttura della ricetta, non il pricing).
export function getRegSede(nome, ric, listino) {
  const base = getR(nome, ric)
  const ov = listino?.ricette?.[nome]
  if (!ov) return base
  return {
    ...base,
    prezzo: (typeof ov.prezzo === 'number' && Number.isFinite(ov.prezzo)) ? ov.prezzo : base.prezzo,
    unita:  (typeof ov.unita  === 'number' && Number.isFinite(ov.unita))  ? ov.unita  : base.unita,
  }
}

// Ritorna prezzoDefault effettivo del formato (override o base).
export function getPrezzoFormatoSede(formato, listino) {
  const base = Number(formato?.prezzoDefault) || 0
  const ov = listino?.formati?.[formato?.id]
  if (ov && typeof ov.prezzoDefault === 'number' && Number.isFinite(ov.prezzoDefault)) {
    return ov.prezzoDefault
  }
  return base
}

// Ritorna la lista formati con prezzoDefault sostituito dall'override (se
// presente). Così le funzioni downstream (avgPrezzoPerKgCategoria, riconcilia
// formati, ecc.) non hanno bisogno di sapere del listino sede.
export function applicaListinoAiFormati(formati, listino) {
  if (!Array.isArray(formati) || formati.length === 0) return formati || []
  return formati.map(f => ({
    ...f,
    prezzoDefault: getPrezzoFormatoSede(f, listino),
  }))
}

// Verifica se una ricetta ha almeno un override in QUALCHE sede (usato per
// mostrare badge "Prezzi differenziati" nella card).
export function haOverridePerRicetta(nome, listiniPerSede) {
  if (!listiniPerSede) return false
  for (const l of Object.values(listiniPerSede)) {
    if (l?.ricette?.[nome]) return true
  }
  return false
}

// ── Hook per la sede attiva ─────────────────────────────────────────────────

// Carica il listino della sede attiva. `sedeId=null` (all-sedi) → listino vuoto:
// nelle viste aggregate usiamo i prezzi base.
export function useListinoSede(orgId, sedeId) {
  const [listino, setListino] = useState({ ricette: {}, formati: {} })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId || !sedeId) { setListino({ ricette: {}, formati: {} }); setLoading(false); return }
    let alive = true
    setLoading(true)
    sload(SK_LISTINO_SEDE, orgId, sedeId).then(v => {
      if (!alive) return
      const norm = (v && typeof v === 'object') ? v : {}
      setListino({
        ricette: norm.ricette && typeof norm.ricette === 'object' ? norm.ricette : {},
        formati: norm.formati && typeof norm.formati === 'object' ? norm.formati : {},
      })
      setLoading(false)
    }).catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [orgId, sedeId])

  // Getter derivati che chiudono su `listino` corrente — comodi per le view.
  const getReg = useCallback((nome, ric) => getRegSede(nome, ric, listino), [listino])
  const getPrezzoFormato = useCallback((formato) => getPrezzoFormatoSede(formato, listino), [listino])

  // Salva un override prezzo/unita per una ricetta su questa sede. `patch`:
  // { prezzo?, unita? }. Se entrambi sono uguali ai valori base della ricetta,
  // rimuove l'override (per non lasciare "override fantasma" identici al base).
  const saveOverrideRicetta = useCallback(async (nome, patch, ricettaBase) => {
    if (!orgId || !sedeId || !nome) return
    const base = getR(nome, ricettaBase || null)
    const nuovoRicette = { ...(listino.ricette || {}) }
    const cur = nuovoRicette[nome] || {}
    const merged = { ...cur }
    if (typeof patch?.prezzo === 'number' && Number.isFinite(patch.prezzo)) merged.prezzo = patch.prezzo
    if (typeof patch?.unita  === 'number' && Number.isFinite(patch.unita))  merged.unita  = patch.unita
    const isIdenticoBase =
      (merged.prezzo == null || merged.prezzo === base.prezzo) &&
      (merged.unita  == null || merged.unita  === base.unita)
    if (isIdenticoBase) {
      delete nuovoRicette[nome]
    } else {
      nuovoRicette[nome] = merged
    }
    const nuovo = { ...listino, ricette: nuovoRicette }
    await ssave(SK_LISTINO_SEDE, nuovo, orgId, sedeId)
    setListino(nuovo)
    return nuovo
  }, [orgId, sedeId, listino])

  const saveOverrideFormato = useCallback(async (formatoId, patch, formatoBase) => {
    if (!orgId || !sedeId || !formatoId) return
    const baseP = Number(formatoBase?.prezzoDefault) || 0
    const nuoviFormati = { ...(listino.formati || {}) }
    const cur = nuoviFormati[formatoId] || {}
    const merged = { ...cur }
    if (typeof patch?.prezzoDefault === 'number' && Number.isFinite(patch.prezzoDefault)) merged.prezzoDefault = patch.prezzoDefault
    const isIdenticoBase = merged.prezzoDefault == null || merged.prezzoDefault === baseP
    if (isIdenticoBase) {
      delete nuoviFormati[formatoId]
    } else {
      nuoviFormati[formatoId] = merged
    }
    const nuovo = { ...listino, formati: nuoviFormati }
    await ssave(SK_LISTINO_SEDE, nuovo, orgId, sedeId)
    setListino(nuovo)
    return nuovo
  }, [orgId, sedeId, listino])

  const hasOverride = useMemo(() => {
    const nR = Object.keys(listino.ricette || {}).length
    const nF = Object.keys(listino.formati || {}).length
    return nR > 0 || nF > 0
  }, [listino])

  return { listino, loading, getReg, getPrezzoFormato, saveOverrideRicetta, saveOverrideFormato, hasOverride }
}

// ── Save diretto per sedeId (usato dalla modale multi-sede) ────────────────

// Salva un override prezzo/unita per una ricetta su una sede specifica —
// utile per la modale "Prezzi per sede" che scrive in batch su più sedi
// diverse (fuori scope del hook single-sede useListinoSede).
export async function saveOverrideRicettaSede({ orgId, sedeId, nome, patch, ricettaBase }) {
  if (!orgId || !sedeId || !nome) return null
  const cur = (await sload(SK_LISTINO_SEDE, orgId, sedeId)) || {}
  const listino = {
    ricette: cur.ricette && typeof cur.ricette === 'object' ? { ...cur.ricette } : {},
    formati: cur.formati && typeof cur.formati === 'object' ? { ...cur.formati } : {},
  }
  const base = getR(nome, ricettaBase || null)
  const oldOv = listino.ricette[nome] || {}
  const merged = { ...oldOv }
  if (typeof patch?.prezzo === 'number' && Number.isFinite(patch.prezzo)) merged.prezzo = patch.prezzo
  if (typeof patch?.unita  === 'number' && Number.isFinite(patch.unita))  merged.unita  = patch.unita
  const isIdenticoBase =
    (merged.prezzo == null || merged.prezzo === base.prezzo) &&
    (merged.unita  == null || merged.unita  === base.unita)
  if (isIdenticoBase) {
    delete listino.ricette[nome]
  } else {
    listino.ricette[nome] = merged
  }
  await ssave(SK_LISTINO_SEDE, listino, orgId, sedeId)
  return listino
}

// Analog per formati vendita.
export async function saveOverrideFormatoSede({ orgId, sedeId, formatoId, patch, formatoBase }) {
  if (!orgId || !sedeId || !formatoId) return null
  const cur = (await sload(SK_LISTINO_SEDE, orgId, sedeId)) || {}
  const listino = {
    ricette: cur.ricette && typeof cur.ricette === 'object' ? { ...cur.ricette } : {},
    formati: cur.formati && typeof cur.formati === 'object' ? { ...cur.formati } : {},
  }
  const baseP = Number(formatoBase?.prezzoDefault) || 0
  const oldOv = listino.formati[formatoId] || {}
  const merged = { ...oldOv }
  if (typeof patch?.prezzoDefault === 'number' && Number.isFinite(patch.prezzoDefault)) merged.prezzoDefault = patch.prezzoDefault
  const isIdenticoBase = merged.prezzoDefault == null || merged.prezzoDefault === baseP
  if (isIdenticoBase) {
    delete listino.formati[formatoId]
  } else {
    listino.formati[formatoId] = merged
  }
  await ssave(SK_LISTINO_SEDE, listino, orgId, sedeId)
  return listino
}

// ── Loader multi-sede (per la modale "Prezzi per sede" nella card) ─────────

// Carica in parallelo i listini di tutte le sedi elencate. Ritorna una mappa
// { [sedeId]: listino }. Usato dalla modale di edit per mostrare la tabella
// completa "sede × prezzo × unità" e permettere override multi-sede in un
// solo passaggio.
export function useListiniTutteSedi(orgId, sedi) {
  const [listini, setListini] = useState({})
  const [loading, setLoading] = useState(true)
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    if (!orgId || !Array.isArray(sedi) || sedi.length === 0) { setListini({}); setLoading(false); return }
    let alive = true
    setLoading(true)
    Promise.all(sedi.map(async s => {
      const v = await sload(SK_LISTINO_SEDE, orgId, s.id).catch(() => null)
      const norm = (v && typeof v === 'object') ? v : {}
      return [s.id, {
        ricette: norm.ricette && typeof norm.ricette === 'object' ? norm.ricette : {},
        formati: norm.formati && typeof norm.formati === 'object' ? norm.formati : {},
      }]
    })).then(rows => {
      if (!alive) return
      setListini(Object.fromEntries(rows))
      setLoading(false)
    })
    return () => { alive = false }
  }, [orgId, sedi, reloadTick])

  const reload = useCallback(() => setReloadTick(t => t + 1), [])

  return { listini, loading, reload }
}
