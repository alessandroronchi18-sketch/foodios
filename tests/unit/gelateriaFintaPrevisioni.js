// Una gelateria finta per fotografare la pagina Previsioni (attrezzi
// layoutViste*.test.jsx): otto gusti, 70 giorni fino al 28/08/2026, fatti a
// lotti quando la vetrina scende, con il sabato e la domenica più forti e il
// lunedì più debole, e — come nei fogli veri — la rimanenza lasciata a zero in
// un giorno di produzione su sette. Non è un test: è il materiale di prova.

const GUSTI = [
  ['FONDENTE', 7, 13], ['PISTACCHIO', 6, 10], ['FIOR DI PANNA', 5, 8], ['NOCCIOLA', 4.5, 8],
  ['AMOR FOU', 3, 5], ['FRAGOLA', 3.5, 6], ['LIMONE', 2.5, 5], ['YOGURT', 2, 5],
]

export const ULTIMO_GIORNO_FINTO = '2026-08-28'

export function righeGelateriaFinta() {
  let seme = 7
  const caso = () => { seme = (seme * 16807) % 2147483647; return seme / 2147483647 }
  const righe = []
  for (const [gusto, ritmo, lotto] of GUSTI) {
    let vetrina = lotto * 0.6
    for (let i = 0; i < 70; i++) {
      const giorno = new Date(Date.UTC(2026, 5, 20 + i))
      const data = giorno.toISOString().slice(0, 10)
      const dow = giorno.getUTCDay()
      const peso = dow === 6 ? 1.3 : dow === 0 ? 1.2 : dow === 1 ? 0.8 : 1
      const domanda = ritmo * peso * (0.75 + 0.5 * caso())
      const prod = vetrina < ritmo * 1.2 ? lotto : 0
      const venduto = Math.min(domanda, vetrina + prod)
      vetrina = vetrina + prod - venduto
      const casellaVuota = prod > 0 && caso() < 0.15
      righe.push({
        gusto_nome: gusto, data,
        produzione_g: Math.round(prod * 1000),
        rimanenza_g: casellaVuota ? 0 : Math.round(vetrina * 1000),
        scarto_g: 0, spedito_g: 0, ricevuto_g: 0,
      })
    }
  }
  return righe
}
