import React, { useState } from 'react'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { color as T } from '../lib/theme'
import { loadXLSX } from '../lib/xlsx' // loader unico multi-CDN, no SRI
import Icon from './Icon'

// ─── Definizione dei tipi di import ───────────────────────────────────────────
// Ogni voce ha: descrizione, colonne (con nota), righe di esempio per il template,
// e un handler `onImportFiles(files)` passato dal Dashboard (riusiamo gli import esistenti).
const TIPI_IMPORT = [
  {
    id: 'ricettario',
    icona: 'book',
    titolo: 'Ricettario',
    descrizione: 'Carica un file Excel con tutte le tue ricette, gli ingredienti, le quantità e i prezzi di vendita. Foodios calcola automaticamente il food cost di ciascuna ricetta.',
    foglio: 'Ricette',
    colonne: [
      { nome: 'Nome ricetta',    nota: 'Es. "Torta della nonna"', esempi: ['Torta della nonna', 'Crostata di mele', 'Tiramisù'] },
      { nome: 'Categoria',       nota: 'Torte / Biscotti / Crostate / ...', esempi: ['Torte', 'Crostate', 'Dolci al cucchiaio'] },
      { nome: 'Ingrediente',     nota: 'Una riga per ingrediente - ripeti il nome ricetta', esempi: ['farina 00', 'mele', 'mascarpone'] },
      { nome: 'Quantità (g/ml)', nota: 'Per uno stampo, in grammi o ml', esempi: [400, 600, 500] },
      { nome: 'N° pezzi/fette',  nota: 'Quanti pezzi/fette si ricavano da uno stampo', esempi: [10, 8, 12] },
      { nome: 'Prezzo €/pezzo',  nota: 'Prezzo di vendita al cliente per pezzo', esempi: [4.5, 3.0, 5.0] },
    ],
    propHandler: 'onImportRicettario',
    accept: '.xlsx,.xls,.csv',
    note: 'Suggerimento: ripeti il nome ricetta su ogni riga ingrediente. Quantità in grammi (per liquidi: 1 ml ≈ 1 g).',
  },
  {
    id: 'prezzi',
    icona: 'ticket',
    titolo: 'Prezzi ingredienti',
    descrizione: 'Aggiorna in blocco i prezzi degli ingredienti che usi nelle ricette. Il food cost verrà ricalcolato automaticamente.',
    foglio: 'Prezzi ingredienti',
    colonne: [
      { nome: 'Ingrediente', nota: 'Nome esatto come usato nelle ricette', esempi: ['farina 00', 'zucchero', 'burro'] },
      { nome: 'Prezzo €/kg', nota: 'Prezzo al kg al netto IVA', esempi: [1.20, 0.95, 8.50] },
    ],
    propHandler: 'onImportPrezzi',
    accept: '.xlsx,.xls,.csv',
    note: 'Per modificare un solo prezzo, usa Magazzino → Prezzi ingredienti (edit inline).',
  },
  {
    id: 'fatture',
    icona: 'receipt',
    titolo: 'Fatture fornitori',
    descrizione: 'Importa fatture XML (formato fattura elettronica italiano) o file Excel con voci di spesa. Aggiorna automaticamente il magazzino e la spesa per fornitore.',
    foglio: 'Fatture',
    colonne: [
      { nome: 'Data',          nota: 'Data fattura (YYYY-MM-DD o gg/mm/aaaa)', esempi: ['2026-03-15', '2026-03-22', '2026-04-02'] },
      { nome: 'Fornitore',     nota: 'Ragione sociale del fornitore', esempi: ['Metro Italia SpA', 'Eurovo SRL', 'Caseificio Rossi'] },
      { nome: 'Ingrediente',   nota: 'Voce/articolo come da bolla', esempi: ['farina 00 25kg', 'uova fresche', 'burro 1kg'] },
      { nome: 'Quantità',      nota: 'In kg, l, o pezzi a seconda dell articolo', esempi: [25, 360, 5] },
      { nome: 'Unità',         nota: 'kg / l / pz', esempi: ['kg', 'pz', 'kg'] },
      { nome: 'Importo €',     nota: 'Totale riga IVA esclusa', esempi: [22.50, 84.00, 42.50] },
    ],
    propHandler: 'onImportFatture',
    accept: '.xml,.xlsx,.xls,.csv',
    note: 'Le fatture elettroniche italiane (XML) vengono parsate automaticamente. Per Excel personalizzati segui questo schema.',
  },
  {
    id: 'delivery',
    icona: 'scooter',
    titolo: 'Vendite Delivery',
    descrizione: 'Carica i report di vendita da Glovo, Deliveroo, Just Eat, Uber Eats e altre piattaforme di delivery / ecommerce.',
    foglio: 'Delivery',
    colonne: [
      { nome: 'Data',         nota: 'Data ordine (YYYY-MM-DD)', esempi: ['2026-03-15', '2026-03-15', '2026-03-16'] },
      { nome: 'Piattaforma',  nota: 'Glovo / Deliveroo / Just Eat / Uber Eats / Sito proprio', esempi: ['Glovo', 'Deliveroo', 'Just Eat'] },
      { nome: 'Prodotto',     nota: 'Nome prodotto come nel ricettario', esempi: ['Torta della nonna', 'Crostata di mele', 'Tiramisù'] },
      { nome: 'Quantità',     nota: 'Pezzi venduti', esempi: [3, 2, 1] },
      { nome: 'Prezzo lordo €', nota: 'Incasso lordo prima delle commissioni', esempi: [13.50, 6.00, 5.00] },
      { nome: 'Commissione €',  nota: 'Commissione/fee trattenuta dalla piattaforma', esempi: [4.05, 1.80, 1.50] },
    ],
    propHandler: 'onImportDelivery',
    accept: '.xlsx,.xls,.csv',
    note: 'Foodios riconosce i CSV standard di Glovo / Deliveroo. Per altre piattaforme segui questo schema.',
  },
  {
    id: 'casse',
    icona: 'money',
    titolo: 'Casse / Scontrini',
    descrizione: 'Carica esportazioni dalla cassa elettronica (Zucchetti, Streamcassa, Toast) o un Excel con i totali venduti per prodotto e data.',
    foglio: 'Casse',
    colonne: [
      { nome: 'Data',         nota: 'Data dello scontrino/chiusura cassa', esempi: ['2026-03-15', '2026-03-15', '2026-03-16'] },
      { nome: 'Prodotto',     nota: 'Nome prodotto come nel ricettario', esempi: ['Torta della nonna', 'Caffè', 'Crostata di mele'] },
      { nome: 'Quantità',     nota: 'Pezzi/porzioni venduti', esempi: [5, 24, 3] },
      { nome: 'Prezzo unit €', nota: 'Prezzo unitario di vendita IVA inclusa', esempi: [4.50, 1.20, 3.00] },
      { nome: 'Totale €',     nota: 'Totale riga (Quantità × Prezzo)', esempi: [22.50, 28.80, 9.00] },
    ],
    propHandler: 'onImportCasse',
    accept: '.xlsx,.xls,.csv,.xml',
    note: 'Per Zucchetti / Streamcassa puoi caricare l export nativo. Per cassa generica usa lo schema Excel sopra.',
  },
]

