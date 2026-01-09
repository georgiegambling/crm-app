'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type ViewMode = 'TEAM' | 'MINE'

type SalesReportRow = {
  id: number
  report_ref: string
  report_date: string
  client_name: string | null
  campaign_name: string | null
  sale_price: number | null
  records_sent: number | null
  sales_rep: string | null // legacy/manual fallback (optional)
  rep_user_id: string | null
  profiles: {
    display_name: string | null
    email: string | null
  } | null
}

type NewSaleForm = {
  report_ref: string
  report_date: string
  client_name: string
  campaign_name: string
  sale_price: string
  records_sent: string
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function makeReportRef() {
  // SR-20260109-4832
  const d = new Date()
  const y = d.getFullYear()
  const m = pad2(d.getMonth() + 1)
  const day = pad2(d.getDate())
  const rnd = Math.floor(1000 + Math.random() * 9000)
  return `SR-${y}${m}${day}-${rnd}`
}

function toCsv(rows: SalesReportRow[]) {
  const header = ['Ref', 'Date', 'Client', 'Campaign', 'Sale (£)', 'Records', 'Rep Name', 'Rep Email']
  const escape = (v: unknown) => {
    const s = String(v ?? '')
    // wrap if contains comma, quote, newline
    if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [
    header.join(','),
    ...rows.map((r) =>
      [
        r.report_ref,
        new Date(r.report_date).toISOString(),
        r.client_name ?? '',
        r.campaign_name ?? '',
        r.sale_price ?? '',
        r.records_sent ?? '',
        r.profiles?.display_name ?? r.sales_rep ?? '',
        r.profiles?.email ?? '',
      ]
        .map(escape)
        .join(',')
    ),
  ]
  return lines.join('\n')
}

function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function StaffReportsPage() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [rows, setRows] = useState<SalesReportRow[]>([])
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<ViewMode>('TEAM')
  const [userId, setUserId] = useState<string | null>(null)

  // Modal state
  const [openAdd, setOpenAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<NewSaleForm>(() => ({
    report_ref: makeReportRef(),
    report_date: new Date().toISOString(),
    client_name: '',
    campaign_name: '',
    sale_price: '',
    records_sent: '',
  }))

  // Get logged-in user once (needed for "My Reports" and add/delete)
  useEffect(() => {
    ;(async () => {
      const { data } = await supabase.auth.getUser()
      setUserId(data?.user?.id ?? null)
    })()
  }, [])

  const fetchReports = async () => {
    setErrorMsg(null)
    setSuccessMsg(null)

    // One query shape only (includes profiles)
    let q = supabase
      .from('sales_reports')
      .select(
        `
        id,
        report_ref,
        report_date,
        client_name,
        campaign_name,
        sale_price,
        records_sent,
        sales_rep,
        rep_user_id,
        profiles (
          display_name,
          email
        )
      `
      )
      .order('report_date', { ascending: false })

    // Personal view
    if (mode === 'MINE' && userId) {
      q = q.eq('rep_user_id', userId)
    }

    const { data, error } = await q

    if (error) {
      setErrorMsg(error.message)
      setRows([])
      return
    }

   const safeRows: SalesReportRow[] = (data ?? []) as unknown as SalesReportRow[]
setRows(safeRows)

  }

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      await fetchReports()
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, userId])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchReports()
    setRefreshing(false)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows

    return rows.filter((r) =>
      [
        r.report_ref,
        r.client_name ?? '',
        r.campaign_name ?? '',
        r.profiles?.display_name ?? '',
        r.profiles?.email ?? '',
        r.sales_rep ?? '',
        String(r.sale_price ?? ''),
        String(r.records_sent ?? ''),
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [rows, query])

  const repLabel = (r: SalesReportRow) => {
    return r.profiles?.display_name || r.profiles?.email || r.sales_rep || '—'
  }

  const canDelete = (r: SalesReportRow) => {
    // “They can delete their own”
    return !!userId && r.rep_user_id === userId
  }

  const openAddModal = () => {
    setErrorMsg(null)
    setSuccessMsg(null)
    setForm({
      report_ref: makeReportRef(),
      report_date: new Date().toISOString(),
      client_name: '',
      campaign_name: '',
      sale_price: '',
      records_sent: '',
    })
    setOpenAdd(true)
  }

  const closeAddModal = () => {
    if (saving) return
    setOpenAdd(false)
  }

  const saveSale = async () => {
    setErrorMsg(null)
    setSuccessMsg(null)

    if (!userId) {
      setErrorMsg('You must be logged in to add a sale.')
      return
    }

    const client_name = form.client_name.trim()
    const campaign_name = form.campaign_name.trim()
    const report_ref = form.report_ref.trim() || makeReportRef()

    if (!client_name) return setErrorMsg('Client name is required.')
    if (!campaign_name) return setErrorMsg('Campaign name is required.')

    // Safe numeric parsing
    const sale_price =
      form.sale_price.trim() === '' ? null : Number(String(form.sale_price).replace(/,/g, ''))
    const records_sent =
      form.records_sent.trim() === '' ? null : Number(String(form.records_sent).replace(/,/g, ''))

    if (sale_price !== null && (Number.isNaN(sale_price) || sale_price < 0)) {
      return setErrorMsg('Sale price must be a valid number.')
    }
    if (records_sent !== null && (Number.isNaN(records_sent) || records_sent < 0)) {
      return setErrorMsg('Records sent must be a valid number.')
    }

    const report_date = form.report_date ? new Date(form.report_date).toISOString() : new Date().toISOString()

    setSaving(true)
    const { error } = await supabase.from('sales_reports').insert({
      report_ref,
      report_date,
      client_name,
      campaign_name,
      sale_price,
      records_sent,
      rep_user_id: userId,
      // sales_rep left null (legacy fallback); profiles is derived from rep_user_id relation
    })
    setSaving(false)

    if (error) {
      setErrorMsg(error.message)
      return
    }

    setOpenAdd(false)
    setSuccessMsg('Sale added.')
    await fetchReports()
  }

  const deleteSale = async (r: SalesReportRow) => {
    setErrorMsg(null)
    setSuccessMsg(null)

    if (!canDelete(r)) {
      setErrorMsg('You can only delete your own sales reports.')
      return
    }

    const ok = window.confirm(`Delete report ${r.report_ref}? This cannot be undone.`)
    if (!ok) return

    const { error } = await supabase.from('sales_reports').delete().eq('id', r.id)

    if (error) {
      setErrorMsg(error.message)
      return
    }

    setSuccessMsg('Deleted.')
    await fetchReports()
  }

  const exportCsv = () => {
    const now = new Date()
    const name = `sales-reports_${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}.csv`
    const csv = toCsv(filtered)
    downloadText(name, csv, 'text/csv;charset=utf-8')
  }

  return (
    <div style={page}>
      <div style={bgGlowTop} />
      <div style={bgGlowBottom} />

      <div style={container}>
        <div style={headerCard}>
          <div style={{ minWidth: 240 }}>
            <div style={h1}>Sales Reports</div>
            <div style={sub}>Staff-only internal reporting (clients cannot access).</div>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'flex-end',
            }}
          >
            {/* Team / My tabs */}
            <div style={tabWrap}>
              <button
                style={mode === 'TEAM' ? tabBtnActive : tabBtn}
                onClick={() => setMode('TEAM')}
                title="See all staff reports"
              >
                Team Reports
              </button>
              <button
                style={mode === 'MINE' ? tabBtnActive : tabBtn}
                onClick={() => setMode('MINE')}
                disabled={!userId}
                aria-disabled={!userId}
                title={!userId ? 'Login required' : 'See only your reports'}
              >
                My Reports
              </button>
            </div>

            <input
              style={search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ref, client, campaign, rep…"
            />

            <button style={btn} onClick={openAddModal} disabled={!userId} aria-disabled={!userId} title={!userId ? 'Login required' : 'Add a sale'}>
              + Add Sale
            </button>

            <button style={btn} onClick={exportCsv} title="Download CSV">
              ⭳ Export
            </button>

            <button
              style={btn}
              onClick={handleRefresh}
              disabled={refreshing}
              aria-disabled={refreshing}
              title="Refresh"
            >
              {refreshing ? 'Refreshing…' : '↻ Refresh'}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div style={errorBar}>
            <b>Error:</b> {errorMsg}
          </div>
        )}

        {successMsg && (
          <div style={successBar}>
            <b>Done:</b> {successMsg}
          </div>
        )}

        <div style={panel}>
          <div style={panelTop}>
            <div style={{ fontWeight: 950 }}>{mode === 'MINE' ? 'My Reports' : 'Team Reports'}</div>
            <div style={{ opacity: 0.8, fontWeight: 900 }}>{filtered.length} shown</div>
          </div>

          {loading ? (
            <div style={empty}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={empty}>{mode === 'MINE' ? 'No personal reports yet.' : 'No reports yet.'}</div>
          ) : (
            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Ref</th>
                    <th style={th}>Date</th>
                    <th style={th}>Client</th>
                    <th style={th}>Campaign</th>
                    <th style={thRight}>Sale (£)</th>
                    <th style={thRight}>Records</th>
                    <th style={th}>Rep</th>
                    <th style={thRight}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    const delOk = canDelete(r)
                    return (
                      <tr
                        key={r.id}
                        style={{
                          ...tr,
                          background: i % 2 === 0 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.03)',
                        }}
                      >
                        <td style={tdMono}>
                          <span style={pill}>{r.report_ref}</span>
                        </td>
                        <td style={td}>{new Date(r.report_date).toLocaleString()}</td>
                        <td style={td}>{r.client_name || '—'}</td>
                        <td style={td}>{r.campaign_name || '—'}</td>
                        <td style={tdRight}>{r.sale_price ?? '—'}</td>
                        <td style={tdRight}>{r.records_sent ?? '—'}</td>
                        <td style={td}>{repLabel(r)}</td>

                        <td style={tdRight}>
                          <button
                            style={delOk ? dangerBtn : dangerBtnDisabled}
                            onClick={() => deleteSale(r)}
                            disabled={!delOk}
                            aria-disabled={!delOk}
                            title={delOk ? 'Delete this report' : 'You can only delete your own reports'}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ height: 40 }} />
      </div>

      {/* ---- Add Sale Modal ---- */}
      {openAdd && (
        <div style={modalOverlay} onMouseDown={closeAddModal}>
          <div style={modalCard} onMouseDown={(e) => e.stopPropagation()}>
            <div style={modalTop}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 1000 }}>Add Sale</div>
                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
                  Creates a sales report row (linked to your user).
                </div>
              </div>

              <button style={iconBtn} onClick={closeAddModal} disabled={saving} aria-disabled={saving} title="Close">
                ✕
              </button>
            </div>

            <div style={formGrid}>
              <label style={label}>
                <div style={labelTop}>Report Ref</div>
                <input
                  style={input}
                  value={form.report_ref}
                  onChange={(e) => setForm((p) => ({ ...p, report_ref: e.target.value }))}
                  placeholder="SR-YYYYMMDD-1234"
                />
              </label>

              <label style={label}>
                <div style={labelTop}>Report Date</div>
                <input
                  style={input}
                  value={form.report_date}
                  onChange={(e) => setForm((p) => ({ ...p, report_date: e.target.value }))}
                  placeholder="ISO string or leave as default"
                />
                <div style={hint}>Tip: leave it as-is unless you’re backdating.</div>
              </label>

              <label style={label}>
                <div style={labelTop}>Client Name *</div>
                <input
                  style={input}
                  value={form.client_name}
                  onChange={(e) => setForm((p) => ({ ...p, client_name: e.target.value }))}
                  placeholder="e.g. SolarCo Ltd"
                />
              </label>

              <label style={label}>
                <div style={labelTop}>Campaign Name *</div>
                <input
                  style={input}
                  value={form.campaign_name}
                  onChange={(e) => setForm((p) => ({ ...p, campaign_name: e.target.value }))}
                  placeholder="e.g. ASHP Jan"
                />
              </label>

              <label style={label}>
                <div style={labelTop}>Sale Price (£)</div>
                <input
                  style={input}
                  inputMode="decimal"
                  value={form.sale_price}
                  onChange={(e) => setForm((p) => ({ ...p, sale_price: e.target.value }))}
                  placeholder="e.g. 2500"
                />
              </label>

              <label style={label}>
                <div style={labelTop}>Records Sent</div>
                <input
                  style={input}
                  inputMode="numeric"
                  value={form.records_sent}
                  onChange={(e) => setForm((p) => ({ ...p, records_sent: e.target.value }))}
                  placeholder="e.g. 500"
                />
              </label>
            </div>

            {errorMsg && (
              <div style={{ ...errorBar, marginTop: 12 }}>
                <b>Error:</b> {errorMsg}
              </div>
            )}

            <div style={modalActions}>
              <button style={btnGhost} onClick={closeAddModal} disabled={saving} aria-disabled={saving}>
                Cancel
              </button>
              <button style={btnPrimary} onClick={saveSale} disabled={saving} aria-disabled={saving}>
                {saving ? 'Saving…' : 'Save Sale'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---- styles (match your CRM vibe) ---- */

const page: React.CSSProperties = {
  minHeight: '100vh',
  background:
    'radial-gradient(1200px 600px at 50% 0%, rgba(0,255,255,0.08), transparent 55%), linear-gradient(180deg, #020B22 0%, #01071A 45%, #01051A 100%)',
  color: '#fff',
  fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  position: 'relative',
  overflowX: 'hidden',
}

const bgGlowTop: React.CSSProperties = {
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

const bgGlowBottom: React.CSSProperties = {
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

const container: React.CSSProperties = {
  maxWidth: 1600,
  margin: '0 auto',
  padding: '28px 16px',
  position: 'relative',
}

const headerCard: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 14,
  flexWrap: 'wrap',
  alignItems: 'center',
  padding: 16,
  borderRadius: 18,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))',
  border: '1px solid rgba(0,255,255,0.22)',
  boxShadow: '0 20px 70px rgba(0,0,0,0.55), 0 0 40px rgba(0,255,255,0.1)',
}

