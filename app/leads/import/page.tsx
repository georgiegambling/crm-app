'use client'

import React, { CSSProperties, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import * as Papa from 'papaparse'
import { supabase } from '@/lib/supabaseClient'
import Sidebar from '@/components/Sidebar'
import { CAMPAIGNS, CampaignKey } from '@/lib/campaignConfig'

type CsvRow = Record<string, unknown>

type LeadInsert = {
  campaign: CampaignKey
  full_name: string
  phone: string
  email?: string | null
  status?: string
  source?: string
  assigned_to?: string | null
  lead_ref?: string | null
}

const REQUIRED_FIELDS = ['full_name', 'phone'] as const

function normKey(k: string) {
  return k.trim().toLowerCase()
}
function cleanText(v: unknown) {
  return (v ?? '').toString().trim()
}
function cleanPhone(v: unknown) {
  const raw = cleanText(v)
  if (!raw) return ''
  return raw.replace(/[^\d+]/g, '')
}
function cleanEmail(v: unknown) {
  return cleanText(v).toLowerCase()
}

function cleanCampaign(v: unknown, fallback: CampaignKey): CampaignKey {
  const raw = cleanText(v).toUpperCase()
  const allowed = Object.keys(CAMPAIGNS) as CampaignKey[]
  if (allowed.includes(raw as CampaignKey)) return raw as CampaignKey
  return fallback
}

export default function LeadsImportPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // ✅ campaign context comes from URL (fallback ECO4)
  const campaign = (searchParams.get('campaign') || 'ECO4') as CampaignKey
  const cfg = CAMPAIGNS[campaign] || CAMPAIGNS.ECO4

  const [fileName, setFileName] = useState<string>('')
  const [rawRows, setRawRows] = useState<CsvRow[]>([])
  const [parseError, setParseError] = useState<string | null>(null)

  const [isImporting, setIsImporting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [importErrors, setImportErrors] = useState<Array<{ row: number; reason: string }>>([])
  const [importResult, setImportResult] = useState<{ inserted: number; failed: number } | null>(null)

  const normalisedRows = useMemo(() => {
    return rawRows.map((r) => {
      const out: CsvRow = {}
      for (const k of Object.keys(r || {})) out[normKey(k)] = (r as any)[k]
      return out
    })
  }, [rawRows])

  const preview = useMemo(() => normalisedRows.slice(0, 10), [normalisedRows])
  const previewCols = useMemo(() => Object.keys(preview[0] ?? {}).slice(0, 10), [preview])

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  function resetStateForNewFile(name?: string) {
    setFileName(name ?? '')
    setParseError(null)
    setImportErrors([])
    setImportResult(null)
    setProgress({ done: 0, total: 0 })
    setRawRows([])
  }

  // ✅ email/status/source optional and get defaults
  function validateAndTransform(rows: CsvRow[]) {
    const leads: LeadInsert[] = []
    const errors: Array<{ row: number; reason: string }> = []
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i

    const allowedStatuses = new Set((cfg.statusOptions || []).map((s) => s.toLowerCase()))

    rows.forEach((r, idx) => {
      const rowNum = idx + 2 // header row is 1

      for (const f of REQUIRED_FIELDS) {
        const val = (r as any)[f]
        if (!val || cleanText(val).length === 0) {
          errors.push({ row: rowNum, reason: `Missing required field: ${f}` })
          return
        }
      }

      const full_name = cleanText((r as any).full_name)
      const phone = cleanPhone((r as any).phone)

      const emailRaw = cleanEmail((r as any).email) // '' if missing/blank
      const statusRaw = cleanText((r as any).status)
      const sourceRaw = cleanText((r as any).source)

      // ✅ only validate email if provided
      if (emailRaw && !emailRegex.test(emailRaw)) {
        errors.push({ row: rowNum, reason: 'Email does not look valid' })
        return
      }

      if (phone.length < 6) {
        errors.push({ row: rowNum, reason: 'Phone looks too short after cleaning' })
        return
      }

      // ✅ status: default + (optional) validate if they provided something weird
      const finalStatus = statusRaw || 'New Lead'
      if (statusRaw && allowedStatuses.size > 0 && !allowedStatuses.has(statusRaw.toLowerCase())) {
        // don’t hard-fail if you don’t want to — but I’m warning because it breaks the UI filters
        errors.push({ row: rowNum, reason: `Status "${statusRaw}" is not in this campaign's statusOptions` })
        return
      }

      const lead: LeadInsert = {
        // ✅ CAMPAIGN: from CSV if present, else URL campaign
        campaign: cleanCampaign((r as any).campaign, campaign),

        full_name,
        phone,

        email: emailRaw ? emailRaw : null,
        status: finalStatus,
        source: sourceRaw || 'CSV Import',

        assigned_to: (r as any).assigned_to ? cleanText((r as any).assigned_to) : null,
        lead_ref: (r as any).lead_ref ? cleanText((r as any).lead_ref) : null,
      }

      leads.push(lead)
    })

    return { leads, errors }
  }

  async function onPickFile(file: File) {
    resetStateForNewFile(file.name)

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'csv') {
      setParseError('Please upload a .csv file (Excel .xlsx won’t work). Save as “CSV UTF-8” and try again.')
      return
    }

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors?.length) {
          setParseError(results.errors[0]?.message || 'Failed to parse CSV')
          return
        }
        const data = (results.data || []).filter(Boolean)
        if (!data.length) {
          setParseError('No rows found in CSV.')
          return
        }
        setRawRows(data)
      },
      error: (err) => setParseError((err as any)?.message || 'Failed to parse CSV'),
    })
  }

  async function runImport() {
    setIsImporting(true)
    setImportErrors([])
    setImportResult(null)
    setProgress({ done: 0, total: normalisedRows.length })

    try {
      const { leads, errors } = validateAndTransform(normalisedRows)
      if (errors.length) {
        setImportErrors(errors)
        return
      }

      const BATCH_SIZE = 500
      let inserted = 0
      let failed = 0
      const rowErrors: Array<{ row: number; reason: string }> = []

      for (let i = 0; i < leads.length; i += BATCH_SIZE) {
        const batch = leads.slice(i, i + BATCH_SIZE)

        const { error } = await supabase.from('leads').insert(batch as any)

        if (error) {
          failed += batch.length
          rowErrors.push({
            row: i + 2,
            reason: `Batch failed (${i + 1}-${i + batch.length}): ${error.message}`,
          })
        } else {
          inserted += batch.length
        }

        setProgress({ done: Math.min(i + batch.length, leads.length), total: leads.length })
      }

      setImportErrors(rowErrors)
      setImportResult({ inserted, failed })
    } catch (e: any) {
      setParseError(e?.message || 'Import failed')
    } finally {
      setIsImporting(false)
    }
  }

  const downloadTemplate = () => {
    // ✅ include campaign so you can import mixed-campaign files if you want
    const header = ['campaign', 'full_name', 'phone', 'email', 'status', 'source', 'assigned_to', 'lead_ref']
    const sample1 = [campaign, 'John Smith', '07123456789', '', '', '', '', '']
    const sample2 = [campaign, 'Sarah Khan', '07911112222', 'sarah@example.com', 'Contacted', 'Instagram', '', '']
    const csv =
      [header, sample1, sample2]
        .map((row) =>
          row
            .map((cell) => {
              const v = String(cell ?? '')
              if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
              return v
            })
            .join(',')
        )
        .join('\n') + '\n'

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'leads_import_template.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={page}>
      <style>{`
        @keyframes t5-pop {
          0% { transform: scale(0.85) rotate(-8deg); filter: brightness(1); }
          50% { transform: scale(1.15) rotate(6deg); filter: brightness(1.25); }
          100% { transform: scale(1) rotate(0deg); filter: brightness(1.05); }
        }
        .t5-pop {
          display: inline-block;
          transform-origin: center;
          animation: t5-pop 750ms cubic-bezier(.2, .9, .2, 1) 0ms 3;
        }
      `}</style>

      <Sidebar />

      <div style={bgGlowTop} />
      <div style={bgGlowBottom} />

      <div style={container}>
        <div style={headerWrap}>
          <div style={brandRow}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button onClick={() => router.push('/dashboard')} style={btnGhostSmall} title="Back to Dashboard">
                ← Dashboard
              </button>

              {/* ✅ keep campaign context */}
              <button onClick={() => router.push(`/leads?campaign=${campaign}`)} style={btnGhostSmall} title="Back to Leads">
                ← Leads
              </button>

              <div style={brandPill}>
                <span style={dot} />
                <span style={{ opacity: 0.95 }}>Triple 555 CRM</span>
              </div>

              <div style={{ ...brandPill, background: 'rgba(0,140,255,0.10)', border: '1px solid rgba(0,140,255,0.30)' }}>
                <span style={{ ...dot, background: 'rgba(0,140,255,0.95)' }} />
                <span style={{ opacity: 0.95 }}>{String(campaign)}</span>
              </div>
            </div>
          </div>

          <div style={header}>
            <div style={headerLeft}>
              <div style={avatar}>T5</div>
              <div>
                <div style={h1}>Import Leads</div>
                <div style={subtitle}>
                  Campaign: <b>{cfg.label}</b> •{' '}
                  <span style={monoBadge}>Required: full_name, phone • Optional: campaign, email, status, source, assigned_to, lead_ref</span>
                </div>
              </div>
            </div>

            <div style={headerRight}>
              <button onClick={downloadTemplate} style={btnGhost} title="Download a ready-to-use CSV template">
                Download template
              </button>

              <button
                onClick={runImport}
                style={btnCyan}
                disabled={isImporting || normalisedRows.length === 0}
                aria-disabled={isImporting || normalisedRows.length === 0}
                title="Import now"
              >
                {isImporting ? 'Importing…' : 'Import now'}
              </button>
            </div>
          </div>
        </div>

        <div style={panel}>
          <div style={panelHeader}>
            <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>Upload</div>
            <div style={{ opacity: 0.85, fontWeight: 800, display: 'flex', gap: 10, alignItems: 'center' }}>
              {fileName ? <span style={pillSoft}>{fileName}</span> : <span style={{ opacity: 0.75 }}>No file selected</span>}
              {normalisedRows.length > 0 && (
                <span style={pillSoft}>
                  Rows loaded: <b style={{ color: 'rgba(120,255,255,0.95)' }}>{normalisedRows.length}</b>
                </span>
              )}
            </div>
          </div>

          <div style={uploadRow}>
            <label style={fileBtn}>
              Select CSV
              <input
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) onPickFile(f)
                }}
                disabled={isImporting}
              />
            </label>

            <div style={{ flex: 1 }} />

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ opacity: 0.8, fontWeight: 900 }}>
                Tip: Excel → Save As → <b>CSV UTF-8</b>
              </span>
            </div>
          </div>

          {progress.total > 0 && (
            <div style={{ padding: '0 16px 16px 16px' }}>
              <div style={progressTop}>
                <span>
                  Progress: <b>{progress.done}</b> / {progress.total}
                </span>
                <span>{pct}%</span>
              </div>
              <div style={progressTrack}>
                <div style={{ ...progressFill, width: `${pct}%` }} />
              </div>
            </div>
          )}

          {parseError && (
            <div style={alertError}>
              <b>Error:</b>&nbsp;{parseError}
            </div>
          )}

          {importResult && (
            <div style={alertOk}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="t5-pop" style={{ fontSize: 18 }}>
                    ✅✨
                  </span>
                  <div style={{ fontWeight: 1000, letterSpacing: 0.2 }}>Leads imported!</div>
                </div>

                <span style={pillSoft}>
                  Inserted: <b>{importResult.inserted}</b> • Failed: <b>{importResult.failed}</b>
                </span>
              </div>
            </div>
          )}

          {importErrors.length > 0 && (
            <div style={alertWarn}>
              <b>Issues found:</b>
              <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                {importErrors.slice(0, 8).map((e, idx) => (
                  <li key={idx} style={{ marginBottom: 4 }}>
                    Row {e.row}: {e.reason}
                  </li>
                ))}
              </ul>
              {importErrors.length > 8 && <div style={{ marginTop: 8, opacity: 0.85 }}>…and {importErrors.length - 8} more.</div>}
            </div>
          )}
        </div>

        {normalisedRows.length > 0 && (
          <div style={panel}>
            <div style={panelHeader}>
              <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>Preview</div>
              <div style={{ opacity: 0.85, fontWeight: 800 }}>
                Showing <span style={{ color: 'rgba(120,255,255,0.95)' }}>{preview.length}</span> rows
              </div>
            </div>

            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr>
                    {previewCols.map((k) => (
                      <th key={k} style={th}>
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i} style={tr}>
                      {previewCols.map((k) => (
                        <td key={k} style={td}>
                          {String((r as any)[k] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ padding: '14px 16px', borderTop: '1px solid rgba(0,255,255,0.14)', opacity: 0.8 }}>
              If your phone numbers lose the leading <b>0</b>, set the column to <b>Text</b> in Excel before exporting.
            </div>
          </div>
        )}

        <div style={{ height: 40 }} />
      </div>
    </div>
  )
}

/* -----------------------------
   Styles — MATCHES your Leads page
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
  maxWidth: 1500,
  margin: '0 auto',
  padding: '34px 18px',
}

const headerWrap: CSSProperties = { marginBottom: 18 }

const brandRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 10,
}

const brandPill: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  borderRadius: 999,
  background: 'rgba(0,255,255,0.08)',
  border: '1px solid rgba(0,255,255,0.22)',
  boxShadow: '0 0 0 1px rgba(0,255,255,0.08) inset',
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 0.3,
}

const dot: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
  background: 'rgba(120,255,255,0.95)',
  boxShadow: '0 0 16px rgba(0,255,255,0.7)',
  display: 'inline-block',
}

const header: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 14,
  padding: '18px 18px',
  borderRadius: 18,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))',
  border: '1px solid rgba(0,255,255,0.22)',
  boxShadow: '0 20px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,255,255,0.08) inset, 0 0 40px rgba(0,255,255,0.10)',
  backdropFilter: 'blur(10px)',
}

const headerLeft: CSSProperties = { display: 'flex', alignItems: 'center', gap: 14 }

const avatar: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 999,
  display: 'grid',
  placeItems: 'center',
  background: 'radial-gradient(circle at 30% 30%, rgba(0,255,255,0.95), rgba(0,130,255,0.65))',
  boxShadow: '0 0 28px rgba(0,255,255,0.35)',
  fontWeight: 1000,
}

const h1: CSSProperties = { fontSize: 22, fontWeight: 1000, letterSpacing: 0.2, lineHeight: 1.1 }
const subtitle: CSSProperties = { marginTop: 2, fontSize: 12.5, fontWeight: 800, opacity: 0.75 }
const headerRight: CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }

const monoBadge: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  padding: '2px 8px',
  borderRadius: 999,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(0,0,0,0.25)',
  fontWeight: 900,
  opacity: 0.95,
}

const panel: CSSProperties = {
  marginTop: 16,
  borderRadius: 18,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))',
  border: '1px solid rgba(0,255,255,0.25)',
  boxShadow: '0 20px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,255,255,0.08) inset',
  overflow: 'hidden',
}

const panelHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 16px',
  borderBottom: '1px solid rgba(0,255,255,0.18)',
  background: 'rgba(0,0,0,0.18)',
}

const uploadRow: CSSProperties = {
  padding: '16px',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
}

const pillSoft: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 10px',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  fontWeight: 900,
}

const btnBase: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 12,
  fontWeight: 1000,
  cursor: 'pointer',
  border: '1px solid transparent',
  color: '#fff',
}

const btnGhost: CSSProperties = {
  ...btnBase,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
}

const btnCyan: CSSProperties = {
  ...btnBase,
  background: 'linear-gradient(135deg, rgba(0,255,255,0.95), rgba(0,140,255,0.90))',
  border: '1px solid rgba(0,255,255,0.55)',
  boxShadow: '0 0 26px rgba(0,255,255,0.22)',
  color: '#001122',
}

const btnGhostSmall: CSSProperties = { ...btnGhost, padding: '8px 10px', borderRadius: 10, fontSize: 12.5 }

const fileBtn: CSSProperties = {
  ...btnGhost,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '10px 12px',
  borderRadius: 12,
  fontSize: 13,
  fontWeight: 1000,
}

const progressTop: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontWeight: 900,
  opacity: 0.9,
  marginBottom: 10,
}

const progressTrack: CSSProperties = {
  height: 10,
  borderRadius: 999,
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(255,255,255,0.10)',
  overflow: 'hidden',
}

const progressFill: CSSProperties = {
  height: '100%',
  borderRadius: 999,
  background: 'linear-gradient(135deg, rgba(0,255,255,0.95), rgba(0,140,255,0.90))',
  boxShadow: '0 0 22px rgba(0,255,255,0.18)',
}

const alertBase: CSSProperties = {
  margin: '0 16px 16px 16px',
  padding: '12px 14px',
  borderRadius: 12,
  fontWeight: 900,
}

const alertError: CSSProperties = {
  ...alertBase,
  background: 'rgba(255,40,40,0.12)',
  border: '1px solid rgba(255,40,40,0.28)',
  color: 'rgba(255,230,230,0.98)',
}

const alertOk: CSSProperties = {
  ...alertBase,
  background: 'rgba(0,255,180,0.12)',
  border: '1px solid rgba(0,255,180,0.22)',
  color: 'rgba(210,255,240,0.98)',
}

const alertWarn: CSSProperties = {
  ...alertBase,
  background: 'rgba(255,210,90,0.12)',
  border: '1px solid rgba(255,210,90,0.22)',
  color: 'rgba(255,245,220,0.98)',
}

const tableWrap: CSSProperties = { width: '100%', overflowX: 'auto' }

const table: CSSProperties = {
  width: '100%',
  borderCollapse: 'separate',
  borderSpacing: 0,
  tableLayout: 'fixed',
}

const th: CSSProperties = {
  textAlign: 'left',
  fontWeight: 1000,
  fontSize: 12,
  letterSpacing: 0.45,
  textTransform: 'uppercase',
  padding: '14px 12px',
  color: 'rgba(200,255,255,0.95)',
  background: 'rgba(0,0,0,0.25)',
  borderBottom: '1px solid rgba(0,255,255,0.22)',
  position: 'sticky',
  top: 0,
  zIndex: 1,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const tr: CSSProperties = { background: 'rgba(0,0,0,0.12)' }

const td: CSSProperties = {
  padding: '12px 12px',
  borderBottom: '1px solid rgba(255,255,255,0.07)',
  verticalAlign: 'middle',
  fontWeight: 900,
  color: 'rgba(255,255,255,0.95)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}
