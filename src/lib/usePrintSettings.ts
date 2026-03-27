export interface PrintSettings {
  printerName: string
  paperWidth: '58mm' | '80mm'
  autoPrint: boolean
  storeName: string
  storeFooter: string
}

export const PRINT_DEFAULTS: PrintSettings = {
  printerName: '',
  paperWidth: '80mm',
  autoPrint: false,
  storeName: 'CHOCHOLAND',
  storeFooter: '¡Gracias por su compra!',
}

export function usePrintSettings(): PrintSettings {
  if (typeof window === 'undefined') return PRINT_DEFAULTS
  try {
    const saved = localStorage.getItem('pos_print_settings')
    return saved ? { ...PRINT_DEFAULTS, ...JSON.parse(saved) } : PRINT_DEFAULTS
  } catch { return PRINT_DEFAULTS }
}
