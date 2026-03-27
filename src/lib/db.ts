import Dexie, { type Table } from 'dexie'

// Variante aplanada para IndexedDB (sin joins anidados)
export interface LocalVariant {
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
  product_name: string
  product_brand: string | null
  product_category: string | null
}

export interface LocalShift {
  key: 'current'
  shift_id: string | null
  opened_at: string | null
}

export interface QueueEntry {
  id: string
  created_at: string
  status: 'pending' | 'synced' | 'error'
  payload: {
    sale: {
      total: number
      payment_method: 'cash' | 'card' | 'credit' | 'transfer' | 'mixed'
      shift_id: string | null
      cashier_id: string | null
      customer_id: string | null
      amount_paid: number
      change_given: number
      discount: number
    }
    items: {
      variant_id: string
      quantity: number
      unit_price: number
      discount: number
      subtotal: number
    }[]
  }
  error?: string
}

export interface SyncMeta {
  key: string
  value: string
}

export class PosDatabase extends Dexie {
  product_variants!: Table<LocalVariant>
  active_shift!: Table<LocalShift>
  offline_queue!: Table<QueueEntry>
  sync_meta!: Table<SyncMeta>

  constructor() {
    super('pos_offline_db')
    this.version(1).stores({
      product_variants: 'id, barcode, product_id, product_category',
      active_shift: 'key',
      offline_queue: 'id, status, created_at',
      sync_meta: 'key',
    })
  }
}

export const db = new PosDatabase()
