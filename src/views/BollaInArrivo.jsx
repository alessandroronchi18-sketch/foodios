// ── La bolla che arriva con la merce ──────────────────────────────────────
//
// Richiesta del titolare, 19/09/2026: «arriva la merce, si carica la bolla,
// si popolano i campi del magazzino con la merce nuova e nel frattempo i dati
// dei prezzi delle materie prime parallelamente vanno nella sezione materie
// prime; ogni volta che c'è un cambio del prezzo al kg deve essere segnato
// nello storico di quella pagina».
//
// Prima c'erano due riquadri separati nella stessa schermata: uno leggeva le
// quantità, l'altro i prezzi. Due foto della stessa bolla, due conferme, e
// nessun legame fra le due — con il risultato che si poteva caricare la merce
// e dimenticarsi il prezzo, o aggiornare il prezzo senza che la merce
// entrasse. Adesso è una cosa sola.
//
// ── Perché c'è una schermata di revisione e non si salva e basta ──────────
//
// Perché il numero che esce di qui finisce nel food cost di **tutte** le
// ricette che usano quella materia prima, e da lì nel margine, nel prezzo di
// vendita e nel P&L. Un errore di lettura su un sacco da 25 kg contato come
// un pezzo non lo vede nessuno: il prezzo diventa venticinque volte quello
// vero e sembra un numero come un altro.
//
// Quindi questa schermata fa una cosa sola, e la fa bene: **mostra il conto
// per intero prima di scriverlo**. Quanti chili sono, da dove viene il
// prezzo, cosa non è riuscita a leggere, e cosa cambierà rispetto a prima.
// Chi guarda deve poter dire «no, quello è un sacco da 25» in due secondi.

import React, { useMemo, useState } from 'react'
import Icon from '../components/Icon'
import { color as T, radius as R, font } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { CampoConElenco, formatNome } from './_shared'
import { preparaBolla, identitaBolla } from '../lib/bolle'

const euro = (v) => Number(v).toLocaleString('it-IT', {
  useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2,
})
const kg = (g) => (Number(g) / 1000).toLocaleString('it-IT', {
  useGrouping: 'always', minimumFractionDigits: 0, maximumFractionDigits: 3,
})

/**
 * @param {object}   props
 * @param {object}   props.letto        quello che il riconoscimento ha letto
 * @param {object}   props.ricettario
 * @param {Array}    props.logPrezzi
 * @param {Array}    props.logRif       il registro dei rifornimenti, per capire
 *                                      se questa bolla è già stata caricata
 * @param {Function} props.onRegistra   (righe, documento) => Promise
 * @param {Function} props.onAnnulla
 */
