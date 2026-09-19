// ── Fornitori e materie prime: chi ti vende cosa ────────────────────────────
//
// Richiesta del titolare, 19/09/2026: «crea una nuova pagina molto semplice,
// intuitiva, intelligente e migliore di sempre, con i nomi dei fornitori e le
// materie prime a loro collegate. Uno può modificare quando vuole i
// collegamenti tra materie prime e fornitori o viceversa. Una materia prima
// può avere più fornitori e un fornitore può dare più materie prime. Questa è
// la pagina dove si atterra se nella pagina Materie prime clicco nella colonna
// Fornitori su un nome».
//
// ═══ Come è fatta, e perché ═════════════════════════════════════════════
//
// **Una relazione, due versi.** «Di lui compro queste cose» e «questa me la
// vendono in tre» sono la stessa riga di dati guardata da due lati, e servono
// tutti e due: il primo quando si prepara un ordine o si controlla un listino,
// il secondo quando un prezzo sale e si cerca chi altro ce l'ha. Invece di due
// pagine si cambia lato con un comando, e quello che si sta guardando resta
// selezionato passando di là.
//
// **I due numeri che contano.** Per ogni fornitore: quante materie prime gli
// compriamo, e **quante di quelle non hanno prezzo**. Il secondo è quello su
// cui si decide chi chiamare: ogni materia prima senza prezzo è un buco nel
// food cost che non si vede da nessuna parte (su 117 materie prime del design
// partner, 75 non ce l'hanno). E in fondo all'elenco, sempre visibile, le
// materie prime senza nessun fornitore: quelle sono il lavoro da fare.
//
// **Il dato.** La forma molti-a-molti e le sue invarianti stanno tutte in
// `lib/fornitoriMateriePrime.js` — qui non si scrive un campo a mano.

import React, { useState, useMemo, useEffect, useRef } from 'react'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import Icon from '../components/Icon'
import { C, KPI, PageHeader, Tip, TNUM, fmt, CampoConElenco } from './_shared'
import { radius as R, font, ui, ui3 } from '../lib/theme'
import { normIng } from '../lib/foodcost'
import { normalizzaNomeFornitore, chiaveFornitore, stessoFornitore } from '../lib/materiePrimeFornitore'
import {
  indiceFornitoriMateriePrime, collegaFornitore, scollegaFornitore, rendiPrincipale,
} from '../lib/fornitoriMateriePrime'

const OPZ = { normalizzaNome: normIng }
const SENZA = '__senza_fornitore__'

const n0 = (n) => Number(n || 0).toLocaleString('it-IT', { useGrouping: 'always' })
const contaMP = (n) => `${n0(n)} ${n === 1 ? 'materia prima' : 'materie prime'}`

