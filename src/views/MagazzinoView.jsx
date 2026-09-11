// MagazzinoView + ProdottiFinitiTab + PrezziIngredientiTab - estratti da Dashboard.jsx.
// KPI e calcolaFabbisognoSettimana inline (uso interno al modulo).
//
// Persistenza: richiede orgId/sedeId come props per chiamare ssave da lib/storage
// (prima usava la wrapper locale di Dashboard.jsx che leggeva _ctx_*).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, motion as M, typo } from '../lib/theme'
import { ssave as _ssave } from '../lib/storage'
import { todayLocal } from '../lib/dateLocal'
import { normIng, getR, translateIngredienteEN, buildIngCosti } from '../lib/foodcost'
import { onEnterAutoComplete } from '../lib/autocomplete'
import { SK_MAG, SK_EXCL, SK_LOGRIF } from '../lib/storageKeys'
import { lessico } from '../lib/lessico'
import FotoOCR from '../components/FotoOCR'
import Icon from '../components/Icon'
import { loadStockPF, loadMovimentiPF, scartoPF } from '../lib/stockPF'
import {
  C, TNUM, KPI, PageHeader, useSortable, SortTH, fmt0, fmtp,
} from './_shared'
import { fornitoreDiIngrediente } from '../lib/fornitoreIngrediente'

// Ombra premium coerente con la Dashboard home (card/contenitori principali).
const SHADOW_PREMIUM = '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)'

// ─── KPI Card (interna al modulo) ────────────────────────────────────────────
// Look premium coerente con la Dashboard home: chip icona 36px, decoro radiale,
// accento colore, raggio 18.
// ── Nota sulla scala dei testi (7/09/2026) ──────────────────────────────────
//
// Questa pagina aveva 51 testi sotto i 12px: sei a 8px, dodici a 9, otto a 10.
// La stessa bonifica era già stata fatta su Chiusura e Calendario, con la
// motivazione che vale identica qui: su un gestionale che useranno proprietari
// di sessant'anni, dietro il banco o in laboratorio, sotto i 12px non si
// legge. Otto pixel non è testo piccolo: è testo che nessuno leggerà.
//
// Alzati a 11 (le micro-etichette in maiuscoletto spaziato, che sono
// `typo.caption`) e a 12 il testo che e' contenuto e non etichetta — la
// pillola di stato per prima. Restano da alzare i 10 e gli 11 residui: si
// tocca la larghezza delle colonne di una tabella a nove colonne, quindi vale
// la pena farlo insieme a una revisione della tabella, non di soppiatto.

// `onClick` c'era nell'intenzione ma non nella firma: un KPI col sottotitolo
// "clicca per vedere cosa ordinare" non reagiva al clic, e la promessa restava
// lettera morta. Ora se arriva un onClick la tessera diventa un vero pulsante,
// raggiungibile anche da tastiera.
// Audit 2026-09-09: qui c'era una copia locale del riquadro KPI, ferma a una
// versione precedente di quella condivisa in _shared.jsx: non chiamava
// useIsMobile, quindi su telefono il valore sforava il riquadro e i numeri dei
// riquadri affiancati non erano incolonnati fra loro (regola della casa).
// Due copie della stessa cosa vogliono due correzioni ogni volta, e una delle
// due resta sempre indietro: ora si usa quella condivisa.

// ─── Section header con barra brand (gerarchia premium) ──────────────────────
function SectHead({ icon, title, sub, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
      <span style={{ width: 36, height: 36, borderRadius: 11, background: 'rgba(110,14,26,0.10)', color: T.brand, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: '-0.01em' }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: T.textSoft, marginTop: 1 }}>{sub}</div>}
      </div>
      {right}
    </div>
  )
}

// ─── Calcolo fabbisogno settimanale (helper) ─────────────────────────────────
function calcolaFabbisognoSettimana(ricettario, giornaliero) {
  const ultimi7 = [...(giornaliero || [])].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 7)
  const fabb = {}
  for (const sess of ultimi7) {
    for (const prod of (sess.prodotti || [])) {
      const ric = Object.values(ricettario?.ricette || {}).find(r => r.nome === prod.nome)
      if (!ric) continue
      for (const ing of (ric.ingredienti || [])) {
        const k = normIng(ing.nome)
        fabb[k] = (fabb[k] || 0) + ing.qty1stampo * prod.stampi
      }
    }
  }
  // Audit 2026-09-09: quando lo storico non c'e', questo fallback inventa un
  // consumo di "1 stampo per ricetta a settimana". Da quel numero nascono i
  // giorni di scorta, lo stato (critico/attenzione) e la quantita' suggerita di
  // riordino — tutti presentati come misurati. Un pasticcere che ordina su quei
  // numeri ordina su un'ipotesi del software.
  // Il fallback resta (un ordine di grandezza e' meglio di niente), ma da ora
  // chi lo usa sa che e' una stima e lo scrive a schermo.
  if (ultimi7.length === 0 && ricettario) {
    for (const ric of Object.values(ricettario.ricette || {})) {
      if (getR(ric.nome, ric).tipo === 'interno') continue
      for (const ing of (ric.ingredienti || [])) {
        const k = normIng(ing.nome)
        fabb[k] = (fabb[k] || 0) + ing.qty1stampo
      }
    }
  }
  // `stimato`: il consumo non viene dallo storico ma dal fallback. Chi mostra i
  // giorni di scorta o il riordino deve dirlo, invece di far passare un'ipotesi
  // per una misura.
  return { fabb, stimato: ultimi7.length === 0, giorniStorico: ultimi7.length }
}

