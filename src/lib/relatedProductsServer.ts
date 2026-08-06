import type { SupabaseClient } from '@supabase/supabase-js'
import type { Offer, StoreProduct, StoreVariant } from '@/types'
import { minimumAvailablePrice, selectRelatedProducts } from '@/lib/relatedProducts'

interface RelatedProductsResult {
  products: StoreProduct[]
  offers: Offer[]
}

export async function getRelatedProducts(
  supabase: SupabaseClient,
  currentProductId: string,
  category: string | null,
  currentVariants: StoreVariant[],
): Promise<RelatedProductsResult> {
  if (!category) return { products: [], offers: [] }

  const [{ data: visibility }, { data: candidates, error }] = await Promise.all([
    supabase
      .from('store_category_visibility')
      .select('visible')
      .eq('name', category)
      .maybeSingle(),
    supabase
      .from('products')
      .select(`
        id, name, category, image_url, store_description,
        product_variants (
          id, flavor, sale_price, stock, image_url
        )
      `)
      .eq('store_visible', true)
      .eq('category', category),
  ])

  if (visibility?.visible === false || error) {
    return { products: [], offers: [] }
  }

  const products = selectRelatedProducts(
    (candidates ?? []) as StoreProduct[],
    currentProductId,
    category,
    minimumAvailablePrice(currentVariants),
  )

  const variantIds = products.flatMap(product => product.product_variants.map(variant => variant.id))
  if (variantIds.length === 0) return { products, offers: [] }

  const { data: offers } = await supabase
    .from('offers')
    .select('*')
    .in('variant_id', variantIds)
    .order('created_at', { ascending: false })

  return { products, offers: (offers ?? []) as Offer[] }
}
