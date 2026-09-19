// foodcost - calcolo food cost ricette + database prezzi HORECA + normalizzazione ingredienti.
//
// Estratto da Dashboard.jsx durante il refactor monolite→views. Tutti i sub-componenti
// (RicettarioView, PLView, SimulatorePrezziView, MagazzinoView, ProduzioneGiornaliera,
// ChiusuraView, AzioniView, DashboardHomeView, ...) usano questi helper.
//
// Esporta:
//   - PREZZI_HORECA           - dizionario prezzi ingrosso standard (€/kg)
//   - SING_PLUR               - mappa plurale→singolare per normalizzazione
//   - normIng(nome)           - normalizza nome ingrediente (lowercase + sing/plur)
//   - EN_IT_INGREDIENTI / EN_IT_PRODOTTI  - mappe traduzione OCR/menù
//   - translateIngredienteEN / translateProdottoEN
//   - NOMI_SKIP, isRicettaValida
//   - REGOLE, getR(nome, ricetta)
//   - isSemilavorato(nome, ricettario)
//   - buildIngCosti(fromFile)
//   - calcolaFC(ricetta, ingCosti, ricettario, depth)

import { costoNettoPerG, hasResaIngrediente } from './rese'
import { tipoDichiarato } from './tipoRicetta'
import { soloData } from './dateLocal'

// ─── Il listino medio di mercato non fa più il conto ──────────────────────
//
// 18/09/2026, decisione del titolare: «la stima di mercato in base a cosa la
// fai? magari con dei fornitori ci sono prezzi amichevoli. occhio toglila che
// può essere fuorviante».
//
// Con questo a `false`, un prezzo preso dal listino qui sotto vale come
// **prezzo mancante**: non entra nel food cost, e la ricetta dice che non si
// può ancora calcolare. Il listino resta e continua a servire — ma come
// suggerimento quando si scrive un prezzo, non come numero che fa il conto.
//
// Cosa costa dirlo, misurato sul ricettario vero di Mara dei Boschi (68
// ricette) il giorno della decisione:
//
//                              prima      dopo
//     ricette con costo completo    ~65        3
//     quota del food cost da stima  47%        0
//
// Sembra un passo indietro ed è il contrario: prima il prodotto mostrava un
// food cost per quasi tutto, e quasi metà di quel numero non era un numero
// dell'azienda. Adesso mostra quello che sa, e per il resto dice dove andare a
// scriverlo. La pagina «Materie prime», nata lo stesso giorno, esiste per
// quello.
//
// Per rimetterlo com'era: questa riga a `true`. È una decisione di prodotto,
// non un dettaglio tecnico, e si cambia in un posto solo.
export const STIMA_DI_MERCATO_FA_IL_CONTO = false

