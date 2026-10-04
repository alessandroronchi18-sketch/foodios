// ── Previsioni: «Cosa preparo domani?» ─────────────────────────────────
//
// Rifatta il 03/10/2026 secondo ANALISI_DESIGN.md. La pagina di prima
// (`components/PrevisioneDomanda.jsx`, voto 15/100 all'audit) prevedeva gli
// impasti prodotti con un metodo di Holt mensile, mostrava 15 schede × 5
// riquadri in ordine alfabetico, scriveva «Sovrapproduzione» su tutto perché
// il venduto mancava, nascondeva il 28% dei kg e il 03/10 diceva «Oggi» con
// dati del 31/08.
//
// Qui una domanda e una tabella sola: per ogni gusto quanto se ne venderà,
// fra quali valori, quando finisce quello che c'è in vetrina, quando rifarlo
// e quanto sbaglio di solito. I numeri vengono da `lib/previsioneVenduto`
// (provati sul backtest di luglio e agosto); questa pagina li scrive soltanto.
//
// Vale per chi lavora col metodo inventario (si conta la vetrina ogni sera):
// le aziende a stampi vedono ancora la pagina di prima (Dashboard).
import React, { useEffect, useMemo, useState } from 'react'
import { color as T, font, radius as R, tnum } from '../lib/theme'
import useIsMobile from '../lib/useIsMobile'
import { lessico } from '../lib/lessico'
import { todayLocal } from '../lib/dateLocal'
import { caricaRigheInventario } from '../lib/inventarioProduzione'
import { caricaRegoleChiusura, giornoChiuso } from '../lib/giorniChiusura'
import { previsioneSede, piuGiorni, giorniFra, giornoSettimana, GIORNI_DATI_VECCHI, LIVELLO_BANDA } from '../lib/previsioneVenduto'
import { dataBreve } from '../lib/formatoAnalisi'
import { CoperturaDati, NumeroConConfronto, IntestazioneAnalisi, TitoloGrafico, Riquadro } from '../components/analisi'
import PaginaAnalisi, { spazioRiquadri } from '../components/analisi/PaginaAnalisi'
import Icon from '../components/Icon'

// ── Come si scrivono i numeri (esportati per i test) ────────────────────

const NF1 = new Intl.NumberFormat('it-IT', { useGrouping: 'always', minimumFractionDigits: 0, maximumFractionDigits: 1 })
const NF0 = new Intl.NumberFormat('it-IT', { useGrouping: 'always', maximumFractionDigits: 0 })
const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']
const GIORNI_LUNGHI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']

/** Chili come li legge chi impasta: un decimale sotto i 10 kg, interi sopra. */
export function kgTesto(n) {
  if (n == null || !Number.isFinite(Number(n))) return null
  const v = Math.max(0, Number(n))
  return (v < 10 ? NF1 : NF0).format(v)
}

/**
 * «fra 4,5 e 6 kg». Se la banda non c'è (errore ancora da misurare) o i due
 * estremi si scrivono uguali, «circa 5 kg»: un intervallo «5–5» è una
 * precisione finta (la pagina di prima ne mostrava 47 su 75).
 */
export function intervalloTesto(basso, alto, kg, { breve = false } = {}) {
  const c = kgTesto(kg)
  if (c == null) return null
  if (basso == null || alto == null) return breve ? `≈ ${c} kg` : `circa ${c} kg`
  const b = kgTesto(basso), a = kgTesto(alto)
  if (b === a) return breve ? `≈ ${c} kg` : `circa ${c} kg`
  // Al telefono «fra 6,2 e 10 kg» non sta nella colonna: «6,2–10 kg».
  return breve ? `${b}–${a} kg` : `fra ${b} e ${a} kg`
}

/** «lun 06/10». */
export function giornoAssoluto(iso) {
  return iso ? `${GIORNI[giornoSettimana(iso)]} ${dataBreve(iso)}` : null
}

/** «oggi», «domani», «dopodomani», «ieri», altrimenti «lun 06/10». */
export function giornoRelativo(iso, oggi) {
  if (!iso) return null
  const d = giorniFra(oggi, iso)
  if (d === 0) return 'oggi'
  if (d === 1) return 'domani'
  if (d === 2) return 'dopodomani'
  if (d === -1) return 'ieri'
  return giornoAssoluto(iso)
}

