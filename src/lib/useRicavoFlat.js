// Hook riusabile per il RICAVO FLAT €/kg dei gusti (gelateria/yogurt).
//
// Un gusto ha prezzo=0 sulla ricetta (il prezzo di vendita vive sui Formati
// vendita: cono/coppetta/vaschetta). Questo hook carica i formati dell'org,
// applica l'eventuale override sede sui prezzi (Milano vs Poggibonsi possono
// avere il cono a prezzi diversi) e restituisce una funzione `ricavoFlatFor(ric)`
// che per una ricetta gusto ritorna il prezzo medio €/kg dei formati della sua
// categoria — oppure null se non e' stimabile.
//
// Uso:
//   const { ricavoFlatFor, ricavoEffettivo, formati } = useRicavoFlat(orgId, ricettario, sedeId)
//   // Per gusti: ricavo (€) = ricavoFlatFor(ric) × pesoKg (default 1 kg finito)
//   // Per stampi/pezzi: ricavo (€) = reg.unita × reg.prezzo (invariato)
//
// `sedeId` opzionale: se passato, i formati vengono restituiti col
// prezzoDefault sostituito dall'override sede (via applicaListinoAiFormati).
// Se null/undefined (vista "tutte le sedi"), usa i prezzi base.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { sload } from './storage'
import { SK_FORMATI, avgPrezzoPerKgCategoria } from './formatiVendita'
import { SK_LISTINO_SEDE, applicaListinoAiFormati } from './listinoSede'
import { getR, isRicettaValida } from './foodcost'

export function useRicavoFlat(orgId, ricettario, sedeId = null) {
  const [formatiBase, setFormatiBase] = useState([])
  const [listinoSede, setListinoSede] = useState(null)

  useEffect(() => {
    if (!orgId) return
    let alive = true
    sload(SK_FORMATI, orgId, null).then(v => { if (alive) setFormatiBase(Array.isArray(v) ? v : []) })
    return () => { alive = false }
  }, [orgId])

  useEffect(() => {
    if (!orgId || !sedeId) { setListinoSede(null); return }
    let alive = true
    sload(SK_LISTINO_SEDE, orgId, sedeId).then(v => {
      if (!alive) return
      const norm = (v && typeof v === 'object') ? v : {}
      setListinoSede({
        ricette: norm.ricette && typeof norm.ricette === 'object' ? norm.ricette : {},
        formati: norm.formati && typeof norm.formati === 'object' ? norm.formati : {},
      })
    })
    return () => { alive = false }
  }, [orgId, sedeId])

  // Formati con override sede applicato sul prezzoDefault (o base se sedeId=null).
  const formati = useMemo(
    () => applicaListinoAiFormati(formatiBase, listinoSede),
    [formatiBase, listinoSede]
  )

  // Cache €/kg per categoria: evita di ricalcolare N volte per N gusti.
  const byCategoria = useMemo(() => {
    const m = new Map()
    for (const r of Object.values(ricettario?.ricette || {})) {
      const cat = String(r?.categoria || '').trim().toLowerCase()
      if (cat && !m.has(cat)) m.set(cat, avgPrezzoPerKgCategoria(cat, formati))
    }
    return m
  }, [ricettario, formati])

  // useCallback: la ref di ricavoFlatFor cambia SOLO se byCategoria cambia,
  // così le useMemo/useEffect a valle non si re-eseguono ad ogni render.
  const ricavoFlatFor = useCallback((ric) => {
    const cat = String(ric?.categoria || '').trim().toLowerCase()
    if (!cat) return null
    const v = byCategoria.get(cat)
    return Number(v) > 0 ? Number(v) : null
  }, [byCategoria])

  // Ricavo TOTALE in € della ricetta, unificando gusti e stampi.
  //  - gusto: ricavoFlatKg × pesoKg (pesoKg = somma ingredienti in kg,
  //           default a 1 se pesoStampo=0 — un gusto è definito per 1 kg finito)
  //  - stampi/pezzi: reg.unita × reg.prezzo (comportamento standard)
  // Ritorna 0 se il gusto non ha ricavo stimabile (invitare a configurare formati).
  const ricavoEffettivo = useCallback((ric) => {
    if (!ric || !isRicettaValida(ric.nome)) return 0
    const reg = getR(ric.nome, ric)
    if (reg.tipo === 'gusto') {
      const rk = ricavoFlatFor(ric)
      if (!rk) return 0
      const pesoG = (ric.ingredienti || []).reduce((s, i) => s + (Number(i.qty1stampo) || 0), 0)
      const pesoKg = pesoG > 0 ? pesoG / 1000 : 1
      return rk * pesoKg
    }
    return (Number(reg.unita) || 0) * (Number(reg.prezzo) || 0)
  }, [ricavoFlatFor])

  return { formati, byCategoria, ricavoFlatFor, ricavoEffettivo }
}
