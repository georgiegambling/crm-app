'use client'

import React, { useEffect, useMemo, useState } from 'react'

type Role = 'admin' | 'staff'

type UserRow = {
  id: string
  email: string | null
  created_at: string | null
  display_name: string | null
  role: Role
  disabled: boolean
}

type CreateUserPayload = {
  email: string
  password: string
  display_name: string
  role: Role
}

export default function UsersClient() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [rows, setRows] = useState<UserRow[]>([])
  const [query, setQuery] = useState('')

  // modal
  const [openAdd, setOpenAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<CreateUserPayload>({
    email: '',
    password: '',
    display_name: '',
    role: 'staff',
  })

  const fetchUsers = async () => {
    setErrorMsg(null)
    setSuccessMsg(null)

    const res = await fetch('/api/admin/users', { method: 'GET' })
    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      setRows([])
      setErrorMsg(json?.error || 'Failed to load users.')
      return
    }

    setRows((json?.users ?? []) as UserRow[])
  }

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      await fetchUsers()
      setLoading(false)
    })()
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchUsers()
    setRefreshing(false)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((u) =>
      [u.display_name ?? '', u.email ?? '', u.role ?? '', u.disabled ? 'disabled' : 'active']
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [rows, query])

  const openAddModal = () => {
    setErrorMsg(null)
    setSuccessMsg(null)
    setForm({ email: '', password: '', display_name: '', role: 'staff' })
    setOpenAdd(true)
  }

  const closeAddModal = () => {
    if (saving) return
    setOpenAdd(false)
  }

  const createUser = async () => {
    setErrorMsg(null)
    setSuccessMsg(null)

    const email = form.email.trim()
    const password = form.password.trim()
    const display_name = form.display_name.trim()

    if (!email || !password || !display_name) {
      setErrorMsg('Email, password, and display name are required.')
      return
    }

    setSaving(true)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, email, password, display_name }),
    })
    const json = await res.json().catch(() => ({}))
    setSaving(false)

    if (!res.ok) {
      setErrorMsg(json?.error || 'Failed to create user.')
      return
    }

    setOpenAdd(false)
    setSuccessMsg('User created.')
    await fetchUsers()
  }

  const updateUser = async (id: string, patch: Partial<Pick<UserRow, 'role' | 'disabled' | 'display_name'>>) => {
    setErrorMsg(null)
    setSuccessMsg(null)

    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, patch }),
    })
    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      setErrorMsg(json?.error || 'Update failed.')
      return
    }

    setSuccessMsg('Updated.')
    await fetchUsers()
  }

  const deleteUser = async (id: string, label: string) => {
    setErrorMsg(null)
    setSuccessMsg(null)

    const ok = window.confirm(`Delete ${label}? This removes the user from Auth and cannot be undone.`)
    if (!ok) return

    const res = await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      setErrorMsg(json?.error || 'Delete failed.')
      return
    }

    setSuccessMsg('Deleted.')
    await fetchUsers()
  }

  return (
    <div style={page}>
      <div style={bgGlowTop} />
      <div style={bgGlowBottom} />

      <div style={container}>
        <div style={headerCard}>
          <div style={{ minWidth: 240 }}>
            <div style={h1}>Users</div>
            <div style={sub}>Admin-only staff management.</div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
            <input
              style={search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email, role…"
            />

            <button style={btn} onClick={openAddModal}>
              + Add Staff
            </button>

            <button style={btn} onClick={handleRefresh} disabled={refreshing} aria-disabled={refreshing}>
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
            <div style={{ fontWeight: 950 }}>Staff</div>
            <div style={{ opacity: 0.8, fontWeight: 900 }}>{filtered.length} shown</div>
          </div>

          {loading ? (
            <div style={empty}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={empty}>No users found.</div>
          ) : (
            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={th}>Name</th>
                    <th style={th}>Email</th>
                    <th style={th}>Role</th>
                    <th style={th}>Status</th>
                    <th style={th}>Created</th>
                    <th style={thRight}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u, i) => {
                    const label = u.display_name || u.email || u.id.slice(0, 8)

                    return (
                      <tr
                        key={u.id}
                        style={{
                          background: i % 2 === 0 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.03)',
                        }}
                      >
                        <td style={td}>{u.display_name || '—'}</td>
                        <td style={tdMono}>{u.email || '—'}</td>

                        <td style={td}>
                          <select
                            style={select}
                            value={u.role}
                            onChange={(e) => updateUser(u.id, { role: e.target.value as any })}
                          >
                            <option value="staff">staff</option>
                            <option value="admin">admin</option>
                          </select>
                        </td>

                        <td style={td}>
                          <button
                            style={u.disabled ? warnBtn : okBtn}
                            onClick={() => updateUser(u.id, { disabled: !u.disabled })}
                            title={u.disabled ? 'Enable user' : 'Disable user'}
                          >
                            {u.disabled ? 'Disabled' : 'Active'}
                          </button>
                        </td>

                        <td style={td}>{u.created_at ? new Date(u.created_at).toLocaleString() : '—'}</td>

                        <td style={tdRight}>
                          <button style={dangerBtn} onClick={() => deleteUser(u.id, label)}>
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

      {/* Add modal */}
      {openAdd && (
        <div style={modalOverlay} onMouseDown={closeAddModal}>
          <div style={modalCard} onMouseDown={(e) => e.stopPropagation()}>
            <div style={modalTop}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 1000 }}>Add Staff</div>
                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.75, fontWeight: 800 }}>
                  Creates a Supabase Auth user + profile.
                </div>
              </div>

              <button style={iconBtn} onClick={closeAddModal} disabled={saving}>
                ✕
              </button>
            </div>

            <div style={formGrid}>
              <label style={label}>
                <div style={labelTop}>Display name *</div>
                <input
                  style={input}
                  value={form.display_name}
                  onChange={(e) => setForm((p) => ({ ...p, display_name: e.target.value }))}
                  placeholder="e.g. Mark Smith"
                />
              </label>

              <label style={label}>
                <div style={labelTop}>Role *</div>
                <select style={input} value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as Role }))}>
                  <option value="staff">staff</option>
                  <option value="admin">admin</option>
                </select>
              </label>

              <label style={label}>
                <div style={labelTop}>Email *</div>
                <input
                  style={input}
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="name@company.co.uk"
                />
              </label>

              <label style={label}>
                <div style={labelTop}>Temp password *</div>
                <input
                  style={input}
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  placeholder="Give them a temporary password"
                />
                <div style={hint}>They can change it after first login.</div>
              </label>
            </div>

            <div style={modalActions}>
              <button style={btnGhost} onClick={closeAddModal} disabled={saving}>
                Cancel
              </button>
              <button style={btnPrimary} onClick={createUser} disabled={saving}>
                {saving ? 'Creating…' : 'Create user'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* styles (same vibe) */

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

const select: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 12,
  background: 'rgba(0,0,0,0.35)',
  border: '1px solid rgba(0,255,255,0.2)',
  color: '#fff',
  outline: 'none',
  fontWeight: 900,
}

const okBtn: React.CSSProperties = {
  height: 34,
  padding: '0 12px',
  borderRadius: 12,
  fontWeight: 950,
  cursor: 'pointer',
  border: '1px solid rgba(0,255,180,0.25)',
  background: 'rgba(0,255,180,0.10)',
  color: '#fff',
}

const warnBtn: React.CSSProperties = {
  ...okBtn,
  border: '1px solid rgba(255,190,80,0.30)',
  background: 'rgba(255,190,80,0.10)',
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

/* modal */
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

const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }

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

const hint: React.CSSProperties = { marginTop: 2, fontSize: 11.5, opacity: 0.7, fontWeight: 800 }

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