async function scaricaTemplate(tipo) {
  const XLSX = await loadXLSX()
  const headers = tipo.colonne.map(c => c.nome)
  const note    = tipo.colonne.map(c => c.nota)
  const maxEx = Math.max(...tipo.colonne.map(c => (c.esempi||[]).length))
  const demoRows = []
  for (let i = 0; i < maxEx; i++) {
    demoRows.push(tipo.colonne.map(c => (c.esempi||[])[i] ?? ''))
  }
  const data = [headers, note, ...demoRows]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = tipo.colonne.map(c => ({ wch: Math.max(c.nome.length + 4, 16) }))
  const range = XLSX.utils.decode_range(ws['!ref'])
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const headerCell = ws[XLSX.utils.encode_cell({ r: 0, c: C })]
    if (headerCell) { headerCell.s = { font: { bold: true } } }
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, tipo.foglio.slice(0, 31))
  const fileName = `foodios_template_${tipo.id}.xlsx`
  XLSX.writeFile(wb, fileName)
}

const SHADOW_PREMIUM = '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)'

// Mini-card "1 passo" della guida iniziale
function PassoCard({ n, icona, titolo, testo, isMobile }) {
  return (
    <div style={{
      flex: '1 1 220px', minWidth: 0,
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 16,
      boxShadow: SHADOW_PREMIUM, padding: isMobile ? '16px 16px' : '18px 20px',
      display: 'flex', gap: 14, alignItems: 'flex-start',
    }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: T.brandLight, color: T.brand,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name={icona} size={20} />
        </div>
        <div style={{
          position: 'absolute', top: -7, right: -7,
          width: 20, height: 20, borderRadius: '50%',
          background: T.brand, color: '#FFF',
          fontSize: 11, fontWeight: 800, lineHeight: '20px', textAlign: 'center',
          boxShadow: '0 2px 6px rgba(110,14,26,0.3)',
        }}>{n}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, letterSpacing: '-0.01em', marginBottom: 3 }}>{titolo}</div>
        <div style={{ fontSize: 12, color: T.textSoft, lineHeight: 1.5 }}>{testo}</div>
      </div>
    </div>
  )
}

