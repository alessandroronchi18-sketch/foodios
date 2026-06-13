// Recensioni — AI Reply suggerito
//
// Il titolare incolla il testo di una recensione (Google Maps, TripAdvisor,
// social) e l'AI genera 3 risposte con tono diverso (formale/caldo/fattuale).
// Pronte da copiare e incollare nella piattaforma originale.
//
// Niente DB: stateless, solo /api/ai proxy + clipboard copy.

import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
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

const TONI = [
  { id: 'caldo',    label: '🤍 Caldo / personale', desc: 'Ringraziamento empatico, parole gentili' },
  { id: 'formale',  label: '🎩 Formale / aziendale', desc: 'Professionale, rispettoso, senza emoji' },
  { id: 'fattuale', label: '📝 Fattuale / risolutivo', desc: 'Diretto al problema, soluzione concreta' },
]

export default function RecensioniView({ nomeAttivita }) {
  const isMobile = useIsMobile()
  const [recensione, setRecensione] = useState('')
  const [autore, setAutore] = useState('')
  const [stelle, setStelle] = useState(5)
  const [risposte, setRisposte] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copiato, setCopiato] = useState(null)

  async function genera() {
    if (!recensione.trim()) return
    setLoading(true); setError(null); setRisposte(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sessione scaduta')

      const system = `Sei un consulente di customer experience per attivita' di
ristorazione/pasticceria/gelateria italiana. L'utente ti dara' una recensione
ricevuta su una piattaforma pubblica. Devi generare ESATTAMENTE 3 risposte in
italiano corretto, una per ogni tono indicato dall'utente. Ogni risposta:
- Max 80 parole
- Italiano impeccabile (no errori, no anglicismi)
- Personalizzata sul contenuto della recensione
- Conclude con un invito (a tornare, a un contatto diretto, a una specifica)
- NIENTE risposte preconfezionate generiche

Output in JSON ESATTAMENTE in questo formato:
{
  "caldo": "<risposta tono caldo>",
  "formale": "<risposta tono formale>",
  "fattuale": "<risposta tono fattuale>"
}

NIENTE testo prima o dopo il JSON. NIENTE markdown.`

      const userMsg = `Attivita': ${nomeAttivita || 'pasticceria/gelateria'}
Autore recensione: ${autore || 'cliente anonimo'}
Stelle (1-5): ${stelle}

Testo della recensione:
"${recensione.trim()}"

Genera le 3 risposte come da istruzioni.`

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          temperature: 0.45,
          system,
          messages: [{ role: 'user', content: userMsg }],
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Errore AI')
      const text = (json.content || []).find(c => c.type === 'text')?.text || ''
      // Estrai JSON dal testo (a volte il modello aggiunge ```json)
      const m = text.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('Risposta AI non valida')
      const parsed = JSON.parse(m[0])
      setRisposte(parsed)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function copia(tono, testo) {
    try {
      await navigator.clipboard.writeText(testo)
      setCopiato(tono)
      setTimeout(() => setCopiato(null), 2000)
    } catch {
      // Fallback su dispositivi senza clipboard API
      const ta = document.createElement('textarea')
      ta.value = testo; document.body.appendChild(ta); ta.select()
      document.execCommand('copy'); document.body.removeChild(ta)
      setCopiato(tono); setTimeout(() => setCopiato(null), 2000)
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: isMobile ? 12 : 0 }}>
      <AiPageHero
        eyebrow="AI · Reputazione & Marketing"
        title="Rispondi"
        accentText="alle recensioni"
        subtitle="Incolla qui la recensione che hai ricevuto. L'AI genera 3 risposte (calda, formale, fattuale) in italiano impeccabile. Copia quella che preferisci."
        statusBadge="LIVE"
        stats={[
          { n: '3', l: 'Toni per risposta' },
          { n: 'Sonnet', l: 'Modello linguistico' },
        ]}
      />

      {/* INPUT */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: isMobile ? 16 : 22, marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: SOFT, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 5 }}>
              Autore (opzionale)
            </div>
            <input value={autore} onChange={e => setAutore(e.target.value)}
              placeholder="es. Maria L."
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 14, color: TXT, fontFamily: 'inherit', boxSizing: 'border-box' }}/>
          </div>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: SOFT, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 5 }}>
              Stelle
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={() => setStelle(n)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 22, padding: 2, opacity: n <= stelle ? 1 : 0.25 }}>★</button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: SOFT, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 5 }}>
            Testo recensione *
          </div>
          <textarea value={recensione} onChange={e => setRecensione(e.target.value)}
            placeholder="Incolla qui il testo della recensione che hai ricevuto…"
            rows={6}
            style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 14, color: TXT, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }}/>
        </div>
        <button onClick={genera} disabled={loading || !recensione.trim()}
          style={{
            background: recensione.trim() && !loading ? BRAND : '#CBD5E1',
            color: '#FFF', border: 'none', padding: '12px 22px',
            borderRadius: 10, fontSize: 14, fontWeight: 700,
            cursor: recensione.trim() && !loading ? 'pointer' : 'not-allowed',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
          <Icon name="sparkles" size={14} /> {loading ? 'Genero risposte…' : 'Genera 3 risposte AI'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#991B1B', fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {/* RISPOSTE */}
      {risposte && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
          {TONI.map(t => {
            const txt = risposte[t.id] || ''
            return (
              <div key={t.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: TXT }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: SOFT, marginTop: 2 }}>{t.desc}</div>
                </div>
                <div style={{ flex: 1, background: '#FAFAF6', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: MID, lineHeight: 1.55, minHeight: 120 }}>
                  {txt}
                </div>
                <button onClick={() => copia(t.id, txt)}
                  style={{
                    background: copiato === t.id ? '#16A34A' : '#0E1726', color: '#FFF',
                    border: 'none', padding: '9px 14px', borderRadius: 8,
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                  {copiato === t.id ? '✓ Copiata negli appunti' : <><Icon name="copy" size={12}/> Copia testo</>}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
