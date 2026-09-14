// @vitest-environment happy-dom
//
// Fotografa le pagine, invece di misurarle soltanto.
//
// Questo file NON è un test: è l'attrezzo dell'audit di impaginazione. Rende le
// viste vere con dati veri e scrive l'HTML su disco; poi
// `scripts/foto-layout.mjs` lo apre in Chromium a 1440 e 420 px e lo fotografa.
// Otto difetti dell'audit del 9 set erano usciti solo così: sul DOM non si
// vedono, in una fotografia sì.
//
// Gira solo con DUMP_LAYOUT=1, così non rallenta la suite:
//   DUMP_LAYOUT=1 npx vitest run tests/layout/viste.test.jsx
//   node scripts/foto-layout.mjs

import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { mkdirSync, writeFileSync } from 'node:fs'

const ATTIVO = !!process.env.DUMP_LAYOUT
const FUORI = '/private/tmp/claude-501/-Users-aler/7259be07-0e07-42ba-9be1-e672e3a32c10/scratchpad/viste-mobile'

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
// Qui si rende la variante TELEFONO: `useIsMobile` decide metà
// dell'impaginazione, e misurare il layout da tavolo dentro una finestra da
// 420px direbbe cose false.
vi.mock('../../src/lib/useIsMobile', () => ({
  default: () => true,
  useIsTablet: () => false,
}))
vi.mock('../../src/lib/storage', () => ({
  ssave: async () => {}, sload: async () => null, ssaveBatch: async () => {}, sloadAllSedi: async () => ({}),
}))
vi.mock('../../src/lib/stockPF', () => ({
  loadStockPF: async () => [
    { id: 'a', prodotto_nome: 'SACHER', quantita: 6, unita: 'pz', valore_unit: 12, soglia_min: 2, updated_at: new Date().toISOString() },
    { id: 'b', prodotto_nome: 'CROSTATA FRUTTA', quantita: 3, unita: 'pz', valore_unit: 9.5, soglia_min: 4, updated_at: new Date(Date.now() - 86400000).toISOString() },
    { id: 'c', prodotto_nome: 'GELATO NOCCIOLA', quantita: 8400, unita: 'g', valore_unit: 0.021, soglia_min: 2000, updated_at: new Date(Date.now() - 3 * 86400000).toISOString() },
  ],
  loadMovimentiPF: async () => [
    { id: 'm1', prodotto_nome: 'SACHER', delta: 12, causale: 'produzione', note: '', created_at: new Date().toISOString() },
    { id: 'm2', prodotto_nome: 'SACHER', delta: -6, causale: 'vendita', note: '', created_at: new Date().toISOString() },
    { id: 'm3', prodotto_nome: 'GELATO NOCCIOLA', delta: -8400, causale: 'trasferimento_invio', note: 'a Berthollet', created_at: new Date(Date.now() - 86400000).toISOString() },
  ],
  scartoPF: async () => 0, rettificaPF: async () => 0, caricoProduzionePF: async () => 0,
}))
vi.mock('../../src/lib/trasferimenti', () => ({ creaTrasferimento: async () => ({ ok: true }) }))

