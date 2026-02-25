// Proxy endpoint to fetch YouTube pages/captions
// This runs on Vercel's Edge Runtime (Cloudflare network) which has different IPs
// than standard Node.js serverless functions

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  // Either fetch a specific URL (for captions) or a video page
  const directUrl = searchParams.get('url')
  const videoId = searchParams.get('v')

  const targetUrl = directUrl || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null)

  if (!targetUrl) {
    return new NextResponse('Missing v or url parameter', { status: 400 })
  }

  // Only allow youtube.com URLs
  try {
    const parsed = new URL(targetUrl)
    if (!parsed.hostname.endsWith('youtube.com') && !parsed.hostname.endsWith('youtube-nocookie.com')) {
      return new NextResponse('Only YouTube URLs allowed', { status: 403 })
    }
  } catch {
    return new NextResponse('Invalid URL', { status: 400 })
  }

  try {
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })

    const text = await res.text()

    return new NextResponse(text, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'text/html',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error: any) {
    return new NextResponse(`Fetch error: ${error.message}`, { status: 500 })
  }
}