/**
 * Quando rifarlo: il giorno prima di quello in cui finisce. «FONDENTE finisce
 * dopodomani: rifallo domani». Se quel giorno è già passato rispetto al primo
 * giorno senza dati (`primoGiorno`, di solito oggi; domani se l'inventario di
 * stasera è già scritto), la risposta è «subito».
 *
 * Ritorna { data, subito } o null se non si sa quando finisce.
 */
export function quandoRifare(finisce, primoGiorno) {
  if (!finisce) return null
  const prima = piuGiorni(finisce, -1)
  return prima < primoGiorno ? { data: primoGiorno, subito: true } : { data: prima, subito: false }
}

/** «±18%», o null se l'errore non è ancora misurato su abbastanza giorni. */
export function erroreTesto(errore, minimoGiorni = 5) {
  if (!errore || errore.pct == null || errore.giorni < minimoGiorni) return null
  return `±${Math.round(errore.pct * 100)}%`
}

function elenco(nomi) {
  if (nomi.length <= 1) return nomi.join('')
  return `${nomi.slice(0, -1).join(', ')} e ${nomi.at(-1)}`
}

// ── La pagina ────────────────────────────────────────────────────────────

export default function PrevisioniView({ orgId, sedeId, sedi = [], sedeAttiva = null, tipoAttivita = '', onNavigate = () => {}, oggi: oggiProp = null }) {
  const isMobile = useIsMobile()
  const LEX = lessico(tipoAttivita)
  const oggi = oggiProp || todayLocal()
  const sediAttive = useMemo(() => (sedi || []).filter(s => s && s.attiva !== false), [sedi])
  const tutte = !!sedeAttiva?._all || !sedeId
  const [sedeScelta, setSedeScelta] = useState(null)
  const sede = tutte ? (sedeScelta || sediAttive[0]?.id || null) : sedeId
  const nomeSede = (sediAttive.find(s => s.id === sede) || sedeAttiva || {}).nome || ''

  const [stato, setStato] = useState({ caricando: true, errore: null, righe: [], regole: null, perSede: null })
  const [mostraUltima, setMostraUltima] = useState(false)

  useEffect(() => {
    if (!orgId || !sede) return undefined
    let vivo = true
    setStato(s => ({ ...s, caricando: true, errore: null }))
    setMostraUltima(false)
    Promise.all([
      caricaRigheInventario(orgId, sede, { monthsBack: 12 }),
      caricaRegoleChiusura(orgId, sede).catch(() => null),
    ]).then(([righe, regole]) => {
      if (vivo) setStato({ caricando: false, errore: null, righe: righe || [], regole, perSede: sede })
    }).catch(e => {
      console.error('previsioni: inventario', e)
      if (vivo) setStato({ caricando: false, errore: 'Non sono riuscito a leggere l’inventario. Riprova fra poco.', righe: [], regole: null, perSede: sede })
    })
    return () => { vivo = false }
  }, [orgId, sede])

  const chiuso = useMemo(() => {
    const r = stato.regole
    return r ? (d => giornoChiuso(d, r)) : (() => false)
  }, [stato.regole])

  const p = useMemo(() => (stato.caricando || stato.perSede !== sede)
    ? null
    : previsioneSede(stato.righe, { oggi, giorni: 3, chiuso }), [stato, sede, oggi, chiuso])

  // Con i dati vecchi la pagina non prevede; a richiesta mostra com'era
  // l'ultima previsione possibile, dichiarandolo in grande.
  const ultima = useMemo(() => (p?.stato === 'vecchi' && mostraUltima)
    ? previsioneSede(stato.righe, { oggi, giorni: 3, chiuso, base: piuGiorni(p.ultimoDato, 1) })
    : null, [p, mostraUltima, stato.righe, oggi, chiuso])

  if (!orgId) return null

  const vaiInventario = () => onNavigate('inventario-gusti')
  const sceltaSede = tutte && sediAttive.length > 1 ? (
    <div role="group" aria-label="Sede" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {sediAttive.map(s => {
        const attiva = s.id === sede
        return (
          <button key={s.id} type="button" onClick={() => setSedeScelta(s.id)} aria-pressed={attiva}
            style={{
              minHeight: 40, padding: '8px 14px', borderRadius: R.full, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: font.size.base, fontWeight: 700,
              border: `1px solid ${attiva ? T.brand : T.border}`,
              background: attiva ? T.brand : T.bgCard, color: attiva ? T.white : T.textMid,
            }}>
            {s.nome}
          </button>
        )
      })}
    </div>
  ) : null

  return (
    // Era larga 1040 px e le sorelle 1200: cambiando pagina tutto saltava di
    // 80 px (audit 04/10, PR1). Larghezza e spazi li decide PaginaAnalisi.
    <PaginaAnalisi isMobile={isMobile}>
      <IntestazioneAnalisi
        domanda="Cosa preparo domani?"
        sotto={`${nomeSede ? `${nomeSede} · ` : ''}quanto se ne venderà, ${LEX.prodotto} per ${LEX.prodotto}, in kg: dall'inventario della vetrina`}
        destra={sceltaSede}
        isMobile={isMobile}
      />

      {stato.errore ? (
        <Riquadro isMobile={isMobile}><p style={{ margin: 0, color: T.textMid, fontSize: font.size.md }}>{stato.errore}</p></Riquadro>
      ) : !p ? (
        <Riquadro isMobile={isMobile}><p style={{ margin: 0, color: T.textSoft, fontSize: font.size.md }}>Leggo l’inventario…</p></Riquadro>
      ) : (
        <>
          <CoperturaDati voci={vociCopertura(p, oggi, nomeSede, vaiInventario)} />
          {p.stato === 'vuoto' && (
            <Riquadro isMobile={isMobile}>
              <TitoloGrafico
                titolo={`Per ${nomeSede || 'questa sede'} non c’è ancora un inventario`}
                sottotitolo={`La previsione parte dopo due settimane di inventario: ogni sera, quanto è rimasto in vetrina di ogni ${LEX.prodotto}.`}
              />
              <Pulsante onClick={vaiInventario} principale>Registra l’inventario</Pulsante>
            </Riquadro>
          )}
          {p.stato === 'vecchi' && (
            <Riquadro isMobile={isMobile}>
              <TitoloGrafico
                titolo={`L’inventario di ${nomeSede || 'questa sede'} è fermo al ${dataBreve(p.ultimoDato)}: non posso dirti cosa preparare`}
                sottotitolo={`Sono passati ${NF0.format(p.giorniVecchi)} giorni. Oltre ${GIORNI_DATI_VECCHI} giorni non so cosa c’è in vetrina, e un numero sarebbe inventato.`}
              />
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Pulsante onClick={vaiInventario} principale>Registra l’inventario</Pulsante>
                <Pulsante onClick={() => setMostraUltima(v => !v)}>
                  {mostraUltima ? 'Nascondi l’ultima previsione' : `Guarda l’ultima previsione possibile (${dataBreve(piuGiorni(p.ultimoDato, 1))})`}
                </Pulsante>
              </div>
            </Riquadro>
          )}
          {p.stato === 'ok' && <Previsione p={p} oggi={oggi} LEX={LEX} isMobile={isMobile} />}
          {ultima?.stato === 'ok' && (
            <>
              <div role="note" style={{
                background: T.fondoAvviso, border: `1px solid ${T.bordoAvviso}`, borderRadius: R.xl,
                padding: '10px 14px', color: T.amberDark, fontSize: font.size.md, lineHeight: 1.5,
                display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                <span style={{ display: 'inline-flex', marginTop: 2, flexShrink: 0 }} aria-hidden="true"><Icon name="clock" size={15} /></span>
                <span>
                  <b>Non vale per oggi.</b> È la previsione per {GIORNI_LUNGHI[giornoSettimana(ultima.giorniPrevisti[0])]} {dataBreve(ultima.giorniPrevisti[0])}, fatta con i dati fino al {dataBreve(ultima.ultimoDato)}: serve a vedere come lavora questa pagina.
                </span>
              </div>
              <Previsione p={ultima} oggi={ultima.ultimoDato} LEX={LEX} isMobile={isMobile} assoluto />
            </>
          )}
          {(p.stato === 'ok' || ultima?.stato === 'ok') && <ComeLeggo LEX={LEX} />}
        </>
      )}
    </PaginaAnalisi>
  )
}

function Pulsante({ children, onClick, principale = false }) {
  return (
    <button type="button" onClick={onClick} style={{
      minHeight: 44, padding: '10px 16px', borderRadius: R.lg, cursor: 'pointer', fontFamily: 'inherit',
      fontSize: font.size.md, fontWeight: 700,
      border: `1px solid ${principale ? T.brand : T.border}`,
      background: principale ? T.brand : T.bgCard, color: principale ? T.white : T.brand,
    }}>
      {children}
    </button>
  )
}

/** La riga «da dove vengono i numeri» (ANALISI_DESIGN.md, regola 3). */
export function vociCopertura(p, oggi, nomeSede, vaiInventario) {
  const voci = []
  const dove = nomeSede ? ` di ${nomeSede}` : ''
  if (p.stato === 'vuoto') {
    voci.push({ id: 'inv', stato: 'manca', testo: `Inventario${dove}: nessun giorno registrato`, azione: { etichetta: 'Registra', onClick: vaiInventario } })
    return voci
  }
  const quando = giornoRelativo(p.ultimoDato, oggi)
  if (p.giorniVecchi <= 1) {
    voci.push({ id: 'inv', stato: 'ok', testo: `Inventario${dove} fino a ${quando} (${dataBreve(p.ultimoDato)})` })
  } else if (p.giorniVecchi <= GIORNI_DATI_VECCHI) {
    voci.push({
      id: 'inv', stato: 'parziale',
      testo: `Inventario${dove} fermo al ${dataBreve(p.ultimoDato)}: la vetrina di oggi non la conosco`,
      azione: { etichetta: 'Registra', onClick: vaiInventario },
    })
  } else {
    voci.push({
      id: 'inv', stato: 'manca',
      testo: `Inventario${dove} fermo al ${dataBreve(p.ultimoDato)}, ${NF0.format(p.giorniVecchi)} giorni fa`,
      azione: { etichetta: 'Registra', onClick: vaiInventario },
    })
  }
  if (p.conte && p.conte.totale > 0 && p.conte.inaffidabili > 0) {
    const quota = Math.round(p.conte.inaffidabili / p.conte.totale * 100)
    voci.push({
      id: 'conte', stato: quota >= 5 ? 'parziale' : 'ok',
      testo: `Rimanenza a zero nel giorno di produzione: ${NF0.format(p.conte.inaffidabili)} righe su ${NF0.format(p.conte.totale)} nelle ultime 4 settimane`,
      dettaglio: 'Nel giorno in cui si rifà un gusto la rimanenza spesso resta a zero: quel giorno il venduto esce troppo alto e il giorno dopo negativo. Per questo il venduto lo misuro fra due conte giuste, e quei giorni non li uso per misurare l’errore.',
    })
  }
  if (p.stato === 'ok') {
    voci.push({ id: 'stima', stato: 'stima', testo: 'previsione dal venduto delle ultime settimane, senza meteo né festività' })
  }
  return voci
}

// ── Il blocco della previsione: tessere e tabella ───────────────────────

// `assoluto`: nella previsione di un giorno passato (dati vecchi) «oggi» e
// «domani» confonderebbero chi legge il 03/10: si scrivono le date.
function Previsione({ p, oggi, LEX, isMobile, assoluto = false }) {
  const testoGiorno = assoluto ? giornoAssoluto : (iso => giornoRelativo(iso, oggi))
  // La colonna «domani»: il primo giorno previsto dopo oggi. Sul computer,
  // se i dati sono di ieri sera, accanto c'è anche oggi: è il giorno in cui la
  // vetrina di ieri sera deve bastare.
  const iDomani = Math.max(0, p.giorniPrevisti.findIndex(d => d > oggi))
  const domani = p.giorniPrevisti[iDomani]
  const etichettaDomani = assoluto ? `il ${dataBreve(domani)}` : giornoRelativo(domani, oggi)
  const colonne = isMobile ? [iDomani] : p.giorniPrevisti.map((_, i) => i).filter(i => i <= iDomani)
  const urgenti = p.gusti.filter(g => {
    const r = quandoRifare(g.finisce, p.base)
    return r && (r.subito || r.data <= domani)
  })
  const scorteNote = p.gusti.some(g => g.scorta)
  const tot = p.totali[iDomani]
  const errTot = erroreTesto(p.erroreTotale)
  const errSede = erroreTesto(p.erroreSede)
  const allargata = p.livelloBanda > LIVELLO_BANDA + 1e-9

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: spazioRiquadri(isMobile) }}>
        <NumeroConConfronto
          etichetta={`Da rifare entro ${etichettaDomani}`}
          valore={scorteNote ? `${NF0.format(urgenti.length)} ${urgenti.length === 1 ? LEX.prodotto : LEX.prodotti}` : null}
          motivoMancante="non lo so"
          contesto={scorteNote
            ? (urgenti.length ? elenco(urgenti.slice(0, 3).map(g => g.gusto)) + (urgenti.length > 3 ? ` e altri ${urgenti.length - 3}` : '') : 'la vetrina basta')
            : `l’ultima conta della vetrina è del ${dataBreve(p.ultimoDato)}`}
          isMobile={isMobile}
          grande
        />
        <NumeroConConfronto
          etichetta={`Si venderà ${etichettaDomani}, in tutto`}
          valore={tot ? intervalloTesto(tot.basso, tot.alto, tot.kg) : null}
          stimato
          contesto={[
            p.mediaGiorno != null ? `un giorno medio dell’ultima settimana: ${kgTesto(p.mediaGiorno)} kg` : null,
            errTot ? `sul totale di solito sbaglio di ${errTot}` : null,
          ].filter(Boolean).join(' · ')}
          isMobile={isMobile}
        />
        <NumeroConConfronto
          etichetta="Di solito sbaglio"
          valore={errSede ? `${errSede} per ${LEX.prodotto}` : null}
          motivoMancante="ancora da misurare"
          contesto={p.erroreSede ? `misurato sulle ultime 4 settimane, ${NF0.format(p.erroreSede.giorni)} giornate provate` : 'servono almeno due settimane di inventario'}
          isMobile={isMobile}
        />
      </div>

      <Riquadro isMobile={isMobile}>
        <TitoloGrafico
          titolo={urgenti.length ? `Da rifare per primi: ${elenco(urgenti.slice(0, 3).map(g => g.gusto))}` : (scorteNote ? `Entro ${etichettaDomani} non finisce niente` : `In ordine di vendita prevista`)}
          sottotitolo={`Prima chi finisce prima. ${isMobile ? '«4–6 kg»' : '«Fra 4 e 6 kg»'} vuol dire: 8 volte su 10 il venduto vero cade lì dentro.${allargata ? ' La banda è più larga del solito: nelle ultime due settimane ci ho preso meno spesso.' : ''}`}
        />
        <TabellaGusti p={p} oggi={oggi} colonne={colonne} LEX={LEX} isMobile={isMobile} testoGiorno={testoGiorno} />
      </Riquadro>
    </>
  )
}

