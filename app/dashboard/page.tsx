'use client'

import React, { CSSProperties, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

type Lead = {
  id: string
  lead_ref: string | null
  full_name: string
  phone: string
  email: string
  status: string
  source: string
  assigned_to: string | null
  created_at: string
  notes: string | null
}

/**
 * ✅ Make sure these statuses exist in your CRM (or at least the ones you use).
 * We include "Do Not Call" because you asked for it in KPI logic.
 */
const STATUS_ORDER = [
  'New Lead',
  'Contacted',
  'Qualified',
  'Pending Photos',
  'Sent To Client',
  'Looking for home',
  'Callback',
  'Voicemail',
  'No Answer',
  'VM 5+ days',
  'NA 5+ days',
  'Not Interested',
  'Boiler Above 86%',
  'No Benefits',
  'Dead Number',
  'Do Not Call',
] as const

/**
 * ✅ KPI DEFINITIONS (as per your message)
 *
 * Contact Rate statuses (the screenshot list):
 * Contacted, Qualified, Pending Photos, Sent To Client, Looking for home, Callback,
 * Boiler Above 86%, No Benefits, Dead Number, Not Interested
 */
const CONTACT_RATE_STATUSES = new Set([
  'Contacted',
  'Qualified',
  'Pending Photos',
  'Sent To Client',
  'Looking for home',
  'Callback',
  'Boiler Above 86%',
  'No Benefits',
  'Dead Number',
  'Not Interested',
])

/**
 * Qualification Rate:
 * Sent To Client OR Looking for home OR Qualified
 */
const QUALIFICATION_RATE_STATUSES = new Set(['Sent To Client', 'Looking for home', 'Qualified'])

/**
 * Drop-off Rate:
 * VM 5+ days, NA 5+ days, Not Interested, Boiler Above 86%, No Benefits, Do Not Call
 */
const DROP_OFF_STATUSES = new Set(['VM 5+ days', 'NA 5+ days', 'Not Interested', 'Boiler Above 86%', 'No Benefits', 'Do Not Call'])

/**
 * Pipeline Health → "Stale leads" =
 * (New Lead older than 7 days) OR (any DROP_OFF_STATUSES)
 */
const PIPELINE_STALE_DAYS = 7

/**
 * Pipeline score weights (can tweak later)
 * - Keep it simple but meaningful for now.
 */
const PIPELINE_POINTS: Record<string, number> = {
  'New Lead': 1,
  Contacted: 3,
  Qualified: 5,
  'Pending Photos': 6,
  'Sent To Client': 9,
  'Looking for home': 7,
  Callback: 2,
  Voicemail: 1,
  'No Answer': 1,
  'VM 5+ days': 0,
  'NA 5+ days': 0,
  'Not Interested': 0,
  'No Benefits': 0,
  'Dead Number': 0,
  'Boiler Above 86%': 0,
  'Do Not Call': 0,
}

function startOfDay(d = new Date()) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}
function fmtPct(v: number) {
  if (!isFinite(v)) return '0%'
  return `${Math.round(v * 100)}%`
}
function fmtInt(n: number) {
  return new Intl.NumberFormat().format(n)
}

