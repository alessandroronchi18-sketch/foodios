// @vitest-environment happy-dom
//
// Fotografa le pagine che NON stanno nel menu e che nessun altro attrezzo rendeva.
//
// Audit del 16/09/2026, agente «PAGINE». Il conto era: 47 pagine disegnate, 19
// raggiungibili dal menu, 28 no. Di quelle 28 gli attrezzi di impaginazione
// (`layoutViste.test.jsx` e le sue varianti telefono/tablet) ne rendevano
// quasi tutte, ma **quattro no**: Trasferimenti, La tua giornata (la home del
// dipendente), Marketplace e Inventa ricette. Una pagina che nessuno rende è
// una pagina che nessuno misura: i difetti di impaginazione lì dentro non
// potevano uscire per costruzione.
//
// Questo file NON è un test: è l'attrezzo. Gira solo con DUMP_LAYOUT=1.
//
//   DUMP_LAYOUT=1 npx vitest run tests/unit/layoutPagineFuoriMenu.test.jsx
//   node scripts/audit-design-telefono.mjs <cartella> 390
//   node scripts/audit-scorrimento.mjs <cartella> 390

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { mkdirSync, writeFileSync } from 'node:fs'

const ATTIVO = !!process.env.DUMP_LAYOUT
const FUORI = process.env.DIR_VISTE
  || '/private/tmp/claude-501/-Users-aler/7259be07-0e07-42ba-9be1-e672e3a32c10/scratchpad/viste-fuori-menu'

function fluente(res = { data: [], error: null }) {
  const h = { get(_t, p) {
    if (p === 'then') return (r) => r(res)
    if (p === 'maybeSingle' || p === 'single') return () => Promise.resolve({ data: null, error: null })
    return () => new Proxy({}, h)
  } }
  return new Proxy({}, h)
}
vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: null } }),
            getUser: () => Promise.resolve({ data: { user: { id: 'u', email: 'anita@maradeiboschi.com' } } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    from: () => fluente(), rpc: () => Promise.resolve({ data: null, error: null }),
    channel: () => ({ on: () => ({ subscribe: () => ({ unsubscribe() {} }) }) }), removeChannel: () => {},
  },
}))
vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {},
  // Ordinazioni va fotografata **con dentro qualcosa**: è sulle schede degli
  // eventi che stanno i pulsanti, e una pagina vuota non li avrebbe mai
  // mostrati al metro dei 44px. Un evento quotato e uno no, per avere a
  // schermo tutte e due le forme.
  sload: async (k) => (k === 'pasticceria-eventi-v1' ? [
    { id: 'e1', nome: 'Matrimonio Rossi', cliente: 'Rossi', data: '2099-06-12', stato: 'confermato',
      righe: [{ nome: 'Torta nuziale', qty: 1, prezzo: 320 }] },
    { id: 'e2', nome: 'Battesimo', cliente: 'Bianchi', data: '2099-07-03', stato: 'confermato', righe: [] },
  ] : null),
  ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))
vi.mock('../../src/lib/stockPF', () => ({
  loadStockPF: async () => [], loadMovimentiPF: async () => [],
  scartoPF: async () => 0, rettificaPF: async () => 0, caricoProduzionePF: async () => 0,
}))
vi.mock('../../src/lib/trasferimenti', () => ({ creaTrasferimento: async () => ({ ok: true }) }))
// La variante TELEFONO: `useIsMobile` decide metà dell'impaginazione, e a
// 390px la risposta è sempre sì.
vi.mock('../../src/lib/useIsMobile', () => ({
  default: () => true, useIsTablet: () => false, useDevice: () => 'telefono',
}))

function ripuliscilo(html) {
  return html
    .replace(/border: none none/g, 'border: none')
    .replace(/border-color: none none/g, 'border-color: transparent transparent')
    .replace(/outline-color: none; outline-style: none; outline-width: initial;/g, 'outline: none;')
}

