'use client'

import Link from 'next/link'
import { useNewOrderNotifications, type OrderNotification } from '@/contexts/NewOrderNotificationContext'

function formatTime(date: Date) {
  return date.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })
}

function formatCurrency(amount: number) {
  return `Q ${amount.toFixed(2)}`
}

function NotificationCard({ n, onDismiss }: { n: OrderNotification; onDismiss: () => void }) {
  return (
    <div style={{
      background: '#450a0a',
      border: '1px solid #dc2626',
      borderRadius: '12px',
      padding: '16px',
      width: '300px',
      boxShadow: '0 8px 32px rgba(220,38,38,0.35)',
      animation: 'notifSlideIn 0.3s ease-out',
    }}>
      {/* Cabecera */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <span style={{ fontSize: '17px', display: 'inline-block', animation: 'notifPulse 1.5s ease-in-out infinite' }}>
            🔔
          </span>
          <span style={{ color: '#fca5a5', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Pedido nuevo
          </span>
        </div>
        <button
          onClick={onDismiss}
          style={{
            background: 'rgba(220,38,38,0.2)',
            border: '1px solid #7f1d1d',
            borderRadius: '6px',
            cursor: 'pointer',
            color: '#fca5a5',
            fontSize: '14px',
            lineHeight: 1,
            padding: '3px 7px',
          }}
          aria-label="Cerrar notificación"
        >
          ✕
        </button>
      </div>

      {/* Separador */}
      <div style={{ height: '1px', background: '#7f1d1d', marginBottom: '10px' }} />

      {/* Datos del cliente */}
      <p style={{ color: '#ffffff', fontWeight: 600, fontSize: '15px', margin: '0 0 4px' }}>
        {n.customerName}
      </p>
      <p style={{ color: '#fca5a5', fontSize: '13px', margin: '0 0 4px' }}>
        📱 {n.customerPhone}
      </p>
      {n.notes && (
        <p style={{ color: '#fca5a5', fontSize: '12px', margin: '0 0 8px', fontStyle: 'italic' }}>
          💬 {n.notes}
        </p>
      )}

      {/* Total */}
      <div style={{
        background: '#7f1d1d',
        borderRadius: '8px',
        padding: '8px 12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
      }}>
        <span style={{ color: '#fca5a5', fontSize: '12px' }}>Total</span>
        <span style={{ color: '#ffffff', fontWeight: 700, fontSize: '16px' }}>
          {formatCurrency(n.total)}
        </span>
      </div>

      {/* Pie */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link
          href="/configuracion"
          onClick={onDismiss}
          style={{
            background: '#dc2626',
            color: '#ffffff',
            textDecoration: 'none',
            padding: '8px 14px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          Ver pedido →
        </Link>
        <span style={{ color: '#6b7280', fontSize: '11px' }}>
          {formatTime(n.receivedAt)}
        </span>
      </div>
    </div>
  )
}

export function NewOrderNotifications() {
  const { notifications, dismiss } = useNewOrderNotifications()

  if (notifications.length === 0) return null

  return (
    <>
      <style>{`
        @keyframes notifSlideIn {
          from { transform: translateX(120%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes notifPulse {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.2); }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          maxHeight: 'calc(100vh - 48px)',
          overflowY: 'auto',
          scrollbarWidth: 'none',
          pointerEvents: 'auto',
        }}
      >
        {notifications.map(n => (
          <NotificationCard key={n.id} n={n} onDismiss={() => dismiss(n.id)} />
        ))}
      </div>
    </>
  )
}
