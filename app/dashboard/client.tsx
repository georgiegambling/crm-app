'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function ClientDashboard() {
  const [leads, setLeads] = useState<any[]>([])

  useEffect(() => {
    const loadMyData = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('client_id', user.id)
        .order('created_at', { ascending: false })

      setLeads(data || [])
    }

    loadMyData()
  }, [])

  return (
    <div className="dashboard-shell">
      <h1>Your Dashboard</h1>

      <section>
        <h2>Your Orders / Leads</h2>
        {leads.map((l) => (
          <div key={l.id}>
            {l.customer_name} – {l.status}
          </div>
        ))}
      </section>
    </div>
  )
}