// ─── PREZZI HORECA ────────────────────────────────────────────────────────────
// Prezzi ingrosso aggiornati 2025 - usati come SUGGERIMENTO quando l'utente non
// ha ancora scritto il suo prezzo. Marker `isStima:true`: chi lo legge sa che
// non è un prezzo dell'azienda.
export const PREZZI_HORECA = {
  // ── FARINE & AMIDI ──────────────────────────────────────────────────────────
  "farina 00":              { costoKg:0.88 },
  "farina":                 { costoKg:0.88 },
  "farina tipo 00":         { costoKg:0.88 },
  "farina bianca":          { costoKg:0.88 },
  "farina 0":               { costoKg:0.90 },
  "farina tipo 0":          { costoKg:0.90 },
  "farina manitoba":        { costoKg:1.10 },
  "farina forte":           { costoKg:1.10 },
  "farina w360":            { costoKg:1.15 },
  "farina w330":            { costoKg:1.10 },
  "farina integrale":       { costoKg:1.05 },
  "farina integrale grano": { costoKg:1.05 },
  "farina di farro":        { costoKg:2.80 },
  "farina di riso":         { costoKg:2.20 },
  "farina di mais":         { costoKg:1.40 },
  "farina di mandorle":     { costoKg:13.50 },
  "farina di nocciole":     { costoKg:16.00 },
  "farina di cocco":        { costoKg:5.50 },
  "farina di ceci":         { costoKg:2.60 },
  "farina senza glutine":   { costoKg:3.20 },
  "mix senza glutine":      { costoKg:3.50 },
  "amido riso":             { costoKg:2.60 },
  "amido di riso":          { costoKg:2.60 },
  "amido mais":             { costoKg:1.70 },
  "amido di mais":          { costoKg:1.70 },
  "maizena":                { costoKg:1.70 },
  "fecola":                 { costoKg:1.70 },
  "fecola di patate":       { costoKg:1.90 },
  "amido frumento":         { costoKg:1.50 },
  "amido di frumento":      { costoKg:1.50 },

  // ── ZUCCHERI & DOLCIFICANTI ─────────────────────────────────────────────────
  "zucchero":               { costoKg:0.98 },
  "zucchero semolato":      { costoKg:0.98 },
  "zucchero bianco":        { costoKg:0.98 },
  "zucchero fino":          { costoKg:0.98 },
  "zucchero a velo":        { costoKg:1.45 },
  "zucchero velo":          { costoKg:1.45 },
  "zucchero impalpabile":   { costoKg:1.45 },
  "zucchero di canna":      { costoKg:1.65 },
  "canna da zucchero":      { costoKg:1.65 },
  "zucchero di canna grezzo":{ costoKg:1.65 },
  "zucchero bruno":         { costoKg:1.65 },
  "zucchero muscovado":     { costoKg:3.20 },
  "zucchero demerara":      { costoKg:2.10 },
  "zucchero integrale":     { costoKg:2.20 },
  "zucchero integrale di canna":{ costoKg:2.20 },
  "zucchero panela":        { costoKg:3.40 },
  "fruttosio":              { costoKg:2.80 },
  "destrosio":              { costoKg:1.60 },
  "glucosio":               { costoKg:1.60 },
  "sciroppo di glucosio":   { costoKg:1.40 },
  "miele":                  { costoKg:5.80 },
  "miele di acacia":        { costoKg:7.50 },
  "miele millefiori":       { costoKg:5.80 },
  "sciroppo acero":         { costoKg:12.50 },
  "sciroppo d'acero":       { costoKg:12.50 },
  "maple syrup":            { costoKg:12.50 },
  "sciroppo d acero":       { costoKg:12.50 },
  "melassa":                { costoKg:3.20 },
  "treacle":                { costoKg:3.80 },
  "stevia":                 { costoKg:12.00 },

  // ── LIEVITI ─────────────────────────────────────────────────────────────────
  "lievito":                { costoKg:7.50 },
  "lievito chimico":        { costoKg:7.50 },
  "lievito in polvere":     { costoKg:7.50 },
  "lievito per dolci":      { costoKg:7.50 },
  "lievito istantaneo":     { costoKg:7.50 },
  "baking powder":          { costoKg:7.50 },
  "bicarbonato":            { costoKg:1.90 },
  "bicarbonato di sodio":   { costoKg:1.90 },
  "baking soda":            { costoKg:1.90 },
  "lievito di birra":       { costoKg:3.20 },
  "lievito di birra fresco":{ costoKg:3.20 },
  "lievito fresco":         { costoKg:3.20 },
  "lievito secco":          { costoKg:22.00 },
  "lievito secco attivo":   { costoKg:22.00 },
  "lievito madre":          { costoKg:4.50 },
  "pasta madre":            { costoKg:4.50 },
  "cremor tartaro":         { costoKg:12.00 },

  // ── UOVA ────────────────────────────────────────────────────────────────────
  "uova":                   { costoKg:3.00 },
  "uovo":                   { costoKg:3.00 },
  "uova intere":            { costoKg:3.00 },
  "uovo intero":            { costoKg:3.00 },
  "tuorlo":                 { costoKg:6.20 },
  "tuorli":                 { costoKg:6.20 },
  "tuorlo d'uovo":          { costoKg:6.20 },
  "tuorli d'uovo":          { costoKg:6.20 },
  "albume":                 { costoKg:2.80 },
  "albumi":                 { costoKg:2.80 },
  "albume d'uovo":          { costoKg:2.80 },
  "albumi d'uovo":          { costoKg:2.80 },
  "uova in polvere":        { costoKg:14.00 },
  "tuorlo in polvere":      { costoKg:18.00 },

  // ── LATTICINI ───────────────────────────────────────────────────────────────
  "latte":                  { costoKg:0.95 },
  "latte intero":           { costoKg:0.95 },
  "latte fresco":           { costoKg:0.95 },
  "latte parzialmente scremato":{ costoKg:0.90 },
  "latte scremato":         { costoKg:0.88 },
  "latte UHT":              { costoKg:0.92 },
  "latte in polvere":       { costoKg:5.80 },
  "burro":                  { costoKg:5.80 },
  "burro di qualità":       { costoKg:5.80 },
  "burro chiarificato":     { costoKg:7.50 },
  "burro salato":           { costoKg:6.20 },
  "panna":                  { costoKg:3.40 },
  "panna fresca":           { costoKg:3.40 },
  "panna liquida":          { costoKg:3.40 },
  "panna da montare":       { costoKg:3.40 },
  "panna da cucina":        { costoKg:2.80 },
  "panna acida":            { costoKg:4.20 },
  "sour cream":             { costoKg:4.20 },
  "crème fraîche":          { costoKg:5.00 },
  "creme fraiche":          { costoKg:5.00 },
  "panna cotta":            { costoKg:3.40 },
  "buttermilk":             { costoKg:1.90 },
  "latticello":             { costoKg:1.90 },
  "yogurt":                 { costoKg:1.80 },
  "yogurt intero":          { costoKg:1.80 },
  "yogurt greco":           { costoKg:2.60 },
  "mascarpone":             { costoKg:6.20 },
  "ricotta":                { costoKg:3.80 },
  "ricotta fresca":         { costoKg:3.80 },
  "ricotta vaccina":        { costoKg:3.80 },
  "formaggio cremoso":      { costoKg:7.50 },
  "cream cheese":           { costoKg:7.50 },
  "philadelphia":           { costoKg:8.50 },
  "formaggio spalmabile":   { costoKg:7.50 },
  "formaggio fresco":       { costoKg:7.50 },
  "panna vegetale":         { costoKg:3.20 },
  "latte condensato":       { costoKg:4.20 },
  "latte condensato zuccherato":{ costoKg:4.20 },
  "latte evaporato":        { costoKg:3.50 },

  // ── CIOCCOLATO ──────────────────────────────────────────────────────────────
  "cioccolato fondente":    { costoKg:8.50 },
  "cioccolato dark":        { costoKg:8.50 },
  "copertura fondente":     { costoKg:8.50 },
  "copertura al latte":     { costoKg:7.80 },
  "cioccolato al latte":    { costoKg:7.80 },
  "cioccolato bianco":      { costoKg:9.20 },
  "copertura bianca":       { costoKg:9.20 },
  "cioccolato ruby":        { costoKg:14.00 },
  "cacao in polvere":       { costoKg:9.50 },
  "cacao":                  { costoKg:9.50 },
  "cacao amaro":            { costoKg:9.50 },
  "cacao alcalizzato":      { costoKg:10.00 },
  "cacao olandese":         { costoKg:10.00 },
  "burro di cacao":         { costoKg:22.00 },
  "cioccolato fondente 70%":{ costoKg:9.00 },
  "cioccolato fondente 80%":{ costoKg:9.80 },
  "gocce di cioccolato":    { costoKg:8.80 },
  "chips cioccolato":       { costoKg:8.80 },
  "scaglie di cioccolato":  { costoKg:8.80 },
  "cioccolato domori":      { costoKg:18.00 },

  // ── FRUTTA SECCA & SEMI ─────────────────────────────────────────────────────
  "nocciole":               { costoKg:16.00 },
  "nocciole tostate":       { costoKg:17.00 },
  "nocciole intere":        { costoKg:16.00 },
  "granella di nocciole":   { costoKg:16.50 },
  "pasta di nocciole":      { costoKg:18.00 },
  "mandorle":               { costoKg:11.00 },
  "mandorle intere":        { costoKg:11.00 },
  "mandorle pelate":        { costoKg:12.00 },
  "mandorle a lamelle":     { costoKg:12.50 },
  "mandorle a scaglie":     { costoKg:12.50 },
  "pasta di mandorle":      { costoKg:14.00 },
  "marzapane":              { costoKg:10.00 },
  "noci":                   { costoKg:12.50 },
  "noci sgusciate":         { costoKg:12.50 },
  "gherigli di noce":       { costoKg:12.50 },
  "noci pecan":             { costoKg:19.00 },
  "noci macadamia":         { costoKg:22.00 },
  "anacardi":               { costoKg:14.00 },
  "pistacchi":              { costoKg:24.00 },
  "pasta di pistacchi":     { costoKg:32.00 },
  "arachidi":               { costoKg:4.80 },
  "burro di arachidi":      { costoKg:6.50 },
  "pinoli":                 { costoKg:38.00 },
  "uvetta":                 { costoKg:4.80 },
  "uvetta sultanina":       { costoKg:4.80 },
  "uva passa":              { costoKg:4.80 },
  "datteri":                { costoKg:6.50 },
  "prugne secche":          { costoKg:5.50 },
  "albicocche secche":      { costoKg:7.00 },
  "fichi secchi":           { costoKg:5.80 },
  "cranberry":              { costoKg:9.00 },
  "mirtilli secchi":        { costoKg:8.50 },
  "cocco rapé":             { costoKg:4.80 },
  "cocco disidratato":      { costoKg:4.80 },
  "semi di chia":           { costoKg:8.50 },
  "semi di lino":           { costoKg:2.80 },
  "semi di papavero":       { costoKg:10.50 },
  "semi di girasole":       { costoKg:2.80 },
  "semi di zucca":          { costoKg:6.50 },
  "semi di sesamo":         { costoKg:5.50 },
  "sesamo":                 { costoKg:5.50 },
  "tahini":                 { costoKg:7.00 },

  // ── OLI & GRASSI ────────────────────────────────────────────────────────────
  "olio di semi":           { costoKg:1.80 },
  "olio di girasole":       { costoKg:1.80 },
  "olio di mais":           { costoKg:2.00 },
  "olio di arachidi":       { costoKg:2.20 },
  "olio di riso":           { costoKg:3.50 },
  "olio extravergine":      { costoKg:5.20 },
  "olio extravergine di oliva":{ costoKg:5.20 },
  "olio di oliva":          { costoKg:4.00 },
  "olio di cocco":          { costoKg:4.50 },
  "margarina":              { costoKg:2.80 },
  "margarina vegetale":     { costoKg:2.80 },
  "strutto":                { costoKg:2.80 },
  "lardo":                  { costoKg:3.20 },
  "shortening":             { costoKg:3.00 },
  "grasso vegetale":        { costoKg:2.80 },

  // ── FRUTTA FRESCA ───────────────────────────────────────────────────────────
  "banane":                 { costoKg:1.40 },
  "banana":                 { costoKg:1.40 },
  "banane mature":          { costoKg:1.40 },
  "carote":                 { costoKg:0.90 },
  "carota":                 { costoKg:0.90 },
  "mele":                   { costoKg:1.80 },
  "mela":                   { costoKg:1.80 },
  "mele golden":            { costoKg:1.80 },
  "mele granny smith":      { costoKg:2.00 },
  "mele renette":           { costoKg:2.00 },
  "pere":                   { costoKg:2.00 },
  "fragole":                { costoKg:4.50 },
  "lamponi":                { costoKg:9.00 },
  "mirtilli":               { costoKg:8.00 },
  "more":                   { costoKg:8.00 },
  "amarene":                { costoKg:5.50 },
  "ciliegie":               { costoKg:5.00 },
  "pesche":                 { costoKg:2.50 },
  "albicocche":             { costoKg:2.80 },
  "prugne":                 { costoKg:2.20 },
  "susine":                 { costoKg:2.20 },
  "ananas":                 { costoKg:2.50 },
  "mango":                  { costoKg:4.00 },
  "papaya":                 { costoKg:3.50 },
  "melograno":              { costoKg:3.00 },
  "kiwi":                   { costoKg:2.20 },
  "limone":                 { costoKg:1.80 },
  "limoni":                 { costoKg:1.80 },
  "arancia":                { costoKg:1.50 },
  "arance":                 { costoKg:1.50 },
  "clementine":             { costoKg:2.00 },
  "uva":                    { costoKg:2.50 },
  "fichi":                  { costoKg:4.50 },
  "zucca":                  { costoKg:1.20 },
  "zucchine":               { costoKg:1.80 },
  "rabarbaro":              { costoKg:3.50 },
  "frutti di bosco surgelati":{ costoKg:4.50 },
  "fragole surgelate":      { costoKg:3.50 },
  "lamponi surgelati":      { costoKg:6.00 },
  "mirtilli surgelati":     { costoKg:5.50 },
  "confettura":             { costoKg:4.00 },
  "marmellata":             { costoKg:3.80 },
  "confettura di albicocche":{ costoKg:4.00 },
  "confettura di fragole":  { costoKg:4.50 },

  // ── AROMI, SPEZIE, ESTRATTI, LIQUORI ────────────────────────────────────────
  "vaniglia":               { costoKg:70.00 },
  "bacca di vaniglia":      { costoKg:70.00 },
  "baccello di vaniglia":   { costoKg:70.00 },
  "vaniglia bourbon":       { costoKg:75.00 },
  "vanillina":              { costoKg:28.00 },
  "estratto di vaniglia":   { costoKg:45.00 },
  "estratto vaniglia":      { costoKg:45.00 },
  "pasta di vaniglia":      { costoKg:35.00 },
  "cannella":               { costoKg:16.00 },
  "cannella in polvere":    { costoKg:16.00 },
  "stecca di cannella":     { costoKg:18.00 },
  "cardamomo":              { costoKg:45.00 },
  "zenzero":                { costoKg:8.00 },
  "zenzero in polvere":     { costoKg:12.00 },
  "zenzero fresco":         { costoKg:8.00 },
  "noce moscata":           { costoKg:30.00 },
  "noce moscata in polvere":{ costoKg:30.00 },
  "chiodi di garofano":     { costoKg:25.00 },
  "anice stellato":         { costoKg:22.00 },
  "anice":                  { costoKg:14.00 },
  "curcuma":                { costoKg:12.00 },
  "zafferano":              { costoKg:6000.00 },
  "pepe":                   { costoKg:18.00 },
  "pepe nero":              { costoKg:18.00 },
  "sale":                   { costoKg:0.40 },
  "sale fino":              { costoKg:0.40 },
  "sale grosso":            { costoKg:0.35 },
  "fleur de sel":           { costoKg:12.00 },
  "sale maldon":            { costoKg:15.00 },
  "sale rosa":              { costoKg:3.50 },
  "zest limone":            { costoKg:3.20 },
  "scorza di limone":       { costoKg:3.20 },
  "buccia di limone":       { costoKg:3.20 },
  "zest arancia":           { costoKg:2.80 },
  "scorza arancia":         { costoKg:2.80 },
  "scorza di arancia":      { costoKg:2.80 },
  "scorza di limone candita":{ costoKg:8.50 },
  "scorza arancia candita": { costoKg:8.50 },
  "frutta candita":         { costoKg:7.00 },
  "rum":                    { costoKg:12.00 },
  "rum scuro":              { costoKg:12.00 },
  "whisky":                 { costoKg:18.00 },
  "amaretto":               { costoKg:10.00 },
  "kirsch":                 { costoKg:14.00 },
  "limoncello":             { costoKg:8.00 },
  "grand marnier":          { costoKg:22.00 },
  "cointreau":              { costoKg:20.00 },
  "brandy":                 { costoKg:10.00 },
  "cognac":                 { costoKg:22.00 },
  "liquore":                { costoKg:10.00 },
  "aroma limone":           { costoKg:18.00 },
  "aroma arancia":          { costoKg:18.00 },
  "aroma mandorla":         { costoKg:20.00 },
  "aroma vaniglia":         { costoKg:22.00 },
  "pasta aromatica":        { costoKg:20.00 },
  "pasta al limone":        { costoKg:18.00 },

  // ── ADDENSANTI, GELATINE & STABILIZZANTI ────────────────────────────────────
  "gelatina":               { costoKg:20.00 },
  "gelatina in fogli":      { costoKg:20.00 },
  "colla di pesce":         { costoKg:20.00 },
  "agar agar":              { costoKg:28.00 },
  "pectina":                { costoKg:22.00 },
  "carragenina":            { costoKg:24.00 },
  "gomma xantana":          { costoKg:18.00 },
  "xantano":                { costoKg:18.00 },
  "amido modificato":       { costoKg:3.50 },
  "instangel":              { costoKg:8.00 },

  // ── DECORAZIONI & GLASSE ────────────────────────────────────────────────────
  "glassa":                 { costoKg:6.50 },
  "glassa al cioccolato":   { costoKg:8.50 },
  "glassa pronta":          { costoKg:6.50 },
  "fondant":                { costoKg:5.50 },
  "pasta di zucchero":      { costoKg:6.00 },
  "sugar paste":            { costoKg:6.00 },
  "pasta frolla pronta":    { costoKg:4.50 },
  "sfoglia pronta":         { costoKg:5.00 },
  "pasta sfoglia":          { costoKg:5.00 },
  "croccante":              { costoKg:8.00 },
  "pralinato":              { costoKg:14.00 },
  "pralinato nocciole":     { costoKg:15.00 },
  "pralinato mandorle":     { costoKg:13.00 },
  "feuilletine":            { costoKg:9.00 },
  "cereali soffiati":       { costoKg:5.00 },
  "riso soffiato":          { costoKg:5.50 },
  "fiocchi d'avena":        { costoKg:1.80 },
  "avena":                  { costoKg:1.80 },
  "fiocchi di avena":       { costoKg:1.80 },
  "granola":                { costoKg:4.50 },
  "biscotti sbriciolati":   { costoKg:4.00 },
  "biscotti digestive":     { costoKg:3.80 },
  "corn flakes":            { costoKg:3.50 },
  "colorante alimentare":   { costoKg:35.00 },
  "colorante rosso":        { costoKg:35.00 },
  "colorante gel":          { costoKg:38.00 },
  "oro alimentare":         { costoKg:450.00 },
  "argento alimentare":     { costoKg:280.00 },
  "zucchero granella":      { costoKg:3.50 },
  "zucchero perle":         { costoKg:8.00 },
  "codette":                { costoKg:7.50 },
  "diavoletti":             { costoKg:7.00 },
  "perle di cioccolato":    { costoKg:9.00 },

  // ── ALTRO ───────────────────────────────────────────────────────────────────
  "acqua":                  { costoKg:0.00 },
  "acqua di rose":          { costoKg:8.00 },
  "acqua di fiori d'arancio":{ costoKg:10.00 },
  "aceto di mele":          { costoKg:3.50 },
  "aceto balsamico":        { costoKg:12.00 },
  "caffè":                  { costoKg:14.00 },
  "caffè espresso":         { costoKg:14.00 },
  "caffè solubile":         { costoKg:22.00 },
  "tè":                     { costoKg:18.00 },
  "the matcha":             { costoKg:55.00 },
  "matcha":                 { costoKg:55.00 },
  "succo di limone":        { costoKg:2.50 },
  "succo limone":           { costoKg:2.50 },
  "succo di arancia":       { costoKg:2.00 },
  "succo d'arancia":        { costoKg:2.00 },
  "lievito madre essiccato":{ costoKg:12.00 },
  "lievito essiccato":      { costoKg:22.00 },
  "amido":                  { costoKg:1.70 },
  "fecola patate":          { costoKg:1.90 },

  // ── INTEGRAZIONI ────────────────────────────────────────────────────────────
  "seme di papavero":       { costoKg:8.50 },
  "papavero":               { costoKg:8.50 },
  "semi papavero":          { costoKg:8.50 },
  "peperoncino":            { costoKg:12.00 },
  "pasta di cacao":         { costoKg:18.00 },
  "massa di cacao":         { costoKg:18.00 },
  "cacao massa":            { costoKg:18.00 },
  "domori":                 { costoKg:22.00 },
  "cocco rapè":             { costoKg:5.50 },
  "cocco grattugiato":      { costoKg:5.50 },
  "trimolina":              { costoKg:3.50 },
  "sciroppo d'agave":       { costoKg:5.00 },
  "agave":                  { costoKg:5.00 },
  "xilitolo":               { costoKg:6.00 },
  "eritritolo":             { costoKg:7.50 },
  "inulina":                { costoKg:8.00 },
  "lecitina di soia":       { costoKg:8.00 },
  "lecitina di girasole":   { costoKg:9.00 },
  "gelatina alimentare":    { costoKg:25.00 },
  "gomma di xantano":       { costoKg:20.00 },
  "albicocca":              { costoKg:4.50 },
  "albicocca secca":        { costoKg:9.00 },
  "fico secco":             { costoKg:8.00 },
  "uva sultanina":          { costoKg:5.50 },
  "mirtillo essiccato":     { costoKg:18.00 },
  "mirtillo rosso essiccato":{ costoKg:20.00 },
  "frutta mista candita":   { costoKg:6.00 },
  "canditi":                { costoKg:6.00 },
  "ciliegie candite":       { costoKg:8.00 },
  "crema di nocciole":      { costoKg:12.00 },
  "nutella":                { costoKg:7.50 },
  "crema spalmabile":       { costoKg:7.50 },
  "miele acacia":           { costoKg:11.00 },
  "pasta di sesamo":        { costoKg:9.00 },
  "burro di mandorle":      { costoKg:18.00 },
  "tofu":                   { costoKg:3.50 },
  "aquafaba":               { costoKg:0.50 },
  "farina avena":           { costoKg:2.20 },
  "farina avena integrale": { costoKg:2.40 },
  "crusca di frumento":     { costoKg:1.20 },
  "crusca d'avena":         { costoKg:2.00 },
  "germe di grano":         { costoKg:3.50 },
  "proteine del siero":     { costoKg:25.00 },
  "whey protein":           { costoKg:25.00 },
  "cacao amaro in polvere": { costoKg:10.00 },
  "cioccolato bianco callebaut":{ costoKg:12.00 },
  "caramello salato":       { costoKg:9.00 },
  "caramello":              { costoKg:7.00 },
  "toffee":                 { costoKg:9.00 },
  "crema pasticcera":       { costoKg:3.00 },
  "crema chantilly":        { costoKg:5.00 },
  "ricotta di mucca":       { costoKg:4.50 },
  "ricotta di pecora":      { costoKg:7.00 },
  "grana padano":           { costoKg:12.00 },
  "parmigiano":             { costoKg:14.00 },
}