const TH = { textAlign: 'left', fontSize: font.size.sm, fontWeight: 700, color: T.textSoft, padding: '8px 10px', borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }
const TD = { padding: '10px', borderBottom: `1px solid ${T.borderSoft}`, fontSize: font.size.md, color: T.text, verticalAlign: 'top' }
const NUM = { ...tnum, textAlign: 'right', whiteSpace: 'nowrap' }
const SOTTO = { fontSize: font.size.sm, color: T.textSoft, marginTop: 2, fontWeight: 400 }

function TabellaGusti({ p, oggi, colonne, LEX, isMobile, testoGiorno }) {
  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', margin: isMobile ? '0 -4px' : 0 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? 0 : 720 }}>
        <thead>
          <tr>
            <th scope="col" style={TH}>{LEX.Prodotto}</th>
            {!isMobile && <th scope="col" style={{ ...TH, textAlign: 'right' }}>In vetrina</th>}
            {colonne.map(i => (
              // Al telefono l'intestazione va a capo: tenuta su una riga
              // allargava la colonna e tagliava «Da rifare».
              <th key={i} scope="col" style={{ ...TH, textAlign: 'right', whiteSpace: isMobile ? 'normal' : 'nowrap' }}>Si venderà {testoGiorno(p.giorniPrevisti[i])}</th>
            ))}
            {!isMobile && <th scope="col" style={TH}>Finisce</th>}
            <th scope="col" style={TH}>Da rifare</th>
            {!isMobile && <th scope="col" style={{ ...TH, textAlign: 'right' }} title="Errore medio di questo metodo sulle ultime 4 settimane, per questo gusto">Di solito sbaglio</th>}
          </tr>
        </thead>
        <tbody>
          {p.gusti.map(g => <RigaGusto key={g.gusto} g={g} oggi={oggi} base={p.base} colonne={colonne} isMobile={isMobile} testoGiorno={testoGiorno} />)}
        </tbody>
      </table>
    </div>
  )
}