async function scrivi(nome, elemento) {
  const v = render(elemento)
  await new Promise(r => setTimeout(r, 80))
  mkdirSync(FUORI, { recursive: true })
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
${document.head.innerHTML}
<style>
*, *::before, *::after { box-sizing: border-box; }
@media (pointer: coarse) {
  input, textarea, select { font-size: 16px !important; }
  button[aria-label]:not([class*="inline"]) { min-width: 44px; min-height: 44px; }
}
@media (max-width: 767px) { table { width: 100%; } }
body{margin:0;background:#F8FAFC;color:#0F172A;font-family:Inter,system-ui,sans-serif;
  font-feature-settings:'cv11','ss01','ss03';-webkit-font-smoothing:antialiased;}
.schermo{padding:16px;}
</style>
</head><body><div class="schermo">${ripuliscilo(v.container.innerHTML)}</div></body></html>`
  writeFileSync(`${FUORI}/${nome}.html`, html)
  v.unmount()
  return html.length
}

describe('fotografia delle pagine fuori menu', () => {
  // Senza DUMP_LAYOUT questa prova non si fa: prima finiva con
  // `expect(true).toBe(true)` e il riepilogo la contava fra quelle **passate**.
  // Una fotografia non scattata non è una prova superata: adesso il riepilogo
  // dice «saltata», che è la verità. (audit 16/09/2026)
  it.skipIf(!ATTIVO)('scrive l\'HTML delle quattro pagine che nessun attrezzo rendeva', async () => {
    const { default: TrasferimentiView } = await import('../../src/components/TrasferimentiView.jsx')
    const { default: HomeDipendente } = await import('../../src/views/HomeDipendente.jsx')
    const { default: MarketplaceView } = await import('../../src/views/MarketplaceView.jsx')
    const { default: RecipeInventorView } = await import('../../src/views/RecipeInventorView.jsx')

    const sedi = [{ id: 's1', nome: 'Corso Vittorio', attiva: true }, { id: 's2', nome: 'Berthollet', attiva: true }]
    const sedeAttiva = sedi[0]
    const n = []
    n.push(await scrivi('trasferimenti', <TrasferimentiView orgId="org-1" sedi={sedi} sedeAttiva={sedeAttiva} notify={() => {}} metodoProduzione="stampi" />))
    n.push(await scrivi('trasferimenti-dipendente', <TrasferimentiView orgId="org-1" sedi={sedi} sedeAttiva={sedeAttiva} notify={() => {}} metodoProduzione="stampi" soloRicezione />))
    n.push(await scrivi('home-dipendente', <HomeDipendente user={{ email: 'luca@maradeiboschi.com' }} sedeAttiva={sedeAttiva} isInventario={false} setView={() => {}} notify={() => {}} />))
    n.push(await scrivi('marketplace', <MarketplaceView />))
    n.push(await scrivi('ricette-ai', <RecipeInventorView orgId="org-1" user={{ email: 'anita@maradeiboschi.com' }} nomeAttivita="Pasticceria del Corso" />))

    expect(n.every(x => x > 1000)).toBe(true)
  })

  // Le pagine che si aprono da dentro un'altra pagina, com'è messo un cliente
  // nuovo: senza ricettario, senza costi fissi, senza niente. È lo stato in cui
  // le bugie da «0 €» si vedono, e l'unico che nessun attrezzo fotografava.
  it.skipIf(!ATTIVO)('scrive l\'HTML delle pagine fuori menu, vuote e piene', async () => {
    const { default: NuovaRicettaView } = await import('../../src/views/NuovaRicettaView.jsx')
    const { default: SemilavoratiView } = await import('../../src/views/SemilavoratiView.jsx')
    const { default: CostiAziendaliView } = await import('../../src/views/CostiAziendaliView.jsx')
    const { default: AzioniView } = await import('../../src/views/AzioniView.jsx')
    const { default: ImportaDati } = await import('../../src/components/ImportaDati.jsx')
    const { default: HomeDipendente } = await import('../../src/views/HomeDipendente.jsx')
    // Ordinazioni mancava, e si vedeva: la misura dei bersagli sotto i 44px
    // girava su otto pagine su dieci e io la raccontavo come se fossero dieci.
    // (Integrazioni resta fuori: le sue schede si aprono solo dopo il controllo
    // del backend, che qui dentro non c'è. È scritto anche in
    // ilDatoCheMancaLoDice.test.jsx.)
    const { default: EventiView } = await import('../../src/components/Eventi.jsx')

    const sedi = [{ id: 's1', nome: 'Corso Vittorio', attiva: true }, { id: 's2', nome: 'Berthollet', attiva: true }]
    const ricettarioVuoto = { ricette: {}, ingredienti_costi: {} }
    const n = []
    n.push(await scrivi('nuova-ricetta-vuota', <NuovaRicettaView ricettario={ricettarioVuoto} notify={() => {}} onSave={() => {}} editingRicetta={null} onEditConsumed={() => {}} tipoAttivita="pasticceria" />))
    n.push(await scrivi('semilavorati-vuoti', <SemilavoratiView ricettario={ricettarioVuoto} onSave={() => {}} notify={() => {}} tipoAttivita="pasticceria" />))
    n.push(await scrivi('costi-aziendali-vuoti', <CostiAziendaliView orgId="org-1" sedeId="s1" sedi={sedi} notify={() => {}} />))
    n.push(await scrivi('azioni-vuote', <AzioniView actions={[]} onUpdate={() => {}} onDelete={() => {}} ricettario={ricettarioVuoto} giornaliero={{}} chiusure={[]} magazzino={{}} nomeAttivita="Pasticceria del Corso" tipoAttivita="pasticceria" />))
    n.push(await scrivi('importa-dati', <ImportaDati orgId="org-1" sedi={sedi} onImportRicettario={() => {}} ricettario={ricettarioVuoto} nomeAttivita="Pasticceria del Corso" notify={() => {}} />))
    n.push(await scrivi('home-dipendente-una-sede', <HomeDipendente user={{ email: 'luca@maradeiboschi.com' }} sedeAttiva={sedi[0]} sedi={[sedi[0]]} isInventario={false} setView={() => {}} notify={() => {}} />))
    n.push(await scrivi('eventi', <EventiView orgId="org-1" sedeId="s1" ricettario={ricettarioVuoto} notify={() => {}} nomeAttivita="Pasticceria del Corso" tipoAttivita="pasticceria" />))
    n.push(await scrivi('home-dipendente-due-sedi', <HomeDipendente user={{ email: 'luca@maradeiboschi.com' }} sedeAttiva={sedi[0]} sedi={sedi} isInventario={false} setView={() => {}} notify={() => {}} />))

    expect(n.every(x => x > 1000)).toBe(true)
  })
})
