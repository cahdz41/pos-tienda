import type { StoreProduct, StoreVariant } from '@/types'

export function minimumAvailablePrice(variants: StoreVariant[]) {
  const prices = variants
    .filter(variant => variant.stock > 0 && Number.isFinite(variant.sale_price))
    .map(variant => variant.sale_price)

  return prices.length > 0 ? Math.min(...prices) : null
}

export function selectRelatedProducts(
  candidates: StoreProduct[],
  currentProductId: string,
  category: string,
  currentPrice: number | null,
  limit = 4,
) {
  return candidates
    .filter(product => product.id !== currentProductId && product.category === category)
    .map(product => ({
      ...product,
      product_variants: product.product_variants.filter(variant => variant.stock > 0),
    }))
    .filter(product => product.product_variants.length > 0)
    .sort((left, right) => {
      const leftPrice = minimumAvailablePrice(left.product_variants) ?? Number.POSITIVE_INFINITY
      const rightPrice = minimumAvailablePrice(right.product_variants) ?? Number.POSITIVE_INFINITY
      const priceDifference = currentPrice === null
        ? leftPrice - rightPrice
        : Math.abs(leftPrice - currentPrice) - Math.abs(rightPrice - currentPrice)

      if (priceDifference !== 0) return priceDifference

      const nameDifference = left.name.localeCompare(right.name, 'es-MX', { sensitivity: 'base' })
      return nameDifference !== 0 ? nameDifference : left.id.localeCompare(right.id)
    })
    .slice(0, Math.max(0, limit))
}
