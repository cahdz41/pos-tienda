'use client'

import { useOffline } from '@/contexts/OfflineContext'

function timeAgo(date: Date | null): string {
  if (!date) return 'nunca'
  const diff = Date.now() - date.getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'ahora'
  if (m < 60) return `hace ${m}m`
  return `hace ${Math.floor(m / 60)}h`
}

export default function OfflineBanner() {
  const { isOnline, queueCount, lastSync, isSyncing, syncProgress } = useOffline()

  if (isOnline && !isSyncing && queueCount === 0) return null

  if (isSyncing) {
    const { done = 0, total = 0 } = syncProgress ?? {}
    return (
      <div style={bannerStyle('rgba(139,92,246,0.12)', 'rgba(139,92,246,0.3)')}>
        <div style={leftStyle}>
          <Dot color="#8B5CF6" pulse />
          <span style={{ color: '#A78BFA', fontWeight: 600 }}>Sincronizando…</span>
          <span style={{ color: '#9CA3AF' }}>subiendo ventas a la nube</span>
        </div>
        {total > 0 && (
          <span style={badgeStyle('#A78BFA', 'rgba(139,92,246,0.15)')}>
            {done} de {total} ✓
          </span>
        )}
      </div>
    )
  }

  if (isOnline && queueCount > 0) {
    return (
      <div style={bannerStyle('rgba(16,185,129,0.1)', 'rgba(16,185,129,0.25)')}>
        <div style={leftStyle}>
          <Dot color="#10B981" />
          <span style={{ color: '#34D399', fontWeight: 600 }}>Conectado</span>
          <span style={{ color: '#9CA3AF' }}>
            — {queueCount} venta{queueCount !== 1 ? 's' : ''} sincronizada{queueCount !== 1 ? 's' : ''}
          </span>
        </div>
        <span style={{ fontSize: 10, color: '#6B7280' }}>Sync: {timeAgo(lastSync)}</span>
      </div>
    )
  }

  return (
    <div style={bannerStyle('rgba(239,68,68,0.12)', 'rgba(239,68,68,0.3)')}>
      <div style={leftStyle}>
        <Dot color="#EF4444" />
        <span style={{ color: '#F87171', fontWeight: 600 }}>Sin conexión</span>
        <span style={{ color: '#6B7280' }}>— datos locales · sync {timeAgo(lastSync)}</span>
      </div>
      {queueCount > 0 && (
        <span style={badgeStyle('#F0B429', 'rgba(240,180,41,0.15)')}>
          {queueCount} venta{queueCount !== 1 ? 's' : ''} en cola
        </span>
      )}
    </div>
  )
}

function Dot({ color, pulse }: { color: string; pulse?: boolean }) {
  return (
    <>
      <div style={{
        width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0,
        animation: pulse ? 'offline-pulse 1s ease infinite' : undefined,
      }} />
      <style>{`@keyframes offline-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }`}</style>
    </>
  )
}

const bannerStyle = (bg: string, border: string): React.CSSProperties => ({
  background: bg,
  borderBottom: `1px solid ${border}`,
  padding: '7px 16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: 12,
  flexShrink: 0,
})

const leftStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
}

const badgeStyle = (color: string, bg: string): React.CSSProperties => ({
  color, background: bg, padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
})