// ─── NORMALIZZAZIONE INGREDIENTI ─────────────────────────────────────────────
// Unifica singolare/plurale e varianti comuni: "albumi" → "albume", ecc.
export const SING_PLUR = [
  ["albumi","albume"],["tuorli","tuorlo"],["uova","uovo"],
  ["banane","banana"],["carote","carota"],["mele","mela"],
  ["pere","pera"],["fragole","fragola"],["lamponi","lampone"],
  ["mirtilli","mirtillo"],["more","mora"],["ciliegie","ciliegia"],
  ["pesche","pesca"],["albicocche","albicocca"],["prugne","prugna"],["susine","susina"],
  ["fichi","fico"],["limoni","limone"],["arance","arancia"],["noci","noce"],
  ["mandorle","mandorla"],["nocciole","nocciola"],["pistacchi","pistacchio"],
  ["pinoli","pinolo"],["datteri","dattero"],["anacardi","anacardo"],
  ["arachidi","arachide"],["fiocchi di avena","fiocco di avena"],
  ["semi di chia","seme di chia"],["semi di lino","seme di lino"],
  ["semi di girasole","seme di girasole"],["semi di zucca","seme di zucca"],
  ["semi di sesamo","seme di sesamo"],["semi di papavero","seme di papavero"],
  ["papavero","seme di papavero"],
  ["scorze di limone","scorza di limone"],
  ["cioccolato domori 64%","cioccolato domori"],
  ["cioccolato fondente 64%","cioccolato domori"],
  ["cioccolato fondente 72%","cioccolato fondente"],
  ["cioccolato 70%","cioccolato fondente"],
  ["latte di cocco","cocco disidratato"],["scorze di arancia","scorza di arancia"],
  ["bacche di vaniglia","bacca di vaniglia"],
  ["chiodi di garofano","chiodo di garofano"],
  ["stecche di cannella","stecca di cannella"],
  ["biscotti","biscotto"],["cereali soffiati","cereale soffiato"],
  ["gocce di cioccolato","goccia di cioccolato"],
  ["scaglie di cioccolato","scaglia di cioccolato"],
  ["chips cioccolato","chips cioccolato"],
  ["zucchine","zucchina"],
  // ── Extra pasticceria/gelateria/bar (aggiunte 13/07/2026) ────────────────
  ["cornetti","cornetto"],["croissant","cornetto"],
  ["cioccolatini","cioccolatino"],["praline","pralina"],
  ["tartufini","tartufino"],["sfogliatine","sfogliatina"],
  ["bignè","bigne'"],["bignes","bigne'"],["bigne","bigne'"],
  ["meringhe","meringa"],["madeleines","madeleine"],
  ["cetrioli","cetriolo"],["cipolle","cipolla"],
  ["patate","patata"],["pomodori","pomodoro"],
  ["olive","oliva"],["capperi","cappero"],
  ["chiodini","chiodino"],["stecche","stecca"],
]

