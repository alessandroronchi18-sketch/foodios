// ── Il mese: quanto hai guadagnato, e perché ────────────────────────────
//
// La prima pagina della nuova Analisi (ANALISI_DESIGN.md). Il titolare,
// 03/10/2026: «la parte di analisi è fatta male e inutile»; alle domande ha
// risposto «non capisco cosa guardare», «grafici inutili o brutti», «mancano
// le cose che servono», e che la prima domanda è «quanto guadagno e perché».
//
// Quindi una domanda sola, in cima, e sotto la risposta in quest'ordine:
//   1. da dove vengono i numeri e cosa manca (con il pulsante per sistemarlo);
//   2. l'utile, o perché non si può dire, con lo stesso mese dell'anno prima;
//   3. la cascata dagli incassi all'utile;
//   4. le cause della differenza con l'anno prima, in frasi con il numero;
//   5. materie prime, personale e prime cost contro l'obiettivo;
//   6. le sedi affiancate;
//   7. gli ultimi dodici mesi.
import React, { useMemo, useState } from 'react'
import { color as T, font, ui3, space } from '../lib/theme'
import Icon from '../components/Icon'
import { testo, intestazione, cifreInColonna } from '../components/analisi/misure'

// «124.553», «−2.020»: le cifre senza l'euro, per le colonne che lo dicono in testa.
const NF0 = new Intl.NumberFormat('it-IT', { useGrouping: 'always', maximumFractionDigits: 0 })
const cifra = (n) => `${n < 0 && Math.round(Math.abs(n)) > 0 ? '−' : ''}${NF0.format(Math.abs(n))}`
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import {
  CoperturaDati, NumeroConConfronto, NumeroPrincipale, FilaTessere, BarraObiettivo, Cascata, conConfronto, IntestazioneAnalisi,
  TitoloGrafico, Riquadro, FraseInsight, ClassificaSpese, ElencoDivergente,
} from '../components/analisi'
import { euro, euroSegno, quota, nomeMese, aMese, variazione, dataBreve } from '../lib/formatoAnalisi'
import { OBIETTIVI, causeDelCambio, titoloCause, titoloCascata, motivoSenzaUtile, nomeIncassi, ivaDelleSpese } from '../lib/ilMese'
import { nomeBreve } from '../lib/contoEconomico'
import PaginaAnalisi, { SezioneAnalisi, spazioRiquadri } from '../components/analisi/PaginaAnalisi'
import MeseAnalisi, { useMeseAnalisi, PulsanteTorna, meseCorrente } from '../components/analisi/MeseAnalisi'

/**
 * Le voci della riga «Da dove vengono i numeri», dal risultato della lettura.
 * Ognuna ha il suo nome breve (`breve`): la copertura chiusa li usa per dire
 * che cosa è stimato o manca («Incassi stimati · 3 dati da sistemare»), non
 * solo quanti (04/10: diceva «1 numero stimato», e non si sapeva quale).
 */
