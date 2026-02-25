// POST /api/transcribe
// Main transcription endpoint — receives a YouTube URL and returns transcript + summary
// Uses pure JS (no Python) for Vercel compatibility

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { videoUrl, withSummary = true } = await req.json()

    if (!videoUrl) {
      return NextResponse.json({ error: 'videoUrl is required' }, { status: 400 })
    }

    // 1. Extract video ID
    const videoId = extractVideoId(videoUrl)
    if (!videoId) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 })
    }

    // 2. Authenticate user (optional)
    const supabase = createServerClient()
    let userId: string | null = null

    const authHeader = req.headers.get('authorization')
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const { data: { user } } = await supabase.auth.getUser(token)
      userId = user?.id || null
    }

    // 3. Check credits (if authenticated free user)
    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan, credits_remaining')
        .eq('id', userId)
        .single()

      if (profile && profile.plan === 'free' && profile.credits_remaining <= 0) {
        return NextResponse.json(
          { error: 'Monthly free limit reached. Upgrade to Pro for more.' },
          { status: 402 }
        )
      }
    }

    const startTime = Date.now()

    // 4. Fetch video metadata via oEmbed
    const metadata = await fetchVideoMetadata(videoId)

    // 5. Fetch transcript using YouTube captions (pure JS)
    const transcript = await fetchTranscript(videoId)

    // 6. Generate AI summary (if requested and API key available)
    let summary = null
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (withSummary && transcript.plainText && apiKey && apiKey !== 'placeholder') {
      try {
        summary = await generateSummary(transcript.plainText, metadata, apiKey)
      } catch (e) {
        console.error('Summary generation failed:', e)
      }
    }

    const processingTime = Date.now() - startTime

    // 7. Save to database (if authenticated)
    let transcriptionId = null
    if (userId) {
      const wordCount = transcript.plainText.split(/\s+/).length
      const { data } = await supabase
        .from('transcriptions')
        .insert({
          user_id: userId,
          video_id: videoId,
          video_url: videoUrl,
          title: metadata.title,
          channel_name: metadata.channel,
          duration_seconds: metadata.duration,
          thumbnail_url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          transcript_text: transcript.plainText,
          transcript_timestamped: transcript.timestampedText,
          transcript_language: transcript.language,
          is_auto_generated: transcript.isGenerated,
          word_count: wordCount,
          summary: summary,
          status: 'completed',
          processing_time_ms: processingTime,
        })
        .select('id')
        .single()

      transcriptionId = data?.id

      // Decrement credits for free users
      const { data: currentProfile } = await supabase
        .from('profiles')
        .select('credits_remaining')
        .eq('id', userId)
        .single()

      if (currentProfile && currentProfile.credits_remaining > 0) {
        await supabase
          .from('profiles')
          .update({ credits_remaining: currentProfile.credits_remaining - 1 })
          .eq('id', userId)
      }
    }

    return NextResponse.json({
      id: transcriptionId,
      videoId,
      metadata,
      transcript: {
        text: transcript.plainText,
        timestamped: transcript.timestampedText,
        language: transcript.language,
        isGenerated: transcript.isGenerated,
        wordCount: transcript.plainText.split(/\s+/).length,
      },
      summary,
      processingTimeMs: processingTime,
    })

  } catch (error: any) {
    console.error('Transcription error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}


// ── Helpers ──────────────────────────────────────────────────

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:v=|\/v\/|youtu\.be\/|\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

async function fetchVideoMetadata(videoId: string) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    )
    if (!res.ok) throw new Error('Failed to fetch metadata')
    const data = await res.json()
    return {
      title: data.title || 'Unknown',
      channel: data.author_name || 'Unknown',
      duration: 0,
      thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    }
  } catch {
    return { title: 'Unknown', channel: 'Unknown', duration: 0, thumbnailUrl: '' }
  }
}

async function fetchTranscript(videoId: string): Promise<{
  plainText: string
  timestampedText: string
  language: string
  isGenerated: boolean
}> {
  // Fetch YouTube video page to extract captions
  const videoPageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7',
    },
  })

  if (!videoPageRes.ok) {
    throw new Error('Failed to fetch YouTube video page')
  }

  const html = await videoPageRes.text()

  // Extract captions JSON from page source
  const captionsRegex = /"captionTracks":\s*(\[.*?\])/
  const captionsMatch = html.match(captionsRegex)

  if (!captionsMatch) {
    throw new Error('No captions available for this video. The video may not have subtitles.')
  }

  let tracks: any[]
  try {
    tracks = JSON.parse(captionsMatch[1])
  } catch {
    throw new Error('Failed to parse captions data')
  }

  if (!tracks || tracks.length === 0) {
    throw new Error('No caption tracks available')
  }

  // Find best caption track
  const preferredLangs = ['pt', 'en', 'es', 'fr', 'de', 'it', 'ja', 'ko', 'zh']
  let selectedTrack = tracks[0]
  let isGenerated = selectedTrack.kind === 'asr'

  // Try manual captions first
  for (const lang of preferredLangs) {
    const manual = tracks.find((t: any) => t.languageCode === lang && t.kind !== 'asr')
    if (manual) {
      selectedTrack = manual
      isGenerated = false
      break
    }
  }

  // If still on default, try auto-generated in preferred languages
  if (selectedTrack === tracks[0]) {
    for (const lang of preferredLangs) {
      const auto = tracks.find((t: any) => t.languageCode === lang)
      if (auto) {
        selectedTrack = auto
        isGenerated = auto.kind === 'asr'
        break
      }
    }
  }

  // Fetch caption XML
  const captionUrl = selectedTrack.baseUrl
  const captionRes = await fetch(captionUrl)
  if (!captionRes.ok) {
    throw new Error('Failed to fetch caption data')
  }

  const captionXml = await captionRes.text()

  // Parse XML
  const segments: Array<{ start: number; dur: number; text: string }> = []
  const segmentRegex = /<text start="([^"]+)" dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g
  let match

  while ((match = segmentRegex.exec(captionXml)) !== null) {
    const text = decodeXmlEntities(match[3]).trim()
    if (text) {
      segments.push({
        start: parseFloat(match[1]),
        dur: parseFloat(match[2]),
        text,
      })
    }
  }

  if (segments.length === 0) {
    throw new Error('No transcript segments found')
  }

  const plainText = segments.map(s => s.text).join(' ')
  const timestampedText = segments
    .map(s => {
      const mins = Math.floor(s.start / 60)
      const secs = Math.floor(s.start % 60)
      return `[${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}] ${s.text}`
    })
    .join('\n')

  return {
    plainText,
    timestampedText,
    language: selectedTrack.languageCode,
    isGenerated,
  }
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)))
    .replace(/\n/g, ' ')
}

async function generateSummary(text: string, metadata: any, apiKey: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250514',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `Analyze this YouTube video transcript and create a structured summary.

VIDEO: "${metadata.title}" by ${metadata.channel}

INSTRUCTIONS:
1. Detect the transcript language and write the summary in THE SAME language
2. Use this format:

## Key Takeaways
(3-5 bullet points with the most important insights)

## Summary
(Organized by topics discussed in the video)

## Notable Quotes
(Any memorable or impactful statements)

TRANSCRIPT (first 30000 chars):
${text.slice(0, 30000)}`
      }],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic API error: ${res.status} - ${err}`)
  }

  const data = await res.json()
  return data.content?.[0]?.text || ''
}
