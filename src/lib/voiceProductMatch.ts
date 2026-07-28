import { normalizeVoiceQuery } from './voiceNormalize.ts'

export interface VoiceProductCandidate {
  id: string
  name: string
  flavor: string | null
  barcode?: string
  stock: number
}

export interface VoiceProductMatch<T extends VoiceProductCandidate> {
  item: T
  score: number
  matchedTokens: string[]
}

function canonicalText(value: string): string {
  return normalizeVoiceQuery(value)
    .replace(/\bstandar(?:d)?\b/g, 'standard')
    .replace(/\b(?:extreme|x treme)\b/g, 'xtreme')
    .replace(/\b(\d+(?:\.\d+)?)\s*(?:libras?|lb|lbs)\b/g, '$1lbs')
    .replace(/\b(\d+(?:\.\d+)?)\s*(?:kilogramos?|kilos?|kg)\b/g, '$1kg')
    .replace(/\b(\d+(?:\.\d+)?)\s*(?:gramos?|grams?|grs?|g)\b/g, '$1g')
    .replace(/(\d+)\s*%/g, '$1%')
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value: string): string[] {
  return [...new Set(canonicalText(value).split(' ').filter(token => token.length > 0))]
}

function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)

  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j]
      previous[j] = a[i - 1] === b[j - 1]
        ? diagonal
        : Math.min(diagonal, above, previous[j - 1]) + 1
      diagonal = above
    }
  }

  return previous[b.length]
}

function tokenSimilarity(queryToken: string, targetToken: string): number {
  if (queryToken === targetToken) return 1

  const queryQuantity = queryToken.match(/^(\d+(?:\.\d+)?)([a-z%]+)?$/)
  const targetQuantity = targetToken.match(/^(\d+(?:\.\d+)?)([a-z%]+)?$/)
  if (queryQuantity || targetQuantity) {
    if (!queryQuantity || !targetQuantity || queryQuantity[1] !== targetQuantity[1]) return 0

    const queryUnit = queryQuantity[2] ?? ''
    const targetUnit = targetQuantity[2] ?? ''
    if (queryUnit && targetUnit && queryUnit !== targetUnit) return 0
    return queryUnit === targetUnit ? 1 : 0.94
  }

  const shortest = Math.min(queryToken.length, targetToken.length)
  if (shortest >= 4 && (queryToken.includes(targetToken) || targetToken.includes(queryToken))) {
    return 0.9
  }

  const longest = Math.max(queryToken.length, targetToken.length)
  if (longest < 4) return 0
  const distance = levenshtein(queryToken, targetToken)
  if (distance === 1) return 0.86
  if (longest >= 7 && distance === 2) return 0.64
  return 0
}

function tokenWeight(token: string): number {
  if (/\d/.test(token)) return 2.4
  if (token.length <= 2) return 0.6
  return 1
}

export function rankVoiceProductMatches<T extends VoiceProductCandidate>(
  query: string,
  candidates: T[],
  limit = 4
): VoiceProductMatch<T>[] {
  const queryText = canonicalText(query)
  const queryTokens = tokens(query)
  if (!queryText || queryTokens.length === 0 || limit <= 0) return []

  return candidates
    .map(candidate => {
      const nameText = canonicalText(candidate.name)
      const flavorText = canonicalText(candidate.flavor ?? '')
      const targetTokens = tokens(`${candidate.name} ${candidate.flavor ?? ''} ${candidate.barcode ?? ''}`)
      const flavorTokens = new Set(tokens(candidate.flavor ?? ''))
      let earned = 0
      let possible = 0
      const matchedTokens: string[] = []
      let flavorMatches = 0
      let strongMatches = 0

      for (const queryToken of queryTokens) {
        const weight = tokenWeight(queryToken)
        possible += weight
        let best = 0
        let bestTarget = ''

        for (const targetToken of targetTokens) {
          const similarity = tokenSimilarity(queryToken, targetToken)
          if (similarity > best) {
            best = similarity
            bestTarget = targetToken
          }
        }

        earned += best * weight
        if (best >= 0.82) {
          matchedTokens.push(queryToken)
          strongMatches++
        }
        if (best >= 0.86 && flavorTokens.has(bestTarget)) flavorMatches++
      }

      let score = possible > 0 ? earned / possible : 0
      const coverage = strongMatches / queryTokens.length
      score *= 0.65 + (coverage * 0.35)
      if (nameText.includes(queryText)) score += 0.12
      if (flavorText && queryText.includes(flavorText)) score += 0.08
      score += Math.min(flavorMatches * 0.035, 0.14)
      if (candidate.stock > 0) score += 0.015

      return {
        item: candidate,
        score: Math.min(score, 1),
        matchedTokens,
      }
    })
    .filter(match => {
      const requiredMatches = queryTokens.length === 1 ? 1 : 2
      return match.score >= 0.45 && match.matchedTokens.length >= requiredMatches
    })
    .sort((a, b) => b.score - a.score || b.item.stock - a.item.stock || a.item.name.localeCompare(b.item.name, 'es'))
    .slice(0, limit)
}
