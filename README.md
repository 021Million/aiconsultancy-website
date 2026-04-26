# AI Consultancy — Marketing Website

**Domain:** aiconsultancy.co.nz
**Owner:** Keira (founder)
**Purpose:** Public marketing website. Converts visitors into discovery call bookings via Calendly. No client portal, no login, no app.

---

## What this project is

A static marketing website for AI Consultancy, a done-for-you AI implementation business serving small and medium businesses globally. Plain HTML, CSS, and vanilla JavaScript — no frameworks, no build step.

The site includes a serverless backend (Netlify Functions) that handles the Calendly webhook pipeline: when a client books a discovery call, the system automatically researches their business, generates a meeting prep note using Claude, creates a Google Doc, and sends a Telegram notification.

---

## Tech stack

- **Frontend:** HTML5, CSS3, vanilla JavaScript — zero frameworks or libraries
- **Hosting:** Netlify (static site)
- **Serverless functions:** Netlify Functions (Node.js)
- **APIs used:**
  - Anthropic Claude API (claude-haiku-4-5) — meeting prep note generation
  - Google Docs API + Google Drive API — automated prep doc creation
  - Telegram Bot API — booking notifications
  - Calendly webhooks — booking trigger

---

## File structure

```
miss-ai-website/
├── index.html                         # Homepage
├── about.html                         # About page
├── services.html                      # Services page
├── ai-training.html                   # AI training page
├── contact.html                       # Contact page
├── blog.html                          # Blog/Insights index
├── blog/
│   ├── first-thing-i-look-at-when-automating.html
│   ├── four-eras-of-business-technology.html
│   ├── what-nz-businesses-ask-about-ai.html
│   └── why-i-started-ai-consultancy-nz.html
├── industries/
│   ├── healthcare.html
│   ├── education.html
│   ├── trades.html
│   ├── real-estate.html
│   ├── admin-teams.html
│   └── professional-services.html
├── css/
│   └── styles.css                     # All styles in one file
├── js/
│   └── main.js                        # Hamburger nav, dropdown, scroll animations
├── assets/
│   └── images/
├── netlify/
│   └── functions/
│       ├── calendly-webhook.js        # Main webhook pipeline
│       └── subscribe.js               # Newsletter subscribe handler
├── robots.txt
├── sitemap.xml
├── netlify.toml                       # Netlify routing config
├── vercel.json                        # Vercel function config (maxDuration: 30)
└── package.json                       # googleapis dependency
```

---

## Calendly webhook pipeline

When a client books a call via Calendly, the following runs automatically:

1. **Calendly fires a POST** to `/api/calendly-webhook`
2. **Website fetch** — the client's website is fetched and stripped to plain text (2000 char max, 5s timeout)
3. **Claude generates a prep note** — 5-section brief covering business summary, likely pain points, questions to ask, relevant AI solutions, and red flags (Haiku model, 800 token max, 15s timeout)
4. **Google Doc created** — titled "Prep Note — [Client Name] — [Date]", shared with info@realmissai.com as writer
5. **Telegram notification sent** — two messages: booking summary with doc link, then full prep note

The entire pipeline runs before the 200 response is returned to Calendly (not fire-and-forget), which prevents Vercel/Netlify from terminating the function early. maxDuration is set to 30 seconds.

---

## Environment variables required

Set these in Netlify (or Vercel) dashboard under Environment Variables:

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `GOOGLE_CLIENT_ID` | Google OAuth2 client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth2 client secret |
| `GOOGLE_REFRESH_TOKEN` | OAuth2 refresh token (obtained via one-time setup flow) |
| `GOOGLE_SHARE_EMAIL` | Email to share prep docs with (defaults to info@realmissai.com) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Telegram chat ID to receive notifications |

---

## One-time Google OAuth setup

The Google Docs integration uses OAuth2 with a stored refresh token. To get the refresh token:

1. Visit `https://aiconsultancy.co.nz/api/google-auth` in a browser while logged in as info@realmissai.com
2. Complete the Google consent screen
3. Copy the refresh token displayed on the callback page
4. Add it as `GOOGLE_REFRESH_TOKEN` in the hosting environment variables
5. Redeploy

This only needs to be done once. The refresh token does not expire unless access is revoked.

---

## Design system

**Colours**
- Background: `#ffffff`
- Alt section background: `#f8f8f6` (warm off-white)
- Text: `#111111`
- Secondary text: `#555555`
- Border: `#e5e5e5`
- Accent: `#0057FF` (hover: `#0040CC`)

**Spacing** — Fibonacci-inspired scale defined as CSS custom properties (`--sp1` through `--sp7`): 0.5, 0.875, 1.375, 2.25, 3.5, 5.75, 9.25rem

**Typography** — System font stack only, no external fonts. Fluid sizing with `clamp()`.

**Responsive breakpoints:** 480px, 768px, 1024px, 1280px. Mobile-first throughout.

---

## Brand and tone

- **Voice:** Warm, practical, calm. Not hype-driven.
- **Core message:** Practical AI for businesses that want to work smarter.
- **Avoid:** "revolutionary", "cutting-edge", "leverage", "synergy", em dashes
- **Focus on:** time saved, admin reduced, outcomes the business can measure
- **CTA:** "Book a free call" linking to `https://calendly.com/aiconsulting-keira/30min`
- **Contact:** hello@aiconsultancy.co.nz

---

## Pages summary

| Page | Purpose |
|---|---|
| `index.html` | Homepage — hero, eras timeline, how AI helps, industries, services, training, insights, trust pillars, CTA |
| `services.html` | Five services: AI audits, training, custom solutions, workflow automation, chatbots |
| `ai-training.html` | Workshop formats and who they are for |
| `about.html` | Founder story, how we work, six values |
| `contact.html` | Three contact options with Calendly links |
| `blog.html` | Insights index, newest first |
| `industries/*.html` | Six industry-specific pages, each with six AI use cases |

---

## Sitemap

All 16 pages are listed in `sitemap.xml`. Update `<lastmod>` dates when pages are significantly updated.
