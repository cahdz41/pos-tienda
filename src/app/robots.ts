import { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://pos-storeonline.duckdns.org'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/tienda', '/tienda/productos'],
      disallow: ['/tienda/carrito', '/tienda/cuenta', '/tienda/auth'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
