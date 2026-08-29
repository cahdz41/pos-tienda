'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import JSZip from 'jszip'
import { useAuth } from '@/contexts/AuthContext'

type WizardStep = 'products' | 'idea' | 'caption' | 'images' | 'review'
type CarouselMode = 'single' | 'carousel'
type TextMode = 'ai' | 'local'
type PublishPlatform = 'facebook' | 'instagram'
type PostStatus = 'draft' | 'ready' | 'scheduled' | 'published'

interface ProductOption {
  id: string
  name: string
  brand: string | null
  image_url: string | null
}

interface IdeaOption { id: string; title: string; angle: string; hook: string; cta: string }
type ChosenIdea = IdeaOption | { free_text: string }

interface GeneratedImage {
  base_image_url: string
  cloudinary_public_id: string
  source_product_id: string
}

interface FinalImage {
  url: string
  cloudinary_public_id: string
  base_image_url: string
  source_product_id: string
  has_logo_overlay: boolean
  has_price_overlay: boolean
  has_hook_overlay: boolean
  position: number
}

interface DraftPost {
  id: string
  caption: string
  hashtags: string[]
  status: PostStatus
  images: FinalImage[]
  publishing?: { zernio_post_id?: string | null; scheduled_for?: string | null } | null
  created_at: string
}


const LOGO_URL = 'https://res.cloudinary.com/dflnist9g/image/upload/v1776893327/303479618_567324658514485_3402746677447074430_n_dujqec.jpg'

function authHeaders(accessToken: string | null, json = false): HeadersInit {
  return { Authorization: `Bearer ${accessToken ?? ''}`, ...(json ? { 'Content-Type': 'application/json' } : {}) }
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const details = Array.isArray(body.missing) ? `\nFalta: ${body.missing.join(', ')}` : ''
    throw new Error(`${body.error || 'Error en la solicitud'}${details}`)
  }
  return body as T
}

function fmt(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Canvas helpers (mismo patrón que TabGenerador.tsx) ─────────────────────
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r); ctx.closePath()
}

async function loadImg(url: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const t = setTimeout(() => resolve(null), 8000)
    img.onload = () => { clearTimeout(t); resolve(img) }
    img.onerror = () => { clearTimeout(t); resolve(null) }
    img.src = url
  })
}

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ir = img.width / img.height, br = w / h
  let sx: number, sy: number, sw: number, sh: number
  if (ir > br) { sh = img.height; sw = sh * br; sx = (img.width - sw) / 2; sy = 0 }
  else { sw = img.width; sh = sw / br; sx = 0; sy = (img.height - sh) / 2 }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, topY: number, maxW: number, fontSize: number, lineSpacing: number, maxLines = 99, stroke = false): number {
  const lh = fontSize * lineSpacing
  const words = text.split(' ')
  let line = '', y = topY, count = 0
  const draw = (text: string, x: number, y: number) => {
    if (stroke) ctx.strokeText(text, x, y)
    ctx.fillText(text, x, y)
  }
  for (const word of words) {
    const test = line ? line + ' ' + word : word
    if (ctx.measureText(test).width > maxW && line) {
      if (count >= maxLines - 1) {
        let tr = line
        while (ctx.measureText(tr + '…').width > maxW && tr.length > 0) tr = tr.slice(0, -1)
        draw(tr + '…', x, y + fontSize * 0.78); return y + lh
      }
      draw(line, x, y + fontSize * 0.78)
      line = word; y += lh; count++
    } else { line = test }
  }
  if (line) { draw(line, x, y + fontSize * 0.78); y += lh }
  return y
}

// El font-family "system-ui" es la fuente por defecto del sistema operativo
// (Segoe UI, San Francisco, Roboto...) — se ve genérica en un anuncio.
// Cargamos una tipografía de impacto (condensada, tipo cartel deportivo) para
// el gancho, y esperamos a que esté lista antes de dibujar: si el canvas
// pinta antes de que la fuente cargue, queda con la fuente de respaldo para
// siempre (el canvas no se repinta solo cuando la fuente llega después).
const HOOK_FONT_FAMILY = 'Anton'
let hookFontPromise: Promise<string> | null = null

function ensureHookFontLoaded(): Promise<string> {
  if (hookFontPromise) return hookFontPromise
  hookFontPromise = (async () => {
    try {
      if (typeof document === 'undefined' || !('fonts' in document)) return 'system-ui'
      if (!document.getElementById('social-post-hook-font')) {
        const link = document.createElement('link')
        link.id = 'social-post-hook-font'
        link.rel = 'stylesheet'
        link.href = 'https://fonts.googleapis.com/css2?family=Anton&display=swap'
        document.head.appendChild(link)
      }
      await document.fonts.load(`90px "${HOOK_FONT_FAMILY}"`)
      await document.fonts.ready
      return HOOK_FONT_FAMILY
    } catch {
      return 'system-ui'
    }
  })()
  return hookFontPromise
}