export default function DashboardPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [range, setRange] = useState<'7d' | '30d' | 'all'>('30d')

  // UI scale so it feels “premium” at 100% zoom
  const UI_SCALE = 0.92

  const timeMinISO = useMemo(() => {
    if (range === 'all') return null
    const from = range === '7d' ? daysAgo(7) : daysAgo(30)
    return from.toISOString()
  }, [range])

  const fetchLeads = async () => {
    setErrorMsg(null)
    setLoading(true)

    let q = supabase
      .from('leads')
      .select('id, lead_ref, full_name, phone, email, status, source, assigned_to, created_at, notes')
      .order('created_at', { ascending: false })

    if (timeMinISO) q = q.gte('created_at', timeMinISO)

    const { data, error } = await q
    if (error) {
      setErrorMsg(error.message)
      setLeads([])
      setLoading(false)
      return
    }

    setLeads((data || []) as Lead[])
    setLoading(false)
  }

  useEffect(() => {
    fetchLeads()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeMinISO])

  // =========================
  // Derived KPIs
  // =========================
  const total = leads.length

  const todayCount = useMemo(() => {
    const s = startOfDay().getTime()
    return leads.filter((l) => new Date(l.created_at).getTime() >= s).length
  }, [leads])

  const contactedCount = useMemo(() => leads.filter((l) => CONTACT_RATE_STATUSES.has((l.status || '').trim())).length, [leads])

  const qualifiedCount = useMemo(
    () => leads.filter((l) => QUALIFICATION_RATE_STATUSES.has((l.status || '').trim())).length,
    [leads]
  )

  const sentCount = useMemo(() => leads.filter((l) => (l.status || '').trim() === 'Sent To Client').length, [leads])
  const lookingCount = useMemo(() => leads.filter((l) => (l.status || '').trim() === 'Looking for home').length, [leads])

  const dropOffCount = useMemo(() => leads.filter((l) => DROP_OFF_STATUSES.has((l.status || '').trim())).length, [leads])

  // ✅ Rates (based on YOUR rules)
  const contactRate = total ? contactedCount / total : 0
  const qualificationRate = total ? qualifiedCount / total : 0
  const dropOffRate = total ? dropOffCount / total : 0

  // ✅ "Send rate" now makes sense: Sent To Client as % of Qualified bucket
  const sendRate = qualifiedCount ? sentCount / qualifiedCount : 0

  // =========================
  // Pipeline Health: stale leads (your rule)
  // =========================
  const staleCount = useMemo(() => {
    const cutoff = daysAgo(PIPELINE_STALE_DAYS).getTime()

    const staleNew = leads.filter((l) => (l.status || '').trim() === 'New Lead' && new Date(l.created_at).getTime() < cutoff).length
    const staleBad = leads.filter((l) => DROP_OFF_STATUSES.has((l.status || '').trim())).length

    return staleNew + staleBad
  }, [leads])

  // Other health helpers
  const callbackCount = useMemo(() => leads.filter((l) => (l.status || '').trim().toLowerCase() === 'callback').length, [leads])
  const vm5 = useMemo(() => leads.filter((l) => (l.status || '').trim() === 'VM 5+ days').length, [leads])
  const na5 = useMemo(() => leads.filter((l) => (l.status || '').trim() === 'NA 5+ days').length, [leads])

  // Weighted pipeline score
  const pipelineScore = useMemo(() => {
    const score = leads.reduce((sum, l) => sum + (PIPELINE_POINTS[(l.status || '').trim()] ?? 0), 0)
    const max = total * 9
    const pct = max ? score / max : 0
    return { score, pct }
  }, [leads, total])

  // Counts by status (for funnel cards)
  const statusCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const s of STATUS_ORDER) m[s] = 0
    for (const l of leads) {
      const s = (l.status || '').trim()
      if (!s) continue
      m[s] = (m[s] || 0) + 1
    }
    return m
  }, [leads])

  const sourceCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const l of leads) {
      const s = (l.source || 'Other').trim() || 'Other'
      m[s] = (m[s] || 0) + 1
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [leads])

  const assigneeStats = useMemo(() => {
    const m: Record<string, { name: string; total: number; qualified: number; sent: number; pipeline: number }> = {}
    for (const l of leads) {
      const a = (l.assigned_to || 'Unassigned').trim() || 'Unassigned'
      if (!m[a]) m[a] = { name: a, total: 0, qualified: 0, sent: 0, pipeline: 0 }
      m[a].total += 1
      if (QUALIFICATION_RATE_STATUSES.has((l.status || '').trim())) m[a].qualified += 1
      if ((l.status || '').trim() === 'Sent To Client') m[a].sent += 1
      m[a].pipeline += PIPELINE_POINTS[(l.status || '').trim()] ?? 0
    }
    return Object.values(m).sort((a, b) => b.pipeline - a.pipeline).slice(0, 8)
  }, [leads])

  // Trend: last 14 days (created)
  const trend = useMemo(() => {
    const days = 14
    const map: Record<string, number> = {}
    for (let i = days - 1; i >= 0; i--) {
      const d = startOfDay(daysAgo(i))
      const key = d.toISOString().slice(0, 10)
      map[key] = 0
    }
    for (const l of leads) {
      const key = startOfDay(new Date(l.created_at)).toISOString().slice(0, 10)
      if (key in map) map[key] += 1
    }
    const labels = Object.keys(map)
    const values = labels.map((k) => map[k])
    const max = Math.max(1, ...values)
    return { labels, values, max }
  }, [leads])

  // =========================
  // UI
  // =========================
  return (
    <div style={page}>
      <Sidebar />

      <div style={bgGlowTop} />
      <div style={bgGlowBottom} />

      <div style={{ ...container, transform: `scale(${UI_SCALE})`, transformOrigin: 'top center' }}>
        <div style={wrap}>
          {/* Top Bar */}
          <div style={topBar}>
            <div style={titleBlock}>
              <div style={pill}>ECO4 • Lead Gen Dashboard</div>
              <div style={h1}>Command Centre</div>
              <div style={sub}>Volume, workflow, conversion — all in one view.</div>
            </div>

            <div style={topRight}>
              <div style={seg}>
                <button style={range === '7d' ? segBtnOn : segBtn} onClick={() => setRange('7d')}>
                  7D
                </button>
                <button style={range === '30d' ? segBtnOn : segBtn} onClick={() => setRange('30d')}>
                  30D
                </button>
                <button style={range === 'all' ? segBtnOn : segBtn} onClick={() => setRange('all')}>
                  ALL
                </button>
              </div>

              <button style={btnSm} onClick={fetchLeads} disabled={loading}>
                {loading ? 'Loading…' : '↻ Refresh'}
              </button>

              <button style={btnPrimary} onClick={() => router.push('/leads')}>
                Open Leads →
              </button>
            </div>
          </div>

          {errorMsg && (
            <div style={errorBar}>
              <b>Supabase error:</b>&nbsp;{errorMsg}
            </div>
          )}

          {/* Row 1 */}
          <div style={grid5}>
            <KPI title="Total Leads" value={fmtInt(total)} sub={range === 'all' ? 'All time' : `Last ${range}`} />
            <KPI title="Leads Today" value={fmtInt(todayCount)} sub="Created since midnight" />
            <KPI title="Contacted" value={fmtInt(contactedCount)} sub={`Rate: ${fmtPct(contactRate)}`} />
            <KPI title="Qualified" value={fmtInt(qualifiedCount)} sub={`Rate: ${fmtPct(qualificationRate)}`} />
            <KPI title="Stale Leads" value={fmtInt(staleCount)} sub="New 7d+ OR drop-off statuses" />
          </div>

          {/* Row 2 */}
          <div style={grid4}>
            <KPI tone="cyan" title="Contact Rate" value={fmtPct(contactRate)} sub={`${fmtInt(contactedCount)} in contact statuses`} />
            <KPI tone="green" title="Qualification Rate" value={fmtPct(qualificationRate)} sub={`${fmtInt(qualifiedCount)} qualified bucket`} />
            <KPI tone="blue" title="Send Rate" value={fmtPct(sendRate)} sub={`${fmtInt(sentCount)} sent (of qualified)`} />
            <KPI tone="red" title="Drop-off Rate" value={fmtPct(dropOffRate)} sub={`${fmtInt(dropOffCount)} in drop-off statuses`} />
          </div>

          {/* Row 3 */}
          <div style={grid2}>
            <div style={panel}>
              <div style={panelHead}>
                <div style={panelTitle}>Pipeline Funnel</div>
                <div style={panelHint}>Live counts by key stages</div>
              </div>

              <div style={funnelRow}>
                <FunnelBox label="New Lead" value={statusCounts['New Lead'] || 0} />
                <FunnelBox label="Contacted" value={statusCounts['Contacted'] || 0} />
                <FunnelBox label="Qualified" value={statusCounts['Qualified'] || 0} />
                <FunnelBox label="Pending Photos" value={statusCounts['Pending Photos'] || 0} />
                <FunnelBox label="Sent To Client" value={statusCounts['Sent To Client'] || 0} />
                <FunnelBox label="Looking for home" value={statusCounts['Looking for home'] || 0} />
              </div>

              <div style={miniNote}>
                Your KPI rules: <b>Contact</b> uses your dropdown statuses • <b>Qualification</b> = Qualified/Sent/Looking •{' '}
                <b>Drop-off</b> = VM5/NA5/NI/Boiler/NoBenefits/DNC
              </div>
            </div>

            <div style={panel}>
              <div style={panelHead}>
                <div style={panelTitle}>Pipeline Health</div>
                <div style={panelHint}>Weighted score from current statuses</div>
              </div>

              <div style={healthWrap}>
                <div style={healthBig}>{fmtPct(pipelineScore.pct)}</div>
                <div style={healthSub}>
                  Score: <b>{fmtInt(pipelineScore.score)}</b> / {fmtInt(total * 9)}
                </div>

                <div style={barTrack}>
                  <div style={{ ...barFill, width: `${Math.max(2, Math.round(pipelineScore.pct * 100))}%` }} />
                </div>

                <div style={riskGrid}>
                  <RiskItem label="Stale Leads" value={staleCount} hint="New Lead 7d+ OR drop-off statuses" />
                  <RiskItem label="Callbacks" value={callbackCount} hint="Status: Callback" />
                  <RiskItem label="VM 5+ days" value={vm5} hint="Drop-off bucket" />
                  <RiskItem label="NA 5+ days" value={na5} hint="Drop-off bucket" />
                </div>
              </div>
            </div>
          </div>

          {/* Row 4 */}
          <div style={grid2}>
            <div style={panel}>
              <div style={panelHead}>
                <div style={panelTitle}>Lead Trend</div>
                <div style={panelHint}>Last 14 days (created)</div>
              </div>

              <div style={trendWrap}>
                {trend.values.map((v, idx) => {
                  const h = Math.round((v / trend.max) * 100)
                  return (
                    <div key={trend.labels[idx]} style={trendCol} title={`${trend.labels[idx]}: ${v}`}>
                      <div style={{ ...trendBar, height: `${h}%` }} />
                      <div style={trendLabel}>{trend.labels[idx].slice(5)}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={panel}>
              <div style={panelHead}>
                <div style={panelTitle}>Top Sources</div>
                <div style={panelHint}>Where leads are coming from</div>
              </div>

              <div style={{ padding: 14 }}>
                {sourceCounts.length === 0 ? (
                  <div style={empty}>No source data yet.</div>
                ) : (
                  sourceCounts.map(([name, count]) => {
                    const pct = total ? count / total : 0
                    return (
                      <div key={name} style={sourceRow}>
                        <div style={sourceLeft}>
                          <div style={sourceName}>{name}</div>
                          <div style={sourceSmall}>{fmtInt(count)} leads</div>
                        </div>
                        <div style={sourceRight}>
                          <div style={sourcePct}>{fmtPct(pct)}</div>
                          <div style={barTrackSmall}>
                            <div style={{ ...barFillSmall, width: `${Math.max(2, Math.round(pct * 100))}%` }} />
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {/* Row 5 */}
          <div style={panel}>
            <div style={panelHead}>
              <div style={panelTitle}>Assignee Leaderboard</div>
              <div style={panelHint}>Sorted by weighted pipeline score</div>
            </div>

            <div style={{ padding: 14 }}>
              {assigneeStats.length === 0 ? (
                <div style={empty}>No assignee data yet.</div>
              ) : (
                <div style={tableWrap}>
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={th}>Agent</th>
                        <th style={th}>Total</th>
                        <th style={th}>Qualified</th>
                        <th style={th}>Sent</th>
                        <th style={thRight}>Pipeline Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assigneeStats.map((a, i) => (
                        <tr key={a.name} style={{ ...tr, opacity: i === 0 ? 1 : 0.95 }}>
                          <td style={td}>
                            <span style={namePill}>{a.name}</span>
                          </td>
                          <td style={td}>{fmtInt(a.total)}</td>
                          <td style={td}>{fmtInt(a.qualified)}</td>
                          <td style={td}>{fmtInt(a.sent)}</td>
                          <td style={tdRight}>
                            <span style={scorePill}>{fmtInt(a.pipeline)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div style={{ height: 22 }} />
        </div>
      </div>
    </div>
  )
}

/* -----------------------------
   Small components
------------------------------ */

function KPI({
  title,
  value,
  sub,
  tone,
}: {
  title: string
  value: string
  sub?: string
  tone?: 'cyan' | 'green' | 'blue' | 'red'
}) {
  const ring =
    tone === 'green'
      ? 'rgba(140,255,120,0.28)'
      : tone === 'blue'
      ? 'rgba(0,200,255,0.28)'
      : tone === 'red'
      ? 'rgba(255,70,70,0.26)'
      : 'rgba(0,255,255,0.28)'

  return (
    <div style={{ ...kpi, border: `1px solid ${ring}` }}>
      <div style={kpiTitle}>{title}</div>
      <div style={kpiValue}>{value}</div>
      {sub && <div style={kpiSub}>{sub}</div>}
    </div>
  )
}

function FunnelBox({ label, value }: { label: string; value: number }) {
  return (
    <div style={funnelBox}>
      <div style={funnelValue}>{value}</div>
      <div style={funnelLabel}>{label}</div>
    </div>
  )
}

function RiskItem({ label, value, hint }: { label: string; value: number; hint: string }) {
  const hot = value >= 20
  const warm = value >= 10 && value < 20
  return (
    <div
      style={{
        ...riskItem,
        borderColor: hot ? 'rgba(255,70,70,0.35)' : warm ? 'rgba(255,210,90,0.30)' : 'rgba(0,255,255,0.18)',
      }}
    >
      <div style={riskTop}>
        <div style={riskLabel}>{label}</div>
        <div style={riskValue}>{value}</div>
      </div>
      <div style={riskHint}>{hint}</div>
    </div>
  )
}

/* -----------------------------
   Styles (match your CRM vibe)
------------------------------ */

const page: CSSProperties = {
  minHeight: '100vh',
  background:
    'radial-gradient(1200px 600px at 50% 0%, rgba(0,255,255,0.08), transparent 55%), linear-gradient(180deg, #020B22 0%, #01071A 45%, #01051A 100%)',
  color: '#fff',
  fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  fontWeight: 800,
  position: 'relative',
  overflowX: 'hidden',
}

const bgGlowTop: CSSProperties = {
  position: 'absolute',
  top: -220,
  left: '50%',
  transform: 'translateX(-50%)',
  width: 1100,
  height: 450,
  background: 'radial-gradient(circle, rgba(0,255,255,0.18), transparent 30%)',
  filter: 'blur(28px)',
  pointerEvents: 'none',
}

const bgGlowBottom: CSSProperties = {
  position: 'absolute',
  bottom: -260,
  left: '50%',
  transform: 'translateX(-50%)',
  width: 1100,
  height: 520,
  background: 'radial-gradient(circle, rgba(0,200,255,0.14), transparent 65%)',
  filter: 'blur(30px)',
  pointerEvents: 'none',
}

const container: CSSProperties = {
  position: 'relative',
  width: '100%',
  maxWidth: 2400,
  margin: '0 auto',
  padding: '26px 18px',
}

const wrap: CSSProperties = { maxWidth: 1400, margin: '0 auto' }

const topBar: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  gap: 14,
  flexWrap: 'wrap',
  marginBottom: 14,
}

const titleBlock: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }
const pill: CSSProperties = {
  display: 'inline-flex',
  width: 'fit-content',
  padding: '6px 10px',
  borderRadius: 999,
  background: 'rgba(0,255,255,0.10)',
  border: '1px solid rgba(0,255,255,0.28)',
  fontWeight: 1000,
  fontSize: 12,
  letterSpacing: 0.2,
}

const h1: CSSProperties = { fontSize: 26, fontWeight: 1100, letterSpacing: 0.2, lineHeight: 1.05 }
const sub: CSSProperties = { fontSize: 12.5, fontWeight: 900, opacity: 0.75 }

const topRight: CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }

const seg: CSSProperties = {
  display: 'inline-flex',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.05)',
  overflow: 'hidden',
}

const segBtn: CSSProperties = {
  height: 34,
  padding: '0 12px',
  border: 'none',
  background: 'transparent',
  color: 'rgba(255,255,255,0.85)',
  fontWeight: 1000,
  cursor: 'pointer',
}

const segBtnOn: CSSProperties = {
  ...segBtn,
  background: 'rgba(0,255,255,0.14)',
  color: 'rgba(255,255,255,0.98)',
}

const btnSm: CSSProperties = {
  height: 34,
  padding: '0 12px',
  borderRadius: 12,
  fontWeight: 1000,
  fontSize: 12.5,
  cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.06)',
  color: '#fff',
}

const btnPrimary: CSSProperties = {
  ...btnSm,
  height: 38,
  border: '1px solid rgba(0,255,255,0.55)',
  background: 'linear-gradient(135deg, rgba(0,255,255,0.95), rgba(0,140,255,0.90))',
  boxShadow: '0 0 26px rgba(0,255,255,0.18)',
  color: '#001122',
  fontWeight: 1100,
}

const errorBar: CSSProperties = {
  marginTop: 10,
  marginBottom: 10,
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(255,40,40,0.12)',
  border: '1px solid rgba(255,40,40,0.28)',
  color: 'rgba(255,230,230,0.98)',
  fontWeight: 900,
}

const grid5: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
  gap: 12,
  marginTop: 10,
}
const grid4: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 12,
  marginTop: 12,
}
const grid2: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 12,
  marginTop: 12,
}

const panel: CSSProperties = {
  borderRadius: 18,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))',
  border: '1px solid rgba(0,255,255,0.22)',
  boxShadow: '0 20px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,255,255,0.08) inset',
  overflow: 'hidden',
}

const panelHead: CSSProperties = {
  padding: '14px 16px',
  borderBottom: '1px solid rgba(0,255,255,0.16)',
  background: 'rgba(0,0,0,0.18)',
}
const panelTitle: CSSProperties = { fontWeight: 1100, letterSpacing: 0.2 }
const panelHint: CSSProperties = { marginTop: 2, fontSize: 12, fontWeight: 900, opacity: 0.75 }

const kpi: CSSProperties = {
  borderRadius: 18,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))',
  border: '1px solid rgba(0,255,255,0.22)',
  boxShadow: '0 18px 60px rgba(0,0,0,0.40), 0 0 0 1px rgba(0,255,255,0.08) inset',
  padding: 14,
}
const kpiTitle: CSSProperties = { fontSize: 12, fontWeight: 1000, opacity: 0.8 }
const kpiValue: CSSProperties = { marginTop: 8, fontSize: 28, fontWeight: 1200, letterSpacing: 0.2, lineHeight: 1 }
const kpiSub: CSSProperties = { marginTop: 8, fontSize: 12, fontWeight: 900, opacity: 0.75 }

const funnelRow: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, padding: 14 }
const funnelBox: CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(255,255,255,0.10)',
  background: 'rgba(0,0,0,0.18)',
  padding: 12,
}
const funnelValue: CSSProperties = { fontSize: 22, fontWeight: 1200 }
const funnelLabel: CSSProperties = { marginTop: 4, fontSize: 12, fontWeight: 900, opacity: 0.75 }
const miniNote: CSSProperties = { padding: '0 14px 14px 14px', fontSize: 12, fontWeight: 900, opacity: 0.75 }

