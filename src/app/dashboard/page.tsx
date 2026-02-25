// Dashboard — Main user interface after login
// Shows transcription input + history of all processed videos
// Uses client-side transcript extraction to bypass YouTube server-side blocks

'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

// Types
interface TranscriptionResult {
  id: string
  videoId: string
  title: string
  channel: string
  thumbnailUrl: string
  language: string
  wordCount: number
  text: string
  timestamped: string
  summary: string | null
  createdAt: string
}

// ── Client-side YouTube transcript fetcher ───────────────────
// Fetches transcript from the user's browser (not blocked by YouTube)
async function fetchTranscriptClientSide(videoUrl: string): Promise<{
  videoId: string
  title: string
  channel: string
  text: string
  timestamped: string
  language: string
}> {
  // Extract video ID
  const idMatch = videoUrl.match(/(?:v=|\/v\/|youtu\.be\/|\/embed\/)([a-zA-Z0-9_-]{11})/)
  const videoId = idMatch?.[1]
  if (!videoId) throw new Error('Invalid YouTube URL')

  // Use a CORS proxy to fetch the YouTube page from the browser
  // We'll try multiple approaches
  let html = ''

  // Approach 1: Try fetching via our own API proxy
  try {
    const proxyRes = await fetch(`/api/yt-page?v=${videoId}`)
    if (proxyRes.ok) {
      html = await proxyRes.text()
    }
  } catch {}

  // Approach 2: If proxy doesn't work, try the AllOrigins CORS proxy
  if (!html) {
    try {
      const corsRes = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`)
      if (corsRes.ok) {
        html = await corsRes.text()
      }
    } catch {}
  }

  if (!html) {
    throw new Error('Could not fetch YouTube page. Please try again.')
  }

  // Extract video metadata
  const titleMatch = html.match(/<title>(.*?)\s*-\s*YouTube<\/title>/) || html.match(/"title":"(.*?)"/)
  const title = titleMatch?.[1]?.replace(/\\"/g, '"') || 'Unknown'

  const channelMatch = html.match(/"author":"(.*?)"/) || html.match(/"ownerChannelName":"(.*?)"/)
  const channel = channelMatch?.[1] || 'Unknown'

  // Extract caption tracks
  const captionMatch = html.match(/"captionTracks":\s*(\[.*?\])/)
  if (!captionMatch) {
    throw new Error('No captions available for this video. The video may not have subtitles enabled.')
  }

  let captionTracks: any[]
  try {
    captionTracks = JSON.parse(captionMatch[1])
  } catch {
    throw new Error('Failed to parse caption data')
  }

  if (!captionTracks || captionTracks.length === 0) {
    throw new Error('No caption tracks found')
  }

  // Select best track (prefer manual over auto-generated)
  const selectedTrack = captionTracks.find((t: any) => t.kind !== 'asr') || captionTracks[0]
  const language = selectedTrack.languageCode || 'en'

  // Fetch the actual caption XML from the baseUrl
  // The baseUrl might have escaped characters
  let captionUrl = selectedTrack.baseUrl
  if (!captionUrl) throw new Error('Caption URL not found')

  captionUrl = captionUrl.replace(/\\u0026/g, '&')

  // Fetch captions XML via our proxy
  let captionXml = ''
  try {
    const captionProxyRes = await fetch(`/api/yt-page?url=${encodeURIComponent(captionUrl)}`)
    if (captionProxyRes.ok) {
      captionXml = await captionProxyRes.text()
    }
  } catch {}

  if (!captionXml) {
    try {
      const corsRes = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(captionUrl)}`)
      if (corsRes.ok) {
        captionXml = await corsRes.text()
      }
    } catch {}
  }

  if (!captionXml) {
    throw new Error('Could not fetch caption data. Please try again.')
  }

  // Parse XML - standard format: <text start="0.0" dur="1.0">text</text>
  const segments: { text: string; offset: number }[] = []
  const textRegex = /<text\s+start="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g
  let match
  while ((match = textRegex.exec(captionXml)) !== null) {
    const offset = Math.floor(parseFloat(match[1]) * 1000)
    const text = decodeHtml(match[2].replace(/<[^>]+>/g, '').trim())
    if (text) {
      segments.push({ text, offset })
    }
  }

  // Also try srv3 format: <p t="ms" d="ms">text</p>
  if (segments.length === 0) {
    const srv3Regex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g
    while ((match = srv3Regex.exec(captionXml)) !== null) {
      const offset = parseInt(match[1])
      const text = decodeHtml(match[3].replace(/<[^>]+>/g, '').trim())
      if (text) {
        segments.push({ text, offset })
      }
    }
  }

  if (segments.length === 0) {
    throw new Error('No transcript segments could be extracted from the captions data.')
  }

  const text = segments.map(s => s.text).join(' ')
  const timestamped = segments
    .map(s => {
      const totalSec = Math.floor(s.offset / 1000)
      const mins = Math.floor(totalSec / 60)
      const secs = totalSec % 60
      return `[${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}] ${s.text}`
    })
    .join('\n')

  return { videoId, title, channel, text, timestamped, language }
}

