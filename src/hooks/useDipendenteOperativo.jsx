// useDipendenteOperativo — identita' operativa dentro un account laboratorio.
//
// Modello: dopo il login del laboratorio (email condivisa + password condivisa)
// il dipendente si identifica col suo codice a 4 cifre. Il codice viene
// validato server-side (RPC dipendente_operativo_valida) e i dati del
// dipendente vengono tenuti in Context + localStorage.
//
// Persistenza: localStorage 'foodios_dip_op' → { id, nome, cognome, at }.
// Se cambio user Supabase (nuovo login), pulisco: la chiave e' scoped al
// singolo laboratorio ma se un altro laboratorio si logga sul tablet lo
// resetto per sicurezza (basato su user.id in userScope).
//
// deseleziona() = torna alla schermata "Chi sei?" (chiamato da:
//   - bottone "Cambia dipendente" nell'header Dashboard
//   - useAutoLogoutDipendente dopo 30min inattivita')
// NON fa signOut Supabase: la password laboratorio resta attiva.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const LS_KEY = 'foodios_dip_op'

const DipendenteOperativoContext = createContext(null)

function readFromStorage(userScope) {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const j = JSON.parse(raw)
    if (!j || typeof j !== 'object') return null
    // Scope: se lo user Supabase e' cambiato, considero stale.
    if (userScope && j.userScope && j.userScope !== userScope) return null
    return j
  } catch { return null }
}

function writeToStorage(dip) {
  try {
    if (dip) localStorage.setItem(LS_KEY, JSON.stringify(dip))
    else localStorage.removeItem(LS_KEY)
  } catch { /* Safari private / quota */ }
}

export function DipendenteOperativoProvider({ userScope, enabled, children }) {
  // enabled = true solo per account laboratorio. Titolari e dipendenti "vecchio
  // stile" (col loro auth.users) non passano da qui.
  const [dip, setDip] = useState(() => {
    if (!enabled) return null
    const stored = readFromStorage(userScope)
    // Se non c'e' scope match, pulisci lo storage per non far leggere id stale
    // agli helper client-side (stockPF.js, trasferimenti.js, ecc.).
    if (!stored) writeToStorage(null)
    return stored
  })

  // Reset se cambia lo scope (user Supabase diverso) o se enabled diventa false.
  // Audit 2026-07-29 CRITICO: fondamentale scrivere null in localStorage quando
  // enabled=false, altrimenti un titolare che entra dopo un dipendente vede le
  // sue operazioni loggate a nome del dipendente precedente (readDipendenteOpId
  // in stockPF.js/venditeB2B.js/haccp.jsx legge foodios_dip_op ciecamente).
  useEffect(() => {
    if (!enabled) {
      writeToStorage(null)
      setDip(null)
      return
    }
    const stored = readFromStorage(userScope)
    if (!stored) writeToStorage(null)  // scope mismatch: pulisci
    setDip(stored)
  }, [enabled, userScope])

  const seleziona = useCallback(async (codice) => {
    if (!codice) return { ok: false, error: 'codice_mancante' }
    const { data, error } = await supabase.rpc('dipendente_operativo_valida', { p_codice: codice })
    if (error) return { ok: false, error: 'rpc_error', message: error.message }
    if (!data?.ok) return { ok: false, error: data?.error || 'codice_non_valido' }
    const next = {
      id: data.id,
      nome: data.nome || '',
      cognome: data.cognome || '',
      ruolo: data.ruolo || null,
      at: Date.now(),
      userScope,
    }
    writeToStorage(next)
    setDip(next)
    return { ok: true, dipendente: next }
  }, [userScope])

  const deseleziona = useCallback(() => {
    writeToStorage(null)
    setDip(null)
  }, [])

  const value = useMemo(() => ({
    dipendente: dip,           // { id, nome, cognome, ruolo, at } | null
    isSelezionato: !!dip?.id,
    seleziona,
    deseleziona,
    enabled: !!enabled,
  }), [dip, seleziona, deseleziona, enabled])

  return (
    <DipendenteOperativoContext.Provider value={value}>
      {children}
    </DipendenteOperativoContext.Provider>
  )
}

export function useDipendenteOperativo() {
  const ctx = useContext(DipendenteOperativoContext)
  // Fallback safe: se non c'e' Provider (es. titolare senza laboratorio), tutto disabled.
  if (!ctx) {
    return {
      dipendente: null,
      isSelezionato: false,
      seleziona: async () => ({ ok: false, error: 'no_provider' }),
      deseleziona: () => {},
      enabled: false,
    }
  }
  return ctx
}
