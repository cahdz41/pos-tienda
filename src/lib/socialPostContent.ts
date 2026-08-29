// Tipos de dominio y parseo/validación para los borradores de posts de
// redes sociales (tabla store_social_posts). Mismo espíritu que
// storeProductContent.ts: valida contra un set cerrado de keys para
// blindarse contra que un modelo de IA agregue campos no pedidos.

import { jsonrepair } from 'jsonrepair'

// Igual que parseResearchJsonText en storeProductContent.ts: quita fences de
// markdown si el modelo los agrega y repara JSON casi-válido antes de tirarlo.
export function parseAiJsonText(text: string): unknown {
  const withoutFence = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const firstBrace = withoutFence.indexOf('{')
  const lastBrace = withoutFence.lastIndexOf('}')
  if (firstBrace < 0 || lastBrace <= firstBrace) throw new Error('La IA no devolvió JSON válido.')
  const candidate = withoutFence.slice(firstBrace, lastBrace + 1)
  try {
    return JSON.parse(candidate)
  } catch {
    try {
      return JSON.parse(jsonrepair(candidate))
    } catch {
      throw new Error('No se pudo interpretar la respuesta de la IA.')
    }
  }
}

export const SOCIAL_POST_STATUSES = ['draft', 'ready', 'scheduled', 'published'] as const
export type SocialPostStatus = (typeof SOCIAL_POST_STATUSES)[number]
// Solo estos dos se pueden fijar a mano desde el endpoint de status manual —
// 'scheduled'/'published' únicamente los pone el endpoint de /publish,
// porque van ligados a una llamada real ya hecha a Zernio.
export const MANUAL_SOCIAL_POST_STATUSES = ['draft', 'ready'] as const satisfies readonly SocialPostStatus[]
export type IdeaSource = 'owner_provided' | 'ai_generated'
export type AiTextProvider = 'openai' | 'deepseek'

export const STORE_WHATSAPP_DISPLAY = '4422121269'
export const STORE_CATALOG_URL = 'chocholand.cloud/tienda'

export interface SocialPostIdeaOption {
  id: string
  title: string
  angle: string
  hook: string
  cta: string
}

export interface SocialPostImage {
  url: string
  cloudinary_public_id: string
  base_image_url: string
  source_product_id: string
  has_logo_overlay: boolean
  has_price_overlay: boolean
  has_hook_overlay: boolean
  position: number
}

export interface SocialPost {
  id: string
  product_ids: string[]
  idea_source: IdeaSource
  idea_options: SocialPostIdeaOption[]
  idea_title: string
  idea_angle: string
  idea_hook: string
  idea_cta: string
  owner_idea_text: string
  caption: string
  hashtags: string[]
  alt_text: string
  caption_provider: AiTextProvider | null
  caption_model: string | null
  visual_identity_key: string | null
  image_model: string | null
  image_model_fallback_used: boolean
  images: SocialPostImage[]
  platform_targets: string[]
  status: SocialPostStatus
  publishing: Record<string, unknown>
  created_by: string | null
  created_at?: string
  updated_at?: string
}

export interface EditableSocialPost {
  idea_title: string
  idea_angle: string
  idea_hook: string
  idea_cta: string
  owner_idea_text: string
  caption: string
  hashtags: string[]
  alt_text: string
  images: SocialPostImage[]
  caption_provider: AiTextProvider | null
  caption_model: string | null
  visual_identity_key: string | null
  image_model: string | null
  image_model_fallback_used: boolean
}

export interface ParsedCaption {
  caption: string
  hashtags: string[]
  alt_text: string
  hook: string
  support_points: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

function cleanTextArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => cleanText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems)
}

function cleanNullableUrl(value: unknown): string | null {
  const text = cleanText(value, 2000)
  if (!text) return null
  try {
    const parsed = new URL(text)
    return parsed.protocol === 'https:' ? parsed.toString() : null
  } catch {
    return null
  }
}

// Appends the WhatsApp number and catalog link deterministically instead of
// trusting the model to reproduce them correctly every time — a garbled
// phone number or link in a real ad is worse than a slightly repetitive
// footer.
export function appendStoreFooter(caption: string): string {
  const hasWhatsapp = caption.includes(STORE_WHATSAPP_DISPLAY)
  const hasCatalog = caption.toLowerCase().includes(STORE_CATALOG_URL.toLowerCase())
  if (hasWhatsapp && hasCatalog) return caption
  const footer = `\n\n📲 Pedidos por WhatsApp: ${STORE_WHATSAPP_DISPLAY}\n🌐 Catálogo completo: ${STORE_CATALOG_URL}`
  return `${caption}${footer}`
}

const IDEA_OPTION_KEYS = new Set(['id', 'title', 'angle', 'hook', 'cta'])

