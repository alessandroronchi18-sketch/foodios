// NuovaRicettaView — Editor ricetta (crea/modifica). Estratta da Dashboard.jsx.
import React, { useState, useMemo, useEffect, useRef } from 'react'
import useIsMobile from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'
import { buildIngCosti, getR, isRicettaValida, normIng, REGOLE, PREZZI_HORECA, translateIngredienteEN, translateProdottoEN } from '../lib/foodcost'
import { ALLERGENI, ALLERGENE_COLORS, detectAllergeniFromIngredienti, mergeAllergeni } from '../lib/allergeni'
import { onEnterAutoComplete } from '../lib/autocomplete'
import { lessico } from '../lib/lessico'
import FotoOCR from '../components/FotoOCR'
import AIFotoAnalisi from '../components/AIFotoAnalisi'
import { C, fmt, fmtp, margColor, margBadge } from './_shared'

// Ombra premium coerente con la Dashboard home.
const SHADOW_PREMIUM = '0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)'

// Titolo di card con chip icona (gerarchia premium come la Dashboard home).
function PanelHead({ icon, title, color = C.red, badge }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
      <span style={{ width: 30, height: 30, borderRadius: 9, background: `${color}14`, color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{icon}</span>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: '-0.01em' }}>{title}</div>
      {badge}
    </div>
  )
}

