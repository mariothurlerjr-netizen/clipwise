import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/transcript?v=VIDEO_ID
 *
 * Uses Supadata API (supadata.ai) to extract YouTube transcripts.
 * This works reliably from any server IP — no YouTube blocking issues.
 * Requires SUPADATA_API_KEY environment variable.
 */
export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get('v')

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: 'Missing or invalid v parameter' }, { status: 400 })
  }

  const apiKey = process.env.SUPADATA_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'SUPADATA_API_KEY not configured. Sign up free at supadata.ai' },
      { status: 500 },
    )
  }

  try {
    // Fetch transcript from Supadata API
    const url = `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}`
    const res = await fetch(url, {
      headers: { 'x-api-key': apiKey },
    })

    if (!res.ok) {
      const errBody = await res.text()
      return NextResponse.json(
        { error: `Supadata API error (${res.status}): ${errBody}` },
        { status: res.status },
      )
    }

    const data = await res.json()

    // data.content is array of { text, offset, duration, lang }
    // data.lang is the detected language
    const segments = data.content || []
    const language = data.lang || 'en'

    // Build plain text
    const plainText = segments.map((s: any) => s.text).join(' ')

    // Build timestamped text
    const timestampedLines = segments.map((s: any) => {
      const totalSec = Math.floor((s.offset || 0) / 1000)
      const mins = Math.floor(totalSec / 60)
      const secs = totalSec % 60
      return `[${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}] ${s.text}`
    })
    const timestampedText = timestampedLines.join('\n')

    const wordCount = plainText.split(/\s+/).filter(Boolean).length

    // Fetch video metadata from our yt-page endpoint
    const metaUrl = new URL('/api/yt-page', req.url)
    metaUrl.searchParams.set('v', videoId)
    let title = 'Unknown'
    let channel = 'Unknown'
    try {
      const metaRes = await fetch(metaUrl.toString())
      if (metaRes.ok) {
        const meta = await metaRes.json()
        title = meta.title || 'Unknown'
        channel = meta.channel || 'Unknown'
      }
    } catch {
      // metadata is optional, continue without it
    }

    return NextResponse.json(
      {
        videoId,
        title,
        channel,
        text: plainText,
        timestamped: timestampedText,
        language,
        wordCount,
        segmentCount: segments.length,
      },
      { headers: { 'Cache-Control': 'public, max-age=300' } },
    )
  } catch (error: any) {
    return NextResponse.json(
      { error: `Transcript extraction failed: ${error.message}` },
      { status: 500 },
    )
  }
}
