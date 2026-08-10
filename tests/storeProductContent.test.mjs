import assert from 'node:assert/strict'
import test from 'node:test'

import {
  areFlavorNamesCompatible,
  areProductNamesCompatible,
  canTransitionContentStatus,
  formatProductResearchError,
  isPresentationCompatible,
  parseEditableContent,
  parseGeminiResearch,
  parseResearchJsonText,
  validateContentForReview,
} from '../src/lib/storeProductContent.ts'

const validResearch = {
  identity_match: {
    matched: true,
    confidence: 'high',
    matched_name: 'MUTANT WHEY 5 lb',
    matched_flavor: 'Vanilla Ice Cream',
    matched_presentation: '5 lb (2.27 kg)',
    matched_barcode: '811662020080',
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

const mutantIdentity = {
  product_name: 'Mutant - Mutant Whey 5lbs',
  brand: 'Mutant',
  reference_flavor: 'Vainilla',
  reference_barcode: '811662020080',
  presentation_hint: '5lbs',
}

test('acepta una investigación exacta de Mutant Whey Vainilla', () => {
  const result = parseGeminiResearch(validResearch, mutantIdentity)
  assert.equal(result.identity_match.confidence, 'high')
  assert.equal(result.identity_match.matched_flavor, 'Vanilla Ice Cream')
  assert.equal(result.nutrition_facts[0].name, 'Calorías')
})

test('rechaza líneas de producto similares', () => {
  assert.throws(
    () => parseGeminiResearch({
      ...validResearch,
      identity_match: { ...validResearch.identity_match, matched_name: 'Mutant Hardcore Whey 5 lb' },
    }, mutantIdentity),
    /no corresponde/,
  )
})

test('rechaza sabores diferentes a Vainilla', () => {
  assert.throws(
    () => parseGeminiResearch({
      ...validResearch,
      identity_match: { ...validResearch.identity_match, matched_flavor: 'Triple Chocolate' },
    }, mutantIdentity),
    /Vainilla/,
  )
})

test('rechaza el sabor de referencia dentro de la descripción principal', () => {
  assert.throws(
    () => parseGeminiResearch({
      ...validResearch,
      short_description: 'Proteína de suero sabor Vainilla Ice Cream con 22 g de proteína.',
    }, mutantIdentity),
    /descripción principal debe ser general/,
  )
})

test('acepta otro producto y sabor cuando coinciden con la selección', () => {
  const result = parseGeminiResearch({
    ...validResearch,
    identity_match: {
      matched: true,
      confidence: 'high',
      matched_name: 'Optimum Nutrition Gold Standard 100% Whey Protein Powder 5 lb',
      matched_flavor: 'Double Rich Chocolate',
      matched_presentation: '5 lb',
      matched_barcode: '748927028676',
    },
    short_description: 'Proteína de suero de la línea Gold Standard con mezcla de aislado y concentrado.',
  }, {
    product_name: 'Optimum Nutrition - Gold Standard Whey 5lbs',
    brand: 'Optimum Nutrition',
    reference_flavor: 'Double Rich Chocolate',
    reference_barcode: '748927028676',
    presentation_hint: '5lbs',
  })

  assert.equal(result.identity_match.matched_barcode, '748927028676')
})

test('acepta BPI Sport e ISO HD aunque la fuente use BPI Sports y añada Whey Protein', () => {
  const result = parseGeminiResearch({
    ...validResearch,
    identity_match: {
      matched: true,
      confidence: 'high',
      matched_name: 'BPI Sports ISO HD 100% Whey Protein Powder',
      matched_flavor: 'Chocolate Brownie',
      matched_presentation: '5 lb',
      matched_barcode: '',
    },
    short_description: 'Proteína de suero de la línea ISO HD con una mezcla de aislado y concentrado.',
  }, {
    product_name: 'Bpi Sport - Iso Hd 5 Lbs',
    brand: 'Bpi Sport',
    reference_flavor: 'Chocolate Brownie',
    reference_barcode: '811213020043',
    presentation_hint: '5 Lbs',
  })

  assert.equal(result.identity_match.matched_name, 'BPI Sports ISO HD 100% Whey Protein Powder')
})

test('no confunde BPI ISO HD con la línea BPI Whey HD', () => {
  assert.throws(
    () => parseGeminiResearch({
      ...validResearch,
      identity_match: {
        ...validResearch.identity_match,
        matched_name: 'BPI Sports Whey HD 100% Whey Protein Powder 5 lb',
        matched_flavor: 'Chocolate Brownie',
        matched_barcode: '',
      },
    }, {
      product_name: 'Bpi Sport - Iso Hd 5 Lbs',
      brand: 'Bpi Sport',
      reference_flavor: 'Chocolate Brownie',
      reference_barcode: '811213020043',
      presentation_hint: '5 Lbs',
    }),
    /no corresponde/,
  )
})

test('acepta el nombre oficial C4 Whey Protein aunque el inventario incluya Pro', () => {
  assert.equal(areProductNamesCompatible(
    'Cellucor - C4 Whey Pro Protein 5lbs',
    'Cellucor C4 Whey Protein',
    'Cellucor',
  ), true)
})

test('no usa la equivalencia de Pro para aceptar otra línea C4', () => {
  assert.equal(areProductNamesCompatible(
    'Cellucor - C4 Whey Pro Protein 5lbs',
    'Cellucor C4 Original Pre Workout',
    'Cellucor',
  ), false)
})

test('acepta Nitrotech y Nitro-Tech como el mismo nombre compuesto', () => {
  const result = parseGeminiResearch({
    ...validResearch,
    identity_match: {
      ...validResearch.identity_match,
      matched_name: 'MuscleTech Nitro-Tech 100% Whey Gold',
      matched_barcode: '',
    },
  }, {
    product_name: 'Muscletech - Nitrotech 100% Whey Gold 5 Lbs',
    brand: 'Muscletech',
    reference_flavor: 'Vainilla',
    reference_barcode: '',
    presentation_hint: '5 Lbs',
  })

  assert.equal(result.identity_match.matched_name, 'MuscleTech Nitro-Tech 100% Whey Gold')
})

test('no confunde Nitro-Tech Whey Gold con otra línea Nitro-Tech', () => {
  assert.equal(areProductNamesCompatible(
    'Muscletech - Nitrotech 100% Whey Gold 5 Lbs',
    'MuscleTech Nitro-Tech Ripped Protein',
    'Muscletech',
  ), false)
})

test('acepta nombres comerciales completos para sabores Reese\'s y Hershey\'s', () => {
  assert.equal(areFlavorNamesCompatible('Reeses', "REESE'S Peanut Butter & Chocolate"), true)
  assert.equal(areFlavorNamesCompatible('Hersheys', "HERSHEY'S Milk Chocolate"), true)
  assert.equal(areFlavorNamesCompatible('Reeses', "HERSHEY'S Milk Chocolate"), false)
})

test('interpreta una respuesta JSON estructurada sin texto adicional', () => {
  const parsed = parseResearchJsonText(JSON.stringify(validResearch))
  assert.deepEqual(parsed, validResearch)
})

test('repara defectos comunes del JSON sin llamar nuevamente a Gemini', () => {
  const malformed = JSON.stringify(validResearch)
    .replace('"key_features":[', '"key_features":[')
    .replace('],"presentation"', ',],"presentation"')
    .replace('Proteína de suero en presentación de cinco libras.', 'Proteína de suero en\npresentación de cinco libras.')

  const parsed = parseResearchJsonText(malformed)
  assert.equal(parsed.short_description, 'Proteína de suero en\npresentación de cinco libras.')
  assert.deepEqual(parsed.key_features, validResearch.key_features)
  assert.deepEqual(parsed.identity_match, validResearch.identity_match)
})

test('detecta una respuesta truncada sin repararla ni consumir de nuevo', () => {
  assert.throws(
    () => parseResearchJsonText('{"identity_match":', 'MAX_TOKENS'),
    /agotó el límite de salida.*segundo consumo/,
  )
})

test('convierte errores 400 de Gemini en un mensaje útil', () => {
  const message = formatProductResearchError(
    new Error('{"error":{"code":400,"message":"Request contains an invalid argument.","status":"INVALID_ARGUMENT"}}'),
  )
  assert.equal(message, 'Gemini rechazó la configuración de investigación. No se realizó un segundo consumo.')
})

test('acepta 4.9 lb o 2,208 g como redondeo comercial de 5 lb', () => {
  assert.equal(isPresentationCompatible('5 Lbs', '4.9 lbs (2,208 g)'), true)
  assert.equal(isPresentationCompatible('5 Lbs', '2.208 kg'), true)
})

test('acepta 5.85 lb como la presentación comercial de 5 lb y conserva el peso real', () => {
  assert.equal(isPresentationCompatible('5lbs', '5.85 lb (2.65 kg) / 66 porciones'), true)

  const result = parseGeminiResearch({
    ...validResearch,
    identity_match: {
      ...validResearch.identity_match,
      matched_name: 'Cellucor C4 Whey Protein',
      matched_flavor: "REESE'S Peanut Butter & Chocolate",
      matched_presentation: '5.85 lb (2.65 kg) / 66 porciones',
      matched_barcode: '',
    },
    presentation: '5.85 lb (2.65 kg)',
    short_description: 'Proteína de suero de la línea C4 Whey Protein.',
  }, {
    product_name: 'Cellucor - C4 Whey Pro Protein 5lbs',
    brand: 'Cellucor',
    reference_flavor: 'Reeses',
    reference_barcode: '842595135855',
    presentation_hint: '5lbs',
  })

  assert.equal(result.presentation, '5.85 lb (2.65 kg)')
  assert.match(result.research_warnings.at(-1), /equivalente comercial de 5lbs/)
})

test('rechaza presentaciones realmente distintas', () => {
  assert.equal(isPresentationCompatible('5 Lbs', '4 lb (1.81 kg)'), false)
  assert.equal(isPresentationCompatible('5 Lbs', '2 kg'), false)
})

test('rechaza un código de barras confirmado para otra variante', () => {
  assert.throws(
    () => parseGeminiResearch({
      ...validResearch,
      identity_match: { ...validResearch.identity_match, matched_barcode: '000000000000' },
    }, mutantIdentity),
    /código de barras/,
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
    research_sources: [
      { title: 'Fabricante', url: 'https://example.com/producto' },
      { title: 'Inválida', url: 'javascript:alert(1)' },
    ],
    research_warnings: ['Gemini no devolvió fuentes verificables. Agrega una fuente antes de enviar la ficha a revisión.'],
  })

  assert.equal(parsed.reference_flavor, 'Vainilla')
  assert.equal(parsed.key_features.length, 6)
  assert.equal(parsed.nutrition_label_url, null)
  assert.deepEqual(parsed.research_sources, [{ title: 'Fabricante', url: 'https://example.com/producto' }])
  assert.deepEqual(parsed.research_warnings, [])
})

test('valida campos necesarios antes de revisión sin exigir una fuente', () => {
  const missing = validateContentForReview({ short_description: 'Lista' })
  assert.ok(missing.includes('Tabla nutrimental completa'))
  assert.equal(missing.includes('Al menos una fuente'), false)
})

test('solo permite las transiciones acordadas', () => {
  assert.equal(canTransitionContentStatus('draft', 'review'), true)
  assert.equal(canTransitionContentStatus('draft', 'published'), false)
  assert.equal(canTransitionContentStatus('review', 'published'), true)
  assert.equal(canTransitionContentStatus('published', 'draft'), true)
})
