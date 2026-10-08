# Supabase setup and migration

Current target: `Kevin Mobile Grooming` in `JG Consulting`, free plan, `us-east-1`.
Project ref: `myfyvezvytoreptyjyku`. The migration is schema-only; no credentials or customer records are in source.

Apply migrations in order: `20261007192320_grooming_accounts_and_schedule.sql`, `20261007193157_grooming_status_conflict_response.sql`, then `20261007205240_booking_emails.sql`. All are already applied to the assessment project; do not reapply them there. The second migration returns a business-conflict error without triggering database transaction retries. Local PostgreSQL tests run the identical SQL against a fresh PGlite database.

## Authentication

- Enable email/password signup and **keep email confirmation enabled**.
- Set up custom SMTP for emails to people outside the project's organization. Supabase's default mail sender only permits team addresses. Configure sender, host, port, login and SMTP key in the project's Authentication email settings. Never commit the SMTP key or use the service-role key in the app.
- Set Site URL to the published booking origin and allow exactly `/auth/callback` and `/auth/callback?recovery=1` on that origin. For developer testing, also allow these two callback URLs on `http://127.0.0.1:5173`. Avoid wildcard production redirects.
- Enable anonymous sign-ins for isolated fictional practice sessions. These use **separate cookies** and database namespaces; a practice session never replaces a customer's real account.
- Public customers sign up at `/login?mode=signup` and sign in at `/login`. Admin sign-in is `/admin/login`.
- Customize the **Confirm sign up** email link to `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email` and **Reset password** to `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery`. The app always supplies `/auth/callback` for signup and `/auth/callback?recovery=1` for recovery. Commit the two templates in `supabase/email-templates` and keep these redirect formats in sync.
- Opening an email link stores a short-lived HttpOnly token cookie and redirects to a clean confirmation page. A button performs a same-origin POST to Supabase Auth to verify the one-time token and set session cookies. GET previews do not consume email tokens. This supports links opened in another browser; the token must still be valid and unused. Old PKCE links remain supported but must finish in their original browser.
- Session cookies are HttpOnly, SameSite=Lax, and Secure in production. Each API verifies its access token with Supabase Auth; expiring sessions refresh in route handlers and return new cookies. Never log email links or tokens.

## Grant the owner role

The owner creates and verifies a normal application account. An authorized project operator then grants admin access to that exact **verified auth user id**, using a parameterized insert into `private.grooming_admins`. Do not make email string matching, editable user metadata or a UI checkbox grant roles. Customers cannot modify this table or call admin mutations successfully. Remove the row to revoke admin access.

## Data migration and cutover

1. Inspect the live D1 inbox immediately before cutover. The Oct 7 check found zero real requests; the personal test deleted on Oct 6 is absent and must never be restored. Old fictional demo sessions do not need to be copied.
2. If a real request arrives before cutover, transfer it through a parameterized private database operation, preserving its id and timestamps. Original guest requests have `client_id=null` and remain admin-only. Do **not** automatically assign them to someone who types a matching contact email.
3. Verify signup, confirmation, login, logout, recovery, two independent customer histories, an admin account, and an isolated anonymous demo. Test confirmation with overlapping durations/travel and simultaneous confirmations.
4. Configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `BOOKING_BACKEND=supabase` as Sites runtime values, then publish a new version. The app uses HTTP APIs, which are supported by the Worker runtime. A publishable key grants no privilege without the user's token and RLS.
5. Retain the previous D1 path only for a controlled rollback. Changing back after new Supabase submissions requires reconciling those new requests first. Do not silently switch stores or destroy the original database.

## Permissions and schedule

`grooming_requests` uses RLS for reads. Clients read only their own records; admins read real requests; anonymous demo users read only their own demo namespace. Direct table writes are denied. Authorized mutations go through narrow SECURITY DEFINER functions with fixed search paths, caller checks and tenant scoping. The private role/quota/session tables deny direct access through RLS and privileges. The intentional SECURITY DEFINER functions and private tables can trigger Supabase advisory notices; their permissions are checked in `tests/supabase-db.test.mjs`.

A PostgreSQL exclusion constraint rejects overlapping confirmed intervals for Kevin, including visit duration and travel after the visit. Intervals are half-open: another appointment may start exactly when the previous travel time ends. Database enforcement protects concurrent reservations. Declining a visit releases its interval. Service times are local calendar times; the current-day cutoff assumes America/New_York. There is one groomer, and route planning is manual.

Anonymous demos expire after 24 hours. A project operator can periodically remove only expired practice users/data and old rate-limit counters; this MVP does not automatically delete records for real clients. Plan a retention policy before commercial use.

## Booking email outbox

The third migration adds `private.grooming_email_events` and a booking-update trigger. A real confirmation, changed appointment time/duration, or cancellation of a confirmed visit records an email intent in the same transaction. Declining a new request creates no cancellation email. Demo namespaces never queue email. Recipient addresses come only from the customer’s verified Auth account. Outbox content is private and direct table access is denied.

`grooming_claim_email` and `grooming_finish_email` are narrow, authenticated admin-only RPCs. They do not accept a recipient or arbitrary message. They fix their search path, check the real admin role, lock booking/outbox rows in the same order, and check a claim token and claimant before recording an outcome. Repeated booking writes create no duplicate intent; stale claims cannot overwrite a newer event. Leases block simultaneous sends. Unknown crashed attempts are only reclaimed inside a conservative 15-minute provider deduplication window; older ambiguity is retained for operator review. These intentionally privileged RPCs, like the existing booking RPCs, may be listed by the Supabase advisor. Their customer/demo/anonymous denial and state invariants are tested.

Set the Brevo API key as a Sites secret, not in the database, SQL, browser, or source. Set the verified sender and public HTTPS origin as runtime values. Supabase’s SMTP configuration handles account emails; the application calls the Brevo HTTP API for appointment emails. See the main README for retry behavior and delivery limits.

## Checks

```sh
node --test tests/scheduling.test.mjs tests/supabase-db.test.mjs tests/booking-email.test.mjs tests/booking-email-db.test.mjs
npx tsc --noEmit
python3 tests/api_smoke.py
```

The database tests execute PostgreSQL, not a mocked policy evaluator. The API smoke tests use only fictional practice data on the configured local preview. Account/email integration also needs a configured Supabase project and a working mail sender; passing local database tests alone does not verify email delivery.
