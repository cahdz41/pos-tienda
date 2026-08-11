import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildProductSearchQueries,
  deriveProductBrand,
  extractPresentationHint,
  referenceFlavor,
  uniqueKnownFlavors,
} from '../src/lib/productResearchInput.ts'

test('usa la marca registrada y deriva una cuando falta', () => {
  assert.equal(deriveProductBrand('Mutant - Mutant Whey 5lbs', ' Mutant '), 'Mutant')
  assert.equal(deriveProductBrand('Birdman - Falcon 1.14kg', null), 'Birdman')
})

test('extrae la presentación sin inventar datos', () => {
  assert.equal(extractPresentationHint('Gold Standard Whey 5lbs'), '5lbs')
  assert.equal(extractPresentationHint('Creatina monohidratada 300 g 60 porciones'), '300 g / 60 porciones')
  assert.equal(extractPresentationHint('Pre entreno 280grs 30serv'), '280grs / 30serv')
  assert.equal(extractPresentationHint('Producto sin tamaño'), '')
})

test('normaliza variantes sin sabor y elimina duplicados', () => {
  assert.equal(referenceFlavor(null), 'Sin sabor')
  assert.deepEqual(uniqueKnownFlavors(['Vainilla', 'Vainilla', null]), ['Vainilla', 'Sin sabor'])
})

test('construye una búsqueda progresiva con código, identidad y nombre canónico', () => {
  const queries = buildProductSearchQueries({
    product_name: 'Insane Labz - Psychotic Rojo 35serv',
    brand: 'Insane Labz',
    presentation_hint: '35serv',
    reference_flavor: 'Fruit Punch',
    reference_barcode: '850031700123',
  })

  assert.deepEqual(queries, [
    '"850031700123" "Insane Labz"',
    '"Insane Labz" "Psychotic Rojo" "Fruit Punch" "35serv" supplement facts ingredients',
    '"Insane Labz" "Psychotic Rojo" official nutrition label',
  ])
})

test('la búsqueda profunda conserva la frase exacta del inventario', () => {
  const queries = buildProductSearchQueries({
    product_name: 'Nano Pharma - Nano Whey',
    brand: 'Nano Pharma',
    presentation_hint: '',
    reference_flavor: 'Sin sabor',
    reference_barcode: '',
  }, { deep: true })

  assert.equal(queries[0], '"Nano Pharma - Nano Whey" suplemento')
  assert.ok(queries.includes('"Nano Pharma" "Nano Whey" official nutrition label'))
})
