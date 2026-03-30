'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { syncEngine } from '@/lib/sync'

interface OfflineState {
  isOnline: boolean
  queueCount: number
  lastSync: Date | null
  isSyncing: boolean
  syncProgress: { done: number; total: number } | null
  refreshQueue: () => Promise<void>
}

const OfflineContext = createContext<OfflineState>({
  isOnline: true,
  queueCount: 0,
  lastSync: null,
  isSyncing: false,
  syncProgress: null,
  refreshQueue: async () => {},
})

export function useOffline() {
  return useContext(OfflineContext)
}

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true)
  const [queueCount, setQueueCount] = useState(0)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<{ done: number; total: number } | null>(null)

  const refreshQueue = useCallback(async () => {
    const count = await syncEngine.getQueueCount()
    setQueueCount(count)
    const t = await syncEngine.getLastSyncTime()
    setLastSync(t)
  }, [])

  const doFlush = useCallback(async () => {
    setIsSyncing(true)
    try {
      await syncEngine.flushQueue((done, total) => setSyncProgress({ done, total }))
    } finally {
      setIsSyncing(false)
      setSyncProgress(null)
      await refreshQueue()
    }
  }, [refreshQueue])

  useEffect(() => {
    setIsOnline(navigator.onLine)
    refreshQueue()

    if (navigator.onLine) {
      // Warmup: pre-establece conexión TCP y refresca JWT para que el primer
      // cobro no espere ese overhead (normalmente ~300ms pero puede ser más)
      syncEngine.warmConnection().then(() =>
        syncEngine.shouldResync().then(needs => {
          if (needs) syncEngine.syncCatalog().then(refreshQueue).catch(console.error)
        })
      )
    }

    const onOnline = () => { setIsOnline(true); doFlush() }
    const onOffline = () => setIsOnline(false)

    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [refreshQueue, doFlush])

  return (
    <OfflineContext.Provider value={{ isOnline, queueCount, lastSync, isSyncing, syncProgress, refreshQueue }}>
      {children}
    </OfflineContext.Provider>
  )
}
