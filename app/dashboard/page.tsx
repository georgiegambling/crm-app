'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'


type TimeRange = '7D' | '30D' | 'ALL'

type LeadRow = {
  id: string
  created_at: string
  status: string | null
  source: string | null
  assigned_to: string | null
  callback_at?: string | null
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function pct(n: number, d: number) {
  if (!d) return 0
  return Math.round((n / d) * 100)
}

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

function formatShort(dt: Date) {
  const dd = String(dt.getDate()).padStart(2, '0')
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}`
}

/* -------------------- Animated background (solar system) -------------------- */

function SolarSystemBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return

    const ctx = c.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      c.width = Math.floor(window.innerWidth * dpr)
      c.height = Math.floor(window.innerHeight * dpr)
      c.style.width = `${window.innerWidth}px`
      c.style.height = `${window.innerHeight}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    window.addEventListener('resize', resize)

    // stars
    const starCount = 160
    const stars = Array.from({ length: starCount }).map(() => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: 0.6 + Math.random() * 1.8,
      a: 0.15 + Math.random() * 0.35,
      tw: 0.002 + Math.random() * 0.006,
    }))

    // planets in orbits
    const centre = { x: window.innerWidth * 0.55, y: window.innerHeight * 0.28 }
    const orbits = [
      { radius: 70, speed: 0.018, size: 3.2, alpha: 0.55 },
      { radius: 120, speed: 0.012, size: 4.4, alpha: 0.55 },
      { radius: 190, speed: 0.009, size: 5.2, alpha: 0.55 },
      { radius: 270, speed: 0.006, size: 6.3, alpha: 0.55 },
    ].map((o, i) => ({ ...o, t: Math.random() * Math.PI * 2, i }))

    let tick = 0

    const draw = () => {
      tick += 1

      // in case the window size changed without resize event firing
      const w = window.innerWidth
      const h = window.innerHeight

      // clear
      ctx.clearRect(0, 0, w, h)

      // very soft vignette
      ctx.save()
      const g = ctx.createRadialGradient(w * 0.5, h * 0.45, 40, w * 0.5, h * 0.45, Math.max(w, h) * 0.85)
      g.addColorStop(0, 'rgba(0,255,255,0.06)')
      g.addColorStop(0.45, 'rgba(0,0,0,0)')
      g.addColorStop(1, 'rgba(0,0,0,0.55)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      ctx.restore()

      // twinkling stars
      for (const s of stars) {
        s.a += Math.sin(tick * s.tw) * 0.0025
        s.a = clamp(s.a, 0.08, 0.55)
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(200,255,255,${s.a})`
        ctx.fill()
      }

      // update centre on scroll-less pages (subtle)
      centre.x = w * 0.55
      centre.y = h * 0.28

      // draw orbits
      ctx.save()
      ctx.strokeStyle = 'rgba(0,255,255,0.10)'
      ctx.lineWidth = 1
      for (const o of orbits) {
        ctx.beginPath()
        ctx.ellipse(centre.x, centre.y, o.radius * 1.1, o.radius * 0.62, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.restore()

      // draw sun glow
      ctx.save()
      const sun = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, 120)
      sun.addColorStop(0, 'rgba(0,255,255,0.18)')
      sun.addColorStop(0.35, 'rgba(0,255,255,0.06)')
      sun.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = sun
      ctx.beginPath()
      ctx.arc(centre.x, centre.y, 120, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      // planets
      for (const o of orbits) {
        o.t += o.speed
        const px = centre.x + Math.cos(o.t) * (o.radius * 1.1)
        const py = centre.y + Math.sin(o.t) * (o.radius * 0.62)

        // planet glow
        ctx.save()
        const pg = ctx.createRadialGradient(px, py, 0, px, py, 32)
        pg.addColorStop(0, `rgba(0,255,255,${0.18 * o.alpha})`)
        pg.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = pg
        ctx.beginPath()
        ctx.arc(px, py, 32, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()

        // planet body
        ctx.beginPath()
        ctx.arc(px, py, o.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(190,255,255,${0.55 * o.alpha})`
        ctx.fill()
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)

    return () => {
      window.removeEventListener('resize', resize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        opacity: 0.9,
      }}
      aria-hidden="true"
    />
  )
}

