// ── Lo storico dei prezzi: una sezione, non un cassetto ───────────────────
//
// Richiesta del titolare, 21/09/2026: «nella pagina materie prime, il
// pulsante storico modifiche non deve solo aprire un elenco ma deve rimandare
// ad un'altra sezione sempre nella pagina materie prime, perché quando ci
// saranno un sacco di modifiche di ingredienti uno deve avere la possibilità
// di filtrare per fornitore / materia prima / prezzo ecc e vedere tutte le
// modifiche relative».
//
// Aveva ragione ed era una cosa sola: il cassetto mostrava **le ultime 50
// modifiche** dentro un riquadro alto 240 pixel, senza filtri. Con le bolle
// che caricano i prezzi da sole — arriva la merce, si carica il documento, il
// prezzo al chilo si aggiorna e la modifica finisce qui — quel numero non
// resta 50 a lungo: una gelateria con quaranta materie prime e una consegna a
// settimana ne fa duemila l'anno.
//
// Cosa si deve poter chiedere a questa pagina, in ordine di quanto serve:
//
//   1. «quanto mi è aumentato il burro quest'anno?»        → materia prima
//   2. «cosa mi ha aumentato questo fornitore?»            → fornitore
//   3. «cosa è salito più del 10%?»                        → variazione
//   4. «cosa è cambiato da quando ho fatto il listino?»    → periodo
//
// Il fornitore di una riga: se la modifica arriva da una bolla, è quello
// scritto sul documento (`origine.fornitore`), che è il dato vero — chi ha
// mandato quella merce a quel prezzo. Se la modifica è a mano, il fornitore
// non c'è sulla riga e si prende quello del listino, che è l'ultima cosa che
// sappiamo di quella materia prima.
import React, { useMemo, useState } from 'react'
import { color as T, radius as R, typo, font } from '../lib/theme'
import Icon from '../components/Icon'
import { C, TNUM, TabellaOSchede } from './_shared'

const FS = font.size

const euroKg = (v) => `${Number(v || 0).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/kg`
const nInt = (v) => Number(v || 0).toLocaleString('it-IT', { useGrouping: 'always' })

/** La chiave con cui si confronta un nome: minuscolo, senza spazi ai bordi. */
const chiave = (s) => String(s || '').toLowerCase().trim()

const PERIODI = [
  { id: 'tutto', label: 'Da sempre', giorni: null },
  { id: '30', label: 'Ultimi 30 giorni', giorni: 30 },
  { id: '90', label: 'Ultimi 3 mesi', giorni: 90 },
  { id: '365', label: 'Ultimo anno', giorni: 365 },
]

const VARIAZIONI = [
  { id: 'tutte', label: 'Tutte le modifiche' },
  { id: 'aumenti', label: 'Solo aumenti' },
  { id: 'ribassi', label: 'Solo ribassi' },
  { id: 'forti', label: 'Oltre il 10%' },
]

/**
 * Da dove viene una riga dello storico, in parole.
 *
 * Senza questo, fra un mese nessuno sa più perché il burro è passato da 9,00
 * a 9,50 €/kg. Con la bolla si sa anche il numero del documento, che è quello
 * che si va a ripescare dal raccoglitore quando il conto non torna.
 */
export function origineInParole(l) {
  const o = l?.origine
  if (!o) return { fornitore: null, testo: 'a mano' }
  if (typeof o === 'string') return { fornitore: null, testo: o }
  const forn = o.fornitore || null
  if (o.tipo === 'bolla' || o.numero) {
    return { fornitore: forn, testo: `bolla${o.numero ? ` ${o.numero}` : ''}${forn ? ` · ${forn}` : ''}` }
  }
  return { fornitore: forn, testo: forn || o.tipo || 'a mano' }
}

/**
 * Le righe che restano dopo i filtri, e il riassunto di cosa dicono.
 *
 * Sta fuori dal componente perché è la parte che si può provare senza
 * disegnare niente, ed è quella dove un errore costa: un filtro che perde
 * righe fa sembrare che un prezzo non sia mai cambiato.
 */
export function filtraStorico(righe, { testo = '', fornitore = 'tutti', variazione = 'tutte', periodo = 'tutto', fornitoreDi = {} } = {}) {
  const q = chiave(testo)
  const giorni = PERIODI.find(p => p.id === periodo)?.giorni
  const limite = giorni ? Date.now() - giorni * 24 * 3600 * 1000 : null
  const fuori = []
  for (const l of (righe || [])) {
    if (!l) continue
    const nome = l.ingrediente || ''
    if (q && !chiave(nome).includes(q)) continue
    if (limite != null) {
      const t = new Date(l.data).getTime()
      // Una riga con la data storta non si butta via in silenzio: resta
      // fuori solo se si sta chiedendo un periodo, e si vede nel conto.
      if (!Number.isFinite(t) || t < limite) continue
    }
    if (fornitore !== 'tutti') {
      const suo = origineInParole(l).fornitore || fornitoreDi[chiave(nome)] || null
      if (fornitore === 'senza') { if (suo) continue }
      else if (chiave(suo) !== chiave(fornitore)) continue
    }
    if (variazione !== 'tutte') {
      const d = Number(l.delta)
      const pct = Number(l.deltaPct)
      if (variazione === 'aumenti' && !(d > 0)) continue
      if (variazione === 'ribassi' && !(d < 0)) continue
      if (variazione === 'forti' && !(Number.isFinite(pct) && Math.abs(pct) >= 10)) continue
    }
    fuori.push(l)
  }
  return fuori
}