async function renderOverlay(opts: {
  baseImageUrl: string
  hook: string
  price: number | null
  supportPoints: string[]
  includeLogo: boolean
  includePrice: boolean
  includeHook: boolean
  includeSupportPoints: boolean
  logo: HTMLImageElement | null
}): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 1080; canvas.height = 1080
  const ctx = canvas.getContext('2d')!

  const base = await loadImg(opts.baseImageUrl)
  if (base) drawCover(ctx, base, 0, 0, 1080, 1080)
  else { ctx.fillStyle = '#111111'; ctx.fillRect(0, 0, 1080, 1080) }

  // Viñeta general: oscurece bordes para que cualquier texto encima sea
  // legible sin depender de dónde haya quedado el sujeto en la foto generada.
  const vignette = ctx.createRadialGradient(540, 540, 260, 540, 540, 780)
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(1, 'rgba(0,0,0,0.5)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, 1080, 1080)

  // Punto donde termina el bloque del gancho — arranca las tarjetas de apoyo
  // justo debajo, en vez de reservar un hueco fijo (un gancho corto de una
  // línea deja mucho más espacio libre que uno de tres líneas).
  let hookBottomY = 90

  if (opts.includeHook && opts.hook.trim()) {
    const hookFont = await ensureHookFontLoaded()

    const topGrad = ctx.createLinearGradient(0, 0, 0, 400)
    topGrad.addColorStop(0, 'rgba(0,0,0,0.85)')
    topGrad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = topGrad
    ctx.fillRect(0, 0, 1080, 400)

    ctx.textAlign = 'left'
    ctx.font = `88px "${hookFont}", system-ui`
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '2px'
    ctx.lineJoin = 'round'

    // Resplandor de color detrás del texto para que se sienta "energético",
    // no solo blanco plano encima de la foto.
    ctx.shadowColor = 'rgba(240,120,20,0.85)'
    ctx.shadowBlur = 30
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 10
    ctx.fillStyle = '#ffffff'
    const endY = wrapText(ctx, opts.hook.toUpperCase(), 50, 56, 980, 88, 0.98, 3, true)
    ctx.shadowBlur = 0
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px'

    // Barra de acento bajo el gancho, como remate tipográfico de anuncio real.
    ctx.fillStyle = '#F0B429'
    ctx.fillRect(52, endY + 8, 140, 10)
    hookBottomY = endY + 40
  }

  if (opts.includeSupportPoints && opts.supportPoints.length > 0) {
    const hookFont = await ensureHookFontLoaded()
    const points = opts.supportPoints.slice(0, 8)
    const half = Math.ceil(points.length / 2)
    const leftPoints = points.slice(0, half)
    const rightPoints = points.slice(half)
    const startY = hookBottomY
    const bottomLimit = 930 // deja libre la franja de precio/logo
    const rows = Math.max(leftPoints.length, rightPoints.length)
    const gap = 14
    const cardH = Math.max(52, Math.min(88, Math.floor((bottomLimit - startY - gap * (rows - 1)) / rows)))
    const fontSize = Math.max(24, Math.min(36, Math.floor(cardH * 0.48)))
    ctx.lineJoin = 'round'
    ctx.font = `${fontSize}px "${hookFont}", system-ui`

    const drawColumn = (list: string[], align: 'left' | 'right') => {
      ctx.textAlign = align
      let y = startY
      for (const point of list) {
        const maxChars = align === 'left' ? 28 : 28
        const label = point.length > maxChars ? `${point.slice(0, maxChars - 1)}…` : point
        const textW = ctx.measureText(label).width
        const boxW = Math.min(textW + 44, 420)
        const boxX = align === 'left' ? 48 : 1080 - 48 - boxW
        roundRect(ctx, boxX, y, boxW, cardH, cardH / 2)
        ctx.fillStyle = 'rgba(0,0,0,0.68)'; ctx.fill()
        ctx.strokeStyle = 'rgba(240,180,41,0.6)'; ctx.lineWidth = 2
        roundRect(ctx, boxX, y, boxW, cardH, cardH / 2); ctx.stroke()
        ctx.fillStyle = '#ffffff'
        const textX = align === 'left' ? boxX + 22 : boxX + boxW - 22
        ctx.fillText(label, textX, y + cardH / 2 + fontSize * 0.34)
        y += cardH + gap
      }
    }
    drawColumn(leftPoints, 'left')
    drawColumn(rightPoints, 'right')
  }

  if (opts.includePrice && opts.price !== null) {
    const label = fmt(opts.price)
    ctx.font = 'bold 44px system-ui'
    const textW = ctx.measureText(label).width
    const boxW = textW + 44, boxH = 66
    const x = 40, y = 1080 - 40 - boxH
    roundRect(ctx, x, y, boxW, boxH, boxH / 2)
    ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fill()
    ctx.strokeStyle = '#F0B429'; ctx.lineWidth = 2
    roundRect(ctx, x, y, boxW, boxH, boxH / 2); ctx.stroke()
    ctx.fillStyle = '#F0B429'; ctx.textAlign = 'left'
    ctx.fillText(label, x + 22, y + boxH / 2 + 15)
  }

  if (opts.includeLogo && opts.logo) {
    const cx = 1080 - 92, cy = 1080 - 92, r = 64
    ctx.save()
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill()
    ctx.clip()
    ctx.drawImage(opts.logo, cx - r + 8, cy - r + 8, (r - 8) * 2, (r - 8) * 2)
    ctx.restore()
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
  }

  return new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/png'))
}

