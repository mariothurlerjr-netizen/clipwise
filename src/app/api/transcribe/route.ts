// POST /api/transcribe
// Main transcription endpoint — receives a YouTube URL and returns transcript + summary
// Uses youtube-transcript npm package for reliable server-side caption fetching

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { videoUrl, clientTranscript, withSummary = true } = await req.json()

    if (!videoUrl && !clientTranscript) {
      return NextResponse.json({ error: 'videoUrl or clientTranscript is required' }, { status: 400 })
    }

    // Use client-provided transcript data if available
    const videoId = clientTranscript?.videoId || extractVideoId(videoUrl)
    if (!videoId) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 })
    }

    // Authenticate user (optional)
    const supabase = createServerClient()
    let userId: string | null = null

    const authHeader = req.headers.get('authorization')
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const { data: { user } } = await supabase.auth.getUser(token)
      userId = user?.id || null
    }

    // Check credits (if authenticated free user)
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

    // Get transcript text - either from client or try server-side
    let plainText: string
    let timestampedText: string
    let language: string
    let title: string
    let channel: string

    if (clientTranscript?.text) {
      // Client already extracted the transcript
      plainText = clientTranscript.text
      timestampedText = clientTranscript.timestamped || ''
      language = clientTranscript.language || 'auto'
      title = clientTranscript.title || 'Unknown'
      channel = clientTranscript.channel || 'Unknown'
    } else {
      // Try server-side extraction (may fail on some hosting providers)
      const metadata = await fetchVideoMetadata(videoId)
      title = metadata.title
      channel = metadata.channel

      try {
        const transcript = await fetchTranscript(videoId)
        plainText = transcript.plainText
        timestampedText = transcript.timestampedText
        language = transcript.language
      } catch (error: any) {
        return NextResponse.json(
          { error: error.message, fallbackToClient: true },
          { status: 422 }
        )
      }
    }

    // Generate AI summary (if requested and API key available)
    let summary = null
    let summaryError: string | null = null
    const geminiKey = process.env.GEMINI_API_KEY
    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (withSummary && plainText) {
      try {
        if (geminiKey && geminiKey !== 'placeholder') {
          summary = await generateSummaryGemini(plainText, { title, channel }, geminiKey)
        } else if (anthropicKey && anthropicKey !== 'placeholder') {
          summary = await generateSummary(plainText, { title, channel }, anthropicKey)
        } else {
          summaryError = 'No AI key configured (GEMINI_API_KEY or ANTHROPIC_API_KEY)'
        }
      } catch (e: any) {
        summaryError = e.message || 'Unknown summary error'
        console.error('Summary generation failed:', e)
      }
    }

    const processingTime = Date.now() - startTime
    const wordCount = plainText.split(/\s+/).length

    // Save to database (if authenticated)
    let transcriptionId = null
    if (userId) {
      const { data } = await supabase
        .from('transcriptions')
        .insert({
          user_id: userId,
          video_id: videoId,
          video_url: videoUrl,
          title,
          channel_name: channel,
          duration_seconds: 0,
          thumbnail_url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
          transcript_text: plainText,
          transcript_timestamped: timestampedText,
          transcript_language: language,
          is_auto_generated: true,
          word_count: wordCount,
          summary,
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
      metadata: { title, channel },
      transcript: {
        text: plainText,
        timestamped: timestampedText,
        language,
        wordCount,
      },
      summary,
      summaryError,
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
}> {
  // Strategy 1: Fetch captions via YouTube's timedtext API (from video page)
  const videoPageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  })

  if (!videoPageRes.ok) {
    throw new Error('Failed to load YouTube video page')
  }

  const html = await videoPageRes.text()

  // Extract caption tracks from the page HTML
  const captionMatch = html.match(/"captionTracks":\s*(\[.*?\])/)
  if (!captionMatch) {
    // Try alternative: check for playerCaptionsTracklistRenderer
    const altMatch = html.match(/playerCaptionsTracklistRenderer.*?"captionTracks":\s*(\[.*?\])/)
    if (!altMatch) {
      throw new Error('No captions available for this video. The video may not have subtitles.')
    }
  }

  const captionTracksJson = captionMatch ? captionMatch[1] : ''
  let captionTracks: any[]

  try {
    captionTracks = JSON.parse(captionTracksJson)
  } catch {
    throw new Error('Failed to parse caption tracks data')
  }

  if (!captionTracks || captionTracks.length === 0) {
    throw new Error('No caption tracks found for this video')
  }

  // Prefer manual captions, fallback to auto-generated
  let selectedTrack = captionTracks.find((t: any) => t.kind !== 'asr') || captionTracks[0]
  const captionUrl = selectedTrack.baseUrl

  if (!captionUrl) {
    throw new Error('Caption URL not found')
  }

  // Fetch the actual caption XML
  const captionRes = await fetch(captionUrl + '&fmt=srv3', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  })

  if (!captionRes.ok) {
    throw new Error('Failed to fetch caption data')
  }

  const captionXml = await captionRes.text()

  // Parse XML caption segments - format: <p t="startMs" d="durationMs">text</p>
  // srv3 format uses <p> tags, standard format uses <text> tags
  const segments: { text: string; offset: number; duration: number }[] = []

  // Try srv3 format first (<p t= d=>) then standard (<text start= dur=>)
  const srv3Regex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g
  const stdRegex = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g

  let match
  let isSrv3 = false

  // Try srv3 first
  while ((match = srv3Regex.exec(captionXml)) !== null) {
    isSrv3 = true
    const offset = parseInt(match[1])
    const duration = parseInt(match[2])
    const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, '').trim())
    if (text) {
      segments.push({ text, offset, duration })
    }
  }

  // Fallback to standard format
  if (!isSrv3) {
    while ((match = stdRegex.exec(captionXml)) !== null) {
      const offset = Math.floor(parseFloat(match[1]) * 1000)
      const duration = Math.floor(parseFloat(match[2]) * 1000)
      const text = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, '').trim())
      if (text) {
        segments.push({ text, offset, duration })
      }
    }
  }

  if (segments.length === 0) {
    throw new Error('No transcript segments could be extracted')
  }

  const plainText = segments.map(s => s.text).join(' ')

  const timestampedText = segments
    .map(s => {
      const totalSeconds = Math.floor(s.offset / 1000)
      const mins = Math.floor(totalSeconds / 60)
      const secs = totalSeconds % 60
      return `[${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}] ${s.text}`
    })
    .join('\n')

  const language = selectedTrack.languageCode || 'auto'

  return { plainText, timestampedText, language }
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(parseInt(code)))
}

async function generateSummaryGemini(text: string, metadata: any, apiKey: string): Promise<string> {
  const prompt = `Analyze this YouTube video transcript and create a structured summary.

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

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 2048 },
      }),
    },
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini API error: ${res.status} - ${err}`)
  }

  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
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
