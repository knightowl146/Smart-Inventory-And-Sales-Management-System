# Authentication and authorisation

How sessions, roles and the audit trail work, and why each choice was made.

---

## Getting started

```bash
npm install                     # adds bcryptjs, jsonwebtoken, cookie-parser

# generate two different secrets
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# put them in .env as JWT_ACCESS_SECRET and JWT_REFRESH_SECRET

# create the first owner (reads OWNER_EMAIL / OWNER_PASSWORD from .env)
npm run seed:owner

npm run dev                     # backend on :3000
cd frontend && npm run dev      # frontend on :5173, proxying /api to :3000
```

Every account after the first is created from the **Staff** page by an owner.
There is no public sign-up route anywhere in the API — which removes an entire
category of abuse and is a better story than a registration form.

---

## The session model

Two tokens with different jobs:

| | Access token | Refresh token |
|---|---|---|
| Lifetime | 15 minutes | 7 days |
| Travels as | `Authorization: Bearer …` | httpOnly cookie, `Path=/api/auth` |
| Stored | a JavaScript variable in `AuthContext` | the browser's cookie jar |
| Readable by page JS | yes | **no** |

The access token is never written to `localStorage`. Anything localStorage can
read, an XSS payload can read, and a token that survives a reload survives long
enough to be exfiltrated and replayed. Keeping it in memory means the worst case
is a token that dies when the tab closes — and on the next page load the
httpOnly refresh cookie quietly gets a new one, so the user stays signed in
without the token ever being persisted anywhere a script can reach.

### Refresh rotation and reuse detection

Every refresh consumes the presented token and issues a new one. The `jti` of
each live refresh token is stored on the user document (`sessions[]`) — the jti
only, never the token.

If a refresh token arrives whose jti is no longer in that list, it was either
already rotated or stolen, and there is no way to tell which. So the server
assumes the worst: it clears every session and bumps `tokenVersion`, forcing a
fresh sign-in on all devices. This is the OAuth 2.1 guidance for public clients,
and `tests/auth.test.js` proves it works from both sides — the attacker's replay
*and* the victim's legitimate token stop working.

### Immediate revocation

`tokenVersion` is baked into every token and compared against the database on
every request. Bumping it invalidates everything that user holds, instantly.
It is bumped on: deactivation, role change, password change, password reset, and
detected refresh-token reuse.

This is why `requireAuth` does a `findById` per request rather than trusting the
signature alone. A purely stateless check would keep honouring a deactivated
employee's token for up to 15 more minutes. One indexed lookup per request is a
fair price for revocation that actually takes effect; if it ever matters it can
be put behind a short-TTL cache without changing a single caller.

### Why same-origin, and why that matters

The frontend is on Vercel, the API is on Render — different sites. A cookie set
by the API would therefore be a *third-party* cookie, which Safari's ITP blocks
outright and Chrome is phasing out. The usual workaround, `SameSite=None;
Secure`, works right up until it doesn't.

Instead, `/api` is proxied so the browser only ever sees one origin:

- **development** — `server.proxy` in `frontend/vite.config.js`
- **production** — a rewrite in `frontend/vercel.json`

The cookie is then first-party and plain `SameSite=Lax` is enough. Development
and production behave identically, which removes the classic "works locally,
breaks when deployed" session bug.

> **Check before deploying:** the rewrite in `frontend/vercel.json` points at
> `https://smart-inventory-api.onrender.com`. If your Render service has a
> different host, change it there or sign-in will 404 in production.

### Password hashing

bcrypt at cost 12, via `bcryptjs`. Both `bcrypt` and `bcryptjs` implement the
same algorithm; the pure-JavaScript one is roughly 30% slower but needs no
compiler, so `npm ci` cannot fail on Render's build image or on a Windows
machine without MSVC build tools. For a deployment this size that reliability is
worth more than the speed. Argon2id is the stronger modern choice but carries
the same native-build problem.

---

## Roles

Defined once, as data, in `middlewares/permissions.js`:

```js
owner:    ["*"]
employee: ["product:read", "product:sell", "customer:read",
           "customer:create", "movement:read:own", "me:read"]
```

