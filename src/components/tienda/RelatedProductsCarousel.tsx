'use client'

import { useMemo, useRef } from 'react'
import type { Offer, StoreProduct } from '@/types'
import ProductCard from './ProductCard'

interface Props {
  products: StoreProduct[]
  offers?: Offer[]
  category?: string | null
}

export default function RelatedProductsCarousel({ products, offers = [], category }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const offersByVariant = useMemo(() => {
    const result = new Map<string, Offer>()
    for (const offer of offers) {
      if (offer.variant_id && !result.has(offer.variant_id)) {
        result.set(offer.variant_id, offer)
      }
    }
    return result
  }, [offers])

  if (products.length === 0) return null

  const move = (direction: -1 | 1) => {
    const track = trackRef.current
    if (!track) return
    track.scrollBy({ left: direction * Math.max(track.clientWidth * 0.8, 260), behavior: 'smooth' })
  }

  return (
    <section className="related-products" aria-labelledby="related-products-title">
      <style>{`
        .related-products {
          margin-top: 72px;
          padding-top: 40px;
          border-top: 1px solid #1a1a1a;
        }
        .related-products__header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 24px;
        }
        .related-products__title {
          margin: 0;
          color: #fff;
          font-family: var(--font-barlow-condensed, system-ui);
          font-size: clamp(25px, 3vw, 36px);
          font-weight: 800;
          line-height: 1.05;
          letter-spacing: -0.5px;
        }
        .related-products__subtitle {
          margin: 8px 0 0;
          color: #555;
          font-size: 13px;
        }
        .related-products__controls {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
        }
        .related-products__button {
          width: 40px;
          height: 40px;
          border: 1px solid #252525;
          border-radius: 50%;
          background: #111;
          color: #f0b429;
          cursor: pointer;
          font-size: 21px;
          line-height: 1;
          transition: border-color 0.2s, background 0.2s;
        }
        .related-products__button:hover {
          border-color: #f0b429;
          background: #17130a;
        }
        .related-products__track {
          display: flex;
          gap: 16px;
          overflow-x: auto;
          padding: 4px 2px 14px;
          scroll-behavior: smooth;
          scroll-snap-type: x mandatory;
          scrollbar-color: #2b230f transparent;
          scrollbar-width: thin;
        }
        .related-products__item {
          flex: 0 0 27%;
          min-width: 220px;
          scroll-snap-align: start;
        }
        @media (max-width: 700px) {
          .related-products {
            margin-top: 56px;
            padding-top: 32px;
          }
          .related-products__header {
            align-items: center;
          }
          .related-products__controls {
            display: none;
          }
          .related-products__track {
            gap: 12px;
            margin-right: -24px;
            padding-right: 24px;
          }
          .related-products__item {
            flex-basis: min(76vw, 270px);
            min-width: min(76vw, 270px);
          }
        }
      `}</style>

      <div className="related-products__header">
        <div>
          <h2 id="related-products-title" className="related-products__title">
            También te puede interesar
          </h2>
          <p className="related-products__subtitle">
            {category ? `Más opciones de ${category}` : 'Otras opciones disponibles'}
          </p>
        </div>
        {products.length > 1 && (
          <div className="related-products__controls" aria-label="Controles del carrusel">
            <button
              type="button"
              className="related-products__button"
              aria-label="Ver productos anteriores"
              onClick={() => move(-1)}
            >
              ←
            </button>
            <button
              type="button"
              className="related-products__button"
              aria-label="Ver más productos"
              onClick={() => move(1)}
            >
              →
            </button>
          </div>
        )}
      </div>

      <div ref={trackRef} className="related-products__track">
        {products.map(product => (
          <div key={product.id} className="related-products__item">
            <ProductCard product={product} offersByVariant={offersByVariant} />
          </div>
        ))}
      </div>
    </section>
  )
}
