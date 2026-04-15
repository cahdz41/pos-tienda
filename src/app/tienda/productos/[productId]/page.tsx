import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import FlavorSelector from '@/components/tienda/FlavorSelector'
import type { StoreVariant } from '@/types'

interface Props {
  params: Promise<{ productId: string }>
}

export default async function ProductoPage({ params }: Props) {
  const { productId } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
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
    .eq('store_visible', true)
    .single()

  if (!product) notFound()

  const variants = (product.product_variants as StoreVariant[]).filter(v => v.stock > 0)
  if (variants.length === 0) notFound()

  const imageUrl = product.image_url ?? variants[0]?.image_url

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
              src={imageUrl}
              alt={product.name}
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
            fontFamily: 'var(--font-syne, system-ui)',
            fontWeight: 800,
            fontSize: 'clamp(28px, 4vw, 52px)',
            color: '#FFFFFF',
            margin: '0 0 24px',
            lineHeight: 1.05,
            letterSpacing: '-1.5px',
          }}>
            {product.name}
          </h1>

          {product.store_description && (
            <p style={{
              fontSize: '15px',
              color: '#555555',
              lineHeight: 1.7,
              margin: '0 0 32px',
            }}>
              {product.store_description}
            </p>
          )}

          <FlavorSelector variants={variants} />
        </div>
      </div>
    </main>
  )
}
