// foodcost — calcolo food cost ricette + database prezzi HORECA + normalizzazione ingredienti.
//
// Estratto da Dashboard.jsx durante il refactor monolite→views. Tutti i sub-componenti
// (RicettarioView, PLView, SimulatorePrezziView, MagazzinoView, ProduzioneGiornaliera,
// ChiusuraView, AzioniView, DashboardHomeView, ...) usano questi helper.
//
// Esporta:
//   - PREZZI_HORECA           — dizionario prezzi ingrosso standard (€/kg)
//   - SING_PLUR               — mappa plurale→singolare per normalizzazione
//   - normIng(nome)           — normalizza nome ingrediente (lowercase + sing/plur)
//   - EN_IT_INGREDIENTI / EN_IT_PRODOTTI  — mappe traduzione OCR/menù
//   - translateIngredienteEN / translateProdottoEN
//   - NOMI_SKIP, isRicettaValida
//   - REGOLE, getR(nome, ricetta)
//   - isSemilavorato(nome, ricettario)
//   - buildIngCosti(fromFile)
//   - calcolaFC(ricetta, ingCosti, ricettario, depth)

import { costoNettoPerG, hasResaIngrediente } from './rese'

// ─── PREZZI HORECA ────────────────────────────────────────────────────────────
// Prezzi ingrosso aggiornati 2025 — usati come stima quando l'utente non ha
// caricato un proprio file prezzi. Marker `isStima:true` per UI badge.
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
]

const _NORM_MAP = new Map(SING_PLUR.map(([pl, sg]) => [pl, sg]))

export function normIng(nome) {
  const k = (nome || '').toLowerCase().trim().replace(/\s+/g, ' ')
  return _NORM_MAP.get(k) || k
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
  if (REGOLE[nome]) return REGOLE[nome]
  // Ricette manuali: leggi da dentro l'oggetto ricetta se presente
  if (ricetta?.unita != null) return {
    unita:  ricetta.unita || 0,
    prezzo: ricetta.prezzo || 0,
    tipo:   ricetta.tipo || "fetta",
  }
  return { unita:8, prezzo:4, tipo:"fetta" }
}

