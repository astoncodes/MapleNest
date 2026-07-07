import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// SPA route changes don't reset scroll on their own — without this, tapping a
// listing card halfway down the grid opens the detail page mid-scroll.
export default function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}
