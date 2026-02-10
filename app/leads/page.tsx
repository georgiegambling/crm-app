// app/leads/page.tsx
export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import LeadsClient from './LeadsClient'

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 16, color: '#fff', fontWeight: 900 }}>Loading leads…</div>}>
      <LeadsClient />
    </Suspense>
  )
}
