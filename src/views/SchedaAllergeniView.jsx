// SchedaAllergeniView — Scheda allergeni (Reg. UE 1169/2011). Estratta da Dashboard.jsx.
// Allergeni effettivi per ricetta: usa quelli salvati, altrimenti auto-detect
// dagli ingredienti (le ricette importate da Excel spesso non li hanno salvati).
import React, { useMemo } from 'react'
import { ALLERGENI, ALLERGENE_COLORS, detectAllergeniFromIngredienti } from '../lib/allergeni'
import { C } from './_shared'

export default function SchedaAllergeniView({ ricettario }) {
  const ricette = Object.values(ricettario?.ricette||{}).filter(r=>r.tipo!=="semilavorato"&&r.tipo!=="interno");

  const algMap = useMemo(() => {
    const m = {};
    for (const r of ricette) {
      const salvati = Array.isArray(r.allergeni) ? r.allergeni : [];
      const eff = salvati.length ? salvati : detectAllergeniFromIngredienti(r.ingredienti || []);
      m[r.nome] = new Set(eff);
    }
    return m;
  }, [ricette]);

  const esportaPDF = async () => {
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
    const pw = doc.internal.pageSize.getWidth();
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
        const has = algMap[r.nome]?.has(a.id);
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
                      const has=algMap[r.nome]?.has(a.id);
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
