// Dove si trova adesso l'utente, leggibile da fuori dal Dashboard.
//
// Serve ai due bottoni flottanti, che stanno in `App.jsx` come fratelli del
// Dashboard e quindi non possono leggerne lo stato. Senza questo, ogni
// segnalazione «questa cosa non funziona» arrivava **senza sapere in quale
// schermata fosse l'utente** — su un canale che serve a capire i guasti è il
// campo più importante. E l'indirizzo del browser non lo compensa: il Dashboard
// non ci scrive mai la pagina.
//
// Un contenitore minimo con degli iscritti, come il singolo già usato per la
// guardia delle modifiche non salvate. Niente contesto React nuovo: i due
// bottoni si trovano fuori dall'albero del Dashboard.

let corrente = null
const iscritti = new Set()

export function impostaVistaCorrente(vista) {
  if (vista === corrente) return
  corrente = vista
  for (const f of iscritti) { try { f(corrente) } catch { /* un iscritto rotto non ferma gli altri */ } }
}

export function leggiVistaCorrente() {
  return corrente
}

export function iscrivitiVistaCorrente(f) {
  iscritti.add(f)
  return () => iscritti.delete(f)
}
