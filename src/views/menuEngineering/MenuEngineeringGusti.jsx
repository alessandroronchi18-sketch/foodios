// ── Menu engineering per la gelateria ────────────────────────────────────
//
// 05/10/2026. A Mara la pagina Menu engineering non mostrava niente: leggeva
// le vendite per prodotto da `pasticceria-chiusure-v1`, un archivio vuoto, e
// solo con una sede scelta. Le vendite per gusto stanno nell'inventario.
//
// Qui niente formule nuove: l'inventario lo legge come la Produzione (con i
// sette giorni prima, per la giacenza di partenza), i conti per gusto sono
// quelli della Produzione (`useContiProduzione`), e la matrice è
// `lib/menuEngineeringGusti.js`. Così un gusto ha gli stessi chili e lo
// stesso margine nelle due pagine.
//
// Si apre come la Produzione: due mesi che finiscono all'ultimo giorno con
// l'inventario, non oggi (a ottobre, con i dati fermi a fine agosto, metà
// della finestra sarebbe vuota). Il periodo si cambia con la barra di tutte
// le pagine, chiusa: una riga.
import React, { useEffect, useMemo, useState } from 'react'
import { color as T, font, space } from '../../lib/theme'
import useIsMobile from '../../lib/useIsMobile'
import { sload } from '../../lib/storage'
import { SK_FORMATI } from '../../lib/storageKeys'
import { formatLocalDate, todayLocal } from '../../lib/dateLocal'
import { fetchAllInventarioProduzione, GIORNI_RIPORTO_MAX, COLONNE_VENDUTO, ultimoGiornoRegistrato } from '../../lib/inventarioProduzione'
import { giorniRegistrati } from '../../lib/produzioneAnalisi'
import { nomePeriodo } from '../../lib/periodoAnalisi'
import { matriceGusti } from '../../lib/menuEngineeringGusti'
import { useContiProduzione } from '../produzione/useContiProduzione'
import { prezzoNetto } from '../produzione/numeri'
import BarraPeriodo from '../../components/BarraPeriodo'
import { IntestazioneAnalisi, Riquadro, RigaMotivo } from '../../components/analisi'
import GustiSenzaRicetta from '../produzione/GustiSenzaRicetta'
import MatriceGusti from '../../components/menuEngineering/MatriceGusti'

const NF2 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function giorniPrimaDi(iso, n) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() - n)
  return formatLocalDate(d)
}

/** Due mesi che finiscono all'ultimo giorno registrato (la regola della Produzione). */
export function periodoDiPartenza(ultimo, oggi) {
  const fine = ultimo && ultimo < oggi ? ultimo : oggi
  const [y, m, d] = fine.split('-').map(Number)
  return { from: formatLocalDate(new Date(y, m - 3, d)), to: fine }
}

const breve = (iso) => { const [, m, d] = iso.split('-'); return `${d}/${m}` }

/**
 * Da quali giorni vengono i chili, sede per sede, e il prezzo usato. Le sedi
 * con gli stessi giorni stanno insieme: «Berthollet e De Gasperi dal 16/07 al
 * 31/08». Se una sede si ferma prima, il suo peso nella matrice è minore, e
 * lo si dice.
 */
export function fraseCopertura(righe, { da, a, sedi = [], prezzoKg = null } = {}) {
  const per = giorniRegistrati(righe, { da, a }).perSede || {}
  const nome = (id) => (sedi || []).find(s => s.id === id)?.nome || 'una sede'
  const gruppi = new Map()
  for (const [id, g] of Object.entries(per)) {
    if (!g?.n) continue
    const k = `${g.primo}|${g.ultimo}`
    gruppi.set(k, [...(gruppi.get(k) || []), nome(id)])
  }
  const pezzi = [...gruppi.entries()].map(([k, nomi]) => {
    const [p, u] = k.split('|')
    const chi = nomi.length > 1 ? `${nomi.slice(0, -1).join(', ')} e ${nomi.at(-1)}` : nomi[0]
    return `${Object.keys(per).length > 1 ? `${chi} ` : ''}dal ${breve(p)} al ${breve(u)}`
  })
  const frasi = []
  if (pezzi.length) frasi.push(`Chili venduti dall'inventario: ${pezzi.join('; ')}.`)
  if (gruppi.size > 1) frasi.push('Le sedi con meno giorni pesano meno nella divisione dei gruppi.')
  if (prezzoKg > 0) frasi.push(`Prezzo: la media dei tuoi formati, ${NF2.format(prezzoKg)} € al chilo senza IVA.`)
  return frasi.join(' ')
}

