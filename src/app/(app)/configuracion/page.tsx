'use client'

import { useState, useEffect } from 'react'
import { printReceipt } from '../pos/Receipt'
import { createClient } from '@/lib/supabase'
import type { CartItem } from '@/types'
import { StoreOrdersPanel } from '@/components/tienda/StoreOrdersPanel'

const K = {
  businessName: 'pos_business_name',
  footer:       'pos_receipt_footer',
  paperWidth:   'pos_paper_width',
  autoprint:    'pos_autoprint',
  reportEmail:  'pos_report_email',
}

function load(key: string, def: string) {
  if (typeof window === 'undefined') return def
  return localStorage.getItem(key) ?? def
}

const TEST_CART: CartItem[] = [
  {
    variant: {
      id: 'test-1', product_id: 'p1', barcode: '001',
      flavor: 'Fresa', sale_price: 25, wholesale_price: 20,
      cost_price: 15, stock: 10, min_stock: 2, expiration_date: null,
      product: { id: 'p1', name: 'Producto Ejemplo', category: 'General' },
    },
    quantity: 2, unitPrice: 25,
  },
  {
    variant: {
      id: 'test-2', product_id: 'p2', barcode: '002',
      flavor: null, sale_price: 50, wholesale_price: 40,
      cost_price: 30, stock: 5, min_stock: 1, expiration_date: null,
      product: { id: 'p2', name: 'Otro Producto', category: 'General' },
    },
    quantity: 1, unitPrice: 50,
  },
]

interface CashierRow { id: string; name: string; email: string; role: string }

function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label className="text-xs font-semibold block mb-1.5" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      {children}
      {hint && <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>{hint}</p>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-5 flex flex-col gap-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>{title}</p>
      {children}
    </section>
  )
}

