// ── Produzione: «Quanto ho prodotto e venduto?» ──────────────────────────
//
// La pagina dell'Analisi per chi lavora col metodo inventario (si conta la
// vetrina ogni sera: gelaterie, yogurterie, pasta fresca). Rifatta il
// 04/10/2026 secondo ANALISI_DESIGN.md; la pagina di prima aveva voto 18/100
// all'audit del 03/10: quattro tessere senza giudizio, un grafico «Prodotto
// e venduto» con tre colori per categoria, una classifica che ripeteva la
// tabella, e quattro riquadri gialli sopra i numeri.
//
// Adesso, dall'alto: la domanda, il periodo, da dove vengono i numeri (una
// riga, `CoperturaDati`), il venduto col suo confronto e le altre tessere,
// il conto della vetrina (c'era + fatto − venduto − buttato = resta), il
// venduto per settimana, il giorno della settimana, le sedi affiancate, la
// tabella per gusto, e in fondo quello che c'è da sistemare.
//
// Questo file impagina e basta. I conti sono in `produzione/useContiProduzione`
// (che chiama le librerie provate), i pezzi in `produzione/*`.
import React, { useRef } from 'react'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { color as T, font, radius as R } from '../lib/theme'
import { CoperturaDati, IntestazioneAnalisi, TitoloGrafico, Riquadro, FraseInsight } from '../components/analisi'
import Icon from '../components/Icon'
import { useContiProduzione } from './produzione/useContiProduzione'
import { vociCopertura } from './produzione/copertura'
import { esportaXlsx } from './produzione/esporta'
import GustiSenzaRicetta from './produzione/GustiSenzaRicetta'
import CaselleDaSistemare from './produzione/CaselleDaSistemare'
import PeriodoVuoto from './produzione/PeriodoVuoto'
import Tessere from './produzione/Tessere'
import ContoVetrina from './produzione/ContoVetrina'
import GraficoVenduto from './produzione/GraficoVenduto'
import GiornoSettimana from './produzione/GiornoSettimana'
import SediAffiancate from './produzione/SediAffiancate'
import TabellaGusti from './produzione/TabellaGusti'
import { frasiProduzione } from './produzione/frasi'

/**
 * @param {Object} props
 * @param {Array} props.rows      righe di inventario_produzione del periodo (con i 7 giorni prima)
 * @param {Array} props.rowsPrev  righe del periodo di confronto
 * @param {string} props.dateFrom / props.dateTo  il periodo guardato
 * @param {string|null} props.prevFrom / props.prevTo  il periodo di confronto vero
 * @param {'periodoPrec'|'annoPrec'|'nessuno'} props.confronto
 * @param {Object|null} props.confrontoInfo  cosa si confronta davvero, o perché no
 * @param {Object|null} props.partenza  la finestra scelta dalla pagina all'apertura
 * @param {React.ReactNode} [props.barra]  la barra del periodo, sotto la domanda
 * @param {Function} [props.onBack]  apre l'inventario
 */
