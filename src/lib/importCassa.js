// Parser per sistemi cassa italiani
// Restituisce sempre: [{ data: "YYYY-MM-DD", importo: number, iva: number, metodo: string, fonte: string }]

// ── Utilities ────────────────────────────────────────────────────────────────

function parseItalianDate(str) {
  if (!str) return null;
  str = String(str).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const m = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  }
  return null;
}

function parseNum(str) {
  if (str === undefined || str === null || str === '') return 0;
  if (typeof str === 'number') return str;
  return parseFloat(String(str).replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
}

function detectSeparator(text) {
  const first = text.split('\n')[0] || '';
  const counts = {',': 0, ';': 0, '\t': 0};
  for (const c of first) if (c in counts) counts[c]++;
  return Object.entries(counts).sort((a,b) => b[1]-a[1])[0][0];
}

function parseCSV(text) {
  const sep = detectSeparator(text);
  const lines = text.split('\n').map(l => l.trimEnd());
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(sep).map(h => h.replace(/^["']|["']$/g, '').trim());
  const rows = lines.slice(1).filter(l => l.trim()).map(l => {
    const vals = [];
    let cur = '', inQ = false;
    for (const ch of l + sep) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === sep && !inQ) { vals.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
  return { headers, rows };
}

function aggrega(righe, dateKey, importoKey, ivaKey, metodoKey, fonte) {
  const map = {};
  for (const r of righe) {
    const data = parseItalianDate(r[dateKey]);
    if (!data) continue;
    const imp  = parseNum(r[importoKey]);
    const iva  = ivaKey  ? parseNum(r[ivaKey])  : 0;
    const met  = metodoKey ? (r[metodoKey] || '') : '';
    if (!map[data]) map[data] = { importo: 0, iva: 0, righe: 0, metodi: {} };
    map[data].importo += imp;
    map[data].iva += iva;
    map[data].righe += 1;
    if (met) map[data].metodi[met] = (map[data].metodi[met] || 0) + imp;
  }
  return Object.entries(map).map(([data, v]) => ({
    data,
    importo:  Math.round(v.importo * 100) / 100,
    iva:      Math.round(v.iva * 100) / 100,
    righe:    v.righe,
    metodi:   v.metodi,
    fonte,
  })).sort((a, b) => a.data.localeCompare(b.data));
}

// ── 4a. Zucchetti (Infinity / Kassa) ─────────────────────────────────────────

export function parseZucchettiCSV(csvText) {
  const { rows } = parseCSV(csvText);
  const dateKey  = ['Data', 'DATE'].find(k => rows[0]?.[k] !== undefined) || 'Data';
  const impKey   = ['Importo', 'Totale', 'Amount'].find(k => rows[0]?.[k] !== undefined) || 'Importo';
  const ivaKey   = ['IVA', 'Iva', 'VAT'].find(k => rows[0]?.[k] !== undefined);
  return aggrega(rows, dateKey, impKey, ivaKey || null, null, 'Zucchetti');
}

export function parseZucchettiXML(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const vendite = doc.querySelectorAll('Vendita, vendita, Record');
  const righe = [];
  vendite.forEach(v => {
    const data  = v.querySelector('Data, data')?.textContent?.trim();
    const tot   = v.querySelector('Totale, totale, Importo, importo')?.textContent?.trim();
    const iva   = v.querySelector('IVA, iva, Iva')?.textContent?.trim();
    if (data && tot) righe.push({ Data: data, Importo: tot, IVA: iva || '0' });
  });
  return aggrega(righe, 'Data', 'Importo', 'IVA', null, 'Zucchetti');
}

// ── 4b. Cassa in Cloud ────────────────────────────────────────────────────────
// Colonne: Data, Ora, Prodotto, Quantità, Prezzo, Totale, Metodo pagamento
export function parseCassaInCloud(csvText) {
  const { rows } = parseCSV(csvText);
  const dateKey = ['Data', 'Date'].find(k => rows[0]?.[k] !== undefined) || 'Data';
  const impKey  = ['Totale', 'Total', 'Prezzo'].find(k => rows[0]?.[k] !== undefined) || 'Totale';
  const metKey  = ['Metodo pagamento', 'Metodo', 'Payment'].find(k => rows[0]?.[k] !== undefined);
  return aggrega(rows, dateKey, impKey, null, metKey || null, 'Cassa in Cloud');
}

// ── 4c. SumUp ────────────────────────────────────────────────────────────────
// Colonne: Date, Time, Type, Amount, Currency, Status
export function parseSumUp(csvText) {
  const { rows } = parseCSV(csvText);
  // Filtra solo SALE + SUCCESSFUL
  const filtered = rows.filter(r => {
    const type   = (r['Type'] || r['Tipo'] || '').toUpperCase();
    const status = (r['Status'] || r['Stato'] || '').toUpperCase();
    return (type === 'SALE' || type === 'VENDITA' || type === '') &&
           (status === 'SUCCESSFUL' || status === 'COMPLETATO' || status === '');
  });
  const dateKey = ['Date', 'Data'].find(k => filtered[0]?.[k] !== undefined) || 'Date';
  const impKey  = ['Amount', 'Importo', 'Total'].find(k => filtered[0]?.[k] !== undefined) || 'Amount';
  return aggrega(filtered, dateKey, impKey, null, null, 'SumUp');
}

// ── 4d. Lightspeed ───────────────────────────────────────────────────────────
// Colonne: Date, Receipt number, Total incl. tax, Payment method
export function parseLightspeed(csvText) {
  const { rows } = parseCSV(csvText);
  const dateKey = ['Date', 'Data'].find(k => rows[0]?.[k] !== undefined) || 'Date';
  const impKey  = ['Total incl. tax', 'Total', 'Totale'].find(k => rows[0]?.[k] !== undefined) || 'Total incl. tax';
  const metKey  = ['Payment method', 'Metodo'].find(k => rows[0]?.[k] !== undefined);
  return aggrega(rows, dateKey, impKey, null, metKey || null, 'Lightspeed');
}

// ── 4e. Square ───────────────────────────────────────────────────────────────
// Colonne: Date, Time, Category, Description, Amount, Fee
export function parseSquare(csvText) {
  const { rows } = parseCSV(csvText);
  const dateKey = ['Date', 'Data'].find(k => rows[0]?.[k] !== undefined) || 'Date';
  const impKey  = ['Amount', 'Importo', 'Total'].find(k => rows[0]?.[k] !== undefined) || 'Amount';
  const feeKey  = ['Fee', 'Commissione'].find(k => rows[0]?.[k] !== undefined);
  // sottrai commissione da importo
  const result = aggrega(rows, dateKey, impKey, null, null, 'Square');
  if (feeKey) {
    const feeMap = {};
    rows.forEach(r => {
      const d = parseItalianDate(r[dateKey]);
      if (d) feeMap[d] = (feeMap[d] || 0) + parseNum(r[feeKey]);
    });
    return result.map(r => ({
      ...r,
      importo: Math.round((r.importo - (feeMap[r.data] || 0)) * 100) / 100,
    }));
  }
  return result;
}

// ── 4f. Fattura XML (SDI) ─────────────────────────────────────────────────────
// Estrae: cedente, data, importo, IVA
export function parseFatturaXML(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const ns = 'http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2';

  function text(parent, ...tags) {
    for (const tag of tags) {
      const el = parent.querySelector(tag) ||
                 parent.getElementsByTagNameNS(ns, tag)[0] ||
                 parent.getElementsByTagNameNS('*', tag)[0];
      if (el) return el.textContent.trim();
    }
    return '';
  }

  const data        = parseItalianDate(text(doc, 'Data', 'DataDocumento')) || new Date().toISOString().slice(0,10);
  const importoLordo= parseNum(text(doc, 'ImportoPagamento', 'ImponibileImporto', 'PrezzoTotale'));
  const ivaText     = text(doc, 'Imposta', 'AliquotaIVA');
  const iva         = parseNum(ivaText);
  const cedente     = text(doc, 'Denominazione', 'Nome') || 'Fornitore';
  const numero      = text(doc, 'Numero', 'NumeroDocumento') || '';

  return [{
    data,
    importo:  importoLordo,
    iva,
    cedente,
    numero,
    tipo: 'fattura',
    fonte: 'SDI/XML',
  }];
}

// ── Dispatch automatico per tipo sistema ─────────────────────────────────────
export async function parseFile(sistema, file) {
  const text = await file.text();

  switch (sistema) {
    case 'zucchetti':
      return file.name.endsWith('.xml') ? parseZucchettiXML(text) : parseZucchettiCSV(text);
    case 'cassaincloud':
      return parseCassaInCloud(text);
    case 'sumup':
      return parseSumUp(text);
    case 'lightspeed':
      return parseLightspeed(text);
    case 'square':
      return parseSquare(text);
    case 'fattura_xml':
      return parseFatturaXML(text);
    default:
      throw new Error(`Sistema non riconosciuto: ${sistema}`);
  }
}

// ── Importa in chiusure ───────────────────────────────────────────────────────
export function mergeInChiusureCassa(chiusure = [], importati = [], fonte = '') {
  const nuove = [...chiusure];
  for (const riga of importati) {
    const idx = nuove.findIndex(c => c.data === riga.data);
    const cassaEntry = { ...riga, importatoAt: new Date().toISOString() };
    if (idx >= 0) {
      nuove[idx] = {
        ...nuove[idx],
        cassaImport: [...(nuove[idx].cassaImport || []).filter(c => c.fonte !== fonte), cassaEntry],
        kpi: {
          ...(nuove[idx].kpi || {}),
          totV: Math.max(nuove[idx].kpi?.totV || 0, riga.importo),
        },
      };
    } else {
      nuove.push({
        id: `ch-${riga.data}-cassa`,
        data: riga.data,
        salvatoAt: new Date().toISOString(),
        venduto: [],
        confronto: [],
        kpi: { totV: riga.importo, totFC: 0, totM: riga.importo, totS: 0, totMP: 0, avgST: 0 },
        cassaImport: [cassaEntry],
      });
    }
  }
  nuove.sort((a, b) => b.data.localeCompare(a.data));
  return nuove;
}
