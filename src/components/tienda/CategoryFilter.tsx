'use client'

interface Props {
  categories: string[]
  selected: string | null
  onSelect: (cat: string | null) => void
}

export default function CategoryFilter({ categories, selected, onSelect }: Props) {
  if (categories.length === 0) return null

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 18px',
    borderRadius: '100px',
    border: '1px solid',
    borderColor: active ? '#F0B429' : '#2A2A2A',
    background: active ? 'rgba(240,180,41,0.08)' : 'transparent',
    color: active ? '#F0B429' : '#666666',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.15s',
  })

  return (
    <div style={{
      display: 'flex',
      gap: '8px',
      overflowX: 'auto',
      paddingBottom: '4px',
      scrollbarWidth: 'none',
    }}>
      <button style={pillStyle(selected === null)} onClick={() => onSelect(null)}>
        Todos
      </button>
      {categories.map(cat => (
        <button key={cat} style={pillStyle(selected === cat)} onClick={() => onSelect(cat)}>
          {cat}
        </button>
      ))}
    </div>
  )
}
