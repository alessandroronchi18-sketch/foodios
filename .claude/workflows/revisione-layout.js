export const meta = {
  name: 'revisione-layout',
  description: 'Revisione layout pagina per pagina: cerca con grep, riporta patch pronte da applicare',
  whenToUse: 'Rifinitura visiva delle pagine FoodOS: allineamenti, testi piccoli, glifi, mobile, formato numeri',
  phases: [
    { title: 'Sonda', detail: 'un agente solo: se la quota non c\'e non spreco gli altri' },
    { title: 'Layout', detail: '2 pagine alla volta, stop se un blocco intero muore' },
  ],
}

// Economia di token, la regola di questo workflow:
//   l'agente NON legge i file interi. Cerca con grep i pattern esatti della
//   checklist, legge solo le righe che escono, e restituisce PATCH PRONTE
//   (stringa vecchia -> stringa nuova, univoca nel file). Applicarle costa
//   quasi zero a chi le riceve. Un agente che "legge tutto e commenta" spende
//   dieci volte tanto e produce meno.

const OUT = args?.out || '/tmp/audit-layout'
const PAGINE = Array.isArray(args?.pagine) ? args.pagine : []

const SCHEMA = {
  type: 'object',
  properties: {
    pagina: { type: 'string' },
    completata: { type: 'boolean' },
    patch: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          riga: { type: 'number' },
          categoria: { type: 'string', description: 'testo-piccolo | glifo | numero-it | euro-posizione | allineamento | mobile | contrasto | tocco-piccolo | emoji' },
          perche: { type: 'string', description: 'cosa vede di sbagliato chi usa la pagina' },
          vecchio: { type: 'string', description: 'stringa esatta da sostituire, univoca nel file' },
          nuovo: { type: 'string', description: 'stringa sostitutiva' },
        },
        required: ['file', 'categoria', 'perche', 'vecchio', 'nuovo'],
      },
    },
    non_meccaniche: {
      type: 'array',
      items: { type: 'string' },
      description: 'problemi di layout che NON si risolvono con una sostituzione di stringa: descrizione + file:riga',
    },
  },
  required: ['pagina', 'completata', 'patch'],
}

const CHECKLIST = `Sei il rifinitore visivo di FoodOS, gestionale per pasticcerie e gelaterie. Chi lo usa e' un gelatiere di 60 anni con le mani fredde, spesso su un tablet appoggiato al bancone.

NON TOCCHI NIENTE: sei in sola lettura su src/ e api/. Produci PATCH, non modifiche.

COME LAVORARE PER SPENDERE POCO E TROVARE MOLTO:
Non leggere i file interi. Usa grep con questi pattern e leggi SOLO le righe che escono (con 3 righe di contesto: grep -n -C3).

1. TESTO TROPPO PICCOLO — regola: nessun numero o dato sotto 12px; le etichette sotto 11px non esistono.
   grep -nE "fontSize: (9|10|10\\.5|11|11\\.5)[,}]" <file>
   Correzione: portare a 12 (dati) o 11.5 -> 12 (etichette secondarie). Non alzare oltre: rompe le colonne.

2. GLIFI E EMOJI AL POSTO DELLE ICONE — nel prodotto si usa <Icon name="..." size={n} color={...} />.
   grep -nP "[\\x{2190}-\\x{2BFF}\\x{1F000}-\\x{1FAFF}]" <file>
   Le frecce ← → dei bottoni di navigazione vanno lasciate. Triangolini, spunte, avvisi, pallini: diventano Icon.
   I nomi disponibili sono le chiavi di src/components/Icon.jsx: leggi quel file UNA volta con grep -n "^  [a-z]*:" e riusa i nomi.

3. NUMERI ALL'ITALIANA — ogni numero >= 1000 deve avere il punto delle migliaia.
   grep -n "toFixed(" <file>   e   grep -n "toLocaleString" <file>
   Un toFixed(0/1/2) stampato a schermo senza toLocaleString('it-IT') e' un difetto. Gli helper esistono
   in src/views/_shared.jsx: fmt (euro 2 decimali), fmt0 (euro arrotondato), fmtp (percentuale).

4. EURO DOPO LA CIFRA — sempre "1.477 €", mai "€ 1.477".
   grep -n "€" <file>   -> cerca gli usi con il simbolo prima del numero.

5. ALLINEAMENTO DELLE TESSERE AFFIANCATE — le etichette e i numeri di box messi in fila devono essere
   incolonnati fra loro: stessa minHeight su etichetta, valore e sottotitolo, numeri a destra con
   fontVariantNumeric: 'tabular-nums'.
   grep -n "gridTemplateColumns" <file>  -> guarda i blocchi di KPI e controlla le tre altezze.

6. MOBILE E TABLET — grid con piu' di 2 colonne devono collassare, tabelle larghe in un contenitore
   con overflowX: 'auto' (mai overflow: 'hidden'), tocco >= 40px, input >= 16px su mobile.
   grep -n "gridTemplateColumns\\|overflow" <file>   e   grep -n "isMobile" <file>

7. CONTRASTO — testo grigio chiaro su fondo chiaro. Cerca i colori #9x #Ax #Bx usati come proprieta' color.

REGOLE DELLE PATCH (importantissime, altrimenti non sono applicabili):
- "vecchio" deve comparire UNA SOLA VOLTA nel file: se la stringa e' ambigua, allargala fino a renderla univoca.
- "vecchio" e "nuovo" devono essere identici tranne la modifica: nessuna riscrittura di comodo.
- niente patch che cambiano la logica: solo aspetto. Se serve toccare la logica, va in "non_meccaniche".
- verifica di aver copiato le stringhe DAVVERO dal file (rileggi la riga prima di scriverla).

MAI: emoji nella UI, euro prima della cifra, testo sotto 12px sui dati, numeri senza punto delle migliaia.`