/* -------------------- Dashboard page -------------------- */

export default function DashboardPage() {
  const router = useRouter()

  const [range, setRange] = useState<TimeRange>('30D')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [leads, setLeads] = useState<LeadRow[]>([])

  const fromDate = useMemo(() => {
    if (range === '7D') return daysAgo(7)
    if (range === '30D') return daysAgo(30)
    return null
  }, [range])

  const fetchLeads = async () => {
    setErrorMsg(null)

    let q = supabase
      .from('leads')
      .select('id, created_at, status, source, assigned_to, callback_at')
      .order('created_at', { ascending: false })

    if (fromDate) {
      q = q.gte('created_at', fromDate.toISOString())
    }

    const { data, error } = await q

    if (error) {
      setErrorMsg(error.message)
      setLeads([])
      return
    }

    setLeads((data || []) as LeadRow[])
  }

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      await fetchLeads()
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchLeads()
    setRefreshing(false)
  }

  /* ---------- status mapping (edit to match your exact CRM labels) ---------- */
  const STAGES = useMemo(
    () => [
      { key: 'New Lead', match: ['new', 'new lead'] },
      { key: 'Contacted', match: ['contacted'] },
      { key: 'Qualified', match: ['qualified'] },
      { key: 'Pending Photos', match: ['pending photos', 'pending'] },
      { key: 'Sent To Client', match: ['sent to client', 'sent'] },
      { key: 'Looking', match: ['looking'] },
    ],
    []
  )

  const DROP_OFF_MATCH = useMemo(() => ['drop-off', 'dnc', 'vm', 'na', 'not eligible'], [])
  const statusKey = (s: string | null) => (s || '').trim().toLowerCase()

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of STAGES) counts[s.key] = 0

    for (const l of leads) {
      const k = statusKey(l.status)
      for (const s of STAGES) {
        if (s.match.some((m) => k === m || k.includes(m))) {
          counts[s.key] += 1
          break
        }
      }
    }
    return counts
  }, [leads, STAGES])

  const total = leads.length
  const contacted = stageCounts['Contacted'] || 0
  const qualified = stageCounts['Qualified'] || 0
  const sent = stageCounts['Sent To Client'] || 0

  const dropped = useMemo(() => {
    let c = 0
    for (const l of leads) {
      const k = statusKey(l.status)
      if (DROP_OFF_MATCH.some((m) => k.includes(m))) c++
    }
    return c
  }, [leads, DROP_OFF_MATCH])

  const conversion = useMemo(() => {
    const contactRate = pct(contacted, total)
    const qualRate = pct(qualified, Math.max(contacted, 1))
    const sendRate = pct(sent, Math.max(qualified, 1))
    const dropRate = pct(dropped, total)
    return { contactRate, qualRate, sendRate, dropRate }
  }, [contacted, qualified, sent, dropped, total])

  const pipelineHealth = useMemo(() => {
    // quick weighted score: contacted=1, qualified=2, pending=2.3, sent=3, looking=1.6, dropoff=-1
    const pending = stageCounts['Pending Photos'] || 0
    const looking = stageCounts['Looking'] || 0
    const score =
      contacted * 1 +
      qualified * 2 +
      pending * 2.3 +
      sent * 3 +
      looking * 1.6 +
      dropped * -1

    // normalise to 0..100 using a soft cap
    const maxSoft = Math.max(total * 2.2, 1)
    return clamp(Math.round(((score + maxSoft) / (maxSoft * 2)) * 100), 0, 100)
  }, [stageCounts, contacted, qualified, sent, dropped, total])

  const leadTrend = useMemo(() => {
    const days = 14
    const start = startOfDay(daysAgo(days - 1))
    const buckets = Array.from({ length: days }).map((_, i) => {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      return { d, n: 0 }
    })

    for (const l of leads) {
      const dt = new Date(l.created_at)
      if (dt < start) continue
      const idx = Math.floor((startOfDay(dt).getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      if (idx >= 0 && idx < buckets.length) buckets[idx].n++
    }

    return buckets
  }, [leads])

  const sources = useMemo(() => {
    const map = new Map<string, number>()
    for (const l of leads) {
      const s = (l.source || 'Other').trim() || 'Other'
      map.set(s, (map.get(s) || 0) + 1)
    }
    const arr = Array.from(map.entries())
      .map(([name, n]) => ({ name, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 6)

    const max = Math.max(...arr.map((x) => x.n), 1)
    return { arr, max }
  }, [leads])

  const topPerformers = useMemo(() => {
    const map = new Map<
      string,
      { rep: string; leads: number; qualified: number; sent: number; score: number }
    >()

    for (const l of leads) {
      const rep = (l.assigned_to || 'Unassigned').trim() || 'Unassigned'
      const k = statusKey(l.status)

      const row = map.get(rep) || { rep, leads: 0, qualified: 0, sent: 0, score: 0 }
      row.leads += 1

      if (k.includes('qualified')) {
        row.qualified += 1
        row.score += 2
      }
      if (k.includes('sent')) {
        row.sent += 1
        row.score += 3
      }
      if (k.includes('contacted')) row.score += 1
      if (DROP_OFF_MATCH.some((m) => k.includes(m))) row.score -= 1

      map.set(rep, row)
    }

    return Array.from(map.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
  }, [leads, DROP_OFF_MATCH])

  const actions = useMemo(() => {
    const now = new Date()
    const staleCutoff = new Date()
    staleCutoff.setDate(staleCutoff.getDate() - 2)

    let stale = 0
    let callbacksDue = 0
    let vmna5 = 0
    let dncWeek = 0

    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    for (const l of leads) {
      const created = new Date(l.created_at)
      const k = statusKey(l.status)

      // stale = older than 2 days, not sent/qualified (tweak to taste)
      if (created < staleCutoff && !k.includes('sent') && !k.includes('qualified')) stale++

      // callbacks due
      if (l.callback_at) {
        const cb = new Date(l.callback_at)
        if (cb <= now) callbacksDue++
      }

      // vm/na 5+ days (if your statuses include VM/NA)
      if ((k.includes('vm') || k.includes('na')) && created < daysAgo(5)) vmna5++

      // dnc this week
      if (k.includes('dnc') && created >= weekAgo) dncWeek++
    }

    return { stale, callbacksDue, vmna5, dncWeek }
  }, [leads])

  /* -------------------- UI -------------------- */

  return (
    <div style={page}>
      <SolarSystemBackground />

      <div style={wrap}>
        {/* Top bar */}
        <div style={topBar}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={titleRow}>
              <div style={badge}>ECO4 • Lead Gen Dashboard</div>
              <div style={title}>Lead Generation Dashboard</div>
            </div>
            <div style={subtitle}>Conversion, workflow, pipeline health — in one clean view.</div>
          </div>

          <div style={controls}>
            <div style={rangeWrap}>
              {(['7D', '30D', 'ALL'] as TimeRange[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  style={r === range ? rangeBtnActive : rangeBtn}
                  title={`Show ${r}`}
                >
                  {r}
                </button>
              ))}
            </div>

            <button style={ghostBtn} onClick={handleRefresh} disabled={refreshing} aria-disabled={refreshing}>
              {refreshing ? 'Refreshing…' : '↻ Refresh'}
            </button>

            <button style={primaryBtn} onClick={() => router.push('/leads')}>
              Open Leads →
            </button>
          </div>
        </div>

        {errorMsg && (
          <div style={errorBar}>
            <b>Error:</b> {errorMsg}
          </div>
        )}

        {/* KPI row */}
        <div style={kpiRow}>
          <KpiCard
            icon="👥"
            label={`Total Leads (${range === 'ALL' ? 'All time' : range === '7D' ? '7 days' : '30 days'})`}
            value={loading ? '—' : String(total)}
            foot={loading ? 'Loading…' : 'Live pipeline volume'}
          />
          <KpiCard
            icon="✅"
            label="Qualified Leads"
            value={loading ? '—' : String(qualified)}
            foot="Ready to convert"
          />
          <KpiCard
            icon="📤"
            label="Sent to Client"
            value={loading ? '—' : String(sent)}
            foot="Awaiting response"
          />
          <KpiCard
            icon="💠"
            label="Pipeline Health"
            value={loading ? '—' : `${pipelineHealth}%`}
            foot={pipelineHealth >= 60 ? 'Optimised' : pipelineHealth >= 35 ? 'Improving' : 'Needs attention'}
          />
        </div>

        {/* Main grid */}
        <div style={grid}>
          {/* Conversion metrics */}
          <div style={card}>
            <div style={cardTitle}>Conversion Metrics</div>

            <MetricRow label="Contact Rate" value={`${conversion.contactRate}%`} dir={conversion.contactRate >= 10 ? 'up' : 'down'} />
            <MetricRow label="Qualification Rate" value={`${conversion.qualRate}%`} dir={conversion.qualRate >= 10 ? 'up' : 'down'} />
            <MetricRow label="Send Rate" value={`${conversion.sendRate}%`} dir={conversion.sendRate >= 10 ? 'up' : 'down'} />
            <MetricRow label="Drop-Off Rate" value={`${conversion.dropRate}%`} dir={conversion.dropRate <= 15 ? 'up' : 'down'} invert />
          </div>

          {/* Pipeline */}
          <div style={{ ...card, gridColumn: 'span 2' }}>
            <div style={cardTitleRow}>
              <div style={cardTitle}>Lead Pipeline</div>
              <div style={miniPill}>Live counts by stage</div>
            </div>

            <div style={pipelineBarWrap}>
              {STAGES.map((s, idx) => {
                const n = stageCounts[s.key] || 0
                const width = total ? clamp((n / total) * 100, 4, 60) : 8
                return (
                  <div key={s.key} style={{ ...pipeSeg, flex: width }}>
                    <div style={pipeTop}>
                      <div style={pipeLabel}>{s.key}</div>
                      <div style={pipeNum}>{n}</div>
                    </div>
                    <div style={pipeSub}>{idx === 0 ? 'New in flow' : idx === 5 ? 'In progress' : 'Moving stage'}</div>
                  </div>
                )
              })}
            </div>

            <div style={subGrid}>
              {/* Trend */}
              <div style={subCard}>
                <div style={subTitle}>Lead Trend</div>
                <div style={sparkWrap}>
                  <div style={sparkLine}>
                    {leadTrend.map((b, i) => (
                      <div
                        key={i}
                        title={`${formatShort(b.d)}: ${b.n}`}
                        style={{
                          ...sparkBar,
                          height: `${clamp(b.n * 8, 6, 72)}px`,
                          opacity: 0.85,
                        }}
                      />
                    ))}
                  </div>
                  <div style={sparkAxis}>
                    {leadTrend.map((b, i) => (i % 2 === 0 ? <div key={i} style={sparkTick}>{formatShort(b.d)}</div> : <div key={i} style={sparkTickBlank} />))}
                  </div>
                </div>
              </div>

              {/* Sources */}
              <div style={subCard}>
                <div style={subTitle}>Lead Sources</div>
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {sources.arr.map((s) => (
                    <div key={s.name} style={srcRow}>
                      <div style={srcName}>{s.name}</div>
                      <div style={srcBarWrap}>
                        <div style={{ ...srcBar, width: `${Math.round((s.n / sources.max) * 100)}%` }} />
                      </div>
                      <div style={srcNum}>{s.n}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Top performers */}
          <div style={{ ...card, gridColumn: 'span 2' }}>
            <div style={cardTitleRow}>
              <div style={cardTitle}>Top Performers</div>
              <div style={miniPill}>Agent scoring (weighted)</div>
            </div>

            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Agent</th>
                    <th style={thRight}>Leads</th>
                    <th style={thRight}>Qualified</th>
                    <th style={thRight}>Sent</th>
                    <th style={thRight}>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {topPerformers.length === 0 ? (
                    <tr>
                      <td style={td} colSpan={5}>
                        No performer data yet.
                      </td>
                    </tr>
                  ) : (
                    topPerformers.map((r) => (
                      <tr key={r.rep}>
                        <td style={td}>
                          <span style={pill}>{r.rep}</span>
                        </td>
                        <td style={tdRight}>{r.leads}</td>
                        <td style={tdRight}>{r.qualified}</td>
                        <td style={tdRight}>{r.sent}</td>
                        <td style={tdRight}>
                          <span style={scorePill}>{r.score}</span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action needed */}
          <div style={card}>
            <div style={cardTitleRow}>
              <div style={cardTitle}>Action Needed</div>
              <div style={miniPill}>Ops reminders</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
              <ActionLine label="Stale Leads (2+ days)" value={actions.stale} />
              <ActionLine label="Callbacks Due" value={actions.callbacksDue} />
              <ActionLine label="VM / NA 5+ days" value={actions.vmna5} />
              <ActionLine label="DNC This Week" value={actions.dncWeek} />
            </div>
          </div>
        </div>

        <div style={{ height: 36 }} />
      </div>
    </div>
  )
}

/* -------------------- Small UI components -------------------- */

function KpiCard(props: { icon: string; label: string; value: string; foot: string }) {
  return (
    <div style={kpiCard}>
      <div style={kpiIcon}>{props.icon}</div>
      <div style={kpiValue}>{props.value}</div>
      <div style={kpiLabel}>{props.label}</div>
      <div style={kpiFoot}>{props.foot}</div>
    </div>
  )
}

function MetricRow(props: { label: string; value: string; dir: 'up' | 'down'; invert?: boolean }) {
  const up = props.dir === 'up'
  const arrow = up ? '▲' : '▼'
  const vibe = props.invert ? !up : up
  return (
    <div style={metricRow}>
      <div style={metricLabel}>{props.label}</div>
      <div style={metricRight}>
        <div style={metricValue}>{props.value}</div>
        <div style={{ ...metricArrow, opacity: 0.95 }}>{arrow}</div>
        <div style={{ ...metricGlow, opacity: vibe ? 0.9 : 0.35 }} />
      </div>
    </div>
  )
}

function ActionLine(props: { label: string; value: number }) {
  return (
    <div style={actionRow}>
      <div style={actionLabel}>{props.label}</div>
      <div style={actionValue}>{props.value}</div>
    </div>
  )
}

/* -------------------- Styles -------------------- */

const page: React.CSSProperties = {
  minHeight: '100vh',
  position: 'relative',
  background:
    'radial-gradient(1200px 600px at 50% 0%, rgba(0,255,255,0.10), transparent 55%), linear-gradient(180deg, #020B22 0%, #01071A 45%, #01051A 100%)',
  color: '#fff',
  overflowX: 'hidden',
}

const wrap: React.CSSProperties = {
  position: 'relative',
  zIndex: 1,
  maxWidth: 1480,
  margin: '0 auto',
  padding: '22px 16px',
}

const topBar: React.CSSProperties = {
  padding: 16,
  borderRadius: 18,
  border: '1px solid rgba(0,255,255,0.22)',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))',
  boxShadow: '0 20px 70px rgba(0,0,0,0.55), 0 0 40px rgba(0,255,255,0.10)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
}

const titleRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
}

const badge: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 999,
  border: '1px solid rgba(0,255,255,0.22)',
  background: 'rgba(0,255,255,0.08)',
  fontWeight: 1000,
  fontSize: 12,
  color: 'rgba(210,255,255,0.95)',
}

const title: React.CSSProperties = { fontSize: 18, fontWeight: 1000, letterSpacing: 0.2 }
const subtitle: React.CSSProperties = { opacity: 0.75, fontWeight: 850, fontSize: 12.5 }

const controls: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
}

const rangeWrap: React.CSSProperties = {
  display: 'inline-flex',
  gap: 8,
  padding: 6,
  borderRadius: 999,
  border: '1px solid rgba(0,255,255,0.18)',
  background: 'rgba(0,0,0,0.25)',
}

const rangeBtn: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.05)',
  color: '#fff',
  fontWeight: 950,
  cursor: 'pointer',
}

const rangeBtnActive: React.CSSProperties = {
  ...rangeBtn,
  border: '1px solid rgba(0,255,255,0.45)',
  background: 'rgba(0,255,255,0.12)',
  boxShadow: '0 0 18px rgba(0,255,255,0.10)',
}

const ghostBtn: React.CSSProperties = {
  height: 38,
  padding: '0 12px',
  borderRadius: 12,
  fontWeight: 950,
  cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.06)',
  color: '#fff',
}

const primaryBtn: React.CSSProperties = {
  height: 38,
  padding: '0 14px',
  borderRadius: 12,
  fontWeight: 1000,
  cursor: 'pointer',
  border: '1px solid rgba(0,255,255,0.35)',
  background: 'rgba(0,255,255,0.14)',
  color: '#fff',
  boxShadow: '0 0 18px rgba(0,255,255,0.12)',
}

const errorBar: React.CSSProperties = {
  marginTop: 14,
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(255,40,40,0.12)',
  border: '1px solid rgba(255,40,40,0.28)',
  fontWeight: 900,
}

const kpiRow: React.CSSProperties = {
  marginTop: 14,
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 12,
}

const kpiCard: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(0,255,255,0.18)',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))',
  boxShadow: '0 18px 60px rgba(0,0,0,0.55)',
  padding: 14,
  position: 'relative',
  overflow: 'hidden',
}

