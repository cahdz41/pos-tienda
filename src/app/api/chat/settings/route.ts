import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-admin'

export async function PATCH(req: NextRequest) {
  const { key, value } = await req.json()
  const supabase = createAdminClient()
  await supabase.from('chat_settings').upsert({ key, value }, { onConflict: 'key' })
  return NextResponse.json({ ok: true })
}
