// Marketplace fornitori (C4) - Scaffolding MVP
//
// Mostra listings caricati su public.marketplace_listings (pubblici per tutti
// gli utenti Foodos). Filtri categoria + ricerca prodotto. Bottone "Contatta"
// che apre mailto/tel.
//
// V2: AI matching engine ("per il tuo pistacchio bronte consigliamo X").
// V2: integrazione ordini direttamente da marketplace.

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { color as T } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import Icon from '../components/Icon'
import AiPageHero from '../components/AiPageHero'

const BRAND = T.brand || '#6E0E1A'
const SOFT = T.textSoft || '#8B95A7'
const TXT = T.text || '#0E1726'
const MID = T.textMid || '#475264'
const CARD = T.bgCard || T.white
const BORDER = T.border || '#E5E9EF'
// Bianco sopra il bordeaux: il token c'è (`textOnDark`), e sotto ci sono
// icone e non solo testo. Scritto una volta sola.
const SU_BRAND = T.textOnDark

// Le categorie: nome e icona separati.
//
// Audit del 16/09/2026, agente PAGINE. Prima l'icona stava DENTRO il nome
// (una spiga davanti a «Materie prime») e due cose andavano storte insieme:
//   1. la regola del progetto è che le icone si disegnano col componente
//      `Icon`, mai con un emoji — un emoji cambia faccia da un telefono
//      all'altro e sulle stampe non c'è;
//   2. per rimettere il nome pulito nella scheda del fornitore, il codice
//      buttava via la **prima parola** (`lbl.split(' ').slice(1)`). Sulle
//      quattro categorie senza emoji quella prima parola era il nome:
//      «Frutta secca» diventava «secca» e «Latticini» spariva del tutto,
//      lasciando al suo posto l'identificativo del database.
const CATEGORIE = [
  { id: 'tutti',          lbl: 'Tutti',          icona: 'layers' },
  { id: 'materie_prime',  lbl: 'Materie prime',  icona: 'package' },
  { id: 'cioccolato',     lbl: 'Cioccolato',     icona: 'cake' },
  { id: 'farine',         lbl: 'Farine',         icona: 'archive' },
  { id: 'latticini',      lbl: 'Latticini',      icona: 'coffee' },
  { id: 'frutta_secca',   lbl: 'Frutta secca',   icona: 'restaurant' },
  { id: 'imballaggi',     lbl: 'Imballaggi',     icona: 'gift' },
  { id: 'attrezzature',   lbl: 'Attrezzature',   icona: 'tool' },
]

export default function MarketplaceView() {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
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
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? 12 : isTablet ? 16 : 0 }}>
      <AiPageHero
        eyebrow="AI · Marketplace fornitori"
        title="Trova nuovi"
        accentText="fornitori HORECA"
        subtitle="Fornitori verificati raccomandati dalla community Foodos. Prezzi indicativi: contatta direttamente per offerta personalizzata."
        chainOnly
        statusBadge="BETA"
        stats={[
          { n: 'Verificati', l: 'Tutti i fornitori' },
          { n: 'AI match', l: 'Consigli su misura' },
        ]}
      />

      {/* Filtri */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Cerca prodotto o fornitore…"
          style={{ width: '100%', padding: '10px 14px', minHeight: 44, borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 14, fontFamily: 'inherit', marginBottom: 10, boxSizing: 'border-box' }}/>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CATEGORIE.map(c => (
            <button key={c.id} onClick={() => setCat(c.id)}
              style={{ padding: '6px 12px', minHeight: 44, borderRadius: 999, border: `1px solid ${cat === c.id ? BRAND : BORDER}`, background: cat === c.id ? BRAND : 'transparent', color: cat === c.id ? SU_BRAND : MID, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name={c.icona} size={14} color={cat === c.id ? SU_BRAND : MID}/>
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
            Stiamo ancora raccogliendo i fornitori. Qui compariranno grossisti
            e produttori italiani per pasticceria, gelateria e bar.<br/>
            Se vuoi suggerire un fornitore, scrivici a <a href="mailto:support@foodos.it" style={{ color: BRAND }}>support@foodos.it</a>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(auto-fill, minmax(260px, 1fr))' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {filtered.map(l => (
            <div key={l.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: SOFT, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {CATEGORIE.find(c => c.id === l.categoria)?.lbl || l.categoria}
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: TXT, marginTop: 4 }}>{l.prodotto}</div>
              <div style={{ fontSize: 13, color: MID, marginTop: 2 }}>{l.fornitore_nome}</div>
              <div style={{ display: 'flex', gap: 12, fontSize: 12, color: SOFT, marginTop: 10, flexWrap: 'wrap' }}>
                {l.prezzo_medio && <span><strong>{Number(l.prezzo_medio).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</strong>/{l.unita}</span>}
                {l.lead_time_gg && <span>{l.lead_time_gg}gg consegna</span>}
                {l.moq && <span>MOQ {l.moq}{l.unita}</span>}
                {l.rating && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="star" size={12} color={SOFT}/>
                    {Number(l.rating).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                    {l.recensioni_n ? ` (${Number(l.recensioni_n).toLocaleString('it-IT', { useGrouping: 'always' })})` : ''}
                  </span>
                )}
                {l.zona_servita && <span>{l.zona_servita}</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                {l.contatto_email && (
                  <a href={`mailto:${l.contatto_email}?subject=Richiesta offerta - ${encodeURIComponent(l.prodotto)}`}
                    style={{ flex: 1, background: BRAND, color: SU_BRAND, textDecoration: 'none', padding: '10px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, textAlign: 'center', minHeight: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    Email
                  </a>
                )}
                {l.contatto_tel && (
                  <a href={`tel:${l.contatto_tel}`}
                    style={{ flex: 1, background: 'transparent', color: TXT, border: `1px solid ${BORDER}`, textDecoration: 'none', padding: '10px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, textAlign: 'center', minHeight: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    Chiama
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 24, fontSize: 12, color: SOFT, textAlign: 'center', lineHeight: 1.5 }}>
        L'elenco cresce con le segnalazioni di chi lo usa. Manca il tuo fornitore? Scrivi a <a href="mailto:support@foodos.it" style={{ color: BRAND }}>support@foodos.it</a>
      </div>
    </div>
  )
}
