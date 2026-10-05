// ── Il menu engineering dei gusti, disegnato ─────────────────────────────
//
// 05/10/2026: la pagina Menu engineering, a Mara, non mostrava niente (le
// vendite per prodotto venivano da un archivio vuoto). Qui i conti sono quelli
// di `lib/menuEngineeringGusti.js`; questo file disegna e basta, con i pezzi
// dell'Analisi:
//   1. la frase che dice la cosa che conta, e i quattro gruppi (ognuno con la
//      sua parte del margine; un tocco filtra la tabella);
//   2. il grafico: un punto per gusto, a destra vende di più, in alto rende
//      di più al chilo. Le due soglie fanno i quattro gruppi, scritti negli
//      angoli: la posizione dice il gruppo, non un colore (un colore per
//      gruppo sarebbe un quinto codice da imparare);
//   3. la tabella, dieci gusti all'arrivo e gli altri dietro un tocco;
//   4. i gusti venduti che restano fuori, detti, e collegati qui, sul posto
//      (05/10/2026 sera: prima «Collegali» portava alla Produzione).
//   Il prezzo è uguale per tutti i gusti (la media dei formati): la pagina lo
//   dice, perché il margine al chilo cambia solo col costo.
import React, { useMemo, useState } from 'react'
import { color as T, font, radius as R, space, tnum, shadow as S } from '../../lib/theme'
import { quotaConArticolo, quota } from '../../lib/formatoAnalisi'
import { Riquadro, TitoloGrafico, FraseInsight, TabellaAnalisi, RigaMotivo } from '../analisi'
import Icon from '../Icon'
import { GRUPPI, ORDINE_GRUPPI } from '../../lib/menuEngineeringGusti'