export const isSemilavorato = (nome, ricettario) => {
  if (!ricettario) return false
  const ric = ricettario.ricette?.[nome] || ricettario.ricette?.[nome?.toUpperCase()]
  if (ric) return ric.tipo === "semilavorato" || getR(nome, ric).tipo === "semilavorato"
  return false
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
    // ramo "storico" — senza questo i due rami davano food cost diversi.
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

function _entryDecorrenza(entry) {
  // Quando il nuovo prezzo entra in vigore.
  return entry?.decorre_da || entry?.data || null
}

/**
 * Trova il prezzo €/kg di un ingrediente valido a una data specifica.
 * @param {Array}    logPrezzi  storico modifiche (ordinato newest→oldest)
 * @param {string}   nomeIng    nome ingrediente (normalizzato o no)
 * @param {Date|string} when    data di riferimento (default: oggi)
 * @returns {number|null}       €/kg al momento, o null se non noto
 */
export function getPrezzoStoricoKg(logPrezzi, nomeIng, when) {
  if (!Array.isArray(logPrezzi) || logPrezzi.length === 0) return null
  const target = when ? new Date(when).getTime() : Date.now()
  if (!Number.isFinite(target)) return null
  const ingKey = normIng((nomeIng || '').toLowerCase().trim())

  // Filtra le entry per questo ingrediente, ordinate per decorrenza desc.
  const entries = logPrezzi
    .filter(e => normIng((e.ingrediente || '').toLowerCase().trim()) === ingKey)
    .map(e => ({ ...e, _t: new Date(_entryDecorrenza(e)).getTime() }))
    .filter(e => Number.isFinite(e._t))
    .sort((a, b) => b._t - a._t)
  if (entries.length === 0) return null

  // Trova la prima entry con decorrenza <= target (cioè era già attiva al target).
  // NB: usiamo Number.isFinite e non `|| null`, così un prezzo legittimo di 0
  // (ingrediente gratis/omaggio) NON viene scambiato per "prezzo sconosciuto".
  for (const e of entries) {
    if (e._t <= target) {
      const n = Number(e.prezzoNuovo)
      return Number.isFinite(n) ? n : null
    }
  }
  // Tutte le modifiche sono successive a `target`: usa il prezzo PRIMA della
  // prima modifica (il "vecchio prezzo" dell'entry più vecchia).
  const piuVecchia = entries[entries.length - 1]
  const nv = Number(piuVecchia.prezzoVecchio)
  return Number.isFinite(nv) ? nv : null
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

    if (ricettario?.ricette) {
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
        const { tot: semiTot } = calcolaFCStorico(semiRic, ingCosti, ricettario, logPrezzi, when, depth + 1, [...path, semiKey], recurseLordo)
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
    // "dato mancante" — solo null/undefined fa cadere sul prezzo corrente.
    if (prezzoKgStorico != null && prezzoKgStorico >= 0) {
      costoG = prezzoKgStorico / 1000
    } else {
      // 2. Fallback su prezzo corrente
      const c = ingCosti[normIng(ing.nome)]
      if (!c) { mancanti.push(ing.nome); continue }
      costoG = c.costoG
    }
    tot += qty * (_lordo ? costoG : costoNettoPerG(costoG, nomeNorm))
  }
  return { tot: depth === 0 ? parseFloat(tot.toFixed(3)) : tot, mancanti }
}

// Calcola food cost totale di una ricetta. Ricorsivo per gestire semilavorati
// (max 3 livelli di annidamento). Se il limite viene raggiunto, il semilavorato
// e' trattato come ingrediente "mancante" — segnalato in `mancanti` per UI
// invece di tornare silenziosamente costo 0.
// Param _path: lista nomi nel cammino di ricorsione, per ciclo-detect e logging.
export function calcolaFC(ricetta, ingCosti, ricettario, _depth, _path, _lordo) {
  // Audit 2026-06-17 HIGH: la versione precedente arrotondava `tot` a 3 decimali
  // SU OGNI livello di ricorsione, propagando errori sui semilavorati nidificati.
  // Ora il rounding avviene SOLO al top-level (depth === 0) — i sotto-totali
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

    // Semilavorato? Ricorsione max 3 livelli, ciclo-detect via path
    if (ricettario?.ricette) {
      const semiKey = Object.keys(ricettario.ricette).find(k => {
        const r = ricettario.ricette[k]
        if (r.tipo !== 'semilavorato') return false
        return normIng(k.toLowerCase()) === nomeNorm ||
               normIng((r.nome || '').toLowerCase()) === nomeNorm
      })
      if (semiKey) {
        // Ciclo diretto/indiretto? Se il semilavorato e' già nel cammino di
        // ricorsione, NON discendere — lo segnaliamo come mancante con un
        // marker speciale che l'UI puo' riconoscere.
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
        const { tot: semiTot } = calcolaFC(semiRic, ingCosti, ricettario, depth + 1, [...path, semiKey], recurseLordo)
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

    const c = ingCosti[normIng(ing.nome)]
    if (!c) { mancanti.push(ing.nome); continue }
    tot += qty * (_lordo ? c.costoG : costoNettoPerG(c.costoG, nomeNorm))
  }
  // Rounding solo al top-level.
  return { tot: depth === 0 ? parseFloat(tot.toFixed(3)) : tot, mancanti }
}

// Come calcolaFC ma ritorna anche il DETTAGLIO per ingrediente di primo livello
// (ogni semilavorato resta una riga singola col suo costo totale). La somma dei
// .costo coincide con .tot. Serve a spiegare "dove sta il food cost" di un prodotto.
export function calcolaFCDettaglio(ricetta, ingCosti, ricettario) {
  const SKIP_ING = ["ingrediente","ingredient","ingredienti","n/d","nan","undefined","nome ingrediente in minuscolo",""]
  const righe = []
  let tot = 0
  for (const ing of (ricetta?.ingredienti || [])) {
    const nomeNorm = normIng((ing.nome || '').toLowerCase().trim())
    if (SKIP_ING.includes(nomeNorm)) continue
    const qty = ing.qty1stampo || 0
    if (!qty) continue

    if (ricettario) {
      const semiKey = Object.keys(ricettario.ricette || {}).find(k => {
        const r = ricettario.ricette[k]
        if (r.tipo !== 'semilavorato') return false
        return normIng(k.toLowerCase()) === nomeNorm || normIng((r.nome || '').toLowerCase()) === nomeNorm
      })
      if (semiKey) {
        const semiRic = ricettario.ricette[semiKey]
        const semiHasResa = hasResaIngrediente(nomeNorm)
        // depth=0 per la sub-chiamata: calcolaFCDettaglio è già il "primo livello",
        // ma la sub-chiamata calcola il sub-tree del semilavorato — può comunque
        // scendere fino a depth=3 (audit 2026-06-17 HIGH: prima passava 1, riducendo
        // l'annidamento effettivo di un livello rispetto a calcolaFC standalone).
        const { tot: semiTot } = calcolaFC(semiRic, ingCosti, ricettario, 0, [semiKey], semiHasResa)
        const semiPeso = (semiRic.ingredienti || []).reduce((s, i) => s + (i.qty1stampo || 0), 0)
        if (semiPeso > 0) {
          const costo = qty * costoNettoPerG(semiTot / semiPeso, nomeNorm)
          righe.push({ nome: ing.nome, qty, costo, isSemilavorato: true })
          tot += costo
        }
        continue
      }
    }

    const c = ingCosti[normIng(ing.nome)]
    if (!c) { righe.push({ nome: ing.nome, qty, costo: 0, mancante: true }); continue }
    const costo = qty * costoNettoPerG(c.costoG, nomeNorm)
    righe.push({ nome: ing.nome, qty, costo })
    tot += costo
  }
  righe.sort((a, b) => b.costo - a.costo)
  return { tot: parseFloat(tot.toFixed(3)), righe }
}
