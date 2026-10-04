// ── Gusto per gusto ───────────────────────────────────────────────────────
//
// La tabella di prima aveva prodotto, venduto, scarto, ricavo, food cost e
// margine, con quattro sfondi colorati e una classifica «Top 10» sopra che
// ripeteva la colonna del venduto. Mancavano le due cose che un gelatiere
// chiede a un gusto: quanto di quello che faccio lo vendo, e quanto resta in
// vetrina. Adesso ci sono, con l'andamento delle settimane intere in
// piccolo; il costo è al chilo (diviso per la resa della ricetta, vedi
// margineProduzioneVero) e il margine porta la sua quota sotto.
//
// Sul computer una tabella che si ordina toccando le intestazioni; sul
// telefono una scheda per gusto, e l'ordine dietro un pulsante solo.
import React, { useMemo, useState } from 'react'
import { color as T, font, tnum } from '../../lib/theme'
import { euro, quota } from '../../lib/formatoAnalisi'
import { TitoloGrafico, Riquadro, Andamentino } from '../../components/analisi'
import { TabellaOSchede } from '../_shared'
import Icon from '../../components/Icon'
import MenuScelta from './MenuScelta'
import { ORDINI, ordinaGusti, versoIniziale } from './righeGusti'
import { kg, kgTessera } from './numeri'

/** «MAROTTO è il gusto più venduto: 1.131 kg, il 9,6% del totale». */
export function titoloTabella(righe = []) {
  const tot = righe.reduce((s, r) => s + Math.max(0, r.vendKg), 0)
  if (!righe.length || tot <= 0) return 'Gusto per gusto'
  const top = righe.reduce((x, y) => (y.vendKg > x.vendKg ? y : x))
  return `${top.gusto} è il gusto più venduto: ${kgTessera(top.vendKg)}, il ${quota((top.vendKg / tot) * 100)} del totale`
}

const giorni = (n) => (n == null ? null : new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(n))
const MOTIVO = {
  ricetta: 'Nessuna ricetta collegata a questo nome',
  prezzo: 'Manca il prezzo di vendita o il costo di qualche ingrediente',
}
const motivoDi = (r) => (!r.haRicetta ? MOTIVO.ricetta : !(r.haRicavo && r.fcCompleto) ? MOTIVO.prezzo : null)

// Le celle, scritte una volta per la tabella e per le schede.
const cella = {
  vendKg: (r) => kg(r.vendKg),
  prodKg: (r) => kg(r.prodKg),
  quotaVenduta: (r) => quota(r.quotaVenduta) || '—',
  giorniVetrina: (r) => giorni(r.giorniVetrina) || '—',
  scartoKg: (r) => kg(r.scartoKg),
  ricavo: (r) => (r.ricavo > 0 ? euro(r.ricavo) : '—'),
  fcKg: (r) => (r.fcKg > 0 ? `${euro(r.fcKg, { decimali: 2 })}/kg` : '—'),
  margine: (r) => (r.margine != null ? euro(r.margine) : 'non lo so'),
}

