'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import Sidebar from '@/components/Sidebar'

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [role, setRole] = useState<string>('client')

  useEffect(() => {
    ;(async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      const user = sessionData.session?.user

      // Not logged in -> login
      if (!user) {
        router.replace('/login')
        return
      }

      const { data: prof, error } = await supabase.from('profiles').select('role').eq('id', user.id).single()

      if (error) {
        // If profile lookup fails, safest is block access
        router.replace('/dashboard')
        return
      }

      const r = (prof?.role || 'client').toLowerCase()
      setRole(r)

      const isStaff = r === 'staff' || r === 'admin'
      if (!isStaff) {
        // Clients should never see /staff routes
        router.replace('/dashboard')
        return
      }

      setChecking(false)
    })()
  }, [router])

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', background: '#01071A', color: '#fff', display: 'grid', placeItems: 'center' }}>
        <div style={{ opacity: 0.85, fontWeight: 900 }}>Checking access…</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Sidebar already hides staff-only links from clients, but here we also hard-block routes */}
      <Sidebar role={role} />
      {children}
    </div>
  )
}
