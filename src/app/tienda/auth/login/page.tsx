'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useStoreAuth } from '@/contexts/StoreAuthContext'

export default function LoginPage() {
  const { user, loading, signIn } = useStoreAuth()
  const router = useRouter()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Redirigir si ya está autenticado
  useEffect(() => {
    if (!loading && user) router.replace('/tienda/cuenta/pedidos')
  }, [user, loading, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      setError('Completa todos los campos')
      return
    }
    setSubmitting(true)
    setError(null)
    const { error: signInError } = await signIn(email.trim(), password)
    if (signInError) {
      setError('Email o contraseña incorrectos')
      setSubmitting(false)
    } else {
      router.push('/tienda/cuenta/pedidos')
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px 16px',
    background: '#0A0A0A',
    border: '1px solid #2A2A2A',
    borderRadius: '12px',
    color: '#FFFFFF',
    fontSize: '15px',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s',
  }

  if (loading) return null

  return (
    <main style={{
      minHeight: 'calc(100vh - 64px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '400px',
        background: '#111111',
        border: '1px solid #1A1A1A',
        borderRadius: '24px',
        padding: '40px 36px',
      }}>
        {/* Logo / título */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <span style={{
            fontFamily: 'var(--font-syne, system-ui)',
            fontWeight: 800, fontSize: '20px',
            color: '#F0B429', letterSpacing: '0.05em',
          }}>
            CHOCHOLAND
          </span>
          <h1 style={{
            fontFamily: 'var(--font-syne, system-ui)',
            fontWeight: 700, fontSize: '22px',
            color: '#FFFFFF', margin: '12px 0 6px', letterSpacing: '-0.5px',
          }}>
            Inicia sesión
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#555555' }}>
            Accede a tu cuenta para ver tus pedidos
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{
              display: 'block', fontSize: '11px', color: '#555555',
              marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.1em',
            }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
              autoComplete="email"
              autoFocus
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = '#F0B429')}
              onBlur={e => (e.currentTarget.style.borderColor = '#2A2A2A')}
            />
          </div>

          <div>
            <label style={{
              display: 'block', fontSize: '11px', color: '#555555',
              marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.1em',
            }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              style={inputStyle}
              onFocus={e => (e.currentTarget.style.borderColor = '#F0B429')}
              onBlur={e => (e.currentTarget.style.borderColor = '#2A2A2A')}
            />
          </div>

          {error && (
            <p style={{
              margin: 0, fontSize: '13px', color: '#FF6666',
              padding: '12px 14px',
              background: 'rgba(255,102,102,0.07)',
              border: '1px solid rgba(255,102,102,0.15)',
              borderRadius: '10px',
            }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: '8px', padding: '15px',
              background: submitting ? '#1A1A1A' : '#F0B429',
              border: 'none', borderRadius: '12px',
              color: submitting ? '#444444' : '#000000',
              fontSize: '15px', fontWeight: 700,
              fontFamily: 'var(--font-syne, system-ui)',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.6 : 1,
              transition: 'opacity 0.2s',
            }}
          >
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p style={{ margin: '24px 0 0', textAlign: 'center', fontSize: '13px', color: '#444444' }}>
          ¿No tienes cuenta?{' '}
          <Link href="/tienda/auth/registro" style={{ color: '#F0B429', textDecoration: 'none', fontWeight: 600 }}>
            Regístrate
          </Link>
        </p>

        <p style={{ margin: '12px 0 0', textAlign: 'center' }}>
          <Link href="/tienda" style={{ fontSize: '12px', color: '#333333', textDecoration: 'none' }}>
            ← Volver al catálogo
          </Link>
        </p>
      </div>
    </main>
  )
}
