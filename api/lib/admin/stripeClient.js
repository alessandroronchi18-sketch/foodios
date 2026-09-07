// Client Stripe condiviso dal pannello admin.
//
// Estratto perché serve sia ai report (MRR, eventi) sia ai codici sconto:
// tenerlo in un posto solo evita che le due aree divergano sulla versione di
// API usata. L'import di stripe e' dinamico per non pesare sul cold start
// delle richieste che Stripe non lo toccano affatto.

export async function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe non configurato')
  const { default: Stripe } = await import('stripe')
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' })
}
