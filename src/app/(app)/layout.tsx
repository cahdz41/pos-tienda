import Sidebar from '@/components/Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <main style={{ flex: 1, overflow: 'hidden', height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
        {children}
      </main>
    </div>
  )
}