const kpiIcon: React.CSSProperties = { fontSize: 18, opacity: 0.95 }
const kpiValue: React.CSSProperties = { marginTop: 8, fontSize: 26, fontWeight: 1100 }
const kpiLabel: React.CSSProperties = { marginTop: 2, fontSize: 12, opacity: 0.85, fontWeight: 900 }
const kpiFoot: React.CSSProperties = { marginTop: 8, fontSize: 12, opacity: 0.7, fontWeight: 850 }

const grid: React.CSSProperties = {
  marginTop: 12,
  display: 'grid',
  gridTemplateColumns: '1.1fr 1.5fr 1.0fr',
  gap: 12,
  alignItems: 'start',
}

const card: React.CSSProperties = {
  borderRadius: 18,
  border: '1px solid rgba(0,255,255,0.22)',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))',
  boxShadow: '0 20px 70px rgba(0,0,0,0.55)',
  padding: 14,
  overflow: 'hidden',
}

const cardTitle: React.CSSProperties = { fontWeight: 1100, fontSize: 13, letterSpacing: 0.3, opacity: 0.95 }
const cardTitleRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }
const miniPill: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: 999,
  border: '1px solid rgba(0,255,255,0.18)',
  background: 'rgba(0,0,0,0.22)',
  fontWeight: 950,
  fontSize: 11,
  opacity: 0.85,
}

