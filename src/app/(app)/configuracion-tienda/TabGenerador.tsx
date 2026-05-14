'use client'

import { useState, useEffect } from 'react'
import JSZip from 'jszip'
import type { Offer, Package } from '@/types'

const LOGO_URL = 'https://res.cloudinary.com/dflnist9g/image/upload/v1776893327/303479618_567324658514485_3402746677447074430_n_dujqec.jpg'
const MONTHS_ES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE']

function fmt(n: number) {
  return '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function slug(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40)
}
function getMonthYear() {
  const d = new Date()
  return { month: MONTHS_ES[d.getMonth()], year: d.getFullYear() }
}
async function loadImg(url: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const t = setTimeout(() => resolve(null), 6000)
    img.onload  = () => { clearTimeout(t); resolve(img) }
    img.onerror = () => { clearTimeout(t); resolve(null) }
    img.src = url
  })
}

// ── Canvas helpers ────────────────────────────────────────────────────────────
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r); ctx.closePath()
}

function pathRoundTop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h)
  ctx.lineTo(x, y + h); ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r); ctx.closePath()
}

function drawContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ir = img.width / img.height, br = w / h
  let dw: number, dh: number, dx: number, dy: number
  if (ir > br) { dw = w; dh = w / ir; dx = x; dy = y + (h - dh) / 2 }
  else          { dh = h; dw = h * ir; dy = y; dx = x + (w - dw) / 2 }
  ctx.drawImage(img, dx, dy, dw, dh)
}

// Returns the Y position (top) after the last line drawn
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, topY: number, maxW: number, fontSize: number, lineSpacing: number, maxLines = 99): number {
  const lh = fontSize * lineSpacing
  const words = text.split(' ')
  let line = '', y = topY, count = 0
  for (const word of words) {
    const test = line ? line + ' ' + word : word
    if (ctx.measureText(test).width > maxW && line) {
      if (count >= maxLines - 1) {
        let tr = line
        while (ctx.measureText(tr + '…').width > maxW && tr.length > 0) tr = tr.slice(0, -1)
        ctx.fillText(tr + '…', x, y + fontSize * 0.78); return y + lh
      }
      ctx.fillText(line, x, y + fontSize * 0.78)
      line = word; y += lh; count++
    } else { line = test }
  }
  if (line) { ctx.fillText(line, x, y + fontSize * 0.78); y += lh }
  return y
}

