'use client'

import { useState, useRef, useCallback } from 'react'

// Web Speech API — no está en todas las versiones del DOM lib de TS
interface SRAlternative { transcript: string; confidence: number }
interface SR {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  onstart:  (() => void) | null
  onresult: ((e: { results: { [n: number]: SRAlternative[] & { length: number } } }) => void) | null
  onerror:  (() => void) | null
  onend:    (() => void) | null
  start(): void
  stop():  void
}

export type SpeechStatus = 'idle' | 'listening' | 'error'

interface UseSpeechRecognitionReturn {
  status: SpeechStatus
  supported: boolean
  start: (onResult: (transcripts: string[]) => void) => void
  stop: () => void
}

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [status, setStatus] = useState<SpeechStatus>('idle')
  const recognitionRef = useRef<SR | null>(null)

  const supported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

  const start = useCallback((onResult: (transcripts: string[]) => void) => {
    if (!supported) { setStatus('error'); return }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SpeechRecognitionCtor = w.SpeechRecognition ?? w.webkitSpeechRecognition
    const recognition: SR = new SpeechRecognitionCtor()
    recognition.lang = 'es-MX'
    recognition.interimResults = false
    recognition.maxAlternatives = 5
    recognitionRef.current = recognition

    recognition.onstart  = () => setStatus('listening')
    recognition.onresult = (e) => {
      const alts = e.results[0]
      const transcripts: string[] = []
      for (let i = 0; i < alts.length; i++) {
        const t = alts[i].transcript?.trim()
        if (t) transcripts.push(t)
      }
      onResult(transcripts.length > 0 ? transcripts : [''])
      setStatus('idle')
    }
    recognition.onerror  = () => { recognitionRef.current = null; setStatus('error') }
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
