// Confronto sedi: quale sede rende di più, e su quali giorni lo si sa.
//
// 05/10/2026, riscritta sul kit dell'Analisi (voto di partenza ≈40):
//   • il periodo è quello della barra comune (prima solo «settimana»/«mese»);
//   • gli incassi di ogni sede sono quelli del Mese: cassa nei giorni con la
//     chiusura, stima dall'inventario negli altri, i giorni senza dati detti
//     accanto al numero (prima la stima scattava solo con ZERO chiusure);
//   • le spese comuni a Berthollet e De Gasperi si dividono sui chili, e si
//     vedono in una riga loro (prima la lettura non chiedeva la colonna e
//     quelle fatture sparivano);
//   • niente punteggi inventati («sede critica», «lettura AI»): una risposta
//     grande, il perché sotto, e quello che non si sa detto accanto.
// I conti stanno in `lib/confrontoSediArchivio.js` e `lib/confrontoSediCalc.js`.

import React, { useState, useEffect, useMemo } from 'react'
import Icon from './Icon'
import BarraPeriodo from './BarraPeriodo'
import ExportPdfButton from './ExportPdfButton'
import {
  IntestazioneAnalisi, Riquadro, TitoloGrafico, NumeroPrincipale, CoperturaDati,
  TabellaAnalisi, ElencoBarre, Andamentino, testo,
} from './analisi'
import PaginaAnalisi from './analisi/PaginaAnalisi'
import { supabase } from '../lib/supabase'
import { color as T, font, space } from '../lib/theme'
import useIsMobile from '../lib/useIsMobile'
import { todayLocal } from '../lib/dateLocal'
import { finestraScorciatoia, finestraConfronto, nomePeriodo, giorniDelPeriodo, spostaPeriodo } from '../lib/periodoAnalisi'
import { euro, variazione, quota, dataBreve } from '../lib/formatoAnalisi'
import { nomeIncassi } from '../lib/ilMese'
import { vocePerGruppo } from '../lib/confrontoSediCalc'
import { caricaConfrontoSedi } from '../lib/confrontoSediArchivio'

const tab = { fontVariantNumeric: 'tabular-nums' }
const ND = (motivo) => <span title={motivo} style={{ color: T.amberDark, cursor: 'help' }}>non lo so</span>
// `toLocaleString('it-IT')` non mette il punto nei numeri a quattro cifre (1204):
// la regola del progetto lo vuole da mille in su.
const nIt = (n) => new Intl.NumberFormat('it-IT', { useGrouping: 'always', maximumFractionDigits: 0 }).format(n)
const num = (v) => <span style={tab}>{v}</span>

// Fino a una settimana dall'inizio del mese il mese in corso ha pochi giorni:
// si parte dal mese scorso, intero.
function finestraDiPartenza(oggi = new Date()) {
  return finestraScorciatoia(oggi.getDate() <= 7 ? 'mesePrec' : 'meseCorr', oggi)
}

