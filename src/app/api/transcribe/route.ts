// POST /api/transcribe
// Main transcription endpoint — receives a YouTube URL and returns transcript + summary
// Uses youtube-transcript npm package for reliable server-side caption fetching

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { YoutubeTranscript } from 'youtube-transcript'

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

    // 5. Fetch transcript using youtube-transcript package
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
          is_auto_generated: true,
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
        isGenerated: true,
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
}> {
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId)

    if (!segments || segments.length === 0) {
      throw new Error('No transcript segments found')
    }

    const plainText = segments.map((s: any) => s.text.trim()).filter(Boolean).join(' ')

    const timestampedText = segments
      .filter((s: any) => s.text.trim())
      .map((s: any) => {
        const totalSeconds = Math.floor(s.offset / 1000)
        const mins = Math.floor(totalSeconds / 60)
        const secs = totalSeconds % 60
        return `[${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}] ${s.text.trim()}`
      })
      .join('\n')

    return {
      plainText,
      timestampedText,
      language: 'auto',
    }
  } catch (error: any) {
    throw new Error(`Failed to fetch transcript: ${error.message}. The video may not have subtitles available.`)
  }
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
