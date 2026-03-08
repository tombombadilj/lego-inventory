import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractSetNumbers } from '@/lib/ocr'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('image') as File
  if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 })

  const imageBytes = Buffer.from(await file.arrayBuffer()).toString('base64')

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_CLOUD_VISION_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: imageBytes },
          features: [{ type: 'TEXT_DETECTION' }],
        }],
      }),
    }
  )

  if (!response.ok) {
    return NextResponse.json({ error: 'OCR service unavailable' }, { status: 502 })
  }

  const data = await response.json()
  const fullText = data.responses?.[0]?.fullTextAnnotation?.text ?? ''
  const setNumbers = extractSetNumbers(fullText)

  return NextResponse.json({ setNumbers, rawText: fullText })
}
