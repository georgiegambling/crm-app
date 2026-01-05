'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Controls:
 * - TOTAL_MS: how long the overlay stays on screen in total
 * - FADE_OUT_MS: how long the fade-out animation takes at the end
 */
const TOTAL_MS = 9000 // ⬅️ make bigger to slow it down (e.g. 6500 / 8000)
const FADE_OUT_MS = 650

export default function WelcomeOverlay() {
  const pathname = usePathname()

  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)

  const timers = useRef<number[]>([])
  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }

  // Run when route changes so it can trigger right after login -> /dashboard
  useEffect(() => {
    if (typeof window === 'undefined') return

    const shouldPlay = sessionStorage.getItem('t5_welcome') === '1'
    if (!shouldPlay) return

    // Only play once per tab/session
    sessionStorage.removeItem('t5_welcome')

    clearTimers()
    setVisible(true)
    setExiting(false)

    // start fade near the end
    timers.current.push(
      window.setTimeout(() => setExiting(true), Math.max(0, TOTAL_MS - FADE_OUT_MS))
    )

    // fully hide at the end
    timers.current.push(
      window.setTimeout(() => {
        setExiting(false)
        setVisible(false)
      }, TOTAL_MS)
    )

    return () => clearTimers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  if (!visible) return null

  return (
    <div style={wrap(exiting)} aria-hidden>
      {/* Full-screen gif */}
      <img
        src="/welcome.gif"
        alt=""
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover', // fills screen (crops edges slightly)
        }}
      />

      {/* Subtle CRM-style tint + vignette so it matches your palette */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(900px 500px at 50% 30%, rgba(0,255,255,0.12), rgba(0,0,0,0) 60%), linear-gradient(180deg, rgba(2,11,34,0.35), rgba(1,5,26,0.55))',
        }}
      />

      {/* Optional: tiny scanline texture */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.12,
          background:
            'repeating-linear-gradient(180deg, rgba(255,255,255,0.10) 0px, rgba(255,255,255,0.10) 1px, rgba(0,0,0,0) 3px, rgba(0,0,0,0) 6px)',
          mixBlendMode: 'overlay',
        }}
      />
    </div>
  )
}

function wrap(exiting: boolean): React.CSSProperties {
  return {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    background: '#020B22',
    display: 'block',
    opacity: exiting ? 0 : 1,
    transition: `opacity ${FADE_OUT_MS}ms ease`,
    pointerEvents: 'auto', // blocks clicks while playing
  }
}
