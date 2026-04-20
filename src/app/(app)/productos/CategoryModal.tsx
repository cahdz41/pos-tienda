'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Category } from '@/types'

interface Props {
  onClose: () => void
  onChanged: () => void
}

export default function CategoryModal({ onClose, onChanged }: Props) {
  const [categories, setCategories] = useState<Category[]>([])
  const [productCounts, setProductCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadCategories() }, [])

  async function loadCategories() {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    try {
      const { data: cats, error: err } = await supabase
        .from('categories')
        .select('id, name, created_at')
        .order('name')
      if (err) throw new Error(err.message)

      const list = (cats ?? []) as Category[]
      setCategories(list)

      // Count products per category name
      if (list.length > 0) {
        const { data: products } = await supabase
          .from('products')
          .select('category')
        const counts: Record<string, number> = {}
        for (const cat of list) counts[cat.name] = 0
        for (const p of (products ?? []) as { category: string | null }[]) {
          if (p.category && counts[p.category] !== undefined) {
            counts[p.category]++
          }
        }
        setProductCounts(counts)
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error cargando categorías')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    const trimmed = newName.trim()
    if (!trimmed) return
    setCreating(true)
    setError(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createClient() as any
    const { error: err } = await supabase.from('categories').insert({ name: trimmed })
    setCreating(false)
    if (err) { setError('Error: ' + (err.message.includes('unique') ? 'Ya existe esa categoría.' : err.message)); return }
    setNewName('')
    await loadCategories()
    onChanged()
  }

  function startEdit(cat: Category) {
    setEditingId(cat.id)
    setEditingName(cat.name)
  }

  async function saveEdit(cat: Category) {
    const trimmed = editingName.trim()
    if (!trimmed || trimmed === cat.name) { setEditingId(null); return }

    setSaving(true)
    setError(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createClient() as any

    const { error: err } = await supabase
      .from('categories')
      .update({ name: trimmed })
      .eq('id', cat.id)

    if (err) {
      setError('Error renombrando: ' + (err.message.includes('unique') ? 'Ya existe esa categoría.' : err.message))
      setSaving(false)
      setEditingId(null)
      return
    }

    // Update products that used the old name
    await supabase
      .from('products')
      .update({ category: trimmed })
      .eq('category', cat.name)

    setSaving(false)
    setEditingId(null)
    await loadCategories()
    onChanged()
  }

  async function handleDelete(cat: Category) {
    const count = productCounts[cat.name] ?? 0
    if (count > 0) {
      alert(`No se puede eliminar "${cat.name}": ${count} producto(s) la usan. Reasígnalos primero.`)
      return
    }
    if (!confirm(`¿Eliminar la categoría "${cat.name}"?`)) return

    const supabase = createClient()
    const { error: err } = await supabase.from('categories').delete().eq('id', cat.id)
    if (err) { setError('Error eliminando: ' + err.message); return }
    await loadCategories()
    onChanged()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-sm rounded-2xl flex flex-col overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="text-base font-bold" style={{ color: 'var(--text)' }}>Categorías</p>
          <button onClick={onClose} style={{ color: 'var(--text-muted)', fontSize: '20px', lineHeight: 1 }}>×</button>
        </div>

        {/* Nueva categoría */}
        <div className="px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nueva categoría…"
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
              className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
              onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            />
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              className="px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-40"
              style={{ background: 'var(--accent)', color: '#000' }}
            >
              {creating ? '…' : 'Crear'}
            </button>
          </div>
          {error && (
            <p className="text-xs mt-2" style={{ color: '#FF6B6B' }}>{error}</p>
          )}
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 rounded-full border-2 animate-spin"
                style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
            </div>
          ) : categories.length === 0 ? (
            <p className="text-center py-8 text-xs" style={{ color: 'var(--text-muted)' }}>
              Sin categorías. Crea la primera arriba.
            </p>
          ) : (
            <ul>
              {categories.map((cat, idx) => {
                const count = productCounts[cat.name] ?? 0
                const isEditing = editingId === cat.id
                return (
                  <li key={cat.id}
                    className="flex items-center gap-3 px-5 py-3"
                    style={{ borderBottom: idx < categories.length - 1 ? '1px solid var(--border)' : undefined }}>

                    {isEditing ? (
                      <input
                        autoFocus
                        type="text"
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveEdit(cat)
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        onBlur={() => saveEdit(cat)}
                        className="flex-1 rounded-lg px-3 py-1.5 text-sm outline-none"
                        style={{ background: 'var(--bg)', border: '1px solid var(--accent)', color: 'var(--text)' }}
                      />
                    ) : (
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                          {cat.name}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {count} {count === 1 ? 'producto' : 'productos'}
                        </p>
                      </div>
                    )}

                    {!isEditing && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => startEdit(cat)}
                          disabled={saving}
                          className="px-2 py-1 rounded text-xs font-semibold"
                          style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                        >
                          Renombrar
                        </button>
                        <button
                          onClick={() => handleDelete(cat)}
                          disabled={count > 0}
                          className="px-2 py-1 rounded text-xs font-semibold disabled:opacity-30"
                          style={{ background: '#2D1010', color: '#FF6B6B', border: '1px solid #4D1A1A' }}
                          title={count > 0 ? `${count} productos la usan` : 'Eliminar categoría'}
                        >
                          Eliminar
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="px-5 py-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
