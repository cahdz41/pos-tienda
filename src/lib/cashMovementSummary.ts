import type { CashMovement } from '@/types'

export interface CashMovementSummary {
  income: number
  expenses: number
  businessExpenses: number
  familyExpenses: number
  unclassifiedExpenses: number
  net: number
  cashNet: number
}

export function isPostedCashMovement(movement: CashMovement) {
  return movement.status !== 'cancelled'
}

export function summarizeCashMovements(
  movements: CashMovement[],
  cashAccountId?: string | null
): CashMovementSummary {
  const posted = movements.filter(isPostedCashMovement)
  const income = posted
    .filter(movement => movement.type === 'in')
    .reduce((sum, movement) => sum + Number(movement.amount), 0)
  const expenses = posted
    .filter(movement => movement.type === 'out')
    .reduce((sum, movement) => sum + Number(movement.amount), 0)
  const businessExpenses = posted
    .filter(movement => movement.type === 'out' && movement.scope === 'business')
    .reduce((sum, movement) => sum + Number(movement.amount), 0)
  const familyExpenses = posted
    .filter(movement => movement.type === 'out' && movement.scope === 'family')
    .reduce((sum, movement) => sum + Number(movement.amount), 0)
  const unclassifiedExpenses = posted
    .filter(movement => movement.type === 'out' && !movement.scope)
    .reduce((sum, movement) => sum + Number(movement.amount), 0)
  const cashMovements = cashAccountId
    ? posted.filter(movement => movement.account_id === cashAccountId || !movement.account_id)
    : posted
  const cashNet = cashMovements.reduce(
    (sum, movement) => sum + (movement.type === 'in' ? Number(movement.amount) : -Number(movement.amount)),
    0
  )

  return {
    income,
    expenses,
    businessExpenses,
    familyExpenses,
    unclassifiedExpenses,
    net: income - expenses,
    cashNet,
  }
}
