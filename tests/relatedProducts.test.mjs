import assert from 'node:assert/strict'
import test from 'node:test'

import { minimumAvailablePrice, selectRelatedProducts } from '../src/lib/relatedProducts.ts'

function product(id, name, category, prices) {
  return {
    id,
    name,
    category,
    image_url: null,
    store_description: null,
    product_variants: prices.map((entry, index) => ({
      id: `${id}-${index}`,
      flavor: null,
      sale_price: entry.price,
      stock: entry.stock,
      image_url: null,
    })),
  }
}

test('calcula el precio mínimo usando solo variantes disponibles', () => {
  const variants = product('a', 'Actual', 'Proteínas', [
    { price: 700, stock: 0 },
    { price: 850, stock: 2 },
    { price: 900, stock: 1 },
  ]).product_variants

  assert.equal(minimumAvailablePrice(variants), 850)
})

test('excluye el actual, otras categorías y productos sin existencias', () => {
  const selected = selectRelatedProducts([
    product('current', 'Actual', 'Proteínas', [{ price: 900, stock: 2 }]),
    product('other-category', 'Creatina', 'Creatinas', [{ price: 500, stock: 4 }]),
    product('empty', 'Agotada', 'Proteínas', [{ price: 890, stock: 0 }]),
    product('valid', 'Disponible', 'Proteínas', [{ price: 950, stock: 3 }]),
  ], 'current', 'Proteínas', 900)

  assert.deepEqual(selected.map(item => item.id), ['valid'])
})

test('prioriza precios cercanos, desempata por nombre y limita a cuatro', () => {
  const selected = selectRelatedProducts([
    product('far', 'Muy cara', 'Proteínas', [{ price: 1500, stock: 1 }]),
    product('b', 'Beta', 'Proteínas', [{ price: 950, stock: 1 }]),
    product('a', 'Alfa', 'Proteínas', [{ price: 850, stock: 1 }]),
    product('near', 'Cercana', 'Proteínas', [{ price: 910, stock: 1 }]),
    product('next', 'Siguiente', 'Proteínas', [{ price: 920, stock: 1 }]),
  ], 'current', 'Proteínas', 900)

  assert.deepEqual(selected.map(item => item.id), ['near', 'next', 'a', 'b'])
})
