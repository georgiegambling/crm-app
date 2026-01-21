'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function AuthRedirect() {
  const router = useRouter()
 

  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getUser()
      const user = data?.user

      if (!user) {
        router.push('/login')
        return
      }

      // OPTIONAL: if you want to route based on role
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      const role = (profile?.role ?? 'client') as string

      if (role === 'admin') router.push('/dashboard')
      else if (role === 'staff') router.push('/staff/reports')
      else router.push('/client-dashboard')
    }

    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
