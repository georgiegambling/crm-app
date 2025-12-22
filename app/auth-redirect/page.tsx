'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function AuthRedirect() {
  const router = useRouter()

  useEffect(() => {
    const redirect = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (!profile) {
        router.push('/login')
        return
      }

      if (profile.role === 'admin') router.push('/leads')
      else if (profile.role === 'staff') router.push('/leads')
      else router.push('/client-dashboard')
    }

    redirect()
  }, [router])

  return null
}
