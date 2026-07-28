export interface VoiceCartCommand {
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

const ADD_VERB_SOURCE = '(?:agreg(?:a|ame|ar|arme|alo|ala|as|ue|ueme|ues)|anad(?:e|eme|ir|irme|elo|ela|as)|pon(?:me)?|poner(?:me)?|met(?:e|eme|er|erme)|ech(?:a|ame|ar|arme)|inclu(?:ye|yeme|ir|irme)|sum(?:a|ame|ar|arme))'
const ADD_VERB = new RegExp(`\\b${ADD_VERB_SOURCE}\\b`)
const SEARCH_THEN_ADD = new RegExp(
  `^(?:busca(?:me)?|encuentra(?:me)?) (.+?) y ${ADD_VERB_SOURCE}(?: (?:a|al|en) (?:(?:el|la) )?(?:carrito|venta|ticket))?(?: por favor)?$`
)
const WANT_IN_CART = /^(?:quiero|quisiera|necesito|dame) (.+?) (?:a|al|en|para) (?:(?:el|la) )?(?:carrito|venta|ticket)(?: por favor)?$/

function cleanProductQuery(value: string): string {
  return value
    .trim()
    .replace(/^por favor /, '')
    .replace(/^(?:que )?(?:a|al|en|para) (?:(?:el|la) )?(?:carrito|venta|ticket) /, '')
    .replace(/ (?:a|al|en|para) (?:(?:el|la) )?(?:carrito|venta|ticket)$/, '')
    .replace(/ por favor$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isVoiceCartCommandCandidate(command: string): boolean {
  const normalized = normalizeIntent(command)
  return ADD_VERB.test(normalized)
    || /^(?:quiero|quisiera|necesito|dame) .+ (?:carrito|venta|ticket)(?: por favor)?$/.test(normalized)
}

export function isVoiceCheckoutCommand(command: string): boolean {
  return /\b(?:cobrar|cobra|cobrame|pagar|paga|procesar (?:el )?pago|finalizar (?:la )?venta|terminar (?:la )?venta)\b/.test(
    normalizeIntent(command)
  )
}

export function parseVoiceCartCommand(command: string): VoiceCartCommand | null {
  const normalized = normalizeIntent(command)
  const searchThenAdd = normalized.match(SEARCH_THEN_ADD)
  const wantInCart = normalized.match(WANT_IN_CART)
  const addVerb = normalized.match(ADD_VERB)

  const query = cleanProductQuery(
    searchThenAdd?.[1]
      ?? wantInCart?.[1]
      ?? (addVerb ? normalized.slice((addVerb.index ?? 0) + addVerb[0].length) : '')
  )

  if (!query || query.length < 2 || query.length > 140) return null
  if (!/[a-z0-9]/.test(query)) return null
  if (/^(?:un |una )?(?:producto|articulo|carrito|venta|ticket)$/.test(query)) return null

  return {
    query,
    label: `Buscar para agregar: ${query}`,
  }
}

export function buildVoiceCartPath(command: VoiceCartCommand): string {
  const query = command.query.trim()
  if (!query || query.length > 140 || !/[a-z0-9]/i.test(query)) {
    throw new Error('Búsqueda de producto por voz inválida')
  }

  return `/pos?${new URLSearchParams({ agregar: query }).toString()}`
}
