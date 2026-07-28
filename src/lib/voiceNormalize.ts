// Voice query normalization: maps Spanish phonetic transcriptions to English supplement product terms

const PHONETIC_MAP: [RegExp, string][] = [
  // ── Whey ─────────────────────────────────────────────────────────────────
  [/\bguei\b/gi, 'whey'],
  [/\bwei\b/gi,  'whey'],
  [/\bwhe\b/gi,  'whey'],

  // ── ISO100 (compound before splitting numbers) ───────────────────────────
  [/\b(aiso|iso)\s*cien\b/gi,  'iso100'],
  [/\b(aiso|iso)\s*100\b/gi,   'iso100'],
  [/\baiso\b/gi,               'iso'],

  // ── Nitrotech ────────────────────────────────────────────────────────────
  [/\bnitrote[ck]\b/gi,  'nitrotech'],
  [/\bnitrotes\b/gi,     'nitrotech'],
  [/\bnitrochen\b/gi,    'nitrotech'],

  // ── Dymatize ─────────────────────────────────────────────────────────────
  [/\bdinami[sz]\b/gi,   'dymatize'],
  [/\bdinataim[sz]\b/gi, 'dymatize'],
  [/\bdimatime\b/gi,     'dymatize'],

  // ── Gold Standard ────────────────────────────────────────────────────────
  [/\bgold\s+estandar\b/gi, 'gold standard'],

  // ── Optimum Nutrition ─────────────────────────────────────────────────────
  [/\boptimun\b/gi, 'optimum'],
  [/\boptimen\b/gi, 'optimum'],

  // ── MuscleTech ────────────────────────────────────────────────────────────
  [/\bmascolte[ck]\b/gi, 'muscletech'],
  [/\bmasculte[ck]\b/gi, 'muscletech'],

  // ── BSN ───────────────────────────────────────────────────────────────────
  [/\bbes\s*en\b/gi,            'bsn'],
  [/\bb\s+s\s+n\b/gi,           'bsn'],

  // ── Cellucor / C4 ────────────────────────────────────────────────────────
  [/\bsely?ucor\b/gi, 'cellucor'],

  // ── 1st Phorm ────────────────────────────────────────────────────────────
  [/\b(first|primer)\s+f[oa]rm\b/gi, '1st phorm'],

  // ── Scivation / Xtend ────────────────────────────────────────────────────
  [/\bxtend\b/gi, 'xtend'],

  // ── Isopure ───────────────────────────────────────────────────────────────
  [/\b(aiso\s+pure?|isopure?)\b/gi, 'isopure'],

  // ── BCAA ──────────────────────────────────────────────────────────────────
  [/\bbeceaa\b/gi,          'bcaa'],
  [/\bbicaa\b/gi,           'bcaa'],
  [/\bb\s+c\s+a\s+a\b/gi,  'bcaa'],
  [/\bbeseaa\b/gi,          'bcaa'],

  // ── EAA ───────────────────────────────────────────────────────────────────
  [/\be\s+a\s+a\b/gi, 'eaa'],

  // ── Pre-workout ───────────────────────────────────────────────────────────
  [/\bpreentreno\b/gi,  'pre workout'],
  [/\bpreworkout\b/gi,  'pre workout'],

  // ── L-Carnitine ───────────────────────────────────────────────────────────
  [/\bel?\s+carnitin\b/gi, 'carnitine'],
  [/\bcarnitin\b/gi,        'carnitine'],
  [/\bl\s+carnitin\b/gi,    'l-carnitine'],

  // ── Glutamine ─────────────────────────────────────────────────────────────
  [/\bglutamina\b/gi, 'glutamine'],

  // ── Casein ────────────────────────────────────────────────────────────────
  [/\bcaseina\b/gi, 'casein'],

  // ── Creatine (Spanish creatina is fine, but keep both) ────────────────────
  [/\b(?:n\s*)?keratina\b/gi, 'creatine'],
  [/\bncreatina\b/gi, 'creatine'],
  [/\bcreatina\b/gi, 'creatine'],

  // ── Mass Gainer ───────────────────────────────────────────────────────────
  [/\bmas\s+ganer\b/gi, 'mass gainer'],
  [/\bganer\b/gi,        'gainer'],

  // ── Flavors (cookies) ────────────────────────────────────────────────────
  [/\bkukis?\b/gi, 'cookies'],

  // ── Percent ───────────────────────────────────────────────────────────────
  [/\bpor\s+ciento\b/gi, '%'],
]

