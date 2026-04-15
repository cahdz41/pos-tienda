import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )

  const { data, error } = await supabase
    .from('products')
    .select(`
      id, name, category, image_url, store_description,
      product_variants (
        id, flavor, sale_price, stock, image_url
      )
    `)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Solo variantes con stock > 0; excluir productos que quedan sin variantes
  const products = (data ?? [])
    .map(p => ({
      ...p,
      product_variants: p.product_variants.filter((v: { stock: number }) => v.stock > 0),
    }))
    .filter(p => p.product_variants.length > 0)

  return NextResponse.json(products)
}
