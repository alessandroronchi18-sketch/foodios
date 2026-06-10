import { useState, useEffect } from 'react'
// Consolidato sull'alias di backgroundManager: lib/uploadManager.js manteneva
// un Map separato, quindi BackgroundToast (backgroundManager) e UploadToast
// (uploadManager) vedevano due liste indipendenti → upload non sempre visibili.
import { uploadManager } from './backgroundManager'

export function useUploadManager() {
  const [uploads, setUploads] = useState(uploadManager.getAll())

  useEffect(() => {
    return uploadManager.subscribe(setUploads)
  }, [])

  return uploads
}
