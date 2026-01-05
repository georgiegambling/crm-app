import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY! // NEVER expose this to the browser

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.')
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const users = [
  // ✅ Fill these in
  { email: 'staff1@email.com', password: 'TempPass#12345', role: 'staff' },
  { email: 'staff2@email.com', password: 'TempPass#12345', role: 'staff' },
  { email: 'staff3@email.com', password: 'TempPass#12345', role: 'staff' },
] as const

async function main() {
  for (const u of users) {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
    })

    if (error) {
      console.error(`❌ createUser failed for ${u.email}:`, error.message)
      continue
    }

    const userId = data.user?.id
    if (!userId) {
      console.error(`❌ No user id returned for ${u.email}`)
      continue
    }

    // Upsert profile role
    const { error: profErr } = await supabaseAdmin
      .from('profiles')
      .upsert({ id: userId, role: u.role }, { onConflict: 'id' })

    if (profErr) {
      console.error(`⚠️ profile upsert failed for ${u.email}:`, profErr.message)
      continue
    }

    console.log(`✅ Created ${u.email} (${u.role})`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
