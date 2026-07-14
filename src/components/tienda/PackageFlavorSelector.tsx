'use client'

import { useState } from 'react'
import { useStoreCart } from '@/contexts/StoreCartContext'
import type { StoreVariant } from '@/types'
import { cldUrl } from '@/lib/cloudinary'

interface ProductDetail {
  packageProduct: {
    nombre: string
    imagen: string | null
    categoria: string
    variant_id?: string | null
  }
  productId: string
  productName: string
  productImage: string | null
  variants: StoreVariant[]
}

interface Props {
  packageId: number
  packageName: string
  packagePrice: number
  products: ProductDetail[]
  allAvailable: boolean
}

export default function PackageFlavorSelector({
  packageId,
  packageName,
  packagePrice,
  products,
  allAvailable,
}: Props) {
  const { addPackageItems } = useStoreCart()
  const [added, setAdded] = useState(false)

  // Estado de selección: índice del producto -> variante seleccionada
  const initialSelections: Record<number, StoreVariant> = {}
  products.forEach((p, i) => {
    if (p.variants[0]) initialSelections[i] = p.variants[0]
  })
  const [selections, setSelections] = useState<Record<number, StoreVariant>>(initialSelections)

  function handleSelectVariant(productIndex: number, variant: StoreVariant) {
    setSelections(prev => ({ ...prev, [productIndex]: variant }))
  }

  function handleAddToCart() {
    const items: Parameters<typeof addPackageItems>[0] = []

    for (let i = 0; i < products.length; i++) {
      const p = products[i]
      const selected = selections[i]

      if (p.variants.length > 0 && selected) {
        items.push({
          variantId: selected.id,
          productId: p.productId || `pkg-product-${packageId}-${i}`,
          productName: p.productName,
          flavor: selected.flavor,
          price: selected.sale_price,
          imageUrl: selected.image_url ?? p.productImage,
          originalPrice: selected.sale_price,
        })
      } else if (!p.packageProduct.variant_id) {
        // Producto sin variant_id en el paquete: agregar como item dummy
        items.push({
          variantId: `pkg-dummy-${packageId}-${i}`,
          productId: `pkg-product-${packageId}-${i}`,
          productName: p.productName,
          flavor: null,
          price: 0,
          imageUrl: p.productImage,
          originalPrice: 0,
        })
      }
    }

    if (items.length === 0) return

    addPackageItems(items, packageId, packageName, packagePrice)
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {products.map((p, i) => {
        const selected = selections[i]
        const hasFlavors = p.variants.some(v => v.flavor !== null)
        const hasVariants = p.variants.length > 0

        return (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '24px',
              alignItems: 'start',
              padding: '20px',
              background: '#111111',
              border: '1px solid #1A1A1A',
              borderRadius: '14px',
            }}
          >
            {/* Imagen + info básica */}
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div style={{
                width: '80px', height: '80px',
                background: '#1A1A1A', borderRadius: '10px',
                flexShrink: 0, overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {p.productImage ? (
                  <img
                    src={cldUrl(p.productImage, { width: 160 })}
                    alt={p.productName}
                    loading="lazy"
                    decoding="async"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <span style={{
                    fontFamily: 'var(--font-syne, system-ui)',
                    fontWeight: 800, fontSize: '28px', color: '#2A2A2A',
                  }}>
                    {p.productName.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <p style={{
                  fontSize: '10px', color: '#cc2020',
                  textTransform: 'uppercase', fontWeight: 700,
                  letterSpacing: '0.12em', margin: '0 0 4px',
                }}>
                  {p.packageProduct.categoria}
                </p>
                <p style={{
                  fontSize: '15px', fontWeight: 700, color: '#FFFFFF',
                  margin: 0, lineHeight: 1.3,
                }}>
                  {p.productName}
                </p>
                {!hasVariants && p.packageProduct.variant_id && (
                  <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#FF6666' }}>
                    Agotado temporalmente
                  </p>
                )}
                {!p.packageProduct.variant_id && (
                  <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#888888' }}>
                    Producto incluido en el paquete
                  </p>
                )}
              </div>
            </div>

            {/* Selector de sabores */}
            {hasFlavors && hasVariants && selected && p.packageProduct.variant_id && (
              <div>
                <p style={{
                  fontSize: '11px', color: '#555555',
                  textTransform: 'uppercase', letterSpacing: '0.1em',
                  margin: '0 0 10px',
                }}>
                  Sabor
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {p.variants.map(v => (
                    <button
                      key={v.id}
                      onClick={() => handleSelectVariant(i, v)}
                      style={{
                        padding: '8px 16px', borderRadius: '8px', border: '1px solid',
                        borderColor: selected.id === v.id ? '#F0B429' : '#2A2A2A',
                        background: selected.id === v.id ? 'rgba(240,180,41,0.08)' : 'transparent',
                        color: selected.id === v.id ? '#F0B429' : '#888888',
                        fontSize: '13px', fontWeight: 500,
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}
                    >
                      {v.flavor}
                    </button>
                  ))}
                </div>
                <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#4CAF50' }}>
                  {selected.stock > 10 ? '● En stock' : `● Últimas ${selected.stock} unidades`}
                </p>
              </div>
            )}

            {hasVariants && !hasFlavors && selected && p.packageProduct.variant_id && (
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: '#4CAF50' }}>
                  {selected.stock > 10 ? '● En stock' : `● Últimas ${selected.stock} unidades`}
                </span>
              </div>
            )}
          </div>
        )
      })}

      {/* Botón agregar paquete */}
      <div style={{
        padding: '24px',
        background: '#0D0D0D',
        border: '1px solid #1A1A1A',
        borderRadius: '14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '24px',
        flexWrap: 'wrap',
      }}>
        <div>
          <p style={{ margin: '0 0 4px', fontSize: '13px', color: '#555555' }}>
            Precio del paquete
          </p>
          <span style={{
            fontFamily: 'var(--font-syne, system-ui)',
            fontWeight: 800, fontSize: '28px', color: '#4ade80',
          }}>
            ${packagePrice.toFixed(2)}
          </span>
          <span style={{ fontSize: '13px', color: '#444444', marginLeft: '6px' }}>MXN</span>
        </div>

        <button
          onClick={handleAddToCart}
          disabled={!allAvailable || added}
          style={{
            padding: '16px 32px',
            background: !allAvailable ? '#1A1A1A' : added ? '#1A3A1A' : '#F0B429',
            border: added ? '1px solid #2D5A2D' : 'none',
            borderRadius: '12px',
            color: !allAvailable ? '#444444' : added ? '#4CAF50' : '#000000',
            fontSize: '15px', fontWeight: 700,
            fontFamily: 'var(--font-syne, system-ui)',
            cursor: !allAvailable ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            letterSpacing: '0.03em',
            whiteSpace: 'nowrap',
          }}
        >
          {!allAvailable
            ? 'Producto agotado'
            : added
              ? '✓ Paquete agregado'
              : 'Agregar paquete al carrito'}
        </button>
      </div>
    </div>
  )
}
