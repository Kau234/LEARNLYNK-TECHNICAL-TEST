SECTION 1 — Supabase-ready SQL schema (put in schema.sql)

SECTION 2 — RLS & Policies for leads(schema2.sql)
Enable RLS and then create two policies: SELECT and INSERT. Paste into SQL (e.g., same schema.sql or run separately in Supabase SQL editor).

SECTION 3 — Supabase Edge Function (TypeScript)
File: functions/create-task/index.ts (Supabase Edge Functions). Uses @supabase/supabase-js v2 style.
Notes & deployment:
Set SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL in your Edge Function environment.
Broadcasting API shape may differ between @supabase/supabase-js versions — if broadcasting via client API isn't available, rely on DB row insert + Supabase Realtime subscriptions for clients. The code above attempts a broadcast and falls back safely.

SECTION 4 — Next.js page /dashboard/today (TypeScript + React Query)
Assumes:
Next.js v13+ (app or pages). I’ll give a React component suitable for pages router at pages/dashboard/today.tsx.
supabase client is available via lib/supabaseClient.ts.
React Query is set up (QueryClientProvider in _app.tsx).
Notes:
Use React Query's QueryClientProvider at app root. If you use Next.js App Router, adapt to a client component and use useQuery similarly.
This page shows loading and error states, updates status on click, and refetches after mutation.

SECTION 5 — Stripe Checkout (8–12 lines plan)
When candidate chooses to pay application fee, backend creates a Stripe Checkout Session (stripe.checkout.sessions.create) with mode: 'payment', line_items containing the fee, metadata including application_id and tenant_id, and success_url / cancel_url pointing to your app.
Store a payment_requests record in DB immediately: { id, application_id, stripe_session_id, amount, currency, status: 'pending', created_at }.
Return the session.id (or session.url) to the frontend and redirect user to Stripe Checkout.
Configure Stripe Webhook endpoint /api/webhooks/stripe that verifies signatures and listens for checkout.session.completed (and payment_intent events).
On webhook: verify session, find corresponding payment_requests by stripe_session_id, update it to paid with paid_at, stripe_payment_intent, and payment metadata.
After confirming payment, update the applications row: set payment_status = 'paid' (or push an entry to application timeline), and optionally move stage (e.g., from "applied" -> "fee_paid").
Emit any notifications (email, realtime event) for application owner/counselor.
Keep idempotency safe: store webhook_event_id and reject re-processing duplicates.

Optionally reconcile failed/expired sessions with scheduled background job and mark payment_requests as expired after window passes.

Log audit info and surface payment errors to admins for manual handling.