export default function ConfrontoSedi({ orgId, sedi, onNavigate }) {
  const isMobile = useIsMobile()
  const sediAttive = useMemo(() => (sedi || []).filter(s => s.attiva !== false), [sedi])
  const chiaveSedi = sediAttive.map(s => s.id).join(',')

  const [finestra, setFinestra] = useState(() => finestraDiPartenza())
  const [modoConfronto, setModoConfronto] = useState('prev')
  const [dati, setDati] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState('')

  const da = finestra.from, a = finestra.to
  const conf = useMemo(() => finestraConfronto(da, a, modoConfronto), [da, a, modoConfronto])

  useEffect(() => {
    if (!orgId || sediAttive.length < 2 || !da || !a) { setLoading(false); return }
    let annullato = false
    setLoading(true); setErrore('')
    caricaConfrontoSedi({ supabase, orgId, sedi: sediAttive, da, a, confronto: conf, oggi: todayLocal() })
      .then(r => { if (!annullato) { setDati(r); setLoading(false) } })
      .catch(e => { if (!annullato) { setErrore(e?.message || 'lettura non riuscita'); setLoading(false) } })
    return () => { annullato = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, chiaveSedi, da, a, conf?.from, conf?.to])

  const kpiMap = useMemo(() => dati?.kpiMap || {}, [dati])
  const giorni = giorniDelPeriodo(da, a)
  const periodoPrima = spostaPeriodo(da, a, -1)

  const intestazione = (
    <IntestazioneAnalisi isMobile={isMobile}
      domanda="Quale sede incassa di più?"
      sotto={`${nomePeriodo(da, a)}${conf ? ` · confronto con ${nomePeriodo(conf.from, conf.to)}` : ''}`}
      destra={(
        <>
          <BarraPeriodo from={da} to={a} lato="destra" isMobile={isMobile}
            onPeriodo={(f, t) => { if (f && t) setFinestra({ from: f, to: t }) }}
            confronto={modoConfronto} onConfronto={setModoConfronto} />
          <ExportPdfButton fileName={`confronto-sedi-${da}-${a}.pdf`} compact getReport={() => ({
          title: 'Confronto sedi',
          subtitle: `${sediAttive.length} sedi attive`,
          periodo: `${nomePeriodo(da, a)}${conf ? ` · confronto con ${nomePeriodo(conf.from, conf.to)}` : ''}`,
          kpi: [
            { label: 'Incassi delle sedi', value: euro(consolidato.ricCur) || '-', sub: vGruppo ? `${vGruppo.testoDelta} sul periodo prima` : '' },
            ...(giorniMancanti > 0 ? [{ label: 'Giorni senza dati', value: String(giorniMancanti) }] : []),
          ],
          sections: [{
            title: 'Per sede',
            table: {
              columns: ['Sede', 'Incassi', 'Giorni con dati', 'Fatture da pagare', 'Fatture scadute'],
              alignments: ['left', 'right', 'right', 'right', 'right'],
              rows: sediAttive.map(s => {
                const k = kSede(s)
                return [s.nome, k.ricaviCur != null ? euro(k.ricaviCur) : 'non lo so', `${giorni - (k.incasso?.scoperti || 0)} su ${giorni}`, euro(k.fattureImporto || 0), String(k.fattureScadute || 0)]
              }),
            },
          }],
        })} />
        </>
      )} />
  )

  if (sediAttive.length < 2) return (
    <PaginaAnalisi isMobile={isMobile}>
      <IntestazioneAnalisi isMobile={isMobile} domanda="Confronto sedi" />
      <Riquadro isMobile={isMobile}>
        <p style={{ margin: 0, ...testo(font.size.base), color: T.textSoft }}>
          Serve almeno due sedi attive. Le aggiungi da Impostazioni, Sedi.
        </p>
      </Riquadro>
    </PaginaAnalisi>
  )
  if (loading && !dati) return (
    <PaginaAnalisi isMobile={isMobile}>{intestazione}
      <Riquadro isMobile={isMobile}><span style={{ color: T.textSoft, fontSize: font.size.base }}>Metto insieme cassa, inventario e fatture di ogni sede…</span></Riquadro>
    </PaginaAnalisi>
  )
  if (errore) return (
    <PaginaAnalisi isMobile={isMobile}>{intestazione}
      <Riquadro isMobile={isMobile}><span style={{ color: T.red, fontSize: font.size.base }}>Non sono riuscito a leggere i dati: {errore}</span></Riquadro>
    </PaginaAnalisi>
  )

  const kSede = (s) => kpiMap[s.id] || {}
  const conIncasso = sediAttive.filter(s => kSede(s).ricaviCur != null)
  const consolidato = vocePerGruppo(sediAttive.map(s => kpiMap[s.id]))
  const incompleti = sediAttive.filter(s => kSede(s).incasso && (kSede(s).incasso.parziale || kSede(s).ricaviCur == null))
  const tutteConfrontabili = conIncasso.length > 0 && conIncasso.every(s => kSede(s).confrontabile)
  const vGruppo = tutteConfrontabili && consolidato.ricPrev > 0
    ? variazione({ attuale: consolidato.ricCur, confronto: consolidato.ricPrev }) : null
  const giorniMancanti = sediAttive.reduce((t, s) => t + (kSede(s).incasso?.scoperti || 0), 0)
  const stimati = conIncasso.some(s => kSede(s).ricaviStimati)

  const ordinate = [...conIncasso].sort((x, y) => kSede(y).ricaviCur - kSede(x).ricaviCur)
  const guida = ordinate[0]
  const quotaGuida = guida && consolidato.ricCur > 0 ? Math.round((kSede(guida).ricaviCur / consolidato.ricCur) * 100) : null
  let frase = null
  if (conIncasso.length >= 2 && guida) {
    frase = `${guida.nome} fa il ${quotaGuida}% degli incassi: ${ordinate.slice(1).map(s => `${s.nome} ${euro(kSede(s).ricaviCur)}`).join(', ')}.`
  } else if (conIncasso.length === 1) {
    frase = `Solo ${guida.nome} ha incassi in questo periodo: il confronto fra le sedi non si può fare.`
  }

  // ── Da dove vengono i numeri ────────────────────────────────────────────
  const vociCopertura = sediAttive.map(s => {
    const k = kSede(s)
    if (k.errore) return { id: `inc-${s.id}`, breve: `${s.nome}: dati non letti`, stato: 'manca', testo: `${s.nome}: ${k.errore}` }
    const i = k.incasso
    const stato = i.valore == null ? 'manca' : i.parziale ? 'parziale' : i.fonte === 'cassa' ? 'ok' : 'stima'
    const breve = stato === 'ok' ? `${s.nome}: cassa` : stato === 'stima' ? `${s.nome}: stimato` : stato === 'parziale' ? `${s.nome}: giorni mancanti` : `${s.nome}: nessun dato`
    return {
      id: `inc-${s.id}`, breve, stato, testo: `${s.nome}: ${i.testo}`,
      azione: stato !== 'ok' && onNavigate ? { etichetta: 'Registra la cassa', onClick: () => onNavigate('chiusura') } : null,
    }
  })
  if (sediAttive.some(s => kSede(s).fattureComuniStimate)) {
    vociCopertura.push({ id: 'comuni', breve: 'Spese comuni a metà', stato: 'stima',
      testo: 'Alcune spese comuni sono divise in parti uguali: nel mese della fattura non c\'è produzione registrata.',
      azione: onNavigate ? { etichetta: 'Apri Produzione', onClick: () => onNavigate('storico') } : null })
  } else if (sediAttive.some(s => kSede(s).fattureComuni > 0)) {
    vociCopertura.push({ id: 'comuni', breve: 'Spese comuni sui chili', stato: 'ok', testo: 'Le fatture di più sedi insieme sono divise in proporzione ai chili prodotti nel mese della fattura.' })
  }
  if (!sediAttive.some(s => kSede(s).giornateConDato > 0)) {
    vociCopertura.push({ id: 'foodcost', breve: 'Food cost mancante', stato: 'manca',
      testo: 'Nessuna produzione giornaliera registrata nel periodo: food cost e margine non si calcolano (non sono zero).' })
  }

  // ── La tabella: una colonna per sede ────────────────────────────────────
  const colonne = [{ chiave: 'voce', titolo: 'Voce' }, ...sediAttive.map(s => ({ chiave: s.id, titolo: s.nome, tipo: 'nodo', larghezza: isMobile ? 128 : 150 }))]
  const riga = (chiave, voce, cella, extra = {}) => ({ chiave, celle: { voce, ...Object.fromEntries(sediAttive.map(s => [s.id, cella(kSede(s), s)])) }, ...extra })
  const dif = (k) => {
    if (!conf) return num('nessun confronto')
    if (!k.confrontabile) return ND(k.ricaviCur == null ? 'mancano gli incassi' : 'nel periodo o in quello di confronto mancano dei giorni: il confronto direbbe un calo che non c\'è')
    const v = variazione({ attuale: k.ricaviCur, confronto: k.ricaviPrev })
    return <span style={{ ...tab, color: v?.verso === 'peggio' ? T.graficoPeggio : v?.verso === 'meglio' ? T.graficoMeglio : T.textMid, fontWeight: 600 }}>{v ? v.testoDelta : '-'}</span>
  }
  const righe = [
    riga('incassi', nomeIncassi(stimati), (k) => (k.ricaviCur != null ? num(euro(k.ricaviCur)) : ND(k.incasso?.testo || 'nessun dato')), { forte: true }),
    riga('giorni', 'Giorni con dati', (k) => (k.incasso
      ? <span style={{ ...tab, color: k.incasso.scoperti > 0 ? T.amberDark : T.text }}>{giorni - k.incasso.scoperti} su {giorni}</span> : ND('lettura non riuscita'))),
    riga('prima', conf ? 'Sul periodo prima' : 'Confronto', (k) => dif(k)),
    riga('chili', 'Chili prodotti', (k) => (k.kgProdotti != null ? num(nIt(k.kgProdotti)) : ND('inventario non letto'))),
    riga('fc', 'Food cost', (k) => (k.foodCostPct != null ? num(quota(k.foodCostPct)) : ND('nessuna produzione giornaliera registrata'))),
    riga('margine', 'Margine netto', (k) => (k.margineNettoCur != null ? num(euro(k.margineNettoCur)) : ND(k.ricaviCur == null ? 'mancano gli incassi' : k.incasso?.parziale ? 'mancano dei giorni di incasso' : 'manca il food cost'))),
    riga('dapagare', 'Fatture da pagare', (k) => (k.fattureImporto != null ? num(euro(k.fattureImporto)) : ND('fatture non lette'))),
    riga('comuni', 'di cui spese comuni', (k) => (k.fattureComuni != null ? <span style={{ ...tab, color: k.fattureComuniStimate ? T.amberDark : T.text }} title={k.fattureComuniStimate ? 'divise in parti uguali: nel mese non c\'è produzione registrata' : 'divise sui chili prodotti'}>{euro(k.fattureComuni)}{k.fattureComuniStimate ? ' stimato' : ''}</span> : ND('fatture non lette'))),
    riga('scadute', 'Fatture scadute', (k) => (k.fattureScadute != null ? num(k.fattureScadute) : ND('fatture non lette'))),
    riga('oggi', 'Prodotti oggi', (k) => num(k.prodOggi ?? 0)),
    riga('stock', 'Stock vetrina', (k) => num(`${nIt(k.stockPF || 0)} pz`)),
    riga('trasf', 'Trasferimenti in arrivo', (k) => num(k.trasfInArrivo ?? 0)),
  ]

  // ── Da guardare ─────────────────────────────────────────────────────────
  const avvisi = []
  for (const s of sediAttive) {
    const k = kSede(s)
    if (k.errore) { avvisi.push({ id: `e-${s.id}`, rosso: false, icona: 'alert', msg: `${s.nome}: dati non caricati (${k.errore})` }); continue }
    if (k.foodCostPct != null && k.foodCostPct > 38) avvisi.push({ id: `fc-${s.id}`, rosso: true, icona: 'receipt', msg: `${s.nome}: food cost ${quota(k.foodCostPct)}, sopra la soglia del 38%` })
    if (k.fattureScadute > 0) {
      const dedotta = k.fattureScadStimate === k.fattureScadute
      avvisi.push({ id: `fs-${s.id}`, rosso: true, icona: 'fileText', msg: `${s.nome}: ${k.fattureScadute} fattur${k.fattureScadute === 1 ? 'a scaduta' : 'e scadute'} da pagare${dedotta ? ' (scadenza dedotta a 30 giorni)' : ''}` })
    }
    if (k.trasfInArrivo > 0) avvisi.push({ id: `tr-${s.id}`, rosso: false, icona: 'truck', msg: `${s.nome}: ${k.trasfInArrivo} trasferiment${k.trasfInArrivo === 1 ? 'o' : 'i'} in attesa di ricezione` })
    if (k.margineNettoCur != null && k.margineNettoCur < 0) avvisi.push({ id: `mn-${s.id}`, rosso: true, icona: 'money', msg: `${s.nome}: margine netto negativo (${euro(k.margineNettoCur)})` })
    if (conf && k.confrontabile && k.ricaviPrev > 0 && (k.ricaviCur - k.ricaviPrev) / k.ricaviPrev < -0.15) {
      avvisi.push({ id: `ca-${s.id}`, rosso: true, icona: 'trendDown', msg: `${s.nome}: incassi ${Math.round(((k.ricaviCur - k.ricaviPrev) / k.ricaviPrev) * 100).toString().replace('-', '−')}% sul periodo prima` })
    }
  }

  const andamento = dati?.andamento || []
  const settimaneIncomplete = andamento.filter(w => w.ricavi != null && w.scoperti > 0).length
  const conDati = andamento.filter(w => w.ricavi != null)
  const fra = space[3]

  return (
    <PaginaAnalisi isMobile={isMobile} attenuata={loading}>
      {intestazione}
      <CoperturaDati isMobile={isMobile} voci={vociCopertura} />

      <NumeroPrincipale riquadro isMobile={isMobile}
        etichetta={`${nomeIncassi(stimati)} delle sedi`}
        valore={conIncasso.length > 0 ? euro(consolidato.ricCur) : null} stimato={stimati}
        motivoMancante="nessuna sede ha incassi in questo periodo"
        azione={conIncasso.length === 0 && onNavigate ? { etichetta: 'Registra la cassa', onClick: () => onNavigate('chiusura') } : null}
        variazione={vGruppo} rispettoA={conf ? `su ${nomePeriodo(conf.from, conf.to)}` : ''}
        senzaConfronto={conf && !vGruppo ? 'confronto non fatto: mancano dei giorni' : ''}
        frase={frase}
        avviso={conIncasso.length > 0 && (giorniMancanti > 0 || conIncasso.length < sediAttive.length)
          ? `incompleti: ${giorniMancanti > 0 ? `${giorniMancanti} ${giorniMancanti === 1 ? 'giorno' : 'giorni'} senza dati` : ''}${giorniMancanti > 0 && conIncasso.length < sediAttive.length ? ', ' : ''}${conIncasso.length < sediAttive.length ? `${sediAttive.length - conIncasso.length} ${sediAttive.length - conIncasso.length === 1 ? 'sede' : 'sedi'} senza incassi` : ''}`
          : ''} />

      {/* Con meno di due sedi che hanno incassi il confronto non c'è: si
          offre il periodo prima, dove di solito le sedi hanno dati. */}
      {conIncasso.length < 2 && periodoPrima && (
        <div>
          <button type="button" onClick={() => setFinestra(periodoPrima)}
            style={{ minHeight: 44, padding: `0 ${space[4]}px`, border: `1px solid ${T.border}`, borderRadius: 8, background: T.bgCard, color: T.brand, fontWeight: 600, fontSize: font.size.base, cursor: 'pointer' }}>
            Guarda {nomePeriodo(periodoPrima.from, periodoPrima.to)}
          </button>
        </div>
      )}

      {ordinate.length > 0 && (
        <Riquadro isMobile={isMobile}>
          <TitoloGrafico
            titolo={conIncasso.length >= 2 ? `${guida.nome} incassa di più` : 'Gli incassi per sede'}
            sottotitolo={`${nomePeriodo(da, a)}, senza IVA. ${incompleti.length ? `Le sedi con giorni senza dati sono in ambra: il numero è un minimo.` : 'Tutti i giorni hanno un dato.'}`} />
          <ElencoBarre isMobile={isMobile} etichetta="Incassi per sede"
            voci={sediAttive.map(s => ({
              chiave: s.id, etichetta: s.nome, valore: kSede(s).ricaviCur ?? null,
              incompleto: !!kSede(s).incasso?.parziale,
              nota: kSede(s).incasso?.scoperti > 0 ? `${kSede(s).incasso.scoperti} ${kSede(s).incasso.scoperti === 1 ? 'giorno' : 'giorni'} senza dati` : undefined,
            }))} />
        </Riquadro>
      )}

      <Riquadro isMobile={isMobile}>
        <TitoloGrafico titolo="Le sedi, voce per voce"
          sottotitolo="Incassi, giorni coperti, spese e magazzino. «Non lo so» vuol dire che il dato manca: non è zero." />
        <TabellaAnalisi etichetta="Confronto fra le sedi" isMobile={isMobile} colonne={colonne} righe={righe} />
      </Riquadro>

      {conDati.length >= 2 && (
        <Riquadro isMobile={isMobile}>
          <TitoloGrafico titolo={`Ultima settimana: ${euro(conDati[conDati.length - 1].ricavi)}, prima ${euro(conDati[conDati.length - 2].ricavi)}`}
            sottotitolo={`Incassi di tutte le sedi, ultime 8 settimane, dal ${dataBreve(andamento[0].lunIso)}. Le settimane senza dati restano vuote.${settimaneIncomplete ? ` In ${settimaneIncomplete} ${settimaneIncomplete === 1 ? 'settimana' : 'settimane'} mancano dei giorni: sono più basse del vero.` : ''}`} />
          <Andamentino valori={andamento.map(w => w.ricavi)} scelto={andamento.length - 1} larghezza={isMobile ? 280 : 480} altezza={64} etichetta="Incassi delle ultime 8 settimane" />
        </Riquadro>
      )}

      {avvisi.length > 0 && (
        <Riquadro isMobile={isMobile}>
          <TitoloGrafico titolo={`Da guardare: ${avvisi.length}`} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: fra }}>
            {avvisi.map(v => (
              <div key={v.id} style={{ display: 'flex', alignItems: 'flex-start', gap: space[2], ...testo(font.size.base), color: v.rosso ? T.red : T.amberDark }}>
                <span style={{ flexShrink: 0, marginTop: 2 }}><Icon name={v.icona} size={16} /></span>
                <span>{v.msg}</span>
              </div>
            ))}
          </div>
        </Riquadro>
      )}

    </PaginaAnalisi>
  )
}
