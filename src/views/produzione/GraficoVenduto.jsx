// ── Il venduto per settimana ──────────────────────────────────────────────
//
// Prima: «Prodotto e venduto per giorno», tre barre per giorno in tre colori
// di categoria (bordeaux, arancio, rosso), sessanta giorni affiancati, e un
// dente a −126 kg il 12/08 senza una parola. Adesso: una barra sola, il
// venduto, nel colore del dato reale; per settimana all'apertura, perché un
// gelatiere ragiona a settimane; le settimane non intere in ambra; il titolo
// dice la settimana migliore e la peggiore; il prodotto sta nel suggerimento
// e nella tabella dei numeri, a richiesta. Giorno e mese dietro un pulsante.
//
// Recharts: solo i pezzi che il test settimaneACavalloDAnno sa sostituire
// (niente Cell né ReferenceLine). Il grafico riceve oggetti {key, label,
// prod, vend, vendParziale}: quella prova legge proprio quelli.
import React, { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { color as T, font, radius as R, tnum } from '../../lib/theme'
import { dataBreve } from '../../lib/formatoAnalisi'
import { TitoloGrafico, Riquadro } from '../../components/analisi'
import { colonneVenduto, titoloVenduto } from './colonneVenduto'
import MenuScelta from './MenuScelta'
import { kg, intero } from './numeri'

const PASSI = [{ id: 'giorno', label: 'Giorno' }, { id: 'settimana', label: 'Settimana' }, { id: 'mese', label: 'Mese' }]
const PER = { giorno: 'per giorno', settimana: 'per settimana', mese: 'per mese' }
const NON_INTERA = { settimana: 'le settimane', mese: 'i mesi' }

export default function GraficoVenduto({ rows, da, a, registrati, riassunto, isMobile, stile = null }) {
  const [passo, setPasso] = useState('settimana')
  const [tabella, setTabella] = useState(false)
  const colonne = useMemo(
    () => colonneVenduto(rows, { da, a, passo, registrati }),
    [rows, da, a, passo, registrati]
  )
  const parziali = colonne.some(c => !c.intera)
  const giorniDaSistemare = riassunto?.nRimanenza > 0 ? riassunto.giorni : []
  const asse = { fontSize: font.size.sm, fill: T.textSoft }

  return (
    <Riquadro isMobile={isMobile} stile={stile}>
      <TitoloGrafico
        titolo={titoloVenduto(colonne, passo)}
        sottotitolo={`Chili venduti ${PER[passo]}.${parziali && NON_INTERA[passo] ? ` In ambra ${NON_INTERA[passo]} non intere, tagliate dal periodo o dai giorni registrati.` : ''}`}
        destra={<MenuScelta etichetta="Raggruppa il grafico" prefisso="per " valore={passo} scelte={PASSI} onScegli={setPasso} />}
      />
      <ResponsiveContainer width="100%" height={isMobile ? 200 : 240}>
        <BarChart data={colonne} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={T.graficoGriglia} />
          <XAxis dataKey="label" tick={asse} tickLine={false} axisLine={{ stroke: T.border }} interval="preserveStartEnd" minTickGap={10} />
          <YAxis tick={asse} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => intero(v)} />
          <Tooltip content={<Suggerimento passo={passo} />} cursor={{ fill: T.bgSubtle }} />
          <Bar dataKey="vend" name="Venduto" stackId="v" fill={T.graficoReale} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="vendParziale" name="Venduto, non intera" stackId="v" fill={T.amber} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      {giorniDaSistemare.length > 0 && (
        <div style={{ fontSize: font.size.sm, color: T.textMid, lineHeight: 1.45, marginTop: 8 }}>
          {passo === 'giorno'
            ? 'Il giorno dopo una rimanenza lasciata a 0 il venduto scende, anche sotto zero, e il giorno prima sale: è lo stesso gelato contato nel giorno sbagliato.'
            : 'Una rimanenza lasciata a 0 sposta chili da un giorno al successivo: nel totale della settimana di solito si annullano.'}
          {' '}Giorni da sistemare: {giorniDaSistemare.slice(0, 8).map(dataBreve).join(', ')}
          {giorniDaSistemare.length > 8 ? ` e altri ${intero(giorniDaSistemare.length - 8)}` : ''}.
        </div>
      )}
      <button type="button" onClick={() => setTabella(v => !v)} aria-expanded={tabella}
        style={{ marginTop: 6, border: 'none', background: 'transparent', color: T.textSoft, fontSize: font.size.sm, fontWeight: 600, cursor: 'pointer', padding: '8px 0', fontFamily: 'inherit', minHeight: 36 }}>
        {tabella ? 'Nascondi i numeri' : 'Vedi i numeri in tabella'}
      </button>
      {tabella && <TabellaNumeri colonne={colonne} passo={passo} />}
    </Riquadro>
  )
}

const periodoColonna = (c, passo) => (passo === 'giorno' ? dataBreve(c.dal) : `dal ${dataBreve(c.dal)} al ${dataBreve(c.al)}`)

function Suggerimento({ active, payload, passo }) {
  if (!active || !payload?.length) return null
  const c = payload[0].payload
  return (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.lg, padding: '8px 10px', fontSize: font.size.sm, color: T.textMid, lineHeight: 1.5 }}>
      <div style={{ fontWeight: 700, color: T.text }}>{passo === 'settimana' ? 'Settimana ' : passo === 'mese' ? 'Mese, ' : ''}{periodoColonna(c, passo)}</div>
      <div>Venduti <b style={{ ...tnum, color: T.text }}>{kg(c.vend + c.vendParziale)} kg</b></div>
      <div>Prodotti <span style={tnum}>{kg(c.prod)} kg</span></div>
      <div>{c.giorni === 1 ? 'Un giorno registrato' : `${intero(c.giorni)} giorni registrati`}</div>
      {!c.intera && <div style={{ color: T.amberDark }}>Non intera: tagliata dal periodo o dai giorni registrati</div>}
      {c.daSistemare > 0 && <div style={{ color: T.amberDark }}>{c.daSistemare === 1 ? 'Una casella da sistemare' : `${intero(c.daSistemare)} caselle da sistemare`}</div>}
    </div>
  )
}

function TabellaNumeri({ colonne, passo }) {
  const th = { padding: '6px 4px', fontWeight: 600, color: T.textSoft, textAlign: 'right' }
  const td = { padding: '6px 4px', textAlign: 'right', ...tnum }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.size.base, minWidth: 360 }}>
        <thead>
          <tr>
            <th scope="col" style={{ ...th, textAlign: 'left' }}>{passo === 'giorno' ? 'Giorno' : passo === 'mese' ? 'Mese' : 'Settimana'}</th>
            <th scope="col" style={th}>Venduto kg</th>
            <th scope="col" style={th}>Prodotto kg</th>
            <th scope="col" style={th}>Giorni</th>
          </tr>
        </thead>
        <tbody>
          {colonne.map(c => (
            <tr key={c.key} style={{ borderTop: `1px solid ${T.borderSoft}` }}>
              <td style={{ ...td, textAlign: 'left', color: T.text }}>{periodoColonna(c, passo)}{c.intera ? '' : ' (non intera)'}</td>
              <td style={{ ...td, fontWeight: 700 }}>{kg(c.vend + c.vendParziale)}</td>
              <td style={td}>{kg(c.prod)}</td>
              <td style={td}>{intero(c.giorni)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
