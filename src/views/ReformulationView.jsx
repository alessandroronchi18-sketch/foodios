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

    // Numeri italiani (memory feedback-numeri-italiani)
    const _e = n => `€ ${Number(n||0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const deltaTarget = fcAttuale.fcPct - fcTarget
    const fcEurTarget = fcAttuale.prezzo * fcTarget / 100

    // Prompt potenziato: persona Mara pasticcera (memory feedback-no-ai-copy),
    // contesto benchmark, vincoli operativi (es. non proporre ingredienti
    // sintetici/non-artigianali), e few-shot example impliciti via schema esteso.
    const system = `Sei Mara, una consulente food cost esperta di pasticcerie e gelaterie artigianali italiane.
Parli come una collega: frasi brevi, niente "Vorrei suggerire", italiano umano.

Il cliente vuole portare una ricetta a food cost target. Proponi ESATTAMENTE 3 varianti,
una per direzione strategica:

1. "sostituzioni" — cambia ingredienti mantenendo l'artigianalità (mai sciroppi industriali,
   mai aromi sintetici, mai grassi vegetali idrogenati). Es: latte fresco→latte UHT,
   crema fresca→panna 35% bidone, cioccolato 70%→cioccolato 60% (compromessi accettabili).
2. "rese" — riduci grammature di 5-15% sugli ingredienti più costosi senza compromettere
   la struttura (non puoi togliere uova ai bignè, ma puoi togliere il 10% del cioccolato
   alla glassa).
3. "pricing" — alza il prezzo. Stima impatto vendite usando elasticità tipica artigianale:
   +5% prezzo ≈ -3-4% vendite, +10% prezzo ≈ -8-12% vendite.

Per OGNI variante:
- delta_fc_eur: € risparmiati (sostituzioni/rese) o di margine in più (pricing)
- fc_risultante_pct: food cost % stimato dopo modifica (deve avvicinarsi al target ${fcTarget}%)
- rischio_gusto: "basso" | "medio" | "alto" (per pricing sempre "n/a")
- impatto_vendite_pct: cambio stimato volumi (negativo se peggiora)
- spiegazione: 2 frasi max, italiano umano, niente emoji, niente AI-tone
- raccomandazione: "consigliata" | "secondaria" | "ultima_spiaggia"
- difficolta_implementazione: "facile" | "media" | "complessa"

Restituisci SOLO JSON valido (niente markdown):
{
  "varianti": [
    { "tipo": "sostituzioni", "titolo": "<titolo breve>", "delta_fc_eur": <num>, "fc_risultante_pct": <num>, "rischio_gusto": "basso|medio|alto", "impatto_vendite_pct": <num>, "spiegazione": "<2 frasi>", "raccomandazione": "consigliata|secondaria|ultima_spiaggia", "difficolta_implementazione": "facile|media|complessa", "azioni": [{"ingrediente_attuale": "<>", "ingrediente_nuovo": "<>", "delta_grammi": <num o null>}] },
    { "tipo": "rese", ... stesso schema con azioni: [{"ingrediente": "<>", "qta_attuale": <num>, "qta_nuova": <num>}] },
    { "tipo": "pricing", "titolo": "...", "delta_fc_eur": 0, "fc_risultante_pct": <num>, "rischio_gusto": "n/a", "impatto_vendite_pct": <num>, "spiegazione": "...", "raccomandazione": "...", "difficolta_implementazione": "...", "azioni": [{"prezzo_attuale": <num>, "prezzo_nuovo": <num>}] }
  ],
  "verdetto_globale": "<1 frase: qual è la più sensata oggi, viste le 3>"
}`

    const userMsg = `Ricetta: ${ricCurrent.nome}

Stato attuale:
- Food cost: ${_e(fcAttuale.fcPezzo)}/pezzo (${fcAttuale.fcPct.toFixed(1)}% del prezzo)
- Prezzo vendita: ${_e(fcAttuale.prezzo)}
- Margine lordo per pezzo: ${_e(fcAttuale.prezzo - fcAttuale.fcPezzo)} (${(100-fcAttuale.fcPct).toFixed(1)}%)

Target:
- Food cost desiderato: ${fcTarget}% (= ${_e(fcEurTarget)} per pezzo)
- Devi tagliare ${Math.abs(deltaTarget).toFixed(1)} punti % (${deltaTarget > 0 ? 'riducendo costi' : 'puoi anche alzare il food cost'})

Ingredienti attuali della ricetta:
${fcAttuale.ingredienti.map(i => `- ${i.nome || i.ingrediente} ${i.qta_g || i.quantita || ''}g`).join('\n')}

Restituisci 3 varianti come da schema, italiano umano.`

    try {
      const { json } = await callAi({
        feature: 'reformulation',
        model: 'claude-opus-4-7',
        system,
        prompt: userMsg,
        maxTokens: 2500,
        parseJson: true,
        timeoutMs: 60_000,    // Opus può essere lento
      })
      if (!json || !Array.isArray(json.varianti) || json.varianti.length === 0) {
        throw Object.assign(new Error('Output malformato'), { friendly: 'L\'AI non ha prodotto varianti valide. Riprova.' })
      }
      setVarianti(json.varianti)
      // Verdetto globale come state separato per evitare di rompere il render esistente.
      window.__lastReformulationVerdict = json.verdetto_globale || null
    } catch (e) {
      setError(e.friendly || e.message)
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
            <strong>Stato attuale:</strong> {ricCurrent.nome} · FC € {fcAttuale.fcPezzo.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/pz ({fcAttuale.fcPct.toFixed(1)}%) · Prezzo € {fcAttuale.prezzo.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                <Stat label="Delta FC" value={`${v.delta_fc_eur > 0 ? '+' : ''}€ ${Number(v.delta_fc_eur || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} color={v.delta_fc_eur >= 0 ? GREEN : BRAND} />
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