export function vociCopertura(dati, { onNavigate, onClassifica } = {}) {
  if (!dati?.attuale) return []
  const { incassi, costi, personale } = dati.attuale
  const voci = []
  voci.push(incassi.fonte === 'cassa'
    ? { id: 'incassi', breve: incassi.parziale ? 'Cassa a metà' : 'Incassi dalla cassa', stato: incassi.parziale ? 'parziale' : 'ok', testo: `Incassi ${incassi.testo}`, azione: incassi.parziale && onNavigate ? { etichetta: 'Registra la cassa', onClick: () => onNavigate('chiusura') } : null }
    : incassi.fonte === 'stima'
      ? { id: 'incassi', breve: 'Incassi stimati', stato: 'stima', testo: `incassi ${incassi.testo}`, azione: onNavigate ? { etichetta: 'Registra la cassa', onClick: () => onNavigate('chiusura') } : null }
      : { id: 'incassi', breve: 'Incassi mancanti', stato: 'manca', testo: `gli incassi: ${incassi.testo}`, azione: onNavigate ? { etichetta: 'Registra la cassa', onClick: () => onNavigate('chiusura') } : null })
  if (!costi) {
    voci.push({ id: 'fatture', breve: 'Fatture non lette', stato: 'manca', testo: 'le fatture non si sono potute leggere' })
  } else {
    const c = costi.copertura || {}
    // Le fatture del mese finiscono prima della fine del mese (l'ultimo
    // import da WebDesk è del 10/09): il mese è a metà, e va detto.
    if (c.ultimaFattura && c.ultimaFattura < `${dati.mese}-25` && dati.mese < meseCorrente()) {
      voci.push({ id: 'fattureFino', breve: `Fatture fino al ${dataBreve(c.ultimaFattura)}`, stato: 'parziale', testo: `fatture registrate fino al ${dataBreve(c.ultimaFattura)}: il mese è incompleto`, azione: onNavigate ? { etichetta: 'Carica lo ZIP', onClick: () => onNavigate('scadenzario') } : null })
    }
    voci.push(c.importoIvaCompresa > 0
      ? { id: 'fatture', breve: 'Spese IVA compresa', stato: 'parziale', testo: `${c.nFatture} fatture, ${c.nSenzaImponibile} senza imponibile: ${euro(c.importoIvaCompresa)} contati con l'IVA`, azione: onNavigate ? { etichetta: 'Carica lo ZIP', onClick: () => onNavigate('scadenzario') } : null }
      : { id: 'fatture', breve: 'Fatture senza IVA', stato: 'ok', testo: `${c.nFatture || 0} fatture del mese, senza IVA` })
    // Le fatture fuori scala (una GECKO da 86.651 € a luglio): prima un
    // riquadro giallo a sé, sotto le tessere. Ora il conto sta sotto il numero
    // delle spese (avviso, §6) e qui il dettaglio, con dove andare a guardarle.
    const ecc = dati.attuale.eccezionali || []
    if (ecc.length > 0) {
      voci.push({ id: 'fuoriScala', breve: ecc.length === 1 ? '1 fattura fuori scala' : `${ecc.length} fatture fuori scala`, stato: 'parziale',
        testo: `${ecc.slice(0, 3).map(f => `${f.fornitore}, ${euro(f.importo)} il ${dataBreve(f.data)}`).join('; ')}: se sono investimenti (attrezzature, lavori) non sono spese del mese. Finché non lo dici, le conto come spese`,
        azione: onNavigate ? { etichetta: 'Apri', onClick: () => onNavigate('scadenzario') } : null })
    }
    if (costi.daClassificare?.importo > 0) {
      voci.push({ id: 'categorie', breve: 'Spese senza voce', stato: 'parziale', testo: `${euro(costi.daClassificare.importo)} di spese di ${costi.daClassificare.nFornitori} fornitori senza categoria`, azione: onClassifica ? { etichetta: 'Classifica', onClick: onClassifica } : null })
    }
  }
  voci.push({ id: 'personale', breve: personale.stato === 'ok' ? 'Personale' : personale.stato === 'manca' ? 'Personale mancante' : 'Personale incompleto', stato: personale.stato === 'ok' ? 'ok' : personale.stato, testo: personale.stato === 'ok' ? `Personale: ${personale.testo}` : `personale: ${personale.testo}`, azione: personale.stato !== 'ok' && onNavigate ? { etichetta: 'Apri Personale', onClick: () => onNavigate('personale') } : null })
  return voci
}