export default function ConfiguracionPage() {
  // ── Negocio ───────────────────────────────────────────────────────────
  const [businessName, setBusinessName] = useState(() => load(K.businessName, 'Mi Negocio'))
  const [footer,       setFooter]       = useState(() => load(K.footer,       'Gracias por su compra'))
  const [paperWidth,   setPaperWidth]   = useState(() => load(K.paperWidth,   '80mm'))
  const [autoprint,    setAutoprint]    = useState(() => load(K.autoprint,    'false') === 'true')
  const [flash,        setFlash]        = useState(false)

  // ── Cajeros ───────────────────────────────────────────────────────────
  const [cashiers,       setCashiers]       = useState<CashierRow[]>([])
  const [loadingCashiers, setLoadingCashiers] = useState(false)
  const [showAddForm,    setShowAddForm]    = useState(false)
  const [newName,        setNewName]        = useState('')
  const [newEmail,       setNewEmail]       = useState('')
  const [newPassword,    setNewPassword]    = useState('')
  const [showPass,       setShowPass]       = useState(false)
  const [savingCashier,  setSavingCashier]  = useState(false)
  const [cashierError,   setCashierError]   = useState<string | null>(null)

  // ── Tienda Online ─────────────────────────────────────────────────────
  const [storeCount, setStoreCount] = useState<number | null>(null)

  // ── Reporte por email ─────────────────────────────────────────────────
  const [reportEmail, setReportEmail] = useState(() => load(K.reportEmail, ''))
  const [sending,     setSending]     = useState(false)
  const [sendResult,  setSendResult]  = useState<'ok' | 'error' | null>(null)
  const [sendError,   setSendError]   = useState('')

  useEffect(() => { loadCashiers(); loadStoreProducts() }, [])

  // ── Helpers localStorage ──────────────────────────────────────────────
  function persist(key: string, value: string) {
    localStorage.setItem(key, value)
    setFlash(true)
    setTimeout(() => setFlash(false), 1400)
  }

  // ── Tienda: contar productos con stock ───────────────────────────────
  async function loadStoreProducts() {
    const supabase = createClient()
    const { data } = await supabase
      .from('product_variants')
      .select('product_id')
      .gt('stock', 0)
    const unique = new Set((data ?? []).map(v => v.product_id))
    setStoreCount(unique.size)
  }

  // ── Cajeros: carga ────────────────────────────────────────────────────
  async function loadCashiers() {
    setLoadingCashiers(true)
    try {
      const res = await fetch('/api/admin/cashiers')
      if (res.ok) setCashiers(await res.json())
    } catch { /* sin service key, se mostrará vacío */ }
    setLoadingCashiers(false)
  }

  // ── Cajeros: crear ────────────────────────────────────────────────────
  async function handleCreateCashier() {
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) return
    setSavingCashier(true)
    setCashierError(null)
    const res = await fetch('/api/admin/cashiers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, email: newEmail, password: newPassword }),
    })
    const data = await res.json()
    if (!res.ok) {
      setCashierError(data.error || 'Error al crear cajero')
    } else {
      setCashiers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name, 'es')))
      setNewName(''); setNewEmail(''); setNewPassword('')
      setShowAddForm(false)
    }
    setSavingCashier(false)
  }

  // ── Cajeros: eliminar ─────────────────────────────────────────────────
  async function handleDeleteCashier(id: string, name: string) {
    if (!window.confirm(`¿Eliminar al cajero "${name}"? Esta acción no se puede deshacer.`)) return
    const res = await fetch('/api/admin/cashiers', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) setCashiers(prev => prev.filter(c => c.id !== id))
  }

  // ── Email: enviar reporte de prueba ───────────────────────────────────
  async function handleSendReport() {
    if (!reportEmail.trim()) return
    setSending(true)
    setSendResult(null)
    const res = await fetch('/api/reports/daily-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: reportEmail, test: true }),
    })
    const data = await res.json()
    setSendResult(res.ok ? 'ok' : 'error')
    setSendError(res.ok ? '' : (data.error || 'Error al enviar'))
    setSending(false)
    setTimeout(() => setSendResult(null), 4000)
  }

  const inputStyle = { background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Header */}
      <div className="px-5 pt-5 pb-3 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Configuración</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Solo visible para administradores</p>
          </div>
          <div className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity"
            style={{ background: '#0D2B0D', color: '#4CAF50', border: '1px solid #2D4A2D', opacity: flash ? 1 : 0 }}>
            ✓ Guardado
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-5 pb-5 flex flex-col gap-4">

        {/* ── Negocio ── */}
        <Section title="Negocio">
          <Field label="Nombre del negocio" hint="Aparece en el encabezado de cada ticket impreso">
            <input type="text" value={businessName}
              onChange={e => setBusinessName(e.target.value)}
              onBlur={() => persist(K.businessName, businessName)}
              placeholder="Mi Negocio"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            />
          </Field>
          <Field label="Pie de ticket" hint="Mensaje al final del ticket — agradecimiento, redes sociales, etc.">
            <textarea value={footer}
              onChange={e => setFooter(e.target.value)}
              onBlur={() => persist(K.footer, footer)}
              placeholder="Gracias por su compra"
              rows={2}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none resize-none"
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            />
          </Field>
        </Section>

        {/* ── Impresora ── */}
        <Section title="Impresora térmica">
          <Field label="Ancho de papel" hint="EPSON TM-T20II = 80mm">
            <div className="grid grid-cols-2 gap-2 mt-1">
              {(['80mm', '58mm'] as const).map(w => (
                <button key={w} onClick={() => { setPaperWidth(w); persist(K.paperWidth, w) }}
                  className="py-3 rounded-xl text-sm font-semibold"
                  style={{
                    background: paperWidth === w ? 'var(--accent)' : 'var(--bg)',
                    color:      paperWidth === w ? '#000' : 'var(--text-muted)',
                    border:     `1px solid ${paperWidth === w ? 'var(--accent)' : 'var(--border)'}`,
                  }}>
                  {w}
                </button>
              ))}
            </div>
          </Field>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>Impresión automática</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Imprimir ticket al completar cada venta
              </p>
            </div>
            <button onClick={() => { setAutoprint(!autoprint); persist(K.autoprint, !autoprint ? 'true' : 'false') }}
              className="relative shrink-0 w-12 h-6 rounded-full transition-all"
              style={{ background: autoprint ? 'var(--accent)' : 'var(--border)' }}>
              <div className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
                style={{ left: autoprint ? '26px' : '2px', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
            </button>
          </div>
          <button onClick={() => printReceipt({ cart: TEST_CART, total: 100, paymentMethod: 'cash', amountPaid: 100, change: 0, date: new Date() })}
            className="self-start px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            Imprimir ticket de prueba
          </button>
        </Section>

        {/* ── Cajeros ── */}
        <Section title="Cajeros">
          {loadingCashiers ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full border-2 animate-spin"
                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Cargando…</span>
            </div>
          ) : cashiers.length === 0 && !showAddForm ? (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              No hay cajeros registrados.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {cashiers.map(c => (
                <div key={c.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                  style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{c.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{c.email}</p>
                  </div>
                  <button onClick={() => handleDeleteCashier(c.id, c.name)}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                    style={{ background: '#2D1010', color: '#FF6B6B', border: '1px solid #4D1A1A' }}>
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Formulario nuevo cajero */}
          {showAddForm ? (
            <div className="flex flex-col gap-3 pt-1">
              <div className="h-px" style={{ background: 'var(--border)' }} />
              <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Nuevo cajero</p>
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Nombre completo"
                className="rounded-lg px-3 py-2.5 text-sm outline-none"
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
              <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                className="rounded-lg px-3 py-2.5 text-sm outline-none"
                style={inputStyle}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              />
              <div className="relative">
                <input type={showPass ? 'text' : 'password'}
                  value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  placeholder="Contraseña (mín. 6 caracteres)"
                  className="w-full rounded-lg px-3 py-2.5 pr-10 text-sm outline-none"
                  style={inputStyle}
                  onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                />
                <button onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
                  style={{ color: 'var(--text-muted)' }}>
                  {showPass ? 'Ocultar' : 'Ver'}
                </button>
              </div>
              {cashierError && <p className="text-xs" style={{ color: '#FF6B6B' }}>{cashierError}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setShowAddForm(false); setCashierError(null) }}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold"
                  style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  Cancelar
                </button>
                <button onClick={handleCreateCashier}
                  disabled={savingCashier || !newName.trim() || !newEmail.trim() || !newPassword.trim()}
                  className="flex-1 py-2 rounded-xl text-sm font-bold disabled:opacity-40"
                  style={{ background: 'var(--accent)', color: '#000' }}>
                  {savingCashier ? 'Creando…' : 'Crear cajero'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAddForm(true)}
              className="self-start px-4 py-2 rounded-xl text-sm font-bold"
              style={{ background: 'var(--accent)', color: '#000' }}>
              + Agregar cajero
            </button>
          )}
        </Section>

        {/* ── Reporte diario por email ── */}
        <Section title="Reporte diario por email">
          <p className="text-xs -mt-2" style={{ color: 'var(--text-muted)' }}>
            Recibe un resumen de ventas cada día. Requiere configurar{' '}
            <strong style={{ color: 'var(--text)' }}>RESEND_API_KEY</strong> en el servidor.
          </p>

          <Field label="Correo para reportes">
            <input type="email" value={reportEmail}
              onChange={e => setReportEmail(e.target.value)}
              onBlur={() => persist(K.reportEmail, reportEmail)}
              placeholder="admin@tuempresa.com"
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            />
          </Field>

          <div className="flex items-center gap-3">
            <button onClick={handleSendReport}
              disabled={sending || !reportEmail.trim()}
              className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40"
              style={{ background: 'var(--accent)', color: '#000' }}>
              {sending ? 'Enviando…' : 'Enviar reporte de prueba'}
            </button>
            {sendResult === 'ok' && (
              <span className="text-xs font-semibold" style={{ color: '#4CAF50' }}>✓ Enviado</span>
            )}
            {sendResult === 'error' && (
              <span className="text-xs" style={{ color: '#FF6B6B' }}>{sendError}</span>
            )}
          </div>

          <div className="rounded-xl p-3 text-xs flex flex-col gap-1"
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            <p className="font-semibold" style={{ color: 'var(--text)' }}>Automatizar con cron (VPS)</p>
            <p>Agrega esta línea al crontab del servidor para recibir el reporte a las 8am:</p>
            <code className="mt-1 block rounded px-2 py-1.5 text-xs break-all"
              style={{ background: 'var(--surface)', color: 'var(--accent)', fontFamily: 'monospace' }}>
              {`0 8 * * * curl -s -X POST http://localhost:3003/api/reports/daily-email -H "Content-Type: application/json" -d '{"email":"${reportEmail || 'tu@correo.com'}"}'`}
            </code>
          </div>
        </Section>

        {/* ── Tienda Online ── */}
        <Section title="Tienda Online">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                La tienda muestra automáticamente todos los productos con existencia en el POS.
              </p>
              {storeCount !== null && (
                <p className="text-xs mt-2 font-semibold" style={{ color: 'var(--accent)' }}>
                  {storeCount} {storeCount === 1 ? 'producto visible' : 'productos visibles'} ahora mismo
                </p>
              )}
            </div>
            <a href="/tienda" target="_blank" rel="noopener noreferrer"
              className="shrink-0 px-3 py-2 rounded-xl text-xs font-bold"
              style={{ background: 'var(--accent)', color: '#000', textDecoration: 'none' }}>
              Ver tienda →
            </a>
          </div>
        </Section>

        {/* ── Pedidos de la tienda ── */}
        <Section title="Pedidos de la tienda">
          <StoreOrdersPanel />
        </Section>

      </div>
    </div>
  )
}
