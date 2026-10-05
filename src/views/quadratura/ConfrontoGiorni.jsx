// ── Il confronto giorno per giorno ────────────────────────────────────────
//
// 05/10/2026, con le prime chiusure vere (Carlina, agosto-settembre): la
// pagina dava la differenza della settimana intera, e per capire da dove
// veniva uno scarto grande non c'era niente da guardare. Adesso una riga per
// giorno con cassa e inventario, e sotto cosa si può dire con certezza:
// le rimanenze lasciate a 0 (che sbilanciano due giorni in versi opposti) e
// i giorni grandi senza una causa nei dati. Niente sospetti: dove il dato
// non sa, lo dice.
import React from 'react'
import { TitoloGrafico, Riquadro, FraseInsight, TabellaAnalisi } from '../../components/analisi'
import { spiegaConfronto } from '../../lib/quadraturaCassa'
import { dataBreve } from '../../lib/produzioneAnalisi'

const NOMI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']
const giornoNome = (iso) => `${NOMI[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${dataBreve(iso)}`

export function titoloConfrontoGiorni(giorni = []) {
  const conf = giorni.filter(g => g.confrontato)
  if (!conf.length) return 'Nessun giorno con cassa e inventario insieme'
  const tornano = conf.filter(g => g.driftPct != null && Math.abs(g.driftPct) < 5).length
  return `${tornano} ${tornano === 1 ? 'giorno' : 'giorni'} su ${conf.length} tornano entro il 5%`
}

export default function ConfrontoGiorni({ giorni = [], isMobile, stile = null }) {
  const conf = giorni.filter(g => g.confrontato)
  if (!conf.length) return null
  const somma = (k) => conf.reduce((s, g) => s + (g[k] || 0), 0)
  const cassa = somma('cassa'), atteso = somma('atteso')
  const righe = conf.map(g => ({
    chiave: g.data,
    celle: {
      giorno: giornoNome(g.data), cassa: g.cassa, stimato: g.atteso,
      diff: { valore: g.driftEur }, quota: g.driftPct,
      rim: g.rimanenzaZero > 0 ? 'a 0 in vetrina' : g.riparteDaZero > 0 ? 'riparte da 0' : '',
    },
  }))
  righe.push({ chiave: 'totale', forte: true, celle: { giorno: 'Insieme', cassa, stimato: atteso, diff: { valore: cassa - atteso }, quota: atteso > 0 ? ((cassa - atteso) / atteso) * 100 : null, rim: '' } })
  const frasi = spiegaConfronto(giorni)
  const soloCassa = giorni.filter(g => g.cassa != null && !g.confrontato).length
  return (
    <Riquadro isMobile={isMobile} stile={stile}>
      <div data-confronto-giorni>
        <TitoloGrafico titolo={titoloConfrontoGiorni(giorni)}
          sottotitolo={`Solo i giorni con la cassa e l'inventario insieme (${conf.length}). Importi senza IVA.${soloCassa > 0 ? ` Altri ${soloCassa} ${soloCassa === 1 ? 'giorno ha' : 'giorni hanno'} la cassa ma non l'inventario: restano fuori.` : ''}`} />
        <TabellaAnalisi etichetta="Cassa e inventario giorno per giorno" isMobile={isMobile}
          colonne={[
            { chiave: 'giorno', titolo: 'Giorno' },
            { chiave: 'cassa', titolo: 'Cassa', tipo: 'euro' },
            { chiave: 'stimato', titolo: 'Stimato', tipo: 'euro' },
            { chiave: 'diff', titolo: 'Differenza', tipo: 'differenza' },
            { chiave: 'quota', titolo: 'Diff. %', tipo: 'quota' },
            { chiave: 'rim', titolo: 'Rimanenza', larghezza: 110 },
          ]}
          righe={righe} />
        <div style={{ marginTop: 12 }}>
          {frasi.map(f => <FraseInsight key={f.id} verso={f.verso}>{f.testo}</FraseInsight>)}
        </div>
      </div>
    </Riquadro>
  )
}
