import 'server-only'

// Resuelve productos del catálogo para los tres pasos de generación con IA
// (ideas, caption, imagen). Centralizado porque los tres endpoints necesitan
// exactamente los mismos datos: nombre, marca, categoría, descripción
// publicada (si existe ficha) y la foto real del producto en Cloudinary.

export interface ResolvedSocialPostProduct {
  id: string
  name: string
  brand: string | null
  category: string | null
  short_description: string
  sale_price: number | null
  image_url: string | null
}

interface ProductRow {
  id: string
  name: string
  brand: string | null
  category: string | null
  image_url: string | null
  product_variants: Array<{ image_url: string | null; sale_price: number | null }> | null
}

interface ContentRow {
  product_id: string
  status: string
  short_description: string
}

export async function resolveSocialPostProducts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  productIds: string[],
): Promise<ResolvedSocialPostProduct[]> {
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select(`
      id, name, brand, category, image_url,
      product_variants (image_url, sale_price)
    `)
    .in('id', productIds)
  if (productsError) throw new Error(productsError.message)

  const { data: contentRows, error: contentError } = await supabase
    .from('store_product_content')
    .select('product_id, status, short_description')
    .in('product_id', productIds)
  if (contentError) throw new Error(contentError.message)

  const shortDescriptionByProduct = new Map(
    ((contentRows ?? []) as ContentRow[])
      .filter(row => row.status === 'published')
      .map(row => [row.product_id, row.short_description]),
  )

  const byId = new Map(((products ?? []) as ProductRow[]).map(product => [product.id, product]))

  return productIds
    .map(id => byId.get(id))
    .filter((product): product is ProductRow => Boolean(product))
    .map(product => {
      const variants = product.product_variants ?? []
      const referenceImage = product.image_url || variants.find(variant => variant.image_url)?.image_url || null
      const salePrices = variants
        .map(variant => variant.sale_price)
        .filter((price): price is number => typeof price === 'number' && Number.isFinite(price))

      return {
        id: product.id,
        name: product.name,
        brand: product.brand,
        category: product.category,
        short_description: shortDescriptionByProduct.get(product.id) ?? '',
        sale_price: salePrices.length ? Math.min(...salePrices) : null,
        image_url: referenceImage,
      }
    })
}
