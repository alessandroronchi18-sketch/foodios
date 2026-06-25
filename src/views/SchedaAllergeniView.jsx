// SchedaAllergeniView — Scheda allergeni (Reg. UE 1169/2011). Estratta da Dashboard.jsx.
// Allergeni effettivi per ricetta: usa quelli salvati, altrimenti auto-detect
// dagli ingredienti (le ricette importate da Excel spesso non li hanno salvati).
import React, { useMemo } from 'react'
import { color as T, radius as R, shadow as S } from '../lib/theme'
import { ALLERGENI, ALLERGENE_COLORS, detectAllergeniFromIngredienti } from '../lib/allergeni'
import { lessico } from '../lib/lessico'
import { C } from './_shared'
import Icon from '../components/Icon'

export default function SchedaAllergeniView({ ricettario, tipoAttivita }) {
  const LEX = useMemo(() => lessico(tipoAttivita), [tipoAttivita])
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

    // Layout PDF: righe = ricette, colonne = allergeni (coerente con UI).
    const totCols = ALLERGENI.length;
    const labW = 56; // larghezza colonna nome ricetta
    const availW = pw - startX - labW - 8;
    const cW = Math.min(colW, availW / Math.max(1, totCols));

    // Header riga: nomi allergeni (verticali corti o abbreviati)
    doc.setFontSize(6); doc.setFont(undefined,'bold');
    doc.text('Ricetta', startX + 1, y);
    ALLERGENI.forEach((a,i)=>{
      const label = a.label.length > 10 ? a.label.substring(0,9)+'.' : a.label;
      doc.text(label, startX + labW + i*cW + cW/2, y, {align:'center', maxWidth:cW-1});
    });
    y += 5;

    ricette.forEach((r,ri) => {
      doc.setFontSize(7); doc.setFont(undefined,'normal');
      const nome = r.nome.length > 18 ? r.nome.substring(0,17)+'…' : r.nome;
      doc.text(nome, startX, y+rowH*0.6, {maxWidth: labW-2});
      ALLERGENI.forEach((a,i)=>{
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
      // Pagina nuova se serve
      if (y > doc.internal.pageSize.getHeight() - 14) {
        doc.addPage();
        y = 14;
      }
    });

    y += 6;
    doc.setFontSize(6); doc.setTextColor(120);
    doc.text('Le informazioni sugli allergeni possono variare in base ai fornitori. Verificare sempre le etichette dei singoli ingredienti.', startX, y);
    doc.text(`Generato il ${new Date().toLocaleDateString('it-IT')}`, pw-8, y, {align:'right'});
    doc.save('scheda-allergeni.pdf');
  };

  return (
    <div style={{maxWidth:1100}}>
      <div style={{marginBottom:24,display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",color:T.brand,marginBottom:6}}>Sicurezza alimentare</div>
          <p style={{margin:0,fontSize:13,color:T.textSoft,letterSpacing:"-0.005em",lineHeight:1.5,fontWeight:500}}>Panoramica degli allergeni per tutte le {LEX.ricette} — Regolamento UE 1169/2011</p>
        </div>
        <button onClick={esportaPDF}
          style={{padding:"10px 16px",borderRadius:R.md,border:`1px solid ${T.border}`,background:T.bgCard,fontSize:13,fontWeight:500,color:T.textMid,cursor:"pointer",letterSpacing:"-0.005em",display:"inline-flex",alignItems:"center",gap:6,boxShadow:S.sm}}>
          <Icon name="fileText" size={14} />Esporta PDF
        </button>
      </div>

      {ricette.length===0 ? (
        <div style={{textAlign:"center",padding:"60px 0",color:C.textSoft,fontSize:13}}>
          {LEX.nessunaRicetta} nel {LEX.Ricettario.toLowerCase()}. Aggiungi {LEX.ricette} con i loro allergeni per visualizzare la scheda.
        </div>
      ) : (
        <>
          {/* Tabella ricette × allergeni — righe = ricette, colonne = allergeni.
              Audit 2026-06-24: scambiati gli assi perché le ricette sono molte
              più degli allergeni (14 standard UE) e crescono nel tempo, mentre
              gli allergeni sono fissi. Vertical scroll naturale sulle ricette,
              prima colonna sticky col nome ricetta per non perdere il contesto
              scrollando orizzontalmente sui 14 allergeni. */}
          <div style={{background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:16,overflow:"auto",WebkitOverflowScrolling:"touch",boxShadow:"0 1px 2px rgba(15,23,42,0.04), 0 10px 28px rgba(15,23,42,0.05)",marginBottom:24}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth: 140 + ALLERGENI.length * 52}}>
              <thead>
                <tr style={{background:"#F8F4F2"}}>
                  <th style={{padding:"10px 10px",textAlign:"left",fontSize:10,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:C.textSoft,borderBottom:`1px solid ${C.border}`,minWidth:140,maxWidth:140,position:"sticky",left:0,background:"#F8F4F2",zIndex:2,boxShadow:"4px 0 8px -4px rgba(15,23,42,0.12)"}}>Ricetta</th>
                  {ALLERGENI.map(a=>(
                    <th key={a.id} title={a.label} style={{padding:"10px 4px",textAlign:"center",fontSize:9.5,fontWeight:700,color:C.text,borderBottom:`1px solid ${C.border}`,minWidth:48,maxWidth:60,lineHeight:1.2,whiteSpace:"normal",wordBreak:"break-word",verticalAlign:"middle"}}>
                      {a.label.length>8?a.label.substring(0,7)+"…":a.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ricette.map((r,ri)=>(
                  <tr key={r.nome} style={{background:ri%2===0?C.white:"#FDFAF8",borderBottom:`1px solid ${C.border}`}}>
                    <td style={{padding:"10px 10px",fontWeight:600,fontSize:12,color:C.text,position:"sticky",left:0,background:ri%2===0?C.white:"#FDFAF8",minWidth:140,maxWidth:140,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",zIndex:1,boxShadow:"4px 0 8px -4px rgba(15,23,42,0.06)"}} title={r.nome}>
                      {r.nome}
                    </td>
                    {ALLERGENI.map(a=>{
                      const has=algMap[r.nome]?.has(a.id);
                      return (
                        <td key={a.id} style={{padding:"10px 4px",textAlign:"center"}}>
                          {has ? (
                            <span aria-label={`Contiene ${a.label}`} title={`Contiene ${a.label}`} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:26,height:26,borderRadius:6,background:`${ALLERGENE_COLORS[a.id]}20`,border:`1.5px solid ${ALLERGENE_COLORS[a.id]}`,color:ALLERGENE_COLORS[a.id],fontSize:13,fontWeight:900}}>✓</span>
                          ) : (
                            <span aria-label={`Senza ${a.label}`} style={{display:"inline-block",width:26,height:26,borderRadius:6,border:`1px solid #E8E0DC`,background:"#FAFAFA"}}/>
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
            <strong style={{display:"inline-flex",alignItems:"center",gap:4,verticalAlign:"middle"}}><Icon name="warning" size={13} />Disclaimer:</strong> Le informazioni sugli allergeni sono indicative e si basano sulle ricette inserite. Gli allergeni possono variare in base ai fornitori e alla contaminazione crociata durante la produzione. Verificare sempre le etichette dei singoli ingredienti e aggiornare la scheda ad ogni modifica di ricetta o fornitore. <em>Regolamento UE 1169/2011 — Art. 21.</em>
          </div>
        </>
      )}
    </div>
  );
}
