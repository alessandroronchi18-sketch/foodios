// Il prezzo di una coppetta, portato dalla bolla che l'ha consegnata.
//
// ── Perché ───────────────────────────────────────────────────────────────
//
// Nei formati di vendita del design partner, il 22/09/2026, la cialda costa
// **0,001 €** e il fazzoletto pure. Sono i numeri che i gestionali scrivono
// quando un prezzo non c'è: fuori di trenta volte dal vero, e messi lì una
// volta da qualcuno che non ci è più tornato. Un Cono Grande venduto 5,50 €
// risulta avere due millesimi di euro di materiali.
//
// La bolla di ConoArtic il prezzo ce l'ha, e dice anche quanti pezzi ci sono
// in una confezione: «COPPETTA BIO 16/B MARA N.250», nove pacchi, 180,00 €.
// Da lì esce 0,08 € a coppetta senza che nessuno batta un numero.
//
// ── Perché si propone e non si applica ───────────────────────────────────
//
// Quel numero entra nel costo di **ogni formato** che usa quella coppetta, e
// quindi nel margine di ogni cono venduto. Cambiarlo di nascosto è il genere
// di cosa che si scopre a fine mese guardando un margine che non torna.
//
// Due mucchi, come per la scheda del fornitore:
//   • i materiali **senza prezzo** si riempiono, spuntati di sì: oggi valgono
//     zero o un millesimo segnaposto, e qualunque numero vero è meglio;
//   • quelli che un prezzo ce l'hanno **già** si mostrano affiancati, spuntati
//     di no. Decide una persona.
import React, { useEffect, useMemo, useState } from 'react'
import Icon from './Icon'
import { sload, ssave } from '../lib/storage'
import { SK_MATERIALI } from '../lib/storageKeys'
import { color as T, radius as R, font, typo } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { prezziMaterialiDaBolla } from '../lib/smistaMerce'

/** Un importo minuto: a due decimali un tovagliolo da 0,005 € si legge il doppio. */
const fmt3 = (n) => `${(Number.isFinite(Number(n)) ? Number(n) : 0)
  .toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} €`

/**
 * @param {object}   props
 * @param {Array}    props.materialiDaBolla  `smistaBolla(...).materiali`
 * @param {string}   props.orgId
 * @param {Function} props.notify
 */
