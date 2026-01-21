import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

type Role = 'admin' | 'staff'

async function serverSupabaseFromCookies() {
  const cookieStore = cookies()


  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async getAll() {
          return (await cookieStore).getAll()
        },
        setAll() {
          // no-op for route handlers
        },
      },
    }
  )
}

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function requireAdmin() {
  const supabase = await serverSupabaseFromCookies()

  const { data: auth } = await supabase.auth.getUser()
  const user = auth?.user
  if (!user) return { ok: false as const, error: 'Not logged in.' }

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profErr) return { ok: false as const, error: profErr.message }
  if (profile?.role !== 'admin') return { ok: false as const, error: 'Forbidden (admin only).' }

  return { ok: true as const, userId: user.id }
}

/**
 * GET /api/admin/users
 */
export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: 403 })

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is missing.' }, { status: 500 })
  }

  const admin = adminSupabase()

  const { data: listed, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200, page: 1 })
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 })

  const ids = (listed?.users ?? []).map((u) => u.id)
  const safeIds = ids.length ? ids : ['00000000-0000-0000-0000-000000000000']

  const { data: profiles, error: profErr } = await admin
    .from('profiles')
    .select('id, display_name, role, disabled, created_at')
    .in('id', safeIds)

  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 500 })

  const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]))

  const users = (listed?.users ?? []).map((u) => {
    const p: any = byId.get(u.id)
    return {
      id: u.id,
      email: u.email ?? null,
      created_at: u.created_at ?? null,
      display_name: p?.display_name ?? null,
      role: ((p?.role ?? 'staff') as Role) || 'staff',
      disabled: !!p?.disabled,
    }
  })

  users.sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))

  return NextResponse.json({ users })
}

/**
 * POST /api/admin/users
 * Body: { email, password, display_name, role }
 */
export async function POST(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: 403 })

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is missing.' }, { status: 500 })
  }

  const body = await req.json().catch(() => null)

  const email = String(body?.email ?? '').trim()
  const password = String(body?.password ?? '').trim()
  const display_name = String(body?.display_name ?? '').trim()
  const role = String(body?.role ?? 'staff') as Role

  if (!email || !password || !display_name) {
    return NextResponse.json({ error: 'email, password, display_name required.' }, { status: 400 })
  }
  if (role !== 'admin' && role !== 'staff') {
    return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
  }

  const admin = adminSupabase()

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error || !data?.user) {
    return NextResponse.json({ error: error?.message || 'Create failed.' }, { status: 500 })
  }

  const userId = data.user.id

  const { error: pErr } = await admin.from('profiles').upsert({
    id: userId,
    display_name,
    role,
    disabled: false,
  })

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, id: userId })
}

/**
 * PATCH /api/admin/users
 * Body: { id, patch: { role?, disabled?, display_name? } }
 */
export async function PATCH(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: 403 })

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is missing.' }, { status: 500 })
  }

  const body = await req.json().catch(() => null)
  const id = String(body?.id ?? '').trim()
  const patch = body?.patch ?? {}

  if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 })

  const updates: any = {}

  if (typeof patch.display_name === 'string') updates.display_name = patch.display_name.trim()
  if (typeof patch.disabled === 'boolean') updates.disabled = patch.disabled
  if (typeof patch.role === 'string') {
    if (patch.role !== 'admin' && patch.role !== 'staff') {
      return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
    }
    updates.role = patch.role
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid updates.' }, { status: 400 })
  }

  const admin = adminSupabase()
  const { error } = await admin.from('profiles').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

/**
 * DELETE /api/admin/users
 * Body: { id }
 */
export async function DELETE(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: 403 })

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is missing.' }, { status: 500 })
  }

  const body = await req.json().catch(() => null)
  const id = String(body?.id ?? '').trim()
  if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 })

  const admin = adminSupabase()

  const { error: delErr } = await admin.auth.admin.deleteUser(id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  // (optional) clean profile
  await admin.from('profiles').delete().eq('id', id)

  return NextResponse.json({ ok: true })
}