const healthWrap: CSSProperties = { padding: 14 }
const healthBig: CSSProperties = { fontSize: 44, fontWeight: 1300, letterSpacing: 0.3 }
const healthSub: CSSProperties = { marginTop: 6, fontSize: 12.5, fontWeight: 950, opacity: 0.8 }

const barTrack: CSSProperties = {
  marginTop: 12,
  height: 12,
  borderRadius: 999,
  background: 'rgba(0,0,0,0.35)',
  border: '1px solid rgba(255,255,255,0.10)',
  overflow: 'hidden',
}
const barFill: CSSProperties = {
  height: '100%',
  borderRadius: 999,
  background: 'linear-gradient(90deg, rgba(0,255,255,0.95), rgba(0,140,255,0.95))',
  boxShadow: '0 0 24px rgba(0,255,255,0.22)',
}

const riskGrid: CSSProperties = { marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }
const riskItem: CSSProperties = {
  borderRadius: 14,
  border: '1px solid rgba(0,255,255,0.18)',
  background: 'rgba(0,0,0,0.18)',
  padding: 10,
}
const riskTop: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }
const riskLabel: CSSProperties = { fontSize: 12, fontWeight: 1000, opacity: 0.85 }
const riskValue: CSSProperties = { fontSize: 18, fontWeight: 1200 }
const riskHint: CSSProperties = { marginTop: 6, fontSize: 11.5, fontWeight: 900, opacity: 0.7 }

