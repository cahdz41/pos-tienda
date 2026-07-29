import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildVoicePhotoPath,
  isVoicePhotoCommandCandidate,
  parseVoicePhotoCommand,
} from '../src/lib/voicePhotoCommand.ts'

test('extrae el producto de comandos para asignar fotos', () => {
  const examples = [
    ['Agregar imagen de producto ISO 100 cinco libras', 'iso 100 cinco libras'],
    ['Agrégale una foto al producto Psychotic rojo uva', 'psychotic rojo uva'],
    ['Asignar foto a creatina monohidratada', 'creatina monohidratada'],
    ['Subir fotografía de C4 original', 'c4 original'],
  ]

  for (const [phrase, expected] of examples) {
    const parsed = parseVoicePhotoCommand(phrase)
    assert.ok(parsed, phrase)
    assert.equal(parsed.query, expected)
    assert.equal(isVoicePhotoCommandCandidate(phrase), true)
  }
})

test('abre la sección aun cuando no se indicó un producto', () => {
  const parsed = parseVoicePhotoCommand('Agregar imagen de producto')
  assert.ok(parsed)
  assert.equal(parsed.query, null)
  assert.equal(buildVoicePhotoPath(parsed), '/configuracion?seccion=fotos-ia')
})

test('no confunde la creación de productos con la asignación de fotos', () => {
  assert.equal(parseVoicePhotoCommand('Agregar producto nuevo'), null)
  assert.equal(isVoicePhotoCommandCandidate('Agregar producto nuevo'), false)
})

test('construye una ruta segura con el producto codificado', () => {
  const parsed = parseVoicePhotoCommand('Agregar imagen de producto ISO 100 5 lbs')
  assert.ok(parsed)
  assert.equal(
    buildVoicePhotoPath(parsed),
    '/configuracion?seccion=fotos-ia&producto=iso+100+5+lbs'
  )
})
