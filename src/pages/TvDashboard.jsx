import React, { useEffect, useState } from 'react'
import Icon from '../components/Icon'

const REFRESH_MS = 5 * 60 * 1000

export default function TvDashboard() {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token') || ''
  const sedeFilter = params.get('sede') || ''

  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [now, setNow] = useState(new Date())
  const [lastUpdate, setLastUpdate] = useState(null)

  async function load() {
    if (!token) { setError('token mancante'); return }
    try {
      const q = new URLSearchParams({ token })
      if (sedeFilter) q.set('sede', sedeFilter)
      const r = await fetch(`/api/tv?${q.toString()}`)
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${r.status}`)
      }
      const json = await r.json()
      setData(json)
      setError(null)
      setLastUpdate(new Date())
    } catch (e) {
      setError(e.message || 'errore caricamento')
    }
  }

  useEffect(() => {
    load()
    const refresh = setInterval(load, REFRESH_MS)
    // Audit 2026-06-17 MEDIUM: tick a 1s causava re-render dell'intero
    // dashboard ogni secondo. Aggiorniamo a 30s (granularità sufficiente per
    // orario HH:mm) — riduce CPU/repaint del 30x.
    const tick = setInterval(() => setNow(new Date()), 30_000)
    return () => { clearInterval(refresh); clearInterval(tick) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ora = now.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  const giornoLabel = now.toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  const styles = {
    wrap: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
      color: '#FFF',
      fontFamily: "'Inter', system-ui, sans-serif",
      padding: '32px 48px',
      boxSizing: 'border-box',
    },
    header: {
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
      marginBottom: 36, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.1)',
    },
    title: { fontSize: 56, fontWeight: 800, letterSpacing: '-0.03em', margin: 0, lineHeight: 1 },
    sub: { fontSize: 22, color: 'rgba(255,255,255,0.65)', marginTop: 8, textTransform: 'capitalize' },
    ora: { fontSize: 84, fontWeight: 900, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 },
    grid: {
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fit, minmax(360px, 1fr))`,
      gap: 24,
    },
    card: {
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 18,
      padding: '24px 28px',
    },
    sedeName: { fontSize: 30, fontWeight: 800, margin: 0, letterSpacing: '-0.02em' },
    sedeCitta: { fontSize: 16, color: 'rgba(255,255,255,0.55)', marginTop: 4 },
    kpiRow: { display: 'flex', gap: 24, marginTop: 18, marginBottom: 22 },
    kpiBox: { flex: 1 },
    kpiLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 },
    kpiValue: { fontSize: 56, fontWeight: 900, letterSpacing: '-0.03em', marginTop: 6, fontVariantNumeric: 'tabular-nums' },
    listLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 12 },
    listRow: { display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: 18 },
    listName: { color: 'rgba(255,255,255,0.85)', maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    listQty: { fontWeight: 800, fontVariantNumeric: 'tabular-nums' },
    footer: { position: 'fixed', bottom: 16, right: 24, fontSize: 12, color: 'rgba(255,255,255,0.35)' },
    errorBox: {
      maxWidth: 560, margin: '160px auto', padding: 40, textAlign: 'center',
      background: 'rgba(110,14,26,0.18)', border: '1px solid rgba(110,14,26,0.4)',
      borderRadius: 18, color: '#FFF',
    },
  }

  if (error) return (
    <div style={styles.wrap}>
      <div style={styles.errorBox}>
        <div style={{ marginBottom: 16 }}><Icon name="tv" size={60} /></div>
        <h1 style={{ fontSize: 28, margin: '0 0 12px' }}>TV mode</h1>
        <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.75)', margin: 0 }}>
          {error}. Verifica il link generato dalle Impostazioni.
        </p>
      </div>
    </div>
  )

  if (!data) return (
    <div style={styles.wrap}>
      <div style={{ textAlign: 'center', marginTop: 200, fontSize: 22, color: 'rgba(255,255,255,0.5)' }}>
        Caricamento…
      </div>
    </div>
  )

  return (
    <div style={styles.wrap}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>{data.org?.nome || 'Foodos'}</h1>
          <div style={styles.sub}>{giornoLabel}</div>
        </div>
        <div style={styles.ora}>{ora}</div>
      </header>

      {data.sedi.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: 100, fontSize: 22, color: 'rgba(255,255,255,0.5)' }}>
          Nessuna sede attiva da mostrare.
        </div>
      ) : (
        <div style={styles.grid}>
          {data.sedi.map(sede => (
            <div key={sede.id} style={styles.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <h2 style={styles.sedeName}>{sede.nome}</h2>
                  {sede.citta && <div style={styles.sedeCitta}>{sede.citta}</div>}
                </div>
              </div>
              <div style={styles.kpiRow}>
                <div style={styles.kpiBox}>
                  <div style={styles.kpiLabel}>Prodotti oggi</div>
                  <div style={{ ...styles.kpiValue, color: '#34D399' }}>{sede.prodOggi}</div>
                </div>
                <div style={styles.kpiBox}>
                  <div style={styles.kpiLabel}>Stock vetrina</div>
                  <div style={{ ...styles.kpiValue, color: '#FBBF24' }}>{sede.stockTot}</div>
                </div>
              </div>
              <div>
                <div style={styles.listLabel}>Top in vetrina</div>
                {sede.stockPerProdotto.length === 0 ? (
                  <div style={{ ...styles.listRow, justifyContent: 'center', color: 'rgba(255,255,255,0.4)' }}>
                    Vetrina vuota
                  </div>
                ) : sede.stockPerProdotto.map((p, i) => (
                  <div key={i} style={styles.listRow}>
                    <div style={styles.listName}>{p.nome}</div>
                    <div style={styles.listQty}>{p.quantita}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={styles.footer}>
        Aggiornato {lastUpdate ? lastUpdate.toLocaleTimeString('it-IT') : '—'} · refresh ogni 5 min
      </div>
    </div>
  )
}
