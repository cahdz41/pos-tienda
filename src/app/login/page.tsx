'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const fullEmail = email.includes('@') ? email : `${email}@chocholand.com`
    const { error } = await supabase.auth.signInWithPassword({ email: fullEmail, password })

    if (error) {
      setError('Correo o contraseña incorrectos')
      setLoading(false)
      return
    }

    router.push('/pos')
    router.refresh()
  }

  return (
    <div className="login-root">
      {/* Fondo animado */}
      <div className="login-bg">
        <div className="grid-overlay" />
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      {/* Panel central */}
      <div className="login-panel animate-fade-up">
        {/* Logo / Brand */}
        <div className="brand">
          <div className="brand-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="2" y="8" width="24" height="16" rx="2" stroke="currentColor" strokeWidth="2"/>
              <path d="M8 8V6a6 6 0 0 1 12 0v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="14" cy="16" r="2.5" fill="currentColor"/>
              <path d="M14 18.5V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <div className="brand-text">
            <span className="brand-name">POS</span>
            <span className="brand-sub">Sistema de Venta</span>
          </div>
        </div>

        {/* Título */}
        <div className="login-header">
          <h1>Bienvenido</h1>
          <p>Ingresa tus credenciales para acceder al sistema</p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleLogin} className="login-form">
          <div className="field-group">
            <label htmlFor="email">Correo electrónico</label>
            <div className="input-wrapper">
              <svg className="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="4" width="20" height="16" rx="2"/>
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
              </svg>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="usuario@tienda.com"
                required
                autoComplete="email"
                autoFocus
              />
            </div>
          </div>

          <div className="field-group">
            <label htmlFor="password">Contraseña</label>
            <div className="input-wrapper">
              <svg className="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          {error && (
            <div className="error-message animate-fade-in">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
            </div>
          )}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? (
              <span className="btn-loading">
                <span className="spinner" />
                Ingresando...
              </span>
            ) : (
              <>
                Ingresar al Sistema
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="login-footer">
          <span className="status-dot" />
          Sistema activo
        </div>
      </div>

      <style>{`
        .login-root {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-base);
          padding: 24px;
          position: relative;
          overflow: hidden;
        }

        /* ── Fondo ── */
        .login-bg {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .grid-overlay {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(var(--border) 1px, transparent 1px),
            linear-gradient(90deg, var(--border) 1px, transparent 1px);
          background-size: 48px 48px;
          opacity: 0.35;
          mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, black 40%, transparent 100%);
        }

        .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.18;
        }
        .orb-1 {
          width: 500px; height: 500px;
          background: var(--accent);
          top: -200px; left: -150px;
          animation: orb-drift 12s ease-in-out infinite alternate;
        }
        .orb-2 {
          width: 350px; height: 350px;
          background: #3B82F6;
          bottom: -100px; right: -100px;
          animation: orb-drift 16s ease-in-out infinite alternate-reverse;
        }
        .orb-3 {
          width: 200px; height: 200px;
          background: var(--success);
          top: 40%; right: 20%;
          animation: orb-drift 9s ease-in-out infinite alternate;
          opacity: 0.1;
        }

        @keyframes orb-drift {
          from { transform: translate(0, 0) scale(1); }
          to   { transform: translate(30px, 20px) scale(1.08); }
        }

        /* ── Panel ── */
        .login-panel {
          position: relative;
          z-index: 10;
          width: 100%;
          max-width: 420px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 20px;
          padding: 40px;
          box-shadow:
            0 0 0 1px rgba(240,180,41,0.06),
            0 32px 64px rgba(0,0,0,0.5),
            0 0 80px rgba(240,180,41,0.04);
          animation-delay: 0.05s;
        }

        /* ── Brand ── */
        .brand {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 36px;
        }

        .brand-icon {
          width: 52px;
          height: 52px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--accent-glow);
          border: 1px solid rgba(240,180,41,0.3);
          border-radius: 14px;
          color: var(--accent);
          flex-shrink: 0;
        }

        .brand-text {
          display: flex;
          flex-direction: column;
        }

        .brand-name {
          font-family: var(--font-syne, var(--font-display));
          font-size: 22px;
          font-weight: 800;
          color: var(--accent);
          letter-spacing: 0.08em;
          line-height: 1;
        }

        .brand-sub {
          font-size: 11px;
          color: var(--text-muted);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-top: 3px;
        }

        /* ── Header ── */
        .login-header {
          margin-bottom: 32px;
        }

        .login-header h1 {
          font-family: var(--font-syne, var(--font-display));
          font-size: 28px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0 0 6px;
          line-height: 1.15;
        }

        .login-header p {
          font-size: 13px;
          color: var(--text-secondary);
          margin: 0;
        }

        /* ── Form ── */
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .field-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .field-group label {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-secondary);
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .input-wrapper {
          position: relative;
        }

        .input-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
          pointer-events: none;
          transition: color 0.2s;
        }

        .input-wrapper:focus-within .input-icon {
          color: var(--accent);
        }

        .input-wrapper input {
          width: 100%;
          background: var(--bg-input);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 12px 14px 12px 42px;
          font-family: var(--font-jetbrains, var(--font-mono));
          font-size: 13px;
          color: var(--text-primary);
          transition: border-color 0.2s, box-shadow 0.2s;
          outline: none;
        }

        .input-wrapper input::placeholder {
          color: var(--text-muted);
        }

        .input-wrapper input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-glow);
        }

        /* ── Error ── */
        .error-message {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--danger-dim);
          border: 1px solid rgba(239,68,68,0.3);
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 13px;
          color: var(--danger);
        }

        /* ── Button ── */
        .login-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          width: 100%;
          padding: 14px 24px;
          margin-top: 4px;
          background: var(--accent);
          color: #0D0D12;
          font-family: var(--font-syne, var(--font-display));
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.02em;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
          overflow: hidden;
        }

        .login-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 60%);
          opacity: 0;
          transition: opacity 0.2s;
        }

        .login-btn:hover:not(:disabled) {
          background: #F5C233;
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(240,180,41,0.35);
        }

        .login-btn:hover::before {
          opacity: 1;
        }

        .login-btn:active:not(:disabled) {
          transform: translateY(0);
        }

        .login-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .btn-loading {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(13,13,18,0.3);
          border-top-color: #0D0D12;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* ── Footer ── */
        .login-footer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 28px;
          font-size: 11px;
          color: var(--text-muted);
          letter-spacing: 0.04em;
        }

        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--success);
          box-shadow: 0 0 0 2px var(--success-dim);
          animation: pulse 2s ease infinite;
        }

        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 2px var(--success-dim); }
          50%       { box-shadow: 0 0 0 5px transparent; }
        }
      `}</style>
    </div>
  )
}