export default function NuovaRicettaView({ ricettario, onSave, notify, editingRicetta, onEditConsumed, LEX = lessico() }) {
  const isMobile = useIsMobile();
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

  const empty = { nome:"", unita:8, prezzo:4, tipo:"fetta", note:"", ingredienti:[], congelabile:false, allergeniManual:[] };
  const [form, setForm] = useState(empty);

  // Allergeni rilevati automaticamente dagli ingredienti (Reg. UE 1169/2011).
  const autoAllergeni = useMemo(
    () => detectAllergeniFromIngredienti(form.ingredienti),
    [form.ingredienti]
  );
  const effectiveAllergeni = useMemo(
    () => mergeAllergeni(autoAllergeni, form.allergeniManual),
    [autoAllergeni, form.allergeniManual]
  );
  const [newIngNome, setNewIngNome] = useState("");
  const [newIngQty,  setNewIngQty]  = useState("");
  const [editMode,   setEditMode]   = useState(null); // nome ricetta esistente in edit
  const [deleteConf, setDeleteConf] = useState(null); // nome ricetta da cancellare (step 1)
  const [deletePin,  setDeletePin]  = useState("");   // PIN conferma cancellazione
  const [overwriteConf, setOverwriteConf] = useState(null); // nome ricetta da sovrascrivere
  const [forceOverwrite, setForceOverwrite] = useState(false); // per batch foto
  const [datiEstratti, setDatiEstratti] = useState(null); // dati AI in attesa di conferma
  const formRef = useRef(null);

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
    const ings = r.ingredienti.map(i=>({...i}));
    // Tutto ciò che è stato salvato ma NON è rilevato automaticamente
    // viene preservato come override manuale.
    const auto = detectAllergeniFromIngredienti(ings);
    const manual = (r.allergeni||[]).filter(a => !auto.includes(a));
    setForm({ nome:r.nome, unita:reg.unita, prezzo:reg.prezzo, tipo:reg.tipo, note:r.note||"", ingredienti:ings, congelabile:r.congelabile||false, allergeniManual:manual });
    setEditMode(nome);
    setTimeout(()=>formRef.current?.scrollIntoView({behavior:"smooth",block:"start"}), 100);
  };

  // Pre-carica una ricetta in modifica quando arriva dal click su card
  useEffect(() => {
    if (editingRicetta && ricettario?.ricette?.[editingRicetta]) {
      loadForEdit(editingRicetta);
      onEditConsumed && onEditConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingRicetta, ricettario]);

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
      allergeni: effectiveAllergeni,
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
    if (!form.nome.trim()) { notify("⚠ Inserisci il nome della ricetta", false); return; }
    if (form.ingredienti.length===0) { notify("⚠ Nessun ingrediente — aggiungine almeno uno prima di salvare", false); return; }
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

  const handleConfermaRicetta = (datiConfermati) => {
    const UNIT_G = { g:1,gr:1,grammi:1,grammo:1, kg:1000, ml:1, l:1000, cl:10, dl:100,
      cucchiaio:15,cucchiai:15,tbsp:15, cucchiaino:5,cucchiaini:5,tsp:5,
      tazza:240,cup:240,tazze:240, bicchiere:200, noce:15, pizzico:2, qb:0, pz:1 };
    const ings = (datiConfermati.ingredienti || [])
      .filter(i => i.nome.trim())
      .map(i => ({
        nome: translateIngredienteEN(i.nome.toLowerCase().trim()),
        qty1stampo: Math.round((parseFloat(i.quantita)||0) * (UNIT_G[(i.unita||'g').toLowerCase()] ?? 1)),
        costoPerG: 0, costo1stampo: 0
      }));
    const nomeUp = (datiConfermati.nome || '').trim().toUpperCase();
    if (!nomeUp || !ings.length) { notify('⚠ Dati incompleti — inserisci nome e almeno un ingrediente', false); return; }
    const nuovaRic = {
      nome: nomeUp, sheetName: 'manuale', numStampi:1, totImpasto1:0, foodCost1:0,
      ingredienti: ings, note: datiConfermati.procedimento || '',
      unita: datiConfermati.porzioni || 8, prezzo: 4, tipo: 'fetta',
      congelabile: false, allergeni: detectAllergeniFromIngredienti(ings),
    };
    const nuovoRic = {
      ingredienti_costi: ricettario?.ingredienti_costi || {},
      ...(ricettario || {}),
      ricette: { ...(ricettario?.ricette || {}), [nomeUp]: nuovaRic }
    };
    onSave(nuovoRic, { [nomeUp]: { unita: nuovaRic.unita, prezzo: nuovaRic.prezzo, tipo: nuovaRic.tipo } });
    setDatiEstratti(null);
  };

  return (
    <div style={{maxWidth: 1200,margin:"0 auto"}}>
      <div style={{marginBottom:24,display:"flex",alignItems:"center",gap:14}}>
        <div style={{width:48,height:48,borderRadius:R.lg,background:T.brandLight,
          display:"flex",alignItems:"center",justifyContent:"center",color:T.brand,flexShrink:0}}>
          {editMode
            ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          }
        </div>
        <div style={{flex:1,minWidth:0}}>
          <p style={{margin:0,fontSize:13,color:T.textSoft,lineHeight:1.5,letterSpacing:"-0.005em"}}>
            {editMode
              ? <>Stai modificando <strong style={{color:T.brand,fontWeight:600}}>{editMode}</strong>. Salva per aggiornare.</>
              : "Aggiungi una ricetta manualmente oppure scattane una foto."}
          </p>
        </div>
      </div>

      {/* Edit ricetta esistente */}
      {ricetteEsistenti.length>0 && (
        <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:18,padding:isMobile?"14px 16px":"18px 22px",marginBottom:20,boxShadow:SHADOW_PREMIUM}}>
          <div style={{fontSize:12,fontWeight:600,color:T.text,marginBottom:12,letterSpacing:"-0.005em",display:"flex",alignItems:"center",gap:8}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.textMid} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Modifica ricetta esistente
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {ricetteEsistenti.map(n=>(
              <button key={n} onClick={()=>loadForEdit(n)}
                style={{padding:"6px 14px",borderRadius:R.full,border:`1px solid ${editMode===n?T.brand:T.border}`,
                  background:editMode===n?T.brandLight:T.bgCard,color:editMode===n?T.brand:T.textMid,
                  fontSize:12,fontWeight:editMode===n?600:500,cursor:"pointer",letterSpacing:"-0.005em",
                  transition:`background ${M.durFast} ${M.ease}, border-color ${M.durFast} ${M.ease}, color ${M.durFast} ${M.ease}`}}>
                {n}
              </button>
            ))}
          </div>
          {editMode && <div style={{marginTop:10,fontSize:12,color:T.amber,display:"flex",alignItems:"center",gap:6}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            Stai modificando <b style={{fontWeight:600}}>{editMode}</b> — salva per sovrascrivere.
          </div>}
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
          setDatiEstratti({
            nome: translateProdottoEN(res.nome || ''),
            categoria: 'Altro',
            porzioni: res.porzioni || res.unita || 8,
            ingredienti: (res.ingredienti || []).map(i => ({
              nome: translateIngredienteEN(i.nome || ''),
              quantita: parseFloat(i.quantita) || parseFloat(i.qty) || 0,
              unita: i.unita || 'g'
            })),
            procedimento: res.note || ''
          });
          setTimeout(()=>formRef.current?.scrollIntoView({behavior:"smooth",block:"start"}), 150);
        }}
        onBatchSave={async (res, idx, ricAcc, setRicAcc) => {
          // Salva direttamente una ricetta da OCR senza passare dal form
          const UNIT_G = { g:1,gr:1,grammi:1,grammo:1, kg:1000,chilo:1000,chilogrammo:1000, ml:1,millilitri:1, l:1000,litro:1000,litri:1000, cl:10,centilitri:10, dl:100,decilitri:100, cucchiaio:15,cucchiai:15,tbsp:15, cucchiaino:5,cucchiaini:5,tsp:5, tazza:240,cup:240,tazze:240, bicchiere:200,bicchieri:200, noce:15, pizzico:2,pizzichi:2, qb:0 };
          const SKIP_ING_OCR = ["ingrediente","ingredient","ingredienti","nome ingrediente in minuscolo","n/d","nan","undefined",""];
          const toGrams = (i) => { if (i.qty != null) return parseFloat(i.qty)||0; const q=parseFloat(i.quantita)||0; const u=(i.unita||"g").toLowerCase().trim(); return Math.round(q*(UNIT_G[u]??1)); };
          const ings = (res.ingredienti||[])
            .map(i=>({ nome: translateIngredienteEN(i.nome||""), qty1stampo: toGrams(i), costoPerG:0, costo1stampo:0 }))
            .filter(i => !SKIP_ING_OCR.includes(i.nome.toLowerCase().trim()) && i.qty1stampo >= 0);
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
            unita: res.porzioni || res.unita || 8,
            prezzo: res.prezzo||4,
            tipo: res.tipo||"fetta",
            congelabile: false,
            allergeni: detectAllergeniFromIngredienti(ings),
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

      {datiEstratti && (
        <AIFotoAnalisi
          dati={datiEstratti}
          onConferma={handleConfermaRicetta}
          onRianalizza={() => setDatiEstratti(null)}
          onAnnulla={() => setDatiEstratti(null)}
        />
      )}

      <div ref={formRef} style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 300px",gap:24}}>
        {/* Form sinistra */}
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {/* Nome + tipo + vendita */}
          <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:16,padding:"20px",boxShadow:SHADOW_PREMIUM}}>
            <PanelHead icon="📋" title={`Informazioni ${LEX.prodotto}`} color={C.text} />
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              {[
                {lbl:`Nome ${LEX.ricetta}`,span:2,el:<input value={form.nome} onChange={e=>setForm(f=>({...f,nome:e.target.value.toUpperCase()}))} placeholder="es. TORTA AL CIOCCOLATO" style={{width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${C.borderStr}`,fontSize:13,color:C.text,fontWeight:700}}/>},
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

          {/* Allergeni — auto-rilevati dagli ingredienti */}
          <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:16,padding:"20px",boxShadow:SHADOW_PREMIUM}}>
            <PanelHead icon="⚠️" title="Allergeni presenti" color={C.amber}
              badge={<span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:20,background:"#E0F2FE",color:"#0369A1",textTransform:"uppercase",letterSpacing:"0.05em"}}>Auto</span>}/>
            <div style={{fontSize:10,color:C.textSoft,marginBottom:14,marginTop:-8}}>
              Calcolati automaticamente dagli ingredienti (Reg. UE 1169/2011). Aggiungi manualmente quelli mancanti se necessario.
            </div>

            {/* Badge auto-rilevati (sola lettura) */}
            {autoAllergeni.length===0 ? (
              <div style={{fontSize:11,color:C.textSoft,padding:"10px 12px",background:"#FAF8F7",border:`1px dashed ${C.border}`,borderRadius:8,marginBottom:14}}>
                Nessun allergene rilevato dagli ingredienti attuali. Verifica gli ingredienti o aggiungi manualmente sotto.
              </div>
            ) : (
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
                {autoAllergeni.map(aid=>{
                  const a = ALLERGENI.find(x=>x.id===aid);
                  if (!a) return null;
                  return (
                    <span key={aid} title="Rilevato automaticamente dagli ingredienti"
                      style={{display:"inline-flex",alignItems:"center",gap:6,padding:"5px 11px",borderRadius:20,background:`${ALLERGENE_COLORS[aid]}15`,color:ALLERGENE_COLORS[aid],border:`1.5px solid ${ALLERGENE_COLORS[aid]}55`,fontSize:11,fontWeight:700}}>
                      <span style={{fontSize:13}}>{a.emoji}</span>{a.label}<span style={{fontSize:9,opacity:0.7}}>✓ auto</span>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Override manuale */}
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:12}}>
              <div style={{fontSize:10,fontWeight:700,color:C.textSoft,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>
                Aggiungi manualmente (override)
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(150px,1fr))",gap:6}}>
                {ALLERGENI.filter(a=>!autoAllergeni.includes(a.id)).map(a=>{
                  const sel = (form.allergeniManual||[]).includes(a.id);
                  return (
                    <label key={a.id} style={{display:"flex",alignItems:"center",gap:7,padding:"6px 10px",borderRadius:7,cursor:"pointer",border:`1px solid ${sel?ALLERGENE_COLORS[a.id]:"#E2D9D5"}`,background:sel?`${ALLERGENE_COLORS[a.id]}10`:"#FDFAF8",transition:"all 0.15s"}}>
                      <input type="checkbox" checked={sel} style={{display:"none"}}
                        onChange={()=>setForm(f=>({...f,allergeniManual:sel?(f.allergeniManual||[]).filter(x=>x!==a.id):[...(f.allergeniManual||[]),a.id]}))}/>
                      <span style={{fontSize:13}}>{a.emoji}</span>
                      <span style={{fontSize:10,fontWeight:sel?700:500,color:sel?ALLERGENE_COLORS[a.id]:C.textMid}}>{a.label}</span>
                      {sel&&<span style={{marginLeft:"auto",fontSize:9,fontWeight:900,color:ALLERGENE_COLORS[a.id]}}>✓</span>}
                    </label>
                  );
                })}
              </div>
              {ALLERGENI.filter(a=>!autoAllergeni.includes(a.id)).length===0 && (
                <div style={{fontSize:10,color:C.textSoft,fontStyle:"italic"}}>Tutti gli allergeni UE sono già stati rilevati automaticamente.</div>
              )}
            </div>
          </div>

          {/* Ingredienti */}
          <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:16,padding:"20px",boxShadow:SHADOW_PREMIUM}}>
            <PanelHead icon="🧾" title="Ingredienti" color={C.text} />
            {form.ingredienti.length>0 && (
              <div style={{marginBottom:14,border:`1px solid ${C.border}`,borderRadius:8,overflow:"hidden"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead>
                    <tr style={{background:"#F8F4F2"}}>
                      {[["Ingrediente",null],["g / stampo","Grammi di ingrediente per uno stampo"],["Costo €","Costo dell'ingrediente per uno stampo"],["",null]].map(([h,tip],i)=>(
                        <th key={i} title={tip||undefined} style={{padding:"7px 10px",textAlign:i===0?"left":"right",fontSize:8,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",color:C.textSoft,borderBottom:`1px solid ${C.border}`,whiteSpace:"nowrap",...(tip?{cursor:"help",textDecoration:"underline dotted",textUnderlineOffset:3}:null)}}>{h}</th>
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
                            <span title={ing.nome} style={{display:"inline-block",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",verticalAlign:"bottom"}}>{ing.nome}</span>
                            {!c&&<span style={{fontSize:7,marginLeft:4,background:C.amberLight,color:C.amber,padding:"1px 4px",borderRadius:3,fontWeight:700,whiteSpace:"nowrap"}}>prezzo mancante</span>}
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
                          <td style={{padding:"7px 10px",textAlign:"right",color:costo>0?C.red:C.textSoft,fontWeight:600,fontVariantNumeric:"tabular-nums",fontFeatureSettings:"'tnum'"}}>{costo>0?fmt(costo):"—"}</td>
                          <td style={{padding:"7px 6px",textAlign:"right"}}>
                            <button aria-label="Rimuovi ingrediente" onClick={()=>removeIng(i)} style={{padding:"2px 7px",borderRadius:4,border:`1px solid ${C.border}`,background:C.white,color:C.textSoft,fontSize:9,cursor:"pointer"}}>✕</button>
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
                <input value={newIngNome}
                  onChange={e=>setNewIngNome(e.target.value)}
                  onKeyDown={onEnterAutoComplete(tuttiIng, newIngNome, setNewIngNome, () => { if (newIngQty) addIng() })}
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
          <button onClick={handleSave} style={{padding:"13px",background:C.red,color:C.white,border:"none",borderRadius:10,fontWeight:900,fontSize:13,cursor:"pointer",boxShadow:"0 2px 10px rgba(110,14,26,0.25)"}}>
            💾 {editMode?"Salva modifiche a "+editMode:`Salva ${LEX.nuovaRicetta.toLowerCase()}`}
          </button>
        </div>

        {/* P&L preview destra */}
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:16,padding:"20px",boxShadow:SHADOW_PREMIUM,position:"sticky",top:20}}>
            <PanelHead icon="📊" title="Anteprima P&L" color={C.text} />
            {form.ingredienti.length===0 ? (
              <div style={{color:C.textSoft,fontSize:11,textAlign:"center",padding:"20px 0"}}>Aggiungi ingredienti per vedere il calcolo</div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div style={{padding:"10px 14px",background:C.greenLight,border:`1px solid ${C.green}25`,borderRadius:8,display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:11,color:C.green,fontWeight:700}}>+ Ricavo ({form.unita} × {fmt(form.prezzo)})</span>
                  <span style={{fontSize:13,fontWeight:900,color:C.green,fontVariantNumeric:"tabular-nums",fontFeatureSettings:"'tnum'"}}>{fmt(ricavoLive)}</span>
                </div>
                <div style={{padding:"10px 14px",background:C.redLight,border:`1px solid ${C.red}20`,borderRadius:8,display:"flex",justifyContent:"space-between"}}>
                  <span style={{fontSize:11,color:C.red,fontWeight:700}}>− Food cost</span>
                  <span style={{fontSize:13,fontWeight:900,color:C.red,fontVariantNumeric:"tabular-nums",fontFeatureSettings:"'tnum'"}}>−{fmt(fcLive)}</span>
                </div>
                <div style={{padding:"12px 14px",background:margPctLive>=60?C.greenLight:margPctLive>=40?C.amberLight:C.redLight,border:`1px solid ${margColor(margPctLive)}25`,borderRadius:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontSize:12,fontWeight:800,color:margColor(margPctLive)}}>= Margine lordo</span>
                    <span style={{fontSize:16,fontWeight:900,color:margColor(margPctLive),fontVariantNumeric:"tabular-nums",fontFeatureSettings:"'tnum'"}}>{fmt(margLive)}</span>
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
