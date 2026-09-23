// Il giro: cosa serve, quando conviene partire.
//
// ── Perché questa banda esiste ───────────────────────────────────────────
//
// Il titolare, 23/09/2026: «si perde un sacco di tempo e un sacco di risorse
// con i trasferimenti da sede. Magari i trasferimenti vengono fatti anche
// tutti i giorni ma solo per un kg di gelato o per poche materie prime».
//
// Un chilo di gelato sono otto coni: non portarlo costa 30-40 € fra margine
// perso e prodotto buttato, e il viaggio costa 40-60 minuti più una persona
// tolta dal banco. Siamo quasi in pareggio, ed è per questo che ogni singolo
// viaggio preso da solo è giustificabile — e intanto se ne fanno trecento
// all'anno. Si vince facendo **meno viaggi più pieni**.
//
// ── Chi scrive in lista: tutt'e due ──────────────────────────────────────
//
// Scelta del titorare, 23/09/2026 (opzione «c»): Foodos propone quello che
// vede dalle giacenze, e **chi è al banco aggiunge quello che sa lui**.
// Nessuna delle due da sola basta: le giacenze non sanno che domani c'è un
// evento, e chi è al banco non ha il tempo di guardare tre magazzini.
//
// Il conto sta tutto in `src/lib/giriTrasferimenti.js`, con le sue 29 prove:
// qui c'è solo la schermata.
import React, { useEffect, useMemo, useState } from 'react'
import Icon from './Icon'
import { sload, ssave } from '../lib/storage'
import { SK_GIRI, SK_LISTA_GIRO, SK_MAG } from '../lib/storageKeys'
import { color as T, radius as R, font, typo } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { prossimoGiro, decidiGiro, ritiriSullaStrada, dividiProduzione, GIORNI } from '../lib/giriTrasferimenti'
import { creaTrasferimento } from '../lib/trasferimenti'
import { mezzoCheBasta, ciSta, chiPuoAndare, MEZZI } from '../lib/mezziTrasporto'
import { supabase } from '../lib/supabase'

const GIORNI_CORTI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']

/** Grammi come li scrive una persona: sotto il chilo in grammi, sopra in chili. */
function scrivi(g) {
  const n = Number(g)
  if (!Number.isFinite(n) || n <= 0) return '—'
  return n >= 1000
    ? `${(n / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 })} kg`
    : `${Math.round(n).toLocaleString('it-IT', { useGrouping: 'always' })} g`
}

/**
 * @param {object}   props
 * @param {string}   props.orgId
 * @param {string}   props.sedeId
 * @param {Array}    props.sedi
 * @param {object}   props.sedeAttiva
 * @param {Function} props.notify
 * @param {Function} [props.onCreato]  dopo aver creato i trasferimenti
 */
