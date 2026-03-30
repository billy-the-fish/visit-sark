# Visit Sark

A Progressive Web App (PWA) for booking activities on Sark, Islands of Guernsey.

Book ferry crossings, the Toast Rack Tractor Bus, carriage rides, bike hire, adventures, dining and more — all in one place.

## Project Structure

```
visit-sark/
├── index.html           # Customer-facing PWA (main app)
├── operator.html        # Bus & activity operator — scan QR tickets
├── boat-operator.html   # Ferry & boat operator — passenger manifest + QR scan
├── admin.html           # Central management dashboard
├── manifest.json        # PWA manifest (install to home screen)
├── icons/               # PWA icons (192×192 and 512×512 PNGs needed)
├── worker/
│   ├── index.js         # Cloudflare Worker — SumUp payments + Supabase
│   └── wrangler.toml    # Cloudflare Worker config
└── db/
    └── schema.sql       # Supabase Postgres schema
```

## Local Development

**Static pages only** (no backend needed):
```bash
npx serve .
```
Then open `http://localhost:3000`. Browsing and UI works without the worker, but payments and bookings require the backend.

**With the worker** (payments + bookings):

You'll need Supabase and SumUp credentials first — see [External Services](#external-services) below. Then create `worker/.dev.vars`:
```
SUMUP_API_KEY=your_key
SUPABASE_URL=your_url
SUPABASE_SERVICE_KEY=your_key
```

Run the worker:
```bash
cd worker
npx wrangler dev
```

The worker runs at `http://localhost:8787`. Update `WORKER_URL` in `index.html` to point there while developing locally.

---

## Deployment

### External Services

1. **Supabase**

   1. Create a free project at [supabase.com](https://supabase.com)
   2. Go to **SQL Editor** and run `db/schema.sql`
   3. Copy your **Project URL** and **service-role key** (Settings → API)

2. **SumUp**

   1. Sign up at [sumup.com](https://sumup.com)
   2. Go to the [SumUp Developer Portal](https://developer.sumup.com)
   3. Create an app and generate an **API Key** (bearer token)

### Cloudflare Worker

```bash
cd worker
npm install -g wrangler
wrangler login

# Set secrets (never hardcoded)
wrangler secret put SUMUP_API_KEY
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_KEY

# Deploy
wrangler deploy
```

Copy the worker URL (e.g. `https://visit-sark-worker.YOUR_SUBDOMAIN.workers.dev`) and update it in `index.html` where `WORKER_URL` is referenced.

### Deploy the PWA

Deploy the root of this repo to any static host:

- **Cloudflare Pages** (recommended — same account as the worker): `wrangler pages deploy .`
- **Netlify**: drag and drop the folder
- **GitHub Pages**: push to a `gh-pages` branch

### PWA Icons

Generate icons from your logo at [maskable.app](https://maskable.app) or [realfavicongenerator.net](https://realfavicongenerator.net) and place them in `icons/`:
- `icons/icon-192.png`
- `icons/icon-512.png`

---

## App Tabs

| Tab | Description |
|-----|-------------|
| 📅 Plan My Day | Day planner — pick a date, add activities, book everything at once |
| 🛥️ Ferry | Isle of Sark Shipping (Guernsey), Manche Iles (Jersey/France), Private Charter |
| 🚌 Toast Rack | Toast Rack Tractor Bus — Charlie's Bus & Colin Guille |
| 🐴 Carriages | Sark Carriages, Helen's, Sark Carriage Rides |
| 🚲 Bikes | A to B Cycles, Avenue Cycles, Bam's Bikes, Sark Bike Hire |
| 🧗 Adventure | Adventure Sark, Sark Boat Trips, Donkey Walks, La Seigneurie, guided walks |
| 🍽️ Food & Drink | All 12 venues from sark.co.uk with menus, prices and booking |
| 📆 Calendar | Full-year events calendar — sheep racing, folk festival, dark skies, and more |
| 🗺️ Map | OpenStreetMap with all locations, filter by category, draw walking routes |

## Operator Apps

| App | URL | Use |
|-----|-----|-----|
| Customer PWA | `/` | Browse & book |
| Bus / Activity Operator | `/operator.html` | Scan QR tickets for bus, carriages, bikes, adventure, food |
| Boat Operator | `/boat-operator.html` | Passenger manifest + boarding for ferry & boat trips |
| Admin Dashboard | `/admin.html` | Manage bookings, listings and providers |
