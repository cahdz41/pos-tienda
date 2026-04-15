import type { StoreProduct } from '@/types'
import ProductCard from './ProductCard'

interface Props {
  products: StoreProduct[]
}

export default function ProductGrid({ products }: Props) {
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
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
      gap: '16px',
    }}>
      {products.map(product => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  )
}