export default function IlMeseView({ orgId, sedi = [], sedeId = null, onNavigate, notify }) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  // La classificazione dei fornitori si apre qui dentro: finita, il conto
  // si rilegge da solo (`versione`), senza cambiare pagina.
  const [classifica, setClassifica] = useState(false)
  const [versione, setVersione] = useState(0)
  const [percheAperto, setPercheAperto] = useState(false)
  // Il mese guardato, la lettura e la regola del primo mese stanno in
  // MeseAnalisi: il Conto economico usa le stesse (audit 04/10, C9 e CE2).
  const { mese, setMese, dati, caricando, errore, spostato } = useMeseAnalisi({ orgId, sedi, sedeId, versione })

  const conto = dati?.attuale?.conto || null
  const contoPrima = dati?.annoPrima?.conto || null
  const cause = useMemo(() => causeDelCambio(conto, contoPrima), [conto, contoPrima])
  const nomeSede = sedeId ? (sedi.find(s => s.id === sedeId)?.nome || 'questa sede') : 'Tutta l\'azienda'

  const intestazione = (
    <IntestazioneAnalisi isMobile={isMobile}
      domanda={`Quanto hai guadagnato ${aMese(mese, { anno: false })}?`}
      sotto={`${nomeSede} · confronto con ${nomeMese(dati?.confronto || mese)}`}
      destra={<MeseAnalisi mese={mese} onCambia={setMese} spostato={spostato} />} />
  )

  if (classifica) return (
    <ClassificaSpese orgId={orgId} notify={notify} isMobile={isMobile}
      torna={<PulsanteTorna onClick={() => setClassifica(false)}>Torna {aMese(mese, { anno: false })}</PulsanteTorna>}
      onSalvato={() => { setClassifica(false); setVersione(v => v + 1) }} />
  )
  if (caricando && !dati) return <PaginaAnalisi isMobile={isMobile}>{intestazione}<Riquadro isMobile={isMobile}><span style={{ color: T.textSoft, fontSize: font.size.base }}>Metto insieme cassa, fatture e personale…</span></Riquadro></PaginaAnalisi>
  if (errore) return <PaginaAnalisi isMobile={isMobile}>{intestazione}<Riquadro isMobile={isMobile}><span style={{ color: T.red, fontSize: font.size.base }}>Non sono riuscito a leggere i dati: {errore}</span></Riquadro></PaginaAnalisi>
  if (!conto) return null

  const vUtile = conto.utile != null && contoPrima?.utile != null ? variazione({ attuale: conto.utile, confronto: contoPrima.utile }) : null
  const vIncassi = conto.ricavi != null && contoPrima?.ricavi != null ? variazione({ attuale: conto.ricavi, confronto: contoPrima.ricavi }) : null
  // Con le fatture del mese a metà, un confronto delle spese direbbe «−49%»
  // in verde: un calo che non c'è. Non si fa.
  const ultimaFattura = dati.attuale.costi?.copertura?.ultimaFattura || null
  const fattureAMeta = !!(ultimaFattura && ultimaFattura < `${mese}-25` && mese < meseCorrente())
  const vSpese = !fattureAMeta && conto.spese != null && contoPrima?.spese != null ? variazione({ attuale: conto.spese, confronto: contoPrima.spese, piuEMeglio: false }) : null
  const meseConfronto = dati.confronto
  // Le spese con l'IVA dentro (fatture senza imponibile) si dicono accanto ai
  // numeri che toccano, non solo nella copertura chiusa (§6, 04/10).
  const iva = ivaDelleSpese(dati.attuale.costi)
  const conIva = iva.stato !== 'senza'
  const materieIncomplete = conto.speseFatture > 0 && conto.daClassificare > conto.speseFatture * 0.05
  const eccezionali = dati.attuale.eccezionali || []
  // Una griglia sola per tutta la pagina (audit 04/10, IM4): le tessere e la
  // riga cascata + cause tagliano le colonne nello stesso punto, con lo
  // stesso spazio fra i riquadri della pagina (24 al computer, 16 al telefono).
  const colonne = ui3(isMobile, isTablet, { telefono: '1fr', tablet: '1fr 1fr', computer: 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr)' })
  const fra = spazioRiquadri(isMobile)
  const unaRiga = isMobile || isTablet
  const senzaCause = dati.annoPrima ? `Per ${nomeMese(meseConfronto)} mancano i dati per confrontare voce per voce.` : 'Non ci sono dati dell\'anno prima.'
  const quoteMargine = [
    { etichetta: 'Materie prime', valore: materieIncomplete ? null : conto.quote.materiePrime, obiettivo: OBIETTIVI.materiePrime,
      motivoMancante: conto.ricavi == null ? 'mancano gli incassi' : materieIncomplete ? `prima classifica ${euro(conto.daClassificare)} di spese` : 'mancano le fatture' },
    { etichetta: 'Personale', valore: conto.quote.personale, obiettivo: OBIETTIVI.personale,
      motivoMancante: conto.personale == null ? 'stipendi non registrati' : 'mancano gli incassi' },
    { etichetta: 'Materie prime + personale', valore: materieIncomplete ? null : conto.quote.primeCost, obiettivo: OBIETTIVI.primeCost,
      motivoMancante: 'servono tutte e due' },
  ]
  const risposta = rispostaDelMese({ conto, contoPrima, mese, meseConfronto, vUtile, iva, attuale: dati.attuale, onNavigate })

  return (
    <PaginaAnalisi isMobile={isMobile} attenuata={caricando}>
      {intestazione}
      <CoperturaDati isMobile={isMobile} voci={vociCopertura(dati, { onNavigate, onClassifica: () => setClassifica(true) })} />

      {/* ── La risposta ───────────────────────────────────────────────
          Una sola, grande (NumeroPrincipale). Prima la cosa più grande della
          pagina era «Non posso dirtelo: manca il personale», e il numero che
          si sa stava in una riga da 12 px (audit 04/10, IM3). Incassi e
          spese un gradino sotto, nella fila di tessere incolonnate. */}
      <div style={{ display: 'grid', gridTemplateColumns: colonne, gap: fra }}>
        <div style={{ gridColumn: isTablet && !isMobile ? '1 / -1' : 'auto', display: 'grid', minWidth: 0 }}>
          <NumeroPrincipale riquadro isMobile={isMobile} {...risposta} />
        </div>
        {/* `grid`: la fila delle tessere si allunga fino in fondo alla riga,
            e le tessere finiscono alla stessa altezza della risposta. */}
        <div style={{ gridColumn: ui3(isMobile, isTablet, { telefono: 'auto', tablet: '1 / -1', computer: '2 / 4' }), minWidth: 0, display: 'grid' }}>
          <FilaTessere isMobile={isMobile}>
            {/* Il nome degli incassi è lo stesso in tutte le pagine (nomeIncassi):
                «stimati» sta nel nome, «senza IVA» nella riga sotto il numero. */}
            <NumeroConConfronto isMobile={isMobile} etichetta={nomeIncassi(conto.stimato)}
              valore={conto.ricavi != null ? euro(conto.ricavi) : null} motivoMancante="nessun dato"
              variazione={vIncassi} rispettoA={`su ${nomeMese(meseConfronto, { anno: true })}`}
              contesto={dati.attuale.incassi.fonte === 'stima' ? 'dall\'inventario, senza IVA' : dati.attuale.incassi.fonte === 'cassa' ? 'dalla cassa, senza IVA' : ''} />
            <NumeroConConfronto isMobile={isMobile} etichetta="Spese del mese"
              valore={conto.spese != null ? euro(conto.spese) : null} motivoMancante="fatture non lette"
              variazione={vSpese} rispettoA={`su ${nomeMese(meseConfronto, { anno: true })}`}
              // L'IVA dentro le spese è l'avvertimento del pezzo comune, in
              // ambra sotto il numero (§6); la nota dice il resto.
              avviso={[iva.riga, eccezionali.length ? `${eccezionali.length === 1 ? 'una fattura' : `${eccezionali.length} fatture`} fuori scala (${euro(eccezionali.reduce((t, f) => t + (Number(f.importo) || 0), 0))}): ${eccezionali.length === 1 ? 'è un investimento' : 'sono investimenti'}?` : ''].filter(Boolean).join(' · ')}
              contesto={fattureAMeta ? `fatture registrate fino al ${dataBreve(ultimaFattura)}` : conto.personale == null && conto.speseFatture != null ? 'senza il personale, che manca' : 'fatture e personale'} />
          </FilaTessere>
        </div>
      </div>


      {/* La cascata è la tabella del conto (scelta 1): voce · barra · € del
          mese · % sugli incassi · differenza con l'anno prima. Prende tutta
          la riga; la barra scura è quella di cui parla il titolo. Il perché,
          ordinato per euro di impatto, si apre a un tocco sotto (scelta 7):
          prima «Cosa è cambiato» stava sempre aperto accanto, e senza cause
          era un riquadro con una frase sola (audit 04/10, IM9 e IM14). */}
      <Riquadro isMobile={isMobile}>
        <TitoloGrafico titolo={titoloCascata(conto, iva)}
          sottotitolo={`${iva.stato === 'senza' ? 'Incassi e spese senza IVA.' : 'Incassi senza IVA.'} Le spese vengono dalle fatture del mese, per data.${cause.length ? '' : ` ${senzaCause}`}`} />
        <Cascata isMobile={isMobile} ricavi={conto.ricavi} avviso={iva.riga}
          passi={conConfronto(conto.passi, contoPrima?.passi)}
          titoloValore={nomeMese(mese, { anno: false })} titoloConfronto={`su ${nomeMese(meseConfronto)}`}
          evidenzia={conto.utile != null ? 'utile' : null} />
        {cause.length > 0 && (
          <Perche aperto={percheAperto} onApri={() => setPercheAperto(v => !v)} meseConfronto={meseConfronto}>
            <p style={{ margin: `0 0 ${space[3]}px`, ...testo(font.size.md), fontWeight: 600, color: T.text }}>{titoloCause(cause, meseConfronto)}</p>
            <ElencoDivergente isMobile={isMobile} titoloValore={`su ${nomeMese(meseConfronto)}, €`}
              voci={cause.map(c => ({
                chiave: c.chiave, etichetta: c.etichetta, valore: Math.round(c.attuale - c.prima),
                verso: c.effetto >= 0 ? 'meglio' : 'peggio',
                // Il fornitore principale solo, in nome breve: due nomi interi
                // andavano su tre righe nella colonna delle voci.
                nota: c.fornitori?.length ? `soprattutto ${nomeBreve(c.fornitori[0].nome)} ${euroSegno(c.fornitori[0].delta).replace(' €', '')}` : undefined,
              }))} />
          </Perche>
        )}
      </Riquadro>

      {/* Le tre quote contro l'obiettivo. Se non se ne sa nessuna, niente
          riquadro di «non lo so»: una riga che dice quando ci saranno
          (audit 04/10, IM6). Con molte spese ancora senza categoria la quota
          delle materie prime è un minimo, non la quota: «1,6%, sotto
          l'obiettivo» in verde sarebbe una buona notizia falsa. */}
      {quoteMargine.some(q => q.valore != null) ? (
        <Riquadro isMobile={isMobile}>
          <TitoloGrafico titolo="Le tre spese che decidono il margine"
            sottotitolo="Quanto pesano sugli incassi. Gli obiettivi sono indicativi: per la pasticceria artigiana non ci sono riferimenti italiani solidi, conta il confronto con te stesso." />
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: fra }}>
            {quoteMargine.map(q => <BarraObiettivo key={q.etichetta} {...q} />)}
          </div>
        </Riquadro>
      ) : (
        <p style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'flex-start', ...testo(font.size.base), color: T.textSoft }}>
          <span aria-hidden="true" style={{ display: 'inline-flex', height: 20, alignItems: 'center', flexShrink: 0 }}><Icon name="info" size={14} /></span>
          <span>Materie prime e personale sugli incassi, contro l&apos;obiettivo: li calcolo quando le spese avranno la voce e gli stipendi ci saranno.</span>
        </p>
      )}

      {/* Due capitoli dopo il conto del mese: i negozi, poi l'anno. */}
      {dati.perSede && Object.keys(dati.perSede).length > 1 && (
        <SezioneAnalisi isMobile={isMobile} etichetta="I negozi">
          <Riquadro isMobile={isMobile}>
            <TitoloGrafico titolo={titoloSedi(dati.perSede)} sottotitolo={`Stesso conto, negozio per negozio. ${testoRipartizione(dati.perSede)}${conIva ? ` Spese ${iva.breve}.` : ''}`} />
            <SediAffiancate perSede={dati.perSede} isMobile={isMobile} />
          </Riquadro>
        </SezioneAnalisi>
      )}

      <SezioneAnalisi isMobile={isMobile} etichetta="Gli ultimi dodici mesi">
        <Riquadro isMobile={isMobile}>
          <UltimiMesi andamento={dati.andamento} isMobile={isMobile} meseScelto={mese} onScegli={setMese} />
        </Riquadro>
      </SezioneAnalisi>

      {/* L'ultimo inventario si dice solo se finisce prima della fine del
          mese guardato: «ultimo inventario 31/07» guardando luglio, quando
          l'inventario arriva al 31/08, era vero solo dentro la finestra letta. */}
      <div style={{ fontSize: font.size.sm, color: T.textSoft, lineHeight: '16px' }}>
        {dati.ultimoInventario && dati.ultimoInventario < `${mese}-28` ? `Inventario registrato fino al ${dataBreve(dati.ultimoInventario)}. ` : ''}Incassi senza IVA al 10%.
      </div>
    </PaginaAnalisi>
  )
}

