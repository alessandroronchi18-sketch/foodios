# Diario agente PAGINE — audit 16/09/2026

## Mandato
Le 14 pagine raggiungibili ma NON dal menu: si aprono da dentro un'altra pagina.
`nuova-ricetta`, `semilavorati`, `quadratura-inventario`, `importa-dati`,
`integrazioni`, `costi-aziendali`, `azioni`, `fornitori`, `confronto-sedi`,
`menu-engineering`, `trasferimenti`, `eventi`, `giornaliero`, `home-dipendente`.

Per ognuna: DA DOVE si raggiunge (il percorso vero del titolare) · si apre senza
errori · sta dentro 390px · riquadri incolonnati · niente testo <12px · niente
bersaglio <44px sul telefono · **quando un dato manca lo DICE invece di scrivere zero**.

## Piano
1. [x] Leggere REGOLE.md + CLAUDE.md
2. [ ] Mappare i percorsi di raggiungimento (grep setView / onNavigate / schede)
3. [ ] Leggere tests/unit/layoutViste.test.jsx: capire cosa rende e cosa no
4. [ ] Rendere le pagine (DUMP_LAYOUT=1) e misurarle
5. [ ] Verificare il righello su un caso finto prima di dichiarare difetti
6. [ ] Lente CFO: dato mancante = «non lo so», mai zero
7. [ ] Emoji in MarketplaceView.jsx e RecipeInventorView.jsx -> componente Icon
8. [ ] Test in tests/unit/ per ogni difetto corretto
9. [ ] Elenco pagine NON raggiungibili (informazione più preziosa)

## File miei (non toccare altro)
src/views/: NuovaRicettaView, SemilavoratiView, QuadraturaInventarioView,
ImportaDatiView, IntegrazioniView, CostiAziendaliView, AzioniView, EventiView,
MenuEngineeringView, HomeDipendenteView, MarketplaceView, RecipeInventorView.
NON: PLView, StoricoView, MagazzinoView, RicettarioView, ChiusuraView,
ConfrontoSedi, Scadenzario, InventarioSettimanaleView, TrasferimentiView.

## Stato
- 16/09 inizio. Prossimo passo: mappare i percorsi di raggiungimento.
