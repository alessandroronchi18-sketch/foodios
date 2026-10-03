// ── Dalle fatture: le righe delle fatture diventano prezzi ──────────────
//
// Ottobre 2026. Il titolare carica gli ZIP dell'Agenzia delle Entrate e tremila
// fatture ricevono il dettaglio riga per riga. La pagina Integrazioni
// prometteva i prezzi delle materie prime da lì, e nessuno li leggeva.
//
// Qui le righe si vedono raggruppate per fornitore + descrizione, la spesa
// più alta in cima, e si abbinano **una volta**: «PANNA FRESCA 35% UHT» di
// Cono Artic è la panna. Da quel momento tutte le fatture di quel gruppo
// rifanno listino e storico (le vecchie solo lo storico), e ogni fattura che
// arriva dopo li aggiorna da sola al caricamento degli XML. Detersivi,
// noleggi, servizi: «non è una materia prima», e non ricompaiono.
//
// Il conto sta in `src/lib/prezziDaFatture.js`; la scrittura passa da
// `useBolle.scriviPrezzi`, la stessa di una bolla: listino, storico e mappa
// in una volta sola, e lo stato in memoria cambia solo se il database ha
// detto sì.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { color as T, radius as R, typo, font } from '../lib/theme'
import Icon from '../components/Icon'
import { C, TNUM, fmt0 } from './_shared'
import { supabase } from '../lib/supabase'
import { SK_ABB_FATTURE } from '../lib/storageKeys'
import {
  leggiAbbinamenti, abbina, ignoraAcquisto, raggruppaRigheFatture, decidiPrezziDaFatture,
  suggerisciMateria, contaGruppi, filtraGruppi, fraseDopoAbbinamento, normDescrizione,
} from '../lib/prezziDaFatture'
import { fattureConRighe, statoPrezzi } from '../lib/prezziDaFattureArchivio'

const FS = font.size
const nInt = (v) => Number(v || 0).toLocaleString('it-IT', { useGrouping: 'always' })
const euroKg = (v) => `${Number(v).toLocaleString('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 })} €/kg`
const giornoIt = (g) => (g ? String(g).slice(0, 10).split('-').reverse().join('/') : '—')

const FILTRI = [
  { id: 'da-abbinare', label: 'Da abbinare', conto: 'daAbbinare' },
  { id: 'abbinati', label: 'Abbinati', conto: 'abbinati' },
  { id: 'esclusi', label: 'Esclusi', conto: 'esclusi' },
  { id: 'tutti', label: 'Tutti', conto: 'tutti' },
]

/** Le unità che si contano a pezzi: lì serve sapere quanto pesa un pezzo. */
const A_PEZZI = /^(pz|pezz|n|nr|num|cf|conf|ct|cart|sac|secch|bott|latt|pa|pacc|sc|scat|coll|pce|c62|nar|bt|crt)/i

