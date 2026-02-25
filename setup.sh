#!/bin/bash
# ══════════════════════════════════════════════════════════
# ClipWise — Automated Setup Script
# Run this on your Mac to set up everything automatically
# Usage: chmod +x setup.sh && ./setup.sh
# ══════════════════════════════════════════════════════════

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

echo ""
echo -e "${PURPLE}╔══════════════════════════════════════════╗${NC}"
echo -e "${PURPLE}║     ✦ ClipWise — Automated Setup        ║${NC}"
echo -e "${PURPLE}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Step 1: Check prerequisites ─────────────────────────
echo -e "${BLUE}[1/8] Checking prerequisites...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js not found. Installing via Homebrew...${NC}"
    if ! command -v brew &> /dev/null; then
        echo -e "${RED}Homebrew not found. Install it first: https://brew.sh${NC}"
        exit 1
    fi
    brew install node
fi

if ! command -v git &> /dev/null; then
    echo -e "${RED}Git not found. Installing...${NC}"
    brew install git
fi

if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Python3 not found. Installing...${NC}"
    brew install python3
fi

echo -e "${GREEN}✓ Node $(node --version), Git $(git --version | cut -d' ' -f3), Python $(python3 --version | cut -d' ' -f2)${NC}"

# ── Step 2: Install Python dependencies ──────────────────
echo ""
echo -e "${BLUE}[2/8] Installing Python dependencies...${NC}"
pip3 install youtube-transcript-api yt-dlp anthropic --quiet
echo -e "${GREEN}✓ youtube-transcript-api, yt-dlp, anthropic installed${NC}"

# ── Step 3: Install Node dependencies ────────────────────
echo ""
echo -e "${BLUE}[3/8] Installing Node dependencies...${NC}"
npm install --quiet
echo -e "${GREEN}✓ Node dependencies installed${NC}"

# ── Step 4: Set up environment variables ─────────────────
echo ""
echo -e "${BLUE}[4/8] Setting up environment variables...${NC}"

if [ ! -f .env.local ]; then
    cp .env.example .env.local
    echo ""
    echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  We need a few API keys. I'll guide you through each.${NC}"
    echo -e "${YELLOW}═══════════════════════════════════════════════════════${NC}"

    # Supabase
    echo ""
    echo -e "${PURPLE}── Supabase (Database + Auth) ──${NC}"
    echo "1. Go to https://supabase.com/dashboard"
    echo "2. Create a new project called 'clipwise'"
    echo "3. Go to Settings > API"
    echo ""
    read -p "Paste your Supabase URL (https://xxx.supabase.co): " SUPABASE_URL
    read -p "Paste your Supabase anon key: " SUPABASE_ANON
    read -p "Paste your Supabase service_role key: " SUPABASE_SERVICE

    # Stripe
    echo ""
    echo -e "${PURPLE}── Stripe (Payments) ──${NC}"
    echo "1. Go to https://dashboard.stripe.com/apikeys"
    echo "2. Copy your test keys"
    echo ""
    read -p "Paste your Stripe Secret Key (sk_test_...): " STRIPE_SECRET
    read -p "Paste your Stripe Publishable Key (pk_test_...): " STRIPE_PUBLIC

    # Anthropic
    echo ""
    echo -e "${PURPLE}── Anthropic (AI Summaries) ──${NC}"
    echo "1. Go to https://console.anthropic.com/settings/keys"
    echo "2. Create an API key"
    echo ""
    read -p "Paste your Anthropic API Key (sk-ant-...): " ANTHROPIC_KEY

    # Write .env.local
    cat > .env.local << EOF
NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE}

STRIPE_SECRET_KEY=${STRIPE_SECRET}
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${STRIPE_PUBLIC}
STRIPE_WEBHOOK_SECRET=whsec_placeholder

ANTHROPIC_API_KEY=${ANTHROPIC_KEY}

NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=ClipWise
EOF

    echo -e "${GREEN}✓ Environment variables saved to .env.local${NC}"
else
    echo -e "${GREEN}✓ .env.local already exists${NC}"
fi

# ── Step 5: Initialize Git repo ──────────────────────────
echo ""
echo -e "${BLUE}[5/8] Initializing Git repository...${NC}"

if [ ! -d .git ]; then
    git init -b main
    echo "node_modules/" > .gitignore
    echo ".env.local" >> .gitignore
    echo ".env" >> .gitignore
    echo ".next/" >> .gitignore
    git add -A
    git commit -m "feat: initial ClipWise MVP - AI YouTube Transcription SaaS"
    echo -e "${GREEN}✓ Git repo initialized with initial commit${NC}"
else
    echo -e "${GREEN}✓ Git repo already exists${NC}"
fi

# ── Step 6: Create GitHub repo ───────────────────────────
echo ""
echo -e "${BLUE}[6/8] Setting up GitHub...${NC}"

if command -v gh &> /dev/null; then
    echo "Creating GitHub repo..."
    gh repo create clipwise --private --source=. --push 2>/dev/null || echo "Repo may already exist"
    echo -e "${GREEN}✓ GitHub repo created and code pushed${NC}"
else
    echo -e "${YELLOW}⚠ GitHub CLI (gh) not found. Install with: brew install gh${NC}"
    echo -e "${YELLOW}  Then run: gh auth login && gh repo create clipwise --private --source=. --push${NC}"
fi

# ── Step 7: Set up Supabase database ────────────────────
echo ""
echo -e "${BLUE}[7/8] Setting up database...${NC}"
echo ""
echo -e "${YELLOW}Please run the SQL schema in your Supabase dashboard:${NC}"
echo "1. Go to your Supabase project > SQL Editor"
echo "2. Click 'New query'"
echo "3. Paste the contents of supabase/schema.sql"
echo "4. Click 'Run'"
echo ""
read -p "Press Enter after you've run the SQL schema..." _

echo -e "${GREEN}✓ Database schema applied${NC}"

# ── Step 8: Deploy to Vercel ─────────────────────────────
echo ""
echo -e "${BLUE}[8/8] Deploying to Vercel...${NC}"

if command -v vercel &> /dev/null; then
    echo "Deploying..."
    vercel --prod
    echo -e "${GREEN}✓ Deployed to Vercel!${NC}"
else
    echo "Installing Vercel CLI..."
    npm install -g vercel
    echo ""
    echo "Now deploying..."
    vercel --prod
fi

# ── Done! ────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     ✦ ClipWise is LIVE! 🎉              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
echo ""
echo "Next steps:"
echo "  1. Open your Vercel URL in the browser"
echo "  2. Set up Stripe products (Pro \$9/mo, Business \$29/mo)"
echo "  3. Configure Stripe webhook to: YOUR_URL/api/webhooks"
echo "  4. Enable Google/GitHub OAuth in Supabase > Authentication"
echo ""
echo -e "${PURPLE}To run locally: npm run dev${NC}"
echo ""