const h1: React.CSSProperties = { fontSize: 20, fontWeight: 1000 }
const sub: React.CSSProperties = { marginTop: 4, fontSize: 12.5, opacity: 0.75, fontWeight: 800 }

const tabWrap: React.CSSProperties = {
  display: 'inline-flex',
  gap: 8,
  padding: 6,
  borderRadius: 999,
  background: 'rgba(0,0,0,0.25)',
  border: '1px solid rgba(0,255,255,0.18)',
}

const tabBtn: React.CSSProperties = {
  padding: '9px 12px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.05)',
  color: '#fff',
  fontWeight: 950,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const tabBtnActive: React.CSSProperties = {
  ...tabBtn,
  border: '1px solid rgba(0,255,255,0.45)',
  background: 'rgba(0,255,255,0.12)',
  boxShadow: '0 0 18px rgba(0,255,255,0.1)',
}

const search: React.CSSProperties = {
  width: 360,
  maxWidth: '90vw',
  padding: '10px 12px',
  borderRadius: 999,
  background: 'rgba(0,0,0,0.35)',
  border: '1px solid rgba(0,255,255,0.2)',
  color: '#fff',
  outline: 'none',
  fontWeight: 900,
}

const btn: React.CSSProperties = {
  height: 38,
  padding: '0 12px',
  borderRadius: 12,
  fontWeight: 950,
  cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.06)',
  color: '#fff',
}

