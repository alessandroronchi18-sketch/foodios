// StoricoProduzioneView — Storico produzioni con grafici. Estratta da Dashboard.jsx.
import React, { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend, ReferenceLine } from 'recharts'
import useIsMobile, { useIsTablet } from '../lib/useIsMobile'
import { color as T } from '../lib/theme'
import { buildIngCosti, calcolaFCStorico, getR } from '../lib/foodcost'
import { lessico } from '../lib/lessico'
import Icon from '../components/Icon'
import { C, KPI, SH, margColor, margBadge, fmt, fmt0, fmtp, ChartTip, Tip } from './_shared'

// Audit UI 2026-06-24:
// - assi grafici: fontSize 11, color #64748B, grid stroke #E5E9EF dashed
// - bar radius [6,6,0,0] in cima allo stack
// - € DOPO la cifra ovunque ("1.234 €")
// - numeri ≥ 1000 con separatore migliaia IT
// - layout colonna su mobile dove i flex accavallano (diagnosi, filtri, KPI strip)
// - sort header keyboard accessibili + touch target ≥ 40px
// - tabelle larghe scrollabili con minWidth + sticky prima colonna
// - input date font ≥ 16px su mobile per evitare zoom iOS
const AXIS_TICK    = { fill:'#64748B', fontSize:11 }
const GRID_STROKE  = '#E5E9EF'
const BAR_RADIUS_TOP = [6,6,0,0]
// Formattatori asse Y: importo in IT, € dopo la cifra.
const yEUR = v => `${Number(v||0).toLocaleString('it-IT')} €`
const yPCT = v => `${v}%`