const trendWrap: CSSProperties = { padding: 14, display: 'grid', gridTemplateColumns: 'repeat(14, 1fr)', gap: 8, alignItems: 'end', height: 220 }
const trendCol: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }
const trendBar: CSSProperties = {
  width: '100%',
  borderRadius: 10,
  background: 'linear-gradient(180deg, rgba(0,255,255,0.90), rgba(0,140,255,0.85))',
  boxShadow: '0 0 22px rgba(0,255,255,0.18)',
  minHeight: 8,
}
const trendLabel: CSSProperties = { fontSize: 10.5, fontWeight: 900, opacity: 0.65 }

const sourceRow: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  padding: '10px 10px',
  borderRadius: 14,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(0,0,0,0.18)',
  marginBottom: 10,
}
const sourceLeft: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 }
const sourceName: CSSProperties = { fontWeight: 1100 }
const sourceSmall: CSSProperties = { fontSize: 12, fontWeight: 900, opacity: 0.72 }
const sourceRight: CSSProperties = { minWidth: 220, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }
const sourcePct: CSSProperties = { fontSize: 12.5, fontWeight: 1100, opacity: 0.9 }
const barTrackSmall: CSSProperties = {
  width: '100%',
  height: 10,
  borderRadius: 999,
  background: 'rgba(0,0,0,0.35)',
  border: '1px solid rgba(255,255,255,0.10)',
  overflow: 'hidden',
}
const barFillSmall: CSSProperties = { height: '100%', borderRadius: 999, background: 'rgba(0,255,255,0.65)' }

const empty: CSSProperties = { padding: 14, fontWeight: 950, opacity: 0.75 }

const tableWrap: CSSProperties = { width: '100%', overflowX: 'auto' }
const table: CSSProperties = { width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }
const th: CSSProperties = {
  textAlign: 'left',
  fontWeight: 1000,
  fontSize: 12,
  letterSpacing: 0.45,
  textTransform: 'uppercase',
  padding: '12px 10px',
  color: 'rgba(200,255,255,0.95)',
  borderBottom: '1px solid rgba(0,255,255,0.18)',
}
const thRight: CSSProperties = { ...th, textAlign: 'right' }
const tr: CSSProperties = {}
const td: CSSProperties = {
  padding: '12px 10px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  fontWeight: 950,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
const tdRight: CSSProperties = { ...td, textAlign: 'right' }

const namePill: CSSProperties = {
  display: 'inline-flex',
  padding: '4px 10px',
  borderRadius: 999,
  border: '1px solid rgba(0,255,255,0.24)',
  background: 'rgba(0,255,255,0.08)',
  fontWeight: 1100,
}
const scorePill: CSSProperties = {
  display: 'inline-flex',
  padding: '4px 10px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.06)',
  fontWeight: 1100,
}
