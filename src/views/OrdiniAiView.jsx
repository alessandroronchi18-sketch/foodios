// AI Auto-ordine fornitori (B4)
//
// MVP: per ogni ingrediente sotto soglia (o vicino a soglia), propone
// quantita da ordinare in base a:
//   - giacenza attuale
//   - soglia minima
//   - consumo medio settimanale (calcolato da produzione storica)
//   - lead time del fornitore, quando il fornitore lo ha dichiarato
//
// Corretto il 10/09/2026, tre difetti che rendevano la pagina muta:
//   1. la soglia veniva letta da `soglia_min_g`/`soglia`, che nel magazzino
//      non esistono: la chiave vera e' `soglia_g`. Quindi la soglia era
//      sempre 0, "sotto soglia" non scattava mai e la pagina rispondeva
//      "Tutto sopra soglia" anche col magazzino vuoto.
//   2. il ricettario veniva trattato come un array (`Array.isArray(r) ? r : []`)
//      mentre e' un oggetto { ricette, ingredienti_costi }: il consumo medio
//      era sempre vuoto, quindi anche il secondo criterio (giorni di scorta)
//      non scattava.
//   3. `const leadTime = 3` era scritto nel codice mentre il commento
//      prometteva "configurabile per fornitore". Ora si legge da
//      fornitori.lead_time_giorni, e quando manca si dichiara che e' un
//      valore di riferimento.
//
// Formula EOQ semplificata: Qta_ordine = max(soglia*2, consumo_lead_time + safety_stock)
// Output: tabella ingredienti + bottone per generare email PDF al fornitore.

import React, { useEffect, useMemo, useState } from 'react'
import { sload } from '../lib/storage'
import { supabase } from '../lib/supabase'
import { buildIngCosti, normIng } from '../lib/foodcost'
import { fornitoreDiIngrediente, raggruppaPerFornitore, LEAD_TIME_RIFERIMENTO } from '../lib/fornitoreIngrediente'
import { color as T, typo } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import Icon from '../components/Icon'
import AiPageHero from '../components/AiPageHero'

const BRAND = T.brand || '#6E0E1A'
const SOFT = T.textSoft || '#8B95A7'
const TXT = T.text || '#0E1726'
const MID = T.textMid || '#475264'
const CARD = T.bgCard || '#FFF'
const BORDER = T.border || '#E5E9EF'
const GREEN = T.green || '#16A34A'
const AMBER = T.amber || '#D97706'