// Niente rosso qui: in una gelateria che produce ogni giorno quasi tutto
// «finisce oggi», ed è la normalità, non un allarme (ANALISI_DESIGN.md,
// regola 12). L'urgenza si legge dall'ordine e dalla parola «subito».
function RigaGusto({ g, oggi, base, colonne, isMobile, testoGiorno }) {
  const rifare = quandoRifare(g.finisce, base)
  const scortaTesto = g.scorta ? `${kgTesto(g.scorta.kg)}\u00a0kg` : '—'
  const scortaSotto = g.scorta ? (g.scorta.stimata ? 'stimata' : `${testoGiorno(g.scorta.data)} sera`) : 'non contata'
  const finisceTesto = g.finisce
    ? testoGiorno(g.finisce)
    : (g.scorta ? 'fra più di 2 settimane' : '—')
  const err = erroreTesto(g.errore)
  const lotto = g.lotto ? `di solito ${kgTesto(g.lotto.kg)}\u00a0kg` : null
  const rifareTesto = rifare ? (rifare.subito ? 'subito' : testoGiorno(rifare.data)) : '—'
  const presto = !!rifare && (rifare.subito || rifare.data <= piuGiorni(oggi, 1))

  return (
    <tr>
      <th scope="row" style={{ ...TD, textAlign: 'left', fontWeight: 700 }}>
        {g.gusto}
        {isMobile && (
          <div style={SOTTO}>
            <div>in vetrina {scortaTesto}{g.scorta?.stimata ? ' (stimata)' : ''}</div>
            {err && <div>sbaglio {err}</div>}
          </div>
        )}
      </th>
      {!isMobile && (
        <td style={{ ...TD, ...NUM }}>
          {scortaTesto}
          <div style={SOTTO}>{scortaSotto}</div>
        </td>
      )}
      {colonne.map(i => {
        const x = g.previsti[i]
        return (
          <td key={i} style={{ ...TD, ...NUM }} title={x?.bandaDaSede ? 'Per questo gusto ho ancora pochi giorni: la banda viene dagli errori di tutta la sede' : undefined}>
            {intervalloTesto(x?.basso, x?.alto, x?.kg, { breve: isMobile }) || '—'}
          </td>
        )
      })}
      {!isMobile && <td style={{ ...TD, whiteSpace: 'nowrap' }}>{finisceTesto}</td>}
      <td style={TD}>
        <span style={{ fontWeight: presto ? 700 : 400, whiteSpace: 'nowrap' }}>{rifareTesto}</span>
        {isMobile && g.finisce && <div style={SOTTO}>finisce {finisceTesto}</div>}
        {lotto && <div style={{ ...SOTTO, whiteSpace: isMobile ? 'normal' : 'nowrap' }}>{lotto}</div>}
      </td>
      {!isMobile && <td style={{ ...TD, ...NUM, color: err ? T.text : T.textSoft }}>{err || 'da misurare'}</td>}
    </tr>
  )
}

