// AI Recipe Inventor (C3)
//
// L'AI inventa 3 ricette nuove in base a:
//   - tipo prodotto (torta, biscotto, gelato, ecc.)
//   - stagione corrente / mood
//   - ingredienti che hai in magazzino (opzionale)
//   - allergie da evitare (opzionale)
//
// Output: 3 ricette con nome, descrizione plating, lista ingredienti precisi,
// food cost stimato. Bottone "Salva nel ricettario" per ogni ricetta.

import React, { useMemo, useState } from 'react'
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

const TIPI = [
  { id: 'torta',    lbl: '🎂 Torta' },
  { id: 'biscotto', lbl: '🍪 Biscotto' },
  { id: 'pasticcino', lbl: '🧁 Pasticcino' },
  { id: 'gelato',   lbl: '🍦 Gelato' },
  { id: 'cioccolato', lbl: '🍫 Cioccolato' },
  { id: 'lievitato', lbl: '🥐 Lievitato' },
  { id: 'bevanda',  lbl: '☕ Bevanda' },
  { id: 'altro',    lbl: '✨ Sorprendimi' },
]

const MOOD = [
  { id: 'fresca',     lbl: 'Fresca / estiva' },
  { id: 'ricca',      lbl: 'Ricca / golosa' },
  { id: 'leggera',    lbl: 'Leggera / dietetica' },
  { id: 'tradizionale', lbl: 'Tradizionale italiana' },
  { id: 'innovativa', lbl: 'Innovativa / sperimentale' },
  { id: 'low_cost',   lbl: 'Low cost / margine alto' },
]