const errorBar: React.CSSProperties = {
  marginTop: 14,
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(255,40,40,0.12)',
  border: '1px solid rgba(255,40,40,0.28)',
  fontWeight: 900,
}

const successBar: React.CSSProperties = {
  marginTop: 14,
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(0,255,180,0.10)',
  border: '1px solid rgba(0,255,180,0.22)',
  fontWeight: 900,
}

const panel: React.CSSProperties = {
  marginTop: 16,
  borderRadius: 18,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))',
  border: '1px solid rgba(0,255,255,0.25)',
  boxShadow: '0 20px 70px rgba(0,0,0,0.55)',
  overflow: 'hidden',
}

const panelTop: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '14px 16px',
  borderBottom: '1px solid rgba(0,255,255,0.18)',
  background: 'rgba(0,0,0,0.18)',
}

const empty: React.CSSProperties = { padding: 16, fontWeight: 900, opacity: 0.85 }

const tableWrap: React.CSSProperties = { width: '100%', overflowX: 'auto' }
const table: React.CSSProperties = { width: '100%', minWidth: 1120, borderCollapse: 'separate', borderSpacing: 0 }

const th: React.CSSProperties = {
  textAlign: 'left',
  fontWeight: 1000,
  fontSize: 12,
  letterSpacing: 0.45,
  textTransform: 'uppercase',
  padding: '14px 12px',
  color: 'rgba(200,255,255,0.95)',
  background: 'rgba(0,0,0,0.25)',
  borderBottom: '1px solid rgba(0,255,255,0.22)',
  whiteSpace: 'nowrap',
}
const thRight: React.CSSProperties = { ...th, textAlign: 'right' }

