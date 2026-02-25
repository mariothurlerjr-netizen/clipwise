// Dashboard — Main user interface after login
// Shows transcription input + history of all processed videos

'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

// Types
interface Transcription {
  id: string
  video_id: string
  title: string
  channel_name: string
  thumbnail_url: string
  transcript_language: string
  word_count: number
  summary: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  created_at: string
}

interface UserProfile {
  full_name: string
  plan: string
  credits_remaining: number
  total_videos_processed: number
}

function DashboardContent() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([])
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [activeTranscription, setActiveTranscription] = useState<Transcription | null>(null)
  const [autoStarted, setAutoStarted] = useState(false)
  const searchParams = useSearchParams()

  const doTranscribe = useCallback(async (videoUrl: string) => {
    setLoading(true)
    try {
      const res = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl, withSummary: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const newItem: Transcription = {
        id: data.id || crypto.randomUUID(),
        video_id: data.videoId,
        title: data.metadata.title,
        channel_name: data.metadata.channel,
        thumbnail_url: `https://img.youtube.com/vi/${data.videoId}/mqdefault.jpg`,
        transcript_language: data.transcript.language,
        word_count: data.transcript.wordCount,
        summary: data.summary,
        status: 'completed',
        created_at: new Date().toISOString(),
      }
      setTranscriptions(prev => [newItem, ...prev])
      setActiveTranscription(newItem)
      setUrl('')
    } catch (err: any) {
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Nav */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <a href="/" className="text-2xl font-bold text-purple-600">ClipWise</a>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              {profile?.plan === 'free' ? `${profile.credits_remaining} credits left` : profile?.plan?.toUpperCase() || 'Free'}
            </span>
            <button className="rounded-lg bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-500">
              Upgrade
            </button>
            <div className="w-8 h-8 rounded-full bg-purple-200 flex items-center justify-center text-sm font-bold text-purple-700">
              {profile?.full_name?.[0] || 'U'}
            </div>
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
        </div>

        {/* Active Transcription Result */}
        {activeTranscription && (
          <div className="mt-8 bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
            <div className="flex items-start gap-6">
              <img
                src={activeTranscription.thumbnail_url}
                alt={activeTranscription.title}
                className="w-48 rounded-lg"
              />
              <div className="flex-1">
                <h2 className="text-xl font-bold text-gray-900">{activeTranscription.title}</h2>
                <p className="text-gray-500">{activeTranscription.channel_name}</p>
                <div className="mt-2 flex gap-3 text-sm text-gray-400">
                  <span>{activeTranscription.transcript_language.toUpperCase()}</span>
                  <span>{activeTranscription.word_count.toLocaleString()} words</span>
                </div>

                {/* Export buttons */}
                <div className="mt-4 flex gap-2">
                  <button className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    Copy Text
                  </button>
                  <button className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    Download TXT
                  </button>
                  <button className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                    Download PDF
                  </button>
                </div>
              </div>
            </div>

            {/* Summary */}
            {activeTranscription.summary && (
              <div className="mt-6 prose prose-purple max-w-none">
                <h3 className="text-lg font-semibold text-gray-900">AI Summary</h3>
                <div
                  className="mt-2 text-gray-700 whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{
                    __html: activeTranscription.summary
                      .replace(/^## (.+)$/gm, '<h4 class="font-semibold text-gray-900 mt-4">$1</h4>')
                      .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
                  }}
                />
              </div>
            )}
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
                  onClick={() => setActiveTranscription(t)}
                  className={`text-left rounded-xl p-4 border transition-all hover:shadow-md ${
                    activeTranscription?.id === t.id
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="flex gap-3">
                    <img
                      src={t.thumbnail_url}
                      alt={t.title}
                      className="w-24 h-14 rounded object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{t.title}</p>
                      <p className="text-xs text-gray-500 truncate">{t.channel_name}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(t.created_at).toLocaleDateString()}
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