export default function AnalisiInventarioSection({
  rows = [], rowsPrev = [], dateFrom, dateTo, confronto = 'periodoPrec',
  prevFrom = null, prevTo = null,
  ricettario, orgId, sedeId, sedi = [],
  onBack = null, confrontoInfo = null, partenza = null, onPeriodo = null, onNavigate = null,
  barra = null,
}) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const c = useContiProduzione({ rows, rowsPrev, dateFrom, dateTo, prevFrom, prevTo, ricettario, orgId, sedeId, sedi, partenza })
  const refGusti = useRef(null)
  const refCaselle = useRef(null)
  const vai = (ref) => () => ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })

  const sediProduzione = (sedi || []).filter(s => s.attiva !== false && s.is_sede_produzione !== false)
  const dove = sedeId ? c.nomeSede(sedeId) : (sediProduzione.length > 1 ? 'Tutte le sedi' : null)
  const intestazione = (
    <IntestazioneAnalisi
      domanda="Quanto ho prodotto e venduto?"
      sotto={`${dove ? `${dove} · ` : ''}dalla vetrina contata ogni sera, gusto per gusto`}
      isMobile={isMobile}
      destra={(onBack || c.copertura.n > 0) ? (
        <>
          {onBack && <Pulsante onClick={onBack} icona="arrowR">Apri l&apos;inventario</Pulsante>}
          {c.copertura.n > 0 && (
            <Pulsante icona="download" onClick={() => esportaXlsx({
              dateFrom, dateTo, righe: c.perGusto, totali: c.totali, scartoRegistrato: c.scartoRegistrato, andamento: c.andamento,
            })}>Esporta Excel</Pulsante>
          )}
        </>
      ) : null}
    />
  )

  // Un periodo senza giorni registrati: si dice dove finiscono i dati.
  if (c.copertura.n === 0) {
    return (
      <div style={{ paddingBottom: isMobile ? 32 : 40 }}>
        {intestazione}
        {barra}
        <PeriodoVuoto dateFrom={dateFrom} dateTo={dateTo} ultimo={confrontoInfo?.ultimoPrima || null}
          onPeriodo={onPeriodo} onInventario={onBack} isMobile={isMobile} />
      </div>
    )
  }

  const voci = vociCopertura({
    copertura: c.copertura, registrazioneFerma: c.registrazioneFerma, daPartenza: c.daPartenza, buchi: c.buchi,
    confrontoInfo, scartoRegistrato: c.scartoRegistrato, caselle: c.riassunto,
    senzaRicetta: { n: c.senzaRicetta.length, kgVenduti: c.kgSenzaRicetta, euroStimati: c.euroSenzaRicetta },
    incompleti: c.incompleti.map(r => r.gusto),
    azioni: { inventario: onBack, gusti: vai(refGusti), caselle: vai(refCaselle) },
  })
  const daSistemare = c.riassunto.n > 0 || c.senzaRicetta.length > 0 || c.collegati.length > 0
  const frasi = frasiProduzione({ righe: c.righeTabella, senzaRicetta: { n: c.senzaRicetta.length, euroStimati: c.euroSenzaRicetta } })

  // Gli spazi li possiede la pagina, non i pezzi (ANALISI_DESIGN.md §6): fra
  // una sezione e l'altra 40 px (32 al telefono), fra un riquadro e l'altro
  // 24 (16). Prima ogni pezzo aveva il suo marginBottom, da 10 a 18 px.
  const fraSezioni = isMobile ? 32 : 40
  const fraRiquadri = isMobile ? 16 : 24
  const sezione = (etichetta, figli) => (
    <section aria-label={etichetta} style={{ display: 'flex', flexDirection: 'column', gap: fraRiquadri, minWidth: 0 }}>{figli}</section>
  )
  const affiancati = { display: 'grid', gridTemplateColumns: isMobile || isTablet ? '1fr' : '1fr 1fr', gap: fraRiquadri, alignItems: 'start' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: fraSezioni, paddingBottom: fraSezioni }}>
      {/* La risposta: quanto, rispetto a cosa, e dove guardare. */}
      <div>
        {intestazione}
        {barra}
        <CoperturaDati voci={voci} />
        {sezione('La risposta', <>
          <Tessere totali={c.totali} totaliPrev={c.totaliPrev} confronto={confronto} confrontoInfo={confrontoInfo}
            copertura={c.copertura} scartoRegistrato={c.scartoRegistrato}
            senzaRicetta={{ n: c.senzaRicetta.length, euroStimati: c.euroSenzaRicetta }}
            nGusti={c.totali.nConVendita} isMobile={isMobile} isTablet={isTablet} />
          {frasi.length > 0 && (
            <Riquadro isMobile={isMobile}>
              <TitoloGrafico titolo="Dove guardare" sottotitolo="Le cose che si notano in questo periodo, col numero dietro." />
              {frasi.map(f => (
                <FraseInsight key={f.id} verso={f.verso}
                  onClick={f.azione === 'gusti' ? vai(refGusti) : null} etichettaAzione="Collega">
                  {f.testo}
                </FraseInsight>
              ))}
            </Riquadro>
          )}
        </>)}
      </div>

      {/* Quando: le settimane, la vetrina, i giorni. */}
      {sezione('Quando', <>
        <GraficoVenduto rows={rows} da={dateFrom} a={dateTo} registrati={c.copertura} riassunto={c.riassunto} isMobile={isMobile} />
        <div style={affiancati}>
          <ContoVetrina vetrina={c.vetrina} scartoRegistrato={c.scartoRegistrato} isMobile={isMobile} />
          <GiornoSettimana giorni={c.settimana} isMobile={isMobile} />
        </div>
      </>)}

      {/* Dove e cosa: le sedi, i gusti. */}
      {sezione('Sedi e gusti', <>
        <SediAffiancate sedi={c.sedi} pannelli={c.pannelli} isMobile={isMobile} />
        <TabellaGusti righe={c.righeTabella} totali={c.totali} scartoRegistrato={c.scartoRegistrato} isMobile={isMobile} />
      </>)}

      {daSistemare && sezione('Da sistemare', <>
        <TitoloGrafico titolo="Da sistemare"
          sottotitolo="Quello che tiene fuori dai conti dei chili o degli euro. Si sistema una volta, e vale per tutti i periodi." />
        {c.riassunto.n > 0 && (
          <div ref={refCaselle}>
            <CaselleDaSistemare riassunto={c.riassunto} caselle={c.daSistemare} nomeSede={c.nomeSede} onApri={onBack} />
          </div>
        )}
        {(c.senzaRicetta.length > 0 || c.collegati.length > 0) && (
          <div ref={refGusti}>
            <GustiSenzaRicetta
              senzaRicetta={c.senzaRicetta} collegati={c.collegati}
              euroKgMedio={c.euroKgMedio} ricettario={ricettario}
              collega={c.collega} pronto={c.nomiGusti != null}
              onNavigate={onNavigate} isMobile={isMobile}
            />
          </div>
        )}
      </>)}
    </div>
  )
}

function Pulsante({ children, onClick, icona = null }) {
  return (
    <button type="button" onClick={onClick} style={{
      minHeight: 44, padding: '8px 14px', borderRadius: R.lg, cursor: 'pointer', fontFamily: 'inherit',
      fontSize: font.size.base, fontWeight: 700, border: `1px solid ${T.border}`, background: T.bgCard, color: T.brand,
      display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
    }}>
      {icona && <Icon name={icona} size={14} />}{children}
    </button>
  )
}
