export type UserRole = 'owner' | 'cashier'

export interface Profile {
  id: string
  name: string       // columna real en Supabase (no full_name)
  role: UserRole
}

export interface Product {
  id: string
  name: string
  category: string | null   // columna real en Supabase (no department)
}

export interface ProductVariant {
  id: string
  product_id: string
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
