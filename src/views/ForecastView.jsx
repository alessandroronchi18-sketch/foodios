// Forecast vendite 7gg (B1)
//
// Tabella + chart che mostra le previsioni per i prossimi 7 giorni per i top
// prodotti, basato su cron-forecast notturno. Mostra:
//   - meteo + correzione applicata
//   - intervallo min-max + confidence
//   - bottone "Pre-compila produzione" che porta in giornaliero con dati

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { color as T, typo } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import Icon from '../components/Icon'
import AiPageHero from '../components/AiPageHero'
import { todayLocal, giorniFaLocal, soloData } from '../lib/dateLocal'
import { sload } from '../lib/storage'

const BRAND = T.brand || '#6E0E1A'
const SOFT = T.textSoft || '#8B95A7'
const TXT = T.text || '#0E1726'
const MID = T.textMid || '#475264'
const CARD = T.bgCard || '#FFF'
const BORDER = T.border || '#E5E9EF'

// Icona del tempo dal codice meteo (standard WMO, quello di open-meteo).
// Erano emoji (☀️ ⛅ 🌧️): contro la regola del progetto, e ogni sistema le
// disegna a modo suo — su Windows il sole è giallo piatto, su Mac è un'altra
// cosa, e in una colonna di tessere non si allineano.
function iconaMeteo(weatherCode) {
  if (weatherCode == null) return null
  if (weatherCode === 0) return 'sun'
  if (weatherCode <= 3) return 'nuvola'
  if (weatherCode <= 48) return 'nebbia'
  if (weatherCode <= 67) return 'pioggia'
  if (weatherCode <= 77) return 'snow'
  if (weatherCode <= 82) return 'pioggia'
  return 'temporale'
}

// Perché non c'è previsione. Tre risposte possibili, e sono molto diverse
// fra loro: «non hai ancora registrato chiusure», «le hai registrate ma
// senza il dettaglio dei prodotti» (e allora aspettare non serve a niente),
// «ci sei quasi, mancano N giorni».
const GIORNI_MINIMI = 30

async function diagnosi(orgId, sedeId) {
  try {
    // Le chiusure si chiedono a `sload`, non a `user_data` in prima persona.
    //
    // Qui c'era la query diretta al blob jsonb `pasticceria-chiusure-v1`.
    // Dal 07/09/2026 le chiusure stanno nella tabella `chiusure_cassa` e il
    // blob non lo aggiorna più nessuno: `storage.js` dirotta la lettura, ma
    // chi va a leggere il database da sé quel dirottamento lo salta. Effetto
    // per il titolare: registra le chiusure dalla pagina Cassa, apre la
    // previsione, e si sente rispondere «non hai ancora registrato chiusure».
    // Il consiglio che segue — «vai a registrarne» — è quello che ha appena
    // fatto.
    const lette = await sload('pasticceria-chiusure-v1', orgId, sedeId)
    const chiusure = Array.isArray(lette) ? lette : []
    if (chiusure.length === 0) return { caso: 'niente_chiusure' }
    // «Ultimi 60 giorni» come giorni di calendario, confrontati come stringhe.
    // Prima `new Date(c.data)` era mezzanotte UTC e `limite` era l'ora esatta
    // di adesso meno 60 × 86.400.000 millisecondi: il giorno al bordo entrava
    // o restava fuori a seconda dell'ora in cui si apriva la pagina, e il
    // conteggio che decide il messaggio («ci sei quasi, mancano N giorni»)
    // cambiava da solo.
    const limite = giorniFaLocal(59)
    const recenti = chiusure.filter(c => soloData(c?.data) >= limite)
    // Dove stanno i prodotti di una chiusura: in `venduto`.
    //
    // Qui si guardava solo `prodotti` e `righe`, due nomi che oggi non esiste
    // più nessuna chiusura ad avere: `ChiusuraView` salva l'elenco in
    // `venduto` e la tabella `chiusure_cassa` ha una colonna con quel nome.
    // Risultato: anche con trenta giornate compilate prodotto per prodotto la
    // pagina rispondeva «le hai registrate ma senza il dettaglio dei
    // prodotti», cioè «aspettare non serve a niente». Si accettano tutti e
    // quattro i nomi, come già fa `OrdiniAiView`: `venduto` e `confronto`
    // sono quelli di adesso, `prodotti` e `righe` restano per le chiusure
    // vecchie rimaste nel blob.
    // Si cerca il primo elenco PIENO, non il primo elenco: una chiusura
    // vecchia migrata nella tabella ha la colonna `venduto` vuota e le sue
    // righe in `extra`, e fermarsi al primo array le avrebbe saltate.
    const conProdotti = recenti.filter(c =>
      [c?.venduto, c?.confronto, c?.prodotti, c?.righe].some(a => Array.isArray(a) && a.length > 0))
    if (conProdotti.length === 0) return { caso: 'senza_dettaglio', chiusure: recenti.length }
    if (conProdotti.length < GIORNI_MINIMI) return { caso: 'pochi_giorni', giorni: conProdotti.length }
    return { caso: 'attesa_calcolo', giorni: conProdotti.length }
  } catch {
    return null
  }
}

