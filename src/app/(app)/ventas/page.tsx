'use client'

import { Suspense, useState, useEffect, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase'
import { getSalesRangeUtc, isValidSalesDate, salesCategoryKey } from '@/lib/salesVoiceQuery'
import { printReceipt } from '../pos/Receipt'
import type { CartItem } from '@/types'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface SaleRow {
  id: string
  total: number
  payment_method: string
  status: 'completed' | 'cancelled'
  created_at: string
  cashier_id: string
  cashier_name: string
  item_count: number
  item_names: string
  item_categories: string[]
  sale_profit: number
}

interface SaleDetail {
  id: string
  total: number
  payment_method: string
  amount_paid: number
  change_given: number
  status: 'completed' | 'cancelled'
  created_at: string
  cashier_name: string
  notes: string | null
  payments: { method: string; amount: number }[]
  items: {
    id: string
    name: string
    flavor: string | null
    quantity: number
    unit_price: number
    subtotal: number
  }[]
}

interface Cashier  { id: string; name: string }
interface Category { id: string; name: string }

type ExportRange  = 'day' | 'week' | 'month' | 'custom'
type MethodFilter = 'all' | 'cash' | 'card' | 'transfer' | 'credit' | 'mixed'
type PeriodFilter = 'today' | 'yesterday' | 'lastMonth' | 'lastWeek' | 'thisMonth' | 'custom'

interface ExportSaleRecord {
  id: string
  total: number
  payment_method: string
  amount_paid: number
  change_given: number
  status: 'completed' | 'cancelled'
  created_at: string
  cashier_id: string
  notes: string | null
}

interface ExportItemRecord {
  sale_id: string
  variant_id: string
  quantity: number
  unit_price: number
  subtotal: number
  product_variants: {
    barcode: string | null
    flavor: string | null
    sale_price: number
    wholesale_price: number
    cost_price: number
    products: { name: string; category: string | null } | null
  } | null
}

interface ExportRowContext {
  sale: ExportSaleRecord
  item: ExportItemRecord | null
  cashierName: string
}

type ExportColumnId =
  | 'folio' | 'fecha' | 'hora' | 'cajero' | 'producto' | 'sabor' | 'categoria'
  | 'barcode' | 'cantidad' | 'precio_unitario' | 'tipo_precio' | 'costo_unitario'
  | 'subtotal' | 'ganancia' | 'forma_pago' | 'monto_venta' | 'pago_recibido'
  | 'cambio' | 'estado' | 'notas'

interface ExportColumn {
  id: ExportColumnId
  label: string
  width: number
  monetary?: boolean
  getValue: (context: ExportRowContext) => string | number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const METHOD_LABEL: Record<string, string> = {
  cash:     'Efectivo',
  card:     'Tarjeta',
  transfer: 'Transferencia',
  credit:   'Crédito',
  mixed:    'Mixto',
  wallet:   'Monedero',
}

const METHOD_COLOR: Record<string, string> = {
  cash:     '#4ade80',
  card:     '#60a5fa',
  transfer: '#34d399',
  credit:   '#f59e0b',
  mixed:    '#a78bfa',
  wallet:   '#e879f9',
}

const PERIOD_OPTS: { id: PeriodFilter; label: string }[] = [
  { id: 'today',     label: 'Hoy'           },
  { id: 'yesterday', label: 'Ayer'          },
  { id: 'lastMonth', label: 'Último mes'    },
  { id: 'lastWeek',  label: 'Última semana' },
  { id: 'thisMonth', label: 'Mes en curso'  },
  { id: 'custom',    label: 'Personalizado' },
]

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatHour(iso: string) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })
}

function fmt(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function flexibleMatch(sale: SaleRow, term: string): boolean {
  if (!term.trim()) return true
  const words  = normalize(term).split(/\s+/).filter(Boolean)
  const target = normalize(
    `${sale.id.slice(-6)} ${sale.cashier_name} ${sale.item_names} ${METHOD_LABEL[sale.payment_method] ?? sale.payment_method}`
  )
  return words.every(w => target.includes(w))
}

function getSearchRange(period: PeriodFilter, customFrom: string, customTo: string) {
  const now      = new Date()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  if (period === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    return { start: start.toISOString(), end: todayEnd.toISOString() }
  }
  if (period === 'yesterday') {
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    const start = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0)
    const end   = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999)
    return { start: start.toISOString(), end: end.toISOString() }
  }
  if (period === 'lastMonth') {
    const start = new Date(now); start.setDate(now.getDate() - 30); start.setHours(0, 0, 0, 0)
    return { start: start.toISOString(), end: todayEnd.toISOString() }
  }
  if (period === 'lastWeek') {
    const start = new Date(now); start.setDate(now.getDate() - 7); start.setHours(0, 0, 0, 0)
    return { start: start.toISOString(), end: todayEnd.toISOString() }
  }
  if (period === 'thisMonth') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
    return { start: start.toISOString(), end: todayEnd.toISOString() }
  }
  // Fecha personalizada a medio escribir: se evita reventar con "Invalid time value".
  if (!isValidSalesDate(customFrom) || !isValidSalesDate(customTo)) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    return { start: start.toISOString(), end: todayEnd.toISOString() }
  }
  const [fy, fm, fd] = customFrom.split('-').map(Number)
  const [ty, tm, td] = customTo.split('-').map(Number)
  return {
    start: new Date(fy, fm - 1, fd, 0, 0, 0, 0).toISOString(),
    end:   new Date(ty, tm - 1, td, 23, 59, 59, 999).toISOString(),
  }
}