// Il prezzo, o il fatto che non lo sappiamo. Zero non è «gratis» per sbaglio:
// quando è scritto davvero (l'omaggio del fornitore, la roba dell'orto) resta
// zero; quando manca si dice che manca.
function Prezzo({ valore, dito }) {
  if (valore == null) {
    return (
      <span style={{
        fontSize: font.size.sm, fontWeight: 700, color: C.amber,
        background: C.amberLight, borderRadius: 6, padding: dito ? '4px 8px' : '2px 7px',
        whiteSpace: 'nowrap',
      }}>prezzo da mettere</span>
    )
  }
  return <span style={{ fontSize: font.size.base, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', ...TNUM }}>{fmt(valore)}/kg</span>
}

export default function FornitoriMateriePrimeView({
  ricettario,
  onSalvaRicettario,
  fornitoreDaAprire = null,
  onFornitoreAperto,
  notify,
  onNavigate,
}) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  // Dove si tocca, i bersagli stanno sopra i 44px: il tablet si tocca col dito
  // esattamente come il telefono.
  const dito = isMobile || isTablet

  const costi = useMemo(() => ricettario?.ingredienti_costi || {}, [ricettario])
  const indice = useMemo(() => indiceFornitoriMateriePrime(costi), [costi])

  const [verso, setVerso] = useState('fornitori')   // 'fornitori' | 'materie'
  const [sceltoForn, setSceltoForn] = useState(null)  // chiaveFornitore | SENZA
  const [sceltaMP, setSceltaMP] = useState(null)      // chiave della materia prima
  const [cerca, setCerca] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [daCollegare, setDaCollegare] = useState('')
  // Un fornitore che esiste in anagrafica ma non ha ancora niente collegato:
  // ci si può atterrare sopra, e da lì si comincia a collegare.
  const [fornitoreVuoto, setFornitoreVuoto] = useState(null)
  // Chiavistello sincrono contro il doppio invio: i pulsanti sono già
  // `disabled` durante l'attesa, ma il campo risponde anche a Invio e il tasto
  // non guarda il pulsante.
  const inCorso = useRef(false)

  const fornitori = useMemo(() => {
    if (!fornitoreVuoto) return indice.fornitori
    if (indice.fornitori.some(f => f.chiave === fornitoreVuoto.chiave)) return indice.fornitori
    const con = [...indice.fornitori, { ...fornitoreVuoto, varianti: [fornitoreVuoto.nome], quante: 0, senzaPrezzo: 0, materiePrime: [] }]
    return con.sort((a, b) => a.nome.localeCompare(b.nome, 'it'))
  }, [indice.fornitori, fornitoreVuoto])

  // ── Atterrare su un fornitore preciso ──────────────────────────────────
  //
  // Chi arriva qui cliccando un nome nella colonna «Fornitore» della pagina
  // Materie prime deve trovarsi su quel fornitore. Trovarsi in cima a un
  // elenco e dover ricercare a mano il nome su cui si è appena cliccato è il
  // modo più sicuro per far smettere la gente di cliccare.
  useEffect(() => {
    if (!fornitoreDaAprire) return
    const nome = normalizzaNomeFornitore(fornitoreDaAprire)
    const k = chiaveFornitore(nome)
    if (!k) { onFornitoreAperto?.(); return }
    setVerso('fornitori')
    setCerca('')
    setSceltoForn(k)
    // Se non ha ancora niente collegato non è un errore: è il caso di chi lo
    // ha appena messo in anagrafica. Si apre lo stesso, vuoto, col campo per
    // collegare la prima materia prima.
    setFornitoreVuoto({ nome, chiave: k })
    onFornitoreAperto?.()
  }, [fornitoreDaAprire, onFornitoreAperto])

  const fornitoreScelto = sceltoForn && sceltoForn !== SENZA
    ? fornitori.find(f => f.chiave === sceltoForn) || null
    : null
  const materiaScelta = sceltaMP ? indice.materiePrime.find(m => m.chiave === sceltaMP) || null : null

  const nomiMateriePrime = useMemo(() => indice.materiePrime.map(m => m.nome), [indice.materiePrime])
  const nomiFornitori = useMemo(() => fornitori.map(f => f.nome), [fornitori])

  const filtro = cerca.trim().toLowerCase()
  const fornitoriVisti = filtro
    ? fornitori.filter(f => f.nome.toLowerCase().includes(filtro) || f.materiePrime.some(m => m.nome.toLowerCase().includes(filtro)))
    : fornitori
  const materieViste = filtro
    ? indice.materiePrime.filter(m => m.nome.toLowerCase().includes(filtro) || m.fornitori.some(f => f.toLowerCase().includes(filtro)))
    : indice.materiePrime

  // ── Scrivere ───────────────────────────────────────────────────────────
  //
  // Prima il salvataggio, poi lo schermo: lo state qui è il ricettario che
  // arriva dal Dashboard, quindi se `ssave` fallisce non cambia niente e la
  // pagina resta su quello che c'è davvero in archivio.
  async function salva(nuoviCosti, messaggio) {
    if (inCorso.current) return
    if (typeof onSalvaRicettario !== 'function') {
      notify?.('Questa pagina non è collegata al salvataggio: avvisa chi la sta montando.', false)
      return
    }
    inCorso.current = true
    setSalvando(true)
    try {
      const base = ricettario || {}
      await onSalvaRicettario({ ...base, ricette: base.ricette || {}, ingredienti_costi: nuoviCosti })
      if (messaggio) notify?.(messaggio)
    } catch (e) {
      notify?.(`Non salvato (${e?.message || 'rete'}): è rimasto tutto com'era.`, false)
    } finally {
      inCorso.current = false
      setSalvando(false)
    }
  }

  async function collega(nomeMP, nomeFornitore) {
    const mp = String(nomeMP || '').trim()
    const forn = normalizzaNomeFornitore(nomeFornitore)
    if (!mp || !forn) return
    const giaCollegati = indice.materiePrime.find(m => m.nome.toLowerCase() === mp.toLowerCase())?.fornitori || []
    if (giaCollegati.some(f => stessoFornitore(f, forn))) {
      notify?.(`${mp} ce l'hai già da ${forn}.`, false)
      setDaCollegare('')
      return
    }
    await salva(collegaFornitore(costi, mp, forn, OPZ), `${mp}: aggiunto ${forn}.`)
    setDaCollegare('')
    // Un fornitore nuovo appena collegato esiste ora anche nell'indice: la
    // scheda «vuota» non serve più.
    setFornitoreVuoto(null)
    setSceltoForn(k => (k === SENZA ? k : chiaveFornitore(forn)))
  }

  async function scollega(nomeMP, nomeFornitore) {
    await salva(scollegaFornitore(costi, nomeMP, nomeFornitore, OPZ), `${nomeMP}: tolto ${nomeFornitore}.`)
  }

  async function principale(nomeMP, nomeFornitore) {
    await salva(rendiPrincipale(costi, nomeMP, nomeFornitore, OPZ),
      `${nomeMP}: il fornitore abituale ora è ${nomeFornitore}.`)
  }

  // ── Stili ──────────────────────────────────────────────────────────────
  const card = {
    background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: R.lg,
    padding: dito ? 14 : 18,
  }
  const rigaElenco = (attiva) => ({
    width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
    padding: dito ? '12px 12px' : '9px 12px', minHeight: dito ? 48 : 40,
    borderRadius: R.md, border: `1px solid ${attiva ? C.red : 'transparent'}`,
    background: attiva ? C.redLight : 'transparent',
    color: C.text, cursor: 'pointer', fontFamily: 'inherit',
  })
  const bottoncino = (forte) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: dito ? 44 : 30, padding: dito ? '0 14px' : '0 10px',
    borderRadius: R.sm, border: `1px solid ${forte ? C.red : C.borderStr}`,
    background: forte ? C.redLight : C.bgCard, color: forte ? C.red : C.textMid,
    fontSize: font.size.sm, fontWeight: 700, cursor: salvando ? 'default' : 'pointer',
    opacity: salvando ? 0.6 : 1, fontFamily: 'inherit', whiteSpace: 'nowrap',
  })
  const campo = {
    width: '100%', height: dito ? 48 : 40, padding: '0 12px', borderRadius: R.md,
    border: `1px solid ${C.borderStr}`, fontSize: dito ? 16 : 13, color: C.text,
    background: C.bgCard, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  }

  const conta = indice.totali
  const nienteInArchivio = conta.materiePrime === 0

  // ── Le tessere in cima ─────────────────────────────────────────────────
  const tessere = (
    <div style={{ display: 'grid', gridTemplateColumns: ui3(isMobile, isTablet, ui.grid4), gap: dito ? 10 : 14, marginBottom: dito ? 16 : 22 }}>
      <KPI label="Fornitori" value={n0(conta.fornitori)} sub="con almeno una materia prima" icon={<Icon name="truck" size={17} />} />
      <KPI label="Materie prime collegate" value={n0(conta.collegate)} sub={`su ${n0(conta.materiePrime)} in archivio`} icon={<Icon name="package" size={17} />} />
      <KPI label="Senza prezzo" value={n0(conta.senzaPrezzo)}
        sub={conta.senzaPrezzo > 0 ? 'il food cost le conta a zero' : 'tutte con un prezzo'}
        color={conta.senzaPrezzo > 0 ? C.amber : undefined} icon={<Icon name="euro" size={17} />} />
      <KPI label="Senza fornitore" value={n0(conta.senzaFornitore)}
        sub={conta.senzaFornitore > 0 ? 'non sai chi chiamare' : 'tutte assegnate'}
        color={conta.senzaFornitore > 0 ? C.amber : undefined} icon={<Icon name="warning" size={17} />} />
    </div>
  )

  // ── Il comando che gira la pagina ──────────────────────────────────────
  const versi = [
    ['fornitori', 'truck', 'Dai fornitori', 'Scegli un fornitore e vedi cosa gli compri'],
    ['materie', 'package', 'Dalle materie prime', 'Scegli una materia prima e vedi chi te la vende'],
  ]
  const selettoreVerso = (
    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
      {versi.map(([id, ico, testo, spiega]) => (
        <button key={id} type="button" onClick={() => { setVerso(id); setCerca('') }}
          aria-pressed={verso === id} title={spiega}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            minHeight: dito ? 44 : 34, padding: dito ? '0 16px' : '0 14px',
            borderRadius: 999, border: `1px solid ${verso === id ? C.red : C.border}`,
            background: verso === id ? C.redLight : C.bgCard,
            color: verso === id ? C.red : C.textMid,
            fontSize: font.size.base, fontWeight: verso === id ? 800 : 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
          <Icon name={ico} size={14} />{testo}
        </button>
      ))}
    </div>
  )

  const ricerca = (
    <div style={{ position: 'relative', marginBottom: 10 }}>
      <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.textSoft, display: 'inline-flex' }}>
        <Icon name="search" size={15} />
      </span>
      <input value={cerca} onChange={e => setCerca(e.target.value)}
        aria-label={verso === 'fornitori' ? 'Cerca un fornitore' : 'Cerca una materia prima'}
        placeholder={verso === 'fornitori' ? 'Cerca un fornitore o cosa gli compri…' : 'Cerca una materia prima o chi te la vende…'}
        style={{ ...campo, paddingLeft: 36 }} />
    </div>
  )

  // ── L'elenco di sinistra ───────────────────────────────────────────────
  const elencoFornitoriLato = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {fornitoriVisti.map(f => {
        const attivo = sceltoForn === f.chiave
        return (
          <button key={f.chiave} type="button" style={rigaElenco(attivo)}
            onClick={() => { setSceltoForn(f.chiave); setDaCollegare('') }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: font.size.base, fontWeight: attivo ? 800 : 600, color: attivo ? C.red : C.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {f.nome}
            </span>
            <span style={{ fontSize: font.size.sm, color: C.textSoft, ...TNUM, flexShrink: 0 }}>{n0(f.quante)}</span>
            {f.senzaPrezzo > 0 && (
              <span title={`${contaMP(f.senzaPrezzo)} senza prezzo: il food cost le conta a zero`}
                style={{ fontSize: font.size.sm, fontWeight: 800, color: C.amber, background: C.amberLight, borderRadius: 6, padding: '2px 7px', flexShrink: 0, ...TNUM, cursor: 'help' }}>
                {n0(f.senzaPrezzo)} senza prezzo
              </span>
            )}
          </button>
        )
      })}

      {indice.senzaFornitore.quante > 0 && !filtro && (
        <button type="button" style={{ ...rigaElenco(sceltoForn === SENZA), marginTop: 8, borderStyle: 'dashed', borderColor: sceltoForn === SENZA ? C.red : C.borderStr }}
          onClick={() => setSceltoForn(SENZA)}>
          <span style={{ color: C.amber, display: 'inline-flex', flexShrink: 0 }}><Icon name="warning" size={14} /></span>
          <span style={{ flex: 1, minWidth: 0, fontSize: font.size.base, fontWeight: 700, color: C.textMid }}>Senza fornitore</span>
          <span style={{ fontSize: font.size.sm, color: C.textSoft, ...TNUM, flexShrink: 0 }}>{n0(indice.senzaFornitore.quante)}</span>
        </button>
      )}

      {fornitoriVisti.length === 0 && (
        <div style={{ padding: 14, fontSize: font.size.base, color: C.textSoft, lineHeight: 1.5 }}>
          {filtro ? 'Nessun fornitore con questo nome.' : 'Nessun fornitore collegato: comincia dalle materie prime senza fornitore.'}
        </div>
      )}
    </div>
  )

  const elencoMateriePrimeLato = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {materieViste.map(m => {
        const attiva = sceltaMP === m.chiave
        return (
          <button key={m.chiave} type="button" style={rigaElenco(attiva)}
            onClick={() => { setSceltaMP(m.chiave); setDaCollegare('') }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: font.size.base, fontWeight: attiva ? 800 : 600, color: attiva ? C.red : C.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {m.nome}
            </span>
            {m.fornitori.length === 0
              ? <span style={{ fontSize: font.size.sm, fontWeight: 800, color: C.amber, background: C.amberLight, borderRadius: 6, padding: '2px 7px', flexShrink: 0 }}>senza fornitore</span>
              : <span style={{ fontSize: font.size.sm, color: C.textSoft, flexShrink: 0, ...TNUM }}>
                {m.fornitori.length === 1 ? m.fornitori[0] : `${n0(m.fornitori.length)} fornitori`}
              </span>}
          </button>
        )
      })}
      {materieViste.length === 0 && (
        <div style={{ padding: 14, fontSize: font.size.base, color: C.textSoft }}>Nessuna materia prima con questo nome.</div>
      )}
    </div>
  )

  // ── La scheda di destra ────────────────────────────────────────────────
  const intestazioneScheda = (titolo, sotto, extra) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {dito && (
          <button type="button" onClick={() => { setSceltoForn(null); setSceltaMP(null) }}
            aria-label="Torna all’elenco"
            style={{ ...bottoncino(false), minWidth: 44, padding: '0 10px' }}>
            <Icon name="arrowL" size={14} />
          </button>
        )}
        <h2 style={{ margin: 0, fontSize: dito ? font.size.lg : font.size.xl, fontWeight: 800, color: C.text, letterSpacing: '-0.015em', minWidth: 0, wordBreak: 'break-word' }}>{titolo}</h2>
      </div>
      <div style={{ marginTop: 5, fontSize: font.size.base, color: C.textSoft, lineHeight: 1.5 }}>{sotto}</div>
      {extra}
    </div>
  )

  // Sono funzioni, non componenti definiti qui dentro. Un componente creato
  // dentro il render cambia identità a ogni ridisegno: React smonta e rimonta
  // il sottoalbero, e il campo dove si sta scrivendo perde il fuoco a ogni
  // lettera battuta. Chiamandole come funzioni l'albero resta lo stesso.
  function schedaFornitore(f) {
    const varianti = (f.varianti || []).length > 1 ? f.varianti : null
    return (
      <div style={card}>
        {intestazioneScheda(
          f.nome,
          f.quante === 0
            ? 'Non gli hai ancora collegato niente. Comincia qui sotto.'
            : `${contaMP(f.quante)}${f.senzaPrezzo > 0 ? ` · ${n0(f.senzaPrezzo)} senza prezzo` : ''}`,
          varianti ? (
            <div style={{ marginTop: 10, padding: '9px 11px', borderRadius: R.sm, background: C.amberLight, border: `1px solid ${C.amber}40`, fontSize: font.size.sm, color: C.text, lineHeight: 1.5 }}>
              In archivio questo nome è scritto in {varianti.length} modi diversi: {varianti.map(v => `«${v}»`).join(', ')}. Uno dei due non combacia con la fattura.
            </div>
          ) : null,
        )}

        {f.materiePrime.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {f.materiePrime.map(m => {
              const suoi = indice.materiePrime.find(x => x.chiave === m.chiave)?.fornitori || []
              const eIlPrincipale = suoi.length > 0 && stessoFornitore(suoi[0], f.nome)
              return (
                <div key={m.chiave} style={{
                  display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                  padding: dito ? '10px 12px' : '8px 12px', borderRadius: R.md,
                  border: `1px solid ${C.borderSoft}`, background: C.bgSubtle,
                }}>
                  <button type="button" onClick={() => { setVerso('materie'); setSceltaMP(m.chiave); setCerca('') }}
                    title={`Vedi tutti i fornitori di ${m.nome}`}
                    style={{ flex: '1 1 160px', minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: dito ? '6px 0' : 0, minHeight: dito ? 32 : 'auto', cursor: 'pointer', fontFamily: 'inherit', fontSize: font.size.base, fontWeight: 700, color: C.red, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                    {m.nome}
                  </button>
                  <Prezzo valore={m.prezzoKg} dito={dito} />
                  {suoi.length > 1 && (eIlPrincipale
                    ? <span title="È il fornitore che si vede nella pagina Materie prime" style={{ fontSize: font.size.sm, fontWeight: 700, color: C.textMid, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, padding: '2px 7px', cursor: 'help' }}>abituale</span>
                    : <button type="button" disabled={salvando} onClick={() => principale(m.nome, f.nome)}
                      title={`Rendi ${f.nome} il fornitore abituale di ${m.nome}`}
                      style={bottoncino(false)}>Rendi abituale</button>)}
                  <button type="button" disabled={salvando} onClick={() => scollega(m.nome, f.nome)}
                    aria-label={`Scollega ${m.nome} da ${f.nome}`} style={bottoncino(false)}>
                    <Icon name="x" size={13} />Scollega
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div>
          <div style={{ fontSize: font.size.sm, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
            Collega una materia prima a {f.nome}
          </div>
          <CampoConElenco
            id={`collega-mp-${f.chiave}`}
            valore={daCollegare}
            onCambia={setDaCollegare}
            voci={nomiMateriePrime}
            placeholder="es. Panna fresca"
            ariaLabel={`Materia prima da collegare a ${f.nome}`}
            stile={campo}
            soloDallElenco
            onCreaNuova={(nome) => collega(nome, f.nome)}
            etichettaCrea="Crea e collega"
            nomeElenco="materie prime"
          />
          <button type="button" disabled={salvando || !daCollegare.trim()} onClick={() => collega(daCollegare, f.nome)}
            style={{ ...bottoncino(true), marginTop: 8, opacity: (salvando || !daCollegare.trim()) ? 0.5 : 1 }}>
            <Icon name="plus" size={14} />{salvando ? 'Salvo…' : 'Collega'}
          </button>
        </div>
      </div>
    )
  }

  function schedaSenzaFornitore() {
    const g = indice.senzaFornitore
    return (
      <div style={card}>
        {intestazioneScheda(
          'Materie prime senza fornitore',
          `${contaMP(g.quante)}. Il giorno che il prezzo cambia, non sai chi chiamare: è il lavoro da fare.`,
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {g.materiePrime.map(m => (
            <div key={m.chiave} style={{
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
              padding: dito ? '10px 12px' : '8px 12px', borderRadius: R.md,
              border: `1px solid ${C.borderSoft}`, background: C.bgSubtle,
            }}>
              <span style={{ flex: '1 1 160px', minWidth: 0, fontSize: font.size.base, fontWeight: 700, color: C.text }}>{m.nome}</span>
              <Prezzo valore={m.prezzoKg} dito={dito} />
              <button type="button" onClick={() => { setVerso('materie'); setSceltaMP(m.chiave); setCerca('') }}
                style={bottoncino(true)}>
                <Icon name="plus" size={13} />Dai un fornitore
              </button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  function schedaMateriaPrima(m) {
    return (
      <div style={card}>
        {intestazioneScheda(
          m.nome,
          m.prezzoKg == null
            ? 'Prezzo non ancora scritto: nel food cost questa materia prima vale zero.'
            : `${fmt(m.prezzoKg)}/kg`,
        )}

        {m.fornitori.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {m.fornitori.map((nome, i) => (
              <div key={chiaveFornitore(nome)} style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                padding: dito ? '10px 12px' : '8px 12px', borderRadius: R.md,
                border: `1px solid ${C.borderSoft}`, background: C.bgSubtle,
              }}>
                <button type="button" onClick={() => { setVerso('fornitori'); setSceltoForn(chiaveFornitore(nome)); setCerca('') }}
                  title={`Vedi tutto quello che compri da ${nome}`}
                  style={{ flex: '1 1 160px', minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: dito ? '6px 0' : 0, minHeight: dito ? 32 : 'auto', cursor: 'pointer', fontFamily: 'inherit', fontSize: font.size.base, fontWeight: 700, color: C.red, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                  {nome}
                </button>
                {i === 0
                  ? <span title="È quello che si vede nella colonna Fornitore della pagina Materie prime" style={{ fontSize: font.size.sm, fontWeight: 700, color: C.textMid, background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 6, padding: '2px 7px', cursor: 'help' }}>abituale</span>
                  : <button type="button" disabled={salvando} onClick={() => principale(m.nome, nome)} style={bottoncino(false)}>Rendi abituale</button>}
                <button type="button" disabled={salvando} onClick={() => scollega(m.nome, nome)}
                  aria-label={`Scollega ${nome} da ${m.nome}`} style={bottoncino(false)}>
                  <Icon name="x" size={13} />Scollega
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: R.md, background: C.amberLight, border: `1px solid ${C.amber}40`, fontSize: font.size.base, color: C.text, lineHeight: 1.5 }}>
            Nessun fornitore collegato: se il prezzo cambia non sai chi chiamare.
          </div>
        )}

        <div>
          <div style={{ fontSize: font.size.sm, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
            Aggiungi un fornitore a {m.nome}
          </div>
          <CampoConElenco
            id={`collega-forn-${m.chiave}`}
            valore={daCollegare}
            onCambia={setDaCollegare}
            voci={nomiFornitori}
            placeholder="Come sta scritto in fattura"
            ariaLabel={`Fornitore da collegare a ${m.nome}`}
            stile={campo}
            nomeElenco="fornitori"
          />
          <div style={{ marginTop: 6, fontSize: font.size.sm, color: C.textSoft, lineHeight: 1.5 }}>
            Scrivi il nome <b>come compare in fattura</b>: è quello che permette di agganciare i documenti. Se c’è già, scegli dall’elenco invece di ribatterlo.
          </div>
          <button type="button" disabled={salvando || !daCollegare.trim()} onClick={() => collega(m.nome, daCollegare)}
            style={{ ...bottoncino(true), marginTop: 8, opacity: (salvando || !daCollegare.trim()) ? 0.5 : 1 }}>
            <Icon name="plus" size={14} />{salvando ? 'Salvo…' : 'Collega'}
          </button>
        </div>
      </div>
    )
  }

  const nienteScelto = (
    <div style={{ ...card, color: C.textSoft, fontSize: font.size.base, lineHeight: 1.55 }}>
      {verso === 'fornitori'
        ? 'Scegli un fornitore dall’elenco per vedere cosa gli compri, e per aggiungere o togliere materie prime.'
        : 'Scegli una materia prima dall’elenco per vedere chi te la vende. Una materia prima può avere più fornitori.'}
    </div>
  )

  const scheda = verso === 'fornitori'
    ? (sceltoForn === SENZA ? schedaSenzaFornitore() : (fornitoreScelto ? schedaFornitore(fornitoreScelto) : nienteScelto))
    : (materiaScelta ? schedaMateriaPrima(materiaScelta) : nienteScelto)

  const qualcosaScelto = verso === 'fornitori' ? (sceltoForn != null) : (sceltaMP != null)

  if (nienteInArchivio) {
    return (
      <div>
        <PageHeader subtitle="Chi ti vende cosa: i fornitori e le materie prime che gli compri, collegati nei due versi." />
        <div style={{ ...card, textAlign: 'center', padding: dito ? 24 : 40 }}>
          <div style={{ color: C.textSoft, display: 'inline-flex', marginBottom: 10 }}><Icon name="package" size={28} /></div>
          <div style={{ fontSize: font.size.lg, fontWeight: 800, color: C.text, marginBottom: 6 }}>Non hai ancora materie prime in archivio</div>
          <div style={{ fontSize: font.size.base, color: C.textSoft, lineHeight: 1.55, maxWidth: 460, margin: '0 auto 16px' }}>
            I collegamenti si fanno sulle materie prime del ricettario. Portale dentro — anche solo il nome, il prezzo si mette dopo — e poi torna qui a dire chi te le vende.
          </div>
          {onNavigate && (
            <button type="button" onClick={() => onNavigate('materie-prime')}
              style={{ ...bottoncino(true), minHeight: 44, padding: '0 18px' }}>
              <Icon name="arrowR" size={14} />Vai alle materie prime
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader subtitle="Chi ti vende cosa. Una materia prima può avere più fornitori e un fornitore più materie prime: qui li colleghi e li scolleghi quando vuoi, partendo dal fornitore o dalla materia prima." />
      {tessere}
      {selettoreVerso}

      <div style={{
        display: dito ? 'block' : 'grid',
        gridTemplateColumns: dito ? undefined : 'minmax(260px, 0.8fr) 1.4fr',
        gap: 18, alignItems: 'start',
      }}>
        {(!dito || !qualcosaScelto) && (
          <div style={{ ...card, padding: dito ? 12 : 14 }}>
            {ricerca}
            <div style={{ maxHeight: dito ? 'none' : '62vh', overflowY: dito ? 'visible' : 'auto' }}>
              {verso === 'fornitori' ? elencoFornitoriLato : elencoMateriePrimeLato}
            </div>
          </div>
        )}
        {(!dito || qualcosaScelto) && (
          <div style={{ marginTop: dito ? 12 : 0 }}>{scheda}</div>
        )}
      </div>

      <div style={{ marginTop: 16, fontSize: font.size.sm, color: C.textSoft, lineHeight: 1.6, display: 'flex', alignItems: 'flex-start', gap: 7 }}>
        <span style={{ flexShrink: 0, marginTop: 2, display: 'inline-flex' }}><Icon name="info" size={13} /></span>
        <span>
          I collegamenti stanno nel ricettario, che è lo stesso per tutte le sedi: quello che scrivi qui vale ovunque.
          Il <Tip text="È il fornitore che compare nella colonna Fornitore della pagina Materie prime, e quello a cui vanno i messaggi di riordino."><span style={{ cursor: 'help', textDecoration: 'underline dotted', textUnderlineOffset: 2 }}>fornitore abituale</span></Tip> di una materia prima è il primo dell’elenco.
        </span>
      </div>
    </div>
  )
}