function decodeHtml(str: string): string {
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

// ── Dashboard Component ──────────────────────────────────────

function DashboardContent() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [transcriptions, setTranscriptions] = useState<TranscriptionResult[]>([])
  const [activeTranscription, setActiveTranscription] = useState<TranscriptionResult | null>(null)
  const [activeTab, setActiveTab] = useState<'timestamped' | 'plain' | 'summary'>('timestamped')
  const [autoStarted, setAutoStarted] = useState(false)
  const searchParams = useSearchParams()

  const doTranscribe = useCallback(async (videoUrl: string) => {
    setLoading(true)
    setStatus('Fetching video page...')

    try {
      // Step 1: Extract transcript client-side
      setStatus('Extracting captions...')
      const transcript = await fetchTranscriptClientSide(videoUrl)

      setStatus('Processing transcript...')

      // Step 2: Send transcript to our API for saving/summarizing
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoUrl,
          clientTranscript: {
            videoId: transcript.videoId,
            title: transcript.title,
            channel: transcript.channel,
            text: transcript.text,
            timestamped: transcript.timestamped,
            language: transcript.language,
          },
          withSummary: true,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Server error')

      const result: TranscriptionResult = {
        id: data.id || crypto.randomUUID(),
        videoId: transcript.videoId,
        title: transcript.title,
        channel: transcript.channel,
        thumbnailUrl: `https://img.youtube.com/vi/${transcript.videoId}/mqdefault.jpg`,
        language: transcript.language,
        wordCount: transcript.text.split(/\s+/).length,
        text: transcript.text,
        timestamped: transcript.timestamped,
        summary: data.summary || null,
        createdAt: new Date().toISOString(),
      }

      setTranscriptions(prev => [result, ...prev])
      setActiveTranscription(result)
      setActiveTab(result.summary ? 'summary' : 'timestamped')
      setUrl('')
      setStatus('')
    } catch (err: any) {
      setStatus('')
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-start transcription if URL parameter is present
  useEffect(() => {
    const urlParam = searchParams.get('url')
    if (urlParam && !autoStarted) {
      setAutoStarted(true)
      setUrl(urlParam)
      doTranscribe(urlParam)
    }
  }, [searchParams, autoStarted, doTranscribe])

  async function handleTranscribe() {
    if (!url.trim()) return
    await doTranscribe(url.trim())
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
  }

  function downloadAsFile(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Nav */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <a href="/" className="text-2xl font-bold text-purple-600">ClipWise</a>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">Free Plan</span>
            <button className="rounded-lg bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-500">
              Upgrade
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Transcription Input */}
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
          <h1 className="text-2xl font-bold text-gray-900">Transcribe a video</h1>
          <p className="mt-1 text-gray-500">Paste any YouTube URL to get started</p>

          <div className="mt-6 flex gap-3">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleTranscribe()}
              placeholder="https://youtube.com/watch?v=..."
              className="flex-1 rounded-xl border border-gray-300 px-5 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              disabled={loading}
            />
            <button
              onClick={handleTranscribe}
              disabled={loading || !url.trim()}
              className="rounded-xl bg-purple-600 px-8 py-3 text-white font-semibold hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Processing...
                </span>
              ) : (
                'Transcribe'
              )}
            </button>
          </div>

          {/* Status message */}
          {status && (
            <p className="mt-3 text-sm text-purple-600 animate-pulse">{status}</p>
          )}
        </div>

        {/* Active Transcription Result */}
        {activeTranscription && (
          <div className="mt-8 bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
            <div className="flex items-start gap-6">
              <img
                src={activeTranscription.thumbnailUrl}
                alt={activeTranscription.title}
                className="w-48 rounded-lg"
              />
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-900">{activeTranscription.title}</h2>
                <p className="text-gray-500">{activeTranscription.channel}</p>
                <div className="mt-2 flex gap-3 text-sm text-gray-400">
                  <span>{activeTranscription.language.toUpperCase()}</span>
                  <span>{activeTranscription.wordCount.toLocaleString()} words</span>
                </div>

                {/* Export buttons */}
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => copyToClipboard(activeTranscription.text)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Copy Text
                  </button>
                  <button
                    onClick={() => downloadAsFile(
                      activeTranscription.timestamped,
                      `${activeTranscription.title.replace(/[^a-zA-Z0-9]/g, '_')}.txt`
                    )}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Download TXT
                  </button>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="mt-6 border-b border-gray-200">
              <div className="flex gap-6">
                {activeTranscription.summary && (
                  <button
                    onClick={() => setActiveTab('summary')}
                    className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === 'summary'
                        ? 'border-purple-600 text-purple-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    AI Summary
                  </button>
                )}
                <button
                  onClick={() => setActiveTab('timestamped')}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'timestamped'
                      ? 'border-purple-600 text-purple-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Timestamped
                </button>
                <button
                  onClick={() => setActiveTab('plain')}
                  className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'plain'
                      ? 'border-purple-600 text-purple-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Plain Text
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="mt-4 max-h-96 overflow-y-auto">
              {activeTab === 'summary' && activeTranscription.summary && (
                <div
                  className="prose prose-purple max-w-none text-gray-700 whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{
                    __html: activeTranscription.summary
                      .replace(/^## (.+)$/gm, '<h4 class="font-semibold text-gray-900 mt-4 mb-2">$1</h4>')
                      .replace(/^- (.+)$/gm, '<li class="ml-4 mb-1">$1</li>')
                  }}
                />
              )}
              {activeTab === 'timestamped' && (
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                  {activeTranscription.timestamped}
                </pre>
              )}
              {activeTab === 'plain' && (
                <p className="text-gray-700 leading-relaxed">
                  {activeTranscription.text}
                </p>
              )}
            </div>
          </div>
        )}

        {/* History */}
        <div className="mt-8">
          <h2 className="text-xl font-bold text-gray-900">Recent transcriptions</h2>

          {transcriptions.length === 0 && !loading ? (
            <div className="mt-4 text-center py-16 bg-white rounded-2xl border border-dashed border-gray-300">
              <p className="text-gray-400 text-lg">No transcriptions yet</p>
              <p className="text-gray-400 text-sm mt-1">Paste a YouTube URL above to get started</p>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {transcriptions.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setActiveTranscription(t); setActiveTab(t.summary ? 'summary' : 'timestamped'); }}
                  className={`text-left rounded-xl p-4 border transition-all hover:shadow-md ${
                    activeTranscription?.id === t.id
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex gap-3">
                    <img
                      src={t.thumbnailUrl}
                      alt={t.title}
                      className="w-24 h-14 rounded object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{t.title}</p>
                      <p className="text-xs text-gray-500 truncate">{t.channel}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(t.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-lg">Loading...</div>
      </div>
    }>
      <DashboardContent />
    </Suspense>
  )
}
