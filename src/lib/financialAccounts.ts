export interface ShiftSalePayment {
  sale_id: string
  method: string
  amount: number
}

export interface ShiftSaleHeader {
  id: string
  total: number
  payment_method: string
}

export interface ShiftPaymentSummary {
  total: number
  cash: number
  card: number
  transfer: number
  credit: number
}

export function calculateCardSettlement(amount: number, feeRate = 0.0405) {
  const gross = Math.max(0, Number(amount) || 0)
  const rate = Math.max(0, Number(feeRate) || 0)
  const fee = Math.round(gross * rate * 100) / 100
  return { gross, fee, net: Math.round((gross - fee) * 100) / 100 }
}

export function summarizeShiftPayments(
  sales: ShiftSaleHeader[],
  payments: ShiftSalePayment[]
): ShiftPaymentSummary {
  const summary: ShiftPaymentSummary = { total: 0, cash: 0, card: 0, transfer: 0, credit: 0 }
  const paymentsBySale = new Map<string, ShiftSalePayment[]>()

  for (const payment of payments) {
    const current = paymentsBySale.get(payment.sale_id) ?? []
    current.push(payment)
    paymentsBySale.set(payment.sale_id, current)
  }

  for (const sale of sales) {
    summary.total += Number(sale.total)
    if (sale.payment_method === 'credit') {
      summary.credit += Number(sale.total)
      continue
    }

    const split = paymentsBySale.get(sale.id) ?? []
    if (split.length > 0) {
      for (const payment of split) {
        if (payment.method === 'cash') summary.cash += Number(payment.amount)
        if (payment.method === 'card') summary.card += Number(payment.amount)
        if (payment.method === 'transfer') summary.transfer += Number(payment.amount)
      }
      continue
    }

    // Compatibilidad con ventas históricas sin desglose en sale_payments.
    if (sale.payment_method === 'cash') summary.cash += Number(sale.total)
    if (sale.payment_method === 'card') summary.card += Number(sale.total)
    if (sale.payment_method === 'transfer') summary.transfer += Number(sale.total)
  }

  return summary
}
