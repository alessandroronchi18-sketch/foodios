// SemilavoratiView + SemiCard — gestione semilavorati/basi interne. Estratta da Dashboard.jsx.
import React, { useState, useMemo } from 'react'
import useIsMobile from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'
import { buildIngCosti, calcolaFC, getR, isRicettaValida, normIng, PREZZI_HORECA, translateIngredienteEN, translateProdottoEN } from '../lib/foodcost'
import { onEnterAutoComplete } from '../lib/autocomplete'
import FotoOCR from '../components/FotoOCR'
import { C, Badge, TNUM } from './_shared'

function SemiCard({ ric, ingCosti, ricettario, onEdit, onDelete }) {
  const isMobile = useIsMobile();
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

  const tnum = TNUM;
  const PURPLE = "#8E44AD", PURPLE_DARK = "#6B2FA0", PURPLE_BG = "#F5EBFB", PURPLE_BORDER = "#D4B0E8";
  return (
    <div style={{background:T.bgCard,border:`1px solid ${PURPLE_BORDER}`,borderRadius:18,overflow:"hidden",
      boxShadow:"0 1px 2px rgba(142,68,173,0.05), 0 10px 28px rgba(142,68,173,0.07)",
      transition:`box-shadow ${M.durBase} ${M.ease}, border-color ${M.durBase} ${M.ease}`}}
      onMouseEnter={e=>{e.currentTarget.style.boxShadow="0 1px 2px rgba(142,68,173,0.06), 0 14px 34px rgba(142,68,173,0.12)";}}
      onMouseLeave={e=>{e.currentTarget.style.boxShadow="0 1px 2px rgba(142,68,173,0.05), 0 10px 28px rgba(142,68,173,0.07)";}}>
      <div style={{padding:isMobile?"14px 16px":"18px 22px",display:"flex",flexDirection:isMobile?"column":"row",alignItems:isMobile?"stretch":"center",justifyContent:"space-between",gap:isMobile?14:16,borderBottom:open?`1px solid ${PURPLE_BORDER}`:"none"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:6}}>
            <span style={{padding:"3px 9px",borderRadius:R.full,background:PURPLE_BG,color:PURPLE,fontSize:10,fontWeight:600,letterSpacing:"0.04em",textTransform:"uppercase"}}>Base</span>
            <h3 style={{margin:0,fontSize:16,fontWeight:600,color:T.text,letterSpacing:"-0.015em"}}>{ric.nome}</h3>
            {mancanti.length>0&&<Badge label={`${mancanti.length} prezzi stimati`} color="amber"/>}
          </div>
          <div style={{fontSize:12,color:T.textSoft,letterSpacing:"-0.005em",...tnum}}>
            {pesoTot>=1000?`${(pesoTot/1000).toFixed(2)} kg batch`:`${Math.round(pesoTot)}g batch`}
            {" · "}
            <span style={{fontWeight:500,color:T.textMid}}>{costoG>0?costoG.toFixed(4):"—"} €/g</span>
          </div>
        </div>
        <div style={{display:"flex",gap:8,flexShrink:0}}>
          {[
            {lbl:"Costo batch",val:`€ ${fc.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})}`,c:T.brand,bg:T.brandLight},
            {lbl:"Costo/g",val:costoG>0?costoG.toFixed(4)+"€":"—",c:PURPLE,bg:PURPLE_BG},
            {lbl:"Costo/kg",val:`€ ${(costoG*1000).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})}`,c:PURPLE_DARK,bg:"#ECD9F8"},
          ].map(({lbl,val,c,bg})=>(
            <div key={lbl} style={{background:bg,padding:"9px 12px",borderRadius:R.md,textAlign:"center",minWidth:isMobile?0:80,flex:isMobile?1:"none"}}>
              <div style={{fontSize:9,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",color:T.textSoft,marginBottom:4}}>{lbl}</div>
              <div style={{fontSize:13,fontWeight:700,color:c,letterSpacing:"-0.015em",...tnum}}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:6,alignSelf:isMobile?"stretch":"center",flexShrink:0}}>
          <button onClick={()=>setOpen(o=>!o)}
            style={{padding:"8px 12px",borderRadius:R.md,border:`1px solid ${PURPLE_BORDER}`,background:open?PURPLE_BG:"transparent",
              fontSize:12,fontWeight:500,color:PURPLE,cursor:"pointer",letterSpacing:"-0.005em",
              display:"inline-flex",alignItems:"center",gap:5,flex:isMobile?1:"none",justifyContent:"center",
              transition:`background ${M.durFast} ${M.ease}`}}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{transition:`transform ${M.durBase} ${M.ease}`,transform:open?"rotate(180deg)":"rotate(0)"}}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
            {open?"Chiudi":"Dettagli"}
          </button>
          <button onClick={()=>onEdit(ric.nome)} aria-label="Modifica"
            style={{width:36,height:36,padding:0,borderRadius:R.md,border:`1px solid ${T.border}`,background:T.bgCard,
              color:T.textMid,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
              transition:`background ${M.durFast} ${M.ease}, color ${M.durFast} ${M.ease}`}}
            onMouseEnter={e=>{e.currentTarget.style.background=T.bgSubtle;e.currentTarget.style.color=T.text;}}
            onMouseLeave={e=>{e.currentTarget.style.background=T.bgCard;e.currentTarget.style.color=T.textMid;}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button onClick={()=>onDelete(ric.nome)} aria-label="Elimina"
            style={{width:36,height:36,padding:0,borderRadius:R.md,border:`1px solid ${T.border}`,background:T.bgCard,
              color:T.textSoft,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
              transition:`background ${M.durFast} ${M.ease}, color ${M.durFast} ${M.ease}, border-color ${M.durFast} ${M.ease}`}}
            onMouseEnter={e=>{e.currentTarget.style.background=T.redLight;e.currentTarget.style.color=T.brand;e.currentTarget.style.borderColor="rgba(110,14,26,0.3)";}}
            onMouseLeave={e=>{e.currentTarget.style.background=T.bgCard;e.currentTarget.style.color=T.textSoft;e.currentTarget.style.borderColor=T.border;}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <div style={{padding:"20px 24px"}}>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:24}}>
            {/* Ingredient table */}
            <div>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:C.textSoft,marginBottom:8}}>Ingredienti</div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                <thead>
                  <tr style={{background:"#F8F4F2"}}>
                    {["Ingrediente","Grammi","Costo","% FC"].map((h,i)=>(
                      <th key={h} title={h==="% FC"?"Incidenza % di questo ingrediente sul food cost totale del batch":undefined}
                        style={{padding:"6px 10px",textAlign:i===0?"left":"right",fontSize:8,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",color:C.textSoft,borderBottom:`1px solid ${C.border}`,...(h==="% FC"?{cursor:"help",textDecoration:"underline dotted",textUnderlineOffset:3}:null)}}>{h}</th>
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
                      <td style={{padding:"7px 10px",textAlign:"right",fontFamily:"'JetBrains Mono', ui-monospace, monospace"}}>{ing.qty1stampo}g</td>
                      <td style={{padding:"7px 10px",textAlign:"right",fontFamily:"'JetBrains Mono', ui-monospace, monospace",color:C.red}}>{ing.costo>0?`€${ing.costo.toFixed(3)}`:"—"}</td>
                      <td style={{padding:"7px 10px",textAlign:"right",fontFamily:"'JetBrains Mono', ui-monospace, monospace",color:C.textMid}}>{ing.pct>0?`${ing.pct.toFixed(1)}%`:"—"}</td>
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
export default function SemilavoratiView({ ricettario, onSave, notify }) {
  const isMobile = useIsMobile();
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
    <div style={{maxWidth: 1200,margin:"0 auto"}}>
      <div style={{marginBottom:24,display:"flex",alignItems:"center",gap:14}}>
        <div style={{width:48,height:48,borderRadius:R.lg,background:"#F5EBFB",
          display:"flex",alignItems:"center",justifyContent:"center",color:"#8E44AD",flexShrink:0}}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
          </svg>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <p style={{margin:0,fontSize:13,color:T.textSoft,lineHeight:1.5,letterSpacing:"-0.005em"}}>
            Impasti, creme e preparazioni interne — usabili come ingredienti in altre ricette.
          </p>
        </div>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:0}}>
        {/* ── Lista semilavorati ── */}
        <div>
          {semilavorati.length === 0 && (
            <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:18,
              padding:isMobile?"32px 20px":"48px 24px",textAlign:"center",marginBottom:24,boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)"}}>
              <div style={{width:56,height:56,borderRadius:"50%",background:"#F5EBFB",
                display:"inline-flex",alignItems:"center",justifyContent:"center",color:"#8E44AD",marginBottom:14}}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
                </svg>
              </div>
              <div style={{fontSize:15,fontWeight:600,color:T.text,marginBottom:6,letterSpacing:"-0.01em"}}>Nessun semilavorato</div>
              <div style={{fontSize:13,color:T.textSoft,maxWidth:340,margin:"0 auto",lineHeight:1.5}}>Aggiungi basi interne come crema pasticcera, pasta frolla o fruit curd usando il form qui sotto.</div>
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
            // L'AI mode="ricetta" restituisce {nome, quantita, unita}. Convertiamo in grammi.
            // Manteniamo retrocompatibilità con eventuale i.qty già in grammi.
            const UNIT_G = { g:1,gr:1,grammi:1,grammo:1, kg:1000,chilo:1000,chilogrammo:1000,
              ml:1,millilitri:1, l:1000,litro:1000,litri:1000, cl:10,centilitri:10, dl:100,decilitri:100,
              cucchiaio:15,cucchiai:15,tbsp:15, cucchiaino:5,cucchiaini:5,tsp:5,
              tazza:240,cup:240,tazze:240, bicchiere:200,bicchieri:200,
              noce:15, pizzico:2,pizzichi:2, qb:0, pz:1 };
            const toGrams = (i) => {
              if (i.qty != null && i.qty !== "") return parseFloat(i.qty)||0;
              const q = parseFloat(i.quantita)||0;
              const u = (i.unita||"g").toLowerCase().trim();
              return Math.round(q * (UNIT_G[u] ?? 1));
            };
            const ings = (res.ingredienti||[])
              .map(i=>({nome:translateIngredienteEN((i.nome||"").toLowerCase().trim()), qty1stampo:toGrams(i), costoPerG:0, costo1stampo:0}))
              .filter(i=>!SKIP.includes(i.nome.toLowerCase().trim()) && i.qty1stampo>0);
            const nomeIT = (translateProdottoEN(res.nome||"")||"").toUpperCase();
            setForm(f=>({
              ...f,
              nome: nomeIT || f.nome,
              note: res.note || f.note,
              ingredienti: ings.length>0 ? ings : f.ingredienti,
            }));
            if (ings.length>0) notify(`📷 Importato: ${nomeIT||"semilavorato"} con ${ings.length} ingredienti`);
            else notify(`⚠ Nessun ingrediente valido estratto dalla foto`, false);
          }}/>

          <div style={{background:T.bgCard,border:`1px solid #D4B0E8`,borderRadius:18,padding:isMobile?"18px":"22px",boxShadow:"0 1px 2px rgba(142,68,173,0.05), 0 10px 28px rgba(142,68,173,0.07)"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,paddingBottom:14,borderBottom:`1px solid #E5D4F0`}}>
              <div style={{width:32,height:32,borderRadius:R.md,background:"#F5EBFB",
                display:"flex",alignItems:"center",justifyContent:"center",color:"#8E44AD",flexShrink:0}}>
                {editMode
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                }
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,fontWeight:600,color:"#6B2FA0",letterSpacing:"-0.01em"}}>{editMode ? `Modifica: ${editMode}` : "Nuovo semilavorato"}</div>
              </div>
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
                      <button aria-label="Rimuovi ingrediente" onClick={()=>removeIng(i)} style={{background:"none",border:"none",color:C.textSoft,cursor:"pointer",fontSize:11,padding:"0 2px"}}>✕</button>
                    </div>
                  </div>
                ))}
                <div style={{display:"flex",gap:6,marginTop:6}}>
                  <div style={{flex:2}}>
                    <input value={newIngNome}
                      onChange={e=>setNewIngNome(e.target.value)}
                      onKeyDown={onEnterAutoComplete(tuttiIng, newIngNome, setNewIngNome, () => { if (newIngQty) addIng() })}
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
                    <span style={{fontWeight:700,color:C.red,...TNUM}}>€ {fcLive.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:4}}>
                    <span style={{color:C.textSoft}}>Costo/g</span>
                    <span style={{fontWeight:700,color:"#8E44AD",fontFamily:"'JetBrains Mono', ui-monospace, monospace"}}>{costoGLive>0?costoGLive.toFixed(5):"—"} €/g</span>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                    <span style={{color:C.textSoft}}>Costo/kg</span>
                    <span style={{fontWeight:700,color:"#8E44AD",...TNUM}}>€ {(costoGLive*1000).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
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
              <div style={{fontSize:9,color:C.textSoft,textAlign:"center"}}>Premi <kbd style={{padding:"1px 4px",background:"#F0E4FA",borderRadius:3,border:"1px solid #D4B0E8",fontFamily:"'JetBrains Mono', ui-monospace, monospace"}}>Enter</kbd> per aggiungere ingrediente · <kbd style={{padding:"1px 4px",background:"#F0E4FA",borderRadius:3,border:"1px solid #D4B0E8",fontFamily:"'JetBrains Mono', ui-monospace, monospace"}}>↵ Salva</kbd> clic o invio sul bottone</div>
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
