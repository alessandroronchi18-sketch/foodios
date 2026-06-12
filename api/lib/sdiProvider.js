// SDI provider abstraction.
//
// Punto di ingresso unico per emettere fatture elettroniche SDI. Oggi e'
// implementato un solo provider (Fatture in Cloud); altri provider possono
// essere aggiunti senza toccare i caller (sdi-emit-invoice.js, future
// integrazioni B2B). Basta:
//   1. creare un nuovo modulo ./<provider>.js che esporta { upsertCliente,
//      emettiFatturaElettronica, getInvoicePdfUrl } con la stessa firma
//   2. aggiungerlo al map PROVIDERS qui sotto
//   3. settare SDI_PROVIDER=<id> nelle env Vercel
//
// Default: 'fattureincloud' (scelta operativa del progetto, vedi
// docs/SDI_GO_LIVE.md per la comparativa che ha portato a questa scelta).

const PROVIDERS = {
  fattureincloud: () => import('./fattureInCloud.js'),
  // aruba:        () => import('./aruba.js'),         // TODO se mai si switcha
  // easyfatque:   () => import('./easyfatque.js'),    // TODO se mai si switcha
}

export function activeSdiProviderId() {
  return (process.env.SDI_PROVIDER || 'fattureincloud').toLowerCase()
}

export function activeSdiProviderRequiredEnv() {
  const id = activeSdiProviderId()
  switch (id) {
    case 'fattureincloud':
      return ['FATTUREINCLOUD_API_TOKEN', 'FATTUREINCLOUD_COMPANY_ID']
    case 'aruba':
      return ['ARUBA_USERNAME', 'ARUBA_PASSWORD', 'ARUBA_TRANSMITTER_ID']
    case 'easyfatque':
      return ['EASYFATTURE_API_KEY']
    default:
      return []
  }
}

// Ritorna true se le env vars del provider attivo sono tutte settate.
export function isSdiProviderConfigured() {
  return activeSdiProviderRequiredEnv().every(k => !!process.env[k])
}

// Carica il modulo provider. Usa import() dinamico per code-split su Vercel.
export async function loadSdiProvider() {
  const id = activeSdiProviderId()
  const loader = PROVIDERS[id]
  if (!loader) throw new Error(`SDI provider non supportato: ${id}`)
  return await loader()
}
