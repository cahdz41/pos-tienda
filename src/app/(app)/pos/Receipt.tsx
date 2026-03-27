'use client'

import { useRef } from 'react'
import type { CartItem } from '@/types'

export interface SaleReceipt {
  saleId: string
  date: Date
  cashierName: string
  cart: CartItem[]
  subtotal: number
  discount: number
  total: number
  payments: Array<{ method: string; amount: number }>
  change: number
  customerName?: string
  loyaltyEarned?: number
  loyaltyBalance?: number
  loyaltyNextIn?: number
}

interface Props {
  receipt: SaleReceipt
  onClose: () => void
}

const fmt = (n: number) => `$${n.toFixed(2)}`

const METHOD_LABEL: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', credit: 'Crédito', transfer: 'Transferencia', wallet: 'Monedero' }

export default function Receipt({ receipt, onClose }: Props) {
  const printRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    const content = printRef.current
    if (!content) return

    // Leer configuración guardada
    let paperWidth = '80mm'
    try {
      const cfg = localStorage.getItem('pos_print_settings')
      if (cfg) paperWidth = JSON.parse(cfg).paperWidth ?? '80mm'
    } catch { /* usa default */ }

    const win = window.open('', '_blank', 'width=400,height=700')
    if (!win) return
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8"/>
        <title>Ticket #${receipt.saleId.slice(-6).toUpperCase()}</title>
        <style>
          @page {
            size: 80mm 3276mm;
            margin: 2mm 3mm;
          }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Courier New', monospace; font-size: 11px; width: 74mm; color: #000; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .large { font-size: 15px; }
          .divider { border-top: 1px dashed #000; margin: 5px 0; }
          .row { display: flex; justify-content: space-between; margin: 2px 0; }
          .total-row { font-weight: bold; font-size: 13px; }
          .footer { margin-top: 6px; text-align: center; font-size: 10px; }
        </style>
      </head>
      <body>${content.innerHTML}</body>
      </html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  const ticketNumber = receipt.saleId.slice(-6).toUpperCase()
  const dateStr = receipt.date.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' })
  const timeStr = receipt.date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="receipt-overlay" onClick={onClose}>
      <div className="receipt-container" onClick={e => e.stopPropagation()}>
        {/* Actions */}
        <div className="receipt-actions">
          <span className="receipt-title">Ticket generado</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-print" onClick={handlePrint}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              Imprimir
            </button>
            <button className="btn-close-receipt" onClick={onClose}>
              Nueva venta
            </button>
          </div>
        </div>

        {/* Ticket preview */}
        <div className="ticket-preview" ref={printRef}>
          <div className="center bold large">CHOCHOLAND</div>
          <div className="center" style={{ fontSize: 10, marginBottom: 4 }}>Sistema POS</div>
          <div className="divider" />
          <div className="row"><span>Ticket:</span><span className="bold">#{ticketNumber}</span></div>
          <div className="row"><span>Fecha:</span><span>{dateStr} {timeStr}</span></div>
          <div className="row"><span>Cajero:</span><span>{receipt.cashierName}</span></div>
          {receipt.customerName && (
            <div className="row"><span>Cliente:</span><span>{receipt.customerName}</span></div>
          )}
          <div className="divider" />

          {/* Items */}
          {receipt.cart.map((item, i) => (
            <div key={i} style={{ marginBottom: 4 }}>
              <div className="bold" style={{ fontSize: 11 }}>
                {item.variant.product?.name ?? '—'}{item.variant.flavor ? ` - ${item.variant.flavor}` : ''}
              </div>
              <div className="row">
                <span style={{ fontSize: 11 }}>{item.quantity} x {fmt(item.unit_price)}</span>
                <span className="bold">{fmt(item.unit_price * item.quantity)}</span>
              </div>
            </div>
          ))}

          <div className="divider" />
          {receipt.discount > 0 && (
            <div className="row"><span>Descuento:</span><span>-{fmt(receipt.discount)}</span></div>
          )}
          <div className="row total-row">
            <span>TOTAL:</span>
            <span>{fmt(receipt.total)}</span>
          </div>
          <div className="divider" />
          {receipt.payments.map((p, i) => (
            <div key={i} className="row">
              <span>Pago {METHOD_LABEL[p.method] ?? p.method}:</span>
              <span>{fmt(p.amount)}</span>
            </div>
          ))}
          {receipt.change > 0 && (
            <div className="row bold"><span>Cambio:</span><span>{fmt(receipt.change)}</span></div>
          )}
          {(receipt.loyaltyEarned !== undefined && receipt.loyaltyEarned > 0) && (
            <>
              <div className="divider" />
              <div className="row bold"><span>Monedero ganado:</span><span>+{fmt(receipt.loyaltyEarned)}</span></div>
            </>
          )}
          {receipt.loyaltyBalance !== undefined && (
            <div className="row"><span>Saldo monedero:</span><span>{fmt(receipt.loyaltyBalance)}</span></div>
          )}
          {receipt.loyaltyNextIn !== undefined && receipt.loyaltyNextIn > 0 && (
            <div className="row"><span>Próxima recompensa:</span><span>faltan {fmt(receipt.loyaltyNextIn)}</span></div>
          )}
          <div className="divider" />
          <div className="footer">¡Gracias por su compra!</div>
        </div>
      </div>

      <style>{`
        .receipt-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.75);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200;
          padding: 20px;
        }

        .receipt-container {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 16px;
          overflow: hidden;
          width: 100%;
          max-width: 380px;
          box-shadow: 0 24px 64px rgba(0,0,0,0.6);
        }

        .receipt-actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          border-bottom: 1px solid var(--border);
          background: var(--bg-surface);
        }

        .receipt-title {
          font-family: var(--font-syne, sans-serif);
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .btn-print {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          background: var(--accent);
          border: none;
          border-radius: 7px;
          font-size: 13px;
          font-weight: 700;
          color: #0D0D12;
          cursor: pointer;
          transition: all 0.15s;
        }
        .btn-print:hover { background: #F5C233; }

        .btn-close-receipt {
          padding: 8px 14px;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 7px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s;
        }
        .btn-close-receipt:hover { background: var(--bg-hover); color: var(--text-primary); }

        /* Ticket paper look */
        .ticket-preview {
          background: #fff;
          color: #000;
          font-family: 'Courier New', monospace;
          font-size: 12px;
          padding: 16px;
          margin: 16px;
          border-radius: 4px;
          max-height: 60vh;
          overflow-y: auto;
        }

        .ticket-preview .center { text-align: center; }
        .ticket-preview .bold { font-weight: bold; }
        .ticket-preview .large { font-size: 16px; }
        .ticket-preview .divider { border-top: 1px dashed #999; margin: 6px 0; }
        .ticket-preview .row { display: flex; justify-content: space-between; margin: 2px 0; }
        .ticket-preview .total-row { font-weight: bold; font-size: 14px; }
        .ticket-preview .footer { margin-top: 8px; text-align: center; font-size: 10px; color: #666; }
      `}</style>
    </div>
  )
}
