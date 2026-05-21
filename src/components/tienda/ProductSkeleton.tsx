'use client'

export default function ProductSkeleton() {
  return (
    <div style={{
      background: '#0D0D0D',
      border: '1px solid #161616',
      borderRadius: '16px',
      overflow: 'hidden',
    }}>
      {/* Imagen skeleton */}
      <div style={{
        aspectRatio: '4/5',
        background: '#111111',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, #111111 25%, #1A1A1A 50%, #111111 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s infinite',
        }} />
      </div>

      {/* Info skeleton */}
      <div style={{ padding: '16px 18px 20px' }}>
        <div style={{
          height: '16px',
          borderRadius: '4px',
          background: '#1A1A1A',
          marginBottom: '12px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, #1A1A1A 25%, #222222 50%, #1A1A1A 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
          }} />
        </div>
        <div style={{
          height: '20px',
          width: '60%',
          borderRadius: '4px',
          background: '#1A1A1A',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, #1A1A1A 25%, #222222 50%, #1A1A1A 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
          }} />
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
      gap: '16px',
    }}>
      {Array.from({ length: count }).map((_, i) => (
        <ProductSkeleton key={i} />
      ))}
    </div>
  )
}