export default function PrezziMaterialiProposta({ materialiDaBolla, orgId, notify }) {
  const suTelefono = useIsMobile()
  const suTablet = useIsTablet()
  const dito = suTelefono || suTablet
  const [elenco, setElenco] = useState(undefined)
  const [scelti, setScelti] = useState(null)
  const [salvando, setSalvando] = useState(false)
  const [chiuso, setChiuso] = useState(false)

  useEffect(() => {
    let vivo = true
    if (!orgId) { setElenco(null); return () => { vivo = false } }
    sload(SK_MATERIALI, orgId, null).then(m => { if (vivo) setElenco(Array.isArray(m) ? m : []) })
    return () => { vivo = false }
  }, [orgId])

  const proposta = useMemo(
    () => prezziMaterialiDaBolla(elenco || [], materialiDaBolla),
    [elenco, materialiDaBolla],
  )

  useEffect(() => {
    if (elenco === undefined) return
    const s = {}
    for (const v of proposta.vuoti) s[`v:${v.nome}`] = true
    for (const v of proposta.nuovi) s[`n:${v.nome}`] = true
    for (const d of proposta.diversi) s[`d:${d.nome}`] = false
    setScelti(s)
  }, [elenco, proposta])

  if (chiuso || elenco === undefined || !scelti) return null
  const quante = proposta.vuoti.length + proposta.diversi.length + proposta.nuovi.length
  if (quante === 0) return null
  const scelte = Object.values(scelti).filter(Boolean).length

  async function salva() {
    const nuovo = [...(elenco || [])]
    const tocca = (nome, costo) => {
      const i = nuovo.findIndex(m => String(m?.nome || '').trim().toLowerCase() === nome.trim().toLowerCase())
      if (i >= 0) nuovo[i] = { ...nuovo[i], costo }
      else nuovo.push({ nome, costo })
    }
    for (const v of proposta.vuoti) if (scelti[`v:${v.nome}`]) tocca(v.nome, v.costo)
    for (const v of proposta.nuovi) if (scelti[`n:${v.nome}`]) tocca(v.nome, v.costo)
    for (const d of proposta.diversi) if (scelti[`d:${d.nome}`]) tocca(d.nome, d.costo)
    setSalvando(true)
    try {
      await ssave(SK_MATERIALI, nuovo, orgId, null)
      notify?.(`Prezzo aggiornato per ${scelte} ${scelte === 1 ? 'materiale' : 'materiali'}. I formati che li usano si aggiornano da soli.`)
      setChiuso(true)
    } catch (e) {
      notify?.('Non sono riuscito a salvare i materiali: ' + (e?.message || 'rete'), false)
    } finally {
      setSalvando(false)
    }
  }

  const riga = (chiave, nome, costo, attuale, perche) => (
    <label key={chiave} style={{
      display: 'grid',
      gridTemplateColumns: suTelefono ? '26px 1fr' : '26px 200px 1fr',
      gap: 10, alignItems: 'start', padding: '9px 0',
      borderTop: `1px solid ${T.borderSoft}`, cursor: 'pointer',
    }}>
      <input type="checkbox" checked={!!scelti[chiave]} style={{ width: 18, height: 18, marginTop: 2, accentColor: T.brand }}
        aria-label={`Prendi il prezzo di ${nome}`}
        onChange={e => setScelti(s => ({ ...s, [chiave]: e.target.checked }))} />
      <div style={{ fontSize: font.size.base, fontWeight: 700, color: T.text }}>{nome}</div>
      <div style={{ fontSize: font.size.base, color: T.textMid, lineHeight: 1.5 }}>
        <b style={{ color: T.text }}>{fmt3(costo)}</b>
        {attuale != null && <span style={{ color: T.textSoft }}> — adesso c&apos;è <s>{fmt3(attuale)}</s></span>}
        {perche && <div style={{ fontSize: typo.caption.fontSize, color: T.textSoft, lineHeight: 1.45 }}>{perche}</div>}
      </div>
    </label>
  )

  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14,
      padding: suTelefono ? '14px' : '16px 18px', marginBottom: 18,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ flexShrink: 0, marginTop: 2, color: T.brand }}><Icon name="package" size={16} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: font.size.md, fontWeight: 800, color: T.text }}>
            Il prezzo di un pezzo, da questa bolla
          </div>
          <div style={{ fontSize: typo.small.fontSize, color: T.textSoft, lineHeight: 1.55, marginTop: 2 }}>
            Il documento dice quanto costa una confezione e quanti pezzi ci sono dentro. Questi
            numeri entrano nel costo di ogni formato che usa quel materiale.
          </div>
        </div>
        <button type="button" onClick={() => setChiuso(true)} aria-label="Chiudi la proposta sui materiali" title="Chiudi"
          style={{
            width: dito ? 40 : 30, height: dito ? 40 : 30, padding: 0, flexShrink: 0,
            background: 'transparent', color: T.textSoft, border: `1px solid ${T.border}`,
            borderRadius: R.sm, cursor: 'pointer', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
          <Icon name="x" size={13} />
        </button>
      </div>

      {(proposta.vuoti.length > 0 || proposta.nuovi.length > 0) && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: typo.small.fontSize, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Materiali che un prezzo non ce l&apos;hanno
          </div>
          {proposta.vuoti.map(v => riga(`v:${v.nome}`, v.nome, v.costo, null, v.perche))}
          {proposta.nuovi.map(v => riga(`n:${v.nome}`, v.nome, v.costo, null, v.perche))}
        </div>
      )}

      {proposta.diversi.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: typo.small.fontSize, fontWeight: 700, color: T.amberDark || T.amber, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Diversi da quello che c&apos;è scritto adesso
          </div>
          <div style={{ fontSize: typo.caption.fontSize, color: T.textSoft, lineHeight: 1.5, marginTop: 3 }}>
            Di partenza non li tocco: questo numero cambia il margine di ogni cono che usa quel
            materiale, e non è una cosa da fare di nascosto.
          </div>
          {proposta.diversi.map(d => riga(`d:${d.nome}`, d.nome, d.costo, d.attuale, d.perche))}
        </div>
      )}

      <button type="button" onClick={salva} disabled={salvando || scelte === 0}
        style={{
          marginTop: 16, padding: '11px 18px', minHeight: dito ? 48 : 44,
          background: scelte === 0 ? T.bgSubtle : T.brand,
          color: scelte === 0 ? T.textSoft : T.white,
          border: 'none', borderRadius: R.md, fontSize: font.size.base, fontWeight: 700,
          fontFamily: 'inherit',
          cursor: (scelte === 0 && proposta.automatici.length === 0) || salvando ? 'default' : 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 8,
        }}>
        <Icon name="save" size={15} />
        {salvando ? 'Salvo…' : scelte === 0 ? 'Non hai scelto niente' : `Prendi ${scelte} ${scelte === 1 ? 'prezzo' : 'prezzi'}`}
      </button>
    </div>
  )
}
