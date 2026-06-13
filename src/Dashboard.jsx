import React from 'react'
import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import * as Sentry from '@sentry/react'
import { lazyWithReload } from './lib/lazyWithReload'
import UpgradeGate from './components/UpgradeGate'
import AISuggestionsBell from './components/AISuggestionsBell'
import ChainBadge from './components/ChainBadge'
import UpgradeModal from './components/UpgradeModal'
import CommandPalette from './components/CommandPalette'
import { canAccessView, effectivePlan, PLAN_LABEL, VIEW_MIN_PLAN, viewDisplayLabel } from './lib/planAccess'
import { lessico } from './lib/lessico'
import { caricaSessioniDaInventario } from './lib/inventarioProduzione'
// jsPDF caricato dinamicamente solo all'export (chunk 'pdf' separato).
// recharts NON e' importato qui: 0 simboli sono usati in Dashboard.jsx (era dead
// import che trascinava il chunk recharts 120KB gzip sul critical path). I veri
// consumatori — PLView, StoricoProduzioneView, PrevisioneDomanda, AdminPage —
// sono tutti gia' lazy.
import { sload as _sload, ssave as _ssave, isSharedKey, sloadAllSedi } from './lib/storage'
import { supabase } from './lib/supabase'
import { caricoProduzionePF, scaricoVenditaPF } from './lib/stockPF'
import { creaTrasferimento } from './lib/trasferimenti'
import SedeSelector from './components/SedeSelector'
import SedeContextBanner from './components/SedeContextBanner'
import Icon from './components/Icon'
const Scadenzario = lazyWithReload(() => import('./components/Scadenzario'))
const CalendarioOperativo = lazyWithReload(() => import('./components/CalendarioOperativo'))
const ReferralPanel = lazyWithReload(() => import('./components/ReferralPanel'))
import Logo from './components/Logo'
const Integrazioni = lazyWithReload(() => import('./components/Integrazioni'))
import { parseDeliveroo, parseJustEat, parseGlovo, parseGenericCSV, applyGenericMapping, mergeInChiusure } from './lib/importDelivery'
import { parseFile as parseCassaFile, mergeInChiusureCassa } from './lib/importCassa'
import useIsMobile from './lib/useIsMobile'
import { useOnlineStatus } from './lib/useOnlineStatus'
import { useNotifiche } from './lib/useNotifiche'
import { color as T, radius as R, shadow as S, motion as M, layout as L, z as Z, keyframes as KF, typo, tnum as TNUM } from './lib/theme'
const ImpostazioniSedi = lazyWithReload(() => import('./components/ImpostazioniSedi'))
const ImpostazioniTv = lazyWithReload(() => import('./components/ImpostazioniTv'))
const ExportContabilita = lazyWithReload(() => import('./components/ExportContabilita'))
import { WL_KEY } from './components/WhiteLabel';
const WhiteLabel = lazyWithReload(() => import('./components/WhiteLabel'))
import { BenchmarkBadge } from './components/BenchmarkOptin';
const BenchmarkOptin = lazyWithReload(() => import('./components/BenchmarkOptin'))
import MfaSection from './components/Mfa'
const EventiView = lazyWithReload(() => import('./components/Eventi'))
const ConfrontoSedi = lazyWithReload(() => import('./components/ConfrontoSedi'))
const TrasferimentiView = lazyWithReload(() => import('./components/TrasferimentiView'))
const EsportaDati = lazyWithReload(() => import('./components/EsportaDati'))
import { exportRicettaPDF, exportProduzione } from './lib/exportPDF'
import { todayLocal } from './lib/dateLocal'
import { ICONS as SHARED_ICONS, ic as sharedIc } from './lib/icons'
import { setExportCtx, getExportCtx, gateExport } from './lib/exportGuard'
import { CHANGELOG } from './lib/changelog'
import { NovitaModal } from './components/Changelog';
const ChangelogView = lazyWithReload(() => import('./components/Changelog'))
const NotifichePanel = lazyWithReload(() => import('./components/NotifichePanel'))
const BackgroundToast = lazyWithReload(() => import('./components/BackgroundToast'))
import { backgroundManager } from './lib/backgroundManager'
import { uploadManager } from './lib/backgroundManager'
import { costoNettoPerG, loadRese, getStoreRese, setResaIngrediente, getAllRese } from './lib/rese'
const Fornitori = lazyWithReload(() => import('./components/Fornitori'))
const VenditeB2BView = lazyWithReload(() => import('./views/VenditeB2BView'))
const Personale = lazyWithReload(() => import('./components/Personale'))
const MenuDinamico = lazyWithReload(() => import('./components/MenuDinamico'))
const PrevisioneDomanda = lazyWithReload(() => import('./components/PrevisioneDomanda'))
const AIFotoAnalisi = lazyWithReload(() => import('./components/AIFotoAnalisi'))
const AIAssistant = lazyWithReload(() => import('./components/AIAssistant'))
const ImportaDatiView = lazyWithReload(() => import('./components/ImportaDati'))
import AbbonamentoPanel from './components/AbbonamentoPanel'
const HaccpView = lazyWithReload(() => import('./components/Haccp'))
const FormatiVendita = lazyWithReload(() => import('./components/FormatiVendita'))
const RegistroAttivita = lazyWithReload(() => import('./components/RegistroAttivita'))
const SpreciOmaggi = lazyWithReload(() => import('./components/SpreciOmaggi'))
const WhatsAppReportPanel = lazyWithReload(() => import('./components/WhatsAppReportPanel'))
const Impostazioni = lazyWithReload(() => import('./components/Impostazioni'))
import {
  PREZZI_HORECA, SING_PLUR, normIng,
  EN_IT_PRODOTTI, EN_IT_INGREDIENTI, translateProdottoEN, translateIngredienteEN,
  NOMI_SKIP, isRicettaValida, REGOLE, getR, isSemilavorato, resetRegoleRuntime,
  buildIngCosti, calcolaFC,
} from './lib/foodcost'
import { SK_RIC, SK_PROD, SK_ACT, SK_AI, SK_MAG, SK_GIOR, SK_CHIUS, SK_EXCL, SK_RESE, SK_LOG_PRZ } from './lib/storageKeys'
import { loadXLSX } from './lib/xlsx'
const SimulatorePrezziView = lazyWithReload(() => import('./views/SimulatorePrezziView'))
const PLView = lazyWithReload(() => import('./views/PLView'))
const RicettarioView = lazyWithReload(() => import('./views/RicettarioView'))
const SchedaAllergeniView = lazyWithReload(() => import('./views/SchedaAllergeniView'))
const DashboardHomeView = lazyWithReload(() => import('./views/DashboardHomeView'))
const RecensioniView = lazyWithReload(() => import('./views/RecensioniView'))
const MenuEngineeringView = lazyWithReload(() => import('./views/MenuEngineeringView'))
const CashflowView = lazyWithReload(() => import('./views/CashflowView'))
const ForecastView = lazyWithReload(() => import('./views/ForecastView'))
const ReformulationView = lazyWithReload(() => import('./views/ReformulationView'))
const OrdiniAiView = lazyWithReload(() => import('./views/OrdiniAiView'))
const CompetitorPricingView = lazyWithReload(() => import('./views/CompetitorPricingView'))
const BrainView = lazyWithReload(() => import('./views/BrainView'))
const RecipeInventorView = lazyWithReload(() => import('./views/RecipeInventorView'))
const MarketplaceView = lazyWithReload(() => import('./views/MarketplaceView'))
const WhatsAppView = lazyWithReload(() => import('./views/WhatsAppView'))
const DocumentaryView = lazyWithReload(() => import('./views/DocumentaryView'))
const AiHubView = lazyWithReload(() => import('./views/AiHubView'))
const FotoOCR = lazyWithReload(() => import('./components/FotoOCR'))
import { compressImage } from './lib/imageUtils'
import { trackViewOpen } from './lib/usageTracking'
const MagazzinoView = lazyWithReload(() => import('./views/MagazzinoView'))
const ChiusuraView = lazyWithReload(() => import('./views/ChiusuraView'))
const ProduzioneGiornalieraView = lazyWithReload(() => import('./views/ProduzioneGiornalieraView'))
const InventarioSettimanaleView = lazyWithReload(() => import('./views/InventarioSettimanaleView'))
const QuadraturaInventarioView = lazyWithReload(() => import('./views/QuadraturaInventarioView'))
const CostiAziendaliView = lazyWithReload(() => import('./views/CostiAziendaliView'))
const AzioniView = lazyWithReload(() => import('./views/AzioniView'))
const NuovaRicettaView = lazyWithReload(() => import('./views/NuovaRicettaView'))
const StoricoProduzioneView = lazyWithReload(() => import('./views/StoricoProduzioneView'))
// DiscrepanzeView rimosso: unito nella pagina "Perdite & cessioni" (SpreciOmaggi).
const SemilavoratiView = lazyWithReload(() => import('./views/SemilavoratiView'))
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