export const PRIMI = 10
const NF0 = new Intl.NumberFormat('it-IT', { useGrouping: 'always', maximumFractionDigits: 0 })
const NF2 = new Intl.NumberFormat('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const kg = (n) => `${NF0.format(Number(n) || 0)} kg`
const euro0 = (n) => `${NF0.format(Math.round(Number(n) || 0))} €`
const euro2 = (n) => `${NF2.format(Number(n) || 0)} €`

/** La frase in cima: chi lascia di più, e dove sta il margine da curare. */
export function fraseMatrice(m) {
  const primo = m?.gusti?.[0]
  if (!primo) return null
  const out = [`${primo.gusto} è il gusto che ti lascia di più: ${euro0(primo.margine)} di margine su ${kg(primo.kg)} venduti.`]
  const curare = m.perGruppo.find(g => g.id === 'curare')
  if (curare?.n > 0 && curare.quotaMargine != null) {
    out.push(curare.n === 1
      ? `Il gusto da curare fa ${quotaConArticolo(curare.quotaMargine)} del margine: è lì che un euro al chilo in più pesa di più.`
      : `I ${NF0.format(curare.n)} gusti da curare fanno ${quotaConArticolo(curare.quotaMargine)} del margine: è lì che un euro al chilo in più pesa di più.`)
  }
  return out.join(' ')
}

/** Gli avvisi sui gusti venduti che nella matrice non stanno. */
export function avvisiMatrice(m) {
  const out = []
  const s = m?.fuori?.senzaRicetta
  const q = m?.totali?.kgVenduti > 0 ? (x) => quota((x / m.totali.kgVenduti) * 100) : () => null
  if (s?.n > 0) {
    out.push({
      id: 'senzaRicetta',
      testo: `${s.n === 1 ? '1 gusto venduto non ha' : `${NF0.format(s.n)} gusti venduti non hanno`} una ricetta collegata: ${kg(s.kg)}, ${q(s.kg)} del venduto, restano fuori (${s.gusti.slice(0, 4).join(', ')}${s.n > 4 ? '…' : ''}).`,
    })
  }
  const c = m?.fuori?.senzaMargine
  if (c?.n > 0) {
    out.push({
      id: 'senzaMargine',
      testo: `${c.n === 1 ? '1 gusto ha' : `${NF0.format(c.n)} gusti hanno`} la ricetta ma non il margine (manca il prezzo di qualche ingrediente): ${kg(c.kg)} restano fuori.`,
    })
  }
  return out
}

// ── 1. I quattro gruppi ─────────────────────────────────────────────────
function TessereGruppi({ perGruppo, scelto, onScegli, isMobile }) {
  // Le quattro tessere stanno su una griglia con le righe in comune
  // (subgrid): nome, numero, gusti e frase cominciano alla stessa altezza in
  // tutte, anche quando una frase va a capo e le altre no.
  return (
    <div role="group" aria-label="I quattro gruppi" style={{
      display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
      columnGap: space[3], rowGap: space[3], marginTop: space[4],
    }}>
      {perGruppo.map(g => {
        const attivo = scelto === g.id
        const info = GRUPPI[g.id]
        return (
          <button key={g.id} type="button" onClick={() => onScegli(attivo ? null : g.id)} aria-pressed={attivo}
            style={{
              display: 'grid', gridTemplateRows: 'subgrid', gridRow: 'span 4', rowGap: space[1], textAlign: 'left',
              padding: space[3], minHeight: 44, borderRadius: R.lg, cursor: 'pointer', fontFamily: 'inherit',
              background: attivo ? T.bgSubtle : T.bgCard,
              borderStyle: 'solid', borderWidth: attivo ? 2 : 1, borderColor: attivo ? T.brand : T.border,
              margin: attivo ? 0 : 1,
            }}>
            <span style={{ fontSize: font.size.base, fontWeight: 700, color: T.text }}>{info.nome}</span>
            {/* Il numero grande da solo: «36,6% del margine» tutto in grande
                al telefono andava su due righe (foto del 05/10). */}
            <span style={{ ...tnum, whiteSpace: 'nowrap', color: T.text }}>
              <span style={{ fontSize: font.size.lg, fontWeight: 700 }}>{g.quotaMargine != null ? quota(g.quotaMargine) : '—'}</span>
              {g.quotaMargine != null && <span style={{ fontSize: font.size.sm, fontWeight: 600, color: T.textMid }}> del margine</span>}
            </span>
            <span style={{ ...tnum, fontSize: font.size.sm, color: T.textMid }}>
              {g.n === 1 ? '1 gusto' : `${NF0.format(g.n)} gusti`}{g.n > 0 ? ` · ${kg(g.kg)}` : ''}
            </span>
            <span style={{ fontSize: font.size.sm, color: T.textSoft, lineHeight: 1.4 }}>{info.breve}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── 2. Il grafico ───────────────────────────────────────────────────────
/**
 * Tacche «tonde» fra min e max: 1, 2 o 5 per una potenza di dieci, mai meno
 * di 1 (le etichette sono euro e chili interi: una tacca a 22,5 scritta
 * «23 €» mentirebbe).
 */
export function tacche(min, max, quante = 5) {
  if (!(max > min)) return [min]
  const grezzo = (max - min) / quante
  const p = Math.max(1, 10 ** Math.floor(Math.log10(grezzo)))
  const passo = [1, 2, 5, 10].map(x => x * p).find(x => x >= grezzo) || 10 * p
  const out = []
  for (let v = Math.ceil(min / passo) * passo; v <= max + 1e-9; v += passo) out.push(Math.round(v * 1e6) / 1e6)
  return out
}

function GraficoMatrice({ m, isMobile }) {
  const [attivo, setAttivo] = useState(null)
  // Al telefono il bersaglio è di 22 di raggio su 340 di larghezza: 44 px.
  const RB = isMobile ? 22 : 12
  const W = isMobile ? 340 : 1000
  const H = isMobile ? 300 : 400
  const SX = isMobile ? 44 : 56, DX = 16, SU = 16, GIU = 40
  const g = m.gusti
  const maxKg = Math.max(m.soglie.kg || 0, ...g.map(x => x.kg)) * 1.08
  const valori = g.map(x => x.margineKg)
  const lo = Math.min(m.soglie.margineKg ?? Infinity, ...valori)
  const hi = Math.max(m.soglie.margineKg ?? -Infinity, ...valori)
  const pad = Math.max(0.5, (hi - lo) * 0.12)
  const yMin = Math.floor(lo - pad), yMax = Math.ceil(hi + pad)
  const x = (v) => SX + (v / maxKg) * (W - SX - DX)
  const y = (v) => SU + (1 - (v - yMin) / (yMax - yMin)) * (H - SU - GIU)
  const tx = tacche(0, maxKg, isMobile ? 3 : 5)
  const ty = tacche(yMin, yMax, 4)
  // I nomi scritti accanto al punto: i primi due per margine di OGNI gruppo
  // (con i primi sei in assoluto stavano tutti a destra, e gli angoli di
  // sinistra restavano punti senza nome). Al telefono nessuno: non ci stanno.
  // Gli altri si leggono passandoci sopra, o col tocco.
  const conNome = new Set(isMobile ? [] : ORDINE_GRUPPI.flatMap(id => g.filter(v => v.gruppo === id).slice(0, 2).map(v => v.gusto)))
  const sx = x(m.soglie.kg), sy = y(m.soglie.margineKg)
  const testo = { fontSize: font.size.sm, fill: T.textSoft, fontFamily: 'inherit' }
  const angolo = { fontSize: font.size.sm, fontWeight: 700, fill: T.textMid, fontFamily: 'inherit' }
  const a = g.find(v => v.gusto === attivo)
  const dettaglio = (v) => `${v.gusto}, ${GRUPPI[v.gruppo].nome}: ${kg(v.kg)}, ${euro2(v.margineKg)} al chilo, ${euro0(v.margine)} di margine`
  const riquadro = a && (
    <div role="status" style={{
      ...(isMobile
        ? { marginTop: space[2], whiteSpace: 'normal', lineHeight: 1.5 }
        : { position: 'absolute', top: space[2], left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none', whiteSpace: 'nowrap' }),
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.md, padding: `${space[2]}px ${space[3]}px`,
      boxShadow: S.md, fontSize: font.size.sm, color: T.text, ...tnum,
    }}>
      <b>{a.gusto}</b> · {GRUPPI[a.gruppo].nome} · {kg(a.kg)} · {euro2(a.margineKg)} al chilo · {euro0(a.margine)}
    </div>
  )

  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
        aria-label={`Gusti per chili venduti e margine al chilo. Soglie: ${kg(m.soglie.kg)} e ${euro2(m.soglie.margineKg)} al chilo. Ogni gusto è un pulsante col suo nome; gli stessi numeri sono nella tabella sotto.`}
        style={{ display: 'block', overflow: 'visible' }} onMouseLeave={() => setAttivo(null)}>
        {ty.map(v => (
          <g key={`y${v}`}>
            <line x1={SX} x2={W - DX} y1={y(v)} y2={y(v)} stroke={T.graficoGriglia} strokeWidth={1} />
            <text x={SX - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" style={{ ...testo, ...tnum }}>{NF0.format(v)} €</text>
          </g>
        ))}
        {tx.map(v => (
          <text key={`x${v}`} x={x(v)} y={H - GIU + 18} textAnchor="middle" style={{ ...testo, ...tnum }}>{NF0.format(v)}</text>
        ))}
        <text x={W - DX} y={H - 4} textAnchor="end" style={testo}>chili venduti →</text>
        <text x={SX} y={SU - 4} textAnchor="start" style={testo}>↑ margine al chilo</text>
        {/* Le due soglie: tratteggiate, del colore dell'obiettivo. */}
        <line x1={sx} x2={sx} y1={SU} y2={H - GIU} stroke={T.graficoObiettivo} strokeWidth={1} strokeDasharray="4 4" />
        <line x1={SX} x2={W - DX} y1={sy} y2={sy} stroke={T.graficoObiettivo} strokeWidth={1} strokeDasharray="4 4" />
        {/* I gruppi negli angoli. */}
        <text x={W - DX - 4} y={SU + 14} textAnchor="end" style={angolo}>{GRUPPI.tenere.nome}</text>
        <text x={W - DX - 4} y={H - GIU - 8} textAnchor="end" style={angolo}>{GRUPPI.curare.nome}</text>
        <text x={SX + 6} y={SU + 14} textAnchor="start" style={angolo}>{GRUPPI.spingere.nome}</text>
        <text x={SX + 6} y={H - GIU - 8} textAnchor="start" style={angolo}>{GRUPPI.rivedere.nome}</text>
        {g.map(v => (
          <g key={v.gusto} data-punto={v.gusto} role="button" tabIndex={0} aria-label={dettaglio(v)}
            onMouseEnter={() => setAttivo(v.gusto)} onFocus={() => setAttivo(v.gusto)}
            onClick={() => setAttivo(attivo === v.gusto ? null : v.gusto)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAttivo(attivo === v.gusto ? null : v.gusto) } }}
            style={{ cursor: 'pointer', outline: 'none' }}>
            {/* Il bersaglio è più grande del punto, invisibile: 44 px al telefono. */}
            <circle data-bersaglio cx={x(v.kg)} cy={y(v.margineKg)} r={RB} fill="transparent" />
            <circle cx={x(v.kg)} cy={y(v.margineKg)} r={attivo === v.gusto ? 7 : 5}
              fill={T.graficoReale} stroke={T.bgCard} strokeWidth={2} />
            {conNome.has(v.gusto) && (
              // Il bordino del colore del fondo: le soglie passano dietro il nome.
              <text x={x(v.kg) + 10} y={y(v.margineKg)} dominantBaseline="middle"
                style={{ ...testo, fill: T.textMid, stroke: T.bgCard, strokeWidth: 4, paintOrder: 'stroke', strokeLinejoin: 'round' }}>{v.gusto}</text>
            )}
          </g>
        ))}
      </svg>
      {riquadro}
    </div>
  )
}

// ── La parte intera ─────────────────────────────────────────────────────
/**
 * @param {object} p
 * @param {ReturnType<import('../../lib/menuEngineeringGusti').matriceGusti>} p.m
 * @param {string} p.periodo  «16 lug – 15 set 2026», per i sottotitoli
 * @param {string} [p.copertura]  la frase su quali giorni ci sono, se serve
 * @param {(vista: string) => void} [p.onNavigate]
 * @param {React.ReactNode} [p.collegamento]  il pezzo della Produzione che collega
 *   i gusti senza ricetta: se c'è, «Collegali» lo apre qui invece di cambiare pagina
 */
export default function MatriceGusti({ m, periodo = '', copertura = '', onNavigate = null, isMobile = false, collegamento = null }) {
  const [gruppo, setGruppo] = useState(null)
  const [collegando, setCollegando] = useState(false)
  const [tutti, setTutti] = useState(false)
  const elenco = useMemo(() => (gruppo ? m.gusti.filter(g => g.gruppo === gruppo) : m.gusti), [m, gruppo])
  const visibili = tutti ? elenco : elenco.slice(0, PRIMI)
  const avvisi = avvisiMatrice(m)
  const sp = { marginBottom: isMobile ? space[4] : space[6] }

  return (
    <div>
      <Riquadro isMobile={isMobile} stile={sp}>
        <TitoloGrafico titolo="Dove sta il margine" sottotitolo="Il margine dei gusti del periodo, gruppo per gruppo. Tocca un gruppo per vedere i suoi gusti." />
        <FraseInsight verso="info">{fraseMatrice(m)}</FraseInsight>
        <TessereGruppi perGruppo={m.perGruppo} scelto={gruppo} onScegli={(id) => { setGruppo(id); setTutti(false) }} isMobile={isMobile} />
        {gruppo && (
          <div style={{ marginTop: space[3], fontSize: font.size.sm, color: T.textMid }}>
            <b>{GRUPPI[gruppo].nome}:</b> {GRUPPI[gruppo].consiglio}
          </div>
        )}
        {avvisi.map(v => (
          // Una riga sola: l'avviso e, per i gusti senza ricetta, il modo di
          // collegarli: qui sotto se c'è il pezzo della Produzione, altrimenti
          // la Produzione.
          <RigaMotivo key={v.id} motivo={v.testo} dimensione={font.size.sm} stile={{ marginTop: space[3] }}
            azione={v.id !== 'senzaRicetta' ? null
              : collegamento ? { etichetta: collegando ? 'Chiudi' : 'Collegali', onClick: () => setCollegando(c => !c) }
                : onNavigate ? { etichetta: 'Collegali', onClick: () => onNavigate('storico') } : null} />
        ))}
        {collegando && collegamento && <div style={{ marginTop: space[3] }}>{collegamento}</div>}
        <div style={{ marginTop: space[3], fontSize: font.size.sm, color: T.textSoft, lineHeight: 1.5 }}>
          Il prezzo è uguale per tutti i gusti (la media dei formati): il margine al chilo cambia solo col costo degli ingredienti.
          I gruppi dicono dove il costo pesa di più, non quale gusto fai pagare di più.
        </div>
      </Riquadro>

      <Riquadro isMobile={isMobile} stile={sp}>
        <TitoloGrafico titolo="Quanto vendono e quanto rendono"
          sottotitolo={`Un punto per gusto, ${periodo}. Più a destra vende di più, più in alto ti lascia di più al chilo. Le linee sono le soglie: ${kg(m.soglie.kg)} (il 70% della quota media) e ${euro2(m.soglie.margineKg)} al chilo (la media pesata sui chili).`} />
        <GraficoMatrice m={m} isMobile={isMobile} />
      </Riquadro>

      <Riquadro isMobile={isMobile} stile={sp}>
        <TitoloGrafico titolo={gruppo ? `${GRUPPI[gruppo].nome}: ${elenco.length === 1 ? '1 gusto' : `${NF0.format(elenco.length)} gusti`}` : 'Tutti i gusti, dal margine più alto'}
          sottotitolo="Margine: incasso stimato (chili venduti per il prezzo medio dei formati, senza IVA) meno il costo degli ingredienti di quello che hai prodotto."
          destra={gruppo ? (
            <button type="button" onClick={() => setGruppo(null)} style={{
              minHeight: 44, padding: `0 ${space[3]}px`, borderRadius: R.lg, border: `1px solid ${T.border}`, background: T.bgCard,
              color: T.brand, fontWeight: 700, fontSize: font.size.base, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
            }}>Tutti i gusti</button>
          ) : null} />
        <TabellaAnalisi etichetta="Gusti per margine" isMobile={isMobile}
          colonne={[
            { chiave: 'gusto', titolo: 'Gusto' },
            { chiave: 'gruppo', titolo: 'Gruppo', larghezza: 112, soloComputer: true },
            { chiave: 'kg', titolo: 'Kg venduti', tipo: 'numero', larghezza: isMobile ? 88 : 104 },
            // Al telefono resta il margine (la tabella è ordinata su quello):
            // con anche «Al kg» usciva dallo schermo (foto del 05/10).
            { chiave: 'mkg', titolo: 'Al kg', tipo: 'euro', decimali: 2, larghezza: 96, soloComputer: true },
            { chiave: 'm', titolo: 'Margine', tipo: 'euro', larghezza: isMobile ? 92 : 112 },
          ]}
          righe={visibili.map(g => ({
            chiave: g.gusto,
            celle: { gusto: g.gusto, gruppo: GRUPPI[g.gruppo].nome, kg: g.kg, mkg: g.margineKg, m: g.margine },
          }))} />
        {elenco.length > PRIMI && (
          <button type="button" onClick={() => setTutti(!tutti)} aria-expanded={tutti} style={{
            marginTop: space[3], minHeight: 44, padding: `${space[2]}px ${space[3]}px`, borderRadius: R.lg, cursor: 'pointer', fontFamily: 'inherit',
            border: `1px solid ${T.border}`, background: T.bgCard, color: T.brand, fontSize: font.size.base, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: space[1],
          }}>
            {tutti ? `Mostra solo i primi ${PRIMI}` : `Mostra tutti i ${NF0.format(elenco.length)} gusti`}
            <Icon name={tutti ? 'chevUp' : 'chevDown'} size={12} />
          </button>
        )}
        {copertura && <div style={{ marginTop: space[3], fontSize: font.size.sm, color: T.textSoft }}>{copertura}</div>}
      </Riquadro>
    </div>
  )
}
