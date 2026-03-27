/**
 * Generates PWA icons (192x192 and 512x512 PNG) using pure Node.js (no deps).
 * Design: dark background #0D0D12, amber "P" initial with a cart accent.
 */
import { createWriteStream } from 'fs'
import { mkdirSync } from 'fs'
import zlib from 'zlib'

mkdirSync(new URL('../public/icons', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'), { recursive: true })

function createPNG(size) {
  // Draw design into RGBA pixel array
  const pixels = new Uint8Array(size * size * 4)

  const cx = size / 2
  const cy = size / 2
  const r = size * 0.46

  // Background color #0D0D12
  const BG = [13, 13, 18]
  // Accent color #F0B429
  const ACC = [240, 180, 41]
  // Radius for rounded rect
  const RADIUS = size * 0.22

  function inRoundedRect(x, y) {
    const rx = cx - r, ry = cy - r
    const rw = r * 2, rh = r * 2
    if (x < rx || x >= rx + rw || y < ry || y >= ry + rh) return false
    // Check corners
    const corners = [
      [rx + RADIUS, ry + RADIUS],
      [rx + rw - RADIUS, ry + RADIUS],
      [rx + RADIUS, ry + rh - RADIUS],
      [rx + rw - RADIUS, ry + rh - RADIUS],
    ]
    for (const [cx2, cy2] of corners) {
      if (x < cx2 - RADIUS || x > cx2 + RADIUS) continue
      if (y < cy2 - RADIUS || y > cy2 + RADIUS) continue
      if ((x - cx2) ** 2 + (y - cy2) ** 2 > RADIUS ** 2) return false
    }
    return true
  }

  // Draw "P" letter scaled to icon size
  // Grid-based P shape: 5 cols x 7 rows, centered
  const GRID = [
    [1,1,1,1,0],
    [1,0,0,0,1],
    [1,0,0,0,1],
    [1,1,1,1,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
    [1,0,0,0,0],
  ]
  const rows = GRID.length, cols = GRID[0].length
  const cellH = size * 0.52 / rows
  const cellW = size * 0.40 / cols
  const startX = cx - (cols * cellW) / 2
  const startY = cy - (rows * cellH) / 2

  function inLetter(x, y) {
    const col = Math.floor((x - startX) / cellW)
    const row = Math.floor((y - startY) / cellH)
    if (row < 0 || row >= rows || col < 0 || col >= cols) return false
    return GRID[row][col] === 1
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4
      if (inRoundedRect(x, y)) {
        if (inLetter(x, y)) {
          pixels[idx + 0] = ACC[0]
          pixels[idx + 1] = ACC[1]
          pixels[idx + 2] = ACC[2]
        } else {
          pixels[idx + 0] = BG[0]
          pixels[idx + 1] = BG[1]
          pixels[idx + 2] = BG[2]
        }
        pixels[idx + 3] = 255
      } else {
        // Outside rounded rect → transparent
        pixels[idx + 3] = 0
      }
    }
  }

  // Build raw PNG scanlines (filter byte 0 = None before each row)
  const scanlines = Buffer.alloc(size * (1 + size * 4))
  for (let y = 0; y < size; y++) {
    const offset = y * (1 + size * 4)
    scanlines[offset] = 0 // filter type: None
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4
      const dst = offset + 1 + x * 4
      scanlines[dst + 0] = pixels[src + 0]
      scanlines[dst + 1] = pixels[src + 1]
      scanlines[dst + 2] = pixels[src + 2]
      scanlines[dst + 3] = pixels[src + 3]
    }
  }

  const compressed = zlib.deflateSync(scanlines, { level: 9 })

  function crc32(buf) {
    let crc = 0xFFFFFFFF
    for (const b of buf) {
      crc ^= b
      for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0)
    }
    return (crc ^ 0xFFFFFFFF) >>> 0
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const typeB = Buffer.from(type)
    const crcInput = Buffer.concat([typeB, data])
    const crcB = Buffer.alloc(4); crcB.writeUInt32BE(crc32(crcInput))
    return Buffer.concat([len, typeB, data, crcB])
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(size, 0)   // width
  ihdrData.writeUInt32BE(size, 4)   // height
  ihdrData[8] = 8  // bit depth
  ihdrData[9] = 6  // color type: RGBA
  ihdrData[10] = 0 // compression
  ihdrData[11] = 0 // filter
  ihdrData[12] = 0 // interlace

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdrData),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const outDir = new URL('../public/icons', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')

for (const size of [192, 512]) {
  const png = createPNG(size)
  const path = `${outDir}/icon-${size}.png`
  const stream = createWriteStream(path)
  stream.write(png)
  stream.end()
  console.log(`Generated ${path} (${png.length} bytes)`)
}
