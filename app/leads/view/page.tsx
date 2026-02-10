'use client'

import React, { CSSProperties, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { CAMPAIGNS, CampaignKey } from '@/lib/campaignConfig'

export default function LeadsCampaignPicker() {
  const router = useRouter()

  const [campaign, setCampaign] = useState<CampaignKey>('ECO4')

  const options = useMemo(() => Object.values(CAMPAIGNS), [])

  const go = () => {
    router.push(`/leads/view?campaign=${campaign}`)
  }

  return (
    <div style={page}>
      <Sidebar />

      <div style={wrap}>
        <div style={card}>
          <div style={title}>Choose a Campaign</div>
          <div style={sub}>This controls statuses, sources, triggers, and extra fields.</div>

          <div style={{ height: 14 }} />

          <div style={label}>Campaign</div>
          <select style={select} value={campaign} onChange={(e) => setCampaign(e.target.value as CampaignKey)}>
            {options.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>

          <div style={{ height: 16 }} />

          <button style={btnPrimary} onClick={go}>
            Open Leads
          </button>
        </div>
      </div>
    </div>
  )
}

const page: CSSProperties = {
  minHeight: '100vh',
  background:
    'radial-gradient(1200px 600px at 50% 0%, rgba(0,255,255,0.08), transparent 55%), linear-gradient(180deg, #020B22 0%, #01071A 45%, #01051A 100%)',
  color: '#fff',
  fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
  fontWeight: 900,
}

const wrap: CSSProperties = {
  padding: 24,
  display: 'grid',
  placeItems: 'center',
}

const card: CSSProperties = {
  width: 560,
  maxWidth: '100%',
  borderRadius: 18,
  border: '1px solid rgba(0,255,255,0.28)',
  background: 'linear-gradient(180deg, rgba(10,18,45,0.95), rgba(6,10,26,0.96))',
  boxShadow: '0 30px 120px rgba(0,0,0,0.65), 0 0 40px rgba(0,255,255,0.12)',
  padding: 18,
}

const title: CSSProperties = { fontSize: 20, fontWeight: 1000 }
const sub: CSSProperties = { marginTop: 6, fontSize: 12.5, opacity: 0.78, fontWeight: 900 }

const label: CSSProperties = { fontSize: 12, opacity: 0.85, fontWeight: 900, marginBottom: 8, letterSpacing: 0.35 }

const select: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 12,
  background: 'rgba(0,0,0,0.35)',
  border: '1px solid rgba(0,255,255,0.22)',
  color: '#fff',
  outline: 'none',
  fontWeight: 900,
  cursor: 'pointer',
}

const btnPrimary: CSSProperties = {
  width: '100%',
  height: 42,
  borderRadius: 12,
  cursor: 'pointer',
  border: '1px solid rgba(0,255,255,0.55)',
  background: 'linear-gradient(135deg, rgba(0,255,255,0.95), rgba(0,140,255,0.90))',
  boxShadow: '0 0 26px rgba(0,255,255,0.18)',
  color: '#001122',
  fontWeight: 1000,
}
