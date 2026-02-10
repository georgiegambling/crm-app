// app/leads/import/ImportLeadsClient.tsx
'use client'

import React, { CSSProperties, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Papa from 'papaparse'
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

export default function ImportLeadsClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Optional: allow preselect campaign via ?campaign=SOLAR etc
  const initialCampaign = (() => {
    const c = searchParams.get('campaign')
    const allowed = Object.keys(CAMPAIGNS) as CampaignKey[]
    if (c && allowed.includes(c.toUpperCase() as CampaignKey)) return c.toUpperCase() as CampaignKey
    return (allowed[0] ?? 'SOLAR') as CampaignKey
  })()

  const [campaign, setCampaign] = useState<CampaignKey>(initialCampaign)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const campaignOptions = useMemo(() => Object.keys(CAMPAIGNS) as CampaignKey[], [])

  const parseCsv = async (f: File) => {
    return new Promise<CsvRow[]>((resolve, reject) => {
      Papa.parse(f, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        complete: (res) => resolve((res.data || []) as CsvRow[]),
        error: (e) => reject(e),
      })
    })
  }

  const mapRows = (rows: CsvRow[]) => {
    // normalise headers
    const mapped: LeadInsert[] = []

    for (const r of rows) {
      const obj: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(r || {})) obj[normKey(k)] = v

      const full_name = cleanText(obj['full_name'] ?? obj['fullname'] ?? obj['name'])
      const phone = cleanPhone(obj['phone'] ?? obj['mobile'] ?? obj['tel'] ?? obj['telephone'])
      const email = cleanEmail(obj['email'] ?? obj['email_address'])

      if (!full_name || !phone) continue

      const status = cleanText(obj['status'] ?? '') || 'New'
      const source = cleanText(obj['source'] ?? '') || 'CSV Import'
      const assigned_to = cleanText(obj['assigned_to'] ?? '') || null
      const lead_ref = cleanText(obj['lead_ref'] ?? '') || null

      const rowCampaign = cleanCampaign(obj['campaign'], campaign)

      mapped.push({
        campaign: rowCampaign,
        full_name,
        phone,
        email: email || null,
        status,
        source,
        assigned_to,
        lead_ref,
      })
    }

    return mapped
  }

  const handleImport = async () => {
    setErr(null)
    setMsg(null)

    if (!file) return setErr('Choose a CSV file first.')

    setBusy(true)
    try {
      const rows = await parseCsv(file)
      if (!rows.length) return setErr('CSV looks empty.')

      const inserts = mapRows(rows)
      if (!inserts.length) return setErr(`No valid rows. Required fields: ${REQUIRED_FIELDS.join(', ')}`)

      // insert in chunks to avoid request limits
      const chunkSize = 500
      let total = 0

      for (let i = 0; i < inserts.length; i += chunkSize) {
        const chunk = inserts.slice(i, i + chunkSize)

        const { error } = await supabase.from('leads').insert(chunk)
        if (error) throw new Error(error.message)

        total += chunk.length
      }

      setMsg(`✅ Imported ${total} lead(s) into ${campaign}.`)
      setFile(null)
    } catch (e: any) {
      setErr(e?.message || 'Import failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={page}>
      <Sidebar />

      <div style={container}>
        <div style={card}>
          <div style={h1}>Import Leads</div>
          <div style={sub}>Upload a CSV to bulk add leads into your Supabase leads table.</div>

          <div style={grid}>
            <label style={label}>
              <div style={labelTop}>Campaign</div>
              <select style={input} value={campaign} onChange={(e) => setCampaign(e.target.value as CampaignKey)}>
                {campaignOptions.map((k) => (
                  <option key={k} value={k}>
                    {k} — {CAMPAIGNS[k]?.label ?? ''}
                  </option>
                ))}
              </select>
            </label>

            <label style={label}>
              <div style={labelTop}>CSV File</div>
              <input
                style={fileInput}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <div style={hint}>Headers supported: full_name/name, phone/mobile, email (optional), status (optional).</div>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 14 }}>
            <button style={btnGhost} onClick={() => router.back()} disabled={busy}>
              Back
            </button>
            <button style={btnPrimary} onClick={handleImport} disabled={busy}>
              {busy ? 'Importing…' : 'Import CSV'}
            </button>
          </div>

          {err && <div style={errorBox}>⚠️ {err}</div>}
          {msg && <div style={successBox}>{msg}</div>}
        </div>
      </div>
    </div>
  )
}

/* ---- styles (keep it simple + matches your theme) ---- */
const page: CSSProperties = {
  minHeight: '100vh',
  background:
    'radial-gradient(1200px 600px at 50% 0%, rgba(0,255,255,0.08), transparent 55%), linear-gradient(180deg, #020B22 0%, #01071A 45%, #01051A 100%)',
  color: '#fff',
  fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  display: 'flex',
}

const container: CSSProperties = {
  flex: 1,
  padding: 24,
  maxWidth: 1200,
  margin: '0 auto',
}

const card: CSSProperties = {
  borderRadius: 18,
  padding: 18,
  background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))',
  border: '1px solid rgba(0,255,255,0.22)',
  boxShadow: '0 20px 70px rgba(0,0,0,0.55)',
}

const h1: CSSProperties = { fontSize: 22, fontWeight: 1000 }
const sub: CSSProperties = { marginTop: 6, fontSize: 13, opacity: 0.8, fontWeight: 850 }

const grid: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr',
  gap: 12,
  marginTop: 14,
}

const label: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }
const labelTop: CSSProperties = { fontSize: 12, fontWeight: 1000, opacity: 0.9 }

const input: CSSProperties = {
  padding: '10px 12px',
  borderRadius: 12,
  background: 'rgba(0,0,0,0.35)',
  border: '1px solid rgba(0,255,255,0.2)',
  color: '#fff',
  outline: 'none',
  fontWeight: 900,
  cursor: 'pointer',
}

const fileInput: CSSProperties = {
  ...input,
  cursor: 'pointer',
}

const hint: CSSProperties = { marginTop: 2, fontSize: 11.5, opacity: 0.7, fontWeight: 800 }

const btnGhost: CSSProperties = {
  height: 38,
  padding: '0 12px',
  borderRadius: 12,
  fontWeight: 950,
  cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.04)',
  color: '#fff',
}

const btnPrimary: CSSProperties = {
  height: 38,
  padding: '0 12px',
  borderRadius: 12,
  fontWeight: 1000,
  cursor: 'pointer',
  border: '1px solid rgba(0,255,255,0.35)',
  background: 'rgba(0,255,255,0.14)',
  color: '#fff',
}

const errorBox: CSSProperties = {
  marginTop: 12,
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(255,40,40,0.12)',
  border: '1px solid rgba(255,40,40,0.28)',
  fontWeight: 900,
}

const successBox: CSSProperties = {
  marginTop: 12,
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(0,255,180,0.10)',
  border: '1px solid rgba(0,255,180,0.22)',
  fontWeight: 900,
}
