// Forecast vendite 7gg (B1)
//
// Tabella + chart che mostra le previsioni per i prossimi 7 giorni per i top
// prodotti, basato su cron-forecast notturno. Mostra:
//   - meteo + correzione applicata
//   - intervallo min-max + confidence
//   - bottone "Pre-compila produzione" che porta in giornaliero con dati

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
const CARD = T.bgCard || '#FFF'
const BORDER = T.border || '#E5E9EF'

function emojiMeteo(weatherCode) {
  if (weatherCode == null) return '-'
  if (weatherCode === 0) return '☀️'
  if (weatherCode <= 3) return '⛅'
  if (weatherCode <= 48) return '🌫️'
  if (weatherCode <= 67) return '🌧️'
  if (weatherCode <= 77) return '🌨️'
  if (weatherCode <= 82) return '🌦️'
  return '⛈️'
}

export default function ForecastView({ orgId, sedeId, sedeAttiva, setView }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const [forecasts, setForecasts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId || !sedeId) { setLoading(false); return }
    let alive = true
    async function load() {
      setLoading(true)
      const oggi = new Date().toISOString().slice(0, 10)
      const { data } = await supabase
        .from('forecast_giornaliero')
        .select('*')
        .eq('organization_id', orgId)
        .eq('sede_id', sedeId)
        .gte('data', oggi)
        .order('data')
        .order('qta_prevista', { ascending: false })
      if (alive) {
        setForecasts(data || [])
        setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [orgId, sedeId])

  // Raggruppa per giorno
  const giorni = useMemo(() => {
    const map = {}
    for (const f of forecasts) {
      if (!map[f.data]) map[f.data] = { data: f.data, items: [], meteo: null }
      map[f.data].items.push(f)
      if (!map[f.data].meteo && f.fattori?.meteo) map[f.data].meteo = f.fattori.meteo
    }
    return Object.values(map).sort((a, b) => a.data.localeCompare(b.data))
  }, [forecasts])

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? 12 : isTablet ? 16 : 0 }}>
      <AiPageHero
        eyebrow="AI · Forecast vendite"
        title="Previsione vendite"
        accentText="7 giorni"
        subtitle={`Storico vendite + meteo cittadino + stagionalità. Aggiornato ogni notte alle 7:00.${sedeAttiva?.nome ? ` · ${sedeAttiva.nome}` : ''}`}
        statusBadge="LIVE"
        stats={[
          { n: '7gg', l: 'Orizzonte' },
          { n: 'Open-Meteo', l: 'Dati meteo' },
          { n: '60gg', l: 'Storico analizzato' },
        ]}
      />

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: SOFT }}>Caricamento…</div>
      ) : giorni.length === 0 ? (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 40, textAlign: 'center', color: SOFT, lineHeight: 1.6 }}>
          <Icon name="forecast" size={32} color={SOFT}/>
          <div style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: TXT }}>Forecast non ancora generato</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>
            L'AI ha bisogno di almeno 30 giorni di chiusure per generare la previsione.<br/>
            Il cron gira ogni notte alle 07:00 UTC. Riprova domani.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {giorni.map(g => {
            const dt = new Date(g.data)
            const labelGiorno = dt.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
            const m = g.meteo
            return (
              <div key={g.data} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '12px 18px', background: '#FAFAF6', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 26 }}>{emojiMeteo(m?.weather_code)}</div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: TXT, textTransform: 'capitalize' }}>{labelGiorno}</div>
                    {m && (
                      <div style={{ fontSize: 11.5, color: SOFT, marginTop: 2 }}>
                        Max {m.t_max?.toFixed(0)}°C · Min {m.t_min?.toFixed(0)}°C
                        {m.precip > 0 && ` · ${m.precip.toFixed(1)}mm pioggia`}
                      </div>
                    )}
                  </div>
                  {setView && (
                    <button onClick={() => setView('giornaliero')}
                      style={{ background: BRAND, color: '#FFF', border: 'none', padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      Vai a produzione →
                    </button>
                  )}
                </div>
                <div style={{ padding: 12 }}>
                  {g.items.slice(0, 12).map(f => {
                    const confColor = f.confidence >= 0.7 ? '#16A34A' : f.confidence >= 0.5 ? '#D97706' : SOFT
                    return (
                      <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 6px', borderTop: `1px solid ${BORDER}` }}>
                        <div style={{ flex: 1, fontSize: 13, color: TXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.prodotto}
                        </div>
                        <div style={{ fontSize: 11, color: SOFT, fontVariantNumeric: 'tabular-nums', minWidth: 80, textAlign: 'right' }}>
                          {Math.round(f.qta_min)} - {Math.round(f.qta_max)} pz
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: TXT, fontVariantNumeric: 'tabular-nums', minWidth: 50, textAlign: 'right' }}>
                          {Math.round(f.qta_prevista)}
                        </div>
                        <div style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: '#F1F5F9', color: confColor, fontWeight: 700, minWidth: 36, textAlign: 'center' }}>
                          {Math.round(f.confidence * 100)}%
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          <div style={{ fontSize: 11, color: SOFT, textAlign: 'center', padding: 8 }}>
            Previsioni indicative. Il modello migliora con più dati storici.
          </div>
        </div>
      )}
    </div>
  )
}
