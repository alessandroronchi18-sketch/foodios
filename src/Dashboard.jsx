import React from 'react'
import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
// jsPDF caricato dinamicamente solo all'export (chunk 'pdf' separato).
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
         Cell, PieChart, Pie, Legend, ReferenceLine, LineChart, Line,
         AreaChart, Area } from 'recharts'
import { sload as _sload, ssave as _ssave, isSharedKey, sloadAllSedi } from './lib/storage'
import { supabase } from './lib/supabase'
import { caricoProduzionePF, scaricoVenditaPF } from './lib/stockPF'
import { creaTrasferimento } from './lib/trasferimenti'
import SedeSelector from './components/SedeSelector'
import SedeContextBanner from './components/SedeContextBanner'
import Scadenzario from './components/Scadenzario'
import CalendarioOperativo from './components/CalendarioOperativo'
import ReferralPanel from './components/ReferralPanel'
import Logo from './components/Logo'
import Integrazioni from './components/Integrazioni'
import { parseDeliveroo, parseJustEat, parseGlovo, parseGenericCSV, applyGenericMapping, mergeInChiusure } from './lib/importDelivery'
import { parseFile as parseCassaFile, mergeInChiusureCassa } from './lib/importCassa'
import useIsMobile from './lib/useIsMobile'
import { useOnlineStatus } from './lib/useOnlineStatus'
import { useNotifiche } from './lib/useNotifiche'
import { color as T, radius as R, shadow as S, motion as M, layout as L, z as Z, keyframes as KF, typo, tnum as TNUM } from './lib/theme'
import ImpostazioniSedi from './components/ImpostazioniSedi'
import ImpostazioniTv from './components/ImpostazioniTv'
import ExportContabilita from './components/ExportContabilita'
import WhiteLabel, { WL_KEY } from './components/WhiteLabel'
import BenchmarkOptin, { BenchmarkBadge } from './components/BenchmarkOptin'
import MfaSection from './components/Mfa'
import EventiView from './components/Eventi'
import ConfrontoSedi from './components/ConfrontoSedi'
import TrasferimentiView from './components/TrasferimentiView'
import EsportaDati from './components/EsportaDati'
import { exportRicettaPDF, exportProduzione } from './lib/exportPDF'
import { todayLocal } from './lib/dateLocal'
import { setExportCtx, getExportCtx, gateExport } from './lib/exportGuard'
import { CHANGELOG } from './lib/changelog'
import ChangelogView, { NovitaModal } from './components/Changelog'
import NotifichePanel from './components/NotifichePanel'
import BackgroundToast from './components/BackgroundToast'
import { backgroundManager } from './lib/backgroundManager'
import { uploadManager } from './lib/backgroundManager'
import { ALLERGENI, ALLERGENE_COLORS, detectAllergeniFromIngredienti, mergeAllergeni } from './lib/allergeni'
import { costoNettoPerG, loadRese, getStoreRese, setResaIngrediente, getAllRese } from './lib/rese'
import Fornitori from './components/Fornitori'
import Personale from './components/Personale'
import MenuDinamico from './components/MenuDinamico'
import PrevisioneDomanda from './components/PrevisioneDomanda'
import AIFotoAnalisi from './components/AIFotoAnalisi'
import AIAssistant from './components/AIAssistant'
import ImportaDatiView from './components/ImportaDati'
import AbbonamentoPanel from './components/AbbonamentoPanel'
import HaccpView from './components/Haccp'
import FormatiVendita from './components/FormatiVendita'
import RegistroAttivita from './components/RegistroAttivita'
import SpreciOmaggi from './components/SpreciOmaggi'
import WhatsAppReportPanel from './components/WhatsAppReportPanel'
import Impostazioni from './components/Impostazioni'
import {
  PREZZI_HORECA, SING_PLUR, normIng,
  EN_IT_PRODOTTI, EN_IT_INGREDIENTI, translateProdottoEN, translateIngredienteEN,
  NOMI_SKIP, isRicettaValida, REGOLE, getR, isSemilavorato, resetRegoleRuntime,
  buildIngCosti, calcolaFC,
} from './lib/foodcost'
import { SK_RIC, SK_PROD, SK_ACT, SK_AI, SK_MAG, SK_GIOR, SK_CHIUS, SK_EXCL, SK_RESE, SK_LOG_PRZ } from './lib/storageKeys'
import { loadXLSX } from './lib/xlsx'
import SimulatorePrezziView from './views/SimulatorePrezziView'
import PLView from './views/PLView'
import RicettarioView from './views/RicettarioView'
import DashboardHomeView from './views/DashboardHomeView'
import FotoOCR from './components/FotoOCR'
import { compressImage } from './lib/imageUtils'
import MagazzinoView from './views/MagazzinoView'
import ChiusuraView from './views/ChiusuraView'
import ProduzioneGiornalieraView from './views/ProduzioneGiornalieraView'
import AzioniView from './views/AzioniView'
import NuovaRicettaView from './views/NuovaRicettaView'
import StoricoProduzioneView from './views/StoricoProduzioneView'
import DiscrepanzeView from './views/DiscrepanzeView'
import SemilavoratiView from './views/SemilavoratiView'

// React hooks are imported above — no need for global destructuring
// XLSX is loaded dynamically via loadXLSX()

// Module-level storage context — updated by Dashboard on every render so that
// view components defined at module scope can call ssave/sload without prop-drilling.
let _ctx_orgId = null;
let _ctx_sedeId = null;
// Backup localStorage di TUTTI i ssave. Recovery se Supabase ritorna vuoto al login.
// Le chiavi shared sono indicizzate solo per orgId; quelle per-sede includono
// anche sedeId per evitare che switchare sede sovrascriva i backup dell'altra.
function _bkKey(orgId, sedeId, key) {
  return isSharedKey(key)
    ? `foodios_bk_${orgId}_${key}`
    : `foodios_bk_${orgId}_${sedeId || 'null'}_${key}`;
}
function bkWriteLS(key, val, orgId, sedeId) {
  if (!orgId) return;
  try { localStorage.setItem(_bkKey(orgId, sedeId, key), JSON.stringify({ v: val, t: Date.now() })); } catch {}
}
function bkReadLS(key, orgId, sedeId) {
  if (!orgId) return null;
  try { const raw = localStorage.getItem(_bkKey(orgId, sedeId, key)); if (!raw) return null; const o = JSON.parse(raw); return o?.v ?? null; } catch { return null; }
}
function ssave(key, val) {
  bkWriteLS(key, val, _ctx_orgId, _ctx_sedeId);
  return _ssave(key, val, _ctx_orgId, _ctx_sedeId);
}
function sload(key)      { return _sload(key, _ctx_orgId, _ctx_sedeId); }

// ─── CENTRALIZZATA ANALISI FOTO AI ───────────────────────────────────────────
async function analizzaFotoAI(file, tipo = 'ricetta') {
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const prompts = {
    ricetta: `Analizza questa immagine di una ricetta (può essere scritta a mano, stampata, o una pagina di libro di ricette) e restituisci SOLO un oggetto JSON valido senza nessun testo aggiuntivo:
{"nome":"NOME RICETTA IN MAIUSCOLO","categoria":"una di: Torte/Biscotti/Crostate/Muffin/Croissant/Pane/Pizze/Primi/Secondi/Dolci/Altro","porzioni":8,"ingredienti":[{"nome":"nome ingrediente in italiano minuscolo","quantita":250,"unita":"g/kg/ml/l/pz/cucchiai/tazze"}],"procedimento":"breve descrizione se visibile","temperatura":null,"tempo_cottura_minuti":null}
Leggi con attenzione anche grafia difficile o scritte a mano. Se un valore non è leggibile metti null.`,
  };
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) {
    throw new Error('Sessione scaduta. Ricarica la pagina e riprova.');
  }
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6', max_tokens: 2000,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: file.type || 'image/jpeg', data: base64 } },
        { type: 'text', text: prompts[tipo] || prompts.ricetta }
      ]}]
    })
  });
  if (res.status === 401) {
    // Sessione scaduta — non e' un problema di foto.
    throw new Error('Sessione scaduta durante l\'analisi. Esci e rientra per riprovare.');
  }
  if (res.status === 429) {
    throw new Error('Troppe richieste AI in poco tempo. Riprova fra un minuto.');
  }
  if (!res.ok) {
    // 5xx, 4xx generici
    throw new Error(`Errore servizio AI (${res.status}). Riprova fra qualche istante.`);
  }
  const data = await res.json();
  const testo = data.content?.find(b => b.type === 'text')?.text || '';
  try {
    const clean = testo.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(clean);
  } catch {
    const match = testo.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Impossibile leggere la risposta AI. Riprova con una foto più nitida.');
  }
}

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
        color:active?"#6E0E1A":"#94A3B8",borderBottom:"1px solid #E2E8F0",
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


