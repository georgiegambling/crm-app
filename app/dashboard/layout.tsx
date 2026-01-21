import Sidebar from '@/components/Sidebar'

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh' }}>
      <Sidebar />
      {children}
    </div>
  )
}
