import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildVoiceCartPath,
  isVoiceCartCommandCandidate,
  isVoiceCheckoutCommand,
  parseVoiceCartCommand,
} from '../src/lib/voiceCartCommand.ts'
import { rankVoiceProductMatches } from '../src/lib/voiceProductMatch.ts'

const PRODUCTS = [
  {
    id: 'gold-xtreme',
    name: 'ON - Gold Standar 100% Whey 5 LBS',
    flavor: 'Chocolate Xtreme',
    barcode: '1001',
    stock: 3,
  },
  {
    id: 'gold-double',
    name: 'ON - Gold Standar 100% Whey 5 LBS',
    flavor: 'Double Rich Chocolate',
    barcode: '1002',
    stock: 4,
  },
  {
    id: 'gold-vanilla',
    name: 'ON - Gold Standar 100% Whey 5 LBS',
    flavor: 'Vanilla Ice Cream',
    barcode: '1003',
    stock: 2,
  },
  {
    id: 'gold-no-stock',
    name: 'ON - Gold Standard 100% Whey 5 LBS',
    flavor: 'Chocolate Xtreme',
    barcode: '1004',
    stock: 0,
  },
  {
    id: 'unrelated',
    name: 'GAT Sport - Creatine Monohydrate 500grs',
    flavor: null,
    barcode: '2001',
    stock: 5,
  },
  {
    id: 'gat-creatine-300',
    name: 'GAT Sport - Creatine Monohydrate 300grs',
    flavor: null,
    barcode: '2002',
    stock: 4,
  },
  {
    id: 'gat-carnitine',
    name: 'GAT Sport - L-Carnitine 500mg',
    flavor: null,
    barcode: '2003',
    stock: 4,
  },
]

test('extrae una descripción natural para agregar sin ejecutar un cobro', () => {
  const command = parseVoiceCartCommand(
    'Agrégame una gold standar 5 libras, de chocolate xtreme'
  )

  assert.deepEqual(command, {
    query: 'una gold standar 5 libras de chocolate xtreme',
    label: 'Buscar para agregar: una gold standar 5 libras de chocolate xtreme',
  })
  assert.equal(
    buildVoiceCartPath(command),
    '/pos?agregar=una+gold+standar+5+libras+de+chocolate+xtreme'
  )
  assert.equal(isVoiceCartCommandCandidate('ponme una creatina al carrito'), true)
  assert.equal(isVoiceCheckoutCommand('cobra la venta en efectivo'), true)
})

test('acepta distintas formas conversacionales sin depender de Gemini', () => {
  const variants = [
    'Agregar una gold standar cinco libras chocolate extreme',
    '¿Me puedes agregar una gold standar de cinco libras al carrito?',
    'Búscame una gold standar cinco libras y agrégala a la venta',
    'Quiero una gold standar cinco libras en el carrito',
    'Pon en la venta una gold standar cinco libras sabor chocolate',
  ]

  for (const phrase of variants) {
    const parsed = parseVoiceCartCommand(phrase)
    assert.ok(parsed, phrase)
    assert.match(parsed.query, /gold standar/)
    assert.equal(isVoiceCartCommandCandidate(phrase), true)
  }

  assert.equal(parseVoiceCartCommand('agrega un producto'), null)
  assert.equal(isVoiceCartCommandCandidate('agrega un producto'), true)
})

test('elige como primera opción el nombre, presentación y sabor más parecidos', () => {
  const matches = rankVoiceProductMatches(
    'una gold standard 5 libras chocolate extreme',
    PRODUCTS
  )

  assert.equal(matches[0]?.item.id, 'gold-xtreme')
  assert.ok(matches[0].score >= matches[1].score)
  assert.equal(matches.some(match => match.item.id === 'gold-no-stock'), true)
  assert.equal(matches.some(match => match.item.id === 'unrelated'), false)
})

test('con una descripción incompleta conserva varias opciones cercanas para confirmar', () => {
  const matches = rankVoiceProductMatches('gold 5 libras chocolate', PRODUCTS)

  assert.deepEqual(
    matches.slice(0, 2).map(match => match.item.id).sort(),
    ['gold-double', 'gold-xtreme']
  )
})

test('entiende keratina y prioriza marca, producto y gramos sin confundir carnitina', () => {
  for (const query of [
    'gat ncreatina 500 gramos',
    'agrega creatina 500grs de gat',
    'una keratina gat 500 g',
  ]) {
    const productQuery = parseVoiceCartCommand(query)?.query ?? query
    const matches = rankVoiceProductMatches(productQuery, PRODUCTS)

    assert.equal(matches[0]?.item.id, 'unrelated', query)
    assert.equal(matches.some(match => match.item.id === 'gat-carnitine'), false, query)
    assert.ok(
      (matches.find(match => match.item.id === 'unrelated')?.score ?? 0)
        > (matches.find(match => match.item.id === 'gat-creatine-300')?.score ?? 0),
      query
    )
  }
})
