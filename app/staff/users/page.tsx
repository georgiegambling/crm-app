import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import UsersClient from './UsersClient'

export default async function UsersPage() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // no-op in Server Components
        },
      },
    }
  )

  const { data: auth } = await supabase.auth.getUser()
  const user = auth?.user
  if (!user) redirect('/login')

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  // admin-only
  if (error || profile?.role !== 'admin') redirect('/dashboard')

  return <UsersClient />
}
