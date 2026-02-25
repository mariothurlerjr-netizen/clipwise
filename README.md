# ClipWise — AI YouTube Transcription & Smart Summaries

> Transcribe any YouTube video in seconds. Get AI-powered summaries with key insights. 100+ languages.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Styling | Tailwind CSS |
| Auth + DB | Supabase (PostgreSQL + Auth) |
| Payments | Stripe + Mercado Pago |
| AI Summaries | Claude API (Anthropic) |
| Transcription | youtube-transcript-api (Python) |
| Deploy | Vercel (recommended) |
| i18n | next-intl (EN + PT-BR) |

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/your-user/clipwise.git
cd clipwise
npm install
pip install youtube-transcript-api yt-dlp anthropic
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run the schema: go to SQL Editor and paste contents of `supabase/schema.sql`
3. Enable Auth providers: Google, GitHub (in Authentication > Providers)
4. Copy your project URL and keys

### 3. Set up Stripe

1. Create account at [stripe.com](https://stripe.com)
2. Create two products:
   - **Pro** ($9/month) — copy the Price ID
   - **Business** ($29/month) — copy the Price ID
3. Set up webhook endpoint: `https://your-domain.com/api/webhooks`
   - Events: `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`

### 4. Set up Mercado Pago (optional, for Brazil)

1. Create account at [mercadopago.com.br](https://www.mercadopago.com.br/developers)
2. Get your Access Token and Public Key

### 5. Configure environment

```bash
cp .env.example .env.local
# Fill in all the values
```

### 6. Run locally

```bash
npm run dev
# Open http://localhost:3000
```

### 7. Deploy to Vercel

```bash
npx vercel
# Or connect GitHub repo at vercel.com
```

## Project Structure

```
clipwise/
├── src/
│   ├── app/
│   │   ├── (marketing)/page.tsx    # Landing page (SEO optimized)
│   │   ├── login/page.tsx          # Auth page (OAuth + magic link)
│   │   ├── dashboard/page.tsx      # Main dashboard with history
│   │   ├── api/
│   │   │   ├── transcribe/route.ts # Transcription endpoint
│   │   │   ├── auth/route.ts       # Auth callback
│   │   │   └── webhooks/route.ts   # Stripe webhooks
│   │   ├── layout.tsx              # Root layout with SEO
│   │   └── globals.css
│   ├── lib/
│   │   └── supabase.ts             # Supabase client helpers
│   └── i18n/
│       ├── en.json                 # English translations
│       └── pt.json                 # Portuguese translations
├── supabase/
│   └── schema.sql                  # Full database schema with RLS
├── package.json
├── next.config.js
├── tailwind.config.ts
└── .env.example
```

## Pricing Model

| Plan | Price | Videos/month | Features |
|------|-------|-------------|----------|
| Free | $0 | 3 | Basic transcription, TXT export |
| Pro | $9/mo | 50 | AI summaries, timestamps, PDF/DOCX export |
| Business | $29/mo | Unlimited | Channel monitoring, alerts, API access |

## SEO Features

- Server-side rendered landing page
- OpenGraph + Twitter Card meta tags
- Structured data (JSON-LD)
- Multi-language (hreflang) support
- Semantic HTML throughout
- Fast Core Web Vitals (Vercel Edge)

## Roadmap

- [x] Core transcription engine
- [x] Landing page with SEO
- [x] Auth (Google, GitHub, Magic Link)
- [x] Dashboard with history
- [x] Stripe payments
- [x] Multi-language (EN + PT-BR)
- [ ] Mercado Pago integration
- [ ] Channel monitoring (auto-transcribe new videos)
- [ ] Email/Telegram/WhatsApp notifications
- [ ] Chrome extension
- [ ] API for developers
- [ ] Notion integration

## License

MIT
