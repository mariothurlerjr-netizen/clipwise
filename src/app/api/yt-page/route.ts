// Proxy endpoint to fetch YouTube watch page with consent cookies
// Returns the HTML which contains captionTracks metadata
// The actual caption XML must be fetched client-side (YouTube blocks server-side)

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

const CONSENT_COOKIE = 'CONSENT=YES+cb.20210328-17-p0.en+FX+687; SOCS=CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjMwODI5LjA3X3AxGgJlbiACGgYIgJnOlwY'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const videoId = searchParams.get('v')

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: 'Invalid video ID' }, { status: 400 })
  }

  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': CONSENT_COOKIE,
      },
    })
    const html = await res.text()

    // Extract caption tracks from the page
    const captionMatch = html.match(/"captionTracks":\s*(\[.*?\])/)
    // Extract video title
    const titleMatch = html.match(/"title":"((?:[^"\\]|\\.)*)"/)?.[1]?.replace(/\\"/g, '"') || 'Unknown'
    // Extract channel name
    const channelMatch = html.match(/"ownerChannelName":"((?:[^"\\]|\\.)*)"/)?.[1] ||
                         html.match(/"author":"((?:[^"\\]|\\.)*)"/)?.[1] || 'Unknown'

    let captionTracks: any[] = []
    if (captionMatch) {
      try {
        captionTracks = JSON.parse(captionMatch[1])
      } catch {}
    }

    // Return structured JSON with metadata and caption URLs
    return NextResponse.json({
      videoId,
      title: titleMatch,
      channel: channelMatch,
      captionTracks: captionTracks.map((t: any) => ({
        baseUrl: t.baseUrl,
        languageCode: t.languageCode,
        kind: t.kind || 'manual',
        name: t.name?.simpleText || '',
      })),
      hasCaptions: captionTracks.length > 0,
    }, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
