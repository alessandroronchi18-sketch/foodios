import { useState, useEffect } from 'react'
import { uploadManager } from './uploadManager'

export function useUploadManager() {
  const [uploads, setUploads] = useState(uploadManager.getAll())

  useEffect(() => {
    return uploadManager.subscribe(setUploads)
  }, [])

  return uploads
}
