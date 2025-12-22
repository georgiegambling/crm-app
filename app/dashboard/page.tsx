'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import Sidebar from '@/components/Sidebar'

type Role = 'admin' | 'staff' | 'client' | string

type Profile = {
  id: string
  email: string | null
  role: Role
}

type Lead = {
  id: string
  lead_ref: number | null
  full_name: string
  phone: string
  email: string
  status: string
  source: string
  assigned_to: string | null
  created_at: string
  user_id: string | null
}

type ClientSummary = {
  user_id: string
  leads: number
  last_created_at: string
  statuses: Record<string, number>
}

function formatDate(d: string) {
  try {
    return new Date(d).toLocaleDateString(undefined, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return d
  }
}

function formatDateTime(d: string) {
  try {
    return new Date(d).toLocaleString()
  } catch {
    return d
  }
}

function shortId(id: string) {
  return id?.slice?.(0, 6) ?? id
}

export default function DashboardPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [error, setError] = useState<string | null>(null)

  // Internal overview: group by user_id (client account)
  const clientSummaries = useMemo<ClientSummary[]>(() => {
    if (!leads.length) return []

    const map = new Map<string, ClientSummary>()

    for (const l of leads) {
      const uid = l.user_id ?? 'LEGACY_NO_USER_ID'
      const existing = map.get(uid)

      if (!existing) {
        map.set(uid, {
          user_id: uid,
          leads: 1,
          last_created_at: l.created_at,
          statuses: { [l.status]: 1 },
        })
      } else {
        existing.leads += 1
        existing.last_created_at =
          new Date(l.created_at) > new Date(existing.last_created_at)
            ? l.created_at
            : existing.last_created_at
        existing.statuses[l.status] = (existing.statuses[l.status] ?? 0) + 1
      }
    }

    return [...map.values()].sort((a, b) => b.leads - a.leads)
  }, [leads])

  const isStaff = useMemo(() => {
    const r = profile?.role
    return r === 'admin' || r === 'staff'
  }, [profile?.role])

  const stats = useMemo(() => {
    const total = leads.length

    const byStatus = new Map<string, number>()
    const bySource = new Map<string, number>()

    for (const l of leads) {
      byStatus.set(l.status, (byStatus.get(l.status) ?? 0) + 1)
      bySource.set(l.source, (bySource.get(l.source) ?? 0) + 1)
    }

    const topStatus = [...byStatus.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
    const topSource = [...bySource.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)

    return { total, topStatus, topSource }
  }, [leads])

  const fetchDashboard = async () => {
    setError(null)
    setLoading(true)

    // 1) session
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession()
    if (sessionErr) {
      setError(sessionErr.message)
      setLoading(false)
      return
    }

    const session = sessionData.session
    if (!session?.user) {
      router.replace('/login')
      return
    }

    // 2) profile / role
    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('id,email,role')
      .eq('id', session.user.id)
      .single()

    const resolvedProfile: Profile = profErr
      ? {
          id: session.user.id,
          email: session.user.email ?? null,
          role: 'client',
        }
      : (prof as Profile)

    setProfile(resolvedProfile)

    const staffNow = resolvedProfile.role === 'admin' || resolvedProfile.role === 'staff'

    // 3) leads
    const baseQuery = supabase
      .from('leads')
      .select('id,lead_ref,full_name,phone,email,status,source,assigned_to,created_at,user_id')
      .order('created_at', { ascending: false })
      .limit(staffNow ? 200 : 100)

    const { data: leadsData, error: leadsErr } = staffNow
      ? await baseQuery
      : await baseQuery.eq('user_id', session.user.id)

    if (leadsErr) {
      setError(leadsErr.message)
      setLeads([])
    } else {
      setLeads((leadsData ?? []) as Lead[])
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchDashboard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <main style={styles.page}>
      {/* Sidebar overlay/drawer (does NOT affect layout) */}
      <Sidebar />

      <div style={styles.bgGlow} />

      <div style={styles.shell}>
        {/* Header */}
        <div style={styles.headerCard}>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div style={styles.logoCircle}>T5</div>
            <div>
              <div style={styles.badge}>Triple 555 CRM</div>
              <div style={styles.h1}>{isStaff ? 'Internal Dashboard' : 'Your Dashboard'}</div>
              <div style={styles.sub}>
                {profile ? (
                  <>
                    Signed in as <b>{profile.email ?? 'Unknown email'}</b> · Role:{' '}
                    <b style={{ color: 'rgba(106, 240, 255, 0.95)' }}>{profile.role}</b>
                  </>
                ) : (
                  'Loading your profile…'
                )}
              </div>
            </div>
          </div>

          <div style={styles.headerActions}>
            <button style={styles.ghostBtn} onClick={fetchDashboard}>
              ↻ Refresh
            </button>

            <button style={styles.primaryBtn} onClick={() => router.push('/leads')}>
              Open Leads
            </button>

            <button
              style={styles.ghostBtn}
              onClick={async () => {
                await supabase.auth.signOut()
                router.replace('/login')
              }}
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading ? (
          <div style={styles.card}>
            <div style={styles.cardTitle}>Loading dashboard…</div>
            <div style={styles.cardBody}>Fetching your profile and leads.</div>
          </div>
        ) : (
          <>
            {error && (
              <div style={{ ...styles.card, borderColor: 'rgba(255, 80, 80, 0.45)' }}>
                <div style={styles.cardTitle}>Error</div>
                <div style={{ ...styles.cardBody, color: 'rgba(255, 180, 180, 0.95)' }}>
                  {error}
                </div>
              </div>
            )}

            <div style={styles.grid}>
              <div style={styles.statCard}>
                <div style={styles.statLabel}>
                  {isStaff ? 'Total Leads (Loaded)' : 'Your Leads (Loaded)'}
                </div>
                <div style={styles.statValue}>{stats.total}</div>
                <div style={styles.statHint}>
                  {isStaff ? 'Up to 200 recent leads' : 'Up to 100 recent leads'}
                </div>
              </div>

              <div style={styles.statCard}>
                <div style={styles.statLabel}>Top Status</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {stats.topStatus.length === 0 ? (
                    <div style={styles.pill}>No leads yet</div>
                  ) : (
                    stats.topStatus.map(([k, v]) => (
                      <div key={k} style={styles.pill}>
                        {k} · <b style={{ color: '#fff' }}>{v}</b>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={styles.statCard}>
                <div style={styles.statLabel}>Top Source</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  {stats.topSource.length === 0 ? (
                    <div style={styles.pill}>No sources</div>
                  ) : (
                    stats.topSource.map(([k, v]) => (
                      <div key={k} style={styles.pill}>
                        {k} · <b style={{ color: '#fff' }}>{v}</b>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {isStaff && (
              <div style={styles.card}>
                <div style={styles.cardHeadRow}>
                  <div style={styles.cardTitle}>Client Accounts (from leads.user_id)</div>
                  <div style={styles.smallRight}>
                    Accounts: <b>{clientSummaries.length}</b>
                    {clientSummaries.some((c) => c.user_id === 'LEGACY_NO_USER_ID') && (
                      <span style={{ opacity: 0.8 }}> · includes legacy rows</span>
                    )}
                  </div>
                </div>

                <div style={styles.cardBody}>
                  This groups leads by <b>user_id</b>. If some older leads have <b>user_id = NULL</b>,
                  they’ll show under <b>LEGACY_NO_USER_ID</b>.
                </div>

                <div style={{ ...styles.tableWrap, marginTop: 12 }}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>ACCOUNT (USER_ID)</th>
                        <th style={styles.th}>LEADS</th>
                        <th style={styles.th}>LAST ACTIVITY</th>
                        <th style={styles.th}>TOP STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientSummaries.slice(0, 12).map((c) => {
                        const topStatus = Object.entries(c.statuses).sort((a, b) => b[1] - a[1])[0]
                        return (
                          <tr key={c.user_id} style={styles.tr}>
                            <td style={styles.td}>
                              <span style={styles.mono}>
                                {c.user_id === 'LEGACY_NO_USER_ID' ? 'LEGACY_NO_USER_ID' : c.user_id}
                              </span>
                            </td>
                            <td style={styles.td}>
                              <span style={styles.chip}>{c.leads}</span>
                            </td>
                            <td style={styles.td}>{formatDateTime(c.last_created_at)}</td>
                            <td style={styles.td}>
                              {topStatus ? (
                                <span style={styles.statusPill}>
                                  {topStatus[0]} · <b style={{ color: '#fff' }}>{topStatus[1]}</b>
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                        )
                      })}

                      {clientSummaries.length === 0 && (
                        <tr>
                          <td style={styles.empty} colSpan={4}>
                            No client accounts found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={styles.card}>
              <div style={styles.cardHeadRow}>
                <div style={styles.cardTitle}>Recent Leads</div>
                <div style={styles.smallRight}>
                  Showing <b>{leads.length}</b>
                </div>
              </div>

              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>LEAD REF</th>
                      <th style={styles.th}>ID</th>
                      <th style={styles.th}>CUSTOMER</th>
                      <th style={styles.th}>PHONE</th>
                      <th style={styles.th}>EMAIL</th>
                      <th style={styles.th}>STATUS</th>
                      <th style={styles.th}>SOURCE</th>
                      <th style={styles.th}>ASSIGNED TO</th>
                      <th style={styles.th}>ADDED</th>
                      {isStaff && <th style={styles.th}>USER_ID</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((l) => (
                      <tr key={l.id} style={styles.tr}>
                        <td style={styles.td}>
                          <span style={styles.chip}>{l.lead_ref ?? '—'}</span>
                        </td>
                        <td style={styles.td}>
                          <span style={styles.mono}>{shortId(l.id)}</span>
                        </td>
                        <td style={styles.td}>{l.full_name}</td>
                        <td style={styles.td}>{l.phone}</td>
                        <td style={styles.td}>{l.email}</td>
                        <td style={styles.td}>
                          <span style={styles.statusPill}>{l.status}</span>
                        </td>
                        <td style={styles.td}>{l.source}</td>
                        <td style={styles.td}>{l.assigned_to ?? '—'}</td>
                        <td style={styles.td}>{formatDate(l.created_at)}</td>
                        {isStaff && (
                          <td style={styles.td}>
                            <span style={styles.mono}>{l.user_id ? shortId(l.user_id) : '—'}</span>
                          </td>
                        )}
                      </tr>
                    ))}

                    {leads.length === 0 && (
                      <tr>
                        <td style={styles.empty} colSpan={isStaff ? 10 : 9}>
                          No leads found for this account.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {!isStaff && (
                <div style={{ marginTop: 16, ...styles.staffBox }}>
                  <div style={styles.cardTitle}>Quick Actions</div>
                  <div style={styles.cardBody}>You can add and edit your leads on the Leads page.</div>
                  <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button style={styles.primaryBtn} onClick={() => router.push('/leads')}>
                      Go to Your Leads
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  )
}

/** Styles (dark navy + cyan glow theme) */
const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    padding: '48px 20px',
    position: 'relative',
    background:
      'radial-gradient(1200px 600px at 50% -100px, rgba(0,255,255,0.25), rgba(0,0,0,0) 60%), radial-gradient(900px 500px at 80% 20%, rgba(0,180,255,0.18), rgba(0,0,0,0) 60%), linear-gradient(180deg, #050b1c, #030615 70%, #020410)',
    color: '#fff',
    fontFamily:
      'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  bgGlow: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    background:
      'radial-gradient(700px 350px at 50% 15%, rgba(0, 255, 255, 0.18), rgba(0,0,0,0) 70%)',
  },
  shell: {
    position: 'relative',
    maxWidth: 1200,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },

  headerCard: {
    borderRadius: 18,
    padding: 18,
    border: '1px solid rgba(0,255,255,0.22)',
    background: 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
    boxShadow: '0 0 0 1px rgba(0,255,255,0.08), 0 18px 60px rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
  },
  headerActions: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },

  logoCircle: {
    width: 44,
    height: 44,
    borderRadius: 999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 950,
    background: 'rgba(0,255,255,0.15)',
    border: '1px solid rgba(0,255,255,0.35)',
    boxShadow: '0 0 0 1px rgba(0,255,255,0.12), 0 12px 40px rgba(0,0,0,0.55)',
  },

  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    borderRadius: 999,
    border: '1px solid rgba(0,255,255,0.18)',
    background: 'rgba(0,255,255,0.07)',
    fontWeight: 800,
    fontSize: 12,
    letterSpacing: 0.4,
    width: 'fit-content',
  },
  h1: { fontSize: 26, fontWeight: 950, marginTop: 10, lineHeight: 1.1 },
  sub: { marginTop: 6, opacity: 0.85, fontWeight: 800, fontSize: 13 },

  ghostBtn: {
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontWeight: 900,
    cursor: 'pointer',
  },
  primaryBtn: {
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid rgba(0,255,255,0.32)',
    background: 'rgba(0,255,255,0.18)',
    color: '#fff',
    fontWeight: 950,
    cursor: 'pointer',
    boxShadow: '0 0 0 1px rgba(0,255,255,0.08), 0 16px 40px rgba(0,0,0,0.4)',
  },

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 14,
  },
  statCard: {
    borderRadius: 16,
    padding: 16,
    border: '1px solid rgba(0,255,255,0.16)',
    background: 'rgba(255,255,255,0.04)',
    boxShadow: '0 14px 40px rgba(0,0,0,0.5)',
    minHeight: 108,
  },
  statLabel: { fontWeight: 950, fontSize: 12, opacity: 0.85, letterSpacing: 0.4 },
  statValue: { fontWeight: 950, fontSize: 26, marginTop: 8 },
  statHint: { marginTop: 6, fontWeight: 850, fontSize: 12, opacity: 0.7 },

  pill: {
    borderRadius: 999,
    border: '1px solid rgba(0,255,255,0.2)',
    background: 'rgba(0,255,255,0.08)',
    padding: '6px 10px',
    fontWeight: 950,
    fontSize: 12,
    color: 'rgba(210, 255, 255, 0.95)',
  },

  card: {
    borderRadius: 18,
    padding: 16,
    border: '1px solid rgba(0,255,255,0.16)',
    background: 'rgba(255,255,255,0.035)',
    boxShadow: '0 18px 60px rgba(0,0,0,0.55)',
  },
  cardHeadRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  cardTitle: { fontWeight: 950, fontSize: 14, letterSpacing: 0.3 },
  cardBody: {
    marginTop: 8,
    fontWeight: 800,
    opacity: 0.82,
    fontSize: 13,
    lineHeight: 1.35,
  },
  smallRight: { fontWeight: 900, opacity: 0.75, fontSize: 12 },

  tableWrap: {
    marginTop: 12,
    borderRadius: 14,
    border: '1px solid rgba(0,255,255,0.18)',
    overflow: 'auto',
    background: 'rgba(0,0,0,0.25)',
  },
  table: {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: 0,
    minWidth: 980,
  },
  th: {
    textAlign: 'left',
    padding: '12px 12px',
    fontWeight: 950,
    fontSize: 12,
    letterSpacing: 0.4,
    color: 'rgba(210, 255, 255, 0.95)',
    background: 'rgba(0,255,255,0.06)',
    borderBottom: '1px solid rgba(0,255,255,0.14)',
    position: 'sticky',
    top: 0,
    zIndex: 1,
    whiteSpace: 'nowrap',
  },
  tr: {},
  td: {
    padding: '12px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    fontWeight: 850,
    fontSize: 13,
    whiteSpace: 'nowrap',
  },
  mono: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    opacity: 0.9,
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 40,
    padding: '6px 10px',
    borderRadius: 999,
    border: '1px solid rgba(0,255,255,0.22)',
    background: 'rgba(0,255,255,0.08)',
    fontWeight: 950,
  },
  statusPill: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '6px 10px',
    borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.06)',
    fontWeight: 950,
  },
  empty: { padding: 16, fontWeight: 900, opacity: 0.8 },

  staffBox: {
    borderRadius: 14,
    padding: 14,
    border: '1px solid rgba(0,255,255,0.18)',
    background: 'rgba(0,255,255,0.05)',
  },
}
