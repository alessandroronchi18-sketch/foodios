// Recensioni - AI Reply suggerito
//
// Il titolare incolla il testo di una recensione (Google Maps, TripAdvisor,
// social) e l'AI genera 3 risposte con tono diverso (formale/caldo/fattuale).
// Pronte da copiare e incollare nella piattaforma originale.
//
// Niente DB: stateless, solo /api/ai proxy + clipboard copy.

import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { color as T, radius as R, typo } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { callAi } from '../lib/aiClient'
import Icon from '../components/Icon'
import AiPageHero from '../components/AiPageHero'

const BRAND = T.brand || '#6E0E1A'
const SOFT = T.textSoft || '#8B95A7'
const TXT = T.text || '#0E1726'
const MID = T.textMid || '#475264'
const CARD = T.bgCard || '#FFF'
const BORDER = T.border || '#E5E9EF'

// Oltre questa lunghezza non è più una recensione: è un incolla sbagliato.
const MAX_RECENSIONE = 2000

const TONI = [
  { id: 'caldo',    label: 'Caldo', desc: 'Empatico, parole gentili, come parli al banco' },
  { id: 'formale',  label: 'Formale', desc: 'Professionale, rispettoso, niente confidenze' },
  { id: 'fattuale', label: 'Fattuale', desc: 'Dritto al problema, soluzione concreta' },
]

