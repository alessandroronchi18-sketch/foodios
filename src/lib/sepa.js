// Generazione bonifico SEPA - file pain.001.001.03 (SEPA Credit Transfer
// Initiation), formato accettato dall'home banking italiano per i "bonifici
// massivi" / disposizioni CBI. Il proprietario seleziona le fatture da pagare,
// scarica l'XML e lo carica nella sua banca → paga tutto in un colpo, senza
// riscrivere IBAN/importi. Nessuna licenza, nessun costo per transazione.
//
// NB: il debtor (azienda) deve avere un IBAN valido; il creditore (fornitore)
// idem - le fatture senza IBAN valido vengono escluse e segnalate al chiamante.

// ── Validazione IBAN (mod-97, ISO 13616) ─────────────────────────────────────
export function normalizeIban(iban) {
  return String(iban || '').replace(/\s+/g, '').toUpperCase()
}

export function ibanIsValid(iban) {
  const s = normalizeIban(iban)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false
  if (s.length < 15 || s.length > 34) return false
  const rearr = s.slice(4) + s.slice(0, 4)
  const expanded = rearr.replace(/[A-Z]/g, c => (c.charCodeAt(0) - 55).toString())
  let rem = 0
  for (let i = 0; i < expanded.length; i++) {
    rem = (rem * 10 + (expanded.charCodeAt(i) - 48)) % 97
  }
  return rem === 1
}

const round2 = n => Math.round((Number(n) || 0) * 100) / 100

// SEPA ammette solo un set ristretto di caratteri nei campi testuali.
function sepaText(s, max = 140) {
  return String(s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // accenti → base
    .replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

// Causale standard per il pagamento di una fattura fornitore.
export function causaleFattura(f) {
  const parts = []
  if (f?.numero_rif) parts.push(`Fatt. ${f.numero_rif}`)
  if (f?.data_fattura) parts.push(`del ${f.data_fattura}`)
  if (!parts.length) parts.push('Pagamento fattura')
  return sepaText(parts.join(' '))
}

// Testo "copia bonifico" per la singola fattura (quando non si usa l'XML massivo).
export function bonificoText({ beneficiario, iban, importo, causale }) {
  return [
    `Beneficiario: ${beneficiario || '-'}`,
    `IBAN: ${normalizeIban(iban) || '-'}`,
    `Importo: € ${round2(importo).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Causale: ${causale || '-'}`,
  ].join('\n')
}

// ── Generazione XML pain.001.001.03 ──────────────────────────────────────────
// debtor: { nome, iban, bic? }
// payments: [{ id, beneficiario, iban, importo, causale }]
// opts: { executionDate 'YYYY-MM-DD', msgId, creationDateTime ISO }
// Ritorna { xml, included, skipped, totale }.
export function generateSepaXml({ debtor, payments = [], executionDate, msgId, creationDateTime }) {
  if (!debtor?.iban || !ibanIsValid(debtor.iban)) {
    throw new Error('IBAN dell’azienda mancante o non valido - impostalo in alto nella pagina.')
  }
  if (!debtor?.nome) throw new Error('Nome azienda (intestatario conto) mancante.')

  const included = []
  const skipped = []
  for (const p of payments) {
    const imp = round2(p.importo)
    if (imp <= 0) { skipped.push({ ...p, motivo: 'importo non positivo' }); continue }
    if (!ibanIsValid(p.iban)) { skipped.push({ ...p, motivo: 'IBAN mancante o non valido' }); continue }
    included.push({ ...p, importo: imp })
  }
  if (!included.length) {
    const e = new Error('Nessuna fattura pagabile: IBAN beneficiario mancante/non valido o importo nullo.')
    e.skipped = skipped
    throw e
  }

  const totale = round2(included.reduce((s, p) => s + p.importo, 0))
  const nb = included.length
  const creDtTm = creationDateTime || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z').slice(0, 19) + 'Z'
  const reqDt = executionDate || new Date().toISOString().slice(0, 10)
  const mId = sepaText(msgId || `FOODOS-${reqDt.replace(/-/g, '')}-${nb}`, 35).replace(/\s/g, '')
  const dbtrIban = normalizeIban(debtor.iban)

  const fmtAmt = n => n.toFixed(2)

  const txs = included.map((p, i) => {
    const e2e = sepaText(p.id ? `FOODOS-${p.id}` : `${mId}-${i + 1}`, 35).replace(/\s/g, '') || 'NOTPROVIDED'
    return `      <CdtTrfTxInf>
        <PmtId><EndToEndId>${xmlEscape(e2e)}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${fmtAmt(p.importo)}</InstdAmt></Amt>
        <CdtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></CdtrAgt>
        <Cdtr><Nm>${xmlEscape(sepaText(p.beneficiario, 70) || 'Fornitore')}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${normalizeIban(p.iban)}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${xmlEscape(sepaText(p.causale, 140) || 'Pagamento fattura')}</Ustrd></RmtInf>
      </CdtTrfTxInf>`
  }).join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${xmlEscape(mId)}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
      <NbOfTxs>${nb}</NbOfTxs>
      <CtrlSum>${fmtAmt(totale)}</CtrlSum>
      <InitgPty><Nm>${xmlEscape(sepaText(debtor.nome, 70))}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${xmlEscape(mId)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>false</BtchBookg>
      <NbOfTxs>${nb}</NbOfTxs>
      <CtrlSum>${fmtAmt(totale)}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt>${reqDt}</ReqdExctnDt>
      <Dbtr><Nm>${xmlEscape(sepaText(debtor.nome, 70))}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${dbtrIban}</IBAN></Id></DbtrAcct>
      <DbtrAgt><FinInstnId>${debtor.bic ? `<BIC>${xmlEscape(normalizeIban(debtor.bic))}</BIC>` : '<Othr><Id>NOTPROVIDED</Id></Othr>'}</FinInstnId></DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>
${txs}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`

  return { xml, included, skipped, totale }
}
