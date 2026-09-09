// SchedaAllergeniView - Scheda allergeni (Reg. UE 1169/2011). Estratta da Dashboard.jsx.
// Allergeni effettivi per ricetta: usa quelli salvati, altrimenti auto-detect
// dagli ingredienti (le ricette importate da Excel spesso non li hanno salvati).
import React, { useMemo } from 'react'
import { color as T, radius as R, shadow as S, typo } from '../lib/theme'
import { ALLERGENI, ALLERGENE_COLORS, detectAllergeniFromIngredienti, analizzaAllergeni } from '../lib/allergeni'
import { lessico } from '../lib/lessico'
import { C } from './_shared'
import Icon from '../components/Icon'

export default function SchedaAllergeniView({ ricettario, tipoAttivita }) {
  const LEX = useMemo(() => lessico(tipoAttivita), [tipoAttivita])
  const ricette = Object.values(ricettario?.ricette||{}).filter(r=>r.tipo!=="semilavorato"&&r.tipo!=="interno");

  // Tre stati, non due.
  //
  // Prima qui c'era un solo insieme di allergeni, e una casella vuota voleva
  // dire due cose opposte: "riconosciuto e privo" oppure "non l'ho
  // riconosciuto". Su un documento previsto dal Reg. UE 1169/2011, che si
  // stampa e si consegna al cliente, non possono somigliarsi.
  //
  // Misurato il 09/09 sui 123 nomi di ingrediente veri del database: 81 non
  // producevano nessun allergene, e cinque prodotti da gelateria costruiti con
  // quei nomi davano una riga completamente vuota. Nella mappa la parola
  // "cioccolato" non c'era.
  //
  // Se il titolare ha salvato a mano gli allergeni di una ricetta, quella è la
  // verità e non si solleva alcun dubbio: la verifica l'ha già fatta lui.
  const algMap = useMemo(() => {
    const m = {};
    for (const r of ricette) {
      const salvati = Array.isArray(r.allergeni) ? r.allergeni : [];
      if (salvati.length) {
        m[r.nome] = { certi: new Set(salvati), dubbi: new Set(), ignoti: [], manuale: true };
        continue;
      }
      const a = analizzaAllergeni(r.ingredienti || []);
      m[r.nome] = { certi: new Set(a.certi), dubbi: new Set(a.daVerificare), ignoti: a.nonRiconosciuti, manuale: false };
    }
    return m;
  }, [ricette]);

  // Quante ricette hanno qualcosa da controllare: apre la pagina dicendolo,
  // invece di lasciarlo scoprire cella per cella su quattordici colonne.
  const daControllare = useMemo(
    () => ricette.filter(r => (algMap[r.nome]?.dubbi?.size || 0) > 0 || (algMap[r.nome]?.ignoti?.length || 0) > 0),
    [ricette, algMap]);

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
    doc.text('Reg. UE 1169/2011 - Informazioni sugli allergeni alimentari', pw/2, y, {align:'center'});
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
      const cell = algMap[r.nome];
      ALLERGENI.forEach((a,i)=>{
        const has = cell?.certi?.has(a.id);
        const dubbio = !has && cell?.dubbi?.has(a.id);
        if(has){
          doc.setFillColor(220,50,50);
          doc.rect(startX+labW+i*cW+1, y+1, cW-2, rowH-2, 'F');
          doc.setTextColor(255); doc.setFontSize(8); doc.setFont(undefined,'bold');
          doc.text('X', startX+labW+i*cW+cW/2, y+rowH*0.65, {align:'center'});
          doc.setTextColor(0); doc.setFont(undefined,'normal');
        } else if (dubbio) {
          // Terzo stato anche sul PDF, ed è quello che conta di più: questo
          // foglio si stampa e si consegna al cliente. Una casella vuota su un
          // ingrediente che il programma non conosce sarebbe una dichiarazione
          // falsa. Riquadro tratteggiato con il punto di domanda: si distingue
          // anche stampato in bianco e nero.
          doc.setFillColor(255, 243, 205);
          doc.rect(startX+labW+i*cW+1, y+1, cW-2, rowH-2, 'F');
          doc.setDrawColor(180, 120, 20); doc.setLineDashPattern([0.5, 0.5], 0);
          doc.rect(startX+labW+i*cW+1, y+1, cW-2, rowH-2);
          doc.setLineDashPattern([], 0);
          doc.setTextColor(140, 80, 10); doc.setFontSize(8); doc.setFont(undefined,'bold');
          doc.text('?', startX+labW+i*cW+cW/2, y+rowH*0.65, {align:'center'});
          doc.setTextColor(0); doc.setFont(undefined,'normal');
        } else {
          doc.setDrawColor(220); doc.rect(startX+labW+i*cW+1, y+1, cW-2, rowH-2);
        }
      });
      // Gli ingredienti che il programma non ha riconosciuto vanno scritti,
      // non taciuti: sono quelli su cui l'etichetta del fornitore va letta.
      if (cell?.ignoti?.length) {
        doc.setFontSize(5); doc.setTextColor(140, 80, 10);
        doc.text('da verificare: ' + cell.ignoti.slice(0, 4).join(', '), startX, y + rowH - 0.5, { maxWidth: labW - 2 });
        doc.setTextColor(0);
      }
      y += rowH;
      // Pagina nuova se serve
      if (y > doc.internal.pageSize.getHeight() - 14) {
        doc.addPage();
        y = 14;
      }
    });

    y += 6;
    doc.setFontSize(6); doc.setTextColor(120);
    doc.text('X = contiene    ? = probabile, da verificare sull\'etichetta del fornitore    (vuoto) = non contiene', startX, y);
    y += 3.5;
    doc.text('Le informazioni sugli allergeni possono variare in base ai fornitori. Verificare sempre le etichette dei singoli ingredienti.', startX, y);
    doc.text(`Generato il ${new Date().toLocaleDateString('it-IT')}`, pw-8, y, {align:'right'});
    doc.save('scheda-allergeni.pdf');
  };

  return (
    <div style={{maxWidth:1200, margin:'0 auto', width:'100%', boxSizing:'border-box'}}>
      <div style={{marginBottom:24,display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",color:T.brand,marginBottom:6}}>Sicurezza alimentare</div>
          <p style={{margin:0,fontSize:13,color:T.textSoft,letterSpacing:"-0.005em",lineHeight:1.5,fontWeight:500}}>Panoramica degli allergeni per tutte le {LEX.ricette} - Regolamento UE 1169/2011</p>
        </div>
        <button onClick={esportaPDF}
          style={{padding:"10px 16px",borderRadius:R.md,border:`1px solid ${T.border}`,background:T.bgCard,fontSize:13,fontWeight:500,color:T.textMid,cursor:"pointer",letterSpacing:"-0.005em",display:"inline-flex",alignItems:"center",gap:6,boxShadow:S.sm}}>
          <Icon name="fileText" size={14} />Esporta PDF
        </button>
      </div>

      {daControllare.length > 0 && (
        /* Lo si dice in cima, non lo si fa scoprire cella per cella su
           quattordici colonne: e' l'unica riga della pagina che chiede
           un'azione. */
        <div style={{background:T.amberLight,border:`1px solid ${T.amber}55`,borderRadius:10,padding:"13px 16px",marginBottom:18,display:"flex",alignItems:"flex-start",gap:10}}>
          <span style={{color:T.amber,flexShrink:0,display:"inline-flex",marginTop:1}}><Icon name="warning" size={16} /></span>
          <div style={{minWidth:0}}>
            <div style={{...typo.small,fontWeight:700,color:T.amber,marginBottom:3}}>
              {daControllare.length === 1
                ? `Una ${LEX.ricetta} ha ingredienti da verificare`
                : `${daControllare.length} ${LEX.ricette} hanno ingredienti da verificare`}
            </div>
            <div style={{...typo.small,color:T.textMid,lineHeight:1.55}}>
              Sono ingredienti che non riconosciamo, oppure che di solito portano un allergene senza certezza — il cioccolato con la lecitina di soia, le basi da gelateria col latte in polvere. Leggi l'etichetta del fornitore e salva gli allergeni sulla {LEX.ricetta}: da quel momento questa scheda li dà per certi e il punto di domanda sparisce.
            </div>
            <div style={{...typo.small,color:T.textSoft,marginTop:6,lineHeight:1.5}}>
              {daControllare.slice(0,6).map(r=>r.nome).join(' · ')}{daControllare.length>6?` · e altre ${daControllare.length-6}`:''}
            </div>
          </div>
        </div>
      )}

      {ricette.length===0 ? (
        <div style={{textAlign:"center",padding:"60px 0",color:C.textSoft,fontSize:13}}>
          {LEX.nessunaRicetta} nel {LEX.Ricettario.toLowerCase()}. Aggiungi {LEX.ricette} con i loro allergeni per visualizzare la scheda.
        </div>
      ) : (
        <>
          {/* Tabella ricette × allergeni - righe = ricette, colonne = allergeni.
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
                      const cell=algMap[r.nome];
                      const has=cell?.certi?.has(a.id);
                      const dubbio=!has && cell?.dubbi?.has(a.id);
                      return (
                        <td key={a.id} style={{padding:"10px 4px",textAlign:"center"}}>
                          {has ? (
                            <span aria-label={`Contiene ${a.label}`} title={`Contiene ${a.label}`} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:26,height:26,borderRadius:6,background:`${ALLERGENE_COLORS[a.id]}20`,border:`1.5px solid ${ALLERGENE_COLORS[a.id]}`,color:ALLERGENE_COLORS[a.id]}}>
                              <Icon name="check" size={14} />
                            </span>
                          ) : dubbio ? (
                            /* Terzo stato: probabile. Il punto di domanda si
                               distingue dal segno di spunta anche da chi non
                               vede i colori, che su una scheda di legge conta. */
                            <span aria-label={`${a.label} da verificare in etichetta`} title={`${a.label}: probabile, da verificare sull'etichetta del fornitore`}
                              style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:26,height:26,borderRadius:6,background:T.amberLight,border:`1.5px dashed ${T.amber}`,color:T.amber,...typo.body,fontWeight:800}}>?</span>
                          ) : (
                            <span aria-label={`Senza ${a.label}`} style={{display:"inline-block",width:26,height:26,borderRadius:6,border:`1px solid ${T.border}`,background:T.bgSubtle}}/>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legenda: un punto di domanda che nessuno spiega non vuol dire nulla. */}
          <div style={{display:"flex",gap:20,flexWrap:"wrap",alignItems:"center",marginBottom:14,padding:"12px 16px",background:C.bgCard,border:`1px solid ${C.border}`,borderRadius:10}}>
            {[
              ['contiene', <span key="a" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:22,height:22,borderRadius:5,background:`${T.brand}20`,border:`1.5px solid ${T.brand}`,color:T.brand}}><Icon name="check" size={12} /></span>],
              ['probabile, da verificare in etichetta', <span key="b" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:22,height:22,borderRadius:5,background:T.amberLight,border:`1.5px dashed ${T.amber}`,color:T.amber,...typo.small,fontWeight:800}}>?</span>],
              ['non contiene', <span key="c" style={{display:"inline-block",width:22,height:22,borderRadius:5,border:`1px solid ${T.border}`,background:T.bgSubtle}}/>],
            ].map(([testo,segno])=>(
              <span key={testo} style={{display:"inline-flex",alignItems:"center",gap:7,...typo.small,color:C.textMid}}>
                {segno}{testo}
              </span>
            ))}
          </div>

          {/* Disclaimer legale */}
          <div style={{background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:10,padding:"14px 18px",fontSize:11,color:"#92400E",lineHeight:1.7}}>
            <strong style={{display:"inline-flex",alignItems:"center",gap:4,verticalAlign:"middle"}}><Icon name="warning" size={13} />Disclaimer:</strong> Le informazioni sugli allergeni sono indicative e si basano sulle ricette inserite. Gli allergeni possono variare in base ai fornitori e alla contaminazione crociata durante la produzione. Verificare sempre le etichette dei singoli ingredienti e aggiornare la scheda ad ogni modifica di ricetta o fornitore. <em>Regolamento UE 1169/2011 - Art. 21.</em>
          </div>
        </>
      )}
    </div>
  );
}
