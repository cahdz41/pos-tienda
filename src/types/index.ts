export type UserRole = 'owner' | 'cashier'

export interface Profile {
  id: string
  full_name: string
  role: UserRole
}

export interface Product {
  id: number
  name: string
  department: string | null
}

export interface ProductVariant {
  id: number
  product_id: number
  barcode: string
  flavor: string | null
  sale_price: number
  wholesale_price: number
  cost_price: number
  stock: number
  min_stock: number
  expiration_date: string | null
  product: Product
}

export interface CartItem {
  variant: ProductVariant
  quantity: number
  unitPrice: number  // puede ser sale_price o wholesale_price
}

export interface Shift {
  id: number
  cashier_id: string
  opening_amount: number
  status: 'open' | 'closed'
  opened_at: string
  closed_at: string | null
  closing_amount: number | null
  cash_difference: number | null
}

export interface Customer {
  id: number
  full_name: string
  phone: string | null
  email: string | null
  address: string | null
  credit_limit: number
  credit_balance: number
  loyalty_balance: number
  loyalty_spent: number
  notes: string | null
}

export interface Sale {
  id: number
  shift_id: number
  cashier_id: string
  customer_id: number | null
  total: number
  payment_method: 'cash' | 'card' | 'credit' | 'mixed'
  amount_paid: number
  change_given: number
  status: 'completed' | 'cancelled'
  created_at: string
}

export interface SaleItem {
  id: number
  sale_id: number
  variant_id: number
  quantity: number
  unit_price: number
  subtotal: number
}
