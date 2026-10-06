# Kevin's Mobile Grooming

A working appointment-request MVP for Kevin, a mobile dog groomer who currently loses bookings in text conversations. Clients submit one structured request; Kevin gets a persistent inbox, an unread badge, and alerts for incoming requests while the workspace is open.

## Product

- `/`: responsive client request form with dog, service, preferred date, time window, contact information, address, and care notes.
- `/dashboard`: owner-only workspace with request search, status filters, unread counts, client contact links, agreed appointment times, and a new → confirmed → completed workflow. Requests can be declined and reopened.
- `/demo`: isolated practice workspace seeded with fictional appointments. Anyone who can visit the site can try both sides without seeing real customers. Practice data expires operationally through cleanup on later demo creation, after seven days; browser sessions last 24 hours.
- In-page new-request notification, unread badge, and optional browser alerts. The inbox checks for updates every eight seconds. The tab must remain open; background browser throttling may delay alerts. SMS, email delivery, and closed-browser push are outside this MVP.
- Persistent Cloudflare D1 storage; no browser-only booking database. HTTP retries use a request key to prevent duplicate submissions.

A request is **not a confirmed booking**. Kevin first agrees availability, price, and time with the client by phone, text, or email. Confirming in the app records that agreement; it does not send a message to the client. Route planning, visit duration, payments, and automatic reminders are intentionally outside scope.

## Published deliverables

- [Live MVP](https://kevins-grooming-bookings-joao.garcia-26.chatgpt.site)
- [Practice workspace](https://kevins-grooming-bookings-joao.garcia-26.chatgpt.site/demo)
- [One-page PDF overview](https://kevins-grooming-bookings-joao.garcia-26.chatgpt.site/mvp-overview.pdf)
- [Narrated product walkthrough](https://kevins-grooming-bookings-joao.garcia-26.chatgpt.site/walkthrough.mp4)

The walkthrough is approximately two minutes, using captured screens of the working product and fictional data. English subtitles and a transcript are in `public/`.

## Try it

1. Open the published site and choose **Explore the practice workspace**.
2. Choose **New request**. The booking form opens in another tab in the same practice session.
3. Enter fictional client details and a future preferred date; submit once.
4. Return to the workspace. The request appears automatically with an unread badge and an in-page alert.
5. Open it, choose an agreed time, check the agreement box, and confirm the visit. Mark it completed to finish the flow.

The real client inbox starts empty. Demo fixtures never enter that inbox.

## Implementation

React and TypeScript on the Vinext starter, packaged as a Cloudflare Worker. Drizzle defines the D1 schema and produces versioned migrations; prepared D1 statements perform queries. Owner access uses Sites' server-verified ChatGPT identity and a server-side owner email allowlist. Demo sessions use signed, HttpOnly, SameSite cookies and server-side tenant scoping.

Every inbox read and update verifies owner identity or a valid demo session. Public request submission validates all fields server-side, rejects cross-origin writes and past dates, limits repeated submissions, and uses an invisible spam trap. Customer details are never embedded into client bundles. Exact same-start conflicts are checked during confirmation, but Kevin must still account for service duration and travel time manually.

## Run locally

Prerequisites: Node.js 22.13 or newer and npm.

```sh
npm ci
```

Create a local `.dev.vars` file (ignored by Git):

```dotenv
OWNER_EMAIL=seedy@sites.test
DEMO_SECRET=replace-with-a-random-secret-at-least-32-characters-long
```

The portable Sites development profile supplies the test identity `seedy@sites.test`. This is a local preview identity only. Production uses the configured business owner's actual sign-in email.

```sh
npm run db:generate  # only after changing db/schema.ts
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_mixed_prowler.sql
npm run dev
```

Apply each pending migration once, in order. Keep `.dev.vars`, local database files, and runtime state out of Git. `npm run build` produces `dist/server/index.js` and static client assets. Sites handles the production D1 binding and migrations.

## Production configuration

Set `OWNER_EMAIL` and a strong `DEMO_SECRET` as runtime secrets. The project manifest declares only the logical D1 binding `DB`; it contains no credentials. Change `OWNER_EMAIL` to Kevin's verified sign-in email during a real business handoff. The assessment deployment initially authorizes the project owner.

Sites access is independent of the owner inbox: making the booking page publicly reachable does not grant access to `/dashboard`. Public sharing is controlled by the site owner. The demo remains a separate data namespace.

## Validation

```sh
npx tsc --noEmit
python3 tests/api_smoke.py
npm run build
```

The API smoke script targets a running local preview at `http://127.0.0.1:5173`; override it with `TEST_BASE_URL`. It creates only fictional practice sessions. It covers persistence, duplicate prevention, isolation between sessions, unauthorized access, invalid transitions, required confirmation time, completion, past dates, cross-origin writes, and tampered cookies.

The browser walkthrough also verifies form submission, the automatic inbox update, exact time persistence, confirmation, completion, search, responsive layouts, and the read-only WebMCP inbox tool. Desktop notification delivery depends on browser support and permission and was not enabled during automated review.

## Assessment scope and assumptions

- One groomer, one business, no automatic availability promise.
- Dates are preferences; confirmed times are local to the service address. The MVP uses America/New_York for the server's current-day cutoff and must be changed if the business operates elsewhere.
- Dashboard shows the most recent 500 requests. Pagination, data export, retention policy, and stronger public abuse protection should be added before larger-scale use.
- No real customer information or secret is included in demo data or source code.
- The dog illustration was generated with AI. The assessment permits AI assistance.