// ── Draw one offer card ───────────────────────────────────────────────────────
function drawOfferCard(
  ctx: CanvasRenderingContext2D, offer: Offer, img: HTMLImageElement | null,
  cx: number, cy: number, cw: number, ch: number,
  fs: { name: number; small: number; big: number; badge: number; cat: number }
) {
  const R = 10, PAD = 6
  const IMG_H = Math.floor(cw * 0.74)

  // Compact card height based on content
  const nameH = fs.name * 1.25 * 2
  const cardH = IMG_H + PAD + nameH + fs.small + 2 + fs.big + 3 + fs.badge + 8 + PAD + 2

  // Center vertically inside the cell if there's extra space
  const actualCy = cy + Math.max(0, (ch - cardH) / 2)

  // Card shadow
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 5
  roundRect(ctx, cx, actualCy, cw, cardH, R)
  ctx.fillStyle = '#111111'
  ctx.fill()
  ctx.restore()

  // Golden gradient border
  const borderG = ctx.createLinearGradient(cx, actualCy, cx + cw, actualCy + cardH)
  borderG.addColorStop(0, '#fbbf24')
  borderG.addColorStop(0.5, '#ff4500')
  borderG.addColorStop(1, '#f59e0b')
  ctx.save()
  roundRect(ctx, cx + 0.5, actualCy + 0.5, cw - 1, cardH - 1, R)
  ctx.strokeStyle = borderG; ctx.lineWidth = 2.5
  ctx.stroke()
  ctx.restore()

  // Image area with subtle warm gradient background
  const imgGrad = ctx.createLinearGradient(cx, actualCy, cx, actualCy + IMG_H)
  imgGrad.addColorStop(0, '#1a0a00')
  imgGrad.addColorStop(0.5, '#120600')
  imgGrad.addColorStop(1, '#1a0800')
  ctx.fillStyle = imgGrad
  pathRoundTop(ctx, cx, actualCy, cw, IMG_H, R); ctx.fill()

  // Subtle radial glow behind product image
  const glow = ctx.createRadialGradient(cx + cw/2, actualCy + IMG_H/2, 10, cx + cw/2, actualCy + IMG_H/2, IMG_H * 0.55)
  glow.addColorStop(0, 'rgba(255,69,0,0.18)')
  glow.addColorStop(1, 'rgba(255,69,0,0)')
  ctx.save()
  pathRoundTop(ctx, cx, actualCy, cw, IMG_H, R); ctx.clip()
  ctx.fillStyle = glow
  ctx.fillRect(cx, actualCy, cw, IMG_H)
  ctx.restore()

  if (img) {
    ctx.save()
    pathRoundTop(ctx, cx, actualCy, cw, IMG_H, R); ctx.clip()
    drawContain(ctx, img, cx + 5, actualCy + 5, cw - 10, IMG_H - 10)
    ctx.restore()
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.font = `${Math.round(IMG_H * 0.35)}px system-ui`
    ctx.textAlign = 'center'
    ctx.fillText('📦', cx + cw / 2, actualCy + IMG_H * 0.6)
  }

  // Category badge (top-right on image)
  const catStr = (offer.categoria || 'SUPLEMENTO').toUpperCase()
  ctx.font = `600 ${fs.cat}px system-ui`
  const catBW = ctx.measureText(catStr).width + 10
  const catBH = fs.cat + 6
  ctx.fillStyle = 'rgba(0,0,0,0.72)'
  roundRect(ctx, cx + cw - catBW - 4, actualCy + 4, catBW, catBH, 3); ctx.fill()
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'
  ctx.fillText(catStr, cx + cw - catBW - 4 + 5, actualCy + 4 + fs.cat)

  // ── Text section ──
  let ty = actualCy + IMG_H + PAD

  // Name
  ctx.fillStyle = '#e5e7eb'
  ctx.font = `bold ${fs.name}px system-ui`
  ctx.textAlign = 'left'
  ty = wrapText(ctx, offer.nombre, cx + PAD, ty, cw - PAD * 2, fs.name, 1.22, 2) + 2

  // Original price
  const listaStr = fmt(offer.precio_lista)
  ctx.font = `${fs.small}px system-ui`
  ctx.fillStyle = 'rgba(255,255,255,0.30)'
  ctx.fillText(listaStr, cx + PAD, ty + fs.small * 0.78)
  const listaW = ctx.measureText(listaStr).width
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(cx + PAD, ty + fs.small * 0.32)
  ctx.lineTo(cx + PAD + listaW, ty + fs.small * 0.32)
  ctx.stroke()
  ty += fs.small + 2

  // Offer price
  ctx.font = `bold ${fs.big}px system-ui`
  ctx.fillStyle = '#ef4444'
  ctx.fillText(fmt(offer.precio_oferta), cx + PAD, ty + fs.big * 0.78)
  ty += fs.big + 3

  // Savings badge (compact, right after price)
  const ahorro = offer.precio_lista - offer.precio_oferta
  const savStr = `¡Ahorras ${fmt(ahorro)}!`
  ctx.font = `bold ${fs.badge}px system-ui`
  const savBW = ctx.measureText(savStr).width + 12
  const savBH = fs.badge + 7
  const savX = cx + PAD
  ctx.fillStyle = 'rgba(0,200,70,0.18)'
  roundRect(ctx, savX, ty, savBW, savBH, savBH / 2); ctx.fill()
  ctx.strokeStyle = 'rgba(0,220,80,0.50)'; ctx.lineWidth = 1
  roundRect(ctx, savX, ty, savBW, savBH, savBH / 2); ctx.stroke()
  ctx.fillStyle = '#4ade80'
  ctx.fillText(savStr, savX + 6, ty + fs.badge + 1)
}

// ── Layout helper: adaptive cols/rows based on actual count ─────────────────
function getLayout(n: number) {
  if (n <= 1) return { cols: 1, rows: 1 }
  if (n === 2) return { cols: 2, rows: 1 }
  if (n === 3) return { cols: 3, rows: 1 }
  if (n <= 4) return { cols: 2, rows: 2 }
  if (n <= 6) return { cols: 3, rows: 2 }
  return { cols: 4, rows: 2 }
}

