// Global background job store — lives in module scope, never destroyed on navigation
const jobs = new Map()
const listeners = new Set()

function notify() {
  const all = [...jobs.values()]
  listeners.forEach(fn => fn(all))
}

function isNetworkError(err) {
  const msg = err?.message || ''
  return msg.includes('Failed to fetch') || msg.includes('network') || msg.includes('NetworkError')
}

async function withRetry(fn, delays = [3000, 10000, 30000]) {
  for (let i = 0; i <= delays.length; i++) {
    try { return await fn() } catch (err) {
      if (!isNetworkError(err) || i === delays.length) throw err
      await new Promise(r => setTimeout(r, delays[i]))
    }
  }
}

export const backgroundManager = {
  add(id, { tipo = 'upload', nome, fn, onComplete, onError }) {
    const job = {
      id, tipo, nome,
      status: 'pending',
      progress: 0,
      result: null,
      error: null,
      startedAt: Date.now(),
      completedAt: null,
      _fn: fn, _onComplete: onComplete, _onError: onError,
    }
    jobs.set(id, job)
    notify()

    Promise.resolve()
      .then(() => {
        jobs.set(id, { ...jobs.get(id), status: 'running' })
        notify()
        return withRetry(() => fn((progress) => {
          jobs.set(id, { ...jobs.get(id), progress: Math.min(100, Math.round(progress)) })
          notify()
        }))
      })
      .then(result => {
        jobs.set(id, { ...jobs.get(id), status: 'done', progress: 100, result, completedAt: Date.now() })
        notify()
        try { onComplete?.(result) } catch (e) { console.error('[backgroundManager] onComplete threw:', e) }
        setTimeout(() => { jobs.delete(id); notify() }, 8000)
      })
      .catch(err => {
        const message = isNetworkError(err) ? 'Connessione persa. Riprova.' : (err.message || 'Errore sconosciuto')
        jobs.set(id, { ...jobs.get(id), status: 'error', error: message, completedAt: Date.now() })
        notify()
        try { onError?.(err) } catch (e) { console.error('[backgroundManager] onError threw:', e) }
        setTimeout(() => { jobs.delete(id); notify() }, 15000)
      })
  },

  retry(id) {
    const job = jobs.get(id)
    if (!job || job.status !== 'error') return
    this.add(id + '_retry_' + Date.now(), {
      tipo: job.tipo, nome: job.nome, fn: job._fn,
      onComplete: job._onComplete, onError: job._onError,
    })
    jobs.delete(id)
    notify()
  },

  remove(id) {
    jobs.delete(id)
    notify()
  },

  subscribe(fn) {
    listeners.add(fn)
    fn([...jobs.values()])
    return () => listeners.delete(fn)
  },

  getResult(id) {
    const job = jobs.get(id)
    return job?.status === 'done' ? job.result : null
  },

  isRunning(id) {
    const status = jobs.get(id)?.status
    return status === 'pending' || status === 'running'
  },

  getAll() {
    return [...jobs.values()]
  },
}

// Avvisa l'utente se prova a chiudere/ricaricare la tab mentre ci sono job in corso
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    const attivi = [...jobs.values()].filter(j => j.status === 'pending' || j.status === 'running')
    if (attivi.length > 0) {
      e.preventDefault()
      // I browser moderni ignorano il messaggio custom ma mostrano comunque il dialog
      e.returnValue = `Hai ${attivi.length} operazion${attivi.length > 1 ? 'i' : 'e'} in corso. Uscire le interromperà.`
      return e.returnValue
    }
  })
}

// Backward-compatible alias for existing uploadManager.add(id, file, fn, opts) calls
export const uploadManager = {
  add(id, fileOrFake, fn, { onComplete, onError, label } = {}) {
    backgroundManager.add(id, {
      tipo: 'upload',
      nome: label || fileOrFake?.name || id,
      fn,
      onComplete,
      onError,
    })
  },
  subscribe: backgroundManager.subscribe.bind(backgroundManager),
  getAll: backgroundManager.getAll.bind(backgroundManager),
  clear(id) { backgroundManager.remove(id) },
}
