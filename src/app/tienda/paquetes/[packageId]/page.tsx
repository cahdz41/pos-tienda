import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import PackageFlavorSelector from '@/components/tienda/PackageFlavorSelector'
import type { StoreVariant, Package, PackageProduct } from '@/types'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ packageId: string }>
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://chocholand.com'

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { packageId } = await params
  const id = parseInt(packageId, 10)
  if (isNaN(id)) return { title: 'Paquete no encontrado — Chocholand' }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data: pkg } = await supabase
    .from('packages')
    .select('id, nombre')
    .eq('id', id)
    .eq('activo', true)
    .single()

  if (!pkg) {
    return { title: 'Paquete no encontrado — Chocholand' }
  }

  return {
    title: `${pkg.nombre} — Paquete en Oferta — Chocholand`,
    description: `Aprovecha el paquete ${pkg.nombre} a precio especial. Solo en Chocholand.`,
    openGraph: {
      title: `${pkg.nombre} — Paquete en Oferta — Chocholand`,
      description: `Aprovecha el paquete ${pkg.nombre} a precio especial. Solo en Chocholand.`,
      url: `${SITE_URL}/tienda/paquetes/${pkg.id}`,
      siteName: 'Chocholand',
      locale: 'es_MX',
      type: 'article',
    },
  }
}

interface ProductDetail {
  packageProduct: PackageProduct
  productId: string
  productName: string
  productImage: string | null
  variants: StoreVariant[]
}

export default async function PaquetePage({ params }: Props) {
  const { packageId } = await params
  const id = parseInt(packageId, 10)
  if (isNaN(id)) notFound()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  const { data: pkg } = await supabase
    .from('packages')
    .select('*')
    .eq('id', id)
    .eq('activo', true)
    .single()

  if (!pkg) notFound()

  const typedPkg = pkg as Package
  const productos = typedPkg.productos ?? []

  // Obtener variant_ids únicos del paquete
  const variantIds = productos
    .map(p => p.variant_id)
    .filter((v): v is string => !!v)

  // Mapa: variant_id -> product_id
  const variantToProduct = new Map<string, string>()
  // Mapa: product_id -> { name, image_url, variants[] }
  const productMap = new Map<string, { name: string; image_url: string | null; variants: StoreVariant[] }>()

  if (variantIds.length > 0) {
    const { data: variantRows } = await supabase
      .from('product_variants')
      .select('id, product_id')
      .in('id', variantIds)

    for (const v of (variantRows ?? [])) {
      if (v.product_id) variantToProduct.set(v.id, v.product_id)
    }

    const productIds = [...new Set(variantToProduct.values())]

    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from('products')
        .select(`
          id, name, image_url,
          product_variants (
            id, flavor, sale_price, stock, image_url
          )
        `)
        .in('id', productIds)

      for (const p of (products ?? [])) {
        productMap.set(p.id, {
          name: p.name,
          image_url: p.image_url,
          variants: ((p.product_variants as StoreVariant[]) ?? []).filter(v => v.stock > 0),
        })
      }
    }
  }

  // Construir detalles de cada producto del paquete
  const details: ProductDetail[] = productos.map(pp => {
    const productId = pp.variant_id ? (variantToProduct.get(pp.variant_id) ?? '') : ''
    const productInfo = productId ? productMap.get(productId) : undefined
    // Buscar imagen de la variante específica del paquete como fallback
    const variantImage = pp.variant_id
      ? productInfo?.variants.find(v => v.id === pp.variant_id)?.image_url
      : undefined

    return {
      packageProduct: pp,
      productId,
      productName: productInfo?.name ?? pp.nombre.split(' — ')[0].trim(),
      productImage: pp.imagen ?? variantImage ?? productInfo?.image_url ?? null,
      variants: productInfo?.variants ?? [],
    }
  })

  // Verificar que todos los productos con variant_id tengan al menos una variante disponible
  const allAvailable = details.every(d =>
    !d.packageProduct.variant_id || d.variants.length > 0
  )

  const pct = typedPkg.precio_lista > 0
    ? Math.round(((typedPkg.precio_lista - typedPkg.precio_oferta) / typedPkg.precio_lista) * 100)
    : 0

  return (
    <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '48px 24px 80px' }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: '40px' }}>
        <Link href="/tienda" style={{ fontSize: '13px', color: '#444444', textDecoration: 'none' }}>
          ← Catálogo
        </Link>
      </div>

      {/* Header del paquete */}
      <div style={{ marginBottom: '48px' }}>
        <div style={{
          display: 'inline-block',
          marginBottom: '12px',
          background: 'rgba(251,191,36,0.1)',
          border: '1px solid rgba(251,191,36,0.3)',
          color: '#fbbf24',
          fontSize: 10, fontWeight: 800,
          padding: '4px 12px', borderRadius: 20,
          letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          🎁 Paquete en Oferta
        </div>

        <h1 style={{
          fontFamily: 'var(--font-barlow-condensed, system-ui)',
          fontWeight: 800,
          fontSize: 'clamp(28px, 4vw, 52px)',
          color: '#FFFFFF',
          margin: '0 0 16px',
          lineHeight: 1.05,
          letterSpacing: '-1.5px',
        }}>
          {typedPkg.nombre}
        </h1>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'var(--font-barlow-condensed, system-ui)',
            fontWeight: 700, fontSize: '36px', color: '#4ade80',
          }}>
            ${typedPkg.precio_oferta.toFixed(2)}
          </span>
          <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.35)', textDecoration: 'line-through' }}>
            ${typedPkg.precio_lista.toFixed(2)}
          </span>
          <span style={{ fontSize: '13px', color: '#444444' }}>MXN</span>
          {pct > 0 && (
            <span style={{
              background: '#dc2626', color: '#fff', fontSize: 12, fontWeight: 800,
              padding: '4px 10px', borderRadius: 20,
            }}>
              -{pct}%
            </span>
          )}
        </div>
      </div>

      {/* Leyenda de pago */}
      <div style={{
        marginBottom: '40px',
        padding: '16px 18px',
        background: 'rgba(240,180,41,0.06)',
        border: '1px solid rgba(240,180,41,0.2)',
        borderRadius: '12px',
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
      }}>
        <span style={{ fontSize: '20px', lineHeight: 1, marginTop: '1px', flexShrink: 0 }}>💵</span>
        <div>
          <p style={{ margin: '0 0 3px', fontSize: '14px', fontWeight: 700, color: '#FFFFFF', lineHeight: 1.3 }}>
            Pago en efectivo o transferencia
          </p>
          <p style={{ margin: 0, fontSize: '13px', color: '#888888', lineHeight: 1.5 }}>
            Los paquetes en oferta solo pueden pagarse en efectivo o transferencia.
          </p>
        </div>
      </div>

      {/* Productos del paquete */}
      <h2 style={{
        fontFamily: 'var(--font-barlow-condensed, system-ui)',
        fontWeight: 700,
        fontSize: '18px',
        color: '#FFFFFF',
        margin: '0 0 24px',
        letterSpacing: '-0.5px',
      }}>
        Productos incluidos
      </h2>

      <PackageFlavorSelector
        packageId={typedPkg.id}
        packageName={typedPkg.nombre}
        packagePrice={typedPkg.precio_oferta}
        products={details}
        allAvailable={allAvailable}
      />
    </main>
  )
}
