import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { color as T } from '../lib/theme'
import { callAi } from '../lib/aiClient'
import Icon from './Icon'
import { costruisciMenu, cercaVoci, vociMenu } from '../lib/menuFoodos'

// Command Palette (Cmd+K / Ctrl+K) - search globale con intent parser AI.
//
// 4 modi:
//   1. Naviga    - "food cost" -> view P&L
//   2. Trova     - "cannolo siciliano" -> ricetta
//   3. Calcola   - "quanto ho incassato oggi" -> risposta diretta
//   4. Comando   - "aggiungi spreco di 2 brioches" -> azione (placeholder)
//
// Trigger: Cmd+K / Ctrl+K globale o click su icona search in topbar.

const BRAND = T.brand || '#6E0E1A'
const SOFT = T.textSoft || '#8B95A7'
const TXT = T.text || '#0E1726'
const MID = T.textMid || '#475264'
const CARD = T.bgCard || '#FFF'
const BORDER = T.border || '#E5E9EF'

// Mapping: parole -> view-id. Usato come fallback rapido senza chiamare AI.
//
// Le pagine nascoste (PAGINE_NASCOSTE in Dashboard.jsx) non vanno elencate qui:
// la ricerca le troverebbe e il click aprirebbe uno schermo bianco. L'HACCP e'
// uscito il 14/09/2026 per questo motivo.
// L'elenco delle pagine viene da src/lib/menuFoodos.js, lo stesso del menu.
//
// Prima era scritto qui a mano — ottava copia della stessa informazione — e
// dopo la riorganizzazione del 15/09/2026 sarebbe rimasto coi nomi vecchi:
// la ricerca rapida avrebbe offerto «Profitti (P&L)» e «Scadenzario
// fornitori», pagine che si chiamano in un altro modo.
//
// I nomi vecchi restano cercabili lo stesso: stanno nei `sinonimi` di ogni
// voce, che è dove devono stare.
const MENU_COMPLETO = costruisciMenu({
  metodoInventario: true, sedeDiProduzione: true, piuSedi: true,
})

// `permesse` = insieme delle pagine che questo utente puo' aprire, oppure null
// per il titolare (tutte). Senza questo filtro un dipendente scriveva
// "stipendi" e la ricerca gli offriva Personale; scriveva "food cost" e gli
// offriva il P&L. La navigazione veniva poi respinta, ma la scorciatoia
// c'era, e vedere il nome di una pagina che non dovresti avere e' già un
// pezzo di informazione che non ti spetta.
function quickMatch(q, permesse) {
  return cercaVoci(q, MENU_COMPLETO)
    .filter(v => !permesse || permesse.has(v.id))
    .map(v => ({ view: v.id, label: v.label, dentro: v.dentro }))
    .slice(0, 5)
}

