import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildVoiceInventoryPath,
  isVoiceInventoryCommandCandidate,
  parseVoiceInventoryCommand,
} from '../src/lib/voiceInventoryCommand.ts'

test('reconoce instrucciones explícitas para ajustar inventario', () => {
  const phrases = [
    'Agregar inventario, psychotic rojo uva',
    'Agrégame al inventario un psychotic rojo de uva',
    'Agrega psychotic rojo uva al inventario',
    'Ajustar stock de psychotic rojo uva',
    'Ajuste de stock de psychotic rojo uva',
    'Entrada de inventario de psychotic rojo uva',
  ]

  for (const phrase of phrases) {
    const parsed = parseVoiceInventoryCommand(phrase)
    assert.ok(parsed, phrase)
    assert.match(parsed.query, /psychotic rojo.*uva/)
    assert.equal(isVoiceInventoryCommandCandidate(phrase), true)
  }
})

test('no interpreta agregar al carrito como ajuste de inventario', () => {
  assert.equal(parseVoiceInventoryCommand('agrega psychotic rojo uva al carrito'), null)
  assert.equal(isVoiceInventoryCommandCandidate('agrega psychotic rojo uva al carrito'), false)
  assert.equal(parseVoiceInventoryCommand('agregar inventario'), null)
  assert.equal(isVoiceInventoryCommandCandidate('agregar inventario'), true)
})

test('construye una ruta de inventario con un único parámetro permitido', () => {
  const command = parseVoiceInventoryCommand('ajustar stock de psychotic rojo uva')
  assert.ok(command)
  assert.equal(
    buildVoiceInventoryPath(command),
    '/inventario?ajustar=psychotic+rojo+uva'
  )
})
