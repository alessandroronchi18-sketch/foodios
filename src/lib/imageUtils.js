// Compressione immagine lato client per foto OCR.
// Riduce smartphone JPEG da 3-5MB a 200-400KB senza perdita visibile per l'OCR.
//
// Usato da: FotoOCR (componente analisi foto AI) e ChiusuraView (scontrini).

export async function compressImage(file, maxSide = 1600, quality = 0.85) {
  if (!file || !file.type?.startsWith('image/')) return file
  // Skip su file già piccoli (<300KB) — non vale la pena
  if (file.size < 300_000) return file
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(maxSide / img.width, maxSide / img.height, 1)
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url)
        if (!blob) return resolve(file)
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
      }, 'image/jpeg', quality)
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}
