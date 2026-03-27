import { createClient } from '@/lib/supabase/client'
import { db, type LocalVariant, type QueueEntry } from './db'
import type { ProductVariant, Product } from '@/types'

const SYNC_INTERVAL_MS = 30 * 60 * 1000 // 30 min

function toProductVariant(v: LocalVariant): ProductVariant {
  const product: Product = {
    id: v.product_id,
    name: v.product_name,
    brand: v.product_brand,
    category: v.product_category,
    description: null,
    image_url: null,
    active: v.active,
    created_at: '',
    updated_at: '',
  }
  return {
    id: v.id,
    product_id: v.product_id,
    barcode: v.barcode,
    flavor: v.flavor,
    cost_price: v.cost_price,
    sale_price: v.sale_price,
    wholesale_price: v.wholesale_price,
    stock: v.stock,
    min_stock: v.min_stock,
    max_stock: v.max_stock,
    expiration_date: v.expiration_date,
    active: v.active,
    created_at: '',
    updated_at: '',
    product,
  }
}

class SyncEngine {
  async shouldResync(): Promise<boolean> {
    const meta = await db.sync_meta.get('last_catalog_sync')
    if (!meta) return true
    return Date.now() - new Date(meta.value).getTime() > SYNC_INTERVAL_MS
  }

  async getLastSyncTime(): Promise<Date | null> {
    const meta = await db.sync_meta.get('last_catalog_sync')
    return meta ? new Date(meta.value) : null
  }

  async syncCatalog(): Promise<void> {
    const supabase = createClient()
    const PAGE = 1000
    let page = 0
    const all: LocalVariant[] = []

    while (true) {
      const { data, error } = await supabase
        .from('product_variants')
        .select('*, product:products(id, name, brand, category)')
        .range(page * PAGE, (page + 1) * PAGE - 1)

      if (error) throw new Error(`syncCatalog: ${error.message}`)
      if (!data || data.length === 0) break

      for (const v of data) {
        all.push({
          id: v.id,
          product_id: v.product_id,
          barcode: v.barcode,
          flavor: v.flavor ?? null,
          cost_price: v.cost_price,
          sale_price: v.sale_price,
          wholesale_price: v.wholesale_price,
          stock: v.stock,
          min_stock: v.min_stock,
          max_stock: v.max_stock,
          expiration_date: v.expiration_date ?? null,
          active: v.active ?? true,
          product_name: v.product?.name ?? '',
          product_brand: v.product?.brand ?? null,
          product_category: v.product?.category ?? null,
        })
      }

      if (data.length < PAGE) break
      page++
    }

    await db.transaction('rw', db.product_variants, db.sync_meta, async () => {
      await db.product_variants.clear()
      await db.product_variants.bulkAdd(all)
      await db.sync_meta.put({ key: 'last_catalog_sync', value: new Date().toISOString() })
    })
  }

  async getProducts(query?: string, category?: string | null): Promise<ProductVariant[]> {
    const all = await db.product_variants.toArray()
    const q = query?.trim().toLowerCase()

    const filtered = all.filter(v => {
      if (category) {
        if ((v.product_category ?? '').toLowerCase() !== category.toLowerCase()) return false
      }
      if (!q) return true
      return (
        v.product_name.toLowerCase().includes(q) ||
        (v.flavor ?? '').toLowerCase().includes(q) ||
        v.barcode.toLowerCase().includes(q)
      )
    })

    return filtered.map(toProductVariant)
  }

  async getQueueCount(): Promise<number> {
    return db.offline_queue.where('status').equals('pending').count()
  }

  async processSale(
    payload: QueueEntry['payload'],
    isOnline: boolean
  ): Promise<{ success: boolean; saleId: string }> {
    if (isOnline) {
      const supabase = createClient()

      const { data: sale, error: saleError } = await supabase
        .from('sales')
        .insert(payload.sale)
        .select('id')
        .single()

      if (saleError || !sale) throw new Error(saleError?.message ?? 'Error creando venta')

      const items = payload.items.map(i => ({ ...i, sale_id: sale.id }))
      const { error: itemsError } = await supabase.from('sale_items').insert(items)
      if (itemsError) throw new Error(itemsError.message)

      // Decrement stock en Supabase + Dexie (fallo silencioso)
      for (const item of payload.items) {
        const local = await db.product_variants.get(item.variant_id)
        if (local) {
          const newStock = Math.max(0, local.stock - item.quantity)
          await supabase.from('product_variants').update({ stock: newStock }).eq('id', item.variant_id)
          await db.product_variants.update(item.variant_id, { stock: newStock })
        }
      }

      return { success: true, saleId: sale.id }
    } else {
      // Offline: encolar + decremento optimista
      const entryId = crypto.randomUUID()
      const entry: QueueEntry = {
        id: entryId,
        created_at: new Date().toISOString(),
        status: 'pending',
        payload,
      }
      await db.offline_queue.add(entry)

      for (const item of payload.items) {
        const local = await db.product_variants.get(item.variant_id)
        if (local) {
          await db.product_variants.update(item.variant_id, {
            stock: Math.max(0, local.stock - item.quantity),
          })
        }
      }

      return { success: true, saleId: `offline-${entryId}` }
    }
  }

  async flushQueue(
    onProgress?: (done: number, total: number) => void
  ): Promise<{ synced: number; errors: number }> {
    const pending = await db.offline_queue
      .where('status')
      .equals('pending')
      .sortBy('created_at')

    const supabase = createClient()
    let synced = 0
    let errors = 0

    for (let i = 0; i < pending.length; i++) {
      const entry = pending[i]
      onProgress?.(i, pending.length)

      try {
        const { data: sale, error: saleError } = await supabase
          .from('sales')
          .insert(entry.payload.sale)
          .select('id')
          .single()

        if (saleError || !sale) throw new Error(saleError?.message ?? 'Error')

        const items = entry.payload.items.map(i => ({ ...i, sale_id: sale.id }))
        const { error: itemsError } = await supabase.from('sale_items').insert(items)
        if (itemsError) throw new Error(itemsError.message)

        await db.offline_queue.update(entry.id, { status: 'synced' })
        synced++
      } catch (err) {
        await db.offline_queue.update(entry.id, {
          status: 'error',
          error: err instanceof Error ? err.message : 'Error desconocido',
        })
        errors++
      }

      onProgress?.(i + 1, pending.length)
    }

    if (synced > 0) await this.syncCatalog()

    return { synced, errors }
  }
}

export const syncEngine = new SyncEngine()
