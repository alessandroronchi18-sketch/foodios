// Documentary AI (C7)
//
// Mostra archivio "documentari" trimestrali generati dal cron:
// timeline, KPI raggiunti, top prodotti, citazioni AI sui successi.
// Ogni snapshot è una pagina shareable (per ora privata, V2 con slug pubblico).
//
// Il cron-documentary gira il 1° giorno di ogni trimestre (apr/lug/ott/gen).

import React, { useEffect, useState } from 'react'
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

export default function DocumentaryView({ orgId, nomeAttivita }) {
  const isMobile = useIsMobile()
  const [snapshots, setSnapshots] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (!orgId) return
    let alive = true
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('documentary_snapshots').select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
      if (alive) {
        setSnapshots(data || [])
        setLoading(false)
        if ((data || []).length > 0) setSelected(data[0])
      }
    }
    load()
    return () => { alive = false }
  }, [orgId])

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? 12 : 0 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: BRAND, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          Documentary AI
        </div>
        <h1 style={{ margin: '6px 0 4px', fontSize: isMobile ? 22 : 26, fontWeight: 800, color: TXT, letterSpacing: '-0.02em' }}>
          La tua storia, generata dall'AI
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: SOFT, lineHeight: 1.5 }}>
          Ogni trimestre l'AI prepara un riassunto narrativo di cosa hai fatto: KPI, prodotti top, momenti chiave.
        </p>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: SOFT }}>Caricamento…</div>
      ) : snapshots.length === 0 ? (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '60px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 40 }}>🎬</div>
          <div style={{ marginTop: 14, fontSize: 16, fontWeight: 800, color: TXT }}>Il tuo primo documentario arriva al prossimo trimestre</div>
          <div style={{ fontSize: 13, color: SOFT, marginTop: 8, lineHeight: 1.6, maxWidth: 480, margin: '8px auto 0' }}>
            L'AI raccoglie i tuoi dati dal lancio FoodOS e ti prepara un riassunto narrativo<br/>
            ogni 1° apr / 1° lug / 1° ott / 1° gen.<br/>
            Sarà un documento da condividere con team, soci, commercialista, social.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '240px 1fr', gap: 16 }}>
          {/* Lista snapshots (su mobile: scroll orizzontale chip-style) */}
          <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: 8, overflowX: isMobile ? 'auto' : 'visible', paddingBottom: isMobile ? 4 : 0 }}>
            {snapshots.map(s => (
              <button key={s.id} onClick={() => setSelected(s)}
                style={{ textAlign: 'left', padding: 14, background: selected?.id === s.id ? '#FFF7ED' : CARD, border: `1px solid ${selected?.id === s.id ? BRAND : BORDER}`, borderRadius: 10, cursor: 'pointer' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: BRAND }}>{s.periodo}</div>
                <div style={{ fontSize: 11, color: SOFT, marginTop: 4 }}>
                  {s.data_inizio} → {s.data_fine}
                </div>
              </button>
            ))}
          </div>

          {/* Detail */}
          {selected && (
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: isMobile ? 18 : 28 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: BRAND, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                {nomeAttivita} · {selected.periodo}
              </div>
              <h2 style={{ margin: '6px 0 20px', fontSize: isMobile ? 22 : 28, fontWeight: 800, color: TXT, letterSpacing: '-0.02em' }}>
                Il tuo trimestre
              </h2>

              {selected.contenuto?.headline && (
                <div style={{ fontSize: 18, lineHeight: 1.5, color: TXT, fontStyle: 'italic', borderLeft: `3px solid ${BRAND}`, paddingLeft: 14, marginBottom: 20 }}>
                  "{selected.contenuto.headline}"
                </div>
              )}

              {selected.contenuto?.kpi && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
                  {Object.entries(selected.contenuto.kpi).slice(0, 6).map(([k, v]) => (
                    <div key={k} style={{ background: '#FAFAF6', padding: 12, borderRadius: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: SOFT, textTransform: 'uppercase' }}>{k.replace(/_/g, ' ')}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: TXT, marginTop: 2 }}>{typeof v === 'number' ? v.toLocaleString('it-IT', { maximumFractionDigits: 0 }) : String(v)}</div>
                    </div>
                  ))}
                </div>
              )}

              {selected.contenuto?.narrativa && (
                <div style={{ fontSize: 14, lineHeight: 1.7, color: MID, marginBottom: 20, whiteSpace: 'pre-wrap' }}>
                  {selected.contenuto.narrativa}
                </div>
              )}

              {selected.contenuto?.highlights && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: SOFT, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>Highlight</div>
                  <ul style={{ margin: 0, paddingLeft: 22, fontSize: 14, color: TXT, lineHeight: 1.7 }}>
                    {selected.contenuto.highlights.map((h, i) => <li key={i}>{h}</li>)}
                  </ul>
                </div>
              )}

              <div style={{ fontSize: 11, color: SOFT, marginTop: 24, paddingTop: 14, borderTop: `1px solid ${BORDER}` }}>
                Generato automaticamente da FoodOS Documentary AI · {new Date(selected.created_at).toLocaleDateString('it-IT')}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
