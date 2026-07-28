import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildSalesVoicePath,
  getSalesRangeUtc,
  isSalesVoiceQueryCandidate,
  parseSalesVoiceQuery,
  salesCategoryKey,
} from '../src/lib/salesVoiceQuery.ts'

const FIXED_NOW = new Date('2026-07-27T18:00:00.000Z')

test('resuelve hoy y ayer con el reloj de America/Mexico_City', () => {
  assert.deepEqual(parseSalesVoiceQuery('ventas de hoy', FIXED_NOW), {
    from: '2026-07-27',
    to: '2026-07-27',
    label: 'Ventas de hoy',
  })
  assert.deepEqual(parseSalesVoiceQuery('Ventas de ayer', FIXED_NOW), {
    from: '2026-07-26',
    to: '2026-07-26',
    label: 'Ventas de ayer',
  })
})

test('entiende formas naturales equivalentes sin depender de una frase exacta', () => {
  const todayVariants = [
    'Muéstrame las ventas de hoy',
    'por favor, enséñame las ventas del día de hoy',
    'quiero ver ventas hoy',
    '¿Me puedes mostrar las ventas de hoy?',
  ]
  const yesterdayVariants = [
    'quisiera consultar las ventas de ayer',
    'dime las ventas del día de ayer, por favor',
  ]

  for (const command of todayVariants) {
    assert.equal(parseSalesVoiceQuery(command, FIXED_NOW)?.from, '2026-07-27', command)
  }
  for (const command of yesterdayVariants) {
    assert.equal(parseSalesVoiceQuery(command, FIXED_NOW)?.from, '2026-07-26', command)
  }
})

test('la fecha de hoy cambia en el límite horario de Ciudad de México', () => {
  const beforeMidnight = new Date('2026-07-27T05:30:00.000Z')
  assert.equal(parseSalesVoiceQuery('ventas hoy', beforeMidnight)?.from, '2026-07-26')
})

test('resuelve fechas españolas explícitas y usa el año local actual si se omite', () => {
  assert.equal(
    parseSalesVoiceQuery('ventas del 5 de septiembre de 2025', FIXED_NOW)?.from,
    '2025-09-05'
  )
  assert.equal(parseSalesVoiceQuery('ventas de 27 de julio', FIXED_NOW)?.from, '2026-07-27')
  assert.equal(
    parseSalesVoiceQuery('consulta las ventas del día 24 de julio', FIXED_NOW)?.from,
    '2026-07-24'
  )
})

test('rechaza fechas inválidas, filtros y acciones fuera del alcance', () => {
  assert.equal(parseSalesVoiceQuery('ventas del 29 de febrero de 2025', FIXED_NOW), null)
  assert.equal(parseSalesVoiceQuery('ventas de hoy en efectivo', FIXED_NOW), null)
  assert.equal(parseSalesVoiceQuery('muéstrame las ventas de hoy en efectivo', FIXED_NOW), null)
  assert.equal(parseSalesVoiceQuery('elimina las ventas de hoy', FIXED_NOW), null)
  assert.equal(parseSalesVoiceQuery('cobrar', FIXED_NOW), null)
  assert.equal(isSalesVoiceQueryCandidate('ventas de hoy en efectivo'), true)
  assert.equal(isSalesVoiceQueryCandidate('muéstrame las ventas de hoy en efectivo'), true)
  assert.equal(isSalesVoiceQueryCandidate('ir a ventas'), false)
})

test('resuelve un rango con categoría y año local de forma determinista', () => {
  assert.equal(salesCategoryKey('preentrenos'), salesCategoryKey('PRE-ENTRENOS'))

  assert.deepEqual(
    parseSalesVoiceQuery(
      'Muéstrame las ventas de la categoría Ropa del 1 de julio al 24 de julio',
      FIXED_NOW
    ),
    {
      from: '2026-07-01',
      to: '2026-07-24',
      category: 'ropa',
      label: 'Ventas de ropa: 1 de julio de 2026 al 24 de julio de 2026',
    }
  )

  assert.deepEqual(
    parseSalesVoiceQuery('Muestrame la ventas de preentrenos del 10 al 12 de julio', FIXED_NOW),
    {
      from: '2026-07-10',
      to: '2026-07-12',
      category: 'preentrenos',
      label: 'Ventas de preentrenos: 10 de julio de 2026 al 12 de julio de 2026',
    }
  )

  assert.equal(
    parseSalesVoiceQuery('ventas de la categoría ropa del 24 de julio al 1 de julio', FIXED_NOW),
    null
  )
})

test('construye una ruta con allowlist exclusiva de fechas y categoría', () => {
  const query = parseSalesVoiceQuery('ventas de ayer', FIXED_NOW)
  assert.ok(query)
  assert.equal(buildSalesVoicePath(query), '/ventas?from=2026-07-26&to=2026-07-26')

  const categoryQuery = parseSalesVoiceQuery(
    'ventas de la categoría ropa del 1 de julio al 24 de julio',
    FIXED_NOW
  )
  assert.ok(categoryQuery)
  assert.equal(
    buildSalesVoicePath(categoryQuery),
    '/ventas?from=2026-07-01&to=2026-07-24&category=ropa'
  )
})

test('convierte el día comercial a un rango UTC cerrado', () => {
  assert.deepEqual(getSalesRangeUtc('2026-07-27', '2026-07-27'), {
    start: '2026-07-27T06:00:00.000Z',
    end: '2026-07-28T05:59:59.999Z',
  })
})
