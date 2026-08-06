import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canTransitionContentStatus,
  parseEditableContent,
  parseGeminiResearch,
  validateContentForReview,
} from '../src/lib/storeProductContent.ts'

const validResearch = {
  identity_match: {
    matched: true,
    confidence: 'high',
    matched_name: 'MUTANT WHEY 5 lb',
    matched_flavor: 'Vanilla Ice Cream',
    matched_presentation: '5 lb (2.27 kg)',
  },
  short_description: 'Proteína de suero en presentación de cinco libras.',
  key_features: ['22 g de proteína', 'Mezcla de suero', '61 porciones'],
  presentation: '5 lb (2.27 kg)',
  serving_size: '1 scoop (37 g)',
  servings_per_container: '61',
  nutrition_facts: [
    { name: 'Calorías', amount: '140', unit: 'kcal', daily_value: null, indent: 0 },
  ],
  ingredients: 'Mezcla de proteína de suero (leche).',
  directions: 'Mezclar una porción con agua.',
  nutrition_label_candidates: ['https://example.com/label.pdf'],
  research_warnings: [],
}

test('acepta una investigación exacta de Mutant Whey Vainilla', () => {
  const result = parseGeminiResearch(validResearch)
  assert.equal(result.identity_match.confidence, 'high')
  assert.equal(result.identity_match.matched_flavor, 'Vanilla Ice Cream')
  assert.equal(result.nutrition_facts[0].name, 'Calorías')
})

test('rechaza líneas de producto similares', () => {
  assert.throws(
    () => parseGeminiResearch({
      ...validResearch,
      identity_match: { ...validResearch.identity_match, matched_name: 'Mutant Hardcore Whey 5 lb' },
    }),
    /otra línea/,
  )
})

test('rechaza sabores diferentes a Vainilla', () => {
  assert.throws(
    () => parseGeminiResearch({
      ...validResearch,
      identity_match: { ...validResearch.identity_match, matched_flavor: 'Triple Chocolate' },
    }),
    /Vainilla/,
  )
})

test('rechaza el sabor de referencia dentro de la descripción principal', () => {
  assert.throws(
    () => parseGeminiResearch({
      ...validResearch,
      short_description: 'Proteína de suero sabor Vainilla Ice Cream con 22 g de proteína.',
    }),
    /descripción principal debe ser general/,
  )
})

test('limpia y limita el contenido editable', () => {
  const parsed = parseEditableContent({
    reference_variant_id: null,
    reference_flavor: ' Vainilla ',
    short_description: ' Descripción ',
    key_features: ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete'],
    serving_size: '37 g',
    servings_per_container: '61',
    presentation: '5 lb',
    nutrition_facts: [],
    ingredients: 'Leche',
    directions: 'Mezclar',
    nutrition_label_url: 'javascript:alert(1)',
    research_warnings: [],
  })

  assert.equal(parsed.reference_flavor, 'Vainilla')
  assert.equal(parsed.key_features.length, 6)
  assert.equal(parsed.nutrition_label_url, null)
})

test('valida campos necesarios antes de revisión', () => {
  const missing = validateContentForReview({ short_description: 'Lista' })
  assert.ok(missing.includes('Tabla nutrimental completa'))
  assert.ok(missing.includes('Al menos una fuente'))
})

test('solo permite las transiciones acordadas', () => {
  assert.equal(canTransitionContentStatus('draft', 'review'), true)
  assert.equal(canTransitionContentStatus('draft', 'published'), false)
  assert.equal(canTransitionContentStatus('review', 'published'), true)
  assert.equal(canTransitionContentStatus('published', 'draft'), true)
})