/**
 * Le prop di NumeroPrincipale per la domanda «Quanto hai guadagnato?».
 * L'utile se si sa. Se manca il personale, il numero che si sa (incassi meno
 * fatture, «Rimasti prima del personale») con il perché in ambra e il
 * passaggio per sistemarlo, e accanto lo stesso numero dell'anno prima: un
 * numero non sta mai da solo. Se le spese hanno l'IVA dentro lo dice.
 */
export function rispostaDelMese({ conto, contoPrima, mese, meseConfronto, vUtile, iva, attuale, onNavigate }) {
  const etichetta = `Utile di ${nomeMese(mese, { anno: false })}`
  const conIva = iva && iva.stato !== 'senza'
  if (conto.utile != null) {
    const investimenti = conto.investimenti > 0 ? ` Fuori dal conto ${euro(conto.investimenti)} di investimenti.` : ''
    return {
      etichetta, valore: euro(conto.utile), stimato: conto.stimato,
      variazione: vUtile, rispettoA: `su ${nomeMese(meseConfronto)}`, valoreConfronto: contoPrima?.utile != null ? euro(contoPrima.utile) : '',
      avviso: conIva ? `Più basso del vero: le spese in fattura sono ${iva.breve}` : '',
      frase: conto.ricavi > 0 ? `È il ${quota(conto.quote.utile)} degli incassi.${investimenti}` : null,
    }
  }
  const apriPersonale = onNavigate ? { etichetta: 'Apri Personale', onClick: () => onNavigate('personale') } : null
  if (conto.primaDelPersonale != null && conto.personale == null) {
    const prima = contoPrima?.primaDelPersonale != null && contoPrima?.personale == null ? ` ${maiuscola(aMese(meseConfronto))} erano ${euro(contoPrima.primaDelPersonale)}.` : ''
    return {
      etichetta, valore: null,
      motivoMancante: 'l\'utile vero sarà più basso: manca il personale',
      noto: { valore: euro(conto.primaDelPersonale), etichetta: 'Rimasti prima del personale', stimato: conto.stimato },
      azione: apriPersonale,
      // Incassi senza IVA meno spese con l'IVA: il numero è più basso del
      // vero, e lo si dice sotto il numero (§6), non in fondo alla frase.
      avviso: conIva ? `Più basso del vero: le spese in fattura sono ${iva.breve}` : '',
      frase: `Incassi meno le spese in fattura.${prima}`,
    }
  }
  return {
    etichetta, valore: null,
    motivoMancante: `Non lo so ancora: ${motivoSenzaUtile(conto, attuale)}`,
    azione: conto.personale == null ? apriPersonale : null,
  }
}
const maiuscola = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t)

