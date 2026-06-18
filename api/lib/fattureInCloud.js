// Client per Fatture in Cloud REST API v2
// Docs: https://developers.fattureincloud.it/
//
// Auth: API token (Bearer) generato dal pannello Fatture in Cloud
// Companies: l'account ha 1+ "company" (cessionarie); per FoodOS usiamo
// quella della nostra societa' (FATTUREINCLOUD_COMPANY_ID).
//
// Env vars richieste:
//   FATTUREINCLOUD_API_TOKEN     → token statico Bearer
//   FATTUREINCLOUD_COMPANY_ID    → id numerico della company "Foodios SRL"
//
// Senza queste env vars il modulo lancia errore appena si chiama qualunque
// funzione (fail-closed, non blocca la build).

import { safeFetch } from './safeFetch.js'

const API_BASE = 'https://api-v2.fattureincloud.it'

function getConfig() {
  const token = process.env.FATTUREINCLOUD_API_TOKEN
  const companyId = process.env.FATTUREINCLOUD_COMPANY_ID
  if (!token) throw new Error('FATTUREINCLOUD_API_TOKEN non configurato')
  if (!companyId) throw new Error('FATTUREINCLOUD_COMPANY_ID non configurato')
  return { token, companyId }
}

async function ficRequest(method, path, body) {
  const { token } = getConfig()
  const res = await safeFetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  }, 15_000)
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* non json */ }
  if (!res.ok) {
    const errMsg = json?.error?.message || json?.message || text?.slice(0, 300) || `HTTP ${res.status}`
    const e = new Error(`Fatture in Cloud ${method} ${path}: ${errMsg}`)
    e.status = res.status
    e.body = json
    throw e
  }
  return json
}

// Cerca un cliente per P.IVA (codice fiscale). Se esiste ne ritorna l'id,
// altrimenti lo crea. Usato per evitare duplicati clienti.
export async function upsertCliente({ ragioneSociale, partitaIva, codiceFiscale, indirizzo, cap, citta, provincia, nazione = 'IT', codiceDestinatario, pec, email }) {
  const { companyId } = getConfig()
  // 1. Cerca per P.IVA. Validiamo strict (solo cifre/lettere alfanumeriche IT,
  // max 16 char per codice fiscale persona fisica) PRIMA dell'interpolazione
  // in query, altrimenti caratteri come `"` o spazi rompono il query language
  // di FiC e potenzialmente espongono injection (audit 2026-06-17 CRITICAL).
  if (partitaIva) {
    const pivaClean = String(partitaIva).replace(/[^A-Za-z0-9]/g, '').slice(0, 16)
    if (pivaClean && pivaClean === String(partitaIva).replace(/\s/g, '')) {
      try {
        const found = await ficRequest('GET', `/c/${companyId}/entities/clients?q=vat_number = "${pivaClean}"&per_page=1`)
        const existing = found?.data?.[0]
        if (existing) {
          return { id: existing.id, name: existing.name, isNew: false }
        }
      } catch { /* non bloccare, prova insert */ }
    }
  }
  // 2. Crea nuovo cliente
  const payload = {
    data: {
      name: ragioneSociale,
      type: 'company',
      country: nazione,
      country_iso: nazione,
      address_street: indirizzo,
      address_postal_code: cap,
      address_city: citta,
      address_province: provincia,
      vat_number: partitaIva,
      tax_code: codiceFiscale || partitaIva,
      certified_email: pec,
      ei_code: codiceDestinatario,
      email,
    },
  }
  const res = await ficRequest('POST', `/c/${companyId}/entities/clients`, payload)
  return { id: res?.data?.id, name: res?.data?.name, isNew: true }
}

// Emette una fattura elettronica per il cliente indicato. Trasmessa a SDI
// automaticamente se `transmit=true`. Ritorna l'oggetto invoice creato.
export async function emettiFatturaElettronica({
  clienteId,
  numero,                  // opzionale: lascia null per autonumerazione FiC
  data,                    // YYYY-MM-DD
  scadenza,                // YYYY-MM-DD (default: data + 30gg)
  oggetto = 'Servizio FoodOS — abbonamento SaaS',
  descrizione = 'Abbonamento mensile FoodOS — gestionale ristorazione artigianale',
  importoNetto,            // in euro (es. 89.00)
  aliquotaIva = 22,
  metodoPagamento = 'carta_di_credito',
  transmit = true,         // trasmettere via SDI? (default sì)
  stripeInvoiceId,         // riferimento Stripe (per audit)
}) {
  const { companyId } = getConfig()
  const payload = {
    data: {
      type: 'invoice',
      numeration: '/A',         // o '/auto' se preferisci sezionale generica
      subject: oggetto,
      visible_subject: oggetto,
      currency: { id: 'EUR' },
      language: { code: 'it', name: 'Italiano' },
      entity: { id: clienteId },
      date: data || new Date().toISOString().slice(0, 10),
      next_due_date: scadenza,
      e_invoice: true,
      ei_data: {
        payment_method: 'MP08',  // 'MP08' = carta di credito. MP05 = bonifico
      },
      items_list: [{
        product_id: null,
        code: 'FOODIOS-SUB',
        name: 'Abbonamento FoodOS',
        description: descrizione,
        qty: 1,
        net_price: importoNetto,
        vat: { id: aliquotaIva === 22 ? 0 : null, percentage: aliquotaIva },
      }],
      payments_list: [{
        amount: Number((importoNetto * (1 + aliquotaIva / 100)).toFixed(2)),
        due_date: scadenza,
        paid_date: data,
        status: 'paid',          // pagamento gia' ricevuto via Stripe
        payment_account: { id: null },
      }],
      notes: stripeInvoiceId ? `Riferimento Stripe: ${stripeInvoiceId}` : null,
    },
  }
  const created = await ficRequest('POST', `/c/${companyId}/issued_documents`, payload)
  const invoiceId = created?.data?.id
  if (!invoiceId) throw new Error('Fatture in Cloud non ha restituito invoice id')

  // Trasmissione SDI
  if (transmit) {
    try {
      await ficRequest('POST', `/c/${companyId}/issued_documents/${invoiceId}/e_invoice/send`, {})
    } catch (e) {
      // La fattura e' creata, ma trasmissione SDI fallita. Logga e continua —
      // l'admin puo' ritrasmettere dal pannello Fatture in Cloud.
      console.error('SDI send failed for invoice', invoiceId, e.message)
    }
  }

  return created?.data
}

// Recupera l'URL PDF di una fattura emessa (per inviarlo al cliente via email).
export async function getInvoicePdfUrl(invoiceId) {
  const { companyId } = getConfig()
  const res = await ficRequest('GET', `/c/${companyId}/issued_documents/${invoiceId}?fields=attachment_url,attachment_token`)
  return res?.data?.attachment_url || null
}
