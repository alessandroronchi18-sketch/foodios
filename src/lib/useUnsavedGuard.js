// useUnsavedGuard - registro globale singleton per intercettare i cambi di
// view quando una form ha modifiche non salvate.
//
// Pattern:
//   1. La view (es. NuovaRicettaView) chiama useUnsavedGuard({ isDirty, save, discard }).
//      isDirty: () => boolean       - "il form ha modifiche non salvate?"
//      save:    async () => void    - salva le modifiche
//      discard: () => void          - opzionale, chiamato prima della nav senza salvare
//   2. Il router principale (Dashboard) legge getUnsavedGuardCurrent() prima di
//      cambiare view; se dirty, apre un modal con "Salva / Esci senza salvare".
//   3. Al montaggio installiamo anche un listener beforeunload per il caso di
//      refresh/chiusura tab (usa il prompt nativo del browser, meno bello ma
//      copre il caso in cui l'utente ricarica la pagina).
//
// Solo una view alla volta puo' essere registrata: se un'altra view registra,
// prende il posto. E' voluto: si naviga solo in una view alla volta.

import { useEffect, useRef } from 'react'

let _current = null // { ref: MutableRefObject<{isDirty, save, discard}> }

export function getUnsavedGuardCurrent() {
  return _current
}

export function useUnsavedGuard({ isDirty, save, discard }) {
  const ref = useRef({ isDirty, save, discard })
  // Aggiorna la ref ad ogni render cosi' le closure catturano gli state freschi.
  ref.current = { isDirty, save, discard }

  useEffect(() => {
    const handle = { ref }
    _current = handle

    // beforeunload: prompt nativo del browser se dirty al refresh/close tab.
    const onBeforeUnload = (e) => {
      try {
        if (ref.current?.isDirty?.()) {
          e.preventDefault()
          e.returnValue = ''
          return ''
        }
      } catch {}
    }
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      if (_current === handle) _current = null
    }
  }, [])
}