// ── Generate offer collage page ────────────────────────────────────────────
async function generateOfferCollage(
  pageOffers: Offer[], pageNum: number, totalPages: number,
  logo: HTMLImageElement | null, _perPage: number
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 1080; canvas.height = 1080
  const ctx = canvas.getContext('2d')!
  const { month, year } = getMonthYear()
  const n = pageOffers.length

  const { cols, rows } = getLayout(n)
  const HEADER  = 108
  const FOOTER  = 82
  const PAD_X   = 18
  const GAP     = 14
  const CARD_W  = Math.floor((1080 - PAD_X * 2 - GAP * (cols - 1)) / cols)

  // Responsive font sizes based on card width
  const fs = CARD_W < 230
    ? { name: 13, small: 12, big: 22, badge: 10, cat: 9 }
    : CARD_W < 290
      ? { name: 15, small: 13, big: 26, badge: 11, cat: 10 }
      : { name: 17, small: 14, big: 30, badge: 12, cat: 11 }

  // Card height driven by image (74% of width) + compact text
  const IMG_H = Math.floor(CARD_W * 0.74)
  const PAD = 6
  const nameH = fs.name * 1.25 * 2
  const CARD_H = IMG_H + PAD + nameH + fs.small + 2 + fs.big + 3 + fs.badge + 8 + PAD + 2

  // Center grid vertically if there's slack
  const availableH = 1080 - HEADER - FOOTER
  const gridTotalH = rows * CARD_H + (rows - 1) * GAP
  const startY = HEADER + Math.max(0, (availableH - gridTotalH) / 2)

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, 1080)
  bg.addColorStop(0, '#0a0a0a'); bg.addColorStop(0.55, '#0e0500'); bg.addColorStop(1, '#160900')
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1080, 1080)

  // Top accent line
  const tl = ctx.createLinearGradient(0, 0, 1080, 0)
  tl.addColorStop(0, 'transparent'); tl.addColorStop(0.25, '#ff4500')
  tl.addColorStop(0.75, '#ff4500'); tl.addColorStop(1, 'transparent')
  ctx.fillStyle = tl; ctx.fillRect(0, 0, 1080, 4)

  // Logo
  if (logo) {
    ctx.save()
    ctx.beginPath(); ctx.arc(60, 57, 41, 0, Math.PI * 2); ctx.clip()
    ctx.drawImage(logo, 19, 16, 82, 82); ctx.restore()
    ctx.strokeStyle = 'rgba(255,69,0,0.5)'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(60, 57, 41, 0, Math.PI * 2); ctx.stroke()
  }

  // Header: "PROMOS [MES]" unified
  const headerTitle = `PROMOS ${month}`
  ctx.font = 'bold 38px system-ui'
  const titleW = ctx.measureText(headerTitle).width
  const titlePad = 28
  const titleBoxW = titleW + titlePad * 2
  const titleBoxH = 52
  const titleX = 540 - titleBoxW / 2
  const titleY = 14
  const titleG = ctx.createLinearGradient(titleX, 0, titleX + titleBoxW, 0)
  titleG.addColorStop(0, '#c02000'); titleG.addColorStop(1, '#ff4500')
  roundRect(ctx, titleX, titleY, titleBoxW, titleBoxH, titleBoxH / 2)
  ctx.fillStyle = titleG; ctx.fill()
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'
  ctx.fillText(headerTitle, 540, titleY + 35)

  // Year subtitle
  ctx.font = 'bold 22px system-ui'; ctx.fillStyle = '#fbbf24'
  ctx.fillText(String(year), 540, titleY + titleBoxH + 26)

  // Page counter
  ctx.font = 'bold 17px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.38)'
  ctx.textAlign = 'right'; ctx.fillText(`${pageNum}/${totalPages}`, 1060, 40)

  // Preload images
  const imgs = await Promise.all(pageOffers.map(o => o.imagen ? loadImg(o.imagen) : Promise.resolve(null)))

  // Draw cards
  for (let i = 0; i < pageOffers.length; i++) {
    const row = Math.floor(i / cols), col = i % cols
    const cx = PAD_X + col * (CARD_W + GAP)
    const cy = startY + row * (CARD_H + GAP)
    drawOfferCard(ctx, pageOffers[i], imgs[i], cx, cy, CARD_W, CARD_H, fs)
  }

  // Footer
  const footerY = 1080 - FOOTER
  ctx.fillStyle = 'rgba(0,0,0,0.88)'; ctx.fillRect(0, footerY, 1080, FOOTER)
  const fl = ctx.createLinearGradient(0, 0, 1080, 0)
  fl.addColorStop(0, 'transparent'); fl.addColorStop(0.3, 'rgba(255,69,0,0.38)')
  fl.addColorStop(0.7, 'rgba(255,69,0,0.38)'); fl.addColorStop(1, 'transparent')
  ctx.fillStyle = fl; ctx.fillRect(0, footerY, 1080, 1.5)

  ctx.font = '17px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.textAlign = 'center'
  ctx.fillText(`★  Estas ofertas serán válidas ${month} ${year}  ★`, 540, footerY + 28)
  ctx.font = '14px system-ui'; ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.fillText('Para respetar el precio de las promos el pago debe ser en efectivo o Transferencia', 540, footerY + 54)

  return new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/png'))
}

