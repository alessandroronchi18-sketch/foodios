// useDipendenteOperativo — identita' operativa dentro un account laboratorio.
//
// Modello: dopo il login del laboratorio (email condivisa + password condivisa)
// il dipendente si identifica col suo codice a 4 cifre. Il codice viene
// validato server-side (RPC dipendente_operativo_valida) che apre anche una
// SESSIONE server-side (tabella dipendente_operativo_sessioni). Il session_id
// viene salvato in localStorage col resto — un trigger BEFORE INSERT sulle 5
// tabelle operative rifiuta le operazioni senza sessione attiva. Così non
// basta modificare foodios_dip_op nel browser per loggare a nome altrui:
// serve avere il codice per aprire davvero la sessione.
//
// Persistenza: localStorage 'foodios_dip_op' → { id, nome, cognome, at, sessionId, userScope }.
//
// deseleziona() = torna alla schermata "Chi sei?":
//   - bottone "Cambia" nell'header Dashboard / drawer profilo
//   - useAutoLogoutDipendente dopo 30min inattivita'
// Chiama la RPC `dipendente_operativo_termina` che chiude la sessione
// server-side. NON fa signOut Supabase (la password laboratorio resta attiva).
//
// Session check al mount: se il localStorage ha una sessione ma il server
// dice che non è più attiva (deploy, scadenza 12h, disattivazione codice
// dal titolare, sessione manomessa), pulisce e forza SelezionaDipendente.

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
    if (!stored) writeToStorage(null)
    setDip(stored)
  }, [enabled, userScope])

  // Session check server-side al mount: se il client crede di avere una
  // sessione attiva ma il server dice di no (deploy che ha invalidato le
  // sessioni, scadenza 12h, codice disattivato dal titolare mentre il tablet
  // era spento, sessione manomessa), pulisce localStorage e forza il ritorno
  // a "Chi sei?". Fix v2 sicurezza (migration 20260730).
  useEffect(() => {
    if (!enabled || !dip?.sessionId) return
    let alive = true
    supabase.rpc('dipendente_operativo_session_check', { p_session_id: dip.sessionId })
      .then(({ data, error }) => {
        if (!alive || error) return
        if (!data?.ok) {
          writeToStorage(null)
          setDip(null)
        }
      })
    return () => { alive = false }
    // Solo al mount e ad ogni cambio di sessionId: non ri-eseguiamo ad ogni
    // render (i props di dip cambiano poco ma cambiano — filtriamo su id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, dip?.sessionId])

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
      sessionId: data.session_id || null,
      at: Date.now(),
      userScope,
    }
    writeToStorage(next)
    setDip(next)
    return { ok: true, dipendente: next }
  }, [userScope])

  const deseleziona = useCallback(async () => {
    // Chiudi sessione server-side (fire-and-forget: se la rete cade il
    // client-side pulisce comunque, la sessione scadrà da sola in 12h).
    const sid = dip?.sessionId
    if (sid) {
      supabase.rpc('dipendente_operativo_termina', { p_session_id: sid })
        .catch(() => { /* noop */ })
    }
    writeToStorage(null)
    setDip(null)
  }, [dip?.sessionId])

  const value = useMemo(() => ({
    dipendente: dip,           // { id, nome, cognome, ruolo, sessionId, at } | null
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
