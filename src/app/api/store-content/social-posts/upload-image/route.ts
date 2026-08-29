import { v2 as cloudinary } from 'cloudinary'
import { NextRequest, NextResponse } from 'next/server'
import { requireOwner } from '@/lib/ownerApiAuth'

export const dynamic = 'force-dynamic'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// Sube la imagen final (después del overlay de logo/gancho/precio hecho en
// canvas en el navegador). Carpeta separada de /api/cloudinary, que es del
// flujo de fotos de producto del POS y no debe mezclarse con estos posts.
export async function POST(request: NextRequest) {
  const auth = await requireOwner(request)
  if (!auth.ok) return auth.response

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64 = buffer.toString('base64')
    const dataURI = `data:${file.type};base64,${base64}`

    const result = await cloudinary.uploader.upload(dataURI, {
      folder: 'pos-tienda/social-posts',
      resource_type: 'image',
      use_filename: false,
      unique_filename: true,
      overwrite: false,
    })

    return NextResponse.json({ success: true, url: result.secure_url, publicId: result.public_id })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al subir la imagen'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