const metricRow: React.CSSProperties = {
  marginTop: 12,
  padding: '10px 12px',
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,0.10)',
  background: 'rgba(0,0,0,0.18)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  position: 'relative',
  overflow: 'hidden',
}

const metricLabel: React.CSSProperties = { fontWeight: 950, opacity: 0.9 }
const metricRight: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }
const metricValue: React.CSSProperties = { fontWeight: 1100 }
const metricArrow: React.CSSProperties = { fontWeight: 1100, fontSize: 12 }
const metricGlow: React.CSSProperties = {
  position: 'absolute',
  right: -40,
  top: -50,
  width: 110,
  height: 110,
  background: 'radial-gradient(circle, rgba(0,255,255,0.22), transparent 60%)',
  filter: 'blur(10px)',
  pointerEvents: 'none',
}

const pipelineBarWrap: React.CSSProperties = {
  marginTop: 12,
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,0.10)',
  background: 'rgba(0,0,0,0.18)',
  overflowX: 'auto',
  display: 'flex',
  gap: 10,
  padding: 10,
}

const pipeSeg: React.CSSProperties = {
  minWidth: 170,
  borderRadius: 14,
  border: '1px solid rgba(0,255,255,0.18)',
  background: 'linear-gradient(180deg, rgba(0,255,255,0.10), rgba(255,255,255,0.03))',
  padding: 10,
}