const NUMBER_MAP: [RegExp, string][] = [
  [/\bciento\b/gi,    '100'],
  [/\bcien\b/gi,      '100'],
  [/\bquinientos?\b/gi, '500'],
  [/\bmil\b/gi,       '1000'],
  [/\bveinte\b/gi,    '20'],
  [/\btreinta\b/gi,   '30'],
  [/\bdiez\b/gi,      '10'],
  [/\bonce\b/gi,      '11'],
  [/\bdoce\b/gi,      '12'],
  [/\bnueve\b/gi,     '9'],
  [/\bocho\b/gi,      '8'],
  [/\bsiete\b/gi,     '7'],
  [/\bseis\b/gi,      '6'],
  [/\bcinco\b/gi,     '5'],
  [/\bcuatro\b/gi,    '4'],
  [/\btres\b/gi,      '3'],
  [/\bdos\b/gi,       '2'],
  [/\buno\b/gi,       '1'],
]

const UNIT_MAP: [RegExp, string][] = [
  [/\blibras?\b/gi,     'lbs'],
  [/\bkilogramos?\b/gi, 'kg'],
  [/\bkilos?\b/gi,      'kg'],
  [/\bgramos?\b/gi,     'g'],
]

// Filler words that don't help match product names
const FILLERS = new Set([
  'de', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'con', 'sin', 'para', 'sabor', 'sabores', 'producto', 'al',
  'en', 'y', 'o', 'su', 'por', 'a',
])

export function removeAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Normalizes a Spanish voice transcript for supplement product search.
 * Maps phonetic Spanish pronunciations to English product/brand names.
 */
export function normalizeVoiceQuery(transcript: string): string {
  let text = transcript.toLowerCase().trim()

  for (const [pattern, replacement] of PHONETIC_MAP) {
    text = text.replace(pattern, replacement)
  }
  for (const [pattern, replacement] of NUMBER_MAP) {
    text = text.replace(pattern, replacement)
  }
  for (const [pattern, replacement] of UNIT_MAP) {
    text = text.replace(pattern, replacement)
  }

  text = removeAccents(text)

  // Remove filler words and collapse spaces
  text = text
    .split(/\s+/)
    .filter(w => w.length > 0 && !FILLERS.has(w))
    .join(' ')
    .trim()

  return text || transcript  // fallback to original if result is empty
}

/**
 * Word-by-word search: every word in the query must appear (as substring)
 * somewhere in the combined target strings. Case/accent insensitive.
 * Falls back to plain substring match for single-word queries.
 */
export function matchesSearch(query: string, ...targets: string[]): boolean {
  const q = query.trim()
  if (!q) return true

  const qNorm = removeAccents(q.toLowerCase())
  const targetNorm = removeAccents(targets.join(' ').toLowerCase())

  // Barcode: exact numeric search — don't split, use includes directly
  if (/^\d+$/.test(q)) return targetNorm.includes(qNorm)

  const words = qNorm.split(/\s+/).filter(w => w.length >= 2)
  if (words.length === 0) return targetNorm.includes(qNorm)

  return words.every(word => {
    if (targetNorm.includes(word)) return true
    // Prefix match for longer words (handles truncated speech: "proteín" → "protein")
    if (word.length >= 5 && targetNorm.includes(word.slice(0, word.length - 1))) return true
    if (word.length >= 4 && targetNorm.includes(word.slice(0, 4))) return true
    return false
  })
}