export default function MenuEngineeringGusti({ orgId, sedeId = null, sedi = [], ricettario, onNavigate = null }) {
  const isMobile = useIsMobile()
  const sediIds = useMemo(() => (sedeId ? [sedeId]
    : (sedi || []).filter(s => s.is_sede_produzione !== false && s.attiva !== false).map(s => s.id)), [sedeId, sedi])
  const chiave = sediIds.join(',')

  const [periodo, setPeriodo] = useState({ from: null, to: null })
  const [righe, setRighe] = useState(null)        // null = sto leggendo
  const [errore, setErrore] = useState(null)
  // I formati si leggono anche dentro `useContiProduzione`, ma lì non si sa
  // quando sono arrivati: senza questo, per un attimo, «servono i prezzi dei
  // formati» a chi li ha.
  const [formatiLetti, setFormatiLetti] = useState(false)

  useEffect(() => {
    if (!orgId) return undefined
    let vivo = true
    sload(SK_FORMATI, orgId, null).catch(() => null).then(() => { if (vivo) setFormatiLetti(true) })
    return () => { vivo = false }
  }, [orgId])

  // La finestra di partenza, una volta sola: poi la sceglie chi guarda.
  useEffect(() => {
    if (!orgId || sediIds.length === 0 || periodo.from) return undefined
    let vivo = true
    const oggi = todayLocal()
    ultimoGiornoRegistrato(orgId, sediIds, { finoA: oggi }).catch(() => null)
      .then((ultimo) => { if (vivo) setPeriodo(periodoDiPartenza(ultimo, oggi)) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, chiave])

  useEffect(() => {
    if (!orgId || sediIds.length === 0 || !periodo.from || !periodo.to) return undefined
    let vivo = true
    setRighe(null)
    setErrore(null)
    fetchAllInventarioProduzione(orgId, {
      sedeIds: sediIds, dataFrom: giorniPrimaDi(periodo.from, GIORNI_RIPORTO_MAX), dataTo: periodo.to,
      columns: `${COLONNE_VENDUTO}, sede_id`,
    })
      .then((r) => { if (vivo) setRighe(Array.isArray(r) ? r : []) })
      .catch((e) => { if (vivo) { setErrore(e?.message || 'lettura non riuscita'); setRighe([]) } })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, chiave, periodo.from, periodo.to])

  const conti = useContiProduzione({ rows: righe || [], dateFrom: periodo.from, dateTo: periodo.to, ricettario, orgId, sedi })
  const prezzoKg = prezzoNetto(conti.euroKgMedio)
  const pronto = righe != null && conti.nomiGusti != null && formatiLetti
  const m = useMemo(() => (pronto ? matriceGusti(conti.valutazione.righe) : null), [pronto, conti.valutazione])
  const copertura = useMemo(() => (pronto ? fraseCopertura(righe, { da: periodo.from, a: periodo.to, sedi, prezzoKg }) : ''),
    [pronto, righe, periodo.from, periodo.to, sedi, prezzoKg])
  const giorni = pronto ? giorniRegistrati(righe, { da: periodo.from, a: periodo.to }).n : 0

  const barra = periodo.from ? (
    <BarraPeriodo from={periodo.from} to={periodo.to} isMobile={isMobile} mostraConfronto={false} lato="destra"
      onPeriodo={(f, t) => { if (f && t) setPeriodo({ from: f, to: t }) }} />
  ) : null

  let corpo
  if (sediIds.length === 0) {
    corpo = <Vuoto testo="Nessuna sede che produce: il menu engineering dei gusti si fa sull'inventario delle sedi di produzione." />
  } else if (!pronto) {
    corpo = <Vuoto testo="Leggo l'inventario del periodo…" tenue />
  } else if (errore) {
    corpo = <Vuoto testo={`Non sono riuscito a leggere l'inventario (${errore}). Riprova fra poco.`} />
  } else if (giorni === 0) {
    corpo = <Vuoto testo={`Fra il ${nomePeriodo(periodo.from, periodo.to)} non c'è nessun giorno d'inventario registrato. Scegli un altro periodo.`} />
  } else if (!(prezzoKg > 0)) {
    corpo = <Vuoto testo="Per il margine servono i prezzi dei formati di vendita (cono, coppetta, vaschetta): senza, non si sa quanto rende un gusto."
      azione={onNavigate ? { etichetta: 'Apri il Listino', onClick: () => onNavigate('formati-vendita') } : null} />
  } else if (m.gusti.length < 2) {
    corpo = <Vuoto testo="Servono almeno due gusti venduti con la ricetta e il costo completo per dividerli in gruppi." />
  } else {
    corpo = <MatriceGusti m={m} periodo={nomePeriodo(periodo.from, periodo.to)} copertura={copertura} onNavigate={onNavigate} isMobile={isMobile}
      collegamento={(
        <GustiSenzaRicetta senzaRicetta={conti.senzaRicetta} collegati={conti.collegati} euroKgMedio={conti.euroKgMedio}
          ricettario={ricettario} collega={conti.collega} pronto={pronto} onNavigate={onNavigate} isMobile={isMobile} />
      )} />
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: isMobile ? space[4] : space[6] }}>
        <IntestazioneAnalisi domanda="Quali gusti ti fanno guadagnare?" isMobile={isMobile} destra={barra}
          sotto="I gusti in quattro gruppi: quanto vendono e quanto ti lasciano al chilo." />
      </div>
      {corpo}
    </div>
  )
}

function Vuoto({ testo, azione = null, tenue = false }) {
  const isMobile = useIsMobile()
  return (
    <Riquadro isMobile={isMobile}>
      {tenue
        ? <div style={{ fontSize: font.size.base, color: T.textSoft }}>{testo}</div>
        : <RigaMotivo motivo={testo} azione={azione} />}
    </Riquadro>
  )
}
