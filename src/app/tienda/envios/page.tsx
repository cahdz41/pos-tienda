import Link from 'next/link'
import type { Metadata } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://chocholand.com'

export const metadata: Metadata = {
  title: 'Política de Envíos — Chocholand',
  description: 'Conoce los tiempos, costos y directrices de envío de Chocholand Suplementos. Envíos a todo México.',
  alternates: { canonical: `${SITE_URL}/tienda/envios` },
}

const PARRAFOS = [
  'Chocholand Suplementos realizará siempre el esfuerzo en tratar de que nuestros clientes reciban sus pedidos en tiempo y forma. Por tal motivo tenemos las siguientes directrices:',
  'Los tiempos promedio de tránsito son entre 3 y 5 días hábiles en zonas de reparto local, y en zonas extendidas de 5 a 8 días hábiles. Aun así, los tiempos de entrega pueden cambiar por factores externos y fuera de nuestro control.',
  'En caso de que el domicilio tenga un error o falte algún dato, nos comunicaremos con usted; en este caso el plazo antes mencionado no será válido.',
  'Dado que se entregarán a través de operadores logísticos, este plazo concluye al ocurrir el primer intento de entrega en el domicilio indicado al hacer tu pedido.',
  'Los pedidos se procesan de lunes a viernes, por lo cual, si hiciste una compra en fin de semana, se comenzará su proceso hasta el día lunes. En caso de ser día inhábil, se procesará hasta un día después.',
  'El envío tiene un costo variable dependiendo de la dirección de destino y el peso de los productos.',
  'Los envíos se podrán realizar por paquetes separados, desde diferentes almacenes, por lo que podrán llegar en tiempos y fechas diferentes.',
]

export default function EnviosPage() {
  return (
    <main style={{ maxWidth: '760px', margin: '0 auto', padding: '56px 24px 96px' }}>
      <div style={{ marginBottom: '32px' }}>
        <Link href="/tienda" style={{ fontSize: '13px', color: '#666', textDecoration: 'none' }}>
          ← Volver a la tienda
        </Link>
      </div>

      <p style={{
        fontFamily: 'var(--font-barlow-condensed, system-ui)', fontSize: '11px', fontWeight: 700,
        letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(200,20,20,0.7)', margin: '0 0 10px',
      }}>
        Nuestra política
      </p>
      <h1 style={{
        fontFamily: 'var(--font-barlow-condensed, system-ui)', fontWeight: 800,
        fontSize: 'clamp(30px, 5vw, 48px)', color: '#fff', margin: '0 0 40px',
        lineHeight: 1.05, letterSpacing: '-1.5px',
      }}>
        Política de Envíos
      </h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {PARRAFOS.map((p, i) => (
          <p key={i} style={{ fontSize: '15px', lineHeight: 1.75, color: 'rgba(255,255,255,0.7)', margin: 0 }}>
            {p}
          </p>
        ))}
      </div>

      <div style={{
        marginTop: '40px', padding: '20px 24px', borderRadius: '14px',
        background: 'rgba(200,20,20,0.06)', border: '1px solid rgba(200,20,20,0.2)',
      }}>
        <p style={{ margin: 0, fontSize: '14px', color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
          ¿Dudas sobre tu pedido? Escríbenos por WhatsApp al{' '}
          <a href="https://wa.me/524427086715" target="_blank" rel="noopener noreferrer"
            style={{ color: '#ff5050', textDecoration: 'none', fontWeight: 700 }}>
            +52 442 708 6715
          </a>{' '}
          y con gusto te ayudamos.
        </p>
      </div>
    </main>
  )
}
