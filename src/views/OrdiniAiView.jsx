// AI Auto-ordine fornitori (B4)
//
// MVP: per ogni ingrediente sotto soglia (o vicino a soglia), propone
// quantita da ordinare in base a:
//   - giacenza attuale
//   - soglia minima
//   - consumo medio settimanale (calcolato da produzione storica)
//   - lead time fornitore (default 3gg, configurabile per fornitore)
//
// Formula EOQ semplificata: Qta_ordine = max(soglia*2, consumo_lead_time + safety_stock)
// Output: tabella ingredienti + bottone per generare email PDF al fornitore.

import React, { useEffect, useMemo, useState } from 'react'
import { sload } from '../lib/storage'
import { color as T } from '../lib/theme'
import useIsMobile from '../lib/useIsMobile'
import Icon from '../components/Icon'
import AiPageHero from '../components/AiPageHero'

const BRAND = T.brand || '#6E0E1A'
const SOFT = T.textSoft || '#8B95A7'
const TXT = T.text || '#0E1726'
const MID = T.textMid || '#475264'
const CARD = T.bgCard || '#FFF'
const BORDER = T.border || '#E5E9EF'
const GREEN = T.green || '#16A34A'
const AMBER = T.amber || '#D97706'

export default function OrdiniAiView({ orgId, sedeId, notify }) {
  const notifyFn = notify || ((m) => console.debug('[ordini-ai]', m))
  const isMobile = useIsMobile()
  const [magazzino, setMagazzino] = useState({})
  const [chiusure, setChiusure] = useState([])
  const [ricettario, setRicettario] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId || !sedeId) { setLoading(false); return }
    let alive = true
    async function load() {
      setLoading(true)
      const [m, c, r] = await Promise.all([
        sload('pasticceria-magazzino-v1', orgId, sedeId),
        sload('pasticceria-chiusure-v1', orgId, sedeId),
        sload('pasticceria-ricettario-v1', orgId, null),
      ])
      if (alive) {
        setMagazzino(m || {})
        setChiusure(Array.isArray(c) ? c : [])
        setRicettario(Array.isArray(r) ? r : [])
        setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [orgId, sedeId])

  // Calcola consumo medio giornaliero per ingrediente (basato su produzione legata
  // alle vendite via ricettario; semplificazione: 1 pezzo venduto = grammature ricetta).
  const consumoGiornaliero = useMemo(() => {
    const consumo = {}
    const giorni = 30
    const oggi = new Date()
    const start = new Date(oggi.getTime() - giorni * 86400000)
    for (const c of chiusure) {
      const d = new Date(c.data || 0)
      if (d < start || d > oggi) continue
      const items = Array.isArray(c.prodotti) ? c.prodotti : Array.isArray(c.righe) ? c.righe : []
      for (const r of items) {
        const nome = (r.nome || r.prodotto || '').toUpperCase().trim()
        const qta = Number(r.venduto || r.qta || r.pezzi || 0)
        if (!nome || qta <= 0) continue
        // Trova ricetta
        const ric = ricettario.find(x => (x.nome || '').toUpperCase().trim() === nome)
        if (!ric) continue
        const ings = ric.ingredienti || ric.composizione || []
        for (const ing of ings) {
          const ingNome = (ing.nome || ing.ingrediente || '').toLowerCase().trim()
          if (!ingNome) continue
          const grammi = Number(ing.qta_g || ing.quantita || 0) * qta
          consumo[ingNome] = (consumo[ingNome] || 0) + grammi
        }
      }
    }
    // Media giornaliera
    Object.keys(consumo).forEach(k => { consumo[k] = consumo[k] / giorni })
    return consumo
  }, [chiusure, ricettario])

  const suggerimenti = useMemo(() => {
    const out = []
    const leadTime = 3  // giorni medi
    const safety = 1.4  // 40% safety stock
    for (const [nome, info] of Object.entries(magazzino || {})) {
      const giacenza = Number(info?.giacenza_g ?? info?.giacenza ?? 0)
      const soglia = Number(info?.soglia_min_g ?? info?.soglia ?? 0)
      const cons = consumoGiornaliero[nome.toLowerCase()] || 0
      const giorniRimasti = cons > 0 ? giacenza / cons : 999
      const sottoSoglia = soglia > 0 && giacenza <= soglia
      const inEsaurimento = giorniRimasti <= leadTime
      if (!sottoSoglia && !inEsaurimento) continue
      // Quantita suggerita: copri 14 giorni + safety
      const qtaSuggerita = Math.max(soglia * 2, cons * 14 * safety)
      out.push({
        nome,
        giacenza, soglia, cons,
        giorniRimasti: cons > 0 ? Math.round(giorniRimasti) : null,
        sottoSoglia, inEsaurimento,
        qtaSuggerita: Math.round(qtaSuggerita),
        urgenza: sottoSoglia ? 'alta' : 'media',
        prezzo_ultimo: Number(info?.prezzo_kg) || 0,
      })
    }
    return out.sort((a, b) => {
      if (a.urgenza !== b.urgenza) return a.urgenza === 'alta' ? -1 : 1
      return (a.giorniRimasti ?? 999) - (b.giorniRimasti ?? 999)
    })
  }, [magazzino, consumoGiornaliero])

  function genTestoOrdine() {
    const lines = ['Buongiorno,', '', 'Vi chiedo gentilmente di prepararci il seguente ordine:', '']
    for (const s of suggerimenti) {
      const qta = s.qtaSuggerita
      const unit = qta >= 1000 ? `${(Number(qta) / 1000).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg` : `${Math.round(Number(qta)||0).toLocaleString('it-IT')} g`
      lines.push(`- ${s.nome}: ${unit}`)
    }
    lines.push('', 'Grazie!', '')
    return lines.join('\n')
  }

  async function copia() {
    const testo = genTestoOrdine()
    // Path moderno: navigator.clipboard. Su iOS Safari pre-13.4 o contesti
    // non-secure fallisce: fallback a textarea + execCommand('copy').
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(testo)
        notifyFn('Testo ordine copiato negli appunti — incollalo in mail/WhatsApp al fornitore', true)
        return
      }
    } catch {
      // cade nel fallback
    }
    try {
      const ta = document.createElement('textarea')
      ta.value = testo
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.top = '0'
      ta.style.left = '0'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      // iOS richiede selezione esplicita prima di execCommand.
      ta.focus()
      ta.select()
      ta.setSelectionRange(0, testo.length)
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      if (ok) notifyFn('Testo ordine copiato — incollalo in mail/WhatsApp al fornitore', true)
      else notifyFn('Copia non riuscita. Seleziona manualmente il testo qui sotto.', false)
    } catch {
      notifyFn('Copia non supportata su questo browser. Seleziona manualmente il testo.', false)
    }
  }

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? 12 : 0 }}>
      <AiPageHero
        eyebrow="AI · Procurement"
        title="Ordini AI"
        accentText="già pronti"
        subtitle="L'AI guarda magazzino + consumo medio + soglie minime e ti dice cosa ordinare. Copia il testo e invialo al fornitore via mail o WhatsApp."
        statusBadge="LIVE"
        stats={[
          { n: '30gg', l: 'Storico analizzato' },
          { n: 'EOQ', l: 'Algoritmo + safety stock' },
        ]}
      />

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: SOFT }}>Caricamento…</div>
      ) : suggerimenti.length === 0 ? (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 40, textAlign: 'center', color: SOFT, lineHeight: 1.6 }}>
          <Icon name="check" size={28} color="#16A34A"/>
          <div style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: TXT }}>Nessun ordine urgente</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>Tutte le materie prime sono sopra soglia. L'AI ricontrolla quotidianamente.</div>
        </div>
      ) : (
        <>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ background: '#FAFAF6', padding: isMobile ? '12px 14px' : '12px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: isMobile ? 'stretch' : 'center', gap: 10, flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: TXT }}>
                {Number(suggerimenti.length).toLocaleString('it-IT')} ingredient{suggerimenti.length === 1 ? 'e' : 'i'} da ordinare
              </div>
              <button onClick={copia}
                style={{ marginLeft: isMobile ? '0' : 'auto', background: BRAND, color: '#FFF', border: 'none', padding: isMobile ? '12px 14px' : '8px 14px', minHeight: isMobile ? 44 : 'auto', borderRadius: 8, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                <Icon name="copy" size={13}/> Copia testo ordine
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? 600 : 'auto' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ingrediente</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Giacenza</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Soglia</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cons. medio/gg</th>
                    <th title="Giorni rimasti di scorta = giacenza attuale / consumo medio giornaliero" style={{ padding: '10px 14px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'help' }}>Gg rimasti</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 10, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Da ordinare</th>
                  </tr>
                </thead>
                <tbody>
                  {suggerimenti.map(s => (
                    <tr key={s.nome} style={{ borderTop: `1px solid ${BORDER}` }}>
                      <td style={{ padding: '11px 14px', fontSize: 13, color: TXT, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {s.urgenza === 'alta' && <span style={{ color: BRAND, marginRight: 6 }} aria-label="Urgenza alta">●</span>}
                        <span title={s.nome}>{s.nome}</span>
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12, color: MID, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{Math.round(s.giacenza).toLocaleString('it-IT')}g</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12, color: SOFT, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{Math.round(s.soglia).toLocaleString('it-IT')}g</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12, color: SOFT, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{Math.round(s.cons).toLocaleString('it-IT')}g</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12, color: s.giorniRimasti != null && s.giorniRimasti <= 3 ? BRAND : MID, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {s.giorniRimasti != null ? Number(s.giorniRimasti).toLocaleString('it-IT') : '—'}
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, color: TXT, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {s.qtaSuggerita >= 1000 ? `${(s.qtaSuggerita / 1000).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg` : `${Number(s.qtaSuggerita).toLocaleString('it-IT')} g`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Preview testo ordine */}
          <div style={{ background: '#FAFAF6', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: SOFT, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>
              Anteprima testo da inviare al fornitore
            </div>
            <pre style={{ fontFamily: 'inherit', fontSize: 13, color: TXT, whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.6 }}>
              {genTestoOrdine()}
            </pre>
          </div>
        </>
      )}
    </div>
  )
}
