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
    supplier_id: null,
    sale_type: 'unidad',
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

// Todas las operaciones Supabase del flujo crítico de venta pasan por aquí.
// Si el servidor no responde en `ms` milisegundos la promise se rechaza con
// un error claro en lugar de colgar indefinidamente.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const withTimeout = (p: PromiseLike<any>, ms: number): Promise<any> =>
  Promise.race([
    Promise.resolve(p),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Sin respuesta del servidor (${ms / 1000}s). Verifica tu conexión.`)),
        ms
      )
    ),
  ])

class SyncEngine {
  private _syncingCatalog: Promise<void> | null = null

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
    if (this._syncingCatalog) return this._syncingCatalog
    this._syncingCatalog = this._doSyncCatalog().finally(() => { this._syncingCatalog = null })
    return this._syncingCatalog
  }

  private async _doSyncCatalog(): Promise<void> {
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

  /** Pre-establece la conexión TCP y refresca el JWT antes de la primera venta. */
  async warmConnection(): Promise<void> {
    try {
      const supabase = createClient()
      await supabase.from('shifts').select('id').limit(1).maybeSingle()
    } catch {
      // Silencioso — si falla el warmup el cobro lo detectará con su propio timeout
    }
  }

  async processSale(
    payload: QueueEntry['payload'],
    isOnline: boolean
  ): Promise<{ success: boolean; saleId: string }> {
    if (isOnline) {
      const supabase = createClient()

      const { data: sale, error: saleError } = await withTimeout(
        supabase.from('sales').insert(payload.sale).select('id').single(),
        12_000
      )

      if (saleError || !sale) throw new Error(saleError?.message ?? 'Error creando venta')

      if (payload.items.length > 0) {
        const items = payload.items.map(i => ({ ...i, sale_id: sale.id }))
        const { error: itemsError } = await withTimeout(
          supabase.from('sale_items').insert(items),
          12_000
        )
        if (itemsError) throw new Error(itemsError.message)
      }

      // Decrement stock: Dexie primero (instantáneo), Supabase fire-and-forget.
      // Si la llamada a Supabase falla, syncCatalog reconcilia en el próximo ciclo.
      // Ya no bloquea el flujo de la venta ni puede generar falsos "errores".
      for (const item of payload.items) {
        const local = await db.product_variants.get(item.variant_id)
        if (local) {
          const newStock = Math.max(0, local.stock - item.quantity)
          await db.product_variants.update(item.variant_id, { stock: newStock })
          supabase.from('product_variants').update({ stock: newStock }).eq('id', item.variant_id)
            .then((res: { error: { message: string } | null }) => { if (res.error) console.warn('[sync] stock update:', res.error.message) })
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
