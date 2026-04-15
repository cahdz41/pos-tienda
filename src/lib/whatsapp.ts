/**
 * Abre WhatsApp de la forma más adecuada según el dispositivo:
 * - Móvil:   wa.me  → abre la app directamente
 * - Desktop: intenta whatsapp:// (app nativa), con fallback a web.whatsapp.com si no está instalada
 *
 * La detección usa el evento "blur": si la ventana pierde el foco después de
 * intentar abrir el deep link, significa que la app se abrió.
 * Si no hay blur en 1.5s, abre WhatsApp Web.
 */
export function openWhatsApp(phone: string, text: string): void {
  const digits = phone.replace(/\D/g, '')
  const encoded = encodeURIComponent(text)
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

  if (isMobile) {
    window.open(`https://wa.me/${digits}?text=${encoded}`, '_blank')
    return
  }

  // Desktop: intenta app nativa primero
  let appOpened = false
  const onBlur = () => { appOpened = true }
  window.addEventListener('blur', onBlur, { once: true })

  // Dispara el deep link sin navegar (no cambia la URL de la página)
  const a = document.createElement('a')
  a.href = `whatsapp://send?phone=${digits}&text=${encoded}`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  // Fallback a WhatsApp Web si la app no abrió
  setTimeout(() => {
    window.removeEventListener('blur', onBlur)
    if (!appOpened) {
      window.open(
        `https://web.whatsapp.com/send?phone=${digits}&text=${encoded}`,
        '_blank'
      )
    }
  }, 1500)
}