// ── Dati di prova con le forme VERE (vedi CLAUDE.md e la memoria del progetto)
const ricettario = {
  ricette: {
    r1: { nome: 'SACHER', tipo: 'torta', porzioni: 8, prezzo: 30, unita: 8, categoria: 'Torte',
      ingredienti: [{ nome: 'farina 00', qty1stampo: 500 }, { nome: 'burro', qty1stampo: 300 }, { nome: 'cioccolato fondente', qty1stampo: 250 }, { nome: 'uova', qty1stampo: 240 }] },
    r2: { nome: 'CROSTATA FRUTTA FRESCA', tipo: 'torta', porzioni: 10, prezzo: 26, unita: 10, categoria: 'Torte',
      ingredienti: [{ nome: 'farina 00', qty1stampo: 400 }, { nome: 'burro', qty1stampo: 200 }, { nome: 'zucchero semolato', qty1stampo: 150 }] },
    r3: { nome: 'GELATO NOCCIOLA', tipo: 'gusto', porzioni: 1, prezzo: 0, unita: 0, categoria: 'Gusti',
      ingredienti: [{ nome: 'latte intero', qty1stampo: 2000 }, { nome: 'pasta nocciola', qty1stampo: 320 }] },
  },
  ingredienti_costi: {
    'farina 00': { costoKg: 0.95, costoG: 0.00095 },
    burro: { costoKg: 8.4, costoG: 0.0084 },
    'cioccolato fondente': { costoKg: 11.2, costoG: 0.0112 },
    uovo: { costoKg: 4.2, costoG: 0.0042 },
    'zucchero semolato': { costoKg: 1.1, costoG: 0.0011, isStima: true },
    'latte intero': { costoKg: 1.35, costoG: 0.00135 },
    'pasta nocciola': { costoKg: 28, costoG: 0.028 },
  },
}
const magazzino = {
  'farina 00': { nome: 'Farina 00', giacenza_g: 28000, soglia_g: 5000, ultimoRifornimento: new Date(Date.now() - 5 * 86400000).toISOString() },
  burro: { nome: 'Burro', giacenza_g: 4200, soglia_g: 3000, ultimoRifornimento: new Date(Date.now() - 2 * 86400000).toISOString() },
  'cioccolato fondente': { nome: 'Cioccolato fondente', giacenza_g: 900, soglia_g: 2000, ultimoRifornimento: new Date(Date.now() - 12 * 86400000).toISOString() },
  uova: { nome: 'Uova', giacenza_g: 1800, soglia_g: 1000 },
  'zucchero semolato': { nome: 'Zucchero semolato', giacenza_g: 0, soglia_g: 2000 },
  'latte intero': { nome: 'Latte intero', giacenza_g: 12000, soglia_g: 4000, ultimoRifornimento: new Date().toISOString() },
  'pasta nocciola': { nome: 'Pasta nocciola', giacenza_g: 3400, soglia_g: 1500 },
}
const oggi = new Date().toISOString().slice(0, 10)
const ieri = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
const giornaliero = [
  { id: 'g1', data: oggi, prodotti: [{ nome: 'SACHER', stampi: 3, vendibile: 24 }, { nome: 'CROSTATA FRUTTA FRESCA', stampi: 2, vendibile: 20 }], ingredientiUsati: { 'farina 00': 2300, burro: 1300 }, fcTot: 41.2, ricavoTot: 232, note: '' },
  { id: 'g2', data: ieri, prodotti: [{ nome: 'SACHER', stampi: 2, vendibile: 16 }], ingredientiUsati: { 'farina 00': 1000, burro: 600 }, fcTot: 18.4, ricavoTot: 120, note: '' },
]
const chiusure = [
  { data: oggi, kpi: { totV: 847.5, totFC: 226.9, totM: 620.6, totS: 12, totMP: 73.2, avgST: 88, pos: 520, contanti: 227.5, delivery: 100 } },
  { data: ieri, kpi: { totV: 612.3, totFC: 180.1, totM: 432.2, totS: 8, totMP: 70.6, avgST: 81, pos: 400, contanti: 212.3, delivery: null } },
]

const comuni = { ricettario, magazzino, giornaliero, chiusure, orgId: 'org-1', sedeId: 's1', notify: () => {} }

