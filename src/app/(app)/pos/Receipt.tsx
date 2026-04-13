'use client'

import type { CartItem } from '@/types'

export interface ReceiptData {
  cart: CartItem[]
  total: number
  paymentMethod: 'cash' | 'card' | 'mixed'
  amountPaid: number
  change: number
  cashPaid?: number   // solo cuando method = 'mixed'
  cardPaid?: number   // solo cuando method = 'mixed'
  date: Date
}

function fmt(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function getConfig(): { businessName: string; footer: string } {
  if (typeof window === 'undefined') {
    return { businessName: 'Mi Negocio', footer: 'Gracias por su compra' }
  }
  return {
    businessName: localStorage.getItem('pos_business_name') || 'Mi Negocio',
    footer: localStorage.getItem('pos_receipt_footer') || 'Gracias por su compra',
  }
}

// ── Vista previa en pantalla ────────────────────────────────────────────────
// Usa fuentes legibles en pantalla (≠ formato térmico 80mm).
export function Receipt({ data }: { data: ReceiptData }) {
  const { businessName, footer } = getConfig()
  const dateStr = data.date.toLocaleDateString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
  const timeStr = data.date.toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit',
  })

  const divider = (
    <div style={{ borderTop: '1px dashed #ccc', margin: '10px 0' }} />
  )

  return (
    <div style={{
      background: '#fff', color: '#111',
      fontFamily: "'Courier New', Courier, monospace",
      fontSize: '14px', padding: '16px 18px',
      borderRadius: '10px', width: '100%',
    }}>
      {/* Nombre del negocio */}
      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '17px', marginBottom: '2px' }}>
        {businessName}
      </div>
      <div style={{ textAlign: 'center', fontSize: '12px', color: '#666', marginBottom: '6px' }}>
        {dateStr} &nbsp; {timeStr}
      </div>

      {divider}

      {/* Encabezado columnas */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 36px 90px',
        gap: '0 6px', fontSize: '12px', fontWeight: 'bold',
        color: '#555', marginBottom: '6px',
      }}>
        <span>Producto</span>
        <span style={{ textAlign: 'center' }}>Cant</span>
        <span style={{ textAlign: 'right' }}>Total</span>
      </div>

      {/* Items */}
      {data.cart.map(item => {
        const name = `${item.variant.product?.name ?? ''}${item.variant.flavor ? ` — ${item.variant.flavor}` : ''}`
        return (
          <div key={item.variant.id} style={{
            display: 'grid', gridTemplateColumns: '1fr 36px 90px',
            gap: '0 6px', fontSize: '13px', marginBottom: '5px', alignItems: 'start',
          }}>
            <span style={{ lineHeight: '1.35' }}>{name}</span>
            <span style={{ textAlign: 'center', color: '#444' }}>{item.quantity}</span>
            <span style={{ textAlign: 'right', whiteSpace: 'nowrap', fontWeight: '600' }}>
              {fmt(item.unitPrice * item.quantity)}
            </span>
          </div>
        )
      })}

      {divider}

      {/* Total */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontWeight: 'bold', fontSize: '16px',
      }}>
        <span>TOTAL</span>
        <span>{fmt(data.total)}</span>
      </div>

      {/* Pago */}
      <div style={{ fontSize: '13px', marginTop: '8px', color: '#333', lineHeight: '1.6' }}>
        <div>Pago: <strong>
          {data.paymentMethod === 'cash' ? 'Efectivo' : data.paymentMethod === 'card' ? 'Tarjeta' : 'Mixto'}
        </strong></div>
        {data.paymentMethod === 'mixed' && (
          <>
            {data.cashPaid != null && data.cashPaid > 0 && <div>Efectivo: {fmt(data.cashPaid)}</div>}
            {data.cardPaid != null && data.cardPaid > 0 && <div>Tarjeta: {fmt(data.cardPaid)}</div>}
          </>
        )}
        {data.paymentMethod === 'cash' && (
          <>
            <div>Recibido: {fmt(data.amountPaid)}</div>
            <div>Cambio: <strong style={{ color: '#1a7a1a' }}>{fmt(data.change)}</strong></div>
          </>
        )}
      </div>

      {divider}

      <div style={{ textAlign: 'center', fontSize: '12px', color: '#555' }}>{footer}</div>
    </div>
  )
}

// ── Impresión en ventana 80mm ───────────────────────────────────────────────
export function printReceipt(data: ReceiptData) {
  const { businessName, footer } = getConfig()
  const dateStr = data.date.toLocaleDateString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
  const timeStr = data.date.toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit',
  })

  const itemRows = data.cart.map(item => {
    const name = `${item.variant.product?.name ?? ''}${item.variant.flavor ? ` ${item.variant.flavor}` : ''}`
    return `<tr>
      <td>${name}</td>
      <td class="center">${item.quantity}</td>
      <td class="right">${fmt(item.unitPrice * item.quantity)}</td>
    </tr>`
  }).join('')

  const payLabel = data.paymentMethod === 'cash' ? 'Efectivo' : data.paymentMethod === 'card' ? 'Tarjeta' : 'Mixto'
  const cashRows = data.paymentMethod === 'cash'
    ? `<div>Recibido: ${fmt(data.amountPaid)}</div><div>Cambio: ${fmt(data.change)}</div>`
    : data.paymentMethod === 'mixed'
      ? [
          data.cashPaid && data.cashPaid > 0 ? `<div>Efectivo: ${fmt(data.cashPaid)}</div>` : '',
          data.cardPaid && data.cardPaid > 0 ? `<div>Tarjeta: ${fmt(data.cardPaid)}</div>` : '',
        ].join('')
      : ''

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Ticket</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    width: 80mm;
    padding: 4mm 3mm;
    color: #000;
    background: #fff;
  }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: bold; }
  .divider { border-top: 1px dashed #000; margin: 5px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead th { font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 2px; }
  tbody td { padding: 2px 0; vertical-align: top; }
  td.center { text-align: center; }
  td.right  { text-align: right; white-space: nowrap; }
  .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; }
  .pay-info  { font-size: 11px; margin-top: 4px; }
</style>
</head>
<body>
  <div class="center bold" style="font-size:15px;margin-bottom:5px">${businessName}</div>
  <div class="divider"></div>
  <div style="font-size:11px">${dateStr} &nbsp; ${timeStr}</div>
  <div class="divider"></div>

  <table>
    <thead>
      <tr>
        <th style="text-align:left">Producto</th>
        <th class="center">Cant</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="divider"></div>
  <div class="total-row"><span>TOTAL</span><span>${fmt(data.total)}</span></div>
  <div class="pay-info">
    <div>Pago: ${payLabel}</div>
    ${cashRows}
  </div>
  <div class="divider" style="margin-top:8px"></div>
  <div class="center" style="font-size:11px;margin-top:4px">${footer}</div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=360,height=620,toolbar=0,menubar=0,scrollbars=1')
  if (!win) {
    alert('Habilita las ventanas emergentes en tu navegador para imprimir.')
    return
  }
  win.document.write(html)
  win.document.close()
  // Pequeño delay para que el navegador renderice antes de imprimir
  setTimeout(() => { win.focus(); win.print() }, 300)
}