/** Il riassunto in cima: quante, quanto, e le due punte. */
export function riassuntoStorico(righe) {
  let aumenti = 0, ribassi = 0
  let piuSu = null, piuGiu = null
  for (const l of (righe || [])) {
    const pct = Number(l?.deltaPct)
    const d = Number(l?.delta)
    if (d > 0) aumenti++
    else if (d < 0) ribassi++
    if (Number.isFinite(pct)) {
      if (!piuSu || pct > Number(piuSu.deltaPct)) piuSu = l
      if (!piuGiu || pct < Number(piuGiu.deltaPct)) piuGiu = l
    }
  }
  return {
    totale: (righe || []).length,
    aumenti,
    ribassi,
    // Una punta all'insù che in realtà è un ribasso non è una punta: se non
    // c'è nemmeno un aumento, non si mostra niente invece di mostrare il meno
    // peggio.
    piuSu: piuSu && Number(piuSu.deltaPct) > 0 ? piuSu : null,
    piuGiu: piuGiu && Number(piuGiu.deltaPct) < 0 ? piuGiu : null,
  }
}

export default function StoricoPrezziSection({ logPrezzi = [], fornitoreDi = {}, isMobile = false, onTornaAlListino }) {
  const [testo, setTesto] = useState('')
  const [fornitore, setFornitore] = useState('tutti')
  const [variazione, setVariazione] = useState('tutte')
  const [periodo, setPeriodo] = useState('tutto')
  const [quante, setQuante] = useState(100)

  // I fornitori che compaiono davvero: quelli scritti sulle bolle più quelli
  // del listino. Un elenco costruito dai dati, non scritto a mano, o il
  // giorno che arriva un fornitore nuovo il filtro non lo vede.
  const fornitori = useMemo(() => {
    const s = new Set()
    let senza = false
    for (const l of (logPrezzi || [])) {
      const suo = origineInParole(l).fornitore || fornitoreDi[chiave(l?.ingrediente)] || null
      if (suo) s.add(suo); else senza = true
    }
    return { elenco: [...s].sort((a, b) => a.localeCompare(b, 'it')), senza }
  }, [logPrezzi, fornitoreDi])

  const righe = useMemo(
    () => filtraStorico(logPrezzi, { testo, fornitore, variazione, periodo, fornitoreDi }),
    [logPrezzi, testo, fornitore, variazione, periodo, fornitoreDi],
  )
  const sommario = useMemo(() => riassuntoStorico(righe), [righe])
  const mostrate = righe.slice(0, quante)
  const filtrando = testo.trim() !== '' || fornitore !== 'tutti' || variazione !== 'tutte' || periodo !== 'tutto'

  const quando = (l) => {
    const d = new Date(l.data)
    return Number.isFinite(d.getTime())
      ? d.toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
      : '—'
  }
  const valeDa = (l) => {
    const da = l.decorre_da || l.data
    const d = da ? new Date(da) : null
    if (!d || !Number.isFinite(d.getTime())) return '—'
    const futuro = d.getTime() > Date.now()
    return (
      <span style={{ color: futuro ? T.amberDark : C.textMid, fontWeight: futuro ? 700 : 400 }}>
        {d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })}{futuro && ' (futuro)'}
      </span>
    )
  }
  const differenza = (l) => {
    // Un prezzo scritto la prima volta non è un aumento: prima non c'era
    // niente con cui confrontarlo, e segnarlo «+120,00 €» direbbe una cosa
    // falsa sul costo che è cambiato.
    //
    // Il controllo comincia da `== null` perché `Number(null)` fa **zero**,
    // ed è finito: col solo `isFinite` il primo prezzo si leggeva
    // «+0,00 € (0%)», cioè «non è cambiato niente». È lo stesso scivolone
    // che questo progetto ha già pagato tre volte.
    if (l.delta == null || l.prezzoVecchio == null) return <span style={{ color: C.textSoft }}>primo prezzo</span>
    const d = Number(l.delta)
    const pct = Number(l.deltaPct)
    if (!Number.isFinite(d)) return <span style={{ color: C.textSoft }}>primo prezzo</span>
    return (
      <span style={{ color: d > 0 ? C.alert : d < 0 ? C.green : C.textSoft, fontWeight: 700 }}>
        {d > 0 ? '+' : ''}{d.toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
        {Number.isFinite(pct) && <span style={{ fontSize: FS.sm, marginLeft: 4, opacity: 0.7 }}>({pct > 0 ? '+' : ''}{pct.toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 1, maximumFractionDigits: 1 })}%)</span>}
      </span>
    )
  }
  const daDove = (l) => {
    const o = origineInParole(l)
    return <span style={{ color: C.textSoft, fontSize: FS.sm }}>{o.testo}</span>
  }

  const stileCampo = {
    padding: '10px 12px', minHeight: 44, borderRadius: 8, border: `1px solid ${C.borderStr}`,
    fontSize: FS.base, fontFamily: 'inherit', background: C.bgCard, color: C.text, width: '100%',
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ fontSize: FS.lg, fontWeight: 800, color: C.text }}>Storico modifiche prezzi</div>
        <span style={{ ...typo.caption, color: C.textSoft, fontWeight: 600 }}>
          {nInt((logPrezzi || []).length)} {(logPrezzi || []).length === 1 ? 'modifica registrata' : 'modifiche registrate'}
        </span>
      </div>
      <div style={{ fontSize: FS.sm, color: C.textSoft, marginBottom: 14, lineHeight: 1.5 }}>
        Ogni volta che il prezzo al chilo di una materia prima cambia — a mano o perché è arrivata
        una bolla — resta scritto qui con la data, chi l&rsquo;ha cambiato e da dove arriva.
        È il registro con cui si ricostruisce il food cost di un mese passato.
      </div>

      {/* ── I filtri ────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid', gap: 10, marginBottom: 14,
        gridTemplateColumns: isMobile ? '1fr' : 'minmax(180px, 1.4fr) minmax(150px, 1fr) minmax(150px, 1fr) minmax(150px, 1fr)',
      }}>
        <div>
          <label htmlFor="storico-cerca" style={{ display: 'block', ...typo.caption, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>Materia prima</label>
          <input id="storico-cerca" value={testo} onChange={e => setTesto(e.target.value)}
            placeholder="es. burro" style={stileCampo} />
        </div>
        <div>
          <label htmlFor="storico-fornitore" style={{ display: 'block', ...typo.caption, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>Fornitore</label>
          <select id="storico-fornitore" value={fornitore} onChange={e => setFornitore(e.target.value)} style={stileCampo}>
            <option value="tutti">Tutti i fornitori</option>
            {fornitori.elenco.map(f => <option key={f} value={f}>{f}</option>)}
            {fornitori.senza && <option value="senza">Senza fornitore</option>}
          </select>
        </div>
        <div>
          <label htmlFor="storico-variazione" style={{ display: 'block', ...typo.caption, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>Variazione</label>
          <select id="storico-variazione" value={variazione} onChange={e => setVariazione(e.target.value)} style={stileCampo}>
            {VARIAZIONI.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="storico-periodo" style={{ display: 'block', ...typo.caption, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>Periodo</label>
          <select id="storico-periodo" value={periodo} onChange={e => setPeriodo(e.target.value)} style={stileCampo}>
            {PERIODI.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
      </div>

      {/* ── Cosa dicono le righe che restano ────────────────────────── */}
      <div style={{
        display: 'grid', gap: 10, marginBottom: 14,
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
      }}>
        {[
          { etichetta: 'Modifiche', valore: nInt(sommario.totale), colore: C.text },
          { etichetta: 'Aumenti', valore: nInt(sommario.aumenti), colore: sommario.aumenti > 0 ? C.alert : C.textSoft },
          { etichetta: 'Ribassi', valore: nInt(sommario.ribassi), colore: sommario.ribassi > 0 ? C.green : C.textSoft },
          {
            etichetta: 'Rincaro maggiore',
            valore: sommario.piuSu ? `+${Number(sommario.piuSu.deltaPct).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '—',
            sotto: sommario.piuSu ? sommario.piuSu.ingrediente : null,
            colore: sommario.piuSu ? C.alert : C.textSoft,
          },
        ].map(k => (
          <div key={k.etichetta} style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: R.lg, padding: '10px 12px' }}>
            {/* Le etichette e i numeri dei riquadri affiancati restano
                incolonnati fra loro: altezze fisse, come nel resto del
                prodotto. */}
            <div style={{ ...typo.caption, color: C.textSoft, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', minHeight: 16 }}>{k.etichetta}</div>
            <div style={{ fontSize: FS.xl, fontWeight: 800, color: k.colore, ...TNUM, minHeight: 26 }}>{k.valore}</div>
            <div style={{ ...typo.caption, color: C.textSoft, minHeight: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.sotto || ''}</div>
          </div>
        ))}
      </div>

      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: R['2xl'], overflow: 'hidden' }}>
        {mostrate.length === 0 ? (
          // Il messaggio lo scrive la sezione: la tabella riceve già il corpo
          // fatto, e un `<tbody>` vuoto non dice niente a nessuno. Con i
          // filtri addosso la frase dice anche **cosa fare**, che è la
          // differenza fra un vicolo cieco e una strada.
          <div role="status" style={{ padding: '28px 20px', textAlign: 'center', fontSize: FS.sm, color: C.textSoft, lineHeight: 1.6 }}>
            {filtrando
              ? 'Nessuna modifica con questi filtri. Prova ad allargare il periodo o a togliere il fornitore.'
              : 'Nessuna modifica registrata: qui compaiono i cambi di prezzo delle materie prime, a mano o da una bolla.'}
          </div>
        ) : (
        <TabellaOSchede
          minWidth={640}
          righe={mostrate}
          chiave={(l) => l.id}
          vuoto={filtrando
            ? 'Nessuna modifica con questi filtri. Prova ad allargare il periodo o a togliere il fornitore.'
            : 'Nessuna modifica registrata: qui compaiono i cambi di prezzo delle materie prime.'}
          titolo={(l) => <span>{l.ingrediente}</span>}
          riassunto={(l) => (
            <span style={{ ...typo.caption, color: C.textSoft, fontWeight: 400, textAlign: 'right', display: 'inline-block' }}>
              {quando(l)}
              {l.utente && <div>{String(l.utente).split('@')[0]}</div>}
            </span>
          )}
          colonne={[
            { k: 'daDove', label: 'Da dove', cella: daDove },
            { k: 'valeDa', label: 'Vale da', cella: valeDa },
            { k: 'vecchio', label: 'Vecchio', cella: (l) => l.prezzoVecchio == null ? '—' : euroKg(l.prezzoVecchio) },
            { k: 'nuovo', label: 'Nuovo', forte: true, cella: (l) => euroKg(l.prezzoNuovo) },
            { k: 'diff', label: 'Differenza', cella: differenza },
          ]}
          intestazione={<thead>
            <tr>
              {['Modificato il', 'Materia prima', 'Da dove', 'Vale da', 'Vecchio', 'Nuovo', 'Differenza'].map((h, i) => (
                <th key={h} style={{ padding: '8px 12px', textAlign: i >= 4 ? 'right' : 'left', ...typo.caption, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: C.textSoft, background: C.bgSubtle, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>}
          corpo={<tbody>
            {mostrate.map(l => (
              <tr key={l.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: '7px 12px', ...TNUM, color: C.textMid, whiteSpace: 'nowrap' }}>
                  {quando(l)}
                  {l.utente && <div style={{ ...typo.caption, color: C.textSoft, fontWeight: 400 }}>{String(l.utente).split('@')[0]}</div>}
                </td>
                <td style={{ padding: '7px 12px', fontWeight: 600, color: C.text }}>{l.ingrediente}</td>
                <td style={{ padding: '7px 12px' }}>{daDove(l)}</td>
                <td style={{ padding: '7px 12px', color: C.textMid, whiteSpace: 'nowrap' }}>{valeDa(l)}</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', color: C.textMid, ...TNUM }}>{l.prezzoVecchio == null ? '—' : euroKg(l.prezzoVecchio)}</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700, color: C.text, ...TNUM }}>{euroKg(l.prezzoNuovo)}</td>
                <td style={{ padding: '7px 12px', textAlign: 'right', ...TNUM }}>{differenza(l)}</td>
              </tr>
            ))}
          </tbody>}
        />
        )}
        {righe.length > mostrate.length && (
          <div style={{ padding: 12, textAlign: 'center', borderTop: `1px solid ${C.border}` }}>
            <button type="button" onClick={() => setQuante(q => q + 200)}
              style={{ padding: '0 18px', minHeight: 44, borderRadius: 8, border: `1px solid ${C.borderStr}`, background: 'transparent', fontSize: FS.sm, fontWeight: 700, color: C.textMid, cursor: 'pointer', fontFamily: 'inherit' }}>
              Mostra altre {nInt(Math.min(200, righe.length - mostrate.length))} · ne restano {nInt(righe.length - mostrate.length)}
            </button>
          </div>
        )}
      </div>

      {onTornaAlListino && (
        <div style={{ marginTop: 14 }}>
          <button type="button" onClick={onTornaAlListino}
            style={{ padding: '0 16px', minHeight: 44, borderRadius: 8, border: `1px solid ${C.borderStr}`, background: 'transparent', fontSize: FS.sm, fontWeight: 700, color: C.textMid, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
            <Icon name="chevL" size={13} /> Torna al listino
          </button>
        </div>
      )}
    </div>
  )
}
