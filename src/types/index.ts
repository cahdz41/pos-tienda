export type UserRole = 'owner' | 'cashier'

export interface Category {
  id: string
  name: string
  created_at: string
}

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
  image_url: string | null
  product: Product
}

export interface CartItem {
  variant: ProductVariant
  quantity: number
  unitPrice: number     // puede ser sale_price o wholesale_price
  useWholesale?: boolean
}

export interface HeldTicket {
  id: number
  label: string
  cart: CartItem[]
  savedAt: number       // Date.now()
}

export interface Shift {
  id: string
  cashier_id: string
  opening_amount: number
  status: 'open' | 'closed'
  opened_at: string
  closed_at: string | null
  closing_amount: number | null
  cash_difference: number | null
}

export interface CashMovement {
  id: string
  shift_id: string
  type: 'in' | 'out'
  amount: number
  reason: string
  scope: 'business' | 'family' | null
  category_id: string | null
  account_id: string | null
  beneficiary: string | null
  notes: string | null
  created_by: string | null
  status: 'posted' | 'cancelled'
  cancelled_at: string | null
  cancelled_by: string | null
  cancellation_reason: string | null
  created_at: string
}

export interface MoneyAccount {
  id: string
  code: 'cash' | 'mercado_pago'
  name: string
  account_type: 'cash' | 'digital_wallet'
  opening_balance: number
  initialized_at: string | null
  is_active: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export interface MoneyAccountBalance extends MoneyAccount {
  balance: number
}

export interface FinancialSettings {
  singleton: true
  card_fee_rate: number
  ledger_started_at: string | null
  started_by: string | null
  updated_at: string
}

export interface AccountMovement {
  id: string
  account_id: string
  direction: 'in' | 'out'
  amount: number
  entry_type: 'sale' | 'card_fee' | 'cash_movement' | 'credit_payment' | 'transfer' | 'adjustment'
  description: string
  reference_type: string | null
  reference_id: string | null
  component: string
  occurred_at: string
  created_by: string | null
  status: 'posted' | 'cancelled'
  cancelled_at: string | null
  cancellation_reason: string | null
  created_at: string
}

export interface CashMovementCategory {
  id: string
  name: string
  scope: 'business' | 'family'
  movement_type: 'in' | 'out' | 'both'
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Customer {
  id: string
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

export interface CreditPayment {
  id: string
  customer_id: string
  amount: number
  payment_method: 'cash' | 'card'
  cashier_id: string | null
  created_at: string
}

export interface Sale {
  id: string
  shift_id: string
  cashier_id: string
  customer_id: string | null
  total: number
  payment_method: 'cash' | 'card' | 'transfer' | 'credit' | 'mixed'
  amount_paid: number
  change_given: number
  status: 'completed' | 'cancelled'
  notes: string | null
  created_at: string
}

export interface SaleItem {
  id: string
  sale_id: string
  variant_id: string
  quantity: number
  unit_price: number
  subtotal: number
}

// ── Tienda online ────────────────────────────────────────────────────────────

export interface StoreVariant {
  id: string
  flavor: string | null
  sale_price: number
  stock: number
  image_url: string | null
}

export interface StoreProduct {
  id: string
  name: string
  category: string | null
  image_url: string | null
  store_description: string | null
  product_variants: StoreVariant[]
}

export type StoreOrderStatus = 'pending' | 'confirmed' | 'ready' | 'delivered' | 'cancelled'

export interface StoreOrderItem {
  id: string
  product_name: string
  flavor: string | null
  quantity: number
  unit_price: number
  subtotal: number
}

export interface StoreOrder {
  id: string
  customer_name: string
  customer_phone: string
  notes: string | null
  total: number
  status: StoreOrderStatus
  created_at: string
  store_order_items: StoreOrderItem[]
}

// ── Ofertas y Paquetes ───────────────────────────────────────────────────────

export interface Offer {
  id: number
  nombre: string
  nombre_completo: string | null
  variant_id: string | null
  categoria: string
  imagen: string | null
  precio_lista: number
  precio_oferta: number
  created_at: string
}

export interface PackageProduct {
  nombre: string
  imagen: string | null
  categoria: string
  variant_id?: string | null
}

export interface Package {
  id: number
  nombre: string
  productos: PackageProduct[]
  precio_lista: number
  precio_oferta: number
  costo_real: number
  activo: boolean
  created_at: string
}

// ── Encargos (pedidos especiales tienda física) ─────────────────────────────

export interface SpecialOrder {
  id: string
  customer_id: string
  product_id: string | null
  product_name: string | null
  sale_price: number
  estimated_delivery_date: string | null
  deposit: number
  status: 'pending' | 'completed'
  type: 'order' | 'delivery'
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SpecialOrderWithCustomer extends SpecialOrder {
  customer: Customer
}