/** «Perché è cambiato da agosto 2025?»: il pulsante e quello che apre. */
function Perche({ aperto, onApri, meseConfronto, children }) {
  return (
    <div style={{ marginTop: space[2], borderTop: `1px solid ${T.borderSoft}` }}>
      <button type="button" onClick={onApri} aria-expanded={aperto} style={{
        display: 'inline-flex', alignItems: 'center', gap: space[1], minHeight: 44, padding: 0, border: 'none', background: 'transparent',
        color: T.brand, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', ...testo(font.size.md),
      }}>
        {`Perché è cambiato da ${nomeMese(meseConfronto)}?`}
        <Icon name={aperto ? 'chevUp' : 'chevDown'} size={16} />
      </button>
      {aperto && <div style={{ paddingTop: space[2] }}>{children}</div>}
    </div>
  )
}

/** Come sono state divise le spese condivise, detto com'è andata davvero. */
function testoRipartizione(perSede) {
  const r = Object.values(perSede).map(s => s.costi?.ripartizione).find(x => x && x.criterio)
  if (!r) return 'Le spese di una sede sola restano sue.'
  return `Le spese condivise sono divise ${r.criterio}${r.certa === false ? ' (in parti uguali dove manca la produzione)' : ''}.`
}

function titoloSedi(perSede) {
  const conUtile = Object.values(perSede).filter(s => s.conto.utile != null)
  if (conUtile.length >= 2) {
    const migliore = conUtile.reduce((a, b) => ((b.conto.quote.utile ?? -1e9) > (a.conto.quote.utile ?? -1e9) ? b : a))
    return `${migliore.sede.nome} è il negozio che rende di più`
  }
  return 'I negozi uno accanto all\'altro'
}

