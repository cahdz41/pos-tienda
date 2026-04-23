import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  // Categorías ocultas
  const { data: catData } = await supabase
    .from('store_category_visibility')
    .select('name')
    .eq('visible', false)
  const hiddenCats = new Set((catData ?? []).map((c: { name: string }) => c.name))

  const { data, error } = await supabase
    .from('products')
    .select(`
      id, name, category, image_url, store_description,
      product_variants (
        id, flavor, sale_price, stock, image_url
      )
    `)
    .eq('store_visible', true)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Excluir categorías ocultas; solo variantes con stock > 0
  const products = (data ?? [])
    .filter(p => !hiddenCats.has(p.category))
    .map(p => ({
      ...p,
      product_variants: p.product_variants.filter((v: { stock: number }) => v.stock > 0),
    }))
    .filter(p => p.product_variants.length > 0)

  return NextResponse.json(products)
}
