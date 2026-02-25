// ClipWise — Landing Page (SEO optimized)
// src/app/(marketing)/page.tsx

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LandingPage() {
  return (
    <main>
      <HeroSection />
      <HowItWorks />
      <FeaturesSection />
      <PricingSection />
      <TestimonialsSection />
      <CTASection />
    </main>
  )
}

// ── Hero Section ──────────────────────────────────────────────
function HeroSection() {
  const [url, setUrl] = useState('')
  const router = useRouter()

  function handleTranscribe() {
    if (url.trim()) {
      router.push(`/dashboard?url=${encodeURIComponent(url.trim())}`)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white">
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-20" />
      <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:py-40">
        <div className="text-center">
          <h1 className="text-5xl font-bold tracking-tight sm:text-7xl">
            Turn any YouTube video into
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              {' '}actionable insights
            </span>
          </h1>
          <p className="mt-6 text-lg leading-8 text-gray-300 max-w-2xl mx-auto">
            Paste a link. Get an AI-powered transcript with smart summaries,
            key takeaways, and timestamps — in seconds, not hours.
            Supports 100+ languages.
          </p>

          {/* URL Input */}
          <div className="mt-10 flex items-center justify-center gap-x-2 max-w-xl mx-auto">
            <div className="flex-1 relative">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTranscribe()}
                placeholder="Paste YouTube URL here..."
                className="w-full rounded-xl border-0 bg-white/10 backdrop-blur px-6 py-4 text-white placeholder:text-gray-400 focus:ring-2 focus:ring-purple-500 text-lg"
              />
            </div>
            <button
              onClick={handleTranscribe}
              className="rounded-xl bg-purple-600 px-8 py-4 text-lg font-semibold text-white hover:bg-purple-500 transition-colors whitespace-nowrap"
            >
              Transcribe Free
            </button>
          </div>

          <p className="mt-4 text-sm text-gray-400">
            No credit card required · 3 free transcriptions per month
          </p>

          {/* Social proof */}
          <div className="mt-12 flex items-center justify-center gap-8 text-sm text-gray-400">
            <span>50,000+ videos transcribed</span>
            <span>100+ languages</span>
            <span>4.9/5 rating</span>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── How It Works ──────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { num: '1', title: 'Paste the URL', desc: 'Copy any YouTube video link and paste it into ClipWise.' },
    { num: '2', title: 'AI Transcribes', desc: 'Our AI extracts the transcript with timestamps in seconds.' },
    { num: '3', title: 'Get Smart Summary', desc: 'Receive an organized summary with key points and insights.' },
  ]

  return (
    <section id="how-it-works" className="py-24 bg-white">
      <div className="mx-auto max-w-7xl px-6">
        <h2 className="text-3xl font-bold text-center text-gray-900 sm:text-4xl">
          How it works
        </h2>
        <p className="mt-4 text-center text-lg text-gray-600">
          Three simple steps to unlock any video&apos;s content
        </p>

        <div className="mt-16 grid grid-cols-1 gap-12 sm:grid-cols-3">
          {steps.map((step) => (
            <div key={step.num} className="text-center">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-purple-100 flex items-center justify-center text-2xl font-bold text-purple-600">
                {step.num}
              </div>
              <h3 className="mt-6 text-xl font-semibold text-gray-900">{step.title}</h3>
              <p className="mt-2 text-gray-600">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Features ──────────────────────────────────────────────────
function FeaturesSection() {
  const features = [
    { title: 'AI Smart Summaries', desc: 'Not just transcription — get executive summaries, key takeaways, and actionable insights from every video.' },
    { title: 'Timestamps', desc: 'Navigate directly to the moments that matter with precise timestamps throughout the transcript.' },
    { title: '100+ Languages', desc: 'Auto-detect and transcribe videos in Portuguese, English, Spanish, French, and 100+ more languages.' },
    { title: 'Video History', desc: 'All your transcriptions saved in one place. Search, filter, and revisit anytime from your dashboard.' },
    { title: 'Channel Monitor', desc: 'Subscribe to YouTube channels and get auto-transcriptions of new videos delivered to your inbox.' },
    { title: 'Export Anywhere', desc: 'Download as PDF, TXT, or DOCX. Send to Notion, Google Docs, or your email with one click.' },
  ]

  return (
    <section id="features" className="py-24 bg-gray-50">
      <div className="mx-auto max-w-7xl px-6">
        <h2 className="text-3xl font-bold text-center text-gray-900 sm:text-4xl">
          Everything you need to master video content
        </h2>

        <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl bg-white p-8 shadow-sm hover:shadow-md transition-shadow">
              <h3 className="text-xl font-semibold text-gray-900">{f.title}</h3>
              <p className="mt-2 text-gray-600">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Pricing ──────────────────────────────────────────────────
function PricingSection() {
  const plans = [
    {
      name: 'Free',
      price: '$0',
      period: 'forever',
      desc: 'Get started with basic transcriptions',
      features: ['3 videos/month', 'Basic transcription', 'Text export (TXT)', 'Community support'],
      cta: 'Start Free',
      popular: false,
    },
    {
      name: 'Pro',
      price: '$9',
      period: '/month',
      desc: 'For content creators and researchers',
      features: ['50 videos/month', 'AI Smart Summaries', 'Timestamps', 'Export PDF/DOCX/TXT', 'Video history', 'Priority support'],
      cta: 'Start 7-day Free Trial',
      popular: true,
    },
    {
      name: 'Business',
      price: '$29',
      period: '/month',
      desc: 'For teams and power users',
      features: ['Unlimited videos', 'Everything in Pro', 'Channel monitoring', 'Email/Telegram alerts', 'API access', 'Dedicated support'],
      cta: 'Start 7-day Free Trial',
      popular: false,
    },
  ]

  return (
    <section id="pricing" className="py-24 bg-white">
      <div className="mx-auto max-w-7xl px-6">
        <h2 className="text-3xl font-bold text-center text-gray-900 sm:text-4xl">
          Simple, transparent pricing
        </h2>
        <p className="mt-4 text-center text-lg text-gray-600">
          Start free. Upgrade when you need more.
        </p>

        <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-3 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-2xl p-8 ${
                plan.popular
                  ? 'bg-purple-600 text-white ring-4 ring-purple-600 ring-offset-2 scale-105'
                  : 'bg-gray-50 text-gray-900'
              }`}
            >
              {plan.popular && (
                <span className="inline-block rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700 mb-4">
                  Most Popular
                </span>
              )}
              <h3 className="text-2xl font-bold">{plan.name}</h3>
              <div className="mt-4">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className={plan.popular ? 'text-purple-200' : 'text-gray-500'}>
                  {plan.period}
                </span>
              </div>
              <p className={`mt-2 text-sm ${plan.popular ? 'text-purple-200' : 'text-gray-500'}`}>
                {plan.desc}
              </p>
              <ul className="mt-8 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <span>-</span> {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/dashboard"
                className={`mt-8 block w-full rounded-xl py-3 font-semibold transition-colors text-center ${
                  plan.popular
                    ? 'bg-white text-purple-600 hover:bg-gray-100'
                    : 'bg-purple-600 text-white hover:bg-purple-500'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-gray-500">
          All prices in USD. Also available in BRL via Mercado Pago.
          Cancel anytime. 7-day money-back guarantee.
        </p>
      </div>
    </section>
  )
}

// ── Testimonials ──────────────────────────────────────────────
function TestimonialsSection() {
  const testimonials = [
    { name: 'Sarah K.', role: 'Content Creator', text: 'ClipWise saves me hours every week. I use it to research video content and the AI summaries are incredibly accurate.' },
    { name: 'Pedro M.', role: 'Researcher', text: 'I monitor 15 YouTube channels for my PhD research. The auto-transcription feature is a game-changer.' },
    { name: 'Alex T.', role: 'Marketing Manager', text: 'We use ClipWise to transcribe competitor videos and extract key messaging. The multilingual support is fantastic.' },
  ]

  return (
    <section className="py-24 bg-gray-50">
      <div className="mx-auto max-w-7xl px-6">
        <h2 className="text-3xl font-bold text-center text-gray-900 sm:text-4xl">
          Loved by creators and researchers
        </h2>

        <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {testimonials.map((t) => (
            <div key={t.name} className="rounded-2xl bg-white p-8 shadow-sm">
              <p className="text-gray-600 italic">&quot;{t.text}&quot;</p>
              <div className="mt-6">
                <p className="font-semibold text-gray-900">{t.name}</p>
                <p className="text-sm text-gray-500">{t.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Final CTA ──────────────────────────────────────────────────
function CTASection() {
  return (
    <section className="py-24 bg-gradient-to-br from-purple-600 to-purple-800 text-white">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <h2 className="text-3xl font-bold sm:text-5xl">
          Stop watching. Start reading.
        </h2>
        <p className="mt-6 text-lg text-purple-200">
          Join thousands of creators, researchers, and professionals who save
          hours every week with ClipWise.
        </p>
        <Link
          href="/dashboard"
          className="mt-10 inline-block rounded-xl bg-white px-10 py-4 text-lg font-semibold text-purple-700 hover:bg-gray-100 transition-colors"
        >
          Start Free — No Credit Card Required
        </Link>
      </div>
    </section>
  )
}
