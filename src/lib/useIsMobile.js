import { useState, useEffect } from 'react'

// Hook responsive principale: true sotto `breakpoint` px (default 768 = phone).
export default function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < breakpoint)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const handler = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])
  return isMobile
}

// true SOLO su tablet/iPad (768–1023px): né phone né desktop.
// Utile per densità intermedie (2 colonne invece di 4, padding ridotto).
export function useIsTablet() {
  const [isTablet, setIsTablet] = useState(
    () => window.innerWidth >= 768 && window.innerWidth <= 1023
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px) and (max-width: 1023px)')
    const handler = (e) => setIsTablet(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isTablet
}
