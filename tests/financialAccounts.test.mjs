import assert from 'node:assert/strict'
import test from 'node:test'

import {
  calculateCardSettlement,
  summarizeShiftPayments,
} from '../src/lib/financialAccounts.ts'

test('calcula depósito neto de Mercado Pago con comisión de 4.05%', () => {
  assert.deepEqual(calculateCardSettlement(1000), {
    gross: 1000,
    fee: 40.5,
    net: 959.5,
  })
  assert.deepEqual(calculateCardSettlement(99.99), {
    gross: 99.99,
    fee: 4.05,
    net: 95.94,
  })
})

test('separa pagos mixtos por método sin reducir la venta por la comisión', () => {
  const result = summarizeShiftPayments(
    [
      { id: 'sale-1', total: 1000, payment_method: 'mixed' },
      { id: 'sale-2', total: 200, payment_method: 'credit' },
    ],
    [
      { sale_id: 'sale-1', method: 'cash', amount: 300 },
      { sale_id: 'sale-1', method: 'card', amount: 400 },
      { sale_id: 'sale-1', method: 'transfer', amount: 300 },
    ]
  )

  assert.deepEqual(result, {
    total: 1200,
    cash: 300,
    card: 400,
    transfer: 300,
    credit: 200,
  })
})

test('mantiene compatibilidad con ventas antiguas sin desglose', () => {
  assert.deepEqual(
    summarizeShiftPayments([{ id: 'sale-1', total: 150, payment_method: 'cash' }], []),
    { total: 150, cash: 150, card: 0, transfer: 0, credit: 0 }
  )
})