// Nomi mese italiani per fmtKey (vista="mese"). L'index 0 è vuoto perché
// k.slice(5) restituisce mesi 01-12 e parseInt('01') = 1.
const MN = ['', 'Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

export default function StoricoProduzioneView({ ricettario, giornaliero, chiusure, logPrezzi = [], LEX = lessico() }) {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
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
        // Fallback su uppercase per nomi legacy: se cerchiamo per esatto e non
        // c'e' match, riproviamo con UPPER().trim() — altrimenti getR cade su
        // unita/prezzo di default e il margine apparirebbe 100% (rv calcolato,
        // fc=0).
        const ric = ricettario?.ricette?.[prod.nome]
          || ricettario?.ricette?.[(prod.nome || '').toUpperCase().trim()];
        const reg = getR(prod.nome, ric);
        // Food cost STORICO: usa il prezzo materie prime valido nella data della sessione,
        // così le produzioni passate non vengono "rivalutate" se i prezzi cambiano oggi.
        const {tot:fc} = ric
          ? calcolaFCStorico(ric, ingCosti, ricettario, logPrezzi, sess.data + 'T12:00:00')
          : {tot:0};
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

  // Grafico produzione: top 5 ricette per stampi totali + "Altri". Impilare una
  // serie per OGNI ricetta (decine) con pochi colori rendeva il grafico
  // illeggibile; così l'altezza resta = stampi totali ma il mix è chiaro.
  const ALTRI_COLOR = "#B8AEA8";
  const topRicetteProd = (() => {
    const tot = {};
    for (const p of periodiProd) for (const [k,v] of Object.entries(p.byRicetta)) tot[k]=(tot[k]||0)+v;
    return Object.entries(tot).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k])=>k);
  })();
  const dataProdTop = periodiProd.map(p=>{
    const row = { label:p.label };
    let altri = 0;
    for (const [k,v] of Object.entries(p.byRicetta)) {
      if (topRicetteProd.includes(k)) row[k]=v; else altri+=v;
    }
    if (altri>0) row["Altri"]=+altri.toFixed(0);
    return row;
  });
  const seriesProd = [...topRicetteProd, ...(dataProdTop.some(d=>d["Altri"]>0)?["Altri"]:[])];
  // Colore di ogni prodotto = quello della sua colonna nello stack (Altri = grigio).
  const prodColor = {};
  topRicetteProd.forEach((n,i)=>{ prodColor[n] = STACK_COLORS[i%STACK_COLORS.length]; });
  const colorOf = n => prodColor[n] || ALTRI_COLOR;

  // Tooltip del grafico produzione: per OGNI periodo i prodotti ordinati per
  // quantità desc (top 7). L'ordine può variare da un giorno all'altro.
  const prodByDay = {};
  for (const p of periodiProd) {
    const sorted = Object.entries(p.byRicetta).sort((a,b)=>b[1]-a[1]);
    prodByDay[p.label] = { top: sorted.slice(0,7), tot: sorted.reduce((s,[,v])=>s+v,0), extra: Math.max(0, sorted.length-7) };
  }
  const ProdTooltip = ({ active, label }) => {
    const d = active && prodByDay[label];
    if (!d) return null;
    return (
      <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:10, padding:'10px 12px', boxShadow:'0 8px 24px rgba(15,23,42,0.14)', minWidth:190 }}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:14, alignItems:'baseline', marginBottom:7, paddingBottom:6, borderBottom:`1px solid ${C.border}` }}>
          <span style={{ fontSize:11.5, fontWeight:800, color:C.text }}>{label}</span>
          <span style={{ fontSize:10.5, fontWeight:700, color:C.textSoft, fontVariantNumeric:'tabular-nums' }}>{n0(d.tot)} stampi</span>
        </div>
        {d.top.map(([nome,q],i)=>{
          const col = colorOf(nome);
          return (
          <div key={nome} style={{ display:'flex', justifyContent:'space-between', gap:14, alignItems:'baseline', padding:'2px 0' }}>
            <span style={{ fontSize:11, fontWeight:600, color:col, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:170 }}>
              <span style={{ display:'inline-block', width:15, color:C.textSoft, fontWeight:700 }}>{i+1}</span>{nome}
            </span>
            <span style={{ fontSize:11, fontWeight:800, color:col, fontVariantNumeric:'tabular-nums', flexShrink:0 }}>{n0(q)}</span>
          </div>
        );})}
        {d.extra>0 && <div style={{ fontSize:10, color:C.textSoft, marginTop:5 }}>+{d.extra} altri prodotti</div>}
      </div>
    );
  };

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

  // Formattazione box grandi: arrotonda all'unità + separatore migliaia IT (1.000).
  // useGrouping:'always' obbligatorio: senza, "4715" appare senza separatore migliaia
  // su Safari iOS private / Node senza ICU full. Vedi _shared.jsx.
  const _NF0_S = new Intl.NumberFormat('it-IT', { useGrouping: 'always', maximumFractionDigits: 0 });
  const _NF2_S = new Intl.NumberFormat('it-IT', { useGrouping: 'always', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const eur0 = n => `${_NF0_S.format(Math.round(Number(n)||0))} €`;
  const n0   = n => `${_NF0_S.format(Math.round(Number(n)||0))}`;
  // Tabelle: € con separatore migliaia IT + 2 decimali (es. € 1.234,56).
  const eurIT = v => `${_NF2_S.format(Number(v)||0)} €`;

  // ── DIAGNOSI: KPI di salute sul periodo selezionato + confronto col precedente ──
  // I numeri "reali" vengono dalle chiusure (periodiVend); se non ci sono chiusure
  // in range si ripiega sul ricavo/margine STIMATO dalla produzione, così la banda
  // resta sempre informativa. Il confronto usa la finestra di pari ampiezza (stesso
  // numero di periodi) immediatamente precedente, calcolata sui dati NON filtrati.
  const diagnosi = useMemo(()=>{
    const usaVend = periodiVend.length>0;
    // Aggrega un set di period-bucket in metriche di salute.
    const aggrega = (vendList, prodList) => {
      if (vendList.length>0) {
        const rv  = vendList.reduce((s,p)=>s+p.rvTot,0);
        const fc  = vendList.reduce((s,p)=>s+p.fcTot,0);
        const spr = vendList.reduce((s,p)=>s+p.sproTot,0);
        const st  = vendList.reduce((s,p)=>s+p.avgST,0)/vendList.length;
        return { rv, marg:rv-fc, margPct:rv>0?((rv-fc)/rv*100):0, st, spreco:spr, stimato:false };
      }
      // fallback stimato da produzione (niente sell-through reale, niente spreco)
      const rv = prodList.reduce((s,p)=>s+p.ricavoTot,0);
      const fc = prodList.reduce((s,p)=>s+p.fcTot,0);
      return { rv, marg:rv-fc, margPct:rv>0?((rv-fc)/rv*100):0, st:null, spreco:null, stimato:true };
    };
    const cur = aggrega(periodiVend, periodiProd);

    // Finestra precedente: stessi N period-key, presi prima del più vecchio in range.
    // Ricostruisco i bucket sull'INTERO dataset (non filtrato) per avere lo storico.
    const buildKeys = (list, getD) => {
      const m = {};
      for (const it of (list||[])) { const k=getKey(getD(it)); (m[k]=m[k]||[]).push(it); }
      return m;
    };
    const allChiuByKey = buildKeys(chiusure, c=>c.data);
    const allProdByKey = buildKeys(giornaliero, s=>s.data);
    const refList = usaVend ? periodiVend : periodiProd;
    const curKeys = refList.map(p=>p.key).sort();
    let prev = null;
    if (curKeys.length>0) {
      const allKeysSorted = [...new Set([...Object.keys(allChiuByKey), ...Object.keys(allProdByKey)])].sort();
      const oldest = curKeys[0];
      const before = allKeysSorted.filter(k=>k<oldest);
      const prevKeys = before.slice(-curKeys.length); // finestra di pari ampiezza
      if (prevKeys.length>0) {
        if (usaVend) {
          // ricalcola le metriche vendite sui prevKeys
          let rv=0,fc=0,spr=0,stSum=0,stCnt=0;
          for (const k of prevKeys) for (const ch of (allChiuByKey[k]||[])) {
            rv+=ch.kpi?.totV||0; fc+=ch.kpi?.totFC||0; spr+=ch.kpi?.totS||0; stSum+=ch.kpi?.avgST||0; stCnt++;
          }
          if (stCnt>0) prev = { rv, margPct:rv>0?((rv-fc)/rv*100):0, st:stSum/stCnt, spreco:spr };
        } else {
          let rv=0,fc=0;
          for (const k of prevKeys) for (const sess of (allProdByKey[k]||[])) {
            for (const prod of (sess.prodotti||[])) {
              const ric = ricettario?.ricette?.[prod.nome]
                || ricettario?.ricette?.[(prod.nome || '').toUpperCase().trim()];
              const reg = getR(prod.nome, ric);
              const {tot:f} = ric ? calcolaFCStorico(ric, ingCosti, ricettario, logPrezzi, sess.data+'T12:00:00') : {tot:0};
              rv += prod.stampi*reg.unita*reg.prezzo; fc += prod.stampi*f;
            }
          }
          if (rv>0) prev = { rv, margPct:rv>0?((rv-fc)/rv*100):0, st:null, spreco:null };
        }
      }
    }
    return { cur, prev, usaVend };
  }, [periodiVend, periodiProd, chiusure, giornaliero, vista, ricettario, ingCosti, logPrezzi]);

  // Variazione % vs periodo precedente (per le frecce). null se non confrontabile.
  const deltaPct = (now, before) => (before==null || before===0 || now==null) ? null : ((now-before)/Math.abs(before)*100);
  // Semaforo: verde/ambra/rosso secondo soglie passate.
  const semaforo = (val, green, amber) => val==null ? C.textSoft : val>=green ? C.green : val>=amber ? C.amber : C.red;
  // Freccia di confronto: ▲ verde / ▼ rosso (o invertita per metriche dove "meno è meglio").
  const Delta = ({ now, before, invert=false, suffix='%' }) => {
    const d = deltaPct(now, before);
    if (d==null) return <span style={{fontSize:11,color:C.textSoft,fontWeight:600}}>n/d</span>;
    const positivo = invert ? d<0 : d>0;
    const col = Math.abs(d)<0.05 ? C.textSoft : positivo ? C.green : C.red;
    return (
      <span style={{display:'inline-flex',alignItems:'center',gap:3,fontSize:11.5,fontWeight:800,color:col,fontVariantNumeric:'tabular-nums'}}>
        <Icon name={d>=0?'trendUp':'trendDown'} size={12} />{d>=0?'+':''}{d.toFixed(1)}{suffix}
      </span>
    );
  };

  // ── RANKING PRODOTTI: migliori/peggiori per sell-through e per margine % ──────
  // Aggrega le righe `confronto` delle chiusure IN RANGE per prodotto. Sell-through
  // e margine% sono pesati (somma unità / somma ricavo), non medie semplici, così
  // un prodotto venduto poco non falsa la classifica.
  const ranking = useMemo(()=>{
    const chiuFiltered = filterByDate(chiusure||[], c=>c.data);
    const byProd = {};
    for (const ch of chiuFiltered) {
      for (const r of (ch.confronto||[])) {
        const nome = r.nome;
        if (!byProd[nome]) byProd[nome] = { nome, unitaP:0, unitaV:0, rv:0, marg:0, spreco:0 };
        byProd[nome].unitaP += r.unitaP||0;
        byProd[nome].unitaV += r.unitaV||0;
        byProd[nome].rv     += r.rv||0;
        byProd[nome].marg   += r.marg||0;
        byProd[nome].spreco += r.spreco||0;
      }
    }
    const rows = Object.values(byProd).map(p=>({
      ...p,
      st:      p.unitaP>0 ? (p.unitaV/p.unitaP*100) : null,
      margPct: p.rv>0     ? (p.marg/p.rv*100)       : null,
    }));
    // Solo prodotti con dati sensati per ciascuna classifica.
    const conST   = rows.filter(p=>p.st!=null && p.unitaP>0);
    const conMarg = rows.filter(p=>p.margPct!=null && p.rv>0);
    const byST   = [...conST].sort((a,b)=>b.st-a.st);
    const byMarg = [...conMarg].sort((a,b)=>b.margPct-a.margPct);
    return {
      hasData: rows.length>0,
      stTop:   byST.slice(0,4),
      stBot:   byST.slice(-4).reverse(),
      margTop: byMarg.slice(0,4),
      margBot: byMarg.slice(-4).reverse(),
    };
  }, [chiusure, dateFrom, dateTo]);

  // Vendite: top 5 prodotti per ricavo + "Altri" (come per la produzione),
  // così il grafico ricavi reali resta leggibile invece di impilare decine di serie.
  const topProdVend = (() => {
    const tot = {};
    for (const p of periodiVend) for (const [k,v] of Object.entries(p.byProd)) tot[k]=(tot[k]||0)+(v.rv||0);
    return Object.entries(tot).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k])=>k);
  })();
  const dataVendTop = periodiVend.map(p=>{
    const row = { label:p.label };
    let altri = 0;
    for (const [k,v] of Object.entries(p.byProd)) {
      const rv = +(v.rv||0).toFixed(2);
      if (topProdVend.includes(k)) row[k]=rv; else altri+=rv;
    }
    if (altri>0) row["Altri"]=+altri.toFixed(2);
    return row;
  });
  const seriesVend = [...topProdVend, ...(dataVendTop.some(d=>d["Altri"]>0)?["Altri"]:[])];
  // Tooltip ricavi reali: per ogni periodo i prodotti per ricavo desc (top 7).
  const vendByDay = {};
  for (const p of periodiVend) {
    const sorted = Object.entries(p.byProd).map(([n,v])=>[n, v.rv||0]).sort((a,b)=>b[1]-a[1]);
    vendByDay[p.label] = { top: sorted.slice(0,7), tot: sorted.reduce((s,[,v])=>s+v,0), extra: Math.max(0, sorted.length-7) };
  }
  const VendTooltip = ({ active, label }) => {
    const d = active && vendByDay[label];
    if (!d) return null;
    return (
      <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:10, padding:'10px 12px', boxShadow:'0 8px 24px rgba(15,23,42,0.14)', minWidth:210 }}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:14, alignItems:'baseline', marginBottom:7, paddingBottom:6, borderBottom:`1px solid ${C.border}` }}>
          <span style={{ fontSize:11.5, fontWeight:800, color:C.text }}>{label}</span>
          <span style={{ fontSize:10.5, fontWeight:700, color:C.green, fontVariantNumeric:'tabular-nums' }}>{eur0(d.tot)}</span>
        </div>
        {d.top.map(([nome,v],i)=>(
          <div key={nome} style={{ display:'flex', justifyContent:'space-between', gap:14, alignItems:'baseline', padding:'2px 0' }}>
            <span style={{ fontSize:11, color:C.textMid, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:180 }}>
              <span style={{ display:'inline-block', width:15, color:C.textSoft, fontWeight:700 }}>{i+1}</span>{nome}
            </span>
            <span style={{ fontSize:11, fontWeight:800, color:C.text, fontVariantNumeric:'tabular-nums', flexShrink:0 }}>{eur0(v)}</span>
          </div>
        ))}
        {d.extra>0 && <div style={{ fontSize:10, color:C.textSoft, marginTop:5 }}>+{d.extra} altri prodotti</div>}
      </div>
    );
  };

  // Conto economico reale: dove va ogni euro incassato (margine vs food cost) + spreco.
  const contoByDay = {};
  for (const p of periodiVend) contoByDay[p.label] = { ricavo:p.rvTot, fc:p.fcTot, marg:p.margTot, spreco:p.sproTot };
  const ContoTooltip = ({ active, label }) => {
    const d = active && contoByDay[label];
    if (!d) return null;
    const pctOf = x => d.ricavo>0 ? `${(x/d.ricavo*100).toFixed(0)}%` : '—';
    const Row = (col, nome, val, sub) => (
      <div style={{ display:'flex', justifyContent:'space-between', gap:16, alignItems:'baseline', padding:'2px 0' }}>
        <span style={{ fontSize:11, fontWeight:600, color:col, display:'flex', alignItems:'center', gap:6 }}><span style={{width:9,height:9,borderRadius:2,background:col,display:'inline-block'}}/>{nome}</span>
        <span style={{ fontSize:11, fontWeight:800, color:col, fontVariantNumeric:'tabular-nums', flexShrink:0 }}>{eur0(val)} <span style={{color:C.textSoft,fontWeight:600}}>· {sub}</span></span>
      </div>
    );
    return (
      <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:10, padding:'10px 12px', boxShadow:'0 8px 24px rgba(15,23,42,0.14)', minWidth:230 }}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:14, alignItems:'baseline', marginBottom:7, paddingBottom:6, borderBottom:`1px solid ${C.border}` }}>
          <span style={{ fontSize:11.5, fontWeight:800, color:C.text }}>{label}</span>
          <span style={{ fontSize:10.5, fontWeight:700, color:C.text }}>Ricavo {eur0(d.ricavo)}</span>
        </div>
        {Row(C.green, 'Margine (quello che resta)', d.marg, pctOf(d.marg))}
        {Row(C.red, 'Food cost (ingredienti venduti)', d.fc, pctOf(d.fc))}
        {d.spreco>0.01 && Row(C.amber, 'Spreco (invenduto buttato)', d.spreco, pctOf(d.spreco))}
      </div>
    );
  };

  // Andamento economico (stimato, da produzione): margine vs food cost per periodo.
  const ecoProdByDay = {};
  for (const p of periodiProd) ecoProdByDay[p.label] = { ricavo:p.ricavoTot, fc:p.fcTot, marg:p.margine };
  const EcoProdTooltip = ({ active, label }) => {
    const d = active && ecoProdByDay[label];
    if (!d) return null;
    const pctOf = x => d.ricavo>0 ? `${(x/d.ricavo*100).toFixed(0)}%` : '—';
    const Row = (col, nome, val, sub) => (
      <div style={{ display:'flex', justifyContent:'space-between', gap:16, alignItems:'baseline', padding:'2px 0' }}>
        <span style={{ fontSize:11, fontWeight:600, color:col, display:'flex', alignItems:'center', gap:6 }}><span style={{width:9,height:9,borderRadius:2,background:col,display:'inline-block'}}/>{nome}</span>
        <span style={{ fontSize:11, fontWeight:800, color:col, fontVariantNumeric:'tabular-nums', flexShrink:0 }}>{eur0(val)} <span style={{color:C.textSoft,fontWeight:600}}>· {sub}</span></span>
      </div>
    );
    return (
      <div style={{ background:C.white, border:`1px solid ${C.border}`, borderRadius:10, padding:'10px 12px', boxShadow:'0 8px 24px rgba(15,23,42,0.14)', minWidth:230 }}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:14, alignItems:'baseline', marginBottom:7, paddingBottom:6, borderBottom:`1px solid ${C.border}` }}>
          <span style={{ fontSize:11.5, fontWeight:800, color:C.text }}>{label}</span>
          <span style={{ fontSize:10.5, fontWeight:700, color:C.text }}>Ricavo stim. {eur0(d.ricavo)}</span>
        </div>
        {Row(C.green, 'Margine stimato', d.marg, pctOf(d.marg))}
        {Row(C.red, 'Food cost', d.fc, pctOf(d.fc))}
      </div>
    );
  };

  // Riepilogo periodi: ordinamento per colonna (click sull'intestazione).
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState('desc');
  // Storico chiusure: ordinamento per colonna.
  const [chiSort, setChiSort] = useState({ key: 'data', dir: 'desc' });
  // Zoom asse Y del grafico Sell-Through (0/25/50 → 100) per leggere meglio le barre.
  const [stZoom, setStZoom] = useState(0);
  const COLS_RIEP = [
    { label:'Periodo',      key:'periodo',  get:p=>p.key,                 str:true, align:'left' },
    { label:'Sessioni',     key:'sessioni', get:p=>p.sessioni.length },
    { label:'Stampi',       key:'stampi',   get:p=>p.stampiTot },
    { label:'Ricavo stim.', key:'ricavo',   get:p=>p.ricavoTot },
    { label:'Food Cost',    key:'fc',       get:p=>p.fcTot },
    { label:'Margine',      key:'margine',  get:p=>p.margine },
    { label:'Marg%',        key:'margpct',  get:p=>p.margPct },
    { label:`Top ${LEX.prodotto}`, key:'top', get:p=>{const t=Object.entries(p.byRicetta).sort((a,b)=>b[1]-a[1])[0];return t?t[0]:'';}, str:true },
  ];
  const sortedPeriodi = (() => {
    const base = [...periodiProd];
    if (!sortBy) return base.reverse(); // default: cronologico decrescente
    const col = COLS_RIEP.find(c=>c.key===sortBy) || COLS_RIEP[0];
    const dir = sortDir==='asc'?1:-1;
    return base.sort((a,b)=>{ const va=col.get(a), vb=col.get(b); return (col.str?String(va).localeCompare(String(vb)):(va-vb))*dir; });
  })();
  const clickSort = key => { if (sortBy===key) setSortDir(d=>d==='asc'?'desc':'asc'); else { setSortBy(key); setSortDir(key==='periodo'||key==='top'?'asc':'desc'); } };
  // Ricavo massimo tra i periodi: scala per le barre intuitive nel riepilogo.
  const maxRicPeriodo = Math.max(1, ...periodiProd.map(p=>p.ricavoTot));

  const hasProd = giornaliero?.length>0;
  const hasVend = chiusure?.length>0;

  if (!hasProd && !hasVend) return (
    <div style={{maxWidth:560,margin:"80px auto",textAlign:"center",padding:'32px 24px',background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:18,boxShadow:'0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)'}}>
      <div style={{marginBottom:14,opacity:0.6,color:C.textSoft}}><Icon name="barChart" size={42} /></div>
      <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:8,letterSpacing:'-0.01em'}}>Nessun dato storico</div>
      <div style={{fontSize:13,color:C.textSoft,lineHeight:1.55,maxWidth:420,margin:'0 auto'}}>
        Lo storico si popola automaticamente con le sessioni di <b>Produzione</b> e le <b>Chiusure cassa</b> registrate. Apri quelle sezioni dal menu a sinistra per iniziare.
      </div>
    </div>
  );

  return (
    <div style={{maxWidth: 1200, boxSizing:'border-box', width:'100%'}}>
      {/* Tab principali — centrali, larghe e ben visibili */}
      <div style={{display:"flex",justifyContent:"center",marginBottom:12}}>
        <div style={{display:"flex",gap:4,background:C.bgSubtle,border:`1px solid ${C.border}`,borderRadius:14,padding:4,width:"100%",maxWidth:540,boxSizing:'border-box'}}>
          {[["produzione","package","Produzione"],["vendite","money","Vendite"],["confronto","refresh","Confronto"]].map(([id,ic,lbl])=>(
            <button key={id} onClick={()=>setTab(id)} aria-pressed={tab===id} aria-label={`Tab ${lbl}`}
              style={{flex:1,padding:isMobile?"11px 8px":"13px 16px",minHeight:44,borderRadius:10,border:"none",cursor:"pointer",
                fontWeight:700,fontSize:isMobile?12:14,background:tab===id?C.red:"transparent",
                color:tab===id?C.white:C.textMid,boxShadow:tab===id?"0 2px 10px rgba(110,14,26,0.28)":"none",
                transition:"all 0.15s",whiteSpace:"nowrap",display:"flex",alignItems:"center",justifyContent:"center",gap:7}}>
              <Icon name={ic} size={16} />{lbl}
            </button>
          ))}
        </div>
      </div>
      {/* Vista temporale — centrata, secondaria */}
      <div style={{display:"flex",justifyContent:"center",marginBottom:18}}>
        <div style={{display:"flex",background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:10,padding:3,gap:2,boxShadow:"0 1px 2px rgba(15,23,42,0.04)"}}>
          {[["giornaliero","Giorno"],["settimana","Settimana"],["mese","Mese"]].map(([id,lbl])=>(
            <button key={id} onClick={()=>setVista(id)} aria-pressed={vista===id}
              style={{padding:"9px 18px",minHeight:40,borderRadius:7,border:"none",cursor:"pointer",fontWeight:600,fontSize:12,background:vista===id?C.redLight:"transparent",color:vista===id?C.red:C.textMid,transition:"all 0.15s"}}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* ─── FILTRI DATA ─── */}
      <div style={{display:"flex",gap:10,marginBottom:18,flexWrap:"wrap",
        padding:isMobile?"12px 14px":"12px 16px",background:C.bgCard,borderRadius:12,border:`1px solid ${C.border}`,boxShadow:"0 1px 2px rgba(15,23,42,0.04)",
        flexDirection:isMobile?'column':'row',alignItems:isMobile?'stretch':'center',boxSizing:'border-box',width:'100%'}}>
        <span style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",color:C.textSoft,alignSelf:isMobile?'flex-start':'auto'}}>Periodo</span>
        <div style={{display:'flex',gap:8,alignItems:'center',flex:1,flexWrap:'wrap',width:isMobile?'100%':'auto'}}>
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} aria-label="Data inizio"
            style={{padding:"10px 12px",minHeight:40,borderRadius:8,border:`1px solid ${C.borderStr}`,fontSize:isMobile?16:13,color:C.text,background:C.white,flex:1,minWidth:isMobile?'45%':140,boxSizing:'border-box'}}/>
          <span style={{fontSize:12,color:C.textSoft,fontWeight:600}} aria-hidden="true">→</span>
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} aria-label="Data fine"
            style={{padding:"10px 12px",minHeight:40,borderRadius:8,border:`1px solid ${C.borderStr}`,fontSize:isMobile?16:13,color:C.text,background:C.white,flex:1,minWidth:isMobile?'45%':140,boxSizing:'border-box'}}/>
        </div>
        {(dateFrom||dateTo)&&<div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',width:isMobile?'100%':'auto'}}>
          <button onClick={()=>{setDateFrom("");setDateTo("");}} aria-label="Azzera filtro periodo"
            style={{padding:"8px 14px",minHeight:40,borderRadius:8,border:`1px solid ${C.border}`,background:C.white,color:C.textSoft,fontSize:12,fontWeight:600,cursor:"pointer",display:'inline-flex',alignItems:'center',gap:6}}>
            <Icon name="x" size={12}/>Reset
          </button>
          <span style={{fontSize:11,color:C.amber,fontWeight:600,display:"inline-flex",alignItems:"center",gap:4,whiteSpace:'nowrap'}}>
            <Icon name="search" size={11} />{[dateFrom&&`Da ${dateFrom}`,dateTo&&`a ${dateTo}`].filter(Boolean).join(" ")}
          </span>
        </div>}
      </div>

      {/* ─── BANDA DIAGNOSI (sempre visibile, sul periodo selezionato) ─── */}
      {(() => {
        const { cur, prev, usaVend } = diagnosi;
        const stimato = cur.stimato;
        // Soglie: margine verde≥60 / ambra≥40; sell-through verde≥85 / ambra≥65 (coerenti col resto della view).
        const margC = semaforo(cur.margPct, 60, 40);
        const stC   = cur.st!=null ? semaforo(cur.st, 85, 65) : C.textSoft;
        const periodoTxt = (dateFrom||dateTo)
          ? [dateFrom&&`dal ${dateFrom}`, dateTo&&`al ${dateTo}`].filter(Boolean).join(' ')
          : 'tutto lo storico disponibile';
        const Cell = ({ icon, label, value, color, sub, delta, tip }) => (
          <div style={{flex:1,minWidth:isMobile?'45%':140,padding:isMobile?'12px 12px':'14px 16px',
            display:'flex',flexDirection:'column',gap:5,boxSizing:'border-box',
            borderRight:isMobile?'none':`1px solid rgba(255,255,255,0.10)`}}>
            <div style={{display:'flex',alignItems:'center',gap:6,minHeight:20}}>
              <span style={{display:'inline-flex',color:'rgba(255,255,255,0.55)'}}><Icon name={icon} size={14} /></span>
              <span style={{fontSize:10,fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',color:'rgba(255,255,255,0.7)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                {tip ? <Tip text={tip}><span style={{cursor:'help',borderBottom:'1px dotted rgba(255,255,255,0.35)'}}>{label}</span></Tip> : label}
              </span>
            </div>
            <div style={{display:'flex',alignItems:'baseline',gap:8,flexWrap:'wrap',minHeight:isMobile?24:28}}>
              <span style={{fontSize:isMobile?19:22,fontWeight:900,color:color||C.white,letterSpacing:'-0.02em',fontVariantNumeric:'tabular-nums'}}>{value}</span>
              {delta}
            </div>
            <div style={{fontSize:10,color:'rgba(255,255,255,0.55)',lineHeight:1.4,minHeight:16}}>{sub||''}</div>
          </div>
        );
        return (
          <div style={{borderRadius:18,marginBottom:22,overflow:'hidden',
            background:'linear-gradient(135deg,#1C0A0A 0%,#3D1515 100%)',
            boxShadow:'0 14px 34px rgba(110,14,26,0.30), inset 0 1px 0 rgba(255,255,255,0.10)'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,
              padding:isMobile?'12px 14px 0':'14px 18px 0',flexWrap:'wrap'}}>
              <div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}>
                <span style={{display:'inline-flex',color:'#fff'}}><Icon name="target" size={16} /></span>
                <span style={{fontSize:11,fontWeight:800,letterSpacing:'0.06em',textTransform:'uppercase',color:'#fff'}}>Diagnosi</span>
                <span style={{fontSize:10.5,color:'rgba(255,255,255,0.55)',fontWeight:500}}>· {periodoTxt}</span>
              </div>
              <span style={{fontSize:9.5,fontWeight:700,color:'rgba(255,255,255,0.55)'}}>
                {stimato ? 'dati stimati da produzione' : 'dati reali da chiusure'}{prev ? ' · confronto vs periodo precedente' : ''}
              </span>
            </div>
            <div style={{display:'flex',flexWrap:'wrap',padding:isMobile?'4px 4px 10px':'8px 4px 10px'}}>
              <Cell icon="money" label={stimato?'Ricavi stimati':'Ricavi reali'} value={eur0(cur.rv)}
                delta={prev && <Delta now={cur.rv} before={prev.rv} />} />
              <Cell icon="trendUp" label="Margine %" value={fmtp(cur.margPct)} color={margC}
                tip="Quota di ricavo che resta dopo il food cost. Soglie: verde da 60%, ambra da 40%, sotto è rosso (rivedere prezzi o food cost)."
                delta={prev && <Delta now={cur.margPct} before={prev.margPct} suffix=" pt" />}
                sub={`${eur0(cur.marg)} di margine`} />
              <Cell icon="target" label="Sell-through %" value={cur.st!=null?fmtp(cur.st):'n/d'} color={stC}
                tip="Percentuale del prodotto venduto rispetto a quello prodotto. Soglie: verde da 85%, ambra da 65%, sotto è rosso (troppo invenduto). Disponibile solo con le chiusure."
                delta={prev && cur.st!=null && prev.st!=null && <Delta now={cur.st} before={prev.st} suffix=" pt" />}
                sub={cur.st==null?'serve una chiusura cassa':undefined} />
              <Cell icon="trash" label="Spreco" value={cur.spreco!=null?eur0(cur.spreco):'n/d'}
                color={cur.spreco==null?undefined:cur.spreco>cur.rv*0.05?C.amber:'#fff'}
                tip="Valore (a food cost) dell'invenduto buttato. Sopra il 5% dei ricavi è un campanello d'allarme."
                delta={prev && cur.spreco!=null && prev.spreco!=null && <Delta now={cur.spreco} before={prev.spreco} invert />}
                sub={cur.spreco!=null && cur.rv>0 ? `${(cur.spreco/cur.rv*100).toFixed(1)}% dei ricavi` : (cur.spreco==null?'serve una chiusura cassa':undefined)} />
            </div>
          </div>
        );
      })()}

      {/* ─── TAB PRODUZIONE ─── */}
      {tab==="produzione"&&(
        <>
          {!hasProd&&<div style={{textAlign:"center",padding:"40px 24px",background:C.bgCard,borderRadius:16,border:`1px solid ${C.border}`,boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)",color:C.textSoft,fontSize:13,lineHeight:1.5}}><div style={{marginBottom:10,opacity:0.5,color:C.textSoft}}><Icon name="gift" size={32} /></div>Nessuna produzione registrata.<br/><span style={{fontSize:11,color:C.textSoft,marginTop:4,display:'inline-block'}}>Vai a <b style={{color:C.text}}>Produzione</b> dal menu per iniziare.</span></div>}
          {hasProd&&(
            <>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":isTablet?"repeat(3,1fr)":"repeat(5,1fr)",gap:10,marginBottom:24}}>
                <KPI icon={<Icon name="package" size={18} />} label="Stampi"     value={n0(totMP)}        highlight/>
                <KPI icon={<Icon name="money" size={18} />} label="Ricavi"     value={eur0(totRP)}      color={C.green}/>
                <KPI icon={<Icon name="receipt" size={18} />} label="Food cost"  value={eur0(totFP)}      color={C.red}/>
                <KPI icon={<Icon name="trendUp" size={18} />} label="Margine"    value={eur0(totRP-totFP)} color={margColor(totRP>0?((totRP-totFP)/totRP*100):0)}/>
                <KPI icon={<Icon name="trophy" size={18} />} label="Top"        value={topP?topP[0].replace("TORTA DI ",""):"—"} sub={topP?`${n0(topP[1])} stampi`:""} color={C.amber}/>
              </div>
              <SH sub={`Stampi totali per ${vista==="giornaliero"?"giorno":vista} · top 5 prodotti + altri`}>Produzione per {vista==="giornaliero"?"Giorno":vista==="settimana"?"Settimana":"Mese"}</SH>
              <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:16,padding:isMobile?"14px":"20px",marginBottom:12,boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)"}}>
                <ResponsiveContainer width="100%" height={isMobile?220:280}>
                  <BarChart data={dataProdTop} margin={{top:4,right:16,left:0,bottom:0}} barCategoryGap="28%">
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false}/>
                    <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false}/>
                    <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} width={isMobile?38:46} label={{ value:'stampi', angle:-90, position:'insideLeft', fill:'#64748B', fontSize:11, dy:24 }}/>
                    <Tooltip content={<ProdTooltip/>} cursor={{fill:'rgba(110,14,26,0.04)'}}/>
                    <Legend wrapperStyle={{fontSize:11,paddingTop:12}}/>
                    {seriesProd.map((n,i)=>(
                      <Bar key={n} dataKey={n} stackId="a"
                        fill={n==="Altri"?ALTRI_COLOR:STACK_COLORS[i%STACK_COLORS.length]}
                        radius={i===seriesProd.length-1?BAR_RADIUS_TOP:[0,0,0,0]}/>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <SH sub={`Ogni colonna è il ricavo stimato del periodo: in verde il margine, in rosso il food cost · per ${vista==="giornaliero"?"giorno":vista}`}>Andamento Economico (stimato)</SH>
              <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:16,padding:isMobile?"14px":"20px",marginBottom:24,boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)"}}>
                <ResponsiveContainer width="100%" height={isMobile?200:250}>
                  <BarChart data={dataKPI} margin={{top:8,right:16,left:0,bottom:0}} barCategoryGap="32%">
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false}/>
                    <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false}/>
                    <YAxis tickFormatter={yEUR} tick={AXIS_TICK} axisLine={false} tickLine={false} width={isMobile?52:64}/>
                    <Tooltip content={<EcoProdTooltip/>} cursor={{fill:'rgba(110,14,26,0.04)'}}/>
                    <Legend wrapperStyle={{fontSize:11,paddingTop:12}}/>
                    {/* Barra = ricavo stimato: margine (verde) sopra il food cost (rosso) */}
                    <Bar dataKey="FoodCost" stackId="e" name="Food cost" fill={C.red} barSize={isMobile?26:42}/>
                    <Bar dataKey="Margine"  stackId="e" name="Margine" fill={C.green} radius={BAR_RADIUS_TOP} barSize={isMobile?26:42}/>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{fontSize:11,color:C.textSoft,marginTop:10,lineHeight:1.5,textAlign:"center"}}>
                  L'altezza è il <b>ricavo stimato</b>. Più verde = più margine. Passa il mouse per i dettagli.
                </div>
              </div>
              <SH sub="Dettaglio per periodo">Riepilogo Periodi</SH>
              <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden",boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)"}}>
                <div style={{overflowX:'auto'}}>
                <table style={{width:"100%",minWidth:720,borderCollapse:"collapse",fontSize:11}}>
                  <thead>
                    <tr style={{background:"#F8F4F2"}}>
                      {COLS_RIEP.map((c,idx)=>(
                        <th key={c.key} role="button" tabIndex={0}
                          onClick={()=>clickSort(c.key)}
                          onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();clickSort(c.key);}}}
                          title="Ordina" aria-sort={sortBy===c.key?(sortDir==='asc'?'ascending':'descending'):'none'}
                          style={{padding:"12px 12px",textAlign:c.align==='left'?"left":"right",fontSize:10,fontWeight:700,letterSpacing:"0.05em",textTransform:"uppercase",color:sortBy===c.key?C.red:C.textSoft,borderBottom:`1px solid ${C.border}`,cursor:"pointer",userSelect:"none",whiteSpace:"nowrap",
                            ...(idx===0?{position:'sticky',left:0,background:'#F8F4F2',zIndex:1}:null)}}>
                          {c.label}<span style={{opacity:sortBy===c.key?1:0.25,marginLeft:4}}>{sortBy===c.key?(sortDir==='asc'?'▲':'▼'):'↕'}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPeriodi.map((p,i)=>{
                      const top=Object.entries(p.byRicetta).sort((a,b)=>b[1]-a[1])[0];
                      const rowBg = i%2===0?C.white:"#FDFAF7";
                      return (
                        <tr key={p.key} style={{borderBottom:`1px solid ${C.border}`,background:rowBg}}>
                          <td style={{padding:"10px 12px",fontWeight:700,color:C.text,whiteSpace:'nowrap',position:'sticky',left:0,background:rowBg,zIndex:1}}>
                            <div>{p.label}</div>
                            {/* Barra intuitiva: ricavo del periodo rapportato al migliore */}
                            <div title={`Ricavo ${eur0(p.ricavoTot)} · ${Math.round(p.ricavoTot/maxRicPeriodo*100)}% del periodo migliore`} style={{marginTop:4,height:5,width:96,maxWidth:"100%",background:"#F0EAE6",borderRadius:3,overflow:"hidden"}}>
                              <div style={{height:5,width:`${Math.max(2,p.ricavoTot/maxRicPeriodo*100)}%`,background:C.green,borderRadius:3}}/>
                            </div>
                          </td>
                          <td style={{padding:"10px 12px",textAlign:"right",color:C.textMid,fontVariantNumeric:'tabular-nums'}}>{p.sessioni.length}</td>
                          <td style={{padding:"10px 12px",textAlign:"right",fontWeight:600,fontVariantNumeric:"tabular-nums",fontFeatureSettings:"'tnum'"}}>{n0(p.stampiTot)}</td>
                          <td style={{padding:"10px 12px",textAlign:"right",color:C.green,fontWeight:600,fontVariantNumeric:"tabular-nums",fontFeatureSettings:"'tnum'"}}>{eur0(p.ricavoTot)}</td>
                          <td style={{padding:"10px 12px",textAlign:"right",color:C.red,fontVariantNumeric:"tabular-nums",fontFeatureSettings:"'tnum'"}}>{eur0(p.fcTot)}</td>
                          <td style={{padding:"10px 12px",textAlign:"right",fontWeight:800,color:margColor(p.margPct),fontVariantNumeric:"tabular-nums",fontFeatureSettings:"'tnum'"}}>{eur0(p.margine)}</td>
                          <td style={{padding:"10px 12px",textAlign:"right"}}>{margBadge(p.margPct)}</td>
                          <td style={{padding:"10px 12px",textAlign:"right",color:C.textSoft,fontSize:10,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:180}}>{top?`${top[0].replace("TORTA DI ","")} (${top[1]})`:"—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ─── TAB VENDITE REALI ─── */}
      {tab==="vendite"&&(
        <>
          {!hasVend&&(
            <div style={{textAlign:"center",padding:isMobile?"32px 20px":"48px 32px",background:C.bgCard,borderRadius:16,border:`1px solid ${C.border}`,boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)"}}>
              <div style={{marginBottom:12,color:C.textSoft}}><Icon name="receipt" size={32} /></div>
              <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:8}}>Nessuna chiusura registrata</div>
              <div style={{fontSize:12,color:C.textSoft,lineHeight:1.55,maxWidth:420,margin:'0 auto'}}>Carica gli scontrini di fine giornata dalla sezione <b>Chiusura</b> per vedere i dati di vendita reali qui.</div>
            </div>
          )}
          {hasVend&&(
            <>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":isTablet?"repeat(3,1fr)":"repeat(5,1fr)",gap:10,marginBottom:24}}>
                <KPI icon={<Icon name="money" size={18} />} label="Ricavi reali"  value={eur0(totRV)}  highlight/>
                <KPI icon={<Icon name="trendUp" size={18} />} label="Margine"       value={eur0(totMV)}  color={margColor(totRV>0?(totMV/totRV*100):0)} sub={fmtp(totRV>0?(totMV/totRV*100):0)}/>
                <KPI icon={<Icon name="receipt" size={18} />} label="Food cost"     value={eur0(totFV)}  color={C.red}/>
                <KPI icon={<Icon name="target" size={18} />} label="Sell-through"  value={fmtp(avgST)} color={avgST>=85?C.green:avgST>=65?C.amber:C.red}/>
                <KPI icon={<Icon name="trash" size={18} />} label="Spreco"        value={eur0(totSV)}  sub={totRV>0?`${(totSV/totRV*100).toFixed(1)}% dei ricavi`:undefined} color={totRV>0&&totSV/totRV>0.05?C.red:C.amber}/>
              </div>

              <SH sub={`Top 5 prodotti per ricavo + altri · per ${vista==="giornaliero"?"giorno":vista}`}>Ricavi Reali per {vista==="giornaliero"?"Giorno":vista==="settimana"?"Settimana":"Mese"}</SH>
              <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:16,padding:isMobile?"14px":"20px",marginBottom:12,boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)"}}>
                <ResponsiveContainer width="100%" height={isMobile?210:260}>
                  <BarChart data={dataVendTop} margin={{top:4,right:16,left:0,bottom:0}} barCategoryGap="28%">
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false}/>
                    <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false}/>
                    <YAxis tickFormatter={yEUR} tick={AXIS_TICK} axisLine={false} tickLine={false} width={isMobile?52:64}/>
                    <Tooltip content={<VendTooltip/>} cursor={{fill:'rgba(110,14,26,0.04)'}}/>
                    <Legend wrapperStyle={{fontSize:11,paddingTop:12}}/>
                    {seriesVend.map((n,i)=>(
                      <Bar key={n} dataKey={n} stackId="a" fill={n==="Altri"?ALTRI_COLOR:STACK_COLORS[i%STACK_COLORS.length]} radius={i===seriesVend.length-1?BAR_RADIUS_TOP:[0,0,0,0]}/>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <SH sub="Sell-through medio per periodo">Andamento Sell-Through %</SH>
              <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:16,padding:isMobile?"14px":"20px",marginBottom:12,boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)"}}>
                {/* Zoom asse Y: parti da 0/25/50 per leggere meglio le differenze */}
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
                  <span style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",color:C.textSoft}}>Zoom asse Y</span>
                  {[[0,"0–100%"],[25,"25–100%"],[50,"50–100%"]].map(([v,lbl])=>(
                    <button key={v} onClick={()=>setStZoom(v)} aria-label={`Zoom asse Y ${lbl}`} aria-pressed={stZoom===v}
                      style={{padding:"6px 12px",minHeight:32,borderRadius:999,border:`1px solid ${stZoom===v?C.red:C.border}`,background:stZoom===v?C.redLight:C.white,color:stZoom===v?C.red:C.textMid,fontSize:11,fontWeight:stZoom===v?800:600,cursor:"pointer"}}>{lbl}</button>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={isMobile?200:240}>
                  <BarChart data={dataST} margin={{top:4,right:16,left:0,bottom:0}} barCategoryGap="40%">
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false}/>
                    <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false}/>
                    <YAxis domain={[stZoom,100]} allowDataOverflow tickFormatter={yPCT} tick={AXIS_TICK} axisLine={false} tickLine={false} width={isMobile?38:46}/>
                    <Tooltip content={<ChartTip/>} formatter={(v)=>[`${Number(v).toFixed(1)}%`,"Sell-through"]} cursor={{fill:'rgba(110,14,26,0.04)'}}/>
                    <ReferenceLine y={85} stroke={C.green} strokeDasharray="4 4" label={{value:"85%",fill:C.green,fontSize:11}}/>
                    <ReferenceLine y={65} stroke={C.amber} strokeDasharray="4 4" label={{value:"65%",fill:C.amber,fontSize:11}}/>
                    <Bar dataKey="Sell-Through" fill={C.red} radius={BAR_RADIUS_TOP}>
                      {dataST.map((d,i)=>(
                        <Cell key={i} fill={d["Sell-Through"]>=85?C.green:d["Sell-Through"]>=65?C.amber:C.red}/>
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <SH sub="Ogni colonna è il ricavo del periodo: in verde quanto ti resta (margine), in rosso quanto sono costati gli ingredienti venduti">Conto Economico Reale</SH>
              <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:16,padding:isMobile?"14px":"20px",marginBottom:20,boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)"}}>
                <ResponsiveContainer width="100%" height={isMobile?200:250}>
                  <BarChart data={dataVendKPI} margin={{top:8,right:16,left:0,bottom:0}} barCategoryGap="32%">
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false}/>
                    <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false}/>
                    <YAxis tickFormatter={yEUR} tick={AXIS_TICK} axisLine={false} tickLine={false} width={isMobile?52:64}/>
                    <Tooltip content={<ContoTooltip/>} cursor={{fill:'rgba(110,14,26,0.04)'}}/>
                    <Legend wrapperStyle={{fontSize:11,paddingTop:12}}/>
                    {/* Barra = ricavo: margine (verde) sopra il food cost (rosso) */}
                    <Bar dataKey="FoodCost" stackId="ce" name="Food cost (ingredienti)" fill={C.red} barSize={isMobile?26:42}/>
                    <Bar dataKey="Margine"  stackId="ce" name="Margine (ti resta)" fill={C.green} radius={BAR_RADIUS_TOP} barSize={isMobile?26:42}/>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{fontSize:11,color:C.textSoft,marginTop:10,lineHeight:1.5,textAlign:"center"}}>
                  L'altezza della colonna è il <b>ricavo</b>. Più verde = più margine. Passa il mouse per vedere anche lo spreco.
                </div>
              </div>

              {/* ─── RANKING PRODOTTI (sell-through e margine) ─── */}
              {ranking.hasData && (() => {
                const nomePulito = n => n.replace("TORTA DI ","").replace("TORTA ","");
                // Lista classifica con barre orizzontali proporzionali al valore max della lista.
                const ListaRank = ({ rows, valKey, fmtVal, colorOf, max, positivo }) => (
                  <div style={{display:"flex",flexDirection:"column",gap:9}}>
                    {rows.length===0 && <div style={{fontSize:11,color:C.textSoft}}>Dati non sufficienti.</div>}
                    {rows.map((p,i)=>{
                      const v = p[valKey];
                      const w = max>0 ? Math.max(3, Math.abs(v)/max*100) : 3;
                      const col = colorOf(p);
                      return (
                        <div key={p.nome} style={{display:"flex",alignItems:"center",gap:9}}>
                          <span style={{fontSize:11,fontWeight:900,color:C.textSoft,width:16,textAlign:"right",flexShrink:0}}>{positivo?i+1:""}</span>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:"flex",justifyContent:"space-between",gap:8,marginBottom:3}}>
                              <span style={{fontSize:11,fontWeight:700,color:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nomePulito(p.nome)}</span>
                              <span style={{fontSize:11.5,fontWeight:900,color:col,fontVariantNumeric:"tabular-nums",flexShrink:0}}>{fmtVal(v)}</span>
                            </div>
                            <div style={{height:6,background:"#F0EAE6",borderRadius:3,overflow:"hidden"}}>
                              <div style={{height:6,width:`${w}%`,background:col,borderRadius:3,transition:"width .3s"}}/>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
                const maxST   = Math.max(1, ...ranking.stTop.map(p=>p.st||0));
                const maxMarg = Math.max(1, ...ranking.margTop.map(p=>Math.abs(p.margPct||0)));
                const Card = ({ titolo, icon, sub, children }) => (
                  <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:16,padding:"16px 18px",boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)"}}>
                    <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}>
                      <span style={{display:"inline-flex",color:C.red}}><Icon name={icon} size={14} /></span>
                      <span style={{fontSize:12,fontWeight:800,color:C.text}}>{titolo}</span>
                    </div>
                    <div style={{fontSize:10.5,color:C.textSoft,marginBottom:12}}>{sub}</div>
                    {children}
                  </div>
                );
                return (
                  <>
                    <SH sub="Classifica prodotti per quanto rendono (margine) e per quanto si vendono (sell-through), sul periodo selezionato">Ranking Prodotti</SH>
                    <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(2,1fr)",gap:12,marginBottom:24}}>
                      <Card icon="trophy" titolo="Sell-through migliore"
                        sub={<>I prodotti che vendi quasi tutti. <Tip text="Sell-through = quanto venduto / quanto prodotto. Verde da 85%, ambra da 65%, sotto è rosso."><span style={{cursor:"help",borderBottom:"1px dotted "+C.textSoft}}>Cos'è?</span></Tip></>}>
                        <ListaRank rows={ranking.stTop} valKey="st" max={maxST} positivo
                          fmtVal={v=>fmtp(v)} colorOf={p=>p.st>=85?C.green:p.st>=65?C.amber:C.red} />
                      </Card>
                      <Card icon="warning" titolo="Sell-through peggiore"
                        sub="Troppo invenduto: rivedi le quantità in produzione o il prezzo.">
                        <ListaRank rows={ranking.stBot} valKey="st" max={maxST}
                          fmtVal={v=>fmtp(v)} colorOf={p=>p.st>=85?C.green:p.st>=65?C.amber:C.red} />
                      </Card>
                      <Card icon="trophy" titolo="Margine % migliore"
                        sub={<>I prodotti più redditizi. <Tip text="Margine % = quota di ricavo che resta dopo il food cost. Verde da 60%, ambra da 40%, sotto è rosso."><span style={{cursor:"help",borderBottom:"1px dotted "+C.textSoft}}>Cos'è?</span></Tip></>}>
                        <ListaRank rows={ranking.margTop} valKey="margPct" max={maxMarg} positivo
                          fmtVal={v=>fmtp(v)} colorOf={p=>margColor(p.margPct)} />
                      </Card>
                      <Card icon="warning" titolo="Margine % peggiore"
                        sub="Marginano poco: candidati a ritocco prezzo o ricetta.">
                        <ListaRank rows={ranking.margBot} valKey="margPct" max={maxMarg}
                          fmtVal={v=>fmtp(v)} colorOf={p=>margColor(p.margPct)} />
                      </Card>
                    </div>
                  </>
                );
              })()}

              {/* BATCH RESULTS */}

          {/* ─── OVERVIEW C-LEVEL ─── */}
          {(chiusure||[]).length > 0 && (() => {
            const giorni = [...(chiusure||[])].sort((a,b)=>a.data.localeCompare(b.data));
            const n = giorni.length;
            const euro = v => v==null?"—":`${_NF2_S.format(Number(v))} €`;
            const pct  = v => v==null?"—":`${Number(v).toFixed(1)}%`;

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
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                    <div style={{width:3,height:34,background:C.red,borderRadius:2,flexShrink:0}}/>
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:C.red,marginBottom:3}}>Overview aggregata</div>
                      <div style={{fontSize:isMobile?16:20,fontWeight:800,color:C.text,letterSpacing:"-0.02em"}}>
                        {n} {n===1?"giornata":"giornate"} · {fmt3(giorni[0].data)} – {fmt3(giorni[n-1].data)}
                      </div>
                    </div>
                  </div>
                  {n>=4 && (
                    <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:20,
                      background:trendPct>=0?C.greenLight:C.redLight,
                      border:`1px solid ${trendPct>=0?C.green+"40":C.red+"40"}`}}>
                      <span style={{display:"inline-flex",color:trendPct>=0?C.green:C.red}}><Icon name={trendPct>=0?"trendUp":"trendDown"} size={14} /></span>
                      <span style={{fontSize:11,fontWeight:800,color:trendPct>=0?C.green:C.red}}>
                        {trendPct>=0?"+":""}{trendPct.toFixed(1)}% ricavo medio (2ª metà vs 1ª)
                      </span>
                    </div>
                  )}
                </div>

                {/* KPI Strip */}
                <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(2,1fr)":isTablet?"repeat(3,1fr)":"repeat(6,1fr)",gap:8,marginBottom:16}}>
                  {[
                    {icon:"money",lbl:"Ricavi totali",    val:euro(totRicavi),    sub:`${euro(ricavoMedio.toFixed(2))}/gg`,  color:C.green, hi:true},
                    {icon:"trendUp",lbl:"Margine lordo",    val:euro(totMarg),      sub:pct(margPct),                          color:margC(margPct)},
                    {icon:"receipt",lbl:"Food cost tot.",   val:euro(totFC),        sub:pct(fcPct)+" del ricavo",              color:C.red},
                    {icon:"trash",lbl:"Spreco totale",    val:euro(totSpreco),    sub:`${euro((totSpreco/n).toFixed(2))}/gg`,color:C.amber},
                    {icon:"target",lbl:"Sell-through med.",val:avgST!=null?pct(avgST):"—", sub:avgST!=null?(avgST>=85?"ottimo":avgST>=65?"buono":"da migliorare"):"",color:avgST!=null?stC2(avgST):C.textSoft},
                    {icon:"calendar",lbl:"Giorni registrati",val:String(n),          sub:`${euro(ricavoMedio.toFixed(2))} medio`,color:C.text},
                  ].map(({icon,lbl,val,sub,color,hi})=>(
                    <div key={lbl} style={{background:hi?"linear-gradient(135deg,#1C0A0A,#3D1515)":C.bgCard,
                      border:`1px solid ${hi?"transparent":C.border}`,borderRadius:16,padding:"12px 14px",
                      boxShadow:hi?"0 4px 14px rgba(110,14,26,0.22)":"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)",
                      display:'flex',flexDirection:'column'}}>
                      <div style={{marginBottom:4,color:hi?C.white:color}}><Icon name={icon} size={15} /></div>
                      <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.07em",textTransform:"uppercase",
                        color:hi?`rgba(255,255,255,0.6)`:C.textSoft,marginBottom:3,minHeight:24,lineHeight:1.25}}>{lbl}</div>
                      <div style={{fontSize:16,fontWeight:900,color:hi?C.white:color,fontVariantNumeric:"tabular-nums",fontFeatureSettings:"'tnum'",minHeight:22,lineHeight:1.1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{val}</div>
                      {sub
                        ? <div style={{fontSize:9,color:hi?`rgba(255,255,255,0.55)`:C.textSoft,marginTop:2,minHeight:18,lineHeight:1.3,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sub}</div>
                        : <div style={{minHeight:18,marginTop:2}}/>}
                    </div>
                  ))}
                </div>

                {/* Chart + Top prodotti */}
                <div style={{display:"grid",gridTemplateColumns:isMobile||isTablet?"1fr":"1fr 280px",gap:14,marginBottom:14}}>
                  {/* Trend ricavi */}
                  <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:16,padding:"16px 20px",boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)"}}>
                    <div style={{fontSize:11,fontWeight:800,color:C.text,marginBottom:12}}>Ricavi & margine giornalieri</div>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={chartData} margin={{top:4,right:8,left:0,bottom:0}} barSize={n<=14?14:n<=20?10:6}>
                        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false}/>
                        <XAxis dataKey="data" tick={AXIS_TICK} tickLine={false} axisLine={false} interval={n<=10?0:Math.floor(n/8)}/>
                        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={yEUR} width={isMobile?52:60}/>
                        <Tooltip content={<ChartTip/>} formatter={(v,name)=>[`${Number(v).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})} €`,name]} cursor={{fill:'rgba(110,14,26,0.04)'}}/>
                        <Bar dataKey="Ricavi"  fill={C.red}  opacity={0.85} radius={BAR_RADIUS_TOP}/>
                        <Bar dataKey="Margine" fill={C.green} opacity={0.7} radius={BAR_RADIUS_TOP}/>
                        <Bar dataKey="Spreco"  fill={C.amber} opacity={0.6} radius={BAR_RADIUS_TOP}/>
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
                  <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:16,padding:"16px 20px",boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)"}}>
                    <div style={{fontSize:11,fontWeight:800,color:C.text,marginBottom:10,display:"flex",alignItems:"center",gap:6}}><Icon name="trophy" size={13} />Top {LEX.prodotti} per ricavo</div>
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
                        <div style={{fontSize:12,fontWeight:800,color:C.green,fontVariantNumeric:"tabular-nums",fontFeatureSettings:"'tnum'",flexShrink:0}}>{euro(d.rv.toFixed(2))}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Insights row */}
                <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(3,1fr)",gap:10,marginBottom:14}}>
                  {/* Miglior giorno */}
                  <div style={{background:"linear-gradient(135deg,#EAF5EE,#FFF)",border:`1px solid ${C.green}30`,borderRadius:16,padding:"14px 16px",boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)"}}>
                    <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:C.green,marginBottom:6,display:"flex",alignItems:"center",gap:5}}><Icon name="trophy" size={11} />Miglior giorno</div>
                    <div style={{fontSize:15,fontWeight:900,color:C.text}}>{fmt3(bestDay?.data)}</div>
                    <div style={{fontSize:13,color:C.green,fontWeight:700,marginTop:2}}>{euro((bestDay?.kpi?.totV||0).toFixed(2))}</div>
                    <div style={{fontSize:10,color:C.textSoft,marginTop:3}}>
                      marg. {pct(bestDay?.kpi?.totMP)} · ST {pct(bestDay?.kpi?.avgST)}
                    </div>
                  </div>
                  {/* Peggior giorno */}
                  <div style={{background:"linear-gradient(135deg,#FEF3C7,#FFF)",border:`1px solid ${C.amber}30`,borderRadius:16,padding:"14px 16px",boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)"}}>
                    <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:C.amber,marginBottom:6,display:"flex",alignItems:"center",gap:5}}><Icon name="warning" size={11} />Giorno più debole</div>
                    <div style={{fontSize:15,fontWeight:900,color:C.text}}>{fmt3(worstDay?.data)}</div>
                    <div style={{fontSize:13,color:C.amber,fontWeight:700,marginTop:2}}>{euro((worstDay?.kpi?.totV||0).toFixed(2))}</div>
                    <div style={{fontSize:10,color:C.textSoft,marginTop:3}}>
                      marg. {pct(worstDay?.kpi?.totMP)} · ST {pct(worstDay?.kpi?.avgST)}
                    </div>
                  </div>
                  {/* Spreco insight */}
                  <div style={{background:"linear-gradient(135deg,#FDECEA,#FFF)",border:`1px solid ${C.red}20`,borderRadius:16,padding:"14px 16px",boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)"}}>
                    <div style={{fontSize:9,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:C.red,marginBottom:6,display:"flex",alignItems:"center",gap:5}}><Icon name="trash" size={11} />Impatto spreco</div>
                    <div style={{fontSize:15,fontWeight:900,color:C.text}}>{euro(totSpreco.toFixed(2))}</div>
                    <div style={{fontSize:10,color:C.textSoft,marginTop:2}}>{pct(totRicavi>0?(totSpreco/totRicavi*100):0)} dei ricavi</div>
                    <div style={{fontSize:10,color:C.red,fontWeight:700,marginTop:4,display:"flex",alignItems:"center",gap:4}}>
                      {totRicavi>0&&totSpreco/totRicavi>0.05
                        ? <><Icon name="warning" size={11} /><span>sopra soglia (5%)</span></>
                        : <><Icon name="check" size={11} /><span>{totSpreco===0?"nessuno spreco rilevato":"sotto controllo"}</span></>}
                    </div>
                  </div>
                </div>

                {/* Tabella prodotti cross-giornata */}
                {topProd.length > 0 && (
                  <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden",boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)",marginBottom:14}}>
                    <div style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,fontSize:12,fontWeight:800,color:C.text}}>
                      Dettaglio prodotti — totale periodo
                    </div>
                    <div style={{overflowX:'auto'}}>
                    <table style={{width:"100%",minWidth:640,borderCollapse:"collapse",fontSize:11}}>
                      <thead>
                        <tr style={{background:"#F8F4F2"}}>
                          {[LEX.Prodotto,"Pz venduti","Ricavo tot.","Ricavo/gg","Spreco FC","% su totale"].map((h,i)=>(
                            <th key={h} style={{padding:"10px 12px",textAlign:i===0?"left":"right",fontSize:10,fontWeight:700,
                              letterSpacing:"0.05em",textTransform:"uppercase",color:C.textSoft,whiteSpace:'nowrap',
                              borderBottom:`1px solid ${C.border}`,
                              ...(i===0?{position:'sticky',left:0,background:'#F8F4F2',zIndex:1}:null)}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(byProd).sort((a,b)=>b[1].rv-a[1].rv).map(([nome,d],i)=>{
                          const rowBg = i%2===0?"#FFFAF8":"#FFF";
                          return (
                          <tr key={nome} style={{borderBottom:`1px solid ${C.border}`,background:rowBg}}>
                            <td style={{padding:"9px 12px",fontWeight:700,color:C.text,fontSize:11,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:220,position:'sticky',left:0,background:rowBg,zIndex:1}}>{nome}</td>
                            <td style={{padding:"9px 12px",textAlign:"right",color:C.textMid,fontVariantNumeric:'tabular-nums'}}>{d.qta}</td>
                            <td style={{padding:"9px 12px",textAlign:"right",fontWeight:800,color:C.green,fontVariantNumeric:"tabular-nums",fontFeatureSettings:"'tnum'"}}>{euro(d.rv.toFixed(2))}</td>
                            <td style={{padding:"9px 12px",textAlign:"right",color:C.textMid,fontVariantNumeric:'tabular-nums'}}>{euro((d.rv/n).toFixed(2))}</td>
                            <td style={{padding:"9px 12px",textAlign:"right",color:d.spreco>0?C.amber:C.textSoft,fontVariantNumeric:'tabular-nums'}}>{d.spreco>0?euro(d.spreco.toFixed(2)):"—"}</td>
                            <td style={{padding:"9px 12px",textAlign:"right",color:C.textSoft,fontVariantNumeric:'tabular-nums'}}>{totRicavi>0?pct(d.rv/totRicavi*100):"—"}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

              {/* Blocco 'batchResults' rimosso: era codice orfano (state mai
                  dichiarato) residuo di una feature import batch non
                  completata. Causava ReferenceError sulla tab chiusure. */}

              {/* Tabella chiusure */}
              <SH sub="Ogni giornata chiusa con scontrino">Storico Chiusure</SH>
              <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden",boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)"}}>
                <div style={{overflowX:'auto'}}>
                <table style={{width:"100%",minWidth:760,borderCollapse:"collapse",fontSize:11}}>
                  <thead>
                    <tr style={{background:"#F8F4F2"}}>
                      {(() => {
                        const COLS = [
                          { h:'Data', key:'data', str:true, align:'left' },
                          { h:'Prodotti', key:'prodotti' },
                          { h:'Ricavo reale', key:'totV' },
                          { h:'Food cost', key:'totFC' },
                          { h:'Margine', key:'totM' },
                          { h:'Marg%', key:'totMP' },
                          { h:'Sell-T. medio', key:'avgST' },
                          { h:'Spreco', key:'totS' },
                        ];
                        return COLS.map((c,idx)=>(
                          <th key={c.key} role="button" tabIndex={0}
                            onClick={()=>setChiSort(s=>s.key===c.key?{key:c.key,dir:s.dir==='asc'?'desc':'asc'}:{key:c.key,dir:c.key==='data'?'desc':'desc'})}
                            onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.currentTarget.click();}}}
                            title="Ordina"
                            aria-sort={chiSort.key===c.key?(chiSort.dir==='asc'?'ascending':'descending'):'none'}
                            style={{padding:"12px 12px",textAlign:c.align==='left'?"left":"right",fontSize:10,fontWeight:700,letterSpacing:"0.05em",textTransform:"uppercase",color:chiSort.key===c.key?C.red:C.textSoft,borderBottom:`1px solid ${C.border}`,cursor:"pointer",userSelect:"none",whiteSpace:"nowrap",
                              ...(idx===0?{position:'sticky',left:0,background:'#F8F4F2',zIndex:1}:null)}}>
                            {c.h}<span style={{opacity:chiSort.key===c.key?1:0.25,marginLeft:4}}>{chiSort.key===c.key?(chiSort.dir==='asc'?'▲':'▼'):'↕'}</span>
                          </th>
                        ));
                      })()}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const getVal = (ch,k)=> k==='data'?ch.data : k==='prodotti'?(ch.confronto||[]).length : (ch.kpi?.[k]||0);
                      const dir = chiSort.dir==='asc'?1:-1;
                      return [...(chiusure||[])].sort((a,b)=>{ const va=getVal(a,chiSort.key),vb=getVal(b,chiSort.key); return (chiSort.key==='data'?String(va).localeCompare(String(vb)):(va-vb))*dir; });
                    })().map((ch,i)=>{
                      const rowBg = i%2===0?C.white:"#FDFAF7";
                      return (
                      <tr key={ch.id} style={{borderBottom:`1px solid ${C.border}`,background:rowBg}}>
                        <td style={{padding:"10px 12px",fontWeight:700,color:C.text,whiteSpace:'nowrap',position:'sticky',left:0,background:rowBg,zIndex:1}}>{new Date(ch.data+"T12:00").toLocaleDateString("it-IT",{weekday:"short",day:"2-digit",month:"short"})}</td>
                        <td style={{padding:"10px 12px",textAlign:"right",color:C.textMid,fontVariantNumeric:'tabular-nums'}}>{(ch.confronto||[]).length}</td>
                        <td style={{padding:"10px 12px",textAlign:"right",fontWeight:700,color:C.green,fontVariantNumeric:"tabular-nums",fontFeatureSettings:"'tnum'"}}>{eur0(ch.kpi.totV)}</td>
                        <td style={{padding:"10px 12px",textAlign:"right",color:C.red,fontVariantNumeric:'tabular-nums'}}>{eur0(ch.kpi.totFC)}</td>
                        <td style={{padding:"10px 12px",textAlign:"right",fontWeight:800,color:margColor(ch.kpi.totMP),fontVariantNumeric:"tabular-nums",fontFeatureSettings:"'tnum'"}}>{eur0(ch.kpi.totM)}</td>
                        <td style={{padding:"10px 12px",textAlign:"right"}}>{margBadge(ch.kpi.totMP)}</td>
                        <td style={{padding:"10px 12px",textAlign:"right"}}>
                          <span style={{fontWeight:700,color:ch.kpi.avgST>=85?C.green:ch.kpi.avgST>=65?C.amber:C.red,fontVariantNumeric:'tabular-nums'}}>{fmtp(ch.kpi.avgST)}</span>
                        </td>
                        <td style={{padding:"10px 12px",textAlign:"right",color:ch.kpi.totS>5?C.red:C.textSoft,fontWeight:ch.kpi.totS>5?700:400,fontVariantNumeric:'tabular-nums'}}>{eur0(ch.kpi.totS)}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ─── TAB CONFRONTO PRODUZIONE VS VENDITE ─── */}
      {tab==="confronto"&&(
        <>
          {(!hasProd||!hasVend)&&(()=>{
            // Stato vuoto chiaro: spiega QUALE delle due fonti manca, non un generico "servono entrambe".
            const manca = !hasProd && !hasVend
              ? { t:"Nessun dato da confrontare", d:<>Il confronto mette a fianco quanto hai <b>prodotto</b> e quanto hai <b>venduto</b>. Registra una sessione in <b>Produzione</b> e carica una <b>Chiusura</b> cassa per attivarlo.</> }
              : !hasProd
              ? { t:"Manca la produzione", d:<>Hai le chiusure cassa, ma nessuna sessione di produzione. Vai in <b>Produzione</b> per registrare cosa hai prodotto: solo così posso confrontarlo con il venduto.</> }
              : { t:"Mancano le chiusure", d:<>Hai le produzioni, ma nessuna chiusura cassa. Carica gli scontrini di fine giornata dalla sezione <b>Chiusura</b> per confrontare lo stimato con l'incassato reale.</> };
            return (
              <div style={{textAlign:"center",padding:"48px 32px",background:C.bgCard,borderRadius:16,border:`1px solid ${C.border}`,boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)"}}>
                <div style={{marginBottom:12,color:C.textSoft}}><Icon name={!hasProd?"package":"receipt"} size={32} /></div>
                <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:8}}>{manca.t}</div>
                <div style={{fontSize:12,color:C.textSoft,lineHeight:1.55,maxWidth:440,margin:"0 auto"}}>{manca.d}</div>
              </div>
            );
          })()}
          {hasProd&&hasVend&&(()=>{
            // Confronto ricavo stimato vs reale per periodo
            const allKeys = [...new Set([...periodiProd.map(p=>p.key),...periodiVend.map(p=>p.key)])].sort();
            // Il filtro data potrebbe escludere ogni periodo: stato vuoto chiaro invece di grafici/righe vuote.
            if (allKeys.length===0) return (
              <div style={{textAlign:"center",padding:"48px 32px",background:C.bgCard,borderRadius:16,border:`1px solid ${C.border}`,boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)"}}>
                <div style={{marginBottom:12,color:C.textSoft}}><Icon name="search" size={30} /></div>
                <div style={{fontSize:14,fontWeight:700,color:C.text,marginBottom:8}}>Nessun periodo nell'intervallo scelto</div>
                <div style={{fontSize:12,color:C.textSoft,lineHeight:1.55,maxWidth:420,margin:"0 auto"}}>Non ci sono né produzioni né chiusure tra le date selezionate. Allarga l'intervallo o azzera il filtro <b>Periodo</b> qui sopra.</div>
              </div>
            );
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
                <SH sub="Per periodo: quanto previsto dalla produzione (blu) vs incassato davvero (verde)">Ricavo · Stimato vs Reale</SH>
                <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:16,padding:isMobile?"14px":"20px",marginBottom:12,boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)"}}>
                  <ResponsiveContainer width="100%" height={isMobile?220:260}>
                    <BarChart data={dataConf} margin={{top:8,right:16,left:0,bottom:0}} barGap={6} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false}/>
                      <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false}/>
                      <YAxis tickFormatter={yEUR} tick={AXIS_TICK} axisLine={false} tickLine={false} width={isMobile?52:64}/>
                      <Tooltip content={<ChartTip/>} formatter={(v,n)=>[fmt(v),n]} cursor={{fill:'rgba(110,14,26,0.04)'}}/>
                      <Legend wrapperStyle={{fontSize:11,paddingTop:12}}/>
                      <Bar dataKey="Ricavo stimato" name="Stimato" fill="#8497B0" radius={BAR_RADIUS_TOP} maxBarSize={46}/>
                      <Bar dataKey="Ricavo reale"   name="Reale"   fill={C.green}  radius={BAR_RADIUS_TOP} maxBarSize={46}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <SH sub="Per periodo: margine previsto (blu) vs margine reale dagli scontrini (verde)">Margine · Stimato vs Reale</SH>
                <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:16,padding:isMobile?"14px":"20px",marginBottom:20,boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)"}}>
                  <ResponsiveContainer width="100%" height={isMobile?180:220}>
                    <BarChart data={dataConf2} margin={{top:8,right:16,left:0,bottom:0}} barGap={6} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false}/>
                      <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false}/>
                      <YAxis tickFormatter={yEUR} tick={AXIS_TICK} axisLine={false} tickLine={false} width={isMobile?52:64}/>
                      <Tooltip content={<ChartTip/>} formatter={(v,n)=>[fmt(v),n]} cursor={{fill:'rgba(110,14,26,0.04)'}}/>
                      <Legend wrapperStyle={{fontSize:11,paddingTop:12}}/>
                      <Bar dataKey="Margine stimato" name="Stimato" fill="#8497B0" radius={BAR_RADIUS_TOP} maxBarSize={46}/>
                      <Bar dataKey="Margine reale"   name="Reale"   fill={C.green}  radius={BAR_RADIUS_TOP} maxBarSize={46}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Tabella confronto periodi */}
                <SH sub="Per ogni periodo con entrambi i dati">Dettaglio Confronto</SH>
                <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden",boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)"}}>
                  <div style={{overflowX:'auto'}}>
                  <table style={{width:"100%",minWidth:760,borderCollapse:"collapse",fontSize:11}}>
                    <thead>
                      <tr style={{background:"#F8F4F2"}}>
                        {["Periodo","Ric. stimato","Ric. reale","Diff €","Margine stim.","Margine reale","Sell-T. medio","Spreco"].map((h,i)=>(
                          <th key={i} style={{padding:"12px 12px",textAlign:i===0?"left":"right",fontSize:10,fontWeight:700,letterSpacing:"0.05em",textTransform:"uppercase",color:C.textSoft,borderBottom:`1px solid ${C.border}`,whiteSpace:'nowrap',
                            ...(i===0?{position:'sticky',left:0,background:'#F8F4F2',zIndex:1}:null)}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {allKeys.reverse().map((k,i)=>{
                        const pp=periodiProd.find(p=>p.key===k);
                        const pv=periodiVend.find(p=>p.key===k);
                        const diff=(pv?.rvTot||0)-(pp?.ricavoTot||0);
                        const rowBg = i%2===0?C.white:"#FDFAF7";
                        return (
                          <tr key={k} style={{borderBottom:`1px solid ${C.border}`,background:rowBg}}>
                            <td style={{padding:"10px 12px",fontWeight:700,color:C.text,whiteSpace:'nowrap',position:'sticky',left:0,background:rowBg,zIndex:1}}>{fmtKey(k)}</td>
                            <td style={{padding:"10px 12px",textAlign:"right",color:C.textSoft,fontVariantNumeric:'tabular-nums'}}>{pp?fmt(pp.ricavoTot):"—"}</td>
                            <td style={{padding:"10px 12px",textAlign:"right",fontWeight:700,color:C.green,fontVariantNumeric:'tabular-nums'}}>{pv?fmt(pv.rvTot):"—"}</td>
                            <td style={{padding:"10px 12px",textAlign:"right",fontWeight:700,color:diff>=0?C.green:C.red,fontVariantNumeric:'tabular-nums'}}>{pp&&pv?(diff>=0?"+":"")+fmt(diff):"—"}</td>
                            <td style={{padding:"10px 12px",textAlign:"right",color:C.textSoft,fontVariantNumeric:'tabular-nums'}}>{pp?fmt(pp.margine):"—"}</td>
                            <td style={{padding:"10px 12px",textAlign:"right",fontWeight:800,color:pv?margColor(pv.margTot>0&&pv.rvTot>0?(pv.margTot/pv.rvTot*100):0):C.textSoft,fontVariantNumeric:'tabular-nums'}}>{pv?fmt(pv.margTot):"—"}</td>
                            <td style={{padding:"10px 12px",textAlign:"right"}}>{pv?<span style={{fontWeight:700,color:pv.avgST>=85?C.green:pv.avgST>=65?C.amber:C.red,fontVariantNumeric:'tabular-nums'}}>{fmtp(pv.avgST)}</span>:"—"}</td>
                            <td style={{padding:"10px 12px",textAlign:"right",color:pv?.sproTot>5?C.red:C.textSoft,fontVariantNumeric:'tabular-nums'}}>{pv?fmt(pv.sproTot):"—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
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


// ─── SEMI CARD (same layout as TortaCard, no price panel) ────────────────────
