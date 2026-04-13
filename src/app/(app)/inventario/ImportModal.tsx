'use client'

import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase'

// ── Tipos ────────────────────────────────────────────────────────────────────

interface ImportRow {
  barcode: string
  name: string
  cost_price: number
  sale_price: number
  wholesale_price: number
  stock: number
}

interface ImportResult {
  ok: number
  failed: number
  errors: string[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseNum(val: unknown): number {
  if (val == null || val === '') return 0
  const n = parseFloat(String(val).replace(/[$,\s]/g, ''))
  return isNaN(n) ? 0 : n
}

function parseStr(val: unknown): string {
  return val == null ? '' : String(val).trim()
}

function parseRows(sheet: XLSX.WorkSheet): ImportRow[] {
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  const rows: ImportRow[] = []

  for (const r of raw) {
    // Buscar columnas por nombre (case-insensitive, con variaciones)
    const keys = Object.keys(r)
    const find = (patterns: string[]) => {
      const k = keys.find(k => patterns.some(p => k.toLowerCase().includes(p.toLowerCase())))
      return k ? r[k] : ''
    }

    const barcode = parseStr(find(['código', 'codigo', 'barcode', 'cód', 'cod']))
    if (!barcode) continue // fila sin código → skip

    rows.push({
      barcode,
      name:            parseStr(find(['producto', 'nombre', 'name', 'description'])),
      cost_price:      parseNum(find(['costo', 'cost'])),
      sale_price:      parseNum(find(['venta', 'sale', 'precio'])),
      wholesale_price: parseNum(find(['mayoreo', 'wholesale', 'mayor'])),
      stock:           parseNum(find(['existencia', 'stock', 'cantidad'])),
    })
  }

  return rows
}

// ── Componente ───────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
  onImported: () => void // recarga el inventario tras importar
}

export default function ImportModal({ onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setParseError(null)
    setResult(null)
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = ev.target?.result
        const wb = XLSX.read(data, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const parsed = parseRows(sheet)
        if (parsed.length === 0) {
          setParseError('No se encontraron filas válidas. Verifica que el archivo tenga la columna "Código".')
          setRows(null)
        } else {
          setRows(parsed)
        }
      } catch {
        setParseError('Error leyendo el archivo. Verifica que sea un .xlsx válido.')
        setRows(null)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleImport() {
    if (!rows || rows.length === 0) return
    setImporting(true)

    const supabase = createClient()
    let ok = 0
    let failed = 0
    const errors: string[] = []

    // Upsert en lotes de 50 por barcode
    const BATCH = 50
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('product_variants')
        .upsert(
          batch.map(r => ({
            barcode:         r.barcode,
            cost_price:      r.cost_price,
            sale_price:      r.sale_price,
            wholesale_price: r.wholesale_price,
            stock:           r.stock,
          })),
          { onConflict: 'barcode', ignoreDuplicates: false }
        )

      if (error) {
        failed += batch.length
        errors.push(`Lote ${Math.floor(i / BATCH) + 1}: ${error.message}`)
      } else {
        ok += batch.length
      }
    }

    setResult({ ok, failed, errors })
    setImporting(false)
    if (ok > 0) onImported()
  }

  const preview = rows ? rows.slice(0, 20) : []
  const totalRows = rows?.length ?? 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="rounded-xl flex flex-col"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          width: '100%',
          maxWidth: '760px',
          maxHeight: '90vh',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>
            Importar desde Excel
          </h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', fontSize: '20px', lineHeight: 1 }}>×</button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 flex flex-col gap-4">

          {/* Zona de selección de archivo */}
          {!rows && !result && (
            <div>
              <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                Columnas reconocidas: <strong>Código</strong>, Producto, P. Costo, P. Venta, P. Mayoreo, Existencia.
                El upsert se hace por código de barras — si el código ya existe, actualiza; si no, lo omite
                (no crea variantes nuevas sin un producto padre asignado).
              </p>
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full py-8 rounded-lg text-sm font-semibold flex flex-col items-center gap-2"
                style={{
                  border: '2px dashed var(--border)',
                  color: 'var(--text-muted)',
                  background: 'var(--bg)',
                }}
              >
                <span style={{ fontSize: '28px' }}>📂</span>
                Seleccionar archivo .xlsx
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFile}
              />
              {parseError && (
                <p className="text-xs mt-2 text-center" style={{ color: '#FF6B6B' }}>{parseError}</p>
              )}
            </div>
          )}

          {/* Preview */}
          {rows && !result && (
            <>
              <div className="flex items-center justify-between shrink-0">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  <strong style={{ color: 'var(--text)' }}>{fileName}</strong>
                  {' '}— {totalRows} filas encontradas{totalRows > 20 ? ` (mostrando primeras 20)` : ''}
                </p>
                <button
                  onClick={() => { setRows(null); setFileName(''); if (fileRef.current) fileRef.current.value = '' }}
                  className="text-xs px-2 py-1 rounded"
                  style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                >
                  Cambiar archivo
                </button>
              </div>

              <div className="overflow-auto flex-1">
                <table className="w-full text-xs border-collapse" style={{ minWidth: '560px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Código', 'Nombre', 'P. Costo', 'P. Venta', 'P. Mayoreo', 'Existencia'].map(h => (
                        <th key={h} className="text-left py-1.5 px-2 font-semibold"
                          style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="py-1.5 px-2 font-mono" style={{ color: 'var(--text-muted)' }}>{r.barcode}</td>
                        <td className="py-1.5 px-2" style={{ color: 'var(--text)', maxWidth: '200px' }}>
                          <span className="truncate block">{r.name || '—'}</span>
                        </td>
                        <td className="py-1.5 px-2 font-mono" style={{ color: 'var(--text-muted)' }}>
                          ${r.cost_price.toLocaleString('es-MX')}
                        </td>
                        <td className="py-1.5 px-2 font-mono font-semibold" style={{ color: 'var(--accent)' }}>
                          ${r.sale_price.toLocaleString('es-MX')}
                        </td>
                        <td className="py-1.5 px-2 font-mono" style={{ color: 'var(--text-muted)' }}>
                          ${r.wholesale_price.toLocaleString('es-MX')}
                        </td>
                        <td className="py-1.5 px-2 font-mono" style={{ color: 'var(--text-muted)' }}>{r.stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Resultado */}
          {result && (
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <div className="flex-1 rounded-lg p-4 text-center"
                  style={{ background: result.ok > 0 ? '#0D2B0D' : 'var(--bg)', border: '1px solid var(--border)' }}>
                  <p className="text-2xl font-bold font-mono" style={{ color: '#4CAF50' }}>{result.ok}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Actualizados</p>
                </div>
                {result.failed > 0 && (
                  <div className="flex-1 rounded-lg p-4 text-center"
                    style={{ background: '#2D1010', border: '1px solid var(--border)' }}>
                    <p className="text-2xl font-bold font-mono" style={{ color: '#FF6B6B' }}>{result.failed}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Con error</p>
                  </div>
                )}
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-lg p-3" style={{ background: '#2D1010', border: '1px solid #4D1A1A' }}>
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs" style={{ color: '#FF6B6B' }}>{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 justify-end px-5 py-3 shrink-0"
          style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            {result ? 'Cerrar' : 'Cancelar'}
          </button>
          {rows && !result && (
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-5 py-2 rounded-lg text-sm font-bold"
              style={{
                background: importing ? 'var(--bg)' : 'var(--accent)',
                color: importing ? 'var(--text-muted)' : '#000',
                border: '1px solid var(--border)',
                opacity: importing ? 0.7 : 1,
              }}
            >
              {importing ? 'Importando…' : `Importar ${totalRows} filas`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
