'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function LeadsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getSession()
      if (!data.session) router.push('/login')
    }

    check()
  }, [router])

  return <>{children}</>
}
