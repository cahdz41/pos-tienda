import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'
import { requireOwner } from '@/lib/ownerApiAuth'

export const dynamic = 'force-dynamic'

interface ProductListRow {
  id: string
  name: string
  brand: string | null
  category: string | null
  image_url: string | null
  store_visible: boolean
  product_variants: Array<{ id: string; flavor: string | null; barcode: string; stock: number }>
}

interface ContentListRow {
  product_id: string
  status: string
  researched_at: string | null
  updated_at: string | null
  research_usage: Record<string, unknown> | null
}

export async function GET(request: NextRequest) {
  const auth = await requireOwner(request)
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(request.url)
  const query = (searchParams.get('q') ?? '').trim().slice(0, 100)
  const requestedLimit = Number.parseInt(searchParams.get('limit') ?? '40', 10)
  const limit = Number.isFinite(requestedLimit) ? Math.min(80, Math.max(1, requestedLimit)) : 40
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  let productsQuery = supabase
    .from('products')
    .select(`
      id, name, brand, category, image_url, store_visible,
      product_variants (id, flavor, barcode, stock)
    `)
    .order('name')
    .limit(limit)

  if (query) productsQuery = productsQuery.ilike('name', `%${query.replace(/[%_]/g, '')}%`)

  const { data: products, error: productsError } = await productsQuery
  if (productsError) {
    return NextResponse.json({ error: productsError.message }, { status: 500 })
  }

  const productRows = (products ?? []) as ProductListRow[]
  const productIds = productRows.map(product => product.id)
  let contentByProduct: Record<string, unknown> = {}

  if (productIds.length) {
    const { data: contents, error: contentError } = await supabase
      .from('store_product_content')
      .select('product_id, status, researched_at, updated_at, research_usage')
      .in('product_id', productIds)

    if (contentError) {
      return NextResponse.json({
        error: 'La migración de fichas de producto todavía no está aplicada en Supabase.',
        detail: contentError.message,
      }, { status: 503 })
    }
    contentByProduct = Object.fromEntries(((contents ?? []) as ContentListRow[]).map(content => [content.product_id, content]))
  }

  return NextResponse.json({
    products: productRows.map(product => ({
      ...product,
      content: contentByProduct[product.id] ?? null,
    })),
  })
}