export default function GiroTrasferimenti({ orgId, sedeId, sedi = [], sedeAttiva = null, notify, onCreato = null }) {
  const suTelefono = useIsMobile()
  const suTablet = useIsTablet()
  const dito = suTelefono || suTablet

  const [impostazioni, setImpostazioni] = useState(undefined)
  const [lista, setLista] = useState([])
  const [magazzino, setMagazzino] = useState({})
  const [nuovo, setNuovo] = useState({ prodotto: '', quantita: '', da: '', tipo: 'materia_prima' })
  const [staGiaAndando, setStaGiaAndando] = useState(false)
  const [conMezzo, setConMezzo] = useState(null)
  const [fornitori, setFornitori] = useState([])
  const [ordini, setOrdini] = useState([])
  const [persone, setPersone] = useState([])
  const [apriGiorni, setApriGiorni] = useState(false)
  const [apriQuote, setApriQuote] = useState(false)
  const [nuovoGusto, setNuovoGusto] = useState({ nome: '', da: '', totale: '' })
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    let vivo = true
    if (!orgId) { setImpostazioni(null); return () => { vivo = false } }
    Promise.all([
      sload(SK_GIRI, orgId, null),
      sedeId ? sload(SK_LISTA_GIRO, orgId, sedeId) : Promise.resolve([]),
      sedeId ? sload(SK_MAG, orgId, sedeId) : Promise.resolve({}),
    ]).then(([g, l, m]) => {
      if (!vivo) return
      setImpostazioni(g && typeof g === 'object' ? g : { giorni: [] })
      setLista(Array.isArray(l) ? l : [])
      setMagazzino(m && typeof m === 'object' ? m : {})
    })
    return () => { vivo = false }
  }, [orgId, sedeId])

  // Chi sta da queste parti, e cosa c'è da ritirare. Due letture leggere: i
  // campi che servono e basta.
  useEffect(() => {
    let vivo = true
    if (!orgId) return () => { vivo = false }
    Promise.all([
      supabase.from('fornitori').select('id, nome, telefono, vicino_a_sede, si_ritira')
        .eq('organization_id', orgId).eq('attivo', true),
      supabase.from('ordini_fornitori').select('fornitore_id, stato')
        .eq('organization_id', orgId).eq('stato', 'inviato'),
      // Chi può guidare e con cosa: serve a non proporre un giro a chi non
      // può farlo, che è far perdere tempo a chi legge.
      supabase.from('dipendenti').select('id, nome, patente, mezzi')
        .eq('organization_id', orgId).eq('attivo', true),
    ]).then(([f, o, d]) => {
      if (!vivo) return
      setFornitori(f?.data || [])
      setOrdini(o?.data || [])
      setPersone(d?.data || [])
    })
    return () => { vivo = false }
  }, [orgId])

  const oggi = useMemo(() => {
    const d = new Date()
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(d).reduce((a, x) => ({ ...a, [x.type]: x.value }), {})
    return `${p.year}-${p.month}-${p.day}`
  }, [])

  const giro = useMemo(
    () => prossimoGiro(oggi, impostazioni?.giorni || []),
    [oggi, impostazioni],
  )

  // ── Quello che Foodos vede da solo ─────────────────────────────────────
  //
  // Le materie prime sotto la loro soglia in QUESTO negozio. Non è una
  // previsione: è quello che è scritto in magazzino. Se la soglia non c'è,
  // la riga non compare — una soglia a zero non vuol dire «non serve mai».
  const proposte = useMemo(() => {
    const out = []
    for (const [chiave, v] of Object.entries(magazzino || {})) {
      const giacenza = Number(v?.giacenza_g) || 0
      const soglia = Number(v?.soglia_g) || 0
      if (soglia <= 0 || giacenza > soglia) continue
      if (lista.some(r => r.chiave === chiave)) continue
      out.push({
        chiave, prodotto: v?.nome || chiave, giacenza, soglia,
        quantita: Math.max(soglia * 2 - giacenza, soglia),
        // Vengono dal magazzino delle materie prime: lì non c'è gelato.
        tipo: 'materia_prima',
        daFoodos: true,
      })
    }
    return out.sort((a, b) => a.giacenza - b.giacenza)
  }, [magazzino, lista])

  const decisione = useMemo(
    () => decidiGiro(lista, { giro, staGiaAndando }),
    [lista, giro, staGiaAndando],
  )

  // Quanto pesa tutto quello che è in lista, e con che mezzo ci sta.
  const pesoTotale = useMemo(
    () => lista.reduce((s, r) => s + (Number(r.quantita) || 0), 0),
    [lista],
  )
  const consigliato = useMemo(() => mezzoCheBasta(pesoTotale), [pesoTotale])
  const capienza = useMemo(() => ciSta(pesoTotale, conMezzo || consigliato?.id), [pesoTotale, conMezzo, consigliato])

  // ── Già che vai da quella parte ───────────────────────────────────────
  //
  // Il viaggio si fa comunque: se un fornitore da cui si ritira sta da queste
  // parti e ha un ordine pronto, ricordarselo **adesso** vale un viaggio
  // intero. Se nessuno se lo ricorda, si fa due volte la stessa strada.
  const ritiri = useMemo(
    () => ritiriSullaStrada(sedeId, fornitori, ordini),
    [sedeId, fornitori, ordini],
  )

  // Chi può fare questo giro col mezzo scelto. Il motivo conta quanto
  // l'elenco: «Anna non può» è un vicolo cieco, «Anna non ha la patente»
  // dice a chi legge cosa fare.
  const chiCiVa = useMemo(
    () => chiPuoAndare(persone, conMezzo || consigliato?.id),
    [persone, conMezzo, consigliato],
  )

  async function salvaLista(l) {
    try { await ssave(SK_LISTA_GIRO, l, orgId, sedeId); setLista(l); return true } catch (e) {
      notify?.('Non sono riuscito a salvare la lista: ' + (e?.message || 'rete'), false)
      return false
    }
  }

  /**
   * I gusti che si fanno in un posto solo.
   *
   * Il titolare, 23/09/2026: «magari un gusto lo si fa solo in un posto tipo
   * Carlina e poi lo si smista». È l'unica delle tre cause che non è un
   * errore di previsione — e proprio per questo è l'unica che si può
   * **togliere**: deciderlo quando si produce fa partire la roba già divisa,
   * col giro fisso, invece di generare una corsa il giorno che un banco
   * resta vuoto.
   */
  const quote = useMemo(() => (Array.isArray(impostazioni?.quote) ? impostazioni.quote : []), [impostazioni])

  // Quanto spetta a questo negozio, per ogni gusto che fa qualcun altro.
  const spettanze = useMemo(() => quote.map(g => {
    const { per } = dividiProduzione(Number(g.totale) || 0, g.per || [])
    const mia = per.find(p => String(p.sedeId) === String(sedeId))
    return { ...g, mia: mia?.quantita ?? null, tutte: per }
  }).filter(g => String(g.da || '') !== String(sedeId) && g.mia > 0), [quote, sedeId])

  async function salvaImpostazioni(i) {
    try { await ssave(SK_GIRI, i, orgId, null); setImpostazioni(i); return true } catch (e) {
      notify?.('Non sono riuscito a salvare i giorni del giro: ' + (e?.message || 'rete'), false)
      return false
    }
  }

  function giornoSuGiu(g) {
    const ora = impostazioni?.giorni || []
    const nuovi = ora.includes(g) ? ora.filter(x => x !== g) : [...ora, g].sort()
    salvaImpostazioni({ ...(impostazioni || {}), giorni: nuovi })
  }

  async function aggiungi(riga) {
    const q = Number(String(riga.quantita ?? '').replace(',', '.'))
    await salvaLista([...lista, {
      id: `l-${Date.now()}-${lista.length}`,
      chiave: riga.chiave || null,
      prodotto: String(riga.prodotto || '').trim(),
      // `null`, non `0`: «non lo so» e «zero grammi» sono due cose diverse, e
      // uno zero in lista è una riga che al banco nessuno sa cosa voglia dire.
      quantita: Number.isFinite(q) && q > 0 ? q : null,
      unita: 'g',
      // ── Materia prima o gelato? ─────────────────────────────────────────
      //
      // Non è un'etichetta: decide **quale giacenza si muove**. Una materia
      // prima scarica e carica `pasticceria-magazzino-v1`; un prodotto finito
      // va sulla vetrina. Scritte tutte come «materia prima», una riga di
      // gelato chiamata «pistacchio» andava a scalare la **pasta** di
      // pistacchio — in silenzio, se l'ingrediente esisteva con lo stesso
      // nome. Trovato dall'audit del 23/09/2026.
      tipo: riga.tipo === 'prodotto' ? 'prodotto' : 'materia_prima',
      giacenza: riga.giacenza ?? null,
      consumoGiornaliero: riga.consumoGiornaliero ?? null,
      da: riga.da || null,
      daFoodos: riga.daFoodos === true,
    }])
  }

  /**
   * Crea i trasferimenti veri per quello che è in lista.
   *
   * La merce si muove da un'altra sede verso questa: `sede_da` è chi manda,
   * `sede_a` è chi riceve — cioè noi. Una riga senza «da chi» non si crea:
   * un trasferimento senza mittente è una giacenza che nasce dal nulla.
   */
  async function creaGiro() {
    if (salvando) return
    const daFare = lista.filter(r => r.da && r.prodotto && Number(r.quantita) > 0)
    if (!daFare.length) {
      // Due motivi diversi, e vale la pena distinguerli: senza «da chi» non
      // si sa chi manda, senza quantità non si sa cosa scaricargli.
      const senzaDa = lista.some(r => r.prodotto && !r.da)
      notify?.(senzaDa
        ? 'Scrivi da quale negozio arriva ogni cosa: senza, non posso creare il trasferimento.'
        : 'Scrivi quanto ti serve: un trasferimento senza quantità non si può registrare.', false)
      return
    }
    setSalvando(true)
    // Gli id di quelli che sono partiti **davvero**, non il loro numero.
    //
    // Prima qui c'era un contatore e poi `daFare.slice(0, fatti)`: se
    // falliva la riga di mezzo — la seconda di tre — il conto diceva «due
    // fatti» e toglieva dalla lista la prima e la **seconda**. Cioè toglieva
    // proprio quella che non era partita, e lasciava dentro la terza che
    // invece era già in viaggio. Due errori in un colpo: una consegna persa e
    // una chiesta due volte.
    const partiti = new Set()
    try {
      for (const r of daFare) {
        try {
          await creaTrasferimento({
            orgId, sedeDa: r.da, sedeA: sedeId,
            tipo: r.tipo === 'prodotto' ? 'prodotto' : 'materia_prima',
            prodotto: r.prodotto, quantita: (r.quantita || 0) / 1000, unita: 'kg',
          })
          partiti.add(r.id)
        } catch (e) {
          notify?.(`«${r.prodotto}» non è partito: ${e?.message || 'errore'}`, false)
        }
      }
      const fatti = partiti.size
      if (fatti > 0) {
        // Solo quello che è partito davvero esce dalla lista: una riga che
        // non si è creata deve restare lì, o la si perde senza accorgersene.
        await salvaLista(lista.filter(r => !partiti.has(r.id)))
        notify?.(`${fatti} ${fatti === 1 ? 'trasferimento creato' : 'trasferimenti creati'}. Chi manda li vedrà nella sua pagina.`)
        onCreato?.()
      }
    } finally {
      setSalvando(false)
    }
  }

  if (!orgId || !sedeId || impostazioni === undefined) return null

  const card = {
    background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16,
    padding: suTelefono ? '14px' : '18px 20px', marginBottom: 18,
  }
  const campo = {
    width: '100%', padding: '9px 11px', borderRadius: R.sm,
    border: `1px solid ${T.borderStr}`, fontSize: font.size.lg,
    boxSizing: 'border-box', fontFamily: 'inherit', background: T.bgCard, color: T.text,
  }
  const colore = decisione.azione === 'esci-adesso' ? T.red
    : decisione.azione === 'porta-tutto' ? T.brand : T.textSoft

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, flexWrap: 'wrap' }}>
        <span style={{ flexShrink: 0, marginTop: 2, color: colore }}>
          <Icon name={decisione.azione === 'aspetta' || decisione.azione === 'niente' ? 'clock' : 'truck'} size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: font.size.md, fontWeight: 800, color: T.text }}>
            Il giro di {sedeAttiva?.nome || 'questo negozio'}
          </div>
          <div style={{ fontSize: font.size.base, color: T.textMid, lineHeight: 1.6, marginTop: 3 }}>
            {decisione.frase}
          </div>
        </div>
      </div>

      {/* ── I giorni del giro ─────────────────────────────────────────────
          Senza, tutto resta un «non lo so»: il conto ha bisogno di sapere
          quando passa il prossimo, non di indovinarlo. */}
      <div style={{ marginTop: 14 }}>
        <button type="button" onClick={() => setApriGiorni(v => !v)} aria-expanded={apriGiorni}
          style={{
            padding: '7px 12px', minHeight: dito ? 44 : 36, background: 'transparent',
            color: T.textMid, border: `1px solid ${T.border}`, borderRadius: R.sm,
            fontSize: typo.small.fontSize, fontWeight: 700, fontFamily: 'inherit',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7,
          }}>
          <Icon name="calendar" size={13} />
          {(impostazioni?.giorni || []).length
            ? `Giro: ${(impostazioni.giorni).map(g => GIORNI[g]).join(' e ')}`
            : 'Quali giorni si fa il giro?'}
        </button>
        <button type="button" onClick={() => setApriQuote(v => !v)} aria-expanded={apriQuote}
          style={{
            marginLeft: 8, padding: '7px 12px', minHeight: dito ? 44 : 36, background: 'transparent',
            color: T.textMid, border: `1px solid ${T.border}`, borderRadius: R.sm,
            fontSize: typo.small.fontSize, fontWeight: 700, fontFamily: 'inherit',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7,
          }}>
          <Icon name="layers" size={13} />
          {quote.length ? `${quote.length} ${quote.length === 1 ? 'gusto smistato' : 'gusti smistati'}` : 'Un gusto si fa in un posto solo?'}
        </button>
        {apriQuote && (
          <div style={{ marginTop: 10, padding: '12px 13px', background: T.bgSubtle, borderRadius: R.sm }}>
            <div style={{ fontSize: typo.caption.fontSize, color: T.textSoft, lineHeight: 1.55, marginBottom: 10 }}>
              Scrivi chi lo fa, quanto ne fa per tutti e come si divide. Da qui in poi parte già
              diviso col giro, invece di far nascere una corsa il giorno che un banco resta vuoto.
            </div>
            {quote.map((g, i) => (
              <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '6px 0', borderTop: `1px solid ${T.borderSoft}`, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160, fontSize: font.size.base, color: T.text }}>
                  <b>{g.nome}</b>
                  <span style={{ color: T.textSoft }}>
                    {' '}\u2014 la fa {sedi.find(x => String(x.id) === String(g.da))?.nome || '?'}, {g.totale} kg divisi{' '}
                    {(g.per || []).map(p => `${sedi.find(x => String(x.id) === String(p.sedeId))?.nome || '?'} ${p.quota}`).join(' \u00B7 ')}
                  </span>
                </div>
                <button type="button" aria-label={`Togli ${g.nome}`} title="Togli"
                  onClick={() => salvaImpostazioni({ ...(impostazioni || {}), quote: quote.filter((_, j) => j !== i) })}
                  style={{
                    width: dito ? 40 : 34, height: dito ? 40 : 34, padding: 0, background: 'transparent',
                    color: T.textSoft, border: `1px solid ${T.border}`, borderRadius: R.sm, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  <Icon name="trash" size={13} />
                </button>
              </div>
            ))}
            <div style={{ display: 'grid', gap: 8, marginTop: 10, gridTemplateColumns: suTelefono ? '1fr' : '2fr 150px 110px auto' }}>
              <input style={campo} value={nuovoGusto.nome} aria-label="Che gusto"
                placeholder="es. stracciatella"
                onChange={e => setNuovoGusto(v => ({ ...v, nome: e.target.value }))} />
              <select style={campo} value={nuovoGusto.da} aria-label="Chi lo fa"
                onChange={e => setNuovoGusto(v => ({ ...v, da: e.target.value }))}>
                <option value="">chi lo fa?</option>
                {sedi.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
              <input style={{ ...campo, textAlign: 'right' }} value={nuovoGusto.totale} inputMode="decimal"
                aria-label="Quanti kg per tutti" placeholder="kg"
                onChange={e => setNuovoGusto(v => ({ ...v, totale: e.target.value }))} />
              <button type="button"
                onClick={() => {
                  const t = Number(String(nuovoGusto.totale).replace(',', '.'))
                  if (!nuovoGusto.nome.trim() || !nuovoGusto.da || !(t > 0)) {
                    notify?.('Serve il gusto, chi lo fa e quanti chili se ne fanno per tutti.', false); return
                  }
                  // Di partenza le quote sono uguali per tutti: è il punto di
                  // partenza onesto, e si correggono guardandole.
                  const per = sedi.map(x => ({ sedeId: String(x.id), quota: 1 }))
                  salvaImpostazioni({ ...(impostazioni || {}), quote: [...quote, { nome: nuovoGusto.nome.trim(), da: nuovoGusto.da, totale: t, per }] })
                  setNuovoGusto({ nome: '', da: '', totale: '' })
                }}
                style={{
                  padding: '10px 16px', minHeight: dito ? 48 : 42, background: 'transparent',
                  color: T.textMid, border: `1px dashed ${T.borderStr}`, borderRadius: R.md,
                  fontSize: font.size.base, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                }}>
                Aggiungi
              </button>
            </div>
          </div>
        )}
        {apriGiorni && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {GIORNI_CORTI.map((g, i) => {
              const acceso = (impostazioni?.giorni || []).includes(i)
              return (
                <button key={i} type="button" onClick={() => giornoSuGiu(i)}
                  aria-pressed={acceso}
                  style={{
                    padding: '9px 13px', minHeight: dito ? 44 : 38,
                    background: acceso ? T.brand : 'transparent',
                    color: acceso ? T.white : T.textMid,
                    border: `1px solid ${acceso ? T.brand : T.borderStr}`,
                    borderRadius: R.sm, fontSize: typo.small.fontSize, fontWeight: 700,
                    fontFamily: 'inherit', cursor: 'pointer', textTransform: 'capitalize',
                  }}>
                  {g}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── I gusti che fa qualcun altro per tutti ────────────────────────
          Non è un'emergenza: è una consegna prevedibile, e viaggia col giro. */}
      {spettanze.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: typo.small.fontSize, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            Ti spetta dalla produzione degli altri
          </div>
          {spettanze.map(g => {
            const chi = sedi.find(x => String(x.id) === String(g.da))?.nome || 'un\u2019altra sede'
            const gia = lista.some(r => String(r.prodotto || '').trim().toLowerCase() === String(g.nome || '').trim().toLowerCase())
            return (
              <div key={g.nome} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                borderTop: `1px solid ${T.borderSoft}`, flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ fontSize: font.size.base, fontWeight: 600, color: T.text }}>{g.nome}</div>
                  <div style={{ fontSize: typo.caption.fontSize, color: T.textSoft, lineHeight: 1.45 }}>
                    la fa {chi}: su {scrivi((Number(g.totale) || 0) * 1000)} te ne spettano {scrivi(g.mia * 1000)}
                  </div>
                </div>
                {!gia && (
                  <button type="button"
                    onClick={() => aggiungi({ prodotto: g.nome, quantita: g.mia * 1000, da: g.da, tipo: 'prodotto' })}
                    style={{
                      padding: '8px 13px', minHeight: dito ? 44 : 36, background: 'transparent',
                      color: T.brand, border: `1px solid ${T.brand}55`, borderRadius: R.sm,
                      fontSize: typo.small.fontSize, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                    }}>
                    Mettilo in lista
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Quello che Foodos vede da solo ────────────────────────────────── */}
      {proposte.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: typo.small.fontSize, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            Sotto scorta qui: te li propongo io
          </div>
          {proposte.slice(0, 8).map(p => (
            <div key={p.chiave} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
              borderTop: `1px solid ${T.borderSoft}`, flexWrap: 'wrap',
            }}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontSize: font.size.base, fontWeight: 600, color: T.text }}>{p.prodotto}</div>
                <div style={{ fontSize: typo.caption.fontSize, color: T.textSoft, lineHeight: 1.45 }}>
                  ne hai {scrivi(p.giacenza)}, la soglia è {scrivi(p.soglia)}
                </div>
              </div>
              <button type="button" onClick={() => aggiungi(p)}
                style={{
                  padding: '8px 13px', minHeight: dito ? 44 : 36, background: 'transparent',
                  color: T.brand, border: `1px solid ${T.brand}55`, borderRadius: R.sm,
                  fontSize: typo.small.fontSize, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
                }}>
                Mettilo in lista
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── La lista ──────────────────────────────────────────────────────── */}
      {lista.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: typo.small.fontSize, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            In lista ({lista.length})
          </div>
          {lista.map(r => {
            const urgente = decisione.urgenti.some(u => u.id === r.id)
            const incerta = decisione.incerte.some(u => u.id === r.id)
            return (
              <div key={r.id} style={{
                display: 'grid',
                gridTemplateColumns: suTelefono ? '1fr 40px' : '1fr 150px 40px',
                gap: 9, alignItems: 'center', padding: '9px 0',
                borderTop: `1px solid ${T.borderSoft}`,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: font.size.base, fontWeight: 600, color: T.text }}>
                    {r.prodotto}
                    {r.quantita ? <span style={{ color: T.textSoft, fontWeight: 400 }}> · {scrivi(r.quantita)}</span> : null}
                    {r.tipo === 'prodotto' && <span style={{ color: T.textSoft, fontWeight: 400 }}> · gelato</span>}
                    {urgente && <span style={{ color: T.red, marginLeft: 7, fontSize: typo.caption.fontSize, fontWeight: 700 }}>non ci arriva</span>}
                    {incerta && <span style={{ color: T.amber, marginLeft: 7, fontSize: typo.caption.fontSize, fontWeight: 700 }}>da decidere</span>}
                  </div>
                  <div style={{ fontSize: typo.caption.fontSize, color: T.textSoft, lineHeight: 1.45 }}>
                    {(decisione.urgenti.concat(decisione.rimandabili, decisione.incerte).find(u => u.id === r.id)?.perche) || ''}
                  </div>
                </div>
                {!suTelefono && (
                  <select style={{ ...campo, padding: '8px 9px' }} value={r.da || ''}
                    aria-label={`Da quale negozio arriva ${r.prodotto}`}
                    onChange={e => salvaLista(lista.map(x => (x.id === r.id ? { ...x, da: e.target.value || null } : x)))}>
                    <option value="">da chi?</option>
                    {sedi.filter(s => String(s.id) !== String(sedeId)).map(s => (
                      <option key={s.id} value={s.id}>{s.nome}</option>
                    ))}
                  </select>
                )}
                <button type="button" onClick={() => salvaLista(lista.filter(x => x.id !== r.id))}
                  aria-label={`Togli ${r.prodotto} dalla lista`} title="Togli"
                  style={{
                    width: dito ? 40 : 34, height: dito ? 40 : 34, padding: 0,
                    background: 'transparent', color: T.textSoft, border: `1px solid ${T.border}`,
                    borderRadius: R.sm, cursor: 'pointer', display: 'inline-flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                  <Icon name="trash" size={13} />
                </button>
                {suTelefono && (
                  <select style={{ ...campo, gridColumn: '1 / -1', padding: '8px 9px' }} value={r.da || ''}
                    aria-label={`Da quale negozio arriva ${r.prodotto}`}
                    onChange={e => salvaLista(lista.map(x => (x.id === r.id ? { ...x, da: e.target.value || null } : x)))}>
                    <option value="">da quale negozio?</option>
                    {sedi.filter(s => String(s.id) !== String(sedeId)).map(s => (
                      <option key={s.id} value={s.id}>{s.nome}</option>
                    ))}
                  </select>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Aggiungi a mano ───────────────────────────────────────────────
          Le giacenze non sanno che domani c'è un evento: chi è al banco sì. */}
      <div style={{
        display: 'grid', gap: 8, marginTop: 16,
        gridTemplateColumns: suTelefono ? '1fr' : '2fr 150px 110px auto',
      }}>
        <input style={campo} value={nuovo.prodotto} aria-label="Cosa ti serve"
          placeholder="es. pistacchio"
          onChange={e => setNuovo(v => ({ ...v, prodotto: e.target.value }))} />
        {/* Cosa muove: due magazzini diversi, e il nome può essere lo stesso.
            «Pistacchio» è sia la pasta sia il gusto. */}
        <select style={campo} value={nuovo.tipo} aria-label="È una materia prima o un prodotto finito"
          onChange={e => setNuovo(v => ({ ...v, tipo: e.target.value }))}>
          <option value="materia_prima">materia prima</option>
          <option value="prodotto">gelato o prodotto</option>
        </select>
        <input style={{ ...campo, textAlign: 'right' }} value={nuovo.quantita} inputMode="decimal"
          aria-label="Quanti grammi" placeholder="grammi"
          onChange={e => setNuovo(v => ({ ...v, quantita: e.target.value }))} />
        <button type="button"
          onClick={async () => {
            if (!nuovo.prodotto.trim()) { notify?.('Scrivi cosa ti serve', false); return }
            await aggiungi(nuovo)
            setNuovo({ prodotto: '', quantita: '', da: '', tipo: nuovo.tipo })
          }}
          style={{
            padding: '10px 16px', minHeight: dito ? 48 : 42, background: 'transparent',
            color: T.textMid, border: `1px dashed ${T.borderStr}`, borderRadius: R.md,
            fontSize: font.size.base, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          }}>
          <Icon name="plus" size={14} />Aggiungi
        </button>
      </div>

      {/* ── Già che vai da quella parte ───────────────────────────────────
          È il risparmio più grosso di tutta la storia, e il più facile da
          perdere: il viaggio si fa comunque. */}
      {ritiri.frase && (
        <div style={{
          marginTop: 16, padding: '11px 13px', background: T.bgSubtle,
          borderRadius: R.sm, display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <span style={{ flexShrink: 0, marginTop: 1, color: T.brand }}><Icon name="pin" size={15} /></span>
          <div style={{ fontSize: font.size.base, color: T.textMid, lineHeight: 1.6 }}>
            {ritiri.frase}
            {ritiri.tappe.some(t => t.telefono) && (
              <div style={{ fontSize: typo.caption.fontSize, color: T.textSoft, marginTop: 3 }}>
                {ritiri.tappe.filter(t => t.telefono).map(t => `${t.nome} ${t.telefono}`).join(' · ')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Con che mezzo ─────────────────────────────────────────────────
          Il più piccolo che basta, non il più comodo: se quattro chili si
          portano a piedi, il furgone è una macchina accesa per niente. */}
      {lista.length > 0 && pesoTotale > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: typo.small.fontSize, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
            Con che mezzo — in tutto {scrivi(pesoTotale)}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {MEZZI.map(m => {
              const acceso = (conMezzo || consigliato?.id) === m.id
              return (
                <button key={m.id} type="button" aria-pressed={acceso}
                  onClick={() => setConMezzo(m.id)}
                  style={{
                    padding: '8px 12px', minHeight: dito ? 44 : 36,
                    background: acceso ? T.brand : 'transparent',
                    color: acceso ? T.white : T.textMid,
                    border: `1px solid ${acceso ? T.brand : T.borderStr}`,
                    borderRadius: R.sm, fontSize: typo.small.fontSize, fontWeight: 700,
                    fontFamily: 'inherit', cursor: 'pointer',
                  }}>
                  {m.label}
                </button>
              )
            })}
          </div>
          {capienza.ci_sta === false && capienza.frase && (
            <div style={{ fontSize: typo.small.fontSize, color: T.amberDark || T.amber, lineHeight: 1.5, marginTop: 8 }}>
              {capienza.frase}
            </div>
          )}
          {capienza.ci_sta === true && consigliato && !conMezzo && (
            <div style={{ fontSize: typo.caption.fontSize, color: T.textSoft, lineHeight: 1.5, marginTop: 8 }}>
              {scrivi(pesoTotale)} ci stanno {consigliato.label.toLowerCase()}: è il mezzo più piccolo che basta.
            </div>
          )}
          {persone.length > 0 && (chiCiVa.possono.length > 0 || chiCiVa.daChiedere.length > 0 || chiCiVa.nonPossono.length > 0) && (
            <div style={{ fontSize: typo.caption.fontSize, color: T.textSoft, lineHeight: 1.6, marginTop: 8 }}>
              {chiCiVa.possono.length > 0 && (
                <div>Può andarci: <b style={{ color: T.text }}>{chiCiVa.possono.map(p => p.nome).join(', ')}</b>.</div>
              )}
              {chiCiVa.possono.length === 0 && chiCiVa.daChiedere.length === 0 && (
                <div style={{ color: T.amberDark || T.amber }}>
                  Nessuno può farlo con questo mezzo: {chiCiVa.nonPossono.map(p => `${p.nome} ${p.perche}`).join(', ')}.
                </div>
              )}
              {chiCiVa.daChiedere.length > 0 && (
                <div>Da chiedere: {chiCiVa.daChiedere.map(p => `${p.nome} (${p.perche})`).join(', ')}.</div>
              )}
            </div>
          )}
        </div>
      )}

      {lista.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginTop: 16 }}>
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            fontSize: font.size.base, color: T.textMid,
          }}>
            <input type="checkbox" checked={staGiaAndando} style={{ width: 18, height: 18, accentColor: T.brand }}
              onChange={e => setStaGiaAndando(e.target.checked)} />
            Qualcuno ci sta già andando
          </label>
          <button type="button" onClick={creaGiro} disabled={salvando}
            style={{
              padding: '11px 18px', minHeight: dito ? 48 : 44, background: T.brand, color: T.white,
              border: 'none', borderRadius: R.md, fontSize: font.size.base, fontWeight: 700,
              fontFamily: 'inherit', cursor: salvando ? 'default' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}>
            <Icon name="truck" size={15} />{salvando ? 'Creo…' : 'Crea i trasferimenti'}
          </button>
        </div>
      )}
    </div>
  )
}
