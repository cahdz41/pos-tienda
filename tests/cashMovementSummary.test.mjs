import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isPostedCashMovement,
  summarizeCashMovements,
} from '../src/lib/cashMovementSummary.ts'

function movement(overrides) {
  return {
    id: crypto.randomUUID(),
    shift_id: 'shift-1',
    type: 'out',
    amount: 0,
    reason: 'Prueba',
    scope: 'business',
    category_id: 'category-1',
    account_id: 'cash-account',
    beneficiary: 'Proveedor',
    notes: null,
    created_by: 'user-1',
    status: 'posted',
    cancelled_at: null,
    cancelled_by: null,
    cancellation_reason: null,
    created_at: '2026-08-02T12:00:00.000Z',
    ...overrides,
  }
}

test('separa las salidas del negocio, familia e históricas sin clasificar', () => {
  const result = summarizeCashMovements([
    movement({ amount: 100, scope: 'business' }),
    movement({ amount: 40, scope: 'family' }),
    movement({ amount: 10, scope: null, category_id: null, beneficiary: null }),
    movement({ type: 'in', amount: 25, scope: 'business' }),
  ])

  assert.deepEqual(result, {
    income: 25,
    expenses: 150,
    businessExpenses: 100,
    familyExpenses: 40,
    unclassifiedExpenses: 10,
    net: -125,
    cashNet: -125,
  })
})

test('excluye movimientos cancelados de todos los cálculos sin eliminarlos', () => {
  const cancelled = movement({ amount: 500, status: 'cancelled' })
  const result = summarizeCashMovements([cancelled, movement({ amount: 80 })])

  assert.equal(isPostedCashMovement(cancelled), false)
  assert.equal(result.expenses, 80)
  assert.equal(result.businessExpenses, 80)
  assert.equal(result.net, -80)
  assert.equal(result.cashNet, -80)
})

test('solo los movimientos de Caja afectan el efectivo esperado', () => {
  const result = summarizeCashMovements([
    movement({ amount: 100, account_id: 'cash-account' }),
    movement({ amount: 250, account_id: 'mercado-pago-account' }),
  ], 'cash-account')

  assert.equal(result.expenses, 350)
  assert.equal(result.net, -350)
  assert.equal(result.cashNet, -100)
})
