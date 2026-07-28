export const SALES_TIME_ZONE = 'America/Mexico_City'

export interface SalesVoiceQuery {
  from: string
  to: string
  label: string
  category?: string
}

const MONTHS: Record<string, number> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
}

function normalizeCommand(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[¿?¡!,.;:"“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function salesCategoryKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

const NATURAL_QUERY_PREFIXES = [
  'me puedes mostrar',
  'me podrias mostrar',
  'puedes mostrarme',
  'podrias mostrarme',
  'puedes mostrar',
  'podrias mostrar',
  'quiero consultar',
  'quisiera consultar',
  'necesito consultar',
  'quiero ver',
  'quisiera ver',
  'necesito ver',
  'muestrame',
  'mostrame',
  'ensename',
  'consultame',
  'consulta',
  'dime',
  'dame',
  'mostrar',
  'buscar',
  'busca',
  'ver',
]

function removeNaturalQueryWrapper(command: string): string {
  let value = command

  if (value.startsWith('por favor ')) value = value.slice('por favor '.length)
  if (value.endsWith(' por favor')) value = value.slice(0, -' por favor'.length)

  const prefix = NATURAL_QUERY_PREFIXES.find(candidate => value.startsWith(`${candidate} `))
  if (prefix) value = value.slice(prefix.length + 1)

  return value.replace(/^(?:las|la) ventas\b/, 'ventas')
}

export function isSalesVoiceQueryCandidate(command: string): boolean {
  const normalized = normalizeCommand(command)
  if (!/\bventas\b/.test(normalized)) return false

  return /\b(?:hoy|ayer)\b/.test(normalized)
    || /\b(?:de|del) (?:dia )?\d{1,2} de (?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/.test(normalized)
    || /\b(?:de|del) (?:dia )?\d{1,2} (?:al|a) (?:dia )?\d{1,2} de (?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/.test(normalized)
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function isValidSalesDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const candidate = new Date(Date.UTC(year, month - 1, day))

  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day
}

function dateInTimeZone(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SALES_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find(item => item.type === type)?.value)

  return dateKey(part('year'), part('month'), part('day'))
}

function addDays(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number)
  const result = new Date(Date.UTC(year, month - 1, day + days))
  return dateKey(result.getUTCFullYear(), result.getUTCMonth() + 1, result.getUTCDate())
}

function formatLabel(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

function spokenDate(
  dayText: string,
  monthText: string,
  yearText: string | undefined,
  defaultYear: number
): string | null {
  const value = dateKey(
    yearText ? Number(yearText) : defaultYear,
    MONTHS[monthText],
    Number(dayText)
  )
  return isValidSalesDate(value) ? value : null
}

export function parseSalesVoiceQuery(command: string, now = new Date()): SalesVoiceQuery | null {
  const normalized = removeNaturalQueryWrapper(normalizeCommand(command))
  const today = dateInTimeZone(now)
  const currentYear = Number(today.slice(0, 4))

  const shortCategoryRange = normalized.match(
    /^ventas (?:de la categoria |de categoria |la categoria |categoria |de )?(.+?) (?:del|de) (?:dia )?(\d{1,2}) (?:al|a) (?:dia )?(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?: de (\d{4}))?$/
  )
  if (shortCategoryRange) {
    const category = shortCategoryRange[1].trim()
    const from = spokenDate(shortCategoryRange[2], shortCategoryRange[4], shortCategoryRange[5], currentYear)
    const to = spokenDate(shortCategoryRange[3], shortCategoryRange[4], shortCategoryRange[5], currentYear)

    if (!category || !from || !to || from > to) return null

    return {
      from,
      to,
      category,
      label: `Ventas de ${category}: ${formatLabel(from)} al ${formatLabel(to)}`,
    }
  }

  const categoryRange = normalized.match(
    /^ventas (?:de la categoria |de categoria |la categoria |categoria |de )?(.+?) (?:del|de) (?:dia )?(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?: de (\d{4}))? (?:al|a) (?:dia )?(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?: de (\d{4}))?$/
  )
  if (categoryRange) {
    const category = categoryRange[1].trim()
    const sharedYear = categoryRange[7] ?? categoryRange[4]
    const from = spokenDate(categoryRange[2], categoryRange[3], categoryRange[4] ?? sharedYear, currentYear)
    const to = spokenDate(categoryRange[5], categoryRange[6], categoryRange[7] ?? sharedYear, currentYear)

    if (!category || !from || !to || from > to) return null

    return {
      from,
      to,
      category,
      label: `Ventas de ${category}: ${formatLabel(from)} al ${formatLabel(to)}`,
    }
  }

  if (/^ventas (?:(?:de|del) )?(?:dia de )?hoy$/.test(normalized)) {
    return { from: today, to: today, label: 'Ventas de hoy' }
  }

  if (/^ventas (?:(?:de|del) )?(?:dia de )?ayer$/.test(normalized)) {
    const yesterday = addDays(today, -1)
    return { from: yesterday, to: yesterday, label: 'Ventas de ayer' }
  }

  const explicit = normalized.match(
    /^ventas (?:del|de) (?:dia )?(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?: de (\d{4}))?$/
  )
  if (!explicit) return null

  const day = Number(explicit[1])
  const month = MONTHS[explicit[2]]
  const year = explicit[3] ? Number(explicit[3]) : currentYear
  const value = dateKey(year, month, day)

  if (!isValidSalesDate(value)) return null

  return {
    from: value,
    to: value,
    label: `Ventas del ${formatLabel(value)}`,
  }
}

export function buildSalesVoicePath(query: SalesVoiceQuery): string {
  if (!isValidSalesDate(query.from) || !isValidSalesDate(query.to) || query.from > query.to) {
    throw new Error('Rango de ventas por voz inválido')
  }

  const params = new URLSearchParams({ from: query.from, to: query.to })
  if (query.category) {
    const category = query.category.trim()
    if (!category || category.length > 80 || !/^[\p{L}\p{N} _&/.-]+$/u.test(category)) {
      throw new Error('Categoría de ventas por voz inválida')
    }
    params.set('category', category)
  }
  return `/ventas?${params.toString()}`
}

function timeZoneOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SALES_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find(item => item.type === type)?.value)

  const representedAsUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second')
  )

  return representedAsUtc - instant.getTime()
}

function startOfDayUtc(value: string): number {
  const [year, month, day] = value.split('-').map(Number)
  const localMidnightAsUtc = Date.UTC(year, month - 1, day)
  let result = localMidnightAsUtc

  // Recalculate once in case the first offset lands across a timezone transition.
  for (let attempt = 0; attempt < 2; attempt++) {
    result = localMidnightAsUtc - timeZoneOffsetMs(new Date(result))
  }

  return result
}

export function getSalesRangeUtc(from: string, to: string): { start: string; end: string } | null {
  if (!isValidSalesDate(from) || !isValidSalesDate(to) || from > to) return null

  const nextDay = addDays(to, 1)
  return {
    start: new Date(startOfDayUtc(from)).toISOString(),
    end: new Date(startOfDayUtc(nextDay) - 1).toISOString(),
  }
}
