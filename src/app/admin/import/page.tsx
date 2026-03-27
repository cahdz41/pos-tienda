'use client'

import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'

interface ExcelRow {
  barcode: string
  full_name: string
  cost_price: number
  sale_price: number
  wholesale_price: number
  stock: number
  min_stock: number
  max_stock: number
  category: string
  // parsed
  brand: string
  parent_name: string
  flavor: string | null
}

function parseProductName(fullName: string): { brand: string; parent_name: string; flavor: string | null } {
  const parts = fullName.split(' - ')

  if (parts.length >= 3) {
    const brand = parts[0].trim()
    const flavor = parts[parts.length - 1].trim()
    const parent_name = parts.slice(0, parts.length - 1).join(' - ').trim()
    return { brand, parent_name, flavor }
  }

  if (parts.length === 2) {
    return {
      brand: parts[0].trim(),
      parent_name: fullName.trim(),
      flavor: null,
    }
  }

  return { brand: '', parent_name: fullName.trim(), flavor: null }
}

function parsePrice(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    return parseFloat(value.replace(/[$,]/g, '')) || 0
  }
  return 0
}

export default function ImportPage() {
  const [rows, setRows] = useState<ExcelRow[]>([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string>('')
  const [error, setError] = useState<string>('')

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      const data = evt.target?.result
      const workbook = XLSX.read(data, { type: 'binary' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const raw = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[]

      const parsed: ExcelRow[] = raw.map((r) => {
        const fullName = String(r['Producto'] || '')
        const { brand, parent_name, flavor } = parseProductName(fullName)
        return {
          barcode: String(r['Código'] || ''),
          full_name: fullName,
          cost_price: parsePrice(r['P. Costo']),
          sale_price: parsePrice(r['P. Venta']),
          wholesale_price: parsePrice(r['P. Mayoreo']),
          stock: parsePrice(r['Existencia']),
          min_stock: parsePrice(r['Inv. Mínimo']),
          max_stock: parsePrice(r['Inv. Máximo']),
          category: String(r['Departamento'] || ''),
          brand,
          parent_name,
          flavor,
        }
      }).filter(r => r.barcode && r.full_name)

      setRows(parsed)
      setStatus('')
      setError('')
    }
    reader.readAsBinaryString(file)
  }

  async function handleImport() {
    if (rows.length === 0) return
    setLoading(true)
    setError('')
    setStatus('Importando productos...')

    try {
      // Agrupar por producto padre
      const productMap = new Map<string, { name: string; brand: string; category: string }>()
      for (const row of rows) {
        if (!productMap.has(row.parent_name)) {
          productMap.set(row.parent_name, {
            name: row.parent_name,
            brand: row.brand,
            category: row.category,
          })
        }
      }

      // Insertar productos padre (ignorar duplicados)
      const productsToInsert = Array.from(productMap.values())
      const { data: insertedProducts, error: prodError } = await supabase
        .from('products')
        .upsert(productsToInsert, { onConflict: 'name' })
        .select()

      if (prodError) throw prodError

      // Obtener todos los productos para mapear nombre → id
      const { data: allProducts, error: fetchError } = await supabase
        .from('products')
        .select('id, name')

      if (fetchError) throw fetchError

      const nameToId = new Map(allProducts.map((p: { id: string; name: string }) => [p.name, p.id]))

      // Insertar variantes
      const variantsToInsert = rows.map((row) => ({
        product_id: nameToId.get(row.parent_name),
        barcode: row.barcode,
        flavor: row.flavor,
        cost_price: row.cost_price,
        sale_price: row.sale_price,
        wholesale_price: row.wholesale_price,
        stock: row.stock,
        min_stock: row.min_stock,
        max_stock: row.max_stock,
      }))

      const { error: varError } = await supabase
        .from('product_variants')
        .upsert(variantsToInsert, { onConflict: 'barcode' })

      if (varError) throw varError

      setStatus(`✓ Importación completada: ${productsToInsert.length} productos, ${rows.length} variantes.`)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError('Error: ' + message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Importar productos desde Excel</h1>

      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Selecciona tu archivo Excel (.xlsx)</label>
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFile}
          className="block w-full text-sm border border-gray-300 rounded p-2"
        />
      </div>

      {rows.length > 0 && (
        <>
          <div className="mb-4 flex items-center gap-4">
            <span className="text-sm text-gray-600">{rows.length} productos encontrados</span>
            <button
              onClick={handleImport}
              disabled={loading}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Importando...' : 'Importar a Supabase'}
            </button>
          </div>

          {status && <p className="mb-4 text-green-600 font-medium">{status}</p>}
          {error && <p className="mb-4 text-red-600 font-medium">{error}</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse border border-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border border-gray-200 p-2 text-left">Código</th>
                  <th className="border border-gray-200 p-2 text-left">Producto padre</th>
                  <th className="border border-gray-200 p-2 text-left">Sabor</th>
                  <th className="border border-gray-200 p-2 text-left">Categoría</th>
                  <th className="border border-gray-200 p-2 text-right">P. Costo</th>
                  <th className="border border-gray-200 p-2 text-right">P. Venta</th>
                  <th className="border border-gray-200 p-2 text-right">P. Mayoreo</th>
                  <th className="border border-gray-200 p-2 text-right">Stock</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="border border-gray-200 p-2 font-mono">{row.barcode}</td>
                    <td className="border border-gray-200 p-2">{row.parent_name}</td>
                    <td className="border border-gray-200 p-2 text-gray-500">{row.flavor ?? '—'}</td>
                    <td className="border border-gray-200 p-2">{row.category}</td>
                    <td className="border border-gray-200 p-2 text-right">${row.cost_price}</td>
                    <td className="border border-gray-200 p-2 text-right">${row.sale_price}</td>
                    <td className="border border-gray-200 p-2 text-right">${row.wholesale_price}</td>
                    <td className="border border-gray-200 p-2 text-right">{row.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
