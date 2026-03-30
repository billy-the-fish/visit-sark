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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN ?? '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    try {
      switch (url.pathname) {
        case '/checkout/create':  return handleCreateCheckout(request, env);
        case '/checkout/verify':  return handleVerifyCheckout(request, env);
        case '/ticket/validate':  return handleValidateTicket(request, env);
        default:
          return json({ error: 'Not found' }, 404);
      }
    } catch (err) {
      console.error(err);
      return json({ error: 'Internal server error' }, 500);
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
  if (!res.ok) return json({ error: data.message ?? 'SumUp error' }, res.status);

  // Store a pending booking in Supabase
  await supabase(env, 'POST', '/rest/v1/pending_bookings', {
    reference,
    amount,
    description,
    checkout_id: data.id,
    status: 'pending',
  });

  return json({ checkout_id: data.id, checkout_url: data.hosted_checkout_url });
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
    return json({ paid: false, status: data.status });
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

  return json({ paid: true, token });
}

// ── VALIDATE TICKET ──────────────────────────────────────────────────────────

async function handleValidateTicket(request, env) {
  const { token } = await request.json();

  const res = await supabase(
    env, 'GET', `/rest/v1/bookings?token=eq.${token}&select=*`
  );
  const rows = await res.json();

  if (!rows.length) return json({ valid: false, reason: 'Ticket not found' });

  const booking = rows[0];
  if (booking.status === 'used') {
    return json({ valid: false, reason: 'Already used', booking });
  }

  // Mark as used
  await supabase(env, 'PATCH', `/rest/v1/bookings?token=eq.${token}`, {
    status: 'used',
    used_at: new Date().toISOString(),
  });

  return json({ valid: true, booking });
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
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
