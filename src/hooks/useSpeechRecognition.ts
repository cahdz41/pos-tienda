'use client'

import { useState, useRef, useCallback } from 'react'

// Web Speech API — no está en todas las versiones del DOM lib de TS
interface SR {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onstart:  (() => void) | null
  onresult: ((e: { results: { [n: number]: { [n: number]: { transcript: string } } } }) => void) | null
  onerror:  (() => void) | null
  onend:    (() => void) | null
  start(): void
  stop():  void
}

export type SpeechStatus = 'idle' | 'listening' | 'error'

interface UseSpeechRecognitionReturn {
  status: SpeechStatus
  supported: boolean
  start: (onResult: (text: string) => void) => void
  stop: () => void
}

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [status, setStatus] = useState<SpeechStatus>('idle')
  const recognitionRef = useRef<SR | null>(null)

  const supported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const start = useCallback((onResult: (text: string) => void) => {
    if (!supported) { setStatus('error'); return }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SpeechRecognitionCtor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    const recognition: SR = new SpeechRecognitionCtor()
    recognition.lang = 'es-MX'
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition

    recognition.onstart  = () => setStatus('listening')
    recognition.onresult = (e) => { onResult(e.results[0][0].transcript); setStatus('idle') }
    recognition.onerror  = () => setStatus('error')
    recognition.onend    = () => setStatus((s) => s === 'listening' ? 'idle' : s)

    recognition.start()
  }, [supported])

  const stop = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setStatus('idle')
  }, [])

  return { status, supported, start, stop }
}
