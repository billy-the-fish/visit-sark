# Visit Sark

A Progressive Web App (PWA) for booking activities on Sark, Islands of Guernsey.

Book ferry crossings, the Toast Rack Tractor Bus, carriage rides, bike hire, adventures, dining and more — all in one place.

## Project Structure

```
visit-sark/
├── index.html              # Customer-facing PWA (main app)
├── operator.html           # Bus & activity operator — scan QR tickets
├── boat-operator.html      # Ferry & boat operator — passenger manifest + QR scan
├── admin.html              # Central management dashboard
├── style.css               # Shared styles for the PWA
├── manifest.json           # PWA manifest (install to home screen)
├── dev.sh                  # Start/stop local dev environment
├── icons/                  # PWA icons (192×192 and 512×512 PNGs needed)
├── images/                 # Local images (gitignored except .gitkeep)
├── worker/
│   ├── index.js            # Cloudflare Worker — SumUp payments + Supabase
│   ├── wrangler.toml       # Cloudflare Worker config
│   ├── .dev.vars           # Local secrets — never commit (gitignored)
│   └── .dev.vars.example   # Template for .dev.vars
└── db/
    ├── schema.sql          # Supabase Postgres schema
    └── seed-events.sql     # Initial events data
```

The browser never talks to Supabase directly. All data flows through the Cloudflare Worker, which holds the database credentials:

```
Browser (index.html)
  └─► Cloudflare Worker (worker/index.js)
        ├─► Supabase — reads events, ferry sailings, bookings
        └─► SumUp — creates and verifies payment checkouts
```

For example, when the What's On calendar loads:
1. `index.html` fetches `/events` and `/ferry-sailings` from the Worker
2. The Worker queries Supabase (using the service-role key) and returns the rows
3. The browser renders the calendar — no Supabase credentials ever leave the server

Payments follow a similar pattern: the browser sends booking details to `/checkout/create`, the Worker calls SumUp and stores a pending booking in Supabase, then on return the browser calls `/checkout/verify` to confirm payment and generate a QR ticket token.

## Local Development

### 1. Configure secrets

Copy the template and fill in your credentials:

```bash
cp worker/.dev.vars.example worker/.dev.vars
```

```
SUMUP_API_KEY=your_sumup_bearer_token
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
ADMIN_TOKEN=choose_a_secret_token_for_admin_access
ALLOWED_ORIGIN=http://localhost:3000
SUPABASE_PAT=your_supabase_personal_access_token  # optional, for running DB scripts
```

You'll need Supabase and SumUp credentials — see [External Services](#external-services) below.

### 2. Start the dev environment

```bash
./dev.sh
```

This starts two servers:
- **Static site** → `http://localhost:3000`
- **Worker API** → `http://localhost:8787`

The app automatically points to `localhost:8787` when running on localhost.

```bash
./dev.sh stop      # stop both servers
./dev.sh restart   # restart both
```

Logs are written to `/tmp/visit-sark-serve.log` and `/tmp/visit-sark-worker.log`.

### Static pages only

If you just want to browse the UI without payments or bookings:

```bash
npx serve .
```

---

## Deployment

### External Services

1. **Supabase**

   1. Create a free project at [supabase.com](https://supabase.com)
   2. Go to **SQL Editor** and run `db/schema.sql`
   3. Run `db/seed-events.sql` to populate the initial events
   4. Copy your **Project URL** and **service-role key** (Settings → API)

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
wrangler secret put ADMIN_TOKEN

# Deploy
wrangler deploy
```

Copy the worker URL (e.g. `https://visit-sark-worker.YOUR_SUBDOMAIN.workers.dev`) and update `WORKER_URL` in `index.html` and `admin.html`.

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
| ☀️ Plan My Day | Day planner — pick a date, add activities, book everything at once |
| 🎉 What's On | Events calendar with list and calendar views, filterable by category |
| 🛥️ Ferry | Isle of Sark Shipping (Guernsey), Manche Iles (Jersey/France), Private Charter |
| 🚌 Bus | Toast Rack Tractor Bus — Charlie's Bus & Colin Guille |
| 🐴 Carriages | Sark Carriages, Helen's, Sark Carriage Rides |
| 🚲 Bikes | A to B Cycles, Avenue Cycles, Bam's Bikes, Sark Bike Hire |
| 🧗 Adventure | Adventure Sark, Sark Boat Trips, Donkey Walks, La Seigneurie, guided walks |
| 🍽️ Food & Drink | All 12 venues from sark.co.uk with menus, prices and booking |
| 🗺️ Map | OpenStreetMap with all locations, filter by category, draw walking routes |

## Operator Apps

| App | URL | Use |
|-----|-----|-----|
| Customer PWA | `/` | Browse & book |
| Bus / Activity Operator | `/operator.html` | Scan QR tickets for bus, carriages, bikes, adventure, food |
| Boat Operator | `/boat-operator.html` | Passenger manifest + boarding for ferry & boat trips |
| Admin Dashboard | `/admin.html` | Manage bookings, listings, providers and events |