// ─── STORAGE ──────────────────────────────────────────────────────────────────
// Storage keys (SK_*) sono in ./lib/storageKeys e importati in cima.
// Load rese from localStorage immediately so calcolaFC uses correct yields from the start.
try { loadRese(JSON.parse(localStorage.getItem(SK_RESE)||'{}')); } catch {}
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
    const r=await fetch("/api/ai",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`},body:JSON.stringify({model:"claude-sonnet-4-6",max_tokens:500,system:sys,messages:[{role:"user",content:prompt}]})});
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
  bg:"#F8FAFC", bgCard:"#FFFFFF", bgSide:"#0B0E14", bgSubtle:"#F1F5F9",
  border:"#E5E9EF", borderStr:"#CBD5E1", borderSoft:"#EEF1F6",
  red:"#6E0E1A", redDark:"#580814", redLight:"#FEF2F2", redSoft:"#FCE7E4",
  green:"#16A34A", greenLight:"#F0FDF4",
  amber:"#D97706", amberLight:"#FFFBEB",
  text:"#0F172A", textMid:"#475569", textSoft:"#94A3B8",
  white:"#FFFFFF",
  shadowSoft:"0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.04)",
  shadowMed:"0 4px 12px rgba(15,23,42,0.06), 0 1px 3px rgba(15,23,42,0.04)",
  shadowLg:"0 10px 30px rgba(15,23,42,0.08), 0 2px 6px rgba(15,23,42,0.04)",
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
  <td style={{padding:"10px 14px",textAlign:right?"right":"left",fontWeight:bold?700:500,
    color:color||C.text,...(mono?TNUM:null),fontSize:small?10:11,
    whiteSpace:"nowrap"}}>{children}</td>
);
const TH = ({children,right}) => (
  <th style={{padding:"10px 14px",textAlign:right?"right":"left",fontSize:8,fontWeight:700,
    letterSpacing:"0.07em",textTransform:"uppercase",color:C.textSoft,
    borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap"}}>{children}</th>
);

function SH({children,sub}) {
  return (
    <div style={{display:"flex",alignItems:"baseline",gap:10,marginBottom:14,marginTop:32}}>
      <div style={{width:3,height:16,background:T.brand,borderRadius:2,flexShrink:0,alignSelf:"center"}}/>
      <div>
        <h2 style={{margin:0,fontSize:15,fontWeight:600,color:T.text,letterSpacing:"-0.015em"}}>{children}</h2>
        {sub && <div style={{fontSize:12,color:T.textSoft,marginTop:2,letterSpacing:"-0.005em"}}>{sub}</div>}
      </div>
    </div>
  );
}

function KPI({label,value,sub,color,highlight,icon}) {
  return (
    <div style={{background:highlight?"linear-gradient(135deg, #6E0E1A 0%, #4A0612 100%)":T.bgCard,
      border:`1px solid ${highlight?"#4A0612":T.border}`,borderRadius:14,
      padding:"20px 22px",
      boxShadow:highlight?"0 12px 28px rgba(110,14,26,0.34), inset 0 1px 0 rgba(255,255,255,0.18)":"0 1px 2px rgba(15,23,42,0.05), 0 4px 12px rgba(15,23,42,0.04)"}}>
      <div style={{fontSize:11,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase",
        color:highlight?"rgba(255,255,255,0.76)":T.textSoft,marginBottom:10}}>
        {icon&&<span style={{marginRight:6}}>{icon}</span>}{label}
      </div>
      <div style={{fontSize:30,fontWeight:700,color:highlight?T.textOnDark:color||T.text,
        letterSpacing:"-0.03em",lineHeight:1.05,
        fontVariantNumeric:"tabular-nums",fontFeatureSettings:"'tnum'"}}>
        {value}
      </div>
      {sub && <div style={{fontSize:12,color:highlight?"rgba(255,255,255,0.7)":T.textSoft,marginTop:7,letterSpacing:"-0.005em",fontWeight:500}}>{sub}</div>}
    </div>
  );
}

// ─── PAGE HEADER ──────────────────────────────────────────────────────────────
function PageHeader({breadcrumb, title, subtitle, action}) {
  // Il titolo della view è già nella topbar — qui mostriamo solo subtitle/action
  // per evitare la duplicazione del titolo in ogni pagina.
  if (!subtitle && !action) return null;
  return (
    <div style={{marginBottom:24,display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}>
      {subtitle && <div style={{fontSize:13,color:T.textSoft,letterSpacing:"-0.005em",lineHeight:1.5,fontWeight:500,flex:1,minWidth:0}}>{subtitle}</div>}
      {action}
    </div>
  );
}




// ─── SIMULATORE PREZZI VIEW ───────────────────────────────────────────────────

// ─── PRODUZIONE VIEW ──────────────────────────────────────────────────────────
function ProduzioneView({ricettario,mese,onSave,onAddAction}) {
  const isMobile = useIsMobile();
  const ingCosti = useMemo(()=>buildIngCosti(ricettario?.ingredienti_costi||{}), [ricettario]);
  const ricette  = Object.keys(ricettario?.ricette||{}).filter(n=>isRicettaValida(n) && getR(n,ricettario?.ricette?.[n]).tipo!=="interno" && getR(n,ricettario?.ricette?.[n]).tipo!=="semilavorato");
  const [tab,setTab] = useState("dashboard");
  const [entries,setEntries] = useState(()=>{
    if (mese.entries?.length>0) return mese.entries.map(e=>({...e}));
    return ricette.map(nome=>{
      const reg=getR(nome, ricettario?.ricette?.[nome]);
      const {tot:fc}=calcolaFC(ricettario?.ricette?.[nome], ingCosti, ricettario);
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
          <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.18em",textTransform:"uppercase",color:C.red,marginBottom:4}}>Produzione mensile · {mese.label}</div>
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
            <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(5,1fr)",gap:10,marginBottom:28}}>
              <KPI icon="💰" label="Ricavi" value={fmt(totR)} highlight/>
              <KPI icon="🧾" label="Food cost" value={fmt(totFC)} color={C.red}/>
              <KPI icon="📈" label="Margine" value={fmt(totM)} color={margColor(totMP)}/>
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
                      <td style={{padding:"10px 12px",textAlign:"right",fontWeight:800,color:r.marg>=0?C.green:C.red,fontVariantNumeric:"tabular-nums",fontFeatureSettings:"'tnum'"}}>{fmt(r.marg)}</td>
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
                    <td style={{padding:"10px 12px",textAlign:"right",fontWeight:900,fontVariantNumeric:"tabular-nums",fontFeatureSettings:"'tnum'"}}>{fmt(totR)}</td>
                    <td style={{padding:"10px 12px",textAlign:"right",fontWeight:700,color:C.red}}>{fmt(totFC)}</td>
                    <td style={{padding:"10px 12px",textAlign:"right",fontWeight:900,color:margColor(totMP),fontVariantNumeric:"tabular-nums",fontFeatureSettings:"'tnum'"}}>{fmt(totM)}</td>
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
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(3,1fr)",gap:12}}>
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





// ─── NUOVA RICETTA VIEW ───────────────────────────────────────────────────────


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
    const { error } = await supabase.from("user_data").upsert({
      organization_id: orgId, sede_id: null,
      data_key: "report-settings-v1",
      data_value: { emailReport: val },
    },{ onConflict:"organization_id,sede_id,data_key" });
    if (error) {
      console.error("Errore toggle email report:", error);
      setEmailReport(!val);
      notify("⚠ Errore nel salvataggio impostazione email", false);
      return;
    }
    notify(val ? "✓ Riceverai i report mensili via email" : "✓ Email report mensili disattivata");
  };

  const handleSalvaNome = async () => {
    if (!nomeMod.trim()) return;
    if (!orgId) {
      notify("⚠ Errore: organizzazione non trovata. Ricarica la pagina.", false);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("organizations")
        .update({ nome: nomeMod.trim() })
        .eq("id", orgId);
      if (error) throw error;
      await auth.refreshOrg?.();
      notify("✓ Nome attività aggiornato");
    } catch (e) {
      console.error("Errore salvataggio nome:", e);
      notify("⚠ Errore nel salvataggio: " + (e.message || "Riprova"), false);
    } finally {
      setSaving(false);
    }
  };

  const card = { background:"#FFF", borderRadius:14, padding:"24px 28px", boxShadow:"0 1px 4px rgba(0,0,0,0.07)", marginBottom:20 };
  const label = { fontSize:11, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8, display:"block" };
  const input = { width:"100%", padding:"10px 14px", border:`1px solid ${C.border}`, borderRadius:9, fontSize:13, fontWeight:500, color:C.text, background:"#FAFAFA", outline:"none" };

  const TABS = [
    ["generale", "⚙️ Generale"],
    ["abbonamento", "💳 Abbonamento"],
    ["whatsapp", "📱 WhatsApp"],
    ["sicurezza", "🔐 Sicurezza"],
    ["rese", "🔢 Rese"],
    ["sedi", "🏪 Sedi"],
    ["tv", "📺 TV"],
    ["contabilita", "📊 Contabilità"],
    ["benchmark", "📈 Benchmark"],
    ["personalizzazione", "🎨 Personalizzazione"],
    ["dati", "💾 Dati"],
  ];

  // Rese state
  const [reseState, setReseState] = useState(() => getAllRese());
  const [reseFiltro, setReseFiltro] = useState("");
  const saveRese = (nomeNorm, val) => {
    const v = Math.max(1, Math.min(100, parseFloat(val)||100)) / 100;
    setResaIngrediente(nomeNorm, v);
    const nuoveRese = getStoreRese();
    localStorage.setItem(SK_RESE, JSON.stringify(nuoveRese));
    setReseState(getAllRese());
    notify("✓ Resa aggiornata");
  };
  const resetRese = (nomeNorm) => {
    setResaIngrediente(nomeNorm, 1.0);
    const nuoveRese = getStoreRese();
    localStorage.setItem(SK_RESE, JSON.stringify(nuoveRese));
    setReseState(getAllRese());
    notify("✓ Resa ripristinata al 100%");
  };

  return (
    <div style={{ maxWidth:720, margin:"0 auto" }}>
      <div style={{ marginBottom:20 }}>
        <p style={{ margin:0, fontSize:13, color:T.textSoft, letterSpacing:"-0.005em", lineHeight:1.45 }}>Gestisci attività, account e preferenze.</p>
      </div>
      {/* Tab nav */}
      <div style={{ display:"flex", gap:2, marginBottom:24, borderBottom:`1px solid ${T.border}` }}>
        {TABS.map(([id,lbl]) => (
          <button key={id} onClick={()=>setTab(id)}
            style={{ padding:"10px 16px", border:"none", background:"transparent", cursor:"pointer",
              fontSize:13, fontWeight:tab===id?600:500, color:tab===id?T.text:T.textSoft,
              borderBottom:tab===id?`2px solid ${T.brand}`:"2px solid transparent",
              marginBottom:-1, letterSpacing:"-0.005em",
              transition:`color ${M.durFast} ${M.ease}` }}
            onMouseEnter={e=>{if(tab!==id)e.currentTarget.style.color=T.textMid;}}
            onMouseLeave={e=>{if(tab!==id)e.currentTarget.style.color=T.textSoft;}}>
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

      {/* ── TAB: Rese ── */}
      {tab === "rese" && (
        <div>
          <div style={card}>
            <div style={{ fontWeight:700, fontSize:15, color:C.text, marginBottom:6 }}>Resa ingredienti</div>
            <div style={{ fontSize:12, color:C.textSoft, marginBottom:16, lineHeight:1.7 }}>
              La resa indica quanta parte del peso lordo acquistato è effettivamente utilizzabile. <br/>
              Es. uova 85% → per 100g netti devi acquistare 118g lordi → il food cost reale è più alto.<br/>
              FoodOS applica automaticamente la resa al calcolo del food cost di ogni ricetta.
            </div>
            <div style={{ marginBottom:14 }}>
              <input value={reseFiltro} onChange={e=>setReseFiltro(e.target.value)} placeholder="Filtra ingrediente…"
                style={{ padding:"8px 12px", borderRadius:8, border:`1px solid ${C.borderStr}`, fontSize:12, width:"100%", color:C.text }}/>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:10 }}>
              {Object.entries(reseState).filter(([k])=>!reseFiltro||k.includes(reseFiltro.toLowerCase())).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>{
                const pct = Math.round(v*100);
                const isCustom = getStoreRese()[k]!==undefined;
                return (
                  <div key={k} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background: isCustom?"#FFF0F0":"#FDFAF8", borderRadius:9, border:`1px solid ${isCustom?C.red+"40":C.border}` }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:C.text, textTransform:"capitalize" }}>{k}</div>
                      <div style={{ fontSize:9, color:isCustom?C.red:C.textSoft, fontWeight:600 }}>{isCustom?"personalizzata":"default"}</div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <input type="number" min="1" max="100" defaultValue={pct}
                        onBlur={e=>saveRese(k,e.target.value)}
                        onKeyDown={e=>e.key==="Enter"&&saveRese(k,e.target.value)}
                        style={{ width:60, padding:"5px 8px", borderRadius:7, border:`1px solid ${C.borderStr}`, fontSize:12, textAlign:"right", fontWeight:700, color:C.text }}/>
                      <span style={{ fontSize:11, color:C.textSoft }}>%</span>
                      {isCustom&&<button onClick={()=>resetRese(k)} style={{ fontSize:9, padding:"3px 7px", borderRadius:5, border:`1px solid ${C.border}`, background:"transparent", color:C.textSoft, cursor:"pointer" }}>↩</button>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop:16, fontSize:11, color:C.textSoft, lineHeight:1.7 }}>
              💡 Le rese modificate vengono applicate immediatamente al food cost di tutte le ricette. I valori di default sono basati su standard di laboratorio.
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: Abbonamento (Stripe) ── */}
      {tab === "abbonamento" && (
        <AbbonamentoPanel org={auth?.org} notify={notify}/>
      )}

      {/* ── TAB: WhatsApp report serale ── */}
      {tab === "whatsapp" && (
        <WhatsAppReportPanel org={auth?.org} orgId={orgId} notify={notify} onRefresh={() => auth?.refreshOrg?.()} />
      )}

      {/* ── TAB: Sicurezza (2FA + audit) ── */}
      {tab === "sicurezza" && (
        <MfaSection notify={notify} />
      )}

      {/* ── TAB: Sedi ── */}
      {tab === "sedi" && (
        <ImpostazioniSedi orgId={orgId} />
      )}

      {/* ── TAB: TV ── */}
      {tab === "tv" && (
        <ImpostazioniTv orgId={orgId} sedi={sedi || []} notify={notify} />
      )}

      {/* ── TAB: Contabilità ── */}
      {tab === "contabilita" && (
        <ExportContabilita orgId={orgId} sedi={sedi || []} nomeAttivita={nomeAttivita} notify={notify} />
      )}

      {/* ── TAB: Benchmark anonimi ── */}
      {tab === "benchmark" && (
        <BenchmarkOptin orgId={orgId} sedeId={auth?.sedeId} tipoAttivita={tipoAttivita} sedi={sedi || []} notify={notify} />
      )}

      {/* ── TAB: Personalizzazione (piano Chain) ── */}
      {tab === "personalizzazione" && (
        <WhiteLabel orgId={orgId} piano={piano} notify={notify} />
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
      <div style={{padding:40,fontFamily:"'JetBrains Mono', ui-monospace, monospace",color:"#6E0E1A",background:"#FFF5F5",minHeight:"100vh"}}>
        <h2>⚠️ Errore runtime</h2>
        <pre style={{whiteSpace:"pre-wrap",fontSize:11}}>{this.state.err.toString()}</pre>
        <pre style={{whiteSpace:"pre-wrap",fontSize:10,color:"#666"}}>{this.state.err.stack}</pre>
      </div>
    );
    return this.props.children;
  }
}

function SchedaAllergeniView({ ricettario }) {
  const ricette = Object.values(ricettario?.ricette||{}).filter(r=>r.tipo!=="semilavorato"&&r.tipo!=="interno");

  const esportaPDF = async () => {
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const colW = 12;
    const rowH = 8;
    const startX = 8;
    let y = 14;

    doc.setFontSize(14); doc.setFont(undefined,'bold');
    doc.text('Scheda Allergeni', pw/2, y, {align:'center'});
    y += 6;
    doc.setFontSize(7); doc.setFont(undefined,'normal');
    doc.setTextColor(120);
    doc.text('Reg. UE 1169/2011 — Informazioni sugli allergeni alimentari', pw/2, y, {align:'center'});
    doc.setTextColor(0);
    y += 8;

    // Header: ricette come colonne
    const nomiRic = ricette.map(r=>r.nome);
    const totCols = nomiRic.length;
    const labW = 38;
    const availW = pw - startX - labW - 8;
    const cW = Math.min(colW, availW / Math.max(1, totCols));

    doc.setFontSize(6); doc.setFont(undefined,'bold');
    nomiRic.forEach((n,i)=>{
      doc.text(n.substring(0,12), startX + labW + i*cW + cW/2, y, {align:'center', maxWidth:cW-1});
    });
    y += 5;

    ALLERGENI.forEach(a => {
      doc.setFontSize(7); doc.setFont(undefined,'normal');
      doc.text(`${a.emoji} ${a.label}`, startX, y+rowH*0.6);
      ricette.forEach((r,i)=>{
        const has = (r.allergeni||[]).includes(a.id);
        if(has){
          doc.setFillColor(220,50,50);
          doc.rect(startX+labW+i*cW+1, y+1, cW-2, rowH-2, 'F');
          doc.setTextColor(255); doc.setFontSize(8); doc.setFont(undefined,'bold');
          doc.text('✓', startX+labW+i*cW+cW/2, y+rowH*0.65, {align:'center'});
          doc.setTextColor(0); doc.setFont(undefined,'normal');
        } else {
          doc.setDrawColor(220); doc.rect(startX+labW+i*cW+1, y+1, cW-2, rowH-2);
        }
      });
      y += rowH;
    });

    y += 6;
    doc.setFontSize(6); doc.setTextColor(120);
    doc.text('⚠ Le informazioni sugli allergeni possono variare in base ai fornitori. Verificare sempre le etichette dei singoli ingredienti.', startX, y);
    doc.text(`Generato il ${new Date().toLocaleDateString('it-IT')}`, pw-8, y, {align:'right'});
    doc.save('scheda-allergeni.pdf');
  };

  return (
    <div style={{maxWidth:1100}}>
      <div style={{marginBottom:24,display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
        <div>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.18em",textTransform:"uppercase",color:C.red,marginBottom:6}}>Sicurezza alimentare</div>
          <p style={{margin:0,fontSize:12,color:C.textSoft}}>Panoramica degli allergeni per tutte le ricette — Regolamento UE 1169/2011</p>
        </div>
        <button onClick={esportaPDF}
          style={{padding:"10px 22px",background:C.red,color:C.white,border:"none",borderRadius:9,fontWeight:800,fontSize:12,cursor:"pointer",boxShadow:"0 2px 10px rgba(110,14,26,0.25)"}}>
          📄 Esporta PDF
        </button>
      </div>

      {ricette.length===0 ? (
        <div style={{textAlign:"center",padding:"60px 0",color:C.textSoft,fontSize:13}}>
          Nessuna ricetta nel ricettario. Aggiungi ricette con i loro allergeni per visualizzare la scheda.
        </div>
      ) : (
        <>
          {/* Tabella allergeni × ricette */}
          <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:14,overflow:"auto",boxShadow:"0 1px 6px rgba(0,0,0,0.05)",marginBottom:24}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:600}}>
              <thead>
                <tr style={{background:"#F8F4F2"}}>
                  <th style={{padding:"12px 16px",textAlign:"left",fontSize:10,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:C.textSoft,borderBottom:`1px solid ${C.border}`,minWidth:160,position:"sticky",left:0,background:"#F8F4F2"}}>Allergene</th>
                  {ricette.map(r=>(
                    <th key={r.nome} style={{padding:"8px 4px",textAlign:"center",fontSize:9,fontWeight:700,color:C.text,borderBottom:`1px solid ${C.border}`,minWidth:80,maxWidth:100,wordBreak:"break-word"}}>
                      {r.nome.length>14?r.nome.substring(0,13)+"…":r.nome}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ALLERGENI.map((a,ai)=>(
                  <tr key={a.id} style={{background:ai%2===0?C.white:"#FDFAF8",borderBottom:`1px solid ${C.border}`}}>
                    <td style={{padding:"10px 16px",fontWeight:600,fontSize:12,color:C.text,position:"sticky",left:0,background:ai%2===0?C.white:"#FDFAF8",display:"flex",alignItems:"center",gap:8,minWidth:160}}>
                      <span style={{fontSize:16}}>{a.emoji}</span>
                      <div>
                        <div style={{fontSize:11,fontWeight:700,color:C.text}}>{a.label}</div>
                      </div>
                    </td>
                    {ricette.map(r=>{
                      const has=(r.allergeni||[]).includes(a.id);
                      return (
                        <td key={r.nome} style={{padding:"10px 4px",textAlign:"center"}}>
                          {has ? (
                            <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:26,height:26,borderRadius:6,background:`${ALLERGENE_COLORS[a.id]}20`,border:`1.5px solid ${ALLERGENE_COLORS[a.id]}`,color:ALLERGENE_COLORS[a.id],fontSize:13,fontWeight:900}}>✓</span>
                          ) : (
                            <span style={{display:"inline-block",width:26,height:26,borderRadius:6,border:`1px solid #E8E0DC`,background:"#FAFAFA"}}/>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Disclaimer legale */}
          <div style={{background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:10,padding:"14px 18px",fontSize:11,color:"#92400E",lineHeight:1.7}}>
            <strong>⚠️ Disclaimer:</strong> Le informazioni sugli allergeni sono indicative e si basano sulle ricette inserite. Gli allergeni possono variare in base ai fornitori e alla contaminazione crociata durante la produzione. Verificare sempre le etichette dei singoli ingredienti e aggiornare la scheda ad ogni modifica di ricetta o fornitore. <em>Regolamento UE 1169/2011 — Art. 21.</em>
          </div>
        </>
      )}
    </div>
  );
}

