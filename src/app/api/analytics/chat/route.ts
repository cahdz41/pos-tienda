import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { GoogleGenAI } from '@google/genai'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
const MODEL = 'gemini-2.5-flash'

type Period = 'today' | '7days' | 'month' | '30days'

function getRange(period: Period) {
  const now = new Date()
  switch (period) {
    case 'today':
      return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()), to: now }
    case '7days':
      return { from: new Date(Date.now() - 7 * 86_400_000), to: now }
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now }
    case '30days':
      return { from: new Date(Date.now() - 30 * 86_400_000), to: now }
  }
}

const PERIOD_LABELS: Record<Period, string> = {
  today:  'Hoy',
  '7days': 'Últimos 7 días',
  month:  'Este mes',
  '30days': 'Últimos 30 días',
}

type SaleRow = { id: string; total: number; payment_method: string; created_at: string }
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
type VarRow = { flavor: string | null; stock: number; min_stock: number; products: { name: string } | null }
type ExpRow = { flavor: string | null; stock: number; expiration_date: string; products: { name: string } | null }

async function buildContext(period: Period): Promise<string> {
  const { from, to } = getRange(period)
  const supabase = createAdminClient()

  const [salesRes, variantsRes, expiringRes] = await Promise.all([
    supabase
      .from('sales')
      .select('id, total, payment_method, created_at')
      .eq('status', 'completed')
      .gte('created_at', from.toISOString())
      .lte('created_at', to.toISOString())
      .order('created_at'),
    supabase
      .from('product_variants')
      .select('flavor, stock, min_stock, products(name)')
      .gt('stock', 0),
    supabase
      .from('product_variants')
      .select('flavor, stock, expiration_date, products(name)')
      .not('expiration_date', 'is', null)
      .lte('expiration_date', new Date(Date.now() + 30 * 86_400_000).toISOString())
      .gt('stock', 0)
      .order('expiration_date')
      .limit(10),
  ])

  const sales = (salesRes.data ?? []) as SaleRow[]
  const label = PERIOD_LABELS[period]
  let ctx = `PERÍODO: ${label} (${from.toLocaleDateString('es-MX')} – ${to.toLocaleDateString('es-MX')})\n\n`

  if (sales.length === 0) {
    ctx += 'No hay ventas registradas en este período.\n'
  } else {
    const saleIds = sales.map(s => s.id)
    const { data: itemsData } = await supabase
      .from('sale_items')
      .select('sale_id, quantity, subtotal, product_variants(cost_price, flavor, products(name, category))')
      .in('sale_id', saleIds)

    const items = (itemsData ?? []) as ItemRow[]

    // KPIs
    const revenue  = sales.reduce((s, x) => s + x.total, 0)
    const costSum  = items.reduce((s, i) => s + (i.product_variants?.cost_price ?? 0) * i.quantity, 0)
    const profit   = revenue - costSum
    const txCount  = sales.length
    const avgTicket = revenue / txCount
    const margin   = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : '0'

    ctx += `RESUMEN:\n`
    ctx += `- Ingresos totales: $${revenue.toFixed(2)}\n`
    ctx += `- Ganancia bruta: $${profit.toFixed(2)} (${margin}% margen)\n`
    ctx += `- Transacciones: ${txCount}\n`
    ctx += `- Ticket promedio: $${avgTicket.toFixed(2)}\n\n`

    // Métodos de pago
    const methodMap: Record<string, { count: number; total: number }> = {}
    for (const s of sales) {
      if (!methodMap[s.payment_method]) methodMap[s.payment_method] = { count: 0, total: 0 }
      methodMap[s.payment_method].count++
      methodMap[s.payment_method].total += s.total
    }
    const methodLabels: Record<string, string> = {
      cash: 'Efectivo', card: 'Tarjeta', mixed: 'Mixto', credit: 'Crédito a cliente',
    }
    ctx += `MÉTODOS DE PAGO:\n`
    for (const [k, d] of Object.entries(methodMap)) {
      ctx += `- ${methodLabels[k] ?? k}: ${d.count} ventas, $${d.total.toFixed(2)}\n`
    }
    ctx += '\n'

    // Por día de semana
    const dowMap: Record<string, { revenue: number; count: number }> = {}
    for (const s of sales) {
      const dow = new Date(s.created_at).toLocaleDateString('es-MX', { weekday: 'long' })
      if (!dowMap[dow]) dowMap[dow] = { revenue: 0, count: 0 }
      dowMap[dow].revenue += s.total
      dowMap[dow].count++
    }
    ctx += `VENTAS POR DÍA DE SEMANA:\n`
    for (const [dow, d] of Object.entries(dowMap).sort((a, b) => b[1].revenue - a[1].revenue)) {
      ctx += `- ${dow}: $${d.revenue.toFixed(2)} (${d.count} transacciones)\n`
    }
    ctx += '\n'

    // Top productos
    const prodMap: Record<string, { units: number; revenue: number; profit: number }> = {}
    for (const item of items) {
      const name = item.product_variants?.products?.name ?? 'Sin nombre'
      if (!prodMap[name]) prodMap[name] = { units: 0, revenue: 0, profit: 0 }
      prodMap[name].units   += item.quantity
      prodMap[name].revenue += item.subtotal
      const c = item.product_variants?.cost_price ?? 0
      prodMap[name].profit  += item.subtotal - c * item.quantity
    }
    const topProds = Object.entries(prodMap)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.units - a.units)
      .slice(0, 15)

    ctx += `TOP PRODUCTOS (por unidades):\n`
    for (let i = 0; i < topProds.length; i++) {
      const p = topProds[i]
      ctx += `${i + 1}. ${p.name}: ${p.units} uds, $${p.revenue.toFixed(2)} ingreso, $${p.profit.toFixed(2)} ganancia\n`
    }
    ctx += '\n'

    // Por categoría
    const catMap: Record<string, number> = {}
    for (const item of items) {
      const cat = item.product_variants?.products?.category ?? 'Sin categoría'
      catMap[cat] = (catMap[cat] || 0) + item.subtotal
    }
    ctx += `POR CATEGORÍA:\n`
    for (const [cat, rev] of Object.entries(catMap).sort((a, b) => b[1] - a[1])) {
      ctx += `- ${cat}: $${rev.toFixed(2)}\n`
    }
    ctx += '\n'
  }

  // Stock bajo
  const lowStock = ((variantsRes.data ?? []) as VarRow[])
    .filter(v => v.min_stock > 0 && v.stock <= v.min_stock)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 10)

  if (lowStock.length > 0) {
    ctx += `STOCK BAJO (en o por debajo del mínimo):\n`
    for (const v of lowStock) {
      const name   = v.products?.name ?? 'Sin nombre'
      const flavor = v.flavor ? ` (${v.flavor})` : ''
      ctx += `- ${name}${flavor}: ${v.stock} uds (mínimo: ${v.min_stock})\n`
    }
    ctx += '\n'
  }

  // Por vencer
  const expiring = (expiringRes.data ?? []) as ExpRow[]
  if (expiring.length > 0) {
    ctx += `PRÓXIMOS A VENCER (≤30 días):\n`
    for (const v of expiring) {
      const name   = v.products?.name ?? 'Sin nombre'
      const flavor = v.flavor ? ` (${v.flavor})` : ''
      const exp    = new Date(v.expiration_date).toLocaleDateString('es-MX')
      ctx += `- ${name}${flavor}: vence ${exp}, ${v.stock} uds disponibles\n`
    }
    ctx += '\n'
  }

  return ctx
}

const SYSTEM_PROMPT = `Eres un analista de datos del POS de Chocholand, tienda de suplementos deportivos.
El administrador te hace preguntas sobre sus ventas, inventario y operaciones.
Responde ÚNICAMENTE con base en los datos del contexto. No inventes cifras ni supongas datos ausentes.
Si los datos no son suficientes para responder, dilo claramente.
Respuestas concisas: máximo 3 párrafos o una lista corta. En español.`

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { question?: string; period?: string }
    const question = body.question?.trim()
    const period   = (body.period ?? '7days') as Period

    if (!question) {
      return NextResponse.json({ error: 'Pregunta requerida' }, { status: 400 })
    }

    const context = await buildContext(period)

    const result = await ai.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: question }] }],
      config: {
        systemInstruction: `${SYSTEM_PROMPT}\n\nDATOS DE TU TIENDA:\n${context}`,
      },
    })

    const answer = result.text?.trim() ?? 'No pude generar una respuesta en este momento.'
    return NextResponse.json({ answer }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error('[analytics/chat]', e)
    return NextResponse.json({ error: 'Error al procesar la pregunta' }, { status: 500 })
  }
}
