// AI Reformulation Engine (B3)
//
// L'utente seleziona una ricetta dal ricettario, definisce un food cost target,
// e l'AI propone 3 varianti per raggiungerlo:
//   1. SOSTITUZIONI ingredienti (con tassonomia: pistacchio bronte -> pistacchio sicilia)
//   2. RESE diverse (riduzione gr ingrediente, mantenendo gusto)
//   3. PRICING (alzare prezzo vendita)
//
// Per ogni variante mostra:
//   - delta food cost €/pz
//   - rischio gusto (basso/medio/alto, AI-judged)
//   - food cost stimato risultante
//   - bottone "Applica" (versione MVP: solo log, non modifica davvero la ricetta)

import React, { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { color as T } from '../lib/theme'
import useIsMobile from '../lib/useIsMobile'
import { buildIngCosti, calcolaFC, getR } from '../lib/foodcost'
import Icon from '../components/Icon'
import AiPageHero from '../components/AiPageHero'

const BRAND = T.brand || '#6E0E1A'
const SOFT = T.textSoft || '#8B95A7'
const TXT = T.text || '#0E1726'
const MID = T.textMid || '#475264'
const CARD = T.bgCard || '#FFF'
const BORDER = T.border || '#E5E9EF'
const GREEN = T.green || '#16A34A'

export default function ReformulationView({ ricettario, orgId }) {
  const isMobile = useIsMobile()
  const ricetteArr = useMemo(
    () => (ricettario?.ricette ? Object.values(ricettario.ricette) : []),
    [ricettario]
  )
  const [ricSel, setRicSel] = useState('')
  const [fcTarget, setFcTarget] = useState('')
  const [loading, setLoading] = useState(false)
  const [varianti, setVarianti] = useState(null)
  const [error, setError] = useState(null)

  const ricCurrent = useMemo(() => ricetteArr.find(r => (r.nome || '') === ricSel), [ricSel, ricetteArr])

  const fcAttuale = useMemo(() => {
    if (!ricCurrent) return null
    const ic = buildIngCosti(ricettario?.ingredienti_costi || {})
    const { tot: fcPezzo } = calcolaFC(ricCurrent, ic, ricettario)
    const prezzo = Number(getR(ricCurrent.nome, ricCurrent).prezzo) || 0
    return {
      fcPezzo,
      prezzo,
      fcPct: prezzo > 0 ? (fcPezzo / prezzo) * 100 : 0,
      ingredienti: (ricCurrent.ingredienti || ricCurrent.composizione || []).slice(0, 30),
    }
  }, [ricCurrent, ricettario])

  async function genera() {
    if (!ricCurrent || !fcTarget || !fcAttuale) return
    setLoading(true); setError(null); setVarianti(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sessione scaduta')

      const system = `Sei un food cost consultant per pasticcerie/gelaterie italiane.
L'utente vuole portare una ricetta a un food cost target. Proponi ESATTAMENTE
3 varianti, ognuna in una direzione diversa:
- "sostituzioni": modifica ingredienti (es. zucchero raffinato -> zucchero canna)
- "rese": riduzione grammature mantenendo gusto/percezione
- "pricing": semplicemente alzare il prezzo di vendita (con stima impatto domanda)

Per OGNI variante valuta:
- delta_fc_eur: quanti EUR per pezzo risparmi (o aumenti il margine, per pricing)
- fc_risultante_pct: food cost % stimato dopo la modifica
- rischio_gusto: "basso"|"medio"|"alto" (per pricing e' sempre "n/a")
- impatto_vendite_pct: stima cambiamento vendite (negativo se rischio cliente)
- spiegazione: 2 frasi max, italiano corrente, niente emoji

Output JSON ESATTAMENTE in questo formato:
{
  "varianti": [
    { "tipo": "sostituzioni", "titolo": "<titolo>", "delta_fc_eur": <num>, "fc_risultante_pct": <num>, "rischio_gusto": "basso|medio|alto", "impatto_vendite_pct": <num>, "spiegazione": "<2 frasi>", "azioni": [{"ingrediente_attuale": "<>", "ingrediente_nuovo": "<>", "delta_grammi": <num o null>}] },
    { "tipo": "rese", ... stesso schema },
    { "tipo": "pricing", "titolo": "...", "delta_fc_eur": 0, "fc_risultante_pct": <num>, "rischio_gusto": "n/a", "impatto_vendite_pct": <num>, "spiegazione": "...", "azioni": [{"prezzo_attuale": <num>, "prezzo_nuovo": <num>}] }
  ]
}
SOLO il JSON. NIENTE markdown. NIENTE testo extra.`

      const userMsg = `Ricetta: ${ricCurrent.nome}
Food cost attuale: €${fcAttuale.fcPezzo.toFixed(2)}/pezzo (${fcAttuale.fcPct.toFixed(1)}%)
Prezzo vendita attuale: €${fcAttuale.prezzo.toFixed(2)}
Food cost TARGET richiesto: ${fcTarget}%

Ingredienti attuali:
${fcAttuale.ingredienti.map(i => `- ${i.nome || i.ingrediente} ${i.qta_g || i.quantita || ''}g`).join('\n')}

Proponi le 3 varianti come da istruzioni.`

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          model: 'claude-opus-4-7',
          max_tokens: 2000,
          temperature: 0.4,
          system,
          messages: [{ role: 'user', content: userMsg }],
        }),
      })
      if (!res.ok) {
        if (res.status === 429) throw new Error('Troppe richieste AI. Riprova fra 1 minuto.')
        if (res.status === 401) throw new Error('Sessione scaduta. Esci e rientra.')
        throw new Error(`Servizio AI indisponibile (HTTP ${res.status}). Riprova fra poco.`)
      }
      const json = await res.json()
      const text = (json.content || []).find(c => c.type === 'text')?.text || ''
      const m = text.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('AI non ha prodotto JSON')
      const parsed = JSON.parse(m[0])
      setVarianti(parsed.varianti || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? 12 : 0 }}>
      <AiPageHero
        eyebrow="AI · Reformulation engine"
        title="Ottimizza ricetta"
        accentText="a food cost target"
        subtitle="Scegli una ricetta e il food cost che vorresti raggiungere. L'AI propone 3 varianti (sostituzioni ingredienti, riduzione rese, pricing) con impatto sensoriale e di vendita stimato."
        statusBadge="LIVE"
        stats={[
          { n: '3', l: 'Varianti per ogni richiesta' },
          { n: 'Opus', l: 'Modello AI' },
        ]}
      />

      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, padding: isMobile ? 16 : 22, marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 140px', gap: 12, alignItems: 'end' }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: SOFT, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 5 }}>
              Ricetta
            </div>
            <select value={ricSel} onChange={e => setRicSel(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 14, color: TXT, fontFamily: 'inherit', boxSizing: 'border-box' }}>
              <option value="">— Scegli ricetta —</option>
              {ricetteArr.map(r => <option key={r.nome} value={r.nome}>{r.nome}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: SOFT, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 5 }}>
              Food cost target (%)
            </div>
            <input type="number" value={fcTarget} onChange={e => setFcTarget(e.target.value)}
              placeholder="es. 26"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 14, color: TXT, fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
          <button onClick={genera} disabled={!ricCurrent || !fcTarget || loading}
            style={{ background: !ricCurrent || !fcTarget ? '#CBD5E1' : BRAND, color: '#FFF', border: 'none', padding: '11px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: ricCurrent && fcTarget ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
            <Icon name="sparkles" size={13}/> {loading ? 'Analizzo…' : 'Genera varianti'}
          </button>
        </div>

        {fcAttuale && (
          <div style={{ marginTop: 14, padding: '10px 12px', background: '#F1F5F9', borderRadius: 8, fontSize: 12.5, color: MID }}>
            <strong>Stato attuale:</strong> {ricCurrent.nome} · FC €{fcAttuale.fcPezzo.toFixed(2)}/pz ({fcAttuale.fcPct.toFixed(1)}%) · Prezzo €{fcAttuale.prezzo.toFixed(2)}
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', marginBottom: 16, color: '#991B1B', fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {varianti && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14 }}>
          {varianti.map((v, i) => (
            <div key={i} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: BRAND, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  {v.tipo}
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: TXT, marginTop: 4 }}>{v.titolo}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 }}>
                <Stat label="Delta FC" value={`€${v.delta_fc_eur > 0 ? '+' : ''}${(v.delta_fc_eur || 0).toFixed(2)}`} color={v.delta_fc_eur >= 0 ? GREEN : BRAND} />
                <Stat label="FC stimato" value={`${(v.fc_risultante_pct || 0).toFixed(1)}%`} />
                <Stat label="Rischio gusto" value={v.rischio_gusto || '—'} color={v.rischio_gusto === 'basso' ? GREEN : v.rischio_gusto === 'alto' ? BRAND : MID} />
                <Stat label="Impatto vendite" value={`${(v.impatto_vendite_pct || 0).toFixed(0)}%`} color={v.impatto_vendite_pct < -5 ? BRAND : MID} />
              </div>
              <div style={{ fontSize: 12, color: MID, lineHeight: 1.55, background: '#FAFAF6', padding: 10, borderRadius: 8 }}>
                {v.spiegazione}
              </div>
              {Array.isArray(v.azioni) && v.azioni.length > 0 && (
                <div style={{ fontSize: 11.5, color: SOFT }}>
                  Azioni: {v.azioni.map((a, j) => (
                    <div key={j} style={{ marginTop: 4, padding: '4px 8px', background: '#F1F5F9', borderRadius: 6 }}>
                      {a.ingrediente_attuale && <>{a.ingrediente_attuale} → <strong>{a.ingrediente_nuovo}</strong>{a.delta_grammi != null && ` (${a.delta_grammi > 0 ? '+' : ''}${a.delta_grammi}g)`}</>}
                      {a.prezzo_attuale != null && <>Prezzo €{a.prezzo_attuale} → <strong>€{a.prezzo_nuovo}</strong></>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 24, fontSize: 11, color: SOFT, textAlign: 'center', lineHeight: 1.5 }}>
        ⚠️ Le varianti sono stime AI. Validale sempre con un test pratico prima di applicarle al ricettario.
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: '#FAFAF6', borderRadius: 6, padding: '6px 8px' }}>
      <div style={{ fontSize: 9, color: SOFT, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: color || TXT, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}
