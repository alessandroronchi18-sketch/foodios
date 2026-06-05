import { describe, it, expect } from 'vitest'
import { parseShopifyOrders, parseWooCommerceOrders, mergeOrdiniInChiusure } from '../../src/lib/importEcommerce.js'

describe('parseShopifyOrders', () => {
  it('deduplica ordini multi-riga (1 riga per line item) e filtra non pagati', () => {
    const csv = [
      'Name,Financial Status,Paid at,Total,Taxes,Shipping',
      '#1001,paid,2026-01-10 10:00:00,"30,00","2,00","5,00"',
      '#1001,,2026-01-10 10:00:00,,,',          // line item 2 dello stesso ordine → ignorato
      '#1002,pending,2026-01-10 11:00:00,"15,00","1,00",0', // non pagato → escluso
      '#1003,paid,2026-01-11 09:00:00,"20,00",0,0',
    ].join('\n')
    const out = parseShopifyOrders(csv)
    expect(out).toEqual([
      { data: '2026-01-10', importo: 30, ordini: 1, fonte: 'Shopify', iva: 2, spedizione: 5 },
      { data: '2026-01-11', importo: 20, ordini: 1, fonte: 'Shopify', iva: 0, spedizione: 0 },
    ])
  })

  it('include partially_refunded e authorized', () => {
    const csv = [
      'Name,Financial Status,Paid at,Total',
      '#1,partially_refunded,2026-01-01,10',
      '#2,authorized,2026-01-01,5',
    ].join('\n')
    const out = parseShopifyOrders(csv)
    expect(out[0].ordini).toBe(2)
    expect(out[0].importo).toBe(15)
  })

  it('CSV vuoto → []', () => {
    expect(parseShopifyOrders('')).toEqual([])
  })
})

describe('parseWooCommerceOrders', () => {
  it('filtra per stato e aggrega per data', () => {
    const csv = [
      'Order ID,Order Date,Status,Order Total,Tax Total,Shipping Total',
      '1,2026-02-01,completed,"50,00","4,00","3,00"',
      '2,2026-02-01,cancelled,"20,00",0,0',   // escluso
      '3,2026-02-02,processing,"10,00","1,00",0',
    ].join('\n')
    const out = parseWooCommerceOrders(csv)
    expect(out.map(r => r.data)).toEqual(['2026-02-01', '2026-02-02'])
    expect(out[0]).toMatchObject({ importo: 50, ordini: 1, iva: 4, spedizione: 3, fonte: 'WooCommerce' })
  })

  it('normalizza stati con prefisso wc-', () => {
    const csv = 'Order ID,Order Date,Status,Order Total\n1,2026-02-01,wc-completed,50'
    expect(parseWooCommerceOrders(csv)[0].importo).toBe(50)
  })

  it('riga senza stato è inclusa (export minimale)', () => {
    const csv = 'Order ID,Order Date,Order Total\n1,2026-02-01,50'
    expect(parseWooCommerceOrders(csv)[0].importo).toBe(50)
  })
})

describe('mergeOrdiniInChiusure', () => {
  it('crea nuova chiusura con cassaImport se la data non esiste', () => {
    const out = mergeOrdiniInChiusure([], [{ data: '2026-01-01', importo: 100, ordini: 4, fonte: 'Shopify' }], 'Shopify')
    expect(out).toHaveLength(1)
    expect(out[0].cassaImport[0]).toMatchObject({ importo: 100, ordini: 4, fonte: 'Shopify' })
  })

  it('non duplica la stessa fonte su una chiusura esistente', () => {
    const chiusure = [{ data: '2026-01-01', cassaImport: [{ fonte: 'Shopify', importo: 50 }] }]
    const out = mergeOrdiniInChiusure(chiusure, [{ data: '2026-01-01', importo: 100, ordini: 4, fonte: 'Shopify' }], 'Shopify')
    const shop = out[0].cassaImport.filter(c => c.fonte === 'Shopify')
    expect(shop).toHaveLength(1)
    expect(shop[0].importo).toBe(100)
  })

  it('ordina per data discendente', () => {
    const out = mergeOrdiniInChiusure(
      [{ data: '2026-01-01', cassaImport: [] }],
      [{ data: '2026-01-05', importo: 1, ordini: 1, fonte: 'X' }],
      'X',
    )
    expect(out.map(c => c.data)).toEqual(['2026-01-05', '2026-01-01'])
  })
})
