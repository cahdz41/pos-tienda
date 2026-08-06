import type { StoreProductContent } from '@/lib/storeProductContent'
import { cldUrl } from '@/lib/cloudinary'

function Section({ title, children, open = false }: {
  title: string
  children: React.ReactNode
  open?: boolean
}) {
  return (
    <details open={open} style={{
      background: '#0D0D0D',
      border: '1px solid #202020',
      borderRadius: 14,
      overflow: 'hidden',
    }}>
      <summary style={{
        cursor: 'pointer',
        listStyle: 'none',
        padding: '18px 20px',
        color: '#F4F4F4',
        fontSize: 15,
        fontWeight: 700,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        {title}
        <span aria-hidden="true" style={{ color: '#F0B429', fontSize: 18 }}>+</span>
      </summary>
      <div style={{ borderTop: '1px solid #202020', padding: '20px', color: '#A5A5A5' }}>
        {children}
      </div>
    </details>
  )
}

export default function ProductEnrichedContent({
  content,
  showDescription = true,
}: {
  content: StoreProductContent
  showDescription?: boolean
}) {
  const labelIsPdf = content.nutrition_label_url?.toLowerCase().includes('.pdf')

  return (
    <section style={{ marginTop: 64 }}>
      {showDescription && content.short_description && (
        <div style={{ maxWidth: 820, marginBottom: 40 }}>
          <p style={{
            margin: '0 0 10px', color: '#F0B429', fontSize: 11, fontWeight: 800,
            letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>
            Acerca del producto
          </p>
          <p style={{ margin: 0, color: '#B8B8B8', fontSize: 16, lineHeight: 1.75 }}>
            {content.short_description}
          </p>
        </div>
      )}

      {content.key_features.length > 0 && (
        <div style={{ marginBottom: 40 }}>
          <h2 style={{
            margin: '0 0 18px', color: '#FFFFFF', fontSize: 24,
            fontFamily: 'var(--font-barlow-condensed, system-ui)', fontWeight: 800,
          }}>
            Características clave
          </h2>
          <div className="enriched-feature-grid">
            {content.key_features.map((feature, index) => (
              <div key={`${feature}-${index}`} style={{
                minHeight: 94,
                padding: '18px 18px 16px',
                background: 'linear-gradient(145deg, #111111, #0A0A0A)',
                border: '1px solid #24200F',
                borderRadius: 14,
              }}>
                <span style={{ display: 'block', color: '#F0B429', fontSize: 12, fontWeight: 800, marginBottom: 8 }}>
                  0{index + 1}
                </span>
                <p style={{ margin: 0, color: '#D0D0D0', fontSize: 14, lineHeight: 1.5 }}>{feature}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        <Section title="Información nutrimental" open>
          <p style={{ margin: '0 0 18px', fontSize: 12, color: '#777777' }}>
            Información de referencia: {content.reference_flavor || 'Vainilla'}. Los valores pueden variar según el sabor.
          </p>
          <div className="nutrition-layout">
            <div style={{ minWidth: 0 }}>
              <div style={{
                display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 14,
                paddingBottom: 14, borderBottom: '2px solid #E8E8E8',
              }}>
                <span><strong style={{ color: '#FFFFFF' }}>Porción:</strong> {content.serving_size}</span>
                <span><strong style={{ color: '#FFFFFF' }}>Porciones:</strong> {content.servings_per_container}</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 440 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #333333' }}>
                      <th style={{ textAlign: 'left', padding: '10px 8px', color: '#FFFFFF', fontSize: 12 }}>Nutrimento</th>
                      <th style={{ textAlign: 'right', padding: '10px 8px', color: '#FFFFFF', fontSize: 12 }}>Cantidad</th>
                      <th style={{ textAlign: 'right', padding: '10px 8px', color: '#FFFFFF', fontSize: 12 }}>% VD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {content.nutrition_facts.map((row, index) => (
                      <tr key={`${row.name}-${index}`} style={{ borderBottom: '1px solid #202020' }}>
                        <td style={{ padding: '10px 8px', paddingLeft: 8 + row.indent * 16, color: '#C8C8C8', fontSize: 13 }}>
                          {row.name}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: '#E6E6E6', fontSize: 13, whiteSpace: 'nowrap' }}>
                          {row.amount}{row.unit ? ` ${row.unit}` : ''}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', color: '#888888', fontSize: 13 }}>
                          {row.daily_value ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {content.nutrition_label_url && (
              <div style={{ minWidth: 0 }}>
                {labelIsPdf ? (
                  <div>
                    <object
                      data={content.nutrition_label_url}
                      type="application/pdf"
                      aria-label="Etiqueta nutrimental original"
                      style={{ width: '100%', height: 430, border: '1px solid #2A2A2A', borderRadius: 12, background: '#FFFFFF' }}
                    >
                      <a href={content.nutrition_label_url} target="_blank" rel="noopener noreferrer" style={{ color: '#F0B429' }}>
                        Abrir etiqueta nutrimental original
                      </a>
                    </object>
                    <a href={content.nutrition_label_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginTop: 9, color: '#F0B429', fontSize: 11 }}>
                      Abrir etiqueta en una pestaña nueva
                    </a>
                  </div>
                ) : (
                  <img
                    src={cldUrl(content.nutrition_label_url, { width: 700 })}
                    alt="Etiqueta nutrimental del producto"
                    loading="lazy"
                    style={{ width: '100%', maxHeight: 520, objectFit: 'contain', borderRadius: 12, background: '#FFFFFF' }}
                  />
                )}
              </div>
            )}
          </div>
        </Section>

        <Section title="Ingredientes">
          <p style={{ margin: 0, lineHeight: 1.75, whiteSpace: 'pre-wrap', fontSize: 14 }}>{content.ingredients}</p>
        </Section>

        <Section title="Modo de uso">
          <p style={{ margin: 0, lineHeight: 1.75, whiteSpace: 'pre-wrap', fontSize: 14 }}>{content.directions}</p>
        </Section>

        <Section title="Presentación y porciones">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ flex: '1 1 190px', padding: 16, borderRadius: 10, background: '#111111' }}>
              <span style={{ display: 'block', color: '#666666', fontSize: 11, textTransform: 'uppercase', marginBottom: 6 }}>Presentación</span>
              <strong style={{ color: '#FFFFFF', fontSize: 15 }}>{content.presentation}</strong>
            </div>
            <div style={{ flex: '1 1 190px', padding: 16, borderRadius: 10, background: '#111111' }}>
              <span style={{ display: 'block', color: '#666666', fontSize: 11, textTransform: 'uppercase', marginBottom: 6 }}>Porciones por envase</span>
              <strong style={{ color: '#FFFFFF', fontSize: 15 }}>{content.servings_per_container}</strong>
            </div>
          </div>
        </Section>
      </div>

      <style>{`
        .enriched-feature-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 12px;
        }
        .nutrition-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.5fr) minmax(220px, 0.75fr);
          gap: 24px;
          align-items: start;
        }
        @media (max-width: 720px) {
          .nutrition-layout { grid-template-columns: 1fr; }
          .enriched-feature-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 460px) {
          .enriched-feature-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </section>
  )
}
