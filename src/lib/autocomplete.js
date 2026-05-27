// Utility per la selezione del primo suggerimento al tasto Enter
// negli input legati a <datalist> o autocomplete custom.
//
// Uso tipico:
//   import { firstMatch, onEnterAutoComplete } from '../lib/autocomplete'
//
//   <input
//     value={val}
//     onChange={e => setVal(e.target.value)}
//     onKeyDown={onEnterAutoComplete(opzioni, val, setVal, () => doSubmit())}
//   />

const norm = (s) => (s || '').toString().toLowerCase().trim()

/**
 * Restituisce il primo suggerimento che matcha la stringa digitata.
 * Priorità: startsWith > includes. Case-insensitive.
 * Se l'utente ha già digitato un valore identico a una option, ritorna quello (no-op).
 */
export function firstMatch(options, query) {
  if (!Array.isArray(options) || options.length === 0) return null
  const q = norm(query)
  if (!q) return null
  // Match esatto (l'utente ha già scelto) → non sostituire
  for (const o of options) if (norm(o) === q) return o
  // Prefisso
  for (const o of options) if (norm(o).startsWith(q)) return o
  // Sottostringa
  for (const o of options) if (norm(o).includes(q)) return o
  return null
}

/**
 * Handler onKeyDown da applicare all'input.
 * Quando si preme Enter:
 *  1. Se c'è un match con i suggerimenti e l'utente non ha già digitato il valore completo,
 *     sostituisce il value con il primo match (chiama setValue).
 *  2. Esegue onSubmit (passando il valore finale) se fornito.
 *
 * @param {string[]} options       lista di suggerimenti
 * @param {string}   currentValue  valore corrente
 * @param {function} setValue      setter dello state
 * @param {function} [onSubmit]    callback dopo selezione, riceve il valore finale
 * @param {object}   [opts]        { preventOnNoMatch: boolean }
 */
export function onEnterAutoComplete(options, currentValue, setValue, onSubmit, opts = {}) {
  return (e) => {
    if (e.key !== 'Enter') return
    if (e.nativeEvent?.isComposing) return // IME
    const match = firstMatch(options, currentValue)
    if (match && norm(match) !== norm(currentValue)) {
      e.preventDefault()
      setValue(match)
      if (onSubmit) onSubmit(match)
      return
    }
    if (onSubmit) {
      e.preventDefault()
      onSubmit(currentValue)
    } else if (opts.preventOnNoMatch) {
      e.preventDefault()
    }
  }
}