export default function CommandPalette({ open, onClose, onNavigate, orgId, vistePermesse = null }) {
  const [q, setQ] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiAnswer, setAiAnswer] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30)
      setQ(''); setAiAnswer(null)
    }
  }, [open])

  // Global Cmd+K / Ctrl+K
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        // L'apertura e' controllata dal parent (Dashboard) via setter.
        // Emettiamo un custom event globale che Dashboard ascolta.
        window.dispatchEvent(new CustomEvent('foodos:cmdk'))
      }
      if (e.key === 'Escape' && open) onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const hits = quickMatch(q, vistePermesse)

  async function askAi() {
    if (!q.trim()) return
    setAiLoading(true); setAiAnswer(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sessione scaduta')

      // All'assistente si elencano SOLO le pagine di chi sta chiedendo. Se a un
      // dipendente si elencano anche P&L e Personale, prima o poi gliele
      // propone — e il solo vederle nominate dice che esistono e che lui non
      // le ha.
      // Anche l'elenco per l'assistente viene dal menu: era una nona copia
      // scritta a mano, e nominava pagine che nel frattempo si erano spostate.
      const tutteLeViste = vociMenu(MENU_COMPLETO, true)
        .flatMap(v => [v.id, ...(v.schede || []).map(t => t.id)])
      const elencoViste = ['home', ...new Set(tutteLeViste)]
        .filter(id => !vistePermesse || vistePermesse.has(id))
        .join(', ')

      const system = `Sei un assistente per chi lavora in una pasticceria/gelateria
italiana e usa Foodos. Riceverai una domanda libera dell'utente.
Compito:
1. Se la domanda chiede di NAVIGARE a una sezione, rispondi con: NAVIGATE:<view-id>
   View-id disponibili: ${elencoViste}.
   NON esistono altre pagine: se la domanda ne chiede una fuori da questo
   elenco NON usare NAVIGATE. Rispondi TEXT dicendo che quella parte non è
   disponibile, senza spiegare perché e senza nominare pagine non elencate.
2. Se la domanda chiede un DATO (es. ricavi oggi, food cost), rispondi:
   DATA: <descrizione di cosa servirebbe interrogare> (l'utente capira').
3. Altrimenti rispondi con: TEXT: <risposta breve in italiano>
Massimo 60 parole.`

      const { text } = await callAi({
        feature: 'cmdk-intent',
        model: 'claude-haiku-4-5-20251001',
        system,
        prompt: q,
        maxTokens: 220,
        timeoutMs: 12_000,    // Haiku è veloce, cap stretto per UX snappy
      })
      const txt = (text || '').trim()
      // Parsing: prefix navigate/data/text
      if (txt.toUpperCase().startsWith('NAVIGATE:')) {
        const view = txt.substring(9).trim().replace(/\.$/, '')
        // Ultima rete: un modello puo' sempre inventare o ricordare male. Se
        // propone una pagina che questo utente non ha, la scorciatoia non si
        // mostra — nemmeno per farla poi respingere.
        if (vistePermesse && !vistePermesse.has(view)) {
          setAiAnswer({ kind: 'text', text: 'Quella parte non fa parte delle tue pagine.' })
        } else {
          setAiAnswer({ kind: 'navigate', view })
        }
      } else if (txt.toUpperCase().startsWith('DATA:')) {
        setAiAnswer({ kind: 'data', text: txt.substring(5).trim() })
      } else {
        setAiAnswer({ kind: 'text', text: txt.replace(/^TEXT:\s*/i, '') })
      }
    } catch (e) {
      setAiAnswer({ kind: 'error', text: e.friendly || e.message })
    } finally {
      setAiLoading(false)
    }
  }

  function doNavigate(view) {
    if (vistePermesse && !vistePermesse.has(view)) { onClose?.(); return }
    onNavigate?.(view)
    onClose?.()
  }

  if (!open) return null

  return (
    <div role="dialog" aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
        zIndex: 300, padding: 16, display: 'flex',
        alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh',
      }}>
      <div onClick={e => e.stopPropagation()}
        style={{
          background: CARD, borderRadius: 14, width: '100%', maxWidth: 580,
          boxShadow: '0 30px 80px rgba(15,23,42,0.40)', overflow: 'hidden',
        }}>
        {/* Input */}
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Icon name="search" size={18} color={SOFT} />
          <input ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') askAi() }}
            placeholder="Cerca o chiedi qualsiasi cosa…"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 16, color: TXT, fontFamily: 'inherit',
            }}
          />
          <kbd style={{ fontSize: 12, color: SOFT, padding: '2px 6px', borderRadius: 4, border: `1px solid ${BORDER}` }}>ESC</kbd>
        </div>

        {/* Risultati rapidi (matching keyword) */}
        {hits.length > 0 && (
          <div style={{ padding: '6px 0' }}>
            <div style={{ padding: '6px 18px', fontSize: 12, color: SOFT, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Vai a
            </div>
            {hits.map(h => (
              <button key={h.view} onClick={() => doNavigate(h.view)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                  padding: '10px 18px', background: 'transparent', border: 'none',
                  cursor: 'pointer', fontSize: 13, color: TXT, textAlign: 'left',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <Icon name="chevR" size={12} color={SOFT} />
                <span>{h.label}</span>
                {/* Se la pagina è una scheda dentro un'altra, si dice dove:
                    «Spese fisse» da solo non fa capire che sta nel conto. */}
                {h.dentro && <span style={{ color: SOFT }}>in «{h.dentro}»</span>}
              </button>
            ))}
          </div>
        )}

        {/* AI ask */}
        {q.trim() && (
          <div style={{ borderTop: hits.length > 0 ? `1px solid ${BORDER}` : 'none', padding: '12px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: aiAnswer ? 10 : 0 }}>
              <div style={{ fontSize: 12, color: SOFT, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Chiedi all'AI
              </div>
              <button onClick={askAi} disabled={aiLoading}
                style={{
                  background: BRAND, color: '#FFF', border: 'none',
                  padding: '5px 14px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                  cursor: aiLoading ? 'wait' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}>
                <Icon name="sparkles" size={11} /> {aiLoading ? 'Cerco…' : 'Chiedi'}
              </button>
            </div>
            {aiAnswer?.kind === 'navigate' && (
              <button onClick={() => doNavigate(aiAnswer.view)}
                style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', fontSize: 13, color: '#075985', display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                <Icon name="chevR" size={13} /> Vai a "{aiAnswer.view}"
              </button>
            )}
            {aiAnswer?.kind === 'data' && (
              <div style={{ background: '#FEFCE8', border: '1px solid #FEF08A', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#854D0E' }}>
                {aiAnswer.text}
              </div>
            )}
            {aiAnswer?.kind === 'text' && (
              <div style={{ background: '#F1F5F9', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px', fontSize: 13, color: MID, lineHeight: 1.55 }}>
                {aiAnswer.text}
              </div>
            )}
            {aiAnswer?.kind === 'error' && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#991B1B' }}>
                {aiAnswer.text}
              </div>
            )}
          </div>
        )}

        {/* Hint */}
        {!q.trim() && hits.length === 0 && (
          <div style={{ padding: '24px 20px', textAlign: 'center', color: SOFT, fontSize: 12, lineHeight: 1.6 }}>
            Cerca una sezione, una ricetta, o chiedi all'AI.<br/>
            <span style={{ fontSize: 12 }}>Esempi: <em>"food cost"</em>, <em>"cannolo"</em>, <em>"quanto ho incassato oggi"</em></span>
          </div>
        )}
      </div>
    </div>
  )
}