export default function PrezziDaFattureSection({
  orgId, ricettario, logPrezzi = [], materie = [], utente = null,
  onScriviPrezzi, onTornaAlListino, onNavigate, notify, isMobile = false, dito = false,
}) {
  const [lettura, setLettura] = useState({ stato: 'leggo', fatte: 0, errore: null })
  const [fatture, setFatture] = useState([])
  const [abbinamenti, setAbbinamenti] = useState(() => leggiAbbinamenti(null))
  const [filtro, setFiltro] = useState('da-abbinare')
  const [testo, setTesto] = useState('')
  const [quanti, setQuanti] = useState(40)
  const [aperto, setAperto] = useState(null)       // chiave del gruppo che si sta abbinando
  const [cerca, setCerca] = useState('')
  const [peso, setPeso] = useState('')
  const [salvando, setSalvando] = useState(false)
  // Il doppio tocco: lo `state` arriva un ridisegno dopo, il `ref` subito.
  const inCorso = useRef(false)

  // ── Leggere le fatture e la mappa ─────────────────────────────────────
  useEffect(() => {
    if (!orgId) return undefined
    let vivo = true
    setLettura({ stato: 'leggo', fatte: 0, errore: null })
    ;(async () => {
      try {
        // La mappa si legge in un modo che, se non riesce, lo dice: una
        // lettura fallita presa per «mappa vuota» farebbe riscrivere al
        // primo abbinamento una mappa con dentro solo quello, e tutti gli
        // altri abbinamenti sparirebbero.
        const [elenco, stato] = await Promise.all([
          fattureConRighe(supabase, orgId, { onProgresso: (n) => { if (vivo) setLettura(l => ({ ...l, fatte: n })) } }),
          statoPrezzi(supabase, orgId),
        ])
        if (!vivo) return
        setFatture(elenco)
        setAbbinamenti(stato.abbinamenti)
        setLettura({ stato: 'pronto', fatte: elenco.length, errore: null })
      } catch (e) {
        if (vivo) setLettura({ stato: 'errore', fatte: 0, errore: e?.message || 'errore di rete' })
      }
    })()
    return () => { vivo = false }
  }, [orgId])

  const listino = useMemo(() => ricettario?.ingredienti_costi || {}, [ricettario])
  // Le materie prime che esistono oggi. La firma come testo: `materie` è un
  // elenco nuovo a ogni disegno, e senza i conti qui sotto ripartirebbero a
  // ogni lettera scritta nella ricerca.
  const firmaMaterie = materie.map(m => m.key).join('|')
  const chiaviValide = useMemo(() => new Set(firmaMaterie ? firmaMaterie.split('|') : []), [firmaMaterie])
  const quadro = useMemo(() => raggruppaRigheFatture(fatture, { abbinamenti, chiaviValide }), [fatture, abbinamenti, chiaviValide])
  const conti = useMemo(() => contaGruppi(quadro.gruppi), [quadro])
  const visibili = useMemo(() => filtraGruppi(quadro.gruppi, { filtro, testo }), [quadro, filtro, testo])
  useEffect(() => { setQuanti(40) }, [filtro, testo])
  // Cosa farebbero oggi le fatture già abbinate: i sospetti da confermare, e
  // i prezzi rimasti indietro (un caricamento di XML che non ha potuto
  // scrivere, una materia prima rinominata).
  const previsione = useMemo(
    () => decidiPrezziDaFatture(fatture, { abbinamenti, ingredientiCosti: listino, logPrezzi, utente, chiaviValide }),
    [fatture, abbinamenti, listino, logPrezzi, utente, chiaviValide],
  )
  const inSospeso = previsione.applicati + previsione.storicizzati

  // ── Scrivere ──────────────────────────────────────────────────────────
  //
  // Mappa, listino e storico in una scrittura sola. Se non va, niente cambia
  // a schermo: il titolare rivede la riga com'era e può riprovare.
  const scrivi = async (nuovaMappa, esito) => {
    if (inCorso.current || !onScriviPrezzi) return false
    inCorso.current = true
    setSalvando(true)
    try {
      const cambia = esito && esito.applicati + esito.storicizzati > 0
      const r = await onScriviPrezzi(
        cambia ? { ingredientiCosti: esito.ingredientiCosti, logPrezzi: esito.logPrezzi } : null,
        nuovaMappa ? [{ key: SK_ABB_FATTURE, value: nuovaMappa }] : [],
      )
      if (!r?.ok) {
        notify?.(`Non sono riuscito a salvare (${r?.errore || 'rete'}): non è cambiato niente.`, false)
        return false
      }
      if (nuovaMappa) setAbbinamenti(nuovaMappa)
      return true
    } finally {
      inCorso.current = false
      setSalvando(false)
    }
  }

  const abbinaA = async (g, materia) => {
    const pc = Number(String(peso).replace(/\./g, '').replace(',', '.'))
    const nuova = abbina(abbinamenti, g.chiave, {
      tipo: 'materia', chiave: materia.key, nome: materia.nome,
      pesoConfezioneG: Number.isFinite(pc) && pc > 0 ? pc : null,
    }, { utente })
    const esito = decidiPrezziDaFatture(fatture, { abbinamenti: nuova, ingredientiCosti: listino, logPrezzi, utente, chiaviValide })
    if (await scrivi(nuova, esito)) {
      setAperto(null); setCerca(''); setPeso('')
      notify?.(fraseDopoAbbinamento({ descrizione: g.descrizione, materia, chiaveGruppo: g.chiave, esito }))
    }
  }

  const escludi = async (g) => {
    if (await scrivi(abbina(abbinamenti, g.chiave, { tipo: 'no' }, { utente }), null)) {
      notify?.(`«${g.descrizione}» non è una materia prima: non te lo chiedo più.`)
    }
  }

  const togli = async (g) => {
    if (await scrivi(abbina(abbinamenti, g.chiave, null), null)) {
      notify?.(`«${g.descrizione}» torna da abbinare. I prezzi già scritti restano nello storico.`)
    }
  }

  const conferma = async (p) => {
    const esito = decidiPrezziDaFatture(fatture, { abbinamenti, ingredientiCosti: listino, logPrezzi, utente, chiaviValide, forza: [p.id] })
    if (await scrivi(null, esito)) notify?.(`${p.nome}: ${euroKg(p.prezzoKg)} dalla fattura ${p.numero} del ${giornoIt(p.giorno)}.`)
  }

  const scarta = async (p) => {
    if (await scrivi(ignoraAcquisto(abbinamenti, p.id, { utente }), null)) {
      notify?.(`Scartato: il prezzo della fattura ${p.numero} non entra.`)
    }
  }

  const applicaInSospeso = async () => {
    if (await scrivi(null, previsione)) {
      notify?.(`Applicato: ${nInt(previsione.applicati)} al listino, ${nInt(previsione.storicizzati)} ${previsione.storicizzati === 1 ? 'riga' : 'righe'} nello storico.`)
    }
  }

  // ── Stili ─────────────────────────────────────────────────────────────
  const alto = dito ? 44 : 34
  const pulsante = (pieno) => ({
    padding: '0 12px', minHeight: alto, borderRadius: R.md, fontSize: FS.sm, fontWeight: 700,
    fontFamily: 'inherit', cursor: salvando ? 'default' : 'pointer', whiteSpace: 'nowrap',
    display: 'inline-flex', alignItems: 'center', gap: 6, opacity: salvando ? 0.6 : 1,
    ...(pieno
      ? { background: C.red, color: C.white, border: 'none' }
      : { background: 'transparent', color: C.textMid, border: `1px solid ${C.borderStr}` }),
  })
  const campo = {
    padding: '10px 12px', minHeight: 44, borderRadius: R.md, border: `1px solid ${C.borderStr}`,
    fontSize: FS.base, fontFamily: 'inherit', background: C.bgCard, color: C.text, width: '100%', boxSizing: 'border-box',
  }
  const etichetta = { display: 'block', ...typo.caption, fontWeight: 700, color: C.textSoft, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }

  const torna = onTornaAlListino && (
    <button type="button" onClick={onTornaAlListino} style={pulsante(false)}>
      <Icon name="chevL" size={13} /> Torna al listino
    </button>
  )

  // ── Intestazione ──────────────────────────────────────────────────────
  const intestazione = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <div style={{ fontSize: FS.lg, fontWeight: 800, color: C.text }}>Dalle fatture</div>
        {lettura.stato === 'pronto' && (
          <span style={{ ...typo.caption, color: C.textSoft, fontWeight: 600 }}>
            {nInt(quadro.fattureLette)} {quadro.fattureLette === 1 ? 'fattura con il dettaglio' : 'fatture con il dettaglio'} · {nInt(conti.tutti)} {conti.tutti === 1 ? 'prodotto' : 'prodotti'}
          </span>
        )}
      </div>
      <div style={{ fontSize: FS.sm, color: C.textSoft, marginBottom: 14, lineHeight: 1.5 }}>
        Le righe delle fatture elettroniche, raggruppate per fornitore e prodotto. Dici una volta
        che cos&rsquo;è ognuno: da lì il prezzo al chilo entra nel listino e nello storico da solo,
        a ogni fattura che carichi.
      </div>
    </>
  )

  if (lettura.stato === 'leggo') {
    return (
      <div>
        {intestazione}
        <div role="status" style={{ padding: '28px 16px', textAlign: 'center', color: C.textSoft, fontSize: FS.base, ...TNUM }}>
          {lettura.fatte > 0 ? `Leggo le fatture · ${nInt(lettura.fatte)}` : 'Leggo le fatture…'}
        </div>
        {torna}
      </div>
    )
  }

  if (lettura.stato === 'errore') {
    return (
      <div>
        {intestazione}
        <div role="alert" style={{ background: C.alertLight, border: `1px solid ${C.alert}33`, borderRadius: R.lg, padding: '12px 14px', fontSize: FS.base, color: C.alertDark, lineHeight: 1.5, marginBottom: 14 }}>
          Non sono riuscito a leggere le fatture ({lettura.errore}). Riprova fra poco: non ho scritto niente.
        </div>
        {torna}
      </div>
    )
  }

  if (!quadro.fattureLette) {
    return (
      <div>
        {intestazione}
        <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: R.xl, padding: isMobile ? 16 : 20, marginBottom: 14, fontSize: FS.base, color: C.textMid, lineHeight: 1.6 }}>
          Nessuna fattura ha ancora il dettaglio dei prodotti. Si carica dallo Scadenzario, con lo
          ZIP che scarichi dal sito dell&rsquo;Agenzia delle Entrate: le righe arrivano da lì.
          {onNavigate && (
            <div style={{ marginTop: 12 }}>
              <button type="button" onClick={() => onNavigate('scadenzario')} style={pulsante(true)}>
                Vai allo Scadenzario <Icon name="chevR" size={13} />
              </button>
            </div>
          )}
        </div>
        {torna}
      </div>
    )
  }

  // ── Il pannello per abbinare un gruppo ────────────────────────────────
  const pannelloAbbina = (g) => {
    const q = normDescrizione(cerca)
    const suggerita = suggerisciMateria(g.descrizione, materie)
    const trovate = (q ? materie.filter(m => normDescrizione(m.nome).includes(q)) : (suggerita ? [suggerita] : []))
      .slice(0, 8)
    const aPezzi = A_PEZZI.test(String(g.unita || '').trim()) || /peso di uno/.test(g.problema || '')
    return (
      <div style={{ marginTop: 10, padding: isMobile ? 12 : 14, background: C.bgSubtle, borderRadius: R.lg, border: `1px solid ${C.borderSoft}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile || !aPezzi ? '1fr' : '1fr 220px', gap: 10 }}>
          <div>
            <label htmlFor={`cerca-${g.chiave}`} style={etichetta}>Quale materia prima è</label>
            <input id={`cerca-${g.chiave}`} value={cerca} autoFocus onChange={e => setCerca(e.target.value)}
              placeholder="Cerca nel listino, es. panna" style={campo} />
          </div>
          {aPezzi && (
            <div>
              <label htmlFor={`peso-${g.chiave}`} style={etichetta}>Quanto pesa un pezzo, in grammi</label>
              <input id={`peso-${g.chiave}`} value={peso} onChange={e => setPeso(e.target.value)}
                inputMode="decimal" placeholder="es. 25000 per un sacco da 25 kg" style={{ ...campo, ...TNUM }} />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {trovate.map(m => (
            <button key={m.key} type="button" disabled={salvando} onClick={() => abbinaA(g, m)} style={pulsante(true)}>
              <Icon name="check" size={13} /> {m.nome}
            </button>
          ))}
          {q && !trovate.length && (
            <span style={{ fontSize: FS.sm, color: C.textSoft, alignSelf: 'center' }}>
              Nel listino non c&rsquo;è. Creala con «Nuova materia prima» e torna qui.
            </span>
          )}
          <button type="button" disabled={salvando} onClick={() => { setAperto(null); setCerca(''); setPeso('') }} style={pulsante(false)}>
            Annulla
          </button>
        </div>
      </div>
    )
  }

  // ── Una riga dell'elenco ──────────────────────────────────────────────
  const scheda = (g) => {
    const abb = g.abbinamento
    const suggerita = g.stato === 'da-abbinare' ? suggerisciMateria(g.descrizione, materie) : null
    return (
      <div key={g.chiave} style={{ padding: isMobile ? '12px 14px' : '12px 16px', borderBottom: `1px solid ${C.borderSoft}` }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: FS.md, fontWeight: 700, color: C.text, overflowWrap: 'anywhere' }}>{g.descrizione}</div>
            <div style={{ fontSize: FS.sm, color: C.textSoft, marginTop: 2, lineHeight: 1.45 }}>
              {g.fornitore} · {nInt(g.volte)} {g.volte === 1 ? 'acquisto' : 'acquisti'} · l&rsquo;ultimo il {giornoIt(g.ultima)}
            </div>
            <div style={{ fontSize: FS.sm, marginTop: 4, lineHeight: 1.45 }}>
              {g.prezzoKg != null ? (
                <span title={g.spiegazione.join(' · ')} style={{ color: C.textMid, cursor: 'help', ...TNUM }}>
                  Ultimo prezzo <strong style={{ color: C.text }}>{euroKg(g.prezzoKg)}</strong>
                  {g.avvisi.length > 0 && <span style={{ color: C.amberDark }}> · da controllare</span>}
                </span>
              ) : g.stato === 'non-merce' ? null : (
                <span style={{ color: C.amberDark }}>Prezzo al chilo: non lo so — {g.problema}</span>
              )}
            </div>
            {g.abbinamentoPerso && (
              <div style={{ fontSize: FS.sm, color: C.amberDark, marginTop: 4, lineHeight: 1.45 }}>
                Era abbinato a «{g.abbinamentoPerso}», che nel listino non c&rsquo;è più: abbinalo di nuovo.
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: FS.md, fontWeight: 800, color: C.text, ...TNUM }}>{fmt0(g.spesa)}</div>
            <div style={{ ...typo.caption, color: C.textSoft }}>spesa</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'center' }}>
          {g.stato === 'abbinato' && (
            <>
              <span style={{ ...typo.small, fontWeight: 700, color: C.green, background: C.greenLight, borderRadius: R.sm, padding: '4px 8px' }}>
                È {abb.nome}{abb.pesoConfezioneG ? ` · un pezzo pesa ${nInt(abb.pesoConfezioneG)} g` : ''}
              </span>
              <button type="button" disabled={salvando} onClick={() => { setAperto(g.chiave); setCerca(''); setPeso(abb.pesoConfezioneG ? String(abb.pesoConfezioneG) : '') }} style={pulsante(false)}>
                <Icon name="edit" size={13} /> Cambia
              </button>
              <button type="button" disabled={salvando} onClick={() => togli(g)} style={pulsante(false)}>Togli</button>
            </>
          )}
          {g.stato === 'escluso' && (
            <>
              <span style={{ ...typo.small, fontWeight: 700, color: C.textSoft, background: C.bgSubtle, borderRadius: R.sm, padding: '4px 8px' }}>Non è una materia prima</span>
              <button type="button" disabled={salvando} onClick={() => togli(g)} style={pulsante(false)}>Rimetti da abbinare</button>
            </>
          )}
          {g.stato === 'non-merce' && (
            <span title="Lo dice la riga da sola: non entra nel listino." style={{ ...typo.small, fontWeight: 700, color: C.textSoft, background: C.bgSubtle, borderRadius: R.sm, padding: '4px 8px', cursor: 'help' }}>
              {g.classe === 'servizio' ? 'Servizio, non merce' : g.classe === 'campione' ? 'Campione' : g.classe === 'reso' ? 'Reso' : 'Non è merce'}
            </span>
          )}
          {g.stato === 'da-abbinare' && aperto !== g.chiave && (
            <>
              {suggerita && (
                <button type="button" disabled={salvando} onClick={() => abbinaA(g, suggerita)} style={pulsante(true)}>
                  <Icon name="check" size={13} /> È {suggerita.nome}
                </button>
              )}
              <button type="button" disabled={salvando} onClick={() => { setAperto(g.chiave); setCerca(''); setPeso('') }} style={pulsante(!suggerita)}>
                <Icon name="search" size={13} /> {suggerita ? 'Scegli un\'altra' : 'Abbina'}
              </button>
              <button type="button" disabled={salvando} onClick={() => escludi(g)} style={pulsante(false)}>
                Non è una materia prima
              </button>
            </>
          )}
        </div>
        {aperto === g.chiave && pannelloAbbina(g)}
      </div>
    )
  }

  return (
    <div>
      {intestazione}

      {/* ── I prezzi che aspettano una conferma ──────────────────────── */}
      {previsione.daConfermare.length > 0 && (
        <div style={{ background: T.fondoAvviso, border: `1px solid ${T.bordoAvviso}`, borderRadius: R.xl, padding: isMobile ? 12 : '12px 16px', marginBottom: 14 }}>
          <div style={{ fontSize: FS.md, fontWeight: 800, color: C.amberDark, marginBottom: 4 }}>
            {previsione.daConfermare.length === 1 ? 'Un prezzo da confermare' : `${nInt(previsione.daConfermare.length)} prezzi da confermare`}
          </div>
          <div style={{ fontSize: FS.sm, color: C.textMid, lineHeight: 1.5, marginBottom: 8 }}>
            Cambiano più della metà rispetto a prima. Di solito è un&rsquo;unità di misura diversa o un
            peso sbagliato, non un rincaro: guardali prima che entrino nel food cost.
          </div>
          {previsione.daConfermare.slice(0, 12).map(p => (
            <div key={p.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${T.bordoAvviso}` }}>
              <div style={{ flex: '1 1 240px', minWidth: 0, fontSize: FS.sm, color: C.text, lineHeight: 1.45 }}>
                <strong>{p.nome}</strong>: {euroKg(p.prezzoKg)}{p.prezzoPrima != null ? `, prima ${euroKg(p.prezzoPrima)}` : ''}
                <div style={{ color: C.textSoft }} title={p.spiegazione.join(' · ')}>
                  fattura {p.numero} del {giornoIt(p.giorno)} · {p.fornitore}{p.azione === 'soloStorico' ? ' · solo per lo storico' : ''}
                </div>
              </div>
              <button type="button" disabled={salvando} onClick={() => conferma(p)} style={pulsante(true)}>Applica</button>
              <button type="button" disabled={salvando} onClick={() => scarta(p)} style={pulsante(false)}>Scarta</button>
            </div>
          ))}
          {previsione.daConfermare.length > 12 && (
            <div style={{ fontSize: FS.sm, color: C.textSoft, marginTop: 4 }}>…e altri {nInt(previsione.daConfermare.length - 12)}.</div>
          )}
        </div>
      )}

      {/* ── Prezzi rimasti indietro ──────────────────────────────────── */}
      {inSospeso > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: R.xl, padding: isMobile ? 12 : '12px 16px', marginBottom: 14 }}>
          <div style={{ flex: '1 1 260px', fontSize: FS.sm, color: C.textMid, lineHeight: 1.5 }}>
            Dalle fatture già abbinate ci sono prezzi non ancora entrati: {nInt(previsione.applicati)} nel listino
            e {nInt(previsione.storicizzati)} {previsione.storicizzati === 1 ? 'riga' : 'righe'} di storico.
          </div>
          <button type="button" disabled={salvando} onClick={applicaInSospeso} style={pulsante(true)}>Applica</button>
        </div>
      )}

      {/* ── Filtri ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }} role="tablist" aria-label="Quali prodotti mostrare">
        {FILTRI.map(f => {
          const attivo = filtro === f.id
          return (
            <button key={f.id} type="button" role="tab" aria-selected={attivo} onClick={() => setFiltro(f.id)}
              style={{ ...pulsante(false), ...(attivo ? { background: T.brandLight, color: T.brand, borderColor: T.brand } : null), opacity: 1, cursor: 'pointer' }}>
              {f.label} <span style={{ ...TNUM, fontWeight: 800 }}>{nInt(conti[f.conto])}</span>
            </button>
          )
        })}
      </div>
      <div style={{ marginBottom: 14 }}>
        <input value={testo} onChange={e => setTesto(e.target.value)} aria-label="Cerca un prodotto o un fornitore"
          placeholder="Cerca un prodotto o un fornitore…" style={campo} />
      </div>

      <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: R.xl, overflow: 'hidden' }}>
        {visibili.length === 0 ? (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: C.textSoft, fontSize: FS.base }}>
            {testo.trim() ? `Nessun prodotto che corrisponde a «${testo}».`
              : filtro === 'da-abbinare' ? 'Niente da abbinare: ogni prodotto delle fatture ha già il suo posto.'
                : 'Nessun prodotto qui.'}
          </div>
        ) : visibili.slice(0, quanti).map(scheda)}
      </div>
      {visibili.length > quanti && (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button type="button" onClick={() => setQuanti(q => q + 40)} style={{ ...pulsante(false), opacity: 1, cursor: 'pointer' }}>
            Mostra altri {nInt(Math.min(40, visibili.length - quanti))} di {nInt(visibili.length - quanti)}
          </button>
        </div>
      )}

      <div style={{ fontSize: FS.sm, color: C.textSoft, marginTop: 12, lineHeight: 1.5 }}>
        Non contano le note di credito{quadro.noteDiCredito ? ` (${nInt(quadro.noteDiCredito)})` : ''} e le righe
        a zero o in negativo{quadro.righeSenzaImporto ? ` (${nInt(quadro.righeSenzaImporto)})` : ''}: sconti, abbuoni,
        omaggi e righe di solo testo non sono prezzi d&rsquo;acquisto.
      </div>
      <div style={{ marginTop: 14 }}>{torna}</div>
    </div>
  )
}
