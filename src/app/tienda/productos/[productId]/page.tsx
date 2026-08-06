import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import FlavorSelector from '@/components/tienda/FlavorSelector'
import type { StoreVariant } from '@/types'
import type { Metadata } from 'next'
import { cldUrl } from '@/lib/cloudinary'
import ProductEnrichedContent from '@/components/tienda/ProductEnrichedContent'
import ProductAnalytics from '@/components/tienda/ProductAnalytics'
import type { StoreProductContent } from '@/lib/storeProductContent'
import RelatedProductsCarousel from '@/components/tienda/RelatedProductsCarousel'
import { getRelatedProducts } from '@/lib/relatedProductsServer'

interface Props {
  params: Promise<{ productId: string }>
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://chocholand.com'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { productId } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const [{ data: product }, { data: enrichedContent }] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, category, image_url, store_description')
      .eq('id', productId)
      .eq('store_visible', true)
      .single(),
    supabase
      .from('store_product_content')
      .select('short_description')
      .eq('product_id', productId)
      .eq('status', 'published')
      .maybeSingle(),
  ])

  if (!product) {
    return {
      title: 'Producto no encontrado — Chocholand',
    }
  }

  const imageUrl = product.image_url ?? null
  const description = enrichedContent?.short_description ?? product.store_description ?? `Compra ${product.name} en Chocholand. Suplementos y nutrición deportiva de calidad.`

  return {
    title: `${product.name} — Chocholand`,
    description,
    openGraph: {
      title: `${product.name} — Chocholand`,
      description,
      url: `${SITE_URL}/tienda/productos/${product.id}`,
      siteName: 'Chocholand',
      locale: 'es_MX',
      type: 'article',
      images: imageUrl
        ? [{ url: imageUrl, alt: product.name }]
        : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${product.name} — Chocholand`,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
    alternates: {
      canonical: `${SITE_URL}/tienda/productos/${product.id}`,
    },
  }
}

export default async function ProductoPage({ params }: Props) {
  const { productId } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data: product } = await supabase
    .from('products')
    .select(`
      id, name, category, image_url, store_description,
      product_variants (
        id, flavor, sale_price, stock, image_url
      )
    `)
    .eq('id', productId)
    .single()

  if (!product) notFound()

  const { data: enrichedContent } = await supabase
    .from('store_product_content')
    .select('*')
    .eq('product_id', productId)
    .eq('status', 'published')
    .maybeSingle()

  const variants = (product.product_variants as StoreVariant[]).filter(v => v.stock > 0)
  if (variants.length === 0) notFound()

  const imageUrl = product.image_url ?? variants[0]?.image_url
  const related = await getRelatedProducts(supabase, product.id, product.category, variants)

  return (
    <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '48px 24px 80px' }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: '40px' }}>
        <Link href="/tienda" style={{
          fontSize: '13px',
          color: '#444444',
          textDecoration: 'none',
        }}>
          ← Catálogo
        </Link>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '64px',
        alignItems: 'start',
      }}>
        {/* Imagen */}
        <div style={{
          aspectRatio: '1',
          background: '#111111',
          border: '1px solid #1A1A1A',
          borderRadius: '16px',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {imageUrl ? (
            <img
              src={cldUrl(imageUrl, { width: 700 })}
              alt={product.name}
              style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '16px' }}
            />
          ) : (
            <span style={{
              fontFamily: 'var(--font-barlow-condensed, system-ui)',
              fontWeight: 800,
              fontSize: '120px',
              color: '#1A1A1A',
              userSelect: 'none',
            }}>
              {product.name.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        {/* Info */}
        <div>
          {product.category && (
            <p style={{
              margin: '0 0 12px',
              fontSize: '11px',
              color: '#555555',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}>
              {product.category}
            </p>
          )}

          <h1 style={{
            fontFamily: 'var(--font-barlow-condensed, system-ui)',
            fontWeight: 800,
            fontSize: 'clamp(28px, 4vw, 52px)',
            color: '#FFFFFF',
            margin: '0 0 24px',
            lineHeight: 1.05,
            letterSpacing: '-1.5px',
          }}>
            {product.name}
          </h1>

          {(enrichedContent?.short_description || product.store_description) && (
            <p style={{
              fontSize: '15px',
              color: '#555555',
              lineHeight: 1.7,
              margin: '0 0 32px',
            }}>
              {enrichedContent?.short_description ?? product.store_description}
            </p>
          )}

          <FlavorSelector
            variants={variants}
            productId={product.id}
            productName={product.name}
            fallbackImageUrl={imageUrl}
            entryPoint="direct"
          />
        </div>
      </div>
      {enrichedContent && (
        <ProductEnrichedContent
          content={enrichedContent as StoreProductContent}
          showDescription={false}
        />
      )}
      <RelatedProductsCarousel
        products={related.products}
        offers={related.offers}
        category={product.category}
      />
      <ProductAnalytics productId={product.id} entryPoint="direct" />
    </main>
  )
}
