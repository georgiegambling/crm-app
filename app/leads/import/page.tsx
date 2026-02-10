export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import ImportLeadsClient from './ImportLeadsClient'

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 16, color: '#fff', fontWeight: 900 }}>Loading import…</div>}>
      <ImportLeadsClient />
    </Suspense>
  )
}