export default function RecipeInventorView({ orgId, user, nomeAttivita }) {
  const isMobile = useIsMobile()
  const [tipo, setTipo] = useState('torta')
  const [mood, setMood] = useState('tradizionale')
  const [ingredienti, setIngredienti] = useState('')
  const [allergie, setAllergie] = useState('')
  const [loading, setLoading] = useState(false)
  const [ricette, setRicette] = useState(null)
  const [error, setError] = useState(null)

  async function genera() {
    setLoading(true); setError(null); setRicette(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const oggi = new Date()
      const mese = oggi.toLocaleDateString('it-IT', { month: 'long' })
      const stagione = (() => {
        const m = oggi.getMonth() + 1
        if (m <= 2 || m === 12) return 'inverno'
        if (m <= 5) return 'primavera'
        if (m <= 8) return 'estate'
        return 'autunno'
      })()

      const system = `Sei un pastry chef italiano. Inventi ricette originali ma fattibili.
Restituisci ESATTAMENTE 3 ricette in JSON con questo schema:
{
  "ricette": [
    {
      "nome": "<nome accattivante italiano>",
      "descrizione_plating": "<2 frasi su presentazione visiva>",
      "tempo_preparazione_min": <num>,
      "porzioni": <num>,
      "ingredienti": [{"nome": "<>", "qta_g": <num>, "note": "<opzionale>"}],
      "procedimento_steps": ["step 1", "step 2", "..."],
      "food_cost_stimato_pz": <num>,
      "prezzo_consigliato": <num>,
      "perche_funziona": "<1 frase>"
    },
    ... (3 totali)
  ]
}
REGOLE:
- Italiano corretto, niente anglicismi.
- Ingredienti REALI e disponibili in Italia.
- Quantità realistiche (es. torta 8 porzioni = 800-1200g totali).
- Food cost stimato basato su prezzi medi italiani.
- Prezzo consigliato 3-4× food cost (margine artigianale tipico).
- SOLO il JSON, niente markdown o testo extra.`

      const userMsg = `Inventa 3 ricette ${tipo} per ${nomeAttivita || 'la pasticceria'} con queste caratteristiche:

Tipo: ${TIPI.find(t => t.id === tipo)?.lbl || tipo}
Mood: ${MOOD.find(m => m.id === mood)?.lbl || mood}
Stagione corrente: ${stagione} (${mese})
${ingredienti.trim() ? `Ingredienti disponibili: ${ingredienti.trim()}` : ''}
${allergie.trim() ? `Allergie da evitare: ${allergie.trim()}` : ''}

Inventa 3 ricette diverse fra loro (es. una classica, una innovativa, una stagionale).`

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          model: 'claude-opus-4-7',
          max_tokens: 4000,
          temperature: 0.7,
          system,
          messages: [{ role: 'user', content: userMsg }],
        }),
      })
      const json = await res.json()
      const text = (json.content || []).find(c => c.type === 'text')?.text || ''
      const m = text.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('AI non ha prodotto JSON')
      const parsed = JSON.parse(m[0])
      setRicette(parsed.ricette || [])

      // Salva su recipe_inventions
      try {
        await supabase.from('recipe_inventions').insert({
          organization_id: orgId,
          user_id: user?.id,
          prompt: { tipo, mood, ingredienti, allergie, stagione, mese },
          ricette: parsed.ricette || [],
        })
      } catch {}
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? 12 : 0 }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: BRAND, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          Recipe Inventor AI
        </div>
        <h1 style={{ margin: '6px 0 4px', fontSize: isMobile ? 22 : 26, fontWeight: 800, color: TXT, letterSpacing: '-0.02em' }}>
          Inventa ricette nuove con l'AI
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: SOFT, lineHeight: 1.5 }}>
          Lo chef AI ti propone 3 ricette originali in base a stagione, mood e ingredienti che hai.
        </p>
      </div>

      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: isMobile ? 16 : 22, marginBottom: 18 }}>
        <div style={{ marginBottom: 14 }}>
          <Label>Tipo di prodotto</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {TIPI.map(t => (
              <button key={t.id} onClick={() => setTipo(t.id)}
                style={{ padding: '7px 12px', borderRadius: 999, border: `1px solid ${tipo === t.id ? BRAND : BORDER}`, background: tipo === t.id ? BRAND : 'transparent', color: tipo === t.id ? '#FFF' : MID, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {t.lbl}
              </button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <Label>Mood</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {MOOD.map(m => (
              <button key={m.id} onClick={() => setMood(m.id)}
                style={{ padding: '7px 12px', borderRadius: 999, border: `1px solid ${mood === m.id ? BRAND : BORDER}`, background: mood === m.id ? BRAND : 'transparent', color: mood === m.id ? '#FFF' : MID, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {m.lbl}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <Label>Ingredienti che vuoi usare (opzionale)</Label>
            <input value={ingredienti} onChange={e => setIngredienti(e.target.value)}
              placeholder="es. pistacchio bronte, ricotta, mandorle"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}/>
          </div>
          <div>
            <Label>Allergie / esclusioni (opzionale)</Label>
            <input value={allergie} onChange={e => setAllergie(e.target.value)}
              placeholder="es. glutine, lattosio, frutta secca"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}/>
          </div>
        </div>
        <button onClick={genera} disabled={loading}
          style={{ background: BRAND, color: '#FFF', border: 'none', padding: '12px 24px', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: loading ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Icon name="sparkles" size={14}/> {loading ? 'Lo chef AI sta pensando…' : 'Genera 3 ricette'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: 14, color: '#991B1B', fontSize: 13, marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {ricette && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14 }}>
          {ricette.map((r, i) => (
            <div key={i} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: BRAND, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Ricetta #{i + 1}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: TXT, marginTop: 4, lineHeight: 1.3 }}>{r.nome}</div>
              </div>
              <div style={{ fontSize: 12.5, color: MID, lineHeight: 1.5, fontStyle: 'italic', background: '#FAFAF6', padding: 10, borderRadius: 8 }}>
                {r.descrizione_plating}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11 }}>
                {r.tempo_preparazione_min && <Chip>⏱ {r.tempo_preparazione_min} min</Chip>}
                {r.porzioni && <Chip>👥 {r.porzioni} porzioni</Chip>}
                {r.food_cost_stimato_pz && <Chip>💰 FC €{r.food_cost_stimato_pz.toFixed(2)}/pz</Chip>}
                {r.prezzo_consigliato && <Chip color={BRAND}>📍 vendi €{r.prezzo_consigliato.toFixed(2)}</Chip>}
              </div>
              {Array.isArray(r.ingredienti) && (
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: SOFT, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4 }}>
                    Ingredienti
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: MID, lineHeight: 1.6 }}>
                    {r.ingredienti.map((ing, j) => (
                      <li key={j}><strong>{ing.qta_g}g</strong> {ing.nome}{ing.note ? <em style={{ color: SOFT }}> — {ing.note}</em> : ''}</li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(r.procedimento_steps) && (
                <details>
                  <summary style={{ fontSize: 11, fontWeight: 700, color: BRAND, cursor: 'pointer' }}>Procedimento ({r.procedimento_steps.length} passi)</summary>
                  <ol style={{ margin: '8px 0', paddingLeft: 20, fontSize: 12, color: MID, lineHeight: 1.6 }}>
                    {r.procedimento_steps.map((s, j) => <li key={j}>{s}</li>)}
                  </ol>
                </details>
              )}
              {r.perche_funziona && (
                <div style={{ fontSize: 11.5, color: SOFT, fontStyle: 'italic', borderTop: `1px solid ${BORDER}`, paddingTop: 8 }}>
                  💡 {r.perche_funziona}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 24, fontSize: 11, color: SOFT, textAlign: 'center', lineHeight: 1.5 }}>
        ⚠️ Le ricette sono proposte AI. Testale sempre con piccole produzioni prima di metterle in vetrina.
      </div>
    </div>
  )
}

function Label({ children }) {
  return <div style={{ fontSize: 10.5, fontWeight: 700, color: SOFT, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>{children}</div>
}

function Chip({ children, color }) {
  return <span style={{ display: 'inline-block', padding: '3px 9px', background: '#F1F5F9', color: color || MID, borderRadius: 999, fontSize: 11, fontWeight: 600 }}>{children}</span>
}
