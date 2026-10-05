// Il food cost dei gusti, per la pagina Food cost.
//
// Perché esiste (05/10/2026). La pagina Food cost è nata per la pasticceria:
// costo della ricetta contro il prezzo scritto sulla ricetta. I gusti li
// scartava di proposito, perché il prezzo del gelato non sta sulla ricetta ma
// sui formati (cono, coppetta, vaschetta). Ma il ricettario di Mara ha 63
// gusti e 5 basi, e nient'altro: la pagina diceva «Nessun prodotto vendibile
// nel ricettario», mentre i 63 gusti avevano tutti il costo completo.
//
// Qui il costo di ogni gusto si mette contro il prezzo medio al chilo dei
// formati, senza IVA: è lo stesso numero di Il mese e della Produzione
// (decisione del titolare, 04/10: «stesso numero ovunque»).

import { calcolaFCDettaglio, getR, isRicettaValida, resaGrammi } from './foodcost'
import { isGustoTipo } from './tipoRicetta'
import { costoAlKgGusto } from './produzioneAnalisi'
import { prezzoMedioAlKg } from './prezzoMedioAlKg'
import { prezzoNetto } from '../views/produzione/numeri'

const finito = (x) => x != null && Number.isFinite(Number(x))

/**
 * Un gusto per riga, dal più caro al chilo al meno caro. Quelli di cui non si
 * sa il costo (ricetta senza peso) stanno in fondo.
 *
 * @param {object} ricettario
 * @param {object} ingCosti  da `buildIngCosti`
 * @param {number|null} prezzoKg  €/kg di vendita senza IVA, o null se non si sa
 * @returns {{ nome: string, fcKg: number|null, quota: number|null, margineKg: number|null,
 *   completo: boolean, mancanti: string[], ricetta: object }[]}
 *   `quota` è il food cost in % del prezzo; `completo` è falso se manca il
 *   prezzo di qualche ingrediente (il costo allora è più basso del vero).
 */
export function righeFoodCostGusti(ricettario, ingCosti, prezzoKg) {
  const prezzo = finito(prezzoKg) && Number(prezzoKg) > 0 ? Number(prezzoKg) : null
  const righe = []
  for (const ric of Object.values(ricettario?.ricette || {})) {
    if (!ric || !isRicettaValida(ric.nome)) continue
    if (!isGustoTipo(getR(ric.nome, ric).tipo)) continue
    const c = costoAlKgGusto(ric, ingCosti, ricettario)
    const fcKg = finito(c.fcKg) && c.fcKg > 0 ? c.fcKg : null
    righe.push({
      nome: ric.nome,
      fcKg,
      quota: fcKg != null && prezzo ? (fcKg / prezzo) * 100 : null,
      margineKg: fcKg != null && prezzo ? prezzo - fcKg : null,
      completo: fcKg != null && c.completo,
      mancanti: c.mancanti || [],
      ricetta: ric,
    })
  }
  righe.sort((a, b) => (b.fcKg ?? -1) - (a.fcKg ?? -1) || String(a.nome).localeCompare(String(b.nome), 'it'))
  return righe
}

/**
 * Gli ingredienti di un gusto, ognuno con quanto pesa su un chilo di gelato.
 * @returns {{ nome: string, costoKg: number, quota: number|null, mancante: boolean }[]}
 */
export function ingredientiAlKg(ric, ingCosti, ricettario) {
  const resaG = resaGrammi(ric)
  if (!(resaG > 0)) return []
  const { tot, righe } = calcolaFCDettaglio(ric, ingCosti, ricettario)
  const kg = resaG / 1000
  return righe.map(r => ({
    nome: r.nome,
    costoKg: (Number(r.costo) || 0) / kg,
    quota: tot > 0 ? ((Number(r.costo) || 0) / tot) * 100 : null,
    mancante: !!r.mancante,
  }))
}

/** La mediana di un elenco di numeri (null se vuoto). */
function mediana(valori) {
  const v = valori.filter(finito).map(Number).sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

/**
 * Quello che la frase in cima deve dire: il gusto più caro (fra quelli col
 * costo completo, perché un costo a metà non è un costo) e la mediana.
 */
export function riassuntoGusti(righe = []) {
  const completi = righe.filter(r => r.completo)
  const piuCaro = completi[0] || null
  return {
    n: righe.length,
    completi: completi.length,
    incompleti: righe.filter(r => r.fcKg != null && !r.completo).length,
    senzaCosto: righe.filter(r => r.fcKg == null).length,
    piuCaro,
    medianaQuota: mediana(completi.map(r => r.quota)),
    medianaKg: mediana(completi.map(r => r.fcKg)),
  }
}

// ── Il simulatore dei formati (05/10/2026) ─────────────────────────────
//
// Una prova: i prezzi dei formati si cambiano qui, in memoria, e il prezzo
// medio al chilo si ricalcola con la stessa funzione di tutte le pagine
// (`prezzoMedioAlKg`, poi senza IVA come il Mese). Non si salva niente.

/** La chiave di un formato nelle prove. */
export const chiaveFormato = (f) => String(f?.id ?? f?.nome ?? '')

/** I formati che entrano nel prezzo medio: con un peso e un prezzo. */
export function formatiInMedia(formati) {
  if (!Array.isArray(formati)) return []
  return formati.filter(f => (Number(f?.baseQtaG) || 0) > 0 && (Number(f?.prezzoDefault) || 0) > 0)
}

/** Un prezzo provato vale solo se è un numero maggiore di zero: mai zero per errore. */
export const prezzoProvaValido = (v) => Number.isFinite(Number(v)) && Number(v) > 0

/** I formati col prezzo provato al posto di quello vero (dove c'è). */
export function formatiDelPrezzo(formati, prove = {}) {
  if (!Array.isArray(formati)) return []
  return formati.map(f => {
    const v = prove?.[chiaveFormato(f)]
    return prezzoProvaValido(v) ? { ...f, prezzoDefault: Number(v) } : f
  })
}

/** Prezzo medio al chilo senza IVA coi prezzi provati, o null se non si sa. */
export function prezzoKgInProva(formati, prove = {}) {
  return prezzoNetto(prezzoMedioAlKg(formatiDelPrezzo(formati, prove)))
}

/**
 * Quanto può spostarsi il prezzo al chilo a seconda di cosa si vende:
 * il formato più economico e il più caro al chilo, senza IVA. Con meno di
 * due formati, o tutti uguali, non c'è un intervallo da dire.
 * @returns {{ min: number, max: number }|null}
 */
export function intervalloPrezzoKg(formati) {
  const k = formatiInMedia(formati).map(f => prezzoNetto((Number(f.prezzoDefault) / Number(f.baseQtaG)) * 1000))
  if (k.length < 2) return null
  const min = Math.min(...k), max = Math.max(...k)
  return max - min < 0.005 ? null : { min, max }
}
