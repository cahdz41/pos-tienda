import Sidebar from '@/components/Sidebar'
import OfflineBanner from '@/components/OfflineBanner'
import { OfflineProvider } from '@/contexts/OfflineContext'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <OfflineProvider>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <Sidebar />
        <main style={{ flex: 1, overflow: 'hidden', height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
          <OfflineBanner />
          {children}
        </main>
      </div>
    </OfflineProvider>
  )
}
