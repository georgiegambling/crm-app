'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function AdminDashboard() {
  const [clients, setClients] = useState<any[]>([])
  const [leads, setLeads] = useState<any[]>([])

  useEffect(() => {
    const loadData = async () => {
      const { data: clients } = await supabase
        .from('profiles')
        .select('id, email, role')
        .eq('role', 'client')

      const { data: leads } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })

      setClients(clients || [])
      setLeads(leads || [])
    }

    loadData()
  }, [])

  return (
    <div className="dashboard-shell">
      <h1>Internal Dashboard</h1>

      <section>
        <h2>Clients</h2>
        {clients.map((c) => (
          <div key={c.id}>{c.email}</div>
        ))}
      </section>

      <section>
        <h2>All Leads</h2>
        {leads.map((l) => (
          <div key={l.id}>{l.customer_name}</div>
        ))}
      </section>
    </div>
  )
}