const _NORM_MAP = new Map(SING_PLUR.map(([pl, sg]) => [pl, sg]))

export function normIng(nome) {
  const k = (nome || '').toLowerCase().trim().replace(/\s+/g, ' ')
  return _NORM_MAP.get(k) || k
}

// Aggrega ingredienti OCR con stessa chiave normalizzata (sommandone la
// quantita'). Usato quando la foto elenca lo stesso ingrediente scritto in
// modi diversi (tuorlo/tuorli, uovo/uova, ecc.).
// - qtyField: nome del campo con la quantita' (default "quantita", ma alcuni
//   flussi usano "qty1stampo").
// - Ritorna un array con lo stesso shape ma senza duplicati per chiave.
export function mergeIngredientiPerNorm(ings, { qtyField = 'quantita' } = {}) {
  if (!Array.isArray(ings)) return []
  const map = new Map()
  for (const ing of ings) {
    const rawNome = (ing.nome || '').trim()
    if (!rawNome) continue
    const key = normIng(rawNome)
    if (!key) continue
    const qty = Number(ing[qtyField]) || 0
    if (map.has(key)) {
      const acc = map.get(key)
      acc[qtyField] = (Number(acc[qtyField]) || 0) + qty
      // Se il nome corrente e' già nella forma singolare canonica (== key),
      // preferiscilo come display (più pulito del plurale iniziale).
      if (rawNome.toLowerCase() === key) acc.nome = rawNome
    } else {
      map.set(key, { ...ing, nome: rawNome, [qtyField]: qty })
    }
  }
  return [...map.values()]
}

// ─── TRADUZIONI EN→IT (per OCR foto/menù in inglese) ─────────────────────────
export const EN_IT_PRODOTTI = {
  "carrot cake":         "TORTA DI CAROTE",
  "carrot":              "TORTA DI CAROTE",
  "banana bread":        "BANANA BREAD",
  "banana loaf":         "BANANA BREAD",
  "apple cake":          "TORTA DI MELE",
  "apple pie":           "TORTA DI MELE",
  "poppy seed cake":     "POPPY SEEDS",
  "poppy seeds cake":    "POPPY SEEDS",
  "poppy":               "POPPY SEEDS",
  "lemon coconut":       "LIMONE E COCCO",
  "lemon and coconut":   "LIMONE E COCCO",
  "domori":              "DOMORI",
  "chocolate cake":      "DOMORI",
  "dark chocolate":      "DOMORI",
  "cookies":             "COOKIES",
  "shortbread":          "COOKIES",
  "custard":             "CREMA PASTICCERA",
  "pastry cream":        "CREMA PASTICCERA",
  "fruit tart":          "CROSTATA ALLA FRUTTA",
  "tart":                "CROSTATA",
  "fruit":               "FRUIT PER CROSTATE",
  "fruit filling":       "FRUIT PER CROSTATE",
  "fruit curd":          "FRUIT PER CROSTATE",
  "pastry dough":        "PASTA FROLLA",
  "shortcrust":          "PASTA FROLLA",
  "shortcrust pastry":   "PASTA FROLLA",
}

export const EN_IT_INGREDIENTI = {
  "flour":              "farina 00",
  "all purpose flour":  "farina 00",
  "cake flour":         "farina 00",
  "bread flour":        "farina manitoba",
  "whole wheat flour":  "farina integrale",
  "almond flour":       "farina di mandorle",
  "coconut flour":      "farina di cocco",
  "rice flour":         "farina di riso",
  "butter":             "burro",
  "unsalted butter":    "burro",
  "salted butter":      "burro",
  "eggs":               "uovo",
  "egg":                "uovo",
  "egg yolks":          "tuorlo",
  "egg whites":         "albume",
  "egg yolk":           "tuorlo",
  "egg white":          "albume",
  "sugar":              "zucchero",
  "caster sugar":       "zucchero semolato",
  "powdered sugar":     "zucchero a velo",
  "brown sugar":        "zucchero di canna",
  "icing sugar":        "zucchero a velo",
  "milk":               "latte intero",
  "whole milk":         "latte intero",
  "cream":              "panna fresca",
  "heavy cream":        "panna fresca",
  "whipping cream":     "panna fresca",
  "sour cream":         "panna acida",
  "baking powder":      "lievito chimico",
  "baking soda":        "bicarbonato",
  "vanilla":            "estratto di vaniglia",
  "vanilla extract":    "estratto di vaniglia",
  "vanilla bean":       "bacca di vaniglia",
  "cocoa":              "cacao amaro in polvere",
  "cocoa powder":       "cacao amaro in polvere",
  "dark chocolate":     "cioccolato fondente",
  "milk chocolate":     "cioccolato al latte",
  "white chocolate":    "cioccolato bianco",
  "chocolate chips":    "gocce di cioccolato",
  "oil":                "olio di semi",
  "vegetable oil":      "olio di semi",
  "olive oil":          "olio extravergine",
  "honey":              "miele",
  "maple syrup":        "sciroppo d'acero",
  "salt":               "sale",
  "cinnamon":           "cannella in polvere",
  "nutmeg":             "noce moscata",
  "ginger":             "zenzero in polvere",
  "lemon zest":         "scorza di limone",
  "orange zest":        "scorza di arancia",
  "lemon juice":        "succo di limone",
  "orange juice":       "succo di arancia",
  "walnuts":            "noce",
  "almonds":            "mandorla",
  "hazelnuts":          "nocciola",
  "pistachios":         "pistacchio",
  "raisins":            "uvetta",
  "oats":               "fiocchi d'avena",
  "rolled oats":        "fiocchi d'avena",
  "poppy seeds":        "seme di papavero",
  "carrots":            "carota",
  "bananas":            "banana",
  "apples":             "mela",
  "pears":              "pera",
  "strawberries":       "fragola",
  "blueberries":        "mirtillo",
  "raspberries":        "lampone",
  "yogurt":             "yogurt greco",
  "greek yogurt":       "yogurt greco",
  "mascarpone":         "mascarpone",
  "ricotta":            "ricotta",
  "cream cheese":       "cream cheese",
  "cornstarch":         "amido di mais",
  "corn starch":        "amido di mais",
  "potato starch":      "fecola patate",
  "gelatin":            "gelatina alimentare",
  "glucose syrup":      "sciroppo di glucosio",
  "rum":                "rum",
  "brandy":             "cognac",
  "coffee":             "caffè",
  "espresso":           "caffè espresso",
}

export function translateProdottoEN(nome) {
  if (!nome) return nome
  const k = nome.toLowerCase().trim()
  return EN_IT_PRODOTTI[k] || nome.toUpperCase()
}

export function translateIngredienteEN(nome) {
  if (!nome) return nome
  const k = nome.toLowerCase().trim()
  return EN_IT_INGREDIENTI[k] || nome
}

// ─── REGOLE VENDITA & VALIDAZIONE ────────────────────────────────────────────
export const NOMI_SKIP = [
  "nome ricetta", "nan", "undefined", "ricetta", "pasticceria",
  "gelato", "bibite", "bar", "altro", "categoria", "totale",
  "sconto", "subtotale",
]

export const isRicettaValida = nome =>
  nome && !NOMI_SKIP.includes(String(nome).trim().toLowerCase())

// ATTENZIONE: questa tabella e' un RESIDUO. Sono le regole di vendita di una
// singola pasticceria, scritte nel codice ai tempi in cui il tool serviva un
// cliente solo. Oggi ogni azienda ha le sue, salvate nel ricettario.
//
// Serve ancora a due cose, e solo a queste:
//   - fa da cache runtime: Dashboard ci scrive dentro le regole vere dell'org
//     al caricamento, e handleUpdateRegola ci scrive la modifica dell'utente;
//   - fa da ultima spiaggia per un nome mai visto, quando getR viene chiamato
//     senza l'oggetto ricetta.
//
// Non deve MAI vincere sul dato salvato dall'azienda. Fino al 10/09/2026 lo
// faceva: getR guardava questa tabella per prima, e il caricamento in
// Dashboard aveva un `!REGOLE[r.nome]` che impediva di sovrascriverla.
// Conseguenze vere, misurate in produzione:
//   - Pasticceria Mara 1 / TORTA DI CAROTE: prezzo salvato 4 EUR, qui c'e' 5 ->
//     il ricavo di quella torta veniva calcolato il 25% in più;
//   - Gelateria Demo / BANANA BREAD: prezzo salvato 3,50 EUR, qui c'e' 4;
//   - Pasticceria Mara 1 / BANANA BREAD: 12 fette salvate, qui ce ne sono 11.
export const REGOLE = {
  "TORTA DI CAROTE":  { unita:8,  prezzo:5,   tipo:"fetta" },
  "LIMONE E COCCO":   { unita:8,  prezzo:5,   tipo:"fetta" },
  "BANANA BREAD":     { unita:11, prezzo:4,   tipo:"fetta" },
  "DOMORI":           { unita:8,  prezzo:4,   tipo:"fetta" },
  "TORTA DI MELE":    { unita:8,  prezzo:4,   tipo:"fetta" },
  "POPPY SEEDS":      { unita:8,  prezzo:4,   tipo:"fetta" },
  "COOKIES":          { unita:50, prezzo:1.5, tipo:"pezzo" },
  "CREMA PASTICCERA":    { unita:0, prezzo:0, tipo:"semilavorato" },
  "GANACHE VEGANA":      { unita:0, prezzo:0, tipo:"semilavorato" },
  "FRUIT PER CROSTATE":  { unita:0, prezzo:0, tipo:"semilavorato" },
  "PASTA FROLLA":        { unita:0, prezzo:0, tipo:"semilavorato" },
}