export default function ImportaDatiView({
  onImportRicettario,
  onImportPrezzi,
  onImportFatture,
  onImportDelivery,
  onImportCasse,
  notify,
}) {
  const isMobile = useIsMobile()
  const isTablet = useIsTablet()
  const [expanded, setExpanded] = useState(null) // id tipo aperto in dettaglio
  const [importingId, setImportingId] = useState(null) // id tipo in caricamento → spinner
  const [esiti, setEsiti] = useState({}) // id tipo → { ok:boolean, msg:string } | null

  const handlers = {
    onImportRicettario,
    onImportPrezzi,
    onImportFatture,
    onImportDelivery,
    onImportCasse,
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? 12 : isTablet ? 16 : 0 }}>
      <style>{`@keyframes impspin{to{transform:rotate(360deg)}}`}</style>

      {/* Header */}
      <div style={{ marginBottom: isMobile ? 18 : 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 11, flexShrink: 0,
            background: T.brandGradient, color: '#FFF',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(110,14,26,0.28)',
          }}>
            <Icon name="folder" size={20} color="#FFF" />
          </div>
          <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 800, color: T.text, letterSpacing: '-0.02em' }}>
            Importa dati
          </h1>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: T.textSoft, letterSpacing: '-0.005em', lineHeight: 1.55, maxWidth: 720 }}>
          Porta dentro Foodios il tuo ricettario, i prezzi, le fatture e le vendite da Excel, CSV o esportazioni
          dei sistemi cassa e delivery. Per ogni tipo scarica il template con le colonne esatte: ci pensa Foodios a
          mappare e calcolare il resto.
        </p>
      </div>

      {/* Mini guida - 3 passi */}
      <div style={{ marginBottom: isMobile ? 24 : 30 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase',
          letterSpacing: '0.08em', marginBottom: 12,
        }}>Come funziona, in 3 passi</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <PassoCard isMobile={isMobile} n={1} icona="download" titolo="Scarica il template"
            testo="Apri la card del tipo di dato e scarica il foglio Excel già pronto con le colonne giuste." />
          <PassoCard isMobile={isMobile} n={2} icona="edit" titolo="Compila il file"
            testo="Incolla i tuoi dati mantenendo le intestazioni. La seconda riga spiega cosa va in ogni colonna." />
          <PassoCard isMobile={isMobile} n={3} icona="upload" titolo="Importa"
            testo="Carica il file compilato. Foodios riconosce le colonne dal nome e aggiorna tutto in automatico." />
        </div>
      </div>

      {/* Sezione tipi import */}
      <div style={{
        fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase',
        letterSpacing: '0.08em', marginBottom: 12,
      }}>Cosa vuoi importare</div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
        {TIPI_IMPORT.map(tipo => {
          const isOpen = expanded === tipo.id
          const handler = handlers[tipo.propHandler]
          const busy = importingId === tipo.id
          const disabled = !handler || importingId !== null
          const esito = esiti[tipo.id]
          return (
            <div key={tipo.id} style={{
              background: T.bgCard, border: `1px solid ${busy ? T.brand : T.border}`,
              borderRadius: 16, boxShadow: SHADOW_PREMIUM, overflow: 'hidden',
              transition: 'box-shadow 180ms ease, border-color 180ms ease',
              gridColumn: isOpen && !isMobile ? '1 / -1' : undefined,
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Intestazione card */}
              <div style={{ padding: '18px 20px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  width: 46, height: 46, borderRadius: 12, flexShrink: 0,
                  background: T.brandLight, color: T.brand,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon name={tipo.icona} size={23} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 700, color: T.text, letterSpacing: '-0.01em', marginBottom: 4 }}>
                    {tipo.titolo}
                  </div>
                  <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.55 }}>
                    {tipo.descrizione}
                  </div>
                </div>
              </div>

              {/* Bottoni azione */}
              <div style={{ display: 'flex', gap: 8, padding: '0 20px 14px', flexWrap: 'wrap', marginTop: 'auto' }}>
                <button onClick={() => scaricaTemplate(tipo)}
                  style={{
                    flex: '1 1 150px', minWidth: 150,
                    padding: '10px 14px', borderRadius: 10,
                    border: `1px solid ${T.border}`, background: T.bgCard,
                    color: T.textMid, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    transition: 'background 100ms ease, color 100ms ease, border-color 100ms ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = T.bgSubtle; e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.borderStr }}
                  onMouseLeave={e => { e.currentTarget.style.background = T.bgCard; e.currentTarget.style.color = T.textMid; e.currentTarget.style.borderColor = T.border }}>
                  <Icon name="download" size={15} />
                  Scarica template
                </button>

                <label style={{
                  flex: '1 1 150px', minWidth: 150,
                  padding: '10px 14px', borderRadius: 10,
                  border: 'none', background: T.brand,
                  color: '#FFF', fontSize: 12.5, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer',
                  opacity: handler ? (importingId !== null && !busy ? 0.5 : 1) : 0.5,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                  textAlign: 'center', boxShadow: handler ? '0 2px 8px rgba(110,14,26,0.25)' : 'none',
                }}>
                  {busy ? (
                    <svg width="15" height="15" viewBox="0 0 24 24" style={{ animation: 'impspin 0.7s linear infinite' }}>
                      <circle cx="12" cy="12" r="9" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="3"/>
                      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
                    </svg>
                  ) : (
                    <Icon name="upload" size={15} color="#FFF" strokeWidth={2.2} />
                  )}
                  {busy ? 'Importazione…' : 'Importa file'}
                  <input type="file" accept={tipo.accept} multiple style={{ display: 'none' }}
                    disabled={disabled}
                    onChange={async e => {
                      if (!handler) return notify?.('Importazione non ancora disponibile per questo tipo', false)
                      const files = e.target.files
                      if (files && files.length > 0) {
                        const n = files.length
                        setImportingId(tipo.id)
                        setEsiti(s => ({ ...s, [tipo.id]: null }))
                        notify?.(`${n} file in importazione…`)
                        try {
                          await handler(files)
                          setEsiti(s => ({ ...s, [tipo.id]: { ok: true, msg: `${n} file importati. Dati aggiornati.` } }))
                          notify?.(`Import "${tipo.titolo}" completato`)
                        } catch (err) {
                          const msg = err?.message || 'riprova'
                          setEsiti(s => ({ ...s, [tipo.id]: { ok: false, msg: `Import non riuscito: ${msg}` } }))
                          notify?.(`Errore import: ${msg}`, false)
                        } finally {
                          setImportingId(null)
                        }
                      }
                      e.target.value = ''
                    }}/>
                </label>
              </div>

              {/* Esito ultima importazione */}
              {esito && (
                <div style={{ padding: '0 20px 14px' }}>
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    background: esito.ok ? T.greenLight : T.redLight,
                    border: `1px solid ${esito.ok ? T.green : T.red}22`,
                    borderRadius: 10, padding: '8px 12px',
                    fontSize: 12, fontWeight: 600, lineHeight: 1.45,
                    color: esito.ok ? T.green : T.red,
                  }}>
                    <Icon name={esito.ok ? 'checkCircle' : 'xCircle'} size={15}
                      color={esito.ok ? T.green : T.red} style={{ marginTop: 1, flexShrink: 0 }} />
                    <span>{esito.msg}</span>
                  </div>
                </div>
              )}

              {/* Toggle struttura colonne */}
              <button onClick={() => setExpanded(o => o === tipo.id ? null : tipo.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  width: '100%', padding: '11px 20px',
                  border: 'none', borderTop: `1px solid ${T.borderSoft}`,
                  background: isOpen ? T.bgSubtle : 'transparent',
                  color: T.textMid, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  textAlign: 'left',
                }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="fileText" size={14} color={T.textSoft} />
                  Struttura del file ({tipo.colonne.length} colonne)
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 180ms ease', color: T.textSoft }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {/* Dettaglio colonne (collassabile) */}
              {isOpen && (
                <div style={{ borderTop: `1px solid ${T.borderSoft}`, padding: '16px 20px', background: T.bgSubtle }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                    Foglio: <span style={{ color: T.text }}>{tipo.foglio}</span> · {tipo.colonne.length} colonne · formati: {tipo.accept.replace(/\./g, '').toUpperCase().replace(/,/g, ', ')}
                  </div>
                  <div style={{ background: T.bgCard, borderRadius: 10, border: `1px solid ${T.border}`, overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 480 }}>
                      <thead>
                        <tr style={{ background: T.bgSubtle }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${T.border}` }}>Colonna</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${T.border}` }}>Cosa contiene</th>
                          <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${T.border}` }}>Esempio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tipo.colonne.map((col, i) => (
                          <tr key={col.nome} style={{ borderBottom: i < tipo.colonne.length-1 ? `1px solid ${T.borderSoft}` : 'none' }}>
                            <td style={{ padding: '8px 12px', fontWeight: 700, color: T.text }}>{col.nome}</td>
                            <td style={{ padding: '8px 12px', color: T.textMid, lineHeight: 1.4 }}>{col.nota}</td>
                            <td style={{ padding: '8px 12px', color: T.textSoft, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
                              {(col.esempi||[]).slice(0,2).join(', ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {tipo.note && (
                    <div style={{ marginTop: 12, fontSize: 11.5, color: T.textMid, lineHeight: 1.55, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <Icon name="bulb" size={13} color={T.brand} style={{ marginTop: 1, flexShrink: 0 }}/><span>{tipo.note}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
