import { useState, useEffect } from 'react'
import { backgroundManager } from './backgroundManager'

export function useBackgroundJobs(tipo) {
  const [jobs, setJobs] = useState(backgroundManager.getAll())

  useEffect(() => {
    return backgroundManager.subscribe(all => {
      setJobs(tipo ? all.filter(j => j.tipo === tipo) : all)
    })
  }, [tipo])

  return jobs
}

export function useJobResult(id) {
  const [result, setResult] = useState(() => backgroundManager.getResult(id))
  const [status, setStatus] = useState(() => {
    const job = backgroundManager.getAll().find(j => j.id === id)
    return job?.status || 'unknown'
  })

  useEffect(() => {
    return backgroundManager.subscribe(all => {
      const job = all.find(j => j.id === id)
      if (job) {
        setStatus(job.status)
        if (job.status === 'done') setResult(job.result)
      }
    })
  }, [id])

  return { result, status }
}