const tr: React.CSSProperties = {}
const td: React.CSSProperties = {
  padding: '10px 12px',
  borderBottom: '1px solid rgba(255,255,255,0.07)',
  fontWeight: 900,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}
const tdRight: React.CSSProperties = { ...td, textAlign: 'right' }
const tdMono: React.CSSProperties = { ...td, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }

const pill: React.CSSProperties = {
  display: 'inline-flex',
  padding: '4px 10px',
  borderRadius: 999,
  background: 'rgba(0,255,255,0.1)',
  border: '1px solid rgba(0,255,255,0.3)',
  fontWeight: 1000,
}

const dangerBtn: React.CSSProperties = {
  height: 34,
  padding: '0 12px',
  borderRadius: 12,
  fontWeight: 950,
  cursor: 'pointer',
  border: '1px solid rgba(255,90,90,0.35)',
  background: 'rgba(255,70,70,0.12)',
  color: '#fff',
}

const dangerBtnDisabled: React.CSSProperties = {
  ...dangerBtn,
  opacity: 0.45,
  cursor: 'not-allowed',
}

/* ---- modal styles ---- */

const modalOverlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.62)',
  backdropFilter: 'blur(6px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 14,
  zIndex: 50,
}

const modalCard: React.CSSProperties = {
  width: 'min(820px, 96vw)',
  borderRadius: 18,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))',
  border: '1px solid rgba(0,255,255,0.25)',
  boxShadow: '0 30px 90px rgba(0,0,0,0.65)',
  overflow: 'hidden',
}