// Viste operative consentite a un utente con ruolo 'dipendente'. Tutto ciò che
// espone ricette, food cost, marginalità, dati societari o impostazioni resta
// riservato al titolare. Vedi anche la RLS in 20260605_ruolo_dipendente.sql.
const DIPENDENTE_VIEWS = new Set([
  'giornaliero',     // Produzione — "caricare i prodotti"
  'chiusura',        // Cassa
  'magazzino',       // Stock e rifornimenti
  'sprechi-omaggi',  // Operativo: sia titolare sia dipendente registrano
  'eventi',
  'calendario',
  'haccp',
  'changelog',
]);

export default function Dashboard({
  auth,
  orgId = null,
  sedeId = null,
  sedi = [],
  sedeAttiva = null,
  onSetSedeAttiva = () => {},
  nomeAttivita = 'La mia attività',
  tipoAttivita = 'bar',
  piano = 'trial',
  isTrialAttivo = false,
  onSignOut = null,
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
  const [logPrezzi,setLogPrezzi]=useState([]); // storico modifiche prezzi ingredienti
  const [giornaliero,setGiornaliero]=useState([]);
  const [chiusure,setChiusure]=useState([]);
  const [esclusi,setEsclusi]=useState(new Set());
  const [view,setView]=useState(() => {
    try { return sessionStorage.getItem(`foodios_view_${orgId||'_'}`) || "home"; } catch { return "home"; }
  });
  useEffect(() => {
    try { sessionStorage.setItem(`foodios_view_${orgId||'_'}`, view); } catch {}
  }, [view, orgId]);

  // Ruolo utente. Il dipendente vede solo le viste operative (DIPENDENTE_VIEWS).
  const ruolo = auth?.ruolo || 'titolare';
  const isDip = ruolo === 'dipendente';
  // Defense-in-depth: se un dipendente finisce su una vista non consentita (es.
  // ripristinata da sessionStorage o via link), riportalo alla produzione.
  useEffect(() => {
    if (isDip && !DIPENDENTE_VIEWS.has(view)) setView('giornaliero');
  }, [isDip, view]);
  // Quando si clicca "Modifica" su una card ricetta, salviamo qui il nome
  // così NuovaRicettaView lo carica nel form al mount.
  const [editingRicetta,setEditingRicetta]=useState(null);
  const [ready,setReady]=useState(false);
  const [loading,setLoading]=useState(false);
  const [showMese,setShowMese]=useState(false);
  const [confDel,setConfDel]=useState(null);
  const [toast,setToast]=useState(null);
  const [showNotifiche, setShowNotifiche] = useState(false);
  const [showNovita, setShowNovita] = useState(false);
  const [sidebarSec, setSidebarSec] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('foodios-sidebar-sec') || 'null')
      if (saved && typeof saved === 'object') return saved
    } catch {}
    return { oggi:true, ricette:true, numeri:false, acquisti:false, azienda:false, strumenti:false }
  });
  // Persisti aperto/chiuso dei gruppi della sidebar
  useEffect(() => {
    try { localStorage.setItem('foodios-sidebar-sec', JSON.stringify(sidebarSec)) } catch {}
  }, [sidebarSec]);
  const toggleSec = (id) => setSidebarSec(s => ({ ...s, [id]: !s[id] }));

  // Ricerca dentro la sidebar — filtra le voci del menu in tempo reale.
  const [sidebarSearch, setSidebarSearch] = useState('');
  const sidebarQuery = sidebarSearch.trim().toLowerCase();

  // Mappa view → gruppo della sidebar (per auto-aprire il gruppo della view attiva)
  const VIEW_TO_SEC = useMemo(() => ({
    giornaliero:'oggi', chiusura:'oggi', eventi:'oggi', calendario:'oggi',
    ricettario:'ricette', semilavorati:'ricette', 'nuova-ricetta':'ricette',
    'scheda-allergeni':'ricette', menu:'ricette',
    simulatore:'numeri', pl:'numeri', storico:'numeri', previsione:'numeri', discrepanze:'numeri',
    magazzino:'acquisti', scadenzario:'acquisti', fornitori:'acquisti', 'importa-dati':'acquisti',
    personale:'azienda', haccp:'azienda', 'confronto-sedi':'azienda', trasferimenti:'azienda',
    azioni:'strumenti', integrazioni:'strumenti',
  }), []);
  useEffect(() => {
    const sec = VIEW_TO_SEC[view];
    if (sec && sidebarSec[sec] === false) {
      setSidebarSec(s => ({ ...s, [sec]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);
  const [fabOpen, setFabOpen] = useState(false);
  const [whiteLabel, setWhiteLabel] = useState(null);
  const { notifiche, nonLette, segnaLetta, segnaTutte } = useNotifiche(orgId);

  // Espone il contesto per gli export PDF (nome attività + email utente) → watermark
  useEffect(() => {
    setExportCtx({ email: auth?.user?.email || null, nomeAttivita: nomeAttivita || null })
  }, [auth?.user?.email, nomeAttivita]);

  // Carica personalizzazione white label (piano Chain) — solo lettura, non blocca il render
  useEffect(() => {
    if (!orgId) return
    sload(WL_KEY, orgId, null).then(v => {
      setWhiteLabel(v || null)
      if (v?.colorePrimario && /^#[0-9A-Fa-f]{6}$/.test(v.colorePrimario)) {
        document.documentElement.style.setProperty('--fos-brand', v.colorePrimario)
      }
      if (v?.nomeApp) document.title = `${v.nomeApp} — Dashboard`
    }).catch(()=>{})
  }, [orgId]);

  const appName = whiteLabel?.nomeApp || 'FoodOS';
  const customLogo = whiteLabel?.logoDataUrl || null;
  // Gradiente brand per la voce di navigazione attiva: usa il colore custom
  // (piano Chain) se valido, altrimenti il bordeaux FoodOS di default.
  const brandGrad = (() => {
    const c = whiteLabel?.colorePrimario;
    if (!c || !/^#[0-9A-Fa-f]{6}$/.test(c)) return 'linear-gradient(135deg, #6E0E1A 0%, #4A0612 100%)';
    const n = parseInt(c.slice(1), 16);
    const dark = '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      .map(x => Math.round(x * 0.62).toString(16).padStart(2, '0')).join('');
    return `linear-gradient(135deg, ${c} 0%, ${dark} 100%)`;
  })();

  const notify=(msg,ok=true)=>{setToast({msg,ok});setTimeout(()=>setToast(null),3000);};
  // Espone notify globalmente per i call site che non l'hanno in scope (es. export PDF rate-limited)
  useEffect(()=>{ window.__foodos_notify=notify; return ()=>{ delete window.__foodos_notify; }; },[]);

  const _RIC_CACHE_KEY = `ric_cache_${orgId}`;
  const SK_LOGRIF = "pasticceria-logrif-v1";

  useEffect(()=>{
    if (!orgId) {
      console.log('⏳ caricaDati: orgId non ancora disponibile, attendo...');
      return;
    }
    console.log('📦 caricaDati START — orgId:', orgId, 'sedeId:', sedeId);
    // Reset stato per-sede prima di ricaricare (evita di mostrare brevemente
    // i dati della sede precedente mescolati ai nuovi). Le chiavi shared
    // (ricettario) le lasciamo: vengono comunque ricaricate sotto.
    setMagazzino({});
    setProd({});
    setGiornaliero([]);
    setChiusure([]);
    setLogRif([]);
    setLogPrezzi([]);
    // Carica subito dai backup locali come fallback istantaneo (offline-first).
    // Se Supabase risponde con dati validi, sovrascrive sotto.
    try {
      const cached = localStorage.getItem(_RIC_CACHE_KEY);
      if (cached) {
        const { data, savedAt } = JSON.parse(cached);
        if (data) { setRic(data); setOfflineCacheDate(savedAt); console.log('💾 cache ricettario:', Object.keys(data.ricette||{}).length, 'ricette'); }
      }
    } catch {}
    try {
      const bkMag    = bkReadLS(SK_MAG,    orgId, sedeId); if (bkMag)    { setMagazzino(bkMag);        console.log('💾 cache magazzino:', Object.keys(bkMag).length); }
      const bkGior   = bkReadLS(SK_GIOR,   orgId, sedeId); if (bkGior)   { setGiornaliero(bkGior);     console.log('💾 cache giornaliero:', bkGior.length); }
      const bkChius  = bkReadLS(SK_CHIUS,  orgId, sedeId); if (bkChius)  { setChiusure(bkChius);       console.log('💾 cache chiusure:', bkChius.length); }
      const bkProd   = bkReadLS(SK_PROD,   orgId, sedeId); if (bkProd)   { setProd(bkProd);            console.log('💾 cache produzione:', Object.keys(bkProd).length); }
      const bkAct    = bkReadLS(SK_ACT,    orgId, null);   if (bkAct)    { setAct(bkAct);              console.log('💾 cache actions:', bkAct.length); }
      const bkExcl   = bkReadLS(SK_EXCL,   orgId, null);   if (bkExcl)   { setEsclusi(new Set(bkExcl)); }
      const bkLogRif = bkReadLS(SK_LOGRIF, orgId, sedeId); if (bkLogRif) { setLogRif(bkLogRif); }
    } catch (e) { console.warn('cache locale rec error:', e); }

    // Recovery: se Supabase risponde VUOTO ma il backup locale ha dati,
    // ripristiniamo i dati su Supabase (re-save). Protegge da perdita dati
    // al re-login (RLS, race, o save mai avvenuto in passato).
    const restoreIfEmpty = (supabaseData, sk, label) => {
      if (supabaseData) return;
      const bk = bkReadLS(sk, orgId, sedeId);
      const nonEmpty = bk == null ? false
                     : Array.isArray(bk) ? bk.length > 0
                     : (typeof bk === 'object') ? Object.keys(bk).length > 0
                     : !!bk;
      if (!nonEmpty) return;
      console.warn(`🔄 ${label}: Supabase vuoto, ripristino da backup locale…`);
      ssave(sk, bk).then(() => console.log(`✅ ${label} ripristinato su Supabase`))
                   .catch(e => console.error(`❌ Ripristino ${label} fallito:`, e));
    };

    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
    Promise.race([
      Promise.all([sload(SK_RIC),sload(SK_PROD),sload(SK_ACT),sload(SK_MAG),sload(SK_LOGRIF),sload(SK_GIOR),sload(SK_CHIUS),sload(SK_EXCL),sload(SK_LOG_PRZ)]),
      timeout
    ]).then(([ric,prod,act,mag,logrif,gior,chius,excl,logprz])=>{
      setOfflineMode(false);
      console.log('📖 caricaDati SUPABASE:', {
        ricette: ric ? Object.keys(ric.ricette||{}).length : 'VUOTO',
        produzione: prod ? Object.keys(prod).length : 'VUOTO',
        actions: act ? act.length : 'VUOTO',
        magazzino: mag ? Object.keys(mag).length : 'VUOTO',
        chiusure: chius ? chius.length : 'VUOTO',
      });

      if(ric){
        setRic(ric);
        bkWriteLS(SK_RIC, ric, orgId, null);
        try { localStorage.setItem(_RIC_CACHE_KEY, JSON.stringify({ data: ric, savedAt: new Date().toLocaleString('it-IT') })); } catch {}
        // Ripulisci le regole runtime della precedente org prima di applicare
        // quelle di questa (evita leakage cross-org nel singleton REGOLE).
        resetRegoleRuntime();
        for(const r of Object.values(ric.ricette||{})){
          if(r.unita!=null && !REGOLE[r.nome]){
            REGOLE[r.nome]={ unita:r.unita, prezzo:r.prezzo, tipo:r.tipo||"fetta" };
          }
        }
      } else {
        console.warn('⚠️ Supabase ricettario vuoto per orgId', orgId);
        // Tenta restore dal cache ricettario (formato vecchio _RIC_CACHE_KEY)
        try {
          const cached = localStorage.getItem(_RIC_CACHE_KEY);
          if (cached) {
            const { data } = JSON.parse(cached);
            if (data && Object.keys(data.ricette||{}).length > 0) {
              console.warn('🔄 ricettario: ripristino da cache locale…');
              ssave(SK_RIC, data).then(() => console.log('✅ ricettario ripristinato su Supabase'))
                                 .catch(e => console.error('❌ Ripristino ricettario fallito:', e));
            }
          }
        } catch {}
        restoreIfEmpty(null, SK_RIC, 'ricettario'); // anche dal nuovo bk format
      }
      if(prod)  { setProd(prod);          bkWriteLS(SK_PROD,   prod,   orgId, sedeId); } else { restoreIfEmpty(prod,   SK_PROD,   'produzione'); }
      if(act)   { setAct(act);            bkWriteLS(SK_ACT,    act,    orgId, null);   } else { restoreIfEmpty(act,    SK_ACT,    'actions'); }
      if(mag)   { setMagazzino(mag);      bkWriteLS(SK_MAG,    mag,    orgId, sedeId); } else { restoreIfEmpty(mag,    SK_MAG,    'magazzino'); }
      if(logrif){ setLogRif(logrif);      bkWriteLS(SK_LOGRIF, logrif, orgId, sedeId); } else { restoreIfEmpty(logrif, SK_LOGRIF, 'logRif'); }
      if(gior)  { setGiornaliero(gior);   bkWriteLS(SK_GIOR,   gior,   orgId, sedeId); } else { restoreIfEmpty(gior,   SK_GIOR,   'giornaliero'); }
      if(chius) { setChiusure(chius);     bkWriteLS(SK_CHIUS,  chius,  orgId, sedeId); } else { restoreIfEmpty(chius,  SK_CHIUS,  'chiusure'); }
      if(excl)  { setEsclusi(new Set(excl)); bkWriteLS(SK_EXCL, excl,  orgId, null);   } else { restoreIfEmpty(excl,   SK_EXCL,   'esclusi'); }
      if(logprz){ setLogPrezzi(logprz); }
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
          ssave(SK_RIC, migrated).catch(e => console.error('ssave migrazione:', e));
        }
      }
      setReady(true);
    }).catch(err => {
      console.error('❌ caricaDati FALLITO:', err);
      if (err.message === 'timeout' || err.message?.includes('network') || err.message?.includes('fetch')) {
        setOfflineMode(true);
      }
      setReady(true);
    });
  },[orgId, sedeId]);

  useEffect(()=>{
    if(!ready) return;
    const ULTIMA = CHANGELOG[0]?.versione;
    const vista = localStorage.getItem('foodios-changelog-vista');
    if(vista !== ULTIMA) setShowNovita(true);
  },[ready]);

  const handleFile=useCallback(files=>{
    // Fire-and-forget: each file runs independently via uploadManager.
    // onComplete uses functional setRic updater so it's safe even if user navigated away.
    for(const f of Array.from(files)){
      if(!f.name.endsWith(".xlsx")) continue;
      const id = `ric-${f.name}-${Date.now()}`;
      const cacheKey = _RIC_CACHE_KEY;
      uploadManager.add(id, f, async (onProgress) => {
        onProgress(20);
        const p = await parseRicettario(f);
        onProgress(100);
        return p;
      }, {
        onComplete: (result) => {
          if (!result) return;
          setRic(prev => {
            const merged = prev ? {
              ...prev,
              ricette: { ...prev.ricette, ...result.ricette },
              ingredienti_costi: { ...prev.ingredienti_costi, ...result.ingredienti_costi },
            } : result;
            ssave(SK_RIC, merged);
            try { localStorage.setItem(cacheKey, JSON.stringify({ data: merged, savedAt: new Date().toLocaleString('it-IT') })); } catch {}
            return merged;
          });
          notify(`✓ ${f.name} — ${Object.keys(result.ricette || {}).length} ricette importate`);
        },
        onError: (err) => {
          notify(`⚠ ${f.name}: ${err.message}`, false);
        },
      });
    }
  },[_RIC_CACHE_KEY, notify]);

  const handleImportPrezziOCR=useCallback(async (nuoviCosti) => {
    if (!ricettario) return;
    const nuovoRic = { ...ricettario, ingredienti_costi: { ...(ricettario.ingredienti_costi||{}), ...nuoviCosti } };
    setRic(nuovoRic); await ssave(SK_RIC, nuovoRic);
  }, [ricettario]);

  // ── Importazioni globali usate dalla pagina "Importa dati" ────────────────
  // Delivery: auto-detect piattaforma in base alle prime righe del file
  const handleImportDeliveryGlobal = useCallback(async (files) => {
    for (const f of Array.from(files||[])) {
      try {
        const text = await f.text();
        let righe = [], piattaforma = 'Generico';
        // Try platforms in order
        try { const r = parseDeliveroo(text);  if (r?.length) { righe = r; piattaforma = 'Deliveroo'; } } catch {}
        if (!righe.length) try { const r = parseJustEat(text);  if (r?.length) { righe = r; piattaforma = 'Just Eat'; } } catch {}
        if (!righe.length) try { const r = await parseGlovo(f); if (r?.length) { righe = r; piattaforma = 'Glovo'; } } catch {}
        if (!righe.length) {
          notify(`⚠ Non riesco a riconoscere il formato di ${f.name} — usa la pagina Cassa per import guidato.`, false);
          continue;
        }
        const nuove = mergeInChiusure(chiusure||[], righe, piattaforma);
        setChiusure(nuove); await ssave(SK_CHIUS, nuove);
        notify(`✓ ${righe.length} giorni importati da ${piattaforma}`);
      } catch (e) {
        notify(`⚠ ${f.name}: ${e.message}`, false);
      }
    }
  }, [chiusure, notify]);

  // Casse: prova i parser conosciuti (zucchetti/streamcassa/toast) — se nessuno funziona avvisa
  const handleImportCasseGlobal = useCallback(async (files) => {
    const sistemi = ['zucchetti', 'streamcassa', 'toast'];
    for (const f of Array.from(files||[])) {
      let righe = null, sistema = null;
      for (const s of sistemi) {
        try { const r = await parseCassaFile(s, f); if (r?.length) { righe = r; sistema = s; break; } } catch {}
      }
      if (!righe?.length) {
        notify(`⚠ Non riesco a riconoscere il formato di ${f.name} — usa la pagina Cassa per import guidato.`, false);
        continue;
      }
      const nuove = mergeInChiusureCassa(chiusure||[], righe, sistema);
      setChiusure(nuove); await ssave(SK_CHIUS, nuove);
      notify(`✓ ${righe.length} giorni importati da ${sistema}`);
    }
  }, [chiusure, notify]);

  // Fatture: per ora indirizza l'utente alla pagina Fornitori (parser XML lì)
  const handleImportFattureGlobal = useCallback(async (files) => {
    notify(`📂 Per fatture XML/PDF usa la pagina Fornitori → Ordini → Importa fattura.`);
    setView('fornitori');
  }, [notify]);

  // Aggiornamento manuale singolo prezzo ingrediente — usato dalla tabella "Prezzi" in Magazzino.
  // Salva il vecchio prezzo nel log per audit/storico, con decorrenza opzionale.
  // Se `decorreDa` è una data futura, applichiamo subito al ricettario MA il log
  // mantiene la decorrenza per i calcoli storici/futuri (es. cambio prezzo dal 01/01).
  const handleUpdatePrezzoIng = useCallback(async (nomeIng, nuovoPrezzoKg, decorreDa) => {
    if (!ricettario) return;
    const key = normIng(nomeIng);
    const old = ricettario.ingredienti_costi?.[key] || { costoKg: 0, costoG: 0 };
    const prevKg = Number(old.costoKg) || 0;
    const newKg  = Number(nuovoPrezzoKg) || 0;
    if (prevKg === newKg) return;

    const now = new Date();
    const decorre = decorreDa ? new Date(decorreDa) : now;
    const isFuture = decorre > now;

    // Se la decorrenza è oggi/passato, applichiamo subito al ricettario corrente.
    // Se è futura, NON aggiorniamo `ingredienti_costi` ora: lascia il prezzo
    // attuale finché la data arriva (un job semplice o il calcolo storico lo gestirà).
    if (!isFuture) {
      const nuovoRic = {
        ...ricettario,
        ingredienti_costi: {
          ...(ricettario.ingredienti_costi||{}),
          [key]: { costoKg: parseFloat(newKg.toFixed(4)), costoG: parseFloat((newKg/1000).toFixed(6)) },
        },
      };
      // SAVE FIRST per evitare data-loss su update prezzo.
      try { await ssave(SK_RIC, nuovoRic); }
      catch (e) { notify(`⚠ Errore salvataggio prezzo: ${e.message || 'rete'}`, false); return; }
      setRic(nuovoRic);
    }

    // Log audit + storico per i calcoli retroattivi
    const entry = {
      id: `lp-${Date.now()}`,
      data: now.toISOString(),                       // quando salvato
      decorre_da: decorre.toISOString(),             // quando entra in vigore
      ingrediente: nomeIng,
      prezzoVecchio: prevKg,
      prezzoNuovo:   newKg,
      delta:         newKg - prevKg,
      deltaPct:      prevKg > 0 ? ((newKg - prevKg) / prevKg * 100) : null,
      utente:        auth?.user?.email || null,
      pianificato:   isFuture || undefined,
    };
    const nextLog = [entry, ...(logPrezzi||[])].slice(0, 500); // tieni gli ultimi 500
    try { await ssave(SK_LOG_PRZ, nextLog); }
    catch (e) { notify(`⚠ Errore log prezzi: ${e.message || 'rete'}`, false); return; }
    setLogPrezzi(nextLog);
    const msg = isFuture
      ? `✓ Prezzo "${nomeIng}" programmato a €${newKg.toFixed(2)}/kg dal ${decorre.toLocaleDateString('it-IT')}`
      : `✓ Prezzo "${nomeIng}" aggiornato a €${newKg.toFixed(2)}/kg`;
    notify(msg);
  }, [ricettario, logPrezzi, auth?.user?.email]);

  // Applica le modifiche prezzi PIANIFICATE la cui decorrenza è ormai passata.
  // Eseguita all'avvio e quando logPrezzi cambia: idempotente perché toglie il flag `pianificato`.
  useEffect(() => {
    if (!ricettario || !Array.isArray(logPrezzi) || logPrezzi.length === 0) return;
    const ora = Date.now();
    const daApplicare = logPrezzi.filter(e =>
      e?.pianificato === true &&
      e?.decorre_da && new Date(e.decorre_da).getTime() <= ora
    );
    if (daApplicare.length === 0) return;

    let nuoviCosti = { ...(ricettario.ingredienti_costi || {}) };
    for (const e of daApplicare) {
      const k = normIng(e.ingrediente);
      const newKg = Number(e.prezzoNuovo) || 0;
      nuoviCosti[k] = { costoKg: parseFloat(newKg.toFixed(4)), costoG: parseFloat((newKg/1000).toFixed(6)) };
    }
    const nuovoRic = { ...ricettario, ingredienti_costi: nuoviCosti };
    setRic(nuovoRic);
    ssave(SK_RIC, nuovoRic).catch(() => {});

    const idsApplicati = new Set(daApplicare.map(e => e.id));
    const nextLog = logPrezzi.map(e => idsApplicati.has(e.id) ? { ...e, pianificato: false, applicato_il: new Date().toISOString() } : e);
    setLogPrezzi(nextLog);
    ssave(SK_LOG_PRZ, nextLog).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ricettario, logPrezzi.length]);

  const handleImportPrezzi=useCallback(files=>{
    // Fire-and-forget: each file runs independently via uploadManager.
    let hasValidFile = false;
    for(const f of Array.from(files||[])){
      if(!/\.(xlsx|xls|csv)$/i.test(f.name)) continue;
      hasValidFile = true;
      const id = `prezzi-${f.name}-${Date.now()}`;
      uploadManager.add(id, f, async (onProgress) => {
        onProgress(30);
        const result = await parsePrezziFile(f);
        onProgress(100);
        return result;
      }, {
        onComplete: ({ prezzi, count } = {}) => {
          if (!prezzi || !count) return;
          setRic(prev => {
            if (!prev) return prev;
            const nuovoRic = { ...prev, ingredienti_costi: { ...(prev.ingredienti_costi||{}), ...prezzi } };
            ssave(SK_RIC, nuovoRic);
            return nuovoRic;
          });
          notify(`✓ ${f.name} — ${count} prezzi aggiornati`);
        },
        onError: (err) => {
          notify(`⚠ ${f.name}: ${err.message}`, false);
        },
      });
    }
    if (!hasValidFile) notify("⚠ Nessun file xlsx/xls/csv valido trovato", false);
  },[notify]);

  const handleNuovoMese=useCallback(async(m,y)=>{
    const k=mKey(m,y);
    if(produzione[k]){setView(k);setShowMese(false);return;}
    const mese={key:k,month:m,year:y,label:mLabel(m,y),entries:[],meteo:null};
    const meteo=await fetchMeteo(m,y);
    if(meteo) mese.meteo=meteo;
    const np={...produzione,[k]:mese};
    try { await ssave(SK_PROD,np); }
    catch (e) { notify(`⚠ Creazione mese fallita: ${e.message || 'rete'}`, false); return; }
    setProd(np);
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
    try { await ssave(SK_RIC, nuovoRic); }
    catch (e) { notify(`⚠ Aggiornamento ricetta fallito: ${e.message || 'rete'}`, false); return; }
    setRic(nuovoRic);
    const cong = congelabile!==undefined ? congelabile : ricettario?.ricette?.[nome]?.congelabile;
    notify(`✓ ${nome}: ${unita} ${REGOLE[nome]?.tipo==="fetta"?"fette":"pezzi"} × ${fmt(prezzo)}${cong?" · ❄ congelabile":""}`);
  }, [ricettario]);

  // noRedirect=true quando si elimina — non vogliamo uscire dalla pagina
  const handleSalvaRicetta = useCallback(async (nuovoRic, nuoveRegole, noRedirect=false) => {
    const ricettaNome = Object.keys(nuoveRegole||{})[0];
    // Resolved orgId: prefer prop (current closure), fallback to module ctx (always fresh per render)
    let effectiveOrgId = orgId || _ctx_orgId;
    // Retry breve in caso di race con caricamento profilo
    let tentativo = 0;
    while (!effectiveOrgId && tentativo < 10) {
      await new Promise(r => setTimeout(r, 200));
      effectiveOrgId = orgId || _ctx_orgId;
      tentativo++;
    }
    console.log('💾 handleSalvaRicetta', { orgId, _ctx_orgId, effectiveOrgId, sedeId, ricettaNome, count: Object.keys(nuovoRic?.ricette||{}).length });
    if (!effectiveOrgId) {
      notify('⚠ Sessione non valida (orgId mancante). Ricarica la pagina.', false);
      return;
    }
    // 1. REGOLE runtime
    for (const [n,r] of Object.entries(nuoveRegole||{})) REGOLE[n]=r;
    // 2. State locale immediato
    setRic(nuovoRic);
    // 3. Salvataggio su Supabase con feedback esplicito se fallisce
    try {
      await ssave(SK_RIC, nuovoRic);
      console.log('✅ ricettario salvato su Supabase');
    } catch(err) {
      console.error('❌ ERRORE salvataggio ricetta su Supabase:', err);
      // Backup localStorage perché Supabase ha fallito
      try { localStorage.setItem(_RIC_CACHE_KEY, JSON.stringify({ data: nuovoRic, savedAt: new Date().toLocaleString('it-IT') })); } catch {}
      notify(`⚠ Salvataggio DB fallito: ${err.message || 'errore'}. Ricetta in cache locale — esegui SQL Supabase.`, false);
      return; // non procedere — non redirect, non conferm toast
    }
    // 4. Magazzino — aggiungi ingredienti mancanti con giacenza 0
    const ings = (ricettaNome && nuovoRic.ricette?.[ricettaNome]?.ingredienti) || [];
    if (ings.length > 0 && !noRedirect) {
      setMagazzino(prev => {
        const nm = {...prev};
        ings.forEach(ing => {
          const k = normIng(ing.nome);
          if (!nm[k]) nm[k]={nome:ing.nome.trim(),giacenza_g:0,soglia_g:0,ultimoRifornimento:null};
        });
        ssave(SK_MAG, nm).catch(e => console.error('ssave SK_MAG:', e));
        return nm;
      });
    }
    // 5. Toast + redirect
    if (ricettaNome) notify(`✓ "${ricettaNome}" salvata`);
    if (!noRedirect) setView("ricettario");
  }, [magazzino, orgId, sedeId, _RIC_CACHE_KEY]);

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
  const ingCostiMain = useMemo(()=>buildIngCosti(ricettario?.ingredienti_costi||{}), [ricettario]);

  if(!ready) return <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:C.textSoft}}>Caricamento…</div>;

  return (
    <ErrorBoundary>
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Inter',system-ui,sans-serif",color:C.text,display:"flex"}}>
      {/* ── Trial Banner rimosso dal rendering (logica isTrialAttivo intatta) ── */}
      <style>{`*{box-sizing:border-box}body{font-family:'Inter',system-ui,sans-serif}input,select,button,textarea{font-family:inherit}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:rgba(148,163,184,0.4);border-radius:10px}::-webkit-scrollbar-thumb:hover{background:rgba(148,163,184,0.7)}`}</style>

      {toast&&(
        <div style={{position:"fixed",top:isMobile?16:20,right:isMobile?16:24,left:isMobile?16:"auto",
          zIndex:Z.toast,background:toast.ok?T.text:T.brand,color:T.textOnDark,
          padding:"11px 18px",borderRadius:R.xl,fontSize:13,fontWeight:500,letterSpacing:"-0.005em",
          boxShadow:"0 10px 32px rgba(15,23,42,0.22), 0 2px 6px rgba(15,23,42,0.08)",
          display:"flex",alignItems:"center",gap:10,
          animation:"_fos_pageIn 0.22s cubic-bezier(0.32,0.72,0,1)"}}>
          <span style={{width:18,height:18,borderRadius:"50%",
            background:toast.ok?"rgba(255,255,255,0.15)":"rgba(255,255,255,0.2)",
            display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              {toast.ok?<polyline points="20 6 9 17 4 12"/>:<><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>}
            </svg>
          </span>
          {toast.msg}
        </div>
      )}
      {showMese&&<NuovoMeseModal onCrea={handleNuovoMese} onClose={()=>setShowMese(false)}/>}

      {/* SIDEBAR */}
      {(()=>{
        const today2 = todayLocal();
        const criticeMag  = Object.values(magazzino||{}).filter(m=>m.giacenza_g===0||(m.soglia_g>0&&m.giacenza_g<=m.soglia_g)).length;
        const azioniAperte= (actions||[]).filter(a=>a.stato!=="chiusa").length;
        const hasProdOggi = (giornaliero||[]).some(s=>s.data===today2&&(s.prodotti||[]).length>0);
        const hasCassaOggi= (chiusure||[]).some(c=>c.data===today2);
        const cassaMancante = !hasCassaOggi && new Date().getHours()>=14;

        const ic = (paths, sz=16) => (
          <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            style={{flexShrink:0}} dangerouslySetInnerHTML={{__html:paths}} />
        );

        const ICONS = {
          home:       '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
          cal:        '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
          creditCard: '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
          book:       '<path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>',
          layers:     '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
          pencil:     '<path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>',
          barChart:   '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
          trendUp:    '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
          pkg:        '<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
          fileText:   '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
          users:      '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>',
          menu:       '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
          sparkles:   '<path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>',
          integ:      '<rect x="2" y="3" width="6" height="6" rx="1"/><rect x="16" y="3" width="6" height="6" rx="1"/><rect x="9" y="15" width="6" height="6" rx="1"/><path d="M5 9v3a2 2 0 002 2h10a2 2 0 002-2V9"/><line x1="12" y1="14" x2="12" y2="12"/>',
          activity:   '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
          forecast:   '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><path d="M2 20l4-8 4 4 4-6 4 4"/>',
          bell:       '<path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>',
          logOut:     '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
          plus:       '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
          settings:   '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
          building:   '<rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="6" x2="9" y2="6"/><line x1="15" y1="6" x2="15" y2="6"/><line x1="9" y1="10" x2="9" y2="10"/><line x1="15" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="9" y2="14"/><line x1="15" y1="14" x2="15" y2="14"/><path d="M10 22v-4h4v4"/>',
          truck:      '<rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
          download:   '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
          shield:     '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
          chevron:    '<polyline points="6 9 12 15 18 9"/>',
          today:      '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/><circle cx="12" cy="16" r="2"/>',
          chefHat:    '<path d="M6 13.87A4 4 0 017.41 6a5.11 5.11 0 019.18 0A4 4 0 0118 13.87V21H6z"/><line x1="6" y1="17" x2="18" y2="17"/>',
          coins:      '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1110.34 18"/><path d="M7 6h1v4"/><path d="M16.71 13.88l.7.71-2.82 2.82"/>',
          shopping:   '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/>',
          briefcase:  '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16"/>',
          tool:       '<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>',
        };

        const navItem = (id, iconKey, label, badge=0, alert=false) => {
          // Ruolo dipendente: mostra solo le voci operative consentite.
          if (isDip && !DIPENDENTE_VIEWS.has(id)) return null;
          // Filtro ricerca: se la query non matcha id né label, nascondiamo
          if (sidebarQuery && !label.toLowerCase().includes(sidebarQuery) && !id.toLowerCase().includes(sidebarQuery)) {
            return null;
          }
          const active = view === id;
          return (
            <button key={id} onClick={()=>{setView(id);if(isMobile)setSidebarOpen(false);}}
              style={{width:"calc(100% - 16px)",padding:"10px 14px 10px 26px",margin:"0 8px 2px",
                borderRadius:10,
                border:"none",cursor:"pointer",textAlign:"left",
                background:active?brandGrad:"transparent",
                color:active?"#FFFFFF":"rgba(255,255,255,0.70)",
                fontWeight:active?600:400,fontSize:13,
                letterSpacing:"-0.005em",
                display:"flex",alignItems:"center",gap:11,
                position:"relative",
                boxShadow:active?"0 4px 12px rgba(110,14,26,0.34), inset 0 1px 0 rgba(255,255,255,0.12)":"none",
                transition:`background ${M.durBase} ${M.ease}, color ${M.durBase} ${M.ease}, box-shadow ${M.durBase} ${M.ease}`}}
              onMouseEnter={e=>{if(!active){e.currentTarget.style.background="rgba(255,255,255,0.06)";e.currentTarget.style.color="#FFFFFF";}}}
              onMouseLeave={e=>{if(!active){e.currentTarget.style.background="transparent";e.currentTarget.style.color="rgba(255,255,255,0.70)";}}}
            >
              <span style={{color:active?"#FFFFFF":"rgba(255,255,255,0.55)",display:"flex",alignItems:"center"}}>{ic(ICONS[iconKey],15)}</span>
              <span style={{flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</span>
              {badge>0&&<span style={{background:active?"rgba(255,255,255,0.28)":"#6E0E1A",color:"#fff",borderRadius:10,fontSize:11,fontWeight:700,padding:"2px 8px",minWidth:20,textAlign:"center",letterSpacing:0}}>{badge}</span>}
              {alert&&badge===0&&<span style={{width:8,height:8,borderRadius:"50%",background:"#E84B3A",flexShrink:0,boxShadow:"0 0 0 0 rgba(232,75,58,0.6)",animation:"_sp_pulse 1.6s ease-in-out infinite"}}/>}
            </button>
          );
        };

        const Sep = ({label}) => (
          <div style={{padding:"16px 20px 6px",fontSize:10,fontWeight:600,
            letterSpacing:"0.1em",textTransform:"uppercase",color:"rgba(255,255,255,0.36)"}}>
            {label}
          </div>
        );

        // Gruppo collassabile (macrosezione): header cliccabile + lista voci dentro.
        // - Differenziato visivamente dalle sezioni (voci): background più caldo,
        //   border-left brand, font più marcato.
        // - Quando una ricerca è attiva il gruppo si auto-apre se ha figli visibili,
        //   e viene completamente nascosto se non ha nessun figlio visibile.
        // - Mostra badge/alert sull'header quando chiuso (la voce è nascosta).
        const Group = ({ id, iconKey, label, badge=0, alert=false, children }) => {
          const visibleChildren = React.Children.toArray(children).filter(c => c !== null && c !== false);
          // Nascondi l'intero gruppo se non ha voci visibili (per ricerca attiva
          // o perché un dipendente non ha accesso a nessuna voce del gruppo).
          if (visibleChildren.length === 0) return null;
          const isOpen = sidebarQuery ? true : sidebarSec[id] !== false;
          const hasActive = VIEW_TO_SEC[view] === id;
          const textColor = hasActive ? "#FFFFFF" : "rgba(255,255,255,0.78)";
          const iconColor = hasActive ? "#FFFFFF" : "rgba(255,255,255,0.72)";
          const accent = hasActive ? "#E84B3A" : "rgba(232,75,58,0.45)";
          return (
            <div style={{ marginBottom: 4 }}>
              <button onClick={() => toggleSec(id)}
                disabled={!!sidebarQuery}
                style={{ width:"calc(100% - 16px)", margin:"4px 8px 4px", padding:"10px 12px 10px 14px",
                  background: hasActive
                    ? "linear-gradient(90deg, rgba(232,75,58,0.18), rgba(232,75,58,0.06) 60%, transparent)"
                    : "rgba(255,255,255,0.035)",
                  border:"none",
                  borderLeft:`3px solid ${accent}`,
                  cursor: sidebarQuery ? "default" : "pointer",
                  textAlign:"left",
                  borderRadius:8, display:"flex", alignItems:"center", gap:10,
                  color: textColor, fontSize:11.5, fontWeight:800,
                  letterSpacing:"0.1em", textTransform:"uppercase",
                  transition:`color ${M.durFast} ${M.ease}, background ${M.durFast} ${M.ease}` }}
                onMouseEnter={e=>{ if (sidebarQuery) return; e.currentTarget.style.color="#FFFFFF"; if(!hasActive) e.currentTarget.style.background="rgba(255,255,255,0.07)";}}
                onMouseLeave={e=>{ if (sidebarQuery) return; e.currentTarget.style.color=textColor; if(!hasActive) e.currentTarget.style.background="rgba(255,255,255,0.035)";}}>
                {iconKey && <span style={{ color: iconColor, display:"flex" }}>{ic(ICONS[iconKey],14)}</span>}
                <span style={{ flex:1, whiteSpace:"nowrap" }}>{label}</span>
                {badge>0 && !isOpen && (
                  <span style={{ background: alert ? "#E84B3A" : "rgba(255,255,255,0.16)",
                    color:"#fff", borderRadius:10, fontSize:10, fontWeight:700,
                    padding:"1px 7px", minWidth:16, textAlign:"center", letterSpacing:0 }}>{badge}</span>
                )}
                {alert && badge===0 && !isOpen && (
                  <span style={{ width:7, height:7, borderRadius:"50%", background:"#E84B3A",
                    flexShrink:0, boxShadow:"0 0 0 0 rgba(232,75,58,0.6)", animation:"_sp_pulse 1.6s ease-in-out infinite" }}/>
                )}
                <span style={{ display:"flex", transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                  transition:`transform ${M.durBase} ${M.ease}`, opacity: hasActive ? 0.85 : 0.55 }}>
                  {ic(ICONS.chevron, 12)}
                </span>
              </button>
              {isOpen && (
                <div style={{ paddingTop:2, paddingBottom:6,
                  animation:`_fos_fadeIn ${M.durBase} ${M.ease}` }}>
                  {children}
                </div>
              )}
            </div>
          );
        };

        return (
          <>
          <style>{`
            @keyframes _sp_pulse {
              0%,100% { box-shadow: 0 0 0 0 rgba(110,14,26,0.6); }
              50%      { box-shadow: 0 0 0 4px rgba(110,14,26,0); }
            }
          `}</style>

          {isMobile&&sidebarOpen&&(
            <div onClick={()=>setSidebarOpen(false)}
              style={{position:"fixed",inset:0,background:"rgba(8,12,20,0.56)",backdropFilter:"blur(2px)",WebkitBackdropFilter:"blur(2px)",zIndex:Z.overlay,
                animation:`_fos_fadeIn ${M.durBase} ${M.ease}`}} />
          )}

          <div style={{width:L.sidebarWidth,background:T.bgSide,display:"flex",flexDirection:"column",
            position:"fixed",top:0,left:0,bottom:0,zIndex:Z.drawer,flexShrink:0,
            borderRight:`1px solid ${T.borderOnDark}`,
            transform:isMobile&&!sidebarOpen?"translateX(-100%)":"translateX(0)",
            transition:`transform ${M.durSlow} ${M.ease}`,
            boxShadow:isMobile&&sidebarOpen?S.drawer:"none",
            backgroundImage:"radial-gradient(circle at 100% 0%, rgba(110,14,26,0.10) 0%, transparent 36%), linear-gradient(180deg, rgba(255,255,255,0.025) 0%, transparent 38%)"}}>

            {/* Brand accent strip */}
            <div style={{height:3, background:"linear-gradient(90deg, #6E0E1A 0%, #E84B3A 50%, #6E0E1A 100%)", flexShrink:0}}/>

            {/* Logo header: padding uniforme 20 px, logo bordeaux invariante */}
            <div style={{padding:"20px 20px 18px",borderBottom:`1px solid ${T.borderOnDark}`}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                {customLogo
                  ? <img src={customLogo} alt={appName} style={{height:38,maxWidth:60,objectFit:'contain',borderRadius:10}}/>
                  : <Logo size={38} style={{borderRadius:10,boxShadow:"0 8px 22px rgba(110,14,26,0.42)"}}/>}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:16,fontWeight:700,color:T.textOnDark,letterSpacing:"-0.015em",lineHeight:1.15}}>{appName}</div>
                  <div style={{fontSize:11.5,color:T.textOnDarkSoft,fontWeight:400,marginTop:3,
                    whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",letterSpacing:"-0.005em"}}>
                    {nomeAttivita || "La mia attività"}
                  </div>
                </div>
              </div>
            </div>

            <SedeSelector sedi={sedi} sedeAttiva={sedeAttiva} onSelect={onSetSedeAttiva} />

            {/* Search nel menu — filtra le voci della sidebar in tempo reale */}
            <div style={{padding:"12px 16px 10px",position:"relative"}}>
              <span style={{position:"absolute", left: 26, top: "50%", transform:"translateY(-50%)", display:"flex", pointerEvents:"none", color:"rgba(255,255,255,0.45)"}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </span>
              <input
                value={sidebarSearch}
                onChange={e => setSidebarSearch(e.target.value)}
                placeholder="Cerca nel menu…"
                style={{
                  width:"100%", height:34, padding:"0 28px 0 32px",
                  background:"rgba(255,255,255,0.06)",
                  border:`1px solid ${T.borderOnDark}`,
                  borderRadius:8, color:"#FFFFFF", fontSize:12.5,
                  outline:"none", fontFamily:"inherit", boxSizing:"border-box",
                  letterSpacing:"-0.005em",
                }}
                onFocus={e => { e.target.style.background="rgba(255,255,255,0.10)"; e.target.style.borderColor="rgba(232,75,58,0.55)"; }}
                onBlur={e => { e.target.style.background="rgba(255,255,255,0.06)"; e.target.style.borderColor=T.borderOnDark; }}
              />
              {sidebarSearch && (
                <button onClick={() => setSidebarSearch('')} aria-label="Cancella ricerca"
                  style={{position:"absolute", right: 24, top: "50%", transform:"translateY(-50%)", background:"none", border:"none", color:"rgba(255,255,255,0.6)", cursor:"pointer", padding:4, display:"flex"}}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
                </button>
              )}
            </div>

            {/* Nav — gruppi collassabili, ottimizzati per utenti non tecnici.
                overflowAnchor:none impedisce al browser di ri-scrollare la
                sidebar quando un Group si espande/collassa (lo scroll anchoring
                automatico spostava la view in alto). */}
            <div style={{flex:1,overflowY:"auto",overflowAnchor:"none",paddingTop:4,paddingBottom:10}}>

              {/* Sempre visibile in cima: la Dashboard.
                  Render visivamente coerente con i Group header (stesso padding,
                  border-left brand, font uppercase letterspaced) ma è una
                  singola voce cliccabile, senza chevron né children. */}
              {(() => {
                const active = view === "home"
                if (isDip && !DIPENDENTE_VIEWS.has("home")) return null
                if (sidebarQuery && !"dashboard".includes(sidebarQuery)) return null
                const textColor = active ? "#FFFFFF" : "rgba(255,255,255,0.78)"
                const iconColor = active ? "#FFFFFF" : "rgba(255,255,255,0.72)"
                const accent    = active ? "#E84B3A" : "rgba(232,75,58,0.45)"
                return (
                  <button onClick={() => { setView("home"); if (isMobile) setSidebarOpen(false) }}
                    style={{ width: "calc(100% - 16px)", margin: "4px 8px 4px", padding: "10px 12px 10px 14px",
                      background: active
                        ? "linear-gradient(90deg, rgba(232,75,58,0.18), rgba(232,75,58,0.06) 60%, transparent)"
                        : "rgba(255,255,255,0.035)",
                      border: "none",
                      borderLeft: `3px solid ${accent}`,
                      cursor: "pointer", textAlign: "left",
                      borderRadius: 8, display: "flex", alignItems: "center", gap: 10,
                      color: textColor, fontSize: 11.5, fontWeight: 800,
                      letterSpacing: "0.1em", textTransform: "uppercase",
                      transition: `color ${M.durFast} ${M.ease}, background ${M.durFast} ${M.ease}` }}
                    onMouseEnter={e => { e.currentTarget.style.color = "#FFFFFF"; if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.07)" }}
                    onMouseLeave={e => { e.currentTarget.style.color = textColor; if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.035)" }}>
                    <span style={{ color: iconColor, display: "flex" }}>{ic(ICONS.home, 14)}</span>
                    <span style={{ flex: 1, whiteSpace: "nowrap" }}>Dashboard</span>
                  </button>
                )
              })()}

              <Group id="oggi" iconKey="today" label="Oggi"
                alert={(!hasProdOggi && new Date().getHours()>=6) || cassaMancante}>
                {navItem("giornaliero","cal","Produzione",0,!hasProdOggi&&new Date().getHours()>=6)}
                {navItem("chiusura","creditCard","Cassa",0,cassaMancante)}
                {navItem("eventi","cal","Eventi")}
                {navItem("calendario","cal","Calendario")}
              </Group>

              <Group id="ricette" iconKey="chefHat" label="Ricette & Menù">
                {navItem("ricettario","book","Ricettario")}
                {navItem("semilavorati","layers","Semilavorati")}
                {navItem("nuova-ricetta","pencil","Nuova ricetta")}
                {navItem("formati-vendita","coins","Formati di vendita")}
                {navItem("scheda-allergeni","shield","Allergeni")}
                {navItem("menu","menu","Menù del giorno")}
              </Group>

              <Group id="numeri" iconKey="coins" label="Numeri">
                {navItem("simulatore","barChart","Food Cost")}
                {navItem("pl","trendUp","Profitti (P&L)")}
                {navItem("storico","activity","Storico")}
                {navItem("previsione","forecast","Previsioni")}
                {navItem("discrepanze","fileText","Discrepanze & Sprechi")}
              </Group>

              <Group id="acquisti" iconKey="shopping" label="Magazzino & Acquisti"
                badge={criticeMag} alert={criticeMag>0}>
                {navItem("magazzino","pkg","Magazzino",criticeMag,criticeMag>0)}
                {navItem("sprechi-omaggi","sparkles","Sprechi e omaggi")}
                {navItem("scadenzario","fileText","Scadenzario")}
                {navItem("fornitori","truck","Fornitori")}
                {navItem("importa-dati","download","Importa dati")}
              </Group>

              <Group id="azienda" iconKey="briefcase" label="Azienda">
                {navItem("personale","users","Personale")}
                {navItem("haccp","shield","HACCP")}
                {navItem("registro-attivita","fileText","Registro attività")}
                {(sedi||[]).length>1 && navItem("confronto-sedi","building","Confronto sedi")}
                {(sedi||[]).length>1 && navItem("trasferimenti","truck","Trasferimenti tra sedi")}
              </Group>

              <Group id="strumenti" iconKey="tool" label="Strumenti"
                badge={azioniAperte}>
                {navItem("azioni","sparkles","AI Assistant",azioniAperte)}
                {/* "Integrazioni" nascosta ai clienti su richiesta founder (2026-05-30).
                    La view resta disponibile internamente via setView('integrazioni'). */}
              </Group>

              {/* In fondo, senza gruppo: impostazioni e novità */}
              <div style={{ height: 1, background:"rgba(255,255,255,0.06)", margin:"12px 16px 8px" }}/>
              {navItem("impostazioni","settings","Impostazioni")}
              {navItem("changelog","bell","Novità")}

            </div>

            {/* Footer */}
            <div style={{padding:"14px 16px 16px",borderTop:`1px solid ${T.borderOnDark}`}}>
              {auth?.user?.email&&(
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"4px 6px 12px",overflow:"hidden"}}>
                  <div style={{width:30,height:30,borderRadius:R.md,background:"linear-gradient(135deg,#3B4252 0%,#1F2430 100%)",
                    display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:12,fontWeight:600,color:"rgba(255,255,255,0.88)",letterSpacing:0,
                    border:"1px solid rgba(255,255,255,0.06)"}}>
                    {(auth.user.email||"?").slice(0,1).toUpperCase()}
                  </div>
                  <div style={{flex:1,minWidth:0,overflow:"hidden"}}>
                    <div style={{fontSize:12,color:T.textOnDarkStrong,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{auth.user.email}</div>
                    <div style={{fontSize:10,color:T.textOnDarkSoft,fontWeight:400,marginTop:2,display:"flex",alignItems:"center",gap:5}}>
                      <span style={{width:5,height:5,borderRadius:"50%",background:T.green,boxShadow:"0 0 0 2px rgba(14,159,110,0.18)"}}/>
                      Connesso
                    </div>
                  </div>
                </div>
              )}
              <button onClick={()=>setShowNotifiche(o=>!o)}
                style={{width:"100%",padding:"9px 12px",background:"rgba(255,255,255,0.04)",
                  border:`1px solid ${T.borderOnDark}`,borderRadius:R.md,
                  color:T.textOnDarkMid,fontSize:12,fontWeight:500,cursor:"pointer",
                  display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:8,
                  transition:`background ${M.durBase} ${M.ease}, color ${M.durBase} ${M.ease}`}}
                onMouseEnter={e=>{e.currentTarget.style.background="rgba(255,255,255,0.08)";e.currentTarget.style.color="#fff";}}
                onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,0.04)";e.currentTarget.style.color=T.textOnDarkMid;}}>
                {ic(ICONS.bell)}
                Notifiche
                {nonLette>0&&<span style={{background:T.brand,color:"#fff",borderRadius:10,fontSize:10,fontWeight:700,padding:"2px 7px"}}>{nonLette}</span>}
              </button>
              <button onClick={()=>onSignOut&&onSignOut()}
                style={{width:"100%",padding:"9px 12px",background:"transparent",border:`1px solid ${T.borderOnDarkStr}`,
                  borderRadius:R.md,color:T.textOnDarkMid,fontSize:12,fontWeight:500,cursor:"pointer",
                  display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginBottom:10,
                  transition:`background ${M.durBase} ${M.ease}, color ${M.durBase} ${M.ease}, border-color ${M.durBase} ${M.ease}`}}
                onMouseEnter={e=>{e.currentTarget.style.background="rgba(110,14,26,0.14)";e.currentTarget.style.color="#fff";e.currentTarget.style.borderColor="rgba(110,14,26,0.42)";}}
                onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.textOnDarkMid;e.currentTarget.style.borderColor=T.borderOnDarkStr;}}>
                {ic(ICONS.logOut)}
                Esci
              </button>
              <div style={{display:"flex",justifyContent:"center",gap:8,paddingTop:2,flexWrap:"wrap"}}>
                <a href="/privacy" style={{fontSize:10,color:T.textOnDarkFaint,textDecoration:"none",letterSpacing:"0.02em"}} target="_blank" rel="noreferrer">Privacy</a>
                <span style={{fontSize:10,color:"rgba(255,255,255,0.14)"}}>·</span>
                <a href="/termini" style={{fontSize:10,color:T.textOnDarkFaint,textDecoration:"none",letterSpacing:"0.02em"}} target="_blank" rel="noreferrer">Termini</a>
                <span style={{fontSize:10,color:"rgba(255,255,255,0.14)"}}>·</span>
                <a href="/cookie" style={{fontSize:10,color:T.textOnDarkFaint,textDecoration:"none",letterSpacing:"0.02em"}} target="_blank" rel="noreferrer">Cookie</a>
                <span style={{fontSize:10,color:"rgba(255,255,255,0.14)"}}>·</span>
                <a href="/contatti" style={{fontSize:10,color:T.textOnDarkFaint,textDecoration:"none",letterSpacing:"0.02em"}} target="_blank" rel="noreferrer">Contatti</a>
              </div>
            </div>
          </div>

          {/* Mobile bottom navigation */}
          {isMobile&&(()=>{
            const BOTTOM_NAV = [
              {id:"home",        icon:"home",       label:"Oggi"},
              {id:"giornaliero", icon:"cal",        label:"Produzione", alert:!hasProdOggi&&new Date().getHours()>=6},
              {id:"chiusura",    icon:"creditCard", label:"Cassa",      alert:cassaMancante},
              {id:"magazzino",   icon:"pkg",        label:"Magazzino",  badge:criticeMag},
              {id:"__more",      icon:"menu",       label:"Altro"},
            ].filter(item => item.id === "__more" || !isDip || DIPENDENTE_VIEWS.has(item.id));
            return (
              <nav style={{position:"fixed",bottom:0,left:0,right:0,zIndex:Z.bottomNav,
                background:"rgba(255,255,255,0.94)",
                backdropFilter:"saturate(180%) blur(14px)",
                WebkitBackdropFilter:"saturate(180%) blur(14px)",
                borderTop:`1px solid ${C.borderSoft}`,
                paddingBottom:"env(safe-area-inset-bottom, 0px)",
                display:"flex",alignItems:"stretch",justifyContent:"space-around",
                boxShadow:"0 -1px 0 rgba(15,23,42,0.04), 0 -4px 16px rgba(15,23,42,0.04)"}}>
                {BOTTOM_NAV.map(item=>{
                  const isMore = item.id==="__more";
                  const active = !isMore && view===item.id;
                  return (
                    <button key={item.id}
                      onClick={()=>{ if (isMore) setSidebarOpen(true); else setView(item.id); }}
                      style={{flex:1,border:"none",background:"transparent",cursor:"pointer",
                        padding:"9px 4px 10px",display:"flex",flexDirection:"column",
                        alignItems:"center",justifyContent:"center",gap:3,position:"relative",
                        color:active?T.brand:T.textMid,
                        transition:`color ${M.durFast} ${M.ease}`}}>
                      {active && <span style={{position:"absolute",top:0,left:"30%",right:"30%",height:2,background:T.brand,borderRadius:"0 0 2px 2px"}}/>}
                      <span style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        {ic(ICONS[item.icon], 21)}
                        {item.badge>0 && (
                          <span style={{position:"absolute",top:-4,right:-8,minWidth:16,height:16,
                            background:T.brand,color:"#fff",borderRadius:8,fontSize:9,fontWeight:700,
                            padding:"0 4px",display:"flex",alignItems:"center",justifyContent:"center",
                            border:"1.5px solid #fff",lineHeight:1}}>
                            {item.badge>99?"99+":item.badge}
                          </span>
                        )}
                        {(!item.badge||item.badge<=0)&&item.alert && (
                          <span style={{position:"absolute",top:-2,right:-4,width:7,height:7,
                            borderRadius:"50%",background:T.brand,border:"1.5px solid #fff"}}/>
                        )}
                      </span>
                      <span style={{fontSize:10,fontWeight:active?600:500,letterSpacing:"-0.005em",lineHeight:1}}>
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </nav>
            );
          })()}

          </>
        );
      })()}

      {/* Notifications panel */}
      {showNotifiche&&<NotifichePanel notifiche={notifiche} nonLette={nonLette} onSegnaLetta={segnaLetta} onSegnaTutte={segnaTutte} onClose={()=>setShowNotifiche(false)}/>}

      {/* Novità modal */}
      <BackgroundToast />
      {showNovita&&<NovitaModal onClose={()=>{setShowNovita(false);localStorage.setItem('foodios-changelog-vista',CHANGELOG[0]?.versione||'');}} onVediTutte={()=>{setShowNovita(false);localStorage.setItem('foodios-changelog-vista',CHANGELOG[0]?.versione||'');setView('changelog');}}/>}

      {/* CONTENT */}
      <div style={{marginLeft:isMobile?0:L.sidebarWidth,flex:1,padding:0,overflowX:"auto",minHeight:"100vh",boxSizing:"border-box",display:"flex",flexDirection:"column"}}>
        {/* Desktop topbar */}
        {!isMobile&&(()=>{
          const VIEW_LABELS = {
            home:"Dashboard", giornaliero:"Produzione", chiusura:"Cassa", eventi:"Eventi",
            ricettario:"Ricettario", semilavorati:"Semilavorati", "nuova-ricetta":"Nuova ricetta",
            simulatore:"Food Cost", pl:"P&L",
            magazzino:"Magazzino", scadenzario:"Scadenzario", fornitori:"Fornitori",
            personale:"Personale", haccp:"HACCP", menu:"Menù",
            azioni:"AI Assistant", integrazioni:"Integrazioni", storico:"Storico",
            calendario:"Calendario", previsione:"Previsioni",
            "scheda-allergeni":"Scheda allergeni", impostazioni:"Impostazioni",
            "confronto-sedi":"Confronto sedi", trasferimenti:"Trasferimenti", changelog:"Novità",
            "importa-dati":"Importa dati",
          };
          const VIEW_GROUPS = {
            home:"", giornaliero:"Oggi", chiusura:"Oggi", eventi:"Oggi", calendario:"Oggi",
            ricettario:"Ricette & Menù", semilavorati:"Ricette & Menù", "nuova-ricetta":"Ricette & Menù",
            "scheda-allergeni":"Ricette & Menù", menu:"Ricette & Menù",
            simulatore:"Numeri", pl:"Numeri", storico:"Numeri", previsione:"Numeri",
            magazzino:"Magazzino & Acquisti", scadenzario:"Magazzino & Acquisti",
            fornitori:"Magazzino & Acquisti", "importa-dati":"Magazzino & Acquisti",
            personale:"Azienda", haccp:"Azienda", "confronto-sedi":"Azienda", trasferimenti:"Azienda",
            azioni:"Strumenti", integrazioni:"Strumenti",
            impostazioni:"", changelog:"",
          };
          const label = VIEW_LABELS[view] || (typeof view==="string"?view:"");
          const group = VIEW_GROUPS[view] || "";
          const sedeCorrente = (sedi||[]).find(s => s.id === sedeAttiva);
          const initial = (auth?.user?.email||"?").slice(0,1).toUpperCase();
          return (
            <div style={{position:"sticky",top:0,zIndex:Z.topbar,
              background:"rgba(247,248,250,0.88)",
              backdropFilter:"saturate(180%) blur(18px)",WebkitBackdropFilter:"saturate(180%) blur(18px)",
              borderBottom:`1px solid ${C.borderSoft}`,
              padding:"16px 32px",display:"flex",alignItems:"center",gap:16}}>
              {/* Sezione attiva: indicatore visivo brand a sinistra */}
              <div style={{width:4,height:34,borderRadius:3,
                background:"linear-gradient(180deg, #6E0E1A 0%, #E84B3A 100%)",
                boxShadow:"0 2px 8px rgba(110,14,26,0.28)",flexShrink:0}}/>
              {/* Titolo + breadcrumb */}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:10.5,color:T.textSoft,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <span style={{maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:T.textMid}}>{nomeAttivita||"FoodOS"}</span>
                  {group&&<>
                    <span style={{color:T.borderStr,fontSize:11}}>›</span>
                    <span style={{color:T.textSoft,letterSpacing:"0.05em"}}>{group}</span>
                  </>}
                </div>
                <div style={{fontSize:22,fontWeight:700,color:T.text,letterSpacing:"-0.025em",lineHeight:1.15,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</div>
              </div>
              {sedeCorrente&&(
                <div style={{display:"flex",alignItems:"center",gap:9,padding:"8px 14px",
                  background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:R.lg,boxShadow:S.sm}}>
                  <span style={{width:7,height:7,borderRadius:"50%",background:T.green,boxShadow:"0 0 0 3px rgba(14,159,110,0.16)",flexShrink:0}}/>
                  <div style={{display:"flex",flexDirection:"column",lineHeight:1.15}}>
                    <span style={{fontSize:9.5,color:T.textSoft,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase"}}>Sede</span>
                    <span style={{fontSize:12.5,color:T.text,fontWeight:600,maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",letterSpacing:"-0.005em"}}>{sedeCorrente.nome||"—"}</span>
                  </div>
                </div>
              )}
              <button onClick={()=>setShowNotifiche(o=>!o)} aria-label="Notifiche"
                style={{position:"relative",width:40,height:40,border:`1px solid ${T.border}`,
                  background:T.bgCard,borderRadius:R.lg,cursor:"pointer",display:"flex",alignItems:"center",
                  justifyContent:"center",color:T.textMid,boxShadow:S.sm,
                  transition:`background ${M.durFast} ${M.ease}, border-color ${M.durFast} ${M.ease}, color ${M.durFast} ${M.ease}`}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=T.borderStr;e.currentTarget.style.color=T.text;e.currentTarget.style.background=T.bgSubtle;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.textMid;e.currentTarget.style.background=T.bgCard;}}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
                </svg>
                {nonLette>0&&<span style={{position:"absolute",top:-4,right:-4,background:T.brand,color:"#fff",borderRadius:"50%",minWidth:18,height:18,fontSize:9,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 4px",border:"2px solid #FFF",lineHeight:1}}>{nonLette>99?"99+":nonLette}</span>}
              </button>
              <div title={auth?.user?.email||""}
                style={{width:40,height:40,borderRadius:"50%",
                  background:T.brandGradient,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  color:"#fff",fontSize:14,fontWeight:700,letterSpacing:0,
                  boxShadow:S.brandSoft,cursor:"default",userSelect:"none",
                  border:"2px solid rgba(255,255,255,0.92)"}}>
                {initial}
              </div>
            </div>
          );
        })()}
        {/* Mobile topbar — sticky, flat */}
        {isMobile&&(()=>{
          const MOBILE_LABELS = {
            home:"Oggi", giornaliero:"Produzione", chiusura:"Cassa", eventi:"Eventi",
            ricettario:"Ricettario", semilavorati:"Semilavorati", "nuova-ricetta":"Nuova ricetta",
            simulatore:"Food Cost", pl:"P&L",
            magazzino:"Magazzino", scadenzario:"Scadenzario", fornitori:"Fornitori",
            personale:"Personale", haccp:"HACCP", menu:"Menù",
            azioni:"AI Assistant", integrazioni:"Integrazioni", storico:"Storico",
            calendario:"Calendario", previsione:"Previsioni",
            "scheda-allergeni":"Allergeni", impostazioni:"Impostazioni",
            "confronto-sedi":"Confronto sedi", trasferimenti:"Trasferimenti", changelog:"Novità",
            "importa-dati":"Importa dati",
          };
          const titolo = MOBILE_LABELS[view] || nomeAttivita || "FoodOS";
          return (
            <div style={{position:"sticky",top:0,zIndex:Z.topbar,
              background:"rgba(247,248,250,0.86)",
              backdropFilter:"saturate(180%) blur(16px)",WebkitBackdropFilter:"saturate(180%) blur(16px)",
              borderBottom:`1px solid ${T.borderSoft}`,
              padding:"10px 14px",display:"flex",alignItems:"center",gap:8}}>
              <button onClick={()=>setSidebarOpen(o=>!o)} aria-label="Menu"
                style={{width:40,height:40,border:"none",background:"transparent",cursor:"pointer",
                  borderRadius:R.md,color:T.text,display:"flex",alignItems:"center",justifyContent:"center",
                  transition:`background ${M.durFast} ${M.ease}`,flexShrink:0}}
                onTouchStart={e=>{e.currentTarget.style.background=T.bgSubtle;}}
                onTouchEnd={e=>{e.currentTarget.style.background="transparent";}}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                  dangerouslySetInnerHTML={{__html:'<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>'}} />
              </button>
              <div style={{flex:1,minWidth:0,textAlign:"center"}}>
                <div style={{fontSize:15,fontWeight:600,color:T.text,letterSpacing:"-0.01em",
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",lineHeight:1.2}}>{titolo}</div>
                {nomeAttivita && view!=="home" && (
                  <div style={{fontSize:10,color:T.textSoft,fontWeight:500,marginTop:1,
                    overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",letterSpacing:"-0.005em"}}>
                    {nomeAttivita}
                  </div>
                )}
              </div>
              <button onClick={()=>setShowNotifiche(o=>!o)} aria-label="Notifiche"
                style={{position:"relative",width:40,height:40,border:"none",background:"transparent",
                  cursor:"pointer",borderRadius:R.md,color:T.textMid,display:"flex",alignItems:"center",
                  justifyContent:"center",transition:`background ${M.durFast} ${M.ease}`,flexShrink:0}}
                onTouchStart={e=>{e.currentTarget.style.background=T.bgSubtle;}}
                onTouchEnd={e=>{e.currentTarget.style.background="transparent";}}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 01-3.46 0"/>
                </svg>
                {nonLette>0&&<span style={{position:"absolute",top:6,right:6,background:T.brand,color:"#fff",
                  borderRadius:"50%",minWidth:16,height:16,fontSize:9,fontWeight:700,
                  display:"flex",alignItems:"center",justifyContent:"center",padding:"0 4px",
                  border:"1.5px solid rgba(247,248,250,1)",lineHeight:1}}>{nonLette>9?"9+":nonLette}</span>}
              </button>
            </div>
          );
        })()}

        {/* Inner content padding */}
        <div className="fos-page" key={view} style={{padding:isMobile?"16px 16px 88px":"28px 32px",flex:1,maxWidth:L.contentMaxWidth,width:"100%",margin:"0 auto",boxSizing:"border-box"}}>

        {/* Banner offline */}
        {!isOnline&&(
          <div style={{marginBottom:16,padding:"11px 16px",background:T.brand,color:"#FFF",
            borderRadius:R.lg,fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:10,
            boxShadow:S.brandSoft}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:"#FFF",animation:"_sp_pulse 1.6s ease-in-out infinite",boxShadow:"0 0 0 0 rgba(255,255,255,0.7)"}}/>
            Connessione assente — i dati potrebbero non essere aggiornati
          </div>
        )}
        {offlineMode&&isOnline&&offlineCacheDate&&(
          <div style={{marginBottom:16,padding:"11px 16px",background:T.amberLight,
            border:`1px solid #FDE68A`,color:"#92400E",borderRadius:R.lg,fontSize:13,fontWeight:500,
            display:"flex",alignItems:"center",gap:10}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Dati offline — ultimo aggiornamento {offlineCacheDate}
          </div>
        )}

        {/* Banner contestuale: indica con quale sede stiamo operando nelle viste per-sede */}
        {sedi && sedi.length > 1 && ['magazzino','giornaliero','chiusura','scadenzario','calendario','storico'].includes(view) && (
          <SedeContextBanner
            sedeAttiva={sedeAttiva}
            sedi={sedi}
            hint={
              view === 'magazzino'   ? 'Stock e movimenti di questa sede' :
              view === 'giornaliero' ? 'Produzione registrata a questa sede' :
              view === 'chiusura'    ? 'Cassa di questa sede' :
              view === 'scadenzario' ? 'Fatture intestate a questa sede' :
              null
            }
          />
        )}

        {/* Home dashboard */}
        {view==="home"&&<DashboardHomeView ricettario={ricettario} magazzino={magazzino} giornaliero={giornaliero} chiusure={chiusure} actions={actions} setView={setView} orgId={orgId} sedeId={sedeId} nomeAttivita={nomeAttivita} isTrialAttivo={isTrialAttivo} auth={auth} sedi={sedi} sedeAttiva={sedeAttiva}/>}

        {/* Formati di vendita (prodotti generici senza dettaglio gusto) */}
        {view==="formati-vendita"&&<FormatiVendita orgId={orgId} ricettario={ricettario} notify={notify}/>}

        {/* Registro attività — solo titolare (RLS + DIPENDENTE_VIEWS gate). */}
        {view==="registro-attivita"&&<RegistroAttivita orgId={orgId} sedi={sedi} notify={notify}/>}

        {/* Sprechi e omaggi — titolare e dipendente, per-sede */}
        {view==="sprechi-omaggi"&&<SpreciOmaggi orgId={orgId} sedeId={sedeId} sedeAttiva={sedeAttiva} ricettario={ricettario} auth={auth} notify={notify}/>}

        {/* Ricettario — mostra upload se non ancora caricato */}
        {view==="ricettario"&&!ricettario&&(
          <div style={{maxWidth:500,margin:"80px auto",textAlign:"center"}}>
            <div style={{fontSize:52,marginBottom:18}}>📖</div>
            <h2 style={{margin:"0 0 10px",fontSize:24,fontWeight:900,color:C.text}}>Carica il ricettario</h2>
            <p style={{color:C.textSoft,marginBottom:32,fontSize:13,lineHeight:1.75}}>Importa il tuo file Excel con le ricette per vedere subito food cost, margini e ricavi per ogni prodotto.</p>
            <label style={{display:"inline-block",padding:"14px 32px",background:C.red,color:C.white,borderRadius:10,cursor:"pointer",fontWeight:800,fontSize:13,boxShadow:"0 4px 16px rgba(110,14,26,0.3)"}}>
              📂 Carica .xlsx ricettario
              <input type="file" accept=".xlsx" multiple style={{display:"none"}} onChange={e=>e.target.files.length&&handleFile(Array.from(e.target.files))}/>
            </label>
          </div>
        )}
        {ricettario&&view==="ricettario"&&<RicettarioView ricettario={ricettario} onUpdateRegola={handleUpdateRegola} onUpload={files=>handleFile(files)} onEditRicetta={(nome)=>{setEditingRicetta(nome);setView("nuova-ricetta");}}/>}
        {ricettario&&view==="semilavorati"&&<SemilavoratiView ricettario={ricettario} onSave={handleSalvaRicetta} notify={notify}/>}
        {ricettario&&view==="pl"&&<PLView ricettario={ricettario} onUpdateRegola={handleUpdateRegola}/>}
        {ricettario&&view==="simulatore"&&<SimulatorePrezziView ricettario={ricettario} giornaliero={giornaliero} tipoAttivita={tipoAttivita} sedi={sedi}/>}
        {view==="nuova-ricetta"&&<NuovaRicettaView ricettario={ricettario} notify={notify} onSave={handleSalvaRicetta} editingRicetta={editingRicetta} onEditConsumed={()=>setEditingRicetta(null)}/>}
        {view==="scheda-allergeni"&&<SchedaAllergeniView ricettario={ricettario}/>}
        {view==="fornitori"&&<Fornitori orgId={orgId} sedeId={sedeId} sedi={sedi} notify={notify}/>}
        {view==="personale"&&<Personale orgId={orgId} sedeId={sedeId} sedi={sedi} notify={notify}/>}
        {view==="haccp"&&<HaccpView orgId={orgId} sedeId={sedeId} ricettario={ricettario} nomeAttivita={nomeAttivita} notify={notify}/>}
        {view==="menu"&&<MenuDinamico ricettario={ricettario} ingCosti={ingCostiMain} calcolaFC={calcolaFC} getR={getR} nomeAttivita={nomeAttivita}/>}
        {view==="previsione"&&<PrevisioneDomanda ricettario={ricettario} giornaliero={giornaliero} ingCosti={ingCostiMain} calcolaFC={calcolaFC} getR={getR}/>}
        {view==="chiusura"&&<ChiusuraView ricettario={ricettario} giornaliero={giornaliero} chiusure={chiusure} setChiusure={setChiusure} notify={notify} orgId={orgId} sedeId={sedeId} isDipendente={isDip}/>}
        {view==="storico"&&<StoricoProduzioneView ricettario={ricettario} giornaliero={giornaliero} chiusure={chiusure} logPrezzi={logPrezzi}/>}
        {view==="discrepanze"&&<DiscrepanzeView orgId={orgId} sedeId={sedeId} ricettario={ricettario} notify={notify}/>}
        {view==="magazzino"&&<MagazzinoView ricettario={ricettario} magazzino={magazzino} setMagazzino={setMagazzino} logRif={logRif} setLogRif={setLogRif} logPrezzi={logPrezzi} onUpdatePrezzoIng={handleUpdatePrezzoIng} giornaliero={giornaliero} notify={notify} esclusi={esclusi} setEsclusi={setEsclusi} onImportPrezzi={handleImportPrezzi} onImportPrezziOCR={handleImportPrezziOCR} orgId={orgId} sedeId={sedeId}/>}
        {view==="giornaliero"&&<ProduzioneGiornalieraView ricettario={ricettario} magazzino={magazzino} setMagazzino={setMagazzino} giornaliero={giornaliero} setGiornaliero={setGiornaliero} notify={notify} sedi={sedi} sedeAttiva={sedeAttiva} orgId={orgId} sedeId={sedeId} isDipendente={isDip}/>}
        {view==="azioni"&&<AzioniView actions={actions} onUpdate={handleUpdAct} onDelete={handleDelAct} ricettario={ricettario} giornaliero={giornaliero} chiusure={chiusure} magazzino={magazzino}/>}
        {view==="impostazioni"&&<Impostazioni auth={auth} nomeAttivita={nomeAttivita} tipoAttivita={tipoAttivita} piano={piano} orgId={orgId} sedi={sedi} onImportPrezzi={handleImportPrezzi} notify={notify} onChangelogOpen={()=>setView("changelog")}/>}
        {view==="importa-dati"&&<ImportaDatiView
          onImportRicettario={handleFile}
          onImportPrezzi={handleImportPrezzi}
          onImportDelivery={handleImportDeliveryGlobal}
          onImportCasse={handleImportCasseGlobal}
          onImportFatture={handleImportFattureGlobal}
          notify={notify}/>}
        {view==="confronto-sedi"&&<ConfrontoSedi orgId={orgId} sedi={sedi}/>}
        {view==="eventi"&&<EventiView orgId={orgId} sedeId={sedeId} ricettario={ricettario} notify={notify} nomeAttivita={nomeAttivita}/>}
        {view==="trasferimenti"&&<TrasferimentiView orgId={orgId} sedi={sedi} sedeAttiva={sedeAttiva} notify={notify}/>}
        {view==="integrazioni"&&<Integrazioni orgId={orgId} notify={notify}/>}
        {view==="scadenzario"&&<Scadenzario orgId={orgId} sedeId={sedeId} sedi={sedi}/>}
        {view==="changelog"&&<ChangelogView/>}
        {view==="calendario"&&<CalendarioOperativo giornaliero={giornaliero} chiusure={chiusure} orgId={orgId} sedeId={sedeId} setView={setView} notify={notify} isMobile={isMobile}/>}
        {currentMese&&!["home","ricettario","semilavorati","pl","simulatore","azioni","magazzino","giornaliero","nuova-ricetta","storico","chiusura","impostazioni","confronto-sedi","trasferimenti","integrazioni","scadenzario","calendario","changelog","scheda-allergeni","fornitori","personale","menu","previsione","eventi","importa-dati"].includes(view)&&(
          <ProduzioneView key={view} ricettario={ricettario} mese={currentMese} onSave={e=>handleSave(view,e)} onAddAction={handleAddAct}/>
        )}
        </div>{/* /fos-page */}
      </div>

      {/* AI Assistant — floating button su tutte le pagine */}
      <AIAssistant />
    </div>
    </ErrorBoundary>
  );
}


// Rendering handled by src/main.jsx via App.jsx
