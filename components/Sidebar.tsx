'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type Role = 'admin' | 'staff' | 'client' | string

type SidebarProps = {
  role?: Role
}

export default function Sidebar({ role: roleProp }: SidebarProps) {
  const router = useRouter()
  const pathname = usePathname()

  const [open, setOpen] = useState(false)
  const [role, setRole] = useState<Role>(roleProp ?? 'client')

  // ✅ simple viewport state (for responsive drawer sizing)
  const [vw, setVw] = useState<number>(1200)
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth || 1200)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const isMobile = vw < 820
  const isTiny = vw < 420

  // Auto-resolve role if not passed in
  useEffect(() => {
    if (roleProp) return

    ;(async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      const user = sessionData.session?.user
      if (!user) return

      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setRole(prof?.role ?? 'client')
    })()
  }, [roleProp])

  // Close drawer on route change
  useEffect(() => {
    setOpen(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // ESC closes + lock scroll while open
  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  const isStaff = role === 'admin' || role === 'staff'
  const isAdmin = role === 'admin'

  const items = useMemo(() => {
    return [
      { label: 'Dashboard', path: '/dashboard', show: true },
      { label: 'Leads', path: '/leads', show: true },

      // ✅ Staff/Admin only
      { label: 'Import Leads', path: '/leads/import', show: isStaff },

      // ✅ Staff/Admin only (clients must NOT see this exists)
      // Choose your route: '/reports' OR '/staff/reports' depending on where you put the page.
      { label: 'Sales Reports', path: '/staff/reports', show: isStaff },

      // Admin-only examples
      { label: 'Users', path: '/admin/users', show: isAdmin },
      { label: 'Settings', path: '/admin/settings', show: isAdmin },

      // ❌ Remove client access to any "reports" page unless you REALLY want a separate client-facing one.
      // { label: 'My Reports', path: '/client/reports', show: role === 'client' },
    ].filter((x) => x.show)
  }, [isStaff, isAdmin])

  const drawerWidth = isTiny ? '92vw' : isMobile ? '86vw' : 340

  return (
    <>
      {/* Floating toggle */}
      {!open && (
        <button onClick={() => setOpen(true)} style={styles.fab} aria-label="Open menu" title="Menu">
          ☰
        </button>
      )}

      {/* Backdrop + Drawer */}
      {open && (
        <div
          style={styles.backdrop}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div style={{ ...styles.drawer, width: drawerWidth }} role="dialog" aria-modal="true" aria-label="Sidebar menu">
            <div style={styles.topRow}>
              <div style={styles.brandPill}>
                <span style={styles.dot} />
                <span style={{ opacity: 0.95 }}>Triple 555 CRM</span>
              </div>

              <button onClick={() => setOpen(false)} style={styles.closeBtn} aria-label="Close menu" title="Close">
                ✕
              </button>
            </div>

            <div style={styles.roleRow}>
              <div style={styles.roleBadge}>
                Role: <b style={{ color: 'rgba(120,255,255,0.95)' }}>{role}</b>
              </div>
              <div style={styles.accessText}>{isStaff ? 'Internal access' : 'Client access'}</div>
            </div>

            {/* ✅ Scrollable nav area */}
            <div style={styles.navScroll}>
              <div style={styles.nav}>
                {items.map((item) => {
                  const active =
                    pathname === item.path ||
                    (item.path !== '/' && pathname?.startsWith(item.path + '/')) ||
                    (item.path === '/leads' && pathname?.startsWith('/leads'))

                  return (
                    <button
                      key={item.path}
                      onClick={() => router.push(item.path)}
                      style={{
                        ...styles.navBtn,
                        ...(active ? styles.navBtnActive : {}),
                      }}
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div style={styles.bottom}>
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

            <div style={{ height: isMobile ? 10 : 0 }} />
          </div>
        </div>
      )}
    </>
  )
}

const styles: Record<string, React.CSSProperties> = {
  fab: {
    position: 'fixed',
    top: 16,
    left: 16,
    zIndex: 1200,
    width: 46,
    height: 46,
    borderRadius: 14,
    border: '1px solid rgba(0,255,255,0.30)',
    background: 'rgba(0,0,0,0.40)',
    color: '#fff',
    fontWeight: 1000,
    cursor: 'pointer',
    boxShadow: '0 0 0 1px rgba(0,255,255,0.10) inset, 0 18px 50px rgba(0,0,0,0.55)',
    backdropFilter: 'blur(10px)',
    WebkitTapHighlightColor: 'transparent',
  },

  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 1300,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
  },

  drawer: {
    height: '100%',
    background:
      'radial-gradient(900px 500px at 20% 0%, rgba(0,255,255,0.10), rgba(0,0,0,0) 55%), linear-gradient(180deg, rgba(10,18,45,0.98), rgba(6,10,26,0.98))',
    borderRight: '1px solid rgba(0,255,255,0.22)',
    boxShadow: '0 30px 120px rgba(0,0,0,0.75)',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
  },

  topRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingBottom: 12,
    borderBottom: '1px solid rgba(0,255,255,0.14)',
  },

  brandPill: {
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
    color: '#fff',
    whiteSpace: 'nowrap',
  },

  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    background: 'rgba(120,255,255,0.95)',
    boxShadow: '0 0 16px rgba(0,255,255,0.7)',
    display: 'inline-block',
  },

  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontWeight: 1000,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },

  roleRow: {
    marginTop: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },

  roleBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    borderRadius: 999,
    border: '1px solid rgba(0,255,255,0.18)',
    background: 'rgba(0,255,255,0.07)',
    fontWeight: 900,
    fontSize: 12,
    color: 'rgba(210,255,255,0.95)',
  },

  accessText: {
    opacity: 0.75,
    fontWeight: 900,
    fontSize: 12,
  },

  navScroll: {
    marginTop: 14,
    flex: 1,
    overflowY: 'auto',
    paddingRight: 2,
  },

  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },

  navBtn: {
    textAlign: 'left',
    padding: '13px 12px',
    borderRadius: 14,
    border: '1px solid rgba(0,255,255,0.16)',
    background: 'rgba(255,255,255,0.04)',
    color: '#fff',
    fontWeight: 950,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },

  navBtnActive: {
    border: '1px solid rgba(0,255,255,0.34)',
    background: 'rgba(0,255,255,0.12)',
    boxShadow: '0 0 18px rgba(0,255,255,0.10)',
  },

  bottom: {
    paddingTop: 12,
    borderTop: '1px solid rgba(0,255,255,0.14)',
    display: 'flex',
    gap: 10,
    justifyContent: 'flex-end',
  },

  ghostBtn: {
    padding: '10px 14px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(255,255,255,0.06)',
    color: '#fff',
    fontWeight: 900,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
  },
}
