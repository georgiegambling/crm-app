'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type CRMSettings = {
  brand_name: string
  default_campaign: string
  currency: 'GBP' | 'USD' | 'EUR'
  stale_days: number
  callback_sla_days: number
}

const DEFAULTS: CRMSettings = {
  brand_name: 'Triple 555 CRM',
  default_campaign: 'ECO 4',
  currency: 'GBP',
  stale_days: 7,
  callback_sla_days: 2,
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  const [form, setForm] = useState<CRMSettings>(DEFAULTS)

  const load = async () => {
    setErrorMsg(null)
    setOkMsg(null)

    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .eq('key', 'crm')
      .maybeSingle()

    if (error) {
      setErrorMsg(error.message)
      setForm(DEFAULTS)
      return
    }

    const value = (data?.value ?? {}) as Partial<CRMSettings>
    setForm({
      ...DEFAULTS,
      ...value,
      stale_days: Number(value.stale_days ?? DEFAULTS.stale_days),
      callback_sla_days: Number(value.callback_sla_days ?? DEFAULTS.callback_sla_days),
    })
  }

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      await load()
      setLoading(false)
    })()
  }, [])

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(DEFAULTS), [form])

  const save = async () => {
    setSaving(true)
    setErrorMsg(null)
    setOkMsg(null)

    const { data: auth } = await supabase.auth.getUser()
    const uid = auth?.user?.id ?? null

    const payload = {
      key: 'crm',
      value: form,
      updated_by: uid,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('app_settings')
      .upsert(payload, { onConflict: 'key' })

    if (error) {
      setErrorMsg(error.message)
      setSaving(false)
      return
    }

    setOkMsg('Saved ✓')
    setSaving(false)
  }

  return (
    <div style={page}>
      <div style={bgGlowTop} />
      <div style={bgGlowBottom} />

      <div style={wrap}>
        <div style={headerCard}>
          <div>
            <div style={h1}>Settings</div>
            <div style={sub}>Admin-only CRM configuration.</div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              style={btnGhost}
              onClick={load}
              disabled={loading || saving}
              aria-disabled={loading || saving}
              title="Reload"
            >
              ↻ Reload
            </button>

            <button
              style={btnPrimary}
              onClick={save}
              disabled={loading || saving}
              aria-disabled={loading || saving}
              title="Save settings"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        {errorMsg && (
          <div style={errorBar}>
            <b>Error:</b> {errorMsg}
          </div>
        )}

        {okMsg && <div style={okBar}>{okMsg}</div>}

        <div style={panel}>
          <div style={panelTop}>
            <div style={{ fontWeight: 950 }}>CRM Settings</div>
            <div style={{ opacity: 0.75, fontWeight: 900 }}>
              {loading ? 'Loading…' : dirty ? 'Customised' : 'Defaults'}
            </div>
          </div>

          {loading ? (
            <div style={empty}>Loading…</div>
          ) : (
            <div style={grid}>
              <Field label="Brand name" hint="Shown in the sidebar + headers.">
                <input
                  style={input}
                  value={form.brand_name}
                  onChange={(e) => setForm((p) => ({ ...p, brand_name: e.target.value }))}
                  placeholder="Triple 555 CRM"
                />
              </Field>

              <Field label="Default campaign" hint="Used as the default on reports/import screens.">
                <input
                  style={input}
                  value={form.default_campaign}
                  onChange={(e) => setForm((p) => ({ ...p, default_campaign: e.target.value }))}
                  placeholder="ECO 4"
                />
              </Field>

              <Field label="Currency" hint="Used for reports + dashboard totals.">
                <select
                  style={input}
                  value={form.currency}
                  onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value as any }))}
                >
                  <option value="GBP">GBP (£)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </Field>

              <Field label="Stale lead threshold (days)" hint="Used by Pipeline Health + Stale KPI.">
                <input
                  style={input}
                  type="number"
                  min={1}
                  max={60}
                  value={form.stale_days}
                  onChange={(e) => setForm((p) => ({ ...p, stale_days: Number(e.target.value || 0) }))}
                />
              </Field>

              <Field label="Callback SLA (days)" hint="Used for callback urgency badges/alerts.">
                <input
                  style={input}
                  type="number"
                  min={0}
                  max={30}
                  value={form.callback_sla_days}
                  onChange={(e) => setForm((p) => ({ ...p, callback_sla_days: Number(e.target.value || 0) }))}
                />
              </Field>

              <div style={cardNote}>
                <div style={{ fontWeight: 1000, marginBottom: 6 }}>Next upgrades</div>
                <div style={{ opacity: 0.85, fontWeight: 850, lineHeight: 1.5 }}>
                  • Add per-client settings (multi dashboards)<br />
                  • Add staff targets & leaderboards<br />
                  • Add campaign templates
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ height: 40 }} />
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div style={field}>
      <div style={labelStyle}>{label}</div>
      {hint && <div style={hintStyle}>{hint}</div>}
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  )
}

/* ---------- styles (match CRM vibe) ---------- */

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

const wrap: React.CSSProperties = {
  maxWidth: 1200,
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
  boxShadow: '0 20px 70px rgba(0,0,0,0.55), 0 0 40px rgba(0,255,255,0.10)',
}

const h1: React.CSSProperties = { fontSize: 20, fontWeight: 1000 }
const sub: React.CSSProperties = { marginTop: 4, fontSize: 12.5, opacity: 0.75, fontWeight: 800 }

const btnGhost: React.CSSProperties = {
  height: 38,
  padding: '0 12px',
  borderRadius: 12,
  fontWeight: 950,
  cursor: 'pointer',
  border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.06)',
  color: '#fff',
}

const btnPrimary: React.CSSProperties = {
  ...btnGhost,
  border: '1px solid rgba(0,255,255,0.45)',
  background: 'rgba(0,255,255,0.14)',
  boxShadow: '0 0 18px rgba(0,255,255,0.10)',
}

const errorBar: React.CSSProperties = {
  marginTop: 14,
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(255,40,40,0.12)',
  border: '1px solid rgba(255,40,40,0.28)',
  fontWeight: 900,
}

const okBar: React.CSSProperties = {
  marginTop: 14,
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(0,255,140,0.10)',
  border: '1px solid rgba(0,255,140,0.22)',
  fontWeight: 1000,
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

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: 14,
  padding: 16,
}

const field: React.CSSProperties = {
  padding: 14,
  borderRadius: 16,
  background: 'rgba(0,0,0,0.22)',
  border: '1px solid rgba(255,255,255,0.08)',
}

const labelStyle: React.CSSProperties = {
  fontWeight: 1000,
  letterSpacing: 0.2,
}

const hintStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  opacity: 0.75,
  fontWeight: 850,
  lineHeight: 1.35,
}

const input: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 12,
  background: 'rgba(0,0,0,0.35)',
  border: '1px solid rgba(0,255,255,0.20)',
  color: '#fff',
  outline: 'none',
  fontWeight: 900,
}

const cardNote: React.CSSProperties = {
  padding: 14,
  borderRadius: 16,
  background: 'rgba(0,255,255,0.08)',
  border: '1px solid rgba(0,255,255,0.18)',
}
