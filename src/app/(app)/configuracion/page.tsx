'use client'

import { useState, useEffect } from 'react'

interface PrintSettings {
  printerName: string
  paperWidth: '58mm' | '80mm'
  autoPrint: boolean
  storeName: string
  storeFooter: string
}

const DEFAULTS: PrintSettings = {
  printerName: '',
  paperWidth: '80mm',
  autoPrint: false,
  storeName: 'CHOCHOLAND',
  storeFooter: '¡Gracias por su compra!',
}

export function usePrintSettings(): PrintSettings {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const saved = localStorage.getItem('pos_print_settings')
    return saved ? { ...DEFAULTS, ...JSON.parse(saved) } : DEFAULTS
  } catch { return DEFAULTS }
}

export default function ConfiguracionPage() {
  const [settings, setSettings] = useState<PrintSettings>(DEFAULTS)
  const [saved, setSaved] = useState(false)
  const [printers, setPrinters] = useState<string[]>([])

  useEffect(() => {
    const saved = localStorage.getItem('pos_print_settings')
    if (saved) setSettings({ ...DEFAULTS, ...JSON.parse(saved) })

    // Detectar impresoras disponibles via navigator (solo funciona con permiso del sistema)
    if ('permissions' in navigator) {
      try {
        // El API de impresoras no está disponible en todos los navegadores
        // Mostramos instrucciones en su lugar
      } catch { /* no-op */ }
    }

    // Obtener impresoras desde el sistema si disponible (Chrome + extensión o Electron)
    detectPrinters()
  }, [])

  async function detectPrinters() {
    // En Chrome, podemos intentar obtener impresoras via window.print config
    // En la mayoría de browsers esto no está disponible por seguridad
    // Mostramos la lista manual en su lugar
    const common = ['Microsoft Print to PDF', 'Microsoft XPS Document Writer']
    setPrinters(common)
  }

  const update = (key: keyof PrintSettings, value: string | boolean) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  const handleSave = () => {
    localStorage.setItem('pos_print_settings', JSON.stringify(settings))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleTestPrint = () => {
    const width = settings.paperWidth
    const win = window.open('', '_blank', `width=${width === '58mm' ? 250 : 340},height=500`)
    if (!win) return
    win.document.write(`
      <!DOCTYPE html><html><head><meta charset="utf-8"/>
      <title>Ticket de prueba</title>
      <style>
        @page { size: 80mm 3276mm; margin: 2mm 3mm; }
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'Courier New',monospace; font-size:11px; width:74mm; color:#000; }
        .center { text-align:center; } .bold { font-weight:bold; }
        .divider { border-top:1px dashed #000; margin:5px 0; }
        .row { display:flex; justify-content:space-between; }
      </style></head><body>
      <div class="center bold" style="font-size:16px">${settings.storeName}</div>
      <div class="center" style="font-size:10px;margin-bottom:4px">Ticket de Prueba</div>
      <div class="divider"></div>
      <div class="row"><span>Ticket:</span><span class="bold">#TEST01</span></div>
      <div class="row"><span>Fecha:</span><span>${new Date().toLocaleDateString('es-MX')}</span></div>
      <div class="divider"></div>
      <div class="row"><span>Producto de prueba x1</span><span>$99.00</span></div>
      <div class="divider"></div>
      <div class="row bold"><span>TOTAL:</span><span>$99.00</span></div>
      <div class="divider"></div>
      <div class="center" style="margin-top:8px;font-size:10px">${settings.storeFooter}</div>
      <div class="center" style="margin-top:4px;font-size:9px">Papel: ${width}</div>
      </body></html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  return (
    <div className="config-page">
      <div className="config-header">
        <h1 className="config-title">Configuración</h1>
        <p className="config-subtitle">Ajustes del sistema e impresora de tickets</p>
      </div>

      <div className="config-body">
        {/* Sección impresora */}
        <section className="config-section">
          <div className="section-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            <h2>Impresora de Tickets</h2>
          </div>

          <div className="info-box">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p>Al imprimir un ticket se abre el <strong>diálogo de impresión del sistema</strong>. Ahí podrás seleccionar tu impresora de tickets. Para que siempre use la misma impresora, configúrala como predeterminada en <strong>Windows → Configuración → Impresoras</strong>.</p>
          </div>

          <div className="field-group">
            <label className="field-label">Nombre de la impresora (referencia)</label>
            <input
              type="text"
              value={settings.printerName}
              onChange={e => update('printerName', e.target.value)}
              placeholder="Ej: EPSON TM-T20, Bixolon SRP-350..."
              className="field-input"
            />
            <span className="field-hint">Solo referencia visual — el diálogo del sistema selecciona la impresora real</span>
          </div>

          <div className="field-group">
            <label className="field-label">Ancho del papel</label>
            <div className="radio-group">
              {(['58mm', '80mm'] as const).map(w => (
                <label key={w} className={`radio-option ${settings.paperWidth === w ? 'radio-option--active' : ''}`}>
                  <input
                    type="radio"
                    name="paperWidth"
                    value={w}
                    checked={settings.paperWidth === w}
                    onChange={() => update('paperWidth', w)}
                  />
                  {w}
                </label>
              ))}
            </div>
          </div>

          <div className="field-group">
            <label className="toggle-row">
              <div>
                <span className="field-label">Imprimir automáticamente</span>
                <span className="field-hint">Abrir diálogo de impresión al confirmar el pago</span>
              </div>
              <button
                className={`toggle ${settings.autoPrint ? 'toggle--on' : ''}`}
                onClick={() => update('autoPrint', !settings.autoPrint)}
              >
                <span className="toggle-thumb" />
              </button>
            </label>
          </div>
        </section>

        {/* Sección ticket */}
        <section className="config-section">
          <div className="section-header">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <h2>Datos del Ticket</h2>
          </div>

          <div className="field-group">
            <label className="field-label">Nombre del negocio</label>
            <input
              type="text"
              value={settings.storeName}
              onChange={e => update('storeName', e.target.value)}
              className="field-input"
            />
          </div>

          <div className="field-group">
            <label className="field-label">Mensaje de pie de ticket</label>
            <input
              type="text"
              value={settings.storeFooter}
              onChange={e => update('storeFooter', e.target.value)}
              className="field-input"
              placeholder="¡Gracias por su compra!"
            />
          </div>
        </section>

        {/* Actions */}
        <div className="config-actions">
          <button className="btn-test" onClick={handleTestPrint}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Imprimir ticket de prueba
          </button>
          <button className={`btn-save ${saved ? 'btn-save--saved' : ''}`} onClick={handleSave}>
            {saved ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Guardado
              </>
            ) : (
              'Guardar cambios'
            )}
          </button>
        </div>
      </div>

      <style>{`
        .config-page {
          height: 100%;
          overflow-y: auto;
          padding: 24px;
        }

        .config-header {
          margin-bottom: 28px;
        }

        .config-title {
          font-family: var(--font-syne, sans-serif);
          font-size: 22px;
          font-weight: 800;
          color: var(--text-primary);
          margin: 0 0 4px;
        }

        .config-subtitle {
          font-size: 13px;
          color: var(--text-muted);
          margin: 0;
        }

        .config-body {
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 560px;
        }

        .config-section {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .section-header {
          display: flex;
          align-items: center;
          gap: 10px;
          color: var(--accent);
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border);
        }

        .section-header h2 {
          font-family: var(--font-syne, sans-serif);
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }

        .info-box {
          display: flex;
          gap: 10px;
          background: rgba(59,130,246,0.08);
          border: 1px solid rgba(59,130,246,0.2);
          border-radius: 8px;
          padding: 12px;
          color: #3B82F6;
          font-size: 12px;
          line-height: 1.5;
          flex-shrink: 0;
        }

        .info-box p { color: var(--text-secondary); }
        .info-box strong { color: var(--text-primary); }

        .field-group { display: flex; flex-direction: column; gap: 6px; }

        .field-label {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .field-input {
          background: var(--bg-input);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 10px 12px;
          font-size: 13px;
          color: var(--text-primary);
          outline: none;
          transition: border-color 0.15s;
        }
        .field-input:focus { border-color: var(--accent); }
        .field-input::placeholder { color: var(--text-muted); }

        .field-hint {
          font-size: 11px;
          color: var(--text-muted);
          line-height: 1.4;
        }

        .radio-group { display: flex; gap: 8px; }

        .radio-option {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: var(--bg-input);
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 13px;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s;
        }

        .radio-option input { display: none; }

        .radio-option--active {
          border-color: var(--accent);
          background: var(--accent-glow);
          color: var(--accent);
          font-weight: 600;
        }

        .toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
        }

        .toggle {
          width: 44px;
          height: 24px;
          border-radius: 12px;
          background: var(--bg-hover);
          border: 1px solid var(--border);
          position: relative;
          cursor: pointer;
          transition: all 0.2s;
          flex-shrink: 0;
        }

        .toggle--on {
          background: var(--accent);
          border-color: var(--accent);
        }

        .toggle-thumb {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: var(--text-muted);
          transition: transform 0.2s, background 0.2s;
        }

        .toggle--on .toggle-thumb {
          transform: translateX(20px);
          background: #0D0D12;
        }

        /* Actions */
        .config-actions {
          display: flex;
          gap: 10px;
        }

        .btn-test {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: transparent;
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s;
        }
        .btn-test:hover { border-color: var(--accent); color: var(--accent); }

        .btn-save {
          padding: 10px 24px;
          background: var(--accent);
          border: none;
          border-radius: 8px;
          font-family: var(--font-syne, sans-serif);
          font-size: 13px;
          font-weight: 700;
          color: #0D0D12;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.15s;
        }
        .btn-save:hover { background: #F5C233; }
        .btn-save--saved { background: var(--success, #22C55E); }
      `}</style>
    </div>
  )
}
