export interface VoiceInventoryCommand {
  query: string
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

const INVENTORY_ACTION = '(?:agreg(?:a|ame|ar|arme|ue|ueme)|anad(?:e|eme|ir|irme)|met(?:e|eme|er|erme)|ingres(?:a|ame|ar|arme))'
const ADJUST_ACTION = '(?:ajust(?:a|ame|ar|e)|actualiz(?:a|ame|ar)|cambi(?:a|ame|ar))'

const ADD_TO_INVENTORY = new RegExp(
  `^${INVENTORY_ACTION} (?:(?:a|al|en) )?(?:el )?inventario(?: de)? (.+)$`
)
const ADD_PRODUCT_TO_INVENTORY = new RegExp(
  `^${INVENTORY_ACTION} (.+?) (?:a|al|en) (?:el )?inventario$`
)
const ADJUST_STOCK = new RegExp(
  `^${ADJUST_ACTION} (?:de )?(?:(?:el|la) )?(?:stock|inventario|existencias?)(?: de)? (.+)$`
)
const ADJUST_PRODUCT_STOCK = new RegExp(
  `^${ADJUST_ACTION} (.+?) (?:en|del?|para) (?:el )?(?:stock|inventario|existencias?)$`
)
const STOCK_ENTRY = /^(?:entrada|ingreso) (?:de )?(?:stock|inventario)(?: de)? (.+)$/

function cleanProductQuery(value: string): string {
  return value
    .trim()
    .replace(/^por favor /, '')
    .replace(/ por favor$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isVoiceInventoryCommandCandidate(command: string): boolean {
  const normalized = normalizeIntent(command)
  const hasInventoryContext = /\b(?:inventario|stock|existencias?)\b/.test(normalized)
  const hasInventoryAction = /^(?:agreg(?:a|ame|ar|arme|ue|ueme)|anad(?:e|eme|ir|irme)|met(?:e|eme|er|erme)|ingres(?:a|ame|ar|arme)|ajust(?:a|ame|ar|e)|actualiz(?:a|ame|ar)|cambi(?:a|ame|ar)|entrada|ingreso)(?:\s|$)/.test(normalized)
  return hasInventoryContext && hasInventoryAction
}

export function parseVoiceInventoryCommand(command: string): VoiceInventoryCommand | null {
  const normalized = normalizeIntent(command)
  const match = normalized.match(ADD_TO_INVENTORY)
    ?? normalized.match(ADD_PRODUCT_TO_INVENTORY)
    ?? normalized.match(ADJUST_STOCK)
    ?? normalized.match(ADJUST_PRODUCT_STOCK)
    ?? normalized.match(STOCK_ENTRY)

  const query = cleanProductQuery(match?.[1] ?? '')
  if (!query || query.length < 2 || query.length > 140 || !/[a-z0-9]/.test(query)) return null
  if (/^(?:un |una )?(?:producto|articulo|inventario|stock|existencias?)$/.test(query)) return null

  return {
    query,
    label: `Buscar para ajustar stock: ${query}`,
  }
}

export function buildVoiceInventoryPath(command: VoiceInventoryCommand): string {
  const query = command.query.trim()
  if (!query || query.length > 140 || !/[a-z0-9]/i.test(query)) {
    throw new Error('Búsqueda de inventario por voz inválida')
  }

  return `/inventario?${new URLSearchParams({ ajustar: query }).toString()}`
}