function getRangeISO(range: ExportRange, customFrom: string, customTo: string) {
  const now = new Date()
  if (range === 'day') {
    const today = toLocalDateStr(now)
    const [y, m, d] = today.split('-').map(Number)
    return { start: new Date(y, m-1, d, 0,0,0,0).toISOString(), end: new Date(y, m-1, d, 23,59,59,999).toISOString(), label: today }
  }
  if (range === 'week') {
    const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay()+6)%7)); monday.setHours(0,0,0,0)
    return { start: monday.toISOString(), end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59,999).toISOString(), label: `semana-${toLocalDateStr(monday)}` }
  }
  if (range === 'month') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1, 0,0,0,0)
    return { start: first.toISOString(), end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59,999).toISOString(), label: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}` }
  }
  const [fy,fm,fd] = customFrom.split('-').map(Number)
  const [ty,tm,td] = customTo.split('-').map(Number)
  return { start: new Date(fy,fm-1,fd,0,0,0,0).toISOString(), end: new Date(ty,tm-1,td,23,59,59,999).toISOString(), label: `${customFrom}_${customTo}` }
}

function numberValue(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function getUsedPriceType(item: ExportItemRecord | null): string {
  const variant = item?.product_variants
  if (!item || !variant) return 'No disponible'
  const unitPrice = numberValue(item.unit_price)
  const publicPrice = numberValue(variant.sale_price)
  const wholesalePrice = numberValue(variant.wholesale_price)
  const samePrice = (a: number, b: number) => Math.abs(a - b) < 0.005

  if (samePrice(unitPrice, publicPrice)) return 'Público'
  if (!samePrice(publicPrice, wholesalePrice) && samePrice(unitPrice, wholesalePrice)) return 'Mayoreo'
  return 'Personalizado'
}

const EXPORT_COLUMNS: ExportColumn[] = [
  { id: 'folio', label: 'Folio', width: 10, getValue: ({ sale }) => sale.id.slice(-6).toUpperCase() },
  { id: 'fecha', label: 'Fecha', width: 13, getValue: ({ sale }) => new Date(sale.created_at).toLocaleDateString('es-MX') },
  { id: 'hora', label: 'Hora', width: 12, getValue: ({ sale }) => new Date(sale.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true }) },
  { id: 'cajero', label: 'Cajero', width: 20, getValue: ({ cashierName }) => cashierName },
  { id: 'producto', label: 'Producto', width: 34, getValue: ({ item }) => item?.product_variants?.products?.name ?? 'Sin nombre' },
  { id: 'sabor', label: 'Sabor / variante', width: 20, getValue: ({ item }) => item?.product_variants?.flavor || '—' },
  { id: 'categoria', label: 'Categoría', width: 20, getValue: ({ item }) => item?.product_variants?.products?.category || 'Sin categoría' },
  { id: 'barcode', label: 'Código de barras', width: 20, getValue: ({ item }) => item?.product_variants?.barcode || '—' },
  { id: 'cantidad', label: 'Cantidad', width: 10, getValue: ({ item }) => numberValue(item?.quantity) },
  { id: 'precio_unitario', label: 'Precio utilizado', width: 16, monetary: true, getValue: ({ item }) => numberValue(item?.unit_price) },
  { id: 'tipo_precio', label: 'Tipo de precio', width: 16, getValue: ({ item }) => getUsedPriceType(item) },
  { id: 'costo_unitario', label: 'Costo unitario actual', width: 20, monetary: true, getValue: ({ item }) => numberValue(item?.product_variants?.cost_price) },
  { id: 'subtotal', label: 'Subtotal del artículo', width: 20, monetary: true, getValue: ({ item }) => numberValue(item?.subtotal) },
  { id: 'ganancia', label: 'Ganancia estimada', width: 18, monetary: true, getValue: ({ item }) => item ? numberValue(item.subtotal) - numberValue(item.product_variants?.cost_price) * numberValue(item.quantity) : 0 },
  { id: 'forma_pago', label: 'Forma de pago', width: 17, getValue: ({ sale }) => METHOD_LABEL[sale.payment_method] ?? sale.payment_method },
  { id: 'monto_venta', label: 'Monto total del ticket', width: 20, monetary: true, getValue: ({ sale }) => numberValue(sale.total) },
  { id: 'pago_recibido', label: 'Pago recibido', width: 16, monetary: true, getValue: ({ sale }) => numberValue(sale.amount_paid) },
  { id: 'cambio', label: 'Cambio', width: 14, monetary: true, getValue: ({ sale }) => numberValue(sale.change_given) },
  { id: 'estado', label: 'Estado', width: 13, getValue: ({ sale }) => sale.status === 'completed' ? 'Completada' : 'Anulada' },
  { id: 'notas', label: 'Notas', width: 30, getValue: ({ sale }) => sale.notes || '—' },
]

const DEFAULT_EXPORT_COLUMNS = EXPORT_COLUMNS.map(column => column.id)
const EXPORT_QUERY_BATCH_SIZE = 75
const EXPORT_PAGE_SIZE = 1000

function chunkValues<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size))
  return chunks
}

function applyMoneyFormats(sheet: XLSX.WorkSheet, columns: ExportColumn[], rowCount: number) {
  columns.forEach((column, columnIndex) => {
    if (!column.monetary) return
    for (let rowIndex = 1; rowIndex <= rowCount; rowIndex++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })]
      if (cell?.t === 'n') cell.z = '$#,##0.00'
    }
  })
}

// ── Componente principal ──────────────────────────────────────────────────────

function VentasContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialSearchHandled = useRef(false)
  const lastVoiceRequest = useRef<string | null>(null)
  const searchRequestId = useRef(0)

  // Búsqueda
  const [hasSearched, setHasSearched]         = useState(false)
  const [searchText, setSearchText]           = useState('')
  const [periodFilter, setPeriodFilter]       = useState<PeriodFilter>('today')
  const [customFrom, setCustomFrom]           = useState(toLocalDateStr(new Date()))
  const [customTo, setCustomTo]               = useState(toLocalDateStr(new Date()))
  const [categories, setCategories]           = useState<Category[]>([])
  const [categoriesLoaded, setCategoriesLoaded] = useState(false)
  const [selectedCats, setSelectedCats]       = useState<string[]>([])
  const [showCatDropdown, setShowCatDropdown] = useState(false)
  const catRef = useRef<HTMLDivElement>(null)

  // Filtros
  const [cashiers, setCashiers]             = useState<Cashier[]>([])
  const [cashierFilter, setCashierFilter]   = useState('all')
  const [methodFilter, setMethodFilter]     = useState<MethodFilter>('all')

  // Datos
  const [rawSales, setRawSales]           = useState<SaleRow[]>([])
  const [loading, setLoading]             = useState(false)
  const [queryError, setQueryError]       = useState<string | null>(null)
  const [detail, setDetail]               = useState<SaleDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Exportar
  const [showExport, setShowExport]   = useState(false)
  const [exportRange, setExportRange] = useState<ExportRange>('month')
  const [exportFrom, setExportFrom]   = useState(toLocalDateStr(new Date()))
  const [exportTo, setExportTo]       = useState(toLocalDateStr(new Date()))
  const [exporting, setExporting]     = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportColumns, setExportColumns] = useState<ExportColumnId[]>(DEFAULT_EXPORT_COLUMNS)

  // Carga inicial: cajeros, categorías y ventas de hoy
  useEffect(() => {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any).from('profiles').select('id, name').order('name')
      .then(({ data }: { data: Cashier[] | null }) => { if (data) setCashiers(data) })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase as any).from('categories').select('id, name').order('name')
      .then(({ data }: { data: Category[] | null }) => {
        if (data) setCategories(data)
        setCategoriesLoaded(true)
      })
  }, [])

  // Consume únicamente fechas/categoría allowlisted y limpia la URL al terminar.
  useEffect(() => {
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const requestedCategory = searchParams.get('category')
    const voiceRange = isValidSalesDate(from) && isValidSalesDate(to) && getSalesRangeUtc(from, to)
      ? { from, to }
      : null

    if (voiceRange) {
      if (requestedCategory !== null && !categoriesLoaded) return

      const matchedCategory = requestedCategory === null
        ? null
        : categories.find(category => salesCategoryKey(category.name) === salesCategoryKey(requestedCategory))

      if (requestedCategory !== null && !matchedCategory) {
        initialSearchHandled.current = true
        setHasSearched(true)
        setRawSales([])
        setQueryError(`No existe la categoría "${requestedCategory}".`)
        router.replace('/ventas', { scroll: false })
        return
      }

      const requestKey = `${voiceRange.from}|${voiceRange.to}|${matchedCategory?.name ?? ''}`
      if (lastVoiceRequest.current === requestKey) return
      lastVoiceRequest.current = requestKey
      initialSearchHandled.current = true
      setPeriodFilter('custom')
      setCustomFrom(voiceRange.from)
      setCustomTo(voiceRange.to)
      setSelectedCats(matchedCategory ? [matchedCategory.name] : [])
      void handleSearch({ voiceRange })
      router.replace('/ventas', { scroll: false })
      return
    }

    lastVoiceRequest.current = null
    if (from !== null || to !== null || requestedCategory !== null) {
      router.replace('/ventas', { scroll: false })
    }
    if (initialSearchHandled.current) return
    initialSearchHandled.current = true
    void handleSearch()
    // Los valores iniciales son intencionales; una URL de voz se consume una sola vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, categoriesLoaded, router, searchParams])

  // Cerrar dropdown de categorías al hacer click fuera
  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (catRef.current && !catRef.current.contains(e.target as Node))
        setShowCatDropdown(false)
    }
    document.addEventListener('mousedown', onOutsideClick)
    return () => document.removeEventListener('mousedown', onOutsideClick)
  }, [])

  async function handleSearch(opts?: {
    voiceRange?: { from: string; to: string }
    period?: PeriodFilter
    from?: string
    to?: string
  }) {
    const requestId = ++searchRequestId.current
    setLoading(true)
    setHasSearched(true)
    setQueryError(null)
    setDetail(null)
    const supabase = createClient()
    const overrideRange = opts?.voiceRange
      ? getSalesRangeUtc(opts.voiceRange.from, opts.voiceRange.to)
      : null
    const { start, end } = overrideRange
      ?? getSearchRange(opts?.period ?? periodFilter, opts?.from ?? customFrom, opts?.to ?? customTo)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
      .from('sales')
      .select('id, total, payment_method, status, created_at, cashier_id')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false })

    if (cashierFilter !== 'all') query = query.eq('cashier_id', cashierFilter)

    const { data: salesData, error } = await query
    if (requestId !== searchRequestId.current) return // una búsqueda más reciente ya está en curso
    if (error) {
      console.error('[Ventas] Error al consultar ventas:', error)
      setQueryError(error.message ?? 'Error al cargar ventas')
      setLoading(false)
      return
    }
    if (!salesData) { setLoading(false); return }

    // Nombres de cajeros
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cashierIds = [...new Set((salesData as any[]).map((s: any) => s.cashier_id))]
    const cashierMap: Record<string, string> = {}
    if (cashierIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profiles } = await (supabase as any)
        .from('profiles').select('id, name').in('id', cashierIds)
      if (profiles) for (const p of profiles) cashierMap[p.id] = p.name
    }

    // Nombres de productos + categorías por venta
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const saleIds = (salesData as any[]).map((s: any) => s.id)
    const itemPreviewMap: Record<string, string>    = {}
    const itemCountMap: Record<string, number>       = {}
    const saleCatMap: Record<string, Set<string>>    = {}
    const saleProfitMap: Record<string, number>      = {}

    if (saleIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: items } = await (supabase as any)
        .from('sale_items')
        .select('sale_id, quantity, unit_price, product_variants(cost_price, flavor, products(name, category))')
        .in('sale_id', saleIds)
      if (items) {
        const grouped: Record<string, string[]> = {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const item of items as any[]) {
          const prod      = item.product_variants?.products
          const name      = prod?.name ?? 'Sin nombre'
          const cat       = prod?.category as string | null
          const costPrice = (item.product_variants?.cost_price as number) ?? 0
          const profit    = (item.unit_price - costPrice) * item.quantity
          if (!grouped[item.sale_id]) grouped[item.sale_id] = []
          if (!grouped[item.sale_id].includes(name)) grouped[item.sale_id].push(name)
          itemCountMap[item.sale_id]  = (itemCountMap[item.sale_id] ?? 0) + 1
          saleProfitMap[item.sale_id] = (saleProfitMap[item.sale_id] ?? 0) + profit
          if (cat) {
            if (!saleCatMap[item.sale_id]) saleCatMap[item.sale_id] = new Set()
            saleCatMap[item.sale_id].add(cat)
          }
        }
        for (const id of Object.keys(grouped))
          itemPreviewMap[id] = grouped[id].slice(0, 3).join(', ') + (grouped[id].length > 3 ? '…' : '')
      }
    }

    if (requestId !== searchRequestId.current) return // una búsqueda más reciente ya está en curso

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setRawSales((salesData as any[]).map((s: any) => ({
      id:              s.id,
      total:           s.total,
      payment_method:  s.payment_method,
      status:          s.status,
      created_at:      s.created_at,
      cashier_id:      s.cashier_id,
      cashier_name:    cashierMap[s.cashier_id] ?? 'Desconocido',
      item_count:      itemCountMap[s.id] ?? 0,
      item_names:      itemPreviewMap[s.id] ?? '—',
      item_categories: saleCatMap[s.id] ? Array.from(saleCatMap[s.id]) : [],
      sale_profit:     saleProfitMap[s.id] ?? 0,
    })))
    setLoading(false)
  }

  async function loadDetail(saleId: string) {
    setDetailLoading(true)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sale } = await (supabase as any)
      .from('sales')
      .select('id, total, payment_method, amount_paid, change_given, status, created_at, cashier_id, notes')
      .eq('id', saleId).single()
    if (!sale) { setDetailLoading(false); return }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: items } = await (supabase as any)
      .from('sale_items')
      .select('id, quantity, unit_price, subtotal, product_variants(id, flavor, products(name))')
      .eq('sale_id', saleId)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: cashierProfile } = await (supabase as any)
      .from('profiles').select('name').eq('id', sale.cashier_id).single()

    let payments: { method: string; amount: number }[] = []
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: paymentsData } = await (supabase as any)
        .from('sale_payments').select('method, amount').eq('sale_id', saleId)
      if (paymentsData) payments = paymentsData
    } catch { /* tabla puede no existir en instancias antiguas */ }

    setDetail({
      id:             sale.id,
      total:          sale.total,
      payment_method: sale.payment_method,
      amount_paid:    sale.amount_paid,
      change_given:   sale.change_given,
      status:         sale.status,
      created_at:     sale.created_at,
      cashier_name:   cashierProfile?.name ?? 'Desconocido',
      notes:          sale.notes ?? null,
      payments,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      items: (items ?? []).map((i: any) => ({
        id:         i.id,
        name:       i.product_variants?.products?.name ?? 'Sin nombre',
        flavor:     i.product_variants?.flavor ?? null,
        quantity:   i.quantity,
        unit_price: i.unit_price,
        subtotal:   i.subtotal,
      })),
    })
    setDetailLoading(false)
  }

  function handleReprint() {
    if (!detail) return
    const fakeCart: CartItem[] = detail.items.map(item => ({
      variant: {
        id: item.id, product_id: '', barcode: '', flavor: item.flavor,
        sale_price: item.unit_price, wholesale_price: item.unit_price,
        cost_price: 0, stock: 0, min_stock: 0, expiration_date: null, image_url: null,
        product: { id: '', name: item.name, category: null },
      },
      quantity: item.quantity, unitPrice: item.unit_price, useWholesale: false,
    }))
    const pm = (['cash','card','transfer','mixed'] as const).includes(
      detail.payment_method as 'cash'|'card'|'transfer'|'mixed'
    ) ? detail.payment_method as 'cash'|'card'|'transfer'|'mixed' : 'mixed'
    printReceipt({
      cart: fakeCart, total: detail.total, paymentMethod: pm,
      amountPaid: detail.amount_paid, change: detail.change_given,
      cashPaid:     detail.payments.find(p => p.method === 'cash')?.amount,
      cardPaid:     detail.payments.find(p => p.method === 'card')?.amount,
      transferPaid: detail.payments.find(p => p.method === 'transfer')?.amount,
      notes: detail.notes ?? undefined, date: new Date(detail.created_at),
    })
  }

  // ── Exportar Excel ─────────────────────────────────────────────────────────

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    const supabase = createClient()
    const { start, end, label } = getRangeISO(exportRange, exportFrom, exportTo)

    try {
      const salesData: ExportSaleRecord[] = []
      for (let offset = 0; ; offset += EXPORT_PAGE_SIZE) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any)
          .from('sales')
          .select('id, total, payment_method, amount_paid, change_given, status, created_at, cashier_id, notes')
          .gte('created_at', start)
          .lte('created_at', end)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(offset, offset + EXPORT_PAGE_SIZE - 1)

        if (error) throw new Error(`No se pudieron consultar las ventas: ${error.message}`)
        const page = (data ?? []) as ExportSaleRecord[]
        salesData.push(...page)
        if (page.length < EXPORT_PAGE_SIZE) break
      }

      if (salesData.length === 0) {
        setExportError('No hay ventas registradas en el período seleccionado.')
        return
      }

      const cashierIds = [...new Set(salesData.map(sale => sale.cashier_id).filter(Boolean))]
      const cashierMap: Record<string, string> = {}
      for (const cashierBatch of chunkValues(cashierIds, EXPORT_QUERY_BATCH_SIZE)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: profiles, error } = await (supabase as any)
          .from('profiles').select('id, name').in('id', cashierBatch)
        if (error) throw new Error(`No se pudieron consultar los cajeros: ${error.message}`)
        if (profiles) for (const profile of profiles) cashierMap[profile.id] = profile.name
      }

      const allItems: ExportItemRecord[] = []
      for (const saleIdBatch of chunkValues(salesData.map(sale => sale.id), EXPORT_QUERY_BATCH_SIZE)) {
        // Consultar por lotes evita exceder el largo máximo de URL y perder los productos.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: items, error } = await (supabase as any)
          .from('sale_items')
          .select('sale_id, variant_id, quantity, unit_price, subtotal, product_variants(barcode, flavor, sale_price, wholesale_price, cost_price, products(name, category))')
          .in('sale_id', saleIdBatch)
          .range(0, EXPORT_PAGE_SIZE - 1)
        if (error) throw new Error(`No se pudieron consultar los artículos vendidos: ${error.message}`)
        allItems.push(...((items ?? []) as ExportItemRecord[]))
      }

      const itemsBySale: Record<string, ExportItemRecord[]> = {}
      for (const item of allItems) {
        if (!itemsBySale[item.sale_id]) itemsBySale[item.sale_id] = []
        itemsBySale[item.sale_id].push(item)
      }

      const selectedColumns = EXPORT_COLUMNS.filter(column => exportColumns.includes(column.id))
      const detailRows: (string | number)[][] = []
      for (const sale of salesData) {
        const saleItems = itemsBySale[sale.id] ?? []
        const rows = saleItems.length > 0 ? saleItems : [null]
        for (const item of rows) {
          const context: ExportRowContext = {
            sale,
            item,
            cashierName: cashierMap[sale.cashier_id] ?? 'Desconocido',
          }
          detailRows.push(selectedColumns.map(column => column.getValue(context)))
        }
      }

      const detailHeaders = selectedColumns.map(column => column.label)
      const wsDetail = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows])
      wsDetail['!cols'] = selectedColumns.map(column => ({ wch: column.width }))
      wsDetail['!autofilter'] = { ref: XLSX.utils.encode_range({ r: 0, c: 0 }, { r: detailRows.length, c: detailHeaders.length - 1 }) }
      applyMoneyFormats(wsDetail, selectedColumns, detailRows.length)

      const summaryHeaders = ['Folio', 'Fecha', 'Hora', 'Cajero', 'Productos vendidos', 'Categorías', 'Forma de pago', 'Total', 'Pagó', 'Cambio', 'Costo actual', 'Ganancia estimada', 'Estado']
      const summaryRows = salesData.map(sale => {
        const dt = new Date(sale.created_at)
        const saleItems = itemsBySale[sale.id] ?? []
        const products = saleItems.map(item => {
          const name = item.product_variants?.products?.name ?? 'Sin nombre'
          const flavor = item.product_variants?.flavor ? ` (${item.product_variants.flavor})` : ''
          return `${numberValue(item.quantity)} × ${name}${flavor}`
        })
        const categories = [...new Set(saleItems.map(item => item.product_variants?.products?.category).filter(Boolean))]
        const cost = saleItems.reduce((sum, item) => sum + numberValue(item.product_variants?.cost_price) * numberValue(item.quantity), 0)
        return [
          sale.id.slice(-6).toUpperCase(),
          dt.toLocaleDateString('es-MX'),
          dt.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true }),
          cashierMap[sale.cashier_id] ?? 'Desconocido',
          products.join(', ') || 'Sin artículos registrados',
          categories.join(', ') || 'Sin categoría',
          METHOD_LABEL[sale.payment_method] ?? sale.payment_method,
          numberValue(sale.total), numberValue(sale.amount_paid), numberValue(sale.change_given),
          cost, numberValue(sale.total) - cost,
          sale.status === 'completed' ? 'Completada' : 'Anulada',
        ]
      })
      const wsSummary = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows])
      wsSummary['!cols'] = [{ wch: 10 }, { wch: 13 }, { wch: 12 }, { wch: 20 }, { wch: 55 }, { wch: 24 }, { wch: 17 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 13 }]
      wsSummary['!autofilter'] = { ref: XLSX.utils.encode_range({ r: 0, c: 0 }, { r: summaryRows.length, c: summaryHeaders.length - 1 }) }
      for (let columnIndex = 7; columnIndex <= 11; columnIndex++) {
        for (let rowIndex = 1; rowIndex <= summaryRows.length; rowIndex++) {
          const cell = wsSummary[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })]
          if (cell?.t === 'n') cell.z = '$#,##0.00'
        }
      }

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, wsDetail, 'Reporte personalizado')
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen por ticket')
      XLSX.writeFile(wb, `ventas-${label}.xlsx`)
      setShowExport(false)
    } catch (error) {
      console.error('[Ventas] Error al exportar:', error)
      setExportError(error instanceof Error ? error.message : 'No se pudo generar el archivo de Excel.')
    } finally {
      setExporting(false)
    }
  }

  // ── Filtrado cliente ───────────────────────────────────────────────────────

  const displayedSales = useMemo(() => {
    let result = rawSales
    if (searchText.trim()) result = result.filter(s => flexibleMatch(s, searchText))
    if (selectedCats.length > 0) result = result.filter(s => s.item_categories.some(c => selectedCats.includes(c)))
    if (methodFilter !== 'all')  result = result.filter(s => s.payment_method === methodFilter)
    return result
  }, [rawSales, searchText, selectedCats, methodFilter])

  const completed    = displayedSales.filter(s => s.status === 'completed')
  const totalRevenue = completed.reduce((sum, s) => sum + s.total, 0)
  const totalProfit  = completed.reduce((sum, s) => sum + s.sale_profit, 0)
  const cashTotal    = completed.filter(s => s.payment_method === 'cash').reduce((sum, s) => sum + s.total, 0)
  const cardTotal    = completed.filter(s => s.payment_method === 'card').reduce((sum, s) => sum + s.total, 0)

  // Los botones de período actualizan las ventas de inmediato; "Buscar" queda solo para el texto.
  function selectPeriod(id: PeriodFilter) {
    setPeriodFilter(id)
    if (id === 'custom') return // se busca cuando el usuario elige las fechas
    void handleSearch({ period: id })
  }

  function selectCustomFrom(value: string) {
    setCustomFrom(value)
    // El input nativo puede emitir una fecha incompleta mientras se escribe.
    if (isValidSalesDate(value)) void handleSearch({ period: 'custom', from: value, to: customTo })
  }

  function selectCustomTo(value: string) {
    setCustomTo(value)
    if (isValidSalesDate(value)) void handleSearch({ period: 'custom', from: customFrom, to: value })
  }

  function toggleCat(name: string) {
    setSelectedCats(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name])
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full" style={{ background: 'var(--bg)', color: 'var(--text)' }}>

      {/* ── Panel principal ──────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
          <div>
            <h1 className="text-base font-bold" style={{ color: 'var(--text)' }}>Historial de Ventas</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {hasSearched && !loading
                ? `${rawSales.length} venta${rawSales.length !== 1 ? 's' : ''} encontrada${rawSales.length !== 1 ? 's' : ''}`
                : 'Busca ventas por texto, período o categoría'}
            </p>
          </div>
          <button onClick={() => { setExportError(null); setShowExport(true) }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
            style={{ background: '#052e16', color: '#4ade80', border: '1px solid #166534' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Exportar Excel
          </button>
        </div>

        {/* ── Panel de búsqueda ──────────────────────────────────────────── */}
        <div className="shrink-0 px-4 py-3 flex flex-col gap-2.5"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>

          {/* Fila 1: campo de texto */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                placeholder="Buscar por folio, producto, cajero…"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
                className="w-full pl-9 pr-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              />
              {searchText && (
                <button onClick={() => setSearchText('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full text-xs"
                  style={{ color: 'var(--text-muted)', background: 'var(--surface)' }}>×</button>
              )}
            </div>
            <button onClick={() => void handleSearch()} disabled={loading}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-opacity"
              style={{ background: 'var(--accent)', color: '#000', opacity: loading ? 0.7 : 1 }}>
              {loading ? (
                <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: '#000', borderTopColor: 'transparent' }} />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              )}
              Buscar
            </button>
          </div>

          {/* Fila 2: período + categorías + cajero */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Período */}
            <div className="flex items-center gap-1">
              {PERIOD_OPTS.map(opt => (
                <button key={opt.id} onClick={() => selectPeriod(opt.id)}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold transition-all shrink-0"
                  style={{
                    background: periodFilter === opt.id ? 'var(--accent)' : 'var(--bg)',
                    color:      periodFilter === opt.id ? '#000' : 'var(--text-muted)',
                    border:     `1px solid ${periodFilter === opt.id ? 'var(--accent)' : 'var(--border)'}`,
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Fechas personalizadas */}
            {periodFilter === 'custom' && (
              <div className="flex items-center gap-1.5">
                <input type="date" value={customFrom} max={customTo}
                  onChange={e => selectCustomFrom(e.target.value)}
                  className="px-2 py-1 rounded-lg text-xs outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', colorScheme: 'dark' }} />
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
                <input type="date" value={customTo} min={customFrom} max={toLocalDateStr(new Date())}
                  onChange={e => selectCustomTo(e.target.value)}
                  className="px-2 py-1 rounded-lg text-xs outline-none"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', colorScheme: 'dark' }} />
              </div>
            )}

            <div className="flex-1" />

            {/* Filtro de categorías */}
            {categories.length > 0 && (
              <div className="relative" ref={catRef}>
                <button onClick={() => setShowCatDropdown(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: selectedCats.length > 0 ? 'rgba(250,200,0,0.12)' : 'var(--bg)',
                    border: `1px solid ${selectedCats.length > 0 ? 'var(--accent)' : 'var(--border)'}`,
                    color: selectedCats.length > 0 ? 'var(--accent)' : 'var(--text-muted)',
                  }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                    <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                  </svg>
                  Categorías
                  {selectedCats.length > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-xs font-bold"
                      style={{ background: 'var(--accent)', color: '#000', fontSize: '10px' }}>
                      {selectedCats.length}
                    </span>
                  )}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ transform: showCatDropdown ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>

                {showCatDropdown && (
                  <div className="absolute right-0 top-9 z-50 rounded-xl shadow-2xl overflow-hidden"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', minWidth: '180px', maxHeight: '260px', overflowY: 'auto' }}>
                    <div className="p-2 flex flex-col gap-0.5">
                      {/* Opción "Todas" */}
                      <button onClick={() => setSelectedCats([])}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors text-left w-full"
                        style={{ background: selectedCats.length === 0 ? 'rgba(250,200,0,0.1)' : 'transparent', color: selectedCats.length === 0 ? 'var(--accent)' : 'var(--text)' }}>
                        <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                          style={{ border: `2px solid ${selectedCats.length === 0 ? 'var(--accent)' : 'var(--border)'}`, background: selectedCats.length === 0 ? 'var(--accent)' : 'transparent' }}>
                          {selectedCats.length === 0 && (
                            <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="2 6 5 9 10 3"/>
                            </svg>
                          )}
                        </div>
                        <span className="font-semibold">Todas las categorías</span>
                      </button>

                      <div className="my-1" style={{ borderBottom: '1px solid var(--border)' }} />

                      {categories.map(cat => {
                        const active = selectedCats.includes(cat.name)
                        return (
                          <button key={cat.id} onClick={() => toggleCat(cat.name)}
                            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors text-left w-full"
                            style={{ background: active ? 'rgba(250,200,0,0.1)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text)' }}>
                            <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                              style={{ border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'var(--accent)' : 'transparent' }}>
                              {active && (
                                <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="2 6 5 9 10 3"/>
                                </svg>
                              )}
                            </div>
                            {cat.name}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Cajero */}
            <select value={cashierFilter} onChange={e => setCashierFilter(e.target.value)}
              className="text-xs rounded-lg px-3 py-1.5 outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>
              <option value="all">Todos los cajeros</option>
              {cashiers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {/* Stats (visibles solo después de buscar) */}
        {hasSearched && (
          <div className="grid grid-cols-5 gap-0 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
            {[
              { label: 'Ingresos',   value: fmt(totalRevenue), sub: `${completed.length} venta${completed.length !== 1 ? 's' : ''}`, color: 'var(--accent)' },
              { label: 'Ganancias',  value: fmt(totalProfit),  sub: 'ingresos − costo',  color: '#34d399' },
              { label: 'Efectivo',   value: fmt(cashTotal),    sub: `${completed.filter(s => s.payment_method === 'cash').length} transacciones`, color: '#4ade80' },
              { label: 'Tarjeta',    value: fmt(cardTotal),    sub: `${completed.filter(s => s.payment_method === 'card').length} transacciones`, color: '#60a5fa' },
              { label: 'Anuladas',   value: String(displayedSales.filter(s => s.status === 'cancelled').length), sub: 'ventas canceladas', color: '#FF6B6B' },
            ].map(stat => (
              <div key={stat.label} className="px-5 py-3" style={{ borderRight: '1px solid var(--border)' }}>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
                <p className="text-xl font-black font-mono mt-0.5" style={{ color: stat.color }}>{stat.value}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>{stat.sub}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filtro por método de pago (visible solo después de buscar) */}
        {hasSearched && (
          <div className="px-4 py-2 shrink-0 flex items-center gap-1.5 flex-wrap"
            style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
            <span className="text-xs font-medium mr-1" style={{ color: 'var(--text-muted)' }}>Método:</span>
            {(['all','cash','card','transfer','credit','mixed'] as const).map(m => {
              const active = methodFilter === m
              const color  = m === 'all' ? 'var(--accent)' : METHOD_COLOR[m]
              return (
                <button key={m} onClick={() => setMethodFilter(m)}
                  className="shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold transition-all"
                  style={{
                    background: active ? (m === 'all' ? 'var(--accent)' : `${color}22`) : 'var(--bg)',
                    color:      active ? (m === 'all' ? '#000' : color) : 'var(--text-muted)',
                    border:     `1px solid ${active ? color : 'var(--border)'}`,
                  }}>
                  {m === 'all' ? 'Todos' : METHOD_LABEL[m]}
                  {active && m !== 'all' && (
                    <span style={{ marginLeft: '4px', opacity: 0.7 }}>
                      ({displayedSales.filter(s => s.status === 'completed').length})
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Lista de ventas */}
        <div className="flex-1 overflow-y-auto">
          {!hasSearched ? (
            /* Estado inicial: invitar a buscar */
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                  strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)' }}>
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Busca ventas para comenzar</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Selecciona un período o escribe un término para filtrar
                </p>
              </div>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-7 h-7 rounded-full border-2 animate-spin"
                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
            </div>
          ) : queryError ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
                style={{ background: 'rgba(255,107,107,0.1)' }}>⚠️</div>
              <p className="text-sm font-medium" style={{ color: '#FF6B6B' }}>
                Error al cargar ventas
              </p>
              <p className="text-xs font-mono px-4 py-2 rounded-lg text-center max-w-xs"
                style={{ color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
                {queryError}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
                Revisa la consola del navegador para más detalles
              </p>
            </div>
          ) : displayedSales.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl"
                style={{ background: 'var(--surface)' }}>🔍</div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
                Sin resultados para esta búsqueda
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
                Prueba con otros términos, período o categorías
              </p>
            </div>
          ) : (
            <>
              <div className="grid text-xs font-semibold px-4 py-2 sticky top-0"
                style={{ gridTemplateColumns: '90px 110px 1fr 130px 90px 100px', color: 'var(--text-muted)', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                <span>Folio</span><span>Fecha / Hora</span><span>Productos</span>
                <span>Cajero</span><span>Método</span><span className="text-right">Total</span>
              </div>

              {displayedSales.map(sale => {
                const isSelected  = detail?.id === sale.id
                const isCancelled = sale.status === 'cancelled'
                return (
                  <button key={sale.id} onClick={() => loadDetail(sale.id)}
                    className="w-full text-left grid px-4 py-3 transition-colors"
                    style={{
                      gridTemplateColumns: '90px 110px 1fr 130px 90px 100px',
                      borderBottom: '1px solid var(--border)',
                      background: isSelected ? 'rgba(250,200,0,0.07)' : 'transparent',
                      opacity: isCancelled ? 0.5 : 1, cursor: 'pointer',
                    }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--surface)' }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                    <span className="font-mono text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>
                      #{sale.id.slice(-6).toUpperCase()}
                      {isCancelled && <span className="ml-1 text-xs" style={{ color: '#FF6B6B' }}>✕</span>}
                    </span>
                    <div className="flex flex-col">
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatDate(sale.created_at)}</span>
                      <span className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.65 }}>{formatHour(sale.created_at)}</span>
                    </div>
                    <span className="text-xs truncate pr-2" style={{ color: 'var(--text)' }}>{sale.item_names}</span>
                    <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{sale.cashier_name}</span>
                    <span>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: `${METHOD_COLOR[sale.payment_method] ?? '#888'}22`, color: METHOD_COLOR[sale.payment_method] ?? '#888' }}>
                        {METHOD_LABEL[sale.payment_method] ?? sale.payment_method}
                      </span>
                    </span>
                    <span className="text-sm font-black font-mono text-right"
                      style={{ color: isCancelled ? '#FF6B6B' : 'var(--accent)' }}>
                      {fmt(sale.total)}
                    </span>
                  </button>
                )
              })}
            </>
          )}
        </div>
      </div>

      {/* ── Panel de detalle ──────────────────────────────────────────────── */}
      <div className="flex flex-col shrink-0 transition-all duration-200"
        style={{
          width: detail || detailLoading ? '320px' : '0px',
          borderLeft: detail || detailLoading ? '1px solid var(--border)' : 'none',
          background: 'var(--surface)', overflow: 'hidden',
        }}>
        {detailLoading ? (
          <div className="flex items-center justify-center flex-1 w-80">
            <div className="w-6 h-6 rounded-full border-2 animate-spin"
              style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
          </div>
        ) : detail ? (
          <div className="flex flex-col h-full overflow-y-auto w-80">

            <div className="flex items-center justify-between px-4 py-3 shrink-0 sticky top-0"
              style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>
                  Ticket #{detail.id.slice(-6).toUpperCase()}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {formatDate(detail.created_at)} {formatHour(detail.created_at)} · {detail.cashier_name}
                </p>
              </div>
              <button onClick={() => setDetail(null)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-base"
                style={{ color: 'var(--text-muted)', background: 'var(--bg)' }}>×</button>
            </div>

            <div className="px-4 pt-3 flex items-center gap-2">
              <span className="text-xs px-2.5 py-1 rounded-full font-semibold"
                style={{
                  background: detail.status === 'completed' ? '#052e16' : '#2D1010',
                  color:      detail.status === 'completed' ? '#4ade80' : '#FF6B6B',
                }}>
                {detail.status === 'completed' ? 'Completada' : 'Anulada'}
              </span>
              <button onClick={handleReprint}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
                style={{ background: 'rgba(240,180,41,0.12)', color: 'var(--accent)', border: '1px solid rgba(240,180,41,0.3)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9"/>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                  <rect x="6" y="14" width="12" height="8"/>
                </svg>
                Reimprimir Ticket
              </button>
            </div>

            <div className="px-4 pt-3 flex flex-col gap-1.5">
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Productos</p>
              {detail.items.map(item => (
                <div key={item.id} className="flex items-center justify-between py-2 px-3 rounded-lg"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                      {item.name}{item.flavor ? ` — ${item.flavor}` : ''}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {item.quantity} × {fmt(item.unit_price)}
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold ml-2 shrink-0" style={{ color: 'var(--text)' }}>
                    {fmt(item.subtotal)}
                  </span>
                </div>
              ))}
            </div>

            {detail.notes && (
              <div className="px-4 pt-3">
                <div className="rounded-xl p-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Notas</p>
                  <p className="text-xs" style={{ color: 'var(--text)', fontStyle: 'italic' }}>{detail.notes}</p>
                </div>
              </div>
            )}

            <div className="px-4 pt-4 pb-4 mt-auto">
              <div className="rounded-xl p-3 flex flex-col gap-2"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>

                <div className="flex justify-between text-xs">
                  <span style={{ color: 'var(--text-muted)' }}>Método de pago</span>
                  <span className="font-semibold" style={{ color: METHOD_COLOR[detail.payment_method] ?? 'var(--text)' }}>
                    {METHOD_LABEL[detail.payment_method] ?? detail.payment_method}
                  </span>
                </div>

                {detail.payment_method === 'cash' && (
                  <>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: 'var(--text-muted)' }}>Pagó</span>
                      <span style={{ color: 'var(--text)' }}>{fmt(detail.amount_paid)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: 'var(--text-muted)' }}>Cambio</span>
                      <span style={{ color: 'var(--text)' }}>{fmt(detail.change_given)}</span>
                    </div>
                  </>
                )}

                {detail.payment_method === 'mixed' && detail.payments.length > 0 && (
                  <div className="pt-0.5 pb-0.5" style={{ borderTop: '1px dashed var(--border)' }}>
                    <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>Desglose</p>
                    <div className="flex flex-col gap-1">
                      {detail.payments.map((p, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span style={{ color: 'var(--text-muted)' }}>{METHOD_LABEL[p.method] ?? p.method}</span>
                          <span className="font-semibold" style={{ color: METHOD_COLOR[p.method] ?? 'var(--text)' }}>{fmt(p.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detail.payment_method === 'mixed' && detail.payments.length === 0 && (
                  <div className="flex justify-between text-xs">
                    <span style={{ color: 'var(--text-muted)' }}>Total pagado</span>
                    <span style={{ color: 'var(--text)' }}>{fmt(detail.amount_paid)}</span>
                  </div>
                )}

                <div className="flex justify-between text-sm pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                  <span className="font-bold" style={{ color: 'var(--text)' }}>Total</span>
                  <span className="font-black font-mono" style={{ color: 'var(--accent)' }}>{fmt(detail.total)}</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Modal de exportación ──────────────────────────────────────────── */}
      {showExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowExport(false) }}>
          <div className="w-full max-w-2xl max-h-[calc(100vh-2rem)] rounded-2xl flex flex-col gap-0 overflow-hidden shadow-2xl"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>

            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#052e16' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Exportar a Excel</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Elige el período y las columnas del reporte</p>
                </div>
              </div>
              <button onClick={() => setShowExport(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ color: 'var(--text-muted)', background: 'var(--bg)' }}>×</button>
            </div>

            <div className="p-4 flex flex-col gap-2 overflow-y-auto">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Período</p>
              </div>
              {([
                { id: 'day',    label: 'Hoy',                      sub: new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' }) },
                { id: 'week',   label: 'Esta semana',               sub: 'Lunes de esta semana hasta hoy' },
                { id: 'month',  label: 'Este mes',                  sub: new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }) },
                { id: 'custom', label: 'Período personalizado',     sub: 'Selecciona un rango de fechas' },
              ] as { id: ExportRange; label: string; sub: string }[]).map(opt => (
                <button key={opt.id} onClick={() => setExportRange(opt.id)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                  style={{ background: exportRange === opt.id ? '#052e16' : 'var(--bg)', border: `1px solid ${exportRange === opt.id ? '#166534' : 'var(--border)'}` }}>
                  <div className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                    style={{ border: `2px solid ${exportRange === opt.id ? '#4ade80' : 'var(--border)'}`, background: exportRange === opt.id ? '#4ade80' : 'transparent' }}>
                    {exportRange === opt.id && <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#000' }} />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: exportRange === opt.id ? '#4ade80' : 'var(--text)' }}>{opt.label}</p>
                    <p className="text-xs capitalize" style={{ color: 'var(--text-muted)' }}>{opt.sub}</p>
                  </div>
                </button>
              ))}

              {exportRange === 'custom' && (
                <div className="flex items-center gap-2 mt-1 px-4 py-3 rounded-xl"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <div className="flex-1">
                    <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Desde</p>
                    <input type="date" value={exportFrom} max={exportTo}
                      onChange={e => setExportFrom(e.target.value)}
                      className="w-full rounded-lg px-2 py-1.5 text-xs outline-none"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', colorScheme: 'dark' }} />
                  </div>
                  <div className="text-xs pt-4" style={{ color: 'var(--text-muted)' }}>—</div>
                  <div className="flex-1">
                    <p className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Hasta</p>
                    <input type="date" value={exportTo} min={exportFrom} max={toLocalDateStr(new Date())}
                      onChange={e => setExportTo(e.target.value)}
                      className="w-full rounded-lg px-2 py-1.5 text-xs outline-none"
                      style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', colorScheme: 'dark' }} />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mt-4 mb-1">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Columnas del reporte</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{exportColumns.length} de {EXPORT_COLUMNS.length} seleccionadas</p>
                </div>
                <button type="button"
                  onClick={() => setExportColumns(exportColumns.length === EXPORT_COLUMNS.length ? [] : DEFAULT_EXPORT_COLUMNS)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: 'var(--bg)', color: 'var(--accent)', border: '1px solid var(--border)' }}>
                  {exportColumns.length === EXPORT_COLUMNS.length ? 'Quitar todas' : 'Seleccionar todas'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {EXPORT_COLUMNS.map(column => {
                  const checked = exportColumns.includes(column.id)
                  return (
                    <label key={column.id}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer select-none"
                      style={{ background: checked ? '#052e16' : 'var(--bg)', border: `1px solid ${checked ? '#166534' : 'var(--border)'}` }}>
                      <input type="checkbox" checked={checked}
                        onChange={() => setExportColumns(previous => checked
                          ? previous.filter(id => id !== column.id)
                          : [...previous, column.id])}
                        className="w-4 h-4 accent-green-500" />
                      <span className="text-xs font-medium" style={{ color: checked ? '#4ade80' : 'var(--text)' }}>{column.label}</span>
                    </label>
                  )
                })}
              </div>

              <div className="mt-2 px-3 py-2.5 rounded-xl text-xs"
                style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                El archivo tendrá <span style={{ color: 'var(--text)' }}>Reporte personalizado</span> (una fila por artículo vendido) y{' '}
                <span style={{ color: 'var(--text)' }}>Resumen por ticket</span>. El costo, categoría y código de barras reflejan el catálogo actual.
              </div>

              {exportError && (
                <div className="px-3 py-2.5 rounded-xl text-xs" role="alert"
                  style={{ background: '#450a0a', border: '1px solid #991b1b', color: '#fca5a5' }}>
                  {exportError}
                </div>
              )}
            </div>

            <div className="flex gap-2 px-4 py-4" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setShowExport(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                Cancelar
              </button>
              <button onClick={handleExport}
                disabled={exporting || exportColumns.length === 0 || (exportRange === 'custom' && (!exportFrom || !exportTo))}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-opacity"
                style={{ background: '#166534', color: '#4ade80', opacity: exporting || exportColumns.length === 0 ? 0.55 : 1 }}>
                {exporting ? (
                  <><div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: '#4ade80', borderTopColor: 'transparent' }} />Generando…</>
                ) : (
                  <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>Descargar .xlsx</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function VentasPage() {
  return (
    <Suspense fallback={<div className="p-5 text-sm" style={{ color: 'var(--text-muted)' }}>Cargando ventas…</div>}>
      <VentasContent />
    </Suspense>
  )
}