export function parseIdeaOptionsResponse(value: unknown): SocialPostIdeaOption[] {
  if (!isRecord(value)) throw new Error('La IA no devolvió un objeto JSON.')
  const unknownKeys = Object.keys(value).filter(key => key !== 'options')
  if (unknownKeys.length) throw new Error(`La IA agregó campos no permitidos: ${unknownKeys.join(', ')}`)
  if (!Array.isArray(value.options)) throw new Error('La IA no devolvió las opciones de idea.')

  const options = value.options.slice(0, 5).map((item, index) => {
    if (!isRecord(item)) throw new Error('Una de las opciones de idea no es válida.')
    const unknown = Object.keys(item).filter(key => !IDEA_OPTION_KEYS.has(key))
    if (unknown.length) throw new Error(`Una opción de idea trae campos no permitidos: ${unknown.join(', ')}`)
    const title = cleanText(item.title, 140)
    const angle = cleanText(item.angle, 300)
    const hook = cleanText(item.hook, 140)
    const cta = cleanText(item.cta, 140)
    if (!title || !hook || !cta) throw new Error('Una opción de idea no tiene título, gancho o llamado a la acción completos.')
    return { id: cleanText(item.id, 60) || `idea-${index + 1}`, title, angle, hook, cta }
  })

  if (options.length !== 5) throw new Error('La IA no devolvió exactamente 5 opciones de idea.')
  return options
}

const CAPTION_KEYS = new Set(['caption', 'hashtags', 'alt_text', 'hook', 'support_points'])

export function parseCaptionResponse(value: unknown): ParsedCaption {
  if (!isRecord(value)) throw new Error('La IA no devolvió un objeto JSON.')
  const unknownKeys = Object.keys(value).filter(key => !CAPTION_KEYS.has(key))
  if (unknownKeys.length) throw new Error(`La IA agregó campos no permitidos: ${unknownKeys.join(', ')}`)

  const caption = cleanText(value.caption, 2200)
  if (!caption) throw new Error('La IA no devolvió el texto del post.')
  const hashtags = cleanTextArray(value.hashtags, 15, 60).map(tag => tag.startsWith('#') ? tag : `#${tag}`)
  const altText = cleanText(value.alt_text, 300)
  const hook = cleanText(value.hook, 140)
  const supportPoints = cleanTextArray(value.support_points, 8, 60)

  return { caption: appendStoreFooter(caption), hashtags, alt_text: altText, hook, support_points: supportPoints }
}

const EDITABLE_SOCIAL_POST_KEYS = new Set([
  'idea_title', 'idea_angle', 'idea_hook', 'idea_cta', 'owner_idea_text',
  'caption', 'hashtags', 'alt_text', 'images',
  'caption_provider', 'caption_model', 'visual_identity_key', 'image_model', 'image_model_fallback_used',
])

const IMAGE_KEYS = new Set([
  'url', 'cloudinary_public_id', 'base_image_url', 'source_product_id',
  'has_logo_overlay', 'has_price_overlay', 'has_hook_overlay', 'position',
])

function parseImagesArray(value: unknown): SocialPostImage[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 10).map((item, index) => {
    if (!isRecord(item)) throw new Error('Una imagen no es válida.')
    const unknown = Object.keys(item).filter(key => !IMAGE_KEYS.has(key))
    if (unknown.length) throw new Error(`Una imagen trae campos no permitidos: ${unknown.join(', ')}`)
    const url = cleanNullableUrl(item.url)
    if (!url) throw new Error('Una imagen no tiene URL válida.')
    return {
      url,
      cloudinary_public_id: cleanText(item.cloudinary_public_id, 200),
      base_image_url: cleanNullableUrl(item.base_image_url) ?? '',
      source_product_id: cleanText(item.source_product_id, 100),
      has_logo_overlay: item.has_logo_overlay === true,
      has_price_overlay: item.has_price_overlay === true,
      has_hook_overlay: item.has_hook_overlay === true,
      position: typeof item.position === 'number' && Number.isFinite(item.position) ? Math.trunc(item.position) : index,
    }
  })
}

export function parseEditableSocialPost(value: unknown): EditableSocialPost {
  if (!isRecord(value)) throw new Error('Contenido inválido.')
  const unknownKeys = Object.keys(value).filter(key => !EDITABLE_SOCIAL_POST_KEYS.has(key))
  if (unknownKeys.length) throw new Error(`Campos no permitidos: ${unknownKeys.join(', ')}`)

  return {
    idea_title: cleanText(value.idea_title, 140),
    idea_angle: cleanText(value.idea_angle, 300),
    idea_hook: cleanText(value.idea_hook, 140),
    idea_cta: cleanText(value.idea_cta, 140),
    owner_idea_text: cleanText(value.owner_idea_text, 1000),
    caption: cleanText(value.caption, 2200),
    hashtags: cleanTextArray(value.hashtags, 15, 60),
    alt_text: cleanText(value.alt_text, 300),
    images: parseImagesArray(value.images),
    caption_provider: value.caption_provider === 'openai' || value.caption_provider === 'deepseek' ? value.caption_provider : null,
    caption_model: cleanText(value.caption_model, 100) || null,
    visual_identity_key: cleanText(value.visual_identity_key, 100) || null,
    image_model: cleanText(value.image_model, 100) || null,
    image_model_fallback_used: value.image_model_fallback_used === true,
  }
}
