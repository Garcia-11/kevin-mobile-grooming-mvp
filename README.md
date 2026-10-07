# Kevin's Mobile Grooming

An appointment-request MVP for a mobile dog groomer who loses bookings in text conversations. Customers request a visit and follow its status; Kevin reviews a persistent inbox, agrees on a time, and completes the appointment.

## Product

- `/`: responsive booking form with dog, service, preferred date/time window, contact details, address and care notes. With the Supabase backend, real submissions require a customer account.
- `/login` and `/login?mode=signup`: customer sign-in and signup. Supabase manages passwords, email confirmation and recovery. `/account` shows only the signed-in customer's own requests, confirmed visits and history.
- `/admin/login`: a separate business-owner entry. `/dashboard` provides search, status filters, unread counts, contact links, confirmation, completion, decline/reopen and permanent deletion after an explicit warning. A normal customer account cannot gain admin access by choosing this entry or editing its metadata.
- `/demo`: a separate practice workspace with fictional data, seeded per anonymous Supabase user. Real and practice sessions use different cookies and namespaces. Practice sessions expire after 24 hours. Evaluators receive this URL separately; it is not advertised in the customer footer.
- New-request badges, in-page toasts and optional browser notifications while the workspace is open. The inbox checks every eight seconds. Closed-browser push, SMS, email appointment notices, payments and automatic routing are outside this MVP.

A request is **not a confirmed booking**. Kevin contacts the customer to agree availability, price and time. During confirmation he enters the visit duration and travel time after it. PostgreSQL reserves the entire interval and blocks overlapping confirmed visits, including simultaneous confirmation attempts. Another visit may begin exactly when the previous travel time ends. Cancel/decline releases the reserved interval; it does not delete the request. Permanent deletion removes the request and its saved contact details from the active database.

## Deliverables

- [Live MVP](https://kevins-grooming-bookings-joao.garcia-26.chatgpt.site)
- [Practice workspace](https://kevins-grooming-bookings-joao.garcia-26.chatgpt.site/demo)
- [One-page PDF](https://kevins-grooming-bookings-joao.garcia-26.chatgpt.site/mvp-overview.pdf)
- [Original product walkthrough](https://kevins-grooming-bookings-joao.garcia-26.chatgpt.site/walkthrough.mp4)

The original approximately two-minute walkthrough uses captured screens and fictional data. It predates customer accounts and duration/travel reservations. Re-record the final walkthrough with the updated product before final submission; the assessment asks for a product walkthrough and does not require an on-camera presenter. No submission email is sent by the application.

## Architecture

React/TypeScript on Vinext, hosted as a Sites/Cloudflare Worker. Supabase provides PostgreSQL and Auth, accessed over HTTPS. The app uses a publishable key and each verified user's token; no service-role key is included. HttpOnly cookies hold sessions, server routes verify identity with Supabase, and database RLS independently protects each customer's records. Narrow database functions authorize mutations and a PostgreSQL exclusion constraint protects the schedule.

The original Cloudflare D1 implementation remains in `lib/legacy` as a controlled rollback path. `BOOKING_BACKEND` selects the store; it does not combine data from the two stores. Never switch back after live Supabase writes without first reconciling those requests. The original schema migrations remain intact. Original guest requests, if imported, stay admin-only until explicitly linked to a verified customer id; matching a typed contact email never grants ownership.

See [Supabase setup, owner role and migration](supabase/README.md) for the applied schema, mail configuration, permissions and cutover checklist. Production activation requires a working custom SMTP sender, a verified business-owner account and Sites runtime configuration. Local integration checks do not prove email delivery.

## Local development

Node.js 22.13+ and npm:

```sh
npm ci
```

Copy `.env.example` into an ignored `.dev.vars`, then set:

```dotenv
BOOKING_BACKEND=supabase
SUPABASE_URL=your-project-url
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Use a separate Supabase development project for ongoing development. Apply the SQL migrations in order and configure Auth as described in `supabase/README.md`. The assessment project already has those migrations; do not apply them twice.

```sh
npm run dev
```

The legacy D1 preview needs its versioned Drizzle migrations applied locally and the original owner/demo settings. Production runtime values belong in Sites, never the manifest, source or GitHub. Keep `.dev.vars`, credentials and runtime state out of Git.

## Validation

```sh
node --test tests/scheduling.test.mjs tests/supabase-db.test.mjs
npx tsc --noEmit
python3 tests/api_smoke.py
npm run build
```

The database test runs the real migration SQL on embedded PostgreSQL, covering RLS isolation, unauthorized writes, role escalation, demo scoping, status rules, service and travel overlaps, boundaries and deletion. The API smoke test runs only fictional practice sessions against the configured local preview.

`tests/accounts_smoke.py` accepts operator-created, disposable fictional customer/admin credentials through hidden JSON stdin. It checks real Supabase sign-in, client/admin API boundaries, separate histories, concurrent confirmations, token refresh, tampered cookies, deletion and logout. It is not a public fixture seeder; never run it with real customer accounts. Email signup/confirmation and recovery must additionally be tested with the configured mail sender.

`tests/email_verification_smoke.py` accepts an operator-created disposable token fixture through hidden stdin. Integration checks cover a clean landing URL, HttpOnly pending cookies, explicit same-origin confirmation, repeated GET previews, one-time token reuse rejection, real Auth sessions and logout. Test signup and recovery separately; a PKCE-prefixed recovery token is supported without requiring the original browser's verifier cookie. The project's current Auth schema requires a matching `auth.one_time_tokens` fixture with an expiry as well as the corresponding user token field. Revoke fixture sessions and delete the fictional user afterward. Never use real email links in automated fixture tests.

## Assumptions and limits

- One business and one groomer, Kevin. The brief does not specify multiple employees; adding staff requires a resource per employee in the reservation constraint.
- Confirmed times are local calendar times. The current-day cutoff assumes America/New_York; change this when the actual service timezone is known.
- Kevin estimates duration and travel. There is no automatic route or price calculation.
- Lists show the latest 500 records. Add pagination and a business retention policy for larger-scale use.
- Supabase's free plan has usage limits and can pause inactive projects. Free setup does not guarantee free commercial hosting indefinitely; evaluate the real business's usage and ownership at handoff.
- Synthetic imagery and AI assistance were used; the assessment permits AI.