function ComeLeggo({ LEX }) {
  return (
    <details style={{ color: T.textMid, fontSize: font.size.base, lineHeight: 1.6 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700, color: T.textMid, minHeight: 32, display: 'flex', alignItems: 'center' }}>
        Come leggo questi numeri
      </summary>
      <div style={{ paddingTop: 6 }}>
        <p style={{ margin: '0 0 8px' }}>
          Prevedo il <b>venduto</b>, non la produzione: quanto esce dalla vetrina fra una conta e l’altra. Il ritmo è quello degli ultimi 7 giorni, corretto per il giorno della settimana (il sabato si vende di più, il lunedì di meno) e per come sono andate le ultime due settimane.
        </p>
        <p style={{ margin: '0 0 8px' }}>
          «Di solito sbaglio» è l’errore che questo stesso conto ha fatto davvero nelle ultime 4 settimane, rifatto ogni giorno con i soli dati del giorno prima. La banda «fra X e Y» viene da quegli errori; se nelle ultime due settimane ci ho preso meno di 8 volte su 10, la allargo.
        </p>
        <p style={{ margin: 0 }}>
          «Da rifare» è il giorno prima di quello in cui la vetrina finisce, senza contare quello che produci oggi; «di solito» è quanto ne fai in una volta. Meteo e festività non li uso: provati sull’estate, non miglioravano la previsione. Un {LEX.prodotto} si chiama come nell’inventario, anche se la ricetta ha un altro nome.
        </p>
      </div>
    </details>
  )
}