// Chiavi built-in di REGOLE, catturate all'import. Servono a ripulire le regole
// runtime iniettate da un'org quando si cambia organizzazione/sede nella stessa
// sessione (es. impersonation admin): senza reset, unita/prezzo/tipo di un'org
// resterebbero in questo singleton di modulo e inquinerebbero i calcoli dell'altra.
const _REGOLE_BUILTIN_KEYS = new Set(Object.keys(REGOLE))

export function resetRegoleRuntime() {
  for (const k of Object.keys(REGOLE)) {
    if (!_REGOLE_BUILTIN_KEYS.has(k)) delete REGOLE[k]
  }
}

export const getR = (nome, ricetta) => {
  // Il dato dell'azienda viene PRIMA della tabella nel codice. Era il
  // contrario, e per i nomi presenti in REGOLE il prezzo salvato dal
  // titolare veniva ignorato (vedi il commento sopra REGOLE).
  if (ricetta?.unita != null) return {
    unita:  ricetta.unita || 0,
    prezzo: ricetta.prezzo || 0,
    // Il `tipo` può mancare su una ricetta importata da un file. Prima di
    // arrendersi si guarda la CATEGORIA, che l'importazione compila («Gusto»,
    // «Semilavorato», «Base»): è una dichiarazione dell'utente, non una
    // deduzione nostra. Poi la tabella, che almeno sa distinguere un
    // semilavorato da una torta a fette. Solo alla fine il ripiego.
    tipo:   tipoDichiarato(ricetta) || REGOLE[nome]?.tipo || "fetta",
    ...(tipoDichiarato(ricetta) || REGOLE[nome]?.tipo ? null : { tipoPresunto: true }),
  }
  if (REGOLE[nome]) return REGOLE[nome]
  // Audit 2026-09-09 ALTA: qui il fallback era `{ unita:8, prezzo:4 }`, cioè un
  // PREZZO DI VENDITA INVENTATO. Le ricette importate da Excel non hanno
  // unita/prezzo, e in produzione erano 24 delle 27 ricette del design partner
  // (una GELATERIA): il Ricettario mostrava "8 fette x 4,00 EUR", "Ricavo 32,00 EUR",
  // "Margine 92-99%" e il badge verde "Eccellente" su numeri che nessuno aveva
  // mai inserito. Il KPI "Food cost medio" usciva 5,6% in verde, quando in una
  // gelateria e' 25-35%.
  //
  // `prezzo` va a 0: un prezzo di vendita non si inventa mai, e nessuna funzione
  // operativa dipende da questo valore (solo i calcoli di ricavo e margine, che
  // ora devono dichiarare che il prezzo manca).
  //
  // `unita` resta 8 perché NON e' un dato commerciale: la produzione la usa come
  // fattore per convertire gli stampi in pezzi (ProduzioneGiornalieraView righe
  // 176, 258, 406, 431, 594). Portarla a 0 romperebbe il carico dello stock, che
  // oggi funziona. Ma la marchiamo, così chi la mostra può dire che e' presunta.
  //
  // `senzaRegola: true` e' il segnale per la UI: questa ricetta NON ha un prezzo
  // di vendita, e ogni numero che ne deriva non va presentato come misurato.
  // Audit 2026-09-09 (secondo giro): il `tipo` va letto SEMPRE dalla ricetta,
  // anche quando `unita` manca. Prima cadeva su "fetta", quindi un semilavorato
  // o una base importati senza `unita` venivano trattati come prodotti da
  // vendere: comparivano in produzione, in cassa, nei formati vendita e nel
  // conto economico, e lo scarico del magazzino non scendeva nei loro
  // ingredienti. Nei dati di oggi tutti i semilavorati hanno `unita: 0` (li
  // scrive così la pagina Semilavorati) e il difetto non si vede, ma il tipo di
  // una ricetta non dipende dal fatto che abbia un prezzo.
  const dichiarato = tipoDichiarato(ricetta)
  if (dichiarato === 'semilavorato' || dichiarato === 'interno') {
    return { unita: 0, prezzo: 0, tipo: dichiarato }
  }
  if (dichiarato) return { unita: dichiarato === 'gusto' ? 1 : 8, prezzo: 0, tipo: dichiarato, senzaRegola: true }
  // Qui il tipo NON lo sa nessuno: né la ricetta, né la categoria, né la
  // tabella. «fetta» è un ripiego per poter disegnare qualcosa, e va detto:
  // `tipoPresunto` impedisce che una scheda di modifica lo salvi come se
  // l'utente l'avesse scelto.
  return { unita:8, prezzo:0, tipo: "fetta", senzaRegola:true, tipoPresunto:true }
}

export const isSemilavorato = (nome, ricettario) => {
  if (!ricettario) return false
  const ric = ricettario.ricette?.[nome] || ricettario.ricette?.[nome?.toUpperCase()]
  if (ric) return ric.tipo === "semilavorato" || getR(nome, ric).tipo === "semilavorato"
  return false
}

// Somma in grammi degli ingredienti di una ricetta (peso lordo teorico).
// Non tiene conto di perdite di evaporazione / overrun / spillover.
export function pesoIngredientiG(ric) {
  return (ric?.ingredienti || []).reduce((s, i) => s + (Number(i.qty1stampo) || 0), 0)
}

// RESA REALE in grammi della ricetta (peso del prodotto finito). Serve per:
//   - gusti gelateria: 1 kg finito potrebbe richiedere 1010g di ingredienti
//     (perdita evaporazione) o 950g (overrun aria montata). Il food cost/kg
//     va calcolato sulla RESA dichiarata, non sulla somma ingredienti.
//   - stampi/pezzi: informazione utile ma NON impatta i calcoli finanziari
//     (fc per stampo = fc totale ingredienti, indipendente dal peso finito).
// Priorita': `ric.resa_g` esplicito > fallback somma ingredienti.
// Per gusto senza né resa né ingredienti, fallback a 1000g (evita div/0).
export function resaGrammi(ric) {
  const r = Number(ric?.resa_g)
  if (Number.isFinite(r) && r > 0) return r
  const sum = pesoIngredientiG(ric)
  if (sum > 0) return sum
  return ric?.tipo === 'gusto' ? 1000 : 0
}

// ─── FOOD COST CALCULATION ───────────────────────────────────────────────────
// Costruisce la mappa ingrediente→{costoKg, costoG, isStima} unendo PREZZI_HORECA
// con il file caricato dall'utente (priorità all'utente).
export function buildIngCosti(fromFile) {
  const fc = fromFile || {}
  const out = {}
  // Applichiamo normIng anche alle chiavi di PREZZI_HORECA per simmetria con
  // il loop su `fc`: garantisce che il lookup (normIng(input)) trovi sempre
  // l'entry, anche per chiavi del dizionario che includono sinonimi mappati
  // da SING_PLUR e non sarebbero raggiungibili altrimenti.
  for (const [k, v] of Object.entries(PREZZI_HORECA)) {
    // Difesa: HORECA hardcoded ma se in futuro venisse iniettato un costoKg
    // non valido, isFinite guard come sul ramo fc (audit 2026-06-17 MEDIUM).
    const costoG = Number.isFinite(v.costoKg) ? parseFloat((v.costoKg / 1000).toFixed(6)) : 0
    out[normIng(k)] = { costoKg: v.costoKg, costoG, isStima: true }
  }
  for (const [k, v] of Object.entries(fc)) {
    // Accettiamo 0 come valore valido (ingrediente gratis: omaggio fornitore,
    // materia prima da orto, scarto recuperato). Solo NaN/undefined fanno cadere
    // sulla stima HORECA. Cfr. getPrezzoStoricoKg che usa la stessa logica sul
    // ramo "storico" - senza questo i due rami davano food cost diversi.
    if (Number.isFinite(v.costoG) && v.costoG >= 0) {
      out[normIng(k)] = { costoKg: v.costoKg, costoG: v.costoG, isStima: false }
    }
  }
  return out
}

