// Optimización de imágenes de Cloudinary vía transformaciones en la URL.
// Cloudinary ya es el CDN de la tienda; insertando parámetros después de
// `/upload/` servimos WebP/AVIF, calidad automática y el ancho justo, bajando
// ~10x el peso de cada imagen sin procesar nada en el servidor.

interface CldOptions {
  /** Ancho objetivo en px (se sirve a 2x para pantallas retina vía dpr_auto). */
  width?: number
  /** Recorte: 'fill' recorta al encuadre, 'fit'/'pad' conservan la imagen completa. */
  crop?: 'fill' | 'fit' | 'pad' | 'limit'
}

/**
 * Devuelve la URL de Cloudinary con transformaciones inyectadas.
 * Si la URL no es de Cloudinary (o es null) la regresa tal cual, así que es
 * seguro envolver cualquier `image_url` con esta función.
 */
export function cldUrl(url: string | null | undefined, opts: CldOptions = {}): string {
  if (!url) return ''
  if (!url.includes('/upload/') || !url.includes('res.cloudinary.com')) return url

  const { width, crop = 'limit' } = opts
  const parts = ['f_auto', 'q_auto', 'dpr_auto']
  if (width) {
    parts.push(`w_${width}`)
    parts.push(`c_${crop}`)
  }
  const transform = parts.join(',')

  // Evita duplicar transformaciones si la URL ya trae un bloque tras /upload/.
  return url.replace('/upload/', `/upload/${transform}/`)
}