// ── Generate package image (individual, unchanged design) ─────────────────
async function generatePackageImage(pkg: Package, logo: HTMLImageElement | null): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 1080; canvas.height = 1080
  const ctx = canvas.getContext('2d')!

  const bg = ctx.createLinearGradient(0, 0, 0, 1080)
  bg.addColorStop(0, '#080808'); bg.addColorStop(0.6, '#0d0900'); bg.addColorStop(1, '#1a1000')
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1080, 1080)

  const glow = ctx.createRadialGradient(540, 420, 80, 540, 420, 500)
  glow.addColorStop(0, 'rgba(251,191,36,0.12)'); glow.addColorStop(1, 'rgba(251,191,36,0)')
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 1080, 1080)

  const tl = ctx.createLinearGradient(0, 0, 1080, 0)
  tl.addColorStop(0, 'transparent'); tl.addColorStop(0.3, '#fbbf24')
  tl.addColorStop(0.7, '#fbbf24'); tl.addColorStop(1, 'transparent')
  ctx.fillStyle = tl; ctx.fillRect(0, 0, 1080, 4)

  if (logo) {
    ctx.save()
    ctx.beginPath(); ctx.arc(68, 68, 44, 0, Math.PI * 2); ctx.clip()
    ctx.drawImage(logo, 24, 24, 88, 88); ctx.restore()
    ctx.strokeStyle = 'rgba(251,191,36,0.6)'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(68, 68, 44, 0, Math.PI * 2); ctx.stroke()
  }

  ctx.save()
  roundRect(ctx, 790, 28, 262, 44, 22)
  ctx.fillStyle = 'rgba(251,191,36,0.1)'; ctx.fill()
  ctx.strokeStyle = 'rgba(251,191,36,0.45)'; ctx.lineWidth = 1.5; ctx.stroke()
  ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 17px system-ui'; ctx.textAlign = 'center'
  ctx.fillText('🎁 COMBO EXCLUSIVO', 921, 55); ctx.restore()

  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 62px system-ui'; ctx.textAlign = 'center'
  const pkgNameY = wrapText(ctx, pkg.nombre.toUpperCase(), 540, 140, 940, 62, 1.15)

  const prods = pkg.productos.slice(0, 5)
  const prodImgs = await Promise.all(prods.map(p => p.imagen ? loadImg(p.imagen) : Promise.resolve(null)))

  const count = prods.length
  const thumbSize = count <= 2 ? 280 : count <= 3 ? 220 : 180
  const thumbGap = 24
  const totalW = count * thumbSize + (count - 1) * thumbGap
  const startX = (1080 - totalW) / 2
  const thumbY = pkgNameY + 20

  for (let i = 0; i < count; i++) {
    const tx = startX + i * (thumbSize + thumbGap)
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    roundRect(ctx, tx, thumbY, thumbSize, thumbSize, 16); ctx.fill()
    if (prodImgs[i]) {
      ctx.save()
      roundRect(ctx, tx, thumbY, thumbSize, thumbSize, 16); ctx.clip()
      drawContain(ctx, prodImgs[i]!, tx, thumbY, thumbSize, thumbSize)
      ctx.restore()
    } else {
      ctx.font = `${thumbSize * 0.45}px system-ui`; ctx.textAlign = 'center'
      ctx.fillStyle = 'rgba(255,255,255,0.15)'
      ctx.fillText('📦', tx + thumbSize / 2, thumbY + thumbSize * 0.62)
    }
    ctx.strokeStyle = 'rgba(251,191,36,0.25)'; ctx.lineWidth = 1.5
    roundRect(ctx, tx, thumbY, thumbSize, thumbSize, 16); ctx.stroke()
  }

  let listY = thumbY + thumbSize + 28
  ctx.textAlign = 'left'
  for (const p of prods) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '24px system-ui'
    ctx.fillText(`• ${p.nombre.split(' — ')[0]}`, 140, listY); listY += 36
  }

  const sepY = listY + 10
  ctx.strokeStyle = 'rgba(251,191,36,0.3)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(140, sepY); ctx.lineTo(940, sepY); ctx.stroke()

  const priceY = sepY + 50
  ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.font = '36px system-ui'; ctx.textAlign = 'center'
  const listaStr = fmt(pkg.precio_lista)
  ctx.fillText(listaStr, 540, priceY)
  const listaW = ctx.measureText(listaStr).width
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(540 - listaW / 2, priceY - 11); ctx.lineTo(540 + listaW / 2, priceY - 11); ctx.stroke()

  ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 108px system-ui'
  ctx.fillText(fmt(pkg.precio_oferta), 540, priceY + 104)

  const pct = pkg.precio_lista > 0 ? Math.round(((pkg.precio_lista - pkg.precio_oferta) / pkg.precio_lista) * 100) : 0
  const ahorro = pkg.precio_lista - pkg.precio_oferta
  const badgeY = priceY + 122

  ctx.save()
  roundRect(ctx, 200, badgeY, 160, 48, 24); ctx.fillStyle = '#dc2626'; ctx.fill()
  ctx.fillStyle = '#fff'; ctx.font = 'bold 26px system-ui'; ctx.textAlign = 'center'
  ctx.fillText(`-${pct}%`, 280, badgeY + 32); ctx.restore()

  ctx.save()
  roundRect(ctx, 700, badgeY, 210, 48, 24)
  ctx.fillStyle = 'rgba(0,200,80,0.15)'; ctx.fill()
  ctx.strokeStyle = 'rgba(0,200,80,0.5)'; ctx.lineWidth = 1.5; ctx.stroke()
  ctx.fillStyle = '#4ade80'; ctx.font = 'bold 22px system-ui'; ctx.textAlign = 'center'
  ctx.fillText(`¡Ahorras ${fmt(ahorro)}!`, 805, badgeY + 32); ctx.restore()

  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(0, 1020, 1080, 60)
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '22px system-ui'; ctx.textAlign = 'center'
  ctx.fillText('chocholand.com  •  @chocholandsuples', 540, 1056)

  return new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/png'))
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function TabGenerador() {
  const [offers,   setOffers]   = useState<Offer[]>([])
  const [packages, setPackages] = useState<Package[]>([])
  const [loading,  setLoading]  = useState(true)
  const [includeOfertas,  setIncludeOfertas]  = useState(true)
  const [includePaquetes, setIncludePaquetes] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [progress,   setProgress]   = useState({ current: 0, total: 0, label: '' })

  useEffect(() => {
    Promise.all([
      fetch('/api/ofertas').then(r => r.json()),
      fetch('/api/paquetes').then(r => r.json()),
    ]).then(([o, p]) => {
      setOffers(Array.isArray(o) ? o : [])
      setPackages(Array.isArray(p) ? p.filter((x: Package) => x.activo) : [])
    }).finally(() => setLoading(false))
  }, [])

  const perPage     = offers.length > 30 ? 8 : 6
  const offerPages  = Math.ceil(offers.length / perPage)
  const totalImages = (includeOfertas ? offerPages : 0) + (includePaquetes ? packages.length : 0)

  async function generate() {
    if (!totalImages) return
    setGenerating(true)
    setProgress({ current: 0, total: totalImages, label: 'Cargando logo…' })
    try {
      const logo = await loadImg(LOGO_URL)
      const zip  = new JSZip()
      let done   = 0

      if (includeOfertas && offers.length > 0) {
        const folder = zip.folder('ofertas')!
        const chunks: Offer[][] = []
        for (let i = 0; i < offers.length; i += perPage) chunks.push(offers.slice(i, i + perPage))
        for (let i = 0; i < chunks.length; i++) {
          setProgress({ current: done, total: totalImages, label: `Ofertas página ${i + 1}/${chunks.length}…` })
          const blob = await generateOfferCollage(chunks[i], i + 1, chunks.length, logo, perPage)
          folder.file(`promo_ofertas_${String(i + 1).padStart(2, '0')}.png`, blob)
          done++
          setProgress({ current: done, total: totalImages, label: `Ofertas página ${i + 1}/${chunks.length}` })
        }
      }

      if (includePaquetes && packages.length > 0) {
        const folder = zip.folder('paquetes')!
        for (const pkg of packages) {
          setProgress({ current: done, total: totalImages, label: `Paquete: ${pkg.nombre}` })
          const blob = await generatePackageImage(pkg, logo)
          folder.file(`${slug(pkg.nombre)}.png`, blob)
          done++
          setProgress({ current: done, total: totalImages, label: `Paquete: ${pkg.nombre}` })
        }
      }

      setProgress({ current: totalImages, total: totalImages, label: 'Comprimiendo ZIP…' })
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url; a.download = 'chocholand_promo.zip'; a.click()
      URL.revokeObjectURL(url)
    } finally {
      setGenerating(false)
      setProgress({ current: 0, total: 0, label: '' })
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 12, padding: '80px 0' }}>
        <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid var(--accent)',
          borderTopColor: 'transparent', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Cargando datos…</span>
      </div>
    )
  }

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
  const { month, year } = getMonthYear()

  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px' }}>
          Generador de Imágenes
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          Genera collages 1080×1080 para redes sociales. Las ofertas se agrupan en collage inteligente:
          {' '}<strong>{perPage} por imagen</strong> según tu total de {offers.length} ofertas.
          Cada página adapta el tamaño de las tarjetas al número real de productos que contiene.
          Paquetes: imagen individual por combo.
        </p>
      </div>

      {/* Selección */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
          background: 'var(--bg)', border: `1px solid ${includeOfertas ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 12, cursor: 'pointer', transition: 'border-color 0.15s' }}>
          <input type="checkbox" checked={includeOfertas} onChange={e => setIncludeOfertas(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: 'var(--accent)', cursor: 'pointer' }} />
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
              🔥 Ofertas del Mes
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
              {offers.length} oferta{offers.length !== 1 ? 's' : ''} → {offerPages} imagen{offerPages !== 1 ? 'es' : ''} ({perPage} por página)
            </p>
          </div>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px',
          background: 'var(--bg)', border: `1px solid ${includePaquetes ? '#fbbf24' : 'var(--border)'}`,
          borderRadius: 12, cursor: 'pointer', transition: 'border-color 0.15s' }}>
          <input type="checkbox" checked={includePaquetes} onChange={e => setIncludePaquetes(e.target.checked)}
            style={{ width: 18, height: 18, accentColor: '#fbbf24', cursor: 'pointer' }} />
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
              🎁 Paquetes en Oferta
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
              {packages.length} paquete{packages.length !== 1 ? 's' : ''} → {packages.length} imagen{packages.length !== 1 ? 'es' : ''} (individual)
            </p>
          </div>
        </label>
      </div>

      {/* Info footer text */}
      {!generating && (
        <div style={{ marginBottom: 20, padding: '12px 16px', background: 'var(--bg)',
          border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--text-muted)' }}>
          <p style={{ margin: 0 }}>
            📅 Las imágenes incluirán: <strong style={{ color: 'var(--text)' }}>{month} {year}</strong>
          </p>
          <p style={{ margin: '4px 0 0' }}>
            📝 Leyenda: "Estas ofertas serán válidas {month} {year} · Para respetar el precio de las promos el pago debe ser en efectivo o Transferencia"
          </p>
        </div>
      )}

      {/* Barra de progreso */}
      {generating && (
        <div style={{ marginBottom: 28, padding: '18px 20px', background: 'var(--bg)',
          border: '1px solid var(--border)', borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{progress.label || 'Generando…'}</span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{progress.current}/{progress.total}</span>
          </div>
          <div style={{ height: 8, background: 'var(--surface)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)',
              borderRadius: 4, transition: 'width 0.3s ease' }} />
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>{pct}%</p>
        </div>
      )}

      {/* Botón */}
      <button onClick={generate} disabled={generating || totalImages === 0}
        style={{ width: '100%', padding: '16px', borderRadius: 12, fontSize: 15, fontWeight: 700,
          background: totalImages > 0 && !generating ? 'linear-gradient(135deg, var(--accent), #00cc55)' : 'var(--surface)',
          color: totalImages > 0 && !generating ? '#000' : 'var(--text-muted)',
          border: 'none', cursor: totalImages > 0 && !generating ? 'pointer' : 'not-allowed',
          opacity: generating ? 0.7 : 1 }}>
        {generating
          ? `⏳ Generando imagen ${progress.current + 1} de ${progress.total}…`
          : totalImages > 0
            ? `⬇️ Generar y Descargar ZIP (${totalImages} imagen${totalImages !== 1 ? 'es' : ''})`
            : 'Selecciona al menos una categoría'}
      </button>
    </div>
  )
}