// ─── ProdottiFinitiTab (stock prodotti finiti per sede) ──────────────────────
function ProdottiFinitiTab({ notify, orgId, sedeId, LEX = lessico() }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const [stock, setStock] = useState([])
  const [loading, setLoading] = useState(true)
  // "Non c'e' niente in magazzino" e "non sono riuscito a leggere" sono due
  // cose opposte, e prima si vedeva sempre la prima: i due caricatori
  // restituivano un array vuoto anche quando la rete cadeva o il permesso
  // mancava, e il catch qui sotto era codice morto. Chi guardava leggeva
  // "Nessun prodotto in stock" e poteva rimettersi a produrre merce che aveva
  // già in cella.
  const [erroreLettura, setErroreLettura] = useState(null)
  // Quanti movimenti si leggono. Parte da 30 e si allarga su richiesta.
  const [movLimite, setMovLimite] = useState(30)
  const [scartoForm, setScartoForm] = useState(null)
  const [movimenti, setMovimenti] = useState([])
  const [saving, setSaving] = useState(false)

  const carica = useCallback(async () => {
    if (!orgId || !sedeId) { setLoading(false); return }
    setLoading(true)
    setErroreLettura(null)
    try {
      const [s, m] = await Promise.all([
        loadStockPF(orgId, sedeId, { rilancia: true }),
        loadMovimentiPF(orgId, sedeId, { limit: movLimite, rilancia: true }),
      ])
      setStock(s)
      setMovimenti(m)
    } catch (e) {
      setErroreLettura(e.message || 'rete')
      setStock([])
      setMovimenti([])
    } finally { setLoading(false) }
  }, [orgId, sedeId, notify])

  useEffect(() => { carica() }, [carica])

  // Audit 2026-09-09: qui c'erano `focusTimerRef` e `focusQtyDeferred`, copia
  // di quelli che stanno in MagazzinoView. Codice morto: nessuno li chiamava in
  // questo componente, e puntavano a `mag-qty-input`, che e' un campo di un
  // ALTRO componente (il form di carico merce). Una copia inerte di una
  // funzione che tocca il DOM di un'altra parte della pagina e' il genere di
  // cosa che sembra funzionare finche' qualcuno prova a usarla.

  const handleScarto = async () => {
    if (saving) return // evita doppio scarico stock su doppio click
    // La quantità arriva come stringa dal campo (per non perdere la virgola
    // mentre si digita): si converte QUI, una volta sola.
    const qta = parseFloat(String(scartoForm?.qty ?? '').replace(',', '.'))
    if (!scartoForm?.prodotto || !(qta > 0)) return
    setSaving(true)
    try {
      await scartoPF({ sedeId, prodotto: scartoForm.prodotto, quantita: qta, note: scartoForm.note || null })
      notify('Scarto registrato')
      setScartoForm(null)
      await carica()
    } catch (e) {
      console.error('[magazzino] salvataggio:', e); notify('Non ho potuto salvare. Controlla la connessione e riprova', false)
    } finally {
      setSaving(false)
    }
  }

  if (!sedeId) return <div style={{ padding: 24, textAlign: 'center', color: C.textSoft, fontSize: 13 }}>Seleziona una sede attiva per vedere lo stock {LEX.prodotti} finiti.</div>
  if (loading) return <div style={{ padding: 24, textAlign: 'center', color: C.textSoft, fontSize: 13 }}>Caricamento…</div>
  // Quando il dato non c'è non si mostrano zeri: si dice che non si è letto.
  if (erroreLettura) return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.red}40`, borderRadius: 18, padding: '32px 24px', textAlign: 'center', boxShadow: SHADOW_PREMIUM }}>
      <div style={{ marginBottom: 10, color: C.red }}><Icon name="alert" size={30} /></div>
      <div style={{ ...typo.body, fontWeight: 700, color: C.text, marginBottom: 6 }}>
        Non riesco a leggere lo stock di questa sede
      </div>
      <div style={{ ...typo.small, color: C.textSoft, lineHeight: 1.55, maxWidth: 460, margin: '0 auto 16px' }}>
        Quello che vedi non è "magazzino vuoto": è che la lettura non è andata a buon fine.
        Controlla la connessione e riprova.
      </div>
      <button onClick={carica} style={{ padding: '0 18px', minHeight: 42, background: C.red, color: C.white, border: 'none', borderRadius: 8, ...typo.small, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
        Riprova
      </button>
    </div>
  )

  // Pezzi e grammi non si sommano.
  //
  // Prima era una somma sola su tutte le righe, ignorando `r.unita`: le righe
  // in grammi esistono davvero (i trasferimenti di gusti arrivano con
  // unita 'g'), quindi 20 torte più 8,4 kg di gelato diventavano "8.420 pezzi
  // totali". Un numero senza significato, presentato come misurato.
  const totPezzi = stock.filter(r => (r.unita || 'pz') !== 'g')
    .reduce((s, r) => s + Number(r.quantita || 0), 0)
  const totGrammi = stock.filter(r => (r.unita || 'pz') === 'g')
    .reduce((s, r) => s + Number(r.quantita || 0), 0)
  const sottoSoglia = stock.filter(r => r.soglia_min > 0 && Number(r.quantita) <= Number(r.soglia_min))
  const negativi = stock.filter(r => Number(r.quantita) < 0)

  // Data leggibile per le colonne "Aggiornato" e per i movimenti.
  //
  // Audit 2026-09-09: prima era toLocaleString con solo giorno, mese e ora:
  // senza l'anno, una giacenza ferma da un anno sembrava di ieri. E questa
  // colonna e' l'unico posto dove si vedono le giacenze morte, che sono un
  // problema noto (c'e' un bottone "Azzera" con la nota "dato fantasma").
  // Sotto la settimana diciamo "oggi"/"ieri"/"N giorni fa", che e' come si
  // ragiona in laboratorio; oltre, la data con l'anno.
  const dataLeggibile = (iso) => {
    if (!iso) return '-'
    const d = new Date(iso)
    if (isNaN(d.getTime())) return '-'
    const oggi = new Date()
    const soloGiorno = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
    const giorni = Math.round((soloGiorno(oggi) - soloGiorno(d)) / 86400000)
    const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    if (giorni === 0) return `oggi ${ora}`
    if (giorni === 1) return `ieri ${ora}`
    if (giorni > 1 && giorni < 7) return `${giorni} giorni fa`
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const CAUSALE_LBL = {
    produzione: { lbl: 'Produzione', ic: 'factory', col: '#16A34A' },
    // Audit 2026-09-09: era '#DC2626', il rosso d'allarme. Ma inviare merce a
    // un'altra sede e' un'operazione normale: il rosso resta agli scarti.
    trasferimento_invio: { lbl: 'Inviato', ic: 'truck', col: T.blue },
    trasferimento_ricezione: { lbl: 'Ricevuto', ic: 'package', col: '#16A34A' },
    vendita: { lbl: 'Vendita', ic: 'cart', col: '#2563EB' },
    scarto: { lbl: 'Scarto', ic: 'warning', col: '#92400E' },
    annullo_trasferimento: { lbl: 'Annullo', ic: 'undo', col: '#94A3B8' },
    rettifica: { lbl: 'Rettifica', ic: 'edit', col: '#475569' },
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        <KPI icon={<Icon name="package" size={18} />} label={`${LEX.Prodotti} in stock`} value={stock.length}/>
        <KPI icon={<Icon name="barChart" size={18} />} label="Pezzi totali"
          value={`${totPezzi.toLocaleString('it-IT', { maximumFractionDigits: 0, useGrouping: 'always' })} pz`}
          sub={totGrammi > 0
            ? `più ${(totGrammi / 1000).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg sfusi`
            : ''}/>
        <KPI icon={<Icon name="warning" size={18} />} label="Sotto soglia" value={sottoSoglia.length} color={sottoSoglia.length > 0 ? C.amber : C.green}/>
        <KPI icon={<Icon name="alert" size={18} />} label="Stock negativo" value={negativi.length} color={negativi.length > 0 ? C.red : C.green} sub={negativi.length > 0 ? 'più vendite che carico' : ''}/>
      </div>

      {stock.length === 0 ? (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 18, padding: '40px 20px', textAlign: 'center', color: C.textSoft, fontSize: 13, boxShadow: SHADOW_PREMIUM }}>
          <div style={{ marginBottom: 8, color: C.textSoft }}><Icon name="package" size={36} /></div>
          Nessun prodotto in stock per questa sede.<br/>
          {/* Audit 2026-09-09: diceva solo "alla conferma di una sessione di
              produzione", cioè una delle tre strade. Chi ha ricevuto un
              trasferimento da un'altra sede e non vede niente qui non sa dove
              guardare. */}
          Lo stock si riempie in tre modi: confermando una sessione di <b>Produzione</b>,
          ricevendo un <b>trasferimento</b> da un'altra sede, oppure con l'inventario
          settimanale se hai attivato quel metodo.
        </div>
      ) : (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 18, overflowX: 'auto', marginBottom: 20, boxShadow: SHADOW_PREMIUM }}>
          {/* Audit 2026-09-09: il wrapper ha overflowX auto ma la tabella era
              a width 100% senza minWidth, quindi non superava mai il contenitore
              e lo scroll non partiva: su telefono cinque colonne si schiacciano
              e la data va a capo spezzata. Le altre tre tabelle del file il
              minWidth ce l'hanno già (480, 540, 760). */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 580 }}>
            <thead>
              <tr style={{ background: '#F8F4F2' }}>
                {[LEX.Prodotto, 'Disponibili', 'Soglia', 'Aggiornato', ''].map((h, i) => (
                  <th key={i} style={{ padding: '10px 14px', textAlign: i === 1 || i === 2 ? 'right' : 'left', ...typo.caption, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stock.map((r, i) => {
                const q = Number(r.quantita || 0)
                const sotto = r.soglia_min > 0 && q <= Number(r.soglia_min)
                const neg = q < 0
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : '#FDFAF7' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: C.text }}>{r.prodotto_nome}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: neg ? C.red : sotto ? C.amber : C.text, ...TNUM }}>
                      {q.toLocaleString('it-IT', { useGrouping: 'always', maximumFractionDigits: 2 })} {r.unita}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: C.textSoft, ...TNUM }}>
                      {r.soglia_min > 0 ? Number(r.soglia_min).toLocaleString('it-IT', { useGrouping: 'always' }) : '-'}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: typo.small.fontSize, color: C.textSoft, whiteSpace: 'nowrap' }}>
                      {dataLeggibile(r.updated_at)}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <button onClick={() => setScartoForm({ prodotto: r.prodotto_nome, qty: '', note: '', azzera: false, unita: r.unita || 'pz', disponibile: q })} disabled={q <= 0}
                        style={{ padding: '9px 12px', minHeight: 40, borderRadius: 6, border: `1px solid ${C.border}`, background: C.bgCard, color: q <= 0 ? C.textSoft : C.amber, fontSize: 12, fontWeight: 700, cursor: q <= 0 ? 'not-allowed' : 'pointer', marginRight: 4 }}>
                        Scarto
                      </button>
                      {q > 0 && (
                        <button onClick={() => setScartoForm({ prodotto: r.prodotto_nome, qty: String(q), note: 'Azzeramento stock (dato fantasma o reset)', azzera: true, unita: r.unita || 'pz', disponibile: q })}
                          title="Porta a zero lo stock di questo prodotto"
                          style={{ padding: '9px 10px', minHeight: 40, marginLeft: 6, borderRadius: 6, border: `1px solid ${C.red}`, background: '#FFF5F5', color: C.red, fontSize: typo.small.fontSize, fontWeight: 700, cursor: 'pointer' }}>
                          Azzera
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {movimenti.length > 0 && (
        <div>
          {/* Audit 2026-09-09: la lista si fermava a 30 movimenti senza dirlo.
              Chi cerca lo scarto di lunedi e non lo trova lo registra di nuovo,
              e quella e' una doppia scrittura vera nei dati. Ora il numero e'
              scritto e si può allargare. */}
          <SectHead icon={<Icon name="clock" size={16} />} title="Movimenti recenti"
            sub={movimenti.length >= movLimite
              ? `Gli ultimi ${movLimite}: ce ne sono altri più indietro`
              : `Tutti i ${movimenti.length} movimenti di questa sede`} />

          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden', boxShadow: SHADOW_PREMIUM }}>
            {/* Audit 2026-09-09: il wrapper esterno e' `overflow: hidden` e la
                tabella non aveva minWidth. Le celle data e causale hanno
                whiteSpace nowrap, quindi spingono la larghezza oltre il
                contenitore e quello che sfora viene TAGLIATO: l'unica cella
                comprimibile e' la nota, che si schiacciava fino a sparire.
                Il pattern giusto e' già nel file (righe 517-519): wrapper con
                bordo e raggio, dentro un div che scorre, tabella con minWidth. */}
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: typo.small.fontSize, minWidth: 620 }}>
              {/* L'intestazione mancava: cinque colonne senza nome, e la
                  colonna dei numeri non diceva se era una quantità o un
                  valore in euro. */}
              <thead>
                <tr style={{ background: '#F8F4F2' }}>
                  {[['Quando', 'left'], ['Prodotto', 'left'], ['Perché', 'left'], ['Quantità', 'right'], ['Nota', 'left']].map(([h, al]) => (
                    <th key={h} style={{
                      padding: '9px 14px', textAlign: al, fontSize: 12, fontWeight: 700,
                      letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textMid,
                      borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movimenti.map(m => {
                  const c = CAUSALE_LBL[m.causale] || { lbl: m.causale, col: C.textSoft }
                  const d = Number(m.delta)
                  return (
                    <tr key={m.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td style={{ padding: '8px 14px', fontSize: 12, color: C.textSoft, whiteSpace: 'nowrap' }}>
                        {dataLeggibile(m.created_at)}
                      </td>
                      <td style={{ padding: '8px 14px', fontWeight: 700, color: C.text }}>{m.prodotto_nome}</td>
                      <td style={{ padding: '8px 14px', fontSize: typo.small.fontSize, color: c.col, whiteSpace: 'nowrap' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{c.ic && <Icon name={c.ic} size={12} />}{c.lbl}</span></td>
                      {/* Audit 2026-09-09, due difetti in una cella.
                          COLORE: era verde per i positivi e ROSSO per tutti i
                          negativi. Ma ogni chiusura di cassa scrive una vendita
                          per ogni prodotto venduto (ChiusuraView righe 734 e
                          778), quindi in una giornata normale la lista e' quasi
                          tutta negativa: la pagina era rossa senza che ci fosse
                          niente da fare. Il rosso resta solo sugli scarti, che
                          sono l'unica causale su cui c'e' da intervenire.
                          NUMERO: `{d}` stampava il valore grezzo, quindi un
                          delta di 8400 grammi usciva "-8400" invece di
                          "-8.400" (regola dei numeri italiani). */}
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 800, color: m.causale === 'scarto' ? C.red : C.text, ...TNUM, whiteSpace: 'nowrap' }}>
                        {d > 0 ? '+' : d < 0 ? '−' : ''}{Math.abs(d).toLocaleString('it-IT', { useGrouping: 'always' })}
                      </td>
                      <td style={{ padding: '8px 14px', fontSize: typo.small.fontSize, color: C.textSoft, fontStyle: 'italic' }}>{m.note || ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
            {movimenti.length >= movLimite && (
              <div style={{ padding: '10px 14px', borderTop: `1px solid ${C.border}`, textAlign: 'center' }}>
                <button type="button" onClick={() => setMovLimite(l => l + 100)}
                  style={{ padding: '9px 16px', minHeight: 40, borderRadius: 8, border: `1px solid ${C.borderStr}`, background: C.bgCard, fontSize: typo.small.fontSize, fontWeight: 700, color: C.textMid, cursor: 'pointer' }}>
                  Mostra altri 100 movimenti
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {scartoForm && (
        // Audit 2026-09-09: la finestra non si chiudeva con Esc (tutte le altre
        // del prodotto lo fanno), si chiudeva toccando lo sfondo ANCHE mentre il
        // salvataggio era in corso — buttando via quello che il pasticcere aveva
        // scritto senza dire com'era finita — e all'apertura il cursore non
        // finiva nel campo, quindi bisognava cliccarci.
        <div role="dialog" aria-modal="true" aria-label="Registra scarto"
          tabIndex={-1}
          ref={el => { if (el && !el.dataset.visto) { el.dataset.visto = '1'; el.focus() } }}
          onKeyDown={e => { if (e.key === 'Escape' && !saving) setScartoForm(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={() => { if (!saving) setScartoForm(null) }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.bgCard, borderRadius: 16, padding: 24, maxWidth: 420, width: '100%', boxShadow: '0 24px 60px rgba(15,23,42,0.28)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: C.text, display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icon name="warning" size={18} />Registra scarto</h3>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: C.textSoft }}>{LEX.Prodotto}: <strong>{scartoForm.prodotto}</strong></p>
            <div style={{ marginBottom: 12 }}>
              {/* L'unità della riga, non "(pz)" fisso: su una riga in grammi
                  si chiedeva di scartare "pezzi" di gelato sfuso. */}
              <div style={{ ...typo.caption, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Quantità scartata ({scartoForm.unita === 'g' ? 'g' : 'pz'})
              </div>
              {/* Nello stato si tiene la STRINGA grezza, non il numero.
                  Prima ogni battuta passava da parseFloat: digitando "1,5" lo
                  stato intermedio "1," diventava 1, il campo tornava a "1" e
                  il separatore era perso — i decimali non si potevano
                  scrivere. E svuotando il campo compariva uno 0. */}
              <input type="text" inputMode="decimal" value={scartoForm.qty}
                onChange={e => setScartoForm(f => ({ ...f, qty: e.target.value }))}
                style={{ width: '100%', padding: '12px 14px', minHeight: 44, borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 16, boxSizing: 'border-box' }}/>
            </div>
            <div style={{ marginBottom: 18 }}>
              <div style={{ ...typo.caption, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Motivo (opzionale)</div>
              <input value={scartoForm.note}
                onChange={e => setScartoForm(f => ({ ...f, note: e.target.value }))}
                placeholder="es. caduti per terra, scaduti, dati a omaggio"
                style={{ width: '100%', padding: '12px 14px', minHeight: 44, borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: 16, boxSizing: 'border-box' }}/>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setScartoForm(null)} style={{ padding: '10px 18px', minHeight: 44, background: 'transparent', color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Annulla</button>
              <button onClick={handleScarto}
                disabled={saving || !(parseFloat(String(scartoForm.qty ?? '').replace(',', '.')) > 0)}
                style={{ padding: '10px 18px', minHeight: 44, background: C.red, color: C.white, border: 'none', borderRadius: 8, fontWeight: 800, fontSize: 13,
                  cursor: (saving || !(parseFloat(String(scartoForm.qty ?? '').replace(',', '.')) > 0)) ? 'not-allowed' : 'pointer',
                  opacity: (saving || !(parseFloat(String(scartoForm.qty ?? '').replace(',', '.')) > 0)) ? 0.5 : 1 }}>{saving ? 'Registrazione…' : 'Registra scarto'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── PrezziIngredientiTab ────────────────────────────────────────────────────
function PrezziIngredientiTab({ ricettario, logPrezzi, onUpdatePrezzo, isMobile }) {
  const [search, setSearch] = useState('')
  const [editKey, setEditKey] = useState(null)
  const [editVal, setEditVal] = useState('')
  const [confirmKey, setConfirmKey] = useState(null)
  const [confirmVal, setConfirmVal] = useState(null)
  const [confirmDecorre, setConfirmDecorre] = useState(() => todayLocal())
  const [showLog, setShowLog] = useState(false)
  const [salvandoPrezzo, setSalvandoPrezzo] = useState(false)
  const [errEdit, setErrEdit] = useState(null)

  const ingredienti = useMemo(() => {
    const map = new Map()
    const costi = ricettario?.ingredienti_costi || {}
    for (const ric of Object.values(ricettario?.ricette || {})) {
      for (const ing of (ric.ingredienti || [])) {
        const k = normIng(ing.nome || '')
        if (!k) continue
        if (!map.has(k)) {
          const c = costi[k]
          // isStima = prezzo medio di mercato del listino HoReCa, non tuo.
          map.set(k, { key: k, nome: ing.nome, prezzoKg: c?.costoKg || 0, haPrezzo: !!c && c.costoKg > 0 && !c.isStima, isStima: !!c?.isStima })
        }
      }
    }
    for (const [k, c] of Object.entries(costi)) {
      if (!map.has(k)) map.set(k, { key: k, nome: k, prezzoKg: c.costoKg || 0, haPrezzo: (c.costoKg || 0) > 0 && !c.isStima, isStima: !!c.isStima })
    }
    return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome))
  }, [ricettario])

  const filtered = search.trim() ? ingredienti.filter(i => (i.nome || '').toLowerCase().includes(search.toLowerCase().trim())) : ingredienti
  // Audit 2026-07-01 batch 10 Performance: paginazione UI per liste grandi.
  // Pasticcerie con ricettario completo possono avere 200-500 ingredienti;
  // renderizzarli tutti = 500 row + form input = lag tangibile su mobile.
  // Default 80 visibili, "Mostra altri" carica +80 per volta. La ricerca
  // bypassa il limite (i risultati filtrati sono comunque pochi).
  const [maxVisible, setMaxVisible] = useState(80)
  useEffect(() => { setMaxVisible(80) }, [search])
  const isPaginated = !search.trim() && filtered.length > maxVisible
  const visibleRows = isPaginated ? filtered.slice(0, maxVisible) : filtered

  const startEdit = (row) => { setEditKey(row.key); setEditVal(row.prezzoKg ? row.prezzoKg.toFixed(2) : '') }
  const cancelEdit = () => { setEditKey(null); setEditVal(''); setErrEdit(null) }

  const tentaSalva = (row) => {
    const v = parseFloat(String(editVal).replace(',', '.'))
    // Prima il `return` muto: scrivendo "12,5o" per errore, il pulsante Salva
    // non faceva niente e non diceva niente. Non si capiva se il salvataggio
    // era andato, se il prezzo era stato rifiutato, o se il pulsante era rotto.
    if (isNaN(v) || v < 0) { setErrEdit('Scrivi un prezzo in euro per chilo, per esempio 12,50'); return }
    setErrEdit(null)
    // Audit 2026-09-09: il confronto era esatto, ma l'input si precompila con
    // due decimali mentre in archivio i prezzi ne hanno quattro. Aprendo la
    // riga di un ingrediente a 0,8825 EUR/kg e premendo Salva senza toccare
    // niente, il prezzo cambiava a 0,88 da solo. Ora si confronta quello che
    // l'utente VEDE: se non ha cambiato la cifra a schermo, non si salva.
    const visto = Math.round((Number(row.prezzoKg) || 0) * 100) / 100
    if (Math.abs(v - visto) < 0.005) { cancelEdit(); return }
    setConfirmKey(row.key)
    setConfirmVal(v)
    setConfirmDecorre(todayLocal())
  }

  const confermaSalva = async () => {
    // Blocco sul doppio clic. Senza, due clic rapidi scrivevano due volte lo
    // stesso cambio di prezzo: due righe nello storico per una modifica sola,
    // e uno storico dei prezzi che non torna e' un P&L che non torna.
    if (salvandoPrezzo) return
    const row = ingredienti.find(i => i.key === confirmKey)
    if (!row) { setConfirmKey(null); return }
    // Decorrenza alle 00:00:00 del giorno scelto
    const decorreISO = confirmDecorre ? new Date(confirmDecorre + 'T00:00:00').toISOString() : new Date().toISOString()
    setSalvandoPrezzo(true)
    try {
      await onUpdatePrezzo(row.nome, confirmVal, decorreISO)
      setConfirmKey(null); setConfirmVal(null)
      cancelEdit()
    } finally {
      setSalvandoPrezzo(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca ingrediente…"
            style={{ width: '100%', padding: '11px 14px', minHeight: 44, borderRadius: 8, border: `1px solid ${C.border}`, fontSize: isMobile ? 16 : 13, background: C.white, color: C.text, outline: 'none', boxSizing: 'border-box' }}/>
        </div>
        <button onClick={() => setShowLog(s => !s)}
          style={{ padding: '0 14px', minHeight: 40, borderRadius: 8, border: `1px solid ${C.borderStr}`, background: showLog ? C.redLight : 'transparent', fontSize: 12, fontWeight: 700, color: showLog ? C.red : C.textMid, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {/* "Log" e' gergo da informatico: in italiano si chiama storico. E il
              carattere ✕ diventa un'icona, come il resto della pagina. */}
          {showLog
            ? <><Icon name="x" size={13} />Chiudi lo storico</>
            : <><Icon name="fileText" size={13} />{`Storico modifiche · ${logPrezzi?.length || 0}`}</>}
        </button>
      </div>

      <div style={{ fontSize: 12, color: C.textSoft, marginBottom: 14, lineHeight: 1.5 }}>
        Modifica il <b>prezzo €/kg</b> di un ingrediente con un click. La modifica richiede conferma esplicita per evitare errori e viene registrata nello storico.
      </div>

      {showLog && (
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 16, marginBottom: 18, overflow: 'hidden', boxShadow: SHADOW_PREMIUM }}>
          <div style={{ padding: '11px 14px', background: '#F8F4F2', fontSize: typo.small.fontSize, fontWeight: 700, color: C.textMid, borderBottom: `1px solid ${C.border}` }}>
            Storico modifiche prezzi · ultime {Math.min(50, logPrezzi?.length || 0)} di {logPrezzi?.length || 0}
          </div>
          {(!logPrezzi || logPrezzi.length === 0) ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: C.textSoft }}>Nessuna modifica registrata.</div>
          ) : (
            <div style={{ maxHeight: 240, overflowY: 'auto', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: typo.small.fontSize }}>
                <thead>
                  <tr>
                    {['Modificato il', 'Ingrediente', 'Vale da', 'Vecchio', 'Nuovo', 'Differenza'].map((h, i) => (
                      <th key={i} style={{ padding: '8px 12px', textAlign: i >= 3 ? 'right' : 'left', ...typo.caption, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}`, background: '#FDFAF7' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logPrezzi.slice(0, 50).map(l => (
                    <tr key={l.id} style={{ borderBottom: `1px solid ${C.border}` }}>
<td style={{ padding: '7px 12px', color: C.textMid, whiteSpace: 'nowrap' }}>
                        {new Date(l.data).toLocaleString('it-IT', { useGrouping: 'always', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        {/* Audit 2026-09-09: chi ha cambiato il prezzo non si
                            vedeva, e il campo `utente` era già nel log. Su un
                            dato che sposta il food cost di tutte le ricette,
                            sapere chi l'ha toccato serve. */}
                        {l.utente && (
                          <div style={{ ...typo.caption, color: C.textSoft, fontWeight: 400 }}>{String(l.utente).split('@')[0]}</div>
                        )}
                      </td>
                      {/* `capitalize` rompe le maiuscole vere: "FARINA 00"
                          diventava "Farina 00". Il nome resta come scritto. */}
                      <td style={{ padding: '7px 12px', fontWeight: 600, color: C.text }}>{l.ingrediente}</td>
                      {/* Da quando vale questo prezzo. Un prezzo con decorrenza
                          futura prima non si vedeva da nessuna parte: si poteva
                          impostare e dimenticare, e il food cost cambiava da
                          solo il giorno stabilito. */}
                      <td style={{ padding: '7px 12px', color: C.textMid, whiteSpace: 'nowrap' }}>
                        {(() => {
                          const da = l.decorre_da || l.data
                          if (!da) return '-'
                          const d = new Date(da)
                          if (isNaN(d.getTime())) return '-'
                          const futuro = d.getTime() > Date.now()
                          return (
                            <span style={{ color: futuro ? C.amber : C.textMid, fontWeight: futuro ? 700 : 400 }}>
                              {d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                              {futuro && ' (futuro)'}
                            </span>
                          )
                        })()}
                      </td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', color: C.textMid, ...TNUM }}>{(l.prezzoVecchio || 0).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/kg</td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700, color: C.text, ...TNUM }}>{(l.prezzoNuovo || 0).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/kg</td>
                      {/* `delta` può mancare nelle righe di log vecchie, e
                          `undefined.toLocaleString()` fa esplodere l'intera
                          scheda: una riga storica malformata portava via la
                          pagina, non solo la sua cella. */}
                      <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700, color: (l.delta || 0) > 0 ? C.red : C.green, ...TNUM }}>
                        {(l.delta || 0) > 0 ? '+' : ''}{(l.delta || 0).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        {Number.isFinite(Number(l.deltaPct)) && <span style={{ fontSize: 12, marginLeft: 4, opacity: 0.7 }}>({Number(l.deltaPct) > 0 ? '+' : ''}{fmtp(Number(l.deltaPct))})</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden', boxShadow: SHADOW_PREMIUM }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 480 }}>
            <thead>
              <tr style={{ background: '#F8F4F2' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', ...typo.caption, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}` }}>Ingrediente</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', ...typo.caption, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}` }}>Prezzo €/kg</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', ...typo.caption, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}`, width: 140 }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={3} style={{ padding: '40px 16px', textAlign: 'center', fontSize: 13, color: C.textSoft }}>
                  {search.trim() ? `Nessun ingrediente che corrisponde a "${search}".` : 'Nessun ingrediente disponibile.'}
                </td></tr>
              )}
              {visibleRows.map((row, i) => {
                const editing = editKey === row.key
                return (
                  <tr key={row.key} style={{ borderBottom: `1px solid ${C.border}`, background: editing ? '#FFF8F7' : i % 2 === 0 ? C.white : '#FDFAF7' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: C.text, textTransform: 'capitalize' }}>
                      {/* Nome + badge incolonnati: nome in colonna fissa 180px,
                          badge sempre alla stessa x indipendentemente dalla
                          lunghezza del nome. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ minWidth: 180, display: 'inline-block' }}>{row.nome}</span>
                        {/* Audit 2026-09-09: c'era un solo badge, "Prezzo da
                            impostare", e non distingueva il prezzo che hai
                            scritto tu da quello che il software ha preso dal
                            listino medio di mercato. Nel ricettario reale sono
                            6 prezzi veri su 422: senza il badge, 416
                            ingredienti sembravano tuoi. */}
                        {!row.haPrezzo && !row.isStima && <span style={{ fontSize: typo.small.fontSize, padding: '2px 7px', borderRadius: 4, background: C.amberLight, color: C.amber, fontWeight: 700, whiteSpace: 'nowrap' }}>Prezzo da impostare</span>}
                        {row.isStima && <span title="Prezzo medio di mercato, non il tuo: scrivilo qui per avere un food cost tuo." style={{ fontSize: typo.small.fontSize, padding: '2px 7px', borderRadius: 4, background: C.bgSubtle, color: C.textMid, fontWeight: 700, whiteSpace: 'nowrap', cursor: 'help' }}>stima di mercato</span>}
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: C.text, ...TNUM }}>
                      {editing ? (
                        <>
                        <input type="number" min="0" step="0.01" value={editVal}
                          onChange={e => setEditVal(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') tentaSalva(row)
                            if (e.key === 'Escape') cancelEdit()
                          }}
                          autoFocus
                          aria-label={`Prezzo per chilo di ${row.nome}`}
                          style={{ width: isMobile ? 116 : 96, padding: isMobile ? '9px 10px' : '6px 8px', minHeight: isMobile ? 44 : 32, borderRadius: 6, border: `1px solid ${C.red}`, fontSize: isMobile ? 16 : 13, fontWeight: 700, color: C.text, textAlign: 'right', outline: 'none' }}/>
                        {errEdit && (
                          <div style={{ fontSize: 12, color: C.red, marginTop: 4, textAlign: 'right', maxWidth: 200, lineHeight: 1.4 }}>{errEdit}</div>
                        )}
                        </>
                      ) : (
                        <span onClick={() => startEdit(row)} title="Clicca per modificare"
                          style={{ cursor: 'pointer', padding: '4px 8px', borderRadius: 5, display: 'inline-block' }}>
                          {row.prezzoKg > 0 ? `${row.prezzoKg.toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : '-'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {editing ? (
                        <>
                          <button onClick={() => tentaSalva(row)} style={{ padding: '8px 14px', minHeight: 40, borderRadius: 6, border: 'none', background: C.red, color: C.white, fontSize: 12, fontWeight: 800, cursor: 'pointer', marginRight: 4 }}>Salva</button>
                          <button onClick={cancelEdit} style={{ padding: '8px 12px', minHeight: 40, borderRadius: 6, border: `1px solid ${C.borderStr}`, background: 'transparent', fontSize: 12, fontWeight: 700, color: C.textMid, cursor: 'pointer' }}>Annulla</button>
                        </>
                      ) : (
                        <button onClick={() => startEdit(row)} style={{ padding: '8px 14px', minHeight: 40, borderRadius: 6, border: `1px solid ${C.borderStr}`, background: 'transparent', fontSize: 12, fontWeight: 700, color: C.textMid, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="edit" size={13} />Modifica</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {isPaginated && (
            <div style={{
              padding: '14px 18px', textAlign: 'center',
              borderTop: `1px solid ${C.border}`, background: '#FAFAF6',
            }}>
              <div style={{ fontSize: 12, color: C.textSoft, marginBottom: 8 }}>
                Mostrati <strong>{visibleRows.length}</strong> di <strong>{filtered.length}</strong> ingredienti.
              </div>
              <button onClick={() => setMaxVisible(m => m + 80)}
                style={{
                  padding: '0 20px', minHeight: 40, borderRadius: 8,
                  border: `1px solid ${C.borderStr}`, background: C.white,
                  fontSize: 12, fontWeight: 700, color: C.text, cursor: 'pointer',
                }}>
                Mostra altri 80
              </button>
            </div>
          )}
        </div>
      </div>

      {confirmKey && (() => {
        const row = ingredienti.find(i => i.key === confirmKey)
        if (!row) return null
        const delta = confirmVal - row.prezzoKg
        const deltaPct = row.prezzoKg > 0 ? (delta / row.prezzoKg * 100) : null
        // Audit 2026-09-09: la finestra non rispondeva a Invio ed Esc (tutte le
        // altre del prodotto lo fanno) e si chiudeva toccando lo sfondo anche
        // MENTRE il salvataggio era in corso, lasciando l'operazione a metà
        // senza dire com'era finita.
        return (
          <div role="dialog" aria-modal="true" aria-label="Conferma modifica prezzo"
            onKeyDown={e => {
              if (salvandoPrezzo) return
              if (e.key === 'Escape') { e.stopPropagation(); setConfirmKey(null) }
              if (e.key === 'Enter') { e.stopPropagation(); confermaSalva() }
            }}
            tabIndex={-1}
            ref={el => { if (el) el.focus() }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            onClick={() => { if (!salvandoPrezzo) setConfirmKey(null) }}>
            <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: 16, padding: 28, maxWidth: 420, width: '100%', boxShadow: '0 24px 60px rgba(15,23,42,0.3)' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 8 }}>Conferma modifica prezzo</div>
              <div style={{ fontSize: 13, color: C.textMid, marginBottom: 16, lineHeight: 1.55 }}>
                Sei sicuro di voler aggiornare il prezzo di <b style={{ color: C.text, textTransform: 'capitalize' }}>{row.nome}</b>?
              </div>
              <div style={{ background: '#F8F4F2', borderRadius: 10, padding: '14px 16px', marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: typo.small.fontSize, color: C.textSoft, fontWeight: 600 }}>Prezzo attuale</span>
                  <span style={{ fontSize: 14, color: C.textMid, ...TNUM, fontWeight: 700 }}>{row.prezzoKg.toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/kg</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: typo.small.fontSize, color: C.textSoft, fontWeight: 600 }}>Nuovo prezzo</span>
                  <span style={{ fontSize: 14, color: C.red, ...TNUM, fontWeight: 800 }}>{confirmVal.toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/kg</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTop: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: typo.small.fontSize, color: C.textSoft, fontWeight: 600 }}>Variazione</span>
                  {/* Audit 2026-09-09: `delta > 0 ? rosso : verde` colorava di
                      VERDE anche una variazione di zero, come se non cambiare
                      prezzo fosse un risparmio. E il rosso era quello del
                      marchio, che in questa pagina significa "azione", non
                      "allarme": per un prezzo che sale serve il rosso di
                      allarme. */}
                  <span style={{ fontSize: 13, color: delta > 0 ? C.red : delta < 0 ? C.green : C.textSoft, ...TNUM, fontWeight: 800 }}>
                    {delta > 0 ? '+' : ''}{delta.toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} € {deltaPct != null && <span style={{ fontSize: 12, marginLeft: 4, opacity: 0.85 }}>({deltaPct > 0 ? '+' : ''}{fmtp(deltaPct)})</span>}
                  </span>
                </div>
              </div>
              {/* Decorrenza: data da cui il prezzo entra in vigore */}
              <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ ...typo.caption, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  Decorrenza nuovo prezzo
                </div>
                <input type="date" value={confirmDecorre} onChange={e => setConfirmDecorre(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 7, border: `1px solid ${C.borderStr}`, fontSize: 13, color: C.text, background: C.white, outline: 'none' }}/>
                <div style={{ fontSize: 12, color: C.textSoft, marginTop: 6, lineHeight: 1.5 }}>
                  Il nuovo prezzo si applica dalla data scelta in poi. Le produzioni precedenti mantengono il <b>prezzo storico</b> per i calcoli P&amp;L.
                  Es. cambiando il prezzo dal <b>01/01</b>, le produzioni del 31/12 useranno ancora il prezzo vecchio.
                </div>
              </div>
              {deltaPct != null && Math.abs(deltaPct) > 50 && (
                <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 8, padding: '10px 12px', marginBottom: 16, fontSize: typo.small.fontSize, color: '#78350F', lineHeight: 1.5 }}>
                  <b style={{ display: 'inline-flex', alignItems: 'center', gap: 5, verticalAlign: 'middle' }}><Icon name="warning" size={12} />Variazione importante</b> - la modifica del {Math.abs(deltaPct).toFixed(0)}% influenzerà il food cost di tutte le ricette che usano questo ingrediente (a partire dalla decorrenza scelta).
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setConfirmKey(null)} disabled={salvandoPrezzo} style={{ padding: '0 18px', minHeight: 42, borderRadius: 8, border: `1px solid ${C.borderStr}`, background: 'transparent', fontSize: 12, fontWeight: 700, color: C.textMid, cursor: 'pointer' }}>Annulla</button>
                <button onClick={confermaSalva} disabled={salvandoPrezzo}
                  style={{ padding: '0 20px', minHeight: 42, borderRadius: 8, border: 'none', background: C.red, color: C.white, fontSize: 12, fontWeight: 800, cursor: salvandoPrezzo ? 'not-allowed' : 'pointer', opacity: salvandoPrezzo ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="check" size={13} />{salvandoPrezzo ? 'Salvo…' : 'Conferma e salva'}</button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── MagazzinoView (main) ────────────────────────────────────────────────────
export default function MagazzinoView({
  ricettario, magazzino, setMagazzino, logRif, setLogRif,
  logPrezzi = [], onUpdatePrezzoIng, giornaliero, notify,
  esclusi = new Set(), setEsclusi, onImportPrezzi, onImportPrezziOCR,
  orgId, sedeId, isDipendente = false, LEX = lessico(),
}) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const [tab, setTab] = useState('giacenze')
  // Toggle unità: 'kg' tutto kg (anche 0,80 kg), 'g' tutto grammi (28.000 g).
  // Default 'kg' che è il più comodo per ingredienti grandi (farine, latte).
  const [unitMode, setUnitMode] = useState('kg')
  const [deleteIngConf, setDeleteIngConf] = useState(null)
  const [deleteIngPin, setDeleteIngPin] = useState('')
  const [formIng, setFormIng] = useState('')
  // Audit 2026-06-22: focusQtyDeferred era riferito ai righi 870/948 ma definito
  // SOLO in ProdottiFinitiTab (scope diverso) → ReferenceError. Lo replico qui.
  const _focusTimerRef = useRef(null)
  useEffect(() => () => { if (_focusTimerRef.current) clearTimeout(_focusTimerRef.current) }, [])
  function focusQtyDeferred() {
    if (_focusTimerRef.current) clearTimeout(_focusTimerRef.current)
    _focusTimerRef.current = setTimeout(() => {
      try { document.getElementById('mag-qty-input')?.focus() } catch { /* skip */ }
      _focusTimerRef.current = null
    }, 100)
  }
  const [formQty, setFormQty] = useState('')
  const [formNote, setFormNote] = useState('')
  const [formMode, setFormMode] = useState('carico')
  // Audit 2026-09-09: il default era 'desc', e la scala degli stati va da
  // negativo=0 a ok=4: quindi la tabella si apriva con gli ingredienti a posto
  // in cima e gli ESAURITI in fondo, da scorrere. Chi apre il magazzino vuole
  // vedere per primo quello che manca.
  const { sort: sortMag, sortKey: magKey, sortDir: magDir, toggleSort: magToggle } = useSortable('stato', 'asc')

  // [15] Ricerca sulla tabella delle giacenze. La scheda Prezzi ce l'ha da
  // sempre; qui, con 35 ingredienti e oltre, non c'era modo di trovarne uno.
  const [magSearch, setMagSearch] = useState('')
  const [quickLoad, setQuickLoad] = useState(null)
  const [editSoglia, setEditSoglia] = useState(null)
  // La lista di riordino mostra le prime righe e non tutte.
  //
  // Non aveva alcun limite, e sta SOPRA la barra delle schede: con 56
  // ingredienti in magazzino (il caso reale di un'azienda in produzione) e
  // venti sotto soglia, la lista da sola fa 1.200px e spinge le schede e la
  // tabella fuori dallo schermo. Con cinquanta, oltre 3.000px: tre schermate
  // di scorrimento prima di poter cliccare una scheda.
  //
  // La lista serve per SAPERE COSA ORDINARE ADESSO, e quello lo dicono le
  // prime righe se sono ordinate per urgenza. Il totale della spesa resta
  // calcolato su TUTTE, altrimenti si ordinerebbe guardando un numero parziale.
  const [riordinoTutti, setRiordinoTutti] = useState(false)
  const RIORDINO_VISIBILI = 6
  const [showAddIng, setShowAddIng] = useState(false)
  const [newIngNome, setNewIngNome] = useState('')
  const [newIngQty, setNewIngQty] = useState('')
  const [newIngSoglia, setNewIngSoglia] = useState('')
  // Quante righe dello storico carichi si mostrano.
  const [logLimite, setLogLimite] = useState(50)
  const [saving, setSaving] = useState(false)

  // ESC chiude il modal di delete (UX coerente con ProduzioneGiornalieraView).
  useEffect(() => {
    if (!deleteIngConf) return
    const onKey = (e) => {
      if (e.key === 'Escape') { setDeleteIngConf(null); setDeleteIngPin('') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteIngConf])

  // ssave locale che usa orgId/sedeId props (sostituisce la wrapper Dashboard.jsx)
  const ssave = (key, val) => _ssave(key, val, orgId, sedeId)

  const handleDeleteIng = async (k) => {
    if (saving) return // evita doppia esecuzione su Enter+click
    const nm = { ...magazzino }
    // Da quando le righe sono aggregate per chiave canonica, `k` è la chiave
    // canonica: cancellare solo `nm[k]` lascerebbe in vita la voce salvata col
    // nome vecchio ("uova" quando la riga si chiama "uovo") e l'ingrediente
    // ricomparirebbe col suo stock al primo ricaricamento.
    for (const raw of Object.keys(nm)) {
      if (raw === k || normIng(raw) === k) delete nm[raw]
    }
    const nuoviEsclusi = new Set(esclusi)
    nuoviEsclusi.add(k)
    // SAVE FIRST: muto lo state solo dopo che entrambe le scritture sono persistite,
    // altrimenti l'ingrediente sparisce dall'UI ma resta nel DB (riappare al refresh).
    setSaving(true)
    try {
      await ssave(SK_MAG, nm)
      await ssave(SK_EXCL, [...nuoviEsclusi])
    } catch (e) {
      console.error('[magazzino] eliminazione:', e)
      notify('Non ho potuto eliminare: la voce è ancora al suo posto. Riprova', false)
      setSaving(false)
      return
    }
    setMagazzino(nm)
    if (setEsclusi) setEsclusi(nuoviEsclusi)
    setDeleteIngConf(null); setDeleteIngPin('')
    setSaving(false)
    notify('Ingrediente eliminato dal magazzino')
  }

  // ── Il magazzino, riaggregato per chiave canonica ─────────────────────────
  //
  // BUG in produzione, trovato il 7/09 e verificato sui dati reali.
  //
  // Le ricette passavano da `normIng`, il magazzino no. `normIng` porta i
  // plurali al singolare — "uova" → "uovo", "nocciole" → "nocciola" — quindi
  // l'unione dei due elenchi produceva DUE righe per lo stesso ingrediente:
  // quella vera con la giacenza, sotto la chiave salvata, e un fantasma a
  // "0,000 kg" marcato ESAURITO sotto la chiave canonica.
  //
  // Su "Gelateria Demo": 5 chiavi su 35 non canoniche (uova, noci, nocciole,
  // mirtilli, mandorle) e le ricette che le usano al plurale. Quattro righe
  // fantasma, il contatore "critici" che le contava, il banner rosso che si
  // accendeva per merce che c'era in magazzino, e la lista di riordino che
  // suggeriva di comprare uova già presenti.
  //
  // Terzo danno, meno visibile: `buildIngCosti` indicizza i prezzi con
  // `normIng`, quindi la riga vera — chiave "uova" — non trovava il suo
  // prezzo. Valore a colonna vuota e valore totale del magazzino sottostimato.
  //
  // Si aggrega in lettura invece di riscrivere il database: i dati storici di
  // chiunque restano validi senza una migrazione, e le scritture nuove sono
  // già canoniche (`handleCarica`, `handleAddIngrediente` e l'OCR passano
  // tutte da `normIng`).
  const magPerNorm = useMemo(() => {
    const out = {}
    for (const [raw, v] of Object.entries(magazzino || {})) {
      const k = normIng(raw)
      const acc = out[k] || { giacenza_g: 0, soglia_g: 0, nome: null, ultimoRifornimento: null, chiaviRaw: [] }
      acc.giacenza_g += Number(v?.giacenza_g) || 0
      // La soglia non si somma: è un livello, non una quantità.
      acc.soglia_g = Math.max(acc.soglia_g, Number(v?.soglia_g) || 0)
      // Come nome si preferisce quello scritto dall'utente, e fra due si tiene
      // quello della chiave canonica.
      if (!acc.nome || raw === k) acc.nome = v?.nome || raw
      const u = v?.ultimoRifornimento
      if (u && (!acc.ultimoRifornimento || String(u) > String(acc.ultimoRifornimento))) acc.ultimoRifornimento = u
      acc.chiaviRaw.push(raw)
      out[k] = acc
    }
    return out
  }, [magazzino])

  const tuttiIngNomi = useMemo(() => {
    const fromRic = new Set()
    for (const ric of Object.values(ricettario?.ricette || {})) {
      for (const ing of (ric.ingredienti || [])) fromRic.add(normIng(ing.nome))
    }
    const fromMag = new Set(Object.keys(magPerNorm))
    return [...new Set([...fromRic, ...fromMag])].filter(k => !esclusi.has(k)).sort()
  }, [ricettario, magPerNorm, esclusi])

  const { fabb: fabbisogno, stimato: consumoStimato, giorniStorico } = useMemo(
    () => calcolaFabbisognoSettimana(ricettario, giornaliero), [ricettario, giornaliero])

  // Mappa costi €/kg (€/g): prezzi utente (ingredienti_costi) con fallback HORECA.
  // Serve a valorizzare la giacenza (valore stock €) - sola lettura, non scrive nulla.
  const ingCosti = useMemo(() => buildIngCosti(ricettario?.ingredienti_costi), [ricettario])

  // Copertura target per il suggerimento di riordino: porta la scorta a coprire
  // ~14 giorni di consumo (2 cicli settimanali), arrotondando a step pratici.
  const GIORNI_TARGET = 14

  const righe = tuttiIngNomi.map(k => {
    const m = magPerNorm[k] || {}
    // La voce esiste in magazzino? Serve per distinguere "finito" da "mai
    // contato": sono due situazioni diverse e chiedono due azioni diverse.
    const inMagazzino = !!magPerNorm[k]
    const giacenza = m.giacenza_g || 0
    const soglia = m.soglia_g || 0
    const fabb = fabbisogno[k] || 0
    const consumoG = fabb / 7
    const giorniScorta = consumoG > 0 ? giacenza / consumoG : null
    const stato =
      // Una giacenza NEGATIVA è un errore di registrazione, non uno stato di
      // scorta. Prima cadeva fuori da tutta la catena: `giacenza === 0` è
      // un'uguaglianza stretta, quindi −500 non era "esaurito"; con soglia 0
      // saltava anche il ramo della soglia; e senza storico di consumo
      // arrivava a 'ok' — verde, e non contata da nessun contatore. La scheda
      // Prodotti finiti ha da sempre un KPI "Stock negativo": le materie prime
      // non avevano niente.
      giacenza < 0 ? 'negativo' :
      // Audit 2026-09-09: `giacenza === 0` non distingue "finito" da "mai
      // contato". Un ingrediente che sta nel ricettario ma non è mai stato
      // inventariato ha giacenza 0 perché nessuno l'ha pesato, e la pagina lo
      // dichiarava ESAURITO in rosso. Nel magazzino reale di Mara sono 40
      // ingredienti su 48: l'allarme era sempre acceso, quindi non voleva dire
      // niente e copriva i tre che erano davvero finiti.
      !inMagazzino ? 'mai_contato' :
      giacenza === 0 ? 'esaurito' :
      soglia > 0 && giacenza <= soglia ? 'critico' :
      giorniScorta !== null && giorniScorta < 3 ? 'critico' :
      giorniScorta !== null && giorniScorta < 7 ? 'attenzione' :
      'ok'
    // Valore a magazzino: giacenza (g) × costo (€/g). costoG può mancare → 0.
    const costoG = ingCosti[k]?.costoG || 0
    const costoKg = ingCosti[k]?.costoKg || 0
    // Se il prezzo non l'ha inserito l'utente, `buildIngCosti` ripiega su una
    // stima HORECA. Finora la tabella mostrava le due cose allo stesso modo:
    // il valore a magazzino mescolava prezzi veri e prezzi indovinati senza
    // dirlo, e un numero inventato presentato come misurato e' peggio di un
    // numero assente.
    const prezzoStimato = !!ingCosti[k]?.isStima
    const valore = giacenza * costoG
    // Suggerimento riordino (g): copri GIORNI_TARGET di consumo + rispetta la soglia,
    // sottrai la giacenza. Se non c'è storico consumo usiamo la soglia come riferimento.
    const targetG = Math.max(consumoG * GIORNI_TARGET, soglia > 0 ? soglia * 1.5 : 0)
    const riordinoG = targetG > giacenza ? targetG - giacenza : 0
    return { k, nome: m.nome || k, giacenza, soglia, fabb, consumoG, giorniScorta, stato, ultimoRif: m.ultimoRifornimento, valore, costoG, costoKg, prezzoStimato, riordinoG }
  })

  const critici = righe.filter(r => r.stato === 'critico' || r.stato === 'esaurito')
  const attenzione = righe.filter(r => r.stato === 'attenzione')
  // Esaurito e sotto soglia non sono la stessa cosa, e trattarli uguale era il
  // difetto: la pagina si apriva in allarme rosso perché qualche ingrediente
  // aveva toccato la soglia di riordino. Ma toccare la soglia e' il sistema che
  // funziona — la soglia esiste per dire "ordina" — mentre a zero non si
  // produce. Un allarme che suona nella condizione normale di una cucina ben
  // gestita insegna a spegnere l'allarme.
  // Righe visibili dopo la ricerca. I contatori sopra restano su TUTTE le righe:
  // sono la diagnosi del magazzino, non del filtro.
  const righeFiltrate = magSearch.trim()
    ? righe.filter(r => (r.nome || '').toLowerCase().includes(magSearch.trim().toLowerCase()))
    : righe

  const esauriti = righe.filter(r => r.stato === 'esaurito')
  const sottoSoglia = righe.filter(r => r.stato === 'critico')
  const negativi = righe.filter(r => r.stato === 'negativo')
  // Ingredienti che stanno nelle ricette ma non sono mai stati inventariati.
  // Prima finivano fra gli "esauriti" e li rendevano inutili: nel magazzino
  // reale di Mara sono 40 su 48, quindi l'allarme era sempre acceso.
  const maiContati = righe.filter(r => r.stato === 'mai_contato')

  // ── Diagnosi aggregata (banda premium) ─────────────────────────────────────
  const valoreStock = righe.reduce((s, r) => s + (r.valore || 0), 0)
  // Copertura: MEDIANA, non media, e il colore lo decide il caso peggiore.
  //
  // La media dei giorni di scorta è un numero che non appartiene a nessun
  // ingrediente: una spezia comprata in busta grande può avere 400 giorni di
  // copertura e tirare su la media da sola, colorando la tessera di verde
  // mentre la farina finisce domani. La mediana descrive l'ingrediente tipico;
  // il colore guarda quanti sono sotto i tre giorni, che è la domanda vera.
  const conCopertura = righe.filter(r => r.giorniScorta !== null)
  const coperturaMedia = conCopertura.length > 0
    ? (() => {
      const ord = conCopertura.map(r => r.giorniScorta).sort((a, b) => a - b)
      const mid = Math.floor(ord.length / 2)
      return ord.length % 2 ? ord[mid] : (ord[mid - 1] + ord[mid]) / 2
    })()
    : null
  const sottoTreGiorni = conCopertura.filter(r => r.giorniScorta < 3).length
  // Rosso SOLO per gli esauriti, che fermano la produzione. Sotto soglia e' una
  // lista della spesa: informativa, non un allarme.
  const salute = (negativi.length > 0 || esauriti.length > 0) ? 'critico'
    : (sottoSoglia.length > 0 || attenzione.length > 0) ? 'attenzione'
    : 'ok'

  const handleCarica = async () => {
    if (saving) return
    if (!formIng || !formQty) return
    const k = normIng(formIng.toLowerCase().trim())
    // Audit 2026-07-01 MEDIUM: locale IT usa la virgola decimale.
    const qty = parseFloat(String(formQty).replace(',', '.'))
    if (!(qty > 0)) { notify('Inserisci una quantità maggiore di 0', false); return }
    const now = new Date().toISOString()
    // La giacenza di partenza si legge dall'AGGREGATO, non dal dizionario grezzo.
    //
    // Bug confermato nell'audit: la tabella legge da `magPerNorm` (che unisce
    // le chiavi vecchie con quelle canoniche), questa funzione leggeva
    // `magazzino[k]`. Su un ingrediente salvato come "uova" il clic rapido
    // dalla tabella precompila "uova", `normIng` lo porta a "uovo",
    // `magazzino["uovo"]` non esiste e la giacenza di partenza risulta ZERO:
    // uno scarico di 500 g su 4,8 kg in magazzino diventava "-500 g" con tanto
    // di falso allarme "scarico maggiore della giacenza".
    const gruppo = magPerNorm[k] || {}
    const attuale = gruppo.giacenza_g || 0
    const delta = formMode === 'scarico' ? -qty : qty
    // Audit 2026-07-01 HIGH: NON clampare a 0. Allineato a scaloMagazzinoPerGusto
    // che ammette negativi proprio per tracciare deficit reali - il clamp
    // silenzioso cancellava l'overshoot dal log (info forensicamente persa).
    const nuova = attuale + delta
    // In scrittura si CONSOLIDA il gruppo su una chiave sola, come fa
    // handleDeleteIng: altrimenti la voce vecchia resterebbe con il suo stock e
    // il totale si sdoppierebbe di nuovo alla lettura successiva.
    const nm = { ...magazzino }
    for (const raw of (gruppo.chiaviRaw || [])) delete nm[raw]
    nm[k] = {
      nome: gruppo.nome || formIng.trim(),
      giacenza_g: nuova,
      soglia_g: gruppo.soglia_g || 0,
      ultimoRifornimento: now,
    }
    const logEntry = { id: `r-${Date.now()}`, data: now, ingrediente: formIng.trim(), quantita_g: formMode === 'scarico' ? -qty : qty, note: formNote || (formMode === 'scarico' ? 'scarico manuale' : '') }
    const log = [logEntry, ...(logRif || [])]
    // SAVE FIRST: se ssave fallisce non vogliamo state desincronizzato dal DB.
    setSaving(true)
    try {
      await ssave(SK_MAG, nm); await ssave(SK_LOGRIF, log)
    } catch (e) {
      console.error('[magazzino] salvataggio giacenze:', e); notify('Non ho potuto salvare il magazzino: le giacenze non sono cambiate. Riprova', false)
      setSaving(false)
      return
    }
    setMagazzino(nm); setLogRif(log)
    // UN SOLO messaggio, e in italiano.
    //
    // Due bug confermati, insieme. Primo: l'avviso "scarico maggiore della
    // giacenza" veniva emesso prima del salvataggio e poi CANCELLATO dal toast
    // di successo, perché notify ha uno slot unico — l'utente non vedeva mai
    // che era andato sotto zero. Secondo: i numeri erano interpolati nudi, così
    // un carico di 25 kg si leggeva "+25000g" e un residuo di calcolo poteva
    // uscire come "-0.09999999999999998g". Ora passano da fmtG, che mette il
    // separatore delle migliaia e rispetta il toggle kg/g della pagina.
    const segno = formMode === 'scarico' ? '−' : '+'
    const testo = `${segno}${fmtG(qty)} di ${gruppo.nome || formIng} · in magazzino ora ${fmtG(nuova)}`
    if (nuova < 0) {
      notify(`${testo}. Attenzione: la giacenza è andata sotto zero, quindi da qualche parte manca una registrazione.`, false)
    } else {
      notify(testo)
    }
    // Audit 2026-09-09: il modo (carico / scarico) restava impostato dopo il
    // salvataggio. Chi registrava uno scarico e poi caricava della merce nuova
    // trovava il form ancora su "scarico" e sottraeva invece di aggiungere,
    // senza accorgersene: il campo si svuota e l'unico segnale del modo e' il
    // bordo ambra dell'input. Il carico e' l'operazione normale, quindi il
    // form torna li'.
    setFormIng(''); setFormQty(''); setFormNote(''); setQuickLoad(null); setFormMode('carico')
    setSaving(false)
  }

  // Propone la soglia di riordino a TUTTE le voci che non ce l'hanno.
  //
  // Serve perché nel magazzino del design partner le soglie sono zero su nove
  // voci: con soglia zero l'avviso "sotto soglia" non scatta mai, e la lista
  // della spesa resta vuota anche quando la farina è agli sgoccioli. Metterle
  // a mano vuol dire aprire ogni riga.
  //
  // La soglia proposta è una SETTIMANA di consumo: è il tempo che serve per
  // accorgersene e ordinare, con i tempi di consegna tipici di un fornitore
  // alimentare. Si arrotonda a passi pratici (100 g sotto il chilo, 500 g
  // sopra) perché una soglia di 1.347 g non la scrive nessuno.
  const arrotondaSoglia = (g) => {
    if (g <= 0) return 0
    if (g < 1000) return Math.max(100, Math.round(g / 100) * 100)
    return Math.round(g / 500) * 500
  }
  const sogliePropose = useMemo(
    () => righe
      .filter(r => r.soglia <= 0 && r.consumoG > 0)
      .map(r => ({ k: r.k, nome: r.nome, soglia: arrotondaSoglia(r.consumoG * 7), consumoG: r.consumoG }))
      .filter(r => r.soglia > 0),
    [righe],
  )

  // Primo inventario: contare in una volta tutto quello che non è mai stato
  // contato.
  //
  // Nel magazzino del design partner sono 40 ingredienti su 48. Finché non
  // hanno una giacenza, la pagina non sa dire cosa sta finendo, gli ordini
  // suggeriti non partono e il valore a magazzino è una frazione del vero.
  // Aggiungerli uno per uno vuol dire quaranta volte apri-scrivi-salva:
  // nessuno lo fa, ed è per questo che sono ancora quaranta.
  const [inventarioAperto, setInventarioAperto] = useState(false)
  const [conteggi, setConteggi] = useState({})   // chiave → quantità digitata

  const salvaPrimoInventario = async () => {
    if (saving) return
    const daScrivere = Object.entries(conteggi)
      .map(([k, v]) => [k, parseFloat(String(v).replace(',', '.'))])
      .filter(([, q]) => Number.isFinite(q) && q >= 0)
    if (daScrivere.length === 0) {
      notify('Scrivi almeno una quantità', false)
      return
    }
    setSaving(true)
    const nm = { ...magazzino }
    for (const [k, qtaKg] of daScrivere) {
      const riga = righe.find(r => r.k === k)
      // Si scrive in GRAMMI, come tutto il magazzino: l'utente digita i chili
      // perché è così che si pesa in laboratorio.
      nm[k] = {
        ...(magazzino?.[k] || {}),
        nome: riga?.nome || k,
        giacenza_g: Math.round(qtaKg * 1000),
        ultimoRifornimento: new Date().toISOString(),
      }
    }
    try {
      await ssave(SK_MAG, nm)
    } catch (e) {
      console.error('[magazzino] primo inventario:', e)
      notify('Non ho potuto salvare il conteggio. Riprova', false)
      setSaving(false)
      return
    }
    setMagazzino(nm)
    setConteggi({})
    setSaving(false)
    const rimasti = maiContati.length - daScrivere.length
    notify(`${daScrivere.length === 1 ? 'Un ingrediente contato' : `${daScrivere.length} ingredienti contati`}.` +
      (rimasti > 0 ? ` Ne restano ${rimasti}: puoi finire quando vuoi.` : ' Il magazzino è completo.'))
    if (rimasti <= 0) setInventarioAperto(false)
  }

  const applicaSogliePropose = async () => {
    if (saving || sogliePropose.length === 0) return
    setSaving(true)
    const nm = { ...magazzino }
    for (const p of sogliePropose) {
      // Come handleSoglia: si scrivono TUTTE le grafie del nome sotto cui la
      // voce è salvata, altrimenti la soglia finisce su una chiave che nessuno
      // legge.
      const grezze = magPerNorm[p.k]?.chiaviRaw?.length ? magPerNorm[p.k].chiaviRaw : [p.k]
      for (const raw of grezze) {
        nm[raw] = { ...(magazzino?.[raw] || {}), soglia_g: p.soglia }
      }
    }
    try {
      await ssave(SK_MAG, nm)
    } catch (e) {
      console.error('[magazzino] soglie proposte:', e)
      notify('Non ho potuto salvare le soglie. Riprova', false)
      setSaving(false)
      return
    }
    setMagazzino(nm)
    setSaving(false)
    notify(`${sogliePropose.length === 1 ? 'Una soglia impostata' : `${sogliePropose.length} soglie impostate`}: da adesso ti avviso quando un ingrediente sta per finire.`)
  }

  const handleSoglia = async (k, val) => {
    // Audit 2026-07-01 MEDIUM: saving guard per race su doppio Enter rapido.
    if (saving) return
    // La soglia si scrive su TUTTE le chiavi grezze di questa riga, come fa
    // handleDeleteIng.
    //
    // Bug confermato nell'audit del 7/09. `k` e' la chiave canonica, ma
    // `magazzino` e' indicizzato con le chiavi come sono state salvate. Su una
    // riga che in archivio si chiama "uova" (canonica: "uovo") scrivere su
    // `nm['uovo']` creava una voce NUOVA e lasciava la vecchia soglia intatta:
    // poi l'aggregazione in lettura fa `Math.max` fra le due, quindi abbassare
    // la soglia non aveva alcun effetto e l'avviso di riordino continuava a
    // suonare. Senza un messaggio, senza modo di accorgersene.
    //
    // Toccava anche `nome: k`, che riscriveva l'etichetta dell'utente con lo
    // slug minuscolo: "Cioccolato Fondente 70%" diventava "cioccolato fondente".
    const grezze = magPerNorm[k]?.chiaviRaw?.length ? magPerNorm[k].chiaviRaw : [k]
    const sogliaG = parseFloat(String(val).replace(',', '.')) || 0
    const nm = { ...magazzino }
    for (const raw of grezze) {
      nm[raw] = { ...(magazzino?.[raw] || {}), soglia_g: sogliaG }
    }
    setSaving(true)
    try {
      await ssave(SK_MAG, nm)
    } catch (e) {
      console.error('[magazzino] soglia:', e); notify('Non ho potuto salvare la soglia. Riprova', false)
      setSaving(false)
      return
    }
    setMagazzino(nm)
    setEditSoglia(null)
    setSaving(false)
  }

  const handleAddIngrediente = async () => {
    if (saving) return
    // Audit 2026-09-09: `if (!newIngNome) return` lascia passare una stringa di
    // soli spazi, che normIng riduce a '' — e nasceva una voce di magazzino
    // senza nome, impossibile da trovare e da eliminare dalla lista.
    if (!newIngNome || !newIngNome.trim()) {
      notify('Scrivi il nome dell\'ingrediente', false)
      return
    }
    const k = normIng(newIngNome)
    if (!k) {
      notify('Questo nome non è utilizzabile: scrivi almeno una lettera', false)
      return
    }
    // Se l'ingrediente è GIÀ in magazzino non si tocca.
    //
    // Bug confermato nell'audit del 7/09: questa riga sovrascriveva la voce
    // intera, quindi digitare "burro" quando in magazzino ce n'erano 3 kg
    // azzerava giacenza e soglia — silenziosamente, e senza modo di tornare
    // indietro. Chi vuole aggiungere merce a un ingrediente che ha già usa
    // "Carica merce", ed e' giusto dirglielo invece di cancellargli lo stock.
    //
    // Il controllo passa da magPerNorm e non da magazzino: così riconosce
    // anche la voce salvata col nome vecchio ("uova" quando si digita "uovo").
    if (magPerNorm[k]) {
      const nomeVisto = magPerNorm[k].nome || k
      notify(`${nomeVisto} è già in magazzino. Per aggiungerne usa "Carica merce", così la giacenza si somma invece di essere riscritta.`, false)
      return
    }
    const nm = { ...magazzino, [k]: { nome: newIngNome.trim(), giacenza_g: parseFloat(newIngQty) || 0, soglia_g: parseFloat(newIngSoglia) || 0, ultimoRifornimento: new Date().toISOString() } }
    setSaving(true)
    try {
      await ssave(SK_MAG, nm)
    } catch (e) {
      console.error('[magazzino] nuovo ingrediente:', e)
      notify('Non ho potuto aggiungere l’ingrediente. Riprova', false)
      setSaving(false)
      return
    }
    setMagazzino(nm)
    if (esclusi.has(k)) {
      const nuoviEsclusi = new Set(esclusi)
      nuoviEsclusi.delete(k)
      try { await ssave(SK_EXCL, [...nuoviEsclusi]) } catch { /* low impact */ }
      if (setEsclusi) setEsclusi(nuoviEsclusi)
    }
    notify(newIngNome + ' aggiunto al magazzino')
    setShowAddIng(false); setNewIngNome(''); setNewIngQty(''); setNewIngSoglia('')
    setSaving(false)
  }

  // Il rosso resta all'esaurito. "Da ordinare" prende l'ambra: va visto, non
  // temuto. Prima erano lo stesso rosso, e con mezza dispensa sotto soglia la
  // tabella diventava un muro d'allarme in cui l'unico ingrediente finito
  // davvero non si distingueva più dagli altri.
  // 'mai_contato' e' grigio, non rosso: non e' un allarme ma un'informazione.
  // Nel magazzino reale di Mara sono 40 ingredienti su 48, e quando l'allarme
  // e' sempre acceso copre i tre che sono davvero finiti.
  const statoColor = s => s === 'negativo' ? C.red : s === 'mai_contato' ? C.textSoft : s === 'esaurito' ? C.red : s === 'critico' ? C.amber : s === 'attenzione' ? C.textMid : C.green
  const statoBg = s => s === 'negativo' ? C.redLight : s === 'mai_contato' ? C.bgSubtle : s === 'esaurito' ? C.redLight : s === 'critico' ? C.amberLight : s === 'attenzione' ? C.bgSubtle : C.greenLight
  // "Critico" per un ingrediente che ha toccato la soglia di riordino e' la
  // parola sbagliata: la soglia esiste proprio per dire quando ordinare, e
  // arrivarci non e' una crisi. "Da ordinare" dice la stessa cosa e dice anche
  // cosa fare. "Esaurito" resta forte, perché a zero non si produce.
  const statoLabel = s => s === 'negativo' ? 'Da correggere' : s === 'mai_contato' ? 'Mai contato' : s === 'esaurito' ? 'Esaurito' : s === 'critico' ? 'Da ordinare' : s === 'attenzione' ? 'In calo' : 'OK'
  // fmtG: rispetta unitMode utente. 'kg' -> sempre kg (anche piccoli, "0,80 kg").
  // 'g' -> sempre grammi (anche grandi, "28.000 g"). Niente piu mix.
  const fmtG = g => {
    const n = Number(g) || 0
    if (unitMode === 'g') return `${Math.round(n).toLocaleString('it-IT', { useGrouping: 'always' })} g`
    return `${(n / 1000).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: n >= 1000 ? 2 : 3, maximumFractionDigits: n >= 1000 ? 2 : 3 })} kg`
  }
  // Suggerimento riordino arrotondato a step pratici: <1kg → step 100g, ≥1kg → 0,5kg.
  // Il suggerimento di riordino si arrotonda a passi pratici (100 g sotto il
  // chilo, mezzo chilo sopra) e POI si formatta come tutto il resto della
  // pagina. Prima decideva l'unità da solo ignorando il toggle kg/g: nella
  // stessa riga si leggeva "28.000 g" di giacenza e "~ 1,5 kg" da ordinare, e
  // per capire se bastava bisognava fare la conversione a mente.
  // Fornitore di un ingrediente, letto dal listino del ricettario.
  const fornitorePerNome = (nome) => fornitoreDiIngrediente(ricettario?.ingredienti_costi, nome)?.nome || null

  // Giorni di scorta leggibili: un tetto a 90 giorni (oltre non dice niente
  // di utile e "2000 gg" occupa mezza colonna), il punto delle migliaia, e
  // una sola convenzione per "circa" — il tilde DAVANTI al numero, come nella
  // colonna "Da ordinare" qui accanto. Prima in una riga si leggeva
  // "2000 gg ~" e nella cella successiva "~ 1,5 kg".
  const fmtGiorniScorta = (gg, stimato) => {
    if (gg == null) return '-'
    const n = Math.round(gg)
    if (n > 90) return stimato ? '~ oltre 90 gg' : 'oltre 90 gg'
    const testo = `${n.toLocaleString('it-IT', { useGrouping: 'always' })} gg`
    return stimato ? `~ ${testo}` : testo
  }

  const fmtRiordino = g => {
    if (!(g > 0)) return null
    const arrotondato = g < 1000
      ? Math.ceil(g / 100) * 100
      : Math.ceil((g / 1000) * 2) / 2 * 1000
    return fmtG(arrotondato)
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      <PageHeader
        subtitle={[
          `${tuttiIngNomi.length} ingredienti`,
          negativi.length > 0 ? `${negativi.length} sotto zero` : null,
          esauriti.length > 0 ? `${esauriti.length} a zero` : null,
          sottoSoglia.length > 0 ? `${sottoSoglia.length} da ordinare` : null,
        ].filter(Boolean).join(' · ')}
        action={onImportPrezzi && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px',
            background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R.md, cursor: 'pointer', boxShadow: S.sm }}>
            <Icon name="upload" size={14} color={T.textMid} />
            <span style={{ fontSize: 13, fontWeight: 500, color: T.textMid }}>Importa prezzi</span>
            <input type="file" accept=".xlsx,.xls,.csv" multiple style={{ display: 'none' }} onChange={e => e.target.files.length && onImportPrezzi(e.target.files)}/>
          </label>
        )}
      />

      {/* ── BANDA DIAGNOSI (premium): valore stock, critici, esaurimento, copertura ── */}
      <div style={{ marginBottom: 18 }}>
        {(() => {
          const nIng = (n) => `${n} ${n === 1 ? 'ingrediente' : 'ingredienti'}`
          const sem = salute === 'critico'
            ? negativi.length > 0
              ? { col: C.red, bg: 'rgba(220,38,38,0.10)', lbl: negativi.length === 1 ? 'Una giacenza è sotto zero' : 'Giacenze sotto zero', ic: 'alert' }
              : { col: C.red, bg: 'rgba(220,38,38,0.10)', lbl: esauriti.length === 1 ? 'Un ingrediente è finito' : 'Ingredienti finiti', ic: 'alert' }
            : salute === 'attenzione'
            ? { col: C.textMid, bg: T.bgSubtle, lbl: 'Da mettere in lista', ic: 'cart' }
            : { col: C.green, bg: 'rgba(22,163,74,0.12)', lbl: 'Scorte in equilibrio', ic: 'checkCircle' }
          const msg = salute === 'critico'
            // A zero non si produce, sotto zero c'è una registrazione mancante:
            // in entrambi i casi l'allarme è dovuto.
            ? negativi.length > 0
              ? `${nIng(negativi.length)} con giacenza negativa: da qualche parte manca una registrazione di carico.${esauriti.length > 0 ? ` E ${esauriti.length} a zero.` : ''}`
              : `${nIng(esauriti.length)} a zero${sottoSoglia.length > 0 ? ` · ${sottoSoglia.length} sotto la soglia di riordino` : ''}.`
            : salute === 'attenzione'
            ? [
                sottoSoglia.length > 0 ? `${nIng(sottoSoglia.length)} ${sottoSoglia.length === 1 ? 'ha' : 'hanno'} toccato la soglia di riordino` : null,
                attenzione.length > 0 ? `${nIng(attenzione.length)} ${attenzione.length === 1 ? 'scenderà' : 'scenderanno'} sotto scorta entro la settimana` : null,
              ].filter(Boolean).join(' · ') + '. Niente di rotto: è la lista della spesa.'
            : 'Le giacenze coprono il fabbisogno previsto.'
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', marginBottom: 14,
              background: sem.bg, border: `1px solid ${sem.col}33`, borderRadius: 14 }}>
              <span style={{ width: 30, height: 30, borderRadius: '50%', background: sem.col, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={sem.ic} size={16} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: sem.col, letterSpacing: '-0.01em' }}>{sem.lbl}</div>
                <div style={{ fontSize: 12, color: T.textMid, marginTop: 1 }}>{msg}</div>
              </div>
            </div>
          )
        })()}

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : isTablet ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 10 }}>
          <KPI icon={<Icon name="money" size={18} />} label="Valore a magazzino" value={fmt0(valoreStock)} highlight
            sub={(() => {
              const conValore = righe.filter(r => r.valore > 0)
              const stimati = conValore.filter(r => r.prezzoStimato).length
              const senza = righe.length - conValore.length
              const parti = [`${conValore.length} su ${righe.length} valorizzati`]
              // Quanto di questo numero e' misurato e quanto indovinato.
              if (stimati > 0) parti.push(`${stimati} a prezzo stimato`)
              else if (senza > 0) parti.push(`${senza} senza prezzo`)
              return parti.join(' · ')
            })()}/>
          <KPI icon={<Icon name={esauriti.length > 0 ? 'alert' : 'cart'} size={18} />}
            label={esauriti.length > 0 ? 'A zero' : 'Da ordinare'}
            value={esauriti.length > 0 ? esauriti.length : sottoSoglia.length}
            color={esauriti.length > 0 ? C.red : sottoSoglia.length > 0 ? C.amber : C.green}
            sub={critici.length > 0
              ? 'clicca per vedere cosa ordinare'
              : maiContati.length > 0
                // Dire "tutto ok" quando 40 ingredienti su 48 non sono mai stati
                // pesati e' una rassicurazione senza fondamento: il magazzino non
                // e' a posto, e' vuoto di informazioni.
                ? `${maiContati.length} ${maiContati.length === 1 ? 'ingrediente' : 'ingredienti'} da inventariare`
                : 'tutto ok'}
            onClick={critici.length > 0 ? () => {
              const el = document.getElementById('riordino-urgente')
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
            } : undefined}/>
          <KPI icon={<Icon name="warning" size={18} />} label="In esaurimento" value={attenzione.length}
            color={attenzione.length > 0 ? C.amber : C.green}
            sub={attenzione.length > 0 ? 'clicca per vedere quali' : 'ok'}
            onClick={attenzione.length > 0 ? () => {
              const el = document.getElementById('riordino-urgente')
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
            } : undefined}/>
          <KPI icon={<Icon name="clock" size={18} />} label="Copertura tipica"
            value={coperturaMedia !== null ? `${coperturaMedia.toFixed(0)} gg` : '-'}
            color={coperturaMedia === null ? undefined : sottoTreGiorni > 0 ? C.red : coperturaMedia < 7 ? C.amber : C.green}
            sub={coperturaMedia === null
              ? 'storico assente'
              : sottoTreGiorni > 0
                ? `${sottoTreGiorni} sotto i 3 giorni`
                : 'giorni di scorta, ingrediente tipico'}/>
        </div>
      </div>

      {/* ── RIORDINO URGENTE (azionabile): cosa ordinare e quanto ── */}
      {(critici.length > 0 || attenzione.length > 0) && (() => {
        const peso = { esaurito: 0, critico: 1, attenzione: 2 }
        const daRiordinare = [...critici, ...attenzione]
          .filter(r => r.riordinoG > 0)
          // Prima per stato, poi per giorni di scorta rimasti: fra due
          // ingredienti sotto soglia va ordinato prima quello che finisce
          // domani, non quello che viene prima in ordine alfabetico. Chi non
          // ha uno storico di consumo (giorniScorta null) va in fondo al suo
          // gruppo: non si sa quando finirà.
          .sort((a, b) => {
            const ds = (peso[a.stato] ?? 3) - (peso[b.stato] ?? 3)
            if (ds !== 0) return ds
            const ga = a.giorniScorta == null ? Infinity : a.giorniScorta
            const gb = b.giorniScorta == null ? Infinity : b.giorniScorta
            return ga - gb
          })
        if (daRiordinare.length === 0) return null
        // Il totale è sempre su TUTTE le righe, anche quelle non mostrate.
        const costoStimato = daRiordinare.reduce((s, r) => s + (r.riordinoG * r.costoG || 0), 0)
        const nascosti = Math.max(0, daRiordinare.length - RIORDINO_VISIBILI)
        const visibili = riordinoTutti ? daRiordinare : daRiordinare.slice(0, RIORDINO_VISIBILI)
        return (
          <div id="riordino-urgente" style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden', marginBottom: 24, boxShadow: SHADOW_PREMIUM, scrollMarginTop: 70 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: `1px solid ${C.border}`,
              background: 'linear-gradient(135deg, #6E0E1A 0%, #4A0612 100%)' }}>
              <span style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.16)', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="truck" size={17} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>Lista di riordino consigliata</div>
                <div style={{ fontSize: typo.small.fontSize, color: 'rgba(255,255,255,0.75)', marginTop: 1 }}>
                  {daRiordinare.length} {daRiordinare.length === 1 ? 'ingrediente' : 'ingredienti'} · per coprire circa {GIORNI_TARGET} giorni di consumo
                  {nascosti > 0 && !riordinoTutti && ` · in elenco i ${RIORDINO_VISIBILI} più urgenti`}
                </div>
              </div>
              {costoStimato > 0 && (
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ ...typo.caption, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.65)' }}>Spesa stimata</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', ...TNUM }}>{fmt0(costoStimato)}</div>
                </div>
              )}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 540 }}>
                <thead>
                  <tr style={{ background: '#F8F4F2' }}>
                    {/* "Da chi": la lista diceva quanto ordinare e non a chi
                        chiederlo. Il fornitore di un ingrediente si impara
                        registrando un ordine ricevuto in Fornitori. */}
                    {[['Ingrediente', 'left'], ['Da chi', 'left'], ['Giacenza', 'right'], ['Giorni scorta', 'right'], ['Da ordinare', 'right'], ['Costo stim.', 'right'], ['', 'right']].map(([h, al], i) => (
                      <th key={i} style={{ padding: '9px 14px', textAlign: al, ...typo.caption, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibili.map((r, i) => (
                    <tr key={r.k} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : '#FDFAF7' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: C.text, textTransform: 'capitalize' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: statoColor(r.stato), flexShrink: 0 }}/>
                          {r.nome}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: fornitorePerNome(r.nome) ? C.textMid : C.textSoft, whiteSpace: 'nowrap' }}>
                        {fornitorePerNome(r.nome) || (
                          <span title="Nessun fornitore collegato: si collega da sé quando segni come ricevuto un ordine che contiene questo ingrediente." style={{ cursor: 'help' }}>da collegare</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: statoColor(r.stato), fontWeight: 700, ...TNUM }}>{fmtG(r.giacenza)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: statoColor(r.stato), fontWeight: 700, ...TNUM }}>
                        {fmtGiorniScorta(r.giorniScorta, consumoStimato)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: C.text, ...TNUM }}>
                        {fmtRiordino(r.riordinoG) ? `~ ${fmtRiordino(r.riordinoG)}` : '-'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: C.textMid, ...TNUM }}>
                        {r.costoG > 0 ? fmt0(r.riordinoG * r.costoG) : '-'}
                      </td>
                      {/* Lo spazio a destra è riservato perché questa tabella
                          non ha il pulsante di eliminazione, che nella tabella
                          delle materie prime sta accanto a "Carica". Senza la
                          riserva i pulsanti "Carica" delle due tabelle cadevano
                          a 32px di distanza l'uno dall'altro, e a occhio si
                          vedeva: sono la stessa azione, devono stare sulla
                          stessa linea. Il valore si ricava dalle stesse misure
                          del cestino, non da un numero scelto a mano. */}
                      <td style={{ padding: '8px 10px', paddingRight: 10 + (isMobile ? 40 : 30) + 6, textAlign: 'right' }}>
                        <button onClick={() => { setQuickLoad(r.k); setFormMode('carico'); setFormIng(r.nome); setTab('carica'); focusQtyDeferred() }}
                          title={`Carica ${r.nome} in magazzino`}
                          style={{ padding: '0 10px', minHeight: isMobile ? 40 : 30, borderRadius: 6, border: `1px solid ${C.border}`, background: C.bgCard, color: C.textMid, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <Icon name="plus" size={11} />Carica
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {nascosti > 0 && (
              <button onClick={() => setRiordinoTutti(v => !v)}
                aria-expanded={riordinoTutti}
                style={{
                  width: '100%', minHeight: isMobile ? 46 : 40, border: 'none',
                  borderTop: `1px solid ${C.border}`, background: C.bgSubtle,
                  color: C.textMid, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center',
                  justifyContent: 'center', gap: 7,
                }}>
                <Icon name={riordinoTutti ? 'chevDown' : 'chevDown'} size={13}
                  style={{ transform: riordinoTutti ? 'rotate(180deg)' : 'none' }} />
                {riordinoTutti
                  ? `Mostra solo i ${RIORDINO_VISIBILI} più urgenti`
                  : `Vedi gli altri ${nascosti} da ordinare`}
              </button>
            )}
          </div>
        )
      })()}

      {/* Soglie di riordino mancanti: senza una soglia l'avviso non scatta mai,
          e la lista della spesa resta vuota anche quando un ingrediente è agli
          sgoccioli. Sul magazzino del design partner sono zero su nove. */}
      {/* Primo inventario: quaranta ingredienti su quarantotto non sono mai
          stati contati, e finché non lo sono la pagina non sa dire cosa sta
          finendo. Aggiungerli uno per uno vuol dire quaranta volte
          apri-scrivi-salva: è per questo che sono ancora quaranta. */}
      {tab === 'giacenze' && maiContati.length > 0 && (
        <div style={{
          background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 14,
          marginBottom: 16, overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            padding: isMobile ? 12 : '14px 16px',
          }}>
            <Icon name="clipboard" size={16} color={C.textSoft} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 200, fontSize: typo.small.fontSize, color: C.textMid, lineHeight: 1.5 }}>
              <strong style={{ color: C.text }}>
                {maiContati.length === 1
                  ? 'Un ingrediente non è mai stato contato'
                  : `${maiContati.length} ingredienti non sono mai stati contati`}
              </strong>
              {' '}— finché non hanno una quantità non posso dirti cosa sta finendo,
              e il valore a magazzino è una frazione del vero.
            </span>
            <button type="button" onClick={() => setInventarioAperto(v => !v)}
              style={{
                padding: '8px 14px', minHeight: 38, borderRadius: 9,
                border: `1px solid ${C.borderStr}`, background: inventarioAperto ? C.bgSubtle : T.brand,
                color: inventarioAperto ? C.textMid : '#FFF',
                fontSize: typo.small.fontSize, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
              }}>
              {inventarioAperto ? 'Chiudi' : 'Contali adesso'}
            </button>
          </div>

          {inventarioAperto && (
            <div style={{ borderTop: `1px solid ${C.borderSoft}` }}>
              <div style={{ padding: isMobile ? '8px 12px' : '8px 16px', fontSize: typo.small.fontSize, color: C.textSoft }}>
                Pesa e scrivi i chili. Quelli che salti restano qui: puoi finire domani.
              </div>
              {maiContati.map(r => (
                <div key={r.k} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: isMobile ? '9px 12px' : '9px 16px',
                  borderTop: `1px solid ${C.borderSoft}`,
                }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.nome}
                  </span>
                  <input
                    type="number" inputMode="decimal" min="0" step="0.1"
                    value={conteggi[r.k] ?? ''}
                    onChange={e => setConteggi(c => ({ ...c, [r.k]: e.target.value }))}
                    placeholder="kg"
                    aria-label={`Quantità di ${r.nome} in chili`}
                    style={{
                      width: 92, padding: '8px 10px', minHeight: 40, borderRadius: 8,
                      border: `1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 14,
                      textAlign: 'right', fontVariantNumeric: 'tabular-nums', boxSizing: 'border-box',
                    }} />
                  <span style={{ fontSize: typo.small.fontSize, color: C.textSoft, width: 22 }}>kg</span>
                </div>
              ))}
              <div style={{ padding: isMobile ? 12 : '12px 16px', borderTop: `1px solid ${C.borderSoft}`, display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" onClick={salvaPrimoInventario} disabled={saving}
                  style={{
                    padding: '10px 18px', minHeight: 42, borderRadius: 9, border: 'none',
                    background: T.brand, color: '#FFF', fontSize: 13, fontWeight: 700,
                    cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
                  }}>
                  {saving ? 'Salvo…' : 'Salva il conteggio'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'giacenze' && sogliePropose.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 9, flexWrap: 'wrap',
          background: C.amberLight, border: `1px solid ${C.amber}55`, borderRadius: 12,
          padding: isMobile ? 12 : '12px 16px', marginBottom: 16,
          fontSize: typo.small.fontSize, color: T.amberDark, lineHeight: 1.55,
        }}>
          <Icon name="alert" size={14} color={T.amberDark} style={{ flexShrink: 0, marginTop: 3 }} />
          <span style={{ flex: 1, minWidth: 220 }}>
            <strong>
              {sogliePropose.length === 1
                ? 'Un ingrediente non ha una soglia di riordino'
                : `${sogliePropose.length} ingredienti non hanno una soglia di riordino`}
            </strong>
            {' '}e senza soglia non ti avviso quando stanno per finire. Posso metterla io a
            una settimana di consumo, calcolata da quanto ne usi davvero: potrai
            sempre cambiarla riga per riga.
          </span>
          <button type="button" onClick={applicaSogliePropose} disabled={saving}
            style={{
              padding: '8px 14px', minHeight: 38, borderRadius: 9,
              border: 'none', background: T.amberDark, color: '#FFF',
              fontSize: typo.small.fontSize, fontWeight: 700,
              cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1, flexShrink: 0,
            }}>
            {saving ? 'Salvo…' : 'Imposta le soglie'}
          </button>
        </div>
      )}


      {/* Audit 2026-09-09: su telefono due schede su cinque restano fuori
          schermo e niente diceva che la barra scorre — si crede che ce ne siano
          tre. Il gradiente sul bordo destro e' il segnale, e scompare quando si
          e' arrivati in fondo. E la barra ora si dichiara come tablist: senza,
          un lettore di schermo legge cinque bottoni sciolti e non dice quale
          scheda e' aperta. */}
      <div role="tablist" aria-label="Sezioni del magazzino"
        style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: `1px solid ${T.border}`, overflowX: 'auto', WebkitOverflowScrolling: 'touch',
          maskImage: isMobile ? 'linear-gradient(to right, #000 88%, transparent 100%)' : undefined,
          WebkitMaskImage: isMobile ? 'linear-gradient(to right, #000 88%, transparent 100%)' : undefined }}>
        {[['giacenze', 'Materie prime'], ['pf', 'Prodotti finiti'], ['prezzi', 'Prezzi ingredienti'], ['carica', 'Carica merce'], ['log', 'Storico carichi']].filter(([id]) => !(isDipendente && id === 'prezzi')).map(([id, lbl]) => (
          <button key={id} onClick={() => setTab(id)}
            role="tab" aria-selected={tab === id} id={`mag-tab-${id}`}
            style={{ padding: '12px 16px', minHeight: 44, border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === id ? 600 : 500, color: tab === id ? T.text : T.textSoft,
              borderBottom: tab === id ? `2px solid ${T.brand}` : '2px solid transparent',
              marginBottom: -1, whiteSpace: 'nowrap', transition: `color ${M.durFast} ${M.ease}`, flexShrink: 0 }}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === 'pf' && <ProdottiFinitiTab notify={notify} orgId={orgId} sedeId={sedeId} LEX={LEX}/>}

      {tab === 'giacenze' && (
        <div>
          <SectHead icon={<Icon name="package" size={17} />} title="Materie prime" sub="Giacenze, soglie di riordino e giorni di scorta"
            right={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Toggle unità kg / g: tutti i pesi della pagina cambiano insieme. */}
                <div style={{ display: 'inline-flex', padding: 3, background: C.bgSubtle, borderRadius: 8 }}>
                  {['kg', 'g'].map(u => (
                    <button key={u} onClick={() => setUnitMode(u)}
                      style={{ padding: '0 14px', minHeight: 38, borderRadius: 6, border: 'none', cursor: 'pointer',
                        background: unitMode === u ? C.bgCard : 'transparent',
                        color: unitMode === u ? C.red : C.textSoft,
                        fontSize: 12, fontWeight: 700,
                        boxShadow: unitMode === u ? '0 1px 2px rgba(15,23,42,0.08)' : 'none',
                        fontFamily: 'inherit',
                      }}>{u}</button>
                  ))}
                </div>
                <button onClick={() => setShowAddIng(true)} style={{ padding: '0 16px', minHeight: 44, background: C.red, color: C.white, border: 'none', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(110,14,26,0.2)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="plus" size={12} />Aggiungi ingrediente</button>
              </div>
            } />
          {/* [15] Ricerca: con 35 ingredienti e oltre non c'era modo di
              trovarne uno. La scheda Prezzi ce l'ha da sempre. */}
          {righe.length > 12 && (
            <div style={{ marginBottom: 10, position: 'relative' }}>
              <input value={magSearch} onChange={e => setMagSearch(e.target.value)}
                placeholder="Cerca un ingrediente…"
                aria-label="Cerca un ingrediente fra le giacenze"
                style={{ width: '100%', maxWidth: 340, padding: isMobile ? '11px 12px' : '9px 12px', minHeight: 40, borderRadius: 9, border: `1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 13, color: C.text, background: C.white }} />
              {magSearch.trim() && (
                <span style={{ fontSize: typo.small.fontSize, color: C.textSoft, marginLeft: 10 }}>
                  {righeFiltrate.length} di {righe.length}
                </span>
              )}
            </div>
          )}

          {showAddIng && (
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 18, padding: '16px 20px', marginBottom: 16, // Su iPad in verticale (768-1023px) quattro colonne non ci stanno:
            // il caso d'uso reale è proprio il tablet appoggiato al bancone.
            display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '1fr 120px 120px auto', gap: 10, alignItems: 'flex-end', boxShadow: SHADOW_PREMIUM }}>
              {[{ lbl: 'Nome ingrediente', val: newIngNome, set: setNewIngNome, ph: 'es. burro' },
                { lbl: 'Giacenza (g)', val: newIngQty, set: setNewIngQty, ph: 'es. 1000', type: 'number' },
                { lbl: 'Soglia alert (g)', val: newIngSoglia, set: setNewIngSoglia, ph: 'es. 500', type: 'number' }].map(({ lbl, val, set, ph, type }) => (
                <div key={lbl}>
                  <div style={{ ...typo.caption, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>{lbl}</div>
                  <input type={type || 'text'} inputMode={type === 'number' ? 'decimal' : undefined} value={val} onChange={e => set(e.target.value)} placeholder={ph}
                    style={{ width: '100%', padding: '10px 12px', minHeight: 44, borderRadius: 7, border: `1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 13, color: C.text, boxSizing: 'border-box' }}/>
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={handleAddIngrediente} disabled={saving} style={{ flex: 1, padding: '10px 16px', minHeight: 44, background: C.red, color: C.white, border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Salvataggio…' : 'Aggiungi'}</button>
                <button aria-label="Chiudi" onClick={() => setShowAddIng(false)} style={{ minHeight: 44, minWidth: 44, background: 'transparent', color: C.textSoft, border: `1px solid ${C.border}`, borderRadius: 7, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={14} /></button>
              </div>
            </div>
          )}
          <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden', boxShadow: SHADOW_PREMIUM }}>
            {/* Audit 2026-09-09: senza sessioni di produzione registrate il consumo
              e' una stima del software (un impasto per ricetta a settimana), e da
              quella nascono giorni di scorta, stato e quantita' da ordinare: tre
              colonne su sei. Un tooltip lo legge chi ci passa sopra; questo lo
              vedono tutti. */}
          {consumoStimato && righe.length > 0 && (
            <div style={{ background: C.amberLight, border: `1px solid ${C.amber}40`, borderRadius: 10, padding: '10px 14px', marginBottom: 10, fontSize: typo.small.fontSize, color: C.textMid, lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ flexShrink: 0, marginTop: 1, color: C.amber }}><Icon name="warning" size={14} /></span>
              <span>
                <b style={{ color: C.text }}>Giorni scorta, stato e quantità da ordinare sono stime.</b>{' '}
                Non hai ancora sessioni di produzione registrate, quindi il consumo lo calcolo
                ipotizzando un impasto per ricetta a settimana. Registra qualche giornata in
                Produzione e questi numeri diventano i tuoi.
              </span>
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: typo.small.fontSize, minWidth: 760 }}>
                <thead>
                  <tr style={{ background: '#F8F4F2' }}>
                    <SortTH k="nome" active={magKey === 'nome'} dir={magDir} onToggle={magToggle}>Ingrediente</SortTH>
                    <SortTH k="giacenza" right active={magKey === 'giacenza'} dir={magDir} onToggle={magToggle}>Giacenza</SortTH>
                    <SortTH k="fabb" right active={magKey === 'fabb'} dir={magDir} onToggle={magToggle} tip="Fabbisogno settimanale stimato dal consumo degli ultimi 7 giorni">Fabb. sett.</SortTH>
                    <SortTH k="giorniScorta" right active={magKey === 'giorniScorta'} dir={magDir} onToggle={magToggle} tip={consumoStimato ? "ATTENZIONE: non hai ancora sessioni di produzione registrate, quindi il consumo e' una stima del software (un impasto per ricetta a settimana). Registra qualche giornata e questi numeri diventano tuoi." : "Giorni di scorta rimanenti al ritmo di consumo attuale"}>Giorni scorta</SortTH>
                    <SortTH k="valore" right active={magKey === 'valore'} dir={magDir} onToggle={magToggle} tip="Valore della giacenza = quantità × prezzo €/kg">Valore</SortTH>
                    <SortTH k="riordino" right active={magKey === 'riordino'} dir={magDir} onToggle={magToggle} tip="Quantità consigliata da ordinare per coprire ~14 giorni di consumo">Da ordinare</SortTH>
                    <SortTH k="soglia" right active={magKey === 'soglia'} dir={magDir} onToggle={magToggle} tip="Soglia minima sotto la quale scatta l'alert di riordino">Soglia alert</SortTH>
                    <SortTH k="stato" active={magKey === 'stato'} dir={magDir} onToggle={magToggle}>Stato</SortTH>
                    <SortTH k="ultimoRif" right active={magKey === 'ultimoRif'} dir={magDir} onToggle={magToggle} tip="Data dell'ultimo rifornimento registrato">Ultimo riforn.</SortTH>
                    {/* Stesse misure delle altre nove intestazioni, che
                        passano da SortTH: prima questa era scritta a mano e
                        la testata aveva due dimensioni diverse. */}
                    <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textMid, borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Con l'elenco vuoto restava una card con la sola riga di
                      intestazione e nove colonne senza niente sotto: sembrava
                      un errore di caricamento. */}
                  {righe.length === 0 && (
                    <tr>
                      <td colSpan={10} style={{ padding: '36px 20px', textAlign: 'center' }}>
                        <div style={{ color: C.textSoft, marginBottom: 10 }}><Icon name="package" size={30} /></div>
                        <div style={{ ...typo.body, fontWeight: 700, color: C.text, marginBottom: 6 }}>Il magazzino è vuoto</div>
                        <div style={{ ...typo.small, color: C.textSoft, lineHeight: 1.55, maxWidth: 420, margin: '0 auto 14px' }}>
                          Aggiungi il primo ingrediente, oppure carica il ricettario: gli ingredienti delle ricette compaiono qui da soli.
                        </div>
                        <button onClick={() => setShowAddIng(true)}
                          style={{ padding: '0 16px', minHeight: 40, background: C.red, color: C.white, border: 'none', borderRadius: 8, ...typo.small, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          Aggiungi ingrediente
                        </button>
                      </td>
                    </tr>
                  )}
                  {sortMag(righeFiltrate, (r, k) => ({
                    nome: r.nome, giacenza: r.giacenza, fabb: r.fabb,
                    giorniScorta: r.giorniScorta ?? 9999, soglia: r.soglia,
                    valore: r.valore, riordino: r.riordinoG,
                    // 'mai_contato' sta in fondo: non e' un'urgenza, e' una
                    // riga che aspetta il primo inventario.
                    stato: ({ negativo: 0, esaurito: 1, critico: 2, attenzione: 3, ok: 4, mai_contato: 5 }[r.stato] ?? 4),
                    ultimoRif: r.ultimoRif ? new Date(r.ultimoRif).getTime() : 0,
                  })[k] ?? 0).map((r, i) => (
                    <tr key={r.k} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : '#FDFAF7' }}>
                      {/* Il nome è solo testo.
                          Prima tutta la cella era cliccabile e cambiava scheda,
                          con come unico indizio una freccia a 11px e opacità
                          0,4: si cambiava pagina per sbaglio provando a
                          selezionare il nome. Poi il pulsante era finito qui
                          accanto, e così non poteva incolonnarsi: con nomi di
                          lunghezza diversa ogni pulsante finiva a un'ascissa
                          diversa. Ora sta nella colonna delle azioni, in fondo
                          alla riga, dove si allineano da soli. */}
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: quickLoad === r.k ? C.red : C.text, textTransform: 'capitalize' }}>
                        {r.nome}
                      </td>
                      {/* A destra come la sua intestazione. Sei colonne su
                          nove avevano l'header a destra e i numeri al centro:
                          le migliaia non stavano una sopra l'altra e per
                          confrontare due righe bisognava leggerle una a una. */}
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                          <span style={{ fontWeight: 800, fontSize: 12, color: statoColor(r.stato), ...TNUM }}>{fmtG(r.giacenza)}</span>
                          {r.fabb > 0 && (
                            <div style={{ width: 60, height: 4, background: C.borderStr, borderRadius: 2 }}>
                              <div style={{ width: `${Math.min(100, (r.giacenza / r.fabb) * 100)}%`, height: 4, background: statoColor(r.stato), borderRadius: 2 }}/>
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: C.textMid, ...TNUM }}>{r.fabb > 0 ? fmtG(r.fabb) : '-'}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: statoColor(r.stato), ...TNUM }}
                          title="Giorni di scorta: giacenza diviso consumo medio giornaliero">
                        {fmtGiorniScorta(r.giorniScorta, consumoStimato)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: r.valore > 0 ? C.text : C.textSoft, fontWeight: r.valore > 0 ? 700 : 400, ...TNUM }}>
                        {r.valore > 0 ? fmt0(r.valore) : '-'}
                        {/* Audit 2026-09-09: il prezzo al kilo era scritto qui sotto
                            in chiaro, anche per il dipendente — a cui la scheda
                            "Prezzi ingredienti" e' nascosta per scelta (il filtro
                            sulle schede a riga 1264). Nascondere una pagina e poi
                            stampare lo stesso dato in una colonna accanto non
                            protegge niente: il prezzo di acquisto e' un dato
                            commerciale, e l'azienda ha deciso che il dipendente non
                            lo vede. Il valore complessivo resta: serve a chi fa
                            l'inventario e non rivela il singolo prezzo. */}
                        {!isDipendente && r.valore > 0 && r.costoKg > 0 && (
                          <div style={{ fontSize: typo.small.fontSize, color: C.textSoft, fontWeight: 500 }}>
                            {r.costoKg.toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/kg
                            {r.prezzoStimato && <span title="Prezzo non inserito da te: è una stima di mercato, quindi anche il valore è indicativo."> · stima</span>}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', ...TNUM }}>
                        {(r.stato === 'critico' || r.stato === 'esaurito' || r.stato === 'attenzione') && fmtRiordino(r.riordinoG) ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 8, background: statoBg(r.stato), color: statoColor(r.stato), fontWeight: 800, fontSize: typo.small.fontSize }}>
                            <Icon name="truck" size={11} /><span style={{ whiteSpace: 'nowrap' }}>~ {fmtRiordino(r.riordinoG)}</span>
                          </span>
                        ) : (
                          <span style={{ color: C.textSoft }}>-</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        {editSoglia?.nome === r.k ? (
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
                            {/* L'unità scritta accanto al campo.
                                Il pulsante mostrava "0,500 kg", si apriva e
                                dentro c'era "500": chi aveva appena letto kg
                                scriveva "0,5" e la soglia diventava mezzo
                                grammo. L'avviso di riordino non suonava più e
                                il ritorno grafico era un "0,001 kg" in 10,5px.
                                I grammi restano l'unità di input, come fa il
                                form di creazione a riga 1113 ("Soglia alert
                                (g)"): convertirla secondo il toggle kg/g
                                sarebbe peggio, perché il toggle è globale e
                                si può premere con l'editor aperto. */}
                            <input type="number" value={editSoglia.val} min="0" step="1"
                              aria-label="Soglia di riordino in grammi" placeholder="es. 500"
                              onChange={e => setEditSoglia({ ...editSoglia, val: e.target.value })}
                              style={{ width: 74, padding: '5px 6px', minHeight: isMobile ? 40 : 30, borderRadius: 5, border: `1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 12, textAlign: 'center' }}/>
                            <span style={{ fontSize: 12, color: C.textSoft, fontWeight: 600 }}>g</span>
                            <button onClick={() => handleSoglia(r.k, editSoglia.val)}
                              aria-label="Conferma la soglia"
                              style={{ width: isMobile ? 40 : 30, height: isMobile ? 40 : 30, background: C.green, color: C.white, border: 'none', borderRadius: 5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={13} /></button>
                          </div>
                        ) : (
                          <button onClick={() => setEditSoglia({ nome: r.k, val: r.soglia || '' })}
                            style={{ padding: '5px 10px', minWidth: 84, borderRadius: 6, border: `1px solid ${C.border}`, background: C.white, color: C.textMid, fontSize: 12, fontWeight: 600, cursor: 'pointer', ...TNUM, textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {r.soglia > 0 ? fmtG(r.soglia) : 'Imposta'}
                          </button>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'left' }}>
                        <span style={{ background: statoBg(r.stato), color: statoColor(r.stato), fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 10, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', display: 'inline-block' }}>{statoLabel(r.stato)}</span>
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: C.textSoft, fontSize: 12 }}>
                        {r.ultimoRif ? new Date(r.ultimoRif).toLocaleDateString('it-IT') : '-'}
                      </td>
                      {/* Una colonna sola per le azioni, allineata a destra:
                          i pulsanti di tutte le righe cadono sulla stessa
                          ascissa, e si trovano guardando una volta invece di
                          cercarli in mezzo ai nomi. */}
                      <td style={{ padding: '6px 10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => { setQuickLoad(r.k); setFormIng(r.nome); setTab('carica'); focusQtyDeferred() }}
                            title={`Carica ${r.nome} in magazzino`}
                            style={{ padding: '0 10px', minHeight: isMobile ? 40 : 30, borderRadius: 6, border: `1px solid ${C.border}`, background: C.bgCard, color: C.textMid, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', flexShrink: 0 }}>
                            <Icon name="plus" size={11} />Carica
                          </button>
                          <button aria-label={`Elimina ${r.nome}`} onClick={() => { setDeleteIngConf(r.k); setDeleteIngPin('') }}
                            title="Elimina questo ingrediente"
                            style={{ width: isMobile ? 40 : 30, height: isMobile ? 40 : 30, borderRadius: 6, border: `1px solid ${C.border}`, background: C.bgCard, color: C.textSoft, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name="trash" size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'carica' && (
        <div style={{ maxWidth: 680 }}>
          <SectHead icon={<Icon name="truck" size={17} />} title="Carica merce" sub="Registra rifornimenti, scarichi e rettifiche di magazzino" />
          <FotoOCR mode="magazzino" notify={notify} ricettario={ricettario} onResult={async res => {
            const now = new Date().toISOString()
            const nm = { ...magazzino }
            const newLogs = []
            for (const rawIng of (res.ingredienti || [])) {
              const nomeIT = translateIngredienteEN(rawIng.nome || '')
              const ing = { ...rawIng, nome: nomeIT }
              const k = normIng(ing.nome)
              // Guard NaN: se l'OCR omette la quantità, `0 + undefined = NaN`
              // verrebbe persistito corrompendo per sempre quella giacenza.
              const qg = Number(ing.quantita_g)
              const qtaG = Number.isFinite(qg) ? qg : 0
              if (qtaG <= 0) continue
              nm[k] = { nome: ing.nome.trim(), giacenza_g: (nm[k]?.giacenza_g || 0) + qtaG, soglia_g: nm[k]?.soglia_g || 0, ultimoRifornimento: now }
              newLogs.push({ id: `r-${Date.now()}-${k}`, data: now, ingrediente: ing.nome.trim(), quantita_g: qtaG, note: 'da foto' })
            }
            // Si contano i CARICATI, non le righe lette dalla foto.
            //
            // Il messaggio diceva `${(res.ingredienti || []).length} ingredienti`,
            // cioè tutte le righe estratte — comprese quelle saltate dal
            // `continue` qui sopra perché la quantità non era leggibile. Il
            // prompt dell'OCR chiede esplicitamente di mettere 0 quando non
            // riesce a leggere la quantità, quindi le righe scartate sono un
            // esito previsto, non un caso raro: l'utente leggeva "caricati 12"
            // e in magazzino ne trovava 7, senza sapere quali cinque rifare.
            const scartati = (res.ingredienti || []).length - newLogs.length
            if (newLogs.length === 0) {
              notify('Dalla foto non si legge nessuna quantità: niente è stato caricato. Prova con una foto più nitida, o inserisci a mano.', false)
              return
            }
            const updLogs = [...newLogs, ...(logRif || [])]
            try {
              await ssave(SK_MAG, nm)
              await ssave(SK_LOGRIF, updLogs)
            } catch (e) {
              console.error('[magazzino] OCR:', e); notify('Non ho potuto salvare i dati letti dalla foto. Riprova', false)
              return
            }
            setMagazzino(nm)
            setLogRif(updLogs)
            notify(scartati > 0
              ? `Caricati ${newLogs.length} ingredienti. Altri ${scartati} avevano la quantità illeggibile: quelli vanno messi a mano.`
              : `Caricati ${newLogs.length} ingredienti in magazzino`, scartati === 0)
          }}/>
          <FotoOCR mode="prezzi" notify={notify} ricettario={ricettario} onResult={async res => {
            if (!ricettario) { notify('Carica prima il ricettario', false); return }
            // Il prezzo va normalizzato a numero PRIMA di usarlo.
            //
            // Bug confermato: il filtro `i.prezzo_kg > 0` passava anche la
            // stringa "12.50" (JavaScript la confronta convertendola), e subito
            // dopo `i.prezzo_kg.toFixed(4)` su una stringa lancia un errore.
            // Dentro un gestore asincrono quell'errore non arrivava da nessuna
            // parte: nessun messaggio, nessun prezzo aggiornato, la foto
            // sembrava semplicemente non aver funzionato. Che il valore non sia
            // garantito numerico lo dice il flusso accanto, che infatti fa
            // `Number(...)` e controlla `Number.isFinite`.
            const nuoviCosti = {}
            let letti = 0, scartati = 0
            for (const i of (res.ingredienti || [])) {
              const pk = Number(String(i.prezzo_kg ?? '').replace(',', '.'))
              if (!Number.isFinite(pk) || pk <= 0) { scartati++; continue }
              const k = normIng(translateIngredienteEN(i.nome || ''))
              nuoviCosti[k] = { costoKg: parseFloat(pk.toFixed(4)), costoG: parseFloat((pk / 1000).toFixed(6)), isStima: false }
              letti++
            }
            if (letti === 0) {
              notify('Dalla foto non si legge nessun prezzo. Prova con una foto più nitida.', false)
              return
            }
            if (onImportPrezziOCR) onImportPrezziOCR(nuoviCosti)
            notify(scartati > 0
              ? `${letti} prezzi aggiornati. Altri ${scartati} non erano leggibili.`
              : `${letti} prezzi aggiornati`, scartati === 0)
          }}/>
          <div style={{ background: C.bgCard, border: `1px solid ${formMode === 'scarico' ? C.amber : C.border}`, borderRadius: 18, padding: isMobile ? '18px' : '28px', boxShadow: SHADOW_PREMIUM }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
              {[['carico', 'plus', 'Carico merce', 'Rifornimento in entrata'], ['scarico', 'trash', 'Scarico / Rettifica', 'Rimuovi quantità']].map(([m, ic, lbl, sub]) => (
                <button key={m} onClick={() => setFormMode(m)}
                  style={{ flex: 1, padding: '10px 12px', borderRadius: 9, border: `2px solid ${formMode === m ? (m === 'carico' ? C.green : C.amber) : C.border}`,
                    background: formMode === m ? (m === 'carico' ? C.greenLight : C.amberLight) : C.white,
                    color: formMode === m ? (m === 'carico' ? C.green : C.amber) : C.textMid,
                    fontWeight: formMode === m ? 800 : 500, fontSize: 13, cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ fontWeight: 800, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 5 }}><Icon name={ic} size={12} />{lbl}</div>
                  <div style={{ fontSize: 12, opacity: 0.88 }}>{sub}</div>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label htmlFor="mag-ing-input" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, cursor: 'pointer' }}>Ingrediente</label>
                <input id="mag-ing-input" type="text" value={formIng}
                  onChange={e => setFormIng(e.target.value)}
                  onKeyDown={onEnterAutoComplete(tuttiIngNomi, formIng, setFormIng, () => {
                    const qtyEl = document.getElementById('mag-qty-input')
                    if (qtyEl) qtyEl.focus()
                  })}
                  placeholder="es. burro"
                  aria-label="Nome dell'ingrediente da caricare o scaricare"
                  list="ing-list" style={{ width: '100%', padding: '11px 12px', minHeight: 44, borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 13, color: C.text, boxSizing: 'border-box' }}/>
                {/* Audit 2026-09-09: il form non diceva quanto ce n'e' adesso.
                    Chi carica non sa da dove parte, e chi scarica non sa se sta
                    per andare sotto zero — cosa che succede davvero, tanto che
                    esiste uno stato "Da correggere" per le giacenze negative.
                    Il dato è già in `righe`: basta mostrarlo. */}
                {(() => {
                  if (!formIng.trim()) return null
                  const rigaScelta = righe.find(r => r.k === normIng(formIng.toLowerCase().trim()))
                  if (!rigaScelta) {
                    return (
                      <div style={{ fontSize: typo.small.fontSize, color: C.textSoft, marginTop: 5 }}>
                        Nuovo ingrediente: non è ancora in magazzino, lo aggiungo io.
                      </div>
                    )
                  }
                  const dopo = rigaScelta.giacenza + (formMode === 'scarico' ? -1 : 1) * (parseFloat(String(formQty).replace(',', '.')) || 0)
                  return (
                    <div style={{ fontSize: typo.small.fontSize, color: dopo < 0 ? C.red : C.textSoft, marginTop: 5, lineHeight: 1.5 }}>
                      Adesso in magazzino: <b style={{ color: C.text, ...TNUM }}>{fmtG(rigaScelta.giacenza)}</b>
                      {formQty && <> <Icon name="arrowR" size={11} /> dopo questa operazione <b style={{ color: dopo < 0 ? C.red : C.text, ...TNUM }}>{fmtG(dopo)}</b></>}
                      {dopo < 0 && <> — andrebbe sotto zero: controlla la quantità.</>}
                    </div>
                  )
                })()}
              </div>
              <div>
                <label htmlFor="mag-qty-input" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, cursor: 'pointer' }}>
                  Quantità (g) — {formMode === 'scarico' ? 'da rimuovere' : 'in arrivo'}
                </label>
                <input id="mag-qty-input" type="number" inputMode="decimal" value={formQty} onChange={e => setFormQty(e.target.value)} placeholder="es. 2000" min="0"
                  style={{ width: '100%', padding: '11px 12px', minHeight: 44, borderRadius: 8, border: `1px solid ${formMode === 'scarico' ? C.amber : C.borderStr}`, fontSize: isMobile ? 16 : 13, color: C.text, boxSizing: 'border-box' }}/>
              </div>
              <div>
                <label htmlFor="mag-note-input" style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, cursor: 'pointer' }}>Note (opzionale)</label>
                <input id="mag-note-input" type="text" value={formNote} onChange={e => setFormNote(e.target.value)} placeholder="es. Metro - bolla 1234"
                  style={{ width: '100%', padding: '11px 12px', minHeight: 44, borderRadius: 8, border: `1px solid ${C.borderStr}`, fontSize: isMobile ? 16 : 13, color: C.text, boxSizing: 'border-box' }}/>
              </div>
              <datalist id="ing-list">{tuttiIngNomi.map(k => <option key={k} value={k}/>)}</datalist>
              <button onClick={handleCarica} disabled={!formIng || !formQty || saving}
                style={{ padding: '12px', border: 'none', borderRadius: 9, fontWeight: 800, fontSize: 13, cursor: (formIng && formQty && !saving) ? 'pointer' : 'default',
                  background: (formIng && formQty && !saving) ? (formMode === 'scarico' ? C.amber : C.red) : '#DDD',
                  color: (formIng && formQty && !saving) ? C.white : C.textMid, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                {saving ? 'Salvataggio…' : (formMode === 'scarico' ? <><Icon name="trash" size={14} />Rimuovi dal magazzino</> : <><Icon name="plus" size={14} />Aggiungi al magazzino</>)}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'prezzi' && !isDipendente && (
        <PrezziIngredientiTab ricettario={ricettario} logPrezzi={logPrezzi} onUpdatePrezzo={onUpdatePrezzoIng} isMobile={isMobile}/>
      )}

      {tab === 'log' && (
        <div>
          <SectHead icon={<Icon name="clipboard" size={17} />} title="Storico carichi" sub="Ogni carico e scarico di materie prime, dal più recente" />
          {(!logRif || logRif.length === 0) ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: C.textSoft }}>
              <div style={{ marginBottom: 12, color: C.textSoft }}><Icon name="clipboard" size={32} /></div>
              {/* Audit 2026-09-09: diceva solo "Nessun rifornimento registrato"
                  e finiva li'. Uno stato vuoto che non dice come uscirne lascia
                  la persona a chiedersi se la pagina e' rotta. */}
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>Nessun carico registrato</div>
              <div style={{ fontSize: typo.small.fontSize, color: C.textSoft, maxWidth: 380, margin: '0 auto 16px', lineHeight: 1.55 }}>
                Qui finisce ogni merce che entra o esce dal magazzino, con la data e la quantità.
                Si riempie da sola man mano che registri i carichi.
              </div>
              <button type="button" onClick={() => setTab('carica')}
                style={{ padding: '11px 18px', minHeight: 44, borderRadius: 9, border: 'none', background: T.brand, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="plus" size={14} /> Registra un carico
              </button>
            </div>
          ) : (
            <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 18, overflow: 'hidden', boxShadow: SHADOW_PREMIUM }}>
              {/* Audit 2026-09-09: la tabella non scorreva in orizzontale su
                  telefono (wrapper in overflow hidden, nessun minWidth) e
                  l'intestazione della quantità era a sinistra mentre i numeri
                  stanno a destra. */}
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: typo.small.fontSize, minWidth: 560 }}>
                <thead>
                  <tr style={{ background: '#F8F4F2' }}>
                    {['Data', 'Ingrediente', 'Quantità', 'Note'].map((h, i) => (
                      <th key={i} style={{ padding: '10px 14px', textAlign: i === 2 ? 'right' : 'left', ...typo.caption, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: C.textSoft, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logRif.slice(0, logLimite).map((r, i) => (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? C.white : '#FDFAF7' }}>
                      {/* Audit 2026-09-09, quattro difetti in questa riga:
                          - le quantità NEGATIVE (gli scarichi) erano scritte in
                            verde come i carichi: un prelievo sembrava un arrivo
                            di merce;
                          - la colonna non era allineata a destra né con cifre
                            tabellari, quindi i numeri non si potevano confrontare
                            a colpo d'occhio;
                          - la data andava a capo spezzata (nessun nowrap);
                          - `textTransform: capitalize` rompe le maiuscole vere:
                            "FARINA 00" diventava "Farina 00" e "IGP" diventava
                            "Igp". Il nome si mostra come l'utente l'ha scritto. */}
                      <td style={{ padding: '10px 14px', color: C.textMid, whiteSpace: 'nowrap' }}>{new Date(r.data).toLocaleString('it-IT', { useGrouping: 'always', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: C.text }}>{r.ingrediente}</td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap', ...TNUM, color: Number(r.quantita_g) < 0 ? C.amber : C.green }}>
                        {Number(r.quantita_g) < 0 ? '−' : '+'}{fmtG(Math.abs(Number(r.quantita_g) || 0))}
                      </td>
                      <td style={{ padding: '10px 14px', color: C.textSoft }}>{r.note || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
              {/* Audit 2026-09-09: lo storico non aveva né limite né modo di
                  scorrere: con qualche centinaio di carichi la pagina si
                  appesantiva e non si trovava più niente. */}
              {logRif.length > logLimite && (
                <div style={{ padding: '10px 14px', borderTop: `1px solid ${C.border}`, textAlign: 'center' }}>
                  <span style={{ fontSize: typo.small.fontSize, color: C.textSoft, marginRight: 10 }}>
                    {logLimite} di {logRif.length.toLocaleString('it-IT', { useGrouping: 'always' })}
                  </span>
                  <button type="button" onClick={() => setLogLimite(l => l + 100)}
                    style={{ padding: '9px 16px', minHeight: 40, borderRadius: 8, border: `1px solid ${C.borderStr}`, background: C.bgCard, fontSize: typo.small.fontSize, fontWeight: 700, color: C.textMid, cursor: 'pointer' }}>
                    Mostra altri 100
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {deleteIngConf && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          role="dialog" aria-modal="true" aria-labelledby="delete-ing-title"
          onClick={e => { if (e.target === e.currentTarget) { setDeleteIngConf(null); setDeleteIngPin('') } }}>
          <div style={{ background: C.white, borderRadius: 16, padding: '28px 32px', maxWidth: 420, width: '90%', boxShadow: '0 24px 60px rgba(15,23,42,0.28)' }}>
            <div id="delete-ing-title" style={{ fontSize: 14, fontWeight: 900, color: C.red, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 7 }}><Icon name="trash" size={16} />Elimina ingrediente</div>
            <div style={{ fontSize: 13, color: C.text, marginBottom: 4 }}>
              {/* Il nome che si legge nella riga, non la chiave normalizzata:
                  `deleteIngConf` e' la chiave canonica, quindi su una voce
                  salvata come "Uova" il modale chiedeva conferma per "uovo" —
                  un nome che l'utente non ha mai scritto. Si passa
                  dall'aggregazione, che tiene già il nome preferito. */}
              Stai per eliminare <b style={{ textTransform: 'capitalize' }}>{magPerNorm[deleteIngConf]?.nome || deleteIngConf}</b> dal magazzino
              {magPerNorm[deleteIngConf]?.giacenza_g > 0 && <> ({fmtG(magPerNorm[deleteIngConf].giacenza_g)} in giacenza)</>}.
            </div>
            {/* "Questa azione è permanente" non dice la cosa che serve sapere:
                che l'ingrediente esce dall'elenco e dagli avvisi, ma se una
                ricetta lo usa continua a pesare sul costo. */}
            <div style={{ fontSize: 12, color: C.textSoft, marginBottom: 18, lineHeight: 1.5 }}>
              Sparisce dall'elenco e non riceverai più avvisi di riordino su di lui.
              Se una ricetta lo usa, continuerà a essere calcolato nel costo di quella ricetta.
            </div>
            <div style={{ fontSize: typo.small.fontSize, fontWeight: 700, color: C.textSoft, marginBottom: 6 }}>Scrivi <b style={{ color: C.red }}>ELIMINA</b> per confermare:</div>
            <input autoFocus value={deleteIngPin} onChange={e => setDeleteIngPin(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && deleteIngPin === 'ELIMINA') handleDeleteIng(deleteIngConf) }}
              placeholder="ELIMINA"
              style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 7, border: `2px solid ${deleteIngPin === 'ELIMINA' ? C.red : '#DDD'}`, fontSize: 14, fontWeight: 800, color: C.red, letterSpacing: '0.1em', marginBottom: 16, outline: 'none' }}/>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { if (deleteIngPin === 'ELIMINA') handleDeleteIng(deleteIngConf) }} disabled={saving}
                style={{ flex: 1, padding: '11px', background: deleteIngPin === 'ELIMINA' && !saving ? C.red : '#EEE', color: deleteIngPin === 'ELIMINA' && !saving ? C.white : C.textMid, border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: deleteIngPin === 'ELIMINA' && !saving ? 'pointer' : 'not-allowed' }}>
                {saving ? 'Eliminazione…' : 'Elimina definitivamente'}
              </button>
              <button onClick={() => { setDeleteIngConf(null); setDeleteIngPin('') }} style={{ flex: 1, padding: '11px', background: C.white, color: C.textMid, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Annulla</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