async function scrivi(nome, elemento) {
  const v = render(elemento)
  await new Promise(r => setTimeout(r, 60))
  mkdirSync(FUORI, { recursive: true })
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
${document.head.innerHTML}
<style>body{margin:0;background:#FAF7F2;font-family:Inter,system-ui,sans-serif;} .schermo{padding:24px;}</style>
</head><body><div class="schermo">${v.container.innerHTML}</div></body></html>`
  writeFileSync(`${FUORI}/${nome}.html`, html)
  v.unmount()
  return html.length
}

describe('fotografia delle viste — telefono', () => {
  it('scrive l\'HTML delle viste principali in versione telefono', async () => {
    if (!ATTIVO) { expect(true).toBe(true); return }
    const { default: MagazzinoView } = await import('../../src/views/MagazzinoView.jsx')
    const { default: ProduzioneView } = await import('../../src/views/ProduzioneGiornalieraView.jsx')
    const { default: RicettarioView } = await import('../../src/views/RicettarioView.jsx')
    const { default: PLView } = await import('../../src/views/PLView.jsx')

    const n = []
    n.push(await scrivi('magazzino', <MagazzinoView {...comuni} setMagazzino={() => {}} logRif={[
      { id: 'r1', data: new Date().toISOString(), ingrediente: 'Farina 00', quantita_g: 25000, note: 'bolla 114', utente: 'anita@maradeiboschi.com' },
      { id: 'r2', data: new Date(Date.now() - 86400000).toISOString(), ingrediente: 'Burro', quantita_g: -500, note: 'scarico manuale' },
    ]} setLogRif={() => {}} logPrezzi={[]} />))
    n.push(await scrivi('produzione', <ProduzioneView {...comuni} setMagazzino={() => {}} setGiornaliero={() => {}}
      sedi={[{ id: 's1', nome: 'Corso Vittorio', attiva: true }]} sedeAttiva={{ id: 's1', nome: 'Corso Vittorio' }} />))
    n.push(await scrivi('ricettario', <RicettarioView {...comuni} sedi={[{ id: 's1', nome: 'Corso Vittorio' }]} sedeAttiva={{ id: 's1', nome: 'Corso Vittorio' }} />))
    n.push(await scrivi('pl', <PLView {...comuni} />))

    const { default: DashboardHomeView } = await import('../../src/views/DashboardHomeView.jsx')
    const { default: StoricoProduzioneView } = await import('../../src/views/StoricoProduzioneView.jsx')
    const { default: SimulatorePrezziView } = await import('../../src/views/SimulatorePrezziView.jsx')
    const { default: SpreciOmaggi } = await import('../../src/components/SpreciOmaggi.jsx')
    const { default: Personale } = await import('../../src/components/Personale.jsx')
    const { default: Scadenzario } = await import('../../src/components/Scadenzario.jsx')
    const { default: CostiAziendaliView } = await import('../../src/views/CostiAziendaliView.jsx')
    const { default: VenditeB2BView } = await import('../../src/views/VenditeB2BView.jsx')
    const { default: Fornitori } = await import('../../src/components/Fornitori.jsx')
    const { default: EventiView } = await import('../../src/components/Eventi.jsx')

    const sedi = [{ id: 's1', nome: 'Corso Vittorio', attiva: true }, { id: 's2', nome: 'Berthollet', attiva: true }]
    const sedeAttiva = sedi[0]
    n.push(await scrivi('home', <DashboardHomeView {...comuni} actions={[]} setView={() => {}} nomeAttivita="Pasticceria del Corso"
      isTrialAttivo auth={{ user: { email: 'anita@maradeiboschi.com' } }} sedi={sedi} sedeAttiva={sedeAttiva} />))
    n.push(await scrivi('storico-produzione', <StoricoProduzioneView {...comuni} logPrezzi={[]} sedi={sedi} />))
    n.push(await scrivi('simulatore', <SimulatorePrezziView {...comuni} tipoAttivita="pasticceria" />))
    n.push(await scrivi('perdite', <SpreciOmaggi {...comuni} sedeAttiva={sedeAttiva} auth={{ user: { email: 'anita@maradeiboschi.com' } }} />))
    n.push(await scrivi('personale', <Personale orgId="org-1" sedeId="s1" sedi={sedi} notify={() => {}} adminNome="Anita" nomeAttivita="Pasticceria del Corso" />))
    n.push(await scrivi('scadenzario', <Scadenzario orgId="org-1" sedeId="s1" sedi={sedi} />))
    n.push(await scrivi('costi-aziendali', <CostiAziendaliView orgId="org-1" sedeId="s1" sedi={sedi} notify={() => {}} />))
    n.push(await scrivi('vendite-b2b', <VenditeB2BView orgId="org-1" sedeId="s1" sedi={sedi} sedeAttiva={sedeAttiva} ricettario={ricettario} notify={() => {}} />))
    n.push(await scrivi('fornitori', <Fornitori orgId="org-1" sedeId="s1" sedi={sedi} notify={() => {}} />))
    n.push(await scrivi('eventi', <EventiView orgId="org-1" sedeId="s1" ricettario={ricettario} notify={() => {}} nomeAttivita="Pasticceria del Corso" tipoAttivita="pasticceria" />))

    const { default: ChiusuraView } = await import('../../src/views/ChiusuraView.jsx')
    const { default: InventarioSettimanaleView } = await import('../../src/views/InventarioSettimanaleView.jsx')
    const { default: QuadraturaInventarioView } = await import('../../src/views/QuadraturaInventarioView.jsx')
    const { default: ConfrontoSedi } = await import('../../src/components/ConfrontoSedi.jsx')
    const { default: SemilavoratiView } = await import('../../src/views/SemilavoratiView.jsx')
    const { default: NuovaRicettaView } = await import('../../src/views/NuovaRicettaView.jsx')
    const { default: MenuEngineeringView } = await import('../../src/views/MenuEngineeringView.jsx')
    const { default: CashflowView } = await import('../../src/views/CashflowView.jsx')
    const { default: PrevisioneDomanda } = await import('../../src/components/PrevisioneDomanda.jsx')
    const { default: AzioniView } = await import('../../src/views/AzioniView.jsx')
    const { buildIngCosti, calcolaFC, getR } = await import('../../src/lib/foodcost.js')

    n.push(await scrivi('cassa', <ChiusuraView {...comuni} setChiusure={() => {}} tipoAttivita="pasticceria" sedi={sedi} sedeAttiva={sedeAttiva} />))
    n.push(await scrivi('inventario', <InventarioSettimanaleView {...comuni} setMagazzino={() => {}} sedi={sedi} sedeAttiva={sedeAttiva} tipoAttivita="gelateria" metodoProduzione="inventario" />))
    n.push(await scrivi('quadratura', <QuadraturaInventarioView orgId="org-1" sedeId="s1" sedi={sedi} sedeAttiva={sedeAttiva} chiusure={chiusure} metodoProduzione="inventario" onNavigate={() => {}} notify={() => {}} />))
    n.push(await scrivi('confronto-sedi', <ConfrontoSedi orgId="org-1" sedi={sedi} />))
    n.push(await scrivi('semilavorati', <SemilavoratiView ricettario={ricettario} onSave={() => {}} notify={() => {}} tipoAttivita="pasticceria" />))
    n.push(await scrivi('nuova-ricetta', <NuovaRicettaView ricettario={ricettario} onSave={() => {}} notify={() => {}} tipoAttivita="pasticceria" />))
    n.push(await scrivi('menu-engineering', <MenuEngineeringView orgId="org-1" sedeId="s1" ricettario={ricettario} sedeAttiva={sedeAttiva} />))
    n.push(await scrivi('cashflow', <CashflowView orgId="org-1" sedeId="s1" sedi={sedi} notify={() => {}} />))
    n.push(await scrivi('previsione', <PrevisioneDomanda ricettario={ricettario} giornaliero={giornaliero} chiusure={chiusure} ingCosti={buildIngCosti(ricettario.ingredienti_costi)} calcolaFC={calcolaFC} getR={getR} citta="Torino" tipoAttivita="pasticceria" />))
    n.push(await scrivi('azioni', <AzioniView actions={[]} onUpdate={() => {}} onDelete={() => {}} ricettario={ricettario} giornaliero={giornaliero} chiusure={chiusure} magazzino={magazzino} nomeAttivita="Pasticceria del Corso" tipoAttivita="pasticceria" />))

    const { default: ImportaDati } = await import('../../src/components/ImportaDati.jsx')
    const { default: Integrazioni } = await import('../../src/components/Integrazioni.jsx')
    const { default: RegistroAttivita } = await import('../../src/components/RegistroAttivita.jsx')
    const { default: BrainView } = await import('../../src/views/BrainView.jsx')
    const { default: ForecastView } = await import('../../src/views/ForecastView.jsx')
    const { default: OrdiniAiView } = await import('../../src/views/OrdiniAiView.jsx')
    const { default: RecensioniView } = await import('../../src/views/RecensioniView.jsx')
    const { default: AiHubView } = await import('../../src/views/AiHubView.jsx')

    n.push(await scrivi('importa-dati', <ImportaDati onImportRicettario={() => {}} ricettario={ricettario} nomeAttivita="Pasticceria del Corso" notify={() => {}} orgId="org-1" sedi={sedi} />))
    n.push(await scrivi('integrazioni', <Integrazioni orgId="org-1" sedeId="s1" />))
    n.push(await scrivi('registro-attivita', <RegistroAttivita orgId="org-1" sedi={sedi} notify={() => {}} />))
    n.push(await scrivi('brain', <BrainView orgId="org-1" sedeId="s1" user={{ email: 'anita@maradeiboschi.com' }} nomeAttivita="Pasticceria del Corso" />))
    n.push(await scrivi('forecast', <ForecastView orgId="org-1" sedeId="s1" sedeAttiva={sedeAttiva} setView={() => {}} />))
    n.push(await scrivi('ordini-ai', <OrdiniAiView orgId="org-1" sedeId="s1" notify={() => {}} />))
    n.push(await scrivi('recensioni', <RecensioniView nomeAttivita="Pasticceria del Corso" />))
    n.push(await scrivi('ai-hub', <AiHubView orgId="org-1" setView={() => {}} goToUpgrade={() => {}} piano="pro" userEmail="anita@maradeiboschi.com" />))

    expect(n.every(x => x > 1000)).toBe(true)
  })
})