// ─── STORICO PREZZI ─────────────────────────────────────────────────────────
// Il logPrezzi è un array di entry, ordinato dal più recente al più vecchio.
// Ogni entry: { id, data, ingrediente, prezzoVecchio, prezzoNuovo, decorre_da?, ... }
//   - `data`        = quando la modifica è stata fatta (audit)
//   - `decorre_da`  = data effettiva di applicazione del nuovo prezzo (opzionale).
//                     Se assente, fallback su `data` (compat retroattiva con log esistenti).
//
// Esempio: se "farina" passa da 1€ a 2€ il 31/12 alle 23:59 con decorre_da=2026-01-01,
// allora getPrezzoStoricoAt('farina', '2025-12-31') ritorna 1€ e
// getPrezzoStoricoAt('farina', '2026-01-01') ritorna 2€.
//
// ── La decorrenza è un GIORNO, e si confronta con un giorno ────────────────
//
// 18/09/2026, domanda del titolare: «controlla che non ci siano problemi con
// le date quando cambierà l'anno e si tornerà al 01/01, con gli storici dei
// prezzi». Guardandoci dentro, il confronto si faceva fra ISTANTI:
//
//     new Date(decorre_da).getTime() <= new Date(when).getTime()
//
// e la decorrenza in archivio è scritta come mezzanotte di GREENWICH del
// giorno scelto ('2027-01-01T00:00:00.000Z'), cioè l'una di notte italiana.
// Tre conseguenze, tutte misurate:
//
//   1. un prezzo «dal 1° gennaio» non valeva ancora all'una di notte del 1°
//      gennaio in Italia — un'ora d'inverno, due d'estate, in cui il food
//      cost girava sul prezzo vecchio;
//   2. chiedendo il prezzo con un giorno («2027-01-01») o con un oggetto data
//      a mezzanotte locale (`new Date(2027, 0, 1)`) la risposta era il prezzo
//      VECCHIO: mezzanotte italiana è ancora il 31 dicembre a Greenwich.
//      Oggi non si vede perché l'unico chiamante — `StoricoProduzioneView` —
//      chiede a mezzogiorno; basta un chiamante nuovo scritto nel modo ovvio
//      e il difetto esce;
//   3. lo stesso campo era confrontato come GIORNO dall'altra parte del
//      prodotto (`Dashboard.jsx`, applicazione dei prezzi programmati:
//      `soloData(e.decorre_da) <= oggi`). Due regole per lo stesso dato vuol
//      dire che prima o poi divergono, e divergevano già: nella prima ora di
//      ogni giornata il prezzo programmato risultava applicato al listino e
//      non ancora applicato allo storico.
//
// Adesso si confrontano due stringhe 'AAAA-MM-GG', che è quello che la
// finestra promette all'utente: «cambiando il prezzo dal 01/01, il 31/12 usa
// ancora il vecchio». Fra due giorni scritti così il fuso non c'entra, l'ora
// legale non c'entra, e il 29 febbraio non è un caso speciale.

function _entryDecorrenza(entry) {
  // Quando il nuovo prezzo entra in vigore.
  return entry?.decorre_da || entry?.data || null
}

/**
 * Il GIORNO ('AAAA-MM-GG') di un valore che può essere una data, un istante
 * ISO o un giorno già fatto. Stringa vuota se non si sa.
 *
 * Due trappole che questa funzione chiude, trovate il 18/09/2026:
 *
 * **`new Date(null)` è il 1° gennaio 1970, e `Number.isFinite(0)` è vero.**
 * Una riga di storico senza né `data` né `decorre_da` — `_entryDecorrenza`
 * risponde `null` — passava il controllo e veniva dichiarata in vigore dal
 * 1970: diventava il prezzo di tutto il passato del prodotto. Il filtro
 * voleva scartarla e invece la teneva. Qui un giorno che non c'è è una
 * stringa vuota, e la stringa vuota si scarta davvero.
 *
 * **Una data all'italiana viene letta all'americana.** `new Date('07/01/2027')`
 * risponde 7 gennaio in Chrome e in Safari, non 1° luglio, e senza dire
 * niente. Una riga così — può arrivare da un foglio importato — spostava un
 * prezzo di sei mesi in silenzio. Qui si accetta solo la forma 'AAAA-MM-GG'
 * (anche come testa di un istante ISO): tutto il resto vale «non lo so», e
 * chi chiama ricade sul prezzo di adesso, che si vede.
 */
function _giornoDi(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : soloData(v)
  const m = String(v ?? '').trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : ''
}

/**
 * Il prezzo scritto in una riga di storico, o `null` se quella riga non lo
 * dichiara.
 *
 * Trappola trovata il 18/09/2026, ed è la più cara che abbia questo prodotto:
 * **`Number(null)` fa `0`, e `Number.isFinite(0)` è vero.** Scritto
 * `Number.isFinite(Number(e.prezzoVecchio))`, il controllo prendeva una riga
 * dove il prezzo di prima non c'era — perché la materia prima è nata senza,
 * come oggi si può fare dalla pagina Materie prime — e la dichiarava a zero,
 * cioè gratis. Da lì in giù il food cost storico di ogni produzione anteriore
 * contava quell'ingrediente come regalato.
 *
 * Uno zero VOLUTO resta valido: esiste la materia prima omaggio del
 * fornitore, quella dell'orto, lo scarto recuperato. È la differenza fra
 * «vale zero» e «non lo so», e qui si decide guardando se il campo c'è.
 */