/** Le sedi sulla stessa scala: utile, incassi, spese. */
function SediAffiancate({ perSede, isMobile }) {
  const voci = Object.values(perSede)
  const max = Math.max(1, ...voci.map(s => Math.max(s.conto.ricavi || 0, s.conto.spese || 0)))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${Math.min(voci.length, 4)}, minmax(0, 1fr))`, gap: spazioRiquadri(isMobile) }}>
      {voci.map(s => {
        const c = s.conto
        return (
          <div key={s.sede.id} style={{ minWidth: 0 }}>
            <div style={{ fontSize: font.size.md, fontWeight: 800, color: T.text, marginBottom: 6 }}>{s.sede.nome}</div>
            <RigaBarra etichetta={nomeIncassi(c.stimato)} valore={c.ricavi} max={max} colore={T.graficoReale} />
            <RigaBarra etichetta="Spese" valore={c.spese} max={max} colore={T.graficoConfronto} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: font.size.base }}>
              <span style={{ color: T.textSoft }}>Utile</span>
              <span style={{ fontWeight: 800, color: c.utile == null ? T.textSoft : c.utile < 0 ? T.red : T.text, fontVariantNumeric: 'tabular-nums' }}>
                {c.utile == null ? 'non lo so' : `${euro(c.utile)} · ${quota(c.quote.utile)}`}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RigaBarra({ etichetta, valore, max, colore }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: font.size.sm, color: T.textSoft, marginBottom: 2 }}>
        <span>{etichetta}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', color: T.textMid }}>{valore == null ? 'non lo so' : euro(valore)}</span>
      </div>
      <div style={{ height: 10, background: T.graficoGriglia, borderRadius: 4, overflow: 'hidden' }} aria-hidden="true">
        {valore != null && <div style={{ width: `${Math.max(0, Math.min(100, (valore / max) * 100))}%`, height: '100%', background: colore, borderRadius: '0 4px 4px 0' }} />}
      </div>
    </div>
  )
}

/** Gli ultimi 12 mesi: incassi e spese affiancati, sulla stessa scala. */
function UltimiMesi({ andamento = [], isMobile, meseScelto, onScegli }) {
  const [tabella, setTabella] = useState(false)
  const mesi = andamento.filter(Boolean)
  const max = Math.max(1, ...mesi.map(m => Math.max(m.conto.ricavi || 0, m.conto.spese || 0)))
  const conUtile = mesi.filter(m => m.conto.utile != null)
  const inUtile = conUtile.filter(m => m.conto.utile >= 0).length
  const titolo = conUtile.length
    ? `In utile ${inUtile} mesi su ${conUtile.length} con tutti i dati`
    : 'Incassi e spese degli ultimi dodici mesi'
  const altezza = isMobile ? 120 : 160
  return (
    <>
      <TitoloGrafico titolo={titolo}
        sottotitolo={`Colonna scura: incassi senza IVA (tratteggiata se stimati). Colonna chiara: spese${mesi.some(m => ivaDelleSpese(m.costi).stato !== 'senza') ? ', con l\'IVA dove le fatture non hanno l\'imponibile' : ''}. Tocca un mese per aprirlo.`}
        destra={(
          <div style={{ display: 'flex', gap: 10, fontSize: font.size.sm, color: T.textSoft, flexShrink: 0 }} aria-hidden="true">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: T.graficoReale }} />Incassi</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: T.graficoConfronto }} />Spese</span>
          </div>
        )} />
      {/* Al telefono la griglia voleva 378 px in un riquadro di 354 e il mese
          scelto, l'ultimo, restava tagliato sul bordo (audit 04/10, IM7): le
          dodici colonne si dividono lo spazio che c'è. */}
      <div>
        <div role="list" aria-label="Gli ultimi dodici mesi" style={{ display: 'grid', gridTemplateColumns: `repeat(${mesi.length}, ${isMobile ? 'minmax(0, 1fr)' : 'minmax(40px, 1fr)'})`, gap: isMobile ? 2 : 8, alignItems: 'end' }}>
          {mesi.map(m => {
            const c = m.conto
            const h = (v) => (v == null ? 0 : Math.max(2, (v / max) * altezza))
            const scelto = m.mese === meseScelto
            return (
              <button key={m.mese} type="button" role="listitem" onClick={() => onScegli(m.mese)} aria-current={scelto ? 'true' : undefined}
                aria-label={`${nomeMese(m.mese)}: incassi ${c.ricavi == null ? 'non noti' : euro(c.ricavi)}, spese ${c.spese == null ? 'non note' : euro(c.spese)}, utile ${c.utile == null ? 'non noto' : euro(c.utile)}`}
                title={`${nomeMese(m.mese)} · incassi ${c.ricavi == null ? '—' : euro(c.ricavi)} · spese ${c.spese == null ? '—' : euro(c.spese)} · utile ${c.utile == null ? '—' : euro(c.utile)}`}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '4px 0', border: 'none', borderRadius: 6, background: scelto ? T.bgSubtle : 'transparent', cursor: 'pointer', font: 'inherit' }}>
                <div style={{ height: altezza, display: 'flex', alignItems: 'flex-end', gap: 2 }}>
                  <span style={{ width: isMobile ? 8 : 12, height: h(c.ricavi), background: c.stimato ? 'transparent' : T.graficoReale, border: c.stimato && c.ricavi != null ? `2px dashed ${T.graficoReale}` : 'none', boxSizing: 'border-box', borderRadius: '4px 4px 0 0' }} />
                  <span style={{ width: isMobile ? 8 : 12, height: h(c.spese), background: T.graficoConfronto, borderRadius: '4px 4px 0 0' }} />
                </div>
                <span style={{ fontSize: font.size.sm, color: scelto ? T.text : T.textSoft, fontWeight: scelto ? 700 : 500 }}>{nomeMese(m.mese, { anno: false }).slice(0, 3)}</span>
              </button>
            )
          })}
        </div>
      </div>
      <button type="button" onClick={() => setTabella(t => !t)} aria-expanded={tabella}
        style={{ marginTop: 8, border: 'none', background: 'transparent', color: T.textSoft, fontSize: font.size.sm, fontWeight: 600, cursor: 'pointer', padding: '6px 0', fontFamily: 'inherit', minHeight: 44 }}>
        {tabella ? 'Nascondi i numeri' : 'Vedi i numeri in tabella'}
      </button>
      {tabella && (
        <div style={{ overflowX: 'auto' }}>
          {/* L'euro sta nell'intestazione e non in ogni cella, come nelle altre
              tabelle dell'Analisi: così la tabella sta nel telefono (prima
              minWidth 420 in un riquadro di 356, 04/10). */}
          <table aria-label="Gli ultimi dodici mesi, in numeri" style={{ width: '100%', borderCollapse: 'collapse', ...testo(font.size.base) }}>
            <thead>
              <tr>
                <th scope="col" style={{ ...intestazione, textAlign: 'left', padding: '8px 4px' }}>Mese</th>
                <th scope="col" style={{ ...intestazione, textAlign: 'right', padding: '8px 4px' }}>Incassi, €</th>
                <th scope="col" style={{ ...intestazione, textAlign: 'right', padding: '8px 4px' }}>Spese, €</th>
                <th scope="col" style={{ ...intestazione, textAlign: 'right', padding: '8px 4px' }}>Utile, €</th>
              </tr>
            </thead>
            <tbody>
              {mesi.map(m => (
                <tr key={m.mese} style={{ borderTop: `1px solid ${T.borderSoft}` }}>
                  <td style={{ textAlign: 'left', padding: '8px 4px', color: T.text }}>{nomeMese(m.mese)}</td>
                  <td style={{ ...cifreInColonna, padding: '8px 4px' }}>{m.conto.ricavi == null ? '—' : `${cifra(m.conto.ricavi)}${m.conto.stimato ? ' *' : ''}`}</td>
                  <td style={{ ...cifreInColonna, padding: '8px 4px' }}>{m.conto.spese == null ? '—' : cifra(m.conto.spese)}</td>
                  <td style={{ ...cifreInColonna, padding: '8px 4px', fontWeight: 700, color: m.conto.utile < 0 ? T.red : T.text }}>{m.conto.utile == null ? '—' : cifra(m.conto.utile)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: font.size.sm, color: T.textSoft, marginTop: 4 }}>* incassi stimati dall&apos;inventario</div>
        </div>
      )}
    </>
  )
}
