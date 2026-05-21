import { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://chocholand.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  // Rutas estáticas de la tienda
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/tienda`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${SITE_URL}/tienda/carrito`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  ]

  // Productos visibles en tienda
  const { data: products, error } = await supabase
    .from('products')
    .select('id, updated_at')
    .eq('store_visible', true)
    .order('updated_at', { ascending: false })

  if (error || !products) {
    return staticRoutes
  }

  const productRoutes: MetadataRoute.Sitemap = products.map(product => ({
    url: `${SITE_URL}/tienda/productos/${product.id}`,
    lastModified: product.updated_at ? new Date(product.updated_at) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  return [...staticRoutes, ...productRoutes]
}
