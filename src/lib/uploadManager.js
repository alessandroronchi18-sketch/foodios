// Global upload store — lives outside React, never destroyed on navigation
const uploads = new Map()
const listeners = new Set()

function notify() {
  const list = [...uploads.values()]
  listeners.forEach(fn => fn(list))
}

function isNetworkError(err) {
  const msg = err?.message || ''
  return msg.includes('Failed to fetch') || msg.includes('network') || msg.includes('NetworkError')
}

async function withRetry(fn, delays = [3000, 10000, 30000]) {
  for (let i = 0; i <= delays.length; i++) {
    try {
      return await fn()
    } catch (err) {
      if (!isNetworkError(err) || i === delays.length) throw err
      await new Promise(r => setTimeout(r, delays[i]))
    }
  }
}

export const uploadManager = {
  add(id, file, uploadFn) {
    uploads.set(id, {
      id, name: file.name, progress: 0, status: 'uploading', result: null, error: null,
    })
    notify()

    const onProgress = (progress) => {
      const u = uploads.get(id)
      if (u) { uploads.set(id, { ...u, progress }); notify() }
    }

    withRetry(() => uploadFn(onProgress))
      .then(result => {
        const u = uploads.get(id)
        if (u) { uploads.set(id, { ...u, progress: 100, status: 'done', result }); notify() }
        setTimeout(() => { uploads.delete(id); notify() }, 5000)
      })
      .catch(err => {
        const u = uploads.get(id)
        const message = isNetworkError(err) ? 'Connessione persa. Riprova.' : (err.message || 'Errore sconosciuto')
        if (u) { uploads.set(id, { ...u, status: 'error', error: message }); notify() }
      })
  },

  subscribe(fn) {
    listeners.add(fn)
    fn([...uploads.values()]) // immediate call so subscriber sees current state
    return () => listeners.delete(fn)
  },

  getAll() {
    return [...uploads.values()]
  },

  clear(id) {
    uploads.delete(id)
    notify()
  },
}
