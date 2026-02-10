'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type SalesReport = {
  id: number
  report_ref: string | null
  company_name: string
  client_contact_name: string | null
  client_phone: string | null
  status: string
  callback_at: string | null
  rep_user_id: string | null
}

function formatDateTime(d: string) {
  try {
    return new Date(d).toLocaleString()
  } catch {
    return d
  }
}

/**
 * ✅ Global callback alerts (Sales Reports) that run anywhere in your protected app.
 * - Polls Supabase every 25s
 * - Alerts when a callback is due (<= dueWindowMs ahead or overdue)
 * - Dedupes alerts using localStorage
 *
 * Defaults to MINE (only alerts your own callbacks).
 */
export default function CallbackAlerts({
  pollMs = 25_000,
  dueWindowMs = 60_000,
  scope = 'MINE', // 'MINE' | 'TEAM'
  maxPerTick = 25,
}: {
  pollMs?: number
  dueWindowMs?: number
  scope?: 'MINE' | 'TEAM'
  maxPerTick?: number
}) {
  const alertedRef = useRef<Set<string>>(new Set())
  const runningRef = useRef(false)
  const [userId, setUserId] = useState<string | null>(null)

  // ✅ load session user id once
  useEffect(() => {
    ;(async () => {
      const { data: s } = await supabase.auth.getSession()
      if (!s.session) {
        setUserId(null)
        return
      }
      const { data } = await supabase.auth.getUser()
      setUserId(data?.user?.id ?? null)
    })()
  }, [])

  // ✅ load alerted keys once
  useEffect(() => {
    try {
      const raw = localStorage.getItem('t555_sr_callback_alerted') || '[]'
      const arr = JSON.parse(raw) as string[]
      alertedRef.current = new Set(arr)
    } catch {
      alertedRef.current = new Set()
    }
  }, [])

  useEffect(() => {
    const tick = async () => {
      if (runningRef.current) return
      runningRef.current = true

      try {
        // if you want MINE scope, we need a userId
        if (scope === 'MINE' && !userId) return

        const now = Date.now()
        const windowCutoffIso = new Date(now + dueWindowMs).toISOString()

        let q = supabase
          .from('sales_reports')
          .select('id, report_ref, company_name, client_contact_name, client_phone, status, callback_at, rep_user_id')
          .eq('status', 'Callback')
          .not('callback_at', 'is', null)
          .lte('callback_at', windowCutoffIso)
          .order('callback_at', { ascending: true })
          .limit(maxPerTick)

        if (scope === 'MINE' && userId) q = q.eq('rep_user_id', userId)

        const { data, error } = await q
        if (error) return

        const rows = (data || []) as SalesReport[]
        if (!rows.length) return

        for (const r of rows) {
          if (!r.callback_at) continue

          const t = new Date(r.callback_at).getTime()
          if (Number.isNaN(t)) continue

          // prevent alerts for ancient callbacks
          const maxOverdueMs = 24 * 60 * 60 * 1000 // 24h
          if (t < now - maxOverdueMs) continue

          const key = `${r.id}:${r.callback_at}`
          if (alertedRef.current.has(key)) continue

          alertedRef.current.add(key)
          try {
            localStorage.setItem(
              't555_sr_callback_alerted',
              JSON.stringify(Array.from(alertedRef.current).slice(-600))
            )
          } catch {}

          const ref = r.report_ref || `SR-${r.id}`
          const when = formatDateTime(r.callback_at)
          const who = r.client_contact_name ? ` • ${r.client_contact_name}` : ''
          const phone = r.client_phone ? `\n${r.client_phone}` : ''

          alert(`⏰ CALLBACK DUE\n\n${ref}\n${r.company_name}${who}\n${when}${phone}`)
          break // 1 alert per tick (prevents spam)
        }
      } finally {
        runningRef.current = false
      }
    }

    tick()
    const id = window.setInterval(tick, pollMs)
    return () => window.clearInterval(id)
  }, [pollMs, dueWindowMs, scope, maxPerTick, userId])

  return null
}
