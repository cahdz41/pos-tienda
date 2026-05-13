import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
const MODEL = 'gemini-2.5-flash'

type ItemRow = {
  sale_id: string
  quantity: number
  subtotal: number
  product_variants: {
    cost_price: number
    flavor: string | null
    products: { name: string; category: string | null } | null
  } | null
}
type VarRow  = { flavor: string | null; stock: number; min_stock: number; products: { name: string } | null }
type ExpRow  = { flavor: string | null; stock: number; expiration_date: string; products: { name: string } | null }

export async function POST(req: NextRequest) {
  try {
    const { shiftId } = await req.json() as { shiftId?: string }
    if (!shiftId) {
      return NextResponse.json({ error: 'shiftId requerido' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const [shiftRes, salesRes, variantsRes, expiringRes] = await Promise.all([
      supabase.from('shifts').select('*').eq('id', shiftId).single(),
      supabase.from('sales')
        .select('id, total, payment_method, created_at')
        .eq('shift_id', shiftId)
        .eq('status', 'completed'),
      supabase.from('product_variants')
        .select('flavor, stock, min_stock, products(name)')
        .gt('stock', 0),
      supabase.from('product_variants')
        .select('flavor, stock, expiration_date, products(name)')
        .not('expiration_date', 'is', null)
        .lte('expiration_date', new Date(Date.now() + 30 * 86_400_000).toISOString())
        .gt('stock', 0)
        .order('expiration_date')
        .limit(5),
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shift = shiftRes.data as any
    const sales = (salesRes.data ?? []) as { id: string; total: number; payment_method: string; created_at: string }[]

    // ── Contexto del turno ────────────────────────────────────────────────
    const openedAt = shift ? new Date(shift.opened_at) : new Date()
    const now = new Date()
    const mins = Math.round((now.getTime() - openedAt.getTime()) / 60_000)
    const durationStr = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}min` : `${mins} min`

    let ctx = `TURNO:\n`
    ctx += `- Apertura: ${openedAt.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}\n`
    ctx += `- Duración: ${durationStr}\n`
    ctx += `- Fondo inicial: $${(shift?.opening_amount ?? 0).toFixed(2)}\n\n`

    if (sales.length === 0) {
      ctx += 'VENTAS: Sin ventas registradas en este turno.\n\n'
    } else {
      const saleIds = sales.map(s => s.id)
      const { data: itemsData } = await supabase
        .from('sale_items')
        .select('sale_id, quantity, subtotal, product_variants(cost_price, flavor, products(name, category))')
        .in('sale_id', saleIds)

      const items = (itemsData ?? []) as ItemRow[]

      const revenue  = sales.reduce((s, x) => s + x.total, 0)
      const costSum  = items.reduce((s, i) => s + (i.product_variants?.cost_price ?? 0) * i.quantity, 0)
      const profit   = revenue - costSum
      const txCount  = sales.length
      const avgTicket = revenue / txCount

      const methodTotals: Record<string, number> = {}
      for (const s of sales) {
        methodTotals[s.payment_method] = (methodTotals[s.payment_method] || 0) + s.total
      }

      const methodLabels: Record<string, string> = {
        cash: 'Efectivo', card: 'Tarjeta', mixed: 'Mixto', credit: 'Crédito',
      }

      ctx += `VENTAS:\n`
      ctx += `- Total: $${revenue.toFixed(2)}\n`
      ctx += `- Ganancia estimada: $${profit.toFixed(2)} (${revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : 0}% margen)\n`
      ctx += `- Transacciones: ${txCount}\n`
      ctx += `- Ticket promedio: $${avgTicket.toFixed(2)}\n`
      for (const [k, v] of Object.entries(methodTotals)) {
        ctx += `- ${methodLabels[k] ?? k}: $${v.toFixed(2)}\n`
      }
      ctx += '\n'

      // Top productos
      const prodMap: Record<string, { units: number; revenue: number }> = {}
      for (const item of items) {
        const name = item.product_variants?.products?.name ?? 'Sin nombre'
        if (!prodMap[name]) prodMap[name] = { units: 0, revenue: 0 }
        prodMap[name].units   += item.quantity
        prodMap[name].revenue += item.subtotal
      }
      const topProds = Object.entries(prodMap)
        .map(([name, d]) => ({ name, ...d }))
        .sort((a, b) => b.units - a.units)
        .slice(0, 5)

      if (topProds.length > 0) {
        ctx += `TOP PRODUCTOS DEL TURNO:\n`
        for (const p of topProds) {
          ctx += `- ${p.name}: ${p.units} uds ($${p.revenue.toFixed(2)})\n`
        }
        ctx += '\n'
      }
    }

    // Stock bajo
    const lowStock = ((variantsRes.data ?? []) as VarRow[])
      .filter(v => v.min_stock > 0 && v.stock <= v.min_stock)
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 5)

    if (lowStock.length > 0) {
      ctx += `STOCK BAJO:\n`
      for (const v of lowStock) {
        const name   = v.products?.name ?? 'Sin nombre'
        const flavor = v.flavor ? ` (${v.flavor})` : ''
        ctx += `- ${name}${flavor}: ${v.stock} uds (mín: ${v.min_stock})\n`
      }
      ctx += '\n'
    }

    // Por vencer
    const expiring = (expiringRes.data ?? []) as ExpRow[]
    if (expiring.length > 0) {
      ctx += `POR VENCER (≤30 días):\n`
      for (const v of expiring) {
        const name     = v.products?.name ?? 'Sin nombre'
        const flavor   = v.flavor ? ` (${v.flavor})` : ''
        const daysLeft = Math.ceil((new Date(v.expiration_date).getTime() - Date.now()) / 86_400_000)
        ctx += `- ${name}${flavor}: vence en ${daysLeft} días, ${v.stock} uds\n`
      }
      ctx += '\n'
    }

    // ── Gemini ────────────────────────────────────────────────────────────
    const systemPrompt = `Eres el analista interno del POS de Chocholand, tienda de suplementos deportivos.
Genera un resumen ejecutivo del turno usando los datos proporcionados.

Estructura (no pongas encabezados, solo el contenido con emojis):
1. Métricas clave: total vendido, ganancia, transacciones, ticket promedio
2. Puntos destacados: producto estrella del turno, método de pago dominante
3. Alertas: si hay stock bajo o productos por vencer, mencionarlos brevemente
4. Una observación breve y accionable (máximo 2 líneas)

Usa emojis para hacer el texto escaneable. Máximo 15 líneas. En español. Solo datos concretos, sin relleno.`

    const result = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: `Genera el resumen de cierre de este turno:\n\n${ctx}` }] }],
      config: { systemInstruction: systemPrompt },
    })

    const summary = result.text?.trim() ?? 'No se pudo generar el resumen.'
    return NextResponse.json({ summary }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[turnos/summary]', e)
    return NextResponse.json({ error: 'Error al generar resumen' }, { status: 500 })
  }
}