// ── Vista azienda ("Tutte le sedi"): merge dei dati per-sede ──────────────────
// Array (giornaliero/chiusure/logrif) → concatenati; magazzino → giacenze sommate.
function _mergeArr(map) { return Object.values(map || {}).filter(Array.isArray).flat(); }
function _mergeMag(map) {
  const out = {};
  for (const m of Object.values(map || {})) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
    for (const [k, v] of Object.entries(m)) {
      if (!v || typeof v !== 'object') continue;
      if (!out[k]) out[k] = { ...v };
      else out[k] = { ...out[k], giacenza_g: (out[k].giacenza_g || 0) + (v.giacenza_g || 0), soglia_g: Math.max(out[k].soglia_g || 0, v.soglia_g || 0) };
    }
  }
  return out;
}

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
const fmt  = v => `€ ${Number(v).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
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

function KPI({label,value,sub,color,highlight,icon,iconName}) {
  return (
    <div style={{background:highlight?"linear-gradient(135deg, #6E0E1A 0%, #4A0612 100%)":T.bgCard,
      border:`1px solid ${highlight?"#4A0612":T.border}`,borderRadius:14,
      padding:"20px 22px",
      boxShadow:highlight?"0 12px 28px rgba(110,14,26,0.34), inset 0 1px 0 rgba(255,255,255,0.18)":"0 1px 2px rgba(15,23,42,0.05), 0 4px 12px rgba(15,23,42,0.04)"}}>
      <div style={{fontSize:11,fontWeight:600,letterSpacing:"0.08em",textTransform:"uppercase",
        color:highlight?"rgba(255,255,255,0.76)":T.textSoft,marginBottom:10}}>
        {iconName?<span style={{marginRight:6,display:"inline-flex",verticalAlign:"-2px"}}><Icon name={iconName} size={13}/></span>:icon&&<span style={{marginRight:6}}>{icon}</span>}{label}
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
          {mese.meteo&&<div style={{fontSize:11,color:C.textSoft,marginTop:4}}>{mese.meteo.giorniSole}gg sole · {mese.meteo.giorniPioggia}gg pioggia · {mese.meteo.tempMean}°C media</div>}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {dirty&&<span style={{fontSize:10,color:C.amber,fontWeight:600}}>● Non salvato</span>}
          <button onClick={save} style={{padding:"8px 20px",background:C.red,color:C.white,border:"none",borderRadius:8,fontWeight:700,fontSize:11,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6}}><Icon name="save" size={13}/> Salva</button>
        </div>
      </div>

      <div style={{display:"flex",gap:4,marginBottom:24,borderBottom:`2px solid ${C.border}`}}>
        {[["dashboard","barChart","Dashboard"],["inserimento","edit","Inserimento dati"],["ai","robot","Analisi AI"]].map(([id,icn,lbl])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{padding:"8px 18px",border:"none",background:"transparent",cursor:"pointer",fontSize:11,fontWeight:700,color:tab===id?C.red:C.textSoft,borderBottom:tab===id?`2px solid ${C.red}`:"2px solid transparent",marginBottom:-2,transition:"all 0.12s",display:"inline-flex",alignItems:"center",gap:6}}>
            <Icon name={icn} size={13}/> {lbl}
          </button>
        ))}
      </div>

      {tab==="dashboard"&&(
        !hasData ? (
          <div style={{textAlign:"center",padding:"70px 20px",color:C.textSoft}}>
            <div style={{marginBottom:14,display:"flex",justifyContent:"center"}}><Icon name="clipboard" size={36}/></div>
            <div style={{fontSize:15,fontWeight:700,color:C.text,marginBottom:8}}>Nessun dato per {mese.label}</div>
            <div style={{fontSize:12,marginBottom:20}}>Inserisci gli stampi prodotti e venduti per vedere i risultati.</div>
            <button onClick={()=>setTab("inserimento")} style={{padding:"10px 24px",background:C.red,color:C.white,border:"none",borderRadius:8,fontWeight:700,fontSize:12,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6}}><Icon name="edit" size={13}/> Inserisci dati</button>
          </div>
        ) : (
          <>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":"repeat(5,1fr)",gap:10,marginBottom:28}}>
              <KPI iconName="money" label="Ricavi" value={fmt(totR)} highlight/>
              <KPI iconName="receipt" label="Food cost" value={fmt(totFC)} color={C.red}/>
              <KPI iconName="trendUp" label="Margine" value={fmt(totM)} color={margColor(totMP)}/>
              <KPI icon="%" label="Margine %" value={fmtp(totMP)} color={margColor(totMP)}/>
              <KPI iconName="target" label="Sell-through" value={fmtp(st)} sub={`${totV}/${totP} stampi`} color={st>=80?C.green:st>=60?C.amber:C.red}/>
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
            <button onClick={save} style={{padding:"10px 28px",background:C.red,color:C.white,border:"none",borderRadius:9,fontWeight:800,fontSize:12,cursor:"pointer",letterSpacing:"0.02em",display:"inline-flex",alignItems:"center",gap:6}}><Icon name="save" size={13}/> Salva dati {mese.label}</button>
          </div>
        </div>
      )}

      {tab==="ai"&&(
        <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,padding:"24px",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20}}>
            <div>
              <div style={{fontSize:13,fontWeight:800,color:C.text,marginBottom:4,display:"flex",alignItems:"center",gap:6}}><Icon name="robot" size={14}/> Consulenza AI — {mese.label}</div>
              <div style={{fontSize:11,color:C.textSoft}}>Analisi automatica basata sui tuoi dati. Aggiornata ad ogni richiesta.</div>
            </div>
            {hasData&&<button onClick={runAI} disabled={aiLoad} style={{padding:"9px 20px",background:aiLoad?"#EEE":C.red,color:aiLoad?C.textSoft:C.white,border:"none",borderRadius:8,fontWeight:700,fontSize:11,cursor:aiLoad?"default":"pointer",display:"inline-flex",alignItems:"center",gap:6}}>{aiLoad?<><Icon name="hourglass" size={12}/> Elaboro…</>:"▶ Analizza ora"}</button>}
          </div>
          {!hasData&&<div style={{color:C.textSoft,fontSize:12}}>Inserisci prima i dati di produzione nella tab "Inserimento dati".</div>}
          {aiData&&(
            <div>
              <div style={{padding:"16px 18px",background:"#F8F4F2",borderRadius:10,marginBottom:16,fontSize:12,color:C.text,lineHeight:1.75}}>{aiData.sintesi}</div>
              {aiData.alert&&<div style={{padding:"10px 16px",background:C.amberLight,border:`1px solid ${C.amber}30`,borderRadius:8,fontSize:11,color:C.amber,fontWeight:600,marginBottom:16,display:"flex",alignItems:"center",gap:6}}><Icon name="warning" size={13}/> {aiData.alert}</div>}
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
      notify("Errore nel salvataggio impostazione email", false);
      return;
    }
    notify(val ? "✓ Riceverai i report mensili via email" : "✓ Email report mensili disattivata");
  };

  const handleSalvaNome = async () => {
    if (!nomeMod.trim()) return;
    if (!orgId) {
      notify("Errore: organizzazione non trovata. Ricarica la pagina.", false);
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
      notify("Errore nel salvataggio: " + (e.message || "Riprova"), false);
    } finally {
      setSaving(false);
    }
  };

  const card = { background:"#FFF", borderRadius:14, padding:"24px 28px", boxShadow:"0 1px 4px rgba(0,0,0,0.07)", marginBottom:20 };
  const label = { fontSize:11, fontWeight:700, color:C.textSoft, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:8, display:"block" };
  const input = { width:"100%", padding:"10px 14px", border:`1px solid ${C.border}`, borderRadius:9, fontSize:13, fontWeight:500, color:C.text, background:"#FAFAFA", outline:"none" };

  const TABS = [
    ["generale", "gear", "Generale"],
    ["abbonamento", "card", "Abbonamento"],
    ["whatsapp", "chat", "WhatsApp"],
    ["sicurezza", "lock", "Sicurezza"],
    ["rese", null, "Rese"],
    ["sedi", "store", "Sedi"],
    ["tv", "tv", "TV"],
    ["contabilita", "barChart", "Contabilità"],
    ["benchmark", "trendUp", "Benchmark"],
    ["personalizzazione", "palette", "Personalizzazione"],
    ["dati", "save", "Dati"],
  ];

  // Rese state
  const [reseState, setReseState] = useState(() => getAllRese());
  const [reseFiltro, setReseFiltro] = useState("");
  const saveRese = (nomeNorm, val) => {
    const v = Math.max(1, Math.min(100, parseFloat(val)||100)) / 100;
    setResaIngrediente(nomeNorm, v);
    const nuoveRese = getStoreRese();
    try { localStorage.setItem(SK_RESE, JSON.stringify(nuoveRese)); } catch {}
    setReseState(getAllRese());
    notify("✓ Resa aggiornata");
  };
  const resetRese = (nomeNorm) => {
    setResaIngrediente(nomeNorm, 1.0);
    const nuoveRese = getStoreRese();
    try { localStorage.setItem(SK_RESE, JSON.stringify(nuoveRese)); } catch {}
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
        {TABS.map(([id,icn,lbl]) => (
          <button key={id} onClick={()=>setTab(id)}
            style={{ padding:"10px 16px", border:"none", background:"transparent", cursor:"pointer",
              fontSize:13, fontWeight:tab===id?600:500, color:tab===id?T.text:T.textSoft,
              borderBottom:tab===id?`2px solid ${T.brand}`:"2px solid transparent",
              marginBottom:-1, letterSpacing:"-0.005em",
              display:"inline-flex", alignItems:"center", gap:6,
              transition:`color ${M.durFast} ${M.ease}` }}
            onMouseEnter={e=>{if(tab!==id)e.currentTarget.style.color=T.textMid;}}
            onMouseLeave={e=>{if(tab!==id)e.currentTarget.style.color=T.textSoft;}}>
            {icn&&<Icon name={icn} size={14}/>}{lbl}
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
            <div style={{ fontWeight:700, fontSize:15, color:C.text, marginBottom:8, display:"flex", alignItems:"center", gap:8 }}><Icon name="euro" size={16}/> Prezzi ingredienti</div>
            <div style={{ fontSize:12, color:C.textSoft, marginBottom:14, lineHeight:1.6 }}>
              Importa un file Excel (.xlsx) con i prezzi degli ingredienti. Il file deve avere una colonna con il nome dell'ingrediente e una con il prezzo per kg o per g.
            </div>
            <label style={{ display:"inline-flex", alignItems:"center", gap:8, padding:"10px 18px", background:"#FFFBEB", border:"1px dashed #FDE68A", borderRadius:9, cursor:"pointer", fontSize:12, fontWeight:600, color:"#92400E" }}>
              <Icon name="folder" size={14}/> Importa prezzi .xlsx / .xls / .csv
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
              <div style={{ fontWeight:700, fontSize:15, color:C.text, display:"flex", alignItems:"center", gap:8 }}><Icon name="barChart" size={16}/> Report mensili</div>
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
                      <span style={{ color:C.textSoft, display:"inline-flex" }}><Icon name="fileText" size={18}/></span>
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
            <div style={{ fontWeight:700, fontSize:15, color:C.text, marginBottom:8, display:"flex", alignItems:"center", gap:8 }}><Icon name="clipboard" size={16}/> Novità & Changelog</div>
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
            <div style={{ marginTop:16, fontSize:11, color:C.textSoft, lineHeight:1.7, display:"flex", alignItems:"flex-start", gap:6 }}>
              <Icon name="bulb" size={14} style={{ marginTop:2, flexShrink:0 }}/>
              <span>Le rese modificate vengono applicate immediatamente al food cost di tutte le ricette. I valori di default sono basati su standard di laboratorio.</span>
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
// Errore di caricamento di un chunk lazy: capita quando l'app è aperta da un
// deploy precedente e gli hash dei file sono cambiati (il vecchio chunk dà 404).
// Non è un bug di codice: si risolve ricaricando per prendere l'index aggiornato.
function isChunkLoadError(e) {
  const s = `${e?.name || ''} ${e?.message || ''}`.toLowerCase();
  return s.includes('dynamically imported module') || s.includes('failed to fetch')
    || s.includes('importing a module script failed') || s.includes('chunkloaderror')
    || s.includes('error loading') || s.includes('module script failed');
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(e) { return { err: e }; }
  componentDidCatch(e, info) {
    if (isChunkLoadError(e)) {
      // Ricarica una volta (guard anti-loop): nuova versione disponibile.
      try {
        const k = 'foodos_chunk_hardreload_ts';
        const last = Number(sessionStorage.getItem(k)) || 0;
        if (Date.now() - last > 20000) { sessionStorage.setItem(k, String(Date.now())); window.location.reload(); }
      } catch { window.location.reload(); }
      return;
    }
    // Errore reale: segnala a Sentry (questo boundary lo "ingoia", altrimenti
    // non verrebbe riportato dal boundary radice).
    try { Sentry.captureException(e, { extra: { componentStack: info?.componentStack } }); } catch { /* noop */ }
  }
  render() {
    const err = this.state.err;
    if (err && isChunkLoadError(err)) return (
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#F8FAFC",padding:24,fontFamily:"'Inter',system-ui,sans-serif"}}>
        <div style={{maxWidth:420,textAlign:"center",background:"#fff",border:"1px solid #E8E0DC",borderRadius:16,padding:"36px 28px",boxShadow:"0 4px 20px rgba(15,23,42,0.08)"}}>
          <div style={{marginBottom:12}}><Icon name="refresh" size={38} color="#6E0E1A" /></div>
          <h1 style={{margin:"0 0 10px",fontSize:19,fontWeight:800,color:"#1C0A0A"}}>È disponibile una nuova versione</h1>
          <p style={{margin:"0 0 22px",fontSize:14,color:"#6B4C44",lineHeight:1.6}}>Ricarico la pagina per aggiornare FoodOS all'ultima versione…</p>
          <button onClick={()=>window.location.reload()} style={{padding:"12px 26px",background:"#6E0E1A",color:"#fff",border:"none",borderRadius:10,fontWeight:800,fontSize:14,cursor:"pointer"}}>Ricarica ora</button>
        </div>
      </div>
    );
    // In PRODUZIONE: card pulita + ricarica (mai stack grezzo davanti a un cliente).
    // In DEV: stack completo per il debug.
    if (err && import.meta.env.PROD) return (
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#F8FAFC",padding:24,fontFamily:"'Inter',system-ui,sans-serif"}}>
        <div style={{maxWidth:420,textAlign:"center",background:"#fff",border:"1px solid #E8E0DC",borderRadius:16,padding:"36px 28px",boxShadow:"0 4px 20px rgba(15,23,42,0.08)"}}>
          <div style={{marginBottom:12,color:C.textSoft}}><Icon name="frown" size={38} /></div>
          <h1 style={{margin:"0 0 10px",fontSize:19,fontWeight:800,color:"#1C0A0A"}}>Qualcosa è andato storto</h1>
          <p style={{margin:"0 0 22px",fontSize:14,color:"#6B4C44",lineHeight:1.6}}>L'errore è stato segnalato automaticamente. Ricarica la pagina per continuare.</p>
          <button onClick={()=>window.location.reload()} style={{padding:"12px 26px",background:"#6E0E1A",color:"#fff",border:"none",borderRadius:10,fontWeight:800,fontSize:14,cursor:"pointer"}}>Ricarica</button>
        </div>
      </div>
    );
    if (err) return (
      <div style={{padding:40,fontFamily:"'JetBrains Mono', ui-monospace, monospace",color:"#6E0E1A",background:"#FFF5F5",minHeight:"100vh"}}>
        <h2><Icon name="warning" size={18} /> Errore runtime</h2>
        <pre style={{whiteSpace:"pre-wrap",fontSize:11}}>{err.toString()}</pre>
        <pre style={{whiteSpace:"pre-wrap",fontSize:10,color:"#666"}}>{err.stack}</pre>
      </div>
    );
    return this.props.children;
  }
}


// Viste operative consentite a un utente con ruolo 'dipendente'. Tutto ciò che
// espone ricette, food cost, marginalità, dati societari o impostazioni resta
// riservato al titolare. Vedi anche la RLS in 20260605_ruolo_dipendente.sql.
// Viste consentite al DIPENDENTE. Tutto il resto (P&L, food cost, storico,
// previsioni, personale, registro, confronto sedi, scadenzario, fornitori, B2B,
// menu, semilavorati, importa dati, nuova ricetta, eventi, ricettario, ecc.) è
// NASCOSTO — sia in UI (questo set) sia a livello DB (RLS, vedi migration
// 20260607_dipendente_no_lettura_sensibili.sql).
const DIPENDENTE_VIEWS = new Set([
  'giornaliero',     // Produzione — "caricare i prodotti" (solo oggi)
  'inventario-gusti',// Inventario differenziale per gelaterie/yogurt (alternativa a giornaliero)
  'chiusura',        // Cassa (solo oggi)
  'magazzino',       // Stock e rifornimenti
  'sprechi-omaggi',  // Operativo: sia titolare sia dipendente registrano
  'calendario',      // solo oggi/futuro
  'haccp',
  'changelog',
  'impostazioni',    // solo il proprio account (nome, cambio password, 2FA) — vista role-aware
]);

// Viste operative che SCRIVONO dati per-sede: in "Tutte le sedi" (vista aggregata)
// richiedono di scegliere prima una sede specifica.
const SEDE_RICHIESTA = new Set(['giornaliero','chiusura','magazzino','sprechi-omaggi','trasferimenti']);

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
  // "Tutte le sedi": vista aggregata azienda (sola lettura). Le viste operative
  // che scrivono dati per-sede richiedono una sede specifica.
  const isAllSedi = !!sedeAttiva?._all;

  // Lessico per categoria (gelateria→gusti, pizzeria→pizze, …); fallback generico.
  const LEX = useMemo(() => lessico(tipoAttivita), [tipoAttivita]);

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

  // Analytics: traccia apertura view (RPC track_view_open, best-effort).
  // Dedup interno a 5s (vedi src/lib/usageTracking.js) per evitare doppi log
  // su re-render. Usato dall'admin per capire quali feature sono più usate.
  useEffect(() => {
    if (view && orgId) trackViewOpen(view)
  }, [view, orgId]);

  // Zoom globale del sito (persistente): l'utente può rimpicciolire/ingrandire tutto.
  const ZOOM_STEPS = [0.7, 0.8, 0.9, 1, 1.1, 1.25];
  const [zoom, setZoom] = useState(() => {
    try { const z = parseFloat(localStorage.getItem('foodios-zoom')); return ZOOM_STEPS.includes(z) ? z : 1; } catch { return 1; }
  });
  useEffect(() => { try { localStorage.setItem('foodios-zoom', String(zoom)); } catch {} }, [zoom]);
  const stepZoom = (dir) => setZoom(z => { const i = ZOOM_STEPS.indexOf(z); const ni = Math.max(0, Math.min(ZOOM_STEPS.length - 1, (i < 0 ? 3 : i) + dir)); return ZOOM_STEPS[ni]; });
  // Navigazione orizzontale in topbar (desktop): sezione con mega-menu aperto + dropdown profilo.
  const [hoverSec, setHoverSec] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [upgradeModal, setUpgradeModal] = useState(null);  // {featureName, requiredPlan}
  useEffect(() => {
    function onOpen() { setCmdkOpen(true) }
    window.addEventListener('foodios:cmdk', onOpen)
    return () => window.removeEventListener('foodios:cmdk', onOpen)
  }, []);

  // Ruolo utente. Il dipendente vede solo le viste operative (DIPENDENTE_VIEWS).
  const ruolo = auth?.ruolo || 'titolare';
  const isDip = ruolo === 'dipendente';
  // Defense-in-depth: se un dipendente finisce su una vista non consentita (es.
  // ripristinata da sessionStorage o via link), riportalo alla produzione.
  useEffect(() => {
    if (view === 'discrepanze') { setView('sprechi-omaggi'); return; }   // unita in Perdite & cessioni
    // Fallback dipendente: se sulla sede attiva e' attivo il metodo inventario,
    // la "home produzione" del dipendente diventa 'inventario-gusti'.
    if (isDip && !DIPENDENTE_VIEWS.has(view)) {
      const isInv = sedeAttiva?.is_sede_produzione === true && sedeAttiva?.metodo_produzione === 'inventario'
      setView(isInv ? 'inventario-gusti' : 'giornaliero')
    }
  }, [isDip, view, sedeAttiva]);
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
    simulatore:'numeri', pl:'numeri', storico:'numeri', previsione:'numeri', 'menu-engineering':'ai', cashflow:'ai', forecast:'ai', reformulation:'ai', 'competitor-pricing':'ai', 'ordini-ai':'ai', 'ai-brain':'ai', 'ricette-ai':'ai', marketplace:'ai', whatsapp:'ai', documentary:'ai', 'ai-hub':'ai', recensioni:'ai',
    magazzino:'acquisti', scadenzario:'acquisti', fornitori:'acquisti', 'vendite-b2b':'acquisti', 'importa-dati':'acquisti',
    personale:'azienda', haccp:'azienda', 'confronto-sedi':'azienda', trasferimenti:'azienda', recensioni:'azienda',
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
      console.log('caricaDati: orgId non ancora disponibile, attendo...');
      return;
    }
    console.log('caricaDati START — orgId:', orgId, 'sedeId:', sedeId);
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
        if (data) { setRic(data); setOfflineCacheDate(savedAt); console.log('cache ricettario:', Object.keys(data.ricette||{}).length, 'ricette'); }
      }
    } catch {}
    try {
      const bkMag    = bkReadLS(SK_MAG,    orgId, sedeId); if (bkMag)    { setMagazzino(bkMag);        console.log('cache magazzino:', Object.keys(bkMag).length); }
      const bkGior   = bkReadLS(SK_GIOR,   orgId, sedeId); if (bkGior)   { setGiornaliero(bkGior);     console.log('cache giornaliero:', bkGior.length); }
      const bkChius  = bkReadLS(SK_CHIUS,  orgId, sedeId); if (bkChius)  { setChiusure(bkChius);       console.log('cache chiusure:', bkChius.length); }
      const bkProd   = bkReadLS(SK_PROD,   orgId, sedeId); if (bkProd)   { setProd(bkProd);            console.log('cache produzione:', Object.keys(bkProd).length); }
      const bkAct    = bkReadLS(SK_ACT,    orgId, null);   if (bkAct)    { setAct(bkAct);              console.log('cache actions:', bkAct.length); }
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
      console.warn(`${label}: Supabase vuoto, ripristino da backup locale…`);
      ssave(sk, bk).then(() => console.log(`${label} ripristinato su Supabase`))
                   .catch(e => console.error(`Ripristino ${label} fallito:`, e));
    };

    // "Tutte le sedi": carica le chiavi PER-SEDE aggregate da tutte le sedi.
    const allM = !!sedeAttiva?._all;
    const loadPS = (key, merge) => allM ? sloadAllSedi(key, orgId).then(merge) : sload(key);
    // Dipendente: ricettario e giornaliero arrivano SANITIZZATI dal server (senza
    // ingredienti/quantità/costi/ingredientiUsati). La RLS blocca la lettura raw
    // di queste chiavi al dipendente; le RPC SECURITY DEFINER restituiscono la
    // versione sicura. Vedi migration 20260607b + api/produzione-registra.js.
    const loadRicettario = isDip
      ? supabase.rpc('fos_ricettario_dip').then(({ data }) => data ?? null)
      : sload(SK_RIC);
    const loadGiornaliero = isDip
      ? supabase.rpc('fos_giornaliero_dip', { p_sede: sedeId || null }).then(({ data }) => data ?? null)
      : loadPS(SK_GIOR, _mergeArr);
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
    Promise.race([
      Promise.all([loadRicettario,loadPS(SK_PROD,()=>({})),sload(SK_ACT),loadPS(SK_MAG,_mergeMag),loadPS(SK_LOGRIF,_mergeArr),loadGiornaliero,loadPS(SK_CHIUS,_mergeArr),sload(SK_EXCL),sload(SK_LOG_PRZ)]),
      timeout
    ]).then(([ric,prod,act,mag,logrif,gior,chius,excl,logprz])=>{
      setOfflineMode(false);
      console.log('caricaDati SUPABASE:', {
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
        console.warn('Supabase ricettario vuoto per orgId', orgId);
        // Tenta restore dal cache ricettario (formato vecchio _RIC_CACHE_KEY)
        try {
          const cached = localStorage.getItem(_RIC_CACHE_KEY);
          if (cached) {
            const { data } = JSON.parse(cached);
            if (data && Object.keys(data.ricette||{}).length > 0) {
              console.warn('ricettario: ripristino da cache locale…');
              ssave(SK_RIC, data).then(() => console.log('ricettario ripristinato su Supabase'))
                                 .catch(e => console.error('Ripristino ricettario fallito:', e));
            }
          }
        } catch {}
        restoreIfEmpty(null, SK_RIC, 'ricettario'); // anche dal nuovo bk format
      }
      // In "Tutte le sedi" (allM) i dati sono aggregati: applico solo lo stato,
      // SENZA backup né restore per-sede (eviterei di sporcare la cache di una sede).
      if(prod)  { setProd(prod);          if(!allM) bkWriteLS(SK_PROD,   prod,   orgId, sedeId); } else if(!allM){ restoreIfEmpty(prod,   SK_PROD,   'produzione'); }
      if(act)   { setAct(act);            bkWriteLS(SK_ACT,    act,    orgId, null);   } else { restoreIfEmpty(act,    SK_ACT,    'actions'); }
      if(mag)   { setMagazzino(mag);      if(!allM) bkWriteLS(SK_MAG,    mag,    orgId, sedeId); } else if(!allM){ restoreIfEmpty(mag,    SK_MAG,    'magazzino'); }
      if(logrif){ setLogRif(logrif);      if(!allM) bkWriteLS(SK_LOGRIF, logrif, orgId, sedeId); } else if(!allM){ restoreIfEmpty(logrif, SK_LOGRIF, 'logRif'); }
      if(gior)  { setGiornaliero(gior);   if(!allM) bkWriteLS(SK_GIOR,   gior,   orgId, sedeId); } else if(!allM){ restoreIfEmpty(gior,   SK_GIOR,   'giornaliero'); }
      if(chius) { setChiusure(chius);     if(!allM) bkWriteLS(SK_CHIUS,  chius,  orgId, sedeId); } else if(!allM){ restoreIfEmpty(chius,  SK_CHIUS,  'chiusure'); }
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
          // save-first: applichiamo lo state solo se la migrazione e' persistita,
          // altrimenti al refresh torna allo stato precedente e l'UI diverge
          // (ricette mostrate come semilavorato senza FC, ma DB legacy interno).
          ssave(SK_RIC, migrated)
            .then(() => setRic(migrated))
            .catch(e => console.error('ssave migrazione:', e));
        }
      }
      setReady(true);
    }).catch(err => {
      console.error('caricaDati FALLITO:', err);
      if (err.message === 'timeout' || err.message?.includes('network') || err.message?.includes('fetch')) {
        setOfflineMode(true);
      }
      setReady(true);
    });
  },[orgId, sedeId, sedeAttiva?._all]);

  // BRIDGE inventario→giornaliero: per le sedi in metodo='inventario',
  // SK_GIOR e' vuoto (i dati vivono in inventario_produzione). Carichiamo
  // l'ultimo anno dalla nuova tabella e proiettiamo come sessioni cosi'
  // PLView/StoricoProduzioneView/DashboardHomeView/ConfrontoSedi/Simulatore
  // vedono i dati senza modifiche al loro codice. 1 stampo virtuale = 1 kg.
  useEffect(() => {
    if (!orgId || !sedeId) return
    const isInv = sedeAttiva?.metodo_produzione === 'inventario' && sedeAttiva?.is_sede_produzione
    if (!isInv) return
    caricaSessioniDaInventario(orgId, sedeId, { monthsBack: 12 })
      .then(sessioni => {
        // Sostituiamo del tutto giornaliero per questa sede (SK_GIOR e' vuoto
        // in modalita' inventario e ricaricaremo al refocus alla prossima
        // selezione sede).
        setGiornaliero(sessioni)
      })
      .catch(e => console.error('bridge inventario→giornaliero:', e))
  }, [orgId, sedeId, sedeAttiva?.metodo_produzione, sedeAttiva?.is_sede_produzione])

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
        onComplete: async (result) => {
          if (!result) return;
          // save-first: niente side-effect dentro l'updater di setState (in
          // StrictMode viene chiamato due volte → doppio ssave). Calcoliamo
          // il merged fuori, salviamo, e solo se ok aggiorniamo state+cache.
          const merged = ricettario ? {
            ...ricettario,
            ricette: { ...ricettario.ricette, ...result.ricette },
            ingredienti_costi: { ...ricettario.ingredienti_costi, ...result.ingredienti_costi },
          } : result;
          try {
            await ssave(SK_RIC, merged);
            setRic(merged);
            try { localStorage.setItem(cacheKey, JSON.stringify({ data: merged, savedAt: new Date().toLocaleString('it-IT') })); } catch {}
            notify(`✓ ${f.name} — ${Object.keys(result.ricette || {}).length} ricette importate`);
          } catch (e) {
            notify(`${f.name}: errore salvataggio (${e.message || 'rete'})`, false);
          }
        },
        onError: (err) => {
          notify(`${f.name}: ${err.message}`, false);
        },
      });
    }
  },[_RIC_CACHE_KEY, notify]);

  const handleImportPrezziOCR=useCallback(async (nuoviCosti) => {
    if (!ricettario) return;
    const nuovoRic = { ...ricettario, ingredienti_costi: { ...(ricettario.ingredienti_costi||{}), ...nuoviCosti } };
    // SAVE FIRST: se ssave fallisce non muto lo state (evita prezzi fantasma al refresh)
    try { await ssave(SK_RIC, nuovoRic); }
    catch (e) { notify(`Errore salvataggio prezzi: ${e.message||'rete'}`, false); return; }
    setRic(nuovoRic);
  }, [ricettario, notify]);

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
          notify(`Non riesco a riconoscere il formato di ${f.name} — usa la pagina Cassa per import guidato.`, false);
          continue;
        }
        const nuove = mergeInChiusure(chiusure||[], righe, piattaforma);
        await ssave(SK_CHIUS, nuove); setChiusure(nuove); // SAVE FIRST (il throw è gestito dal catch sotto)
        notify(`✓ ${righe.length} giorni importati da ${piattaforma}`);
      } catch (e) {
        notify(`${f.name}: ${e.message}`, false);
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
        notify(`Non riesco a riconoscere il formato di ${f.name} — usa la pagina Cassa per import guidato.`, false);
        continue;
      }
      const nuove = mergeInChiusureCassa(chiusure||[], righe, sistema);
      // SAVE FIRST: questo loop non ha try/catch esterno, gestisco qui
      try { await ssave(SK_CHIUS, nuove); }
      catch (e) { notify(`${f.name}: ${e.message||'rete'}`, false); continue; }
      setChiusure(nuove);
      notify(`✓ ${righe.length} giorni importati da ${sistema}`);
    }
  }, [chiusure, notify]);

  // Fatture: per ora indirizza l'utente alla pagina Fornitori (parser XML lì)
  const handleImportFattureGlobal = useCallback(async (files) => {
    notify(`Per fatture XML/PDF usa la pagina Fornitori → Ordini → Importa fattura.`);
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
      catch (e) { notify(`Errore salvataggio prezzo: ${e.message || 'rete'}`, false); return; }
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
    catch (e) { notify(`Errore log prezzi: ${e.message || 'rete'}`, false); return; }
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
    const idsApplicati = new Set(daApplicare.map(e => e.id));
    const nextLog = logPrezzi.map(e => idsApplicati.has(e.id) ? { ...e, pianificato: false, applicato_il: new Date().toISOString() } : e);
    // save-first: senza l'await il client vede prezzi aggiornati ma al refresh
    // ricarica dal DB i vecchi (ssave silenzioso fallito). Applichiamo solo se
    // entrambe le scritture vanno a buon fine.
    Promise.all([ssave(SK_RIC, nuovoRic), ssave(SK_LOG_PRZ, nextLog)])
      .then(() => { setRic(nuovoRic); setLogPrezzi(nextLog); })
      .catch(e => { notify(`Applicazione prezzi pianificati fallita: ${e?.message || 'rete'}`, false); });
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
        onComplete: async ({ prezzi, count } = {}) => {
          if (!prezzi || !count) return;
          if (!ricettario) return;
          // save-first (no side-effect dentro setRic updater)
          const nuovoRic = { ...ricettario, ingredienti_costi: { ...(ricettario.ingredienti_costi||{}), ...prezzi } };
          try {
            await ssave(SK_RIC, nuovoRic);
            setRic(nuovoRic);
            notify(`✓ ${f.name} — ${count} prezzi aggiornati`);
          } catch (e) {
            notify(`${f.name}: errore salvataggio prezzi (${e.message || 'rete'})`, false);
          }
        },
        onError: (err) => {
          notify(`${f.name}: ${err.message}`, false);
        },
      });
    }
    if (!hasValidFile) notify("Nessun file xlsx/xls/csv valido trovato", false);
  },[notify]);

  const handleNuovoMese=useCallback(async(m,y)=>{
    const k=mKey(m,y);
    if(produzione[k]){setView(k);setShowMese(false);return;}
    const mese={key:k,month:m,year:y,label:mLabel(m,y),entries:[],meteo:null};
    const meteo=await fetchMeteo(m,y);
    if(meteo) mese.meteo=meteo;
    const np={...produzione,[k]:mese};
    try { await ssave(SK_PROD,np); }
    catch (e) { notify(`Creazione mese fallita: ${e.message || 'rete'}`, false); return; }
    setProd(np);
    setView(k);setShowMese(false);
    notify(`${mese.label} creato`);
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
    catch (e) { notify(`Aggiornamento ricetta fallito: ${e.message || 'rete'}`, false); return; }
    setRic(nuovoRic);
    const cong = congelabile!==undefined ? congelabile : ricettario?.ricette?.[nome]?.congelabile;
    notify(`✓ ${nome}: ${unita} ${REGOLE[nome]?.tipo==="fetta"?"fette":"pezzi"} × ${fmt(prezzo)}${cong?" · congelabile":""}`);
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
    console.log('handleSalvaRicetta', { orgId, _ctx_orgId, effectiveOrgId, sedeId, ricettaNome, count: Object.keys(nuovoRic?.ricette||{}).length });
    if (!effectiveOrgId) {
      notify('Sessione non valida (orgId mancante). Ricarica la pagina.', false);
      return;
    }
    // 1. REGOLE runtime
    for (const [n,r] of Object.entries(nuoveRegole||{})) REGOLE[n]=r;
    // 2. Salvataggio su Supabase PRIMA dello state (regola CLAUDE.md§Pattern
    //    scrittura→state: lo state riflette solo dati persistiti). Se ssave
    //    fallisce mostriamo errore e NON tocchiamo lo state — l'UI non
    //    diverge dal DB.
    try {
      await ssave(SK_RIC, nuovoRic);
    } catch(err) {
      console.error('ERRORE salvataggio ricetta su Supabase:', err);
      // Backup localStorage perché Supabase ha fallito
      try { localStorage.setItem(_RIC_CACHE_KEY, JSON.stringify({ data: nuovoRic, savedAt: new Date().toLocaleString('it-IT') })); } catch {}
      notify(`Salvataggio DB fallito: ${err.message || 'errore'}. Ricetta in cache locale — esegui SQL Supabase.`, false);
      return; // non procedere — non redirect, non conferm toast, NO setRic
    }
    // 3. State locale: solo dopo che il save e' riuscito
    setRic(nuovoRic);
    // 4. Magazzino — aggiungi ingredienti mancanti con giacenza 0 (save-first)
    const ings = (ricettaNome && nuovoRic.ricette?.[ricettaNome]?.ingredienti) || [];
    if (ings.length > 0 && !noRedirect) {
      const nm = {...magazzino};
      let changed = false;
      ings.forEach(ing => {
        const k = normIng(ing.nome);
        if (!nm[k]) {
          nm[k] = {nome:ing.nome.trim(),giacenza_g:0,soglia_g:0,ultimoRifornimento:null};
          changed = true;
        }
      });
      if (changed) {
        try {
          await ssave(SK_MAG, nm);
          setMagazzino(nm);
        } catch(e) {
          console.error('ssave SK_MAG:', e);
          // Ricetta gia' salvata: ingredienti placeholder mancanti non bloccano
          // il flusso utente, ma logghiamo e mostriamo un avviso non-fatale.
          notify(`Ingredienti aggiunti in cache locale (errore DB)`, false);
        }
      }
    }
    // 5. Toast + redirect
    if (ricettaNome) notify(`✓ "${ricettaNome}" salvata`);
    if (!noRedirect) setView("ricettario");
  }, [magazzino, orgId, sedeId, _RIC_CACHE_KEY]);

  const handleSave=useCallback(async(k,entries)=>{
    const np={...produzione,[k]:{...produzione[k],entries}};
    // SAVE FIRST: muto lo state solo se la produzione è persistita
    try { await ssave(SK_PROD,np); }
    catch(e){ notify(`Errore salvataggio: ${e.message||'rete'}`,false); return; }
    setProd(np);
    notify("✓ Dati salvati");
  },[produzione,notify]);

  const handleDel=useCallback(async k=>{
    const np={...produzione};delete np[k];
    // SAVE FIRST: non rimuovo dallo state se l'eliminazione non è persistita
    try { await ssave(SK_PROD,np); }
    catch(e){ notify(`Errore eliminazione: ${e.message||'rete'}`,false); return; }
    setProd(np);
    const ks=Object.keys(np).sort();
    setView(ks.length?ks.at(-1):"ricettario");
    setConfDel(null);notify("Mese eliminato");
  },[produzione,notify]);

  // Azioni AI Assistant: SAVE FIRST per evitare data-loss (l'utente vede
  // l'azione tracciata anche se ssave fallisce → fantasma al refresh).
  const handleAddAct=useCallback(async({label,azione,fonte,meseSorgente})=>{
    const a={id:`a-${Date.now()}`,label,azione,fonte,meseSorgente,stato:"aperta",createdAt:new Date().toISOString()};
    const u=[a,...actions];
    try { await ssave(SK_ACT,u); }
    catch(e) { notify(`Errore tracciamento azione: ${e.message||'rete'}`,false); return; }
    setAct(u); notify("Azione tracciata");
  },[actions]);
  const handleUpdAct=useCallback(async(id,ch)=>{
    const u=actions.map(a=>a.id===id?{...a,...ch}:a);
    try { await ssave(SK_ACT,u); } catch(e) { notify(`Errore: ${e.message||'rete'}`,false); return; }
    setAct(u);
  },[actions]);
  const handleDelAct=useCallback(async id=>{
    const u=actions.filter(a=>a.id!==id);
    try { await ssave(SK_ACT,u); } catch(e) { notify(`Errore: ${e.message||'rete'}`,false); return; }
    setAct(u);
  },[actions]);

  const sortedMesi=Object.keys(produzione).sort();
  const currentMese=produzione[view];
  const ingCostiMain = useMemo(()=>buildIngCosti(ricettario?.ingredienti_costi||{}), [ricettario]);

  if(!ready) return <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:C.textSoft}}>Caricamento…</div>;

  return (
    <ErrorBoundary>
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Inter',system-ui,sans-serif",color:C.text,display:"flex",zoom:zoom}}>
      {/* ── Trial Banner rimosso dal rendering (logica isTrialAttivo intatta) ── */}
      <style>{`*{box-sizing:border-box}body{font-family:'Inter',system-ui,sans-serif}input,select,button,textarea{font-family:inherit}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:rgba(148,163,184,0.4);border-radius:10px}::-webkit-scrollbar-thumb:hover{background:rgba(148,163,184,0.7)}
        /* Linguaggio premium condiviso (usabile da tutte le view) */
        .fos-tile{transition:transform .18s cubic-bezier(.32,.72,0,1), box-shadow .18s ease, border-color .18s ease}
        .fos-tile:hover{transform:translateY(-3px); box-shadow:0 14px 34px rgba(15,23,42,0.12)}
        .fos-row{transition:background .14s ease}
        .fos-row:hover{background:#F7F3F0}
        @keyframes fos_riseIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .fos-rise{animation:fos_riseIn .4s cubic-bezier(.32,.72,0,1) both}
      `}</style>

      {/* Fascia superiore globale (desktop): NAVIGAZIONE ORIZZONTALE.
          Logo a sx · sezioni con mega-menu su hover · ricerca · profilo a dx. */}
      {!isMobile && (()=>{
        const ICONS = SHARED_ICONS, ic = sharedIc;
        const today2 = todayLocal();
        const criticeMag = Object.values(magazzino||{}).filter(m=>m.giacenza_g===0||(m.soglia_g>0&&m.giacenza_g<=m.soglia_g)).length;
        const azioniAperte = (actions||[]).filter(a=>a.stato!=="chiusa").length;
        const hasProdOggi = (giornaliero||[]).some(s=>s.data===today2&&(s.prodotti||[]).length>0);
        const cassaMancante = !(chiusure||[]).some(c=>c.data===today2) && new Date().getHours()>=14;
        const multiSede = (sedi||[]).length>1;
        // Metodo produzione della sede attiva: determina se mostrare la voce
        // "Inventario gusti" (metodo=inventario, gelaterie/yogurt) al posto
        // di "Produzione" (metodo=stampi, pasticcerie/panifici).
        //
        // Anche la lettura via .find su `sedi` come fallback: in alcuni casi
        // sedeAttiva e' temporaneamente uno stub privo dei campi inventario
        // (es. dopo reload del profilo); cosi' evitiamo che la voce sparisca
        // per un attimo nel menu mentre l'utente sta lavorando dentro la view.
        const sedeFull = (sedi || []).find(s => s.id === sedeAttiva?.id) || sedeAttiva
        const isMetodoInventario = (sedeFull?.is_sede_produzione === true
            && sedeFull?.metodo_produzione === 'inventario')
          // Anche se sedeAttiva e' incompleta, se l'utente e' GIA' dentro
          // 'inventario-gusti' manteniamo la voce visibile per non disorientare.
          || view === 'inventario-gusti' || view === 'quadratura-inventario'
        // Riorganizzazione menu 2026-06-13: 6 sezioni task-based,
        // tutte le 23 funzioni AI nella sezione finale "AI" che ha anche
        // un hub-landing (view 'ai-hub'). Click sulla section-header AI
        // → atterra sull'hub (gestito via headerView property).
        const showMultiSede = (auth?.user?.email === 'demo@maradeiboschi.com') || multiSede
        const NAV = [
          { id:"oggi", label:"Oggi", items:[
            ...(isMetodoInventario
              ? [{id:"inventario-gusti",label:"Inventario gusti",icon:"layers"}]
              : [{id:"giornaliero",label:"Produzione",icon:"cal",alert:!hasProdOggi&&new Date().getHours()>=6}]),
            {id:"chiusura",label:"Cassa",icon:"creditCard",alert:cassaMancante},
            {id:"calendario",label:"Calendario",icon:"cal"},
            {id:"eventi",label:"Eventi",icon:"cal"},
          ]},
          { id:"ricette", label:"Ricette & Menù", items:[
            {id:"ricettario",label:LEX.Ricettario,icon:"book"},
            {id:"semilavorati",label:"Semilavorati",icon:"layers"},
            {id:"nuova-ricetta",label:"Nuova ricetta",icon:"pencil"},
            {id:"formati-vendita",label:"Formati di vendita",icon:"coins"},
            {id:"scheda-allergeni",label:"Allergeni",icon:"shield"},
            {id:"menu",label:"Menù del giorno",icon:"menu"},
          ]},
          { id:"acquisti", label:"Magazzino & Fornitori", badge:criticeMag, items:[
            {id:"magazzino",label:"Magazzino",icon:"pkg",badge:criticeMag,alert:criticeMag>0},
            {id:"sprechi-omaggi",label:"Perdite & cessioni",icon:"sparkles"},
            {id:"scadenzario",label:"Scadenzario fatture",icon:"fileText"},
            {id:"fornitori",label:"Fornitori",icon:"truck"},
            {id:"importa-dati",label:"Importa dati",icon:"download"},
          ]},
          { id:"numeri", label:"Analisi & Numeri", items:[
            {id:"pl",label:"Profitti (P&L)",icon:"trendUp"},
            {id:"costi-aziendali",label:"Costi aziendali",icon:"package"},
            {id:"storico",label:"Storico produzione",icon:"activity"},
            ...(isMetodoInventario ? [{id:"quadratura-inventario",label:"Quadratura inventario",icon:"check"}] : []),
            {id:"simulatore",label:"Food Cost simulatore",icon:"barChart"},
            {id:"previsione",label:"Previsione domanda",icon:"forecast"},
            {id:"vendite-b2b",label:"Vendite B2B",icon:"building"},
          ]},
          { id:"azienda", label:"Azienda & Team", items:[
            ...(showMultiSede
              ? [{id:"confronto-sedi",label:"Confronto sedi",icon:"building"},
                 {id:"trasferimenti",label:"Trasferimenti tra sedi",icon:"truck"}]
              : []),
            {id:"personale",label:"Personale & stipendi",icon:"users"},
            {id:"haccp",label:"HACCP",icon:"shield"},
            {id:"registro-attivita",label:"Registro attività",icon:"fileText"},
            {id:"integrazioni",label:"Integrazioni",icon:"plug"},
          ]},
          // ── SEZIONE AI: tutte le 23 funzioni AI raggruppate ───────────────
          // headerView: cliccando il titolo della sezione si va a 'ai-hub'.
          // chainBadge dinamico nelle item: calcolato lato render da
          // canAccessView, non flag statico.
          { id:"ai", label:"AI", headerView:"ai-hub", badge:azioniAperte, items:[
            {id:"ai-hub",label:"Panoramica AI",icon:"sparkles"},
            {id:"ai-brain",label:"FoodOS Brain (chat)",icon:"sparkles"},
            {id:"forecast",label:"Forecast vendite 7gg",icon:"sun"},
            {id:"cashflow",label:"Cashflow predittivo",icon:"trendUp"},
            {id:"menu-engineering",label:"Menu engineering",icon:"barChart"},
            {id:"competitor-pricing",label:"Pricing vs competitor",icon:"money"},
            {id:"ordini-ai",label:"Ordini AI consigliati",icon:"truck"},
            {id:"reformulation",label:"Ottimizza ricetta AI",icon:"sparkles"},
            {id:"ricette-ai",label:"Inventa ricetta AI",icon:"lightbulb"},
            {id:"recensioni",label:"Recensioni AI",icon:"sparkles"},
            {id:"whatsapp",label:"WhatsApp Bot",icon:"bell"},
            {id:"marketplace",label:"Marketplace fornitori",icon:"truck"},
            {id:"documentary",label:"Documentary AI",icon:"barChart"},
            {id:"azioni",label:"Azioni consigliate",icon:"sparkles",badge:azioniAperte},
          ]},
        ].map(sec=>({ ...sec, items: sec.items.filter(it=>!isDip||DIPENDENTE_VIEWS.has(it.id)) })).filter(sec=>sec.items.length>0);

        const go = id => {
          // Se la view richiede un piano superiore al corrente, apri modal upgrade.
          if (id && !canAccessView(id, piano, auth?.user?.email)) {
            setUpgradeModal({
              featureName: viewDisplayLabel(id),
              requiredPlan: VIEW_MIN_PLAN[id] || 'enterprise',
            })
            setHoverSec(null)
            return
          }
          setView(id); setHoverSec(null); setProfileOpen(false); setSidebarSearch('')
        };
        const activeSec = NAV.find(s=>s.items.some(it=>it.id===view))?.id;
        const q = sidebarQuery;
        const searchHits = q ? NAV.flatMap(s=>s.items).filter(it=>it.label.toLowerCase().includes(q)||it.id.toLowerCase().includes(q)) : [];

        // Bottone voce dentro un mega-menu o nei risultati ricerca.
        const ItemBtn = (it) => {
          const act = view===it.id;
          return (
            <button key={it.id} onClick={()=>go(it.id)}
              style={{display:"flex",alignItems:"center",gap:9,width:"100%",textAlign:"left",padding:"8px 12px",borderRadius:8,border:"none",cursor:"pointer",
                background:act?C.redLight:"transparent",color:act?C.red:C.text,fontSize:12.5,fontWeight:act?700:500,fontFamily:"inherit"}}
              onMouseEnter={e=>{if(!act)e.currentTarget.style.background="#F4EEEA";}} onMouseLeave={e=>{if(!act)e.currentTarget.style.background="transparent";}}>
              <span style={{color:act?C.red:C.textSoft,display:"flex"}}>{ic(ICONS[it.icon],15)}</span>
              <span style={{flex:1,whiteSpace:"nowrap"}}>{it.label}</span>
              {/* ChainBadge dinamico: appare solo se utente NON ha accesso al piano richiesto */}
              {!canAccessView(it.id,piano,auth?.user?.email)&&<ChainBadge active={act} size={13}/>}
              {it.badge>0&&<span style={{background:C.red,color:"#fff",borderRadius:10,fontSize:10,fontWeight:700,padding:"1px 7px"}}>{it.badge}</span>}
              {it.alert&&!it.badge&&<span style={{width:7,height:7,borderRadius:"50%",background:"#E84B3A"}}/>}
            </button>
          );
        };
        const initial = (auth?.user?.email||"?").slice(0,1).toUpperCase();
        return (
        <div style={{position:"fixed",top:0,left:0,right:0,height:52,zIndex:45,
          background:"linear-gradient(100deg, #16121C 0%, #1E0B11 55%, #2C0E14 100%)",
          borderBottom:"1px solid rgba(0,0,0,0.4)",boxShadow:"0 1px 0 rgba(255,255,255,0.04) inset, 0 4px 18px rgba(0,0,0,0.18)",
          display:"flex",alignItems:"center",gap:14,padding:"0 16px"}}>
          {/* Linea accento brand in cima (firma premium) */}
          <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:"linear-gradient(90deg, #6E0E1A 0%, #E84B3A 50%, #6E0E1A 100%)"}}/>
          {/* Logo + nome (sx) */}
          <button onClick={()=>go(isDip?"giornaliero":"home")} style={{display:"flex",alignItems:"center",gap:9,background:"transparent",border:"none",cursor:"pointer",flexShrink:0,padding:0}}>
            {customLogo ? <img src={customLogo} alt={appName} style={{height:26,maxWidth:46,objectFit:'contain',borderRadius:6}}/> : <Logo size={26} style={{borderRadius:6}}/>}
            <span style={{fontSize:15,fontWeight:700,color:T.textOnDark,letterSpacing:"-0.015em",whiteSpace:"nowrap"}}>{appName}</span>
          </button>

          {/* Sezioni con mega-menu su hover (centrate) */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:2,flex:1,minWidth:0,overflow:"visible"}}>
            {NAV.map(sec=>{
              const open = hoverSec===sec.id;
              const secActive = activeSec===sec.id;
              // Section header badge: dinamico. Mostra ChainBadge solo se ALMENO
              // una sotto-feature non e' accessibile per l'utente corrente.
              // Per un utente Chain (vede tutto) → niente badge sulla sezione.
              const secHasLocked = sec.items.some(it => !canAccessView(it.id, piano, auth?.user?.email))
              return (
                <div key={sec.id} style={{position:"relative",height:"100%",display:"flex",alignItems:"center"}} onMouseEnter={()=>setHoverSec(sec.id)} onMouseLeave={()=>setHoverSec(null)}>
                  <button
                    onClick={()=>{ if(sec.headerView){ go(sec.headerView) } }}
                    style={{display:"flex",alignItems:"center",gap:6,padding:"7px 12px",borderRadius:8,border:"none",cursor:sec.headerView?"pointer":"default",whiteSpace:"nowrap",
                    background:open?"rgba(255,255,255,0.14)":secActive?"rgba(255,255,255,0.08)":(sec.id==="ai"?"linear-gradient(120deg, rgba(232,75,58,0.18), rgba(255,216,107,0.10))":"transparent"),
                    color:secActive||open?"#fff":"rgba(255,255,255,0.80)",fontSize:12.5,fontWeight:secActive?700:(sec.id==="ai"?700:500),fontFamily:"inherit",
                    boxShadow:secActive?"inset 0 -2px 0 #E84B3A":"none",
                    transition:`background ${M.durFast} ${M.ease}, color ${M.durFast} ${M.ease}`}}>
                    {sec.id==="ai" && secHasLocked && <ChainBadge size={12}/>}
                    {sec.label}
                    {sec.badge>0&&<span style={{background:"#E84B3A",color:"#fff",borderRadius:9,fontSize:9,fontWeight:700,padding:"1px 6px"}}>{sec.badge}</span>}
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{opacity:0.6,transform:open?"rotate(180deg)":"none",transition:`transform ${M.durFast} ${M.ease}`}}><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  {/* Bridge trasparente (paddingTop) tra bottone ed elenco: così
                      spostandosi sull'elenco il menu NON si chiude. */}
                  {open&&(
                    <div style={{position:"absolute",top:"100%",left:0,paddingTop:6,zIndex:60}}>
                      <div style={{minWidth:212,background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,boxShadow:"0 14px 38px rgba(15,23,42,0.20)",padding:6}}>
                        {sec.items.map(ItemBtn)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Ricerca sezioni */}
          <div style={{position:"relative",flexShrink:0}}>
            <input value={sidebarSearch} onChange={e=>setSidebarSearch(e.target.value)} placeholder="Cerca…"
              onKeyDown={e=>{ if(e.key==="Enter"&&searchHits.length){ e.preventDefault(); go(searchHits[0].id); } if(e.key==="Escape") setSidebarSearch(''); }}
              style={{width:150,padding:"7px 10px 7px 30px",borderRadius:8,border:`1px solid ${T.borderOnDarkStr}`,background:"rgba(255,255,255,0.06)",color:"#fff",fontSize:12,outline:"none",fontFamily:"inherit"}}/>
            <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"rgba(255,255,255,0.5)",display:"flex",pointerEvents:"none"}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </span>
            {q&&(
              <div style={{position:"absolute",top:"100%",right:0,marginTop:4,minWidth:240,maxHeight:340,overflowY:"auto",background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,boxShadow:"0 12px 32px rgba(15,23,42,0.18)",padding:6,zIndex:60}}>
                {searchHits.length?(<>
                  {searchHits.map(ItemBtn)}
                  <div style={{padding:"6px 10px 2px",fontSize:9.5,color:C.textSoft,borderTop:`1px solid ${C.border}`,marginTop:4}}>↵ Invio apre il primo</div>
                </>):<div style={{padding:"10px 12px",fontSize:12,color:C.textSoft}}>Nessuna sezione trovata.</div>}
              </div>
            )}
          </div>

          {/* Campanella notifiche (con badge non letti) — scopribile a colpo d'occhio */}
          <button onClick={()=>setShowNotifiche(true)} aria-label="Notifiche" title="Notifiche"
            style={{position:"relative",flexShrink:0,width:36,height:36,borderRadius:10,border:`1px solid ${T.borderOnDarkStr}`,background:"rgba(255,255,255,0.05)",color:"rgba(255,255,255,0.82)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:`background ${M.durFast} ${M.ease}`}}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.12)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.05)"}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            {nonLette>0&&<span style={{position:"absolute",top:-4,right:-4,background:"#E84B3A",color:"#fff",borderRadius:999,minWidth:17,height:17,fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 4px",border:"2px solid #1E0B11",lineHeight:1}}>{nonLette>9?"9+":nonLette}</span>}
          </button>

          {/* Search globale Cmd+K */}
          <button onClick={()=>setCmdkOpen(true)} aria-label="Cerca o chiedi all AI (Cmd+K)" title="Cerca o chiedi all'AI (Cmd+K)"
            style={{background:"transparent",border:"none",cursor:"pointer",padding:6,borderRadius:8,color:"#FFF",display:"inline-flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </button>

          {/* AI Suggestions bell — campanella suggerimenti proattivi */}
          <AISuggestionsBell orgId={orgId} onNavigate={(v)=>setView(v)} />

          {/* Profilo (dx) con dropdown */}
          <div style={{position:"relative",flexShrink:0}}>
            <button onClick={()=>setProfileOpen(o=>!o)} aria-label="Menu profilo"
              style={{display:"flex",alignItems:"center",gap:8,padding:"4px 8px 4px 4px",borderRadius:999,border:`1px solid ${T.borderOnDarkStr}`,background:profileOpen?"rgba(255,255,255,0.12)":"rgba(255,255,255,0.04)",cursor:"pointer"}}>
              <span style={{width:28,height:28,borderRadius:"50%",background:"linear-gradient(135deg,#6E0E1A,#3D1515)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff"}}>{initial}</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {profileOpen&&(<>
              <div onClick={()=>setProfileOpen(false)} style={{position:"fixed",inset:0,zIndex:55}}/>
              <div style={{position:"absolute",top:"100%",right:0,marginTop:6,width:248,background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:12,boxShadow:"0 16px 40px rgba(15,23,42,0.22)",padding:8,zIndex:60}}>
                <div style={{padding:"8px 10px 10px",borderBottom:`1px solid ${C.border}`,marginBottom:6}}>
                  <div style={{fontSize:12.5,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{auth?.user?.email||"Account"}</div>
                  <div style={{fontSize:10.5,color:C.textSoft,marginTop:2}}>{nomeAttivita||"La mia attività"}</div>
                </div>
                {[
                  {lbl:"Impostazioni",ic:"settings",on:()=>go("impostazioni")},
                  {lbl:"Novità",ic:"bell",on:()=>go("changelog")},
                ].map(r=>(
                  <button key={r.lbl} onClick={r.on} style={{display:"flex",alignItems:"center",gap:10,width:"100%",textAlign:"left",padding:"9px 10px",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",fontSize:12.5,fontWeight:500,color:C.text,fontFamily:"inherit"}}
                    onMouseEnter={e=>e.currentTarget.style.background="#F4EEEA"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <span style={{color:C.textSoft,display:"flex"}}>{ic(ICONS[r.ic],15)}</span>{r.lbl}
                  </button>
                ))}
                {/* Zoom */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"9px 10px",margin:"4px 0",borderTop:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}`}}>
                  <span style={{fontSize:12,color:C.textMid,fontWeight:600}}>Zoom</span>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <button onClick={()=>stepZoom(-1)} style={{width:24,height:24,borderRadius:6,border:`1px solid ${C.borderStr}`,background:C.white,fontSize:15,fontWeight:800,color:C.textMid,cursor:"pointer",lineHeight:1}}>−</button>
                    <span style={{minWidth:42,textAlign:"center",fontSize:12,fontWeight:700,color:C.text,fontVariantNumeric:"tabular-nums"}}>{Math.round(zoom*100)}%</span>
                    <button onClick={()=>stepZoom(1)} style={{width:24,height:24,borderRadius:6,border:`1px solid ${C.borderStr}`,background:C.white,fontSize:14,fontWeight:800,color:C.textMid,cursor:"pointer",lineHeight:1}}>+</button>
                  </div>
                </div>
                <button onClick={()=>{setProfileOpen(false);onSignOut&&onSignOut();}} style={{display:"flex",alignItems:"center",gap:10,width:"100%",textAlign:"left",padding:"9px 10px",borderRadius:8,border:"none",background:"transparent",cursor:"pointer",fontSize:12.5,fontWeight:600,color:C.red,fontFamily:"inherit"}}
                  onMouseEnter={e=>e.currentTarget.style.background=C.redLight} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <span style={{display:"flex"}}>{ic(ICONS.logOut,15)}</span>Esci
                </button>
              </div>
            </>)}
          </div>
        </div>
        );
      })()}
      {/* Fascia inferiore globale (desktop): link legali. */}
      {!isMobile && (
        <div style={{position:"fixed",bottom:0,left:0,right:0,height:28,zIndex:40,
          background:"linear-gradient(100deg, #16121C 0%, #1E0B11 55%, #2C0E14 100%)",
          borderTop:"1px solid rgba(255,255,255,0.06)",boxShadow:"0 -4px 18px rgba(0,0,0,0.14)",
          display:"flex",alignItems:"center",justifyContent:"center",gap:9,
          fontFamily:"'Inter',system-ui,sans-serif"}}>
          {[["Privacy","/privacy"],["Termini","/termini"],["Cookie","/cookie"],["Contatti","/contatti"]].map(([l,h],i)=>(
            <React.Fragment key={l}>
              {i>0 && <span style={{fontSize:10,color:T.borderOnDarkStr}}>·</span>}
              <a href={h} target="_blank" rel="noreferrer" style={{fontSize:10.5,fontWeight:500,color:T.textOnDarkSoft,textDecoration:"none",letterSpacing:"0.02em"}}>{l}</a>
            </React.Fragment>
          ))}
          <span style={{fontSize:10,color:T.borderOnDarkStr}}>·</span>
          <span style={{fontSize:10.5,fontWeight:500,color:T.textOnDarkSoft,letterSpacing:"0.02em"}}>© {appName}</span>
        </div>
      )}

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

        // ICONS + ic helper estratti in src/lib/icons.js per riusabilita'.
        // Alias locali per minimo impatto sui callsite esistenti.
        const ICONS = SHARED_ICONS;
        const ic = sharedIc;

        const navItem = (id, iconKey, label, badge=0, alert=false, chainBadge=false) => {
          // Ruolo dipendente: mostra solo le voci operative consentite.
          if (isDip && !DIPENDENTE_VIEWS.has(id)) return null;
          // Filtro ricerca: se la query non matcha id né label, nascondiamo
          if (sidebarQuery && !label.toLowerCase().includes(sidebarQuery) && !id.toLowerCase().includes(sidebarQuery)) {
            return null;
          }
          const active = view === id;
          return (
            <button key={id} onClick={()=>{
                if (!canAccessView(id, piano, auth?.user?.email)) {
                  setUpgradeModal({ featureName: viewDisplayLabel(id), requiredPlan: VIEW_MIN_PLAN[id] || 'enterprise' })
                  if (isMobile) setSidebarOpen(false)
                  return
                }
                setView(id); if (isMobile) setSidebarOpen(false)
              }}
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
              {/* ChainBadge dinamico: solo se utente NON ha accesso al piano richiesto */}
              {!canAccessView(id, piano, auth?.user?.email)&&<ChainBadge active={active} size={13}/>}
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

          {isMobile && (
          <div style={{width:L.sidebarWidth,background:T.bgSide,display:"flex",flexDirection:"column",
            position:"fixed",top:0,left:0,bottom:0,zIndex:Z.drawer,flexShrink:0,
            borderRight:`1px solid ${T.borderOnDark}`,
            transform:isMobile&&!sidebarOpen?"translateX(-100%)":"translateX(0)",
            transition:`transform ${M.durSlow} ${M.ease}`,
            boxShadow:isMobile&&sidebarOpen?S.drawer:"none",
            backgroundImage:"radial-gradient(circle at 100% 0%, rgba(110,14,26,0.10) 0%, transparent 36%), linear-gradient(180deg, rgba(255,255,255,0.025) 0%, transparent 38%)"}}>

            {/* Brand accent strip */}
            <div style={{height:3, background:"linear-gradient(90deg, #6E0E1A 0%, #E84B3A 50%, #6E0E1A 100%)", flexShrink:0}}/>

            {/* Logo header: solo su mobile (su desktop logo+nome sono nella fascia
                superiore globale, così la sidebar ha più spazio per il menu). */}
            {isMobile && (
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
            )}

            {!['confronto-sedi','trasferimenti'].includes(view) && <SedeSelector sedi={sedi} sedeAttiva={sedeAttiva} onSelect={onSetSedeAttiva} />}

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

              {/* Group/Sep renderizzati come CHIAMATE di funzione (non <Group/>):
                  definiti nello scope del render, come elementi JSX cambierebbero
                  identità a ogni render → React rimonterebbe tutte le sezioni,
                  azzerando lo scroll del menu (bug "torna in cima") e ri-animando. */}
              {/* Sidebar allineata 1:1 con NAV topbar (2026-06-13 v2) */}

              {Group({ id:"oggi", iconKey:"today", label:"Oggi",
                alert:(!hasProdOggi && new Date().getHours()>=6) || cassaMancante,
                children:[
                  ...(((sedi||[]).find(s=>s.id===sedeAttiva?.id)?.is_sede_produzione && (sedi||[]).find(s=>s.id===sedeAttiva?.id)?.metodo_produzione === 'inventario') || view === 'inventario-gusti'
                    ? [navItem("inventario-gusti","layers","Inventario gusti")]
                    : [navItem("giornaliero","cal","Produzione",0,!hasProdOggi&&new Date().getHours()>=6)]),
                  navItem("chiusura","creditCard","Cassa",0,cassaMancante),
                  navItem("calendario","cal","Calendario"),
                  navItem("eventi","cal","Eventi"),
                ] })}

              {Group({ id:"ricette", iconKey:"chefHat", label:"Ricette & Menù",
                children:[
                  navItem("ricettario","book",LEX.Ricettario),
                  navItem("semilavorati","layers","Semilavorati"),
                  navItem("nuova-ricetta","pencil","Nuova ricetta"),
                  navItem("formati-vendita","coins","Formati di vendita"),
                  navItem("scheda-allergeni","shield","Allergeni"),
                  navItem("menu","menu","Menù del giorno"),
                ] })}

              {Group({ id:"acquisti", iconKey:"shopping", label:"Magazzino & Fornitori",
                badge:criticeMag, alert:criticeMag>0,
                children:[
                  navItem("magazzino","pkg","Magazzino",criticeMag,criticeMag>0),
                  navItem("sprechi-omaggi","sparkles","Perdite & cessioni"),
                  navItem("scadenzario","fileText","Scadenzario fatture"),
                  navItem("fornitori","truck","Fornitori"),
                  navItem("importa-dati","download","Importa dati"),
                ] })}

              {Group({ id:"numeri", iconKey:"coins", label:"Analisi & Numeri",
                children:[
                  navItem("pl","trendUp","Profitti (P&L)"),
                  navItem("costi-aziendali","package","Costi aziendali"),
                  navItem("storico","activity","Storico produzione"),
                  ...(((sedi||[]).find(s=>s.id===sedeAttiva?.id)?.is_sede_produzione && (sedi||[]).find(s=>s.id===sedeAttiva?.id)?.metodo_produzione === 'inventario') || view === 'quadratura-inventario'
                    ? [navItem("quadratura-inventario","check","Quadratura inventario")] : []),
                  navItem("simulatore","barChart","Food Cost simulatore"),
                  navItem("previsione","forecast","Previsione domanda"),
                  navItem("vendite-b2b","building","Vendite B2B"),
                ] })}

              {Group({ id:"azienda", iconKey:"briefcase", label:"Azienda & Team",
                children:[
                  ((auth?.user?.email === 'demo@maradeiboschi.com') || (sedi||[]).length>1) && navItem("confronto-sedi","building","Confronto sedi"),
                  ((auth?.user?.email === 'demo@maradeiboschi.com') || (sedi||[]).length>1) && navItem("trasferimenti","truck","Trasferimenti tra sedi"),
                  navItem("personale","users","Personale & stipendi"),
                  navItem("haccp","shield","HACCP"),
                  navItem("registro-attivita","fileText","Registro attività"),
                  navItem("integrazioni","plug","Integrazioni"),
                ] })}

              {/* Sezione AI: 14 voci raggruppate, prima voce e' Panoramica (hub) */}
              {Group({ id:"ai", iconKey:"sparkles", label:"AI",
                badge:azioniAperte,
                children:[
                  navItem("ai-hub","sparkles","Panoramica AI"),
                  navItem("ai-brain","sparkles","FoodOS Brain (chat)", 0, false, true),
                  navItem("forecast","sun","Forecast vendite 7gg"),
                  navItem("cashflow","trendUp","Cashflow predittivo"),
                  navItem("menu-engineering","barChart","Menu engineering"),
                  navItem("competitor-pricing","money","Pricing vs competitor"),
                  navItem("ordini-ai","truck","Ordini AI consigliati"),
                  navItem("reformulation","sparkles","Ottimizza ricetta AI"),
                  navItem("ricette-ai","lightbulb","Inventa ricetta AI", 0, false, true),
                  navItem("recensioni","sparkles","Recensioni AI"),
                  navItem("whatsapp","bell","WhatsApp Bot", 0, false, true),
                  navItem("marketplace","truck","Marketplace fornitori", 0, false, true),
                  navItem("documentary","barChart","Documentary AI", 0, false, true),
                  navItem("azioni","sparkles","Azioni consigliate",azioniAperte),
                ] })}

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
              {/* Link legali: solo su mobile (su desktop sono nella fascia inferiore globale) */}
              {isMobile && (
              <div style={{display:"flex",justifyContent:"center",gap:8,paddingTop:2,flexWrap:"wrap"}}>
                <a href="/privacy" style={{fontSize:10,color:T.textOnDarkFaint,textDecoration:"none",letterSpacing:"0.02em"}} target="_blank" rel="noreferrer">Privacy</a>
                <span style={{fontSize:10,color:"rgba(255,255,255,0.14)"}}>·</span>
                <a href="/termini" style={{fontSize:10,color:T.textOnDarkFaint,textDecoration:"none",letterSpacing:"0.02em"}} target="_blank" rel="noreferrer">Termini</a>
                <span style={{fontSize:10,color:"rgba(255,255,255,0.14)"}}>·</span>
                <a href="/cookie" style={{fontSize:10,color:T.textOnDarkFaint,textDecoration:"none",letterSpacing:"0.02em"}} target="_blank" rel="noreferrer">Cookie</a>
                <span style={{fontSize:10,color:"rgba(255,255,255,0.14)"}}>·</span>
                <a href="/contatti" style={{fontSize:10,color:T.textOnDarkFaint,textDecoration:"none",letterSpacing:"0.02em"}} target="_blank" rel="noreferrer">Contatti</a>
              </div>
              )}
            </div>
          </div>
          )}

          {/* Mobile bottom navigation */}
          {isMobile&&(()=>{
            const sFull = (sedi||[]).find(s=>s.id===sedeAttiva?.id) || sedeAttiva
            const isInv = (sFull?.is_sede_produzione && sFull?.metodo_produzione === 'inventario')
              || view === 'inventario-gusti'
            const BOTTOM_NAV = [
              {id:"home",        icon:"home",       label:"Oggi"},
              isInv
                ? {id:"inventario-gusti", icon:"layers", label:"Inventario"}
                : {id:"giornaliero", icon:"cal", label:"Produzione", alert:!hasProdOggi&&new Date().getHours()>=6},
              {id:"chiusura",    icon:"creditCard", label:"Cassa",      alert:cassaMancante},
              {id:"magazzino",   icon:"pkg",        label:"Magazzino",  badge:criticeMag},
              {id:"__more",      icon:"menu",       label:"Altro"},
            ].filter(item => item.id === "__more" || !isDip || DIPENDENTE_VIEWS.has(item.id) || item.id === 'inventario-gusti');
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

      {/* Notifications panel — lazy: serve un proprio Suspense, altrimenti il
          click sincrono che lo monta sospende senza boundary (React #426). */}
      <React.Suspense fallback={null}>
        {showNotifiche&&<NotifichePanel notifiche={notifiche} nonLette={nonLette} onSegnaLetta={segnaLetta} onSegnaTutte={segnaTutte} onClose={()=>setShowNotifiche(false)}/>}
      </React.Suspense>

      {/* Novità modal */}
      <React.Suspense fallback={null}><BackgroundToast /></React.Suspense>
      {showNovita&&<NovitaModal onClose={()=>{setShowNovita(false);try{localStorage.setItem('foodios-changelog-vista',CHANGELOG[0]?.versione||'')}catch{}}} onVediTutte={()=>{setShowNovita(false);try{localStorage.setItem('foodios-changelog-vista',CHANGELOG[0]?.versione||'')}catch{}setView('changelog');}}/>}

      {/* CONTENT */}
      <div style={{marginLeft:0,marginTop:isMobile?0:52,flex:1,padding:0,paddingBottom:isMobile?0:28,overflowX:"auto",minHeight:"100vh",boxSizing:"border-box",display:"flex",flexDirection:"column"}}>
        {/* Intestazione pagina (desktop): titolo sezione + sede. INTEGRATA nel
            contenuto (trasparente, niente bordo, NON sticky) → niente più "barra
            grigia" che resta in alto. Nascosta sulla home (l'hero fa da intestazione). */}
        {!isMobile&&view!=="home"&&(()=>{
          const VIEW_LABELS = {
            home:"Dashboard", giornaliero:"Produzione", "inventario-gusti":"Inventario gusti",
            "quadratura-inventario":"Quadratura inventario",
            chiusura:"Cassa", eventi:"Eventi",
            ricettario:LEX.Ricettario, semilavorati:"Semilavorati", "nuova-ricetta":LEX.nuovaRicetta,
            simulatore:"Food Cost", pl:"P&L", "costi-aziendali":"Costi aziendali",
            magazzino:"Magazzino", scadenzario:"Scadenzario", fornitori:"Fornitori", "vendite-b2b":"Vendite B2B",
            personale:"Personale", haccp:"HACCP", menu:"Menù",
            azioni:"AI Assistant", integrazioni:"Integrazioni", storico:"Storico",
            calendario:"Calendario", previsione:"Previsioni",
            forecast:"Forecast AI", cashflow:"Cashflow", "menu-engineering":"Menu eng.",
            reformulation:"Ottimizza ricette", "competitor-pricing":"Pricing competitor",
            "ai-brain":"Brain AI", "ricette-ai":"Inventa ricette", marketplace:"Marketplace",
            whatsapp:"WhatsApp", documentary:"Documentary",
            "ordini-ai":"Ordini AI", recensioni:"Recensioni AI",
            "scheda-allergeni":"Scheda allergeni", impostazioni:"Impostazioni",
            "sprechi-omaggi":"Perdite & cessioni",
            "confronto-sedi":"Confronto sedi", trasferimenti:"Trasferimenti", changelog:"Novità",
            "importa-dati":"Importa dati", "registro-attivita":"Registro attività",
            // 18 feature AI nuove (2026-06)
            recensioni:"Recensioni AI", "menu-engineering":"Menu engineering", cashflow:"Cashflow",
            forecast:"Forecast AI", reformulation:"Ottimizza ricette AI", "ordini-ai":"Ordini AI fornitori",
            "competitor-pricing":"Pricing vs competitor", "ai-brain":"FoodOS Brain", "ricette-ai":"Inventa ricette AI",
            marketplace:"Marketplace", whatsapp:"WhatsApp Bot", documentary:"Documentary AI",
            "ai-hub":"AI",
          };
          const VIEW_GROUPS = {
            home:"", giornaliero:"Oggi", chiusura:"Oggi", eventi:"Oggi", calendario:"Oggi",
            ricettario:"Ricette & Menù", semilavorati:"Ricette & Menù", "nuova-ricetta":"Ricette & Menù",
            "scheda-allergeni":"Ricette & Menù", menu:"Ricette & Menù",
            simulatore:"Analisi & Numeri", pl:"Analisi & Numeri", "costi-aziendali":"Analisi & Numeri", storico:"Analisi & Numeri", previsione:"Analisi & Numeri", "vendite-b2b":"Analisi & Numeri",
            magazzino:"Magazzino & Fornitori", scadenzario:"Magazzino & Fornitori", "sprechi-omaggi":"Magazzino & Fornitori",
            fornitori:"Magazzino & Fornitori", "importa-dati":"Magazzino & Fornitori",
            personale:"Azienda & Team", haccp:"Azienda & Team", "registro-attivita":"Azienda & Team", "confronto-sedi":"Azienda & Team", trasferimenti:"Azienda & Team", integrazioni:"Azienda & Team",
            // Sezione AI (tutte le 23 funzioni)
            "ai-hub":"AI", "ai-brain":"AI", forecast:"AI", cashflow:"AI", "menu-engineering":"AI", "competitor-pricing":"AI", "ordini-ai":"AI", reformulation:"AI", "ricette-ai":"AI", recensioni:"AI", whatsapp:"AI", marketplace:"AI", documentary:"AI", azioni:"AI",
            impostazioni:"", changelog:"",
          };
          const label = VIEW_LABELS[view] || (typeof view==="string"?view:"");
          const group = VIEW_GROUPS[view] || "";
          return (
            <div style={{maxWidth:L.contentMaxWidth,width:"100%",margin:"0 auto",boxSizing:"border-box",
              padding:"20px 32px 0",display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:14}}>
              <div style={{minWidth:0}}>
                <div style={{fontSize:9.5,color:T.textSoft,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",display:"flex",alignItems:"center",gap:8,marginBottom:3,lineHeight:1}}>
                  <span style={{maxWidth:240,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:T.brand,fontWeight:700,letterSpacing:"0.07em"}}>{nomeAttivita||"FoodOS"}</span>
                  {group&&<>
                    <span style={{color:T.borderStr,fontSize:11}}>›</span>
                    <span style={{color:T.textSoft,letterSpacing:"0.05em"}}>{group}</span>
                  </>}
                </div>
                <h1 style={{margin:0,fontSize:22,fontWeight:700,color:T.text,letterSpacing:"-0.022em",lineHeight:1.1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</h1>
              </div>
              {(sedi||[]).length>0 && !['confronto-sedi','trasferimenti'].includes(view) && <SedeSelector sedi={sedi} sedeAttiva={sedeAttiva} onSelect={onSetSedeAttiva} variant="topbar" />}
            </div>
          );
        })()}
        {/* Mobile topbar — sticky, flat */}
        {isMobile&&(()=>{
          const MOBILE_LABELS = {
            home:"Oggi", giornaliero:"Produzione", "inventario-gusti":"Inventario gusti",
            "quadratura-inventario":"Quadratura",
            chiusura:"Cassa", eventi:"Eventi",
            ricettario:LEX.Ricettario, semilavorati:"Semilavorati", "nuova-ricetta":LEX.nuovaRicetta,
            simulatore:"Food Cost", pl:"P&L", "costi-aziendali":"Costi aziendali",
            magazzino:"Magazzino", scadenzario:"Scadenzario", fornitori:"Fornitori", "vendite-b2b":"Vendite B2B",
            personale:"Personale", haccp:"HACCP", menu:"Menù",
            azioni:"AI Assistant", integrazioni:"Integrazioni", storico:"Storico",
            calendario:"Calendario", previsione:"Previsioni",
            forecast:"Forecast AI", cashflow:"Cashflow", "menu-engineering":"Menu eng.",
            reformulation:"Ottimizza ricette", "competitor-pricing":"Pricing competitor",
            "ai-brain":"Brain AI", "ricette-ai":"Inventa ricette", marketplace:"Marketplace",
            whatsapp:"WhatsApp", documentary:"Documentary",
            "ordini-ai":"Ordini AI", recensioni:"Recensioni AI",
            "scheda-allergeni":"Allergeni", impostazioni:"Impostazioni", "sprechi-omaggi":"Perdite & cessioni",
            "confronto-sedi":"Confronto sedi", trasferimenti:"Trasferimenti", changelog:"Novità",
            "importa-dati":"Importa dati", "registro-attivita":"Registro attività",
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
                <h1 style={{margin:0,fontSize:15,fontWeight:600,color:T.text,letterSpacing:"-0.01em",
                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",lineHeight:1.2}}>{titolo}</h1>
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

        {/* Inner content padding. Suspense globale: copre tutte le view lazy
            (44 component lazy-loaded via React.lazy). Fallback minimale per
            evitare flash bianco — l'utente vede un loader breve. */}
        <div className="fos-page" key={view} style={{padding:isMobile?"16px 16px 88px":"16px 32px 28px",flex:1,maxWidth:L.contentMaxWidth,width:"100%",margin:"0 auto",boxSizing:"border-box"}}>
        <React.Suspense fallback={
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',padding:'60px 20px',color:T.textSoft,fontSize:13,gap:10}}>
            <div style={{width:18,height:18,borderRadius:'50%',border:`2px solid ${T.border}`,borderTopColor:T.brand,animation:'fos_spin 0.6s linear infinite'}}/>
            Caricamento…
            <style>{`@keyframes fos_spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
          </div>
        }>

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

        {/* Vista "Tutte le sedi": le pagine operative richiedono una sede specifica. */}
        {isAllSedi && SEDE_RICHIESTA.has(view) && (
          <div style={{ maxWidth: 560, margin: '40px auto', textAlign: 'center', background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: 18, padding: '32px 28px', boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, background: C.bgSubtle, color: C.textSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 8 }}>Sei in "Tutte le sedi"</div>
            <div style={{ fontSize: 13, color: C.textSoft, lineHeight: 1.55 }}>Questa pagina registra dati di una sede specifica. Scegli una sede dal selettore in alto a destra per continuare.</div>
          </div>
        )}

        {/* Home dashboard */}
        {view==="home"&&<DashboardHomeView ricettario={ricettario} magazzino={magazzino} giornaliero={giornaliero} chiusure={chiusure} actions={actions} setView={setView} orgId={orgId} sedeId={sedeId} nomeAttivita={nomeAttivita} isTrialAttivo={isTrialAttivo} auth={auth} sedi={sedi} sedeAttiva={sedeAttiva} LEX={LEX}/>}

        {/* Formati di vendita (prodotti generici senza dettaglio gusto) */}
        {view==="formati-vendita"&&<FormatiVendita orgId={orgId} ricettario={ricettario} notify={notify} tipoAttivita={tipoAttivita}/>}

        {/* Registro attività — solo titolare (RLS + DIPENDENTE_VIEWS gate). */}
        {view==="registro-attivita"&&<RegistroAttivita orgId={orgId} sedi={sedi} notify={notify}/>}

        {/* Perdite & cessioni — titolare e dipendente, per-sede */}
        {view==="sprechi-omaggi"&&!isAllSedi&&<SpreciOmaggi orgId={orgId} sedeId={sedeId} sedeAttiva={sedeAttiva} ricettario={ricettario} auth={auth} notify={notify}/>}

        {/* Ricettario — mostra upload se non ancora caricato */}
        {view==="ricettario"&&!ricettario&&(
          <div style={{maxWidth:500,margin:"80px auto",textAlign:"center"}}>
            <div style={{marginBottom:18}}><Icon name="book" size={52} color={C.red} /></div>
            <h2 style={{margin:"0 0 10px",fontSize:24,fontWeight:900,color:C.text}}>Carica il {LEX.Ricettario.toLowerCase()}</h2>
            <p style={{color:C.textSoft,marginBottom:32,fontSize:13,lineHeight:1.75}}>Importa il tuo file Excel con le {LEX.ricette} per vedere subito food cost, margini e ricavi per ogni {LEX.prodotto}.</p>
            <label style={{display:"inline-block",padding:"14px 32px",background:C.red,color:C.white,borderRadius:10,cursor:"pointer",fontWeight:800,fontSize:13,boxShadow:"0 4px 16px rgba(110,14,26,0.3)"}}>
              <Icon name="folder" size={14} /> Carica .xlsx {LEX.Ricettario.toLowerCase()}
              <input type="file" accept=".xlsx" multiple style={{display:"none"}} onChange={e=>e.target.files.length&&handleFile(Array.from(e.target.files))}/>
            </label>
          </div>
        )}
        {ricettario&&view==="ricettario"&&<RicettarioView ricettario={ricettario} onUpdateRegola={handleUpdateRegola} onUpload={files=>handleFile(files)} onEditRicetta={(nome)=>{setEditingRicetta(nome);setView("nuova-ricetta");}} LEX={LEX}/>}
        {ricettario&&view==="semilavorati"&&<SemilavoratiView ricettario={ricettario} onSave={handleSalvaRicetta} notify={notify} tipoAttivita={tipoAttivita}/>}
        {ricettario&&view==="pl"&&<PLView ricettario={ricettario} chiusure={chiusure} orgId={orgId} sedeId={sedeId} onUpdateRegola={handleUpdateRegola}/>}
        {ricettario&&view==="simulatore"&&<SimulatorePrezziView ricettario={ricettario} giornaliero={giornaliero} tipoAttivita={tipoAttivita} sedi={sedi}/>}
        {view==="nuova-ricetta"&&<NuovaRicettaView ricettario={ricettario} notify={notify} onSave={handleSalvaRicetta} editingRicetta={editingRicetta} onEditConsumed={()=>setEditingRicetta(null)} LEX={LEX}/>}
        {view==="scheda-allergeni"&&<SchedaAllergeniView ricettario={ricettario} tipoAttivita={tipoAttivita}/>}
        {view==="fornitori"&&<Fornitori orgId={orgId} sedeId={sedeId} sedi={sedi} notify={notify}/>}
        {view==="vendite-b2b"&&<VenditeB2BView orgId={orgId} sedeId={sedeId} ricettario={ricettario} notify={notify}/>}
        {/* Personale espone stipendi: MAI per i dipendenti (oltre a sidebar gate + RLS solo-titolare). */}
        {view==="personale"&&!isDip&&<Personale orgId={orgId} sedeId={sedeId} sedi={sedi} notify={notify} adminNome={auth?.profile?.nome_completo || auth?.user?.email}/>}
        {view==="haccp"&&<HaccpView orgId={orgId} sedeId={sedeId} ricettario={ricettario} nomeAttivita={nomeAttivita} notify={notify}/>}
        {view==="menu"&&<MenuDinamico ricettario={ricettario} ingCosti={ingCostiMain} calcolaFC={calcolaFC} getR={getR} nomeAttivita={nomeAttivita} tipoAttivita={tipoAttivita} chiusure={chiusure} orgId={orgId} sedeId={sedeId}/>}
        {view==="previsione"&&<PrevisioneDomanda ricettario={ricettario} giornaliero={giornaliero} chiusure={chiusure} ingCosti={ingCostiMain} calcolaFC={calcolaFC} getR={getR}/>}
        {view==="chiusura"&&!isAllSedi&&<ChiusuraView ricettario={ricettario} giornaliero={giornaliero} chiusure={chiusure} setChiusure={setChiusure} notify={notify} orgId={orgId} sedeId={sedeId} isDipendente={isDip} LEX={LEX}/>}
        {view==="storico"&&<StoricoProduzioneView ricettario={ricettario} giornaliero={giornaliero} chiusure={chiusure} logPrezzi={logPrezzi} LEX={LEX}/>}
        {view==="magazzino"&&!isAllSedi&&<MagazzinoView ricettario={ricettario} magazzino={magazzino} setMagazzino={setMagazzino} logRif={logRif} setLogRif={setLogRif} logPrezzi={logPrezzi} onUpdatePrezzoIng={handleUpdatePrezzoIng} giornaliero={giornaliero} notify={notify} esclusi={esclusi} setEsclusi={setEsclusi} onImportPrezzi={handleImportPrezzi} onImportPrezziOCR={handleImportPrezziOCR} orgId={orgId} sedeId={sedeId} isDipendente={isDip} LEX={LEX}/>}
        {view==="giornaliero"&&!isAllSedi&&<ProduzioneGiornalieraView ricettario={ricettario} magazzino={magazzino} setMagazzino={setMagazzino} giornaliero={giornaliero} setGiornaliero={setGiornaliero} notify={notify} sedi={sedi} sedeAttiva={sedeAttiva} orgId={orgId} sedeId={sedeId} isDipendente={isDip} LEX={LEX}/>}
        {view==="inventario-gusti"&&<InventarioSettimanaleView orgId={orgId} sedeId={sedeId} sedi={sedi} sedeAttiva={sedeAttiva} ricettario={ricettario} magazzino={magazzino} setMagazzino={setMagazzino} tipoAttivita={tipoAttivita} notify={notify}/>}
        {view==="quadratura-inventario"&&<QuadraturaInventarioView orgId={orgId} sedeId={sedeId} sedi={sedi} sedeAttiva={sedeAttiva} chiusure={chiusure}/>}
        {view==="costi-aziendali"&&<CostiAziendaliView orgId={orgId} sedeId={sedeId} sedi={sedi} notify={notify}/>}
        {view==="azioni"&&<AzioniView actions={actions} onUpdate={handleUpdAct} onDelete={handleDelAct} ricettario={ricettario} giornaliero={giornaliero} chiusure={chiusure} magazzino={magazzino} nomeAttivita={auth?.org?.nome} tipoAttivita={tipoAttivita}/>}
        {view==="impostazioni"&&<Impostazioni auth={auth} nomeAttivita={nomeAttivita} tipoAttivita={tipoAttivita} piano={piano} orgId={orgId} sedi={sedi} onImportPrezzi={handleImportPrezzi} notify={notify} onChangelogOpen={()=>setView("changelog")}/>}
        {view==="importa-dati"&&<ImportaDatiView
          onImportRicettario={handleFile}
          onImportPrezzi={handleImportPrezzi}
          onImportDelivery={handleImportDeliveryGlobal}
          onImportCasse={handleImportCasseGlobal}
          onImportFatture={handleImportFattureGlobal}
          notify={notify}/>}
        {view==="confronto-sedi"&&(canAccessView("confronto-sedi",piano,auth?.user?.email)?<ConfrontoSedi orgId={orgId} sedi={sedi}/>:<UpgradeGate view="confronto-sedi" onUpgrade={()=>setView("impostazioni")}/>)}
        {view==="eventi"&&<EventiView orgId={orgId} sedeId={sedeId} ricettario={ricettario} notify={notify} nomeAttivita={nomeAttivita} tipoAttivita={tipoAttivita}/>}
        {view==="trasferimenti"&&!isAllSedi&&(canAccessView("trasferimenti",piano,auth?.user?.email)?<TrasferimentiView orgId={orgId} sedi={sedi} sedeAttiva={sedeAttiva} notify={notify}/>:<UpgradeGate view="trasferimenti" onUpgrade={()=>setView("impostazioni")}/>)}
        {view==="integrazioni"&&(canAccessView("integrazioni",piano,auth?.user?.email)?<Integrazioni orgId={orgId} sedeId={sedeId} notify={notify}/>:<UpgradeGate view="integrazioni" onUpgrade={()=>setView("impostazioni")}/>)}
        {view==="scadenzario"&&<Scadenzario orgId={orgId} sedeId={sedeId} sedi={sedi}/>}
        {view==="changelog"&&<ChangelogView/>}
        {view==="recensioni"&&<RecensioniView nomeAttivita={nomeAttivita}/>}
        {view==="menu-engineering"&&<MenuEngineeringView orgId={orgId} sedeId={sedeId} ricettario={ricettario} sedeAttiva={sedeAttiva}/>}
        {view==="cashflow"&&<CashflowView orgId={orgId} sedeId={sedeId}/>}
        {view==="forecast"&&<ForecastView orgId={orgId} sedeId={sedeId} sedeAttiva={sedeAttiva} setView={setView}/>}
        {view==="reformulation"&&<ReformulationView ricettario={ricettario} orgId={orgId}/>}
        {view==="ordini-ai"&&<OrdiniAiView orgId={orgId} sedeId={sedeId}/>}
        {view==="competitor-pricing"&&<CompetitorPricingView orgId={orgId} sedeId={sedeId} ricettario={ricettario}/>}
        {view==="ai-brain"&&(canAccessView("ai-brain",piano,auth?.user?.email)?<BrainView orgId={orgId} sedeId={sedeId} user={auth?.user} nomeAttivita={nomeAttivita}/>:<UpgradeGate view="ai-brain" onUpgrade={()=>setView("impostazioni")}/>)}
        {view==="ricette-ai"&&(canAccessView("ricette-ai",piano,auth?.user?.email)?<RecipeInventorView orgId={orgId} user={auth?.user} nomeAttivita={nomeAttivita}/>:<UpgradeGate view="ricette-ai" onUpgrade={()=>setView("impostazioni")}/>)}
        {view==="marketplace"&&(canAccessView("marketplace",piano,auth?.user?.email)?<MarketplaceView/>:<UpgradeGate view="marketplace" onUpgrade={()=>setView("impostazioni")}/>)}
        {view==="whatsapp"&&(canAccessView("whatsapp",piano,auth?.user?.email)?<WhatsAppView orgId={orgId} user={auth?.user}/>:<UpgradeGate view="whatsapp" onUpgrade={()=>setView("impostazioni")}/>)}
        {view==="documentary"&&(canAccessView("documentary",piano,auth?.user?.email)?<DocumentaryView orgId={orgId} nomeAttivita={nomeAttivita}/>:<UpgradeGate view="documentary" onUpgrade={()=>setView("impostazioni")}/>)}
        {view==="ai-hub"&&<AiHubView orgId={orgId} setView={setView} piano={piano} userEmail={auth?.user?.email}/>}
        <CommandPalette open={cmdkOpen} onClose={()=>setCmdkOpen(false)} onNavigate={(v)=>setView(v)} orgId={orgId}/>
        {upgradeModal && (
          <UpgradeModal
            featureName={upgradeModal.featureName}
            requiredPlan={upgradeModal.requiredPlan}
            onClose={()=>setUpgradeModal(null)}
            onCta={()=>setView("impostazioni")}
          />
        )}
        {view==="calendario"&&<CalendarioOperativo giornaliero={giornaliero} chiusure={chiusure} orgId={orgId} sedeId={sedeId} setView={setView} notify={notify} isMobile={isMobile} isDipendente={isDip}/>}
        {currentMese&&!["home","ricettario","semilavorati","pl","simulatore","azioni","magazzino","giornaliero","nuova-ricetta","storico","chiusura","impostazioni","confronto-sedi","trasferimenti","integrazioni","scadenzario","calendario","changelog","scheda-allergeni","fornitori","personale","menu","previsione","eventi","importa-dati","recensioni","menu-engineering","cashflow","ai-brain","forecast","reformulation","ordini-ai","competitor-pricing","ricette-ai","marketplace","documentary","whatsapp"].includes(view)&&(
          <ProduzioneView key={view} ricettario={ricettario} mese={currentMese} onSave={e=>handleSave(view,e)} onAddAction={handleAddAct}/>
        )}
        </React.Suspense>
        </div>{/* /fos-page */}
      </div>

      {/* AI Assistant — floating button su tutte le pagine (lazy → Suspense) */}
      <React.Suspense fallback={null}><AIAssistant /></React.Suspense>
    </div>
    </ErrorBoundary>
  );
}


// Rendering handled by src/main.jsx via App.jsx