const pipeTop: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }
const pipeLabel: React.CSSProperties = { fontWeight: 1000, fontSize: 12, opacity: 0.95 }
const pipeNum: React.CSSProperties = { fontWeight: 1200, fontSize: 18 }
const pipeSub: React.CSSProperties = { marginTop: 6, fontSize: 11.5, opacity: 0.75, fontWeight: 850 }

const subGrid: React.CSSProperties = {
  marginTop: 12,
  display: 'grid',
  gridTemplateColumns: '1.2fr 1fr',
  gap: 12,
}

const subCard: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,0.10)',
  background: 'rgba(0,0,0,0.18)',
  padding: 12,
}

const subTitle: React.CSSProperties = { fontWeight: 1100, fontSize: 12.5, opacity: 0.95 }

const sparkWrap: React.CSSProperties = { marginTop: 10 }
const sparkLine: React.CSSProperties = { display: 'flex', alignItems: 'flex-end', gap: 6, height: 84 }
const sparkBar: React.CSSProperties = {
  width: 12,
  borderRadius: 10,
  background: 'rgba(0,255,255,0.20)',
  border: '1px solid rgba(0,255,255,0.24)',
  boxShadow: '0 0 18px rgba(0,255,255,0.08)',
}
const sparkAxis: React.CSSProperties = { marginTop: 8, display: 'flex', gap: 6 }
const sparkTick: React.CSSProperties = { width: 12, fontSize: 10, opacity: 0.65, textAlign: 'center' }
const sparkTickBlank: React.CSSProperties = { width: 12 }

const srcRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 2.2fr auto', gap: 10, alignItems: 'center' }
const srcName: React.CSSProperties = { fontWeight: 950, opacity: 0.9, fontSize: 12 }
const srcBarWrap: React.CSSProperties = {
  height: 10,
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.10)',
  background: 'rgba(255,255,255,0.04)',
  overflow: 'hidden',
}
const srcBar: React.CSSProperties = { height: '100%', borderRadius: 999, background: 'rgba(0,255,255,0.32)' }
const srcNum: React.CSSProperties = { fontWeight: 1100, opacity: 0.9, fontSize: 12 }

const tableWrap: React.CSSProperties = { marginTop: 12, overflowX: 'auto' }
const table: React.CSSProperties = { width: '100%', minWidth: 700, borderCollapse: 'separate', borderSpacing: 0 }
const th: React.CSSProperties = {
  textAlign: 'left',
  fontWeight: 1100,
  fontSize: 12,
  letterSpacing: 0.45,
  textTransform: 'uppercase',
  padding: '12px 10px',
  color: 'rgba(200,255,255,0.95)',
  borderBottom: '1px solid rgba(0,255,255,0.18)',
  whiteSpace: 'nowrap',
}
const thRight: React.CSSProperties = { ...th, textAlign: 'right' }
const td: React.CSSProperties = {
  padding: '10px 10px',
  borderBottom: '1px solid rgba(255,255,255,0.07)',
  fontWeight: 900,
  whiteSpace: 'nowrap',
}
const tdRight: React.CSSProperties = { ...td, textAlign: 'right' }

const pill: React.CSSProperties = {
  display: 'inline-flex',
  padding: '4px 10px',
  borderRadius: 999,
  background: 'rgba(0,255,255,0.10)',
  border: '1px solid rgba(0,255,255,0.30)',
  fontWeight: 1000,
}

const scorePill: React.CSSProperties = {
  display: 'inline-flex',
  padding: '4px 10px',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.14)',
  fontWeight: 1100,
}

const actionRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '10px 12px',
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,0.10)',
  background: 'rgba(0,0,0,0.18)',
}
const actionLabel: React.CSSProperties = { fontWeight: 950, opacity: 0.9 }
const actionValue: React.CSSProperties = { fontWeight: 1200 }

/* -------------------- small responsiveness -------------------- */
const mq = typeof window !== 'undefined' ? window.innerWidth : 1200
if (mq && mq < 1100) {
  kpiRow.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))'
  grid.gridTemplateColumns = '1fr'
  subGrid.gridTemplateColumns = '1fr'
}
