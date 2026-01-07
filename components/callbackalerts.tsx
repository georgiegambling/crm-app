
'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Lead = {
  id: string
  lead_ref: string | null
  full_name: string
  phone: string
  status: string
  callback_at: string | null
  callback_note: string | null
}

function shortId(id: string) {
  if (!id) return ''
  return id.replace(/-/g, '').slice(0, 6)
}
function makeLeadRefFallback(id: string) {
  return `ECO${shortId(id).toUpperCase()}`
}
function formatDateTime(d: string) {
  try {
    return new Date(d).toLocaleString()
  } catch {
    return d
  }
}

/**
 * ✅ Global callback alerts that run anywhere in your protected app.
 * - Polls Supabase every 25s
 * - Alerts when a callback is due (<= 1 min ahead or overdue)
 * - Dedupes alerts using localStorage
 */
export default function CallbackAlerts({
  pollMs = 25_000,
  dueWindowMs = 60_000,
}: {
  pollMs?: number
  dueWindowMs?: number
}) {
  const alertedRef = useRef<Set<string>>(new Set())
  const runningRef = useRef(false)

  useEffect(() => {
    // load alerted keys
    try {
      const raw = localStorage.getItem('t555_callback_alerted') || '[]'
      const arr = JSON.parse(raw) as string[]
      alertedRef.current = new Set(arr)
    } catch {
      alertedRef.current = new Set()
    }
  }, [])

  useEffect(() => {
    const tick = async () => {
      // avoid overlapping requests if slow connection
      if (runningRef.current) return
      runningRef.current = true

      try {
        const now = Date.now()
        const windowCutoffIso = new Date(now + dueWindowMs).toISOString()

        // Only look at callbacks due within the next minute (or earlier).
        // This keeps queries light.
        const { data, error } = await supabase
          .from('leads')
          .select('id, lead_ref, full_name, phone, status, callback_at, callback_note')
          .eq('status', 'Callback')
          .not('callback_at', 'is', null)
          .lte('callback_at', windowCutoffIso)
          .order('callback_at', { ascending: true })
          .limit(25)

        if (error) return

        const rows = (data || []) as Lead[]
        if (!rows.length) return

        for (const l of rows) {
          if (!l.callback_at) continue

          const t = new Date(l.callback_at).getTime()
          if (Number.isNaN(t)) continue

          // due if <= cutoff (already enforced) AND also within a sensible range behind
          // (prevents alerts from ancient callbacks if they exist)
          const maxOverdueMs = 24 * 60 * 60 * 1000 // 24h
          if (t < now - maxOverdueMs) continue

          const key = `${l.id}:${l.callback_at}`
          if (alertedRef.current.has(key)) continue

          alertedRef.current.add(key)
          try {
            localStorage.setItem('t555_callback_alerted', JSON.stringify(Array.from(alertedRef.current).slice(-600)))
          } catch {}

          const ref = l.lead_ref || makeLeadRefFallback(l.id)
          const when = formatDateTime(l.callback_at)
          const note = l.callback_note ? `\n\nNote: ${l.callback_note}` : ''

          alert(`⏰ CALLBACK DUE\n\n${ref} • ${l.full_name}\n${when}${note}`)
          break // 1 alert per tick (prevents spam)
        }
      } finally {
        runningRef.current = false
      }
    }

    // run soon after mount, then interval
    tick()
    const id = window.setInterval(tick, pollMs)
    return () => window.clearInterval(id)
  }, [pollMs, dueWindowMs])

  return null
}
