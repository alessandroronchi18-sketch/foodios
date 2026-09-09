import fs from 'fs'
import { buildIngCosti, calcolaFC, calcolaFCDettaglio, getR, isRicettaValida, normIng, costoRigaIngrediente } from '../src/lib/foodcost.js'

const raw = fs.readFileSync('/private/tmp/claude-501/-Users-aler/9f6951b3-de3c-4957-87bb-13e3d181ef98/scratchpad/all-ric.txt','utf8').trim().split('\n')
const fmt = v => Number(v||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})

for (const line of raw) {
  const i = line.indexOf('|')
  const org = line.slice(0,i)
  let d; try { d = JSON.parse(line.slice(i+1)) } catch { continue }
  const ricette = d.ricette || {}
  const ingCosti = buildIngCosti(d.ingredienti_costi || {})
  const ricettario = d
  const semi = Object.values(ricette).filter(r => isRicettaValida(r.nome) && getR(r.nome, r).tipo === 'semilavorato')
  if (!semi.length) continue
  console.log('=== ORG', org, ' ricette:', Object.keys(ricette).length)
  for (const ric of semi) {
    const nomeKeyNorm = normIng((ric.nome||'').toLowerCase())
    const usato=[]
    for (const r of Object.values(ricette)) {
      if (r.nome === ric.nome) continue
      if (!isRicettaValida(r.nome)) continue
      for (const ing of (r.ingredienti||[])) {
        if (normIng((ing.nome||'').toLowerCase()) === nomeKeyNorm) { usato.push({nome:r.nome, qty: ing.qty1stampo||0}); break }
      }
    }
    const { tot: fc, mancanti } = calcolaFC(ric, ingCosti, ricettario)
    const peso = (ric.ingredienti||[]).reduce((s,i)=>s+(i.qty1stampo||0),0)
    const costoKg = peso>0 ? fc/peso*1000 : 0
    const det = calcolaFCDettaglio(ric, ingCosti, ricettario)
    console.log(`  -- ${ric.nome}: tipoRaw=${ric.tipo} fc(calcolaFC)=${fc} fc(dettaglio)=${det.tot} peso=${peso} costoKg=${fmt(costoKg)} usato=[${usato.map(u=>u.nome+':'+u.qty).join(', ')}] mancantiFC=${JSON.stringify(mancanti)}`)
    console.log('     righe:', det.righe.map(r=>`${r.nome}=${r.costo}${r.mancante?'(MANC)':''}${r.isStima?'(stima)':''}`).join(' | '))
    // cosa attribuisce la ricetta madre
    for (const u of usato) {
      const madre = ricette[u.nome] || Object.values(ricette).find(r=>r.nome===u.nome)
      const ing = (madre.ingredienti||[]).find(x => normIng((x.nome||'').toLowerCase())===nomeKeyNorm)
      const r = costoRigaIngrediente(ing, ingCosti, ricettario)
      const kgAttrib = ing.qty1stampo ? r.costo / ing.qty1stampo * 1000 : 0
      console.log(`     madre "${u.nome}": qty=${ing.qty1stampo} costoRiga=${r.costo} => ${fmt(kgAttrib)} EUR/kg attribuiti | mancante=${r.mancante} motivo=${r.motivo}`)
    }
  }
}
