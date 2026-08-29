import 'server-only'

// Generación de imagen del post con OpenAI images.edit. Restricción de
// negocio imperativa: el producto (bote/etiqueta) que sale en la imagen
// generada SIEMPRE debe partir de una foto real del catálogo como imagen de
// referencia — nunca se genera desde texto puro (images.generate), porque
// eso permitiría que la IA invente o deforme la etiqueta real del producto
// que se vende en la tienda.

export const OPENAI_IMAGE_MODEL_PRIMARY = 'gpt-image-2'
export const OPENAI_IMAGE_MODEL_FALLBACK = 'gpt-image-1'

const OPENAI_IMAGE_EDIT_URL = 'https://api.openai.com/v1/images/edits'

export interface VisualIdentity {
  key: string
  label: string
  background: string
  lighting: string
  materials: string
  palette: string
  effects: string
}

// Identidades visuales temáticas de gimnasio/suplementos, rotadas para que
// publicaciones consecutivas no luzcan repetidas. Concepto adaptado de la
// rotación de "identidades visuales" del proyecto hermano app-contenido
// (src/generar/imagen_oferta.js), reescrito desde cero para este stack.
// El campo "effects" empuja el resultado hacia el nivel de una campaña real
// de marca de suplementos (piensa Ghost, Redcon1, Nutrex) en vez de una
// simple foto de producto de e-commerce.
export const VISUAL_IDENTITIES: VisualIdentity[] = [
  {
    key: 'concrete-gym',
    label: 'Gimnasio de concreto',
    background: 'piso y muro de concreto pulido de un gimnasio industrial, con un rack de pesas desenfocado al fondo',
    lighting: 'luz dramática lateral tipo spotlight, sombras marcadas, alto contraste cinematográfico',
    materials: 'textura de concreto, metal cepillado, hule de piso de gimnasio',
    palette: 'tonos grafito y negro con acentos naranja/rojo intensos',
    effects: 'chispas y partículas de energía naranja/rojas flotando alrededor del producto, ligero humo o niebla baja, destello de luz (lens flare) sutil',
  },
  {
    key: 'neon-night-gym',
    label: 'Gimnasio neón nocturno',
    background: 'gimnasio moderno de noche con luces de neón azul y morado en el fondo desenfocado',
    lighting: 'iluminación de neón, reflejos intensos, ambiente urbano nocturno de alto contraste',
    materials: 'vidrio esmerilado, metal negro mate, piso reflejante',
    palette: 'azul eléctrico, morado vibrante y negro',
    effects: 'rayos de energía eléctrica azul/morada rodeando el producto, resplandor (glow) neón, reflejo intenso del producto en el piso',
  },
  {
    key: 'outdoor-athletic',
    label: 'Entrenamiento al aire libre',
    background: 'área de entrenamiento funcional al aire libre al amanecer, con una pista de atletismo desenfocada',
    lighting: 'luz natural cálida de amanecer, sombras largas y dramáticas, contraluz intenso',
    materials: 'pista de tartán, cielo despejado con nubes dramáticas, vegetación desenfocada',
    palette: 'naranja cálido intenso, azul cielo profundo y verde',
    effects: 'partículas de polvo/sudor iluminadas por el contraluz, ligero destello solar, sensación de movimiento y velocidad',
  },
  {
    key: 'minimal-studio',
    label: 'Estudio minimalista premium',
    background: 'fondo de estudio fotográfico de alta gama con una superficie reflejante tipo pasarela de producto premium',
    lighting: 'iluminación de estudio dramática con rim light (contorno de luz) marcado, alto contraste, reflejo nítido del producto',
    materials: 'superficie tipo mármol oscuro o acrílico brillante, fondo degradado con viñeta',
    palette: 'negro profundo, gris carbón y acentos dorados metálicos',
    effects: 'rayos de luz dorada cruzando el encuadre, brillo/glow alrededor del producto, sensación de campaña de lanzamiento premium',
  },
  {
    key: 'locker-room',
    label: 'Vestidor deportivo premium',
    background: 'vestidor / área de recuperación de un gimnasio premium, con lockers de madera oscura desenfocados',
    lighting: 'luz cálida ambiental de alto contraste, atmósfera premium tipo club deportivo exclusivo',
    materials: 'madera oscura, cuero, metal dorado mate',
    palette: 'café oscuro, negro y dorado',
    effects: 'partículas doradas suspendidas en el aire, viñeta oscura en los bordes, brillo cálido alrededor del producto',
  },
  {
    key: 'underground-boxing',
    label: 'Box clandestino urbano',
    background: 'gimnasio de box underground con ladrillo expuesto, cadenas y un saco de boxeo colgando desenfocado al fondo',
    lighting: 'un solo foco cenital crudo tipo ring de boxeo, sombras muy marcadas, alto contraste dramático',
    materials: 'ladrillo, cadenas metálicas oxidadas, lona de ring',
    palette: 'rojo sangre, negro y gris humo',
    effects: 'humo denso bajo, partículas de polvo iluminadas por el foco, grano cinematográfico sutil',
  },
  {
    key: 'desert-arena',
    label: 'Arena de combate al atardecer',
    background: 'arena de entrenamiento tipo desierto/coliseo al atardecer, dunas y cielo dramático al fondo',
    lighting: 'contraluz de atardecer intenso naranja/rojo, siluetas marcadas, alto contraste épico',
    materials: 'arena, roca erosionada, cielo con nubes dramáticas',
    palette: 'naranja fuego, rojo intenso y dorado',
    effects: 'partículas de arena/polvo suspendidas iluminadas por el sol, destello solar (lens flare) fuerte, sensación épica tipo gladiador',
  },
  {
    key: 'cyber-lab',
    label: 'Laboratorio de rendimiento futurista',
    background: 'laboratorio de alto rendimiento deportivo futurista, superficies de fibra de carbono y paneles LED al fondo',
    lighting: 'iluminación LED fría azul/verde ácido, alto contraste tecnológico',
    materials: 'fibra de carbono, vidrio, metal cromado',
    palette: 'azul eléctrico, verde ácido y negro',
    effects: 'líneas de energía tipo holograma alrededor del producto, resplandor tecnológico, partículas digitales sutiles',
  },
]

