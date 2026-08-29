// Convierte una fecha/hora local ("AAAA-MM-DD HH:mm", en la zona horaria de
// la tienda) al ISO 8601 con offset que espera Zernio. Lógica portada
// directamente de app-contenido/src/publicar/programacion.js (ya probada en
// producción ahí) — el cálculo de offset de timezone es fácil de hacer mal.

function partesEnZona(fecha: Date, zonaHoraria: string): Record<string, string> {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha)
  return Object.fromEntries(partes.filter(p => p.type !== 'literal').map(p => [p.type, p.value]))
}

function offsetZonaEnMilisegundos(instanteMs: number, zonaHoraria: string): number {
  const instante = new Date(instanteMs)
  const p = partesEnZona(instante, zonaHoraria)
  const representacionUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour), Number(p.minute), Number(p.second),
  )
  return representacionUtc - Math.floor(instanteMs / 1000) * 1000
}

function offsetIso(minutos: number): string {
  const signo = minutos >= 0 ? '+' : '-'
  const abs = Math.abs(minutos)
  return `${signo}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

export const DEFAULT_ZERNIO_TIMEZONE = 'America/Mexico_City'

export function zernioTimezone(): string {
  return process.env.ZERNIO_TIMEZONE || DEFAULT_ZERNIO_TIMEZONE
}

export interface ParsedSchedule {
  scheduledFor: string
  fechaLocal: string
  zonaHoraria: string
  instante: Date
}

/** Convierte "AAAA-MM-DD HH:mm" de la zona indicada a ISO 8601 con offset. */
export function parsearFechaProgramada(
  texto: string,
  { zonaHoraria = zernioTimezone(), ahora = new Date(), minutosAnticipacion = 5 }: {
    zonaHoraria?: string
    ahora?: Date
    minutosAnticipacion?: number
  } = {},
): ParsedSchedule {
  const entrada = String(texto || '').trim()
  const m = entrada.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/)
  if (!m) throw new Error('Usa el formato AAAA-MM-DD HH:mm, por ejemplo 2026-08-05 18:30.')
  const [, y, mo, d, h, mi] = m
  const [anio, mes, dia, hora, minuto] = [y, mo, d, h, mi].map(Number)

  const calendario = new Date(Date.UTC(anio, mes - 1, dia, hora, minuto))
  if (calendario.getUTCFullYear() !== anio || calendario.getUTCMonth() !== mes - 1 ||
      calendario.getUTCDate() !== dia || calendario.getUTCHours() !== hora ||
      calendario.getUTCMinutes() !== minuto) {
    throw new Error('La fecha u hora no existe. Revísala e intenta de nuevo.')
  }

  const localComoUtc = Date.UTC(anio, mes - 1, dia, hora, minuto, 0)
  let offsetMs = offsetZonaEnMilisegundos(localComoUtc, zonaHoraria)
  let instanteMs = localComoUtc - offsetMs
  offsetMs = offsetZonaEnMilisegundos(instanteMs, zonaHoraria)
  instanteMs = localComoUtc - offsetMs
  const instante = new Date(instanteMs)
  const comprobacion = partesEnZona(instante, zonaHoraria)
  if (`${comprobacion.year}-${comprobacion.month}-${comprobacion.day} ${comprobacion.hour}:${comprobacion.minute}` !== `${y}-${mo}-${d} ${h}:${mi}`) {
    throw new Error(`Esa hora local no es válida en la zona ${zonaHoraria}.`)
  }
  if (instante.getTime() < ahora.getTime() + minutosAnticipacion * 60_000) {
    throw new Error(`La programación debe quedar al menos ${minutosAnticipacion} minutos en el futuro.`)
  }

  const minutosOffset = Math.round(offsetMs / 60000)
  return {
    scheduledFor: `${y}-${mo}-${d}T${h}:${mi}:00${offsetIso(minutosOffset)}`,
    fechaLocal: `${y}-${mo}-${d} ${h}:${mi}`,
    zonaHoraria,
    instante,
  }
}
