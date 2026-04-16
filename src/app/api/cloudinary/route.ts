import { v2 as cloudinary } from 'cloudinary'
import { NextRequest, NextResponse } from 'next/server'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó archivo' }, { status: 400 })
    }

    const bytes  = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64 = buffer.toString('base64')
    const dataURI = `data:${file.type};base64,${base64}`

    const result = await cloudinary.uploader.upload(dataURI, {
      folder: 'pos-tienda/productos',
      transformation: [
        {
          width: 600,
          height: 600,
          crop: 'fill',
          quality: 80,
          format: 'webp',
        },
      ],
      resource_type: 'image',
      use_filename: false,
      unique_filename: true,
      overwrite: false,
    })

    return NextResponse.json({ success: true, url: result.secure_url, publicId: result.public_id })
  } catch (error: any) {
    const msg = error?.message || error?.error?.message || 'Error al subir la imagen'
    console.error('Error Cloudinary:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