export default function ForecastView({ orgId, sedeId, sedeAttiva, setView }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const [forecasts, setForecasts] = useState([])
  const [loading, setLoading] = useState(true)
  // Perché la pagina è vuota. Senza questo si diceva sempre la stessa cosa —
  // «riprova domani» — anche quando domani non sarebbe cambiato niente.
  const [perche, setPerche] = useState(null)

  useEffect(() => {
    if (!orgId || !sedeId) { setLoading(false); return }
    let alive = true
    async function load() {
      setLoading(true)
      // Il giorno di oggi in ora italiana. Con `toISOString()` era il giorno
      // UTC: fra mezzanotte e le due la pagina rimetteva in cima la previsione
      // di ieri, come se dovesse ancora succedere.
      const oggi = todayLocal()
      const { data } = await supabase
        .from('forecast_giornaliero')
        .select('*')
        .eq('organization_id', orgId)
        .eq('sede_id', sedeId)
        .gte('data', oggi)
        .order('data')
        .order('qta_prevista', { ascending: false })
      if (!alive) return
      setForecasts(data || [])
      // Se non c'è niente da mostrare, si va a vedere **perché**: la
      // previsione si costruisce dal venduto per prodotto delle chiusure di
      // cassa, e senza quello non arriverà mai, per quanti giorni si aspetti.
      if ((data || []).length === 0) setPerche(await diagnosi(orgId, sedeId))
      setLoading(false)
    }
    load()
    return () => { alive = false }
  }, [orgId, sedeId])

  // Raggruppa per giorno
  const giorni = useMemo(() => {
    const map = {}
    for (const f of forecasts) {
      if (!map[f.data]) map[f.data] = { data: f.data, items: [], meteo: null }
      map[f.data].items.push(f)
      if (!map[f.data].meteo && f.fattori?.meteo) map[f.data].meteo = f.fattori.meteo
    }
    return Object.values(map).sort((a, b) => a.data.localeCompare(b.data))
  }, [forecasts])

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: isMobile ? 12 : isTablet ? 16 : 0 }}>
      <AiPageHero
        eyebrow="AI · Forecast vendite"
        title="Previsione vendite"
        accentText="7 giorni"
        subtitle={`Storico vendite + meteo cittadino + stagionalità. Aggiornato ogni notte alle 7:00.${sedeAttiva?.nome ? ` · ${sedeAttiva.nome}` : ''}`}
        statusBadge={forecasts.length > 0 ? 'LIVE' : null}
        stats={[
          { n: '7gg', l: 'Orizzonte' },
          { n: 'Open-Meteo', l: 'Dati meteo' },
          { n: '60gg', l: 'Storico analizzato' },
        ]}
      />

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: SOFT }}>Caricamento…</div>
      ) : giorni.length === 0 ? (
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 40, textAlign: 'center', color: SOFT, lineHeight: 1.6 }}>
          <Icon name="forecast" size={32} color={SOFT}/>
          {/* Diceva sempre «riprova domani». Se manca il dettaglio dei
              prodotti nelle chiusure, domani non cambia niente: la previsione
              si costruisce prodotto per prodotto, e senza quel dettaglio non
              arriverà mai. Meglio dire cosa manca. */}
          {perche?.caso === 'niente_chiusure' ? (
            <>
              <div style={{ marginTop: 12, fontWeight: 700, color: TXT }}>Non c'è ancora niente da cui prevedere</div>
              <div style={{ fontSize: typo.small.fontSize, marginTop: 6 }}>
                La previsione si costruisce dalle chiusure di cassa: quanto hai venduto,
                prodotto per prodotto, giorno per giorno.<br/>
                Registra le chiusure per qualche settimana e questa pagina si riempie da sola.
              </div>
              {setView && (
                <button onClick={() => setView('chiusura')}
                  style={{ marginTop: 14, background: BRAND, color: '#FFF', border: 'none', padding: '9px 16px', borderRadius: 8, fontSize: typo.small.fontSize, fontWeight: 700, cursor: 'pointer' }}>
                  Vai alla cassa
                </button>
              )}
            </>
          ) : perche?.caso === 'senza_dettaglio' ? (
            <>
              <div style={{ marginTop: 12, fontWeight: 700, color: TXT }}>Alle tue chiusure manca il dettaglio dei prodotti</div>
              <div style={{ fontSize: typo.small.fontSize, marginTop: 6 }}>
                Hai {perche.chiusure} chiusure negli ultimi due mesi, ma con i soli totali
                di giornata. Per prevedere quanto venderai di ogni prodotto serve sapere
                quanto ne hai venduto: si registra dalla cassa, riga per riga, oppure
                fotografando lo scontrino di chiusura.<br/>
                <strong>Finché manca quel dettaglio questa pagina resta vuota</strong>, per quanti
                giorni si aspetti.
              </div>
              {setView && (
                <button onClick={() => setView('chiusura')}
                  style={{ marginTop: 14, background: BRAND, color: '#FFF', border: 'none', padding: '9px 16px', borderRadius: 8, fontSize: typo.small.fontSize, fontWeight: 700, cursor: 'pointer' }}>
                  Vai alla cassa
                </button>
              )}
            </>
          ) : perche?.caso === 'pochi_giorni' ? (
            <>
              <div style={{ marginTop: 12, fontWeight: 700, color: TXT }}>Ci sei quasi</div>
              <div style={{ fontSize: typo.small.fontSize, marginTop: 6 }}>
                Hai {perche.giorni} giorni di venduto per prodotto; ne servono {GIORNI_MINIMI}.
                Continua a registrare le chiusure: mancano circa {GIORNI_MINIMI - perche.giorni} giorni.
              </div>
            </>
          ) : (
            <>
              <div style={{ marginTop: 12, fontWeight: 700, color: TXT }}>La previsione non è ancora stata calcolata</div>
              <div style={{ fontSize: typo.small.fontSize, marginTop: 6 }}>
                Lo storico c'è. Il calcolo gira ogni notte: domani mattina la trovi qui.
              </div>
            </>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {giorni.map(g => {
            // Mezzogiorno, non mezzanotte: `new Date('2026-09-16')` è
            // mezzanotte UTC, e basta un fuso a ovest di Greenwich perché il
            // nome del giorno scritto sopra la previsione sia quello prima.
            const dt = new Date(g.data + 'T12:00')
            const labelGiorno = dt.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
            const m = g.meteo
            return (
              <div key={g.data} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '12px 18px', background: '#FAFAF6', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 26 }}>
                    {iconaMeteo(m?.weather_code)
                      ? <Icon name={iconaMeteo(m.weather_code)} size={24} color={SOFT} />
                      : <span style={{ color: SOFT }}>-</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: TXT, textTransform: 'capitalize' }}>{labelGiorno}</div>
                    {m && (
                      <div style={{ fontSize: typo.small.fontSize, color: SOFT, marginTop: 2 }}>
                        Max {m.t_max?.toFixed(0)}°C · Min {m.t_min?.toFixed(0)}°C
                        {m.precip > 0 && ` · ${m.precip.toFixed(1)}mm pioggia`}
                      </div>
                    )}
                  </div>
                  {setView && (
                    <button onClick={() => setView('giornaliero')}
                      style={{ background: BRAND, color: '#FFF', border: 'none', padding: '7px 14px', borderRadius: 8, fontSize: typo.small.fontSize, fontWeight: 700, cursor: 'pointer' }}>
                      Vai a produzione <Icon name="arrowR" size={13} />
                    </button>
                  )}
                </div>
                <div style={{ padding: 12 }}>
                  {/* Le tre colonne di numeri non avevano intestazione: si
                      leggeva "120 - 180 pz", poi "150", poi "72%" e bisognava
                      indovinare cosa fossero. Su una pagina di PREVISIONI, un
                      numero senza etichetta viene letto come un dato certo. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 6px 6px', fontSize: typo.small.fontSize, color: SOFT, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <div style={{ flex: 1 }}>Prodotto</div>
                    <div style={{ minWidth: 80, textAlign: 'right' }}>Fra</div>
                    <div style={{ minWidth: 50, textAlign: 'right' }}>Previsti</div>
                    <div style={{ minWidth: 44, textAlign: 'right' }} title="Quanto il modello si fida di questa previsione: sale con lo storico che hai registrato">Fiducia</div>
                  </div>
                  {g.items.slice(0, 12).map(f => {
                    const confColor = f.confidence >= 0.7 ? '#16A34A' : f.confidence >= 0.5 ? '#B45309' : SOFT
                    return (
                      <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 6px', borderTop: `1px solid ${BORDER}` }}>
                        <div style={{ flex: 1, fontSize: 13, color: TXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.prodotto}
                        </div>
                        <div style={{ fontSize: typo.small.fontSize, color: SOFT, fontVariantNumeric: 'tabular-nums', minWidth: 80, textAlign: 'right' }}>
                          {Math.round(f.qta_min)} - {Math.round(f.qta_max)} pz
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: TXT, fontVariantNumeric: 'tabular-nums', minWidth: 50, textAlign: 'right' }}>
                          {Math.round(f.qta_prevista)}
                        </div>
                        <div style={{ fontSize: typo.small.fontSize, padding: '2px 7px', borderRadius: 999, background: '#F1F5F9', color: confColor, fontWeight: 700, minWidth: 36, textAlign: 'center' }}>
                          {Math.round(f.confidence * 100)}%
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          <div style={{ fontSize: typo.small.fontSize, color: SOFT, textAlign: 'center', padding: 8 }}>
            Sono previsioni, non numeri certi: servono a decidere quanto produrre, non a chiudere i conti. Migliorano man mano che registri le chiusure.
          </div>
        </div>
      )}
    </div>
  )
}
