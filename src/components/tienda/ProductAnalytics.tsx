'use client'

import { useEffect } from 'react'

type StoreEventType = 'view' | 'flavor_select' | 'add_to_cart'
type EntryPoint = 'catalog' | 'offer' | 'direct'

function sessionKey(): string {
  const key = 'chocholand_store_analytics_session'
  let value = sessionStorage.getItem(key)
  if (!value) {
    value = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    sessionStorage.setItem(key, value)
  }
  return value
}

export function trackStoreProductEvent(
  eventType: StoreEventType,
  productId: string,
  variantId: string | null,
  entryPoint: EntryPoint,
) {
  if (typeof window === 'undefined') return
  const payload = JSON.stringify({
    product_id: productId,
    variant_id: variantId,
    event_type: eventType,
    entry_point: entryPoint,
    session_key: sessionKey(),
  })

  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/store/events', new Blob([payload], { type: 'application/json' }))
    return
  }
  void fetch('/api/store/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  })
}

export default function ProductAnalytics({
  productId,
  entryPoint,
}: {
  productId: string
  entryPoint: EntryPoint
}) {
  useEffect(() => {
    const marker = `chocholand_view_${productId}_${entryPoint}`
    if (sessionStorage.getItem(marker)) return
    sessionStorage.setItem(marker, '1')
    trackStoreProductEvent('view', productId, null, entryPoint)
  }, [entryPoint, productId])

  return null
}
