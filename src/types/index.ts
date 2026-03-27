export type UserRole = 'owner' | 'cashier'

export interface Profile {
  id: string
  name: string
  role: UserRole
  pin: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface Customer {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  whatsapp: string | null
  credit_limit: number
  credit_balance: number
  loyalty_balance: number
  loyalty_spent: number
  notes: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface LoyaltyTransaction {
  id: string
  customer_id: string
  sale_id: string | null
  type: 'earned' | 'redeemed'
  amount: number
  notes: string | null
  created_at: string
}

export type SalePaymentMethod = 'cash' | 'card' | 'transfer' | 'wallet' | 'credit'

export interface SalePayment {
  id: string
  sale_id: string
  method: SalePaymentMethod
  amount: number
  created_at: string
}

export interface Shift {
  id: string
  cashier_id: string
  opening_amount: number
  closing_amount: number | null
  expected_cash: number | null
  cash_difference: number | null
  status: 'open' | 'closed'
  notes: string | null
  opened_at: string
  closed_at: string | null
}

export interface CashMovement {
  id: string
  shift_id: string
  cashier_id: string
  type: 'in' | 'out'
  amount: number
  reason: string
  created_at: string
}

export interface Supplier {
  id: string
  name: string
  phone: string | null
  email: string | null
  notes: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  name: string
  brand: string | null
  category: string | null
  description: string | null
  image_url: string | null
  supplier_id: string | null
  sale_type: 'unidad' | 'paquete'
  active: boolean
  created_at: string
  updated_at: string
  // Joined
  supplier?: Supplier
}

export interface Combo {
  id: string
  name: string
  sale_price: number
  active: boolean
  created_at: string
  updated_at: string
  // Joined
  items?: ComboItem[]
}

export interface ComboItem {
  id: string
  combo_id: string
  variant_id: string
  quantity: number
  // Joined
  variant?: ProductVariant
}

export interface ProductVariant {
  id: string
  product_id: string
  barcode: string
  flavor: string | null
  cost_price: number
  sale_price: number
  wholesale_price: number
  stock: number
  min_stock: number
  max_stock: number
  expiration_date: string | null
  active: boolean
  created_at: string
  updated_at: string
  // Joined
  product?: Product
}

export interface Sale {
  id: string
  total: number
  payment_method: 'cash' | 'card' | 'credit' | 'transfer' | 'mixed'
  shift_id: string | null
  cashier_id: string | null
  customer_id: string | null
  amount_paid: number | null
  change_given: number | null
  discount: number
  notes: string | null
  status: 'completed' | 'cancelled'
  cancelled_at: string | null
  cancelled_by: string | null
  cancel_reason: string | null
  created_at: string
}

export interface SaleItem {
  id: string
  sale_id: string
  variant_id: string
  quantity: number
  unit_price: number
  discount: number
  subtotal: number | null
  created_at: string
  // Joined
  variant?: ProductVariant
}

export interface CartItem {
  variant: ProductVariant
  quantity: number
  unit_price: number
  discount: number
  // Combo fields (only set when item is a combo)
  isCombo?: boolean
  comboId?: string
  comboName?: string
  comboComponents?: Array<{ variantId: string; quantity: number }>
}

export interface ShiftSummary {
  shift_id: string
  cashier_id: string
  cashier_name: string
  opening_amount: number
  status: 'open' | 'closed'
  opened_at: string
  total_sales: number
  num_transactions: number
  cash_sales: number
  card_sales: number
  credit_sales: number
  cash_in: number
  cash_out: number
}
