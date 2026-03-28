import { useEffect, type RefObject } from 'react'

/**
 * Auto-foca el input al montar la sección y redirige cualquier tecla
 * alfanumérica pulsada fuera de un input hacia el buscador.
 * Ideal para escáneres de código de barras.
 */
export function useSearchFocus(ref: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    ref.current?.focus()

    const handler = (e: KeyboardEvent) => {
      // Ignorar si ya estamos dentro de un campo de texto
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      // Ignorar teclas de sistema / atajos
      if (e.ctrlKey || e.metaKey || e.altKey) return
      // Solo redirigir si es un carácter imprimible (letras, números, símbolos)
      if (e.key.length === 1) {
        ref.current?.focus()
        // No hacemos preventDefault: el carácter cae naturalmente en el input
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
