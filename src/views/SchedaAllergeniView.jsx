// SchedaAllergeniView - la proposta di scheda allergeni. Estratta da Dashboard.jsx.
// Allergeni per ricetta: usa quelli salvati dal titolare, altrimenti li propone
// dagli ingredienti (le ricette importate da Excel spesso non li hanno salvati).
//
// 18/09/2026: qui non si dichiara niente. Il programma propone, il titolare
// controlla e conferma, e quello che consegna al suo cliente è il documento
// confermato da lui. Le parole stanno tutte in `src/lib/allergeni.js`
// (`AVVERTENZA_ALLERGENI` e sorelle), così schermo e PDF non possono divergere.
import React, { useMemo } from 'react'
import { color as T, radius as R, shadow as S, typo } from '../lib/theme'
import {
  ALLERGENI, ALLERGENE_COLORS, analizzaAllergeni,
  AVVERTENZA_ALLERGENI, AVVERTENZA_ALLERGENI_TITOLO, AVVERTENZA_ALLERGENI_PDF,
  RIFERIMENTO_NORMATIVO_ALLERGENI, LEGENDA_ALLERGENI,
} from '../lib/allergeni'
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
    doc.text('Scheda allergeni - proposta da confermare', pw/2, y, {align:'center'});
    y += 6;
    doc.setFontSize(7); doc.setFont(undefined,'normal');
    doc.setTextColor(120);
    doc.text('Ricavata dagli ingredienti scritti nelle ricette. Da controllare e firmare prima di consegnarla.', pw/2, y, {align:'center'});
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

    // ── Legenda, avvertenza e firma ──
    //
    // Questo blocco è la parte che conta di più del PDF, e per due motivi.
    //
    // Il primo: il foglio viaggia da solo. Esce dalla stampante e finisce in
    // mano a chi entra in negozio e chiede se c'è il latte. Quello che resta
    // scritto a schermo non lo accompagna, quindi l'avvertenza va sulla carta.
    //
    // Il secondo: finché nessuno ha firmato, il foglio deve dire da sé di
    // essere una bozza. La riga della firma non è burocrazia — è il gesto con
    // cui il documento smette di essere una proposta del programma e diventa
    // la dichiarazione di chi produce.
    const hPagina = doc.internal.pageSize.getHeight();
    const altezzaBlocco = 30;
    if (y > hPagina - altezzaBlocco) { doc.addPage(); y = 14; }

    y += 6;
    doc.setFontSize(6); doc.setTextColor(120);
    doc.text(
      `X = ${LEGENDA_ALLERGENI.certo}    ? = ${LEGENDA_ALLERGENI.dubbio}    (vuoto) = ${LEGENDA_ALLERGENI.assente}`,
      startX, y);
    y += 4.5;

    doc.setFontSize(7); doc.setTextColor(60);
    const righeAvviso = doc.splitTextToSize(AVVERTENZA_ALLERGENI_PDF, pw - startX * 2);
    doc.text(righeAvviso, startX, y);
    y += righeAvviso.length * 3.2 + 5;

    // Riga da firmare. Senza firma il documento resta una proposta, e lo dice.
    doc.setDrawColor(120);
    doc.line(startX, y, startX + 70, y);
    doc.line(startX + 82, y, startX + 122, y);
    doc.setFontSize(6); doc.setTextColor(120);
    doc.text('Controllata e confermata da (nome e firma)', startX, y + 3.5);
    doc.text('Data della conferma', startX + 82, y + 3.5);
    doc.text(`Proposta generata da Foodos il ${new Date().toLocaleDateString('it-IT')}`, pw - 8, y + 3.5, { align: 'right' });
    doc.setTextColor(0);
    doc.save('scheda-allergeni-da-confermare.pdf');
  };

  return (
    <div style={{maxWidth:1200, margin:'0 auto', width:'100%', boxSizing:'border-box'}}>
      <div style={{marginBottom:24,display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize: 12,fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",color:T.brand,marginBottom:6}}>Sicurezza alimentare</div>
          <p style={{margin:0,fontSize:13,color:T.textSoft,letterSpacing:"-0.005em",lineHeight:1.5,fontWeight:500}}>Quello che risulta dagli ingredienti delle tue {LEX.ricette}. È una proposta: controllala e confermala tu prima di consegnarla.</p>
        </div>
        <button onClick={esportaPDF}
          title="Il PDF esce come proposta, con l'avvertenza stampata e la riga per la firma"
          style={{padding:"10px 16px",borderRadius:R.md,border:`1px solid ${T.border}`,background:T.bgCard,fontSize:13,fontWeight:500,color:T.textMid,cursor:"pointer",letterSpacing:"-0.005em",display:"inline-flex",alignItems:"center",gap:6,boxShadow:S.sm}}>
          <Icon name="fileText" size={14} />Esporta la proposta
        </button>
      </div>

      {/* L'avvertenza sta in cima, prima della tabella.
          Prima era in fondo alla pagina, sotto quattordici colonne e una
          legenda, con scritto «Disclaimer». Chi apre una scheda per stamparla
          non arriva mai là sotto, e «disclaimer» è una parola che si salta.
          Adesso è la prima cosa che si legge, e dice in che rapporto stanno il
          programma e chi produce: uno propone, l'altro firma. */}
      <div style={{background:T.bgSubtle,border:`1px solid ${T.border}`,borderLeft:`3px solid ${T.brand}`,borderRadius:10,padding:"14px 18px",marginBottom:18,display:"flex",alignItems:"flex-start",gap:10}}>
        <span style={{color:T.brand,flexShrink:0,display:"inline-flex",marginTop:2}}><Icon name="info" size={16} /></span>
        <div style={{minWidth:0}}>
          <div style={{...typo.small,fontWeight:700,color:T.text,marginBottom:3}}>{AVVERTENZA_ALLERGENI_TITOLO}</div>
          <div style={{...typo.small,color:T.textMid,lineHeight:1.6}}>{AVVERTENZA_ALLERGENI}</div>
          <div style={{...typo.small,color:T.textSoft,marginTop:5}}>{RIFERIMENTO_NORMATIVO_ALLERGENI}</div>
        </div>
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
                ? `1 ${LEX.ricetta} con ingredienti da verificare`
                : `${daControllare.length} ${LEX.ricette} hanno ingredienti da verificare`}
            </div>
            <div style={{...typo.small,color:T.textMid,lineHeight:1.55}}>
              Sono ingredienti che non riconosciamo, oppure che di solito portano un allergene senza certezza — il cioccolato con la lecitina di soia, le basi da gelateria col latte in polvere. Leggi l'etichetta del fornitore e salva gli allergeni sulla {LEX.ricetta}: da quel momento la scheda riporta la tua risposta al posto del punto di domanda.
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
                  <th style={{padding:"10px 10px",textAlign:"left",fontSize: 12,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:C.textSoft,borderBottom:`1px solid ${C.border}`,minWidth:140,maxWidth:140,position:"sticky",left:0,background:"#F8F4F2",zIndex:2,boxShadow:"4px 0 8px -4px rgba(15,23,42,0.12)"}}>Ricetta</th>
                  {ALLERGENI.map(a=>(
                    <th key={a.id} title={a.label} style={{padding:"10px 4px",textAlign:"center",fontSize: 12,fontWeight:700,color:C.text,borderBottom:`1px solid ${C.border}`,minWidth:48,maxWidth:60,lineHeight:1.2,whiteSpace:"normal",wordBreak:"break-word",verticalAlign:"middle"}}>
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
                            /* «risulta», non «contiene». La differenza non è
                               formale: il programma ha letto un nome di
                               ingrediente, non una confezione. */
                            <span aria-label={`${a.label}: ${LEGENDA_ALLERGENI.certo}`} title={`${a.label}: ${LEGENDA_ALLERGENI.certo}`} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:26,height:26,borderRadius:6,background:`${ALLERGENE_COLORS[a.id]}20`,border:`1.5px solid ${ALLERGENE_COLORS[a.id]}`,color:ALLERGENE_COLORS[a.id]}}>
                              <Icon name="check" size={14} />
                            </span>
                          ) : dubbio ? (
                            /* Terzo stato: probabile. Il punto di domanda si
                               distingue dal segno di spunta anche da chi non
                               vede i colori, che su una scheda di legge conta. */
                            <span aria-label={`${a.label}: ${LEGENDA_ALLERGENI.dubbio}`} title={`${a.label}: ${LEGENDA_ALLERGENI.dubbio}`}
                              style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:26,height:26,borderRadius:6,background:T.amberLight,border:`1.5px dashed ${T.amber}`,color:T.amber,...typo.body,fontWeight:800}}>?</span>
                          ) : (
                            /* Una casella vuota diceva «Senza glutine»: è una
                               dichiarazione, e nessuno l'ha fatta. Dice solo
                               che dagli ingredienti scritti non risulta. */
                            <span aria-label={`${a.label}: ${LEGENDA_ALLERGENI.assente}`} title={`${a.label}: ${LEGENDA_ALLERGENI.assente}`} style={{display:"inline-block",width:26,height:26,borderRadius:6,border:`1px solid ${T.border}`,background:T.bgSubtle}}/>
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
              [LEGENDA_ALLERGENI.certo, <span key="a" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:22,height:22,borderRadius:5,background:`${T.brand}20`,border:`1.5px solid ${T.brand}`,color:T.brand}}><Icon name="check" size={12} /></span>],
              [LEGENDA_ALLERGENI.dubbio, <span key="b" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:22,height:22,borderRadius:5,background:T.amberLight,border:`1.5px dashed ${T.amber}`,color:T.amber,...typo.small,fontWeight:800}}>?</span>],
              [LEGENDA_ALLERGENI.assente, <span key="c" style={{display:"inline-block",width:22,height:22,borderRadius:5,border:`1px solid ${T.border}`,background:T.bgSubtle}}/>],
            ].map(([testo,segno])=>(
              <span key={testo} style={{display:"inline-flex",alignItems:"center",gap:7,...typo.small,color:C.textMid}}>
                {segno}{testo}
              </span>
            ))}
          </div>

          {/* Cosa succede quando si esporta.
              L'avvertenza vera è in cima alla pagina: qui si dice solo cosa
              porta con sé il foglio che esce dalla stampante, perché è quello
              che il titolare consegna e che viaggia senza di noi. */}
          <div style={{background:T.bgSubtle,border:`1px solid ${T.border}`,borderRadius:10,padding:"13px 18px",fontSize:12,color:T.textMid,lineHeight:1.7}}>
            Il PDF esce con questa stessa avvertenza stampata e con una riga da firmare. Finché non la firmi resta una proposta: firmarla vuol dire che l'hai controllata sulle etichette dei tuoi fornitori e che te ne prendi la responsabilità. Rifallo ogni volta che cambi una {LEX.ricetta} o un fornitore.
          </div>
        </>
      )}
    </div>
  );
}