function promptPagina(p) {
  const file = `${OUT}/${p.key}.md`
  return `${CHECKLIST}

PAGINA ASSEGNATA: ${p.key}
File: ${p.file.split(',').map(f => '/Users/aler/foodos/' + f.trim()).join(', ')}
${p.note ? `NOTE: ${p.note}` : ''}

Il file ${file} puo' esistere da un tentativo precedente: leggilo per primo e non ripetere quello che c'e' gia'.
Scrivi in APPEND su ${file} man mano che trovi (una riga per patch: categoria, file:riga, perche', vecchio -> nuovo),
e chiudi con "## FINE". Il file e' il risultato: il return strutturato e' un extra.

Ordina le patch dalla piu' visibile alla meno visibile per chi usa la pagina.
Meglio 15 patch giuste che 40 dubbie: una stringa vecchio che non combacia fa fallire l'applicazione e costa tempo.`
}

if (PAGINE.length === 0) {
  log('nessuna pagina in args.pagine')
  return { patch: [], pagine_ok: 0 }
}

const ordinate = [...PAGINE].sort((a, b) => (a.peso || 999) - (b.peso || 999))
phase('Sonda')
log(`sonda su ${ordinate[0].key}: se la quota agenti non c'e', mi fermo qui`)
const sonda = await agent(promptPagina(ordinate[0]), { label: `sonda:${ordinate[0].key}`, phase: 'Sonda', schema: SCHEMA })
if (!sonda) {
  log(`quota agenti non disponibile: fermato prima di spendere sulle altre ${ordinate.length - 1} pagine`)
  return { bloccato: true, patch: [], pagine_ok: 0, pagine_totali: PAGINE.length }
}

phase('Layout')
const risultati = [sonda]
let fermato = false
for (let i = 1; i < ordinate.length; i += 2) {
  const blocco = ordinate.slice(i, i + 2)
  log(`blocco: ${blocco.map(p => p.key).join(' + ')}`)
  const r = await parallel(blocco.map(p => () => agent(promptPagina(p), { label: p.key, phase: 'Layout', schema: SCHEMA })))
  const vivi = r.filter(Boolean)
  risultati.push(...vivi)
  if (vivi.length === 0) { log('blocco intero perso: mi fermo, i parziali sono su disco'); fermato = true; break }
}

const patch = risultati.flatMap(r => (r.patch || []).map(x => ({ ...x, pagina: r.pagina })))
return {
  patch,
  per_categoria: patch.reduce((a, x) => { a[x.categoria] = (a[x.categoria] || 0) + 1; return a }, {}),
  non_meccaniche: risultati.flatMap(r => r.non_meccaniche || []),
  pagine_ok: risultati.length,
  pagine_totali: PAGINE.length,
  pagine_non_provate: fermato ? ordinate.filter(p => !risultati.some(r => r.pagina === p.key)).map(p => p.key) : [],
}
