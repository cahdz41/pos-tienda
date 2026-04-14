import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY no configurado en .env.local')
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function fmt(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// POST — enviar reporte del día anterior (o de hoy si es prueba)
export async function POST(req: NextRequest) {
  try {
    const { email, test = false } = await req.json()

    if (!email?.trim()) {
      return NextResponse.json({ error: 'Email requerido' }, { status: 400 })
    }

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) {
      return NextResponse.json({ error: 'RESEND_API_KEY no configurado en .env.local' }, { status: 500 })
    }

    const supabase = adminClient()
    const now = new Date()

    // Período: ayer completo (o hoy si es prueba)
    const start = test
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate())          // hoy 00:00
      : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)      // ayer 00:00
    const end = test
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)      // mañana 00:00
      : new Date(now.getFullYear(), now.getMonth(), now.getDate())          // hoy 00:00

    const { data: sales } = await supabase
      .from('sales')
      .select('id, total, payment_method')
      .eq('status', 'completed')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())

    const salesList = (sales ?? []) as { id: string; total: number; payment_method: string }[]
    const totalRevenue = salesList.reduce((s, x) => s + x.total, 0)
    const txCount      = salesList.length
    const avgTicket    = txCount > 0 ? totalRevenue / txCount : 0

    // Desglose por método
    const methods: Record<string, number> = {}
    for (const s of salesList) {
      methods[s.payment_method] = (methods[s.payment_method] || 0) + 1
    }

    const methodLabels: Record<string, string> = {
      cash: 'Efectivo', card: 'Tarjeta', mixed: 'Mixto', credit: 'Crédito',
    }

    const methodRows = Object.entries(methods)
      .map(([k, v]) => `<tr>
        <td style="padding:4px 8px;color:#555">${methodLabels[k] ?? k}</td>
        <td style="padding:4px 8px;text-align:right;color:#111">${v} ventas</td>
        <td style="padding:4px 8px;text-align:right;color:#555">${((v / txCount) * 100).toFixed(0)}%</td>
      </tr>`).join('')

    const dateLabel = start.toLocaleDateString('es-MX', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    })

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f4f4f4;font-family:sans-serif">
  <div style="max-width:480px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">

    <!-- Header -->
    <div style="background:#111;padding:24px;text-align:center">
      <p style="margin:0;color:#B8A000;font-size:13px;letter-spacing:1px;text-transform:uppercase">Reporte diario</p>
      <p style="margin:6px 0 0;color:#fff;font-size:18px;font-weight:bold">${dateLabel}</p>
    </div>

    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;border-bottom:1px solid #eee">
      <div style="padding:20px 12px;text-align:center;border-right:1px solid #eee">
        <p style="margin:0;font-size:22px;font-weight:bold;color:#B8A000;font-family:monospace">${fmt(totalRevenue)}</p>
        <p style="margin:4px 0 0;font-size:11px;color:#888">Ingresos</p>
      </div>
      <div style="padding:20px 12px;text-align:center;border-right:1px solid #eee">
        <p style="margin:0;font-size:22px;font-weight:bold;color:#111;font-family:monospace">${txCount}</p>
        <p style="margin:4px 0 0;font-size:11px;color:#888">Ventas</p>
      </div>
      <div style="padding:20px 12px;text-align:center">
        <p style="margin:0;font-size:22px;font-weight:bold;color:#4CAF50;font-family:monospace">${fmt(avgTicket)}</p>
        <p style="margin:4px 0 0;font-size:11px;color:#888">Ticket prom.</p>
      </div>
    </div>

    <!-- Métodos de pago -->
    ${txCount > 0 ? `
    <div style="padding:16px 20px">
      <p style="margin:0 0 10px;font-size:13px;font-weight:bold;color:#333">Métodos de pago</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        ${methodRows}
      </table>
    </div>` : `
    <div style="padding:24px;text-align:center;color:#aaa;font-size:14px">
      Sin ventas registradas en este período
    </div>`}

    <!-- Footer -->
    <div style="background:#f9f9f9;padding:14px 20px;border-top:1px solid #eee;text-align:center">
      <p style="margin:0;font-size:11px;color:#aaa">Generado automáticamente por el sistema POS</p>
    </div>
  </div>
</body>
</html>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    'POS Reporte <onboarding@resend.dev>',
        to:      [email.trim()],
        subject: `${test ? '[Prueba] ' : ''}Reporte de ventas — ${dateLabel}`,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(
        { error: (err as { message?: string }).message || 'Error al enviar el correo' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, period: { start: start.toISOString(), end: end.toISOString() } })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error del servidor' },
      { status: 500 }
    )
  }
}