Employee is an **allowlist**, so a new endpoint added tomorrow is denied to
employees by default rather than accidentally exposed. Adding a third role later
is a data change, not a code change.

Guards are attached **inside each router file**, never at the mount point in
`app.js`. That matters here specifically: this codebase used to mount most
routers twice (`/api/products` *and* `/products`), which is exactly the shape of
bug where you protect one path and leave the other wide open. The bare-path
mounts have been removed and the guards moved inside, so a router cannot be
mounted without its protection.

### Three layers, doing different jobs

1. **`requireAuth`** — is this a valid, current session? Wrong answer is 401.
2. **`can(permission)`** — may this role do this? Wrong answer is 403.
3. **`responseFilter`** — may this role *see* these fields?

The third layer exists because route guards decide which endpoints a role may
call, not which fields come back. `GET /api/products` is a perfectly legitimate
employee request — but the response carries `purchasePrice`, which is the
business's margin on every item in the catalogue. So `responseFilter` wraps
`res.json` once and strips a denylist of financial fields, at any depth, for any
role without `finance:read`. Fail-closed: a new endpoint that returns a cost
field is filtered without anyone remembering to do it.

It deliberately does **not** cover file downloads, which bypass `res.json`
entirely. That is why the whole `/api/reports` router — exports included — is
owner-only at the route level.

### The employee dashboard is a separate endpoint, on purpose

`/api/analytics/*` is owner-only in its entirety. Redacting revenue, cost and
margin out of forty aggregation shapes would mean getting every one of them
right forever; building the narrow view an employee actually needs is both safer
and less code. Employees get `GET /api/me/summary` — their own units sold,
transaction count, recent sales and the low-stock count.

The same reasoning applies to `/api/movements`: an employee's scope is applied
as a **query condition** (`createdBy: <their id>`) rather than by filtering the
response, so other people's rows are never read out of the database and the
pagination totals stay honest.

---

## Audit trail

Two layers again, for the same reason:

- **`middlewares/auditTrail.js`** records every successful state-changing
  request automatically, so a new endpoint is covered the day it is written.
- **Explicit `audit.record()` calls** in controllers add what the HTTP layer
  cannot know: which fields changed, why a login failed, that a refresh token
  was replayed.

Entries denormalise the actor's email and role so the log stays readable after
an account is deleted. Password fields are stripped before anything is written.
Audit writes are fire-and-forget and never throw — a logging failure must not
turn a successful sale into a 500.

Owners read it at **Activity Log** (`GET /api/audit`), filterable by action,
actor, outcome and date.

---

## Tests

```bash
npm test
```

| File | Covers |
|---|---|
| `tests/authorization.unit.test.js` | Permission table, `can()`, `responseFilter`, token signing — **no database needed**, runs in under a second |
| `tests/auth.test.js` | Login, cookie flags, rotation, reuse detection, revocation, password change |
| `tests/rbac.test.js` | 401s, 403s, cost-field stripping, movement scoping, user-management guardrails, audit entries |

The eleven pre-existing suites were written against an open API, so every one of
them would 401 on its first request now. Rather than add a header to 500-odd
call sites, each suite imports `request` from `tests/helpers/testClient.js`
instead of directly from supertest, and calls `seedTestUsers()` once after
connecting. `request(app)` then behaves exactly as it always did, with an owner
token attached. `asOwner` / `asEmployee` / `anonymous` from the same helper are
what the RBAC suite uses to prove the guards do something.

---

## Things worth knowing

- **The unit suite runs anywhere.** The integration suites need
  `mongodb-memory-server`, which downloads a `mongod` binary from
  `fastdl.mongodb.org` on first run — behind a restrictive firewall that
  download fails and those suites cannot start.
- **`StockMovement.createdBy` is nullable.** Rows created by the seed scripts
  before authentication existed have no actor. New movements always carry one.
  If you want the historical rows attributed, backfill them to the owner's id.
- **Deactivating beats deleting.** Deleting a user removes the account but their
  movements keep pointing at a now-missing id. Deactivation keeps the history
  intact and ends their access immediately.