// Elige una identidad al azar, excluyendo la última usada, para que nunca se
// repita el fondo de una publicación a la siguiente y con el tiempo se cubran
// todas. "Random" en vez de round-robin porque así lo pidió el dueño de la
// tienda — evita además que un patrón secuencial se sienta predecible.
function randomIdentityExcluding(lastKey: string | null): VisualIdentity {
  const pool = lastKey ? VISUAL_IDENTITIES.filter(identity => identity.key !== lastKey) : VISUAL_IDENTITIES
  const candidates = pool.length > 0 ? pool : VISUAL_IDENTITIES
  return candidates[Math.floor(Math.random() * candidates.length)]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function pickNextVisualIdentity(supabase: any): Promise<VisualIdentity> {
  // Importante: se excluyen los borradores sin visual_identity_key todavía
  // (guardados progresivamente en cuanto hay caption, antes de generar
  // imagen). Si no se excluyeran, la fila más reciente casi siempre sería el
  // borrador actual en curso —con la identidad todavía en null— y la función
  // terminaría regresando siempre la primera identidad de la lista.
  const { data } = await supabase
    .from('store_social_posts')
    .select('visual_identity_key')
    .not('visual_identity_key', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return randomIdentityExcluding(data?.visual_identity_key ?? null)
}

export interface BakedText {
  hook?: string
  price?: string
  supportPoints?: string[]
}

// Modelo de fitness enteramente ficticia — descripción genérica de un tipo de
// cuerpo común en contenido de fitness, no derivada de ninguna persona real.
// Experimental: a diferencia del resto del prompt (que solo cambia el fondo),
// aquí se le pide al modelo más libertad creativa para componer una escena
// completa con una persona, lo que sube el riesgo de que también reinterprete
// el producto — por eso la instrucción de "no tocar el producto" se repite
// como la prioridad número uno antes y después de describir a la modelo.
const FICTIONAL_MODEL_DESCRIPTION = [
  'Incluye en la imagen a una modelo de fitness completamente FICTICIA E INVENTADA — no está basada en ninguna persona real, viva, famosa ni identificable, es un personaje generado desde cero.',
  'Complexión atlética y tonificada propia de una atleta de fitness: piernas fuertes y trabajadas, cintura delgada, cuerpo bien proporcionado y armonioso. Rostro atractivo pero totalmente inventado, sin parecido a ninguna persona real.',
  'Viste ropa deportiva ajustada (leggings y top deportivo) apropiada para una sesión de entrenamiento — estética profesional de anuncio de marca de suplementos, nunca explícita ni sexualizada.',
  'Sostiene el producto con una mano, mostrándolo hacia la cámara en un encuadre estilo UGC/selfie de gimnasio, como si acabara de tomarse la foto en pleno entrenamiento.',
  'ENCUADRE OBLIGATORIO: plano casi de cuerpo completo — la modelo debe verse de las pantorrillas hacia arriba (piernas, cintura, torso, brazos y rostro visibles), NUNCA un recorte a la altura de la cintura ni un primer plano de medio cuerpo.',
  'El producto en su mano debe verse EXACTAMENTE igual al de la fotografía de referencia adjunta — esto tiene prioridad sobre cualquier otro detalle de la composición.',
].join(' ')

function buildImagePrompt(productName: string, identity: VisualIdentity, bakedText?: BakedText, includeModel = false): string {
  const hook = bakedText?.hook?.trim()
  const price = bakedText?.price?.trim()
  const supportPoints = (bakedText?.supportPoints ?? []).map(point => point.trim()).filter(Boolean)

  const textInstructions = hook || price || supportPoints.length > 0
    ? [
        `Además del fondo, integra tú mismo el siguiente texto de venta como parte del diseño gráfico de la imagen, con la jerarquía visual y el tamaño de una campaña publicitaria REAL de una marca grande de suplementos (piensa en el tamaño de texto que usan Nutrex/Redcon1/Ghost en sus anuncios) — nunca elementos decorativos pequeños o discretos, y nunca omitas ninguno de los elementos pedidos abajo:`,
        hook ? `El gancho principal: DEBE ser el elemento de texto más grande y dominante de toda la imagen (compite en tamaño con el nombre del producto en la etiqueta), en tipografía audaz, condensada y de alto impacto tipo cartel deportivo, ocupando el tercio superior: "${hook}".` : '',
        price ? `El precio, en un elemento gráfico tipo etiqueta o badge bien visible (no diminuto), colocado en la esquina INFERIOR IZQUIERDA (nunca en la inferior derecha, ver restricción de zona reservada abajo): "${price}".` : '',
        supportPoints.length > 0
          ? `Estas ${supportPoints.length} frases cortas de apoyo, cada una en su propia tarjeta/etiqueta gráfica GRANDE y claramente legible (no iconos ni texto diminuto de infografía): ${supportPoints.map(point => `"${point}"`).join(', ')}. Repártelas en DOS columnas verticales, una pegada al lateral izquierdo y otra al lateral derecho de la imagen (la mitad de las frases en cada lado), en la zona media (debajo del gancho, encima del precio y del logo, sin tocar ninguno de los dos ni taparse entre sí). Deben verse como tarjetas de beneficio de un anuncio profesional, con buen espacio entre ellas — nunca amontonadas ni comprimidas, y todas del mismo tamaño entre sí.`
          : '',
        'Todo el texto debe quedar EXACTAMENTE como se te dio, sin errores ortográficos, sin agregar ni quitar palabras, perfectamente legible, con tamaño generoso y buen contraste contra el fondo. Incluye TODOS los elementos de texto pedidos arriba — no omitas ninguno.',
        'ZONA RESERVADA OBLIGATORIA: dentro de un círculo de aproximadamente 160×160 px en la esquina INFERIOR DERECHA de la imagen se va a pegar el logotipo real de la marca justo después, de forma local. Esa esquina debe quedar completamente libre — sin precio, sin texto, sin elementos decorativos ni gráficos de ningún tipo ahí. No agregues tú ningún logotipo ni marca de agua en ningún lugar de la imagen — el logo se agrega después por separado, siempre de forma local y exacta.',
      ].filter(Boolean).join(' ')
    : [
        'Composición cuadrada 1:1 pensada para Instagram: deja espacio negativo limpio en el tercio superior de la imagen (sin efectos que lo saturen) para que un texto de gancho se pueda leer con claridad ahí encima después.',
        'No agregues texto, precios, logotipos nuevos ni marcas de agua a la imagen — solo el fondo y los efectos. El texto, el precio y el logo se agregan después por separado.',
      ].join(' ')

  return [
    `Esta imagen adjunta es la fotografía REAL de "${productName}", el producto exacto que se vende en la tienda y saldrá tal cual a los clientes.`,
    'INSTRUCCIÓN OBLIGATORIA E INNEGOCIABLE: conserva el producto (bote, etiqueta, tapa, colores, texto impreso, logotipo y proporciones) EXACTAMENTE IGUAL al original de la imagen adjunta. No lo redibujes, no cambies ninguna letra, número ni color de la etiqueta, no lo deformes, no lo recortes y no lo sustituyas por un producto genérico o inventado.',
    `Reemplaza el fondo por uno nuevo con nivel de CAMPAÑA PUBLICITARIA PROFESIONAL de una marca premium de suplementos deportivos (piensa en el nivel de producción de marcas como Ghost, Redcon1, Nutrex, C4) — dramático, con energía visual, NUNCA una foto plana de catálogo de e-commerce: ${identity.background}.`,
    `Iluminación del fondo: ${identity.lighting}.`,
    `Materiales/superficies visibles en el fondo: ${identity.materials}.`,
    `Paleta de color del fondo: ${identity.palette}.`,
    `Efectos visuales a integrar alrededor del producto (sin taparlo): ${identity.effects}.`,
    includeModel
      ? `${FICTIONAL_MODEL_DESCRIPTION} El producto debe verse claramente, bien iluminado y en foco, aunque ahora comparta protagonismo con la modelo.`
      : 'El producto debe quedar centrado, bien iluminado, completamente en foco y ser el elemento principal de la composición, ocupando una porción generosa del encuadre, con una sombra o reflejo realista que lo ancle a la superficie.',
    textInstructions,
  ].join(' ')
}

interface OpenAiImageErrorBody {
  error?: { message?: string; code?: string; type?: string }
}

class OpenAiImageError extends Error {
  readonly status: number
  readonly body: OpenAiImageErrorBody
  constructor(message: string, status: number, body: OpenAiImageErrorBody) {
    super(message)
    this.status = status
    this.body = body
  }
}

function looksLikeOrgVerificationError(status: number, body: OpenAiImageErrorBody): boolean {
  if (status === 403) return true
  const message = `${body.error?.message ?? ''} ${body.error?.code ?? ''}`.toLowerCase()
  return /organization|verify|verification/.test(message)
}

async function callImagesEdit(
  imageBuffer: Buffer,
  imageContentType: string,
  prompt: string,
  model: string,
  apiKey: string,
): Promise<Buffer> {
  const formData = new FormData()
  formData.set('model', model)
  formData.set('prompt', prompt)
  formData.set('size', '1024x1024')
  formData.set('n', '1')
  formData.set('image', new Blob([new Uint8Array(imageBuffer)], { type: imageContentType || 'image/png' }), 'product.png')

  const response = await fetch(OPENAI_IMAGE_EDIT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as OpenAiImageErrorBody
    throw new OpenAiImageError(body.error?.message || `OpenAI images.edit respondió ${response.status}.`, response.status, body)
  }

  const body = await response.json() as { data?: Array<{ b64_json?: string }> }
  const b64 = body.data?.[0]?.b64_json
  if (!b64) throw new Error('OpenAI no devolvió la imagen generada.')
  return Buffer.from(b64, 'base64')
}

export interface GenerateProductImageInput {
  sourceImageUrl: string
  productName: string
  identity: VisualIdentity
  bakedText?: BakedText
  includeModel?: boolean
}

export interface GenerateProductImageResult {
  buffer: Buffer
  model: string
  fallbackUsed: boolean
}

export async function generateProductImage(input: GenerateProductImageInput): Promise<GenerateProductImageResult> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('Falta configurar OPENAI_API_KEY en el servidor.')

  const sourceResponse = await fetch(input.sourceImageUrl)
  if (!sourceResponse.ok) throw new Error('No se pudo descargar la foto real del producto para usarla como referencia.')
  const sourceBuffer = Buffer.from(await sourceResponse.arrayBuffer())
  const contentType = sourceResponse.headers.get('content-type') || 'image/png'

  const prompt = buildImagePrompt(input.productName, input.identity, input.bakedText, input.includeModel)

  try {
    const buffer = await callImagesEdit(sourceBuffer, contentType, prompt, OPENAI_IMAGE_MODEL_PRIMARY, apiKey)
    return { buffer, model: OPENAI_IMAGE_MODEL_PRIMARY, fallbackUsed: false }
  } catch (error) {
    if (!(error instanceof OpenAiImageError) || !looksLikeOrgVerificationError(error.status, error.body)) throw error
    const buffer = await callImagesEdit(sourceBuffer, contentType, prompt, OPENAI_IMAGE_MODEL_FALLBACK, apiKey)
    return { buffer, model: OPENAI_IMAGE_MODEL_FALLBACK, fallbackUsed: true }
  }
}
