// Ricava l'anagrafica fornitori dalle fatture già registrate.
//
// Perché esiste (09/09/2026): le fatture entrano in FoodOS dallo Scadenziario,
// che le legge dai file XML/P7M. Nel database di produzione sono 217 fatture per
// Mara (77 fornitori diversi, 82.676 €) e 201 per Gelateria Demo. Ma la pagina
// Fornitori leggeva solo l'anagrafica scritta a mano nel suo form, e Mara ha
// l'anagrafica vuota: apriva la pagina e leggeva "Fornitori attivi 0, Spesa 0 €"
// mentre il dato era già dentro il sistema.
//
// Per popolarla a mano servivano 77 form compilati uno per uno, con nome,
// referente, email, telefono, IBAN e categoria. Nessuno lo fa, e infatti nessuno
// l'aveva fatto: il match fra i nomi delle fatture e l'anagrafica era 0 su 77.
//
// Qui la parte calcolabile e verificabile: chi manca, quanto ha fatturato, cosa
// sappiamo di lui. L'inserimento vero lo fa il componente, dopo che la persona
// ha scelto quali prendere: non inseriamo niente di nascosto.

// Stessa normalizzazione usata dallo Scadenziario (Scadenzario.jsx:18), perché i
// due percorsi devono considerare "lo stesso fornitore" le stesse scritture.
export const normNomeFornitore = s => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ')

// Raggruppa le fatture per fornitore normalizzato.
//
// fatture: righe della tabella `fatture` (servono fornitore, totale, data_fattura,
//          iban; il resto viene ignorato).
// fornitoriEsistenti: righe di `fornitori` (serve nome).
// oggiISO: data di riferimento in formato YYYY-MM-DD, passata da fuori perché
//          questa funzione resti verificabile con un test.
//
// Ritorna { daImportare, giaPresenti, totaleFatture } dove ogni voce ha:
//   nome           il nome così come compare più spesso nelle fatture
//   nFatture       quante fatture di quel fornitore
//   totale         somma dei totali
//   totale30gg     somma degli ultimi 30 giorni rispetto a oggiISO
//   ultimaData     data della fattura più recente
//   iban           l'IBAN se almeno una fattura lo porta
export function raggruppaFornitoriDaFatture(fatture, fornitoriEsistenti, oggiISO) {
  const presenti = new Set((fornitoriEsistenti || [])
    .map(f => normNomeFornitore(f?.nome))
    .filter(Boolean))

  const soglia = (() => {
    if (!oggiISO) return null
    const d = new Date(`${oggiISO}T00:00:00`)
    if (Number.isNaN(d.getTime())) return null
    d.setDate(d.getDate() - 30)
    return d.toISOString().slice(0, 10)
  })()

  const perChiave = new Map()
  let totaleFatture = 0

  for (const f of (fatture || [])) {
    const chiave = normNomeFornitore(f?.fornitore)
    if (!chiave) continue
    totaleFatture++
    const importo = Number(f?.totale) || 0
    const data = f?.data_fattura || null

    let v = perChiave.get(chiave)
    if (!v) {
      v = { chiave, nome: String(f.fornitore).trim(), nFatture: 0, totale: 0, totale30gg: 0, ultimaData: null, iban: null, _varianti: new Map() }
      perChiave.set(chiave, v)
    }
    v.nFatture++
    v.totale += importo
    if (soglia && data && data >= soglia) v.totale30gg += importo
    if (data && (!v.ultimaData || data > v.ultimaData)) v.ultimaData = data
    // L'IBAN più recente vince: se un fornitore cambia banca, l'ultimo è quello giusto.
    if (f?.iban && (!v._ibanData || (data && data >= v._ibanData))) { v.iban = f.iban; v._ibanData = data }
    // Il nome da mostrare è la scrittura più frequente, non la prima incontrata:
    // nelle fatture reali lo stesso fornitore compare con maiuscole diverse.
    const varianteRaw = String(f.fornitore).trim()
    v._varianti.set(varianteRaw, (v._varianti.get(varianteRaw) || 0) + 1)
  }

  const voci = [...perChiave.values()].map(v => {
    const nome = [...v._varianti.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]
    const { _varianti, _ibanData, ...pulita } = v
    return { ...pulita, nome }
  })

  // Ordine: chi ha fatturato più euro prima, perché è quello che conta importare.
  voci.sort((a, b) => b.totale - a.totale || a.nome.localeCompare(b.nome, 'it'))

  return {
    daImportare: voci.filter(v => !presenti.has(v.chiave)),
    giaPresenti: voci.filter(v => presenti.has(v.chiave)),
    totaleFatture,
  }
}

// Spesa per fornitore in una finestra temporale, calcolata sulle fatture.
// Serve alla tab Spesa quando gli ordini inseriti a mano sono zero: senza questo
// la pagina diceva "Nessun ordine ricevuto nel periodo" pur avendo 217 fatture.
export function spesaDaFatture(fatture, { da = null, a = null } = {}) {
  const perNome = new Map()
  let totale = 0
  let nFatture = 0
  for (const f of (fatture || [])) {
    const data = f?.data_fattura || null
    if (da && (!data || data < da)) continue
    if (a && (!data || data > a)) continue
    const chiave = normNomeFornitore(f?.fornitore)
    if (!chiave) continue
    const importo = Number(f?.totale) || 0
    totale += importo
    nFatture++
    const v = perNome.get(chiave) || { nome: String(f.fornitore).trim(), totale: 0, nFatture: 0 }
    v.totale += importo
    v.nFatture++
    perNome.set(chiave, v)
  }
  const righe = [...perNome.values()].sort((x, y) => y.totale - x.totale)
  return { righe, totale, nFatture, media: nFatture > 0 ? totale / nFatture : 0 }
}
