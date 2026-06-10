// AzioniView — AI Assistant chat + tracking azioni. Estratta da Dashboard.jsx.
import React, { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import useIsMobile from '../lib/useIsMobile'
import { color as T, radius as R, shadow as S, motion as M } from '../lib/theme'
import { buildIngCosti, calcolaFC, getR, isRicettaValida } from '../lib/foodcost'
import { lessico } from '../lib/lessico'
import Icon from '../components/Icon'
import { C, PageHeader } from './_shared'

// Benchmark food cost realistici per tipo attivita' (range comuni della
// letteratura settore IT). Servono solo per orientare il prompt AI; sopra
// i max si raccomanda revisione prezzi, sotto i min si sospetta errore
// di calcolo. Default cauto (pasticceria) se la categoria e' sconosciuta.
const BENCH_FC = {
  pasticceria:    { fcPctMax: 30, margPctMin: 70, settore: 'pasticceria artigianale' },
  gelateria:      { fcPctMax: 28, margPctMin: 72, settore: 'gelateria artigianale' },
  pizzeria:       { fcPctMax: 35, margPctMin: 65, settore: 'pizzeria' },
  ristorante:     { fcPctMax: 32, margPctMin: 68, settore: 'ristorazione' },
  pasta_fresca:   { fcPctMax: 33, margPctMin: 67, settore: 'pastificio artigianale' },
  panificio:      { fcPctMax: 32, margPctMin: 68, settore: 'panificio artigianale' },
  cioccolateria:  { fcPctMax: 28, margPctMin: 72, settore: 'cioccolateria artigianale' },
  bar:            { fcPctMax: 25, margPctMin: 75, settore: 'bar/caffetteria' },
  bar_caffè:      { fcPctMax: 25, margPctMin: 75, settore: 'bar/caffetteria' },
}

export default function AzioniView({ actions, onUpdate, onDelete, ricettario, giornaliero, chiusure, magazzino, nomeAttivita, tipoAttivita }) {
  const isMobile = useIsMobile();
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

    const nomeLocale = (nomeAttivita || '').toString().trim() || 'tua attività'
    const tipoKey = String(tipoAttivita || '').toLowerCase().trim()
    const bench = BENCH_FC[tipoKey] || BENCH_FC.pasticceria
    const LEX = lessico(tipoAttivita)
    return `Sei l'assistente AI di ${nomeLocale}. Hai accesso completo ai dati del gestionale. Rispondi in italiano, in modo professionale ma caldo, come un consulente esperto di ${bench.settore} e food cost.

## RICETTARIO E P&L
${riepilogoRicette}

## RIEPILOGO P&L TOTALE
- Ricavo totale per stampo (tutti prodotti): €${totRicavo.toFixed(2)}
- Food cost totale: €${totFC.toFixed(2)} (${totRicavo > 0 ? (totFC / totRicavo * 100).toFixed(1) : 0}%)
- Margine lordo totale: €${totMargine.toFixed(2)} (${avgMarg.toFixed(1)}%)
- Benchmark settore (${bench.settore}): margine ≥ ${bench.margPctMin}%, FC < ${bench.fcPctMax}%

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
- Usa il lessico della categoria: parla di "${LEX.ricette}" e "${LEX.prodotti}", non di "ricette" generiche se l'utente e' di altra categoria
- Per domande sulla struttura del sito, spiega le sezioni disponibili: ${LEX.Ricettario}, P&L, Simulatore Prezzi, Produzione Giornaliera, Chiusura, Storico, Magazzino, e questa sezione AI
- Se ti chiedono "cosa fare" suggerisci le 3 azioni più impattanti basandoti sui dati
- Mantieni le risposte concise ma complete (max 300 parole)`;
  };

  const QUICK_PROMPTS = [
    { icon:"barChart", label:"Analisi P&L", q:"Analizza il mio P&L attuale: quali prodotti devo ottimizzare e perché?" },
    { icon:"bulb", label:"Next step", q:"Quali sono le 3 azioni più urgenti che dovrei fare questa settimana per migliorare la redditività?" },
    { icon:"book", label:"Come funziona", q:"Spiegami la struttura del gestionale: cosa c'è in ogni sezione e come usarla al meglio." },
    { icon:"package", label:"Magazzino", q:"Ho qualche problema con il magazzino? Cosa devo rifornire?" },
    { icon:"gift", label:"Miglior prodotto", q:"Qual è il prodotto più redditizio? E quello che mi conviene spingere di più?" },
    { icon:"warning", label:"Rischi", q:"Ci sono ingredienti o prodotti che mi espongono a rischi economici? Identifica le vulnerabilità." },
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
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: ctx,
          messages: [...history, { role:"user", content:q }],
        }),
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text || "Errore nella risposta.";
      setMessages(prev => [...prev, { role:"assistant", content:reply, ts:Date.now() }]);
    } catch(e) {
      setMessages(prev => [...prev, { role:"assistant", content:"Errore di connessione. Riprova.", ts:Date.now() }]);
    }
    setLoading(false);
  };

  const aperte  = (actions || []).filter(a => a.stato !== "chiusa");
  const chiuse  = (actions || []).filter(a => a.stato === "chiusa");

  return (
    <div style={{maxWidth:900,display:"flex",flexDirection:"column",gap:0}}>
      {/* Header */}
      <PageHeader
        subtitle="Analisi basate sui tuoi dati reali · ricettario, produzioni, cassa, magazzino"
      />

      {/* Tabs (segmented control) */}
      <div style={{display:"flex",gap:2,marginBottom:24,background:T.bgSubtle,borderRadius:R.md,padding:3,width:"fit-content",border:`1px solid ${T.borderSoft}`}}>
        {[["chat","Chat AI"],["azioni",`Azioni (${aperte.length})`]].map(([t,lbl])=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{padding:"7px 16px",borderRadius:R.sm,border:"none",cursor:"pointer",fontSize:13,
              fontWeight:tab===t?600:500,letterSpacing:"-0.005em",
              background:tab===t?T.bgCard:"transparent",
              color:tab===t?T.text:T.textSoft,
              boxShadow:tab===t?S.sm:"none",
              transition:`background ${M.durFast} ${M.ease}, color ${M.durFast} ${M.ease}`}}
            onMouseEnter={e=>{if(tab!==t)e.currentTarget.style.color=T.textMid;}}
            onMouseLeave={e=>{if(tab!==t)e.currentTarget.style.color=T.textSoft;}}>
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
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"repeat(3,1fr)",gap:8}}>
                {QUICK_PROMPTS.map(({icon,label,q})=>(
                  <button key={label} onClick={()=>sendMessage(q)} className="fos-tile"
                    style={{padding:"14px 16px",borderRadius:16,border:`1px solid ${C.border}`,background:C.bgCard,
                      cursor:"pointer",textAlign:"left",
                      boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)"}}>
                    <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:34,height:34,borderRadius:11,background:"rgba(110,14,26,0.10)",color:C.red,marginBottom:8}}><Icon name={icon} size={17}/></span>
                    <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:3,letterSpacing:"-0.01em"}}>{label}</div>
                    <div style={{fontSize:10,color:C.textSoft,lineHeight:1.45}}>{q.slice(0,55)}…</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.length > 0 && (
            <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:16,
              maxHeight:480,overflowY:"auto",padding:"20px",
              boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)"}}>
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                {messages.map((m,i)=>(
                  <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",
                    flexDirection:m.role==="user"?"row-reverse":"row"}}>
                    <div style={{width:28,height:28,borderRadius:"50%",flexShrink:0,
                      background:m.role==="user"?C.red:C.bgSide,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      color:C.white}}>
                      <Icon name={m.role==="user"?"user":"robot"} size={15}/>
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
                    <div style={{width:28,height:28,borderRadius:"50%",background:C.bgSide,display:"flex",alignItems:"center",justifyContent:"center",color:C.white}}><Icon name="robot" size={15}/></div>
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
                  <div key={a.id} className="fos-tile" style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:16,padding:"16px 20px",display:"flex",gap:14,alignItems:"flex-start",boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)"}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:800,color:C.text,marginBottom:4}}>{a.label}</div>
                      <div style={{fontSize:11,color:C.textMid,lineHeight:1.6}}>{a.azione}</div>
                      <div style={{fontSize:9,color:C.textSoft,marginTop:5}}>{new Date(a.createdAt).toLocaleDateString("it-IT")}</div>
                    </div>
                    <div style={{display:"flex",gap:6,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
                      {["aperta","in_corso","chiusa"].map(s=>(
                        <button key={s} onClick={()=>onUpdate(a.id,{stato:s})}
                          style={{padding: isMobile ? "10px 14px" : "6px 12px",borderRadius:8,
                            minHeight: isMobile ? 40 : 32, minWidth: isMobile ? 60 : 'auto',
                            border:`1px solid ${a.stato===s?C.red:C.border}`,
                            background:a.stato===s?C.redLight:C.white,color:a.stato===s?C.red:C.textSoft,
                            fontSize: isMobile ? 12 : 11, fontWeight:700,cursor:"pointer"}}>
                          {s==="aperta"?"Aperta":s==="in_corso"?"In corso":"✓ Chiudi"}
                        </button>
                      ))}
                      <button aria-label="Elimina azione" onClick={()=>onDelete(a.id)} style={{padding: isMobile ? "10px 12px" : "6px 10px",borderRadius:8,
                        minHeight: isMobile ? 40 : 32, minWidth: isMobile ? 40 : 32,
                        border:`1px solid ${C.border}`,background:C.white,color:C.textSoft,fontSize: isMobile ? 14 : 11,cursor:"pointer"}}>✕</button>
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
                    <button aria-label="Elimina azione" onClick={()=>onDelete(a.id)} style={{padding:"3px 8px",borderRadius:5,border:`1px solid ${C.border}`,background:C.white,color:C.textSoft,fontSize:9,cursor:"pointer"}}>✕</button>
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