export default function OrdiniAiView({ orgId, sedeId, notify }) {
  const notifyFn = notify || ((m) => console.debug('[ordini-ai]', m))
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const [magazzino, setMagazzino] = useState({})
  const [chiusure, setChiusure] = useState([])
  const [ricettario, setRicettario] = useState(null)
  const [fornitori, setFornitori] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId || !sedeId) { setLoading(false); return }
    let alive = true
    async function load() {
      setLoading(true)
      const [m, c, r, f] = await Promise.all([
        sload('pasticceria-magazzino-v1', orgId, sedeId),
        sload('pasticceria-chiusure-v1', orgId, sedeId),
        sload('pasticceria-ricettario-v1', orgId, null),
        supabase.from('fornitori').select('nome, lead_time_giorni, minimo_ordine')
          .eq('organization_id', orgId).eq('attivo', true),
      ])
      if (alive) {
        setMagazzino(m || {})
        setChiusure(Array.isArray(c) ? c : [])
        // Il ricettario e' un OGGETTO { ricette, ingredienti_costi }: prima
        // veniva buttato via con Array.isArray e il consumo medio restava
        // sempre vuoto.
        setRicettario(r && typeof r === 'object' ? r : null)
        setFornitori(f?.data || [])
        setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [orgId, sedeId])

  // Calcola consumo medio giornaliero per ingrediente (basato su produzione legata
  // alle vendite via ricettario; semplificazione: 1 pezzo venduto = grammature ricetta).
  const consumoGiornaliero = useMemo(() => {
    const consumo = {}
    const ricette = ricettario?.ricette || {}
    const giorni = 30
    const oggi = new Date()
    const start = new Date(oggi.getTime() - giorni * 86400000)
    for (const c of chiusure) {
      const d = new Date(c.data || 0)
      if (d < start || d > oggi) continue
      // Le chiusure tengono le righe in `venduto` (nomi dei prodotti) o in
      // `confronto`; le vecchie in `prodotti`/`righe`.
      const items = [c.venduto, c.confronto, c.prodotti, c.righe].find(Array.isArray) || []
      for (const r of items) {
        const nome = (r.nome || r.prodotto || '').toUpperCase().trim()
        const qta = Number(r.unitaV ?? r.venduto ?? r.qta ?? r.pezzi ?? 0)
        if (!nome || qta <= 0) continue
        const ric = ricette[nome] || Object.values(ricette).find(x => (x?.nome || '').toUpperCase().trim() === nome)
        if (!ric) continue
        const ings = ric.ingredienti || ric.composizione || []
        for (const ing of ings) {
          const ingNome = normIng(ing.nome || ing.ingrediente || '')
          if (!ingNome) continue
          // `qty1stampo` e' il campo vero del ricettario (grammi per stampo).
          const grammi = Number(ing.qty1stampo ?? ing.qta_g ?? ing.quantita ?? 0) * qta
          consumo[ingNome] = (consumo[ingNome] || 0) + grammi
        }
      }
    }
    // Media giornaliera
    Object.keys(consumo).forEach(k => { consumo[k] = consumo[k] / giorni })
    return consumo
  }, [chiusure, ricettario])

  // Listino ingredienti (prezzi veri + stime di mercato marcate isStima) e
  // indice dei fornitori per nome.
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi || {}), [ricettario])
  const fornitoriPerNome = useMemo(() => {
    const m = new Map()
    for (const f of (fornitori || [])) m.set(f.nome, f)
    return m
  }, [fornitori])

  const suggerimenti = useMemo(() => {
    const out = []
    // Valore di riferimento quando il fornitore non ha dichiarato i suoi
    // giorni di consegna. Non e' "il" lead time: e' un ripiego, e la pagina
    // lo dice.
    const leadTime = LEAD_TIME_RIFERIMENTO
    const safety = 1.4  // 40% safety stock
    for (const [nome, info] of Object.entries(magazzino || {})) {
      const giacenza = Number(info?.giacenza_g ?? info?.giacenza ?? 0)
      // `soglia_g` e' la chiave che scrive davvero il Magazzino.
      const soglia = Number(info?.soglia_g ?? info?.soglia_min_g ?? info?.soglia ?? 0)
      const cons = consumoGiornaliero[normIng(nome)] || 0
      const forn = fornitoreDiIngrediente(ingCosti, nome)
      const datiForn = forn ? fornitoriPerNome.get(forn.nome) : null
      const leadTimeIng = Number(datiForn?.lead_time_giorni) > 0
        ? Number(datiForn.lead_time_giorni)
        : leadTime
      const giorniRimasti = cons > 0 ? giacenza / cons : null
      const sottoSoglia = soglia > 0 && giacenza <= soglia
      const inEsaurimento = giorniRimasti != null && giorniRimasti <= leadTimeIng
      if (!sottoSoglia && !inEsaurimento) continue
      // Quantita suggerita: copri 14 giorni + safety
      const qtaSuggerita = Math.max(soglia * 2, cons * 14 * safety)
      const voce = ingCosti[normIng(nome)]
      out.push({
        nome,
        giacenza, soglia, cons,
        giorniRimasti: giorniRimasti != null ? Math.round(giorniRimasti) : null,
        sottoSoglia, inEsaurimento,
        qtaSuggerita: Math.round(qtaSuggerita),
        urgenza: sottoSoglia ? 'alta' : 'media',
        // Il prezzo viene dal listino ingredienti del ricettario, che e' dove
        // vive davvero: `prezzo_kg` nel magazzino non esiste, quindi il
        // costo stimato era sempre 0.
        prezzo_ultimo: Number(voce?.costoKg) || 0,
        prezzoStimato: !!voce?.isStima,
        fornitore: forn?.nome || null,
        leadTimeIng,
        leadTimeDichiarato: Number(datiForn?.lead_time_giorni) > 0,
        minimoOrdine: Number(datiForn?.minimo_ordine) || null,
      })
    }
    return out.sort((a, b) => {
      if (a.urgenza !== b.urgenza) return a.urgenza === 'alta' ? -1 : 1
      return (a.giorniRimasti ?? 999) - (b.giorniRimasti ?? 999)
    })
  }, [magazzino, consumoGiornaliero, ingCosti, fornitoriPerNome])

  // Quanti ingredienti hanno una giacenza e quanti hanno una soglia: serve
  // per non dire "tutto a posto" quando invece non c'e' niente da guardare.
  const nGiacenze = useMemo(() => Object.keys(magazzino || {}).length, [magazzino])
  const nSoglie = useMemo(
    () => Object.values(magazzino || {}).filter(v => Number(v?.soglia_g) > 0).length,
    [magazzino])

  // Un testo PER FORNITORE. Prima era un solo messaggio con tutti gli
  // ingredienti dentro: lo stesso testo sarebbe andato al molino e al
  // cioccolataio, e chi non c'entrava niente leggeva l'ordine dell'altro.
  const gruppiOrdine = useMemo(
    () => raggruppaPerFornitore(suggerimenti, ingCosti),
    [suggerimenti, ingCosti])

  function testoGruppo(g) {
    const qtaTesto = (qta) => qta >= 1000
      ? `${(Number(qta) / 1000).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`
      : `${Math.round(Number(qta) || 0).toLocaleString('it-IT')} g`
    const lines = ['Buongiorno,', '', 'Vi chiedo gentilmente di prepararci il seguente ordine:', '']
    for (const s of g.righe) lines.push(`- ${s.nome}: ${qtaTesto(s.qtaSuggerita)}`)
    const minimo = g.righe.find(r => r.minimoOrdine)?.minimoOrdine
    const stima = g.righe.reduce((a, r) => a + (r.prezzo_ultimo > 0 ? r.prezzo_ultimo * r.qtaSuggerita / 1000 : 0), 0)
    if (minimo && stima > 0 && stima < minimo) {
      lines.push('', `(il vostro minimo d'ordine è ${minimo.toLocaleString('it-IT')} €: fatemi sapere se serve aggiungere qualcosa)`)
    }
    lines.push('', 'Grazie!', '')
    return lines.join('\n')
  }

  function genTestoOrdine() {
    if (gruppiOrdine.length === 0) return ''
    return gruppiOrdine.map(g => {
      const testa = g.fornitore
        ? `--- ${g.fornitore} ---`
        : '--- Merce senza fornitore assegnato (aprine la scheda in Fornitori per collegarlo) ---'
      return `${testa}\n${testoGruppo(g)}`
    }).join('\n')
  }

  async function copia() {
    const testo = genTestoOrdine()
    // Path moderno: navigator.clipboard. Su iOS Safari pre-13.4 o contesti
    // non-secure fallisce: fallback a textarea + execCommand('copy').
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(testo)
        notifyFn('Testo copiato. Incollalo nella mail o nel WhatsApp del fornitore.', true)
        return
      }
    } catch {
      // cade nel fallback
    }
    try {
      const ta = document.createElement('textarea')
      ta.value = testo
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.top = '0'
      ta.style.left = '0'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      // iOS richiede selezione esplicita prima di execCommand.
      ta.focus()
      ta.select()
      ta.setSelectionRange(0, testo.length)
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      if (ok) notifyFn('Testo copiato. Incollalo nella mail o nel WhatsApp del fornitore.', true)
      else notifyFn('Copia non riuscita. Seleziona il testo qui sotto a mano.', false)
    } catch {
      notifyFn('Copia non supportata. Seleziona il testo qui sotto a mano.', false)
    }
  }

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? 12 : isTablet ? 16 : 0 }}>
      <AiPageHero
        eyebrow="Approvvigionamento"
        title="Ordini ai fornitori"
        accentText="già scritti"
        subtitle="Guardo magazzino, consumo medio degli ultimi 30 giorni e soglie minime. Ti faccio la lista di cosa ordinare e ti preparo il testo da incollare nella mail o nel WhatsApp del fornitore."
        statusBadge="LIVE"
        stats={[
          { n: '30 gg', l: 'Consumi analizzati' },
          { n: '+40%', l: 'Scorta di sicurezza' },
        ]}
      />

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: SOFT }}>Caricamento…</div>
      ) : suggerimenti.length === 0 ? (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 40, textAlign: 'center', color: SOFT, lineHeight: 1.6 }}>
          {/* Prima diceva sempre "Tutto sopra soglia", anche con il magazzino
              mai contato e zero soglie impostate: un verdetto rassicurante su
              nessun dato. Ora i tre casi sono distinti. */}
          <Icon name={nSoglie === 0 || nGiacenze === 0 ? 'alert' : 'check'} size={28} color={nSoglie === 0 || nGiacenze === 0 ? AMBER : GREEN}/>
          {nGiacenze === 0 ? (
            <>
              <div style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: TXT }}>Il magazzino è vuoto</div>
              <div style={{ fontSize: typo.size.base, marginTop: 6 }}>Non ho nessuna giacenza da guardare, quindi non posso dirti cosa ordinare. Pesa gli ingredienti dal Magazzino e torna qui.</div>
            </>
          ) : nSoglie === 0 ? (
            <>
              <div style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: TXT }}>Nessuna soglia minima impostata</div>
              <div style={{ fontSize: typo.size.base, marginTop: 6 }}>
                Su {Number(nGiacenze).toLocaleString('it-IT')} ingredient{nGiacenze === 1 ? 'e' : 'i'} in magazzino nessuno ha una soglia:
                {' '}posso solo guardare i giorni di scorta, e servono le vendite registrate. Imposta le soglie dal Magazzino.
              </div>
            </>
          ) : (
            <>
              <div style={{ marginTop: 12, fontSize: 14, fontWeight: 700, color: TXT }}>Tutto sopra soglia</div>
              <div style={{ fontSize: typo.size.base, marginTop: 6 }}>
                Niente da ordinare oggi, su {Number(nSoglie).toLocaleString('it-IT')} ingredient{nSoglie === 1 ? 'e' : 'i'} con una soglia impostata. Ti avviso appena qualcosa scende.
              </div>
            </>
          )}
        </div>
      ) : (
        <>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
            <div style={{ background: '#FAFAF6', padding: isMobile ? '12px 14px' : '12px 18px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: isMobile ? 'stretch' : 'center', gap: 10, flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: TXT }}>
                {Number(suggerimenti.length).toLocaleString('it-IT')} ingredient{suggerimenti.length === 1 ? 'e' : 'i'} da ordinare
              </div>
              <button onClick={copia}
                style={{ marginLeft: isMobile ? '0' : 'auto', background: BRAND, color: '#FFF', border: 'none', padding: isMobile ? '12px 14px' : '8px 14px', minHeight: isMobile ? 44 : 'auto', borderRadius: 8, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                <Icon name="copy" size={13}/> {gruppiOrdine.length > 1 ? `Copia tutto (${gruppiOrdine.length} fornitori)` : 'Copia per il fornitore'}
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? 600 : 'auto' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: typo.size.sm, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ingrediente</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: typo.size.sm, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Da chi</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: typo.size.sm, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Giacenza</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: typo.size.sm, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Soglia</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: typo.size.sm, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cons. medio/gg</th>
                    <th title="Giorni rimasti di scorta = giacenza attuale / consumo medio giornaliero" style={{ padding: '10px 14px', textAlign: 'right', fontSize: typo.size.sm, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'help' }}>Gg rimasti</th>
                    <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: typo.size.sm, fontWeight: 700, color: SOFT, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Da ordinare</th>
                  </tr>
                </thead>
                <tbody>
                  {suggerimenti.map(s => (
                    <tr key={s.nome} style={{ borderTop: `1px solid ${BORDER}` }}>
                      <td style={{ padding: '11px 14px', fontSize: 13, color: TXT, fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {s.urgenza === 'alta' && <span style={{ color: BRAND, marginRight: 6 }} aria-label="Urgenza alta">●</span>}
                        <span title={s.nome}>{s.nome}</span>
                      </td>
                      {/* Da chi comprare: senza questa colonna la lista dice
                          quanto ordinare e non a chi chiederlo. */}
                      <td style={{ padding: '11px 14px', fontSize: typo.size.base, color: s.fornitore ? MID : SOFT, whiteSpace: 'nowrap' }}>
                        {s.fornitore || (
                          <span title="Nessun fornitore collegato a questo ingrediente: si collega registrando un ordine ricevuto in Fornitori." style={{ cursor: 'help' }}>da collegare</span>
                        )}
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12, color: MID, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{Math.round(s.giacenza).toLocaleString('it-IT')}g</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12, color: SOFT, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{Math.round(s.soglia).toLocaleString('it-IT')}g</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12, color: SOFT, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{Math.round(s.cons).toLocaleString('it-IT')}g</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 12, color: s.giorniRimasti != null && s.giorniRimasti <= 3 ? BRAND : MID, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {s.giorniRimasti != null ? Number(s.giorniRimasti).toLocaleString('it-IT') : '-'}
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontSize: 13, color: TXT, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {s.qtaSuggerita >= 1000 ? `${(s.qtaSuggerita / 1000).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg` : `${Number(s.qtaSuggerita).toLocaleString('it-IT')} g`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Preview testo ordine */}
          <div style={{ background: '#FAFAF6', border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: SOFT, letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8 }}>
              {gruppiOrdine.length > 1 ? 'Testo pronto da inviare, diviso per fornitore' : 'Testo pronto da inviare'}
            </div>
            <pre style={{ fontFamily: 'inherit', fontSize: 13, color: TXT, whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.6 }}>
              {genTestoOrdine()}
            </pre>
          </div>
        </>
      )}
    </div>
  )
}
