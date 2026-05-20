# Ephemera — real talk, no trace

A real-time ephemeral chat platform. No accounts. No AI. No history kept after 24 hours. Text only. Max 10 people per room. Group chats based on today's trending topics and your location. A place too talk to anyone.

---

## What it does

- **Instant anonymous identity** — you get a random name (e.g. `SilentFox42`) when you connect. No signup.
- **Location-based rooms** — rooms are tagged to your country. You see rooms from your region + global rooms.
- **Trending topic rooms** — rooms are seeded with real topics relevant to your location (South Africa, Nigeria, Kenya, UK, US, Global).
- **Duplicate rooms allowed** — multiple rooms can share the same topic. Join whichever has people you vibe with.
- **10-person cap** — once a room hits 10, it shows as full.
- **No history on join** — you only see messages from the moment you arrive.
- **24-hour auto-wipe** — empty rooms are deleted after 24 hours of inactivity.
- **Text only** — no images, no files, no links rendered as embeds. Just words.

---

## Setup (5 minutes)

### Prerequisites
- Node.js 18+ installed ([nodejs.org](https://nodejs.org))

### Install and run locally

```bash
# 1. Go into the project folder
cd ephemera

# 2. Install dependencies
npm install

# 3. Start the server
npm start
```

Open your browser at **http://localhost:3000**

To run in development mode with auto-restart:
```bash
npm run dev
```

---

## Deploy to the internet (free)

### Option A — Railway (easiest, free tier)
1. Push this folder to a GitHub repo
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select your repo → it auto-detects Node.js and deploys
4. You get a live URL like `https://ephemera-production.up.railway.app`

### Option B — Render (free)
1. Push to GitHub
2. [render.com](https://render.com) → New Web Service → connect repo
3. Build command: `npm install`
4. Start command: `node server.js`
5. Free tier works fine for up to ~100 concurrent users

### Option C — Fly.io (free tier, more control)
```bash
npm install -g flyctl
fly launch
fly deploy
```

---

## How to add real trending topics

Right now topics are hardcoded in `server.js` in the `TRENDING` object. To make them actually live:

**Option 1 — Google Trends RSS (free, no API key)**
```js
// Add this to server.js — runs every 6 hours
const https = require('https');
async function fetchTrends(geo = 'ZA') {
  return new Promise((res, rej) => {
    https.get(`https://trends.google.com/trends/trendingsearches/daily/rss?geo=${geo}`, (r) => {
      let data = '';
      r.on('data', d => data += d);
      r.on('end', () => {
        const matches = data.match(/<title><!\[CDATA\[(.+?)\]\]><\/title>/g) || [];
        res(matches.map(m => m.replace(/<[^>]+>/g,'').replace(/\[CDATA\[|\]\]/g,'')).slice(1,15));
      });
    }).on('error', rej);
  });
}
setInterval(async () => {
  TRENDING['ZA'] = await fetchTrends('ZA');
  TRENDING['NG'] = await fetchTrends('NG');
  TRENDING['US'] = await fetchTrends('US');
  TRENDING['GB'] = await fetchTrends('GB');
}, 6 * 60 * 60 * 1000);
```

**Option 2 — Twitter/X API** (paid, $100/month basic tier)
**Option 3 — NewsAPI** (free 100 req/day) — pull top headlines per country

---

## Monetization ideas

Once you have users, here's how to make money:

| Model | How | Price |
|-------|-----|-------|
| **Room sponsorships** | Brands pay to have their name on a topic room during a news event | R500–R2000/day |
| **Premium rooms** | Password-protected rooms for teams or communities | R29/month per group |
| **White-label** | Sell a customized version to companies for internal use | R5000–R20000 once-off |
| **Verified rooms** | Journalists, brands pay to have a verified badge | R99/month |

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Real-time messaging | Socket.io |
| Server | Node.js + Express |
| Frontend | Vanilla HTML/CSS/JS (no framework) |
| State | In-memory only (no database by design) |
| Hosting | Any Node.js host (Railway, Render, Fly.io) |

No database needed. Everything lives in memory. That's the point.

---

## File structure

```
ephemera/
├── server.js          ← Node.js server (Socket.io + Express)
├── package.json       ← Dependencies
├── README.md          ← This file
└── public/
    └── index.html     ← Complete frontend (single file)
```

---

*Built with vibe coding. No AI in the chat rooms — just people.*