export default function TabellaGusti({ righe = [], totali, scartoRegistrato, isMobile = false, stile = null }) {
  const [ordine, setOrdine] = useState({ chiave: 'vendKg', verso: 'desc' })
  const ordinate = useMemo(() => ordinaGusti(righe, ordine.chiave, ordine.verso), [righe, ordine])
  const scegli = (chiave) => setOrdine(o => (o.chiave === chiave
    ? { chiave, verso: o.verso === 'asc' ? 'desc' : 'asc' }
    : { chiave, verso: versoIniziale(chiave) }))

  const colonne = [
    { k: 'vendKg', label: 'Venduto kg', titolo: 'Chili usciti dalla vetrina: venduti, più quello che si butta se lo scarto non si scrive' },
    { k: 'prodKg', label: 'Prodotto kg' },
    { k: 'quotaVenduta', label: 'Venduto su prodotto', titolo: 'Sopra il 100% hai venduto anche quello che c\'era in vetrina all\'inizio' },
    { k: 'giorniVetrina', label: 'Giorni in vetrina', titolo: 'Per quanti giorni di vendita basta, in media, quello che resta in vetrina la sera' },
    { k: 'serie', label: 'Andamento', ordinabile: false, titolo: 'Il venduto delle settimane intere del periodo' },
    scartoRegistrato ? { k: 'scartoKg', label: 'Scarto kg' } : null,
    { k: 'ricavo', label: 'Ricavo stimato' },
    { k: 'fcKg', label: 'Costo al kg', titolo: 'Costo degli ingredienti di un chilo di gelato finito, ai prezzi di oggi' },
    { k: 'margine', label: 'Margine stimato' },
  ].filter(Boolean)

  const quotaTot = totali.prod > 0 ? (totali.vend / totali.prod) * 100 : null
  return (
    <Riquadro isMobile={isMobile} stile={stile}>
      <TitoloGrafico titolo={titoloTabella(righe)}
        sottotitolo={isMobile
          ? 'Quanto ne vendi, quanto ne fai, quanto rende.'
          : 'Quanto ne vendi e quanto ne fai, per quanti giorni basta quello che resta in vetrina, quanto rende. Tocca un\'intestazione per ordinare.'}
        destra={isMobile ? (
          <MenuScelta etichetta="Ordina i gusti" prefisso="per " valore={ordine.chiave} scelte={ORDINI}
            onScegli={(k) => setOrdine({ chiave: k, verso: versoIniziale(k) })} />
        ) : null} />
      <TabellaOSchede
        minWidth={scartoRegistrato ? 1000 : 920}
        righe={ordinate}
        chiave={(r) => r.gusto}
        vuoto="Nessun gusto nel periodo."
        apriEtichetta="Prodotto, vetrina, costo"
        titolo={(r) => <NomeGusto r={r} />}
        riassunto={(r) => <Andamentino valori={r.serie} larghezza={64} etichetta={`Andamento di ${r.gusto}`} />}
        colonne={[
          { k: 'vend', label: 'Venduto', forte: true, cella: (r) => `${cella.vendKg(r)} kg` },
          { k: 'marg', label: 'Margine stimato', forte: true, cella: (r) => <Margine r={r} /> },
        ]}
        dettaglio={(r) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: font.size.base }}>
            {colonne.filter(c => !['vendKg', 'margine', 'serie'].includes(c.k)).map(c => (
              <div key={c.k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ color: T.textSoft }}>{c.label}</span>
                <span style={{ ...tnum, fontWeight: 700, color: T.text }}>{cella[c.k](r)}</span>
              </div>
            ))}
          </div>
        )}
        intestazione={(
          <thead>
            <tr>
              {[{ k: 'gusto', label: 'Gusto' }, ...colonne].map((c, i) => (
                <Intestazione key={c.k} c={c} sinistra={i === 0} ordine={ordine} onScegli={scegli} />
              ))}
            </tr>
          </thead>
        )}
        corpo={(
          <tbody>
            {ordinate.map(r => (
              <tr key={r.gusto} style={{ borderTop: `1px solid ${T.borderSoft}` }}>
                <th scope="row" style={{ ...TD, textAlign: 'left', position: 'sticky', left: 0, background: T.bgCard, fontWeight: 700 }}><NomeGusto r={r} /></th>
                {colonne.map(c => (
                  <td key={c.k} style={{ ...TD, ...(c.k === 'vendKg' ? { fontWeight: 700 } : null) }}>
                    {c.k === 'serie' ? <Andamentino valori={r.serie} larghezza={72} etichetta={`Andamento di ${r.gusto}`} />
                      : c.k === 'margine' ? <Margine r={r} /> : cella[c.k](r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        )}
        piede={(
          <tfoot>
            <tr style={{ borderTop: `2px solid ${T.border}` }}>
              <th scope="row" style={{ ...TD, textAlign: 'left', position: 'sticky', left: 0, background: T.bgCard, fontWeight: 800 }}>Totale</th>
              {colonne.map(c => (
                <td key={c.k} style={{ ...TD, fontWeight: 800 }}>
                  {c.k === 'vendKg' ? kg(totali.vend) : c.k === 'prodKg' ? kg(totali.prod)
                    : c.k === 'quotaVenduta' ? (quota(quotaTot) || '—') : c.k === 'scartoKg' ? kg(totali.scarto)
                      : c.k === 'ricavo' ? euro(totali.ricavo)
                        : c.k === 'margine' ? <Margine r={{ margine: totali.margine, margPct: totali.margPct, haRicetta: true }} /> : ''}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
        riepilogoTelefono={(
          <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, background: T.bgSubtle, padding: '12px 14px', fontSize: font.size.base }}>
            {[['Venduto', `${kg(totali.vend)} kg`], ['Prodotto', `${kg(totali.prod)} kg`], ['Ricavo stimato', euro(totali.ricavo)],
              ['Margine stimato', totali.margine != null ? `${euro(totali.margine)} · ${quota(totali.margPct)}` : 'non lo so']].map(([v, x]) => (
              <div key={v} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0' }}>
                <span style={{ color: T.textSoft, fontWeight: 600 }}>{v}</span>
                <span style={{ ...tnum, fontWeight: 800, color: T.text }}>{x}</span>
              </div>
            ))}
          </div>
        )}
      />
    </Riquadro>
  )
}

const TD = { padding: '9px 10px', textAlign: 'right', fontSize: font.size.base, color: T.text, whiteSpace: 'nowrap', ...tnum }

function NomeGusto({ r }) {
  const motivo = motivoDi(r)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {r.gusto}
      {motivo && (
        <span title={motivo} style={{ color: T.amber, display: 'inline-flex', cursor: 'help' }}>
          <Icon name="warning" size={13} />
        </span>
      )}
    </span>
  )
}

function Margine({ r }) {
  if (r.margine == null) {
    return <span style={{ color: T.textSoft, fontWeight: 500 }} title={motivoDi(r) || undefined}>non lo so</span>
  }
  return (
    <span style={{ color: r.margine < 0 ? T.red : T.text }}>
      {euro(r.margine)}
      {r.margPct != null && <span style={{ color: T.textSoft, fontWeight: 500 }}> · {quota(r.margPct)}</span>}
    </span>
  )
}

function Intestazione({ c, sinistra, ordine, onScegli }) {
  const attiva = ordine.chiave === c.k
  const ordinabile = c.ordinabile !== false
  const stile = {
    padding: '8px 10px', fontSize: font.size.sm, fontWeight: 700, color: attiva ? T.text : T.textSoft,
    textAlign: sinistra ? 'left' : 'right', whiteSpace: 'nowrap', borderBottom: `1px solid ${T.border}`,
    position: sinistra ? 'sticky' : undefined, left: sinistra ? 0 : undefined, background: T.bgCard,
  }
  return (
    <th scope="col" title={c.titolo} style={stile}
      aria-sort={attiva ? (ordine.verso === 'asc' ? 'ascending' : 'descending') : undefined}>
      {ordinabile ? (
        <button type="button" onClick={() => onScegli(c.k)} style={{
          border: 'none', background: 'transparent', padding: '6px 0', minHeight: 32, cursor: 'pointer',
          font: 'inherit', color: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4,
        }}>
          {c.label}
          {attiva && <Icon name={ordine.verso === 'asc' ? 'chevUp' : 'chevDown'} size={11} />}
        </button>
      ) : c.label}
    </th>
  )
}
