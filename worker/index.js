/**
 * Visit Sark — Cloudflare Worker
 *
 * Handles:
 *  - SumUp Checkout API (create & verify payments)
 *  - Supabase ticket storage & validation
 *  - QR token generation & redemption
 *
 * Environment variables (set in wrangler.toml or Cloudflare dashboard):
 *  SUMUP_API_KEY        — SumUp bearer token (never exposed to the browser)
 *  SUPABASE_URL         — e.g. https://xxxx.supabase.co
 *  SUPABASE_SERVICE_KEY — Supabase service-role key (never exposed to the browser)
 *  ALLOWED_ORIGIN       — e.g. https://visitsark.gg (for CORS)
 */

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env?.ALLOWED_ORIGIN ?? '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    const url = new URL(request.url);

    try {
      switch (url.pathname) {
        case '/checkout/create':   return handleCreateCheckout(request, env);
        case '/checkout/verify':   return handleVerifyCheckout(request, env);
        case '/ticket/validate':   return handleValidateTicket(request, env);
        case '/events':            return handleEvents(request, env);
        case '/ferry-sailings':    return handleFerrySailings(request, env);
        default:
          return json({ error: 'Not found' }, 404, env);
      }
    } catch (err) {
      console.error(err);
      return json({ error: "Internal server error" }, 500, env);
    }
  },
};

// ── CREATE CHECKOUT ──────────────────────────────────────────────────────────

async function handleCreateCheckout(request, env) {
  const { amount, currency = 'GBP', description, reference, return_url } =
    await request.json();

  const res = await fetch('https://api.sumup.com/v0.1/checkouts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUMUP_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      checkout_reference: reference,
      amount,
      currency,
      description,
      return_url,
    }),
  });

  const data = await res.json();
  if (!res.ok) return json({ error: data.message ?? 'SumUp error' }, res.status, env);

  // Store a pending booking in Supabase
  await supabase(env, 'POST', '/rest/v1/pending_bookings', {
    reference,
    amount,
    description,
    checkout_id: data.id,
    status: 'pending',
  });

  return json({ checkout_id: data.id, checkout_url: data.hosted_checkout_url }, 200, env);
}

// ── VERIFY CHECKOUT ──────────────────────────────────────────────────────────

async function handleVerifyCheckout(request, env) {
  const { checkout_id, reference } = await request.json();

  const res = await fetch(
    `https://api.sumup.com/v0.1/checkouts/${checkout_id}`,
    { headers: { Authorization: `Bearer ${env.SUMUP_API_KEY}` } }
  );

  const data = await res.json();
  if (!res.ok || data.status !== 'PAID') {
    return json({ paid: false, status: data.status }, 200, env);
  }

  // Generate a unique QR token and create the booking in Supabase
  const token = crypto.randomUUID();

  await supabase(env, 'POST', '/rest/v1/bookings', {
    reference,
    checkout_id,
    token,
    amount: data.amount,
    description: data.description,
    status: 'valid',
  });

  await supabase(env, 'PATCH', `/rest/v1/pending_bookings?reference=eq.${reference}`, {
    status: 'paid',
  });

  return json({ paid: true, token }, 200, env);
}

// ── VALIDATE TICKET ──────────────────────────────────────────────────────────

async function handleValidateTicket(request, env) {
  const { token } = await request.json();

  const res = await supabase(
    env, 'GET', `/rest/v1/bookings?token=eq.${token}&select=*`
  );
  const rows = await res.json();

  if (!rows.length) return json({ valid: false, reason: "Ticket not found" }, 200, env);

  const booking = rows[0];
  if (booking.status === 'used') {
    return json({ valid: false, reason: "Already used", booking }, 200, env);
  }

  // Mark as used
  await supabase(env, 'PATCH', `/rest/v1/bookings?token=eq.${token}`, {
    status: 'used',
    used_at: new Date().toISOString(),
  });

  return json({ valid: true, booking }, 200, env);
}

// ── EVENTS ───────────────────────────────────────────────────────────────────

async function handleEvents(request, env) {
  if (request.method === 'GET') {
    const res = await supabase(env, 'GET', '/rest/v1/events?select=*&order=event_date.asc.nullslast,name.asc');
    const data = await res.json();
    if (!res.ok) return json({ error: 'Failed to fetch events' }, 500, env);
    return json(data, 200, env);
  }

  // POST and DELETE require admin token
  const token = request.headers.get('X-Admin-Token');
  if (!token || token !== env.ADMIN_TOKEN) return json({ error: 'Unauthorised' }, 401, env);

  if (request.method === 'POST') {
    const body = await request.json();
    const res = await supabase(env, 'POST', '/rest/v1/events', body);
    const data = await res.json();
    if (!res.ok) return json({ error: 'Failed to create event' }, 500, env);
    return json(data, 201, env);
  }

  if (request.method === 'DELETE') {
    const { id } = await request.json();
    const res = await supabase(env, 'DELETE', `/rest/v1/events?id=eq.${id}`);
    if (!res.ok) return json({ error: 'Failed to delete event' }, 500, env);
    return json({ deleted: true }, 200, env);
  }

  return json({ error: 'Method not allowed' }, 405, env);
}

// ── FERRY SAILINGS ───────────────────────────────────────────────────────────

async function handleFerrySailings(request, env) {
  const url = new URL(request.url);
  const operator = url.searchParams.get('operator'); // 'ioss' or 'manche-iles'
  const from = url.searchParams.get('from');         // YYYY-MM-DD
  const to   = url.searchParams.get('to');           // YYYY-MM-DD

  let path = '/rest/v1/ferry_sailings?select=*&order=sailing_date.asc';
  if (operator) path += `&operator=eq.${operator}`;
  if (from)     path += `&sailing_date=gte.${from}`;
  if (to)       path += `&sailing_date=lte.${to}`;

  const res = await supabase(env, 'GET', path);
  const data = await res.json();
  if (!res.ok) return json({ error: 'Failed to fetch sailings' }, 500, env);
  return json(data, 200, env);
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function json(data, status = 200, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(env), 'Content-Type': 'application/json' },
  });
}

function supabase(env, method, path, body) {
  return fetch(`${env.SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'return=representation' : 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