const modalTop: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  padding: '14px 16px',
  borderBottom: '1px solid rgba(0,255,255,0.18)',
  background: 'rgba(0,0,0,0.18)',
}

const iconBtn: React.CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 12,
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.06)',
  color: '#fff',
  cursor: 'pointer',
  fontWeight: 1000,
}

const formGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 12,
  padding: 16,
}

const label: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
}

const labelTop: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 1000,
  opacity: 0.9,
  letterSpacing: 0.2,
}

const input: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 12,
  background: 'rgba(0,0,0,0.35)',
  border: '1px solid rgba(0,255,255,0.2)',
  color: '#fff',
  outline: 'none',
  fontWeight: 900,
}

const hint: React.CSSProperties = {
  marginTop: 2,
  fontSize: 11.5,
  opacity: 0.7,
  fontWeight: 800,
}

const modalActions: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
  padding: 16,
  borderTop: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(0,0,0,0.12)',
}

const btnGhost: React.CSSProperties = {
  height: 38,
  padding: '0 12px',
  borderRadius: 12,
  fontWeight: 950,
  cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.04)',
  color: '#fff',
}

const btnPrimary: React.CSSProperties = {
  height: 38,
  padding: '0 12px',
  borderRadius: 12,
  fontWeight: 1000,
  cursor: 'pointer',
  border: '1px solid rgba(0,255,255,0.35)',
  background: 'rgba(0,255,255,0.14)',
  color: '#fff',
}
