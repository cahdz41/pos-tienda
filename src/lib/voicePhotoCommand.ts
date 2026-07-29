export interface VoicePhotoCommand {
  query: string | null
  label: string
}

function normalizeIntent(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[¿?¡!,;:"“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const PHOTO_ACTION_SOURCE = '(?:agreg(?:a(?:le|me)?|ar(?:le|me)?)|anad(?:e(?:le|me)?|ir(?:le|me)?)|asign(?:a|ame|ar)|pon(?:le|me|er|erle)?|sub(?:e|eme|ir)|cambi(?:a|ame|ar))'
const PHOTO_SOURCE = '(?:foto|fotografia|imagen)'
const PHOTO_COMMAND = new RegExp(
  `^${PHOTO_ACTION_SOURCE} (?:(?:una|la) )?${PHOTO_SOURCE}(?: (?:a|al|para|de|del))?(?: (?:el|la))?(?: producto)?(?: (.+))?$`
)

function cleanProductQuery(value: string): string | null {
  const query = value
    .trim()
    .replace(/^por favor /, '')
    .replace(/ por favor$/, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!query || query.length < 2 || query.length > 140 || !/[a-z0-9]/.test(query)) return null
  if (/^(?:un |una )?(?:producto|articulo)$/.test(query)) return null
  return query
}

export function isVoicePhotoCommandCandidate(command: string): boolean {
  const normalized = normalizeIntent(command)
  return new RegExp(`^${PHOTO_ACTION_SOURCE}\\b`).test(normalized)
    && new RegExp(`\\b${PHOTO_SOURCE}\\b`).test(normalized)
}

export function parseVoicePhotoCommand(command: string): VoicePhotoCommand | null {
  const normalized = normalizeIntent(command)
  if (!isVoicePhotoCommandCandidate(normalized)) return null

  const match = normalized.match(PHOTO_COMMAND)
  if (!match) return null

  const query = cleanProductQuery(match[1] ?? '')
  return {
    query,
    label: query ? `Asignar foto: ${query}` : 'Asignación de fotos IA',
  }
}

export function buildVoicePhotoPath(command: VoicePhotoCommand): string {
  const params = new URLSearchParams({ seccion: 'fotos-ia' })
  if (command.query) params.set('producto', command.query)
  return `/configuracion?${params.toString()}`
}
