'use client'

function fmt(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function getConfig(): { businessName: string; footer: string; paperWidth: string } {
  if (typeof window === 'undefined') {
    return { businessName: 'Mi Negocio', footer: 'Gracias por su preferencia', paperWidth: '80mm' }
  }
  return {
    businessName: localStorage.getItem('pos_business_name') || 'Mi Negocio',
    footer:       localStorage.getItem('pos_receipt_footer') || 'Gracias por su preferencia',
    paperWidth:   localStorage.getItem('pos_paper_width')    || '80mm',
  }
}

export interface OrderTicketData {
  customerName: string
  productName: string
  salePrice: number
  deposit: number
  notes?: string
  date: Date
}

// ── Vista previa en pantalla ────────────────────────────────────────────────
export function OrderTicketPreview({ data }: { data: OrderTicketData }) {
  const { businessName, footer } = getConfig()
  const dateStr = data.date.toLocaleDateString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
  const timeStr = data.date.toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit',
  })
  const remaining = Math.max(0, data.salePrice - data.deposit)

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
      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '17px', marginBottom: '2px' }}>
        {businessName}
      </div>
      <div style={{ textAlign: 'center', fontSize: '12px', color: '#666', marginBottom: '6px' }}>
        {dateStr} &nbsp; {timeStr}
      </div>

      {divider}

      <div style={{ fontSize: '13px', lineHeight: '1.5' }}>
        <div><strong>Cliente:</strong> {data.customerName}</div>
        <div><strong>Producto:</strong> {data.productName}</div>
      </div>

      {divider}

      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '16px' }}>
        <span>PRECIO TOTAL</span>
        <span>{fmt(data.salePrice)}</span>
      </div>

      <div style={{ fontSize: '13px', marginTop: '8px', color: '#333', lineHeight: '1.6' }}>
        <div>Anticipo: <strong>{fmt(data.deposit)}</strong></div>
        <div>Restante: <strong style={{ color: remaining > 0 ? '#c07d00' : '#1a7a1a' }}>
          {remaining > 0 ? fmt(remaining) : 'Liquidado ✓'}
        </strong></div>
      </div>

      {data.notes && (
        <>
          {divider}
          <div style={{ fontSize: '12px', color: '#555', fontStyle: 'italic' }}>
            <strong>Notas:</strong> {data.notes}
          </div>
        </>
      )}

      {divider}
      <div style={{ textAlign: 'center', fontSize: '12px', color: '#555' }}>{footer}</div>
      <div style={{ textAlign: 'center', fontSize: '11px', color: '#888', marginTop: '4px' }}>
        Comprobante de anticipo
      </div>
    </div>
  )
}

// ── Impresión en ventana 80mm ───────────────────────────────────────────────
export function printOrderTicket(data: OrderTicketData) {
  const { businessName, footer, paperWidth } = getConfig()
  const dateStr = data.date.toLocaleDateString('es-MX', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
  const timeStr = data.date.toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit',
  })
  const remaining = Math.max(0, data.salePrice - data.deposit)

  const notesRow = data.notes
    ? `<div style="margin-top:6px;font-size:12px;color:#333;font-style:italic"><strong>Notas:</strong> ${data.notes.replace(/</g, '&lt;')}</div>` : ''

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Comprobante de Encargo</title>
<style>
  @page { size: ${paperWidth} auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Arial Black', 'Arial', sans-serif;
    font-size: 14px;
    width: ${paperWidth};
    padding: 4mm 3mm;
    color: #000;
    background: #fff;
  }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: bold; }
  .divider { border-top: 2px dashed #000; margin: 6px 0; }
  .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 18px; }
  .info-row  { font-size: 13px; margin-top: 4px; line-height: 1.5; }
  .pay-info  { font-size: 13px; margin-top: 6px; line-height: 1.5; }
</style>
</head>
<body>
  <div class="center bold" style="font-size:18px;margin-bottom:6px">${businessName}</div>
  <div class="divider"></div>
  <div style="font-size:13px">${dateStr} &nbsp; ${timeStr}</div>
  <div class="divider"></div>

  <div class="info-row"><strong>Cliente:</strong> ${data.customerName.replace(/</g, '&lt;')}</div>
  <div class="info-row"><strong>Producto:</strong> ${data.productName.replace(/</g, '&lt;')}</div>

  <div class="divider"></div>
  <div class="total-row"><span>PRECIO TOTAL</span><span>${fmt(data.salePrice)}</span></div>

  <div class="pay-info">
    <div>Anticipo: <strong>${fmt(data.deposit)}</strong></div>
    <div>Restante: <strong style="color:${remaining > 0 ? '#c07d00' : '#1a7a1a'}">${remaining > 0 ? fmt(remaining) : 'Liquidado ✓'}</strong></div>
  </div>

  ${notesRow}

  <div class="divider" style="margin-top:10px"></div>
  <div class="center" style="font-size:12px;margin-top:6px">${footer}</div>
  <div class="center" style="font-size:11px;color:#555;margin-top:4px">Comprobante de anticipo</div>
</body>
</html>`

  const win = window.open('', '_blank', 'width=360,height=620,toolbar=0,menubar=0,scrollbars=1')
  if (!win) {
    alert('Habilita las ventanas emergentes en tu navegador para imprimir.')
    return
  }
  win.document.write(html)
  win.document.close()
  setTimeout(() => { win.focus(); win.print() }, 300)
}
