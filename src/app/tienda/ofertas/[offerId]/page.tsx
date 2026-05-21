import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import OfferFlavorSelector from '@/components/tienda/OfferFlavorSelector'
import type { StoreVariant } from '@/types'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ offerId: string }>
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://chocholand.com'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { offerId } = await params
  const id = parseInt(offerId, 10)
  if (isNaN(id)) return { title: 'Oferta no encontrada — Chocholand' }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data: offer } = await supabase
    .from('offers')
    .select('id, nombre, imagen')
    .eq('id', id)
    .single()

  if (!offer) {
    return { title: 'Oferta no encontrada — Chocholand' }
  }

  return {
    title: `${offer.nombre} — Oferta del Mes — Chocholand`,
    description: `Aprovecha esta oferta especial: ${offer.nombre}. Solo en Chocholand.`,
    openGraph: {
      title: `${offer.nombre} — Oferta del Mes — Chocholand`,
      description: `Aprovecha esta oferta especial: ${offer.nombre}. Solo en Chocholand.`,
      url: `${SITE_URL}/tienda/ofertas/${offer.id}`,
      siteName: 'Chocholand',
      locale: 'es_MX',
      type: 'article',
      images: offer.imagen ? [{ url: offer.imagen, alt: offer.nombre }] : undefined,
    },
  }
}

export default async function OfertaPage({ params }: Props) {
  const { offerId } = await params
  const id = parseInt(offerId, 10)
  if (isNaN(id)) notFound()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data: offer } = await supabase
    .from('offers')
    .select('*')
    .eq('id', id)
    .single()

  if (!offer) notFound()

  let productId = ''
  let productName = offer.nombre
  let productCategory = offer.categoria
  let productImage = offer.imagen
  let productDescription: string | null = null
  let variants: StoreVariant[] = []

  if (offer.variant_id) {
    // Obtener product_id de la variante
    const { data: variantRow } = await supabase
      .from('product_variants')
      .select('product_id')
      .eq('id', offer.variant_id)
      .single()

    if (variantRow?.product_id) {
      const { data: product } = await supabase
        .from('products')
        .select(`
          id, name, category, image_url, store_description,
          product_variants (
            id, flavor, sale_price, stock, image_url
          )
        `)
        .eq('id', variantRow.product_id)
        .single()

      if (product) {
        productId = product.id
        productName = product.name
        productCategory = product.category ?? offer.categoria
        productImage = offer.imagen ?? product.image_url
        productDescription = product.store_description
        variants = ((product.product_variants as StoreVariant[]) ?? [])
          .filter(v => v.stock > 0)
      }
    }
  }

  // Si no hay variantes reales, creamos una variante "dummy" para la oferta sin producto asociado
  const hasRealVariants = variants.length > 0
  if (!hasRealVariants) {
    variants = [{
      id: `offer-${offer.id}`,
      flavor: null,
      sale_price: offer.precio_oferta,
      stock: 999,
      image_url: offer.imagen,
    }]
    productId = `offer-product-${offer.id}`
  }

  const imageUrl = productImage ?? variants[0]?.image_url
  const pct = offer.precio_lista > 0
    ? Math.round(((offer.precio_lista - offer.precio_oferta) / offer.precio_lista) * 100)
    : 0

  return (
    <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '48px 24px 80px' }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: '40px' }}>
        <Link href="/tienda" style={{ fontSize: '13px', color: '#444444', textDecoration: 'none' }}>
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
          position: 'relative',
        }}>
          {pct > 0 && (
            <div style={{
              position: 'absolute', top: 16, left: 16, zIndex: 2,
              background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 800,
              padding: '5px 12px', borderRadius: 20,
            }}>
              -{pct}%
            </div>
          )}
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={productName}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <span style={{
              fontFamily: 'var(--font-syne, system-ui)',
              fontWeight: 800,
              fontSize: '120px',
              color: '#1A1A1A',
              userSelect: 'none',
            }}>
              {productName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>

        {/* Info */}
        <div>
          <div style={{
            display: 'inline-block',
            marginBottom: '12px',
            background: 'rgba(220,38,38,0.12)',
            border: '1px solid rgba(220,38,38,0.3)',
            color: '#ff5050',
            fontSize: 10, fontWeight: 800,
            padding: '4px 12px', borderRadius: 20,
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            🔥 Oferta del Mes
          </div>

          {productCategory && (
            <p style={{
              margin: '0 0 12px',
              fontSize: '11px',
              color: '#555555',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}>
              {productCategory}
            </p>
          )}

          <h1 style={{
            fontFamily: 'var(--font-syne, system-ui)',
            fontWeight: 800,
            fontSize: 'clamp(28px, 4vw, 52px)',
            color: '#FFFFFF',
            margin: '0 0 24px',
            lineHeight: 1.05,
            letterSpacing: '-1.5px',
          }}>
            {productName}
          </h1>

          {productDescription && (
            <p style={{
              fontSize: '15px',
              color: '#555555',
              lineHeight: 1.7,
              margin: '0 0 32px',
            }}>
              {productDescription}
            </p>
          )}

          {/* Leyenda de pago */}
          <div style={{
            marginBottom: '24px',
            padding: '14px 16px',
            background: 'rgba(240,180,41,0.06)',
            border: '1px solid rgba(240,180,41,0.2)',
            borderRadius: '12px',
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: '18px', lineHeight: 1, marginTop: '1px', flexShrink: 0 }}>💵</span>
            <div>
              <p style={{ margin: '0 0 3px', fontSize: '13px', fontWeight: 700, color: '#FFFFFF', lineHeight: 1.3 }}>
                Pago en efectivo o transferencia
              </p>
              <p style={{ margin: 0, fontSize: '12px', color: '#888888', lineHeight: 1.5 }}>
                Los productos en oferta del mes solo pueden pagarse en efectivo o transferencia.
              </p>
            </div>
          </div>

          <OfferFlavorSelector
            variants={variants}
            productId={productId}
            productName={productName}
            offerPrice={offer.precio_oferta}
            originalPrice={offer.precio_lista}
            offerId={offer.id}
            hasRealVariants={hasRealVariants}
            fallbackImageUrl={imageUrl}
          />
        </div>
      </div>
    </main>
  )
}
