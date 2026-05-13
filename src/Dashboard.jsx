import React from 'react'
import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
         Cell, PieChart, Pie, Legend, ReferenceLine, LineChart, Line,
         AreaChart, Area } from 'recharts'
import { sload as _sload, ssave as _ssave } from './lib/storage'
import { supabase } from './lib/supabase'
import SedeSelector from './components/SedeSelector'
import Scadenzario from './components/Scadenzario'
import CalendarioOperativo from './components/CalendarioOperativo'
import ReferralPanel from './components/ReferralPanel'
import Integrazioni from './components/Integrazioni'
import { parseDeliveroo, parseJustEat, parseGlovo, parseGenericCSV, applyGenericMapping, mergeInChiusure } from './lib/importDelivery'
import { parseFile as parseCassaFile, mergeInChiusureCassa } from './lib/importCassa'
import useIsMobile from './lib/useIsMobile'
import { useOnlineStatus } from './lib/useOnlineStatus'
import ImpostazioniSedi from './components/ImpostazioniSedi'
import ConfrontoSedi from './components/ConfrontoSedi'
import EsportaDati from './components/EsportaDati'
import { exportRicettaPDF, exportPLMensile, exportProduzione } from './lib/exportPDF'

// React hooks are imported above — no need for global destructuring
// XLSX is loaded dynamically via loadXLSX()

// Module-level storage context — updated by Dashboard on every render so that
// view components defined at module scope can call ssave/sload without prop-drilling.
let _ctx_orgId = null;
let _ctx_sedeId = null;
function ssave(key, val) { return _ssave(key, val, _ctx_orgId, _ctx_sedeId); }
function sload(key)      { return _sload(key, _ctx_orgId, _ctx_sedeId); }

// ─── SORTABLE TABLE HOOK ──────────────────────────────────────────────────────
function useSortable(defaultKey, defaultDir="desc") {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState(defaultDir);
  const toggleSort = useCallback((key) => {
    setSortKey(prev => {
      if (prev === key) { setSortDir(d => d==="desc"?"asc":"desc"); return prev; }
      setSortDir("desc"); return key;
    });
  }, []);
  const sort = (arr, getValue) => [...arr].sort((a,b)=>{
    const va = getValue ? getValue(a,sortKey) : (a[sortKey]??0);
    const vb = getValue ? getValue(b,sortKey) : (b[sortKey]??0);
    const mul = sortDir==="desc"?-1:1;
    return typeof va==="string" ? mul*va.localeCompare(vb) : mul*(va-vb);
  });
  return { sortKey, sortDir, toggleSort, sort };
}

// Stable SortTH component — receives toggle/active as props (no re-creation issue)
function SortTH({ k, children, right, active, dir, onToggle }) {
  return (
    <th onClick={()=>onToggle(k)}
      style={{padding:"10px 16px",textAlign:right?"right":"left",fontSize:10,fontWeight:600,
        letterSpacing:"0.05em",textTransform:"uppercase",whiteSpace:"nowrap",
        color:active?"#C0392B":"#94A3B8",borderBottom:"1px solid #E2E8F0",
        background:active?"#FEF2F2":"transparent",cursor:"pointer",userSelect:"none",
        transition:"background 0.15s"}}>
      {children}{active?(dir==="desc"?" ▼":" ▲"):""}
    </th>
  );
}


// ─── TOOLTIP COMPONENT ────────────────────────────────────────────────────────
function Tip({ text, children, width=220 }) {
  const [show, setShow] = useState(false);
  const [pos,  setPos]  = useState({x:0, y:0});
  const ref = useRef(null);
  const handleEnter = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: r.left + r.width/2, y: r.top - 8 });
    setShow(true);
  };
  if (!text) return children;
  return (
    <span ref={ref} style={{position:"relative",display:"inline-flex",alignItems:"center"}}
      onMouseEnter={handleEnter} onMouseLeave={()=>setShow(false)}>
      {children}
      {show && (
        <span style={{
          position:"fixed",
          left: Math.min(pos.x - width/2, window.innerWidth - width - 8),
          top: pos.y,
          transform:"translateY(-100%)",
          zIndex:99999,
          background:"#1C0A0A",
          color:"rgba(255,255,255,0.92)",
          fontSize:11,
          fontWeight:500,
          lineHeight:1.55,
          padding:"8px 12px",
          borderRadius:8,
          width,
          pointerEvents:"none",
          boxShadow:"0 4px 20px rgba(0,0,0,0.35)",
          whiteSpace:"normal",
        }}>
          {text}
          <span style={{
            position:"absolute",left:"50%",top:"100%",
            transform:"translateX(-50%)",
            border:"5px solid transparent",
            borderTopColor:"#1C0A0A",
          }}/>
        </span>
      )}
    </span>
  );
}


// ─── XLSX LOADER ──────────────────────────────────────────────────────────────
function loadXLSX() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX);
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error("Impossibile caricare XLSX"));
    document.head.appendChild(s);
  });
}

// ─── PARSER RICETTARIO ────────────────────────────────────────────────────────
async function parseRicettario(file) {
  const XLSX = await loadXLSX();
  const buf  = await file.arrayBuffer();
  const wb   = XLSX.read(new Uint8Array(buf), { type:"array" });
  const num  = v => (v !== null && v !== "" && !isNaN(v)) ? Number(v) : 0;
  const ricette = {};
  const ingredienti_costi = {};
  for (const sheetName of wb.SheetNames) {
    const ws   = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:null });
    if (sheetName.toLowerCase().includes("ingredient")) {
      for (let i = 1; i < rows.length; i++) {
        const nome = rows[i]?.[0];
        if (nome && typeof nome === "string" && nome.trim())
          ingredienti_costi[normIng(nome.trim())] = { costoKg: num(rows[i]?.[1]), costoG: num(rows[i]?.[2]) };
      }
      continue;
    }
    const nomeRicetta = rows[0]?.[1] || rows[0]?.[0] || sheetName;
    if (!nomeRicetta || typeof nomeRicetta !== "string" || !nomeRicetta.trim()) continue;
    const nome = String(nomeRicetta).trim();
    const SKIP_NAMES = ["NaN", "undefined", "Nome ricetta", "Nome Ricetta", "NOME RICETTA", "Ricetta"];
    if (SKIP_NAMES.includes(nome) || SKIP_NAMES.map(s=>s.toLowerCase()).includes(nome.toLowerCase())) continue;
    const ingredienti = [];
    for (let i = 7; i < rows.length; i++) {
      const ing = rows[i]?.[0];
      if (!ing || typeof ing !== "string" || !ing.trim()) continue;
      if (ing.includes("Totale") || ing.includes("Note")) break;
      const ingKey = ing.trim().toLowerCase();
      if (["ingrediente","ingredient","ingredienti"].includes(ingKey)) continue;
      ingredienti.push({
        nome: ing.trim(),
        qty1stampo:   num(rows[i]?.[1]),
        costoPerG:    num(rows[i]?.[2]),
        costo1stampo: num(rows[i]?.[3]),
      });
    }
    let note = "";
    for (let i = Math.max(0, rows.length-6); i < rows.length; i++) {
      const v = rows[i]?.[0];
      if (v && typeof v === "string" && (v.includes("°") || v.includes("min"))) { note = v.trim(); break; }
    }
    ricette[nome] = {
      nome, sheetName,
      numStampi:   num(rows[1]?.[1]) || 1,
      totImpasto1: num(rows[0]?.[5]),
      foodCost1:   num(rows[2]?.[5]),
      ingredienti, note,
    };
  }
  return { ricette, ingredienti_costi };
}

// ─── PARSER FILE PREZZI ──────────────────────────────────────────────────────
async function parsePrezziFile(file) {
  const XLSX = await loadXLSX();
  const buf  = await file.arrayBuffer();
  const wb   = XLSX.read(new Uint8Array(buf), { type:"array" });
  const num  = v => (v !== null && v !== "" && !isNaN(+v)) ? +v : 0;
  const out  = {}; // { nomeNorm: { costoKg, costoG, isStima:false } }
  let count  = 0;

  for (const sheetName of wb.SheetNames) {
    const ws   = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:null });
    for (let i = 0; i < rows.length; i++) {
      const row  = rows[i];
      const nome = row?.[0];
      if (!nome || typeof nome !== "string" || !nome.trim()) continue;
      const trimmed = nome.trim().toLowerCase();
      if (["ingrediente","ingredient","nome","descrizione","prodotto","materia prima"].includes(trimmed)) continue;
      // Try to find €/kg in cols 1–4
      let costoKg = 0, costoG = 0;
      for (let c = 1; c <= 4; c++) {
        const v = num(row?.[c]);
        if (v > 0) {
          if (v > 5) { costoKg = v; break; }       // looks like €/kg
          else { costoG = v; costoKg = v * 1000; break; } // looks like €/g
        }
      }
      if (costoKg <= 0 && costoG <= 0) continue;
      if (costoG === 0) costoG = costoKg / 1000;
      const k = normIng(trimmed);
      out[k] = { costoKg: parseFloat(costoKg.toFixed(4)), costoG: parseFloat(costoG.toFixed(6)), isStima: false };
      count++;
    }
  }
  return { prezzi: out, count };
}

// ─── PREZZI HORECA TORINO ─────────────────────────────────────────────────────
const PREZZI_HORECA = {
  // ── FARINE & AMIDI ──────────────────────────────────────────────────────────
  // Farine - prezzi ingrosso HoReCa Torino (Metro/Transgourmet 25kg) 2025
  "farina 00":              { costoKg:0.88 },
  "farina":                 { costoKg:0.88 },
  "farina tipo 00":         { costoKg:0.88 },
  "farina bianca":          { costoKg:0.88 },
  "farina 0":               { costoKg:0.90 },
  "farina tipo 0":          { costoKg:0.90 },
  "farina manitoba":        { costoKg:1.10 },
  "farina forte":           { costoKg:1.10 },
  "farina w360":            { costoKg:1.15 },
  "farina w330":            { costoKg:1.10 },
  "farina integrale":       { costoKg:1.05 },
  "farina integrale grano": { costoKg:1.05 },
  "farina di farro":        { costoKg:2.80 },
  "farina di riso":         { costoKg:2.20 },
  "farina di mais":         { costoKg:1.40 },
  "farina di mandorle":     { costoKg:13.50 },
  "farina di nocciole":     { costoKg:16.00 },
  "farina di cocco":        { costoKg:5.50 },
  "farina di ceci":         { costoKg:2.60 },
  "farina senza glutine":   { costoKg:3.20 },
  "mix senza glutine":      { costoKg:3.50 },
  // Amidi
  "amido riso":             { costoKg:2.60 },
  "amido di riso":          { costoKg:2.60 },
  "amido mais":             { costoKg:1.70 },
  "amido di mais":          { costoKg:1.70 },
  "maizena":                { costoKg:1.70 },
  "fecola":                 { costoKg:1.70 },
  "fecola di patate":       { costoKg:1.90 },
  "amido frumento":         { costoKg:1.50 },
  "amido di frumento":      { costoKg:1.50 },

  // ── ZUCCHERI & DOLCIFICANTI ─────────────────────────────────────────────────
  // Prezzi ingrosso sacchi 25kg
  "zucchero":               { costoKg:0.98 },
  "zucchero semolato":      { costoKg:0.98 },
  "zucchero bianco":        { costoKg:0.98 },
  "zucchero fino":          { costoKg:0.98 },
  "zucchero a velo":        { costoKg:1.45 },
  "zucchero velo":          { costoKg:1.45 },
  "zucchero impalpabile":   { costoKg:1.45 },
  "zucchero di canna":      { costoKg:1.65 },
  "canna da zucchero":      { costoKg:1.65 },
  "zucchero di canna grezzo":{ costoKg:1.65 },
  "zucchero bruno":         { costoKg:1.65 },
  "zucchero muscovado":     { costoKg:3.20 },
  "zucchero demerara":      { costoKg:2.10 },
  "zucchero integrale":     { costoKg:2.20 },
  "zucchero integrale di canna":{ costoKg:2.20 },
  "zucchero panela":        { costoKg:3.40 },
  "fruttosio":              { costoKg:2.80 },
  "destrosio":              { costoKg:1.60 },
  "glucosio":               { costoKg:1.60 },
  "sciroppo di glucosio":   { costoKg:1.40 },
  "miele":                  { costoKg:5.80 },
  "miele di acacia":        { costoKg:7.50 },
  "miele millefiori":       { costoKg:5.80 },
  "sciroppo acero":         { costoKg:12.50 },
  "sciroppo d'acero":       { costoKg:12.50 },
  "maple syrup":            { costoKg:12.50 },
  "sciroppo d acero":       { costoKg:12.50 },
  "melassa":                { costoKg:3.20 },
  "treacle":                { costoKg:3.80 },
  "stevia":                 { costoKg:12.00 },

  // ── LIEVITI & AGENTI LIEVITANTI ─────────────────────────────────────────────
  "lievito":                { costoKg:7.50 },
  "lievito chimico":        { costoKg:7.50 },
  "lievito in polvere":     { costoKg:7.50 },
  "lievito per dolci":      { costoKg:7.50 },
  "lievito istantaneo":     { costoKg:7.50 },
  "baking powder":          { costoKg:7.50 },
  "bicarbonato":            { costoKg:1.90 },
  "bicarbonato di sodio":   { costoKg:1.90 },
  "baking soda":            { costoKg:1.90 },
  "lievito di birra":       { costoKg:3.20 },
  "lievito di birra fresco":{ costoKg:3.20 },
  "lievito fresco":         { costoKg:3.20 },
  "lievito secco":          { costoKg:22.00 },
  "lievito secco attivo":   { costoKg:22.00 },
  "lievito madre":          { costoKg:4.50 },
  "pasta madre":            { costoKg:4.50 },
  "cremor tartaro":         { costoKg:12.00 },

  // ── UOVA ────────────────────────────────────────────────────────────────────
  // Prezzi ingrosso allevamento/grossista (cat. A, M, €/kg equivalente)
  // Uovo M ≈ 60g → categoria A ingrosso ≈ €0.19/uo → €3.15/kg
  "uova":                   { costoKg:3.00 },
  "uovo":                   { costoKg:3.00 },
  "uova intere":            { costoKg:3.00 },
  "uovo intero":            { costoKg:3.00 },
  "tuorlo":                 { costoKg:6.20 },
  "tuorli":                 { costoKg:6.20 },
  "tuorlo d'uovo":          { costoKg:6.20 },
  "tuorli d'uovo":          { costoKg:6.20 },
  "albume":                 { costoKg:2.80 },
  "albumi":                 { costoKg:2.80 },
  "albume d'uovo":          { costoKg:2.80 },
  "albumi d'uovo":          { costoKg:2.80 },
  "uova in polvere":        { costoKg:14.00 },
  "tuorlo in polvere":      { costoKg:18.00 },

  // ── LATTICINI ───────────────────────────────────────────────────────────────
  // Prezzi ingrosso caseificio/grossista Torino-Piemonte
  "latte":                  { costoKg:0.95 },
  "latte intero":           { costoKg:0.95 },
  "latte fresco":           { costoKg:0.95 },
  "latte parzialmente scremato":{ costoKg:0.90 },
  "latte scremato":         { costoKg:0.88 },
  "latte UHT":              { costoKg:0.92 },
  "latte in polvere":       { costoKg:5.80 },
  "burro":                  { costoKg:5.80 },
  "burro di qualità":       { costoKg:5.80 },
  "burro chiarificato":     { costoKg:7.50 },
  "burro salato":           { costoKg:6.20 },
  "panna":                  { costoKg:3.40 },
  "panna fresca":           { costoKg:3.40 },
  "panna liquida":          { costoKg:3.40 },
  "panna da montare":       { costoKg:3.40 },
  "panna da cucina":        { costoKg:2.80 },
  "panna acida":            { costoKg:4.20 },
  "sour cream":             { costoKg:4.20 },
  "crème fraîche":          { costoKg:5.00 },
  "creme fraiche":          { costoKg:5.00 },
  "panna cotta":            { costoKg:3.40 },
  "buttermilk":             { costoKg:1.90 },
  "latticello":             { costoKg:1.90 },
  "yogurt":                 { costoKg:1.80 },
  "yogurt intero":          { costoKg:1.80 },
  "yogurt greco":           { costoKg:2.60 },
  "mascarpone":             { costoKg:6.20 },
  "ricotta":                { costoKg:3.80 },
  "ricotta fresca":         { costoKg:3.80 },
  "ricotta vaccina":        { costoKg:3.80 },
  "formaggio cremoso":      { costoKg:7.50 },
  "cream cheese":           { costoKg:7.50 },
  "philadelphia":           { costoKg:8.50 },
  "formaggio spalmabile":   { costoKg:7.50 },
  "formaggio fresco":       { costoKg:7.50 },
  "panna vegetale":         { costoKg:3.20 },
  "latte condensato":       { costoKg:4.20 },
  "latte condensato zuccherato":{ costoKg:4.20 },
  "latte evaporato":        { costoKg:3.50 },

  // ── CIOCCOLATO ──────────────────────────────────────────────────────────────
  // Prezzi ingrosso coperture professionali (Callebaut/Belcolade/Domori equiv.)
  "cioccolato fondente":    { costoKg:8.50 },
  "cioccolato dark":        { costoKg:8.50 },
  "copertura fondente":     { costoKg:8.50 },
  "copertura al latte":     { costoKg:7.80 },
  "cioccolato al latte":    { costoKg:7.80 },
  "cioccolato bianco":      { costoKg:9.20 },
  "copertura bianca":       { costoKg:9.20 },
  "cioccolato ruby":        { costoKg:14.00 },
  "cacao in polvere":       { costoKg:9.50 },
  "cacao":                  { costoKg:9.50 },
  "cacao amaro":            { costoKg:9.50 },
  "cacao alcalizzato":      { costoKg:10.00 },
  "cacao olandese":         { costoKg:10.00 },
  "burro di cacao":         { costoKg:22.00 },
  "cioccolato fondente 70%":{ costoKg:9.00 },
  "cioccolato fondente 80%":{ costoKg:9.80 },
  "gocce di cioccolato":    { costoKg:8.80 },
  "chips cioccolato":       { costoKg:8.80 },
  "scaglie di cioccolato":  { costoKg:8.80 },
  "cioccolato domori":      { costoKg:18.00 },

  // ── FRUTTA SECCA & SEMI ──────────────────────────────────────────────────────
  // Prezzi ingrosso sacchi 5-10kg
  "nocciole":               { costoKg:16.00 },
  "nocciole tostate":       { costoKg:17.00 },
  "nocciole intere":        { costoKg:16.00 },
  "granella di nocciole":   { costoKg:16.50 },
  "pasta di nocciole":      { costoKg:18.00 },
  "mandorle":               { costoKg:11.00 },
  "mandorle intere":        { costoKg:11.00 },
  "mandorle pelate":        { costoKg:12.00 },
  "mandorle a lamelle":     { costoKg:12.50 },
  "mandorle a scaglie":     { costoKg:12.50 },
  "pasta di mandorle":      { costoKg:14.00 },
  "marzapane":              { costoKg:10.00 },
  "noci":                   { costoKg:12.50 },
  "noci sgusciate":         { costoKg:12.50 },
  "gherigli di noce":       { costoKg:12.50 },
  "noci pecan":             { costoKg:19.00 },
  "noci macadamia":         { costoKg:22.00 },
  "anacardi":               { costoKg:14.00 },
  "pistacchi":              { costoKg:24.00 },
  "pasta di pistacchi":     { costoKg:32.00 },
  "arachidi":               { costoKg:4.80 },
  "burro di arachidi":      { costoKg:6.50 },
  "pinoli":                 { costoKg:38.00 },
  "uvetta":                 { costoKg:4.80 },
  "uvetta sultanina":       { costoKg:4.80 },
  "uva passa":              { costoKg:4.80 },
  "datteri":                { costoKg:6.50 },
  "prugne secche":          { costoKg:5.50 },
  "albicocche secche":      { costoKg:7.00 },
  "fichi secchi":           { costoKg:5.80 },
  "cranberry":              { costoKg:9.00 },
  "mirtilli secchi":        { costoKg:8.50 },
  "cocco rapé":             { costoKg:4.80 },
  "cocco disidratato":      { costoKg:4.80 },
  "semi di chia":           { costoKg:8.50 },
  "semi di lino":           { costoKg:2.80 },
  "semi di papavero":       { costoKg:10.50 },
  "semi  di papavero":      { costoKg:10.50 },
  "semi di girasole":       { costoKg:2.80 },
  "semi di zucca":          { costoKg:6.50 },
  "semi di sesamo":         { costoKg:5.50 },
  "sesamo":                 { costoKg:5.50 },
  "tahini":                 { costoKg:7.00 },

  // ── OLI & GRASSI ────────────────────────────────────────────────────────────
  "olio di semi":           { costoKg:1.80 },
  "olio di girasole":       { costoKg:1.80 },
  "olio di mais":           { costoKg:2.00 },
  "olio di arachidi":       { costoKg:2.20 },
  "olio di riso":           { costoKg:3.50 },
  "olio extravergine":      { costoKg:5.20 },
  "olio extravergine di oliva":{ costoKg:5.20 },
  "olio di oliva":          { costoKg:4.00 },
  "olio di cocco":          { costoKg:4.50 },
  "margarina":              { costoKg:2.80 },
  "margarina vegetale":     { costoKg:2.80 },
  "strutto":                { costoKg:2.80 },
  "lardo":                  { costoKg:3.20 },
  "shortening":             { costoKg:3.00 },
  "grasso vegetale":        { costoKg:2.80 },

  // ── FRUTTA FRESCA ────────────────────────────────────────────────────────────
  // Prezzi mercato ortofrutticolo Torino (non ingrosso — prezzi normali al dettaglio/piccolo ingrosso)
  "banane":                 { costoKg:1.40 },
  "banana":                 { costoKg:1.40 },
  "banane mature":          { costoKg:1.40 },
  "carote":                 { costoKg:0.90 },
  "carota":                 { costoKg:0.90 },
  "mele":                   { costoKg:1.80 },
  "mela":                   { costoKg:1.80 },
  "mele golden":            { costoKg:1.80 },
  "mele granny smith":      { costoKg:2.00 },
  "mele renette":           { costoKg:2.00 },
  "pere":                   { costoKg:2.00 },
  "fragole":                { costoKg:4.50 },
  "lamponi":                { costoKg:9.00 },
  "mirtilli":               { costoKg:8.00 },
  "more":                   { costoKg:8.00 },
  "amarene":                { costoKg:5.50 },
  "ciliegie":               { costoKg:5.00 },
  "pesche":                 { costoKg:2.50 },
  "albicocche":             { costoKg:2.80 },
  "prugne":                 { costoKg:2.20 },
  "susine":                 { costoKg:2.20 },
  "ananas":                 { costoKg:2.50 },
  "mango":                  { costoKg:4.00 },
  "papaya":                 { costoKg:3.50 },
  "melograno":              { costoKg:3.00 },
  "kiwi":                   { costoKg:2.20 },
  "limone":                 { costoKg:1.80 },
  "limoni":                 { costoKg:1.80 },
  "arancia":                { costoKg:1.50 },
  "arance":                 { costoKg:1.50 },
  "clementine":             { costoKg:2.00 },
  "uva":                    { costoKg:2.50 },
  "fichi":                  { costoKg:4.50 },
  "zucca":                  { costoKg:1.20 },
  "zucchine":               { costoKg:1.80 },
  "rabarbaro":              { costoKg:3.50 },
  // Frutta congelata
  "frutti di bosco surgelati":{ costoKg:4.50 },
  "fragole surgelate":      { costoKg:3.50 },
  "lamponi surgelati":      { costoKg:6.00 },
  "mirtilli surgelati":     { costoKg:5.50 },
  // Frutta in barattolo/confettura
  "confettura":             { costoKg:4.00 },
  "marmellata":             { costoKg:3.80 },
  "confettura di albicocche":{ costoKg:4.00 },
  "confettura di fragole":  { costoKg:4.50 },

  // ── AROMI, SPEZIE & ESTRATTI ─────────────────────────────────────────────────
  // Prezzi ingrosso aromatizzanti professionali
  "vaniglia":               { costoKg:70.00 },
  "bacca di vaniglia":      { costoKg:70.00 },
  "baccello di vaniglia":   { costoKg:70.00 },
  "vaniglia bourbon":       { costoKg:75.00 },
  "vanillina":              { costoKg:28.00 },
  "estratto di vaniglia":   { costoKg:45.00 },
  "estratto vaniglia":      { costoKg:45.00 },
  "pasta di vaniglia":      { costoKg:35.00 },
  "cannella":               { costoKg:16.00 },
  "cannella in polvere":    { costoKg:16.00 },
  "stecca di cannella":     { costoKg:18.00 },
  "cardamomo":              { costoKg:45.00 },
  "zenzero":                { costoKg:8.00 },
  "zenzero in polvere":     { costoKg:12.00 },
  "zenzero fresco":         { costoKg:8.00 },
  "noce moscata":           { costoKg:30.00 },
  "noce moscata in polvere":{ costoKg:30.00 },
  "chiodi di garofano":     { costoKg:25.00 },
  "anice stellato":         { costoKg:22.00 },
  "anice":                  { costoKg:14.00 },
  "curcuma":                { costoKg:12.00 },
  "zafferano":              { costoKg:6000.00 },
  "pepe":                   { costoKg:18.00 },
  "pepe nero":              { costoKg:18.00 },
  "sale":                   { costoKg:0.40 },
  "sale fino":              { costoKg:0.40 },
  "sale grosso":            { costoKg:0.35 },
  "fleur de sel":           { costoKg:12.00 },
  "sale maldon":            { costoKg:15.00 },
  "sale rosa":              { costoKg:3.50 },
  // Scorze e zest
  "zest limone":            { costoKg:3.20 },
  "scorza di limone":       { costoKg:3.20 },
  "buccia di limone":       { costoKg:3.20 },
  "zest arancia":           { costoKg:2.80 },
  "scorza arancia":         { costoKg:2.80 },
  "scorza di arancia":      { costoKg:2.80 },
  "scorza di limone candita":{ costoKg:8.50 },
  "scorza arancia candita": { costoKg:8.50 },
  "frutta candita":         { costoKg:7.00 },
  // Liquori e alcolici (uso pasticceria)
  "rum":                    { costoKg:12.00 },
  "rum scuro":              { costoKg:12.00 },
  "whisky":                 { costoKg:18.00 },
  "amaretto":               { costoKg:10.00 },
  "kirsch":                 { costoKg:14.00 },
  "limoncello":             { costoKg:8.00 },
  "grand marnier":          { costoKg:22.00 },
  "cointreau":              { costoKg:20.00 },
  "brandy":                 { costoKg:10.00 },
  "cognac":                 { costoKg:22.00 },
  "liquore":                { costoKg:10.00 },
  // Aromi artificiali
  "aroma limone":           { costoKg:18.00 },
  "aroma arancia":          { costoKg:18.00 },
  "aroma mandorla":         { costoKg:20.00 },
  "aroma vaniglia":         { costoKg:22.00 },
  "pasta aromatica":        { costoKg:20.00 },
  "pasta al limone":        { costoKg:18.00 },

  // ── ADDENSANTI, GELATINE & STABILIZZANTI ─────────────────────────────────────
  "gelatina":               { costoKg:20.00 },
  "gelatina in fogli":      { costoKg:20.00 },
  "colla di pesce":         { costoKg:20.00 },
  "agar agar":              { costoKg:28.00 },
  "pectina":                { costoKg:22.00 },
  "carragenina":            { costoKg:24.00 },
  "gomma xantana":          { costoKg:18.00 },
  "xantano":                { costoKg:18.00 },
  "amido modificato":       { costoKg:3.50 },
  "instangel":              { costoKg:8.00 },

  // ── CIOCCOLATO E DECORAZIONI ─────────────────────────────────────────────────
  "glassa":                 { costoKg:6.50 },
  "glassa al cioccolato":   { costoKg:8.50 },
  "glassa pronta":          { costoKg:6.50 },
  "fondant":                { costoKg:5.50 },
  "pasta di zucchero":      { costoKg:6.00 },
  "sugar paste":            { costoKg:6.00 },
  "pasta frolla pronta":    { costoKg:4.50 },
  "sfoglia pronta":         { costoKg:5.00 },
  "pasta sfoglia":          { costoKg:5.00 },
  "croccante":              { costoKg:8.00 },
  "pralinato":              { costoKg:14.00 },
  "pralinato nocciole":     { costoKg:15.00 },
  "pralinato mandorle":     { costoKg:13.00 },
  "feuilletine":            { costoKg:9.00 },
  "cereali soffiati":       { costoKg:5.00 },
  "riso soffiato":          { costoKg:5.50 },
  "fiocchi d'avena":        { costoKg:1.80 },
  "avena":                  { costoKg:1.80 },
  "fiocchi di avena":       { costoKg:1.80 },
  "granola":                { costoKg:4.50 },
  "biscotti sbriciolati":   { costoKg:4.00 },
  "biscotti digestive":     { costoKg:3.80 },
  "corn flakes":            { costoKg:3.50 },
  "colorante alimentare":   { costoKg:35.00 },
  "colorante rosso":        { costoKg:35.00 },
  "colorante gel":          { costoKg:38.00 },
  "oro alimentare":         { costoKg:450.00 },
  "argento alimentare":     { costoKg:280.00 },
  "zucchero granella":      { costoKg:3.50 },
  "zucchero perle":         { costoKg:8.00 },
  "codette":                { costoKg:7.50 },
  "diavoletti":             { costoKg:7.00 },
  "perle di cioccolato":    { costoKg:9.00 },

  // ── ALTRO ─────────────────────────────────────────────────────────────────────
  "acqua":                  { costoKg:0.00 },
  "acqua di rose":          { costoKg:8.00 },
  "acqua di fiori d'arancio":{ costoKg:10.00 },
  "aceto di mele":          { costoKg:3.50 },
  "aceto balsamico":        { costoKg:12.00 },
  "caffè":                  { costoKg:14.00 },
  "caffè espresso":         { costoKg:14.00 },
  "caffè solubile":         { costoKg:22.00 },
  "tè":                     { costoKg:18.00 },
  "the matcha":             { costoKg:55.00 },
  "matcha":                 { costoKg:55.00 },
  "succo di limone":        { costoKg:2.50 },
  "succo limone":           { costoKg:2.50 },
  "succo di arancia":       { costoKg:2.00 },
  "succo d'arancia":        { costoKg:2.00 },
  "lievito madre essiccato":{ costoKg:12.00 },
  "lievito essiccato":      { costoKg:22.00 },
  "amido":                  { costoKg:1.70 },
  "fecola patate":          { costoKg:1.90 },

  // ── INTEGRAZIONI (solo voci non già presenti sopra) ──────────────────────────
  "seme di papavero":       { costoKg:8.50 },
  "papavero":               { costoKg:8.50 },
  "semi papavero":          { costoKg:8.50 },
  "peperoncino":            { costoKg:12.00 },
  "pasta di cacao":         { costoKg:18.00 },
  "massa di cacao":         { costoKg:18.00 },
  "cacao massa":            { costoKg:18.00 },
  "domori":                 { costoKg:22.00 },
  "cocco rapè":             { costoKg:5.50 },
  "cocco grattugiato":      { costoKg:5.50 },
  "trimolina":              { costoKg:3.50 },
  "sciroppo d'agave":       { costoKg:5.00 },
  "agave":                  { costoKg:5.00 },
  "xilitolo":               { costoKg:6.00 },
  "eritritolo":             { costoKg:7.50 },
  "inulina":                { costoKg:8.00 },
  "lecitina di soia":       { costoKg:8.00 },
  "lecitina di girasole":   { costoKg:9.00 },
  "gelatina alimentare":    { costoKg:25.00 },
  "gomma di xantano":       { costoKg:20.00 },
  "albicocca":              { costoKg:4.50 },
  "albicocca secca":        { costoKg:9.00 },
  "fico secco":             { costoKg:8.00 },
  "uva sultanina":          { costoKg:5.50 },
  "mirtillo essiccato":     { costoKg:18.00 },
  "mirtillo rosso essiccato":{ costoKg:20.00 },
  "frutta mista candita":   { costoKg:6.00 },
  "canditi":                { costoKg:6.00 },
  "ciliegie candite":       { costoKg:8.00 },
  "crema di nocciole":      { costoKg:12.00 },
  "nutella":                { costoKg:7.50 },
  "crema spalmabile":       { costoKg:7.50 },
  "miele acacia":           { costoKg:11.00 },
  "pasta di sesamo":        { costoKg:9.00 },
  "burro di mandorle":      { costoKg:18.00 },
  "tofu":                   { costoKg:3.50 },
  "aquafaba":               { costoKg:0.50 },
  "farina avena":           { costoKg:2.20 },
  "farina avena integrale": { costoKg:2.40 },
  "crusca di frumento":     { costoKg:1.20 },
  "crusca d'avena":         { costoKg:2.00 },
  "germe di grano":         { costoKg:3.50 },
  "proteine del siero":     { costoKg:25.00 },
  "whey protein":           { costoKg:25.00 },
  "cacao amaro in polvere": { costoKg:10.00 },
  "cioccolato bianco callebaut":{ costoKg:12.00 },
  "caramello salato":       { costoKg:9.00 },
  "caramello":              { costoKg:7.00 },
  "toffee":                 { costoKg:9.00 },
  "crema pasticcera":       { costoKg:3.00 },
  "crema chantilly":        { costoKg:5.00 },
  "ricotta di mucca":       { costoKg:4.50 },
  "ricotta di pecora":      { costoKg:7.00 },
  "grana padano":           { costoKg:12.00 },
  "parmigiano":             { costoKg:14.00 },
};
// Normalizza nomi ingredienti: unifica singolare/plurale e varianti comuni
// es. "albumi" -> "albume", "tuorli" -> "tuorlo", "banane" -> "banana", ecc.
const SING_PLUR = [
  // forma plurale -> forma singolare canonica
  ["albumi","albume"],["tuorli","tuorlo"],["uova","uovo"],
  ["banane","banana"],["carote","carota"],["mele","mela"],
  ["pere","pera"],["fragole","fragola"],["lamponi","lampone"],
  ["mirtilli","mirtillo"],["more","mora"],["ciliegie","ciliegia"],
  ["pesche","pesca"],["albicocche","albicocca"],["prugne","prugna"],["susine","susina"],
  ["fichi","fico"],["limoni","limone"],["arance","arancia"],["noci","noce"],
  ["mandorle","mandorla"],["nocciole","nocciola"],["pistacchi","pistacchio"],
  ["pinoli","pinolo"],["datteri","dattero"],["anacardi","anacardo"],
  ["arachidi","arachide"],["fiocchi di avena","fiocco di avena"],
  ["semi di chia","seme di chia"],["semi di lino","seme di lino"],
  ["semi di girasole","seme di girasole"],["semi di zucca","seme di zucca"],
  ["semi di sesamo","seme di sesamo"],["semi di papavero","seme di papavero"],
  ["semi  di papavero","seme di papavero"],
  ["semi di papavero","seme di papavero"],
  ["papavero","seme di papavero"],
  ["scorze di limone","scorza di limone"],
  ["cioccolato domori 64%","cioccolato domori"],
  ["cioccolato fondente 64%","cioccolato domori"],
  ["cioccolato fondente 72%","cioccolato fondente"],
  ["cioccolato 70%","cioccolato fondente"],
  ["cocco rapè","cocco rapè"],
  ["latte di cocco","cocco disidratato"],["scorze di arancia","scorza di arancia"],
  ["bacche di vaniglia","bacca di vaniglia"],
  ["chiodi di garofano","chiodo di garofano"],
  ["stecche di cannella","stecca di cannella"],
  ["biscotti","biscotto"],["cereali soffiati","cereale soffiato"],
  ["gocce di cioccolato","goccia di cioccolato"],
  ["scaglie di cioccolato","scaglia di cioccolato"],
  ["chips cioccolato","chips cioccolato"],
  ["zucchine","zucchina"],["carote","carota"],
];
// Mappa plurale->singolare costruita dalla lista
const _NORM_MAP = new Map(SING_PLUR.map(([pl,sg])=>[pl,sg]));
function normIng(nome) {
  const k = nome.toLowerCase().trim().replace(/\s+/g," ");
  return _NORM_MAP.get(k) || k;
}

// ── EN→IT: product name mapping (for OCR of English-language photos/menus) ──
const EN_IT_PRODOTTI = {
  "carrot cake":         "TORTA DI CAROTE",
  "carrot":              "TORTA DI CAROTE",
  "banana bread":        "BANANA BREAD",
  "banana loaf":         "BANANA BREAD",
  "apple cake":          "TORTA DI MELE",
  "apple pie":           "TORTA DI MELE",
  "poppy seed cake":     "POPPY SEEDS",
  "poppy seeds cake":    "POPPY SEEDS",
  "poppy":               "POPPY SEEDS",
  "lemon coconut":       "LIMONE E COCCO",
  "lemon and coconut":   "LIMONE E COCCO",
  "domori":              "DOMORI",
  "chocolate cake":      "DOMORI",
  "dark chocolate":      "DOMORI",
  "cookies":             "COOKIES",
  "shortbread":          "COOKIES",
  "custard":             "CREMA PASTICCERA",
  "pastry cream":        "CREMA PASTICCERA",
  "fruit tart":          "CROSTATA ALLA FRUTTA",
  "tart":                "CROSTATA",
  "fruit":               "FRUIT PER CROSTATE",
  "fruit filling":       "FRUIT PER CROSTATE",
  "fruit curd":          "FRUIT PER CROSTATE",
  "pastry dough":        "PASTA FROLLA",
  "shortcrust":          "PASTA FROLLA",
  "shortcrust pastry":   "PASTA FROLLA",
};

// ── EN→IT: ingredient name mapping ───────────────────────────────────────────
const EN_IT_INGREDIENTI = {
  "flour":              "farina 00",
  "all purpose flour":  "farina 00",
  "cake flour":         "farina 00",
  "bread flour":        "farina manitoba",
  "whole wheat flour":  "farina integrale",
  "almond flour":       "farina di mandorle",
  "coconut flour":      "farina di cocco",
  "rice flour":         "farina di riso",
  "butter":             "burro",
  "unsalted butter":    "burro",
  "salted butter":      "burro",
  "eggs":               "uovo",
  "egg":                "uovo",
  "egg yolks":          "tuorlo",
  "egg whites":         "albume",
  "egg yolk":           "tuorlo",
  "egg white":          "albume",
  "sugar":              "zucchero",
  "caster sugar":       "zucchero semolato",
  "powdered sugar":     "zucchero a velo",
  "brown sugar":        "zucchero di canna",
  "icing sugar":        "zucchero a velo",
  "milk":               "latte intero",
  "whole milk":         "latte intero",
  "cream":              "panna fresca",
  "heavy cream":        "panna fresca",
  "whipping cream":     "panna fresca",
  "sour cream":         "panna acida",
  "baking powder":      "lievito chimico",
  "baking soda":        "bicarbonato",
  "vanilla":            "estratto di vaniglia",
  "vanilla extract":    "estratto di vaniglia",
  "vanilla bean":       "bacca di vaniglia",
  "cocoa":              "cacao amaro in polvere",
  "cocoa powder":       "cacao amaro in polvere",
  "dark chocolate":     "cioccolato fondente",
  "milk chocolate":     "cioccolato al latte",
  "white chocolate":    "cioccolato bianco",
  "chocolate chips":    "gocce di cioccolato",
  "oil":                "olio di semi",
  "vegetable oil":      "olio di semi",
  "olive oil":          "olio extravergine",
  "honey":              "miele",
  "maple syrup":        "sciroppo d'acero",
  "salt":               "sale",
  "cinnamon":           "cannella in polvere",
  "nutmeg":             "noce moscata",
  "ginger":             "zenzero in polvere",
  "lemon zest":         "scorza di limone",
  "orange zest":        "scorza di arancia",
  "lemon juice":        "succo di limone",
  "orange juice":       "succo di arancia",
  "walnuts":            "noce",
  "almonds":            "mandorla",
  "hazelnuts":          "nocciola",
  "pistachios":         "pistacchio",
  "raisins":            "uvetta",
  "oats":               "fiocchi d'avena",
  "rolled oats":        "fiocchi d'avena",
  "poppy seeds":        "seme di papavero",
  "carrots":            "carota",
  "bananas":            "banana",
  "apples":             "mela",
  "pears":              "pera",
  "strawberries":       "fragola",
  "blueberries":        "mirtillo",
  "raspberries":        "lampone",
  "yogurt":             "yogurt greco",
  "greek yogurt":       "yogurt greco",
  "mascarpone":         "mascarpone",
  "ricotta":            "ricotta",
  "cream cheese":       "cream cheese",
  "cornstarch":         "amido di mais",
  "corn starch":        "amido di mais",
  "potato starch":      "fecola patate",
  "gelatin":            "gelatina alimentare",
  "glucose syrup":      "sciroppo di glucosio",
  "rum":                "rum",
  "brandy":             "cognac",
  "coffee":             "caffè",
  "espresso":           "caffè espresso",
};

// Traduce un nome prodotto EN→IT (case-insensitive)
function translateProdottoEN(nome) {
  if (!nome) return nome;
  const k = nome.toLowerCase().trim();
  return EN_IT_PRODOTTI[k] || nome.toUpperCase();
}

// Traduce un nome ingrediente EN→IT (case-insensitive)
function translateIngredienteEN(nome) {
  if (!nome) return nome;
  const k = nome.toLowerCase().trim();
  return EN_IT_INGREDIENTI[k] || nome;
}

function buildIngCosti(fromFile) {
  const fc = fromFile || {};
  const out = {};
  for (const [k,v] of Object.entries(PREZZI_HORECA))
    out[k] = { costoKg:v.costoKg, costoG:parseFloat((v.costoKg/1000).toFixed(6)), isStima:true };
  for (const [k,v] of Object.entries(fc))
    if (v.costoG > 0) out[normIng(k)] = { costoKg:v.costoKg, costoG:v.costoG, isStima:false };
  return out;
}
function calcolaFC(ricetta, ingCosti, ricettario, _depth) {
  const depth = _depth||0;
  const SKIP_ING = ["ingrediente","ingredient","ingredienti","n/d","nan","undefined","nome ingrediente in minuscolo",""];
  let tot=0, mancanti=[];
  for (const ing of (ricetta.ingredienti||[])) {
    const nomeNorm = normIng((ing.nome||"").toLowerCase().trim());
    if (SKIP_ING.includes(nomeNorm)) continue;
    const qty = ing.qty1stampo || 0;
    if (!qty) continue;

    // Check if ingredient is a semilavorato (recursive, max 3 levels)
    if (depth < 3 && ricettario) {
      const semiKey = Object.keys(ricettario.ricette||{}).find(k => {
        const r = ricettario.ricette[k];
        if (r.tipo !== "semilavorato") return false;
        return normIng(k.toLowerCase()) === nomeNorm ||
               normIng((r.nome||"").toLowerCase()) === nomeNorm;
      });
      if (semiKey) {
        const semiRic = ricettario.ricette[semiKey];
        const { tot: semiTot } = calcolaFC(semiRic, ingCosti, ricettario, depth+1);
        // Peso totale semilavorato = somma qty ingredienti (approssimazione resa 1:1)
        const semiPeso = (semiRic.ingredienti||[]).reduce((s,i)=>s+(i.qty1stampo||0), 0);
        const costoG = semiPeso > 0 ? semiTot / semiPeso : 0;
        tot += qty * costoG;
        continue;
      }
    }

    const c = ingCosti[normIng(ing.nome)];
    if (!c) { mancanti.push(ing.nome); continue; }
    tot += qty * c.costoG;
  }
  return { tot:parseFloat(tot.toFixed(3)), mancanti };
}

// ─── REGOLE VENDITA ───────────────────────────────────────────────────────────
const NOMI_SKIP = ["nome ricetta", "nan", "undefined", "ricetta", "pasticceria", "gelato", "bibite", "bar", "altro", "categoria", "totale", "sconto", "subtotale"];
const isRicettaValida = nome => nome && !NOMI_SKIP.includes(String(nome).trim().toLowerCase());

const REGOLE = {
  "TORTA DI CAROTE":  { unita:8,  prezzo:5,   tipo:"fetta" },
  "LIMONE E COCCO":   { unita:8,  prezzo:5,   tipo:"fetta" },
  "BANANA BREAD":     { unita:11, prezzo:4,   tipo:"fetta" },
  "DOMORI":           { unita:8,  prezzo:4,   tipo:"fetta" },
  "TORTA DI MELE":    { unita:8,  prezzo:4,   tipo:"fetta" },
  "POPPY SEEDS":      { unita:8,  prezzo:4,   tipo:"fetta" },
  "COOKIES":          { unita:50, prezzo:1.5, tipo:"pezzo" },
  "CREMA PASTICCERA":    { unita:0, prezzo:0, tipo:"semilavorato" },
  "GANACHE VEGANA":      { unita:0, prezzo:0, tipo:"semilavorato" },
  "FRUIT PER CROSTATE":  { unita:0, prezzo:0, tipo:"semilavorato" },
  "PASTA FROLLA":        { unita:0, prezzo:0, tipo:"semilavorato" },
};
const getR = (nome, ricetta) => {
  if (REGOLE[nome]) return REGOLE[nome];
  // Ricette manuali: leggi da dentro l'oggetto ricetta se presente
  if (ricetta?.unita != null) return { unita:ricetta.unita||0, prezzo:ricetta.prezzo||0, tipo:ricetta.tipo||"fetta" };
  return { unita:8, prezzo:4, tipo:"fetta" };
};
const isSemilavorato = (nome, ricettario) => {
  if (!ricettario) return false;
  const ric = ricettario.ricette?.[nome] || ricettario.ricette?.[nome?.toUpperCase()];
  if (ric) return ric.tipo === "semilavorato" || getR(nome, ric).tipo === "semilavorato";
  return false;
};

// ─── STORAGE ──────────────────────────────────────────────────────────────────
const SK_RIC="pasticceria-ricettario-v1", SK_PROD="pasticceria-produzione-v1", SK_ACT="pasticceria-actions-v1", SK_AI="pasticceria-ai-v1";
const SK_MAG="pasticceria-magazzino-v1", SK_GIOR="pasticceria-giornaliero-v1", SK_CHIUS="pasticceria-chiusure-v1", SK_EXCL="pasticceria-esclusi-v1";
// sload/ssave are imported from ./lib/storage and injected in Dashboard props

// ─── MONTH HELPERS ────────────────────────────────────────────────────────────
const MN = ["","Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const mKey   = (m,y) => `${y}-${String(m).padStart(2,"0")}`;
const mLabel = (m,y) => `${MN[m]} ${y}`;

// ─── METEO ────────────────────────────────────────────────────────────────────
const METEO_FB = {"2025-12":{tempMean:3.9,giorniSole:2,giorniPioggia:8},"2026-01":{tempMean:1.6,giorniSole:12,giorniPioggia:11},"2026-02":{tempMean:4.6,giorniSole:12,giorniPioggia:9}};
async function fetchMeteo(m,y) {
  const k=`${y}-${String(m).padStart(2,"0")}`;
  if (METEO_FB[k]) return METEO_FB[k];
  try {
    const pad=n=>String(n).padStart(2,"0"), last=new Date(y,m,0).getDate();
    const url=`https://archive-api.open-meteo.com/v1/archive?latitude=45.0703&longitude=7.6869&start_date=${y}-${pad(m)}-01&end_date=${y}-${pad(m)}-${last}&daily=temperature_2m_mean,precipitation_sum,sunshine_duration&timezone=Europe/Rome`;
    const r=await fetch(url); if(!r.ok) return null;
    const d=await r.json(); if(!d.daily) return null;
    const avg=a=>a.filter(v=>v!=null).reduce((s,v)=>s+v,0)/a.filter(v=>v!=null).length;
    return {tempMean:parseFloat(avg(d.daily.temperature_2m_mean).toFixed(1)),giorniSole:d.daily.sunshine_duration.filter(v=>v>21600).length,giorniPioggia:d.daily.precipitation_sum.filter(v=>v>1).length};
  } catch { return null; }
}

// ─── AI ───────────────────────────────────────────────────────────────────────
const _aiCache = {};
async function getAI(prompt, key, sload, ssave) {
  if (_aiCache[key]) return _aiCache[key];
  try { const c=await sload(SK_AI); if(c?.[key]){_aiCache[key]=c[key];return c[key];} } catch {}
  const sys=`Sei il migliore consulente al mondo di pasticcerie artigianali italiane. Rispondi SOLO in JSON valido:
{"sintesi":"<2 frasi con numeri chiave>","alert":"<1 frase su cosa ottimizzare>","azioni":[{"titolo":"<3 parole>","desc":"<1 frase concreta>"},{"titolo":"<3 parole>","desc":"<1 frase concreta>"},{"titolo":"<3 parole>","desc":"<1 frase concreta>"}]}
Niente markdown, niente testo fuori dal JSON.`;
  try {
    const r=await fetch("/api/ai",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:500,system:sys,messages:[{role:"user",content:prompt}]})});
    const d=await r.json();
    const raw=d.content?.find(b=>b.type==="text")?.text||"{}";
    let obj; try{obj=JSON.parse(raw.replace(/```json|```/g,"").trim());}catch{obj={sintesi:raw,alert:"",azioni:[]};}
    _aiCache[key]=obj;
    const all={...(await sload(SK_AI)||{}),[key]:obj};
    await ssave(SK_AI,all);
    return obj;
  } catch { return {sintesi:"Analisi non disponibile.",alert:"",azioni:[]}; }
}

// ─── DESIGN ───────────────────────────────────────────────────────────────────
const C = {
  bg:"#F8FAFC", bgCard:"#FFFFFF", bgSide:"#1A0A0A",
  border:"#E2E8F0", borderStr:"#CBD5E1",
  red:"#C0392B", redDark:"#922B21", redLight:"#FEF2F2",
  green:"#16A34A", greenLight:"#F0FDF4",
  amber:"#D97706", amberLight:"#FFFBEB",
  text:"#0F172A", textMid:"#475569", textSoft:"#94A3B8",
  white:"#FFFFFF",
};
const fmt  = v => `€ ${Number(v).toFixed(2)}`;
const fmtp = v => `${Number(v).toFixed(1)}%`;
const PIE_COLORS = [C.red,"#E07040","#D4A030","#5B8FCE","#7B7B7B","#A0522D"];

// ─── PRIMITIVES ───────────────────────────────────────────────────────────────
const ChartTip = ({active,payload,label}) => {
  if (!active||!payload?.length) return null;
  return (
    <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",fontSize:11,boxShadow:"0 4px 16px rgba(0,0,0,0.08)"}}>
      <div style={{fontWeight:700,color:C.text,marginBottom:4}}>{label}</div>
      {payload.map((p,i)=><div key={i} style={{color:p.color||C.red}}>{p.name}: <b>{p.value}</b></div>)}
    </div>
  );
};

function Badge({label,color="green"}) {
  const s={green:{bg:C.greenLight,c:C.green},red:{bg:C.redLight,c:C.red},amber:{bg:C.amberLight,c:C.amber},gray:{bg:"#F3F3F3",c:"#888"}}[color]||{bg:"#F3F3F3",c:"#888"};
  return <span style={{background:s.bg,color:s.c,fontSize:10,fontWeight:600,padding:"3px 8px",borderRadius:12,letterSpacing:"0.04em",textTransform:"uppercase",whiteSpace:"nowrap"}}>{label}</span>;
}
const margBadge = pct => {
  if (pct===null||pct===undefined) return null;
  if (pct>=70) return <Badge label="Eccellente" color="green"/>;
  if (pct>=55) return <Badge label="Buono" color="green"/>;
  if (pct>=40) return <Badge label="Accettabile" color="amber"/>;
  return <Badge label="Basso — rivedere" color="red"/>;
};
const margColor = pct => pct>=60?C.green:pct>=40?C.amber:C.red;

// Global table cell primitives used by PLTable, SensTable and PLView
const TD = ({children,right,bold,color,mono,small}) => (
  <td style={{padding:"10px 14px",textAlign:right?"right":"left",fontWeight:bold?800:500,
    color:color||C.text,fontFamily:mono?"Georgia,serif":"inherit",fontSize:small?10:11,
    whiteSpace:"nowrap"}}>{children}</td>
);
const TH = ({children,right}) => (
  <th style={{padding:"10px 14px",textAlign:right?"right":"left",fontSize:8,fontWeight:700,
    letterSpacing:"0.07em",textTransform:"uppercase",color:C.textSoft,
    borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{children}</th>
);

function SH({children,sub}) {
  return (
    <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:16,marginTop:36}}>
      <div style={{width:3,height:18,background:C.red,borderRadius:2,flexShrink:0,alignSelf:"center"}}/>
      <div>
        <h2 style={{margin:0,fontSize:14,fontWeight:800,color:C.text,letterSpacing:"-0.01em"}}>{children}</h2>
        {sub && <div style={{fontSize:11,color:C.textSoft,marginTop:2}}>{sub}</div>}
      </div>
    </div>
  );
}

function KPI({label,value,sub,color,highlight,icon}) {
  return (
    <div style={{background:highlight?C.red:C.bgCard,border:`1px solid ${highlight?C.redDark:C.border}`,borderRadius:10,padding:"16px 18px",boxShadow:highlight?"0 2px 8px rgba(192,57,43,0.2)":"0 1px 3px rgba(0,0,0,0.04)"}}>
      <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:highlight?"rgba(255,255,255,0.55)":C.textSoft,marginBottom:4}}>{icon&&<span style={{marginRight:5}}>{icon}</span>}{label}</div>
      <div style={{fontSize:22,fontWeight:900,fontFamily:"Georgia,serif",color:highlight?C.white:color||C.text,letterSpacing:"-0.02em",lineHeight:1.1}}>{value}</div>
      {sub && <div style={{fontSize:10,color:highlight?"rgba(255,255,255,0.5)":C.textSoft,marginTop:4}}>{sub}</div>}
    </div>
  );
}

// ─── TORTA CARD ───────────────────────────────────────────────────────────────
function TortaCard({ric,ingCosti,ricettario,onUpdateRegola}) {
  const [open,setOpen]         = useState(false);
  const [editMode,setEditMode] = useState(false);
  const reg = getR(ric.nome, ric);
  if (reg.tipo==="interno") return null;

  const [editPrezzo, setEditPrezzo] = useState(reg.prezzo);
  const [editUnita,  setEditUnita]  = useState(reg.unita);

  const handleSaveRegola = () => {
    const p = parseFloat(editPrezzo)||reg.prezzo;
    const u = parseInt(editUnita)||reg.unita;
    REGOLE[ric.nome] = { ...reg, prezzo:p, unita:u };
    onUpdateRegola(ric.nome, { prezzo:p, unita:u });
    setEditMode(false);
  };

  const {tot:fc, mancanti} = calcolaFC(ric, ingCosti, ricettario);
  const ricavo   = parseFloat((reg.unita * reg.prezzo).toFixed(2));
  const margine  = parseFloat((ricavo - fc).toFixed(2));
  const margPct  = ricavo>0 ? (margine/ricavo*100) : 0;
  const fcUnita  = reg.unita>0 ? fc/reg.unita : 0;
  const mrgUnita = reg.prezzo - fcUnita;
  const mc = margColor(margPct);
  const mbg = margPct>=60?C.greenLight:margPct>=40?C.amberLight:C.redLight;

  const ING_SKIP_DISPLAY = ["ingrediente","ingredient","ingredienti","n/d","nan","undefined","nome ingrediente in minuscolo"];
  const ingList = (ric.ingredienti||[])
    .filter(ing => !ING_SKIP_DISPLAY.includes(normIng(ing.nome||"").toLowerCase().trim()))
    .map(ing => {
      const c = ingCosti[normIng(ing.nome)];
      const costoCalc = c ? parseFloat((ing.qty1stampo * c.costoG).toFixed(3)) : 0;
      return {...ing, costoCalc, costoPerGCalc:c?.costoG||0, pct:fc>0?(costoCalc/fc*100):0, isStima:c?.isStima||false, mancante:!c};
    }).sort((a,b)=>b.costoCalc-a.costoCalc);

  const pieRaw = ingList.filter(i=>i.costoCalc>0).slice(0,5);
  const resto = fc - pieRaw.reduce((s,i)=>s+i.costoCalc,0);
  const pieData = [...pieRaw, ...(resto>0.01?[{nome:"Altri",costoCalc:parseFloat(resto.toFixed(3))}]:[])];

  return (
    <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:14,overflow:"hidden",boxShadow:"0 1px 6px rgba(0,0,0,0.05)",transition:"box-shadow 0.2s"}}>
      {/* Header */}
      <div style={{padding:"18px 24px",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16,borderBottom:open?`1px solid ${C.border}`:"none"}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:6}}>
            <h3 style={{margin:0,fontSize:17,fontWeight:900,color:C.text,letterSpacing:"-0.02em"}}>{ric.nome}</h3>
            <Tip text={`Margine lordo: ${fmtp(margPct)}. Verde ≥ 60%, giallo 40–60%, rosso < 40%. Calcolato su ricavo ${fmt(ricavo)} − food cost ${fmt(fc)}.`} width={260}>{margBadge(margPct)}</Tip>
            {mancanti.length>0 && <Tip text="Alcuni ingredienti non hanno un prezzo reale: il food cost è calcolato su stime HoReCa Torino. Carica il file prezzi per valori precisi." width={280}><Badge label={`${mancanti.length} prezzi stimati`} color="amber"/></Tip>}
          </div>
          <div style={{fontSize:11,color:C.textSoft}}>
            {reg.unita} {reg.tipo==="fetta"?"fette":"pezzi"} × {fmt(reg.prezzo)}{ric.totImpasto1>0?` · ${ric.totImpasto1}g impasto`:""}
          </div>
        </div>
        {/* Mini P&L inline */}
        <div style={{display:"flex",gap:2,alignItems:"stretch",flexShrink:0}}>
          {[
            {lbl:"Ricavo",val:fmt(ricavo),c:C.text,bg:"#F8F4F2",tip:`Ricavo per stampo = ${reg.unita} ${reg.tipo==="fetta"?"fette":"pezzi"} × ${fmt(reg.prezzo)}. Massimo incassabile se si vende tutto.`},
            {lbl:"Food Cost",val:fmt(fc),c:C.red,bg:C.redLight,tip:`Costo totale ingredienti per produrre uno stampo. Non include lavoro né costi fissi.`},
            {lbl:"Margine",val:fmt(margine),c:mc,bg:mbg,bold:true,tip:`Margine lordo = Ricavo ${fmt(ricavo)} − Food cost ${fmt(fc)}. Prima di affitto, lavoro e altri costi fissi.`},
            {lbl:"Margine %",val:fmtp(margPct),c:mc,bg:mbg,bold:true,tip:`Percentuale di margine sul ricavo. Verde ≥ 60%, giallo 40–60%, rosso < 40%. Target artigianale: 70%.`},
          ].map(({lbl,val,c,bg,bold,tip},i)=>(
            <Tip key={i} text={tip} width={240}>
            <div style={{background:bg,padding:"8px 14px",borderRadius:8,textAlign:"center",minWidth:80,cursor:"help"}}>
              <div style={{fontSize:8,fontWeight:600,letterSpacing:"0.07em",textTransform:"uppercase",color:C.textSoft,marginBottom:3}}>{lbl}</div>
              <div style={{fontSize:13,fontWeight:bold?900:700,color:c,fontFamily:"Georgia,serif"}}>{val}</div>
            </div>
            </Tip>
          ))}
        </div>
        <button onClick={()=>setOpen(o=>!o)}
          style={{padding:"7px 14px",borderRadius:7,border:`1px solid ${C.borderStr}`,background:"transparent",fontSize:11,fontWeight:700,color:C.textMid,cursor:"pointer",flexShrink:0,alignSelf:"center"}}>
          {open?"▲ Chiudi":"▼ Apri dettaglio"}
        </button>
        <button onClick={()=>{setEditPrezzo(reg.prezzo);setEditUnita(reg.unita);setEditMode(e=>!e);}}
          style={{padding:"7px 12px",borderRadius:7,border:`1px solid ${editMode?C.red:C.borderStr}`,background:editMode?C.redLight:"transparent",fontSize:11,fontWeight:700,color:editMode?C.red:C.textMid,cursor:"pointer",flexShrink:0,alignSelf:"center"}}>
          ✏️ Prezzo
        </button>
        <button onClick={()=>exportRicettaPDF(ric, {tot:fc,perc:ricavo>0?fc/ricavo*100:0})}
          style={{padding:"7px 12px",borderRadius:7,border:`1px solid ${C.borderStr}`,background:"transparent",fontSize:11,fontWeight:700,color:C.textMid,cursor:"pointer",flexShrink:0,alignSelf:"center"}}>
          📄 PDF
        </button>
      </div>

      {/* Edit prezzo/fette inline */}
      {editMode && (
        <div style={{padding:"14px 24px",background:"#FFF8F7",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
          <div style={{fontSize:11,fontWeight:700,color:C.text}}>Modifica prezzo di vendita e numero {reg.tipo==="fetta"?"fette":"pezzi"}:</div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <label style={{fontSize:10,fontWeight:700,color:C.textSoft,textTransform:"uppercase",letterSpacing:"0.07em"}}>{reg.tipo==="fetta"?"N° fette":"N° pezzi"}</label>
            <input type="number" min="1" max="100" value={editUnita} onChange={e=>setEditUnita(e.target.value)}
              style={{width:64,padding:"6px 8px",borderRadius:6,border:`1px solid ${C.borderStr}`,fontSize:12,fontWeight:700,color:C.text,textAlign:"center"}}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <label style={{fontSize:10,fontWeight:700,color:C.textSoft,textTransform:"uppercase",letterSpacing:"0.07em"}}>Prezzo € / {reg.tipo==="fetta"?"fetta":"pezzo"}</label>
            <input type="number" min="0" step="0.1" value={editPrezzo} onChange={e=>setEditPrezzo(e.target.value)}
              style={{width:72,padding:"6px 8px",borderRadius:6,border:`1px solid ${C.borderStr}`,fontSize:12,fontWeight:700,color:C.text,textAlign:"center"}}/>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"6px 12px",background:C.white,borderRadius:7,border:`1px solid ${C.border}`}}>
            <span style={{fontSize:10,color:C.textSoft}}>Ricavo stimato:</span>
            <span style={{fontSize:13,fontWeight:900,color:C.green,fontFamily:"Georgia,serif"}}>{fmt((parseFloat(editPrezzo)||0)*(parseInt(editUnita)||0))}</span>
          </div>
          {/* Toggle congelabile */}
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:ric.congelabile?"#EEF8FF":"#F8F4F2",borderRadius:7,border:`1px solid ${ric.congelabile?"#BDE":"#E8E0DC"}`,cursor:"pointer"}}
            onClick={()=>onUpdateRegola(ric.nome,{prezzo:parseFloat(editPrezzo)||reg.prezzo, unita:parseInt(editUnita)||reg.unita, congelabile:!ric.congelabile})}>
            <div style={{width:30,height:17,borderRadius:9,background:ric.congelabile?"#2980B9":"#C8B8B4",position:"relative",flexShrink:0,transition:"background 0.2s"}}>
              <div style={{position:"absolute",top:2,left:ric.congelabile?15:2,width:13,height:13,borderRadius:7,background:"#FFF",transition:"left 0.2s",boxShadow:"0 1px 2px rgba(0,0,0,0.2)"}}/>
            </div>
            <span style={{fontSize:10,fontWeight:700,color:ric.congelabile?"#2980B9":C.textMid}}>❄ {ric.congelabile?"Congelabile":"Non congelabile"}</span>
          </div>
          <div style={{display:"flex",gap:8,marginLeft:"auto"}}>
            <button onClick={()=>setEditMode(false)} style={{padding:"7px 14px",borderRadius:7,border:`1px solid ${C.borderStr}`,background:"transparent",fontSize:11,fontWeight:700,color:C.textMid,cursor:"pointer"}}>Annulla</button>
            <button onClick={handleSaveRegola} style={{padding:"7px 18px",borderRadius:7,border:"none",background:C.red,color:C.white,fontSize:11,fontWeight:800,cursor:"pointer"}}>💾 Salva</button>
          </div>
        </div>
      )}

      {/* Dettaglio */}
      {open && (
        <div style={{padding:"24px 24px 28px",display:"grid",gridTemplateColumns:"1.1fr 0.9fr",gap:28}}>

          {/* SINISTRA: tabella ingredienti */}
          <div>
            <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:12}}>
              🧾 Distinta costi — ingrediente per ingrediente
            </div>
            <div style={{border:`1px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead>
                  <tr style={{background:"#F8F4F2"}}>
                    {[
                      {h:"Ingrediente",tip:"Nome dell'ingrediente così come appare nella ricetta."},
                      {h:"g / stampo",tip:"Grammatura usata per produrre uno stampo completo."},
                      {h:"€ / g",tip:"Prezzo per grammo secondo il listino HoReCa Torino. 'Stima' = prezzo stimato, non verificato."},
                      {h:"Costo €",tip:"Costo totale di questo ingrediente per uno stampo = g × €/g."},
                      {h:"Incidenza su FC",tip:"Quota percentuale di questo ingrediente sul food cost totale dello stampo. Rosso > 30%, arancio > 15%."},
                    ].map(({h,tip},i)=>(
                      <th key={i} style={{padding:"8px 10px",textAlign:i===0?"left":"right",fontSize:8,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",color:C.textSoft,borderBottom:`1px solid ${C.border}`,cursor:"help"}}>
                        <Tip text={tip} width={230}><span style={{borderBottom:"1px dashed rgba(155,120,115,0.4)"}}>{h}</span></Tip>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ingList.map((ing,i)=>(
                    <tr key={i} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:"#FDFAF7"}}>
                      <td style={{padding:"8px 10px",fontWeight:600,color:C.text}}>
                        {ing.nome}
                        {ing.isStima&&<span style={{fontSize:7,marginLeft:4,background:C.amberLight,color:C.amber,padding:"1px 4px",borderRadius:3,fontWeight:700}}>stima</span>}
                        {ing.mancante&&<span style={{fontSize:7,marginLeft:4,background:C.redLight,color:C.red,padding:"1px 4px",borderRadius:3,fontWeight:700}}>n/d</span>}
                      </td>
                      <td style={{padding:"8px 10px",textAlign:"right",color:C.textMid,fontFamily:"monospace"}}>{ing.qty1stampo}</td>
                      <td style={{padding:"8px 10px",textAlign:"right",color:C.textSoft,fontFamily:"monospace",fontSize:9}}>{ing.costoPerGCalc>0?ing.costoPerGCalc.toFixed(4):"—"}</td>
                      <td style={{padding:"8px 10px",textAlign:"right",fontWeight:600,color:ing.costoCalc>0?C.text:C.textSoft}}>{ing.costoCalc>0?fmt(ing.costoCalc):"—"}</td>
                      <td style={{padding:"8px 10px",textAlign:"right"}}>
                        {ing.pct>0&&(
                          <div style={{display:"flex",alignItems:"center",gap:6,justifyContent:"flex-end"}}>
                            <div style={{width:50,height:5,background:"#EEE",borderRadius:3}}>
                              <div style={{width:`${Math.min(100,ing.pct)}%`,height:5,background:ing.pct>30?C.red:ing.pct>15?C.amber:"#AAB",borderRadius:3}}/>
                            </div>
                            <span style={{fontSize:9,color:C.textMid,width:28,textAlign:"right",fontWeight:600}}>{ing.pct.toFixed(0)}%</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{background:"#F0EAE6",borderTop:`2px solid ${C.borderStr}`}}>
                    <td colSpan={3} style={{padding:"10px 10px",fontWeight:800,fontSize:11,color:C.text}}>TOTALE FOOD COST</td>
                    <td style={{padding:"10px 10px",textAlign:"right",fontWeight:900,fontSize:13,color:C.red,fontFamily:"Georgia,serif"}}>{fmt(fc)}</td>
                    <td/>
                  </tr>
                </tfoot>
              </table>
            </div>
            {mancanti.length>0 && (
              <div style={{marginTop:8,padding:"8px 12px",background:C.amberLight,borderRadius:7,fontSize:10,color:C.amber,lineHeight:1.5}}>
                ⚠️ Ingredienti senza prezzo: <b>{mancanti.join(", ")}</b>. Carica il file con i prezzi reali per un food cost preciso.
              </div>
            )}
          </div>

          {/* DESTRA: grafici e P&L */}
          <div style={{display:"flex",flexDirection:"column",gap:20}}>

            {/* Pie incidenza */}
            {pieData.length>0&&(
              <div style={{background:"#F8F4F2",borderRadius:10,padding:"16px"}}>
                <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:12}}>📊 Composizione food cost</div>
                <div style={{display:"flex",gap:16,alignItems:"center"}}>
                  <PieChart width={110} height={110}>
                    <Pie data={pieData} dataKey="costoCalc" cx={50} cy={50} innerRadius={28} outerRadius={52} paddingAngle={2}>
                      {pieData.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                    </Pie>
                  </PieChart>
                  <div style={{flex:1,display:"flex",flexDirection:"column",gap:5}}>
                    {pieData.map((ing,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:7}}>
                        <div style={{width:8,height:8,borderRadius:2,background:PIE_COLORS[i%PIE_COLORS.length],flexShrink:0}}/>
                        <span style={{flex:1,fontSize:10,color:C.textMid,fontWeight:500}}>{ing.nome}</span>
                        <span style={{fontSize:10,fontWeight:700,color:C.text}}>{fmt(ing.costoCalc)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* P&L cascade */}
            <div style={{background:"#F8F4F2",borderRadius:10,padding:"16px"}}>
              <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:12}}>💰 Conto economico per stampo</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <div style={{padding:"10px 14px",background:C.greenLight,border:`1px solid ${C.green}25`,borderRadius:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:11,color:C.green,fontWeight:700}}>+ Ricavo ({reg.unita} {reg.tipo==="fetta"?"fette":"pezzi"} × {fmt(reg.prezzo)})</span>
                  <span style={{fontSize:15,fontWeight:900,color:C.green,fontFamily:"Georgia,serif"}}>{fmt(ricavo)}</span>
                </div>
                <div style={{padding:"10px 14px",background:C.redLight,border:`1px solid ${C.red}20`,borderRadius:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:11,color:C.red,fontWeight:700}}>− Food cost materie prime</span>
                  <span style={{fontSize:15,fontWeight:900,color:C.red,fontFamily:"Georgia,serif"}}>−{fmt(fc)}</span>
                </div>
                <div style={{width:"100%",borderTop:`2px dashed ${C.border}`,margin:"2px 0"}}/>
                <div style={{padding:"12px 14px",background:mbg,border:`1px solid ${mc}25`,borderRadius:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                    <span style={{fontSize:12,color:mc,fontWeight:800}}>= Margine lordo</span>
                    <span style={{fontSize:18,fontWeight:900,color:mc,fontFamily:"Georgia,serif"}}>{fmt(margine)}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                    <span style={{color:C.textMid}}>Margine %</span>
                    <span style={{fontWeight:700,color:mc}}>{fmtp(margPct)}</span>
                  </div>
                  <div style={{marginTop:8,height:6,background:"rgba(0,0,0,0.08)",borderRadius:3}}>
                    <div style={{width:`${Math.min(100,margPct)}%`,height:6,background:mc,borderRadius:3}}/>
                  </div>
                </div>
              </div>
            </div>

            {/* Per unità */}
            <div style={{background:"#F8F4F2",borderRadius:10,padding:"16px"}}>
              <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:10}}>🍰 Per singola {reg.tipo}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                {[
                  {lbl:`Prezzo vendita`,val:fmt(reg.prezzo),c:C.text,tip:`Prezzo al cliente per ogni ${reg.tipo}. Modificabile con il pulsante ✏️ Prezzo.`},
                  {lbl:`Food cost`,val:fmt(fcUnita),c:C.red,tip:`Food cost per unità = food cost stampo (${fmt(fc)}) ÷ ${reg.unita} ${reg.tipo==="fetta"?"fette":"pezzi"}.`},
                  {lbl:`Margine`,val:fmt(mrgUnita),c:mrgUnita>0?C.green:C.red,tip:`Margine per ${reg.tipo} = prezzo ${fmt(reg.prezzo)} − food cost ${fmt(fcUnita)}. Quanto guadagni su ogni pezzo venduto.`},
                ].map(({lbl,val,c,tip},i)=>(
                  <Tip key={i} text={tip} width={240}>
                  <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:7,padding:"10px 10px",textAlign:"center",cursor:"help"}}>
                    <div style={{fontSize:8,fontWeight:600,letterSpacing:"0.07em",textTransform:"uppercase",color:C.textSoft,marginBottom:4}}>{lbl}</div>
                    <div style={{fontSize:15,fontWeight:900,color:c,fontFamily:"Georgia,serif"}}>{val}</div>
                  </div>
                  </Tip>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── RICETTARIO VIEW ──────────────────────────────────────────────────────────
function RicettarioView({ricettario, onUpdateRegola}) {
  const ingCosti     = useMemo(()=>buildIngCosti(ricettario?.ingredienti_costi||{}), [ricettario]);
  const ricette      = useMemo(()=>Object.values(ricettario?.ricette||{})
    .filter(r=>isRicettaValida(r.nome) && getR(r.nome,r).tipo!=="interno" && getR(r.nome,r).tipo!=="semilavorato"),
  [ricettario]);
  const semilavorati = useMemo(()=>Object.values(ricettario?.ricette||{})
    .filter(r=>isRicettaValida(r.nome) && getR(r.nome,r).tipo==="semilavorato"),
  [ricettario]);

  return (
    <div style={{maxWidth:1100}}>
      <div style={{marginBottom:28}}>
        <h1 style={{margin:"0 0 8px",fontSize:30,fontWeight:900,color:C.text,letterSpacing:"-0.03em"}}>Ricettario</h1>
        <p style={{margin:0,fontSize:12,color:C.textSoft,lineHeight:1.7,maxWidth:600}}>
          Distinta ingredienti, composizione food cost e conto economico per stampo. Clicca su una ricetta per espandere il dettaglio.
        </p>
        <div style={{marginTop:8,display:"inline-flex",alignItems:"center",gap:6,padding:"5px 10px",background:C.amberLight,borderRadius:6,fontSize:10,color:C.amber,fontWeight:600}}>
          💡 Per prezzi reali vai in <strong>Magazzino → Importa prezzi .xlsx</strong> o usa il pulsante in basso nella sidebar
        </div>
      </div>

      {/* ─── RICETTE VENDIBILI ─── */}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {ricette
          .sort((a,b)=>{
            const ra=getR(a.nome,a), rb=getR(b.nome,b);
            const {tot:fca}=calcolaFC(a,ingCosti,ricettario), {tot:fcb}=calcolaFC(b,ingCosti,ricettario);
            const ma=ra.unita*ra.prezzo>0?((ra.unita*ra.prezzo-fca)/(ra.unita*ra.prezzo)*100):0;
            const mb=rb.unita*rb.prezzo>0?((rb.unita*rb.prezzo-fcb)/(rb.unita*rb.prezzo)*100):0;
            return mb-ma;
          })
          .map(ric=><TortaCard key={ric.nome} ric={ric} ingCosti={ingCosti} ricettario={ricettario} onUpdateRegola={onUpdateRegola}/>)
        }
      </div>

      {/* ─── SEMILAVORATI ─── */}
      {semilavorati.length>0&&(
        <div style={{marginTop:36}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
            <div style={{width:3,height:18,background:"#8E44AD",borderRadius:2,flexShrink:0}}/>
            <div>
              <h2 style={{margin:0,fontSize:16,fontWeight:800,color:C.text}}>🧁 Semilavorati & Basi</h2>
              <div style={{fontSize:11,color:C.textSoft,marginTop:2}}>Impasti, creme e basi interne — non vendibili al cliente, usabili come ingredienti in altre ricette</div>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {semilavorati.map(ric=>{
              const { tot:fc, mancanti } = calcolaFC(ric, ingCosti, ricettario);
              const pesoTot = (ric.ingredienti||[]).reduce((s,i)=>s+(i.qty1stampo||0), 0);
              const costoG  = pesoTot>0 ? fc/pesoTot : 0;
              return (
                <div key={ric.nome} style={{background:C.bgCard,border:"1px solid #D4B0E8",borderRadius:12,padding:"16px 20px",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                        <span style={{padding:"3px 8px",borderRadius:5,background:"#F0E4FA",color:"#8E44AD",fontSize:9,fontWeight:800,letterSpacing:"0.06em",textTransform:"uppercase"}}>Semilavorato</span>
                        <span style={{fontSize:14,fontWeight:900,color:C.text}}>{ric.nome}</span>
                      </div>
                      <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
                        <div style={{fontSize:11,color:C.textSoft}}>⚖️ Peso tot. <span style={{fontWeight:700,color:C.text}}>{pesoTot>=1000?`${(pesoTot/1000).toFixed(2)} kg`:`${Math.round(pesoTot)} g`}</span></div>
                        <div style={{fontSize:11,color:C.textSoft}}>💶 Costo batch <span style={{fontWeight:700,color:C.red}}>€{fc.toFixed(2)}</span></div>
                        <div style={{fontSize:11,color:C.textSoft}}>📏 Costo/g <span style={{fontWeight:700,color:C.text,fontFamily:"monospace"}}>{costoG>0?costoG.toFixed(5):"—"} €/g</span></div>
                        <div style={{fontSize:11,color:C.textSoft}}>📦 <span style={{fontWeight:700,color:C.text}}>€{(costoG*1000).toFixed(2)}/kg</span></div>
                      </div>
                      {mancanti.length>0&&<div style={{fontSize:9,color:C.amber,marginTop:6}}>⚠ Prezzi non trovati: {mancanti.join(", ")}</div>}
                      {ric.note&&<div style={{fontSize:10,color:C.textSoft,marginTop:4,fontStyle:"italic"}}>📝 {ric.note}</div>}
                    </div>
                    <div style={{minWidth:160}}>
                      <div style={{fontSize:9,fontWeight:700,color:"#8E44AD",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Ingredienti ({(ric.ingredienti||[]).length})</div>
                      <div style={{display:"flex",flexDirection:"column",gap:2,maxHeight:90,overflowY:"auto"}}>
                        {(ric.ingredienti||[]).map((ing,i)=>(
                          <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:9,padding:"2px 6px",background:"#F9F2FD",borderRadius:3}}>
                            <span style={{color:C.textMid}}>{ing.nome}</span>
                            <span style={{color:"#8E44AD",fontWeight:700}}>{ing.qty1stampo}g</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{marginTop:10,padding:"10px 14px",background:"#F9F2FD",border:"1px solid #D4B0E8",borderRadius:8,fontSize:10,color:"#6B2FA0",lineHeight:1.6}}>
            💡 <strong>Come usare un semilavorato in una ricetta:</strong> nella distinta ingredienti di una torta, aggiungi il nome del semilavorato (es. <em>"crema pasticcera"</em>) come ingrediente con la quantità in grammi — il sistema calcola il costo automaticamente.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BARRE RICAVO COMPONENT ──────────────────────────────────────────────────
function BarreRicavo({ rows, euro, pct }) {
  const [tooltip, setTooltip] = useState(null); // {x,y,r}

  const SH2 = () => (
    <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:14,marginTop:8}}>
      <div style={{width:3,height:18,background:C.red,borderRadius:2,flexShrink:0,alignSelf:"center"}}/>
      <div>
        <h2 style={{margin:0,fontSize:14,fontWeight:800,color:C.text}}>Dove va ogni euro di ricavo — per stampo</h2>
        <div style={{fontSize:11,color:C.textSoft,marginTop:2}}>
          Verde = margine lordo che resta in cassa &nbsp;·&nbsp; Rosso = costo ingredienti &nbsp;·&nbsp; Passa il mouse sulla barra per il dettaglio
        </div>
      </div>
    </div>
  );

  return (
    <>
      <SH2/>
      <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"24px",marginBottom:28,
        boxShadow:"0 1px 4px rgba(0,0,0,0.04)",position:"relative"}}
        onMouseLeave={()=>setTooltip(null)}>

        <div style={{display:"flex",flexDirection:"column",gap:22}}>
          {rows.map((r,i)=>{
            const mc     = margColor(r.margPct);
            const margW  = Math.max(0, r.margPct);
            const fcW    = Math.max(0, r.fcPct);

            const handleMouseOver = (e, segment) => {
              const rect = e.currentTarget.closest('[data-barre-root]').getBoundingClientRect();
              const barRect = e.currentTarget.parentElement.getBoundingClientRect();
              setTooltip({ nome:r.nome, segment, r,
                x: e.clientX - rect.left,
                y: barRect.top - rect.top - 8 });
            };

            return (
              <div key={r.nome} data-barre-root="">
                {/* Riga nome + numeri */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{width:26,height:26,borderRadius:7,
                      background:i===0?C.red:i===1?"#E07040":i===2?C.amber:"#F0EAE6",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:10,fontWeight:900,color:i<3?C.white:C.textMid,flexShrink:0}}>{i+1}</div>
                    <span style={{fontSize:13,fontWeight:800,color:C.text}}>{r.nome}</span>
                    <Tip text={`Valutazione margine: ${pct(r.margPct)}. Verde ≥ 60% ottimo, giallo 40–60% accettabile, rosso < 40% da ottimizzare.`} width={260}><span style={{cursor:"help"}}>{margBadge(r.margPct)}</span></Tip>
                  </div>
                  <div style={{display:"flex",gap:24,textAlign:"right"}}>
                    {[
                      {lbl:"Ricavo", val:euro(r.ricavo), c:C.text,
                        tip:`Ricavo per stampo = ${r.reg.unita} ${r.reg.tipo==="fetta"?"fette":"pz"} × ${euro(r.reg.prezzo)}. Passa il mouse sulla barra verde per il dettaglio.`},
                      {lbl:"Ingredienti", val:`−${euro(r.fc)}`, c:C.red,
                        tip:`Food cost totale per stampo. FC ratio: ${pct(r.fcPct)} del ricavo. Target < 30%. Passa il mouse sulla barra rossa per i dettagli.`},
                      {lbl:"Margine", val:euro(r.margine), c:mc,
                        tip:`Margine lordo = ricavo − food cost. ${pct(r.margPct)} del ricavo. Non include costi fissi né lavoro.`},
                    ].map(({lbl,val,c,tip})=>(
                      <Tip key={lbl} text={tip} width={250}>
                      <div style={{cursor:"help"}}>
                        <div style={{fontSize:8,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",color:C.textSoft,borderBottom:"1px dashed rgba(155,120,115,0.35)"}}>{lbl}</div>
                        <div style={{fontSize:14,fontWeight:900,color:c,fontFamily:"Georgia,serif"}}>{val}</div>
                      </div>
                      </Tip>
                    ))}
                  </div>
                </div>

                {/* Barra stacked 100% — VERDE a sinistra, ROSSO a destra */}
                <div style={{height:34,borderRadius:8,overflow:"hidden",display:"flex",cursor:"crosshair",position:"relative"}}
                  data-barre-root="">
                  {/* VERDE: margine */}
                  <div
                    style={{width:`${margW}%`,height:"100%",background:mc,opacity:0.86,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      transition:"width 0.5s ease",position:"relative"}}
                    onMouseMove={e=>handleMouseOver(e,"margine")}>
                    {margW>10&&<span style={{fontSize:11,fontWeight:800,color:"#fff",pointerEvents:"none"}}>{pct(margW)}</span>}
                  </div>
                  {/* ROSSO: food cost */}
                  <div
                    style={{flex:1,height:"100%",background:C.red,opacity:0.82,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      transition:"width 0.5s ease"}}
                    onMouseMove={e=>handleMouseOver(e,"foodcost")}>
                    {fcW>10&&<span style={{fontSize:11,fontWeight:800,color:"#fff",pointerEvents:"none"}}>{pct(fcW)}</span>}
                  </div>
                </div>

                {/* Etichette sotto */}
                <div style={{display:"flex",marginTop:4,fontSize:9,fontWeight:600,color:C.textSoft}}>
                  <div style={{width:`${margW}%`,textAlign:"center",overflow:"hidden",whiteSpace:"nowrap"}}>
                    {margW>18?"margine lordo":""}
                  </div>
                  <div style={{flex:1,textAlign:"center"}}>
                    {fcW>18?"costo ingredienti":""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div style={{position:"absolute",left:Math.min(tooltip.x+12, 560),top:tooltip.y,
            background:C.white,border:`1px solid ${C.border}`,borderRadius:10,
            padding:"14px 18px",boxShadow:"0 6px 24px rgba(0,0,0,0.13)",
            zIndex:100,minWidth:260,pointerEvents:"none"}}>
            <div style={{fontWeight:900,fontSize:13,color:C.text,marginBottom:10}}>{tooltip.nome}</div>
            {tooltip.segment==="margine" ? (
              <>
                <div style={{fontSize:11,color:C.green,fontWeight:700,marginBottom:6}}>🟢 Margine lordo</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:"4px 16px",fontSize:11}}>
                  <span style={{color:C.textMid}}>Ricavo stampo</span>
                  <span style={{fontWeight:800,color:C.text,fontFamily:"Georgia,serif",textAlign:"right"}}>{euro(tooltip.r.ricavo)}</span>
                  <span style={{color:C.textMid}}>Meno costo ingredienti</span>
                  <span style={{fontWeight:800,color:C.red,fontFamily:"Georgia,serif",textAlign:"right"}}>−{euro(tooltip.r.fc)}</span>
                  <div style={{gridColumn:"1/-1",borderTop:`1px solid ${C.border}`,margin:"4px 0"}}/>
                  <span style={{color:C.green,fontWeight:700}}>= Margine lordo</span>
                  <span style={{fontWeight:900,color:C.green,fontFamily:"Georgia,serif",textAlign:"right"}}>{euro(tooltip.r.margine)}</span>
                  <span style={{color:C.textSoft,fontSize:10}}>sul ricavo</span>
                  <span style={{fontWeight:700,color:margColor(tooltip.r.margPct),textAlign:"right"}}>{pct(tooltip.r.margPct)}</span>
                  <span style={{color:C.textSoft,fontSize:10}}>per unità</span>
                  <span style={{fontWeight:700,color:C.green,textAlign:"right",fontFamily:"Georgia,serif"}}>{euro(tooltip.r.mrgUnita)}</span>
                </div>
                <div style={{marginTop:8,fontSize:10,color:C.textSoft,fontStyle:"italic"}}>
                  Questo è quanto resta prima di costi fissi (affitto, lavoro, energia)
                </div>
              </>
            ) : (
              <>
                <div style={{fontSize:11,color:C.red,fontWeight:700,marginBottom:6}}>🔴 Costo ingredienti (food cost)</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:"4px 16px",fontSize:11}}>
                  <span style={{color:C.textMid}}>Food cost totale/stampo</span>
                  <span style={{fontWeight:800,color:C.red,fontFamily:"Georgia,serif",textAlign:"right"}}>{euro(tooltip.r.fc)}</span>
                  <span style={{color:C.textMid}}>Su ricavo di</span>
                  <span style={{fontWeight:800,color:C.text,fontFamily:"Georgia,serif",textAlign:"right"}}>{euro(tooltip.r.ricavo)}</span>
                  <div style={{gridColumn:"1/-1",borderTop:`1px solid ${C.border}`,margin:"4px 0"}}/>
                  <span style={{color:C.textMid}}>FC ratio</span>
                  <span style={{fontWeight:900,color:C.red,textAlign:"right"}}>{pct(tooltip.r.fcPct)}</span>
                  <span style={{color:C.textSoft,fontSize:10}}>per singola unità</span>
                  <span style={{fontWeight:700,color:C.red,textAlign:"right",fontFamily:"Georgia,serif"}}>{euro(tooltip.r.fcUnita)}</span>
                </div>
                <div style={{marginTop:8,fontSize:10,color:C.textSoft,fontStyle:"italic"}}>
                  Target pasticceria artigianale: FC ratio &lt; 28–30%
                </div>
              </>
            )}
          </div>
        )}

        {/* Legenda */}
        <div style={{display:"flex",gap:20,marginTop:24,paddingTop:16,borderTop:`1px solid ${C.border}`,flexWrap:"wrap",alignItems:"center"}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:14,height:14,borderRadius:3,background:C.green,opacity:0.86}}/>
            <span style={{fontSize:10,fontWeight:600,color:C.textMid}}>Margine lordo (rimane in cassa)</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <div style={{width:14,height:14,borderRadius:3,background:C.red,opacity:0.82}}/>
            <span style={{fontSize:10,fontWeight:600,color:C.textMid}}>Costo ingredienti (food cost)</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",background:C.amberLight,borderRadius:6,border:`1px solid ${C.amber}30`}}>
            <span style={{fontSize:10,color:C.amber,fontWeight:600}}>🔜 Prossimamente: costo lavoro e costi fissi</span>
          </div>
          <div style={{marginLeft:"auto",fontSize:10,color:C.textSoft,fontStyle:"italic"}}>
            Target: margine lordo ≥ 70%
          </div>
        </div>
      </div>
    </>
  );
}

// ─── TOP INGREDIENTI TABLE ────────────────────────────────────────────────────
function TopIngredientiTable({ ricettario, ingCosti, euro, pct }) {
  const [sortBy,  setSortBy]  = useState("costoTot");
  const [sortDir, setSortDir] = useState("desc");
  const [hovRic,  setHovRic]  = useState(null); // {key, x, y}

  const ingMap = {};
  for (const ric of Object.values(ricettario?.ricette||{})) {
    if (!isRicettaValida(ric.nome) || getR(ric.nome, ric).tipo==="interno") continue;
    for (const ing of (ric.ingredienti||[])) {
      const k = normIng(ing.nome);
      const c = ingCosti[k];
      const costoStampo = c ? ing.qty1stampo * c.costoG : 0;
      if (!ingMap[k]) ingMap[k] = { nome:ing.nome, k, qty:0, costoTot:0, ricette:[], isStima:c?.isStima||false, costoG:c?.costoG||0 };
      ingMap[k].qty      += ing.qty1stampo;
      ingMap[k].costoTot += costoStampo;
      if (!ingMap[k].ricette.includes(ric.nome)) ingMap[k].ricette.push(ric.nome);
    }
  }
  const grandTotal = Object.values(ingMap).reduce((s,i)=>s+i.costoTot,0);

  const list = Object.values(ingMap).filter(i=>i.costoTot>0).map(i=>({
    ...i, pctTot: grandTotal>0?(i.costoTot/grandTotal*100):0
  })).sort((a,b)=>{
    const mul = sortDir==="desc"?-1:1;
    if (sortBy==="costoG") return mul*(a.costoG-b.costoG);
    return mul*(a[sortBy]-b[sortBy]);
  });

  const toggleSort = useCallback((key) => {
    setSortBy(prev => {
      if(prev===key){ setSortDir(d=>d==="desc"?"asc":"desc"); return prev; }
      setSortDir("desc"); return key;
    });
  }, []);

  // uses global SortTH component

  return (
    <>
      <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:14}}>
        <div style={{width:3,height:18,background:C.red,borderRadius:2,flexShrink:0,alignSelf:"center"}}/>
        <div>
          <h2 style={{margin:0,fontSize:14,fontWeight:800,color:C.text}}>Ingredienti per Impatto sul Food Cost</h2>
          <div style={{fontSize:11,color:C.textSoft,marginTop:2}}>
            Aggregato su tutti i prodotti — clicca le intestazioni colorate per ordinare
          </div>
        </div>
      </div>
      <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,
        overflow:"visible",marginBottom:28,boxShadow:"0 1px 4px rgba(0,0,0,0.04)",position:"relative"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead>
            <tr style={{background:"#F8F4F2"}}>
              <th style={{padding:"10px 14px",textAlign:"left",fontSize:8,fontWeight:700,letterSpacing:"0.07em",
                textTransform:"uppercase",color:C.textSoft,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>
                Ingrediente
              </th>
              <th style={{padding:"10px 14px",textAlign:"left",fontSize:8,fontWeight:700,letterSpacing:"0.07em",
                textTransform:"uppercase",color:C.textSoft,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>
                Usato in
              </th>
              <SortTH k="qty" right active={sortBy==="qty"} dir={sortDir} onToggle={toggleSort}><Tip text="Grammatura totale di questo ingrediente sommata su tutti i prodotti in cui viene usato (per stampo)." width={250}><span style={{borderBottom:"1px dashed rgba(155,120,115,0.4)",cursor:"help"}}>Qty tot. (g)</span></Tip></SortTH>
              <SortTH k="costoTot" right active={sortBy==="costoTot"} dir={sortDir} onToggle={toggleSort}><Tip text="Costo totale dell'ingrediente per stampo, sommato su tutti i prodotti. Voce di impatto sul food cost totale." width={260}><span style={{borderBottom:"1px dashed rgba(155,120,115,0.4)",cursor:"help"}}>Costo/stampo</span></Tip></SortTH>
              <SortTH k="pctTot" right active={sortBy==="pctTot"} dir={sortDir} onToggle={toggleSort}><Tip text="Incidenza percentuale di questo ingrediente sul food cost totale di tutti i prodotti. Più alta = più critico da monitorare." width={280}><span style={{borderBottom:"1px dashed rgba(155,120,115,0.4)",cursor:"help"}}>% FC totale</span></Tip></SortTH>
              <SortTH k="costoG" right active={sortBy==="costoG"} dir={sortDir} onToggle={toggleSort}><Tip text="Costo per grammo dell'ingrediente. Utile per confrontare alternative o negoziare prezzi con i fornitori." width={250}><span style={{borderBottom:"1px dashed rgba(155,120,115,0.4)",cursor:"help"}}>€ / g</span></Tip></SortTH>
            </tr>
          </thead>
          <tbody>
            {list.map((ing,i)=>{
              const nRic = ing.ricette.length;
              const shortNames = ing.ricette.map(r=>
                r.replace(/^TORTA (DI |AL |ALLE? )/i,"").split(" ")[0].toLowerCase()
              );
              return (
                <tr key={ing.k} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:"#FDFAF7"}}>
                  <td style={{padding:"10px 14px",fontWeight:700,color:C.text}}>
                    {ing.nome}
                    {ing.isStima&&<Tip text="Prezzo stimato da listino HoReCa Torino 2025. Non è stato caricato un prezzo reale per questo ingrediente. Il food cost potrebbe variare." width={260}><span style={{fontSize:7,marginLeft:5,background:C.amberLight,color:C.amber,
                      padding:"1px 5px",borderRadius:3,fontWeight:700,cursor:"help"}}>stima</span></Tip>}
                  </td>
                  {/* Usato in — compact with hover tooltip */}
                  <td style={{padding:"10px 14px",position:"relative",overflow:"visible"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,cursor:"default"}}
                      onMouseEnter={()=>setHovRic({key:ing.k})}
                      onMouseLeave={()=>setHovRic(null)}>
                      {/* Colored dots — max 5 visible */}
                      {ing.ricette.slice(0,5).map((_,di)=>(
                        <div key={di} style={{width:8,height:8,borderRadius:"50%",flexShrink:0,
                          background:["#C0392B","#E07040","#B45309","#5B8FCE","#7B7B7B"][di%5]}}/>
                      ))}
                      <span style={{fontSize:10,fontWeight:700,color:C.textMid,whiteSpace:"nowrap"}}>
                        {nRic} {nRic===1?"ricetta":"ricette"}
                      </span>
                    </div>
                    {/* Tooltip */}
                    {hovRic?.key===ing.k&&(
                      <div style={{position:"absolute",zIndex:9999,top:"100%",left:0,
                        background:C.white,border:`1px solid ${C.border}`,borderRadius:9,
                        padding:"10px 14px",boxShadow:"0 6px 24px rgba(0,0,0,0.13)",
                        minWidth:180,pointerEvents:"none",marginTop:4}}>
                        <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",
                          color:C.textSoft,marginBottom:6}}>Usato in</div>
                        {ing.ricette.map((r,ri)=>(
                          <div key={r} style={{display:"flex",alignItems:"center",gap:7,marginBottom:4}}>
                            <div style={{width:8,height:8,borderRadius:"50%",flexShrink:0,
                              background:["#C0392B","#E07040","#B45309","#5B8FCE","#7B7B7B"][ri%5]}}/>
                            <span style={{fontSize:11,fontWeight:600,color:C.text}}>{r}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={{padding:"10px 14px",textAlign:"right",fontFamily:"monospace",color:C.textMid}}>{Math.round(ing.qty)}g</td>
                  <td style={{padding:"10px 14px",textAlign:"right",fontWeight:800,color:C.red,fontFamily:"Georgia,serif"}}>{euro(ing.costoTot)}</td>
                  <td style={{padding:"10px 14px",textAlign:"right"}}>
                    <Tip text={`${ing.k} incide per il ${pct(ing.pctTot)} sul food cost totale di tutti i prodotti. Costo per grammo: € ${ing.costoG>0?ing.costoG.toFixed(4):"n/d"}. Più alta l'incidenza, più critico è monitorare questo ingrediente.`} width={260}>
                    <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"flex-end",cursor:"help"}}>
                      <div style={{width:60,height:5,background:"#EEE",borderRadius:3}}>
                        <div style={{width:`${Math.min(100,ing.pctTot*3)}%`,height:5,background:C.red,opacity:0.7,borderRadius:3}}/>
                      </div>
                      <span style={{fontWeight:700,color:C.text,width:36,textAlign:"right"}}>{pct(ing.pctTot)}</span>
                    </div>
                    </Tip>
                  </td>
                  <td style={{padding:"10px 14px",textAlign:"right",fontSize:10,color:C.textSoft,fontFamily:"monospace"}}>
                    {ing.costoG>0?`€ ${ing.costoG.toFixed(4)}`:"—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{background:"#F0EAE6",borderTop:`2px solid ${C.borderStr}`}}>
              <td colSpan={3} style={{padding:"10px 14px",fontWeight:900,fontSize:11,color:C.text}}>
                TOTALE FOOD COST — somma tutti i prodotti
              </td>
              <td style={{padding:"10px 14px",textAlign:"right",fontWeight:900,fontSize:13,color:C.red,fontFamily:"Georgia,serif"}}>{euro(grandTotal)}</td>
              <td colSpan={2}/>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

// ─── SCENARIO PREZZI COMPONENT ────────────────────────────────────────────────
function ScenarioPrezzi({ rows, euro, pct }) {
  // prezzi scenario: keyed by nome, valore in euro (il prezzo/unita)
  const [prezzi, setPrezzi] = useState(()=>
    Object.fromEntries(rows.map(r=>[r.nome, r.reg.prezzo.toFixed(2)]))
  );

  const setP = (nome, v) => setPrezzi(p=>({...p,[nome]:v}));

  const scenRows = rows.map(r=>{
    const rawStr   = prezzi[r.nome];
    const newPrezzo = Math.max(0, parseFloat(rawStr)||0);
    const delta     = r.reg.prezzo>0 ? ((newPrezzo - r.reg.prezzo)/r.reg.prezzo*100) : 0;
    const newRicavo = parseFloat((r.reg.unita * newPrezzo).toFixed(2));
    const newMarg   = parseFloat((newRicavo - r.fc).toFixed(2));
    const newMargPct= newRicavo>0?(newMarg/newRicavo*100):0;
    return { ...r, newPrezzo, delta, newRicavo, newMarg, newMargPct,
      diffMarg:    parseFloat((newMarg - r.margine).toFixed(2)),
      diffMargPct: parseFloat((newMargPct - r.margPct).toFixed(1)) };
  });

  const totRicavoBase = rows.reduce((s,r)=>s+r.ricavo,0);
  const totRicavoScen = scenRows.reduce((s,r)=>s+r.newRicavo,0);
  const totMargBase   = rows.reduce((s,r)=>s+r.margine,0);
  const totMargScen   = scenRows.reduce((s,r)=>s+r.newMarg,0);
  const hasChanges    = scenRows.some(r=>Math.abs(r.delta)>0.01);

  const reset = () => setPrezzi(Object.fromEntries(rows.map(r=>[r.nome, r.reg.prezzo.toFixed(2)])));

  return (
    <>
      <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:14}}>
        <div style={{width:3,height:18,background:C.red,borderRadius:2,flexShrink:0,alignSelf:"center"}}/>
        <div style={{flex:1}}>
          <h2 style={{margin:0,fontSize:14,fontWeight:800,color:C.text}}>Simulatore Scenari di Prezzo</h2>
          <div style={{fontSize:11,color:C.textSoft,marginTop:2}}>
            Inserisci il nuovo prezzo per ogni prodotto — la variazione % e il nuovo margine si calcolano in tempo reale
          </div>
        </div>
        {hasChanges&&(
          <button onClick={reset}
            style={{padding:"6px 14px",borderRadius:7,border:`1px solid ${C.borderStr}`,
              background:"transparent",fontSize:11,fontWeight:700,color:C.textMid,cursor:"pointer"}}>
            ↺ Reset tutto
          </button>
        )}
      </div>

      <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"24px",
        marginBottom:28,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>

        {/* Totali scenario — appare solo se ci sono cambiamenti */}
        {hasChanges&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:24,
            padding:"16px 20px",background:"#F8F4F2",borderRadius:10,border:`1px solid ${C.border}`}}>
            {[
              {lbl:"Ricavo base",      val:euro(totRicavoBase), c:C.textMid,
                tip:"Somma dei ricavi per stampo di tutti i prodotti con i prezzi originali."},
              {lbl:"Ricavo scenario",  val:euro(totRicavoScen), c:totRicavoScen>=totRicavoBase?C.green:C.red,
                sub:(totRicavoScen-totRicavoBase)!==0?(totRicavoScen>totRicavoBase?"+":"")+euro(totRicavoScen-totRicavoBase):null,
                tip:"Ricavo totale con i nuovi prezzi. La differenza rispetto al base è mostrata sotto."},
              {lbl:"Margine base",     val:euro(totMargBase),   c:C.textMid,
                tip:"Margine lordo totale con i prezzi originali = ricavo base − food cost totale."},
              {lbl:"Margine scenario", val:euro(totMargScen),   c:totMargScen>=totMargBase?C.green:C.red,
                sub:(totMargScen-totMargBase)!==0?(totMargScen>totMargBase?"+":"")+euro(totMargScen-totMargBase):null,
                tip:"Margine lordo totale con i nuovi prezzi. Il food cost rimane invariato: cambia solo il ricavo."},
            ].map(({lbl,val,c,sub,tip})=>(
              <Tip key={lbl} text={tip} width={260}>
              <div style={{textAlign:"center",cursor:"help"}}>
                <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",
                  color:C.textSoft,marginBottom:4,borderBottom:"1px dashed rgba(155,120,115,0.4)",display:"inline-block"}}>{lbl}</div>
                <div style={{fontSize:16,fontWeight:900,color:c,fontFamily:"Georgia,serif"}}>{val}</div>
                {sub&&<div style={{fontSize:11,fontWeight:800,color:c,marginTop:2}}>{sub}</div>}
              </div>
              </Tip>
            ))}
          </div>
        )}

        {/* Una riga per ogni prodotto */}
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {scenRows.map(r=>{
            const changed = Math.abs(r.delta)>0.01;
            const mc      = margColor(r.newMargPct);
            const dSign   = r.delta>0?"+":"";
            return (
              <div key={r.nome} style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",
                padding:"14px 18px",borderRadius:10,
                border:`1px solid ${changed?C.borderStr:C.border}`,
                background:changed?(r.delta>0?"#F6FBF7":"#FEF6F5"):C.white,
                transition:"background 0.2s"}}>

                {/* Nome prodotto */}
                <div style={{width:180,flexShrink:0}}>
                  <div style={{fontSize:12,fontWeight:800,color:C.text}}>{r.nome}</div>
                  <Tip text={`Questo stampo produce ${r.reg.unita} ${r.reg.tipo==="fetta"?"fette":"pezzi"} vendibili. Il food cost attuale è ${euro(r.fc)} per stampo (${pct(r.fcPct)} del ricavo).`}>
                    <div style={{fontSize:10,color:C.textSoft,marginTop:2,cursor:"help",borderBottom:`1px dashed ${C.borderStr}`}}>
                      {r.reg.unita} {r.reg.tipo==="fetta"?"fette":"pz"}/stampo
                    </div>
                  </Tip>
                </div>

                {/* Input prezzo */}
                <div style={{display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
                  <Tip text={`Prezzo di vendita per singola ${r.reg.tipo==="fetta"?"fetta":"pezzo"}. Modificalo per simulare l'effetto sul margine. Premi Tab o clicca fuori per confermare.`}>
                  <div style={{fontSize:8,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",color:C.textSoft,cursor:"help",borderBottom:`1px dashed ${C.borderStr}`}}>
                    Prezzo / {r.reg.tipo==="fetta"?"fetta":"pezzo"}
                  </div>
                  </Tip>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:12,fontWeight:700,color:C.textMid}}>€</span>
                    <input
                      type="number" min="0" step="0.10"
                      value={prezzi[r.nome]}
                      onChange={e=>setP(r.nome, e.target.value)}
                      onBlur={e=>{
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v)) setP(r.nome, v.toFixed(2));
                      }}
                      style={{width:72,padding:"6px 8px",borderRadius:7,textAlign:"center",
                        border:`2px solid ${changed?(r.delta>0?C.green:C.red):C.border}`,
                        fontSize:14,fontWeight:900,color:changed?(r.delta>0?C.green:C.red):C.text,
                        fontFamily:"Georgia,serif",outline:"none",transition:"border-color 0.2s"}}
                    />
                  </div>
                  <div style={{fontSize:9,color:C.textSoft}}>
                    base: {euro(r.reg.prezzo)}
                  </div>
                </div>

                {/* Badge variazione % */}
                <Tip text={changed ? `Il prezzo è ${r.delta>0?"salito":"sceso"} del ${Math.abs(r.delta).toFixed(1)}% rispetto al prezzo base di ${euro(r.reg.prezzo)}.` : `Variazione % del prezzo rispetto al valore attuale (${euro(r.reg.prezzo)}). Modifica il prezzo per vedere l'impatto.`}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"center",
                  minWidth:72,padding:"6px 12px",borderRadius:8,cursor:"help",
                  background:!changed?"#F0EAE6":r.delta>0?C.greenLight:C.redLight,
                  border:`1px solid ${!changed?C.border:r.delta>0?C.green:C.red}30`}}>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:8,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",
                      color:!changed?C.textSoft:r.delta>0?C.green:C.red,marginBottom:2}}>Variazione</div>
                    <div style={{fontSize:15,fontWeight:900,fontFamily:"Georgia,serif",
                      color:!changed?C.textSoft:r.delta>0?C.green:C.red}}>
                      {!changed?"—":`${dSign}${r.delta.toFixed(1)}%`}
                    </div>
                  </div>
                </div>
                </Tip>

                {/* Freccia */}
                <div style={{color:C.textSoft,fontSize:16,flexShrink:0}}>→</div>

                {/* KPI prima → dopo */}
                <div style={{display:"flex",gap:8,flex:1,flexWrap:"wrap"}}>
                  {/* Margine base (sempre visibile) */}
                  <Tip text={`Margine lordo attuale con il prezzo base di ${euro(r.reg.prezzo)}/unità.
Calcolo: ricavo ${euro(r.ricavo)} − food cost ${euro(r.fc)} = ${euro(r.margine)} (${pct(r.margPct)} del ricavo).`} width={260}>
                  <div style={{background:"#F0EAE6",borderRadius:8,padding:"8px 12px",textAlign:"center",minWidth:90,cursor:"help"}}>
                    <div style={{fontSize:8,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:C.textSoft,marginBottom:3}}>Margine base</div>
                    <div style={{fontSize:13,fontWeight:600,color:C.textMid,fontFamily:"Georgia,serif"}}>{euro(r.margine)}</div>
                    <div style={{fontSize:9,color:C.textSoft,marginTop:2}}>{pct(r.margPct)}</div>
                  </div>
                  </Tip>
                  {/* Freccia interna */}
                  <div style={{display:"flex",alignItems:"center",color:C.textSoft,fontSize:14,flexShrink:0}}>→</div>
                  {/* Margine scenario */}
                  <Tip text={changed ? `Margine con il nuovo prezzo ${euro(r.newPrezzo)}/unità.
Calcolo: ricavo ${euro(r.newRicavo)} − food cost ${euro(r.fc)} = ${euro(r.newMarg)} (${pct(r.newMargPct)}).
Il food cost rimane fisso: cambia solo il prezzo.` : `Il margine scenario coincide con il base finché non modifichi il prezzo.`} width={280}>
                  <div style={{background:changed?(r.newMarg>r.margine?"#EAF5EE":"#FDECEA"):"#F8F4F2",borderRadius:8,padding:"8px 12px",textAlign:"center",minWidth:90,cursor:"help",
                    border:changed?`1px solid ${r.newMarg>r.margine?C.green:C.red}30`:"none"}}>
                    <div style={{fontSize:8,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:C.textSoft,marginBottom:3}}>Margine nuovo</div>
                    <div style={{fontSize:13,fontWeight:900,color:changed?mc:C.textMid,fontFamily:"Georgia,serif"}}>{euro(r.newMarg)}</div>
                    <div style={{fontSize:9,color:changed?mc:C.textSoft,marginTop:2}}>{pct(r.newMargPct)}</div>
                  </div>
                  </Tip>
                  {/* Ricavo/st */}
                  <Tip text={`Ricavo totale per stampo con il prezzo scenario.
Calcolo: ${r.reg.unita} ${r.reg.tipo==="fetta"?"fette":"pz"} × ${euro(r.newPrezzo)} = ${euro(r.newRicavo)}.`} width={240}>
                  <div style={{background:"#F8F4F2",borderRadius:8,padding:"8px 12px",textAlign:"center",minWidth:90,cursor:"help"}}>
                    <div style={{fontSize:8,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:C.textSoft,marginBottom:3}}>Ricavo/st.</div>
                    <div style={{fontSize:13,fontWeight:600,color:C.text,fontFamily:"Georgia,serif"}}>{euro(r.newRicavo)}</div>
                  </div>
                  </Tip>
                </div>

                {/* Delta margine — sempre visibile, grigio se non modificato */}
                <Tip text={changed ? `Differenza di margine tra scenario e base.
${euro(r.newMarg)} − ${euro(r.margine)} = ${r.diffMarg>0?"+":""}${euro(r.diffMarg)} per stampo.
Variazione percentuale: ${r.diffMargPct>0?"+":""}${r.diffMargPct.toFixed(1)} punti percentuale.` : "Δ margine: differenza tra il margine con il nuovo prezzo e quello attuale. Modifica il prezzo per attivarlo."} width={270}>
                <div style={{padding:"8px 16px",borderRadius:8,textAlign:"center",flexShrink:0,minWidth:90,cursor:"help",
                  background:!changed?"#F0EAE6":r.diffMarg>0?C.greenLight:C.redLight,
                  border:`1px solid ${!changed?C.border:r.diffMarg>0?C.green:C.red}30`}}>
                  <div style={{fontSize:8,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",
                    color:!changed?C.textSoft:r.diffMarg>0?C.green:C.red,marginBottom:3}}>Δ margine</div>
                  <div style={{fontSize:18,fontWeight:900,fontFamily:"Georgia,serif",
                    color:!changed?C.textSoft:r.diffMarg>0?C.green:C.red}}>
                    {!changed?"—":(r.diffMarg>0?"+":"")+euro(r.diffMarg)}
                  </div>
                  {changed&&<div style={{fontSize:9,fontWeight:700,color:r.diffMargPct>0?C.green:C.red,marginTop:2}}>
                    {r.diffMargPct>0?"+":""}{r.diffMargPct.toFixed(1)} pp
                  </div>}
                </div>
                </Tip>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}


// ─── PL TABLE (sortable) ──────────────────────────────────────────────────────
function PLTable({ rows, euro, pct, totRicavo, totFC, totMargine, fcAvg, avgMarg }) {
  const { sort, sortKey, sortDir, toggleSort } = useSortable("margPct");
  const sorted = sort(rows, (r,k)=>{
    if(k==="nome") return r.nome;
    if(k==="prezzo") return r.reg.prezzo;
    if(k==="unita") return r.reg.unita;
    return r[k]||0;
  });
  return (
    <>
      <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:14}}>
        <div style={{width:3,height:18,background:C.red,borderRadius:2,flexShrink:0,alignSelf:"center"}}/>
        <div>
          <h2 style={{margin:0,fontSize:14,fontWeight:800,color:C.text}}>Tabella Riepilogativa P&L</h2>
          <div style={{fontSize:11,color:C.textSoft,marginTop:2}}>Clicca le intestazioni per ordinare ▼▲</div>
        </div>
      </div>
      <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden",marginBottom:28,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
        <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:700}}>
          <thead>
            <tr style={{background:"#F8F4F2"}}>
              <SortTH k="nome" active={sortKey==="nome"} dir={sortDir} onToggle={toggleSort}><Tip text="Nome del prodotto. Clicca per ordinare alfabeticamente." width={200}><span style={{borderBottom:"1px dashed rgba(155,120,115,0.4)",cursor:"help"}}>Prodotto</span></Tip></SortTH>
              <SortTH k="unita" right active={sortKey==="unita"} dir={sortDir} onToggle={toggleSort}><Tip text="Numero di fette o pezzi vendibili per ogni stampo prodotto." width={220}><span style={{borderBottom:"1px dashed rgba(155,120,115,0.4)",cursor:"help"}}>Unità/st.</span></Tip></SortTH>
              <SortTH k="prezzo" right active={sortKey==="prezzo"} dir={sortDir} onToggle={toggleSort}><Tip text="Prezzo di vendita per singola unità (fetta o pezzo). Modificabile nel Simulatore Prezzi." width={240}><span style={{borderBottom:"1px dashed rgba(155,120,115,0.4)",cursor:"help"}}>Prezzo/un.</span></Tip></SortTH>
              <SortTH k="ricavo" right active={sortKey==="ricavo"} dir={sortDir} onToggle={toggleSort}><Tip text="Ricavo totale per stampo = unità × prezzo. È il massimo incassabile se si vende tutto." width={240}><span style={{borderBottom:"1px dashed rgba(155,120,115,0.4)",cursor:"help"}}>Ricavo/st.</span></Tip></SortTH>
              <SortTH k="fc" right active={sortKey==="fc"} dir={sortDir} onToggle={toggleSort}><Tip text="Food Cost per stampo: costo totale ingredienti per una produzione. Non include lavoro né costi fissi." width={260}><span style={{borderBottom:"1px dashed rgba(155,120,115,0.4)",cursor:"help"}}>FC/st.</span></Tip></SortTH>
              <SortTH k="fcPct" right active={sortKey==="fcPct"} dir={sortDir} onToggle={toggleSort}><Tip text="Percentuale del ricavo assorbita dal food cost. Target pasticceria artigianale: < 28–30%." width={240}><span style={{borderBottom:"1px dashed rgba(155,120,115,0.4)",cursor:"help"}}>FC ratio</span></Tip></SortTH>
              <SortTH k="margine" right active={sortKey==="margine"} dir={sortDir} onToggle={toggleSort}><Tip text="Margine lordo per stampo = ricavo − food cost. Non include lavoro né affitto." width={240}><span style={{borderBottom:"1px dashed rgba(155,120,115,0.4)",cursor:"help"}}>Margine/st.</span></Tip></SortTH>
              <SortTH k="margPct" right active={sortKey==="margPct"} dir={sortDir} onToggle={toggleSort}><Tip text="Percentuale di margine lordo sul ricavo. Verde ≥ 60%, giallo 40–60%, rosso < 40%." width={220}><span style={{borderBottom:"1px dashed rgba(155,120,115,0.4)",cursor:"help"}}>Marg. %</span></Tip></SortTH>
              <SortTH k="fcUnita" right active={sortKey==="fcUnita"} dir={sortDir} onToggle={toggleSort}><Tip text="Food cost per singola unità = food cost stampo ÷ numero pezzi." width={220}><span style={{borderBottom:"1px dashed rgba(155,120,115,0.4)",cursor:"help"}}>FC/un.</span></Tip></SortTH>
              <SortTH k="mrgUnita" right active={sortKey==="mrgUnita"} dir={sortDir} onToggle={toggleSort}><Tip text="Margine lordo per unità venduta = prezzo − food cost unitario. Quanto guadagni su ogni fetta." width={250}><span style={{borderBottom:"1px dashed rgba(155,120,115,0.4)",cursor:"help"}}>Marg./un.</span></Tip></SortTH>
              <th style={{padding:"10px 14px",fontSize:8,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",color:C.textSoft,borderBottom:`1px solid ${C.border}`,textAlign:"right"}}>Rating</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r,i)=>(
              <tr key={r.nome} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:"#FDFAF7"}}>
                <TD bold>{r.nome}</TD>
                <TD right color={C.textMid}>{r.reg.unita} {r.reg.tipo==="fetta"?"fette":"pz"}</TD>
                <TD right bold color={C.text} mono>{euro(r.reg.prezzo)}</TD>
                <TD right bold color={C.green} mono>{euro(r.ricavo)}</TD>
                <TD right color={C.red} mono>{euro(r.fc)}</TD>
                <TD right color={r.fcPct<30?C.green:r.fcPct<40?C.amber:C.red} bold>{pct(r.fcPct)}</TD>
                <TD right bold color={margColor(r.margPct)} mono>{euro(r.margine)}</TD>
                <TD right bold color={margColor(r.margPct)}>{pct(r.margPct)}</TD>
                <TD right color={C.red} small mono>{euro(r.fcUnita)}</TD>
                <TD right bold color={r.mrgUnita>0?C.green:C.red} mono>{euro(r.mrgUnita)}</TD>
                <td style={{padding:"10px 14px",textAlign:"right"}}>{margBadge(r.margPct)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{background:"#F0EAE6",borderTop:`2px solid ${C.borderStr}`}}>
              <td colSpan={3} style={{padding:"12px 14px",fontWeight:900,fontSize:12,color:C.text}}>TOTALE / MEDIA PONDERATA</td>
              <td style={{padding:"12px 14px",textAlign:"right",fontWeight:900,fontSize:13,color:C.green,fontFamily:"Georgia,serif"}}>{euro(totRicavo)}</td>
              <td style={{padding:"12px 14px",textAlign:"right",fontWeight:900,fontSize:13,color:C.red,fontFamily:"Georgia,serif"}}>{euro(totFC)}</td>
              <td style={{padding:"12px 14px",textAlign:"right",fontWeight:800,color:fcAvg<30?C.green:fcAvg<40?C.amber:C.red}}>{pct(fcAvg)}</td>
              <td style={{padding:"12px 14px",textAlign:"right",fontWeight:900,fontSize:13,color:margColor(avgMarg),fontFamily:"Georgia,serif"}}>{euro(totMargine)}</td>
              <td style={{padding:"12px 14px",textAlign:"right",fontWeight:900,color:margColor(avgMarg)}}>{pct(avgMarg)}</td>
              <td colSpan={3}/>
            </tr>
          </tfoot>
        </table>
        </div>
      </div>
    </>
  );
}

// ─── SENSITIVITY TABLE (sortable) ─────────────────────────────────────────────
function SensTable({ rows, euro, pct }) {
  const sensRows = rows.map(r=>({...r,
    marg10:   parseFloat((r.ricavo-r.fc*1.10).toFixed(2)),
    marg20:   parseFloat((r.ricavo-r.fc*1.20).toFixed(2)),
    headroom: parseFloat(((r.ricavo/r.fc-1)*100).toFixed(1)),
  }));
  const { sort, sortKey, sortDir, toggleSort } = useSortable("headroom");
  const ss = sort(sensRows, (r,k)=>k==="nome"?r.nome:(r[k]||0));
  return (
    <>
      <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:14}}>
        <div style={{width:3,height:18,background:C.red,borderRadius:2,flexShrink:0,alignSelf:"center"}}/>
        <div>
          <h2 style={{margin:0,fontSize:14,fontWeight:800,color:C.text}}>Sensitivity: Impatto Aumento Costi Ingredienti</h2>
          <div style={{fontSize:11,color:C.textSoft,marginTop:2}}>Cosa succede al margine se i costi materie prime salgono — clicca le intestazioni per ordinare ▼▲</div>
        </div>
      </div>
      <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden",marginBottom:28,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
        <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:580}}>
          <thead>
            <tr style={{background:"#F8F4F2"}}>
              <SortTH k="nome" active={sortKey==="nome"} dir={sortDir} onToggle={toggleSort}><Tip text="Nome del prodotto. Clicca per ordinare." width={200}><span style={{borderBottom:"1px dashed rgba(155,120,115,0.4)",cursor:"help"}}>Prodotto</span></Tip></SortTH>
              <SortTH k="margPct" right active={sortKey==="margPct"} dir={sortDir} onToggle={toggleSort}><Tip text="Margine lordo attuale (%) e valore assoluto per stampo con i prezzi correnti." width={240}><span style={{borderBottom:"1px dashed rgba(155,120,115,0.4)",cursor:"help"}}>Margine attuale</span></Tip></SortTH>
              <SortTH k="marg10" right active={sortKey==="marg10"} dir={sortDir} onToggle={toggleSort}><Tip text="Margine se il costo delle materie prime aumentasse del 10%. Simula inflazione o rincaro fornitore." width={260}><span style={{borderBottom:"1px dashed rgba(155,120,115,0.4)",cursor:"help"}}>FC +10% → marg.</span></Tip></SortTH>
              <SortTH k="marg20" right active={sortKey==="marg20"} dir={sortDir} onToggle={toggleSort}><Tip text="Margine se il costo delle materie prime aumentasse del 20%. Scenario pessimistico." width={250}><span style={{borderBottom:"1px dashed rgba(155,120,115,0.4)",cursor:"help"}}>FC +20% → marg.</span></Tip></SortTH>
              <SortTH k="ricavo" right active={sortKey==="ricavo"} dir={sortDir} onToggle={toggleSort}><Tip text="Il food cost dovrebbe raggiungere questo valore per azzerare il margine. Coincide col ricavo attuale." width={270}><span style={{borderBottom:"1px dashed rgba(155,120,115,0.4)",cursor:"help"}}>Break-even FC</span></Tip></SortTH>
              <SortTH k="headroom" right active={sortKey==="headroom"} dir={sortDir} onToggle={toggleSort}><Tip text="Di quanto può salire il food cost prima che il margine diventi negativo. Più alto = più resilienza." width={260}><span style={{borderBottom:"1px dashed rgba(155,120,115,0.4)",cursor:"help"}}>Headroom</span></Tip></SortTH>
            </tr>
          </thead>
          <tbody>
            {ss.map((r,i)=>(
              <tr key={r.nome} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:"#FDFAF7"}}>
                <TD bold>{r.nome}</TD>
                <TD right bold color={margColor(r.margPct)} mono>{euro(r.margine)} ({pct(r.margPct)})</TD>
                <TD right bold color={r.marg10>0?C.green:C.red} mono>{euro(r.marg10)}</TD>
                <TD right bold color={r.marg20>0?C.green:C.red} mono>{euro(r.marg20)}</TD>
                <TD right color={C.textMid} mono>{euro(r.ricavo)}</TD>
                <td style={{padding:"10px 14px",textAlign:"right"}}>
                  <span style={{background:r.headroom>50?C.greenLight:r.headroom>25?C.amberLight:C.redLight,
                    color:r.headroom>50?C.green:r.headroom>25?C.amber:C.red,
                    fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:6}}>
                    +{r.headroom.toFixed(0)}% FC tollerabile
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </>
  );
}

// ─── P&L VIEW ─────────────────────────────────────────────────────────────────
function PLView({ricettario, onUpdateRegola}) {
  const isMobile = useIsMobile();
  const ingCosti = useMemo(()=>buildIngCosti(ricettario?.ingredienti_costi||{}), [ricettario]);
  const ricette  = Object.values(ricettario?.ricette||{}).filter(r=>isRicettaValida(r.nome) && getR(r.nome, r).tipo!=="interno" && getR(r.nome,r).tipo!=="semilavorato");

  const euro = v => `€ ${Number(v).toFixed(2)}`;
  const pct  = v => `${Number(v).toFixed(1)}%`;

  const rows = ricette.map(ric => {
    const reg = getR(ric.nome, ric);
    const {tot:fc} = calcolaFC(ric, ingCosti, ricettario);
    const ricavo   = parseFloat((reg.unita * reg.prezzo).toFixed(2));
    const margine  = parseFloat((ricavo - fc).toFixed(2));
    const margPct  = ricavo>0 ? (margine/ricavo*100) : 0;
    const fcPct    = ricavo>0 ? (fc/ricavo*100) : 0;
    const fcUnita  = reg.unita>0 ? fc/reg.unita : 0;
    const mrgUnita = reg.prezzo - fcUnita;
    return {
      nome:ric.nome,
      short:ric.nome.replace(/^TORTA (DI |AL |ALLE? )/,"").split(" ").map(w=>w[0]+w.slice(1).toLowerCase()).join(" "),
      reg, fc, ricavo, margine, margPct, fcPct, fcUnita, mrgUnita,
    };
  }).sort((a,b)=>b.margPct-a.margPct);

  if (!rows.length) return <div style={{padding:60,textAlign:"center",color:C.textSoft}}>Carica il ricettario per vedere il P&L.</div>;

  const totRicavo  = rows.reduce((s,r)=>s+r.ricavo,0);
  const totFC      = rows.reduce((s,r)=>s+r.fc,0);
  const totMargine = rows.reduce((s,r)=>s+r.margine,0);
  const avgMarg    = rows.reduce((s,r)=>s+r.margPct,0)/rows.length;
  const best       = rows[0];
  const worst      = rows[rows.length-1];
  const fcAvg      = totRicavo>0 ? (totFC/totRicavo*100) : 0;

  // Waterfall data for the stacked overview
  const waterfallData = rows.map(r=>({
    name: r.short,
    fc:   parseFloat(r.fc.toFixed(2)),
    marg: parseFloat(r.margine.toFixed(2)),
    ricavo: parseFloat(r.ricavo.toFixed(2)),
    margPct: r.margPct,
  }));

  // Per-unit data
  const unitData = rows.map(r=>({
    name:   r.short,
    prezzo: parseFloat(r.reg.prezzo.toFixed(2)),
    fc:     parseFloat(r.fcUnita.toFixed(2)),
    marg:   parseFloat(r.mrgUnita.toFixed(2)),
    margPct: r.margPct,
  }));

  // Custom tooltip
  const Tip = ({active,payload,label}) => {
    if (!active||!payload?.length) return null;
    return (
      <div style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:10,
        padding:"12px 16px",fontSize:11,boxShadow:"0 4px 20px rgba(0,0,0,0.1)"}}>
        <div style={{fontWeight:800,color:C.text,marginBottom:6,fontSize:12}}>{label}</div>
        {payload.map((p,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",gap:20,color:p.color,marginBottom:2}}>
            <span style={{fontWeight:600}}>{p.name}</span>
            <span style={{fontWeight:800,fontFamily:"Georgia,serif"}}>€ {Number(p.value).toFixed(2)}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={{maxWidth:1200}}>

      {/* ── PAGE HEADER ─────────────────────────────────────────────────── */}
      <div style={{marginBottom:32}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
          <div>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.18em",textTransform:"uppercase",color:C.red,marginBottom:6}}>{nomeAttivita}</div>
            <h1 style={{margin:"0 0 8px",fontSize:30,fontWeight:900,color:C.text,letterSpacing:"-0.03em"}}>Profit & Loss</h1>
          </div>
          <button onClick={()=>exportPLMensile({ricavi:rows.map(r=>({categoria:r.nome,quantita:r.reg.unita,ricavo:r.ricavo})),costi:rows.map(r=>({categoria:r.nome,costo:r.fc,perc:r.fcPct}))},null,null,nomeAttivita)}
            style={{marginTop:8,padding:"8px 14px",borderRadius:8,border:"1px solid #E8DDD8",background:"#FFF",fontSize:12,fontWeight:700,color:"#6B4C44",cursor:"pointer",display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
            📄 Esporta PDF
          </button>
        </div>
        <p style={{margin:0,fontSize:12,color:C.textSoft,lineHeight:1.7,maxWidth:680}}>
          Analisi reddituale completa per prodotto: ricavi, food cost, margine lordo per stampo e per unità.
          I valori si basano sui prezzi di vendita e listino ingredienti HoReCa Torino correnti.
        </p>
      </div>

      {/* ── KPI STRIP ───────────────────────────────────────────────────── */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(6,1fr)",gap:10,marginBottom:36}}>
        {[
          {ico:"📦",lbl:"Prodotti",val:rows.length,sub:"nel listino",hi:true},
          {ico:"💰",lbl:"Ricavo/stampo",val:euro(totRicavo),sub:"somma tutti i prodotti",color:C.green},
          {ico:"🔴",lbl:"Food cost tot.",val:euro(totFC),sub:`FC ratio ${pct(fcAvg)}`,color:C.red},
          {ico:"✅",lbl:"Margine lordo",val:euro(totMargine),sub:`${pct(avgMarg)} medio`,color:margColor(avgMarg)},
          {ico:"🏆",lbl:"Miglior margine",val:best.short,sub:pct(best.margPct),color:C.green},
          {ico:"⚠️",lbl:"Da ottimizzare",val:worst.short,sub:pct(worst.margPct),color:C.red},
        ].map(({ico,lbl,val,sub,hi,color},i)=>(
          <div key={i} style={{background:hi?C.red:C.bgCard,border:`1px solid ${hi?C.redDark:C.border}`,
            borderRadius:10,padding:"14px 16px",boxShadow:hi?"0 2px 8px rgba(192,57,43,0.2)":"0 1px 3px rgba(0,0,0,0.04)"}}>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",
              color:hi?"rgba(255,255,255,0.55)":C.textSoft,marginBottom:4}}>
              {ico} <Tip text={({"Prodotti":"Numero di prodotti attivi nel ricettario, esclusi quelli ad uso interno come creme base.","Ricavo/stampo":"Somma dei ricavi potenziali per stampo di tutti i prodotti. Massimo incassabile se ogni stampo viene venduto completamente.","Food cost tot.":"Somma del food cost di tutti i prodotti per stampo. Il rapporto FC/Ricavo indica quanto del fatturato va in ingredienti.","Margine lordo":"Ricavo − Food cost totale. Margine prima di costi fissi (affitto, utilities) e costo del lavoro.","Miglior margine":"Il prodotto con la percentuale di margine più alta — il più redditizio per ogni € di ricavo.","Da ottimizzare":"Il prodotto con la percentuale di margine più bassa. Valuta se aumentare il prezzo o ridurre il food cost."})[lbl]} width={260}><span style={{cursor:"help",borderBottom:"1px dashed currentColor",borderBottomColor:hi?"rgba(255,255,255,0.3)":"rgba(155,120,115,0.5)"}}>{lbl}</span></Tip>
            </div>
            <div style={{fontSize:18,fontWeight:900,fontFamily:"Georgia,serif",letterSpacing:"-0.02em",
              color:hi?C.white:color||C.text,lineHeight:1.1}}>{val}</div>
            <div style={{fontSize:10,color:hi?"rgba(255,255,255,0.5)":C.textSoft,marginTop:3}}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ── SEZIONE 1: CONTO ECONOMICO VISIVO ──────────────────────────────── */}
      <BarreRicavo rows={rows} euro={euro} pct={pct} />

      {/* ── SEZIONE 2: TABELLA COMPLETA ──────────────────────────────────── */}
      <PLTable rows={rows} euro={euro} pct={pct}
        totRicavo={totRicavo} totFC={totFC} totMargine={totMargine}
        fcAvg={fcAvg} avgMarg={avgMarg} />

      {/* ── SEZIONE 3: TOP INGREDIENTI PER COSTO ─────────────────────────── */}
      <TopIngredientiTable ricettario={ricettario} ingCosti={ingCosti} euro={euro} pct={pct} />

      {/* ── SEZIONE 4: SCENARIO PREZZI ───────────────────────────────────── */}
      <ScenarioPrezzi rows={rows} euro={euro} pct={pct} />

      {/* ── SEZIONE 5: SENSITIVITY STATICA ──────────────────────────────── */}
      <SensTable rows={rows} euro={euro} pct={pct} />

      {/* ── GRAFICI IN FONDO ────────────────────────────────────────────── */}
      <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:14}}>
        <div style={{width:3,height:18,background:C.red,borderRadius:2,flexShrink:0,alignSelf:"center"}}/>
        <div>
          <h2 style={{margin:0,fontSize:14,fontWeight:800,color:C.text}}>Grafici di Riepilogo</h2>
          <div style={{fontSize:11,color:C.textSoft,marginTop:2}}>Visualizzazioni comparate tra tutti i prodotti</div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:20,marginBottom:28}}>
        {/* Grafico 1: margine % a barre orizzontali — più leggibile del bar verticale */}
        <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
          <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:16}}>Margine % per prodotto</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {[...rows].sort((a,b)=>b.margPct-a.margPct).map(r=>{
              const mc=margColor(r.margPct);
              return (
                <div key={r.nome}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:10,fontWeight:700,color:C.text}}>{r.short}</span>
                    <span style={{fontSize:11,fontWeight:900,color:mc,fontFamily:"Georgia,serif"}}>{pct(r.margPct)}</span>
                  </div>
                  <div style={{height:10,background:"#F0EAE6",borderRadius:5,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${Math.min(100,r.margPct)}%`,background:mc,borderRadius:5,transition:"width 0.5s ease"}}/>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{marginTop:14,paddingTop:12,borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",fontSize:10,color:C.textSoft}}>
            <span>0%</span><span style={{color:C.amber}}>50% — accettabile</span><span style={{color:C.green}}>70%+ target</span>
          </div>
        </div>

        {/* Grafico 2: scatter ricavo vs margine — identifica i campioni */}
        <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
          <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:4}}>Ricavo vs Margine per stampo</div>
          <div style={{fontSize:10,color:C.textSoft,marginBottom:16}}>In alto a destra = prodotto ideale</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={[...rows].sort((a,b)=>b.ricavo-a.ricavo)} layout="vertical"
              margin={{top:0,right:60,left:0,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0E8E4" horizontal={false}/>
              <XAxis type="number" tickFormatter={v=>`€${v.toFixed(0)}`}
                tick={{fill:C.textSoft,fontSize:9}} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="short" width={80}
                tick={{fill:C.textMid,fontSize:10,fontWeight:600}} axisLine={false} tickLine={false}/>
              <Tooltip formatter={(v,n)=>[`€ ${Number(v).toFixed(2)}`,n]} contentStyle={{borderRadius:8,border:`1px solid ${C.border}`,fontSize:11}}/>
              <Bar dataKey="ricavo"  name="Ricavo"  fill={C.green} fillOpacity={0.2} radius={[0,3,3,0]}/>
              <Bar dataKey="margine" name="Margine" radius={[0,3,3,0]}>
                {[...rows].sort((a,b)=>b.ricavo-a.ricavo).map((r,i)=>(
                  <Cell key={i} fill={margColor(r.margPct)} fillOpacity={0.85}/>
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{display:"flex",gap:16,marginTop:8,justifyContent:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:12,height:12,borderRadius:2,background:C.green,opacity:0.3}}/>
              <span style={{fontSize:9,color:C.textSoft}}>Ricavo totale</span>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:5}}>
              <div style={{width:12,height:12,borderRadius:2,background:C.green}}/>
              <span style={{fontSize:9,color:C.textSoft}}>Margine lordo</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── BENCHMARK BOX ────────────────────────────────────────────────── */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:12}}>
        <div style={{background:C.greenLight,border:`1px solid ${C.green}30`,borderRadius:12,padding:"20px 24px"}}>
          <div style={{fontSize:11,fontWeight:800,color:C.green,marginBottom:10}}>✅ Benchmark pasticceria artigianale</div>
          {[["Food cost ideale","< 28–30% del ricavo"],["Margine lordo target","70–72%"],["Margine lordo accettabile","55–70%"],["Sotto questa soglia","< 50% — costi fissi critici"]].map(([k,v])=>(
            <div key={k} style={{display:"flex",justifyContent:"space-between",borderBottom:`1px solid ${C.green}20`,padding:"5px 0",fontSize:11}}>
              <span style={{color:C.textMid,fontWeight:500}}>{k}</span>
              <span style={{color:C.green,fontWeight:700}}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{background:C.amberLight,border:`1px solid ${C.amber}30`,borderRadius:12,padding:"20px 24px"}}>
          <div style={{fontSize:11,fontWeight:800,color:C.amber,marginBottom:10}}>💡 Leve di ottimizzazione</div>
          {[["Aumentare prezzo +0,50€/fetta","Margine sale ~8–12 punti % su prodotti ad alto volume"],["Ridurre FC del 10%","Negozia forniture bulk o rivedi grammature"],["Tagliare prodotti < 50% marg.","Sostituisci con referenze più redditizie"],["Monitorare sell-through","Ogni fetta non venduta è margine perso"]].map(([k,v])=>(
            <div key={k} style={{borderBottom:`1px solid ${C.amber}20`,padding:"6px 0",fontSize:10}}>
              <div style={{color:C.amber,fontWeight:700,marginBottom:2}}>{k}</div>
              <div style={{color:C.textMid,lineHeight:1.4}}>{v}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}


// ─── SIMULATORE PREZZI VIEW ───────────────────────────────────────────────────
function SimulatorePrezziView({ ricettario, giornaliero }) {
  const ingCosti = useMemo(()=>buildIngCosti(ricettario?.ingredienti_costi||{}), [ricettario]);
  const ricette  = Object.values(ricettario?.ricette||{})
    .filter(r=>isRicettaValida(r.nome) && getR(r.nome,r).tipo!=="interno" && getR(r.nome,r).tipo!=="semilavorato");

  const euro = v => `€ ${Number(v).toFixed(2)}`;
  const pct  = v => `${Number(v).toFixed(1)}%`;

  const baseRows = ricette.map(ric => {
    const reg = getR(ric.nome, ric);
    const {tot:fc} = calcolaFC(ric, ingCosti, ricettario);
    const ricavo  = parseFloat((reg.unita * reg.prezzo).toFixed(2));
    const margine = parseFloat((ricavo - fc).toFixed(2));
    const margPct = ricavo>0?(margine/ricavo*100):0;
    return { nome:ric.nome, reg, fc, ricavo, margine, margPct,
      fcUnita: reg.unita>0?fc/reg.unita:0, mrgUnita: reg.prezzo-(reg.unita>0?fc/reg.unita:0) };
  }).sort((a,b)=>b.margPct-a.margPct);

  // Medie stampi da storico giornaliero
  const medieStampi = useMemo(()=>{
    const counts = {}, totals = {};
    for (const sess of (giornaliero||[])) {
      for (const p of (sess.prodotti||[])) {
        if (!counts[p.nome]) { counts[p.nome]=0; totals[p.nome]=0; }
        counts[p.nome]++;
        totals[p.nome] += (p.stampi||0);
      }
    }
    const out = {};
    for (const n of Object.keys(counts))
      out[n] = counts[n]>0 ? totals[n]/counts[n] : 0;
    return out;
  }, [giornaliero]);

  const hasStorico = (giornaliero||[]).length > 0;
  const [orizzonteGiorni, setOrizzonteGiorni] = useState(30);
  const [prezzi, setPrezzi] = useState(()=>
    Object.fromEntries(baseRows.map(r=>[r.nome, r.reg.prezzo.toFixed(2)]))
  );
  const setP = (nome, v) => setPrezzi(p=>({...p,[nome]:v}));
  const reset = () => setPrezzi(Object.fromEntries(baseRows.map(r=>[r.nome, r.reg.prezzo.toFixed(2)])));

  const scenRows = baseRows.map(r=>{
    const newPrezzo = Math.max(0, parseFloat(prezzi[r.nome])||0);
    const delta     = r.reg.prezzo>0?((newPrezzo-r.reg.prezzo)/r.reg.prezzo*100):0;
    const newRicavo = parseFloat((r.reg.unita * newPrezzo).toFixed(2));
    const newMarg   = parseFloat((newRicavo - r.fc).toFixed(2));
    const newMargPct= newRicavo>0?(newMarg/newRicavo*100):0;
    const mediaStampi = medieStampi[r.nome]||0;
    const giorniAttivi = hasStorico
      ? ((giornaliero||[]).filter(s=>(s.prodotti||[]).some(p=>p.nome===r.nome)).length)
      : 0;
    const totalSess = (giornaliero||[]).length||1;
    const freqGiorni = hasStorico ? (giorniAttivi/totalSess) : 1;
    const stampiPeriodo = mediaStampi * freqGiorni * orizzonteGiorni;
    // Proiezione base vs scenario
    const proiBase  = parseFloat((stampiPeriodo * r.margine).toFixed(2));
    const proiScen  = parseFloat((stampiPeriodo * newMarg).toFixed(2));
    const proiDiff  = parseFloat((proiScen - proiBase).toFixed(2));
    return { ...r, newPrezzo, delta, newRicavo, newMarg, newMargPct,
      diffMarg: parseFloat((newMarg-r.margine).toFixed(2)),
      diffMargPct: parseFloat((newMargPct-r.margPct).toFixed(1)),
      mediaStampi, stampiPeriodo, proiBase, proiScen, proiDiff,
      changed: Math.abs(delta)>0.01 };
  });

  const totBaseRicavo  = baseRows.reduce((s,r)=>s+r.ricavo,0);
  const totScenRicavo  = scenRows.reduce((s,r)=>s+r.newRicavo,0);
  const totBaseMarg    = baseRows.reduce((s,r)=>s+r.margine,0);
  const totScenMarg    = scenRows.reduce((s,r)=>s+r.newMarg,0);
  const totProiBase    = scenRows.reduce((s,r)=>s+r.proiBase,0);
  const totProiScen    = scenRows.reduce((s,r)=>s+r.proiScen,0);
  const totProiDiff    = scenRows.reduce((s,r)=>s+r.proiDiff,0);
  const hasChanges     = scenRows.some(r=>r.changed);

  return (
    <div style={{maxWidth:1200}}>
      {/* Header */}
      <div style={{marginBottom:28}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.18em",textTransform:"uppercase",color:C.red,marginBottom:6}}>{nomeAttivita}</div>
        <h1 style={{margin:"0 0 8px",fontSize:30,fontWeight:900,color:C.text,letterSpacing:"-0.03em"}}>Simulatore Prezzi</h1>
        <p style={{margin:0,fontSize:12,color:C.textSoft,lineHeight:1.7,maxWidth:680}}>
          Inserisci i nuovi prezzi per ogni prodotto. La proiezione futura usa le medie degli stampi dallo storico produzione
          {hasStorico?` (${(giornaliero||[]).length} sessioni registrate)`:" — carica sessioni di produzione per attivare le proiezioni"}.
        </p>
      </div>

      {/* Controlli orizzonte + reset */}
      <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:24,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,background:C.bgCard,border:`1px solid ${C.border}`,
          borderRadius:10,padding:"12px 18px",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
          <span style={{fontSize:11,fontWeight:700,color:C.textMid}}>Orizzonte proiezione:</span>
          {[7,14,30,60,90].map(g=>(
            <button key={g} onClick={()=>setOrizzonteGiorni(g)}
              style={{padding:"5px 12px",borderRadius:6,border:`1px solid ${orizzonteGiorni===g?C.red:C.border}`,
                background:orizzonteGiorni===g?C.red:"transparent",
                color:orizzonteGiorni===g?C.white:C.textMid,
                fontSize:11,fontWeight:700,cursor:"pointer"}}>
              {g}g
            </button>
          ))}
        </div>
        {hasChanges&&(
          <button onClick={reset}
            style={{padding:"9px 18px",borderRadius:8,border:`1px solid ${C.borderStr}`,
              background:"transparent",fontSize:11,fontWeight:700,color:C.textMid,cursor:"pointer"}}>
            ↺ Reset prezzi
          </button>
        )}
      </div>

      {/* KPI comparazione — appare solo con modifiche */}
      {hasChanges&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:28}}>
          {[
            {lbl:"Ricavo/stampo base",   val:euro(totBaseRicavo),  sub:"prezzi attuali", c:C.textMid},
            {lbl:"Ricavo/stampo scenario",val:euro(totScenRicavo), sub:`${totScenRicavo>totBaseRicavo?"+":""}${euro(totScenRicavo-totBaseRicavo)} vs base`,c:totScenRicavo>=totBaseRicavo?C.green:C.red},
            {lbl:"Margine/stampo scenario",val:euro(totScenMarg),  sub:`${totScenMarg>totBaseMarg?"+":""}${euro(totScenMarg-totBaseMarg)} vs base`,c:totScenMarg>=totBaseMarg?C.green:C.red,hi:true},
          ].map(({lbl,val,sub,c,hi})=>(
            <div key={lbl} style={{background:hi?C.red:C.bgCard,border:`1px solid ${hi?C.redDark:C.border}`,
              borderRadius:12,padding:"18px 20px",boxShadow:hi?"0 2px 8px rgba(192,57,43,0.18)":"0 1px 3px rgba(0,0,0,0.04)"}}>
              <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",
                color:hi?"rgba(255,255,255,0.55)":C.textSoft,marginBottom:4}}>{lbl}</div>
              <div style={{fontSize:22,fontWeight:900,fontFamily:"Georgia,serif",color:hi?C.white:c}}>{val}</div>
              <div style={{fontSize:10,color:hi?"rgba(255,255,255,0.5)":c,marginTop:3,fontWeight:600}}>{sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Proiezione futura — solo se storico disponibile e modifiche attive */}
      {hasChanges && hasStorico && (
        <div style={{background:"linear-gradient(135deg,#1C0A0A 0%,#2D1010 100%)",borderRadius:14,
          padding:"24px 28px",marginBottom:28,boxShadow:"0 4px 20px rgba(0,0,0,0.15)"}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.14em",textTransform:"uppercase",
            color:"rgba(255,160,120,0.7)",marginBottom:4}}>📈 Proiezione a {orizzonteGiorni} giorni</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.45)",marginBottom:20}}>
            Basata sulla media stampi prodotti per sessione dallo storico
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:20}}>
            {[
              {lbl:"Margine atteso (prezzi base)",   val:euro(totProiBase), c:"rgba(255,255,255,0.5)"},
              {lbl:"Margine atteso (scenario)",       val:euro(totProiScen), c:totProiScen>=totProiBase?"#7EE8A2":"#FF8080"},
              {lbl:"Differenza margine nel periodo", val:(totProiDiff>0?"+":"")+euro(totProiDiff),
                c:totProiDiff>0?"#7EE8A2":"#FF8080",big:true},
            ].map(({lbl,val,c,big})=>(
              <div key={lbl}>
                <div style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",
                  color:"rgba(255,255,255,0.35)",marginBottom:6}}>{lbl}</div>
                <div style={{fontSize:big?28:20,fontWeight:900,fontFamily:"Georgia,serif",color:c,lineHeight:1}}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Righe prodotto */}
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {scenRows.map(r=>{
          const mc = margColor(r.newMargPct);
          const dSign = r.delta>0?"+":"";
          return (
            <div key={r.nome} style={{background:r.changed?(r.delta>0?"#F6FBF7":"#FEF6F5"):C.white,
              border:`2px solid ${r.changed?(r.delta>0?"#C6EDD3":"#FAD5D0"):C.border}`,
              borderRadius:12,padding:"20px 24px",boxShadow:"0 1px 4px rgba(0,0,0,0.04)",
              transition:"border-color 0.2s"}}>

              <div style={{display:"flex",alignItems:"flex-start",gap:20,flexWrap:"wrap"}}>
                {/* Nome + badge variazione */}
                <div style={{minWidth:200,flexShrink:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                    <span style={{fontSize:14,fontWeight:900,color:C.text}}>{r.nome}</span>
                    {r.changed&&(
                      <span style={{padding:"3px 10px",borderRadius:6,fontSize:11,fontWeight:800,
                        background:r.delta>0?C.greenLight:C.redLight,
                        color:r.delta>0?C.green:C.red}}>
                        {dSign}{r.delta.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <div style={{fontSize:10,color:C.textSoft}}>
                    {r.reg.unita} {r.reg.tipo==="fetta"?"fette":"pz"}/stampo
                    {r.mediaStampi>0&&<span style={{marginLeft:8,color:C.amber}}>· media {r.mediaStampi.toFixed(1)} stampi/sessione</span>}
                  </div>
                </div>

                {/* Input prezzo */}
                <div style={{flexShrink:0}}>
                  <div style={{fontSize:8,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",color:C.textSoft,marginBottom:6}}>
                    Prezzo / {r.reg.tipo==="fetta"?"fetta":"pezzo"}
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:5,
                      padding:"4px 8px",background:"#F8F4F2",borderRadius:7,
                      fontSize:10,color:C.textSoft,fontWeight:600}}>
                      base {euro(r.reg.prezzo)}
                    </div>
                    <span style={{color:C.textSoft}}>→</span>
                    <div style={{display:"flex",alignItems:"center",gap:4}}>
                      <span style={{fontSize:13,fontWeight:800,color:C.textMid}}>€</span>
                      <input type="number" min="0" step="0.10"
                        value={prezzi[r.nome]}
                        onChange={e=>setP(r.nome, e.target.value)}
                        onBlur={e=>{ const v=parseFloat(e.target.value); if(!isNaN(v)) setP(r.nome,v.toFixed(2)); }}
                        style={{width:80,padding:"8px 10px",borderRadius:8,textAlign:"center",
                          border:`2px solid ${r.changed?(r.delta>0?C.green:C.red):C.border}`,
                          fontSize:16,fontWeight:900,color:r.changed?(r.delta>0?C.green:C.red):C.text,
                          fontFamily:"Georgia,serif",outline:"none",transition:"border-color 0.2s"}}/>
                    </div>
                  </div>
                </div>

                {/* KPI per stampo */}
                <div style={{display:"flex",gap:8,flexWrap:"wrap",flex:1}}>
                  {[
                    {lbl:"Ricavo/st.",  val:euro(r.newRicavo), c:C.text},
                    {lbl:"Margine/st.", val:euro(r.newMarg),   c:mc, bold:true},
                    {lbl:"Margine %",   val:pct(r.newMargPct), c:mc, bold:true,
                      sub:r.changed?(r.diffMargPct>0?"+":"")+r.diffMargPct.toFixed(1)+" pp":null},
                    {lbl:"Marg./unità", val:euro(r.newPrezzo-r.fcUnita), c:mc},
                  ].map(({lbl,val,c,bold,sub})=>(
                    <div key={lbl} style={{background:"#F8F4F2",borderRadius:8,padding:"10px 14px",textAlign:"center",minWidth:90}}>
                      <div style={{fontSize:8,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:C.textSoft,marginBottom:3}}>{lbl}</div>
                      <div style={{fontSize:13,fontWeight:bold?900:600,color:c,fontFamily:"Georgia,serif"}}>{val}</div>
                      {sub&&<div style={{fontSize:9,fontWeight:800,color:c,marginTop:2}}>{sub}</div>}
                    </div>
                  ))}
                </div>

                {/* Δ margine */}
                {r.changed&&(
                  <div style={{padding:"10px 16px",borderRadius:10,textAlign:"center",flexShrink:0,
                    background:r.diffMarg>0?C.greenLight:C.redLight,
                    border:`1px solid ${r.diffMarg>0?C.green:C.red}30`}}>
                    <div style={{fontSize:8,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",
                      color:r.diffMarg>0?C.green:C.red,marginBottom:3}}>Δ stampo</div>
                    <div style={{fontSize:18,fontWeight:900,color:r.diffMarg>0?C.green:C.red,fontFamily:"Georgia,serif"}}>
                      {r.diffMarg>0?"+":""}{euro(r.diffMarg)}
                    </div>
                    {r.proiDiff!==0&&hasStorico&&(
                      <>
                        <div style={{fontSize:8,fontWeight:700,color:r.proiDiff>0?C.green:C.red,
                          textTransform:"uppercase",letterSpacing:"0.06em",marginTop:8,marginBottom:2}}>
                          Δ {orizzonteGiorni}g
                        </div>
                        <div style={{fontSize:14,fontWeight:900,color:r.proiDiff>0?C.green:C.red,fontFamily:"Georgia,serif"}}>
                          {r.proiDiff>0?"+":""}{euro(r.proiDiff)}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── PRODUZIONE VIEW ──────────────────────────────────────────────────────────
function ProduzioneView({ricettario,mese,onSave,onAddAction}) {
  const ingCosti = useMemo(()=>buildIngCosti(ricettario?.ingredienti_costi||{}), [ricettario]);
  const ricette  = Object.keys(ricettario?.ricette||{}).filter(n=>isRicettaValida(n) && getR(n,ricettario?.ricette?.[n]).tipo!=="interno" && getR(n,ricettario?.ricette?.[n]).tipo!=="semilavorato");
  const [tab,setTab] = useState("dashboard");
  const [entries,setEntries] = useState(()=>{
    if (mese.entries?.length>0) return mese.entries.map(e=>({...e}));
    return ricette.map(nome=>{
      const reg=getR(nome, ricettario?.ricette?.[nome]);
      const {tot:fc}=calcolaFC(ricettario.ricette[nome], ingCosti, ricettario);
      return {ricettaNome:nome,stampiProdotti:0,stampiVenduti:0,prezzo:reg.prezzo,unita:reg.unita,fc,spreco:0,note:""};
    });
  });
  const [dirty,setDirty] = useState(false);
  const [aiData,setAiData] = useState(null);
  const [aiLoad,setAiLoad] = useState(false);

  const upd = (i,f,v)=>{ const n=[...entries]; n[i]={...n[i],[f]:f==="note"?v:parseFloat(v)||0}; setEntries(n); setDirty(true); };
  const save = ()=>{ onSave(entries); setDirty(false); };

  const rows = entries.map(e=>{
    const rs=e.unita*e.prezzo;
    const ricavi=(e.stampiVenduti||0)*rs;
    const fcTot=(e.stampiProdotti||0)*e.fc;
    const marg=ricavi-fcTot;
    const margPct=ricavi>0?(marg/ricavi*100):0;
    const st=e.stampiProdotti>0?(e.stampiVenduti/e.stampiProdotti*100):0;
    return {...e,rs,ricavi,fcTot,marg,margPct,st};
  });
  const hasData = rows.some(r=>r.stampiProdotti>0);
  const totR=rows.reduce((s,r)=>s+r.ricavi,0);
  const totFC=rows.reduce((s,r)=>s+r.fcTot,0);
  const totM=totR-totFC;
  const totMP=totR>0?(totM/totR*100):0;
  const totP=rows.reduce((s,r)=>s+(r.stampiProdotti||0),0);
  const totV=rows.reduce((s,r)=>s+(r.stampiVenduti||0),0);
  const st=totP>0?(totV/totP*100):0;

  const aiPrompt=`${nomeAttivita} — ${mese.label}. Ricavi totali €${totR.toFixed(2)}, food cost €${totFC.toFixed(2)}, margine lordo ${totMP.toFixed(1)}%. Stampi prodotti ${totP}, venduti ${totV}, sell-through ${st.toFixed(1)}%. Prodotti: ${rows.filter(r=>r.stampiProdotti>0).map(r=>`${r.ricettaNome} ${r.stampiProdotti}prod/${r.stampiVenduti}vend marg${r.margPct.toFixed(0)}%`).join(", ")}. ${mese.meteo?`Meteo: ${mese.meteo.tempMean}°C, ${mese.meteo.giorniSole}gg sole.`:""} Suggerisci 3 azioni concrete.`;
  const runAI=async()=>{ setAiLoad(true); setAiData(await getAI(aiPrompt,`mese-${mese.key}`,sload,ssave)); setAiLoad(false); };

  return (
    <div style={{maxWidth:1100}}>
      <div style={{marginBottom:24,display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.18em",textTransform:"uppercase",color:C.red,marginBottom:4}}>Produzione mensile</div>
          <h1 style={{margin:0,fontSize:26,fontWeight:900,color:C.text,letterSpacing:"-0.02em"}}>{mese.label}</h1>
          {mese.meteo&&<div style={{fontSize:11,color:C.textSoft,marginTop:4}}>☀️ {mese.meteo.giorniSole}gg sole · 🌧 {mese.meteo.giorniPioggia}gg pioggia · {mese.meteo.tempMean}°C media</div>}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {dirty&&<span style={{fontSize:10,color:C.amber,fontWeight:600}}>● Non salvato</span>}
          <button onClick={save} style={{padding:"8px 20px",background:C.red,color:C.white,border:"none",borderRadius:8,fontWeight:700,fontSize:11,cursor:"pointer"}}>💾 Salva</button>
        </div>
      </div>

      <div style={{display:"flex",gap:4,marginBottom:24,borderBottom:`2px solid ${C.border}`}}>
        {[["dashboard","📊 Dashboard"],["inserimento","✏️ Inserimento dati"],["ai","🤖 Analisi AI"]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{padding:"8px 18px",border:"none",background:"transparent",cursor:"pointer",fontSize:11,fontWeight:700,color:tab===id?C.red:C.textSoft,borderBottom:tab===id?`2px solid ${C.red}`:"2px solid transparent",marginBottom:-2,transition:"all 0.12s"}}>
            {lbl}
          </button>
        ))}
      </div>

      {tab==="dashboard"&&(
        !hasData ? (
          <div style={{textAlign:"center",padding:"70px 20px",color:C.textSoft}}>
            <div style={{fontSize:36,marginBottom:14}}>📋</div>
            <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:8}}>Nessun dato per {mese.label}</div>
            <div style={{fontSize:12,marginBottom:20}}>Inserisci gli stampi prodotti e venduti per vedere i risultati.</div>
            <button onClick={()=>setTab("inserimento")} style={{padding:"10px 24px",background:C.red,color:C.white,border:"none",borderRadius:8,fontWeight:700,fontSize:12,cursor:"pointer"}}>✏️ Inserisci dati</button>
          </div>
        ) : (
          <>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:28}}>
              <KPI icon="💰" label="Ricavi totali" value={fmt(totR)} highlight/>
              <KPI icon="🧾" label="Food cost" value={fmt(totFC)} color={C.red}/>
              <KPI icon="📈" label="Margine lordo" value={fmt(totM)} color={margColor(totMP)}/>
              <KPI icon="%" label="Margine %" value={fmtp(totMP)} color={margColor(totMP)}/>
              <KPI icon="🎯" label="Sell-through" value={fmtp(st)} sub={`${totV}/${totP} stampi`} color={st>=80?C.green:st>=60?C.amber:C.red}/>
            </div>
            <SH>Risultati per Prodotto</SH>
            <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden",marginBottom:24,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead>
                  <tr style={{background:"#F8F4F2"}}>
                    {["Prodotto","Prodotti","Venduti","Sell-T %","Ricavi €","Food Cost €","Margine €","Margine %"].map((h,i)=>(
                      <th key={i} style={{padding:"10px 12px",textAlign:i===0?"left":"right",fontSize:8,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",color:C.textSoft,borderBottom:`1px solid ${C.border}`}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.filter(r=>r.stampiProdotti>0).sort((a,b)=>b.ricavi-a.ricavi).map((r,i)=>(
                    <tr key={r.ricettaNome} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:"#FDFAF7"}}>
                      <td style={{padding:"10px 12px",fontWeight:700,color:C.text}}>{r.ricettaNome}</td>
                      <td style={{padding:"10px 12px",textAlign:"right",color:C.textMid}}>{r.stampiProdotti}</td>
                      <td style={{padding:"10px 12px",textAlign:"right",color:C.textMid}}>{r.stampiVenduti}</td>
                      <td style={{padding:"10px 12px",textAlign:"right",fontWeight:700,color:r.st>=80?C.green:r.st>=60?C.amber:C.red}}>{fmtp(r.st)}</td>
                      <td style={{padding:"10px 12px",textAlign:"right",fontWeight:600,color:C.text}}>{fmt(r.ricavi)}</td>
                      <td style={{padding:"10px 12px",textAlign:"right",color:C.red}}>{fmt(r.fcTot)}</td>
                      <td style={{padding:"10px 12px",textAlign:"right",fontWeight:800,color:r.marg>=0?C.green:C.red,fontFamily:"Georgia,serif"}}>{fmt(r.marg)}</td>
                      <td style={{padding:"10px 12px",textAlign:"right"}}>{margBadge(r.margPct)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{background:"#F0EAE6",borderTop:`2px solid ${C.borderStr}`}}>
                    <td style={{padding:"10px 12px",fontWeight:900,color:C.text}}>TOTALE</td>
                    <td style={{padding:"10px 12px",textAlign:"right",fontWeight:700}}>{totP}</td>
                    <td style={{padding:"10px 12px",textAlign:"right",fontWeight:700}}>{totV}</td>
                    <td style={{padding:"10px 12px",textAlign:"right",fontWeight:700,color:margColor(st)}}>{fmtp(st)}</td>
                    <td style={{padding:"10px 12px",textAlign:"right",fontWeight:900,fontFamily:"Georgia,serif"}}>{fmt(totR)}</td>
                    <td style={{padding:"10px 12px",textAlign:"right",fontWeight:700,color:C.red}}>{fmt(totFC)}</td>
                    <td style={{padding:"10px 12px",textAlign:"right",fontWeight:900,color:margColor(totMP),fontFamily:"Georgia,serif"}}>{fmt(totM)}</td>
                    <td style={{padding:"10px 12px",textAlign:"right"}}>{margBadge(totMP)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )
      )}

      {tab==="inserimento"&&(
        <div>
          <div style={{fontSize:11,color:C.textSoft,marginBottom:20,lineHeight:1.7}}>Inserisci stampi prodotti e venduti. Il ricavo e il food cost vengono calcolati automaticamente.</div>
          <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden",marginBottom:20,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead>
                <tr style={{background:"#F8F4F2"}}>
                  {["Prodotto","Ricavo / stampo","FC / stampo","Prodotti","Venduti","Spreco","Note"].map((h,i)=>(
                    <th key={i} style={{padding:"10px 14px",textAlign:i===0?"left":"center",fontSize:9,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",color:C.textSoft,borderBottom:`1px solid ${C.border}`}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e,i)=>{
                  const rs=e.unita*e.prezzo;
                  const reg=getR(e.ricettaNome, ricettario?.ricette?.[e.ricettaNome]);
                  return (
                    <tr key={e.ricettaNome} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:"#FDFAF7"}}>
                      <td style={{padding:"10px 14px",fontWeight:700,color:C.text}}>
                        {e.ricettaNome}
                        <div style={{fontSize:9,color:C.textSoft,marginTop:1}}>{reg.unita} {reg.tipo==="fetta"?"fette":"pezzi"} × {fmt(reg.prezzo)}</div>
                      </td>
                      <td style={{padding:"10px 14px",textAlign:"center",fontWeight:700,color:C.green}}>{fmt(rs)}</td>
                      <td style={{padding:"10px 14px",textAlign:"center",color:C.red}}>{fmt(e.fc)}</td>
                      {["stampiProdotti","stampiVenduti","spreco"].map(f=>(
                        <td key={f} style={{padding:"6px 8px",textAlign:"center"}}>
                          <input type="number" min="0" step="1" value={e[f]||""} onChange={ev=>upd(i,f,ev.target.value)}
                            style={{width:66,padding:"7px 8px",borderRadius:7,border:`1px solid ${C.borderStr}`,background:C.white,fontSize:13,textAlign:"center",fontWeight:700,color:C.text}}/>
                        </td>
                      ))}
                      <td style={{padding:"6px 8px"}}>
                        <input type="text" value={e.note||""} onChange={ev=>upd(i,"note",ev.target.value)} placeholder="note…"
                          style={{width:"100%",padding:"7px 8px",borderRadius:7,border:`1px solid ${C.borderStr}`,background:C.white,fontSize:11,color:C.text}}/>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end"}}>
            <button onClick={save} style={{padding:"10px 28px",background:C.red,color:C.white,border:"none",borderRadius:9,fontWeight:800,fontSize:12,cursor:"pointer",letterSpacing:"0.02em"}}>💾 Salva dati {mese.label}</button>
          </div>
        </div>
      )}

      {tab==="ai"&&(
        <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"24px",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
            <div>
              <div style={{fontSize:13,fontWeight:800,color:C.text,marginBottom:4}}>🤖 Consulenza AI — {mese.label}</div>
              <div style={{fontSize:11,color:C.textSoft}}>Analisi automatica basata sui tuoi dati. Aggiornata ad ogni richiesta.</div>
            </div>
            {hasData&&<button onClick={runAI} disabled={aiLoad} style={{padding:"9px 20px",background:aiLoad?"#EEE":C.red,color:aiLoad?C.textSoft:C.white,border:"none",borderRadius:8,fontWeight:700,fontSize:11,cursor:aiLoad?"default":"pointer"}}>{aiLoad?"⏳ Elaboro…":"▶ Analizza ora"}</button>}
          </div>
          {!hasData&&<div style={{color:C.textSoft,fontSize:12}}>Inserisci prima i dati di produzione nella tab "Inserimento dati".</div>}
          {aiData&&(
            <div>
              <div style={{padding:"16px 18px",background:"#F8F4F2",borderRadius:10,marginBottom:16,fontSize:12,color:C.text,lineHeight:1.75}}>{aiData.sintesi}</div>
              {aiData.alert&&<div style={{padding:"10px 16px",background:C.amberLight,border:`1px solid ${C.amber}30`,borderRadius:8,fontSize:11,color:C.amber,fontWeight:600,marginBottom:16}}>⚠️ {aiData.alert}</div>}
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
                {(aiData.azioni||[]).map((a,i)=>(
                  <div key={i} style={{background:C.white,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px"}}>
                    <div style={{width:26,height:26,background:C.red,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,color:C.white,marginBottom:10}}>{i+1}</div>
                    <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:6}}>{a.titolo}</div>
                    <div style={{fontSize:11,color:C.textMid,lineHeight:1.65}}>{a.desc}</div>
                    {onAddAction&&<button onClick={()=>onAddAction({label:a.titolo,azione:a.desc,fonte:`mese-${mese.key}`,meseSorgente:mese.key})} style={{marginTop:12,padding:"5px 12px",background:C.greenLight,color:C.green,border:`1px solid ${C.green}30`,borderRadius:6,fontSize:9,fontWeight:700,cursor:"pointer",letterSpacing:"0.05em"}}>+ TRACCIA AZIONE</button>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── AZIONI VIEW ──────────────────────────────────────────────────────────────
// ─── AI AGENT VIEW ────────────────────────────────────────────────────────────
function AzioniView({ actions, onUpdate, onDelete, ricettario, giornaliero, chiusure, magazzino }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState("chat"); // "chat" | "azioni"
  const bottomRef               = useRef(null);
  const inputRef                = useRef(null);

  // Scroll to bottom on new messages
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);

  // Build rich context from all dashboard state
  const buildContext = () => {
    const ingCosti = buildIngCosti(ricettario?.ingredienti_costi || {});
    const ricette  = Object.values(ricettario?.ricette || {}).filter(r => isRicettaValida(r.nome) && getR(r.nome,r).tipo !== "interno" && getR(r.nome,r).tipo !== "semilavorato");

    const riepilogoRicette = ricette.map(ric => {
      const reg = getR(ric.nome, ric);
      const { tot: fc, mancanti } = calcolaFC(ric, ingCosti, ricettario);
      const ricavo  = reg.unita * reg.prezzo;
      const margine = ricavo - fc;
      const margPct = ricavo > 0 ? (margine / ricavo * 100) : 0;
      const ingList = (ric.ingredienti || []).map(i => `${i.nome} ${i.qty1stampo}g`).join(", ");
      return `- ${ric.nome}: ${reg.unita} ${reg.tipo}e × €${reg.prezzo} = ricavo €${ricavo.toFixed(2)}, FC €${fc.toFixed(2)} (${fc > 0 ? (fc / ricavo * 100).toFixed(1) : 0}%), margine €${margine.toFixed(2)} (${margPct.toFixed(1)}%)${mancanti.length > 0 ? ` [prezzi mancanti: ${mancanti.join(", ")}]` : ""}. Ingredienti: ${ingList}`;
    }).join("\n");

    const totRicavo  = ricette.reduce((s, r) => { const rg = getR(r.nome, r); const { tot: fc } = calcolaFC(r, ingCosti, ricettario); return s + rg.unita * rg.prezzo; }, 0);
    const totFC      = ricette.reduce((s, r) => { const { tot: fc } = calcolaFC(r, ingCosti, ricettario); return s + fc; }, 0);
    const totMargine = totRicavo - totFC;
    const avgMarg    = totRicavo > 0 ? (totMargine / totRicavo * 100) : 0;

    // Produzioni recenti
    const ultimi10 = [...(giornaliero || [])].sort((a,b) => b.data?.localeCompare(a.data)).slice(0, 10);
    const produzioneRec = ultimi10.map(s =>
      `- ${s.data}: ${(s.sessione || []).map(p => `${p.nome} ${p.stampi} stampi (vendibile: ${p.vendibile})`).join(", ")}`
    ).join("\n");

    // Chiusure recenti
    const ultimeChiusure = [...(chiusure || [])].sort((a,b) => b.data?.localeCompare(a.data)).slice(0, 5);
    const chiusureRec = ultimeChiusure.map(c =>
      `- ${c.data}: venduto €${c.kpi?.totV?.toFixed(2) || 0}, FC €${c.kpi?.totFC?.toFixed(2) || 0}, margine €${c.kpi?.totM?.toFixed(2) || 0} (${c.kpi?.totMP?.toFixed(1) || 0}%)`
    ).join("\n");

    // Magazzino alert
    const magAlerts = Object.values(magazzino || {}).filter(m => m.giacenza_g <= m.soglia_g);
    const magStr = magAlerts.length > 0
      ? magAlerts.map(m => `${m.nome}: ${m.giacenza_g}g (soglia ${m.soglia_g}g)`).join(", ")
      : "nessun ingrediente sotto soglia";

    // Azioni aperte
    const azioniAperte = (actions || []).filter(a => a.stato !== "chiusa");
    const azioniStr = azioniAperte.length > 0
      ? azioniAperte.map(a => `- ${a.label}: ${a.azione}`).join("\n")
      : "nessuna azione aperta";

    return `Sei l'assistente AI della {nomeAttivita}. Hai accesso completo ai dati del gestionale. Rispondi in italiano, in modo professionale ma caldo, come un consulente esperto di pasticceria artigianale e food cost.

## RICETTARIO E P&L
${riepilogoRicette}

## RIEPILOGO P&L TOTALE
- Ricavo totale per stampo (tutti prodotti): €${totRicavo.toFixed(2)}
- Food cost totale: €${totFC.toFixed(2)} (${totRicavo > 0 ? (totFC / totRicavo * 100).toFixed(1) : 0}%)
- Margine lordo totale: €${totMargine.toFixed(2)} (${avgMarg.toFixed(1)}%)
- Benchmark settore: margine ≥ 70%, FC < 30%

## PRODUZIONI RECENTI (ultime 10 sessioni)
${produzioneRec || "nessuna sessione registrata"}

## CHIUSURE RECENTI (ultime 5)
${chiusureRec || "nessuna chiusura registrata"}

## MAGAZZINO - INGREDIENTI SOTTO SOGLIA
${magStr}

## AZIONI APERTE
${azioniStr}

## ISTRUZIONI
- Analizza i dati reali sopra quando rispondi
- Fornisci insights concreti con numeri specifici
- Suggerisci next step pratici e prioritizzati
- Per domande sulla struttura del sito, spiega le sezioni disponibili: Ricettario, P&L, Simulatore Prezzi, Produzione Giornaliera, Chiusura, Storico, Magazzino, e questa sezione AI
- Se ti chiedono "cosa fare" suggerisci le 3 azioni più impattanti basandoti sui dati
- Mantieni le risposte concise ma complete (max 300 parole)`;
  };

  const QUICK_PROMPTS = [
    { icon:"📊", label:"Analisi P&L", q:"Analizza il mio P&L attuale: quali prodotti devo ottimizzare e perché?" },
    { icon:"💡", label:"Next step", q:"Quali sono le 3 azioni più urgenti che dovrei fare questa settimana per migliorare la redditività?" },
    { icon:"🗺️", label:"Come funziona", q:"Spiegami la struttura del gestionale: cosa c'è in ogni sezione e come usarla al meglio." },
    { icon:"📦", label:"Magazzino", q:"Ho qualche problema con il magazzino? Cosa devo rifornire?" },
    { icon:"🍰", label:"Miglior prodotto", q:"Qual è il prodotto più redditizio? E quello che mi conviene spingere di più?" },
    { icon:"⚠️", label:"Rischi", q:"Ci sono ingredienti o prodotti che mi espongono a rischi economici? Identifica le vulnerabilità." },
  ];

  const sendMessage = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput("");
    const userMsg = { role:"user", content:q, ts:Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    try {
      const ctx = buildContext();
      const history = messages.slice(-6).map(m => ({ role:m.role, content:m.content }));
      const res = await fetch("/api/ai", {
        method:"POST",
        headers:{ "Content-Type":"application/json", "Authorization":`Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: ctx,
          messages: [...history, { role:"user", content:q }],
        }),
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || "Errore nella risposta.";
      setMessages(prev => [...prev, { role:"assistant", content:reply, ts:Date.now() }]);
    } catch(e) {
      setMessages(prev => [...prev, { role:"assistant", content:"⚠️ Errore di connessione. Riprova.", ts:Date.now() }]);
    }
    setLoading(false);
  };

  const aperte  = (actions || []).filter(a => a.stato !== "chiusa");
  const chiuse  = (actions || []).filter(a => a.stato === "chiusa");

  return (
    <div style={{maxWidth:900,display:"flex",flexDirection:"column",gap:0}}>
      {/* Header */}
      <div style={{marginBottom:24}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.18em",textTransform:"uppercase",color:C.red,marginBottom:6}}>Intelligenza Artificiale</div>
        <h1 style={{margin:"0 0 6px",fontSize:26,fontWeight:900,color:C.text,letterSpacing:"-0.02em"}}>Assistente AI</h1>
        <p style={{margin:0,fontSize:12,color:C.textSoft,lineHeight:1.7}}>
          Fai domande sulla tua pasticceria — analisi P&L, ottimizzazioni, struttura del gestionale, next step. L'AI ha accesso a tutti i tuoi dati in tempo reale.
        </p>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:2,marginBottom:20,background:"#F0EAE6",borderRadius:9,padding:3,width:"fit-content"}}>
        {[["chat","💬 Chat AI"],["azioni","✅ Azioni (" + aperte.length + ")"]].map(([t,lbl])=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{padding:"7px 18px",borderRadius:7,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,
              background:tab===t?C.white:"transparent",
              color:tab===t?C.text:C.textSoft,
              boxShadow:tab===t?"0 1px 4px rgba(0,0,0,0.08)":"none",transition:"all 0.15s"}}>
            {lbl}
          </button>
        ))}
      </div>

      {/* ── TAB CHAT ── */}
      {tab==="chat"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {/* Quick prompts */}
          {messages.length===0&&(
            <div>
              <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:C.textSoft,marginBottom:10}}>Domande rapide</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                {QUICK_PROMPTS.map(({icon,label,q})=>(
                  <button key={label} onClick={()=>sendMessage(q)}
                    style={{padding:"12px 14px",borderRadius:10,border:`1px solid ${C.border}`,background:C.white,
                      cursor:"pointer",textAlign:"left",transition:"all 0.15s",
                      boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
                    <div style={{fontSize:18,marginBottom:4}}>{icon}</div>
                    <div style={{fontSize:11,fontWeight:800,color:C.text,marginBottom:2}}>{label}</div>
                    <div style={{fontSize:9,color:C.textSoft,lineHeight:1.4}}>{q.slice(0,55)}…</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.length > 0 && (
            <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:14,
              maxHeight:480,overflowY:"auto",padding:"20px"}}>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                {messages.map((m,i)=>(
                  <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",
                    flexDirection:m.role==="user"?"row-reverse":"row"}}>
                    <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,
                      background:m.role==="user"?C.red:C.bgSide,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:12}}>
                      {m.role==="user"?"👤":"🍰"}
                    </div>
                    <div style={{maxWidth:"78%",padding:"10px 14px",borderRadius:12,lineHeight:1.65,
                      fontSize:12,color:C.text,whiteSpace:"pre-wrap",
                      background:m.role==="user"?"#F0EAE6":C.white,
                      border:`1px solid ${m.role==="user"?C.borderStr:C.border}`,
                      borderTopRightRadius:m.role==="user"?2:12,
                      borderTopLeftRadius:m.role==="user"?12:2,
                      boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {loading&&(
                  <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                    <div style={{width:28,height:28,borderRadius:"50%",background:C.bgSide,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>🍰</div>
                    <div style={{padding:"10px 16px",borderRadius:12,background:C.white,border:`1px solid ${C.border}`,fontSize:12,color:C.textSoft}}>
                      <span style={{display:"inline-flex",gap:4}}>
                        {[0,1,2].map(i=>(
                          <span key={i} style={{width:6,height:6,borderRadius:"50%",background:C.textSoft,display:"inline-block",
                            animation:`pulse 1.2s ease-in-out ${i*0.2}s infinite`}}/>
                        ))}
                      </span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef}/>
              </div>
            </div>
          )}

          {/* Input area */}
          <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
            {messages.length > 0 && (
              <button onClick={()=>setMessages([])}
                style={{padding:"10px 14px",borderRadius:9,border:`1px solid ${C.border}`,background:C.white,
                  fontSize:11,fontWeight:600,color:C.textSoft,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>
                ↺ Nuova chat
              </button>
            )}
            <div style={{flex:1,position:"relative"}}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();} }}
                placeholder="Chiedi qualcosa... (Invio per inviare, Shift+Invio per andare a capo)"
                rows={2}
                style={{width:"100%",padding:"12px 48px 12px 14px",borderRadius:10,
                  border:`2px solid ${input.trim()?C.red:C.border}`,
                  fontSize:12,lineHeight:1.5,color:C.text,background:C.white,
                  resize:"none",outline:"none",boxSizing:"border-box",
                  transition:"border-color 0.2s",fontFamily:"inherit"}}
              />
              <button onClick={()=>sendMessage()}
                disabled={!input.trim()||loading}
                style={{position:"absolute",right:10,bottom:10,
                  width:32,height:32,borderRadius:8,border:"none",
                  background:input.trim()&&!loading?C.red:"#E8DDD8",
                  color:C.white,fontSize:16,cursor:input.trim()&&!loading?"pointer":"default",
                  display:"flex",alignItems:"center",justifyContent:"center",
                  transition:"background 0.15s"}}>
                ↑
              </button>
            </div>
          </div>
          {messages.length === 0 && (
            <div style={{fontSize:10,color:C.textSoft,textAlign:"center"}}>
              L'AI ha accesso a ricettario, P&L, produzioni, chiusure e magazzino · I dati non lasciano il browser
            </div>
          )}
        </div>
      )}

      {/* ── TAB AZIONI ── */}
      {tab==="azioni"&&(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {(actions||[]).length===0&&(
            <div style={{padding:"48px 0",textAlign:"center",color:C.textSoft,fontSize:13}}>
              Nessuna azione salvata. Usa la chat AI e chiedi di suggerire azioni concrete — poi salvale qui per tracciarle nel tempo.
            </div>
          )}
          {aperte.length>0&&(
            <>
              <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:C.textSoft}}>Aperte / In corso · {aperte.length}</div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {aperte.map(a=>(
                  <div key={a.id} style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:10,padding:"14px 18px",display:"flex",gap:14,alignItems:"flex-start",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:4}}>{a.label}</div>
                      <div style={{fontSize:11,color:C.textMid,lineHeight:1.6}}>{a.azione}</div>
                      <div style={{fontSize:9,color:C.textSoft,marginTop:5}}>{new Date(a.createdAt).toLocaleDateString("it-IT")}</div>
                    </div>
                    <div style={{display:"flex",gap:5,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
                      {["aperta","in_corso","chiusa"].map(s=>(
                        <button key={s} onClick={()=>onUpdate(a.id,{stato:s})}
                          style={{padding:"4px 10px",borderRadius:6,border:`1px solid ${a.stato===s?C.red:C.border}`,
                            background:a.stato===s?C.redLight:C.white,color:a.stato===s?C.red:C.textSoft,
                            fontSize:9,fontWeight:700,cursor:"pointer"}}>
                          {s==="aperta"?"Aperta":s==="in_corso"?"In corso":"✓ Chiudi"}
                        </button>
                      ))}
                      <button onClick={()=>onDelete(a.id)} style={{padding:"4px 8px",borderRadius:6,border:`1px solid ${C.border}`,background:C.white,color:C.textSoft,fontSize:9,cursor:"pointer"}}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {chiuse.length>0&&(
            <>
              <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:C.textSoft,marginTop:8}}>Completate · {chiuse.length}</div>
              <div style={{display:"flex",flexDirection:"column",gap:5,opacity:0.55}}>
                {chiuse.map(a=>(
                  <div key={a.id} style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontSize:11,fontWeight:600,color:C.text}}>✓ {a.label}</div>
                    <button onClick={()=>onDelete(a.id)} style={{padding:"3px 8px",borderRadius:5,border:`1px solid ${C.border}`,background:C.white,color:C.textSoft,fontSize:9,cursor:"pointer"}}>✕</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <style>{`@keyframes pulse{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1.1)}}`}</style>
    </div>
  );
}


// ─── MODALE ───────────────────────────────────────────────────────────────────
function NuovoMeseModal({onCrea,onClose}) {
  const now=new Date();
  const [m,setM]=useState(now.getMonth()+1);
  const [y,setY]=useState(now.getFullYear());
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}}>
      <div style={{background:C.white,borderRadius:16,padding:"28px 32px",width:320,boxShadow:"0 12px 48px rgba(0,0,0,0.18)"}}>
        <h2 style={{margin:"0 0 20px",fontSize:18,fontWeight:900,color:C.text}}>Nuovo mese</h2>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:24}}>
          {[
            {lbl:"Mese",el:<select value={m} onChange={e=>setM(+e.target.value)} style={{width:"100%",padding:"9px 10px",borderRadius:8,border:`1px solid ${C.borderStr}`,fontSize:12,color:C.text,background:C.white}}>{MN.slice(1).map((mn,i)=><option key={i+1} value={i+1}>{mn}</option>)}</select>},
            {lbl:"Anno",el:<input type="number" value={y} onChange={e=>setY(+e.target.value)} style={{width:"100%",padding:"9px 10px",borderRadius:8,border:`1px solid ${C.borderStr}`,fontSize:12,color:C.text}}/>},
          ].map(({lbl,el})=>(
            <div key={lbl}>
              <label style={{fontSize:9,fontWeight:700,color:C.textSoft,textTransform:"uppercase",letterSpacing:"0.09em",display:"block",marginBottom:6}}>{lbl}</label>
              {el}
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:10}}>
          <button onClick={()=>onCrea(m,y)} style={{flex:1,padding:"11px",background:C.red,color:C.white,border:"none",borderRadius:9,fontWeight:800,fontSize:12,cursor:"pointer"}}>Crea</button>
          <button onClick={onClose} style={{flex:1,padding:"11px",background:C.bgCard,color:C.textMid,border:`1px solid ${C.border}`,borderRadius:9,fontWeight:600,fontSize:12,cursor:"pointer"}}>Annulla</button>
        </div>
      </div>
    </div>
  );
}

// ─── MAGAZZINO VIEW ───────────────────────────────────────────────────────────
// magazzino: { [nomeIng]: { nome, giacenza_g, soglia_g, ultimoRifornimento } }
// logRifornimenti: [{ id, data, ingrediente, quantita_g, note }]

function calcolaFabbisognoSettimana(ricettario, giornaliero) {
  // Prendi le ultime 7 sessioni di produzione per stimare il fabbisogno settimanale
  const ultimi7 = [...(giornaliero||[])].sort((a,b)=>b.data.localeCompare(a.data)).slice(0,7);
  const fabb = {}; // { nomeIng_lower: g_totali }
  for (const sess of ultimi7) {
    for (const prod of (sess.prodotti||[])) {
      const ric = Object.values(ricettario?.ricette||{}).find(r=>r.nome===prod.nome);
      if (!ric) continue;
      for (const ing of (ric.ingredienti||[])) {
        const k = normIng(ing.nome);
        fabb[k] = (fabb[k]||0) + ing.qty1stampo * prod.stampi;
      }
    }
  }
  // Se non ci sono dati storici, stima 1 stampo/ricetta/settimana
  if (ultimi7.length === 0 && ricettario) {
    for (const ric of Object.values(ricettario.ricette||{})) {
      if (getR(ric.nome, ric).tipo==="interno") continue;
      for (const ing of (ric.ingredienti||[])) {
        const k = normIng(ing.nome);
        fabb[k] = (fabb[k]||0) + ing.qty1stampo;
      }
    }
  }
  return fabb;
}

function MagazzinoView({ ricettario, magazzino, setMagazzino, logRif, setLogRif, giornaliero, notify, esclusi=new Set(), setEsclusi, onImportPrezzi, onImportPrezziOCR }) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState("giacenze");
  const [deleteIngConf, setDeleteIngConf] = useState(null); // key ingrediente da eliminare
  const [deleteIngPin,  setDeleteIngPin]  = useState("");
  const [formIng, setFormIng] = useState("");
  const [formQty, setFormQty] = useState("");
  const [formNote, setFormNote] = useState("");
  const [formMode, setFormMode] = useState("carico"); // "carico" | "scarico"
  const { sort:sortMag, sortKey:magKey, sortDir:magDir, toggleSort:magToggle } = useSortable("stato");
  // Quick-load: click on row → prefills carico form
  const [quickLoad, setQuickLoad] = useState(null);
  const [editSoglia, setEditSoglia] = useState(null); // { nome, val }
  const [showAddIng, setShowAddIng] = useState(false);
  const [newIngNome, setNewIngNome] = useState("");
  const [newIngQty, setNewIngQty] = useState("");
  const [newIngSoglia, setNewIngSoglia] = useState("");

  const handleDeleteIng = k => {
    // 1. Remove from magazzino
    const nm = {...magazzino};
    delete nm[k];
    setMagazzino(nm);
    ssave(SK_MAG, nm);
    // 2. Add to persistent exclusion list so it doesn't reappear from ricettario
    const nuoviEsclusi = new Set(esclusi);
    nuoviEsclusi.add(k);
    if(setEsclusi) setEsclusi(nuoviEsclusi);
    ssave(SK_EXCL, [...nuoviEsclusi]);
    // 3. Close modal
    setDeleteIngConf(null);
    setDeleteIngPin("");
    notify("✓ Ingrediente eliminato dal sistema");
  };

  // Costruisce lista ingredienti unione ricettario + magazzino, esclusi quelli eliminati
  const tuttiIngNomi = useMemo(() => {
    const fromRic = new Set();
    for (const ric of Object.values(ricettario?.ricette||{})) {
      for (const ing of (ric.ingredienti||[])) fromRic.add(normIng(ing.nome));
    }
    const fromMag = new Set(Object.keys(magazzino||{}));
    return [...new Set([...fromRic, ...fromMag])].filter(k=>!esclusi.has(k)).sort();
  }, [ricettario, magazzino, esclusi]);

  const fabbisogno = useMemo(() => calcolaFabbisognoSettimana(ricettario, giornaliero), [ricettario, giornaliero]);

  // Stato di ogni ingrediente
  const righe = tuttiIngNomi.map(k => {
    const m = magazzino?.[k] || {};
    const giacenza = m.giacenza_g || 0;
    const soglia   = m.soglia_g   || 0;
    const fabb     = fabbisogno[k] || 0;
    // Alert: giorni di scorta rimanenti basati sul consumo medio giornaliero (fabb/7)
    const consumoG = fabb / 7;
    const giorniScorta = consumoG > 0 ? giacenza / consumoG : null;
    const stato =
      giacenza === 0 ? "esaurito" :
      soglia > 0 && giacenza <= soglia ? "critico" :
      giorniScorta !== null && giorniScorta < 3 ? "critico" :
      giorniScorta !== null && giorniScorta < 7 ? "attenzione" :
      "ok";
    return { k, nome: m.nome||k, giacenza, soglia, fabb, consumoG, giorniScorta, stato, ultimoRif: m.ultimoRifornimento };
  });

  const critici    = righe.filter(r=>r.stato==="critico"||r.stato==="esaurito");
  const attenzione = righe.filter(r=>r.stato==="attenzione");

  const handleCarica = async () => {
    if (!formIng || !formQty) return;
    const k = normIng(formIng.toLowerCase().trim());
    const qty = parseFloat(formQty);
    if (qty <= 0) { notify("⚠ Inserisci una quantità maggiore di 0", false); return; }
    const now = new Date().toISOString();
    const attuale = magazzino?.[k]?.giacenza_g || 0;
    const delta   = formMode === "scarico" ? -qty : qty;
    const nuova   = Math.max(0, attuale + delta);
    const nm = {
      ...magazzino,
      [k]: {
        nome: formIng.trim(),
        giacenza_g: nuova,
        soglia_g:   magazzino?.[k]?.soglia_g||0,
        ultimoRifornimento: now,
      }
    };
    const logEntry = {
      id: `r-${Date.now()}`,
      data: now,
      ingrediente: formIng.trim(),
      quantita_g: formMode === "scarico" ? -qty : qty,
      note: formNote || (formMode === "scarico" ? "scarico manuale" : ""),
    };
    const log = [logEntry, ...(logRif||[])];
    setMagazzino(nm); setLogRif(log);
    await ssave(SK_MAG, nm); await ssave("pasticceria-logrif-v1", log);
    const segno = formMode === "scarico" ? "−" : "+";
    notify(`✓ ${segno}${qty}g di ${formIng} — giacenza: ${Math.round(nuova)}g`);
    setFormIng(""); setFormQty(""); setFormNote(""); setQuickLoad(null);
  };

  const handleSoglia = async (k, val) => {
    const nm = { ...magazzino, [k]: { ...(magazzino?.[k]||{}), nome:k, soglia_g: parseFloat(val)||0 } };
    setMagazzino(nm); await ssave(SK_MAG, nm);
    setEditSoglia(null);
  };

  const handleAddIngrediente = async () => {
    if (!newIngNome) return;
    const k = normIng(newIngNome);
    const nm = { ...magazzino, [k]: { nome:newIngNome.trim(), giacenza_g:parseFloat(newIngQty)||0, soglia_g:parseFloat(newIngSoglia)||0, ultimoRifornimento: new Date().toISOString() } };
    setMagazzino(nm); await ssave(SK_MAG, nm);
    // Se era nella lista esclusi, rimuovilo cosi ricompare
    if (esclusi.has(k)) {
      const nuoviEsclusi = new Set(esclusi);
      nuoviEsclusi.delete(k);
      if (setEsclusi) setEsclusi(nuoviEsclusi);
      await ssave(SK_EXCL, [...nuoviEsclusi]);
    }
    notify("✓ " + newIngNome + " aggiunto al magazzino");
    setShowAddIng(false); setNewIngNome(""); setNewIngQty(""); setNewIngSoglia("");
  };

  const statoColor = s => s==="esaurito"?C.red:s==="critico"?C.red:s==="attenzione"?C.amber:C.green;
  const statoBg    = s => s==="esaurito"?C.redLight:s==="critico"?C.redLight:s==="attenzione"?C.amberLight:C.greenLight;
  const statoLabel = s => s==="esaurito"?"Esaurito":s==="critico"?"Critico":s==="attenzione"?"Attenzione":"OK";
  const fmtG = g => g>=1000 ? `${(g/1000).toFixed(2)} kg` : `${Math.round(g)} g`;

  return (
    <div style={{maxWidth:1100}}>
      <div style={{marginBottom:24,display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:14}}>
        <div>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.18em",textTransform:"uppercase",color:C.red,marginBottom:6}}>Gestione scorte</div>
          <h1 style={{margin:"0 0 8px",fontSize:28,fontWeight:900,color:C.text,letterSpacing:"-0.03em"}}>Magazzino</h1>
          <p style={{margin:0,fontSize:12,color:C.textSoft}}>Traccia le giacenze, carica i rifornimenti e ricevi alert automatici basati sul consumo reale.</p>
        </div>
        {onImportPrezzi&&(
          <label style={{display:"flex",alignItems:"center",gap:10,padding:"12px 18px",
            background:C.amberLight,border:`1px solid ${C.amber}50`,borderRadius:12,
            cursor:"pointer",flexShrink:0,boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
            <span style={{fontSize:22}}>💶</span>
            <div>
              <div style={{fontSize:12,fontWeight:800,color:C.amber}}>Importa prezzi materie prime</div>
              <div style={{fontSize:10,color:C.textSoft,marginTop:2}}>Excel: colonne <strong>Ingrediente | €/kg</strong> — sovrascrive le stime HoReCa</div>
              <div style={{fontSize:9,color:C.textSoft,marginTop:1}}>Formati supportati: .xlsx · .xls · .csv · più file insieme</div>
            </div>
            <input type="file" accept=".xlsx,.xls,.csv" multiple style={{display:"none"}}
              onChange={e=>e.target.files.length&&onImportPrezzi(e.target.files)}/>
          </label>
        )}
      </div>

      {/* Alert banner */}
      {(critici.length>0||attenzione.length>0) && (
        <div style={{marginBottom:24,display:"flex",flexDirection:"column",gap:8}}>
          {critici.length>0 && (
            <div style={{background:C.redLight,border:`1px solid ${C.red}30`,borderRadius:10,padding:"12px 18px",display:"flex",alignItems:"flex-start",gap:12}}>
              <span style={{fontSize:18,flexShrink:0}}>🚨</span>
              <div>
                <div style={{fontSize:12,fontWeight:800,color:C.red,marginBottom:4}}>Riordino urgente — {critici.length} ingredient{critici.length>1?"i":"e"}</div>
                <div style={{fontSize:11,color:C.red,lineHeight:1.7}}>{critici.map(r=>`${r.nome} (${fmtG(r.giacenza)})`).join(" · ")}</div>
              </div>
            </div>
          )}
          {attenzione.length>0 && (
            <div style={{background:C.amberLight,border:`1px solid ${C.amber}30`,borderRadius:10,padding:"12px 18px",display:"flex",alignItems:"flex-start",gap:12}}>
              <span style={{fontSize:18,flexShrink:0}}>⚠️</span>
              <div>
                <div style={{fontSize:12,fontWeight:800,color:C.amber,marginBottom:4}}>Scorte in esaurimento — {attenzione.length} ingredient{attenzione.length>1?"i":"e"}</div>
                <div style={{fontSize:11,color:C.amber,lineHeight:1.7}}>{attenzione.map(r=>`${r.nome} (~${r.giorniScorta?.toFixed(0)} giorni)`).join(" · ")}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* KPI */}
      <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(4,1fr)",gap:10,marginBottom:28}}>
        <KPI icon="📦" label="Ingredienti" value={righe.length} highlight/>
        <KPI icon="🚨" label="Critici"     value={critici.length}    color={critici.length>0?C.red:C.green} sub={critici.length>0?"riordino urgente":"tutto ok"}/>
        <KPI icon="⚠️" label="In esaurimento" value={attenzione.length} color={attenzione.length>0?C.amber:C.green} sub={attenzione.length>0?"< 7 giorni":"ok"}/>
        <KPI icon="✅" label="Sufficienti"  value={righe.filter(r=>r.stato==="ok").length} color={C.green}/>
      </div>

      {/* Tab */}
      <div style={{display:"flex",gap:4,marginBottom:24,borderBottom:`2px solid ${C.border}`}}>
        {[["giacenze","📦 Giacenze"],["carica","➕ Carica merce"],["log","📋 Log rifornimenti"]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{padding:"8px 18px",border:"none",background:"transparent",cursor:"pointer",fontSize:11,fontWeight:700,color:tab===id?C.red:C.textSoft,borderBottom:tab===id?`2px solid ${C.red}`:"2px solid transparent",marginBottom:-2,transition:"all 0.12s"}}>
            {lbl}
          </button>
        ))}
      </div>

      {/* GIACENZE */}
      {tab==="giacenze" && (
        <div>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
            <button onClick={()=>setShowAddIng(true)} style={{padding:"7px 16px",background:C.red,color:C.white,border:"none",borderRadius:7,fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Aggiungi ingrediente</button>
          </div>
          {showAddIng && (
            <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 20px",marginBottom:16,display:"grid",gridTemplateColumns:"1fr 120px 120px auto",gap:10,alignItems:"flex-end"}}>
              {[{lbl:"Nome ingrediente",val:newIngNome,set:setNewIngNome,ph:"es. burro"},{lbl:"Giacenza iniziale (g)",val:newIngQty,set:setNewIngQty,ph:"es. 1000",type:"number"},{lbl:"Soglia alert (g)",val:newIngSoglia,set:setNewIngSoglia,ph:"es. 500",type:"number"}].map(({lbl,val,set,ph,type})=>(
                <div key={lbl}>
                  <div style={{fontSize:9,fontWeight:700,color:C.textSoft,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>{lbl}</div>
                  <input type={type||"text"} value={val} onChange={e=>set(e.target.value)} placeholder={ph}
                    style={{width:"100%",padding:"8px 10px",borderRadius:7,border:`1px solid ${C.borderStr}`,fontSize:12,color:C.text}}/>
                </div>
              ))}
              <div style={{display:"flex",gap:6}}>
                <button onClick={handleAddIngrediente} style={{padding:"8px 16px",background:C.red,color:C.white,border:"none",borderRadius:7,fontSize:11,fontWeight:700,cursor:"pointer"}}>Aggiungi</button>
                <button onClick={()=>setShowAddIng(false)} style={{padding:"8px 12px",background:"transparent",color:C.textSoft,border:`1px solid ${C.border}`,borderRadius:7,fontSize:11,cursor:"pointer"}}>✕</button>
              </div>
            </div>
          )}
          <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
            <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:600}}>
              <thead>
                <tr style={{background:"#F8F4F2"}}>
                  <SortTH k="nome" active={magKey==="nome"} dir={magDir} onToggle={magToggle} style={{padding:"10px 14px",textAlign:"left"}}>Ingrediente</SortTH>
                  <SortTH k="giacenza" right active={magKey==="giacenza"} dir={magDir} onToggle={magToggle}>Giacenza</SortTH>
                  <SortTH k="fabb" right active={magKey==="fabb"} dir={magDir} onToggle={magToggle}>Fabb. sett.</SortTH>
                  <SortTH k="giorniScorta" right active={magKey==="giorniScorta"} dir={magDir} onToggle={magToggle}>Giorni scorta</SortTH>
                  <SortTH k="soglia" right active={magKey==="soglia"} dir={magDir} onToggle={magToggle}>Soglia alert</SortTH>
                  <SortTH k="stato" active={magKey==="stato"} dir={magDir} onToggle={magToggle}>Stato</SortTH>
                  <SortTH k="ultimoRif" right active={magKey==="ultimoRif"} dir={magDir} onToggle={magToggle}>Ultimo riforn.</SortTH>
                  <th style={{padding:"10px 8px",borderBottom:`1px solid ${C.border}`}}></th>
                </tr>
              </thead>
              <tbody>
                {sortMag(righe,(r,k)=>({
                  nome:r.nome,
                  giacenza:r.giacenza,
                  fabb:r.fabb,
                  giorniScorta:r.giorniScorta??9999,
                  soglia:r.soglia,
                  stato:({esaurito:0,critico:1,attenzione:2,ok:3}[r.stato]??3),
                  ultimoRif:r.ultimoRif?new Date(r.ultimoRif).getTime():0,
                })[k]??0).map((r,i)=>(
                  <React.Fragment key={r.k}>
                  <tr style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:"#FDFAF7"}}>
                    <td style={{padding:"10px 14px",fontWeight:600,color:quickLoad===r.k?C.red:C.text,textTransform:"capitalize",cursor:"pointer"}}
                      title="Clic rapido → precompila form carico/scarico"
                      onClick={()=>{
                        setQuickLoad(r.k);
                        setFormIng(r.nome);
                        setTab("carica");
                        setTimeout(()=>document.getElementById("mag-qty-input")?.focus(),100);
                      }}>
                      {r.nome} <span style={{fontSize:9,opacity:0.4}}>↗</span>
                    </td>
                    <td style={{padding:"10px 14px",textAlign:"center"}}>
                      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                        <span style={{fontWeight:800,fontSize:12,color:statoColor(r.stato),fontFamily:"Georgia,serif"}}>{fmtG(r.giacenza)}</span>
                        {r.fabb>0 && (
                          <div style={{width:60,height:4,background:"#EEE",borderRadius:2}}>
                            <div style={{width:`${Math.min(100,(r.giacenza/r.fabb)*100)}%`,height:4,background:statoColor(r.stato),borderRadius:2}}/>
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{padding:"10px 14px",textAlign:"center",color:C.textMid}}>{r.fabb>0?fmtG(r.fabb):"—"}</td>
                    <td style={{padding:"10px 14px",textAlign:"center",fontWeight:700,color:statoColor(r.stato)}}>
                      {r.giorniScorta!==null?`${r.giorniScorta.toFixed(0)}gg`:"—"}
                    </td>
                    <td style={{padding:"10px 14px",textAlign:"center"}}>
                      {editSoglia?.nome===r.k ? (
                        <div style={{display:"flex",gap:4,alignItems:"center",justifyContent:"center"}}>
                          <input type="number" value={editSoglia.val} onChange={e=>setEditSoglia({...editSoglia,val:e.target.value})}
                            style={{width:70,padding:"4px 6px",borderRadius:5,border:`1px solid ${C.borderStr}`,fontSize:11,textAlign:"center"}}/>
                          <button onClick={()=>handleSoglia(r.k,editSoglia.val)} style={{padding:"4px 8px",background:C.green,color:C.white,border:"none",borderRadius:4,fontSize:9,fontWeight:700,cursor:"pointer"}}>✓</button>
                        </div>
                      ) : (
                        <button onClick={()=>setEditSoglia({nome:r.k,val:r.soglia||""})}
                          style={{padding:"4px 10px",borderRadius:5,border:`1px solid ${C.border}`,background:C.white,color:C.textMid,fontSize:10,cursor:"pointer"}}>
                          {r.soglia>0?fmtG(r.soglia):"Imposta"}
                        </button>
                      )}
                    </td>
                    <td style={{padding:"10px 14px",textAlign:"center"}}>
                      <span style={{background:statoBg(r.stato),color:statoColor(r.stato),fontSize:8,fontWeight:700,padding:"3px 9px",borderRadius:10,letterSpacing:"0.06em",textTransform:"uppercase"}}>{statoLabel(r.stato)}</span>
                    </td>
                    <td style={{padding:"10px 14px",textAlign:"center",color:C.textSoft,fontSize:10}}>
                      {r.ultimoRif ? new Date(r.ultimoRif).toLocaleDateString("it-IT") : "—"}
                    </td>
                    <td style={{padding:"6px 10px",textAlign:"center"}}>
                      <button onClick={()=>{setDeleteIngConf(r.k); setDeleteIngPin("");}}
                        style={{padding:"4px 10px",borderRadius:5,border:`1px solid ${C.red}`,background:C.redLight,color:C.red,fontSize:10,fontWeight:700,cursor:"pointer"}}>
                        🗑
                      </button>
                    </td>
                  </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            </div>
          </div>
          <div style={{marginTop:10,fontSize:10,color:C.textSoft,lineHeight:1.7}}>
            💡 <b>Fabbisogno settimanale</b> calcolato dalla media delle ultime 7 sessioni di produzione. Imposta la soglia alert per ricevere avvisi personalizzati.
          </div>
        </div>
      )}

      {/* CARICA MERCE */}
      {tab==="carica" && (
        <div style={{maxWidth:680}}>
          <FotoOCR mode="magazzino" notify={notify} ricettario={ricettario} onResult={async res=>{
            const now = new Date().toISOString();
            const nm = {...magazzino};
            const newLogs = [];
            for (const rawIng of (res.ingredienti||[])) {
              const nomeIT = translateIngredienteEN(rawIng.nome||"");
              const ing = { ...rawIng, nome: nomeIT };
              const k = normIng(ing.nome);
              nm[k] = { nome:ing.nome.trim(), giacenza_g:(nm[k]?.giacenza_g||0)+ing.quantita_g, soglia_g:nm[k]?.soglia_g||0, ultimoRifornimento:now };
              newLogs.push({ id:`r-${Date.now()}-${k}`, data:now, ingrediente:ing.nome.trim(), quantita_g:ing.quantita_g, note:"da foto" });
            }
            setMagazzino(nm);
            const updLogs = [...newLogs, ...(logRif||[])];
            setLogRif(updLogs);
            await ssave(SK_MAG, nm);
            await ssave("pasticceria-logrif-v1", updLogs);
            notify(`📷 Caricati ${(res.ingredienti||[]).length} ingredienti in magazzino`);
          }}/>

          {/* Foto listino / fattura → importa prezzi */}
          <FotoOCR mode="prezzi" notify={notify} ricettario={ricettario} onResult={async res=>{
            if (!ricettario) { notify("⚠ Carica prima il ricettario", false); return; }
            const ing_list = res.ingredienti || [];
            const validi = ing_list.filter(i => i.prezzo_kg > 0);
            if (!validi.length) { notify("⚠ Nessun prezzo estratto dalla foto", false); return; }
            const nuoviCosti = { ...(ricettario.ingredienti_costi||{}) };
            for (const i of validi) {
              const k = normIng(translateIngredienteEN(i.nome||""));
              nuoviCosti[k] = { costoKg: parseFloat(i.prezzo_kg.toFixed(4)), costoG: parseFloat((i.prezzo_kg/1000).toFixed(6)), isStima:false };
            }
            const nuovoRic = { ...ricettario, ingredienti_costi: nuoviCosti };
            // Call onImportPrezzi equivalent directly
            const { setRic: _setRic } = {}; // can't reach App state directly — use window event
            // MERGE: onImportPrezziOCR only touches the imported ingredients,
            // all other existing prices are preserved unchanged
            if (onImportPrezziOCR) onImportPrezziOCR(nuoviCosti);
            notify(`📷 ${validi.length} prezzi aggiornati da foto — gli altri rimangono invariati`);
          }}/>
          <div style={{background:C.bgCard,border:`1px solid ${formMode==="scarico"?C.amber:C.border}`,borderRadius:12,padding:"28px",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
            {/* Carico / Scarico toggle */}
            <div style={{display:"flex",gap:6,marginBottom:18}}>
              {[["carico","➕ Carico merce","Rifornimento in entrata"],["scarico","➖ Scarico / Rettifica","Rimuovi quantità (correzione o uso extra)"]].map(([m,lbl,sub])=>(
                <button key={m} onClick={()=>setFormMode(m)}
                  style={{flex:1,padding:"10px 12px",borderRadius:9,border:`2px solid ${formMode===m?(m==="carico"?C.green:C.amber):C.border}`,
                    background:formMode===m?(m==="carico"?C.greenLight:C.amberLight):C.white,
                    color:formMode===m?(m==="carico"?C.green:C.amber):C.textMid,
                    fontWeight:formMode===m?800:500,fontSize:11,cursor:"pointer",textAlign:"left"}}>
                  <div style={{fontWeight:800,marginBottom:2}}>{lbl}</div>
                  <div style={{fontSize:9,opacity:0.7,lineHeight:1.3}}>{sub}</div>
                </button>
              ))}
            </div>

            <div style={{fontSize:13,fontWeight:800,color:formMode==="scarico"?C.amber:C.text,marginBottom:4}}>
              {formMode==="scarico"?"➖ Scarico / Rettifica magazzino":"➕ Carica rifornimento manuale"}
            </div>
            <div style={{fontSize:11,color:C.textSoft,marginBottom:20}}>
              {formMode==="scarico"
                ? "Togli quantità per correzioni, uso extra o errori di carico precedenti."
                : "Inserisci le materie prime arrivate. La giacenza viene aggiornata immediatamente."}
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:16}}>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:C.textSoft,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:3}}>Ingrediente</div>
                <div style={{fontSize:10,color:C.textSoft,marginBottom:6}}>nome esatto (es. burro, farina, mele)</div>
                <input type="text" value={formIng} onChange={e=>setFormIng(e.target.value)} placeholder="es. burro"
                  list="ing-list" style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${C.borderStr}`,fontSize:13,color:C.text}}/>
                {formIng&&magazzino?.[normIng(formIng.toLowerCase().trim())]&&(
                  <div style={{fontSize:10,color:C.textSoft,marginTop:5}}>
                    Giacenza attuale: <strong style={{color:C.text}}>
                      {Math.round(magazzino[normIng(formIng.toLowerCase().trim())]?.giacenza_g||0)}g
                    </strong>
                    {formMode==="scarico"&&formQty&&(
                      <span style={{marginLeft:8,color:C.amber,fontWeight:700}}>
                        → dopo scarico: {Math.max(0,Math.round((magazzino[normIng(formIng.toLowerCase().trim())]?.giacenza_g||0)-parseFloat(formQty||0)))}g
                      </span>
                    )}
                    {formMode==="carico"&&formQty&&(
                      <span style={{marginLeft:8,color:C.green,fontWeight:700}}>
                        → dopo carico: {Math.round((magazzino[normIng(formIng.toLowerCase().trim())]?.giacenza_g||0)+parseFloat(formQty||0))}g
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:C.textSoft,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:3}}>
                  Quantità (grammi) — {formMode==="scarico"?"da rimuovere":"in arrivo"}
                </div>
                <div style={{fontSize:10,color:C.textSoft,marginBottom:6}}>converti: 1 kg = 1000 g, 1 L latte ≈ 1030 g</div>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <input id="mag-qty-input" type="number" value={formQty} onChange={e=>setFormQty(e.target.value)} placeholder="es. 2000" min="0"
                    style={{flex:1,padding:"10px 12px",borderRadius:8,border:`1px solid ${formMode==="scarico"?C.amber:C.borderStr}`,fontSize:13,color:C.text}}/>
                  <span style={{fontSize:11,color:C.textSoft,whiteSpace:"nowrap"}}>= {formQty?(parseFloat(formQty)/1000).toFixed(2):0} kg</span>
                </div>
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:C.textSoft,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:3}}>Note (opzionale)</div>
                <input type="text" value={formNote} onChange={e=>setFormNote(e.target.value)}
                  placeholder={formMode==="scarico"?"es. correzione carico 12/03 o uso extra":"es. Metro - bolla 1234"}
                  style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${C.borderStr}`,fontSize:13,color:C.text}}/>
              </div>
              <datalist id="ing-list">{tuttiIngNomi.map(k=><option key={k} value={k}/>)}</datalist>
              <button onClick={handleCarica} disabled={!formIng||!formQty}
                style={{padding:"12px",border:"none",borderRadius:9,fontWeight:800,fontSize:13,cursor:formIng&&formQty?"pointer":"default",marginTop:4,
                  background:formIng&&formQty?(formMode==="scarico"?C.amber:C.red):"#DDD",
                  color:formIng&&formQty?C.white:"#999"}}>
                {formMode==="scarico"?"➖ Rimuovi dal magazzino":"➕ Aggiungi al magazzino"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOG */}
      {tab==="log" && (
        <div>
          {(!logRif||logRif.length===0) ? (
            <div style={{textAlign:"center",padding:"50px 20px",color:C.textSoft}}>
              <div style={{fontSize:32,marginBottom:12}}>📋</div>
              <div style={{fontSize:13,fontWeight:600}}>Nessun rifornimento registrato</div>
            </div>
          ) : (
            <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead>
                  <tr style={{background:"#F8F4F2"}}>
                    {["Data","Ingrediente","Quantità","Note"].map((h,i)=>(
                      <th key={i} style={{padding:"10px 14px",textAlign:i===0?"left":"left",fontSize:8,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",color:C.textSoft,borderBottom:`1px solid ${C.border}`}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logRif.map((r,i)=>(
                    <tr key={r.id} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:"#FDFAF7"}}>
                      <td style={{padding:"10px 14px",color:C.textMid}}>{new Date(r.data).toLocaleString("it-IT",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})}</td>
                      <td style={{padding:"10px 14px",fontWeight:600,color:C.text,textTransform:"capitalize"}}>{r.ingrediente}</td>
                      <td style={{padding:"10px 14px",fontWeight:700,color:C.green}}>{fmtG(r.quantita_g)}</td>
                      <td style={{padding:"10px 14px",color:C.textSoft}}>{r.note||"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
          {/* Modal conferma eliminazione ingrediente */}
          {deleteIngConf && (
            <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}
              onClick={e=>{if(e.target===e.currentTarget){setDeleteIngConf(null);setDeleteIngPin("");}}}>
              <div style={{background:C.white,borderRadius:14,padding:"28px 32px",maxWidth:420,width:"90%",boxShadow:"0 8px 40px rgba(0,0,0,0.25)"}}>
                <div style={{fontSize:14,fontWeight:900,color:C.red,marginBottom:8}}>🗑 Elimina ingrediente</div>
                <div style={{fontSize:13,color:C.text,marginBottom:4}}>
                  Stai per eliminare <b style={{textTransform:"capitalize"}}>{magazzino?.[deleteIngConf]?.nome||deleteIngConf}</b> dal magazzino.
                </div>
                <div style={{fontSize:11,color:C.textSoft,marginBottom:18}}>Questa azione è permanente e non può essere annullata.</div>
                <div style={{fontSize:11,fontWeight:700,color:C.textSoft,marginBottom:6}}>Scrivi <b style={{color:C.red}}>ELIMINA</b> in maiuscolo per confermare:</div>
                <input
                  autoFocus
                  value={deleteIngPin}
                  onChange={e=>setDeleteIngPin(e.target.value)}
                  onKeyDown={e=>{
                    if(e.key==="Enter" && deleteIngPin==="ELIMINA") {
                      handleDeleteIng(deleteIngConf);
                    }
                  }}
                  placeholder="ELIMINA"
                  style={{width:"100%",boxSizing:"border-box",padding:"10px 12px",borderRadius:7,border:`2px solid ${deleteIngPin==="ELIMINA"?C.red:"#DDD"}`,fontSize:14,fontWeight:800,color:C.red,letterSpacing:"0.1em",marginBottom:16,outline:"none"}}
                />
                <div style={{display:"flex",gap:10}}>
                  <button
                    onClick={()=>{
                      if(deleteIngPin!=="ELIMINA") return;
                      handleDeleteIng(deleteIngConf);
                    }}
                    style={{flex:1,padding:"11px",background:deleteIngPin==="ELIMINA"?C.red:"#EEE",color:deleteIngPin==="ELIMINA"?C.white:"#AAA",border:"none",borderRadius:8,fontSize:12,fontWeight:800,cursor:deleteIngPin==="ELIMINA"?"pointer":"not-allowed",transition:"background 0.2s"}}>
                    Elimina definitivamente
                  </button>
                  <button onClick={()=>{setDeleteIngConf(null);setDeleteIngPin("");}}
                    style={{flex:1,padding:"11px",background:C.white,color:C.textMid,border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer"}}>
                    Annulla
                  </button>
                </div>
              </div>
            </div>
          )}
    </div>
  );
}

// giornaliero: [{ id, data, prodotti:[{nome,stampi}], note }]

function ProduzioneGiornalieraView({ ricettario, magazzino, setMagazzino, giornaliero, setGiornaliero, notify }) {
  const isMobile = useIsMobile();
  const ingCosti = useMemo(()=>buildIngCosti(ricettario?.ingredienti_costi||{}), [ricettario]);
  const ricette  = Object.values(ricettario?.ricette||{}).filter(r=>isRicettaValida(r.nome)&&getR(r.nome,r).tipo!=="interno"&&getR(r.nome,r).tipo!=="semilavorato");

  const [tab, setTab] = useState("nuova");
  const [deleteSessConf, setDeleteSessConf] = useState(null); // id sessione da cancellare
  const [deleteSessPin,  setDeleteSessPin]  = useState("");

  const handleDeleteSessione = async (sess) => {
    if (deleteSessPin !== "ELIMINA") return;
    // 1. Rimuovi sessione da giornaliero
    const ng = (giornaliero||[]).filter(s => s.id !== sess.id);
    setGiornaliero(ng);
    await ssave(SK_GIOR, ng);
    // 2. Restituisci gli ingredienti usati al magazzino
    if (sess.ingredientiUsati && Object.keys(sess.ingredientiUsati).length > 0) {
      const nm = {...magazzino};
      for (const [k, qty] of Object.entries(sess.ingredientiUsati)) {
        if (nm[k]) {
          nm[k] = { ...nm[k], giacenza_g: (nm[k].giacenza_g||0) + qty };
        } else {
          // L'ingrediente potrebbe essere stato eliminato dal magazzino — lo riaggiungiamo
          nm[k] = { nome:k, giacenza_g: qty, soglia_g:0, ultimoRifornimento: null };
        }
      }
      setMagazzino(nm);
      await ssave(SK_MAG, nm);
    }
    setDeleteSessConf(null);
    setDeleteSessPin("");
    notify("✓ Sessione eliminata — ingredienti restituiti al magazzino");
  };
  // form sessione
  const [data, setData] = useState(new Date().toISOString().slice(0,10));
  const [qtaMap, setQtaMap]         = useState({});     // stampi PRODOTTI oggi
  const [vendibileMap, setVendMap]  = useState({});     // stampi DISPONIBILI oggi (prod + scongelati)
  const [sessNote, setSessNote]     = useState("");
  const [confermando, setConfermando] = useState(false);

  // Prodotti congelabili (si vende nei giorni successivi): banana bread, carote, cookies + override manuale
  // isCongelabile: legge dal ricettario (campo salvato), con fallback a lista built-in
  const CONGELABILI_DEFAULT = ["BANANA BREAD","TORTA DI CAROTE","COOKIES","CARROT CAKE"];
  const isCongelabile = nome => {
    const r = ricettario?.ricette?.[nome.toUpperCase().trim()]||ricettario?.ricette?.[nome];
    if (r && typeof r.congelabile === "boolean") return r.congelabile;
    return CONGELABILI_DEFAULT.some(c=>nome.toUpperCase().includes(c));
  };

  const setQ  = (nome, val) => {
    const n = parseFloat(val)||0;
    setQtaMap(m=>({...m,[nome]:n}));
    // Se non congelabile, vendibile = prodotto (default)
    if (!isCongelabile(nome)) setVendMap(m=>({...m,[nome]:n}));
  };
  const setV  = (nome, val) => setVendMap(m=>({...m,[nome]:parseFloat(val)||0}));

  // Calcola riepilogo sessione corrente
  const riepilogo = useMemo(()=>{
    const ings = {};
    let fcTot = 0, ricavoTot = 0;
    for (const ric of ricette) {
      const q = qtaMap[ric.nome]||0;
      const qv = vendibileMap[ric.nome]||q;
      if (!q && !qv) continue;
      const reg = getR(ric.nome, ric);
      ricavoTot += qv * reg.unita * reg.prezzo;
      const {tot:fc} = calcolaFC(ric, ingCosti, ricettario);
      fcTot += q * fc;
      for (const ing of (ric.ingredienti||[])) {
        const k = normIng(ing.nome);
        ings[k] = (ings[k]||0) + ing.qty1stampo * q;
      }
    }
    return { ings, fcTot, ricavoTot };
  }, [qtaMap, ricette, ingCosti]);

  // Verifica disponibilità magazzino
  const problemi = useMemo(()=>{
    return Object.entries(riepilogo.ings).filter(([k,qty])=>{
      const giac = magazzino?.[k]?.giacenza_g||0;
      return giac < qty;
    }).map(([k,qty])=>({nome:k, richiesto:qty, disponibile:magazzino?.[k]?.giacenza_g||0}));
  }, [riepilogo, magazzino]);

  const hasQta = Object.values(qtaMap).some(v=>v>0)||Object.values(vendibileMap).some(v=>v>0);

  const handleConferma = async () => {
    if (!hasQta) return;
    // Scala magazzino
    const nm = {...magazzino};
    for (const [k, qty] of Object.entries(riepilogo.ings)) {
      if (nm[k]) nm[k] = {...nm[k], giacenza_g: Math.max(0, (nm[k].giacenza_g||0) - qty)};
    }
    // Salva sessione
    const sess = {
      id: `g-${Date.now()}`,
      data,
      prodotti: ricette.filter(r=>(qtaMap[r.nome]||0)>0||(vendibileMap[r.nome]||0)>0).map(r=>({
        nome:r.nome,
        stampi:qtaMap[r.nome]||0,
        vendibile:vendibileMap[r.nome]||qtaMap[r.nome]||0,
        congelabile:isCongelabile(r.nome),
      })),
      note: sessNote,
      ingredientiUsati: riepilogo.ings,
      fcTot: riepilogo.fcTot,
      ricavoTot: riepilogo.ricavoTot,
    };
    const ng = [sess, ...(giornaliero||[])];
    setMagazzino(nm); setGiornaliero(ng);
    await ssave(SK_MAG, nm); await ssave(SK_GIOR, ng);
    setQtaMap({}); setVendMap({}); setSessNote(""); setConfermando(false);
    notify(`✓ Produzione registrata — magazzino aggiornato`);
    setTab("storico");
  };

  const fmtG = g => g>=1000 ? `${(g/1000).toFixed(2)} kg` : `${Math.round(g)} g`;
  const margPct = riepilogo.ricavoTot>0?((riepilogo.ricavoTot-riepilogo.fcTot)/riepilogo.ricavoTot*100):0;

  return (
    <div style={{maxWidth:1100}}>
      <div style={{marginBottom:24,display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
        <div>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.18em",textTransform:"uppercase",color:C.red,marginBottom:6}}>Operativo</div>
          <h1 style={{margin:"0 0 8px",fontSize:28,fontWeight:900,color:C.text,letterSpacing:"-0.03em"}}>Produzione Giornaliera</h1>
          <p style={{margin:0,fontSize:12,color:C.textSoft}}>Registra cosa hai prodotto oggi. Il magazzino si aggiorna automaticamente.</p>
        </div>
        {(giornaliero||[]).length>0&&(
          <button onClick={()=>{
            const sess=(giornaliero||[])[0];
            const items=Object.entries(sess?.qtaMap||{}).flatMap(([nome,qty])=>{
              const r=ricettario?.ricette?.[nome]||ricettario?.ricette?.[nome.toUpperCase()];
              const regR=r?getR(nome,r):{prezzo:0,unita:1};
              const {tot:fcR}=r?calcolaFC(r,ingCosti,ricettario):{tot:0};
              return qty>0?[{nome,quantita:qty,unita:'stampi',costo:fcR,categoria:r?.categoria||'Altro'}]:[];
            });
            exportProduzione(items,sess?.data,nomeAttivita);
          }}
            style={{marginTop:8,padding:"8px 14px",borderRadius:8,border:"1px solid #E8DDD8",background:"#FFF",fontSize:12,fontWeight:700,color:"#6B4C44",cursor:"pointer",display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
            📄 Esporta PDF
          </button>
        )}
      </div>

      <div style={{display:"flex",gap:4,marginBottom:24,borderBottom:`2px solid ${C.border}`}}>
        {[["nuova","➕ Nuova sessione"],["storico","📋 Storico"]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{padding:"8px 18px",border:"none",background:"transparent",cursor:"pointer",fontSize:11,fontWeight:700,color:tab===id?C.red:C.textSoft,borderBottom:tab===id?`2px solid ${C.red}`:"2px solid transparent",marginBottom:-2,transition:"all 0.12s"}}>
            {lbl}
          </button>
        ))}
      </div>

      {tab==="nuova" && (
        <div>
          <FotoOCR mode="produzione" notify={notify} ricettario={ricettario} onResult={res=>{
            const nuovaMap = {...qtaMap};
            for (const p of (res.prodotti||[])) {
              const nomeIT = translateProdottoEN(p.nome||"");
              const match = ricette.find(r => {
                const rn = r.nome.toUpperCase();
                const pn = nomeIT.toUpperCase();
                return rn === pn || rn.includes(pn) || pn.includes(rn);
              });
              const chiave = match ? match.nome : nomeIT;
              nuovaMap[chiave] = (nuovaMap[chiave]||0) + (p.stampi||0);
            }
            setQtaMap(nuovaMap);
            notify(`📷 Importati ${(res.prodotti||[]).length} prodotti — controlla i valori`);
          }}/>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 340px",gap:24}}>
          {/* Form sinistra */}
          <div>
            <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
              {/* Data */}
              <div style={{padding:"16px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:16}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:9,fontWeight:700,color:C.textSoft,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Data produzione</div>
                  <input type="date" value={data} onChange={e=>setData(e.target.value)}
                    style={{padding:"7px 10px",borderRadius:7,border:`1px solid ${C.borderStr}`,fontSize:12,color:C.text}}/>
                </div>
              </div>
              {/* Tabella torte */}
              <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11,minWidth:420}}>
                <thead>
                  <tr style={{background:"#F8F4F2"}}>
                    {["Prodotto","FC/stampo","Prodotti oggi","Vendibili oggi"].map((h,i)=>(
                      <th key={i} style={{padding:"10px 14px",textAlign:i<2?"left":"center",fontSize:8,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",color:C.textSoft,borderBottom:`1px solid ${C.border}`}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ricette.map((ric,i)=>{
                    const reg = getR(ric.nome, ric);
                    const {tot:fc} = calcolaFC(ric, ingCosti, ricettario);
                    const ricavo = reg.unita * reg.prezzo;
                    const q = qtaMap[ric.nome]||0;
                    const vq = vendibileMap[ric.nome]!=null ? vendibileMap[ric.nome] : q;
                    const cong = isCongelabile(ric.nome);
                    return (
                      <tr key={ric.nome} style={{borderBottom:`1px solid ${C.border}`,background:(q>0||vq>0)?"#FFF9F9":i%2===0?C.white:"#FDFAF7"}}>
                        <td style={{padding:"10px 14px",fontWeight:700,color:C.text}}>
                          {ric.nome}
                          <div style={{display:"flex",gap:4,marginTop:3,flexWrap:"wrap"}}>
                            <span style={{fontSize:9,color:C.textSoft}}>{reg.unita} {reg.tipo==="fetta"?"fette":"pezzi"} × {fmt(reg.prezzo)}</span>
                            {cong&&<span style={{fontSize:8,fontWeight:700,background:"#E8F4FF",color:"#2980B9",padding:"1px 6px",borderRadius:3}}>❄ congelabile</span>}
                          </div>
                        </td>
                        <td style={{padding:"10px 14px",color:C.red}}>{fmt(fc)}</td>
                        <td style={{padding:"10px 14px",textAlign:"center"}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,justifyContent:"center"}}>
                            <button onClick={()=>setQ(ric.nome,Math.max(0,(qtaMap[ric.nome]||0)-1))}
                              style={{width:26,height:26,borderRadius:5,border:`1px solid ${C.borderStr}`,background:C.white,fontSize:13,cursor:"pointer",fontWeight:700,color:C.textMid}}>−</button>
                            <input type="number" min="0" value={q||""} onChange={e=>setQ(ric.nome,e.target.value)}
                              style={{width:48,padding:"4px",borderRadius:5,border:`1px solid ${q>0?C.red:C.borderStr}`,background:C.white,fontSize:13,textAlign:"center",fontWeight:800,color:q>0?C.red:C.text}}/>
                            <button onClick={()=>setQ(ric.nome,(qtaMap[ric.nome]||0)+1)}
                              style={{width:26,height:26,borderRadius:5,border:`1px solid ${C.borderStr}`,background:C.white,fontSize:13,cursor:"pointer",fontWeight:700,color:C.textMid}}>+</button>
                          </div>
                        </td>
                        <td style={{padding:"10px 14px",textAlign:"center"}}>
                          {cong ? (
                            <div style={{display:"flex",alignItems:"center",gap:6,justifyContent:"center"}}>
                              <button onClick={()=>setV(ric.nome,Math.max(0,(vendibileMap[ric.nome]||q)-1))}
                                style={{width:26,height:26,borderRadius:5,border:`1px solid #BDE`,background:"#F0F8FF",fontSize:13,cursor:"pointer",fontWeight:700,color:"#2980B9"}}>−</button>
                              <input type="number" min="0" value={vq||""} onChange={e=>setV(ric.nome,e.target.value)}
                                style={{width:48,padding:"4px",borderRadius:5,border:`1px solid ${vq>0?"#2980B9":C.borderStr}`,background:"#F0F8FF",fontSize:13,textAlign:"center",fontWeight:800,color:vq>0?"#2980B9":C.text}}/>
                              <button onClick={()=>setV(ric.nome,(vendibileMap[ric.nome]||q)+1)}
                                style={{width:26,height:26,borderRadius:5,border:`1px solid #BDE`,background:"#F0F8FF",fontSize:13,cursor:"pointer",fontWeight:700,color:"#2980B9"}}>+</button>
                            </div>
                          ) : (
                            <span style={{fontSize:11,color:C.textSoft}}>= prodotti</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
              <div style={{padding:"14px 20px",borderTop:`1px solid ${C.border}`}}>
                <div style={{fontSize:9,fontWeight:700,color:C.textSoft,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>Note sessione</div>
                <input type="text" value={sessNote} onChange={e=>setSessNote(e.target.value)} placeholder="es. produzione weekend, teglia extra…"
                  style={{width:"100%",padding:"8px 12px",borderRadius:7,border:`1px solid ${C.borderStr}`,fontSize:12,color:C.text}}/>
              </div>
            </div>
          </div>

          {/* Riepilogo destra */}
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {/* P&L sessione */}
            <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
              <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:16}}>📊 Riepilogo sessione</div>
              {!hasQta ? (
                <div style={{color:C.textSoft,fontSize:11,textAlign:"center",padding:"20px 0"}}>Inserisci gli stampi prodotti</div>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  {ricette.filter(r=>qtaMap[r.nome]>0).map(ric=>{
                    const reg=getR(ric.nome, ric);
                    const {tot:fc}=calcolaFC(ric, ingCosti, ricettario);
                    const q=qtaMap[ric.nome];
                    return (
                      <div key={ric.nome} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"6px 0",borderBottom:`1px solid ${C.border}`}}>
                        <span style={{color:C.textMid}}>{q}× {ric.nome}</span>
                        <span style={{fontWeight:700,color:C.green}}>{fmt(q*reg.unita*reg.prezzo)}</span>
                      </div>
                    );
                  })}
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.red}}>
                    <span>Food cost totale</span><span style={{fontWeight:700}}>−{fmt(riepilogo.fcTot)}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:13,fontWeight:900,color:margColor(margPct),borderTop:`2px solid ${C.border}`,paddingTop:8}}>
                    <span>Margine lordo</span><span style={{fontFamily:"Georgia,serif"}}>{fmt(riepilogo.ricavoTot-riepilogo.fcTot)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Ingredienti da usare */}
            {hasQta && (
              <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:12}}>🧾 Ingredienti da scalare</div>
                <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:280,overflowY:"auto"}}>
                  {Object.entries(riepilogo.ings).sort((a,b)=>b[1]-a[1]).map(([k,qty])=>{
                    const giac = magazzino?.[k]?.giacenza_g||0;
                    const ok = giac >= qty;
                    return (
                      <div key={k} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:10,padding:"5px 8px",borderRadius:6,background:ok?"#F8FAF8":C.redLight}}>
                        <span style={{fontWeight:600,color:C.text,textTransform:"capitalize"}}>{k}</span>
                        <div style={{display:"flex",gap:8,alignItems:"center"}}>
                          <span style={{color:C.red,fontWeight:700}}>−{fmtG(qty)}</span>
                          <span style={{color:ok?C.green:C.red,fontSize:9}}>{ok?`→ ${fmtG(giac-qty)}`:"⚠ insuff."}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Alert disponibilità */}
            {problemi.length>0 && (
              <div style={{background:C.redLight,border:`1px solid ${C.red}25`,borderRadius:10,padding:"14px 16px"}}>
                <div style={{fontSize:11,fontWeight:800,color:C.red,marginBottom:8}}>⚠️ Scorte insufficienti</div>
                {problemi.map(p=>(
                  <div key={p.nome} style={{fontSize:10,color:C.red,marginBottom:4}}>
                    <b style={{textTransform:"capitalize"}}>{p.nome}</b>: servono {fmtG(p.richiesto)}, disponibili {fmtG(p.disponibile)}
                  </div>
                ))}
                <div style={{fontSize:10,color:C.red,marginTop:8,opacity:0.7}}>Puoi procedere comunque — il magazzino andrà a 0.</div>
              </div>
            )}

            {/* Bottone conferma */}
            {hasQta && (
              !confermando ? (
                <button onClick={()=>setConfermando(true)}
                  style={{padding:"14px",background:C.red,color:C.white,border:"none",borderRadius:10,fontWeight:800,fontSize:13,cursor:"pointer",boxShadow:"0 2px 8px rgba(192,57,43,0.3)"}}>
                  ✅ Conferma produzione
                </button>
              ) : (
                <div style={{background:C.redLight,border:`1px solid ${C.red}30`,borderRadius:10,padding:"16px"}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.red,marginBottom:10}}>Confermi? Il magazzino verrà scalato.</div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={handleConferma} style={{flex:1,padding:"10px",background:C.red,color:C.white,border:"none",borderRadius:8,fontWeight:800,fontSize:12,cursor:"pointer"}}>Sì, conferma</button>
                    <button onClick={()=>setConfermando(false)} style={{flex:1,padding:"10px",background:C.white,color:C.textMid,border:`1px solid ${C.border}`,borderRadius:8,fontWeight:600,fontSize:12,cursor:"pointer"}}>Annulla</button>
                  </div>
                </div>
              )
            )}
          </div>
          </div>
        </div>
      )}

      {/* STORICO */}
      {tab==="storico" && (
        <div>
          {(!giornaliero||giornaliero.length===0) ? (
            <div style={{textAlign:"center",padding:"60px 20px",color:C.textSoft}}>
              <div style={{fontSize:36,marginBottom:12}}>📋</div>
              <div style={{fontSize:14,fontWeight:600,color:C.text,marginBottom:8}}>Nessuna sessione registrata</div>
              <button onClick={()=>setTab("nuova")} style={{padding:"9px 22px",background:C.red,color:C.white,border:"none",borderRadius:8,fontWeight:700,fontSize:11,cursor:"pointer"}}>➕ Prima sessione</button>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {giornaliero.map((sess,i)=>(
                <div key={sess.id} style={{background:C.bgCard,border:`1px solid ${deleteSessConf?.id===sess.id?C.red:C.border}`,borderRadius:10,padding:"16px 20px",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:800,color:C.text}}>{new Date(sess.data).toLocaleDateString("it-IT",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})}</div>
                      {sess.note && <div style={{fontSize:11,color:C.textSoft,marginTop:2}}>{sess.note}</div>}
                    </div>
                    <div style={{display:"flex",gap:12,alignItems:"center"}}>
                      <div style={{display:"flex",gap:16,textAlign:"right"}}>
                        <div><div style={{fontSize:8,color:C.textSoft,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700}}>Ricavo pot.</div><div style={{fontSize:14,fontWeight:800,color:C.green,fontFamily:"Georgia,serif"}}>{fmt(sess.ricavoTot||0)}</div></div>
                        <div><div style={{fontSize:8,color:C.textSoft,textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:700}}>Food cost</div><div style={{fontSize:14,fontWeight:800,color:C.red,fontFamily:"Georgia,serif"}}>{fmt(sess.fcTot||0)}</div></div>
                      </div>
                      <button onClick={()=>{ setDeleteSessConf(sess); setDeleteSessPin(""); }}
                        style={{padding:"5px 12px",borderRadius:6,border:`1px solid ${C.red}`,background:C.redLight,color:C.red,fontSize:10,fontWeight:700,cursor:"pointer",flexShrink:0}}>
                        🗑 Elimina
                      </button>
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {(sess.prodotti||[]).map(p=>(
                      <span key={p.nome} style={{background:"#F8F4F2",border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 10px",fontSize:10,fontWeight:700,color:C.textMid}}>
                        {p.stampi}× {p.nome}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {/* Modal conferma eliminazione sessione */}
      {deleteSessConf && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center"}}
          onClick={e=>{if(e.target===e.currentTarget){setDeleteSessConf(null);setDeleteSessPin("");}}}>
          <div style={{background:C.white,borderRadius:14,padding:"28px 32px",maxWidth:460,width:"90%",boxShadow:"0 8px 40px rgba(0,0,0,0.25)"}}>
            <div style={{fontSize:14,fontWeight:900,color:C.red,marginBottom:8}}>🗑 Elimina sessione di produzione</div>
            <div style={{fontSize:13,color:C.text,marginBottom:4}}>
              <b>{new Date(deleteSessConf.data).toLocaleDateString("it-IT",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})}</b>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",margin:"8px 0 12px"}}>
              {(deleteSessConf.prodotti||[]).map(p=>(
                <span key={p.nome} style={{background:"#F8F4F2",border:`1px solid ${C.border}`,borderRadius:5,padding:"3px 9px",fontSize:10,fontWeight:700,color:C.textMid}}>
                  {p.stampi}× {p.nome}
                </span>
              ))}
            </div>
            {deleteSessConf.ingredientiUsati && Object.keys(deleteSessConf.ingredientiUsati).length > 0 ? (
              <div style={{background:"#F0FFF4",border:"1px solid #C6EDD3",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:11,color:"#1B7A3E"}}>
                ♻️ <b>Gli ingredienti verranno restituiti al magazzino:</b>
                <div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:6}}>
                  {Object.entries(deleteSessConf.ingredientiUsati).map(([k,qty])=>(
                    <span key={k} style={{background:"#D4F0DC",borderRadius:4,padding:"2px 7px",fontSize:10,fontWeight:600,textTransform:"capitalize"}}>
                      {k}: +{qty>=1000?(qty/1000).toFixed(2)+"kg":Math.round(qty)+"g"}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{background:"#FFF8E1",border:"1px solid #FFE082",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:11,color:"#B45309"}}>
                ⚠️ Questa sessione non ha dati sugli ingredienti usati — il magazzino non verrà aggiornato.
              </div>
            )}
            <div style={{fontSize:11,fontWeight:700,color:C.textSoft,marginBottom:6}}>Scrivi <b style={{color:C.red}}>ELIMINA</b> in maiuscolo per confermare:</div>
            <input
              autoFocus
              value={deleteSessPin}
              onChange={e=>setDeleteSessPin(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter") handleDeleteSessione(deleteSessConf); }}
              placeholder="ELIMINA"
              style={{width:"100%",boxSizing:"border-box",padding:"10px 12px",borderRadius:7,border:`2px solid ${deleteSessPin==="ELIMINA"?C.red:"#DDD"}`,fontSize:14,fontWeight:800,color:C.red,letterSpacing:"0.1em",marginBottom:16,outline:"none"}}
            />
            <div style={{display:"flex",gap:10}}>
              <button
                onClick={()=>handleDeleteSessione(deleteSessConf)}
                style={{flex:1,padding:"11px",background:deleteSessPin==="ELIMINA"?C.red:"#EEE",color:deleteSessPin==="ELIMINA"?C.white:"#AAA",border:"none",borderRadius:8,fontSize:12,fontWeight:800,cursor:deleteSessPin==="ELIMINA"?"pointer":"not-allowed",transition:"background 0.2s"}}>
                Elimina e reintegra magazzino
              </button>
              <button onClick={()=>{setDeleteSessConf(null);setDeleteSessPin("");}}
                style={{flex:1,padding:"11px",background:C.white,color:C.textMid,border:`1px solid ${C.border}`,borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer"}}>
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FOTO OCR COMPONENT ──────────────────────────────────────────────────────
function FotoOCR({ mode, onResult, onBatchSave, notify, ricettario }) {
  const [imgs, setImgs]         = useState([]); // [{data, preview, mediaType}]
  const [img, setImg]           = useState(null); // compat: current base64
  const [preview, setPreview]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [parsed, setParsed]     = useState(null);
  const [error, setError]       = useState(null);
  const [multiResults, setMultiResults] = useState([]); // risultati da più foto
  const inputRef = useRef(null);

  const PROMPTS = {
    ricetta:`You are an expert OCR and recipe parser for Italian and international artisan pastry recipes.
The image may be: handwritten notes, a cookbook page, a printed recipe sheet — in ITALIAN or ENGLISH.
Instructions:
- Read ALL ingredients carefully even if handwriting is unclear — infer from context
- Extract the recipe name. If in English translate to Italian: "carrot cake"→"TORTA DI CAROTE", "banana bread"→"BANANA BREAD", "apple cake"→"TORTA DI MELE", "cookies"→"COOKIES", "poppy seed cake"→"POPPY SEEDS", "lemon coconut"→"LIMONE E COCCO"
- Extract each ingredient name IN ITALIAN LOWERCASE. Translate from English if needed: "butter"→"burro", "eggs"→"uovo", "flour"→"farina 00", "sugar"→"zucchero", "milk"→"latte intero", "cream"→"panna fresca", "baking powder"→"lievito chimico", "baking soda"→"bicarbonato", "vanilla"→"estratto di vaniglia", "cocoa powder"→"cacao amaro in polvere", "chocolate chips"→"gocce di cioccolato", "carrots"→"carota", "bananas"→"banana", "poppy seeds"→"seme di papavero", "cinnamon"→"cannella in polvere", "nutmeg"→"noce moscata", "walnuts"→"noce", "almonds"→"mandorla", "honey"→"miele", "oil"→"olio di semi", "lemon zest"→"scorza di limone", "cornstarch"→"amido di mais"
- Extract quantity IN GRAMS for each ingredient. Convert: 1 tbsp=15g, 1 tsp=5g, 1 cup=240g, 1 glass=200g, "q.b."=0, "to taste"=0
- Extract any cooking notes (temperature °C, minutes)
- If "for X servings/slices" use that as unita
- CRITICAL: Return ONLY valid JSON, no text before or after, no markdown backticks
{"nome":"RECIPE NAME IN UPPERCASE ITALIAN","ingredienti":[{"nome":"ingredient name in italian lowercase","qty":grams_as_number}],"note":"cooking notes or empty string","unita":8,"prezzo":4,"tipo":"fetta"}`,

    produzione:`You are an OCR specialist for Italian artisan pastry daily production notes.
The image is a handwritten note (paper, notebook) with today's production — e.g. "2 carote", "1 banana", "3 cookies", OR in English: "2 carrot cake", "1 banana bread".
Instructions:
- Read each line even if cursive, abbreviated, or in English
- "stampi" = number of trays/batches produced (NOT number of slices)
- Match English names to Italian: "carrot cake"/"carrot"→"TORTA DI CAROTE", "banana bread"/"banana"→"BANANA BREAD", "apple cake"→"TORTA DI MELE", "cookies"→"COOKIES", "poppy"/"poppy seeds"→"POPPY SEEDS", "domori"/"chocolate"→"DOMORI", "lemon coconut"→"LIMONE E COCCO"
- If abbreviated (e.g. "ban."=banana bread, "car."=carote, "cook."=cookies) infer from context
- Names ALWAYS UPPERCASE in JSON
- CRITICAL: Return ONLY valid JSON, no text outside JSON, no markdown
{"prodotti":[{"nome":"PRODUCT NAME UPPERCASE","stampi":integer_number}]}`,

    prezzi:`You are an OCR specialist for Italian artisan pastry wholesale price lists and invoices.
The image may be a: handwritten price list, printed wholesale catalogue, delivery receipt/invoice, supermarket receipt, or supplier price sheet — in Italian or English.
Instructions:
- Extract EVERY ingredient/product that has a visible price
- Ingredient names in ITALIAN lowercase: translate from English if needed ("butter"→"burro", "flour"→"farina 00", "eggs"→"uova", "sugar"→"zucchero", "cream"→"panna fresca", "milk"→"latte intero", "chocolate"→"cioccolato fondente")
- Extract the price PER KG (€/kg). Convert if needed: price per 100g × 10 = €/kg, price per 500g × 2 = €/kg, price per unit (e.g. 250g butter at €2.50) = €10/kg
- If you see a total invoice amount without per-unit price, skip that line
- Be conservative: if price is ambiguous, skip rather than guess
- CRITICAL: Return ONLY valid JSON, no text outside JSON, no markdown
{"ingredienti":[{"nome":"ingredient name italian lowercase","prezzo_kg":price_per_kg_as_number}]}`,

    magazzino:`You are an OCR specialist for Italian pastry ingredient/supply lists.
The image is a handwritten list (sheet, notebook, delivery receipt) of ingredients received with quantities — may be in Italian or English.
Instructions:
- Read each line even if cursive or abbreviated
- Convert ALL to grams: 1kg=1000g, 500g=500g, 1L milk≈1030g, 1L cream≈1000g, 1L oil≈920g, 1 block butter 250g=250g, 1lb=454g, 1oz=28g
- If quantity unreadable set quantita_g:0
- Ingredient names in ITALIAN lowercase: "butter"→"burro", "flour"→"farina 00", "sugar"→"zucchero", "eggs"→"uova", "milk"→"latte intero", "cream"→"panna fresca"
- Common abbreviations: "burr."=burro, "far."=farina, "zucc."=zucchero, "uov."=uova
- CRITICAL: Return ONLY valid JSON, no text outside JSON, no markdown
{"ingredienti":[{"nome":"ingredient name italian lowercase","quantita_g":grams_number}]}`
  };

  const [mediaType, setMediaType] = useState("image/jpeg");
  const readFileAsBase64 = (f) => new Promise(res => {
    const r = new FileReader();
    r.onload = ev => res({ data: ev.target.result.split(",")[1], preview: ev.target.result, mediaType: f.type?.startsWith("image/") ? f.type : "image/jpeg" });
    r.readAsDataURL(f);
  });
  const handleFile = async e => {
    const files = Array.from(e.target.files||[]);
    if (!files.length) return;
    setParsed(null); setError(null); setMultiResults([]);
    if (files.length === 1) {
      const read = await readFileAsBase64(files[0]);
      setImg(read.data); setPreview(read.preview); setMediaType(read.mediaType);
      setImgs([read]);
    } else {
      // More than 1 file: show first as preview, keep all
      const reads = await Promise.all(files.map(readFileAsBase64));
      setImgs(reads);
      setImg(reads[0].data); setPreview(reads[0].preview); setMediaType(reads[0].mediaType);
    }
  };

  const analyzeOneImage = async (imgData, imgMediaType) => {
    const r = await fetch("/api/ai", {
      method:"POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`},
      body: JSON.stringify({
        model:"claude-sonnet-4-20250514", max_tokens:1500,
        messages:[{ role:"user", content:[
          { type:"image", source:{ type:"base64", media_type:imgMediaType, data:imgData }},
          { type:"text",  text:PROMPTS[mode] }
        ]}]
      })
    });
    const d = await r.json();
    const text = d.content?.find(b=>b.type==="text")?.text||"{}";
    return JSON.parse(text.replace(/```json|```/g,"").trim());
  };

  const handleAnalizza = async () => {
    if (!img) return;
    setLoading(true); setError(null); setParsed(null); setMultiResults([]);
    try {
      const toProcess = imgs.length > 1 ? imgs : [{ data:img, mediaType }];
      if (toProcess.length === 1) {
        const obj = await analyzeOneImage(toProcess[0].data, toProcess[0].mediaType);
        setParsed(obj);
      } else if (mode === "ricetta" && onBatchSave) {
        // Ricette multiple: ogni foto è una ricetta diversa — salva ognuna direttamente
        let saved = 0, skipped = 0;
        let ricettarioAccumulato = null; // accumula tutte le ricette senza aspettare lo state React
        for (let i = 0; i < toProcess.length; i++) {
          notify(`📷 Analizzando ricetta ${i+1} di ${toProcess.length}…`);
          try {
            const obj = await analyzeOneImage(toProcess[i].data, toProcess[i].mediaType);
            const ok = await onBatchSave(obj, i, ricettarioAccumulato, (r)=>{ ricettarioAccumulato=r; });
            if (ok) saved++; else skipped++;
          } catch(e) {
            notify(`⚠ Foto ${i+1}: ${e.message}`, false);
            skipped++;
          }
        }
        notify(`✓ ${saved} ricette salvate${skipped>0?` · ${skipped} saltate (nome mancante o senza ingredienti)`:""}`);
        reset();
      } else {
        // Multiple images for non-ricetta modes: process all and merge results
        const results = [];
        for (let i = 0; i < toProcess.length; i++) {
          notify(`📷 Analizzando foto ${i+1} di ${toProcess.length}…`);
          const obj = await analyzeOneImage(toProcess[i].data, toProcess[i].mediaType);
          results.push(obj);
        }
        let merged;
        if (mode === "produzione") {
          const byNome = {};
          for (const r of results) for (const p of (r.prodotti||[])) byNome[p.nome] = (byNome[p.nome]||0) + (p.stampi||0);
          merged = { prodotti: Object.entries(byNome).map(([nome,stampi])=>({nome,stampi})) };
        } else if (mode === "prezzi") {
          const byNome = {};
          for (const r of results) for (const i of (r.ingredienti||[])) if (i.prezzo_kg>0) byNome[i.nome] = i.prezzo_kg;
          merged = { ingredienti: Object.entries(byNome).map(([nome,prezzo_kg])=>({nome,prezzo_kg})) };
        } else {
          const byNome = {};
          for (const r of results) for (const i of (r.ingredienti||[])) byNome[i.nome] = (byNome[i.nome]||0) + (i.quantita_g||0);
          merged = { ingredienti: Object.entries(byNome).map(([nome,quantita_g])=>({nome,quantita_g})) };
        }
        setParsed(merged);
        setMultiResults(results);
      }
    } catch(e) { setError(e.message); }
    setLoading(false);
  };

  const handleConferma = () => {
    if (!parsed) return;
    onResult(parsed);
    setImg(null); setPreview(null); setParsed(null);
    if (inputRef.current) inputRef.current.value="";
  };

  const reset = () => { setPreview(null); setImg(null); setImgs([]); setParsed(null); setError(null); setMultiResults([]); if(inputRef.current) inputRef.current.value=""; };

  const ML = {
    ricetta:    { title:"📷 Foto della ricetta",             sub:"Foglio scritto a mano o pagina di libro — Claude legge anche grafia difficile" },
    produzione: { title:"📷 Foto dell'appunto di oggi",      sub:"Foglietto o quaderno con le torte prodotte — anche corsivo abbreviato" },
    magazzino:  { title:"📷 Foto della lista ingredienti",   sub:"Foglio scritto con gli ingredienti arrivati e le quantità" },
    prezzi:     { title:"📷 Foto del listino / fattura",     sub:"Listino prezzi, fattura fornitore, scontrino — Claude estrae €/kg automaticamente" },
  }[mode];

  return (
    <div style={{background:"#F8F4F2",border:`2px dashed ${C.borderStr}`,borderRadius:14,padding:"20px 24px",marginBottom:24}}>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:12,fontWeight:800,color:C.text}}>{ML.title}</div>
        <div style={{fontSize:10,color:C.textSoft,marginTop:2}}>{ML.sub}</div>
      </div>
      {!preview ? (
        <label style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,padding:"24px",background:C.white,border:`1px dashed ${C.borderStr}`,borderRadius:10,cursor:"pointer"}}>
          <span style={{fontSize:28}}>📷</span>
          <span style={{fontSize:12,fontWeight:700,color:C.textMid}}>Tocca per scattare o scegli foto</span>
          <span style={{fontSize:10,color:C.textSoft}}>JPG · PNG · HEIC · <strong>più foto insieme</strong> — anche scattate col telefono</span>
          <input ref={inputRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={handleFile}/>
        </label>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"180px 1fr",gap:20,alignItems:"flex-start"}}>
          <div style={{position:"relative"}}>
            <img src={preview} alt="preview" style={{width:"100%",borderRadius:10,border:`1px solid ${C.border}`,display:"block"}}/>
            <button onClick={reset} style={{position:"absolute",top:6,right:6,width:22,height:22,borderRadius:11,background:"rgba(0,0,0,0.6)",border:"none",color:"#FFF",fontSize:11,cursor:"pointer",fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            {imgs.length>1&&<div style={{position:"absolute",bottom:6,left:6,background:"rgba(0,0,0,0.7)",color:"#FFF",fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:10}}>📷 {imgs.length} foto</div>}
            <input ref={inputRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={handleFile}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {!parsed && !loading && !error && (
              <button onClick={handleAnalizza} style={{padding:"12px",background:C.red,color:C.white,border:"none",borderRadius:9,fontWeight:800,fontSize:13,cursor:"pointer",boxShadow:"0 2px 10px rgba(192,57,43,0.25)"}}>
                🔍 Analizza con AI
              </button>
            )}
            {loading && (
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"14px",background:C.white,borderRadius:9,border:`1px solid ${C.border}`}}>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                <div style={{width:16,height:16,border:`2px solid ${C.redLight}`,borderTopColor:C.red,borderRadius:"50%",animation:"spin 0.8s linear infinite",flexShrink:0}}/>
                <div style={{fontSize:12,fontWeight:700,color:C.text}}>Claude sta leggendo la foto…</div>
              </div>
            )}
            {error && (
              <div style={{padding:"12px",background:C.redLight,borderRadius:9}}>
                <div style={{fontSize:11,fontWeight:700,color:C.red,marginBottom:6}}>⚠ {error}</div>
                <button onClick={batchMode ? handleAnalizzaBatch : handleAnalizza} style={{padding:"6px 14px",background:C.red,color:C.white,border:"none",borderRadius:6,fontSize:10,fontWeight:700,cursor:"pointer"}}>Riprova</button>
              </div>
            )}
            {parsed && !loading && (
              <div style={{background:C.white,border:`1px solid ${C.green}30`,borderRadius:10,padding:"14px"}}>
                <div style={{fontSize:11,fontWeight:800,color:C.green,marginBottom:8}}>✓ Dati estratti</div>
                {mode==="ricetta" && (
                  <div>
                    {parsed.nome && <div style={{fontSize:13,fontWeight:900,color:C.text,marginBottom:8}}>{parsed.nome}</div>}
                    <div style={{display:"flex",flexDirection:"column",gap:3,maxHeight:160,overflowY:"auto",marginBottom:6}}>
                      {(parsed.ingredienti||[]).map((ing,i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"3px 8px",background:"#F8F4F2",borderRadius:4}}>
                          <span style={{color:C.text,fontWeight:600}}>{ing.nome}</span>
                          <span style={{color:C.red,fontWeight:700}}>{ing.qty}g</span>
                        </div>
                      ))}
                    </div>
                    {parsed.note && <div style={{fontSize:10,color:C.textSoft}}>📝 {parsed.note}</div>}
                  </div>
                )}
                {mode==="produzione" && (
                  <div style={{display:"flex",flexDirection:"column",gap:3,marginBottom:6}}>
                    {(parsed.prodotti||[]).map((p,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"3px 8px",background:"#F8F4F2",borderRadius:4}}>
                        <span style={{color:C.text,fontWeight:600}}>{p.nome}</span>
                        <span style={{color:C.red,fontWeight:700}}>{p.stampi} stamp{p.stampi===1?"o":"i"}</span>
                      </div>
                    ))}
                  </div>
                )}
                {mode==="magazzino" && (
                  <div style={{display:"flex",flexDirection:"column",gap:3,maxHeight:160,overflowY:"auto",marginBottom:6}}>
                    {(parsed.ingredienti||[]).map((ing,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"3px 8px",background:"#F8F4F2",borderRadius:4}}>
                        <span style={{color:C.text,fontWeight:600,textTransform:"capitalize"}}>{ing.nome}</span>
                        <span style={{color:C.green,fontWeight:700}}>{ing.quantita_g>=1000?`${(ing.quantita_g/1000).toFixed(1)}kg`:`${ing.quantita_g}g`}</span>
                      </div>
                    ))}
                  </div>
                )}
                {mode==="prezzi" && (
                  <div style={{display:"flex",flexDirection:"column",gap:3,maxHeight:160,overflowY:"auto",marginBottom:6}}>
                    {(parsed.ingredienti||[]).filter(i=>i.prezzo_kg>0).map((ing,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"3px 8px",background:"#FEF9EC",borderRadius:4}}>
                        <span style={{color:C.text,fontWeight:600,textTransform:"capitalize"}}>{ing.nome}</span>
                        <span style={{color:C.amber,fontWeight:700}}>€{ing.prezzo_kg.toFixed(2)}/kg</span>
                      </div>
                    ))}
                    {(parsed.ingredienti||[]).filter(i=>i.prezzo_kg>0).length===0&&(
                      <div style={{fontSize:10,color:C.textSoft,padding:"6px 0"}}>Nessun prezzo estratto — riprova con una foto più nitida</div>
                    )}
                  </div>
                )}
                <div style={{display:"flex",gap:8,marginTop:8}}>
                  <button onClick={handleConferma} style={{flex:1,padding:"9px",background:C.green,color:C.white,border:"none",borderRadius:7,fontWeight:800,fontSize:11,cursor:"pointer"}}>✅ Usa questi dati</button>
                  <button onClick={()=>{setParsed(null);}} style={{padding:"9px 14px",background:C.white,color:C.textMid,border:`1px solid ${C.border}`,borderRadius:7,fontSize:10,fontWeight:600,cursor:"pointer"}}>Rianalizza</button>
                </div>
                <div style={{fontSize:9,color:C.textSoft,marginTop:6}}>Puoi modificare i dati manualmente dopo aver importato.</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── NUOVA RICETTA VIEW ───────────────────────────────────────────────────────
function NuovaRicettaView({ ricettario, onSave, notify }) {
  const ingCosti = useMemo(()=>buildIngCosti(ricettario?.ingredienti_costi||{}), [ricettario]);
  const tuttiIng = useMemo(()=>{
    const s = new Set();
    // Add actual ingredients from all recipes
    for (const ric of Object.values(ricettario?.ricette||{}))
      for (const ing of (ric.ingredienti||[])) s.add(normIng(ing.nome));
    // Add semilavorati names so they can be used as ingredients in other recipes
    for (const ric of Object.values(ricettario?.ricette||{}))
      if (getR(ric.nome,ric).tipo==="semilavorato") s.add(normIng(ric.nome||"").toLowerCase().trim());
    // Add common HoReCa ingredients
    for (const k of Object.keys(PREZZI_HORECA)) s.add(k);
    return [...s].filter(k=>k&&k.length>1).sort();
  }, [ricettario]);

  const empty = { nome:"", unita:8, prezzo:4, tipo:"fetta", note:"", ingredienti:[], congelabile:false };
  const [form, setForm] = useState(empty);
  const [newIngNome, setNewIngNome] = useState("");
  const [newIngQty,  setNewIngQty]  = useState("");
  const [editMode,   setEditMode]   = useState(null); // nome ricetta esistente in edit
  const [deleteConf, setDeleteConf] = useState(null); // nome ricetta da cancellare (step 1)
  const [deletePin,  setDeletePin]  = useState("");   // PIN conferma cancellazione
  const [overwriteConf, setOverwriteConf] = useState(null); // nome ricetta da sovrascrivere
  const [forceOverwrite, setForceOverwrite] = useState(false); // per batch foto

  // Elenco ricette esistenti per edit
  const ricetteEsistenti = Object.keys(ricettario?.ricette||{}).filter(isRicettaValida);

  const addIng = () => {
    if (!newIngNome.trim() || !newIngQty) return;
    setForm(f=>({...f, ingredienti:[...f.ingredienti, { nome:newIngNome.trim(), qty1stampo:parseFloat(newIngQty)||0, costoPerG:0, costo1stampo:0 }]}));
    setNewIngNome(""); setNewIngQty("");
  };
  const removeIng = i => setForm(f=>({...f, ingredienti:f.ingredienti.filter((_,j)=>j!==i)}));

  const loadForEdit = nome => {
    const r = ricettario?.ricette?.[nome];
    if (!r) return;
    const reg = getR(nome, ricettario?.ricette?.[nome]);
    setForm({ nome:r.nome, unita:reg.unita, prezzo:reg.prezzo, tipo:reg.tipo, note:r.note||"", ingredienti:r.ingredienti.map(i=>({...i})), congelabile:r.congelabile||false });
    setEditMode(nome);
  };

  const handleDeleteRicetta = async nome => {
    if (deletePin !== "ELIMINA") { notify("⚠ Scrivi ELIMINA in maiuscolo per confermare", false); return; }
    const nuovoRic = { ...ricettario, ricette: Object.fromEntries(Object.entries(ricettario.ricette||{}).filter(([k])=>k!==nome)) };
    delete REGOLE[nome];
    onSave(nuovoRic, {}, true); // noRedirect=true — rimane sulla pagina
    setDeleteConf(null); setDeletePin(""); setEditMode(null); setForm(empty);
    notify(`✓ Ricetta "${nome}" eliminata`);
  };

  const doSaveRicetta = () => {
    const nuovaRic = {
      nome: form.nome.trim().toUpperCase(),
      sheetName: "manuale",
      numStampi:1, totImpasto1:0, foodCost1:0,
      ingredienti: form.ingredienti,
      note: form.note,
      unita: form.unita,
      prezzo: form.prezzo,
      tipo: form.tipo,
      congelabile: form.congelabile||false,
    };
    const nuovoRic = { 
      ingredienti_costi: ricettario?.ingredienti_costi || {},
      ...(ricettario||{}), 
      ricette: { ...(ricettario?.ricette||{}), [nuovaRic.nome]: nuovaRic } 
    };
    onSave(nuovoRic, { [nuovaRic.nome]: { unita:form.unita, prezzo:form.prezzo, tipo:form.tipo } });
    setForm(empty); setEditMode(null); setOverwriteConf(null);
  };

  const handleSave = () => {
    if (!form.nome.trim() || form.ingredienti.length===0) { notify("⚠ Inserisci nome e almeno un ingrediente", false); return; }
    const nomeUp = form.nome.trim().toUpperCase();
    const esiste = ricettario?.ricette?.[nomeUp];
    const isEditing = editMode === nomeUp;
    if (esiste && !isEditing) { setOverwriteConf(nomeUp); } else { doSaveRicetta(); }
  };

  // Calcola food cost live
  const fcLive = useMemo(()=>{
    let tot=0;
    for (const ing of form.ingredienti) {
      const c = ingCosti[normIng(ing.nome)];
      if (c) tot += ing.qty1stampo * c.costoG;
    }
    return tot;
  }, [form.ingredienti, ingCosti]);
  const ricavoLive = form.unita * form.prezzo;
  const margLive   = ricavoLive - fcLive;
  const margPctLive= ricavoLive>0?(margLive/ricavoLive*100):0;

  return (
    <div style={{maxWidth:1000}}>
      <div style={{marginBottom:24}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.18em",textTransform:"uppercase",color:C.red,marginBottom:6}}>Gestione</div>
        <h1 style={{margin:"0 0 8px",fontSize:28,fontWeight:900,color:C.text,letterSpacing:"-0.03em"}}>Nuova Ricetta</h1>
        <p style={{margin:0,fontSize:12,color:C.textSoft}}>Aggiungi una ricetta manualmente oppure modificane una esistente.</p>
      </div>

      {/* Edit ricetta esistente */}
      {ricetteEsistenti.length>0 && (
        <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 20px",marginBottom:24,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
          <div style={{fontSize:11,fontWeight:700,color:C.text,marginBottom:10}}>✏️ Modifica ricetta esistente</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {ricetteEsistenti.map(n=>(
              <button key={n} onClick={()=>loadForEdit(n)}
                style={{padding:"5px 14px",borderRadius:7,border:`1px solid ${editMode===n?C.red:C.border}`,background:editMode===n?C.redLight:C.white,color:editMode===n?C.red:C.textMid,fontSize:10,fontWeight:editMode===n?800:500,cursor:"pointer"}}>
                {n}
              </button>
            ))}
          </div>
          {editMode && <div style={{marginTop:8,fontSize:10,color:C.amber}}>⚠️ Stai modificando <b>{editMode}</b> — salva per sovrascrivere.</div>}
          {/* Delete ricetta */}
          {ricetteEsistenti.length>0&&(
            <div style={{marginTop:12,borderTop:`1px solid ${C.border}`,paddingTop:10}}>
              {deleteConf===null ? (
                <button onClick={()=>setDeleteConf("")} style={{fontSize:10,fontWeight:700,color:C.red,background:"transparent",border:`1px solid ${C.red}22`,borderRadius:6,padding:"4px 12px",cursor:"pointer"}}>
                  🗑 Elimina una ricetta…
                </button>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{fontSize:10,fontWeight:700,color:C.text}}>Seleziona la ricetta da eliminare:</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {ricetteEsistenti.map(n=>(
                      <button key={n} onClick={()=>setDeleteConf(n)}
                        style={{padding:"4px 12px",borderRadius:6,border:`1px solid ${deleteConf===n?C.red:C.border}`,background:deleteConf===n?C.redLight:C.white,color:deleteConf===n?C.red:C.textMid,fontSize:10,fontWeight:deleteConf===n?800:500,cursor:"pointer"}}>
                        {n}
                      </button>
                    ))}
                  </div>
                  {deleteConf && (
                    <div style={{background:"#FFF5F5",border:`1px solid ${C.red}30`,borderRadius:8,padding:"12px 14px"}}>
                      <div style={{fontSize:11,fontWeight:700,color:C.red,marginBottom:6}}>⚠️ Stai per eliminare <b>{deleteConf}</b> in modo permanente.</div>
                      <div style={{fontSize:10,color:C.textSoft,marginBottom:8}}>Scrivi <b>ELIMINA</b> in maiuscolo per confermare:</div>
                      <div style={{display:"flex",gap:8}}>
                        <input value={deletePin} onChange={e=>setDeletePin(e.target.value)} placeholder="ELIMINA"
                          style={{flex:1,padding:"7px 10px",borderRadius:6,border:`1px solid ${deletePin==="ELIMINA"?C.red:C.borderStr}`,fontSize:12,fontWeight:700,color:C.red,letterSpacing:"0.08em"}}/>
                        <button onClick={()=>handleDeleteRicetta(deleteConf)}
                          style={{padding:"7px 16px",background:deletePin==="ELIMINA"?C.red:"#EEE",color:deletePin==="ELIMINA"?C.white:C.textSoft,border:"none",borderRadius:6,fontSize:11,fontWeight:800,cursor:deletePin==="ELIMINA"?"pointer":"default"}}>
                          Elimina
                        </button>
                        <button onClick={()=>{setDeleteConf(null);setDeletePin("");}}
                          style={{padding:"7px 12px",background:"transparent",color:C.textMid,border:`1px solid ${C.border}`,borderRadius:6,fontSize:11,cursor:"pointer"}}>
                          Annulla
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* FOTO OCR */}
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,padding:"8px 12px",background:C.amberLight,borderRadius:8,border:`1px solid ${C.amber}40`}}>
        <label style={{display:"flex",alignItems:"center",gap:7,cursor:"pointer",fontSize:11,color:C.amber,fontWeight:700}}>
          <input type="checkbox" checked={forceOverwrite} onChange={e=>setForceOverwrite(e.target.checked)} style={{width:14,height:14,cursor:"pointer"}}/>
          Sovrascrivi ricette già esistenti (per aggiornamenti da foto)
        </label>
        <span style={{fontSize:9,color:C.textSoft}}>Disattivato = le ricette con lo stesso nome vengono saltate</span>
      </div>
      <FotoOCR mode="ricetta" notify={notify} ricettario={ricettario}
        onResult={res=>{
          const SKIP_ING_OCR = ["ingrediente","ingredient","ingredienti","nome ingrediente in minuscolo","n/d","nan","undefined",""];
          const ings = (res.ingredienti||[])
            .map(i=>({ nome: translateIngredienteEN(i.nome||""), qty1stampo: parseFloat(i.qty)||0, costoPerG:0, costo1stampo:0 }))
            .filter(i => !SKIP_ING_OCR.includes(i.nome.toLowerCase().trim()) && i.qty1stampo > 0);
          const nomeIT = translateProdottoEN(res.nome||"");
          if (!isRicettaValida(nomeIT)) return;
          setForm(f=>({
            ...f,
            nome:  nomeIT || f.nome,
            note:  res.note || f.note,
            unita: res.unita || f.unita,
            prezzo:res.prezzo|| f.prezzo,
            tipo:  res.tipo  || f.tipo,
            ingredienti: ings.length>0 ? ings : f.ingredienti,
          }));
          notify(`📷 Importata: ${nomeIT||"ricetta"} con ${ings.length} ingredienti`);
        }}
        onBatchSave={async (res, idx, ricAcc, setRicAcc) => {
          // Salva direttamente una ricetta da OCR senza passare dal form
          const SKIP_ING_OCR = ["ingrediente","ingredient","ingredienti","nome ingrediente in minuscolo","n/d","nan","undefined",""];
          const ings = (res.ingredienti||[])
            .map(i=>({ nome: translateIngredienteEN(i.nome||""), qty1stampo: parseFloat(i.qty)||0, costoPerG:0, costo1stampo:0 }))
            .filter(i => !SKIP_ING_OCR.includes(i.nome.toLowerCase().trim()) && i.qty1stampo > 0);
          const nomeIT = (translateProdottoEN(res.nome||"")||"").trim().toUpperCase();
          if (!nomeIT || ings.length === 0 || !isRicettaValida(nomeIT.toLowerCase())) return false; // skip invalidi
          // Se già esiste e forceOverwrite è false → salta
          if ((ricAcc||ricettario)?.ricette?.[nomeIT] && !forceOverwrite) {
            notify(`⚠ "${nomeIT}" già esistente — saltata (attiva "Sovrascrivi esistenti" per aggiornare)`, false);
            return false;
          }
          const nuovaRic = {
            nome: nomeIT,
            sheetName: "manuale",
            numStampi:1, totImpasto1:0, foodCost1:0,
            ingredienti: ings,
            note: res.note||"",
            unita: res.unita||8,
            prezzo: res.prezzo||4,
            tipo: res.tipo||"fetta",
            congelabile: false,
          };
          // Usa il ricettario accumulato (non lo state React che è stale) per non sovrascrivere ricette precedenti
          const base = ricAcc || ricettario || {};
          const nuovoRic = {
            ingredienti_costi: base.ingredienti_costi||{},
            ...base,
            ricette: { ...(base.ricette||{}), [nomeIT]: nuovaRic }
          };
          const nuoveRegole = { [nomeIT]: { unita:nuovaRic.unita, prezzo:nuovaRic.prezzo, tipo:nuovaRic.tipo } };
          await onSave(nuovoRic, nuoveRegole, true); // noRedirect
          setRicAcc(nuovoRic); // aggiorna il riferimento locale accumulato
          return true;
        }}
      />

      <div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:24}}>
        {/* Form sinistra */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {/* Nome + tipo + vendita */}
          <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
            <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:16}}>📋 Informazioni prodotto</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              {[
                {lbl:"Nome ricetta",span:2,el:<input value={form.nome} onChange={e=>setForm(f=>({...f,nome:e.target.value.toUpperCase()}))} placeholder="es. TORTA AL CIOCCOLATO" style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${C.borderStr}`,fontSize:13,color:C.text,fontWeight:700}}/>},
                {lbl:"Tipo unità",el:<>
                  <select value={form.tipo} onChange={e=>setForm(f=>({...f,tipo:e.target.value,unita:e.target.value==="semilavorato"||e.target.value==="interno"?0:f.unita,prezzo:e.target.value==="semilavorato"||e.target.value==="interno"?0:f.prezzo}))} style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${C.borderStr}`,fontSize:12,color:C.text,background:C.white}}>
                    <option value="fetta">Fetta</option><option value="pezzo">Pezzo</option><option value="interno">Uso interno</option><option value="semilavorato">🧁 Semilavorato (base/impasto)</option>
                  </select>
                  {form.tipo==="semilavorato"&&<div style={{marginTop:6,padding:"6px 10px",background:"#F9F2FD",border:"1px solid #D4B0E8",borderRadius:6,fontSize:10,color:"#8E44AD"}}>
                    💡 Per i semilavorati usa la sezione dedicata <strong>"🧁 Semilavorati"</strong> in sidebar — ha template rapidi e import da foto.
                  </div>}
                </>,},
                {lbl:"Unità per stampo",el:<input type="number" min="0" value={form.unita} onChange={e=>setForm(f=>({...f,unita:parseFloat(e.target.value)||0}))} style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${C.borderStr}`,fontSize:13,color:C.text}}/>},
                {lbl:"Prezzo vendita / unità (€)",el:<input type="number" min="0" step="0.5" value={form.prezzo} onChange={e=>setForm(f=>({...f,prezzo:parseFloat(e.target.value)||0}))} style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${C.borderStr}`,fontSize:13,color:C.text}}/>},
                {lbl:"Note (cottura, temperatura…)",span:2,el:<input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="es. 180°C per 45 min" style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${C.borderStr}`,fontSize:12,color:C.text}}/>},
              ].map(({lbl,el,span})=>(
                <div key={lbl} style={{gridColumn:span===2?"1 / -1":"auto"}}>
                  <div style={{fontSize:9,fontWeight:700,color:C.textSoft,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>{lbl}</div>
                  {el}
                </div>
              ))}
            </div>
            {/* Congelabile toggle */}
            <div style={{marginTop:14,display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:form.congelabile?"#EEF8FF":"#F8F4F2",borderRadius:8,border:`1px solid ${form.congelabile?"#BDE":"#E8E0DC"}`,cursor:"pointer"}}
              onClick={()=>setForm(f=>({...f,congelabile:!f.congelabile}))}>
              <div style={{width:36,height:20,borderRadius:10,background:form.congelabile?"#2980B9":"#C8B8B4",position:"relative",flexShrink:0,transition:"background 0.2s"}}>
                <div style={{position:"absolute",top:2,left:form.congelabile?18:2,width:16,height:16,borderRadius:8,background:"#FFF",transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:800,color:form.congelabile?"#2980B9":C.textMid}}>
                  {form.congelabile?"❄ Prodotto congelabile":"❄ Congelabile"}
                </div>
                <div style={{fontSize:9,color:C.textSoft,marginTop:1}}>
                  {form.congelabile?"Può essere prodotto e conservato in freezer — la vendita può avvenire nei giorni successivi":"Attiva se questo prodotto può essere congelato e venduto in giorni diversi dalla produzione"}
                </div>
              </div>
            </div>
          </div>

          {/* Ingredienti */}
          <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
            <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:14}}>🧾 Ingredienti</div>
            {form.ingredienti.length>0 && (
              <div style={{marginBottom:14,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead>
                    <tr style={{background:"#F8F4F2"}}>
                      {["Ingrediente","g / stampo","Costo €",""].map((h,i)=>(
                        <th key={i} style={{padding:"7px 10px",textAlign:i===0?"left":"right",fontSize:8,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",color:C.textSoft,borderBottom:`1px solid ${C.border}`}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {form.ingredienti.map((ing,i)=>{
                      const c = ingCosti[normIng(ing.nome)];
                      const costo = c ? parseFloat((ing.qty1stampo*c.costoG).toFixed(3)) : 0;
                      return (
                        <tr key={i} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:"#FDFAF7"}}>
                          <td style={{padding:"7px 10px",fontWeight:600,color:C.text}}>
                            {ing.nome}
                            {!c&&<span style={{fontSize:7,marginLeft:4,background:C.amberLight,color:C.amber,padding:"1px 4px",borderRadius:3,fontWeight:700}}>prezzo mancante</span>}
                          </td>
                          <td style={{padding:"4px 10px",textAlign:"right"}}>
                            <input
                              type="number" min="0" value={ing.qty1stampo}
                              onChange={e=>{
                                const n=[...form.ingredienti];
                                n[i]={...n[i],qty1stampo:parseFloat(e.target.value)||0};
                                setForm(f=>({...f,ingredienti:n}));
                              }}
                              style={{width:72,padding:"4px 7px",borderRadius:6,border:`1px solid ${C.borderStr}`,fontSize:12,textAlign:"right",fontWeight:700,color:C.text,background:C.white}}
                            />
                            <span style={{fontSize:9,color:C.textSoft,marginLeft:3}}>g</span>
                          </td>
                          <td style={{padding:"7px 10px",textAlign:"right",color:costo>0?C.red:C.textSoft,fontWeight:600}}>{costo>0?fmt(costo):"—"}</td>
                          <td style={{padding:"7px 6px",textAlign:"right"}}>
                            <button onClick={()=>removeIng(i)} style={{padding:"2px 7px",borderRadius:4,border:`1px solid ${C.border}`,background:C.white,color:C.textSoft,fontSize:9,cursor:"pointer"}}>✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {/* Add ingrediente */}
            <div style={{display:"grid",gridTemplateColumns:"1fr 100px auto",gap:8,alignItems:"flex-end"}}>
              <div>
                <div style={{fontSize:9,fontWeight:700,color:C.textSoft,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>Ingrediente</div>
                <input value={newIngNome} onChange={e=>setNewIngNome(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addIng()}
                  placeholder="es. burro" list="ing-autocomplete"
                  style={{width:"100%",padding:"8px 10px",borderRadius:7,border:`1px solid ${C.borderStr}`,fontSize:12,color:C.text}}/>
                <datalist id="ing-autocomplete">{tuttiIng.map(k=><option key={k} value={k}/>)}</datalist>
              </div>
              <div>
                <div style={{fontSize:9,fontWeight:700,color:C.textSoft,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>Grammi</div>
                <input type="number" min="0" value={newIngQty} onChange={e=>setNewIngQty(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addIng()}
                  placeholder="es. 200"
                  style={{width:"100%",padding:"8px 10px",borderRadius:7,border:`1px solid ${C.borderStr}`,fontSize:12,color:C.text}}/>
              </div>
              <button onClick={addIng} style={{padding:"8px 16px",background:C.red,color:C.white,border:"none",borderRadius:7,fontSize:11,fontWeight:700,cursor:"pointer",marginBottom:0,height:36}}>+ Aggiungi</button>
            </div>
          </div>

          {overwriteConf && (
            <div style={{padding:"14px 16px",background:C.amberLight,border:`2px solid ${C.amber}`,borderRadius:10,marginBottom:4}}>
              <div style={{fontSize:12,fontWeight:800,color:C.amber,marginBottom:8}}>
                ⚠️ "{overwriteConf}" esiste già — sovrascrivere?
              </div>
              <div style={{fontSize:11,color:C.textMid,marginBottom:10}}>La ricetta esistente verrà sostituita con i nuovi ingredienti e dati.</div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={doSaveRicetta} style={{padding:"8px 18px",background:C.amber,color:C.white,border:"none",borderRadius:7,fontWeight:800,fontSize:11,cursor:"pointer"}}>
                  ✅ Sì, sovrascrivi
                </button>
                <button onClick={()=>setOverwriteConf(null)} style={{padding:"8px 14px",background:C.white,border:`1px solid ${C.border}`,borderRadius:7,fontSize:11,color:C.textMid,cursor:"pointer"}}>
                  ✕ Annulla
                </button>
              </div>
            </div>
          )}
          <button onClick={handleSave} style={{padding:"13px",background:C.red,color:C.white,border:"none",borderRadius:10,fontWeight:900,fontSize:13,cursor:"pointer",boxShadow:"0 2px 10px rgba(192,57,43,0.25)"}}>
            💾 {editMode?"Salva modifiche a "+editMode:"Salva nuova ricetta"}
          </button>
        </div>

        {/* P&L preview destra */}
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px",boxShadow:"0 1px 4px rgba(0,0,0,0.04)",position:"sticky",top:20}}>
            <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:16}}>📊 Anteprima P&L</div>
            {form.ingredienti.length===0 ? (
              <div style={{color:C.textSoft,fontSize:11,textAlign:"center",padding:"20px 0"}}>Aggiungi ingredienti per vedere il calcolo</div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div style={{padding:"10px 14px",background:C.greenLight,border:`1px solid ${C.green}25`,borderRadius:8,display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:11,color:C.green,fontWeight:700}}>+ Ricavo ({form.unita} × {fmt(form.prezzo)})</span>
                  <span style={{fontSize:13,fontWeight:900,color:C.green,fontFamily:"Georgia,serif"}}>{fmt(ricavoLive)}</span>
                </div>
                <div style={{padding:"10px 14px",background:C.redLight,border:`1px solid ${C.red}20`,borderRadius:8,display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:11,color:C.red,fontWeight:700}}>− Food cost</span>
                  <span style={{fontSize:13,fontWeight:900,color:C.red,fontFamily:"Georgia,serif"}}>−{fmt(fcLive)}</span>
                </div>
                <div style={{padding:"12px 14px",background:margPctLive>=60?C.greenLight:margPctLive>=40?C.amberLight:C.redLight,border:`1px solid ${margColor(margPctLive)}25`,borderRadius:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontSize:12,fontWeight:800,color:margColor(margPctLive)}}>= Margine lordo</span>
                    <span style={{fontSize:16,fontWeight:900,color:margColor(margPctLive),fontFamily:"Georgia,serif"}}>{fmt(margLive)}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                    <span style={{color:C.textMid}}>Margine %</span>
                    <span style={{fontWeight:700,color:margColor(margPctLive)}}>{fmtp(margPctLive)}</span>
                  </div>
                </div>
                <div style={{fontSize:10,color:C.textSoft,lineHeight:1.6,marginTop:4}}>
                  💡 Per unità: FC {fmt(form.unita>0?fcLive/form.unita:0)} · Marg. {fmt(form.unita>0?margLive/form.unita:0)}
                </div>
                {margPctLive>0 && margBadge(margPctLive)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── STORICO PRODUZIONE VIEW ──────────────────────────────────────────────────
function StoricoProduzioneView({ ricettario, giornaliero, chiusure }) {
  const [vista, setVista]   = useState("giornaliero"); // "giornaliero" | "settimana" | "mese"
  const [tab, setTab]       = useState("produzione"); // "produzione" | "vendite" | "confronto"
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const ingCosti = useMemo(()=>buildIngCosti(ricettario?.ingredienti_costi||{}), [ricettario]);

  // Filtra sessioni per data range
  const filterByDate = (list, getDate) => {
    if (!dateFrom && !dateTo) return list;
    return list.filter(item => {
      const d = getDate(item);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo   && d > dateTo)   return false;
      return true;
    });
  };

  const getWeekKey = dateStr => {
    const d = new Date(dateStr+"T12:00");
    const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dow = tmp.getUTCDay()||7;
    tmp.setUTCDate(tmp.getUTCDate()+4-dow);
    const ys = new Date(Date.UTC(tmp.getUTCFullYear(),0,1));
    const wn = Math.ceil((((tmp-ys)/86400000)+1)/7);
    return `${tmp.getUTCFullYear()}-W${String(wn).padStart(2,"0")}`;
  };
  const getMonthKey = d => d.slice(0,7);
  const getDayKey   = d => d.slice(0,10);
  const getKey      = d => vista==="giornaliero"?getDayKey(d):vista==="settimana"?getWeekKey(d):getMonthKey(d);
  const fmtKey      = k => {
    if (vista==="giornaliero") {
      const [y,m,dd] = k.split("-");
      return `${dd}/${m}/${y.slice(2)}`;
    }
    if (vista==="settimana") return `Sett. ${k.split("-W")[1]} '${k.split("-W")[0].slice(2)}`;
    return `${MN[parseInt(k.slice(5))]} '${k.slice(2,4)}`;
  };

  // ── PERIODI PRODUZIONE (da giornaliero) ─────────────────────────────────────
  const periodiProd = useMemo(()=>{
    const map = {};
    const sessFiltered = filterByDate(giornaliero||[], s=>s.data);
    for (const sess of sessFiltered) {
      const k = getKey(sess.data);
      if (!map[k]) map[k]={ key:k, sessioni:[], stampiTot:0, ricavoTot:0, fcTot:0, byRicetta:{} };
      map[k].sessioni.push(sess);
      for (const prod of (sess.prodotti||[])) {
        const ric = ricettario?.ricette?.[prod.nome];
        const reg = getR(prod.nome, ric);
        const {tot:fc} = ric?calcolaFC(ric, ingCosti, ricettario):{tot:0};
        const rv = prod.stampi*reg.unita*reg.prezzo;
        map[k].stampiTot  += prod.stampi;
        map[k].ricavoTot  += rv;
        map[k].fcTot      += prod.stampi*fc;
        map[k].byRicetta[prod.nome] = (map[k].byRicetta[prod.nome]||0)+prod.stampi;
      }
    }
    return Object.values(map).sort((a,b)=>a.key.localeCompare(b.key)).map(p=>({
      ...p, margine:p.ricavoTot-p.fcTot, margPct:p.ricavoTot>0?((p.ricavoTot-p.fcTot)/p.ricavoTot*100):0, label:fmtKey(p.key)
    }));
  }, [giornaliero, vista, ricettario, ingCosti, dateFrom, dateTo]);

  // ── PERIODI VENDITE (da chiusure) ───────────────────────────────────────────
  const periodiVend = useMemo(()=>{
    const map = {};
    const chiusureFiltered = filterByDate(chiusure||[], c=>c.data);
    for (const ch of chiusureFiltered) {
      const k = getKey(ch.data);
      if (!map[k]) map[k]={ key:k, chiusure:[], rvTot:0, fcTot:0, margTot:0, sproTot:0, byProd:{}, stSum:0, stCnt:0 };
      map[k].chiusure.push(ch);
      map[k].rvTot   += ch.kpi.totV||0;
      map[k].fcTot   += ch.kpi.totFC||0;
      map[k].margTot += ch.kpi.totM||0;
      map[k].sproTot += ch.kpi.totS||0;
      map[k].stSum   += ch.kpi.avgST||0;
      map[k].stCnt   += 1;
      for (const r of (ch.confronto||[])) {
        if (!map[k].byProd[r.nome]) map[k].byProd[r.nome]={ rv:0, unitaV:0, spreco:0 };
        map[k].byProd[r.nome].rv     += r.rv||0;
        map[k].byProd[r.nome].unitaV += r.unitaV||0;
        map[k].byProd[r.nome].spreco += r.spreco||0;
      }
    }
    return Object.values(map).sort((a,b)=>a.key.localeCompare(b.key)).map(p=>({
      ...p, margPct:p.rvTot>0?(p.margTot/p.rvTot*100):0, avgST:p.stCnt>0?(p.stSum/p.stCnt):0, label:fmtKey(p.key)
    }));
  }, [chiusure, vista, dateFrom, dateTo]);

  // Ricette/prodotti attivi nei due dataset
  const ricetteAttive = useMemo(()=>{
    const s=new Set();
    for (const p of periodiProd) for (const k of Object.keys(p.byRicetta)) s.add(k);
    return [...s];
  }, [periodiProd]);

  const prodottiVend = useMemo(()=>{
    const s=new Set();
    for (const p of periodiVend) for (const k of Object.keys(p.byProd)) s.add(k);
    return [...s];
  }, [periodiVend]);

  // Grafico dati
  const STACK_COLORS = [C.red,"#E07040","#D4A030","#5B8FCE","#7B7B7B","#A0522D","#1B7A3E","#8E44AD"];
  const dataProd   = periodiProd.map(p=>({ label:p.label, ...p.byRicetta }));
  const dataKPI    = periodiProd.map(p=>({ label:p.label, Ricavo:+p.ricavoTot.toFixed(2), FoodCost:+p.fcTot.toFixed(2), Margine:+p.margine.toFixed(2) }));
  const dataVend   = periodiVend.map(p=>({ label:p.label, ...Object.fromEntries(Object.entries(p.byProd).map(([n,v])=>[n,+v.rv.toFixed(2)])) }));
  const dataVendKPI= periodiVend.map(p=>({ label:p.label, Ricavo:+p.rvTot.toFixed(2), FoodCost:+p.fcTot.toFixed(2), Margine:+p.margTot.toFixed(2), Spreco:+p.sproTot.toFixed(2) }));
  const dataST     = periodiVend.map(p=>({ label:p.label, "Sell-Through":+p.avgST.toFixed(1) }));

  // KPI globali produzione
  const totRP=periodiProd.reduce((s,p)=>s+p.ricavoTot,0);
  const totFP=periodiProd.reduce((s,p)=>s+p.fcTot,0);
  const totMP=periodiProd.reduce((s,p)=>s+p.stampiTot,0);
  const topP =Object.entries(periodiProd.reduce((m,p)=>{for(const[k,v] of Object.entries(p.byRicetta))m[k]=(m[k]||0)+v;return m;},{})).sort((a,b)=>b[1]-a[1])[0];

  // KPI globali vendite
  const totRV=periodiVend.reduce((s,p)=>s+p.rvTot,0);
  const totFV=periodiVend.reduce((s,p)=>s+p.fcTot,0);
  const totSV=periodiVend.reduce((s,p)=>s+p.sproTot,0);
  const totMV=totRV-totFV;
  const avgST=periodiVend.length>0?periodiVend.reduce((s,p)=>s+p.avgST,0)/periodiVend.length:0;

  const hasProd = giornaliero?.length>0;
  const hasVend = chiusure?.length>0;

  if (!hasProd && !hasVend) return (
    <div style={{maxWidth:700,margin:"80px auto",textAlign:"center"}}>
      <div style={{fontSize:36,marginBottom:14}}>📊</div>
      <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:8}}>Nessun dato storico</div>
      <div style={{fontSize:12,color:C.textSoft}}>Registra la produzione e le chiusure giornaliere per vedere lo storico.</div>
    </div>
  );

  return (
    <div style={{maxWidth:1100}}>
      {/* Header + toggle */}
      <div style={{marginBottom:24,display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.18em",textTransform:"uppercase",color:C.red,marginBottom:6}}>Analytics</div>
          <h1 style={{margin:"0 0 4px",fontSize:28,fontWeight:900,color:C.text,letterSpacing:"-0.03em"}}>Storico</h1>
          <p style={{margin:0,fontSize:12,color:C.textSoft}}>Produzione, vendite reali e confronto per settimana o mese.</p>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8,alignItems:"flex-end"}}>
          {/* Tab produzione/vendite/confronto */}
          <div style={{display:"flex",background:"#F0EAE6",borderRadius:9,padding:3,gap:2}}>
            {[["produzione","📦 Produzione"],["vendite","💰 Vendite"],["confronto","🔄 Confronto"]].map(([id,lbl])=>(
              <button key={id} onClick={()=>setTab(id)}
                style={{padding:"7px 16px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:700,fontSize:11,background:tab===id?C.red:"transparent",color:tab===id?C.white:C.textMid,transition:"all 0.15s",whiteSpace:"nowrap"}}>
                {lbl}
              </button>
            ))}
          </div>
          {/* Toggle giornaliero/settimana/mese */}
          <div style={{display:"flex",background:"#F0EAE6",borderRadius:9,padding:3,gap:2}}>
            {[["giornaliero","Giorno"],["settimana","Settimana"],["mese","Mese"]].map(([id,lbl])=>(
              <button key={id} onClick={()=>setVista(id)}
                style={{padding:"5px 12px",borderRadius:7,border:"none",cursor:"pointer",fontWeight:600,fontSize:10,background:vista===id?"rgba(192,57,43,0.18)":"transparent",color:vista===id?C.red:C.textMid,transition:"all 0.15s"}}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ─── FILTRI DATA ─── */}
      <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap",alignItems:"center",
        padding:"10px 14px",background:"#F8F4F2",borderRadius:9,border:`1px solid ${C.border}`}}>
        <span style={{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:C.textSoft}}>Periodo:</span>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
          style={{padding:"5px 9px",borderRadius:6,border:`1px solid ${C.borderStr}`,fontSize:11,color:C.text,background:C.white}}/>
        <span style={{fontSize:10,color:C.textSoft}}>→</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
          style={{padding:"5px 9px",borderRadius:6,border:`1px solid ${C.borderStr}`,fontSize:11,color:C.text,background:C.white}}/>
        {(dateFrom||dateTo)&&<>
          <button onClick={()=>{setDateFrom("");setDateTo("");}}
            style={{padding:"5px 10px",borderRadius:6,border:`1px solid ${C.border}`,background:C.white,color:C.textSoft,fontSize:10,fontWeight:600,cursor:"pointer"}}>✕ Reset</button>
          <span style={{fontSize:10,color:C.amber,fontWeight:600,marginLeft:4}}>
            🔍 {[dateFrom&&`Da ${dateFrom}`,dateTo&&`a ${dateTo}`].filter(Boolean).join(" ")}
          </span>
        </>}
      </div>

      {/* ─── TAB PRODUZIONE ─── */}
      {tab==="produzione"&&(
        <>
          {!hasProd&&<div style={{textAlign:"center",padding:"40px",background:C.bgCard,borderRadius:12,border:`1px solid ${C.border}`,color:C.textSoft,fontSize:12}}>Nessuna produzione registrata</div>}
          {hasProd&&(
            <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:24}}>
                <KPI icon="📦" label="Stampi totali"  value={totMP}           highlight/>
                <KPI icon="💰" label="Ricavi stimati" value={fmt(totRP)}      color={C.green}/>
                <KPI icon="🧾" label="Food cost tot." value={fmt(totFP)}      color={C.red}/>
                <KPI icon="📈" label="Margine lordo"  value={fmt(totRP-totFP)} color={margColor(totRP>0?((totRP-totFP)/totRP*100):0)}/>
                <KPI icon="🏆" label="Piu prodotto"   value={topP?topP[0].replace("TORTA DI ",""):"—"} sub={topP?`${topP[1]} stampi`:""} color={C.amber}/>
              </div>
              <SH sub={`Stampi per ${vista} e per prodotto`}>Produzione per {vista==="giornaliero"?"Giorno":vista==="settimana"?"Settimana":"Mese"}</SH>
              <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px",marginBottom:12,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={dataProd} margin={{top:4,right:16,left:0,bottom:0}} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0E8E4" vertical={false}/>
                    <XAxis dataKey="label" tick={{fill:C.textMid,fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fill:C.textSoft,fontSize:9}} axisLine={false} tickLine={false} allowDecimals={false}/>
                    <Tooltip content={<ChartTip/>}/>
                    <Legend wrapperStyle={{fontSize:10,paddingTop:12}}/>
                    {ricetteAttive.map((n,i)=>(
                      <Bar key={n} dataKey={n} stackId="a" fill={STACK_COLORS[i%STACK_COLORS.length]} radius={i===ricetteAttive.length-1?[3,3,0,0]:[0,0,0,0]}/>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <SH sub={`Ricavi stimati, FC e margine per ${vista}`}>Andamento Economico (stimato)</SH>
              <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px",marginBottom:24,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={dataKPI} margin={{top:4,right:16,left:0,bottom:0}} barCategoryGap="35%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0E8E4" vertical={false}/>
                    <XAxis dataKey="label" tick={{fill:C.textMid,fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis tickFormatter={v=>`€${v}`} tick={{fill:C.textSoft,fontSize:9}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<ChartTip/>} formatter={(v,n)=>[fmt(v),n]}/>
                    <Legend wrapperStyle={{fontSize:10,paddingTop:12}}/>
                    <Bar dataKey="Ricavo"   fill={C.green} opacity={0.25} radius={[3,3,0,0]}/>
                    <Bar dataKey="FoodCost" fill={C.red}   opacity={0.85} radius={[3,3,0,0]}/>
                    <Bar dataKey="Margine"  fill={C.green} opacity={0.85} radius={[3,3,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <SH sub="Dettaglio per periodo">Riepilogo Periodi</SH>
              <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead>
                    <tr style={{background:"#F8F4F2"}}>
                      {["Periodo","Sessioni","Stampi","Ricavo stim.","Food Cost","Margine","Marg%","Top prodotto"].map((h,i)=>(
                        <th key={i} style={{padding:"10px 12px",textAlign:i===0?"left":"right",fontSize:8,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",color:C.textSoft,borderBottom:`1px solid ${C.border}`}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...periodiProd].reverse().map((p,i)=>{
                      const top=Object.entries(p.byRicetta).sort((a,b)=>b[1]-a[1])[0];
                      return (
                        <tr key={p.key} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:"#FDFAF7"}}>
                          <td style={{padding:"10px 12px",fontWeight:700,color:C.text}}>{p.label}</td>
                          <td style={{padding:"10px 12px",textAlign:"right",color:C.textMid}}>{p.sessioni.length}</td>
                          <td style={{padding:"10px 12px",textAlign:"right",fontWeight:600}}>{p.stampiTot}</td>
                          <td style={{padding:"10px 12px",textAlign:"right",color:C.green,fontWeight:600}}>{fmt(p.ricavoTot)}</td>
                          <td style={{padding:"10px 12px",textAlign:"right",color:C.red}}>{fmt(p.fcTot)}</td>
                          <td style={{padding:"10px 12px",textAlign:"right",fontWeight:800,color:margColor(p.margPct),fontFamily:"Georgia,serif"}}>{fmt(p.margine)}</td>
                          <td style={{padding:"10px 12px",textAlign:"right"}}>{margBadge(p.margPct)}</td>
                          <td style={{padding:"10px 12px",textAlign:"right",color:C.textSoft,fontSize:10}}>{top?`${top[0].replace("TORTA DI ","")} (${top[1]})`:"-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ─── TAB VENDITE REALI ─── */}
      {tab==="vendite"&&(
        <>
          {!hasVend&&(
            <div style={{textAlign:"center",padding:"48px",background:C.bgCard,borderRadius:12,border:`1px solid ${C.border}`}}>
              <div style={{fontSize:32,marginBottom:12}}>🧾</div>
              <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:8}}>Nessuna chiusura registrata</div>
              <div style={{fontSize:12,color:C.textSoft}}>Carica gli scontrini di fine giornata dalla sezione <b>Chiusura</b> per vedere i dati di vendita reali qui.</div>
            </div>
          )}
          {hasVend&&(
            <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:24}}>
                <KPI icon="💰" label="Ricavi reali tot." value={fmt(totRV)}  highlight/>
                <KPI icon="📈" label="Margine reale"     value={fmt(totMV)}  color={margColor(totRV>0?(totMV/totRV*100):0)} sub={fmtp(totRV>0?(totMV/totRV*100):0)}/>
                <KPI icon="🧾" label="Food cost vend."   value={fmt(totFV)}  color={C.red}/>
                <KPI icon="🎯" label="Sell-through med." value={fmtp(avgST)} color={avgST>=85?C.green:avgST>=65?C.amber:C.red}/>
                <KPI icon="🗑" label="Spreco tot. stim." value={fmt(totSV)}  color={totSV>20?C.red:C.amber}/>
              </div>

              <SH sub={`Ricavi reali da scontrini per ${vista}`}>Ricavi Reali per {vista==="settimana"?"Settimana":"Mese"}</SH>
              <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px",marginBottom:12,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={dataVend} margin={{top:4,right:16,left:0,bottom:0}} barCategoryGap="30%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0E8E4" vertical={false}/>
                    <XAxis dataKey="label" tick={{fill:C.textMid,fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis tickFormatter={v=>`€${v}`} tick={{fill:C.textSoft,fontSize:9}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<ChartTip/>} formatter={(v,n)=>[fmt(v),n]}/>
                    <Legend wrapperStyle={{fontSize:10,paddingTop:12}}/>
                    {prodottiVend.map((n,i)=>(
                      <Bar key={n} dataKey={n} stackId="a" fill={STACK_COLORS[i%STACK_COLORS.length]} radius={i===prodottiVend.length-1?[3,3,0,0]:[0,0,0,0]}/>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <SH sub="Sell-through medio per periodo">Andamento Sell-Through %</SH>
              <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px",marginBottom:12,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={dataST} margin={{top:4,right:16,left:0,bottom:0}} barCategoryGap="40%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0E8E4" vertical={false}/>
                    <XAxis dataKey="label" tick={{fill:C.textMid,fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis domain={[0,100]} tickFormatter={v=>`${v}%`} tick={{fill:C.textSoft,fontSize:9}} axisLine={false} tickLine={false}/>
                    <Tooltip formatter={(v)=>[`${v.toFixed(1)}%`,"Sell-Through"]}/>
                    <ReferenceLine y={85} stroke={C.green} strokeDasharray="4 4" label={{value:"85%",fill:C.green,fontSize:9}}/>
                    <ReferenceLine y={65} stroke={C.amber} strokeDasharray="4 4" label={{value:"65%",fill:C.amber,fontSize:9}}/>
                    <Bar dataKey="Sell-Through" fill={C.red} radius={[4,4,0,0]}>
                      {dataST.map((d,i)=>(
                        <Cell key={i} fill={d["Sell-Through"]>=85?C.green:d["Sell-Through"]>=65?C.amber:C.red}/>
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <SH sub="Ricavo, FC, margine e spreco per periodo">Conto Economico Reale</SH>
              <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px",marginBottom:20,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={dataVendKPI} margin={{top:4,right:16,left:0,bottom:0}} barCategoryGap="35%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0E8E4" vertical={false}/>
                    <XAxis dataKey="label" tick={{fill:C.textMid,fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis tickFormatter={v=>`€${v}`} tick={{fill:C.textSoft,fontSize:9}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<ChartTip/>} formatter={(v,n)=>[fmt(v),n]}/>
                    <Legend wrapperStyle={{fontSize:10,paddingTop:12}}/>
                    <Bar dataKey="Ricavo"   fill={C.green} opacity={0.25} radius={[3,3,0,0]}/>
                    <Bar dataKey="FoodCost" fill={C.red}   opacity={0.85} radius={[3,3,0,0]}/>
                    <Bar dataKey="Margine"  fill={C.green} opacity={0.85} radius={[3,3,0,0]}/>
                    <Bar dataKey="Spreco"   fill={C.amber} opacity={0.85} radius={[3,3,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* BATCH RESULTS */}

          {/* ─── OVERVIEW C-LEVEL ─── */}
          {(chiusure||[]).length > 0 && (() => {
            const giorni = [...(chiusure||[])].sort((a,b)=>a.data.localeCompare(b.data));
            const n = giorni.length;
            const euro = v => v==null?"—":`€${Number(v).toFixed(2)}`;
            const pct  = v => v==null?"—":`${Number(v).toFixed(1)}%`;
            const fmt2 = v => v>=1000?`€${(v/1000).toFixed(1)}k`:`€${v.toFixed(0)}`;

            // Aggregati totali
            const totRicavi  = giorni.reduce((s,g)=>s+(g.kpi?.totV||g.venduto?.reduce((ss,p)=>ss+(p.totale||0),0)||0),0);
            const totFC      = giorni.reduce((s,g)=>s+(g.kpi?.totFC||0),0);
            const totMarg    = giorni.reduce((s,g)=>s+(g.kpi?.totM||0),0);
            const totSpreco  = giorni.reduce((s,g)=>s+(g.kpi?.totS||0),0);
            const margPct    = totRicavi>0?(totMarg/totRicavi*100):0;
            const fcPct      = totRicavi>0?(totFC/totRicavi*100):0;
            const ricavoMedio = totRicavi/n;
            const margMedio   = totMarg/n;

            // Miglior/peggior giorno
            const sorted = [...giorni].sort((a,b)=>(b.kpi?.totV||0)-(a.kpi?.totV||0));
            const bestDay  = sorted[0];
            const worstDay = sorted[sorted.length-1];
            const fmt3 = d => d ? new Date(d+"T12:00").toLocaleDateString("it-IT",{day:"numeric",month:"short"}) : "—";

            // Sell-through medio aggregato
            const stVals = giorni.flatMap(g=>(g.confronto||[]).filter(r=>r.st!=null).map(r=>r.st));
            const avgST  = stVals.length>0 ? stVals.reduce((s,v)=>s+v,0)/stVals.length : null;

            // Trend ultime 2 settimane vs precedenti
            const midIdx = Math.floor(n/2);
            const primaMetà = giorni.slice(0,midIdx);
            const secondaMetà = giorni.slice(midIdx);
            const avg1 = primaMetà.length>0 ? primaMetà.reduce((s,g)=>s+(g.kpi?.totV||0),0)/primaMetà.length : 0;
            const avg2 = secondaMetà.length>0 ? secondaMetà.reduce((s,g)=>s+(g.kpi?.totV||0),0)/secondaMetà.length : 0;
            const trendPct = avg1>0 ? ((avg2-avg1)/avg1*100) : 0;

            // Top prodotti aggregati per ricavo
            const byProd = {};
            for (const g of giorni) {
              for (const r of (g.confronto||[])) {
                if (!byProd[r.nome]) byProd[r.nome] = { rv:0, qta:0, spreco:0 };
                byProd[r.nome].rv    += r.rv||0;
                byProd[r.nome].qta   += r.unitaV||0;
                byProd[r.nome].spreco+= r.spreco||0;
              }
              // fallback da venduto grezzo
              for (const p of (g.venduto||[])) {
                if (!byProd[p.nome]) byProd[p.nome] = { rv:0, qta:0, spreco:0 };
                if (!g.confronto?.find(r=>r.nomeScont===p.nome)) byProd[p.nome].rv += p.totale||0;
              }
            }
            const topProd = Object.entries(byProd).sort((a,b)=>b[1].rv-a[1].rv).slice(0,5);

            // Dati chart ricavi giornalieri (ultimi 30 o tutti)
            const chartData = giorni.slice(-30).map(g=>({
              data: new Date(g.data+"T12:00").toLocaleDateString("it-IT",{day:"numeric",month:"short"}),
              Ricavi: parseFloat((g.kpi?.totV||g.venduto?.reduce((s,p)=>s+(p.totale||0),0)||0).toFixed(2)),
              Margine: parseFloat((g.kpi?.totM||0).toFixed(2)),
              Spreco: parseFloat((g.kpi?.totS||0).toFixed(2)),
            }));

            const margC = v => v>=55?C.green:v>=35?C.amber:C.red;
            const stC2  = v => v>=85?C.green:v>=65?C.amber:C.red;

            return (
              <div style={{marginBottom:28}}>
                {/* Header */}
                <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:8}}>
                  <div>
                    <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.15em",textTransform:"uppercase",color:C.red,marginBottom:3}}>Overview aggregata</div>
                    <div style={{fontSize:20,fontWeight:900,color:C.text,letterSpacing:"-0.02em"}}>
                      {n} {n===1?"giornata":"giornate"} · {fmt3(giorni[0].data)} – {fmt3(giorni[n-1].data)}
                    </div>
                  </div>
                  {n>=4 && (
                    <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:20,
                      background:trendPct>=0?C.greenLight:C.redLight,
                      border:`1px solid ${trendPct>=0?C.green+"40":C.red+"40"}`}}>
                      <span style={{fontSize:14}}>{trendPct>=0?"📈":"📉"}</span>
                      <span style={{fontSize:11,fontWeight:800,color:trendPct>=0?C.green:C.red}}>
                        {trendPct>=0?"+":""}{trendPct.toFixed(1)}% ricavo medio (2ª metà vs 1ª)
                      </span>
                    </div>
                  )}
                </div>

                {/* KPI Strip */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8,marginBottom:16}}>
                  {[
                    {icon:"💰",lbl:"Ricavi totali",    val:euro(totRicavi),    sub:`${euro(ricavoMedio.toFixed(2))}/gg`,  color:C.green, hi:true},
                    {icon:"📈",lbl:"Margine lordo",    val:euro(totMarg),      sub:pct(margPct),                          color:margC(margPct)},
                    {icon:"🧾",lbl:"Food cost tot.",   val:euro(totFC),        sub:pct(fcPct)+" del ricavo",              color:C.red},
                    {icon:"🗑",lbl:"Spreco totale",    val:euro(totSpreco),    sub:`${euro((totSpreco/n).toFixed(2))}/gg`,color:C.amber},
                    {icon:"🎯",lbl:"Sell-through med.",val:avgST!=null?pct(avgST):"—", sub:avgST!=null?(avgST>=85?"ottimo":avgST>=65?"buono":"da migliorare"):"",color:avgST!=null?stC2(avgST):C.textSoft},
                    {icon:"📅",lbl:"Giorni registrati",val:String(n),          sub:`${euro(ricavoMedio.toFixed(2))} medio`,color:C.text},
                  ].map(({icon,lbl,val,sub,color,hi})=>(
                    <div key={lbl} style={{background:hi?"linear-gradient(135deg,#1C0A0A,#3D1515)":C.bgCard,
                      border:`1px solid ${hi?"transparent":C.border}`,borderRadius:10,padding:"12px 14px",
                      boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
                      <div style={{fontSize:11,marginBottom:4}}>{icon}</div>
                      <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",
                        color:hi?`rgba(255,255,255,0.6)`:C.textSoft,marginBottom:3}}>{lbl}</div>
                      <div style={{fontSize:16,fontWeight:900,color:hi?C.white:color,fontFamily:"Georgia,serif"}}>{val}</div>
                      {sub&&<div style={{fontSize:9,color:hi?`rgba(255,255,255,0.55)`:C.textSoft,marginTop:2}}>{sub}</div>}
                    </div>
                  ))}
                </div>

                {/* Chart + Top prodotti */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 280px",gap:14,marginBottom:14}}>
                  {/* Trend ricavi */}
                  <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 20px",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                    <div style={{fontSize:11,fontWeight:800,color:C.text,marginBottom:12}}>Ricavi & margine giornalieri</div>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={chartData} margin={{top:4,right:8,left:0,bottom:0}} barSize={n<=14?14:n<=20?10:6}>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false}/>
                        <XAxis dataKey="data" tick={{fontSize:8,fill:C.textSoft}} tickLine={false} axisLine={false} interval={n<=10?0:Math.floor(n/8)}/>
                        <YAxis tick={{fontSize:8,fill:C.textSoft}} tickLine={false} axisLine={false} tickFormatter={v=>`€${v}`} width={38}/>
                        <Tooltip formatter={(v,name)=>[`€${v.toFixed(2)}`,name]} contentStyle={{fontSize:10,borderRadius:8,border:`1px solid ${C.border}`}}/>
                        <Bar dataKey="Ricavi"  fill={C.red}  opacity={0.85} radius={[3,3,0,0]}/>
                        <Bar dataKey="Margine" fill={C.green} opacity={0.7} radius={[3,3,0,0]}/>
                        <Bar dataKey="Spreco"  fill={C.amber} opacity={0.6} radius={[3,3,0,0]}/>
                      </BarChart>
                    </ResponsiveContainer>
                    <div style={{display:"flex",gap:14,marginTop:6,fontSize:9,color:C.textSoft}}>
                      {[[C.red,"Ricavi"],[C.green,"Margine"],[C.amber,"Spreco"]].map(([c,l])=>(
                        <span key={l} style={{display:"flex",alignItems:"center",gap:3}}>
                          <span style={{width:8,height:8,borderRadius:2,background:c,display:"inline-block"}}/>
                          {l}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Top prodotti */}
                  <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 20px",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                    <div style={{fontSize:11,fontWeight:800,color:C.text,marginBottom:10}}>🏆 Top prodotti per ricavo</div>
                    {topProd.length===0 && <div style={{fontSize:10,color:C.textSoft}}>Dati non disponibili — salva chiusure con scontrino per vederli.</div>}
                    {topProd.map(([nome,d],i)=>(
                      <div key={nome} style={{display:"flex",alignItems:"center",gap:8,marginBottom:7}}>
                        <span style={{fontSize:11,fontWeight:900,color:C.textSoft,width:14,textAlign:"right"}}>{i+1}</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:10,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                            {nome.replace("TORTA DI ","").replace("TORTA ","").replace(" BREAD","")}
                          </div>
                          <div style={{fontSize:9,color:C.textSoft}}>{d.qta} pz · {d.spreco>0?`spreco ${euro(d.spreco.toFixed(2))}`:"spreco 0"}</div>
                        </div>
                        <div style={{fontSize:12,fontWeight:800,color:C.green,fontFamily:"Georgia,serif",flexShrink:0}}>{euro(d.rv.toFixed(2))}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Insights row */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:14}}>
                  {/* Miglior giorno */}
                  <div style={{background:"linear-gradient(135deg,#EAF5EE,#FFF)",border:`1px solid ${C.green}30`,borderRadius:10,padding:"14px 16px"}}>
                    <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:C.green,marginBottom:6}}>🏅 Miglior giorno</div>
                    <div style={{fontSize:15,fontWeight:900,color:C.text}}>{fmt3(bestDay?.data)}</div>
                    <div style={{fontSize:13,color:C.green,fontWeight:700,marginTop:2}}>{euro((bestDay?.kpi?.totV||0).toFixed(2))}</div>
                    <div style={{fontSize:10,color:C.textSoft,marginTop:3}}>
                      marg. {pct(bestDay?.kpi?.totMP)} · ST {pct(bestDay?.kpi?.avgST)}
                    </div>
                  </div>
                  {/* Peggior giorno */}
                  <div style={{background:"linear-gradient(135deg,#FEF3C7,#FFF)",border:`1px solid ${C.amber}30`,borderRadius:10,padding:"14px 16px"}}>
                    <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:C.amber,marginBottom:6}}>⚠️ Giorno più debole</div>
                    <div style={{fontSize:15,fontWeight:900,color:C.text}}>{fmt3(worstDay?.data)}</div>
                    <div style={{fontSize:13,color:C.amber,fontWeight:700,marginTop:2}}>{euro((worstDay?.kpi?.totV||0).toFixed(2))}</div>
                    <div style={{fontSize:10,color:C.textSoft,marginTop:3}}>
                      marg. {pct(worstDay?.kpi?.totMP)} · ST {pct(worstDay?.kpi?.avgST)}
                    </div>
                  </div>
                  {/* Spreco insight */}
                  <div style={{background:"linear-gradient(135deg,#FDECEA,#FFF)",border:`1px solid ${C.red}20`,borderRadius:10,padding:"14px 16px"}}>
                    <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:C.red,marginBottom:6}}>🗑 Impatto spreco</div>
                    <div style={{fontSize:15,fontWeight:900,color:C.text}}>{euro(totSpreco.toFixed(2))}</div>
                    <div style={{fontSize:10,color:C.textSoft,marginTop:2}}>{pct(totRicavi>0?(totSpreco/totRicavi*100):0)} dei ricavi</div>
                    <div style={{fontSize:10,color:C.red,fontWeight:700,marginTop:4}}>
                      {totRicavi>0&&totSpreco/totRicavi>0.05?"⚠ sopra soglia (5%)" : totSpreco===0?"✓ nessuno spreco rilevato":"✓ sotto controllo"}
                    </div>
                  </div>
                </div>

                {/* Tabella prodotti cross-giornata */}
                {topProd.length > 0 && (
                  <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)",marginBottom:14}}>
                    <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,fontSize:11,fontWeight:800,color:C.text}}>
                      Dettaglio prodotti — totale periodo
                    </div>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                      <thead>
                        <tr style={{background:"#F8F4F2"}}>
                          {["Prodotto","Pz venduti","Ricavo tot.","Ricavo/gg","Spreco FC","% su totale"].map((h,i)=>(
                            <th key={h} style={{padding:"8px 12px",textAlign:i===0?"left":"right",fontSize:8,fontWeight:700,
                              letterSpacing:"0.07em",textTransform:"uppercase",color:C.textSoft,
                              borderBottom:`1px solid ${C.border}`}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(byProd).sort((a,b)=>b[1].rv-a[1].rv).map(([nome,d],i)=>(
                          <tr key={nome} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?"#FFFAF8":"#FFF"}}>
                            <td style={{padding:"9px 12px",fontWeight:700,color:C.text,fontSize:11}}>{nome}</td>
                            <td style={{padding:"9px 12px",textAlign:"right",color:C.textMid}}>{d.qta}</td>
                            <td style={{padding:"9px 12px",textAlign:"right",fontWeight:800,color:C.green,fontFamily:"Georgia,serif"}}>{euro(d.rv.toFixed(2))}</td>
                            <td style={{padding:"9px 12px",textAlign:"right",color:C.textMid}}>{euro((d.rv/n).toFixed(2))}</td>
                            <td style={{padding:"9px 12px",textAlign:"right",color:d.spreco>0?C.amber:C.textSoft}}>{d.spreco>0?euro(d.spreco.toFixed(2)):"—"}</td>
                            <td style={{padding:"9px 12px",textAlign:"right",color:C.textSoft}}>{totRicavi>0?pct(d.rv/totRicavi*100):"—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

              {batchResults.length > 0 && (
                <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px",marginBottom:20,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                  <div style={{fontSize:13,fontWeight:800,color:C.text,marginBottom:12}}>
                    📊 Batch completato — {batchResults.filter(r=>r.salvato).length}/{batchResults.length} chiusure salvate
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:5}}>
                    {batchResults.map((r,i)=>(
                      <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 12px",
                        background:r.salvato?C.greenLight:C.redLight,borderRadius:8,
                        border:`1px solid ${r.salvato?C.green+"40":C.red+"40"}`}}>
                        <span style={{fontSize:14}}>{r.salvato?"✅":"❌"}</span>
                        <div style={{flex:1}}>
                          <span style={{fontSize:11,fontWeight:700,color:C.text}}>
                            {r.data!=="?" ? new Date(r.data+"T12:00").toLocaleDateString("it-IT",{weekday:"short",day:"numeric",month:"long",year:"numeric"}) : "Data non trovata"}
                          </span>
                          {r.salvato&&<span style={{fontSize:10,color:C.textSoft,marginLeft:8}}>{r.prodotti.length} prodotti</span>}
                          {r.error&&<span style={{fontSize:10,color:C.red,marginLeft:8}}>{r.error}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={()=>setBatchResults([])} style={{marginTop:10,padding:"5px 12px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,fontSize:10,color:C.textSoft,cursor:"pointer"}}>
                    Chiudi riepilogo
                  </button>
                </div>
              )}

              {/* Tabella chiusure */}
              <SH sub="Ogni giornata chiusa con scontrino">Storico Chiusure</SH>
              <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead>
                    <tr style={{background:"#F8F4F2"}}>
                      {["Data","Prodotti","Ricavo reale","Food cost","Margine","Marg%","Sell-T. medio","Spreco"].map((h,i)=>(
                        <th key={i} style={{padding:"10px 12px",textAlign:i===0?"left":"right",fontSize:8,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",color:C.textSoft,borderBottom:`1px solid ${C.border}`}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...(chiusure||[])].sort((a,b)=>b.data.localeCompare(a.data)).map((ch,i)=>(
                      <tr key={ch.id} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:"#FDFAF7"}}>
                        <td style={{padding:"10px 12px",fontWeight:700,color:C.text}}>{new Date(ch.data+"T12:00").toLocaleDateString("it-IT",{weekday:"short",day:"2-digit",month:"short"})}</td>
                        <td style={{padding:"10px 12px",textAlign:"right",color:C.textMid}}>{(ch.confronto||[]).length}</td>
                        <td style={{padding:"10px 12px",textAlign:"right",fontWeight:700,color:C.green,fontFamily:"Georgia,serif"}}>{fmt(ch.kpi.totV)}</td>
                        <td style={{padding:"10px 12px",textAlign:"right",color:C.red}}>{fmt(ch.kpi.totFC)}</td>
                        <td style={{padding:"10px 12px",textAlign:"right",fontWeight:800,color:margColor(ch.kpi.totMP),fontFamily:"Georgia,serif"}}>{fmt(ch.kpi.totM)}</td>
                        <td style={{padding:"10px 12px",textAlign:"right"}}>{margBadge(ch.kpi.totMP)}</td>
                        <td style={{padding:"10px 12px",textAlign:"right"}}>
                          <span style={{fontWeight:700,color:ch.kpi.avgST>=85?C.green:ch.kpi.avgST>=65?C.amber:C.red}}>{fmtp(ch.kpi.avgST)}</span>
                        </td>
                        <td style={{padding:"10px 12px",textAlign:"right",color:ch.kpi.totS>5?C.red:C.textSoft,fontWeight:ch.kpi.totS>5?700:400}}>{fmt(ch.kpi.totS)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ─── TAB CONFRONTO PRODUZIONE VS VENDITE ─── */}
      {tab==="confronto"&&(
        <>
          {(!hasProd||!hasVend)&&(
            <div style={{textAlign:"center",padding:"48px",background:C.bgCard,borderRadius:12,border:`1px solid ${C.border}`}}>
              <div style={{fontSize:32,marginBottom:12}}>🔄</div>
              <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:8}}>Servono sia produzioni che chiusure</div>
              <div style={{fontSize:12,color:C.textSoft}}>Registra la produzione giornaliera <b>e</b> carica gli scontrini di chiusura per vedere il confronto.</div>
            </div>
          )}
          {hasProd&&hasVend&&(()=>{
            // Confronto ricavo stimato vs reale per periodo
            const allKeys = [...new Set([...periodiProd.map(p=>p.key),...periodiVend.map(p=>p.key)])].sort();
            const dataConf = allKeys.map(k=>{
              const pp = periodiProd.find(p=>p.key===k);
              const pv = periodiVend.find(p=>p.key===k);
              return { label:fmtKey(k), "Ricavo stimato":+(pp?.ricavoTot||0).toFixed(2), "Ricavo reale":+(pv?.rvTot||0).toFixed(2), "Spreco":+(pv?.sproTot||0).toFixed(2) };
            });
            const dataConf2 = allKeys.map(k=>{
              const pp = periodiProd.find(p=>p.key===k);
              const pv = periodiVend.find(p=>p.key===k);
              const stim = pp?.ricavoTot||0;
              const real = pv?.rvTot||0;
              return { label:fmtKey(k), "Margine stimato":+(stim>0?((stim-pp?.fcTot||0)):0).toFixed(2), "Margine reale":+(pv?.margTot||0).toFixed(2) };
            });
            return (
              <>
                <SH sub="Ricavo stimato (produzione) vs ricavo reale (scontrini)">Stimato vs Reale</SH>
                <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px",marginBottom:12,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={dataConf} margin={{top:4,right:16,left:0,bottom:0}} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#F0E8E4" vertical={false}/>
                      <XAxis dataKey="label" tick={{fill:C.textMid,fontSize:10}} axisLine={false} tickLine={false}/>
                      <YAxis tickFormatter={v=>`€${v}`} tick={{fill:C.textSoft,fontSize:9}} axisLine={false} tickLine={false}/>
                      <Tooltip content={<ChartTip/>} formatter={(v,n)=>[fmt(v),n]}/>
                      <Legend wrapperStyle={{fontSize:10,paddingTop:12}}/>
                      <Bar dataKey="Ricavo stimato" fill={C.textSoft} opacity={0.4} radius={[3,3,0,0]}/>
                      <Bar dataKey="Ricavo reale"   fill={C.green}    opacity={0.85} radius={[3,3,0,0]}/>
                      <Bar dataKey="Spreco"         fill={C.amber}    opacity={0.85} radius={[3,3,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <SH sub="Margine stimato vs margine reale">Margine Stimato vs Reale</SH>
                <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px",marginBottom:20,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={dataConf2} margin={{top:4,right:16,left:0,bottom:0}} barCategoryGap="35%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#F0E8E4" vertical={false}/>
                      <XAxis dataKey="label" tick={{fill:C.textMid,fontSize:10}} axisLine={false} tickLine={false}/>
                      <YAxis tickFormatter={v=>`€${v}`} tick={{fill:C.textSoft,fontSize:9}} axisLine={false} tickLine={false}/>
                      <Tooltip content={<ChartTip/>} formatter={(v,n)=>[fmt(v),n]}/>
                      <Legend wrapperStyle={{fontSize:10,paddingTop:12}}/>
                      <Bar dataKey="Margine stimato" fill={C.textSoft} opacity={0.4} radius={[3,3,0,0]}/>
                      <Bar dataKey="Margine reale"   fill={C.green}    opacity={0.9} radius={[3,3,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Tabella confronto periodi */}
                <SH sub="Per ogni periodo con entrambi i dati">Dettaglio Confronto</SH>
                <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                    <thead>
                      <tr style={{background:"#F8F4F2"}}>
                        {["Periodo","Ric. stimato","Ric. reale","Diff €","Margine stim.","Margine reale","Sell-T. medio","Spreco"].map((h,i)=>(
                          <th key={i} style={{padding:"10px 12px",textAlign:i===0?"left":"right",fontSize:8,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",color:C.textSoft,borderBottom:`1px solid ${C.border}`}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allKeys.reverse().map((k,i)=>{
                        const pp=periodiProd.find(p=>p.key===k);
                        const pv=periodiVend.find(p=>p.key===k);
                        const diff=(pv?.rvTot||0)-(pp?.ricavoTot||0);
                        return (
                          <tr key={k} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:"#FDFAF7"}}>
                            <td style={{padding:"10px 12px",fontWeight:700,color:C.text}}>{fmtKey(k)}</td>
                            <td style={{padding:"10px 12px",textAlign:"right",color:C.textSoft}}>{pp?fmt(pp.ricavoTot):"—"}</td>
                            <td style={{padding:"10px 12px",textAlign:"right",fontWeight:700,color:C.green}}>{pv?fmt(pv.rvTot):"—"}</td>
                            <td style={{padding:"10px 12px",textAlign:"right",fontWeight:700,color:diff>=0?C.green:C.red}}>{pp&&pv?(diff>=0?"+":"")+fmt(diff):"—"}</td>
                            <td style={{padding:"10px 12px",textAlign:"right",color:C.textSoft}}>{pp?fmt(pp.margine):"—"}</td>
                            <td style={{padding:"10px 12px",textAlign:"right",fontWeight:800,color:pv?margColor(pv.margTot>0&&pv.rvTot>0?(pv.margTot/pv.rvTot*100):0):C.textSoft}}>{pv?fmt(pv.margTot):"—"}</td>
                            <td style={{padding:"10px 12px",textAlign:"right"}}>{pv?<span style={{fontWeight:700,color:pv.avgST>=85?C.green:pv.avgST>=65?C.amber:C.red}}>{fmtp(pv.avgST)}</span>:"—"}</td>
                            <td style={{padding:"10px 12px",textAlign:"right",color:pv?.sproTot>5?C.red:C.textSoft}}>{pv?fmt(pv.sproTot):"—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}


// ─── CHIUSURA GIORNATA VIEW ───────────────────────────────────────────────────
function ChiusuraView({ ricettario, giornaliero, chiusure, setChiusure, notify }) {
  const ingCosti = useMemo(()=>buildIngCosti(ricettario?.ingredienti_costi||{}), [ricettario]);

  const ricetteNote = useMemo(()=>{
    const out = {};
    for (const [,r] of Object.entries(ricettario?.ricette||{})) {
      if (isRicettaValida(r.nome) && getR(r.nome,r).tipo!=="interno" && getR(r.nome,r).tipo!=="semilavorato")
        out[r.nome.toUpperCase().trim()] = r;
    }
    return out;
  }, [ricettario]);

  const today = new Date().toISOString().slice(0,10);
  const [dataFiltro, setDataFiltro] = useState(today);

  // Sessione produzione del giorno
  const sessione = useMemo(()=>
    [...(giornaliero||[])].filter(s=>s.data===dataFiltro).sort((a,b)=>b.id.localeCompare(a.id))[0]||null
  , [giornaliero, dataFiltro]);

  // Chiusura già salvata per quella data
  const chiusuraSalvata = useMemo(()=>
    (chiusure||[]).find(c=>c.data===dataFiltro)||null
  , [chiusure, dataFiltro]);

  const [img, setImg]         = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [venduto, setVenduto] = useState(null);
  const [error, setError]     = useState(null);
  const [salvato, setSalvato] = useState(false);
  const inputRef = useRef(null);

  // Se c'è già una chiusura salvata per la data, mostrala subito
  useEffect(()=>{
    if (chiusuraSalvata) {
      setVenduto(chiusuraSalvata.venduto);
      setSalvato(true);
    } else {
      setVenduto(null); setSalvato(false);
    }
  }, [chiusuraSalvata]);

  const PROMPT = `Sei un OCR per scontrini di bar/pasticceria italiani.
Estrai queste informazioni dallo scontrino:
1. DATA: cerca la data dello scontrino in qualsiasi formato (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, "12 marzo 2026", ecc). Convertila sempre in formato ISO YYYY-MM-DD. Se non trovi la data metti null.
2. PRODOTTI PASTICCERIA: estrai SOLO i prodotti della categoria PASTICCERIA (la sezione che inizia con "> N PASTICCERIA" e finisce alla prossima sezione "> N ALTRO").
   Per ogni riga prodotto estrai: nome esatto come scritto, quantita venduta (numero prima del nome), prezzo totale riga (numero a destra).
   Calcola prezzoUnitario = totale / quantita.
   Ignora righe di sconto (es "sconto 30%"), totali di categoria, intestazioni, e prodotti di altre categorie (GELATO, BIBITE, ecc).
Rispondi SOLO JSON valido senza markdown ne testi extra:
{"data":"YYYY-MM-DD o null","prodotti":[{"nome":"NOME","qta":numero,"totale":euro_numero,"prezzoUnitario":euro_numero}]}`;

  const [batchMode, setBatchMode]     = useState(false);
  const [batchFiles, setBatchFiles]   = useState([]); // [{data64, preview, mediaType}]
  const [batchProgress, setBatchProg] = useState(null); // "3/9" during processing
  const [batchResults, setBatchResults] = useState([]); // [{data, prodotti, salvato, error}]

  // Import delivery/cassa
  const [importModal, setImportModal] = useState(null); // null | "delivery" | "cassa"
  const [importPiattaforma, setImportPiattaforma] = useState('deliveroo');
  const [importSistema, setImportSistema] = useState('cassaincloud');
  const [importPreview, setImportPreview] = useState(null); // { righe, headers, rows }
  const [importGenericMapping, setImportGenericMapping] = useState({ data: '', importo: '', comm: '' });
  const [importLoading, setImportLoading] = useState(false);
  const importFileRef = useRef(null);

  const readFile64 = f => new Promise(res => {
    const r = new FileReader();
    r.onload = ev => res({ data64: ev.target.result.split(",")[1], preview: ev.target.result, mediaType: f.type||"image/jpeg" });
    r.readAsDataURL(f);
  });

  const handleFile = async e => {
    const files = Array.from(e.target.files||[]);
    if (!files.length) return;
    setVenduto(null); setError(null); setSalvato(false);
    if (files.length === 1) {
      setBatchMode(false); setBatchFiles([]); setBatchResults([]);
      const read = await readFile64(files[0]);
      setPreview(read.preview); setImg(read.data64);
    } else {
      setBatchMode(true);
      const reads = await Promise.all(files.map(readFile64));
      setBatchFiles(reads);
      setPreview(reads[0].preview); setImg(reads[0].data64);
      notify(`📷 ${reads.length} scontrini selezionati — premi "Leggi tutti" per elaborarli`);
    }
  };

  const handleAnalizza = async () => {
    if (!img) return;
    setLoading(true); setError(null); setVenduto(null);
    try {
      const obj = await analyzeReceipt(img, "image/jpeg");
      // Auto-imposta la data se estratta dallo scontrino
      if (obj.data && /^\d{4}-\d{2}-\d{2}$/.test(obj.data)) {
        setDataFiltro(obj.data);
        notify(`📅 Data estratta dallo scontrino: ${new Date(obj.data+"T12:00").toLocaleDateString("it-IT")}`);
      }
      setVenduto(obj.prodotti||[]);
    } catch(e) { setError(e.message); }
    setLoading(false);
  };

  const analyzeReceipt = async (imgData, mediaType) => {
    const r = await fetch("/api/ai", {
      method:"POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`},
      body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:2000,
        messages:[{ role:"user", content:[
          { type:"image", source:{ type:"base64", media_type: mediaType||"image/jpeg", data:imgData }},
          { type:"text",  text:PROMPT }
        ]}]})
    });
    const d = await r.json();
    const text = d.content?.find(b=>b.type==="text")?.text||"{}";
    return JSON.parse(text.replace(/```json|```/g,"").trim());
  };

  const handleAnalizzaBatch = async () => {
    if (!batchFiles.length) return;
    setLoading(true); setBatchProg("0/"+batchFiles.length); setBatchResults([]);
    const nuoveChiusure = [...(chiusure||[])];
    const results = [];
    let saved = 0, skipped = 0;

    for (let i = 0; i < batchFiles.length; i++) {
      setBatchProg(`${i+1}/${batchFiles.length}`);
      notify(`🧾 Leggo scontrino ${i+1} di ${batchFiles.length}…`);
      try {
        const obj = await analyzeReceipt(batchFiles[i].data64, batchFiles[i].mediaType);
        const prodotti = obj.prodotti||[];
        // Data: preferisce quella estratta dallo scontrino, fallback today
        const dataRaw = obj.data;
        const dataStr = dataRaw && /^\d{4}-\d{2}-\d{2}$/.test(dataRaw) ? dataRaw : today;

        if (!prodotti.length) {
          results.push({ data:dataStr, prodotti:[], salvato:false, error:"Nessun prodotto estratto" });
          skipped++;
          continue;
        }

        const rec = {
          id: `ch-${dataStr}-${Date.now()}`,
          data: dataStr,
          salvatoAt: new Date().toISOString(),
          venduto: prodotti,
          confronto: [], // calcolato on-the-fly nello storico
          kpi: {},
          dataEstrattaDaScontrino: !!dataRaw,
        };
        // Sostituisce se già esiste per quella data
        const idx = nuoveChiusure.findIndex(c=>c.data===dataStr);
        if (idx>=0) nuoveChiusure[idx]=rec; else nuoveChiusure.push(rec);
        results.push({ data:dataStr, prodotti, salvato:true, error:null });
        saved++;
      } catch(e) {
        results.push({ data:"?", prodotti:[], salvato:false, error:e.message });
        skipped++;
      }
    }

    // Salva tutto in una volta
    nuoveChiusure.sort((a,b)=>b.data.localeCompare(a.data));
    setChiusure(nuoveChiusure);
    await ssave(SK_CHIUS, nuoveChiusure);
    setBatchResults(results);
    setBatchProg(null);
    setLoading(false);
    notify(`✓ ${saved} chiusure salvate${skipped>0?` · ${skipped} saltate`:""}`);
  };

  // Calcola confronto prodotto vs venduto
  const confronto = useMemo(()=>{
    if (!venduto) return [];
    const prodottiOggi = {};
    for (const p of (sessione?.prodotti||[]))
      prodottiOggi[p.nome.toUpperCase().trim()] = p.stampi||0;

    return venduto.flatMap(v => {
      const nup = v.nome.toUpperCase().trim();
      const mk = Object.keys(ricetteNote).find(k =>
        k===nup || k.includes(nup) || nup.includes(k) ||
        k.replace(/[^A-Z0-9]/g,"").includes(nup.replace(/[^A-Z0-9]/g,"")) ||
        nup.replace(/[^A-Z0-9]/g,"").includes(k.replace(/[^A-Z0-9]/g,""))
      );
      if (!mk) return [];
      const ric = ricetteNote[mk];
      const reg = getR(mk, ric);
      const {tot:fc} = calcolaFC(ric, ingCosti, ricettario);
      const stampiP  = prodottiOggi[mk]||0;
      const unitaP   = stampiP * reg.unita;
      const unitaV   = v.qta;
      const unitaR   = Math.max(0, unitaP - unitaV);
      const st       = unitaP>0 ? (unitaV/unitaP*100) : null;
      const rv       = v.totale||(v.prezzoUnitario*v.qta)||0;
      const fcV      = unitaP>0 ? (unitaV/unitaP)*fc*stampiP : (unitaV/reg.unita)*fc;
      const marg     = rv - fcV;
      const spreco   = unitaR>0 ? (unitaR/reg.unita)*fc : 0;
      return [{ nome:mk, nomeScont:v.nome, stampiP, unitaP, unitaV, unitaR, st, rv, fcV, marg, spreco, reg, fc, inProd:stampiP>0 }];
    });
  }, [venduto, sessione, ricetteNote, ingCosti]);

  const totV  = confronto.reduce((s,r)=>s+r.rv,0);
  const totFC = confronto.reduce((s,r)=>s+r.fcV,0);
  const totM  = confronto.reduce((s,r)=>s+r.marg,0);
  const totS  = confronto.reduce((s,r)=>s+r.spreco,0);
  const totMP = totV>0?(totM/totV*100):0;
  const stL   = confronto.filter(r=>r.st!==null);
  const avgST = stL.length>0 ? stL.reduce((s,r)=>s+r.st,0)/stL.length : 0;
  const stC   = st => st>=85?C.green:st>=65?C.amber:C.red;

  // SALVA chiusura nello storage
  const handleSalva = async () => {
    if (!venduto || confronto.length===0) return;
    const rec = {
      id: `ch-${dataFiltro}`,
      data: dataFiltro,
      salvatoAt: new Date().toISOString(),
      venduto,
      confronto: confronto.map(r=>({
        nome:r.nome, stampiP:r.stampiP, unitaP:r.unitaP, unitaV:r.unitaV, unitaR:r.unitaR,
        st:r.st, rv:r.rv, fcV:r.fcV, marg:r.marg, spreco:r.spreco, inProd:r.inProd
      })),
      kpi: { totV, totFC, totM, totS, totMP, avgST }
    };
    // Sostituisce se già esiste per quella data
    const nuove = [...(chiusure||[]).filter(c=>c.data!==dataFiltro), rec];
    setChiusure(nuove);
    await ssave(SK_CHIUS, nuove);
    setSalvato(true);
    notify(`✓ Chiusura del ${new Date(dataFiltro+"T12:00").toLocaleDateString("it-IT")} salvata nello storico`);
  };

  // ── Import delivery handler ───────────────────────────────────────────────
  const handleImportDeliveryFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true); setImportPreview(null);
    try {
      if (importPiattaforma === 'deliveroo') {
        setImportPreview({ tipo:'aggregated', righe: parseDeliveroo(await file.text()) });
      } else if (importPiattaforma === 'justeat') {
        setImportPreview({ tipo:'aggregated', righe: parseJustEat(await file.text()) });
      } else if (importPiattaforma === 'glovo') {
        setImportPreview({ tipo:'aggregated', righe: await parseGlovo(file) });
      } else {
        const { headers, preview, rows } = parseGenericCSV(await file.text());
        setImportPreview({ tipo:'generic', headers, preview, rows });
      }
    } catch(ex) { notify(`⚠ ${ex.message}`); }
    setImportLoading(false);
  };

  const handleConfirmDelivery = async () => {
    if (!importPreview) return;
    let righe = importPreview.righe || [];
    if (importPreview.tipo === 'generic') {
      righe = applyGenericMapping(importPreview.rows, importGenericMapping.data, importGenericMapping.importo, importGenericMapping.comm, 'Generico');
    }
    const nuove = mergeInChiusure(chiusure||[], righe, importPiattaforma);
    setChiusure(nuove); await ssave(SK_CHIUS, nuove);
    notify(`✓ ${righe.length} giorni importati da ${importPiattaforma}`);
    setImportModal(null); setImportPreview(null);
  };

  // ── Import cassa handler ──────────────────────────────────────────────────
  const handleImportCassaFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportLoading(true); setImportPreview(null);
    try {
      const righe = await parseCassaFile(importSistema, file);
      setImportPreview({ tipo:'aggregated', righe });
    } catch(ex) { notify(`⚠ ${ex.message}`); }
    setImportLoading(false);
  };

  const handleConfirmCassa = async () => {
    if (!importPreview?.righe) return;
    const nuove = mergeInChiusureCassa(chiusure||[], importPreview.righe, importSistema);
    setChiusure(nuove); await ssave(SK_CHIUS, nuove);
    notify(`✓ ${importPreview.righe.length} giorni importati da ${importSistema}`);
    setImportModal(null); setImportPreview(null);
  };

  return (
    <div style={{maxWidth:1100}}>
      <div style={{marginBottom:24}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
          <div>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.18em",textTransform:"uppercase",color:C.red,marginBottom:6}}>Fine giornata</div>
            <h1 style={{margin:"0 0 8px",fontSize:28,fontWeight:900,color:C.text,letterSpacing:"-0.03em"}}>Chiusura</h1>
            <p style={{margin:0,fontSize:12,color:C.textSoft,maxWidth:600}}>Carica lo scontrino di fine giornata: Claude legge i dati di vendita, li confronta con la produzione e salva tutto nello storico.</p>
          </div>
          <div style={{display:"flex",gap:8,flexShrink:0,marginTop:4}}>
            <button onClick={()=>{setImportModal('delivery');setImportPreview(null);}}
              style={{padding:"8px 14px",background:"#FFF8EE",border:"1px solid rgba(217,119,6,0.25)",borderRadius:9,fontSize:11,fontWeight:700,color:C.amber,cursor:"pointer",whiteSpace:"nowrap"}}>
              🛵 Importa da delivery
            </button>
            <button onClick={()=>{setImportModal('cassa');setImportPreview(null);}}
              style={{padding:"8px 14px",background:"#F0F7FF",border:"1px solid rgba(147,197,253,0.4)",borderRadius:9,fontSize:11,fontWeight:700,color:"#2563EB",cursor:"pointer",whiteSpace:"nowrap"}}>
              🖥 Importa da sistema cassa
            </button>
          </div>
        </div>
      </div>

      {/* ── Modal import delivery ── */}
      {importModal==="delivery"&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:C.white,borderRadius:16,padding:"24px",maxWidth:540,width:"100%",boxShadow:"0 8px 40px rgba(0,0,0,0.18)",overflowY:"auto",maxHeight:"90vh"}}>
            <div style={{fontSize:16,fontWeight:900,color:C.text,marginBottom:4}}>🛵 Importa da piattaforma delivery</div>
            <div style={{fontSize:11,color:C.textSoft,marginBottom:18}}>Seleziona la piattaforma e carica il file export CSV/Excel.</div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,color:C.textSoft,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>Piattaforma</div>
              <select value={importPiattaforma} onChange={e=>{setImportPiattaforma(e.target.value);setImportPreview(null);}}
                style={{width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${C.borderStr}`,fontSize:12,color:C.text}}>
                <option value="deliveroo">Deliveroo (CSV)</option>
                <option value="justeat">JustEat (CSV)</option>
                <option value="glovo">Glovo / Foodinho (Excel)</option>
                <option value="generico">Formato generico (CSV)</option>
              </select>
            </div>
            <label style={{display:"block",padding:"12px",background:"#F8F4F2",border:`1px dashed ${C.borderStr}`,borderRadius:10,textAlign:"center",cursor:"pointer",fontSize:12,fontWeight:700,color:C.textMid,marginBottom:14}}>
              📂 {importLoading?"Lettura file…":"Carica file export"}
              <input ref={importFileRef} type="file" accept=".csv,.xlsx,.xls" style={{display:"none"}} onChange={handleImportDeliveryFile}/>
            </label>
            {importPreview?.tipo==="aggregated"&&(
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:700,color:C.green,marginBottom:8}}>✓ {importPreview.righe.length} giorni rilevati</div>
                <div style={{maxHeight:180,overflowY:"auto",borderRadius:8,border:`1px solid ${C.border}`}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                    <thead><tr style={{background:"#F8F4F2"}}>
                      {["Data","Importo","Commissione","Netto","Ordini"].map(h=>(
                        <th key={h} style={{padding:"6px 10px",textAlign:h==="Data"?"left":"right",fontWeight:700,color:C.textSoft}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>{importPreview.righe.map((r,i)=>(
                      <tr key={i} style={{borderTop:`1px solid ${C.border}`,background:i%2?"#FDFAF7":C.white}}>
                        <td style={{padding:"5px 10px",fontWeight:700,color:C.text}}>{r.data}</td>
                        <td style={{padding:"5px 10px",textAlign:"right",color:C.green}}>€{(r.importo||0).toFixed(2)}</td>
                        <td style={{padding:"5px 10px",textAlign:"right",color:C.red}}>€{(r.commissione||0).toFixed(2)}</td>
                        <td style={{padding:"5px 10px",textAlign:"right",fontWeight:700}}>€{(r.netto||0).toFixed(2)}</td>
                        <td style={{padding:"5px 10px",textAlign:"right",color:C.textSoft}}>{r.ordini}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}
            {importPreview?.tipo==="generic"&&(
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:700,color:C.amber,marginBottom:8}}>📋 Mappa le colonne</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10}}>
                  {[["Data","data"],["Importo","importo"],["Commissione (opz.)","comm"]].map(([label,key])=>(
                    <div key={key}>
                      <div style={{fontSize:9,fontWeight:700,color:C.textSoft,marginBottom:4}}>{label}</div>
                      <select value={importGenericMapping[key]||""} onChange={e=>setImportGenericMapping(m=>({...m,[key]:e.target.value}))}
                        style={{width:"100%",padding:"6px 8px",borderRadius:6,border:`1px solid ${C.borderStr}`,fontSize:11}}>
                        <option value="">—</option>
                        {(importPreview.headers||[]).map(h=><option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:10,color:C.textSoft,marginBottom:6}}>Preview prime 5 righe:</div>
                <div style={{maxHeight:100,overflowY:"auto",background:"#F8F4F2",borderRadius:8,padding:"8px",fontSize:9,fontFamily:"monospace"}}>
                  {(importPreview.preview||[]).map((r,i)=>(
                    <div key={i} style={{marginBottom:2,color:C.textMid}}>{Object.entries(r).slice(0,5).map(([k,v])=>`${k}:${v}`).join(" | ")}</div>
                  ))}
                </div>
              </div>
            )}
            <div style={{display:"flex",gap:10,marginTop:8}}>
              {importPreview&&(
                <button onClick={handleConfirmDelivery}
                  style={{flex:1,padding:"10px",background:C.green,color:C.white,border:"none",borderRadius:9,fontWeight:800,fontSize:12,cursor:"pointer"}}>
                  ✓ Importa in Cassa
                </button>
              )}
              <button onClick={()=>{setImportModal(null);setImportPreview(null);}}
                style={{padding:"10px 16px",background:"transparent",color:C.textSoft,border:`1px solid ${C.border}`,borderRadius:9,fontSize:12,cursor:"pointer"}}>
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal import cassa ── */}
      {importModal==="cassa"&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:C.white,borderRadius:16,padding:"24px",maxWidth:540,width:"100%",boxShadow:"0 8px 40px rgba(0,0,0,0.18)",overflowY:"auto",maxHeight:"90vh"}}>
            <div style={{fontSize:16,fontWeight:900,color:C.text,marginBottom:4}}>🖥 Importa da sistema cassa</div>
            <div style={{fontSize:11,color:C.textSoft,marginBottom:18}}>Seleziona il sistema e carica il file export (CSV o XML).</div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:700,color:C.textSoft,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>Sistema cassa</div>
              <select value={importSistema} onChange={e=>{setImportSistema(e.target.value);setImportPreview(null);}}
                style={{width:"100%",padding:"8px 12px",borderRadius:8,border:`1px solid ${C.borderStr}`,fontSize:12,color:C.text}}>
                <option value="cassaincloud">Cassa in Cloud (CSV)</option>
                <option value="sumup">SumUp (CSV)</option>
                <option value="zucchetti">Zucchetti Infinity/Kassa (CSV o XML)</option>
                <option value="lightspeed">Lightspeed (CSV)</option>
                <option value="square">Square (CSV)</option>
                <option value="fattura_xml">Fattura Elettronica SDI (XML)</option>
              </select>
            </div>
            <label style={{display:"block",padding:"12px",background:"#F8F4F2",border:`1px dashed ${C.borderStr}`,borderRadius:10,textAlign:"center",cursor:"pointer",fontSize:12,fontWeight:700,color:C.textMid,marginBottom:14}}>
              📂 {importLoading?"Lettura file…":"Carica file export"}
              <input type="file" accept=".csv,.xml,.xlsx" style={{display:"none"}} onChange={handleImportCassaFile}/>
            </label>
            {importPreview?.tipo==="aggregated"&&(
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:700,color:C.green,marginBottom:8}}>✓ {importPreview.righe.length} record rilevati</div>
                <div style={{maxHeight:180,overflowY:"auto",borderRadius:8,border:`1px solid ${C.border}`}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}>
                    <thead><tr style={{background:"#F8F4F2"}}>
                      {["Data","Importo","IVA","Righe","Fonte"].map(h=>(
                        <th key={h} style={{padding:"6px 10px",textAlign:h==="Data"||h==="Fonte"?"left":"right",fontWeight:700,color:C.textSoft}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>{importPreview.righe.map((r,i)=>(
                      <tr key={i} style={{borderTop:`1px solid ${C.border}`,background:i%2?"#FDFAF7":C.white}}>
                        <td style={{padding:"5px 10px",fontWeight:700,color:C.text}}>{r.data}</td>
                        <td style={{padding:"5px 10px",textAlign:"right",color:C.green}}>€{(r.importo||0).toFixed(2)}</td>
                        <td style={{padding:"5px 10px",textAlign:"right",color:C.textSoft}}>€{(r.iva||0).toFixed(2)}</td>
                        <td style={{padding:"5px 10px",textAlign:"right"}}>{r.righe||1}</td>
                        <td style={{padding:"5px 10px",color:C.textMid,fontSize:9}}>{r.fonte}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}
            <div style={{display:"flex",gap:10,marginTop:8}}>
              {importPreview&&(
                <button onClick={handleConfirmCassa}
                  style={{flex:1,padding:"10px",background:C.green,color:C.white,border:"none",borderRadius:9,fontWeight:800,fontSize:12,cursor:"pointer"}}>
                  ✓ Importa in Cassa
                </button>
              )}
              <button onClick={()=>{setImportModal(null);setImportPreview(null);}}
                style={{padding:"10px 16px",background:"transparent",color:C.textSoft,border:`1px solid ${C.border}`,borderRadius:9,fontSize:12,cursor:"pointer"}}>
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selettore data + stato sessione */}
      <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"16px 20px",marginBottom:20,display:"flex",alignItems:"center",gap:20,flexWrap:"wrap",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
        <div>
          <div style={{fontSize:9,fontWeight:700,color:C.textSoft,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>Data chiusura</div>
          <input type="date" value={dataFiltro} onChange={e=>{setDataFiltro(e.target.value);setVenduto(null);setPreview(null);setImg(null);setSalvato(false);}}
            style={{padding:"7px 10px",borderRadius:7,border:`1px solid ${C.borderStr}`,fontSize:12,color:C.text}}/>
        </div>
        <div style={{flex:1,minWidth:220}}>
          {sessione ? (
            <div style={{background:C.greenLight,border:`1px solid ${C.green}25`,borderRadius:8,padding:"8px 14px"}}>
              <div style={{fontSize:10,fontWeight:700,color:C.green}}>✓ Produzione trovata per questa data</div>
              <div style={{fontSize:11,color:C.textMid,marginTop:2}}>{(sessione.prodotti||[]).map(p=>`${p.stampi}× ${p.nome}`).join(" · ")||"—"}</div>
            </div>
          ) : (
            <div style={{background:"#FFF8EE",border:`1px solid ${C.amber}25`,borderRadius:8,padding:"8px 14px"}}>
              <div style={{fontSize:10,fontWeight:700,color:C.amber}}>⚠ Nessuna produzione registrata per questa data</div>
              <div style={{fontSize:11,color:C.textMid,marginTop:2}}>Il confronto prodotto/venduto non sarà disponibile, ma i ricavi verranno salvati.</div>
            </div>
          )}
        </div>
        {chiusuraSalvata && (
          <div style={{background:"#EEF8EE",border:`1px solid ${C.green}30`,borderRadius:8,padding:"8px 14px",fontSize:10,fontWeight:700,color:C.green}}>
            ✓ Chiusura già salvata · {fmt(chiusuraSalvata.kpi.totV)} ricavi
          </div>
        )}
      </div>

      {/* Upload */}
      <div style={{background:"#F8F4F2",border:`2px dashed ${C.borderStr}`,borderRadius:14,padding:"20px 24px",marginBottom:20}}>
        <div style={{marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:800,color:C.text}}>🧾 Foto scontrino di chiusura</div>
          <div style={{fontSize:10,color:C.textSoft,marginTop:2}}>Claude legge solo la sezione PASTICCERIA · Prodotti non nel ricettario vengono ignorati</div>
        </div>
        {!preview ? (
          <label style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,padding:"22px",background:C.white,border:`1px dashed ${C.borderStr}`,borderRadius:10,cursor:"pointer"}}>
            <span style={{fontSize:28}}>🧾</span>
            <span style={{fontSize:12,fontWeight:700,color:C.textMid}}>Tocca per fotografare lo scontrino</span>
            <span style={{fontSize:10,color:C.textSoft}}>Seleziona più scontrini insieme — ogni data viene letta automaticamente</span>
            <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleFile}/>
          </label>
        ) : (
          <div style={{display:"grid",gridTemplateColumns:"160px 1fr",gap:20,alignItems:"flex-start"}}>
            <div style={{position:"relative"}}>
              <img src={preview} alt="scontrino" style={{width:"100%",borderRadius:10,border:`1px solid ${C.border}`,display:"block"}}/>
              <button onClick={()=>{setPreview(null);setImg(null);setVenduto(null);setSalvato(false);if(inputRef.current)inputRef.current.value="";}}
                style={{position:"absolute",top:5,right:5,width:20,height:20,borderRadius:10,background:"rgba(0,0,0,0.6)",border:"none",color:"#FFF",fontSize:10,cursor:"pointer",fontWeight:700}}>✕</button>
              <input ref={inputRef} type="file" accept="image/*" multiple style={{display:"none"}} onChange={handleFile}/>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {!venduto && !loading && !error && (
                <button onClick={handleAnalizza} style={{padding:"13px",background:C.red,color:C.white,border:"none",borderRadius:9,fontWeight:800,fontSize:13,cursor:"pointer",boxShadow:"0 2px 10px rgba(192,57,43,0.25)"}}>
                  {batchMode ? `📊 Leggi tutti (${batchFiles.length} scontrini)` : "🔍 Leggi scontrino con AI"}
                </button>
              )}
              {loading && (
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"14px",background:C.white,borderRadius:9,border:`1px solid ${C.border}`}}>
                  <style>{`@keyframes spinC{to{transform:rotate(360deg)}}`}</style>
                  <div style={{width:16,height:16,border:`2px solid ${C.redLight}`,borderTopColor:C.red,borderRadius:"50%",animation:"spinC 0.8s linear infinite",flexShrink:0}}/>
                  <div style={{fontSize:12,fontWeight:700,color:C.text}}>
                    {batchProgress ? `Scontrino ${batchProgress} in corso…` : "Lettura scontrino in corso…"}
                  </div>
                </div>
              )}
              {error && (
                <div style={{padding:"12px",background:C.redLight,borderRadius:9}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.red,marginBottom:6}}>⚠ {error}</div>
                  <button onClick={handleAnalizza} style={{padding:"6px 14px",background:C.red,color:C.white,border:"none",borderRadius:6,fontSize:10,fontWeight:700,cursor:"pointer"}}>Riprova</button>
                </div>
              )}
              {venduto && !loading && (
                <div style={{background:C.white,border:`1px solid ${C.green}30`,borderRadius:10,padding:"14px"}}>
                  <div style={{fontSize:11,fontWeight:800,color:C.green,marginBottom:8}}>✓ {venduto.length} prodotti letti dalla sezione PASTICCERIA</div>
                  <div style={{display:"flex",flexDirection:"column",gap:3,maxHeight:180,overflowY:"auto",marginBottom:10}}>
                    {venduto.map((p,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,padding:"3px 8px",background:"#F8F4F2",borderRadius:5}}>
                        <span style={{fontWeight:600,color:C.text}}>{p.qta}× {p.nome}</span>
                        <span style={{color:C.green,fontWeight:700}}>{fmt(p.totale||0)}</span>
                      </div>
                    ))}
                  </div>
                  {!salvato ? (
                    confronto.length>0 ? (
                      <button onClick={handleSalva} style={{width:"100%",padding:"11px",background:C.green,color:C.white,border:"none",borderRadius:8,fontWeight:800,fontSize:12,cursor:"pointer"}}>
                        💾 Salva chiusura nello storico
                      </button>
                    ) : (
                      <div style={{fontSize:10,color:C.amber}}>⚠ Nessun prodotto del ricettario trovato — verifica i nomi</div>
                    )
                  ) : (
                    <div style={{padding:"9px 14px",background:C.greenLight,borderRadius:8,fontSize:11,fontWeight:700,color:C.green}}>
                      ✓ Chiusura salvata nello storico
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* RISULTATI CONFRONTO */}
      {confronto.length>0 && (
        <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:24}}>
            <KPI icon="💰" label="Ricavo reale"       value={fmt(totV)}   highlight/>
            <KPI icon="📈" label="Margine lordo"      value={fmt(totM)}   color={margColor(totMP)} sub={fmtp(totMP)}/>
            <KPI icon="🧾" label="Food cost"          value={fmt(totFC)}  color={C.red}/>
            <KPI icon="🎯" label="Sell-through medio" value={fmtp(avgST)} color={stC(avgST)} sub="% unita vendute"/>
            <KPI icon="🗑" label="Spreco stimato"     value={fmt(totS)}   color={totS>5?C.red:C.green} sub="FC non recuperato"/>
          </div>

          <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden",marginBottom:20,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
            <div style={{padding:"13px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:13,fontWeight:800,color:C.text}}>Produzione vs Venduto · {new Date(dataFiltro+"T12:00").toLocaleDateString("it-IT",{weekday:"long",day:"2-digit",month:"long"})}</div>
              {salvato && <div style={{fontSize:10,fontWeight:700,color:C.green}}>✓ Salvato</div>}
            </div>
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead>
                  <tr style={{background:"#F8F4F2"}}>
                    {["Prodotto","Prodotte","Vendute","Rimaste","Sell-T%","Ricavo reale","FC venduto","Margine","Spreco FC"].map((h,i)=>(
                      <th key={i} style={{padding:"9px 12px",textAlign:i===0?"left":"right",fontSize:8,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",color:C.textSoft,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {confronto.map((r,i)=>(
                    <tr key={r.nome} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:"#FDFAF7"}}>
                      <td style={{padding:"9px 12px",fontWeight:700,color:C.text}}>
                        {r.nome}
                        {!r.inProd&&<span style={{marginLeft:5,fontSize:8,background:C.amberLight,color:C.amber,padding:"1px 5px",borderRadius:3,fontWeight:700,whiteSpace:"nowrap"}}>solo venduto</span>}
                      </td>
                      <td style={{padding:"9px 12px",textAlign:"right",color:C.textMid}}>{r.inProd?r.unitaP:"—"}</td>
                      <td style={{padding:"9px 12px",textAlign:"right",fontWeight:700,color:C.text}}>{r.unitaV}</td>
                      <td style={{padding:"9px 12px",textAlign:"right",fontWeight:r.unitaR>0?700:400,color:r.unitaR>0?C.amber:C.green}}>
                        {r.inProd?(r.unitaR>0?`${r.unitaR} ⚠`:"0 ✓"):"—"}
                      </td>
                      <td style={{padding:"9px 12px",textAlign:"right"}}>
                        {r.st!==null?(
                          <div style={{display:"flex",alignItems:"center",gap:5,justifyContent:"flex-end"}}>
                            <div style={{width:34,height:5,background:"#EEE",borderRadius:3}}><div style={{width:`${Math.min(100,r.st)}%`,height:5,background:stC(r.st),borderRadius:3}}/></div>
                            <span style={{fontWeight:700,color:stC(r.st),minWidth:28,textAlign:"right"}}>{r.st.toFixed(0)}%</span>
                          </div>
                        ):"—"}
                      </td>
                      <td style={{padding:"9px 12px",textAlign:"right",fontWeight:700,color:C.green,fontFamily:"Georgia,serif"}}>{fmt(r.rv)}</td>
                      <td style={{padding:"9px 12px",textAlign:"right",color:C.red}}>{fmt(r.fcV)}</td>
                      <td style={{padding:"9px 12px",textAlign:"right",fontWeight:800,color:margColor(r.rv>0?(r.marg/r.rv*100):0),fontFamily:"Georgia,serif"}}>{fmt(r.marg)}</td>
                      <td style={{padding:"9px 12px",textAlign:"right",color:r.spreco>2?C.red:C.textSoft,fontWeight:r.spreco>2?700:400}}>{r.spreco>0.01?fmt(r.spreco):"—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{background:"#F0EAE6",borderTop:`2px solid ${C.borderStr}`}}>
                    <td colSpan={5} style={{padding:"9px 12px",fontWeight:900,color:C.text,fontSize:12}}>TOTALE GIORNATA</td>
                    <td style={{padding:"9px 12px",textAlign:"right",fontWeight:900,color:C.green,fontFamily:"Georgia,serif",fontSize:13}}>{fmt(totV)}</td>
                    <td style={{padding:"9px 12px",textAlign:"right",fontWeight:700,color:C.red}}>{fmt(totFC)}</td>
                    <td style={{padding:"9px 12px",textAlign:"right",fontWeight:900,color:margColor(totMP),fontFamily:"Georgia,serif",fontSize:13}}>{fmt(totM)}</td>
                    <td style={{padding:"9px 12px",textAlign:"right",fontWeight:700,color:totS>5?C.red:C.textSoft}}>{fmt(totS)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Suggerimenti spreco */}
          {confronto.filter(r=>r.spreco>2).length>0&&(
            <div style={{background:"#FFF8EE",border:`1px solid ${C.amber}30`,borderRadius:12,padding:"16px 20px",marginBottom:20}}>
              <div style={{fontSize:12,fontWeight:800,color:C.amber,marginBottom:10}}>💡 Ottimizza la produzione di domani</div>
              {confronto.filter(r=>r.spreco>2).map(r=>(
                <div key={r.nome} style={{fontSize:11,color:C.amber,lineHeight:1.9}}>
                  <b>{r.nome}</b>: rimaste {r.unitaR} {r.reg?.tipo==="fetta"?"fette":"pezzi"} · spreco {fmt(r.spreco)} · considera <b>{Math.ceil(r.unitaV/r.reg.unita)} stampi</b> invece di {r.stampiP}
                </div>
              ))}
            </div>
          )}

          {/* Bar sell-through */}
          <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
            <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:16}}>Sell-through per prodotto</div>
            {confronto.filter(r=>r.st!==null).sort((a,b)=>b.st-a.st).map(r=>(
              <div key={r.nome} style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
                <div style={{width:160,fontSize:11,fontWeight:600,color:C.text,flexShrink:0,textAlign:"right",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.nome}</div>
                <div style={{flex:1,height:20,background:"#F0EAE6",borderRadius:4,overflow:"hidden"}}>
                  <div style={{height:20,width:`${Math.min(100,r.st)}%`,background:stC(r.st),borderRadius:4,display:"flex",alignItems:"center",paddingLeft:7,minWidth:r.st>8?32:0}}>
                    {r.st>8&&<span style={{fontSize:10,fontWeight:800,color:C.white}}>{r.st.toFixed(0)}%</span>}
                  </div>
                </div>
                <div style={{width:100,textAlign:"right",fontSize:11}}>
                  <span style={{fontWeight:700,color:C.text}}>{r.unitaV}</span>
                  <span style={{color:C.textSoft}}>{r.inProd?` / ${r.unitaP}`:""}</span>
                  <span style={{color:C.green,fontWeight:700,marginLeft:5}}>{fmt(r.rv)}</span>
                </div>
              </div>
            ))}
            <div style={{marginTop:14,display:"flex",gap:14,fontSize:10,color:C.textSoft,flexWrap:"wrap"}}>
              {[[C.green,">=85% ottimo"],[C.amber,"65-84% buono"],[C.red,"<65% ottimizzare"]].map(([c,l])=>(
                <span key={l} style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:9,height:9,borderRadius:2,background:c,display:"inline-block"}}/>{l}</span>
              ))}
            </div>
          </div>
        </>
      )}

      {venduto && confronto.length===0 && !loading && (
        <div style={{textAlign:"center",padding:"36px",background:C.bgCard,borderRadius:12,border:`1px solid ${C.border}`}}>
          <div style={{fontSize:30,marginBottom:10}}>🔍</div>
          <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:6}}>Nessun prodotto del ricettario trovato</div>
          <div style={{fontSize:12,color:C.textSoft,marginBottom:8}}>I nomi sullo scontrino non corrispondono alle ricette. Verifica i nomi nel ricettario.</div>
          <div style={{fontSize:10,color:C.textSoft}}>Letti: {venduto.map(p=>p.nome).join(", ")}</div>
        </div>
      )}
    </div>
  );
}


// ─── SEMI CARD (same layout as TortaCard, no price panel) ────────────────────
function SemiCard({ ric, ingCosti, ricettario, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);

  const { tot:fc, mancanti } = calcolaFC(ric, ingCosti, ricettario);
  const pesoTot = (ric.ingredienti||[]).reduce((s,i)=>s+(i.qty1stampo||0), 0);
  const costoG  = pesoTot > 0 ? fc / pesoTot : 0;

  const ING_SKIP = ["ingrediente","ingredient","ingredienti","n/d","nan","undefined","nome ingrediente in minuscolo"];
  const ingList = (ric.ingredienti||[])
    .filter(ing => !ING_SKIP.includes(normIng(ing.nome||"").toLowerCase().trim()))
    .map(ing => {
      const c = ingCosti[normIng(ing.nome)];
      const costo = c ? parseFloat((ing.qty1stampo * c.costoG).toFixed(3)) : 0;
      return { ...ing, costo, pct: fc>0?(costo/fc*100):0, mancante:!c, isStima:c?.isStima||false };
    }).sort((a,b)=>b.costo-a.costo);

  return (
    <div style={{background:C.bgCard,border:`1px solid #D4B0E8`,borderRadius:14,overflow:"hidden",boxShadow:"0 1px 6px rgba(0,0,0,0.05)"}}>
      <div style={{padding:"18px 24px",display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16,borderBottom:open?`1px solid #D4B0E8`:"none"}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:6}}>
            <span style={{padding:"3px 8px",borderRadius:5,background:"#F0E4FA",color:"#8E44AD",fontSize:9,fontWeight:800,letterSpacing:"0.06em",textTransform:"uppercase"}}>Base</span>
            <h3 style={{margin:0,fontSize:17,fontWeight:900,color:C.text,letterSpacing:"-0.02em"}}>{ric.nome}</h3>
            {mancanti.length>0&&<Badge label={`${mancanti.length} prezzi stimati`} color="amber"/>}
          </div>
          <div style={{fontSize:11,color:C.textSoft}}>
            {pesoTot>=1000?`${(pesoTot/1000).toFixed(2)}kg batch`:`${Math.round(pesoTot)}g batch`}
            {" · "}<span style={{fontFamily:"monospace",fontWeight:600}}>{costoG>0?costoG.toFixed(4):"—"} €/g</span>
          </div>
        </div>
        <div style={{display:"flex",gap:2,flexShrink:0}}>
          {[
            {lbl:"Costo batch",val:`€${fc.toFixed(2)}`,c:C.red,bg:C.redLight},
            {lbl:"Costo/g",val:costoG>0?costoG.toFixed(4)+"€":"—",c:"#8E44AD",bg:"#F0E4FA"},
            {lbl:"Costo/kg",val:`€${(costoG*1000).toFixed(2)}`,c:"#6B2FA0",bg:"#ECD9F8"},
          ].map(({lbl,val,c,bg})=>(
            <div key={lbl} style={{background:bg,padding:"8px 14px",borderRadius:8,textAlign:"center",minWidth:72}}>
              <div style={{fontSize:8,fontWeight:600,letterSpacing:"0.07em",textTransform:"uppercase",color:C.textSoft,marginBottom:3}}>{lbl}</div>
              <div style={{fontSize:13,fontWeight:700,color:c,fontFamily:"Georgia,serif"}}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:6,alignSelf:"center",flexShrink:0}}>
          <button onClick={()=>setOpen(o=>!o)}
            style={{padding:"7px 14px",borderRadius:7,border:`1px solid #D4B0E8`,background:"transparent",fontSize:11,fontWeight:700,color:"#8E44AD",cursor:"pointer"}}>
            {open?"▲ Chiudi":"▼ Apri dettaglio"}
          </button>
          <button onClick={()=>onEdit(ric.nome)}
            style={{padding:"7px 12px",borderRadius:7,border:`1px solid ${C.borderStr}`,background:"transparent",fontSize:11,fontWeight:700,color:C.textMid,cursor:"pointer"}}>
            ✏️ Modifica
          </button>
          <button onClick={()=>onDelete(ric.nome)}
            style={{padding:"7px 10px",borderRadius:7,border:`1px solid ${C.border}`,background:"transparent",fontSize:11,color:C.textSoft,cursor:"pointer"}}>🗑</button>
        </div>
      </div>
      {open && (
        <div style={{padding:"20px 24px"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
            {/* Ingredient table */}
            <div>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:C.textSoft,marginBottom:8}}>Ingredienti</div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead>
                  <tr style={{background:"#F8F4F2"}}>
                    {["Ingrediente","Grammi","Costo","% FC"].map((h,i)=>(
                      <th key={h} style={{padding:"6px 10px",textAlign:i===0?"left":"right",fontSize:8,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",color:C.textSoft,borderBottom:`1px solid ${C.border}`}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ingList.map((ing,i)=>(
                    <tr key={i} style={{borderBottom:`1px solid ${C.border}`,background:i%2===0?C.white:"#FDFAF7"}}>
                      <td style={{padding:"7px 10px",fontWeight:600,color:C.text,textTransform:"capitalize"}}>
                        {ing.nome}{ing.isStima&&<span style={{marginLeft:4,fontSize:8,color:C.amber}}>est.</span>}
                        {ing.mancante&&<span style={{marginLeft:4,fontSize:8,color:C.red}}>?</span>}
                      </td>
                      <td style={{padding:"7px 10px",textAlign:"right",fontFamily:"monospace"}}>{ing.qty1stampo}g</td>
                      <td style={{padding:"7px 10px",textAlign:"right",fontFamily:"monospace",color:C.red}}>{ing.costo>0?`€${ing.costo.toFixed(3)}`:"—"}</td>
                      <td style={{padding:"7px 10px",textAlign:"right",fontFamily:"monospace",color:C.textMid}}>{ing.pct>0?`${ing.pct.toFixed(1)}%`:"—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Cost breakdown mini chart */}
            <div>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:C.textSoft,marginBottom:8}}>Incidenza ingredienti</div>
              {ingList.filter(i=>i.costo>0).slice(0,6).map((ing,i)=>(
                <div key={i} style={{marginBottom:7}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:10,marginBottom:2}}>
                    <span style={{color:C.text,fontWeight:600,textTransform:"capitalize"}}>{ing.nome}</span>
                    <span style={{color:"#8E44AD",fontWeight:700}}>{ing.pct.toFixed(1)}%</span>
                  </div>
                  <div style={{height:5,background:"#EEE",borderRadius:3}}>
                    <div style={{height:5,width:`${Math.min(100,ing.pct)}%`,background:"#8E44AD",borderRadius:3}}/>
                  </div>
                </div>
              ))}
              {mancanti.length>0&&(
                <div style={{marginTop:8,padding:"8px 10px",background:C.amberLight,borderRadius:7,fontSize:10,color:C.amber}}>
                  ⚠ Prezzi mancanti: {mancanti.join(", ")}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── SEMILAVORATI VIEW ────────────────────────────────────────────────────────
function SemilavoratiView({ ricettario, onSave, notify }) {
  const ingCosti = useMemo(()=>buildIngCosti(ricettario?.ingredienti_costi||{}), [ricettario]);
  const semilavorati = useMemo(()=>Object.values(ricettario?.ricette||{})
    .filter(r=>isRicettaValida(r.nome) && getR(r.nome,r).tipo==="semilavorato"),
  [ricettario]);

  const empty = { nome:"", note:"", ingredienti:[] };
  const [form, setForm]       = useState(empty);
  const [editMode, setEditMode] = useState(null);
  const [newIngNome, setNewIngNome] = useState("");
  const [newIngQty,  setNewIngQty]  = useState("");
  const [deleteConf, setDeleteConf] = useState(null);
  const [deletePin,  setDeletePin]  = useState("");
  const [overwriteConf, setOverwriteConf] = useState(null);

  const tuttiIng = useMemo(()=>{
    const s = new Set();
    for (const ric of Object.values(ricettario?.ricette||{}))
      for (const ing of (ric.ingredienti||[])) s.add(normIng(ing.nome));
    for (const k of Object.keys(PREZZI_HORECA)) s.add(k);
    return [...s].filter(k=>k&&k.length>1).sort();
  }, [ricettario]);

  const addIng = () => {
    if (!newIngNome.trim() || !newIngQty) return;
    setForm(f=>({...f, ingredienti:[...f.ingredienti, {nome:newIngNome.trim(), qty1stampo:parseFloat(newIngQty)||0, costoPerG:0, costo1stampo:0}]}));
    setNewIngNome(""); setNewIngQty("");
  };
  const removeIng = i => setForm(f=>({...f, ingredienti:f.ingredienti.filter((_,j)=>j!==i)}));

  const loadForEdit = nome => {
    const r = ricettario?.ricette?.[nome];
    if (!r) return;
    setForm({ nome:r.nome, note:r.note||"", ingredienti:r.ingredienti.map(i=>({...i})) });
    setEditMode(nome);
  };

  const doSaveSemi = () => {
    const nuovaRic = {
      nome: form.nome.trim().toUpperCase(),
      sheetName:"manuale", numStampi:1, totImpasto1:0, foodCost1:0,
      ingredienti: form.ingredienti,
      note: form.note,
      tipo:"semilavorato", unita:0, prezzo:0,
    };
    const nuovoRic = { ...(ricettario||{}), ricette:{ ...(ricettario?.ricette||{}), [nuovaRic.nome]:nuovaRic } };
    onSave(nuovoRic, {}, true);
    notify(`✓ Semilavorato "${nuovaRic.nome}" salvato`);
    setForm(empty); setEditMode(null); setOverwriteConf(null);
  };
  const handleSave = () => {
    if (!form.nome.trim() || form.ingredienti.length===0) { notify("⚠ Inserisci nome e almeno un ingrediente", false); return; }
    const nomeUp = form.nome.trim().toUpperCase();
    const esiste = ricettario?.ricette?.[nomeUp];
    const isEditing = editMode === nomeUp;
    if (esiste && !isEditing) { setOverwriteConf(nomeUp); } else { doSaveSemi(); }
  };

  const handleDelete = async nome => {
    if (deletePin !== "ELIMINA") { notify("⚠ Scrivi ELIMINA per confermare", false); return; }
    const nuovoRic = { ...ricettario, ricette: Object.fromEntries(Object.entries(ricettario.ricette||{}).filter(([k])=>k!==nome)) };
    onSave(nuovoRic, {}, true);
    setDeleteConf(null); setDeletePin(""); setEditMode(null); setForm(empty);
    notify(`✓ "${nome}" eliminato`);
  };

  // Live cost calc
  const fcLive = useMemo(()=>{
    let tot=0;
    for (const ing of form.ingredienti) {
      const c = ingCosti[normIng(ing.nome)];
      if (c) tot += ing.qty1stampo * c.costoG;
    }
    return tot;
  }, [form.ingredienti, ingCosti]);
  const pesoLive = form.ingredienti.reduce((s,i)=>s+(i.qty1stampo||0), 0);
  const costoGLive = pesoLive > 0 ? fcLive / pesoLive : 0;

  return (
    <div style={{maxWidth:1100}}>
      <div style={{marginBottom:28}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.18em",textTransform:"uppercase",color:"#8E44AD",marginBottom:6}}>Ricette</div>
        <h1 style={{margin:"0 0 8px",fontSize:28,fontWeight:900,color:C.text,letterSpacing:"-0.03em"}}>🧁 Semilavorati & Basi</h1>
        <p style={{margin:0,fontSize:12,color:C.textSoft,lineHeight:1.7}}>
          Impasti, creme e preparazioni interne — non vendibili, ma usabili come ingredienti in altre ricette. Il loro costo viene calcolato automaticamente.
        </p>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:0}}>
        {/* ── Lista semilavorati ── */}
        <div>
          {semilavorati.length === 0 && (
            <div style={{textAlign:"center",padding:"48px 0",color:C.textSoft,fontSize:13}}>
              <div style={{fontSize:36,marginBottom:10}}>🧁</div>
              <div style={{fontWeight:700,marginBottom:6}}>Nessun semilavorato</div>
              <div>Aggiungi basi interne come crema pasticcera, pasta frolla, fruit curd…</div>
            </div>
          )}
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {semilavorati.map(ric=>(
              <React.Fragment key={ric.nome}>
                <SemiCard ric={ric} ingCosti={ingCosti} ricettario={ricettario}
                  onEdit={nome=>{ loadForEdit(nome); window.scrollTo({top:0,behavior:"smooth"}); }}
                  onDelete={nome=>setDeleteConf(nome)}/>
                {deleteConf===ric.nome&&(
                  <div style={{marginBottom:4,padding:"12px 16px",background:C.redLight,borderRadius:8,border:`1px solid ${C.red}30`}}>
                    <div style={{fontSize:11,fontWeight:700,color:C.red,marginBottom:8}}>Scrivi <strong>ELIMINA</strong> per confermare l'eliminazione di "{ric.nome}"</div>
                    <div style={{display:"flex",gap:8}}>
                      <input value={deletePin} onChange={e=>setDeletePin(e.target.value)} placeholder="ELIMINA"
                        style={{flex:1,padding:"6px 10px",borderRadius:6,border:`1px solid ${C.borderStr}`,fontSize:11}}/>
                      <button onClick={()=>handleDelete(ric.nome)}
                        style={{padding:"6px 12px",background:C.red,color:"#FFF",border:"none",borderRadius:6,fontSize:10,fontWeight:700,cursor:"pointer"}}>Conferma</button>
                      <button onClick={()=>{setDeleteConf(null);setDeletePin("");}}
                        style={{padding:"6px 10px",background:C.white,color:C.textSoft,border:`1px solid ${C.border}`,borderRadius:6,fontSize:10,cursor:"pointer"}}>Annulla</button>
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ── Form nuovo/modifica — full width collapsible panel ── */}
        <div style={{marginTop:20}}>
          {/* Foto rapida — sopra il form */}
          <FotoOCR mode="ricetta" notify={notify} ricettario={ricettario} onResult={res=>{
            const SKIP = ["ingrediente","ingredient","ingredienti","nome ingrediente in minuscolo","n/d","nan","undefined",""];
            const ings = (res.ingredienti||[])
              .map(i=>({nome:translateIngredienteEN(i.nome||""), qty1stampo:parseFloat(i.qty)||0, costoPerG:0, costo1stampo:0}))
              .filter(i=>!SKIP.includes(i.nome.toLowerCase().trim()) && i.qty1stampo>0);
            const nomeIT = translateProdottoEN(res.nome||"");
            setForm(f=>({
              ...f,
              nome: nomeIT || f.nome,
              note: res.note || f.note,
              ingredienti: ings.length>0 ? ings : f.ingredienti,
            }));
            notify(`📷 Importato: ${nomeIT||"semilavorato"} con ${ings.length} ingredienti`);
          }}/>

          <div style={{background:C.bgCard,border:`2px solid #D4B0E8`,borderRadius:14,padding:"20px",boxShadow:"0 2px 12px rgba(142,68,173,0.08)"}}>
            <div style={{fontSize:12,fontWeight:800,color:"#8E44AD",marginBottom:8}}>
              {editMode ? `✏️ Modifica: ${editMode}` : "➕ Nuovo semilavorato"}
            </div>

            {/* Template rapidi */}
            {!editMode && !form.nome && (
              <div style={{marginBottom:10}}>
                <div style={{fontSize:9,fontWeight:700,color:C.textSoft,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:5}}>⚡ Template rapidi</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {[
                    {nome:"CREMA PASTICCERA", note:"Mescola latte+uova+zucchero+amido. Cuoci a fuoco medio.", ings:[{nome:"latte intero",q:500},{nome:"tuorlo",q:100},{nome:"zucchero",q:150},{nome:"amido di mais",q:40},{nome:"bacca di vaniglia",q:3}]},
                    {nome:"FRUIT PER CROSTATE", note:"Riduzione frutta fresca con zucchero.", ings:[{nome:"fragola",q:300},{nome:"zucchero",q:80},{nome:"succo di limone",q:20},{nome:"pectina",q:5}]},
                    {nome:"PASTA FROLLA", note:"Impasto base per crostate e biscotti.", ings:[{nome:"farina 00",q:300},{nome:"burro",q:150},{nome:"zucchero a velo",q:100},{nome:"tuorlo",q:40},{nome:"scorza di limone",q:3}]},
                  ].map(t=>(
                    <button key={t.nome} onClick={()=>setForm({nome:t.nome, note:t.note, ingredienti:t.ings.map(i=>({nome:i.nome,qty1stampo:i.q,costoPerG:0,costo1stampo:0}))})}
                      style={{padding:"5px 10px",borderRadius:6,border:"1px solid #D4B0E8",background:"#F9F2FD",color:"#8E44AD",fontSize:9,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>
                      {t.nome.replace("FRUIT PER CROSTATE","FRUIT").replace("PASTA FROLLA","FROLLA")}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div>
                <div style={{fontSize:9,fontWeight:700,color:C.textSoft,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>Nome</div>
                <input value={form.nome} onChange={e=>setForm(f=>({...f,nome:e.target.value.toUpperCase()}))}
                  placeholder="es. CREMA PASTICCERA"
                  style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${C.borderStr}`,fontSize:12,fontWeight:700,color:C.text,boxSizing:"border-box"}}/>
              </div>
              <div>
                <div style={{fontSize:9,fontWeight:700,color:C.textSoft,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>Note</div>
                <input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}
                  placeholder="es. 180°C per 30 min"
                  style={{width:"100%",padding:"8px 10px",borderRadius:8,border:`1px solid ${C.borderStr}`,fontSize:11,color:C.text,boxSizing:"border-box"}}/>
              </div>

              {/* Ingredienti */}
              <div>
                <div style={{fontSize:9,fontWeight:700,color:C.textSoft,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6}}>Ingredienti ({form.ingredienti.length})</div>
                {form.ingredienti.map((ing,i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 8px",background:"#F9F2FD",borderRadius:5,marginBottom:3}}>
                    <span style={{fontSize:10,color:"#6B2FA0",fontWeight:600}}>{ing.nome}</span>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span style={{fontSize:10,fontWeight:700,color:"#8E44AD"}}>{ing.qty1stampo}g</span>
                      <button onClick={()=>removeIng(i)} style={{background:"none",border:"none",color:C.textSoft,cursor:"pointer",fontSize:11,padding:"0 2px"}}>✕</button>
                    </div>
                  </div>
                ))}
                <div style={{display:"flex",gap:6,marginTop:6}}>
                  <div style={{flex:2}}>
                    <input value={newIngNome} onChange={e=>setNewIngNome(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&addIng()}
                      placeholder="ingrediente" list="semi-ing-list"
                      style={{width:"100%",padding:"6px 8px",borderRadius:6,border:`1px solid ${C.borderStr}`,fontSize:11,boxSizing:"border-box"}}/>
                    <datalist id="semi-ing-list">{tuttiIng.map(k=><option key={k} value={k}/>)}</datalist>
                  </div>
                  <div style={{flex:1}}>
                    <input type="number" min="0" value={newIngQty} onChange={e=>setNewIngQty(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&addIng()}
                      placeholder="g"
                      style={{width:"100%",padding:"6px 8px",borderRadius:6,border:`1px solid ${C.borderStr}`,fontSize:11,boxSizing:"border-box"}}/>
                  </div>
                  <button onClick={addIng} style={{padding:"6px 10px",background:"#8E44AD",color:"#FFF",border:"none",borderRadius:6,fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap"}}>+ Add</button>
                </div>
              </div>

              {/* Live preview */}
              {form.ingredienti.length > 0 && (
                <div style={{padding:"10px 12px",background:"#F9F2FD",border:"1px solid #D4B0E8",borderRadius:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}>
                    <span style={{color:C.textSoft}}>Peso batch</span>
                    <span style={{fontWeight:700,color:C.text}}>{pesoLive>=1000?`${(pesoLive/1000).toFixed(2)}kg`:`${Math.round(pesoLive)}g`}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}>
                    <span style={{color:C.textSoft}}>Costo batch</span>
                    <span style={{fontWeight:700,color:C.red}}>€{fcLive.toFixed(2)}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}>
                    <span style={{color:C.textSoft}}>Costo/g</span>
                    <span style={{fontWeight:700,color:"#8E44AD",fontFamily:"monospace"}}>{costoGLive>0?costoGLive.toFixed(5):"—"} €/g</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                    <span style={{color:C.textSoft}}>Costo/kg</span>
                    <span style={{fontWeight:700,color:"#8E44AD"}}>€{(costoGLive*1000).toFixed(2)}</span>
                  </div>
                </div>
              )}

              {overwriteConf && (
                <div style={{padding:"12px 14px",background:C.amberLight,border:`2px solid ${C.amber}`,borderRadius:9,marginBottom:4}}>
                  <div style={{fontSize:11,fontWeight:800,color:C.amber,marginBottom:6}}>⚠️ "{overwriteConf}" esiste già — sovrascrivere?</div>
                  <div style={{display:"flex",gap:7}}>
                    <button onClick={doSaveSemi} style={{padding:"7px 14px",background:C.amber,color:C.white,border:"none",borderRadius:6,fontWeight:800,fontSize:11,cursor:"pointer"}}>✅ Sovrascrivi</button>
                    <button onClick={()=>setOverwriteConf(null)} style={{padding:"7px 12px",background:C.white,border:`1px solid ${C.border}`,borderRadius:6,fontSize:11,color:C.textMid,cursor:"pointer"}}>✕ Annulla</button>
                  </div>
                </div>
              )}
              <button onClick={handleSave}
                style={{padding:"11px",background:"#8E44AD",color:"#FFF",border:"none",borderRadius:9,fontWeight:900,fontSize:12,cursor:"pointer",boxShadow:"0 2px 8px rgba(142,68,173,0.25)",marginTop:4}}>
                💾 {editMode ? "Aggiorna semilavorato" : "Salva semilavorato"}
              </button>
              <div style={{fontSize:9,color:C.textSoft,textAlign:"center"}}>Premi <kbd style={{padding:"1px 4px",background:"#F0E4FA",borderRadius:3,border:"1px solid #D4B0E8",fontFamily:"monospace"}}>Enter</kbd> per aggiungere ingrediente · <kbd style={{padding:"1px 4px",background:"#F0E4FA",borderRadius:3,border:"1px solid #D4B0E8",fontFamily:"monospace"}}>↵ Salva</kbd> clic o invio sul bottone</div>
              {editMode&&<button onClick={()=>{setEditMode(null);setForm(empty);}}
                style={{padding:"8px",background:C.white,color:C.textMid,border:`1px solid ${C.border}`,borderRadius:8,fontWeight:600,fontSize:11,cursor:"pointer"}}>
                Annulla modifica
              </button>}
            </div>
          </div>

          <div style={{marginTop:12,padding:"10px 14px",background:"#F9F2FD",border:"1px solid #D4B0E8",borderRadius:8,fontSize:10,color:"#6B2FA0",lineHeight:1.6}}>
            💡 Per usare un semilavorato in una ricetta, aggiungi il suo nome come ingrediente (es. <em>"crema pasticcera"</em>) con la quantità in grammi — il costo viene calcolato automaticamente.
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── DASHBOARD HOME VIEW ──────────────────────────────────────────────────────
function DashboardHomeView({ ricettario, magazzino, giornaliero, chiusure, actions, setView }) {
  const isMobile = useIsMobile();
  const now = new Date();
  const today = now.toISOString().slice(0,10);

  // KPI del giorno
  const sessioneOggi = (giornaliero||[]).filter(s => s.data === today);
  const prodottiOggi = sessioneOggi.reduce((acc, s) => acc + (s.prodotti||[]).reduce((a,p) => a + p.stampi, 0), 0);

  const ricette = Object.values(ricettario?.ricette||{})
    .filter(r => getR(r.nome,r).tipo !== "interno" && getR(r.nome,r).tipo !== "semilavorato");

  const ricaviStimati = sessioneOggi.reduce((total, sess) => {
    return total + (sess.prodotti||[]).reduce((a, p) => {
      const reg = getR(p.nome, ricettario?.ricette?.[p.nome]);
      return a + reg.unita * reg.prezzo * p.stampi;
    }, 0);
  }, 0);

  const ingCosti = ricettario?.ingredienti_costi || {};
  const fcMedio = ricette.length === 0 ? 0 : (() => {
    let tot = 0, count = 0;
    for (const ric of ricette) {
      const reg = getR(ric.nome, ric);
      if (reg.unita === 0 || reg.prezzo === 0) continue;
      const { tot: fc } = calcolaFC(ric, ingCosti, ricettario);
      const ricavo = reg.unita * reg.prezzo;
      if (ricavo > 0) { tot += fc / ricavo; count++; }
    }
    return count > 0 ? tot / count : 0;
  })();

  // Magazzino critici
  const critici = Object.values(magazzino||{}).filter(m => m.giacenza_g === 0 || (m.soglia_g > 0 && m.giacenza_g <= m.soglia_g));

  // Ultime 3 ricette modificate (per ordine in ricettario)
  const ultimeRicette = Object.values(ricettario?.ricette||{}).slice(-3).reverse();

  // Azioni AI aperte
  const azioniAperte = (actions||[]).filter(a => a.stato !== "chiusa");

  const kpiStyle = { background:"#FFF", borderRadius:14, padding: isMobile?"14px 16px":"20px 24px", boxShadow:"0 1px 4px rgba(0,0,0,0.07)", minWidth:0 };
  const labelStyle = { fontSize: isMobile?9:11, fontWeight:600, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:6 };
  const valStyle = { fontSize: isMobile?22:28, fontWeight:900, color:C.text, lineHeight:1 };
  const subStyle = { fontSize: isMobile?10:12, color:C.textMid, marginTop:4 };

  return (
    <div style={{ maxWidth:960, margin:"0 auto" }}>
      <div style={{ marginBottom:isMobile?18:28 }}>
        <div style={{ fontSize: isMobile?18:22, fontWeight:800, color:C.text, marginBottom:4 }}>
          Buongiorno 👋
        </div>
        <div style={{ fontSize:13, color:C.textSoft }}>
          {now.toLocaleDateString("it-IT", { weekday:"long", day:"numeric", month:"long", year:"numeric" })}
        </div>
      </div>

      {/* KPI grid — 2x2 su mobile, 4 colonne su desktop */}
      <div style={{ display:"grid", gridTemplateColumns: isMobile?"repeat(2,1fr)":"repeat(4,1fr)", gap: isMobile?10:16, marginBottom:24 }}>
        <div style={kpiStyle}>
          <div style={labelStyle}>{isMobile?"Ricavi oggi":"Ricavi stimati oggi"}</div>
          <div style={valStyle}>{fmt(ricaviStimati)}</div>
          <div style={subStyle}>{prodottiOggi} stampi</div>
        </div>
        <div style={kpiStyle}>
          <div style={labelStyle}>{isMobile?"Food cost":"Food cost medio"}</div>
          <div style={valStyle}>{(fcMedio*100).toFixed(1)}%</div>
          <div style={subStyle}>{ricette.length} ricette</div>
        </div>
        <div style={kpiStyle}>
          <div style={labelStyle}>{isMobile?"Azioni AI":"Azioni AI aperte"}</div>
          <div style={{...valStyle, color: azioniAperte.length>0 ? C.red : C.green}}>{azioniAperte.length}</div>
          <div style={subStyle}>{(actions||[]).length} totali</div>
        </div>
        <div style={kpiStyle}>
          <div style={labelStyle}>{isMobile?"Magazzino":"Magazzino critici"}</div>
          <div style={{...valStyle, color: critici.length>0 ? C.red : C.green}}>{critici.length}</div>
          <div style={subStyle}>sotto soglia</div>
        </div>
      </div>

      {/* Avviso magazzino */}
      {critici.length > 0 && (
        <div style={{ background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:12, padding:"14px 18px", marginBottom:20, display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:20 }}>⚠️</span>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, fontSize:13, color:"#C0392B", marginBottom:2 }}>
              {critici.length} ingredienti sotto soglia o esauriti
            </div>
            <div style={{ fontSize:12, color:"#9C7B76" }}>
              {critici.slice(0,3).map(m=>m.nome||"?").join(", ")}{critici.length>3?` e altri ${critici.length-3}`:""}
            </div>
          </div>
          <button onClick={()=>setView("magazzino")}
            style={{ padding:"8px 14px", background:C.red, color:C.white, border:"none", borderRadius:8, fontSize:12, fontWeight:700, cursor:"pointer" }}>
            Vedi magazzino
          </button>
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:20 }}>
        {/* Ultime ricette */}
        <div style={{ background:"#FFF", borderRadius:14, padding:"20px 24px", boxShadow:"0 1px 4px rgba(0,0,0,0.07)" }}>
          <div style={{ fontWeight:700, fontSize:14, color:C.text, marginBottom:16 }}>📖 Ultime ricette</div>
          {ultimeRicette.length === 0
            ? <div style={{ fontSize:12, color:C.textSoft }}>Nessuna ricetta caricata — importa il tuo Excel</div>
            : ultimeRicette.map(r => {
                const reg = getR(r.nome, r);
                const { tot: fc } = calcolaFC(r, ingCosti, ricettario);
                return (
                  <div key={r.nome} onClick={()=>setView("ricettario")}
                    style={{ padding:"10px 0", borderBottom:`1px solid ${C.border}`, cursor:"pointer", display:"flex", alignItems:"center", gap:10 }}
                    onMouseEnter={e=>e.currentTarget.style.opacity="0.7"}
                    onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600, fontSize:13, color:C.text }}>{r.nome}</div>
                      <div style={{ fontSize:11, color:C.textSoft, marginTop:2 }}>
                        {reg.unita} {reg.tipo} × {fmt(reg.prezzo)} · FC: {fmt(fc)}
                      </div>
                    </div>
                    <span style={{ fontSize:11, color:C.textSoft }}>›</span>
                  </div>
                );
              })
          }
          <button onClick={()=>setView("ricettario")}
            style={{ marginTop:14, width:"100%", padding:"9px", background:C.bg, border:`1px solid ${C.border}`, borderRadius:8, fontSize:12, fontWeight:600, color:C.textMid, cursor:"pointer" }}>
            Vai al Ricettario →
          </button>
        </div>

        {/* Shortcut rapidi */}
        <div style={{ background:"#FFF", borderRadius:14, padding:"20px 24px", boxShadow:"0 1px 4px rgba(0,0,0,0.07)" }}>
          <div style={{ fontWeight:700, fontSize:14, color:C.text, marginBottom:16 }}>⚡ Accesso rapido</div>
          {[
            { icon:"🏭", label:"Produzione oggi", sub:"Registra la produzione giornaliera", view:"giornaliero" },
            { icon:"💳", label:"Chiusura cassa", sub:"Chiudi la giornata di cassa", view:"chiusura" },
            { icon:"💰", label:"Simulatore prezzi", sub:"Analizza margini e food cost", view:"simulatore" },
            { icon:"🏪", label:"Magazzino", sub:"Controlla le giacenze", view:"magazzino" },
          ].map(s => (
            <div key={s.view} onClick={()=>setView(s.view)}
              style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:`1px solid ${C.border}`, cursor:"pointer" }}
              onMouseEnter={e=>e.currentTarget.style.opacity="0.7"}
              onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
              <span style={{ fontSize:20, width:28, textAlign:"center" }}>{s.icon}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:13, color:C.text }}>{s.label}</div>
                <div style={{ fontSize:11, color:C.textSoft }}>{s.sub}</div>
              </div>
              <span style={{ fontSize:11, color:C.textSoft }}>›</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── IMPOSTAZIONI VIEW ────────────────────────────────────────────────────────
function ImpostazioniView({ auth, nomeAttivita, tipoAttivita, piano, orgId, sedi, onImportPrezzi, notify, onChangelogOpen }) {
  const [nomeMod, setNomeMod] = useState(nomeAttivita || "");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("generale");
  const [reports, setReports] = useState([]);
  const [emailReport, setEmailReport] = useState(true);
  const [loadingReports, setLoadingReports] = useState(false);

  useEffect(()=>{
    if(!orgId) return;
    setLoadingReports(true);
    supabase.storage.from("reports").list(orgId,{ limit:12, sortBy:{ column:"created_at", order:"desc" } })
      .then(({ data })=>{ setReports(data||[]); setLoadingReports(false); });
    supabase.from("user_data").select("data_value")
      .eq("organization_id", orgId).eq("data_key","report-settings-v1").is("sede_id",null).single()
      .then(({ data })=>{ if(data?.data_value?.emailReport===false) setEmailReport(false); });
  },[orgId]);

  const handleToggleEmail = async (val) => {
    setEmailReport(val);
    await supabase.from("user_data").upsert({
      organization_id: orgId, sede_id: null,
      data_key: "report-settings-v1",
      data_value: { emailReport: val },
    },{ onConflict:"organization_id,sede_id,data_key" });
    notify(val ? "✓ Riceverai i report mensili via email" : "✓ Email report mensili disattivata");
  };

  const handleSalvaNome = async () => {
    if (!nomeMod.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ nome_attivita: nomeMod.trim() })
        .eq("id", orgId);
      if (error) throw error;
      notify("✓ Nome attività aggiornato — ricarica la pagina per vederlo nel menu");
    } catch (e) {
      notify("⚠ Errore: " + e.message, false);
    } finally {
      setSaving(false);
    }
  };

  const card = { background:"#FFF", borderRadius:14, padding:"24px 28px", boxShadow:"0 1px 4px rgba(0,0,0,0.07)", marginBottom:20 };
  const label = { fontSize:11, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8, display:"block" };
  const input = { width:"100%", padding:"10px 14px", border:`1px solid ${C.border}`, borderRadius:9, fontSize:13, fontWeight:500, color:C.text, background:"#FAFAFA", outline:"none" };

  const TABS = [
    ["generale", "⚙️ Generale"],
    ["sedi", "🏪 Sedi"],
    ["dati", "💾 Dati"],
  ];

  return (
    <div style={{ maxWidth:700 }}>
      <div style={{ marginBottom:6 }}>
        <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.18em", textTransform:"uppercase", color:C.red, marginBottom:6 }}>Configurazione</div>
        <h1 style={{ margin:"0 0 8px", fontSize:28, fontWeight:900, color:C.text, letterSpacing:"-0.03em" }}>Impostazioni</h1>
      </div>

      {/* Tab nav */}
      <div style={{ display:"flex", gap:4, marginBottom:28, borderBottom:`2px solid ${C.border}` }}>
        {TABS.map(([id,lbl]) => (
          <button key={id} onClick={()=>setTab(id)}
            style={{ padding:"8px 18px", border:"none", background:"transparent", cursor:"pointer",
              fontSize:11, fontWeight:700, color:tab===id?C.red:C.textSoft,
              borderBottom:tab===id?`2px solid ${C.red}`:"2px solid transparent",
              marginBottom:-2, transition:"all 0.12s" }}>
            {lbl}
          </button>
        ))}
      </div>

      {/* ── TAB: Generale ── */}
      {tab === "generale" && (
        <div>
          {/* Info attività */}
          <div style={card}>
            <div style={{ fontWeight:700, fontSize:15, color:C.text, marginBottom:18 }}>Attività</div>
            <div style={{ marginBottom:16 }}>
              <label style={label}>Nome attività</label>
              <div style={{ display:"flex", gap:8 }}>
                <input value={nomeMod} onChange={e=>setNomeMod(e.target.value)} style={{...input, flex:1}} placeholder="Es. Pasticceria Rossi" />
                <button onClick={handleSalvaNome} disabled={saving || nomeMod === nomeAttivita}
                  style={{ padding:"10px 18px", background:C.red, color:C.white, border:"none", borderRadius:9, fontSize:13, fontWeight:700, cursor:"pointer", opacity: (saving || nomeMod===nomeAttivita)?0.5:1 }}>
                  {saving ? "…" : "Salva"}
                </button>
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              <div>
                <label style={label}>Tipo attività</label>
                <div style={{ padding:"10px 14px", border:`1px solid ${C.border}`, borderRadius:9, fontSize:13, color:C.textMid, background:"#F8FAFC", textTransform:"capitalize" }}>
                  {tipoAttivita || "—"}
                </div>
              </div>
              <div>
                <label style={label}>Piano</label>
                <div style={{ padding:"10px 14px", border:`1px solid ${C.border}`, borderRadius:9, fontSize:13, color:C.textMid, background:"#F8FAFC", textTransform:"capitalize" }}>
                  {piano || "trial"}
                </div>
              </div>
            </div>
          </div>

          {/* Import prezzi */}
          <div style={card}>
            <div style={{ fontWeight:700, fontSize:15, color:C.text, marginBottom:8 }}>💶 Prezzi ingredienti</div>
            <div style={{ fontSize:12, color:C.textSoft, marginBottom:14, lineHeight:1.6 }}>
              Importa un file Excel (.xlsx) con i prezzi degli ingredienti. Il file deve avere una colonna con il nome dell'ingrediente e una con il prezzo per kg o per g.
            </div>
            <label style={{ display:"inline-block", padding:"10px 18px", background:"#FFFBEB", border:"1px dashed #FDE68A", borderRadius:9, cursor:"pointer", fontSize:12, fontWeight:600, color:"#92400E" }}>
              📂 Importa prezzi .xlsx / .xls / .csv
              <input type="file" accept=".xlsx,.xls,.csv" multiple style={{display:"none"}} onChange={e=>e.target.files.length&&onImportPrezzi(e.target.files)} />
            </label>
          </div>

          {/* Referral */}
          <ReferralPanel auth={auth} />

          {/* Account */}
          <div style={card}>
            <div style={{ fontWeight:700, fontSize:15, color:C.text, marginBottom:8 }}>Account</div>
            <div style={{ fontSize:13, color:C.textMid }}>
              <strong>Email:</strong> {auth?.user?.email || "—"}
            </div>
            <div style={{ fontSize:12, color:C.textSoft, marginTop:6 }}>
              Per cambiare email o password contatta <a href="mailto:support@foodios.it" style={{color:C.red}}>support@foodios.it</a>
            </div>
          </div>

          {/* Report mensili */}
          <div style={card}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
              <div style={{ fontWeight:700, fontSize:15, color:C.text }}>📊 Report mensili</div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:12, color:C.textSoft }}>Ricevi via email</span>
                <button onClick={()=>handleToggleEmail(!emailReport)}
                  style={{ width:40, height:22, borderRadius:11, border:"none", cursor:"pointer", position:"relative",
                    background:emailReport?C.red:"#CBD5E1", transition:"background 0.2s" }}>
                  <span style={{ position:"absolute", top:3, left:emailReport?20:3, width:16, height:16,
                    borderRadius:"50%", background:"#FFF", transition:"left 0.2s" }}/>
                </button>
              </div>
            </div>
            <div style={{ fontSize:12, color:C.textSoft, marginBottom:14, lineHeight:1.6 }}>
              Ogni 1° del mese ricevi un PDF con i KPI del mese precedente. Generato automaticamente da FoodOS.
            </div>
            {loadingReports ? (
              <div style={{ fontSize:12, color:C.textSoft }}>Caricamento…</div>
            ) : reports.length === 0 ? (
              <div style={{ fontSize:12, color:C.textSoft, fontStyle:"italic" }}>Nessun report ancora. Il primo verrà generato il 1° del prossimo mese.</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {reports.map(r=>{
                  const { data: urlData } = supabase.storage.from("reports").getPublicUrl(`${orgId}/${r.name}`);
                  return (
                    <div key={r.name} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px",
                      background:"#F8FAFC", borderRadius:8, border:`1px solid ${C.border}` }}>
                      <span style={{ fontSize:18 }}>📄</span>
                      <span style={{ flex:1, fontSize:12, fontWeight:500, color:C.text }}>{r.name.replace(".pdf","")}</span>
                      <a href={urlData?.publicUrl} download target="_blank" rel="noreferrer"
                        style={{ fontSize:11, fontWeight:700, color:C.red, textDecoration:"none" }}>Scarica ↓</a>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Novità & Changelog */}
          <div style={card}>
            <div style={{ fontWeight:700, fontSize:15, color:C.text, marginBottom:8 }}>📋 Novità & Changelog</div>
            <div style={{ fontSize:12, color:C.textSoft, marginBottom:14 }}>Tutte le funzionalità e gli aggiornamenti di FoodOS.</div>
            <button onClick={onChangelogOpen}
              style={{ padding:"10px 18px", background:C.redLight, color:C.red,
                border:"none", borderRadius:9, fontSize:13, fontWeight:700, cursor:"pointer" }}>
              Vedi changelog →
            </button>
          </div>
        </div>
      )}

      {/* ── TAB: Sedi ── */}
      {tab === "sedi" && (
        <ImpostazioniSedi orgId={orgId} piano={piano} />
      )}

      {/* ── TAB: Dati ── */}
      {tab === "dati" && (
        <EsportaDati orgId={orgId} sedi={sedi || []} nomeAttivita={nomeAttivita} />
      )}
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(e) { return { err: e }; }
  render() {
    if (this.state.err) return (
      <div style={{padding:40,fontFamily:"monospace",color:"#C0392B",background:"#FFF5F5",minHeight:"100vh"}}>
        <h2>⚠️ Errore runtime</h2>
        <pre style={{whiteSpace:"pre-wrap",fontSize:11}}>{this.state.err.toString()}</pre>
        <pre style={{whiteSpace:"pre-wrap",fontSize:10,color:"#666"}}>{this.state.err.stack}</pre>
      </div>
    );
    return this.props.children;
  }
}

export default function Dashboard({
  auth, orgId, sedeId, sedi, sedeAttiva, onSetSedeAttiva,
  nomeAttivita, tipoAttivita, piano, isTrialAttivo, onSignOut
}) {
  // Sync module-level storage context with current org/sede
  _ctx_orgId = orgId;
  _ctx_sedeId = sedeId;

  const isMobile = useIsMobile();
  const isOnline = useOnlineStatus();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [offlineCacheDate, setOfflineCacheDate] = useState(null);

  const [ricettario,setRic]=useState(null);
  const [produzione,setProd]=useState({});
  const [actions,setAct]=useState([]);
  const [magazzino,setMagazzino]=useState({});
  const [logRif,setLogRif]=useState([]);
  const [giornaliero,setGiornaliero]=useState([]);
  const [chiusure,setChiusure]=useState([]);
  const [esclusi,setEsclusi]=useState(new Set());
  const [view,setView]=useState("home");
  const [ready,setReady]=useState(false);
  const [loading,setLoading]=useState(false);
  const [showMese,setShowMese]=useState(false);
  const [confDel,setConfDel]=useState(null);
  const [toast,setToast]=useState(null);
  const [showNotifiche, setShowNotifiche] = useState(false);
  const [showNovita, setShowNovita] = useState(false);
  const { notifiche, nonLette, segnaLetta, segnaTutte } = useNotifiche(orgId);

  const notify=(msg,ok=true)=>{setToast({msg,ok});setTimeout(()=>setToast(null),3000);};

  const _RIC_CACHE_KEY = `ric_cache_${orgId}`;

  useEffect(()=>{
    // Carica subito dal cache locale come fallback
    if (orgId) {
      try {
        const cached = localStorage.getItem(_RIC_CACHE_KEY);
        if (cached) {
          const { data, savedAt } = JSON.parse(cached);
          if (data) { setRic(data); setOfflineCacheDate(savedAt); }
        }
      } catch {}
    }

    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
    Promise.race([
      Promise.all([sload(SK_RIC),sload(SK_PROD),sload(SK_ACT),sload(SK_MAG),sload("pasticceria-logrif-v1"),sload(SK_GIOR),sload(SK_CHIUS),sload(SK_EXCL)]),
      timeout
    ]).then(([ric,prod,act,mag,logrif,gior,chius,excl])=>{
      setOfflineMode(false);
      if(ric){
        setRic(ric);
        // Salva ricettario in cache locale
        try { localStorage.setItem(_RIC_CACHE_KEY, JSON.stringify({ data: ric, savedAt: new Date().toLocaleString('it-IT') })); } catch {}
        for(const r of Object.values(ric.ricette||{})){
          if(r.unita!=null && !REGOLE[r.nome]){
            REGOLE[r.nome]={ unita:r.unita, prezzo:r.prezzo, tipo:r.tipo||"fetta" };
          }
        }
      }
      if(prod){setProd(prod);}
      if(act)   setAct(act);
      if(mag)   setMagazzino(mag);
      if(logrif)setLogRif(logrif);
      if(gior)  setGiornaliero(gior);
      if(chius) setChiusure(chius);
      if(excl)  setEsclusi(new Set(excl));
      // Migration: convert known semilavorati from tipo "interno" or missing tipo
      if (ric) {
        let changed = false;
        const SEMI_NOTI = ["CREMA PASTICCERA","FRUIT PER CROSTATE","PASTA FROLLA"];
        const nuoveRicette = { ...(ric.ricette||{}) };
        for (const nome of SEMI_NOTI) {
          if (nuoveRicette[nome] && nuoveRicette[nome].tipo !== "semilavorato") {
            nuoveRicette[nome] = { ...nuoveRicette[nome], tipo:"semilavorato", unita:0, prezzo:0 };
            changed = true;
          }
        }
        // Also check for any ricetta named like "fruit*" or "crostata*" with tipo interno
        for (const [k,r] of Object.entries(nuoveRicette)) {
          const kl = k.toLowerCase();
          if ((kl.includes("fruit") || kl.includes("frolla") || kl.includes("curd"))
              && r.tipo === "interno") {
            nuoveRicette[k] = { ...r, tipo:"semilavorato", unita:0, prezzo:0 };
            changed = true;
          }
        }
        if (changed) {
          const migrated = { ...ric, ricette: nuoveRicette };
          setRic(migrated);
          ssave(SK_RIC, migrated);
        }
      }
      setReady(true);
    }).catch(err => {
      // Timeout o errore connessione: usa dati dalla cache locale
      if (err.message === 'timeout' || err.message?.includes('network') || err.message?.includes('fetch')) {
        setOfflineMode(true);
      }
      setReady(true);
    });
  },[]);

  useEffect(()=>{
    if(!ready) return;
    const ULTIMA = CHANGELOG[0]?.versione;
    const vista = localStorage.getItem('foodios-changelog-vista');
    if(vista !== ULTIMA) setShowNovita(true);
  },[ready]);

  const handleFile=useCallback(async files=>{
    setLoading(true);
    let merged = ricettario ? { ...ricettario, ricette:{...ricettario.ricette}, ingredienti_costi:{...ricettario.ingredienti_costi} } : null;
    let totRicette = 0;
    let totFile = 0;
    for(const f of files){
      if(!f.name.endsWith(".xlsx")) continue;
      try{
        const p=await parseRicettario(f);
        if(!merged){
          merged = p;
        } else {
          // Merge: nuove ricette sovrascrivono quelle con stesso nome, prezzi si aggiungono
          merged = {
            ...merged,
            ricette: { ...merged.ricette, ...p.ricette },
            ingredienti_costi: { ...merged.ingredienti_costi, ...p.ingredienti_costi },
          };
        }
        totRicette += Object.keys(p.ricette).length;
        totFile++;
      }catch(e){notify("⚠ "+f.name+": "+e.message,false);}
    }
    if(merged){
      setRic(merged);
      await ssave(SK_RIC, merged);
      try { localStorage.setItem(_RIC_CACHE_KEY, JSON.stringify({ data: merged, savedAt: new Date().toLocaleString('it-IT') })); } catch {}
      notify(`✓ ${totFile > 1 ? totFile+" file caricati —" : "Ricettario caricato —"} ${Object.keys(merged.ricette).length} ricette totali`);
      setView("ricettario");
    }
    setLoading(false);
  },[ricettario]);

  const handleImportPrezziOCR=useCallback(async (nuoviCosti) => {
    if (!ricettario) return;
    const nuovoRic = { ...ricettario, ingredienti_costi: { ...(ricettario.ingredienti_costi||{}), ...nuoviCosti } };
    setRic(nuovoRic); await ssave(SK_RIC, nuovoRic);
  }, [ricettario]);

  const handleImportPrezzi=useCallback(async files=>{
    setLoading(true);
    let mergedCosti = { ...(ricettario?.ingredienti_costi||{}) };
    let totIng = 0; let totFile = 0;
    for(const f of Array.from(files||[])){
      if(!f.name.endsWith(".xlsx") && !f.name.endsWith(".xls") && !f.name.endsWith(".csv")) continue;
      try{
        const {prezzi, count} = await parsePrezziFile(f);
        mergedCosti = { ...mergedCosti, ...prezzi };
        totIng += count; totFile++;
      }catch(e){notify("⚠ "+f.name+": "+e.message,false);}
    }
    if(totFile > 0 && ricettario){
      const nuovoRic = { ...ricettario, ingredienti_costi: mergedCosti };
      setRic(nuovoRic); await ssave(SK_RIC, nuovoRic);
      notify(`✓ Prezzi aggiornati — ${totIng} ingredienti da ${totFile > 1 ? totFile+" file" : "file"} (sovrascrivono stime HoReCa)`);
    } else if(totFile === 0){
      notify("⚠ Nessun file xlsx/xls/csv valido trovato", false);
    }
    setLoading(false);
  },[ricettario]);

  const handleNuovoMese=useCallback(async(m,y)=>{
    const k=mKey(m,y);
    if(produzione[k]){setView(k);setShowMese(false);return;}
    const mese={key:k,month:m,year:y,label:mLabel(m,y),entries:[],meteo:null};
    const meteo=await fetchMeteo(m,y);
    if(meteo) mese.meteo=meteo;
    const np={...produzione,[k]:mese};
    setProd(np);await ssave(SK_PROD,np);
    setView(k);setShowMese(false);
    notify(`📅 ${mese.label} creato`);
  },[produzione]);

  // Aggiorna prezzo/fette da RicettarioView → propaga a tutte le dashboard
  const handleUpdateRegola = useCallback(async (nome, { prezzo, unita, congelabile }) => {
    REGOLE[nome] = { ...(REGOLE[nome]||{}), prezzo, unita };
    // Aggiorna anche dentro la ricetta stessa (per ricette manuali e per persistenza)
    const nuovoRic = {
      ...(ricettario||{}),
      ingredienti_costi: ricettario?.ingredienti_costi||{},
      ricette: {
        ...(ricettario?.ricette||{}),
        [nome]: { ...(ricettario?.ricette?.[nome]||{}), prezzo, unita, ...(congelabile!==undefined?{congelabile}:{}) }
      }
    };
    setRic(nuovoRic);
    await ssave(SK_RIC, nuovoRic);
    const cong = congelabile!==undefined ? congelabile : ricettario?.ricette?.[nome]?.congelabile;
    notify(`✓ ${nome}: ${unita} ${REGOLE[nome]?.tipo==="fetta"?"fette":"pezzi"} × ${fmt(prezzo)}${cong?" · ❄ congelabile":""}`);
  }, [ricettario]);

  // noRedirect=true quando si elimina — non vogliamo uscire dalla pagina
  const handleSalvaRicetta = useCallback(async (nuovoRic, nuoveRegole, noRedirect=false) => {
    const ricettaNome = Object.keys(nuoveRegole||{})[0];
    // 1. REGOLE runtime
    for (const [n,r] of Object.entries(nuoveRegole||{})) REGOLE[n]=r;
    // 2. State + storage
    setRic(nuovoRic);
    await ssave(SK_RIC, nuovoRic);
    // 3. Magazzino — aggiungi ingredienti mancanti con giacenza 0 (solo su save, non su delete)
    const ings = (ricettaNome && nuovoRic.ricette?.[ricettaNome]?.ingredienti) || [];
    if (ings.length > 0 && !noRedirect) {
      setMagazzino(prev => {
        const nm = {...prev};
        ings.forEach(ing => {
          const k = normIng(ing.nome);
          if (!nm[k]) nm[k]={nome:ing.nome.trim(),giacenza_g:0,soglia_g:0,ultimoRifornimento:null};
        });
        ssave(SK_MAG, nm);
        return nm;
      });
    }
    // 4. Toast + redirect solo su salvataggio nuovo (non su delete)
    if (ricettaNome) notify(`✓ "${ricettaNome}" salvata`);
    if (!noRedirect) setView("ricettario");
  }, [magazzino]);

  const handleSave=useCallback(async(k,entries)=>{
    const np={...produzione,[k]:{...produzione[k],entries}};
    setProd(np);await ssave(SK_PROD,np);
    notify("✓ Dati salvati");
  },[produzione]);

  const handleDel=useCallback(async k=>{
    const np={...produzione};delete np[k];
    setProd(np);await ssave(SK_PROD,np);
    const ks=Object.keys(np).sort();
    setView(ks.length?ks.at(-1):"ricettario");
    setConfDel(null);notify("Mese eliminato");
  },[produzione]);

  const handleAddAct=useCallback(async({label,azione,fonte,meseSorgente})=>{
    const a={id:`a-${Date.now()}`,label,azione,fonte,meseSorgente,stato:"aperta",createdAt:new Date().toISOString()};
    const u=[a,...actions];setAct(u);await ssave(SK_ACT,u);notify("✅ Azione tracciata");
  },[actions]);
  const handleUpdAct=useCallback(async(id,ch)=>{const u=actions.map(a=>a.id===id?{...a,...ch}:a);setAct(u);await ssave(SK_ACT,u);},[actions]);
  const handleDelAct=useCallback(async id=>{const u=actions.filter(a=>a.id!==id);setAct(u);await ssave(SK_ACT,u);},[actions]);

  const sortedMesi=Object.keys(produzione).sort();
  const currentMese=produzione[view];

  if(!ready) return <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:C.textSoft}}>Caricamento…</div>;

  return (
    <ErrorBoundary>
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Inter',system-ui,sans-serif",color:C.text,display:"flex",paddingTop:isTrialAttivo&&auth?.org?.trial_ends_at?38:0}}>
      {/* ── Trial Banner ── */}
      {isTrialAttivo && auth?.org?.trial_ends_at && (()=>{
        const giorniRim = Math.max(0, Math.ceil((new Date(auth.org.trial_ends_at) - new Date()) / 86400000));
        return (
          <div style={{background:"#FFFBEB",borderBottom:"1px solid #FDE68A",
                       padding:"9px 24px",fontSize:12,fontWeight:500,textAlign:"center",
                       position:"fixed",top:0,left:0,right:0,zIndex:200,color:"#92400E"}}>
            🎁 Trial gratuito — <strong>{giorniRim} giorni rimanenti</strong>
            &nbsp;·&nbsp; Domande? <a href="mailto:support@foodios.it" style={{color:"#C0392B",fontWeight:700}}>support@foodios.it</a>
          </div>
        );
      })()}
      <style>{`*{box-sizing:border-box}body{font-family:'Inter',system-ui,sans-serif}input,select,button,textarea{font-family:inherit}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:rgba(148,163,184,0.4);border-radius:10px}::-webkit-scrollbar-thumb:hover{background:rgba(148,163,184,0.7)}`}</style>

      {toast&&(
        <div style={{position:"fixed",top:16,right:16,zIndex:999,background:toast.ok?C.green:C.red,color:C.white,padding:"10px 20px",borderRadius:9,fontSize:12,fontWeight:700,boxShadow:"0 4px 20px rgba(0,0,0,0.2)"}}>
          {toast.msg}
        </div>
      )}
      {showMese&&<NuovoMeseModal onCrea={handleNuovoMese} onClose={()=>setShowMese(false)}/>}

      {/* SIDEBAR */}
      {(()=>{
        // ── data indicators ──────────────────────────────────────────────────
        const hasRic     = !!ricettario && Object.keys(ricettario.ricette||{}).length > 0;
        const hasMag     = Object.keys(magazzino||{}).length > 0;
        const hasGior    = (giornaliero||[]).length > 0;
        const hasChius   = (chiusure||[]).length > 0;
        const criticeMag = Object.values(magazzino||{}).filter(m=>m.giacenza_g===0||(m.soglia_g>0&&m.giacenza_g<=m.soglia_g)).length;
        const azioniAperte = (actions||[]).filter(a=>a.stato!=="chiusa").length;

        // ── warm-dark sidebar palette ────────────────────────────────────────
        const S = {
          divider:  "rgba(255,255,255,0.05)",
          section:  "rgba(200,130,110,0.5)",
          inactive: "rgba(215,170,155,0.55)",
          active:   "#FCA5A5",
          activeBg: "rgba(192,57,43,0.18)",
        };

        // ── inline SVG renderer (Lucide style 24-grid) ───────────────────────
        const ic = (paths) => (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
            style={{flexShrink:0}} dangerouslySetInnerHTML={{__html:paths}} />
        );

        const ICONS = {
          home:       '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
          book:       '<path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>',
          layers:     '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
          pencil:     '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>',
          trendUp:    '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
          barChart:   '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
          clipboard:  '<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="11" y2="16"/>',
          activity:   '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
          pkg:        '<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
          creditCard: '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
          fileText:   '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
          sparkles:   '<path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>',
          settings:   '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
          logOut:     '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
          calendar:   '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
          menu:       '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
          x:          '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
        };

        const Dot = ({has, alert}) => (
          <span style={{width:5,height:5,borderRadius:"50%",flexShrink:0,
            background: alert ? C.red : has ? "#22C55E" : "rgba(255,255,255,0.1)",
            boxShadow: alert ? `0 0 5px ${C.red}` : "none"}} />
        );

        const navItem = (id, iconKey, label, hasDot, alertDot, badge) => {
          const active = view === id;
          return (
            <button key={id} onClick={()=>{setView(id);if(isMobile)setSidebarOpen(false);}}
              style={{width:"100%",padding:"8px 10px",borderRadius:7,border:"none",cursor:"pointer",textAlign:"left",
                background:active?S.activeBg:"transparent",
                color:active?S.active:S.inactive,
                fontWeight:active?600:400,fontSize:12,marginBottom:1,
                display:"flex",alignItems:"center",gap:8,transition:"background 0.12s,color 0.12s",
                borderLeft:active?"2px solid #C0392B":"2px solid transparent",
                paddingLeft:active?"9px":"10px"}}>
              {ic(ICONS[iconKey])}
              <span style={{flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</span>
              <Dot has={hasDot} alert={alertDot} />
              {badge>0&&<span style={{background:C.red,color:C.white,borderRadius:10,fontSize:8,fontWeight:900,padding:"1px 5px"}}>{badge}</span>}
            </button>
          );
        };

        const sec = (txt) => (
          <div style={{marginTop:14,marginBottom:2,padding:"0 10px",fontSize:9,fontWeight:700,
            letterSpacing:"0.09em",textTransform:"uppercase",color:S.section}}>
            {txt}
          </div>
        );

        return (
          <>
          {/* Mobile overlay backdrop */}
          {isMobile&&sidebarOpen&&(
            <div onClick={()=>setSidebarOpen(false)}
              style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",zIndex:49}} />
          )}
          <div style={{width:248,background:C.bgSide,display:"flex",flexDirection:"column",position:"fixed",
            top:0,left:0,bottom:0,zIndex:50,flexShrink:0,borderRight:"1px solid rgba(255,255,255,0.04)",
            transform: isMobile&&!sidebarOpen ? "translateX(-100%)" : "translateX(0)",
            transition:"transform 0.22s ease"}}>

            {/* ── Logo ── */}
            <div style={{padding:"20px 16px 16px",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
              <div style={{fontSize:18,fontWeight:800,color:"#FFFFFF",letterSpacing:"-0.5px",lineHeight:1.1,marginBottom:5}}>
                FoodOS
              </div>
              <div style={{fontSize:12,fontWeight:600,color:"#C0392B",letterSpacing:"0.01em",
                whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                {nomeAttivita || "La tua pasticceria"}
              </div>
            </div>

            {/* ── SedeSelector ── */}
            <SedeSelector sedi={sedi} sedeAttiva={sedeAttiva} onSelect={onSetSedeAttiva} />

            {/* ── Nav ── */}
            <div style={{flex:1,overflowY:"auto",padding:"8px 8px"}}>
              {navItem("home","home","Dashboard",true,false,0)}
              {navItem("calendario","calendar","Calendario",false,false,0)}
              {sedi&&sedi.filter(s=>s.attiva!==false).length>1&&navItem("confronto-sedi","barChart","Confronto Sedi",false,false,0)}

              {sec("Ricette")}
              {navItem("ricettario","book","Ricettario",hasRic,false,0)}
              {navItem("semilavorati","layers","Semilavorati",hasRic,false,0)}
              {navItem("nuova-ricetta","pencil","Nuova / Modifica",false,false,0)}

              {sec("Analisi")}
              {navItem("simulatore","trendUp","Food Cost",hasRic,false,0)}
              {navItem("pl","barChart","P&L",hasRic,false,0)}

              {sec("Operazioni")}
              {navItem("giornaliero","clipboard","Produzione",hasGior,false,0)}
              {navItem("storico","activity","Storico produzione",hasGior,false,0)}
              {navItem("magazzino","pkg","Magazzino",hasMag,criticeMag>0,criticeMag)}
              {navItem("chiusura","creditCard","Cassa",hasChius,false,0)}
              {navItem("scadenzario","fileText","Scadenzario",false,false,0)}

              {sec("Altro")}
              {navItem("azioni","sparkles","AI Assistant",false,false,azioniAperte)}
              {navItem("integrazioni","creditCard","Integrazioni",false,false,0)}
              {navItem("impostazioni","settings","Impostazioni",false,false,0)}

              {/* Mesi archiviati */}
              {sortedMesi.length>0&&(
                <>
                  <div style={{marginTop:18,marginBottom:3,padding:"0 10px",fontSize:8,fontWeight:700,
                    letterSpacing:"0.1em",textTransform:"uppercase",color:"rgba(255,255,255,0.13)"}}>
                    Archiviati
                  </div>
                  {sortedMesi.map(k=>(
                    <div key={k} style={{marginBottom:2}}>
                      <div style={{display:"flex",alignItems:"center",gap:3}}>
                        <button onClick={()=>setView(k)}
                          style={{flex:1,padding:"7px 10px",borderRadius:6,border:"none",cursor:"pointer",textAlign:"left",
                            background:view===k?S.activeBg:"transparent",
                            color:view===k?S.active:"rgba(175,120,105,0.45)",
                            fontWeight:view===k?600:400,fontSize:11,transition:"all 0.12s",
                            borderLeft:view===k?"2px solid #C0392B":"2px solid transparent",paddingLeft:view===k?"9px":"10px"}}>
                          {produzione[k]?.label}
                        </button>
                        <button onClick={()=>setConfDel(confDel===k?null:k)}
                          style={{padding:"4px 6px",borderRadius:5,border:"none",cursor:"pointer",
                            background:confDel===k?"rgba(192,57,43,0.25)":"transparent",
                            color:"rgba(255,255,255,0.18)",fontSize:10}}>✕</button>
                      </div>
                      {confDel===k&&(
                        <div style={{margin:"3px 4px",padding:"7px 10px",background:"rgba(192,57,43,0.1)",borderRadius:7,display:"flex",gap:6}}>
                          <button onClick={()=>handleDel(k)} style={{flex:1,padding:"5px",background:C.red,color:C.white,border:"none",borderRadius:5,fontSize:9,fontWeight:800,cursor:"pointer"}}>Elimina</button>
                          <button onClick={()=>setConfDel(null)} style={{flex:1,padding:"5px",background:"transparent",color:"rgba(255,255,255,0.35)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:5,fontSize:9,cursor:"pointer"}}>No</button>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* ── Footer ── */}
            <div style={{padding:"10px 8px 16px",borderTop:"1px solid rgba(255,255,255,0.05)",display:"flex",flexDirection:"column",gap:5}}>
              {auth?.user?.email&&(
                <div style={{fontSize:9,color:"rgba(190,130,115,0.4)",padding:"0 4px 4px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textAlign:"center"}}>
                  {auth.user.email}
                </div>
              )}
              <label style={{display:"block",padding:"8px 10px",background:"rgba(255,255,255,0.025)",
                border:"1px dashed rgba(255,255,255,0.08)",borderRadius:8,cursor:"pointer",
                fontSize:ricettario?9:11,fontWeight:500,textAlign:"center",transition:"all 0.15s",
                color:ricettario?"rgba(160,100,85,0.5)":"rgba(215,170,155,0.7)"}}>
                {loading?"Caricamento…":ricettario?"↻ Aggiorna ricettario":"📂 Carica ricettario .xlsx"}
                <input type="file" accept=".xlsx" multiple style={{display:"none"}} onChange={e=>e.target.files.length&&handleFile(Array.from(e.target.files))}/>
              </label>
              <div style={{display:"flex",justifyContent:"center",gap:12,padding:"0 4px 4px"}}>
                <a href="/privacy" style={{fontSize:10,color:"rgba(190,130,115,0.45)",textDecoration:"none"}} target="_blank">Privacy</a>
                <span style={{fontSize:10,color:"rgba(190,130,115,0.2)"}}>·</span>
                <a href="/termini" style={{fontSize:10,color:"rgba(190,130,115,0.45)",textDecoration:"none"}} target="_blank">Termini</a>
                <span style={{fontSize:10,color:"rgba(190,130,115,0.2)"}}>·</span>
                <button onClick={()=>setView("changelog")} style={{fontSize:10,color:"rgba(190,130,115,0.45)",background:"none",border:"none",cursor:"pointer",padding:0}}>Novità</button>
              </div>
              <button onClick={()=>setShowNotifiche(o=>!o)}
                style={{width:"100%",padding:"8px 10px",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",
                  borderRadius:7,color:"rgba(215,170,155,0.7)",fontSize:12,fontWeight:500,cursor:"pointer",
                  display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 01-3.46 0"/>
                </svg>
                Notifiche
                {nonLette>0&&<span style={{background:C.red,color:"#fff",borderRadius:10,fontSize:9,fontWeight:800,padding:"1px 6px"}}>{nonLette}</span>}
              </button>
              <button onClick={()=>onSignOut&&onSignOut()}
                style={{width:"100%",padding:"9px 10px",background:"rgba(192,57,43,0.65)",border:"none",
                  borderRadius:7,color:"rgba(255,255,255,0.9)",fontSize:12,fontWeight:600,cursor:"pointer",
                  display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"background 0.15s"}}
                onMouseEnter={e=>e.currentTarget.style.background="#C0392B"}
                onMouseLeave={e=>e.currentTarget.style.background="rgba(192,57,43,0.65)"}>
                {ic(ICONS.logOut)}
                Esci
              </button>
            </div>
          </div>
          </>
        );
      })()}

      {/* Notifications panel */}
      {showNotifiche&&<NotifichePanel notifiche={notifiche} nonLette={nonLette} onSegnaLetta={segnaLetta} onSegnaTutte={segnaTutte} onClose={()=>setShowNotifiche(false)}/>}

      {/* Novità modal */}
      {showNovita&&<NovitaModal onClose={()=>{setShowNovita(false);localStorage.setItem('foodios-changelog-vista',CHANGELOG[0]?.versione||'');}} onVediTutte={()=>{setShowNovita(false);localStorage.setItem('foodios-changelog-vista',CHANGELOG[0]?.versione||'');setView('changelog');}}/>}

      {/* CONTENT */}
      <div style={{marginLeft:isMobile?0:248,flex:1,padding:isMobile?"16px 12px 80px":"36px 48px 100px",overflowX:"auto",minHeight:"100vh",boxSizing:"border-box"}}>
        {/* Mobile header bar */}
        {isMobile&&(
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,
            background:"#FFF",borderRadius:12,padding:"10px 14px",boxShadow:"0 1px 4px rgba(0,0,0,0.08)"}}>
            <button onClick={()=>setSidebarOpen(o=>!o)}
              style={{border:"none",background:"transparent",cursor:"pointer",padding:4,
                color:C.text,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                dangerouslySetInnerHTML={{__html:'<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>'}} />
            </button>
            <div style={{flex:1,fontSize:15,fontWeight:700,color:C.text}}>FoodOS</div>
            <button onClick={()=>setShowNotifiche(o=>!o)}
              style={{position:"relative",border:"none",background:"transparent",cursor:"pointer",
                padding:4,display:"flex",alignItems:"center",justifyContent:"center",color:C.text}}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 01-3.46 0"/>
              </svg>
              {nonLette>0&&<span style={{position:"absolute",top:0,right:0,background:C.red,color:"#fff",
                borderRadius:"50%",width:14,height:14,fontSize:8,fontWeight:900,
                display:"flex",alignItems:"center",justifyContent:"center"}}>{nonLette}</span>}
            </button>
            <div style={{fontSize:10,fontWeight:500,color:C.textMid,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:120}}>
              {nomeAttivita||""}
            </div>
          </div>
        )}

        {/* Banner offline */}
        {!isOnline&&(
          <div style={{marginBottom:16,padding:"10px 16px",background:"#C0392B",color:"#FFF",borderRadius:10,fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:8}}>
            ⚠️ Connessione assente — i dati potrebbero non essere aggiornati
          </div>
        )}
        {offlineMode&&isOnline&&offlineCacheDate&&(
          <div style={{marginBottom:16,padding:"10px 16px",background:"#FFFBEB",border:"1px solid #FDE68A",color:"#92400E",borderRadius:10,fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:8}}>
            ⚠️ Dati offline — ultimo aggiornamento {offlineCacheDate}
          </div>
        )}

        {/* Home dashboard */}
        {view==="home"&&<DashboardHomeView ricettario={ricettario} magazzino={magazzino} giornaliero={giornaliero} chiusure={chiusure} actions={actions} setView={setView}/>}

        {/* Ricettario — mostra upload se non ancora caricato */}
        {view==="ricettario"&&!ricettario&&(
          <div style={{maxWidth:500,margin:"80px auto",textAlign:"center"}}>
            <div style={{fontSize:52,marginBottom:18}}>📖</div>
            <h2 style={{margin:"0 0 10px",fontSize:24,fontWeight:900,color:C.text}}>Carica il ricettario</h2>
            <p style={{color:C.textSoft,marginBottom:32,fontSize:13,lineHeight:1.75}}>Importa il tuo file Excel con le ricette per vedere subito food cost, margini e ricavi per ogni prodotto.</p>
            <label style={{display:"inline-block",padding:"14px 32px",background:C.red,color:C.white,borderRadius:10,cursor:"pointer",fontWeight:800,fontSize:13,boxShadow:"0 4px 16px rgba(192,57,43,0.3)"}}>
              📂 Carica .xlsx ricettario
              <input type="file" accept=".xlsx" multiple style={{display:"none"}} onChange={e=>e.target.files.length&&handleFile(Array.from(e.target.files))}/>
            </label>
          </div>
        )}
        {ricettario&&view==="ricettario"&&<RicettarioView ricettario={ricettario} onUpdateRegola={handleUpdateRegola}/>}
        {ricettario&&view==="semilavorati"&&<SemilavoratiView ricettario={ricettario} onSave={handleSalvaRicetta} notify={notify}/>}
        {ricettario&&view==="pl"&&<PLView ricettario={ricettario} onUpdateRegola={handleUpdateRegola}/>}
        {ricettario&&view==="simulatore"&&<SimulatorePrezziView ricettario={ricettario} giornaliero={giornaliero}/>}
        {view==="nuova-ricetta"&&<NuovaRicettaView ricettario={ricettario} notify={notify} onSave={handleSalvaRicetta}/>}
        {view==="chiusura"&&<ChiusuraView ricettario={ricettario} giornaliero={giornaliero} chiusure={chiusure} setChiusure={setChiusure} notify={notify}/>}
        {view==="storico"&&<StoricoProduzioneView ricettario={ricettario} giornaliero={giornaliero} chiusure={chiusure}/>}
        {view==="magazzino"&&<MagazzinoView ricettario={ricettario} magazzino={magazzino} setMagazzino={setMagazzino} logRif={logRif} setLogRif={setLogRif} giornaliero={giornaliero} notify={notify} esclusi={esclusi} setEsclusi={setEsclusi} onImportPrezzi={handleImportPrezzi} onImportPrezziOCR={handleImportPrezziOCR}/>}
        {view==="giornaliero"&&<ProduzioneGiornalieraView ricettario={ricettario} magazzino={magazzino} setMagazzino={setMagazzino} giornaliero={giornaliero} setGiornaliero={setGiornaliero} notify={notify}/>}
        {view==="azioni"&&<AzioniView actions={actions} onUpdate={handleUpdAct} onDelete={handleDelAct} ricettario={ricettario} giornaliero={giornaliero} chiusure={chiusure} magazzino={magazzino}/>}
        {view==="impostazioni"&&<ImpostazioniView auth={auth} nomeAttivita={nomeAttivita} tipoAttivita={tipoAttivita} piano={piano} orgId={orgId} sedi={sedi} onImportPrezzi={handleImportPrezzi} notify={notify} onChangelogOpen={()=>setView("changelog")}/>}
        {view==="confronto-sedi"&&<ConfrontoSedi orgId={orgId} sedi={sedi}/>}
        {view==="integrazioni"&&<Integrazioni orgId={orgId} notify={notify}/>}
        {view==="scadenzario"&&<Scadenzario orgId={orgId} sedeId={sedeId}/>}
        {view==="changelog"&&<ChangelogView/>}
        {view==="calendario"&&<CalendarioOperativo giornaliero={giornaliero} chiusure={chiusure} orgId={orgId} sedeId={sedeId} setView={setView} notify={notify} isMobile={isMobile}/>}
        {currentMese&&!["home","ricettario","semilavorati","pl","simulatore","azioni","magazzino","giornaliero","nuova-ricetta","storico","chiusura","impostazioni","confronto-sedi","integrazioni","scadenzario","calendario","changelog"].includes(view)&&(
          <ProduzioneView key={view} ricettario={ricettario} mese={currentMese} onSave={e=>handleSave(view,e)} onAddAction={handleAddAct}/>
        )}
      </div>
    </div>
    </ErrorBoundary>
  );
}


// Rendering handled by src/main.jsx via App.jsx