export default function RecensioniView({ nomeAttivita }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const [recensione, setRecensione] = useState('')
  const [autore, setAutore] = useState('')
  const [stelle, setStelle] = useState(5)
  const [risposte, setRisposte] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [copiato, setCopiato] = useState(null)

  async function genera() {
    const testo = recensione.trim()
    if (!testo) return
    if (testo.length > MAX_RECENSIONE) {
      setError(`Questa è lunga ${testo.length.toLocaleString('it-IT')} caratteri: le recensioni vere stanno sotto i ${MAX_RECENSIONE.toLocaleString('it-IT')}. Incolla solo la recensione.`)
      return
    }
    setLoading(true); setError(null); setRisposte(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sessione scaduta')

      const system = `Sei un consulente di customer experience per attività di
ristorazione/pasticceria/gelateria italiana. L'utente ti darà una recensione
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

      const userMsg = `Attività: ${nomeAttivita || 'pasticceria/gelateria'}
Autore recensione: ${autore || 'cliente anonimo'}
Stelle (1-5): ${stelle}

Testo della recensione:
"${testo}"

Genera le 3 risposte come da istruzioni.`

      const { json: parsed } = await callAi({
        feature: 'reply-recensioni',
        model: 'claude-sonnet-5',
        system,
        prompt: userMsg,
        maxTokens: 1000,
        parseJson: true,
        timeoutMs: 30_000,
      })
      if (!parsed) throw Object.assign(new Error('Risposta non valida'), { friendly: 'Qualcosa è andato storto. Riprova.' })
      setRisposte(parsed)
    } catch (e) {
      setError(e.friendly || e.message)
    } finally {
      setLoading(false)
    }
  }

  // Audit 2026-07-01 HIGH: tracking timer, click rapidi accumulavano timer
  // sovrapposti - l'ultimo finiva per resetare anche i success "verdi" futuri.
  const copyTimerRef = useRef(null)
  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
  }, [])
  function scheduleCopiatoReset() {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => { setCopiato(null); copyTimerRef.current = null }, 2000)
  }

  async function copia(tono, testo) {
    try {
      await navigator.clipboard.writeText(testo)
      setCopiato(tono)
      scheduleCopiatoReset()
    } catch {
      // Fallback su dispositivi senza clipboard API
      const ta = document.createElement('textarea')
      ta.value = testo; document.body.appendChild(ta); ta.select()
      document.execCommand('copy'); document.body.removeChild(ta)
      setCopiato(tono); scheduleCopiatoReset()
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: isMobile ? 12 : isTablet ? 16 : 0 }}>
      <AiPageHero
        eyebrow="Recensioni"
        title="Tre risposte"
        accentText="pronte"
        subtitle="Incolla la recensione che hai ricevuto. Ti scrivo tre versioni della risposta — calda, formale, fattuale — in italiano pulito. Copi quella che ti suona meglio."
        statusBadge="LIVE"
        stats={[
          { n: '3', l: 'Toni diversi' },
          { n: '30 sec', l: 'Pronto da incollare' },
        ]}
      />

      {/* INPUT */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: isMobile ? 16 : isTablet ? 18 : 22, marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label htmlFor="rec-autore" style={{ ...typo.overline, color: SOFT, marginBottom: 5, display: 'block' }}>
              Chi l'ha scritta (se lo sai)
            </label>
            <input id="rec-autore" value={autore} onChange={e => setAutore(e.target.value)}
              placeholder="es. Maria L."
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 14, color: TXT, fontFamily: 'inherit', boxSizing: 'border-box' }}/>
          </div>
          <div>
            <div style={{ ...typo.overline, color: SOFT, marginBottom: 5 }}>
              Quante stelle ti ha dato
            </div>
            <div role="radiogroup" aria-label="Stelle della recensione"
              style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              {[1,2,3,4,5].map(n => (
                <button key={n} type="button" role="radio" aria-checked={n === stelle}
                  aria-label={n === 1 ? '1 stella' : `${n} stelle`}
                  onClick={() => setStelle(n)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer',
                    padding: 6, minHeight: 44, minWidth: 36, display: 'inline-flex',
                    alignItems: 'center', justifyContent: 'center', lineHeight: 0 }}>
                  <Icon name="star" size={20} color={n <= stelle ? T.amber : T.border} />
                </button>
              ))}
              <span style={{ ...typo.small, color: MID, marginLeft: 6, whiteSpace: 'nowrap' }}>
                {stelle === 1 ? '1 stella' : `${stelle} stelle`}
              </span>
            </div>
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
            <label htmlFor="rec-testo" style={{ ...typo.overline, color: SOFT }}>
              Testo della recensione
            </label>
            {recensione.length > MAX_RECENSIONE * 0.75 && (
              <span style={{ ...typo.small, color: recensione.length > MAX_RECENSIONE ? T.red : SOFT }}>
                {recensione.length.toLocaleString('it-IT')} / {MAX_RECENSIONE.toLocaleString('it-IT')}
              </span>
            )}
          </div>
          <textarea id="rec-testo" value={recensione} onChange={e => { setRecensione(e.target.value); if (error) setError(null) }}
            placeholder="Incolla qui il testo della recensione che hai ricevuto…"
            rows={6}
            style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 14, color: TXT, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }}/>
        </div>
        <button onClick={genera} disabled={loading || !recensione.trim()}
          style={{
            background: recensione.trim() && !loading ? BRAND : T.borderStr,
            color: '#FFF', border: 'none', padding: '12px 22px',
            borderRadius: 10, fontSize: 14, fontWeight: 700,
            cursor: recensione.trim() && !loading ? 'pointer' : 'not-allowed',
            display: 'inline-flex', alignItems: 'center', gap: 8,
          }}>
          <Icon name="sparkles" size={14} /> {loading ? 'Sto scrivendo…' : 'Scrivimi le risposte'}
        </button>
      </div>

      {error && (
        <div style={{ background: T.redLight, border: `1px solid ${T.red}33`, borderRadius: R.lg, padding: '12px 16px', marginBottom: 16, color: T.red, ...typo.small, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="alert" size={14} color={T.red}/> {error}
        </div>
      )}

      {/* RISPOSTE */}
      {risposte && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr' : 'repeat(3, 1fr)', gap: 12 }}>
          {TONI.map(t => {
            const txt = risposte[t.id] || ''
            return (
              <div key={t.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: TXT }}>{t.label}</div>
                  <div style={{ fontSize: 12, color: SOFT, marginTop: 2 }}>{t.desc}</div>
                </div>
                <div style={{ flex: 1, background: T.bgSubtle, borderRadius: R.md, padding: '10px 12px', ...typo.small, color: MID, lineHeight: 1.55, minHeight: 120 }}>
                  {txt}
                </div>
                <button onClick={() => copia(t.id, txt)}
                  style={{
                    background: copiato === t.id ? T.green : T.text, color: T.white,
                    border: 'none', padding: '9px 14px', borderRadius: 8,
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}>
                  {copiato === t.id ? <><Icon name="check" size={12} color="#FFF"/> Copiata</> : <><Icon name="copy" size={12}/> Copia</>}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
