// Normalizzazione del nome di un gusto: UPPER + trim.
//
// Vive in un file suo, senza dipendenze, perché serve sia a chi scrive su
// DB (inventarioProduzione) sia a chi legge i file Excel dei clienti
// (inventarioImport), e quel secondo file non deve tirarsi dietro il client
// Supabase.
//
// Perché e' importante che sia UNA funzione sola: fino al 10/09/2026
// l'import faceva solo `.toUpperCase()` senza trim, e in produzione sono
// finite 117 righe scritte "CAFFè FLORA" mentre la pagina cercava
// "CAFFÈ FLORA". Risultato: 156 kg di produzione invisibili nel foglio, e
// scrivendo su quel gusto si creava una seconda serie parallela.
export function normGusto(s) {
  return (s || '').toString().toUpperCase().trim()
}
