import Link from 'next/link'
import { cldUrl } from '@/lib/cloudinary'

const LOGO_URL = 'https://res.cloudinary.com/dflnist9g/image/upload/v1776893327/303479618_567324658514485_3402746677447074430_n_dujqec.jpg'
const LOGO_SM = cldUrl(LOGO_URL, { width: 88, crop: 'fill' })

const WHATSAPP = '524427086715'
const WA_LINK = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent('¡Hola! Me interesa un producto de Chocholand.')}`
const INSTAGRAM = 'https://instagram.com/chocholand_suplementos_qro1'
const FACEBOOK = 'https://www.facebook.com/share/1NnCFaa9Nb/'
const MAPS = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('15 de Mayo 5B, Centro, Querétaro, Qro.')

const heading: React.CSSProperties = {
  fontFamily: 'var(--font-barlow-condensed, system-ui)',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.2em',
  textTransform: 'uppercase',
  color: 'rgba(200,20,20,0.7)',
  margin: '0 0 16px',
}

const rowLink: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '10px',
  color: 'rgba(255,255,255,0.6)',
  textDecoration: 'none',
  fontSize: '14px',
  lineHeight: 1.5,
  marginBottom: '12px',
}

const iconWrap: React.CSSProperties = {
  flexShrink: 0,
  color: 'rgba(200,20,20,0.85)',
  marginTop: '2px',
}

export default function Footer() {
  return (
    <footer style={{
      background: '#050205',
      borderTop: '1px solid rgba(200,20,20,0.35)',
      color: '#fff',
      padding: '56px max(24px, calc(50vw - 680px)) 0',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '40px',
        paddingBottom: '48px',
      }}>

        {/* Marca */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
              border: '2px solid rgba(200,20,20,0.7)',
            }}>
              <img src={LOGO_SM} alt="Chocholand" width={48} height={48} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <span style={{
              fontFamily: 'var(--font-barlow-condensed, system-ui)',
              fontWeight: 800, fontSize: '20px', letterSpacing: '0.06em',
            }}>
              CHOCHOLAND
            </span>
          </div>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, margin: 0, maxWidth: '260px' }}>
            Suplementos y nutrición deportiva en Querétaro. Proteínas, pre-entrenos, creatinas y más.
          </p>
        </div>

        {/* Contacto */}
        <div>
          <h3 style={heading}>Contacto</h3>

          <a href={MAPS} target="_blank" rel="noopener noreferrer" style={rowLink}>
            <span style={iconWrap}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
            </span>
            15 de Mayo 5B, Centro,<br />Querétaro, Qro.
          </a>

          <a href={WA_LINK} target="_blank" rel="noopener noreferrer" style={rowLink}>
            <span style={iconWrap}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.5 14.4c-.3-.2-1.7-.9-2-1-.3-.1-.5-.1-.6.2-.2.3-.7 1-.9 1.1-.2.2-.3.2-.6.1-1.6-.8-2.7-1.5-3.7-3.3-.3-.5.3-.5.8-1.5.1-.2 0-.3 0-.5s-.6-1.5-.9-2c-.2-.5-.4-.4-.6-.5h-.5c-.2 0-.5.1-.7.3-.7.8-1 1.7-1 2.7 0 1.6.9 3 2.5 4.6 2.2 2.1 3.9 2.7 5.3 3 .8.2 1.5.1 2-.1.6-.2 1.7-.9 1.9-1.6.2-.5.2-1 .1-1.1 0-.1-.2-.2-.5-.3zM12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm0 18.2c-1.5 0-2.9-.4-4.2-1.1l-.3-.2-3.1.8.8-3-.2-.3A8.2 8.2 0 1 1 12 20.2z"/>
              </svg>
            </span>
            +52 442 708 6715
          </a>
        </div>

        {/* Síguenos */}
        <div>
          <h3 style={heading}>Síguenos</h3>

          <a href={INSTAGRAM} target="_blank" rel="noopener noreferrer" style={rowLink}>
            <span style={iconWrap}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
              </svg>
            </span>
            @chocholand_suplementos_qro1
          </a>

          <a href={FACEBOOK} target="_blank" rel="noopener noreferrer" style={rowLink}>
            <span style={iconWrap}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
              </svg>
            </span>
            Facebook
          </a>
        </div>

        {/* Horario */}
        <div>
          <h3 style={heading}>Horario</h3>
          <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
            <div style={{ marginBottom: '8px' }}>
              <span style={{ color: 'rgba(255,255,255,0.85)' }}>Lun — Vie</span><br />
              10:00 am – 8:00 pm
            </div>
            <div>
              <span style={{ color: 'rgba(255,255,255,0.85)' }}>Sáb y Dom</span><br />
              11:00 am – 5:00 pm
            </div>
          </div>
        </div>
      </div>

      {/* Franja de envíos */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.08)',
        padding: '20px 0',
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
      }}>
        <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>
          🚚 Envíos a todo México — entrega estimada de 3 a 8 días hábiles.
        </p>
        <Link href="/tienda/envios" style={{
          fontSize: '13px', fontWeight: 700, color: '#ff5050', textDecoration: 'none',
          letterSpacing: '0.04em',
        }}>
          Ver política de envíos →
        </Link>
      </div>

      {/* Barra inferior */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.08)',
        padding: '20px 0 28px',
        textAlign: 'center',
        fontSize: '12px', color: 'rgba(255,255,255,0.35)',
      }}>
        © {new Date().getFullYear()} Chocholand Suplementos · Querétaro, México
      </div>
    </footer>
  )
}
