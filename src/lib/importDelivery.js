// Parser per piattaforme delivery italiane
// Restituisce sempre: [{ data: "YYYY-MM-DD", importo: number, commissione: number, netto: number, ordini: number, fonte: string }]

// ── Utilities ────────────────────────────────────────────────────────────────

function parseItalianDate(str) {
  if (!str) return null;
  str = str.trim();
  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  // DD/MM/YYYY o DD-MM-YYYY
  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  }
  // MM/DD/YYYY (SumUp style)
  const m2 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) {
    const [,a,b,y] = m2;
    if (parseInt(a)>12) return `${y}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`;
    return `${y}-${a.padStart(2,'0')}-${b.padStart(2,'0')}`;
  }
  return null;
}

function parseNum(str) {
  if (str === undefined || str === null || str === '') return 0;
  if (typeof str === 'number') return str;
  return parseFloat(String(str).replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
}

// Rileva separatore CSV automaticamente
function detectSeparator(text) {
  const first = text.split('\n')[0] || '';
  const counts = {',': 0, ';': 0, '\t': 0};
  for (const c of first) if (c in counts) counts[c]++;
  return Object.entries(counts).sort((a,b) => b[1]-a[1])[0][0];
}

function parseCSV(text) {
  const sep = detectSeparator(text);
  const lines = text.split('\n').map(l => l.trimEnd());
  if (!lines.length) return { headers: [], rows: [], sep };
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
  return { headers, rows, sep };
}

function aggrega(righe, dateKey, importoKey, commKey) {
  const map = {};
  for (const r of righe) {
    const data = parseItalianDate(r[dateKey]);
    if (!data) continue;
    const imp = parseNum(r[importoKey]);
    const comm = commKey ? parseNum(r[commKey]) : 0;
    if (!map[data]) map[data] = { importo: 0, commissione: 0, ordini: 0 };
    map[data].importo += imp;
    map[data].commissione += comm;
    map[data].ordini += 1;
  }
  return Object.entries(map).map(([data, v]) => ({
    data,
    importo: Math.round(v.importo * 100) / 100,
    commissione: Math.round(v.commissione * 100) / 100,
    netto: Math.round((v.importo - v.commissione) * 100) / 100,
    ordini: v.ordini,
  })).sort((a, b) => a.data.localeCompare(b.data));
}

// ── Parser Deliveroo ──────────────────────────────────────────────────────────
// Colonne: Date, Order ID, Restaurant, Items, Subtotal, Delivery fee, Total
export function parseDeliveroo(csvText) {
  const { rows } = parseCSV(csvText);
  const aggregato = aggrega(rows, 'Date', 'Total', null);
  return aggregato.map(r => ({ ...r, fonte: 'Deliveroo' }));
}

// ── Parser JustEat ────────────────────────────────────────────────────────────
// Colonne: Order date, Order number, Total order value, Commission
export function parseJustEat(csvText) {
  const { rows } = parseCSV(csvText);
  // prova con vari nomi colonna
  const dateKey = ['Order date', 'Date', 'Data'].find(k => rows[0]?.[k] !== undefined) || 'Order date';
  const impKey  = ['Total order value', 'Total', 'Totale'].find(k => rows[0]?.[k] !== undefined) || 'Total order value';
  const commKey = ['Commission', 'Commissione'].find(k => rows[0]?.[k] !== undefined) || 'Commission';
  return aggrega(rows, dateKey, impKey, commKey).map(r => ({ ...r, fonte: 'JustEat' }));
}

// ── Parser Glovo / Foodinho ───────────────────────────────────────────────────
// Formato Excel — usa SheetJS (xlsx)
export async function parseGlovo(file) {
  const XLSX = await loadXLSX();
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { raw: false });

  // nomi colonna flessibili
  const dateKey  = ['Data ordine', 'Order Date', 'Date', 'Data'].find(k => data[0]?.[k] !== undefined) || 'Data ordine';
  const impKey   = ['Totale', 'Total', 'Importo'].find(k => data[0]?.[k] !== undefined) || 'Totale';
  const commKey  = ['Commissione Glovo', 'Commission', 'Commissione'].find(k => data[0]?.[k] !== undefined);

  return aggrega(data, dateKey, impKey, commKey || null).map(r => ({ ...r, fonte: 'Glovo' }));
}

// ── Parser generico CSV ───────────────────────────────────────────────────────
// Restituisce { headers, preview, rows } per mostrare preview e chiedere mapping
export function parseGenericCSV(csvText) {
  const { headers, rows, sep } = parseCSV(csvText);
  const preview = rows.slice(0, 5);
  return { headers, preview, rows, sep };
}

// Dopo che l'utente ha confermato il mapping colonne
export function applyGenericMapping(rows, dateCol, importoCol, commCol, fonte = 'Generico') {
  return aggrega(rows, dateCol, importoCol, commCol || null).map(r => ({ ...r, fonte }));
}

// ── Importa in chiusure cassa ─────────────────────────────────────────────────
// Prende i risultati aggregati e li fonde nelle chiusure esistenti
export function mergeInChiusure(chiusure = [], importati = [], fonte = '') {
  const nuove = [...chiusure];
  for (const riga of importati) {
    const idx = nuove.findIndex(c => c.data === riga.data);
    const importoDelivery = {
      fonte,
      importo: riga.importo,
      commissione: riga.commissione,
      netto: riga.netto,
      ordini: riga.ordini,
      importatoAt: new Date().toISOString(),
    };
    if (idx >= 0) {
      nuove[idx] = {
        ...nuove[idx],
        delivery: [...(nuove[idx].delivery || []).filter(d => d.fonte !== fonte), importoDelivery],
      };
    } else {
      nuove.push({
        id: `ch-${riga.data}-delivery`,
        data: riga.data,
        salvatoAt: new Date().toISOString(),
        venduto: [],
        confronto: [],
        kpi: { totV: riga.netto, totFC: 0, totM: riga.netto, totS: 0, totMP: 0, avgST: 0 },
        delivery: [importoDelivery],
      });
    }
  }
  nuove.sort((a, b) => b.data.localeCompare(a.data));
  return nuove;
}

// Carica SheetJS dinamicamente
async function loadXLSX() {
  if (window.__XLSX) return window.__XLSX;
  const mod = await import('xlsx');
  window.__XLSX = mod;
  return mod;
}
