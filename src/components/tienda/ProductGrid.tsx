import type { StoreProduct, Offer } from '@/types'
import ProductCard from './ProductCard'

interface Props {
  products: StoreProduct[]
  offersByVariant?: Map<string, Offer>
}

export default function ProductGrid({ products, offersByVariant }: Props) {
  if (products.length === 0) {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: '15px', color: '#333333', margin: 0 }}>
          No hay productos disponibles en esta categoría.
        </p>
      </div>
    )
  }

  return (
    <>
      <style>{`
        .product-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 16px;
        }
        @media (max-width: 640px) {
          .product-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
          }
        }
      `}</style>
      <div className="product-grid">
        {products.map(product => (
          <ProductCard
            key={product.id}
            product={product}
            offersByVariant={offersByVariant}
          />
        ))}
      </div>
    </>
  )
}