export default function BollaInArrivo({
  letto, ricettario, logPrezzi = [], logRif = [], onRegistra, onAnnulla, notify,
}) {
  const suTelefono = useIsMobile()
  const suTablet = useIsTablet()
  // Il tablet in laboratorio si tocca col dito come il telefono: i bersagli
  // stanno sopra i 44px in tutti e due i casi, non solo sul telefono.
  const dito = suTelefono || suTablet

  const [fornitore, setFornitore] = useState(letto?.fornitore || '')
  const [numero, setNumero] = useState(letto?.numero || '')
  const [data, setData] = useState(letto?.data || '')
  const [salvando, setSalvando] = useState(false)
  // Le correzioni a mano, per indice di riga: nome scelto dall'elenco, peso di
  // una confezione, e se la riga va registrata o saltata.
  const [correzioni, setCorrezioni] = useState({})
  const [aperta, setAperta] = useState(null)

  const elencoMateriePrime = useMemo(() => {
    const c = ricettario?.ingredienti_costi || {}
    return Object.keys(c).map(k => formatNome(k)).sort((a, b) => a.localeCompare(b, 'it'))
  }, [ricettario])

  // Le righe lette, più le correzioni fatte a mano, ripassate ogni volta dal
  // conto: cambiare il peso di un sacco deve ricalcolare il prezzo davanti
  // agli occhi, non dopo aver salvato.
  const righe = useMemo(() => {
    const grezze = (letto?.righe || []).map((r, i) => {
      const c = correzioni[i] || {}
      return {
        ...r,
        nome: c.nome != null ? c.nome : r.nome,
        pesoConfezioneG: c.pesoConfezioneG != null ? c.pesoConfezioneG : r.pesoConfezioneG,
      }
    })
    return preparaBolla(grezze, {
      ingredientiCosti: ricettario?.ingredienti_costi || {},
      logPrezzi,
      dataBolla: data,
    }).map((r, i) => ({ ...r, saltata: !!correzioni[i]?.saltata }))
  }, [letto, correzioni, ricettario, logPrezzi, data])

  const identita = identitaBolla({ fornitore, numero, data })
  const giaCaricata = useMemo(() => {
    if (!identita) return false
    return (logRif || []).some(r => r?.bolla === identita)
  }, [identita, logRif])

  const daRegistrare = righe.filter(r => !r.saltata && r.esisteInElenco)
  const conMerce = daRegistrare.filter(r => Number(r.grammi) > 0)
  const conPrezzo = daRegistrare.filter(r => r.azione === 'applica')
  const soloStorico = daRegistrare.filter(r => r.azione === 'soloStorico')
  const fuoriElenco = righe.filter(r => !r.saltata && !r.esisteInElenco)
  const daSistemare = righe.filter(r => !r.saltata && r.esisteInElenco && r.problema)

  function correggi(i, campo, valore) {
    setCorrezioni(c => ({ ...c, [i]: { ...(c[i] || {}), [campo]: valore } }))
  }

  async function registra() {
    if (daRegistrare.length === 0) {
      notify?.('Non c\'è nessuna riga da registrare: abbinale alle tue materie prime o saltale.', false)
      return
    }
    setSalvando(true)
    const esito = await onRegistra(daRegistrare, { fornitore, numero, data, identita })
    setSalvando(false)
    if (!esito?.ok) {
      notify?.(`Non ho potuto registrare la bolla (${esito?.errore || 'rete'}): non è stato scritto niente.`, false)
      return
    }
    const pezzi = []
    if (esito.caricati > 0) pezzi.push(`${esito.caricati} ${esito.caricati === 1 ? 'voce caricata' : 'voci caricate'} in magazzino`)
    if (esito.applicati > 0) pezzi.push(`${esito.applicati} ${esito.applicati === 1 ? 'prezzo aggiornato' : 'prezzi aggiornati'}`)
    const dietro = esito.storicizzati - esito.applicati
    if (dietro > 0) pezzi.push(`${dietro} ${dietro === 1 ? 'registrato' : 'registrati'} solo nello storico`)
    notify?.(pezzi.join(' · ') || 'Bolla registrata.')
  }

  const card = {
    background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: R['2xl'],
    padding: suTelefono ? 16 : 22, marginBottom: 14,
  }
  const campo = {
    width: '100%', padding: '10px 12px', minHeight: 44, borderRadius: 8,
    border: `1px solid ${T.borderStr}`, fontSize: font.size.base, color: T.text, boxSizing: 'border-box',
  }
  const etichetta = { fontSize: font.size.sm, fontWeight: 700, color: T.textMid, marginBottom: 5, display: 'block' }

  return (
    <div style={{ maxWidth: 940 }}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
          <Icon name="truck" size={18} color={T.brand} />
          <div style={{ fontSize: font.size.lg, fontWeight: 800, color: T.text }}>La bolla che hai caricato</div>
        </div>
        <div style={{ fontSize: font.size.base, color: T.textMid, lineHeight: 1.55, marginBottom: 14 }}>
          Controlla e correggi prima di registrare. Le quantità entrano nel magazzino di
          questo punto vendita; i prezzi valgono per <strong>tutte le sedi</strong>, come
          la pagina Materie prime, e ogni cambio finisce nel suo storico.
        </div>

        <div style={{
          display: 'grid', gap: 10,
          gridTemplateColumns: suTelefono ? '1fr' : '2fr 1fr 1fr',
        }}>
          <div>
            <label style={etichetta} htmlFor="bolla-fornitore">Fornitore</label>
            <input id="bolla-fornitore" value={fornitore} onChange={e => setFornitore(e.target.value)}
              placeholder="Chi ha consegnato" style={campo} />
          </div>
          <div>
            <label style={etichetta} htmlFor="bolla-numero">Numero del documento</label>
            <input id="bolla-numero" value={numero} onChange={e => setNumero(e.target.value)}
              placeholder="es. 1234/A" style={campo} />
          </div>
          <div>
            <label style={etichetta} htmlFor="bolla-data">Data</label>
            <input id="bolla-data" type="date" value={data} onChange={e => setData(e.target.value)}
              style={campo} />
          </div>
        </div>

        {!data && (
          <Avviso tono="ambra">
            Senza la data non so da quando valgono i prezzi nuovi: senza, li scrivo
            da oggi, e un P&amp;L di quando la merce è davvero entrata resterebbe sbagliato.
          </Avviso>
        )}
        {!identita && data && (
          <Avviso tono="ambra">
            Senza il numero del documento non posso riconoscere questa bolla: se la
            carichi due volte, le giacenze raddoppiano e nessuno se ne accorge.
          </Avviso>
        )}
        {giaCaricata && (
          <Avviso tono="rosso">
            Questa bolla risulta <strong>già caricata</strong>. Se la registri di nuovo,
            la merce viene contata due volte. Controlla il numero prima di andare avanti.
          </Avviso>
        )}
      </div>

      <div style={card}>
        <div style={{ fontSize: font.size.md, fontWeight: 800, color: T.text, marginBottom: 12 }}>
          Le righe della bolla
        </div>

        {righe.length === 0 && (
          <div style={{ fontSize: font.size.base, color: T.textSoft, padding: '10px 0' }}>
            Dalla foto non è uscita nessuna riga di merce. Prova con una foto più
            nitida, oppure registra la merce a mano qui sotto.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {righe.map((r, i) => (
            <RigaBolla
              key={i}
              riga={r}
              indice={i}
              aperta={aperta === i}
              onApri={() => setAperta(aperta === i ? null : i)}
              onCorreggi={correggi}
              elenco={elencoMateriePrime}
              dito={dito}
              suTelefono={suTelefono}
            />
          ))}
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: font.size.md, fontWeight: 800, color: T.text, marginBottom: 10 }}>
          Cosa succede se registri
        </div>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: font.size.base, color: T.textMid, lineHeight: 1.75 }}>
          <li>{conMerce.length === 0 ? 'Nessuna quantità entra in magazzino.'
            : `${conMerce.length} ${conMerce.length === 1 ? 'voce entra' : 'voci entrano'} nel magazzino di questo punto vendita.`}</li>
          <li>{conPrezzo.length === 0 ? 'Nessun prezzo cambia.'
            : `${conPrezzo.length} ${conPrezzo.length === 1 ? 'prezzo cambia' : 'prezzi cambiano'} per tutte le sedi, e finisce nello storico.`}</li>
          {soloStorico.length > 0 && (
            <li>{soloStorico.length} {soloStorico.length === 1 ? 'riga va' : 'righe vanno'} solo
              nello storico: la bolla è più vecchia dell&apos;ultimo cambio di prezzo, quindi il
              listino di oggi resta quello più recente.</li>
          )}
          {fuoriElenco.length > 0 && (
            <li style={{ color: T.amberDark || T.amber }}>
              {fuoriElenco.length} {fuoriElenco.length === 1 ? 'riga non è abbinata' : 'righe non sono abbinate'} a
              una materia prima: {fuoriElenco.length === 1 ? 'resta fuori' : 'restano fuori'}. Abbinale
              dall&apos;elenco o saltale.
            </li>
          )}
          {daSistemare.length > 0 && (
            <li style={{ color: T.amberDark || T.amber }}>
              {daSistemare.length} {daSistemare.length === 1 ? 'riga ha' : 'righe hanno'} qualcosa
              che non torna: {daSistemare.length === 1 ? 'entra' : 'entrano'} in magazzino solo se
              la quantità è leggibile, e comunque non {daSistemare.length === 1 ? 'tocca' : 'toccano'} i prezzi.
            </li>
          )}
        </ul>

        <div style={{
          display: 'flex', gap: 10, marginTop: 16,
          flexDirection: suTelefono ? 'column-reverse' : 'row',
        }}>
          <button type="button" onClick={onAnnulla} disabled={salvando}
            style={{
              padding: '11px 18px', minHeight: 44, background: 'transparent',
              border: `1px solid ${T.border}`, borderRadius: 10, color: T.textMid,
              fontSize: font.size.md, fontWeight: 600, cursor: 'pointer',
            }}>Annulla</button>
          <button type="button" onClick={registra} disabled={salvando || daRegistrare.length === 0}
            style={{
              padding: '11px 20px', minHeight: 44,
              background: (salvando || daRegistrare.length === 0) ? T.textSoft : T.brand,
              color: T.white, border: 'none', borderRadius: 10,
              fontSize: font.size.md, fontWeight: 800,
              cursor: (salvando || daRegistrare.length === 0) ? 'default' : 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}>
            <Icon name="checkCircle" size={15} color={T.white} />
            {salvando ? 'Registro…' : 'Registra la bolla'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Avviso({ tono = 'ambra', children }) {
  const rosso = tono === 'rosso'
  return (
    <div role="note" style={{
      marginTop: 12, padding: '10px 12px', borderRadius: 10,
      background: rosso ? T.brandLight : T.amberLight,
      border: `1px solid ${rosso ? T.brand : T.amber}`,
      fontSize: font.size.base, lineHeight: 1.55, color: T.text,
    }}>{children}</div>
  )
}

function RigaBolla({ riga: r, indice, aperta, onApri, onCorreggi, elenco, dito, suTelefono }) {
  const problema = !!r.problema
  const attenzione = r.sospetto || r.ambiguo
  const bordo = !r.esisteInElenco || problema ? T.amber : attenzione ? T.amber : T.border
  const sfondo = r.saltata ? T.bgSubtle : T.bgCard

  return (
    <div style={{
      border: `1px solid ${bordo}`, borderRadius: 12, background: sfondo,
      padding: suTelefono ? 12 : 14, opacity: r.saltata ? 0.55 : 1,
    }}>
      <div style={{
        display: 'flex', gap: 10, alignItems: 'flex-start',
        flexDirection: suTelefono ? 'column' : 'row',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {r.esisteInElenco ? (
            <div style={{ fontSize: font.size.md, fontWeight: 700, color: T.text }}>{formatNome(r.nome)}</div>
          ) : (
            <div>
              <div style={{ fontSize: font.size.sm, fontWeight: 700, color: T.amberDark || T.amber, marginBottom: 5 }}>
                «{r.nome}» non è fra le tue materie prime: scegli quale
              </div>
              <CampoConElenco
                id={`bolla-nome-${indice}`}
                valore=""
                onCambia={(v) => onCorreggi(indice, 'nome', v)}
                voci={elenco}
                placeholder="Cerca fra le tue materie prime"
                ariaLabel={`Materia prima per la riga ${indice + 1}`}
                soloDallElenco
                nomeElenco="materie prime"
              />
            </div>
          )}
          <div style={{ fontSize: font.size.sm, color: T.textMid, marginTop: 4 }}>
            {r.grammi ? `${kg(r.grammi)} kg` : '— kg'}
            {r.prezzoKg != null && ` · ${euro(r.prezzoKg)} €/kg`}
            {r.prezzoAttuale != null && r.prezzoKg != null && (
              <span style={{ color: r.prezzoKg > r.prezzoAttuale ? T.brand : T.green, fontWeight: 700 }}>
                {' '}(prima {euro(r.prezzoAttuale)} €)
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <button type="button" onClick={onApri}
            style={{
              padding: '7px 12px', minHeight: dito ? 44 : 34, background: 'transparent',
              border: `1px solid ${T.border}`, borderRadius: 8, color: T.textMid,
              fontSize: font.size.sm, fontWeight: 600, cursor: 'pointer',
            }}>{aperta ? 'Chiudi' : 'Come l\'ho calcolato'}</button>
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            minHeight: dito ? 44 : 34, fontSize: font.size.sm, color: T.textMid, cursor: 'pointer',
          }}>
            <input type="checkbox" checked={!!r.saltata}
              onChange={e => onCorreggi(indice, 'saltata', e.target.checked)} />
            Salta
          </label>
        </div>
      </div>

      {r.problema && (
        <div style={{ marginTop: 8, fontSize: font.size.base, color: T.amberDark || T.amber, fontWeight: 600 }}>
          {r.problema}
        </div>
      )}
      {r.sospetto && (
        <div style={{ marginTop: 6, fontSize: font.size.base, color: T.brand, fontWeight: 700 }}>
          Il prezzo cambia di molto rispetto a prima. Prima di registrare, controlla
          che l&apos;unità di misura e il peso della confezione siano quelli giusti.
        </div>
      )}
      {r.ambiguo && (
        <div style={{ marginTop: 6, fontSize: font.size.base, color: T.brand, fontWeight: 700 }}>
          Su questa riga un numero si può leggere in due modi (le migliaia o i
          decimali). Controlla il prezzo prima di registrare.
        </div>
      )}
      {r.azione === 'soloStorico' && (
        <div style={{ marginTop: 6, fontSize: font.size.base, color: T.textMid }}>{r.motivo}</div>
      )}

      {aperta && (
        <div style={{
          marginTop: 10, padding: 10, background: T.bgSubtle,
          borderRadius: 8, fontSize: font.size.sm, color: T.textMid, lineHeight: 1.7,
        }}>
          {r.spiegazione.length > 0
            ? r.spiegazione.map((s, k) => <div key={k}>{s}</div>)
            : <div>Non sono arrivato a un prezzo: {r.problema}</div>}
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: font.size.sm, fontWeight: 700, color: T.textMid, display: 'block', marginBottom: 5 }}
              htmlFor={`bolla-peso-${indice}`}>
              Quanto pesa una confezione (in grammi)
            </label>
            <input id={`bolla-peso-${indice}`} inputMode="numeric"
              defaultValue={r.pesoConfezioneG || ''}
              onChange={e => onCorreggi(indice, 'pesoConfezioneG', Number(e.target.value) || null)}
              placeholder="es. 25000 per un sacco da 25 kg"
              style={{
                width: '100%', maxWidth: 320, padding: '9px 11px', minHeight: 44,
                borderRadius: 8, border: `1px solid ${T.borderStr}`, fontSize: font.size.base,
                color: T.text, boxSizing: 'border-box',
              }} />
          </div>
        </div>
      )}
    </div>
  )
}
