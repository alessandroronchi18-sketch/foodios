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

import React, { useMemo, useState, useEffect } from 'react'
import Icon from '../components/Icon'
import { color as T, radius as R, font } from '../lib/theme'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { CampoConElenco, formatNome } from './_shared'
import { preparaBolla, identitaBolla, normalizzaUnita } from '../lib/bolle'

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
  // Le righe: quelle lette dalla foto, poi modificabili una per una. Sono
  // **una sola fonte**: la riga letta e la riga scritta a mano sono la stessa
  // cosa, e lo devono restare — se no la bolla scritta a mano farebbe un
  // percorso diverso, con controlli diversi, e i due percorsi divergerebbero
  // come è già successo ai tre conti del food cost.
  const [righeGrezze, setRigheGrezze] = useState(
    () => (letto?.righe || []).map(r => ({ ...r })),
  )
  const [aperta, setAperta] = useState(letto?.righe?.length ? null : 0)

  const elencoMateriePrime = useMemo(() => {
    const c = ricettario?.ingredienti_costi || {}
    return Object.keys(c).map(k => formatNome(k)).sort((a, b) => a.localeCompare(b, 'it'))
  }, [ricettario])

  // Le righe lette, più le correzioni fatte a mano, ripassate ogni volta dal
  // conto: cambiare il peso di un sacco deve ricalcolare il prezzo davanti
  // agli occhi, non dopo aver salvato.
  const righe = useMemo(() => (
    preparaBolla(righeGrezze, {
      ingredientiCosti: ricettario?.ingredienti_costi || {},
      logPrezzi,
      dataBolla: data,
    // `grezza` è la riga come sta scritta: serve ai campi modificabili.
    // Il resto (chili, prezzo, problemi) è il conto, e non si sovrascrive.
    }).map((r, i) => ({ ...r, grezza: righeGrezze[i] || {}, saltata: !!righeGrezze[i]?.saltata }))
  ), [righeGrezze, ricettario, logPrezzi, data])

  const identita = identitaBolla({ fornitore, numero, data })
  const giaCaricata = useMemo(() => {
    if (!identita) return false
    return (logRif || []).some(r => r?.bolla === identita)
  }, [identita, logRif])
  // ── La bolla già caricata: difetto del 21/09/2026 ────────────────────────
  //
  // L'avviso rosso c'era, ma il bottone «Registra la bolla» restava premibile
  // e non chiedeva niente: un clic e la giacenza della farina passava da 25
  // a 50 kg. Adesso per andare avanti bisogna dirlo: la casella qui sotto
  // manda `forza: true` al calcolo, che senza quella si rifiuta.
  const [forza, setForza] = useState(false)
  useEffect(() => { if (!giaCaricata) setForza(false) }, [giaCaricata])

  const daRegistrare = righe.filter(r => !r.saltata && r.esisteInElenco)
  const conMerce = daRegistrare.filter(r => Number(r.grammi) > 0)
  const conPrezzo = daRegistrare.filter(r => r.azione === 'applica')
  const soloStorico = daRegistrare.filter(r => r.azione === 'soloStorico')
  const fuoriElenco = righe.filter(r => !r.saltata && !r.esisteInElenco)
  const daSistemare = righe.filter(r => !r.saltata && r.esisteInElenco && r.problema)
  // Il bottone è spento quando registrare farebbe un danno: niente da
  // scrivere, oppure una bolla già caricata che nessuno ha confermato di
  // voler caricare di nuovo. Il perché è scritto nell'elenco qui sotto: un
  // bottone spento e basta è un vicolo cieco.
  const bloccato = salvando || daRegistrare.length === 0 || (giaCaricata && !forza)

  function correggi(i, campo, valore) {
    setRigheGrezze(rr => rr.map((r, k) => (k === i ? { ...r, [campo]: valore } : r)))
  }

  function aggiungiRiga() {
    setRigheGrezze(rr => [...rr, { nome: '', quantita: '', unita: 'kg', imponibile: '' }])
    setAperta(righeGrezze.length)
  }

  function togliRiga(i) {
    setRigheGrezze(rr => rr.filter((_, k) => k !== i))
    setAperta(null)
  }

  async function registra() {
    if (daRegistrare.length === 0) {
      notify?.('Non c\'è nessuna riga da registrare: abbinale alle tue materie prime o saltale.', false)
      return
    }
    if (giaCaricata && !forza) {
      notify?.('Questa bolla risulta già caricata: se vuoi caricarla lo stesso, spunta la casella qui sopra.', false)
      return
    }
    setSalvando(true)
    // `forza` arriva fino al calcolo: senza, `preparaScrittureBolla` si
    // rifiuta di scrivere anche se qualcuno chiamasse da un'altra parte.
    const esito = await onRegistra(daRegistrare, { fornitore, numero, data, identita, forza })
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
    // Zero caricati, zero prezzi, zero storico vuol dire che il calcolo non
    // ha scritto niente — succede quando riconosce una bolla già caricata e
    // nessuno ha chiesto di forzarla. Dire «Bolla registrata» sarebbe la
    // bugia peggiore di tutte: fa smettere di cercare.
    if (!pezzi.length) {
      notify?.('Non è stato scritto niente: controlla le righe e il numero del documento.', false)
      return
    }
    notify?.(pezzi.join(' · '))
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
            la merce viene contata due volte e nello storico restano due cambi di prezzo
            uguali. Controlla il numero del documento prima di andare avanti.
            <label htmlFor="bolla-forza" style={{
              display: 'flex', alignItems: 'center', gap: 9, marginTop: 10,
              minHeight: 44, cursor: 'pointer', fontWeight: 700, color: T.text,
            }}>
              <input id="bolla-forza" type="checkbox" checked={forza}
                onChange={e => setForza(e.target.checked)}
                style={{ width: 18, height: 18, cursor: 'pointer' }} />
              Registrala lo stesso: so che la sto caricando due volte
            </label>
          </Avviso>
        )}
      </div>

      <div style={card}>
        <div style={{ fontSize: font.size.md, fontWeight: 800, color: T.text, marginBottom: 12 }}>
          Le righe della bolla
        </div>

        {righe.length === 0 && (
          <div style={{ fontSize: font.size.base, color: T.textSoft, padding: '10px 0' }}>
            Nessuna riga, ancora. Aggiungine una e scrivi cosa è arrivato.
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
              onTogli={togliRiga}
              elenco={elencoMateriePrime}
              dito={dito}
              suTelefono={suTelefono}
            />
          ))}
        </div>

        <button type="button" onClick={aggiungiRiga}
          style={{
            marginTop: 12, padding: '10px 16px', minHeight: 44,
            background: 'transparent', border: `1px dashed ${T.borderStr}`,
            borderRadius: 10, color: T.textMid, fontSize: font.size.base,
            fontWeight: 700, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 7,
          }}>
          <Icon name="plus" size={14} color={T.textMid} />
          Aggiungi una riga
        </button>
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
          {giaCaricata && !forza && (
            <li style={{ color: T.brand, fontWeight: 700 }}>
              Così non registro niente: questa bolla risulta già caricata. Per
              caricarla lo stesso, spunta la casella qui sopra.
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
          <button type="button" onClick={registra} disabled={bloccato}
            style={{
              padding: '11px 20px', minHeight: 44,
              background: bloccato ? T.textSoft : T.brand,
              color: T.white, border: 'none', borderRadius: 10,
              fontSize: font.size.md, fontWeight: 800,
              cursor: bloccato ? 'default' : 'pointer',
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

const ETICHETTA = {
  fontSize: font.size.sm, fontWeight: 700, color: T.textMid,
  display: 'block', marginBottom: 5,
}
const CAMPO = {
  width: '100%', padding: '9px 11px', minHeight: 44, borderRadius: 8,
  border: `1px solid ${T.borderStr}`, fontSize: font.size.base,
  color: T.text, background: T.bgCard, boxSizing: 'border-box',
}

// ── Il menù delle unità: difetto del 21/09/2026 ───────────────────────────
//
// Il menù aveva quattro voci — kg, g, litri, pezzi — e il valore della riga è
// l'unità **come l'ha scritta il fornitore**. Sulle bolle vere c'è scritto
// SACCHI, CF, LT, CT: nessuna delle quattro, quindi il menù si mostrava
// **vuoto**, come se l'unità non l'avesse letta nessuno. E chi guarda un
// campo vuoto pensa che manchi il dato, non che ci sia e non sia in elenco.
//
// Adesso l'unità letta sta sempre nel menù, come prima voce, e dice cosa ne
// facciamo: «SACCHI (la conto come pezzi o confezioni)» oppure, se non la
// sappiamo tradurre, «CT — questa non la so leggere: scegline una».
const UNITA_NOSTRE = [
  ['kg', 'kg'],
  ['g', 'g'],
  ['hg', 'hg (etti)'],
  ['l', 'litri'],
  ['ml', 'ml'],
  ['cl', 'cl'],
  ['pz', 'pezzi / confezioni'],
]
const NOME_UNITA = {
  kg: 'chilogrammi', g: 'grammi', hg: 'etti', l: 'litri',
  ml: 'millilitri', cl: 'centilitri', pz: 'pezzi o confezioni',
}

function Campo({ etichetta, id, valore, onCambia, placeholder, inputMode }) {
  return (
    <div>
      <label style={ETICHETTA} htmlFor={id}>{etichetta}</label>
      <input id={id} value={valore} inputMode={inputMode} placeholder={placeholder}
        onChange={e => onCambia(e.target.value)} style={CAMPO} />
    </div>
  )
}

function RigaBolla({ riga: r, indice, aperta, onApri, onCorreggi, onTogli, elenco, dito, suTelefono }) {
  const problema = !!r.problema
  const avvisi = r.avvisi || []
  const attenzione = r.sospetto || r.ambiguo || avvisi.length > 0
  const bordo = !r.esisteInElenco || problema ? T.amber : attenzione ? T.amber : T.border
  // L'unità come sta scritta sulla bolla, e cosa ne fa il conto.
  const unitaScritta = String(r.grezza.unita ?? '').trim()
  const nostra = UNITA_NOSTRE.some(([v]) => v === unitaScritta)
  const comeLaContiamo = unitaScritta && !nostra ? normalizzaUnita(unitaScritta) : null
  const sfondo = r.saltata ? T.bgSubtle : T.bgCard

  return (
    // Un gruppo con il suo nome: chi legge con la voce sente «riga 2, burro»
    // prima dei comandi, invece di tre bottoni uguali uno dietro l'altro. Gli
    // avvisi di questa riga stanno qui dentro, e solo qui.
    <div role="group" aria-label={`Riga ${indice + 1}${r.nome ? `: ${formatNome(r.nome)}` : ''}`} style={{
      border: `1px solid ${bordo}`, borderRadius: 12, background: sfondo,
      padding: suTelefono ? 12 : 14, opacity: r.saltata ? 0.55 : 1,
    }}>
      <div style={{
        display: 'flex', gap: 10, alignItems: 'flex-start',
        flexDirection: suTelefono ? 'column' : 'row',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {r.esisteInElenco && !aperta ? (
            <div style={{ fontSize: font.size.md, fontWeight: 700, color: T.text }}>{formatNome(r.nome)}</div>
          ) : (
            <div>
              <div style={{
                fontSize: font.size.sm, fontWeight: 700, marginBottom: 5,
                color: r.esisteInElenco ? T.textMid : (T.amberDark || T.amber),
              }}>
                {r.esisteInElenco
                  ? 'Materia prima'
                  : r.nome
                    ? `«${r.nome}» non è fra le tue materie prime: scegli quale`
                    : 'Quale materia prima è arrivata?'}
              </div>
              <CampoConElenco
                id={`bolla-nome-${indice}`}
                valore={r.esisteInElenco ? formatNome(r.nome) : ''}
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
      {/* ── Gli avvisi del conto: difetto del 21/09/2026 ────────────────────
          Il calcolo aveva imparato a dire cosa aveva dovuto dedurre (il peso
          del sacco letto dalla descrizione) e cosa non gli tornava
          (l'imponibile che non quadra con quantità × prezzo unitario), ma
          nessuno li mostrava: restavano nell'oggetto e morivano lì. Stanno
          sulla riga a cui appartengono — uno per riga, dove si guarda quel
          numero — e non in fondo alla pagina tutti insieme, dove non si sa
          più di chi parlano. */}
      {avvisi.map((a, k) => (
        <div key={k} style={{
          marginTop: 6, display: 'flex', gap: 7, alignItems: 'flex-start',
          fontSize: font.size.base, color: T.amberDark || T.amber,
          fontWeight: 600, lineHeight: 1.5,
        }}>
          <span style={{ flexShrink: 0, marginTop: 2 }}>
            <Icon name="warning" size={14} color={T.amberDark || T.amber} />
          </span>
          <span>{a}</span>
        </div>
      ))}
      {r.sospetto && (
        <div style={{ marginTop: 6, fontSize: font.size.base, color: T.brand, fontWeight: 700 }}>
          Il prezzo cambia di molto rispetto a prima. Prima di registrare, controlla
          che l&apos;unità di misura e il peso della confezione siano quelli giusti.
        </div>
      )}
      {/* Quando un avviso dice già **quale** numero si legge in due modi e
          come, questa frase generica ripeterebbe la stessa cosa con meno
          informazione. Resta per le ambiguità che nessun avviso racconta (il
          prezzo di riga letto «1.250»). */}
      {r.ambiguo && avvisi.length === 0 && (
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
          marginTop: 10, padding: 12, background: T.bgSubtle,
          borderRadius: 8, fontSize: font.size.sm, color: T.textMid, lineHeight: 1.7,
        }}>
          <div style={{
            display: 'grid', gap: 10, marginBottom: 12,
            gridTemplateColumns: suTelefono ? '1fr' : '1fr 1fr 1fr 1fr',
          }}>
            <Campo etichetta="Quantità" id={`bolla-qta-${indice}`}
              valore={r.grezza.quantita ?? ''} inputMode="decimal"
              onCambia={v => onCorreggi(indice, 'quantita', v)}
              placeholder="es. 5" />
            <div>
              <label style={ETICHETTA} htmlFor={`bolla-unita-${indice}`}>Unità</label>
              <select id={`bolla-unita-${indice}`} value={unitaScritta}
                onChange={e => onCorreggi(indice, 'unita', e.target.value)}
                style={CAMPO}>
                {!unitaScritta && <option value="">Quale unità? Sulla bolla non l&apos;ho trovata</option>}
                {unitaScritta && !nostra && (
                  <option value={unitaScritta}>
                    {comeLaContiamo
                      ? `${unitaScritta} (la conto come ${NOME_UNITA[comeLaContiamo]})`
                      : `${unitaScritta} — questa non la so leggere: scegline una`}
                  </option>
                )}
                {UNITA_NOSTRE.map(([v, et]) => <option key={v} value={v}>{et}</option>)}
              </select>
            </div>
            <Campo etichetta="Prezzo della riga, senza IVA" id={`bolla-imp-${indice}`}
              valore={r.grezza.imponibile ?? ''} inputMode="decimal"
              onCambia={v => onCorreggi(indice, 'imponibile', v)}
              placeholder="es. 92,50" />
            {/* ── Il peso scritto a mano: difetto del 21/09/2026 ──────────
                Passava da `Number(v) || null`, che è il modo inglese di
                leggere un numero italiano: «25.000» diventava 25 grammi
                invece di 25 chili (mille volte il prezzo al chilo, dentro il
                food cost di ogni ricetta con quella materia prima) e «12,5»
                diventava niente, perché con la virgola `Number` fa `NaN` e
                `|| null` lo trasformava in «campo vuoto» senza dire perché.
                Adesso il testo arriva intero al conto, che lo legge con la
                stessa regola italiana della quantità e dice a schermo quando
                si può leggere in due modi. */}
            <Campo etichetta="Peso di una confezione, in grammi" id={`bolla-peso-${indice}`}
              valore={r.grezza.pesoConfezioneG ?? ''} inputMode="decimal"
              onCambia={v => onCorreggi(indice, 'pesoConfezioneG', v)}
              placeholder="es. 25.000" />
          </div>

          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
            {r.spiegazione.length > 0
              ? r.spiegazione.map((sp, k) => <div key={k}>{sp}</div>)
              : <div>Non sono arrivato a un prezzo: {r.problema || 'mancano dei dati'}</div>}
          </div>

          <button type="button" onClick={() => onTogli(indice)}
            style={{
              marginTop: 12, padding: '8px 14px', minHeight: dito ? 44 : 34,
              background: 'transparent', border: `1px solid ${T.border}`,
              borderRadius: 8, color: T.textMid, fontSize: font.size.sm,
              fontWeight: 600, cursor: 'pointer',
            }}>Togli questa riga</button>
        </div>
      )}
    </div>
  )
}
