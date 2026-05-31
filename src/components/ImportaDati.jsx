import React, { useState } from 'react'
import useIsMobile from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S } from '../lib/theme'

// Carica SheetJS da CDN con SRI hash (xlsx npm pkg ha vuln high senza fix).
async function loadXLSX() {
  if (window.XLSX) return window.XLSX
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.integrity = 'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw'
    s.crossOrigin = 'anonymous'
    s.onload = () => resolve(window.XLSX)
    s.onerror = () => reject(new Error('Impossibile caricare XLSX'))
    document.head.appendChild(s)
  })
}

// ─── Definizione dei tipi di import ───────────────────────────────────────────
// Ogni voce ha: descrizione, colonne (con nota), righe di esempio per il template,
// e un handler `onImportFiles(files)` passato dal Dashboard (riusiamo gli import esistenti).
const TIPI_IMPORT = [
  {
    id: 'ricettario',
    icona: '📖',
    titolo: 'Ricettario',
    descrizione: 'Carica un file Excel con tutte le tue ricette, gli ingredienti, le quantità e i prezzi di vendita. Foodios calcola automaticamente il food cost di ciascuna ricetta.',
    foglio: 'Ricette',
    colonne: [
      { nome: 'Nome ricetta',    nota: 'Es. "Torta della nonna"', esempi: ['Torta della nonna', 'Crostata di mele', 'Tiramisù'] },
      { nome: 'Categoria',       nota: 'Torte / Biscotti / Crostate / ...', esempi: ['Torte', 'Crostate', 'Dolci al cucchiaio'] },
      { nome: 'Ingrediente',     nota: 'Una riga per ingrediente — ripeti il nome ricetta', esempi: ['farina 00', 'mele', 'mascarpone'] },
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
    icona: '🏷️',
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
    icona: '🧾',
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
    icona: '🛵',
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
    icona: '💰',
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

export default function ImportaDatiView({
  onImportRicettario,
  onImportPrezzi,
  onImportFatture,
  onImportDelivery,
  onImportCasse,
  notify,
}) {
  const isMobile = useIsMobile()
  const [expanded, setExpanded] = useState(null) // id tipo aperto in dettaglio

  const handlers = {
    onImportRicettario,
    onImportPrezzi,
    onImportFatture,
    onImportDelivery,
    onImportCasse,
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? 12 : 0 }}>
      <div style={{ marginBottom: isMobile ? 16 : 20 }}>
        <p style={{ margin: 0, fontSize: 13, color: T.textSoft, letterSpacing: '-0.005em', lineHeight: 1.5 }}>
          Importa i tuoi dati in Foodios da Excel, CSV o esportazioni dei sistemi cassa/delivery.
          Scarica il template per ogni tipo di import per avere le colonne esatte.
        </p>
      </div>

      {/* Hint box */}
      <div style={{
        background: T.bgSubtle, border: `1px solid ${T.border}`, borderRadius: R.lg,
        padding: '14px 18px', marginBottom: 24,
        display: 'flex', gap: 12, alignItems: 'flex-start',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: T.brandLight, color: T.brand,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700,
        }}>i</div>
        <div style={{ fontSize: 12.5, color: T.textMid, lineHeight: 1.55 }}>
          <b style={{ color: T.text }}>Come funziona:</b> per ciascun tipo di import 1) clicca "Scarica template",
          2) compila il file mantenendo le intestazioni, 3) clicca "Importa file" e seleziona il tuo Excel.
          Foodios mappa automaticamente le colonne dal nome.
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
        {TIPI_IMPORT.map(tipo => {
          const isOpen = expanded === tipo.id
          const handler = handlers[tipo.propHandler]
          return (
            <div key={tipo.id} style={{
              background: T.bgCard, border: `1px solid ${T.border}`,
              borderRadius: R.xl, boxShadow: S.sm, overflow: 'hidden',
              transition: 'box-shadow 180ms ease, border-color 180ms ease',
              gridColumn: isOpen && !isMobile ? '1 / -1' : undefined,
            }}>
              <div style={{ padding: '18px 20px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                  background: T.bgSubtle, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22,
                }}>
                  {tipo.icona}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: '-0.01em', marginBottom: 4 }}>
                    {tipo.titolo}
                  </div>
                  <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.55 }}>
                    {tipo.descrizione}
                  </div>
                </div>
              </div>

              {/* Bottoni */}
              <div style={{ display: 'flex', gap: 8, padding: '0 20px 16px', flexWrap: 'wrap' }}>
                <button onClick={() => scaricaTemplate(tipo)}
                  style={{
                    flex: '1 1 140px', minWidth: 140,
                    padding: '9px 14px', borderRadius: 8,
                    border: `1px solid ${T.border}`, background: T.bgCard,
                    color: T.textMid, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    transition: 'background 100ms ease, color 100ms ease',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = T.bgSubtle; e.currentTarget.style.color = T.text }}
                  onMouseLeave={e => { e.currentTarget.style.background = T.bgCard; e.currentTarget.style.color = T.textMid }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Scarica template Excel
                </button>

                <label style={{
                  flex: '1 1 140px', minWidth: 140,
                  padding: '9px 14px', borderRadius: 8,
                  border: 'none', background: T.brand,
                  color: '#FFF', fontSize: 12, fontWeight: 800, cursor: handler ? 'pointer' : 'not-allowed',
                  opacity: handler ? 1 : 0.5,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  textAlign: 'center', boxShadow: handler ? '0 2px 6px rgba(110,14,26,0.25)' : 'none',
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Importa file
                  <input type="file" accept={tipo.accept} multiple style={{ display: 'none' }}
                    disabled={!handler}
                    onChange={e => {
                      if (!handler) return notify?.('⚠ Importazione non ancora disponibile per questo tipo', false)
                      const files = e.target.files
                      if (files && files.length > 0) {
                        handler(files)
                        notify?.(`📂 ${files.length} file in importazione…`)
                      }
                      e.target.value = ''
                    }}/>
                </label>

                <button onClick={() => setExpanded(o => o === tipo.id ? null : tipo.id)}
                  style={{
                    padding: '9px 12px', borderRadius: 8,
                    border: `1px solid ${T.border}`, background: 'transparent',
                    color: T.textMid, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}>
                  {isOpen ? '▲ Nascondi struttura' : '▼ Struttura colonne'}
                </button>
              </div>

              {/* Dettaglio colonne */}
              {isOpen && (
                <div style={{ borderTop: `1px solid ${T.borderSoft}`, padding: '16px 20px', background: T.bgSubtle }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                    Foglio: <span style={{ color: T.text }}>{tipo.foglio}</span> · {tipo.colonne.length} colonne
                  </div>
                  <div style={{ background: T.bgCard, borderRadius: 8, border: `1px solid ${T.border}`, overflowX: 'auto' }}>
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
                    <div style={{ marginTop: 12, fontSize: 11.5, color: T.textMid, lineHeight: 1.55 }}>
                      💡 {tipo.note}
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