function _prezzoNoto(v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Trova il prezzo €/kg di un ingrediente valido a una data specifica.
 * @param {Array}    logPrezzi  storico modifiche (ordinato newest→oldest)
 * @param {string}   nomeIng    nome ingrediente (normalizzato o no)
 * @param {Date|string} when    giorno di riferimento (default: oggi). Può
 *                              essere 'AAAA-MM-GG', un istante ISO o una Date:
 *                              conta solo il GIORNO che ne esce.
 * @returns {number|null}       €/kg quel giorno, o null se non noto
 */
export function getPrezzoStoricoKg(logPrezzi, nomeIng, when) {
  if (!Array.isArray(logPrezzi) || logPrezzi.length === 0) return null
  // `when` vuoto vuol dire «adesso». Un `when` che non è una data resta un
  // «non lo so»: si risponde null e chi chiama usa il prezzo di adesso.
  const target = _giornoDi(when || new Date())
  if (!target) return null
  const ingKey = normIng((nomeIng || '').toLowerCase().trim())

  // Le righe di questo ingrediente, dal giorno di decorrenza più recente al
  // più vecchio. L'ordinamento fra stringhe 'AAAA-MM-GG' è quello giusto per
  // costruzione, ed è stabile: due righe dello stesso giorno restano
  // nell'ordine in cui stanno nel log, che è dalla più recente alla più
  // vecchia — quindi a parità di giorno vince l'ultima modifica scritta.
  const entries = logPrezzi
    .filter(e => normIng((e.ingrediente || '').toLowerCase().trim()) === ingKey)
    .map(e => ({ ...e, _g: _giornoDi(_entryDecorrenza(e)) }))
    .filter(e => e._g)
    .sort((a, b) => (a._g < b._g ? 1 : a._g > b._g ? -1 : 0))
  if (entries.length === 0) return null

  // La prima riga che decorre da un giorno non successivo a `target`: quel
  // giorno era già in vigore.
  // NB: si usa `_prezzoNoto` e non `|| null`, così un prezzo legittimo di 0
  // (ingrediente gratis/omaggio) NON viene scambiato per "prezzo sconosciuto".
  for (const e of entries) {
    if (e._g <= target) return _prezzoNoto(e.prezzoNuovo)
  }
  // Tutte le modifiche sono successive a `target`: usa il prezzo PRIMA della
  // prima modifica (il "vecchio prezzo" dell'entry più vecchia). Se quella
  // riga non dichiara un prezzo di prima — la materia prima è nata senza — si
  // risponde `null`: chi chiama ricade sul prezzo di adesso, che è la cosa
  // meno sbagliata da dire quando il prezzo di allora non si sa.
  return _prezzoNoto(entries[entries.length - 1].prezzoVecchio)
}

/**
 * Calcola food cost di una ricetta a una data specifica, usando lo storico prezzi
 * quando disponibile. Cade sul prezzo "corrente" (ingCosti) per ingredienti senza storico.
 *
 * Serve a calcolare il food cost STORICO di una produzione: il P&L del 31/12 deve
 * vedere il food cost a prezzi di quel giorno, anche se oggi i prezzi sono cambiati.
 */
// _lordo: quando true i costi NON applicano la resa (calcolo a peso lordo). Usato
// per i semilavorati con resa propria: la loro resa sostituisce quelle interne,
// così il calo è applicato una sola volta (vedi ramo semilavorato sotto).
export function calcolaFCStorico(ricetta, ingCosti, ricettario, logPrezzi, when, _depth, _path, _lordo) {
  const depth = _depth || 0
  const path = _path || []
  const SKIP_ING = ["ingrediente","ingredient","ingredienti","n/d","nan","undefined","nome ingrediente in minuscolo",""]
  let tot = 0, mancanti = []
  for (const ing of (ricetta?.ingredienti || [])) {
    const nomeNorm = normIng((ing.nome || '').toLowerCase().trim())
    if (SKIP_ING.includes(nomeNorm)) continue
    const qty = ing.qty1stampo || 0
    if (!qty) continue

    // ── La terza funzione del food cost, allineata alle altre due ───────
    //
    // 19/09/2026. Il prodotto calcola il costo di una ricetta in TRE punti:
    // `calcolaFC` (il totale), `calcolaFCDettaglio` (la tabella riga per riga)
    // e questa, che lo ricostruisce a una data passata per il P&L e lo storico
    // di produzione. Il 18/09 le prime due sono state messe d'accordo — davano
    // numeri diversi su 29 ricette su 68 — e questa era rimasta indietro con
    // tre differenze, tutte e tre in favore di un costo più basso del vero:
    //
    //   1. il prezzo scritto a mano su una base non vinceva sul calcolo dai
    //      suoi ingredienti (qui sotto);
    //   2. gli ingredienti senza prezzo DENTRO una base sparivano, perché la
    //      ricorsione buttava via `mancanti`: il costo usciva più basso e la
    //      ricetta diceva «nessun ingrediente senza prezzo»;
    //   3. il listino medio di mercato faceva ancora il conto.
    //
    // Tre funzioni che calcolano lo stesso numero divergono sempre. Qui
    // divergevano già, e nessuno se ne accorgeva perché i tre numeri non
    // compaiono mai insieme sullo schermo.
    const prezzoDichiaratoOra = ingCosti[nomeNorm]
    const dichiaratoDallUtente = prezzoDichiaratoOra && !prezzoDichiaratoOra.isStima && Number(prezzoDichiaratoOra.costoG) > 0

    if (ricettario?.ricette && !dichiaratoDallUtente) {
      const semiKey = Object.keys(ricettario.ricette).find(k => {
        const r = ricettario.ricette[k]
        if (r.tipo !== 'semilavorato') return false
        return normIng(k.toLowerCase()) === nomeNorm ||
               normIng((r.nome || '').toLowerCase()) === nomeNorm
      })
      if (semiKey) {
        if (path.includes(semiKey)) {
          mancanti.push(`${ing.nome} (ciclo semilavorato rilevato)`)
          continue
        }
        if (depth >= 3) {
          mancanti.push(`${ing.nome} (semilavorato troppo annidato, max 3 livelli)`)
          continue
        }
        const semiRic = ricettario.ricette[semiKey]
        // La resa del semilavorato sostituisce quelle delle foglie: se il
        // semilavorato ha una resa propria (o siamo già in lordo), ricorri in
        // lordo così le foglie NON applicano la loro resa, e la applichiamo una
        // volta sola qui sotto.
        const semiHasResa = hasResaIngrediente(nomeNorm)
        const recurseLordo = _lordo || semiHasResa
        const { tot: semiTot, mancanti: semiMancanti } = calcolaFCStorico(semiRic, ingCosti, ricettario, logPrezzi, when, depth + 1, [...path, semiKey], recurseLordo)
        // Gli ingredienti senza prezzo DENTRO la base sono ingredienti senza
        // prezzo di questa ricetta: il loro costo manca lo stesso. Buttarli
        // via — com'era — voleva dire un costo più basso del vero e una
        // ricetta che dichiara «nessun ingrediente senza prezzo». Il nome si
        // scrive con la base davanti, perché è lì che si va a correggerlo.
        for (const m of (semiMancanti || [])) mancanti.push(`${ing.nome} › ${m}`)
        const semiPeso = (semiRic.ingredienti || []).reduce((s, i) => s + (i.qty1stampo || 0), 0)
        if (semiPeso <= 0) {
          mancanti.push(`${ing.nome} (semilavorato senza peso totale)`)
          continue
        }
        const costoG = semiTot / semiPeso
        // Se _lordo, la resa la applica l'antenato che l'ha attivata; altrimenti
        // costoNettoPerG applica la resa del semilavorato una volta sola (o 1.0).
        tot += qty * (_lordo ? costoG : costoNettoPerG(costoG, nomeNorm))
        continue
      }
    }

    // 1. Cerca prezzo storico al momento `when`
    const prezzoKgStorico = getPrezzoStoricoKg(logPrezzi, ing.nome, when)
    let costoG = null
    // >= 0: un prezzo storico di 0 è un costo reale (ingrediente gratis), non un
    // "dato mancante" - solo null/undefined fa cadere sul prezzo corrente.
    if (prezzoKgStorico != null && prezzoKgStorico >= 0) {
      costoG = prezzoKgStorico / 1000
    } else {
      // 2. Fallback su prezzo corrente
      const c = prezzoDichiaratoOra
      if (!c) { mancanti.push(ing.nome); continue }
      // Il listino medio di mercato non fa il conto neanche nello storico:
      // ricostruire il costo di una produzione di un mese fa con un prezzo che
      // non è mai stato dell'azienda è peggio che dire «non lo so».
      if (c.isStima && !STIMA_DI_MERCATO_FA_IL_CONTO) { mancanti.push(ing.nome); continue }
      costoG = c.costoG
    }
    tot += qty * (_lordo ? costoG : costoNettoPerG(costoG, nomeNorm))
  }
  return { tot: depth === 0 ? parseFloat(tot.toFixed(3)) : tot, mancanti }
}

// Calcola food cost totale di una ricetta. Ricorsivo per gestire semilavorati
// (max 3 livelli di annidamento). Se il limite viene raggiunto, il semilavorato
// e' trattato come ingrediente "mancante" - segnalato in `mancanti` per UI
// invece di tornare silenziosamente costo 0.
// Param _path: lista nomi nel cammino di ricorsione, per ciclo-detect e logging.
export function calcolaFC(ricetta, ingCosti, ricettario, _depth, _path, _lordo) {
  // Audit 2026-06-17 HIGH: la versione precedente arrotondava `tot` a 3 decimali
  // SU OGNI livello di ricorsione, propagando errori sui semilavorati nidificati.
  // Ora il rounding avviene SOLO al top-level (depth === 0) - i sotto-totali
  // restano a piena precisione.
  const depth = _depth || 0
  const path = _path || []
  const SKIP_ING = ["ingrediente","ingredient","ingredienti","n/d","nan","undefined","nome ingrediente in minuscolo",""]
  let tot = 0, mancanti = []
  for (const ing of (ricetta?.ingredienti || [])) {
    const nomeNorm = normIng((ing.nome || '').toLowerCase().trim())
    if (SKIP_ING.includes(nomeNorm)) continue
    const qty = ing.qty1stampo || 0
    if (!qty) continue

    // ── Il prezzo che ha scritto il titolare vince sul calcolo ─────────────
    //
    // Un semilavorato può avere DUE fonti di costo: la sua ricetta (da cui il
    // programma lo calcola) e un prezzo al chilo che il titolare ha scritto a
    // mano nel listino. Fino al 16/09/2026 vinceva sempre il calcolo, perché
    // il ramo del semilavorato stava prima del listino.
    //
    // Misurato sui dati veri di Mara dei Boschi: «BASE BIANCA» ha un prezzo
    // suo (2,31 €/kg) e una ricetta i cui ingredienti sono per il 20% del peso
    // senza prezzo. Vinceva il calcolo — 1,22 €/kg — e **24 ricette su 58
    // uscivano con un food cost sottostimato dell'88,7%**, con un margine
    // lordo del 96,4% su un'azienda che di margine ne fa la metà.
    //
    // Chi ha ragione non è in dubbio: un prezzo scritto dal titolare è una
    // misura, un calcolo su ingredienti metà dei quali non hanno prezzo è una
    // stima al ribasso. È anche il modo in cui lavora una gelateria — le
    // quantità di una base sono il segreto del laboratorio, e il costo al
    // chilo si scrive a mano: è la ragione per cui esiste il tipo «interno».
    //
    // La stima automatica di mercato (`isStima`) NON vince: quella è un
    // ripiego nostro, e fra due stime è meglio quella fatta sugli ingredienti
    // veri della ricetta.
    const prezzoDichiarato = ingCosti[normIng(ing.nome)]
    const dichiaratoDallUtente = prezzoDichiarato && !prezzoDichiarato.isStima && Number(prezzoDichiarato.costoG) > 0

    // Semilavorato? Ricorsione max 3 livelli, ciclo-detect via path
    if (ricettario?.ricette && !dichiaratoDallUtente) {
      const semiKey = Object.keys(ricettario.ricette).find(k => {
        const r = ricettario.ricette[k]
        if (r.tipo !== 'semilavorato') return false
        return normIng(k.toLowerCase()) === nomeNorm ||
               normIng((r.nome || '').toLowerCase()) === nomeNorm
      })
      if (semiKey) {
        // Ciclo diretto/indiretto? Se il semilavorato e' già nel cammino di
        // ricorsione, NON discendere - lo segnaliamo come mancante con un
        // marker speciale che l'UI può riconoscere.
        if (path.includes(semiKey)) {
          mancanti.push(`${ing.nome} (ciclo semilavorato rilevato)`)
          continue
        }
        if (depth >= 3) {
          mancanti.push(`${ing.nome} (semilavorato troppo annidato, max 3 livelli)`)
          continue
        }
        const semiRic = ricettario.ricette[semiKey]
        // La resa del semilavorato sostituisce quelle delle foglie (calo una
        // volta sola): se ha resa propria (o siamo in lordo) ricorri in lordo.
        const semiHasResa = hasResaIngrediente(nomeNorm)
        const recurseLordo = _lordo || semiHasResa
        const { tot: semiTot, mancanti: semiMancanti } = calcolaFC(semiRic, ingCosti, ricettario, depth + 1, [...path, semiKey], recurseLordo)
        // Gli ingredienti senza prezzo DENTRO la base sono ingredienti senza
        // prezzo di questa ricetta: il loro costo manca lo stesso.
        //
        // Prima la ricorsione restituiva anche `mancanti` e chi chiamava lo
        // buttava via. Risultato: la scheda diceva «0 ingredienti senza
        // prezzo» mentre il costo era sottostimato, e l'avviso che avrebbe
        // fatto scoprire il margine al 96,4% non compariva mai. Il nome si
        // scrive con la base davanti, perché è lì che si va a correggerlo.
        for (const m of (semiMancanti || [])) mancanti.push(`${ing.nome} › ${m}`)
        const semiPeso = (semiRic.ingredienti || []).reduce((s, i) => s + (i.qty1stampo || 0), 0)
        // Se semiPeso=0 (semilavorato senza ingredienti o ingredienti senza
        // qty1stampo) il costoG sarebbe 0 e il padre risulterebbe gratis →
        // margine gonfiato. Lo segnaliamo come ingrediente mancante invece
        // di silenziare il bug.
        if (semiPeso <= 0) {
          mancanti.push(`${ing.nome} (semilavorato senza peso totale: serve almeno un ingrediente con qty1stampo > 0)`)
          continue
        }
        const costoG = semiTot / semiPeso
        // Se _lordo, la resa la applica l'antenato; altrimenti costoNettoPerG
        // applica la resa del semilavorato una volta sola (o 1.0 se assente).
        tot += qty * (_lordo ? costoG : costoNettoPerG(costoG, nomeNorm))
        continue
      }
    }

    const c = prezzoDichiarato
    if (!c) { mancanti.push(ing.nome); continue }
    // La stima di mercato non conta: vedi il commento lungo in
    // `costoRigaIngrediente`. Le due funzioni devono dire lo stesso numero —
    // averne allineata una sola è già costato 29 ricette con due food cost
    // diversi, la mattina di oggi.
    if (c.isStima && !STIMA_DI_MERCATO_FA_IL_CONTO) { mancanti.push(ing.nome); continue }
    tot += qty * (_lordo ? c.costoG : costoNettoPerG(c.costoG, nomeNorm))
  }
  // Rounding solo al top-level.
  return { tot: depth === 0 ? parseFloat(tot.toFixed(3)) : tot, mancanti }
}

// Come calcolaFC ma ritorna anche il DETTAGLIO per ingrediente di primo livello
// (ogni semilavorato resta una riga singola col suo costo totale). La somma dei
// .costo coincide con .tot. Serve a spiegare "dove sta il food cost" di un prodotto.
// Costo di UNA riga di ingrediente, con tutto quello che serve per mostrarla.
// Audit 2026-09-09 ALTA: prima ogni schermata risolveva il costo di riga a modo
// suo. NuovaRicettaView faceva `ingCosti[normIng(nome)] * qty` e così:
//   - un SEMILAVORATO usato come ingrediente ("pasta frolla" dentro "crostata")
//     non sta in ingCosti, quindi la riga mostrava costo zero e il badge
//     "prezzo mancante", mentre il totale in alto lo contava per davvero
//     (calcolaFC lo risolve ricorsivamente): le righe non sommavano al totale;
//   - se l'utente accettava l'invito e inseriva un euro/kg, calcolaFC controlla
//     il ramo semilavorato PRIMA di ingCosti, quindi quel prezzo veniva ignorato:
//     un'azione richiesta all'utente che non serviva a niente;
//   - le RESE non venivano applicate (costoNettoPerG), quindi le righe erano
//     più basse del totale anche a prezzi tutti presenti;
//   - il marker isStima non veniva mostrato: un prezzo medio di mercato preso
//     dal listino HoReCa sembrava un prezzo dell'azienda. Ricettario, P&L e
//     Magazzino il badge ce l'hanno, questa pagina no.
// Ora la riga si chiede qui, una volta sola, e chi la mostra non decide più.
//
// Ritorna { costo, isStima, isSemilavorato, mancante, motivo }:
//   - mancante: true quando il costo NON e' calcolabile. `motivo` dice perché,
//     in italiano, ed e' pensato per essere mostrato.
export function costoRigaIngrediente(ing, ingCosti, ricettario) {
  const nomeNorm = normIng((ing?.nome || '').toLowerCase().trim())
  const qty = ing?.qty1stampo || 0
  const vuoto = { costo: 0, isStima: false, isSemilavorato: false, mancante: false, motivo: null }
  if (!nomeNorm) return vuoto
  // Quantita' a zero: legittima (sale q.b., scorza a occhio) ma non entra nel
  // food cost, e calcolaFC la salta. Va detto, non trattato come un errore.
  if (!qty) return { ...vuoto, motivo: 'a 0 g non entra nel food cost' }

  // ── La stessa regola di `calcolaFC`, che qui mancava ───────────────────
  //
  // 18/09/2026, audit sui dati veri di Mara dei Boschi. Il 16/09 era stata
  // presa una decisione e scritta per esteso dentro `calcolaFC`: quando un
  // semilavorato ha SIA una ricetta SIA un prezzo al chilo scritto a mano dal
  // titolare, **vince il prezzo scritto a mano**, perché un prezzo scritto da
  // chi produce è una misura, mentre un calcolo su ingredienti metà dei quali
  // non hanno prezzo è una stima al ribasso.
  //
  // Quella decisione era stata applicata a `calcolaFC` e **non** a questa
  // funzione. Risultato, misurato sul ricettario vero: **29 ricette su 68**
  // avevano due food cost diversi a seconda di chi faceva il conto — la
  // scheda del Ricettario diceva «2,31 €» e la tabella del dettaglio, due
  // centimetri sotto, diceva «1,22 €». Sul totale del ricettario ballavano
  // 29,13 € su 189,94, cioè il 18%.
  //
  // Un numero calcolato in due modi diversi da due funzioni diverse prima o
  // poi diverge: qui era già divergente e nessuno lo vedeva, perché le due
  // cifre non compaiono mai nella stessa schermata nello stesso momento.
  const prezzoDichiarato = ingCosti[nomeNorm]
  const dichiaratoDallUtente = prezzoDichiarato && !prezzoDichiarato.isStima && Number(prezzoDichiarato.costoG) > 0

  const semiKey = (ricettario?.ricette && !dichiaratoDallUtente)
    ? Object.keys(ricettario.ricette).find(k => {
        const r = ricettario.ricette[k]
        if (r.tipo !== 'semilavorato') return false
        return normIng(k.toLowerCase()) === nomeNorm ||
               normIng((r.nome || '').toLowerCase()) === nomeNorm
      })
    : null

  if (semiKey) {
    const semiRic = ricettario.ricette[semiKey]
    const semiHasResa = hasResaIngrediente(nomeNorm)
    const { tot: semiTot, mancanti: semiMancanti } = calcolaFC(semiRic, ingCosti, ricettario, 0, [semiKey], semiHasResa)
    const semiPeso = (semiRic.ingredienti || []).reduce((s, i) => s + (i.qty1stampo || 0), 0)
    if (semiPeso <= 0) {
      // Prima questa riga spariva dal dettaglio senza spiegazioni.
      return { costo: 0, isStima: false, isSemilavorato: true, mancante: true,
               motivo: 'semilavorato senza ingredienti: apri la sua scheda e mettili' }
    }
    const costo = qty * costoNettoPerG(semiTot / semiPeso, nomeNorm)
    return {
      costo: parseFloat(costo.toFixed(3)),
      isStima: false,
      isSemilavorato: true,
      mancante: false,
      // Il costo c'e', ma e' incompleto: lo dichiariamo senza dire "mancante".
      motivo: semiMancanti.length ? `dentro il semilavorato manca il prezzo di ${semiMancanti.join(', ')}` : null,
    }
  }

  const c = prezzoDichiarato
  if (!c) return { costo: 0, isStima: false, isSemilavorato: false, mancante: true, motivo: 'prezzo mancante' }

  // ── Il listino medio di mercato NON entra nel food cost ────────────────
  //
  // 18/09/2026, il titolare, guardando l'etichetta «stima di mercato»:
  //
  //   «la stima di mercato in base a cosa la fai? magari con dei fornitori ci
  //    sono prezzi amichevoli. occhio toglila che può essere fuorviante»
  //
  // La domanda meritava una risposta netta: `PREZZI_HORECA` è un elenco
  // scritto a mano dentro il codice, con l'intestazione «prezzi ingrosso
  // aggiornati 2025». Nessuna fonte, nessun collegamento ai fornitori di
  // nessuno. Per una gelateria che compra la panna da chi la conosce da
  // vent'anni, può essere lontano il doppio in tutt'e due i sensi.
  //
  // Quanto pesava, misurato sul ricettario vero di Mara dei Boschi:
  //
  //     righe col SUO prezzo ................................  62
  //     righe con la stima di mercato .......................  99
  //     quota del food cost totale che veniva dalla stima ... 47%
  //     ricette toccate da almeno una stima ................. 55 su 68
  //
  // Quasi metà del food cost dell'azienda usciva da numeri che nessuno aveva
  // verificato, presentati come se fossero suoi. Il prodotto ripete da mesi
  // che «un valore che manca non è uno zero»: vale allo stesso modo che un
  // valore indovinato non è un valore misurato.
  //
  // Da oggi una stima vale come **prezzo mancante**: il costo non si calcola
  // e la ricetta lo dice. Il listino resta dov'è, ma cambia mestiere — non fa
  // più il conto, fa il suggerimento quando si scrive un prezzo («il mercato
  // sta intorno a 0,88 €/kg»), che è l'unico uso onesto di un numero medio.
  if (c.isStima && !STIMA_DI_MERCATO_FA_IL_CONTO) {
    return { costo: 0, isStima: true, isSemilavorato: false, mancante: true,
             motivo: 'prezzo mancante: quello che vedi è il listino medio di mercato, non il tuo' }
  }

  const costo = qty * costoNettoPerG(c.costoG, nomeNorm)
  return {
    costo: parseFloat(costo.toFixed(3)),
    isStima: !!c.isStima,
    isSemilavorato: false,
    mancante: false,
    motivo: c.isStima ? 'prezzo medio di mercato, non il tuo' : null,
  }
}

export function calcolaFCDettaglio(ricetta, ingCosti, ricettario) {
  const SKIP_ING = ["ingrediente","ingredient","ingredienti","n/d","nan","undefined","nome ingrediente in minuscolo",""]
  const righe = []
  let tot = 0
  for (const ing of (ricetta?.ingredienti || [])) {
    const nomeNorm = normIng((ing.nome || '').toLowerCase().trim())
    if (SKIP_ING.includes(nomeNorm)) continue
    const qty = ing.qty1stampo || 0
    if (!qty) continue

    // Audit 2026-09-09: la risoluzione della riga sta in costoRigaIngrediente,
    // unica per tutte le schermate. Prima c'era una seconda copia della logica
    // qui, e un semilavorato senza ingredienti (semiPeso <= 0) faceva `continue`:
    // la riga scompariva dal dettaglio senza dire niente.
    const r = costoRigaIngrediente(ing, ingCosti, ricettario)
    righe.push({
      nome: ing.nome, qty, costo: r.costo,
      ...(r.isSemilavorato ? { isSemilavorato: true } : {}),
      ...(r.mancante ? { mancante: true } : {}),
      ...(r.isStima ? { isStima: true } : {}),
      ...(r.motivo ? { motivo: r.motivo } : {}),
    })
    tot += r.costo
  }
  righe.sort((a, b) => b.costo - a.costo)
  return { tot: parseFloat(tot.toFixed(3)), righe }
}
