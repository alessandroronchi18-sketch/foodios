// Marketplace fornitori (C4) - Scaffolding MVP
//
// Mostra listings caricati su public.marketplace_listings (pubblici per tutti
// gli utenti FoodOS). Filtri categoria + ricerca prodotto. Bottone "Contatta"
// che apre mailto/tel.
//
// V2: AI matching engine ("per il tuo pistacchio bronte consigliamo X").
// V2: integrazione ordini direttamente da marketplace.

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { color as T } from '../lib/theme'
import useIsMobile from '../lib/useIsMobile'
import Icon from '../components/Icon'

const BRAND = T.brand || '#6E0E1A'
const SOFT = T.textSoft || '#8B95A7'
const TXT = T.text || '#0E1726'
const MID = T.textMid || '#475264'
const CARD = T.bgCard || '#FFF'
const BORDER = T.border || '#E5E9EF'

const CATEGORIE = [
  { id: 'tutti',          lbl: '🌐 Tutti' },
  { id: 'materie_prime',  lbl: '🌾 Materie prime' },
  { id: 'cioccolato',     lbl: '🍫 Cioccolato' },
  { id: 'farine',         lbl: '🌾 Farine' },
  { id: 'latticini',      lbl: '🥛 Latticini' },
  { id: 'frutta_secca',   lbl: '🌰 Frutta secca' },
  { id: 'imballaggi',     lbl: '📦 Imballaggi' },
  { id: 'attrezzature',   lbl: '🔧 Attrezzature' },
]

export default function MarketplaceView() {
  const isMobile = useIsMobile()
  const [listings, setListings] = useState([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState('tutti')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let alive = true
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('marketplace_listings')
        .select('*')
        .eq('attivo', true)
        .order('rating', { ascending: false, nullsFirst: false })
      if (alive) {
        setListings(data || [])
        setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [])

  const filtered = useMemo(() => {
    return listings.filter(l => {
      if (cat !== 'tutti' && l.categoria !== cat) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        if (!l.prodotto?.toLowerCase().includes(q) && !l.fornitore_nome?.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [listings, cat, search])

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? 12 : 0 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: BRAND, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          Marketplace fornitori
        </div>
        <h1 style={{ margin: '6px 0 4px', fontSize: isMobile ? 22 : 26, fontWeight: 800, color: TXT, letterSpacing: '-0.02em' }}>
          Trova nuovi fornitori HORECA
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: SOFT, lineHeight: 1.5 }}>
          Fornitori verificati raccomandati dalla community FoodOS. Prezzi indicativi: contatta direttamente per offerta.
        </p>
      </div>

      {/* Filtri */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Cerca prodotto o fornitore…"
          style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 14, fontFamily: 'inherit', marginBottom: 10, boxSizing: 'border-box' }}/>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CATEGORIE.map(c => (
            <button key={c.id} onClick={() => setCat(c.id)}
              style={{ padding: '6px 12px', borderRadius: 999, border: `1px solid ${cat === c.id ? BRAND : BORDER}`, background: cat === c.id ? BRAND : 'transparent', color: cat === c.id ? '#FFF' : MID, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {c.lbl}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: SOFT }}>Caricamento…</div>
      ) : filtered.length === 0 ? (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 40, textAlign: 'center', color: SOFT, lineHeight: 1.6 }}>
          <Icon name="package" size={28} color={SOFT}/>
          <div style={{ marginTop: 10, fontSize: 14, fontWeight: 700, color: TXT }}>Marketplace in fase iniziale</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>
            Stiamo onboardando i fornitori HORECA italiani.<br/>
            Se vuoi suggerire un fornitore, scrivici a <a href="mailto:support@foodios.it" style={{ color: BRAND }}>support@foodios.it</a>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {filtered.map(l => (
            <div key={l.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: SOFT, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                {CATEGORIE.find(c => c.id === l.categoria)?.lbl?.split(' ').slice(1).join(' ') || l.categoria}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: TXT, marginTop: 4 }}>{l.prodotto}</div>
              <div style={{ fontSize: 13, color: MID, marginTop: 2 }}>{l.fornitore_nome}</div>
              <div style={{ display: 'flex', gap: 12, fontSize: 12, color: SOFT, marginTop: 10, flexWrap: 'wrap' }}>
                {l.prezzo_medio && <span>💰 <strong>€{Number(l.prezzo_medio).toFixed(2)}</strong>/{l.unita}</span>}
                {l.lead_time_gg && <span>🚚 {l.lead_time_gg}gg</span>}
                {l.moq && <span>📦 MOQ {l.moq}{l.unita}</span>}
                {l.rating && <span>⭐ {Number(l.rating).toFixed(1)} ({l.recensioni_n})</span>}
                {l.zona_servita && <span>📍 {l.zona_servita}</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                {l.contatto_email && (
                  <a href={`mailto:${l.contatto_email}?subject=Richiesta offerta - ${encodeURIComponent(l.prodotto)}`}
                    style={{ flex: 1, background: BRAND, color: '#FFF', textDecoration: 'none', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, textAlign: 'center' }}>
                    📧 Email
                  </a>
                )}
                {l.contatto_tel && (
                  <a href={`tel:${l.contatto_tel}`}
                    style={{ flex: 1, background: 'transparent', color: TXT, border: `1px solid ${BORDER}`, textDecoration: 'none', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, textAlign: 'center' }}>
                    📞 Chiama
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 24, fontSize: 11, color: SOFT, textAlign: 'center', lineHeight: 1.5 }}>
        💡 Il marketplace cresce con i suggerimenti della community. Vuoi un fornitore aggiunto? <a href="mailto:support@foodios.it" style={{ color: BRAND }}>support@foodios.it</a>
      </div>
    </div>
  )
}
