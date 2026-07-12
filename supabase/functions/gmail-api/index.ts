# Gmail Apply Label Sync — Supabase Edge Functions
#
# Deploy: supabase functions deploy gmail-api
# Set secrets: supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...
#
# For local development, the api-server routes at /api/gmail/* are used
# (proxied from Vite). Edge function deployment is optional for production.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

serve(async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/gmail-api/, '');

  const apiBase = Deno.env.get('GMAIL_API_UPSTREAM') ?? '';
  if (!apiBase) {
    return new Response(JSON.stringify({ error: 'GMAIL_API_UPSTREAM not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const target = `${apiBase.replace(/\/$/, '')}/api/gmail${path}${url.search}`;
  const headers = new Headers(req.headers);
  headers.delete('host');

  const res = await fetch(target, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text(),
  });

  return new Response(res.body, {
    status: res.status,
    headers: res.headers,
  });
});
