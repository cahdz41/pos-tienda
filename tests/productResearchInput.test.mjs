import assert from 'node:assert/strict'
import test from 'node:test'

import {
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