// ── Componente ───────────────────────────────────────────────────────────
export default function TabRedesSociales() {
  const { accessToken } = useAuth()

  const [step, setStep] = useState<WizardStep>('products')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [products, setProducts] = useState<ProductOption[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const [ownerIdeaText, setOwnerIdeaText] = useState('')
  const [ideaOptions, setIdeaOptions] = useState<IdeaOption[] | null>(null)
  const [chosenIdea, setChosenIdea] = useState<ChosenIdea | null>(null)
  const [researchBrief, setResearchBrief] = useState('')

  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState<string[]>([])
  const [altText, setAltText] = useState('')
  const [hookText, setHookText] = useState('')
  const [supportPoints, setSupportPoints] = useState<string[]>([])
  const [captionProvider, setCaptionProvider] = useState<'openai' | 'deepseek' | null>(null)
  const [captionModel, setCaptionModel] = useState<string | null>(null)
  const [draftId, setDraftId] = useState<string | null>(null)

  const [carouselMode, setCarouselMode] = useState<CarouselMode>('single')
  const [includeModel, setIncludeModel] = useState(false)
  const [textMode, setTextMode] = useState<TextMode>('local')
  const [includeHook, setIncludeHook] = useState(true)
  const [includePrice, setIncludePrice] = useState(false)
  const [includeLogo, setIncludeLogo] = useState(true)
  const [overlayPriceText, setOverlayPriceText] = useState('')
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([])
  const [visualIdentityKey, setVisualIdentityKey] = useState<string | null>(null)
  const [imageModel, setImageModel] = useState<string | null>(null)
  const [textBaked, setTextBaked] = useState(false)
  const [finalImages, setFinalImages] = useState<FinalImage[]>([])

  const [publishFacebook, setPublishFacebook] = useState(true)
  const [publishInstagram, setPublishInstagram] = useState(true)
  const [publishMode, setPublishMode] = useState<'now' | 'schedule'>('now')
  const [scheduleText, setScheduleText] = useState('')

  const [drafts, setDrafts] = useState<DraftPost[]>([])
  const [showDrafts, setShowDrafts] = useState(false)
  const [viewingDraft, setViewingDraft] = useState<DraftPost | null>(null)
  const [publishStatus, setPublishStatus] = useState<{ phase: 'working' | 'success' | 'error'; message: string } | null>(null)

  const selectedProducts = useMemo(() => products.filter(product => selectedIds.has(product.id)), [products, selectedIds])
  const overlayPrice = overlayPriceText.trim() ? Number(overlayPriceText) : null

  const loadProducts = useCallback(async (search: string) => {
    if (!accessToken) return
    setLoadingList(true)
    try {
      const response = await fetch(`/api/store-content/products?q=${encodeURIComponent(search)}&limit=60`, {
        headers: authHeaders(accessToken), cache: 'no-store',
      })
      const body = await readResponse<{ products: Array<{ id: string; name: string; brand: string | null; image_url: string | null }> }>(response)
      setProducts(body.products.map(product => ({ id: product.id, name: product.name, brand: product.brand, image_url: product.image_url })))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los productos.')
    } finally {
      setLoadingList(false)
    }
  }, [accessToken])

  useEffect(() => {
    const timer = setTimeout(() => void loadProducts(query), 350)
    return () => clearTimeout(timer)
  }, [loadProducts, query])

  const loadDrafts = useCallback(async () => {
    if (!accessToken) return
    try {
      const response = await fetch('/api/store-content/social-posts?limit=30', { headers: authHeaders(accessToken), cache: 'no-store' })
      const body = await readResponse<{ posts: DraftPost[] }>(response)
      setDrafts(body.posts)
    } catch {
      // La lista de borradores es secundaria; un error aquí no debe bloquear el wizard.
    }
  }, [accessToken])

  useEffect(() => { void loadDrafts() }, [loadDrafts])

  function toggleProduct(id: string) {
    setSelectedIds(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function resetWizard() {
    setStep('products'); setSelectedIds(new Set()); setOwnerIdeaText('')
    setIdeaOptions(null); setChosenIdea(null); setResearchBrief('')
    setCaption(''); setHashtags([]); setAltText(''); setHookText(''); setSupportPoints([]); setCaptionProvider(null); setCaptionModel(null)
    setCarouselMode('single'); setIncludeModel(false); setTextMode('local'); setIncludeHook(true); setIncludePrice(false); setIncludeLogo(true)
    setGeneratedImages([]); setVisualIdentityKey(null); setImageModel(null); setTextBaked(false)
    setOverlayPriceText(''); setFinalImages([]); setDraftId(null)
    setPublishFacebook(true); setPublishInstagram(true); setPublishMode('now'); setScheduleText('')
    setError(null); setNotice(null)
  }

  // Guarda/actualiza el borrador en cuanto hay algo que vale la pena
  // conservar (caption listo, imágenes generadas), en vez de esperar al botón
  // final — así una idea o imagen generada (que cuesta una llamada real a la
  // API) no se pierde si el dueño no termina el wizard completo.
  // Recibe los valores frescos por parámetro (no los lee de useState) porque
  // los setters de React son asíncronos: justo después de un setCaption(x),
  // el closure de esta función todavía vería el valor viejo si lo leyera del
  // estado en el mismo tick.
  async function persistDraft(overrides: {
    caption?: string
    hashtags?: string[]
    alt_text?: string
    caption_provider?: 'openai' | 'deepseek' | null
    caption_model?: string | null
    visual_identity_key?: string | null
    image_model?: string | null
    images?: FinalImage[]
  } = {}, options: { silent?: boolean } = {}) {
    if (!accessToken) return
    const idea = chosenIdea
    const payload = {
      idea_title: idea && 'title' in idea ? idea.title : '',
      idea_angle: idea && 'angle' in idea ? idea.angle : '',
      idea_hook: idea && 'hook' in idea ? idea.hook : '',
      idea_cta: idea && 'cta' in idea ? idea.cta : '',
      owner_idea_text: idea && 'free_text' in idea ? idea.free_text : '',
      caption: overrides.caption ?? caption,
      hashtags: overrides.hashtags ?? hashtags,
      alt_text: overrides.alt_text ?? altText,
      caption_provider: overrides.caption_provider ?? captionProvider,
      caption_model: overrides.caption_model ?? captionModel,
      visual_identity_key: overrides.visual_identity_key ?? visualIdentityKey,
      image_model: overrides.image_model ?? imageModel,
      image_model_fallback_used: false,
      images: overrides.images ?? finalImages,
    }
    try {
      if (draftId) {
        const response = await fetch(`/api/store-content/social-posts/${draftId}`, {
          method: 'PUT', headers: authHeaders(accessToken, true), body: JSON.stringify(payload),
        })
        await readResponse(response)
      } else {
        const response = await fetch('/api/store-content/social-posts', {
          method: 'POST', headers: authHeaders(accessToken, true),
          body: JSON.stringify({
            product_ids: [...selectedIds],
            idea_source: idea && 'free_text' in idea ? 'owner_provided' : 'ai_generated',
            idea_options: ideaOptions ?? [],
            ...payload,
          }),
        })
        const body = await readResponse<{ post: { id: string } }>(response)
        setDraftId(body.post.id)
      }
      void loadDrafts()
    } catch (error) {
      // Guardado automático de fondo: si falla, no interrumpe el wizard. Solo
      // se propaga cuando lo llama explícitamente el botón final de guardar.
      if (options.silent === false) throw error instanceof Error ? error : new Error('No se pudo guardar el borrador.')
    }
  }

  async function goGenerateCaption(idea: ChosenIdea) {
    setBusy('caption'); setError(null); setNotice(null)
    try {
      const response = await fetch('/api/store-content/social-posts/caption', {
        method: 'POST', headers: authHeaders(accessToken, true),
        body: JSON.stringify({ product_ids: [...selectedIds], idea, research_brief: researchBrief }),
      })
      const body = await readResponse<{ caption: string; hashtags: string[]; alt_text: string; hook: string; support_points: string[]; provider: 'openai' | 'deepseek'; model: string }>(response)
      setCaption(body.caption); setHashtags(body.hashtags); setAltText(body.alt_text)
      setHookText(body.hook); setSupportPoints(body.support_points)
      setCaptionProvider(body.provider); setCaptionModel(body.model)
      if (body.provider === 'deepseek') setNotice('Generado con proveedor de respaldo (DeepSeek) porque OpenAI no estaba disponible.')
      setStep('caption')
      void persistDraft({
        caption: body.caption, hashtags: body.hashtags, alt_text: body.alt_text,
        caption_provider: body.provider, caption_model: body.model,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el texto del post.')
    } finally {
      setBusy(null)
    }
  }

  async function submitIdeaStep() {
    setError(null); setNotice(null)
    const trimmed = ownerIdeaText.trim()
    if (trimmed) {
      const idea: ChosenIdea = { free_text: trimmed }
      setChosenIdea(idea); setIdeaOptions(null)
      await goGenerateCaption(idea)
      return
    }
    setBusy('ideas')
    try {
      const response = await fetch('/api/store-content/social-posts/ideas', {
        method: 'POST', headers: authHeaders(accessToken, true),
        body: JSON.stringify({ product_ids: [...selectedIds] }),
      })
      const body = await readResponse<{ options: IdeaOption[]; research_brief?: string }>(response)
      setIdeaOptions(body.options)
      setResearchBrief(body.research_brief ?? '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron generar las ideas.')
    } finally {
      setBusy(null)
    }
  }

  async function chooseIdea(option: IdeaOption) {
    setChosenIdea(option)
    await goGenerateCaption(option)
  }

  async function regenerateCaption() {
    if (!chosenIdea) return
    await goGenerateCaption(chosenIdea)
  }

  async function generateImages() {
    setBusy('images'); setError(null); setNotice(null)
    try {
      const response = await fetch('/api/store-content/social-posts/images', {
        method: 'POST', headers: authHeaders(accessToken, true),
        body: JSON.stringify({
          product_ids: [...selectedIds],
          mode: carouselMode,
          text_mode: textMode,
          hook: textMode === 'ai' && includeHook ? hookText : undefined,
          price: textMode === 'ai' && includePrice && overlayPriceText.trim() ? fmt(Number(overlayPriceText)) : undefined,
          support_points: textMode === 'ai' && includeHook ? supportPoints : undefined,
          include_model: includeModel,
        }),
      })
      const body = await readResponse<{
        images: GeneratedImage[]; visual_identity_key: string; image_model: string
        image_model_fallback_used: boolean; text_baked: boolean
      }>(response)
      setGeneratedImages(body.images)
      setVisualIdentityKey(body.visual_identity_key)
      setImageModel(body.image_model)
      setTextBaked(body.text_baked)
      setFinalImages([])
      if (body.image_model_fallback_used) {
        setNotice('Se usó el modelo de imagen de respaldo (gpt-image-1) porque la cuenta no tiene verificación de organización para gpt-image-2.')
      }
      // Guarda de una vez las imágenes recién generadas (sin overlay todavía)
      // como respaldo: cada una costó una llamada real a OpenAI, no deben
      // perderse si el dueño no llega a aplicar el diseño final.
      void persistDraft({
        visual_identity_key: body.visual_identity_key,
        image_model: body.image_model,
        images: body.images.map((image, index) => ({
          url: image.base_image_url,
          cloudinary_public_id: image.cloudinary_public_id,
          base_image_url: image.base_image_url,
          source_product_id: image.source_product_id,
          has_logo_overlay: false,
          has_price_overlay: false,
          has_hook_overlay: body.text_baked,
          position: index,
        })),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar la imagen.')
    } finally {
      setBusy(null)
    }
  }

  async function applyOverlaysAndUpload() {
    setBusy('overlay'); setError(null); setNotice(null)
    try {
      const logo = includeLogo ? await loadImg(LOGO_URL) : null
      // El logo SIEMPRE se pega localmente (nunca lo genera la IA, para que
      // quede exacto). El gancho/precio solo se dibujan aquí si el modo de
      // texto es "local" — si ya vinieron horneados por la IA, dibujarlos de
      // nuevo los duplicaría encima.
      const drawHook = includeHook && !textBaked
      const drawPrice = includePrice && !textBaked
      const results: FinalImage[] = []
      for (let index = 0; index < generatedImages.length; index++) {
        const image = generatedImages[index]
        const blob = await renderOverlay({
          baseImageUrl: image.base_image_url,
          hook: hookText,
          price: overlayPrice,
          supportPoints,
          includeLogo,
          includePrice: drawPrice,
          includeHook: drawHook,
          includeSupportPoints: drawHook,
          logo,
        })
        const formData = new FormData()
        formData.set('file', blob, `post-${index + 1}.png`)
        const response = await fetch('/api/store-content/social-posts/upload-image', {
          method: 'POST', headers: authHeaders(accessToken), body: formData,
        })
        const body = await readResponse<{ url: string; publicId: string }>(response)
        results.push({
          url: body.url,
          cloudinary_public_id: body.publicId,
          base_image_url: image.base_image_url,
          source_product_id: image.source_product_id,
          has_logo_overlay: includeLogo,
          has_price_overlay: includePrice,
          has_hook_overlay: includeHook,
          position: index,
        })
      }
      setFinalImages(results)
      setStep('review')
      void persistDraft({ images: results })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo aplicar el diseño final a las imágenes.')
    } finally {
      setBusy(null)
    }
  }

  async function saveDraft() {
    setBusy('save'); setError(null); setNotice(null)
    try {
      await persistDraft({ images: finalImages }, { silent: false })
      setNotice('Borrador guardado. Puedes revisarlo abajo en "Borradores guardados".')
      resetWizard()
      setShowDrafts(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el borrador.')
    } finally {
      setBusy(null)
    }
  }

  // Publica de verdad en Facebook/Instagram vía Zernio — acción real e
  // irreversible sobre una cuenta pública. Siempre confirma explícitamente
  // antes de llamar al endpoint, nunca se dispara automáticamente.
  async function publishPost(postId: string, platforms: PublishPlatform[], scheduledFor: string | null): Promise<boolean> {
    if (!accessToken || platforms.length === 0) return false
    const platformLabel = platforms.map(p => p === 'facebook' ? 'Facebook' : 'Instagram').join(' y ')
    const confirmMessage = scheduledFor
      ? `Vas a PROGRAMAR esta publicación en ${platformLabel} para el ${scheduledFor} (hora de la tienda). Esto se conecta con tus cuentas reales vía Zernio. ¿Continuar?`
      : `Vas a PUBLICAR ESTO AHORA MISMO en ${platformLabel}, de forma real e inmediata en tus cuentas conectadas. Esta acción no se puede deshacer desde aquí. ¿Continuar?`
    if (!window.confirm(confirmMessage)) return false

    setBusy('publish'); setError(null); setNotice(null)
    setPublishStatus({ phase: 'working', message: scheduledFor ? `Programando publicación en ${platformLabel}…` : `Publicando en ${platformLabel}…` })
    try {
      const response = await fetch(`/api/store-content/social-posts/${postId}/publish`, {
        method: 'POST', headers: authHeaders(accessToken, true),
        body: JSON.stringify({ platforms, scheduled_for: scheduledFor }),
      })
      const body = await readResponse<{ post: { publishing?: { zernio_post_id?: string | null } } }>(response)
      const zernioId = body.post.publishing?.zernio_post_id
      setPublishStatus({
        phase: 'success',
        message: scheduledFor
          ? `Publicación programada para el ${scheduledFor}.${zernioId ? ` (ID Zernio: ${zernioId})` : ''}`
          : `¡Publicación exitosa en ${platformLabel}!${zernioId ? ` (ID Zernio: ${zernioId})` : ''}`,
      })
      void loadDrafts()
      return true
    } catch (e) {
      setPublishStatus({ phase: 'error', message: e instanceof Error ? e.message : 'No se pudo publicar.' })
      return false
    } finally {
      setBusy(null)
    }
  }

  async function publishDraftFromList(draft: DraftPost) {
    const scheduleInput = window.prompt(
      'Para programar, escribe fecha y hora como AAAA-MM-DD HH:mm (hora de la tienda).\nDeja vacío y presiona Aceptar para publicar AHORA MISMO.',
      '',
    )
    if (scheduleInput === null) return
    await publishPost(draft.id, ['facebook', 'instagram'], scheduleInput.trim() || null)
  }

  async function setDraftStatus(postId: string, status: 'draft' | 'ready') {
    if (!accessToken) return
    try {
      const response = await fetch(`/api/store-content/social-posts/${postId}/status`, {
        method: 'POST', headers: authHeaders(accessToken, true), body: JSON.stringify({ status }),
      })
      await readResponse(response)
      void loadDrafts()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar el estado del borrador.')
    }
  }

  async function deleteDraft(postId: string) {
    if (!accessToken || !window.confirm('¿Eliminar este borrador?')) return
    try {
      const response = await fetch(`/api/store-content/social-posts/${postId}`, {
        method: 'DELETE', headers: authHeaders(accessToken),
      })
      await readResponse(response)
      void loadDrafts()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo eliminar el borrador.')
    }
  }

  // Todavía no hay publicación automática a Facebook/Instagram (fase futura
  // con Zernio) — mientras tanto, esto es lo que le da al dueño una forma
  // práctica de sacar el post del POS y subirlo él mismo.
  async function copyCaptionWithHashtags(captionText: string, tags: string[]) {
    const fullText = tags.length ? `${captionText}\n\n${tags.join(' ')}` : captionText
    try {
      await navigator.clipboard.writeText(fullText)
      setNotice('Texto del post copiado al portapapeles.')
    } catch {
      setError('No se pudo copiar automáticamente. Selecciona y copia el texto manualmente.')
    }
  }

  async function downloadImagesZip(images: Array<{ url: string }>, filenamePrefix: string) {
    if (images.length === 0) return
    setBusy('download'); setError(null)
    try {
      const zip = new JSZip()
      await Promise.all(images.map(async (image, index) => {
        const response = await fetch(image.url)
        const blob = await response.blob()
        zip.file(`${filenamePrefix}-${index + 1}.png`, blob)
      }))
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url; a.download = `${filenamePrefix}.zip`; a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('No se pudieron descargar las imágenes. Puedes guardarlas manualmente con clic derecho → Guardar imagen.')
    } finally {
      setBusy(null)
    }
  }

  const STEP_LABELS: Record<WizardStep, string> = {
    products: '1. Productos', idea: '2. Idea', caption: '3. Texto del post', images: '4. Imágenes', review: '5. Revisión',
  }

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px' }}>Redes Sociales</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Genera un borrador de post para Facebook e Instagram a partir de tus productos. La publicación automática llegará en una fase futura — por ahora revisas, guardas y descargas.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {(Object.keys(STEP_LABELS) as WizardStep[]).map(key => (
          <span key={key} style={{
            padding: '5px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: step === key ? 'var(--accent)' : 'var(--surface)',
            color: step === key ? '#000' : 'var(--text-muted)',
            border: `1px solid ${step === key ? 'var(--accent)' : 'var(--border)'}`,
          }}>{STEP_LABELS[key]}</span>
        ))}
      </div>

      {draftId && (
        <p style={{ margin: '0 0 14px', fontSize: 11, color: 'var(--text-muted)' }}>
          💾 Guardando avances automáticamente en este borrador — nada de lo generado se pierde aunque cierres esta pestaña.
        </p>
      )}

      {error && <div style={{ marginBottom: 14, padding: '12px 14px', whiteSpace: 'pre-line', borderRadius: 10, background: '#2D1010', border: '1px solid #5C2020', color: '#FF8585', fontSize: 12 }}>{error}</div>}
      {notice && <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 10, background: '#102614', border: '1px solid #265C31', color: '#7BD98A', fontSize: 12 }}>{notice}</div>}

      {step === 'products' && (
        <section style={{ display: 'grid', gap: 14 }}>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar producto o marca…"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 13 }} />
          <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 12 }}>
            {loadingList ? <p style={{ padding: 18, color: 'var(--text-muted)', fontSize: 12 }}>Buscando productos…</p>
              : products.length === 0 ? <p style={{ padding: 18, color: 'var(--text-muted)', fontSize: 12 }}>No se encontraron productos.</p>
                : products.map(product => (
                  <label key={product.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer',
                    borderBottom: '1px solid var(--border)', background: selectedIds.has(product.id) ? 'rgba(240,180,41,0.08)' : 'transparent',
                  }}>
                    <input type="checkbox" checked={selectedIds.has(product.id)} onChange={() => toggleProduct(product.id)}
                      style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{product.name}</span>
                  </label>
                ))}
          </div>
          <button onClick={() => { if (selectedIds.size === 0) { setError('Selecciona al menos un producto.'); return } setError(null); setStep('idea') }}
            style={{ padding: '12px', borderRadius: 10, border: 'none', background: selectedIds.size ? 'var(--accent)' : 'var(--surface)',
              color: selectedIds.size ? '#000' : 'var(--text-muted)', fontWeight: 800, fontSize: 13, cursor: selectedIds.size ? 'pointer' : 'not-allowed' }}>
            Continuar con {selectedIds.size} producto{selectedIds.size !== 1 ? 's' : ''}
          </button>
        </section>
      )}

      {step === 'idea' && (
        <section style={{ display: 'grid', gap: 14 }}>
          <div>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Productos seleccionados</p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>{selectedProducts.map(product => product.name).join(', ')}</p>
          </div>
          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', marginBottom: 7, color: 'var(--text-muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>
              ¿Ya tienes una idea para este post? (opcional)
            </span>
            <textarea value={ownerIdeaText} onChange={event => setOwnerIdeaText(event.target.value)} rows={3}
              placeholder="Déjalo vacío para que la IA te proponga 5 ganchos de venta distintos."
              style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 13, resize: 'vertical' }} />
          </label>
          <button onClick={() => void submitIdeaStep()} disabled={busy !== null}
            style={{ padding: '12px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy === 'ideas' ? 'Generando 5 ideas…' : ownerIdeaText.trim() ? 'Usar esta idea' : 'Generar 5 ideas de venta'}
          </button>

          {ideaOptions && (
            <div style={{ display: 'grid', gap: 10 }}>
              {ideaOptions.map(option => (
                <button key={option.id} onClick={() => void chooseIdea(option)} disabled={busy !== null}
                  style={{ textAlign: 'left', padding: 14, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}>
                  <p style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: 'var(--accent)' }}>{option.title}</p>
                  <p style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 }}>Gancho: “{option.hook}”</p>
                  <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>{option.angle}</p>
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.5 }}>CTA: {option.cta}</p>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {step === 'caption' && (
        <section style={{ display: 'grid', gap: 14 }}>
          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', marginBottom: 7, color: 'var(--text-muted)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Texto del post</span>
            <textarea value={caption} onChange={event => setCaption(event.target.value)} rows={8}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', outline: 'none', fontSize: 13, resize: 'vertical', lineHeight: 1.5 }} />
          </label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {hashtags.map(tag => (
              <span key={tag} style={{ padding: '5px 10px', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--accent)' }}>{tag}</span>
            ))}
          </div>
          {captionProvider && <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)' }}>Generado con {captionProvider === 'openai' ? 'OpenAI (gpt-5.6-luna)' : 'DeepSeek (deepseek-v4-flash)'}.</p>}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => void regenerateCaption()} disabled={busy !== null}
              style={{ padding: '10px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {busy === 'caption' ? 'Regenerando…' : 'Regenerar texto'}
            </button>
            <button onClick={() => setStep('images')} disabled={busy !== null || !caption.trim()}
              style={{ padding: '10px 14px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: '#000', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
              Continuar a imágenes
            </button>
          </div>
        </section>
      )}

      {step === 'images' && (
        <section style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 9, border: `1px solid ${carouselMode === 'single' ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer' }}>
              <input type="radio" checked={carouselMode === 'single'} onChange={() => setCarouselMode('single')} />
              <span style={{ fontSize: 12, color: 'var(--text)' }}>Una imagen</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 9, border: `1px solid ${carouselMode === 'carousel' ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer' }}>
              <input type="radio" checked={carouselMode === 'carousel'} onChange={() => setCarouselMode('carousel')} disabled={selectedProducts.length < 2} />
              <span style={{ fontSize: 12, color: 'var(--text)' }}>Carrusel ({selectedProducts.length} producto{selectedProducts.length !== 1 ? 's' : ''})</span>
            </label>
          </div>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 14, borderRadius: 12, border: '1px solid #80651A', background: '#2A220B', cursor: 'pointer' }}>
            <input type="checkbox" checked={includeModel} onChange={event => setIncludeModel(event.target.checked)} style={{ marginTop: 2 }} />
            <span>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#F0B429' }}>🧪 Incluir modelo fitness ficticia sosteniendo el producto (experimental)</span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                Rostro y persona totalmente inventados, estilo UGC/selfie de gimnasio. Al agregar una persona hay más riesgo de que la generación se rechace por política de contenido, o de que el producto en su mano no salga perfecto — revisa bien el resultado antes de usarlo.
              </span>
            </span>
          </label>

          <div style={{ display: 'grid', gap: 10, padding: 14, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>¿Quién pone el texto en la imagen?</span>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 9, border: `1px solid ${textMode === 'ai' ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer' }}>
                <input type="radio" checked={textMode === 'ai'} onChange={() => setTextMode('ai')} />
                <span style={{ fontSize: 12, color: 'var(--text)' }}>La IA lo integra en la imagen</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 9, border: `1px solid ${textMode === 'local' ? 'var(--accent)' : 'var(--border)'}`, cursor: 'pointer' }}>
                <input type="radio" checked={textMode === 'local'} onChange={() => setTextMode('local')} />
                <span style={{ fontSize: 12, color: 'var(--text)' }}>Lo agrego localmente (editable)</span>
              </label>
            </div>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {textMode === 'ai'
                ? 'La IA diseña el gancho/precio como parte de la imagen (más integrado visualmente, pero si quieres cambiar el texto hay que regenerar la imagen). El logo siempre se agrega aparte, de forma exacta.'
                : 'La imagen que genera la IA queda limpia y el gancho/precio/logo se dibujan después, editables al instante y sin volver a llamar a la IA.'}
            </p>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
                <input type="checkbox" checked={includeHook} onChange={event => setIncludeHook(event.target.checked)} disabled={!hookText} />
                Incluir gancho y puntos de venta{!hookText ? ' (genera el texto del post primero)' : ''}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
                <input type="checkbox" checked={includePrice} onChange={event => setIncludePrice(event.target.checked)} />
                Incluir precio
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
                <input type="checkbox" checked={includeLogo} onChange={event => setIncludeLogo(event.target.checked)} />
                Incluir logo
              </label>
            </div>
            {includePrice && (
              <input value={overlayPriceText} onChange={event => setOverlayPriceText(event.target.value.replace(/[^0-9.]/g, ''))} placeholder="Precio a mostrar, ej. 899.00"
                style={{ maxWidth: 220, padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12 }} />
            )}
          </div>

          <button onClick={() => void generateImages()} disabled={busy !== null}
            style={{ padding: '12px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy === 'images' ? 'Generando imagen con IA (puede tardar hasta un minuto)…' : generatedImages.length ? 'Regenerar imagen(es)' : 'Generar imagen(es) con IA'}
          </button>

          {generatedImages.length > 0 && (
            <>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                {generatedImages.map(image => {
                  const product = selectedProducts.find(p => p.id === image.source_product_id)
                  return (
                    <div key={image.source_product_id} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--surface)' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.base_image_url} alt={product?.name ?? ''} style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', display: 'block' }} />
                      <p style={{ margin: 0, padding: 10, fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>{product?.name}</p>
                    </div>
                  )
                })}
              </div>

              <button onClick={() => void applyOverlaysAndUpload()} disabled={busy !== null}
                style={{ padding: '12px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
                {busy === 'overlay' ? 'Aplicando diseño final…' : includeLogo ? 'Agregar logo y continuar a revisión' : 'Continuar a revisión'}
              </button>
            </>
          )}
        </section>
      )}

      {step === 'review' && (
        <section style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {finalImages.map(image => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={image.cloudinary_public_id} src={image.url} alt="" style={{ width: '100%', aspectRatio: '1/1', objectFit: 'cover', borderRadius: 12, border: '1px solid var(--border)' }} />
            ))}
          </div>
          <div style={{ padding: 16, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{caption}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {hashtags.map(tag => <span key={tag} style={{ fontSize: 11, color: 'var(--accent)' }}>{tag}</span>)}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => void copyCaptionWithHashtags(caption, hashtags)} disabled={busy !== null}
              style={{ padding: '10px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              📋 Copiar texto del post
            </button>
            <button onClick={() => void downloadImagesZip(finalImages, 'post-redes-sociales')} disabled={busy !== null}
              style={{ padding: '10px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              {busy === 'download' ? 'Descargando…' : `⬇️ Descargar imagen${finalImages.length !== 1 ? 'es' : ''}`}
            </button>
          </div>
          <button onClick={() => void saveDraft()} disabled={busy !== null}
            style={{ padding: '14px', borderRadius: 10, border: 'none', background: '#4CAF50', color: '#061407', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy === 'save' ? 'Guardando…' : 'Guardar como borrador'}
          </button>

          <div style={{ display: 'grid', gap: 10, padding: 16, borderRadius: 12, border: '1px solid #5C2020', background: '#2D1010' }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: '#FF8585' }}>🔴 Publicar en Facebook/Instagram (real, vía Zernio)</p>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
                <input type="checkbox" checked={publishFacebook} onChange={event => setPublishFacebook(event.target.checked)} /> Facebook
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
                <input type="checkbox" checked={publishInstagram} onChange={event => setPublishInstagram(event.target.checked)} /> Instagram
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
                <input type="radio" checked={publishMode === 'now'} onChange={() => setPublishMode('now')} /> Publicar ahora
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
                <input type="radio" checked={publishMode === 'schedule'} onChange={() => setPublishMode('schedule')} /> Programar
              </label>
            </div>
            {publishMode === 'schedule' && (
              <input value={scheduleText} onChange={event => setScheduleText(event.target.value)} placeholder="AAAA-MM-DD HH:mm, ej. 2026-09-01 18:30"
                style={{ maxWidth: 260, padding: '9px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12 }} />
            )}
            <button
              onClick={() => {
                if (!draftId) { setError('Guarda el borrador primero.'); return }
                const platforms: PublishPlatform[] = [
                  ...(publishFacebook ? (['facebook'] as const) : []),
                  ...(publishInstagram ? (['instagram'] as const) : []),
                ]
                if (platforms.length === 0) { setError('Selecciona al menos una plataforma.'); return }
                void publishPost(draftId, platforms, publishMode === 'schedule' ? scheduleText.trim() : null)
              }}
              disabled={busy !== null || (publishMode === 'schedule' && !scheduleText.trim())}
              style={{ padding: '14px', borderRadius: 10, border: 'none', background: '#B94747', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>
              {busy === 'publish' ? 'Publicando…' : publishMode === 'schedule' ? '📅 Programar publicación' : '🚀 Publicar ahora'}
            </button>
          </div>

          <button onClick={resetWizard} disabled={busy !== null}
            style={{ padding: '10px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Empezar un post nuevo
          </button>
        </section>
      )}

      <div style={{ marginTop: 32, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <button onClick={() => setShowDrafts(current => !current)}
          style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
          {showDrafts ? 'Ocultar' : 'Ver'} borradores guardados ({drafts.length})
        </button>
        {showDrafts && (
          <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
            {drafts.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Todavía no hay borradores guardados.</p>}
            {drafts.map(draft => (
              <div key={draft.id} style={{ display: 'flex', gap: 12, padding: 12, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div onClick={() => setViewingDraft(draft)} style={{ display: 'flex', gap: 12, flex: 1, minWidth: 0, cursor: 'pointer' }} title="Ver en grande">
                  {draft.images[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={draft.images[0].url} alt="" style={{ width: 64, height: 64, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                      {draft.caption}
                    </p>
                    <span style={{ fontSize: 10, fontWeight: 700, color: draft.status === 'published' ? '#7BD98A' : draft.status === 'scheduled' ? '#F0B429' : draft.status === 'ready' ? '#7BD98A' : 'var(--text-muted)' }}>
                      {draft.status === 'published' ? '✅ Publicado' : draft.status === 'scheduled' ? `📅 Programado${draft.publishing?.scheduled_for ? ` (${draft.publishing.scheduled_for})` : ''}` : draft.status === 'ready' ? 'Listo' : 'Borrador'}
                    </span>
                    <span style={{ display: 'block', marginTop: 4, fontSize: 10, color: 'var(--accent)' }}>👁️ Ver en grande</span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => void copyCaptionWithHashtags(draft.caption, draft.hashtags ?? [])} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>📋 Copiar texto</button>
                  <button onClick={() => void downloadImagesZip(draft.images, `post-${draft.id.slice(0, 8)}`)} disabled={busy !== null} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>⬇️ Descargar</button>
                  {(draft.status === 'draft' || draft.status === 'ready') && (
                    <button onClick={() => void publishDraftFromList(draft)} disabled={busy !== null} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #B94747', background: '#5C1717', color: '#fff', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>🚀 Publicar</button>
                  )}
                  {draft.status === 'draft' && (
                    <button onClick={() => void setDraftStatus(draft.id, 'ready')} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #265C31', background: '#102614', color: '#7BD98A', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Marcar listo</button>
                  )}
                  {draft.status === 'ready' && (
                    <button onClick={() => void setDraftStatus(draft.id, 'draft')} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Volver a borrador</button>
                  )}
                  {(draft.status === 'draft' || draft.status === 'ready') && (
                    <button onClick={() => void deleteDraft(draft.id)} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid #5C2020', background: '#2D1010', color: '#FF8585', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Eliminar</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {viewingDraft && (
        <div onClick={() => setViewingDraft(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={event => event.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, maxWidth: 720, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 24, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: viewingDraft.status === 'published' ? '#7BD98A' : viewingDraft.status === 'scheduled' ? '#F0B429' : viewingDraft.status === 'ready' ? '#7BD98A' : 'var(--text-muted)' }}>
                {viewingDraft.status === 'published' ? '✅ Publicado' : viewingDraft.status === 'scheduled' ? `📅 Programado${viewingDraft.publishing?.scheduled_for ? ` (${viewingDraft.publishing.scheduled_for})` : ''}` : viewingDraft.status === 'ready' ? 'Listo' : 'Borrador'}
              </span>
              <button onClick={() => setViewingDraft(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 22, lineHeight: 1, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: viewingDraft.images.length > 1 ? 'repeat(auto-fill, minmax(220px, 1fr))' : '1fr', marginBottom: 18 }}>
              {viewingDraft.images.map(image => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={image.cloudinary_public_id} src={image.url} alt="" style={{ width: '100%', borderRadius: 12, border: '1px solid var(--border)', display: 'block' }} />
              ))}
            </div>
            <p style={{ whiteSpace: 'pre-wrap', fontSize: 14, color: 'var(--text)', lineHeight: 1.6, margin: '0 0 14px' }}>{viewingDraft.caption}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
              {(viewingDraft.hashtags ?? []).map(tag => <span key={tag} style={{ fontSize: 12, color: 'var(--accent)' }}>{tag}</span>)}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => void copyCaptionWithHashtags(viewingDraft.caption, viewingDraft.hashtags ?? [])} style={{ padding: '10px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>📋 Copiar texto</button>
              <button onClick={() => void downloadImagesZip(viewingDraft.images, `post-${viewingDraft.id.slice(0, 8)}`)} style={{ padding: '10px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>⬇️ Descargar</button>
            </div>
          </div>
        </div>
      )}

      {publishStatus && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 32, maxWidth: 380, width: '100%', textAlign: 'center', border: '1px solid var(--border)' }}>
            {publishStatus.phase === 'working' && (
              <>
                <div style={{ width: 40, height: 40, margin: '0 auto 18px', borderRadius: '50%', border: '3px solid var(--accent)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
                <p style={{ fontSize: 14, color: 'var(--text)', fontWeight: 700, margin: 0 }}>{publishStatus.message}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>No cierres esta pestaña…</p>
              </>
            )}
            {publishStatus.phase === 'success' && (
              <>
                <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                <p style={{ fontSize: 14, color: '#7BD98A', fontWeight: 700, margin: 0 }}>{publishStatus.message}</p>
                <button onClick={() => setPublishStatus(null)} style={{ marginTop: 20, padding: '10px 20px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: '#000', fontWeight: 800, cursor: 'pointer' }}>Cerrar</button>
              </>
            )}
            {publishStatus.phase === 'error' && (
              <>
                <div style={{ fontSize: 48, marginBottom: 12 }}>❌</div>
                <p style={{ fontSize: 13, color: '#FF8585', fontWeight: 700, margin: 0, whiteSpace: 'pre-wrap' }}>{publishStatus.message}</p>
                <button onClick={() => setPublishStatus(null)} style={{ marginTop: 20, padding: '10px 20px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontWeight: 700, cursor: 'pointer' }}>Cerrar</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
