# Tracktor — Multi-user, Roles & pt-PT: Upstream Contribution Analysis

Assessment of the `dev` branch (as of commit `0674858`, 2026-07) against four hard
requirements: shared garage for two users (R1), server-side guardrails (R2),
pt-PT localisation (R3), and upgrade/data safety (R4).

---

## 1. Verified state of the codebase

Findings from the earlier read of `dev`, corrected and extended. ✅ = confirmed,
✏️ = corrected/nuanced.

### Auth & users

- ✅ `usersTable` (id, username, passwordHash) + `sessionsTable` (id, userId FK,
  expiresAt) in `src/server/db/schema/auth.ts`. Sessions are Lucia-style: random
  token, SHA-256 hashed into the session id, 30-day sliding expiry
  (`src/server/utils/session.ts`). Solid implementation.
- ✅ Legacy `authTable` (single PIN hash) is still defined "for migration
  purposes" but **nothing reads or writes it** anymore. A leftover `X-User-PIN`
  CORS header remains in `src/server/middlewares/cors.ts:46`.
- ✏️ **The single-user restriction is intentional but only enforced client-side.**
  Upstream PR #129 ("v2", merged Dec 2025) contains a commit "Fixed auth to be
  single user" — but the fix is a client-side redirect in
  `src/routes/(auth)/register/+page.svelte:15`. The API endpoint
  `POST /api/auth/register` sits under the `/api/auth` auth-bypass prefix and
  `authService.createUser` has **no user-count gate**: anyone who can reach the
  instance can create an account at any time.
- ✏️ Consequence: since all data is globally scoped (below), **multi-user
  "works" today by accident** — a second account created via the raw API sees and
  can mutate the entire garage. R1's behaviour exists; what's missing is intent,
  guardrails, and closing the open-registration hole (which on an
  internet-exposed instance is a serious vulnerability: full data access,
  including destructive `/api/data/import`).

### Ownership, roles, scoping

- ✅ No `role` column, no `ownerId` on `vehicles`, and **no table other than
  `sessions` references users at all**. Every service query is globally scoped;
  zero queries filter by user id.
- ✅ `src/server/db/schema/audit.ts` is misleadingly named — it exports only a
  `timestamps` helper (`created_at`/`updated_at`). **No audit table, no
  change-tracking anywhere.**
- ✏️ Additional finding: **object-level authorization on child records is
  inconsistent.** For maintenance logs, GET/PUT/DELETE on
  `/api/vehicles/[id]/maintenance-logs/[logId]` resolve by `logId` alone and
  ignore the vehicle id in the path (`maintenanceLogService.ts:42-70`). For
  fuel logs, insurance, PUCC and reminders, only PUT cross-checks the vehicle
  id; GET/DELETE go by child id alone. Moot while everything is one global pool,
  but it must be fixed before any tenancy model means anything.

### Enforcement surface

- ✅ Middleware chain in `src/hooks.server.ts:20-26`:
  Cors → Auth → RateLimit → Logging, executed for every request.
- ✏️ **`AuthMiddleware` only guards paths starting with `/api`**
  (`src/server/middlewares/auth.ts:88`). Page loads and form actions are never
  authenticated by it. This is currently safe **only because the app has no
  `+page.server.ts` loads and no form actions at all** — the sole server load is
  `src/routes/+layout.server.ts` returning the app version; every data flow is a
  client-side `fetch` to `/api/*`. So: the middleware *is* the effective choke
  point today, but it's a convention, not a guarantee — any future server
  load/action would silently bypass auth.
- ✅ Bypass list (`auth.ts:9`): `/api/auth`, `/api/files/`, `/api/health`,
  `/api/config/branding`. Notable: **file upload and download are fully
  unauthenticated** (`/api/files` POST, `/api/files/[filename]` GET), and
  `TRACKTOR_DISABLE_AUTH` opens the entire API.
- ✏️ Other findings worth reporting upstream (separately, some privately):
  - `/api/data/export` dumps the `users` table **including bcrypt password
    hashes** and all sessions to any authenticated user.
  - `/api/data/import` wipes and replaces the entire database — any
    authenticated user can do it.
  - `PUT /api/config` accepts arbitrary keys, including `customCss`, which is
    then served unauthenticated via `/api/config/branding`.

### i18n

- ✅ inlang/Paraglide, `messages/{locale}.json`, base `en`, 707 message keys.
  Locales: `en, ar, hi, es, fr, de, it, hu, fi`. No Portuguese of any flavour.
- ✏️ **Locale is currently a global, instance-wide setting**, not per-browser or
  per-user: the Settings modal persists `locale` into the `configs` table
  (single key/value row), and `config.svelte.ts:76-79` re-applies that config
  value to every browser whenever configs refresh — overriding the Paraglide
  cookie. Two users on one instance cannot run different languages today.
- ✅ Paraglide messages compile at build time (vite plugin,
  `project.inlang/settings.json`); there is a documented process in
  `docs/i18n.md`, and single-language PRs are routinely merged upstream
  (Italian #145, Hungarian #157, Finnish #181, German #206; Romanian #218 open).

### Migrations, data safety, tests

- ✅ Drizzle Kit, timestamp-prefixed SQL files in `migrations/`, tracked in
  `_migrations`, **run automatically at startup** (`src/server/db/init.ts`),
  followed by seeders and a patch system. New columns with defaults are safe
  additive migrations.
- ✏️ **The test suite is a placeholder**: `src/__tests__/index.test.ts` is a
  single `expect(true).toBe(true)`. `docs/contributing.md` asks for tests, but
  there is no harness (no test DB setup, no API test helpers). The first PR
  that ships real tests pays a setup cost.
- ✅ Import/export exists but is **JSON** (full destructive replace, optional
  AES encryption). CSV import exists for **fuel logs only** and is client-side
  (`src/lib/helper/csv.helper.ts` parses in the browser, then posts each row
  through the normal API). PDF export exists for maintenance logs.
- ✅ README: "not stable for production use… keep regular backups."

## 2. Upstream prior art

- **[#158 — "[Feature request] Multi user"](https://github.com/javedh-dev/tracktor/issues/158)**
  (open, Jan 2026, labels `authentication`/`new-feature`/`p3`): requests exactly
  the model needed here — an Admin who manages vehicles plus restricted
  "Driver" accounts who can submit fuel/maintenance entries. No maintainer
  reply, no design, no linked work.
- **#97** (closed Q&A): a user asked about multiple accounts; no visible answer.
- **#16** (open, by the maintainer): OIDC/SAML SSO — relevant because any
  role design should not paint SSO into a corner (roles on the local user
  record, not baked into the password flow).
- **Portuguese: zero prior art.** No issue or PR mentions pt/pt-PT/pt-BR.
  Unclaimed.
- Process: PRs target `dev`; no size or commit conventions documented;
  discussions are not enabled (use issues); maintainer contact
  javedh.dev@gmail.com.

## 3. Recommended design

### R1 + R2 → Option (a): single shared garage + roles. Skip ownership/sharing.

Recommendation: **do not add `ownerId` or a `vehicle_shares` table.** Reasons:

1. **The codebase is already a shared garage.** Zero queries filter by user.
   Option (a) requires no changes to any data query — only a role gate in front
   of mutations. Option (b) requires touching every one of the ~30 endpoints
   and ~12 services, fixing the child-record id-only lookups first, and getting
   every single query right (one miss = data leak between tenants).
2. **It matches the only stated upstream demand.** #158 asks for shared
   vehicles + role restrictions (Admin/Driver), not per-user gardens. Nobody
   has asked for isolated multi-tenancy.
3. **It's reviewable.** A maintainer with no multi-tenancy plans can review a
   role-gate PR in one sitting. A tenancy PR on a project that deliberately
   "fixed auth to be single user" is likely to stall or rot against active
   development.
4. Option (b) remains cleanly addable later — roles are a prerequisite for it
   anyway, so option (a) is not throwaway work.

Given the note that even a single role would be acceptable: roles *are* the
minimum viable version of this feature — without them, legitimising the second
account removes the only guardrail (the login prompt) from destructive actions.

### Role model

Three roles, stored as a text enum on `users`:

| | `admin` | `editor` | `viewer` |
|---|---|---|---|
| View everything | ✅ | ✅ | ✅ |
| Create/edit fuel, maintenance, insurance, PUCC, reminders | ✅ | ✅ | ❌ |
| Delete individual log entries | ✅ | ✅ (own entries at minimum; simplest: allow) | ❌ |
| Create/edit vehicles | ✅ | ✅ (edit) / ❌ (delete) | ❌ |
| Delete vehicles | ✅ | ❌ | ❌ |
| Data import/export, config, notification providers, user management | ✅ | ❌ | ❌ |

`viewer` costs almost nothing once the mechanism exists (it's "no mutations at
all") but can be dropped from the first PR if the maintainer prefers two roles.

### Enforcement design

Two layers, both server-side:

1. **Route-policy table in `AuthMiddleware`** (the choke point — verified that
   all data access flows through `/api`). After the session resolves, evaluate
   `(method, pathname)` against an ordered policy list, e.g.:

   ```
   DELETE /api/vehicles/[id]            → admin
   *      /api/data/*                   → admin
   PUT    /api/config                   → admin
   *      /api/notification-providers/* → admin
   *      /api/users/*                  → admin
   POST|PUT|PATCH|DELETE /api/*         → editor   (default mutation gate)
   GET    /api/*                        → viewer
   ```

   Return 403 with a translatable message key. This is central, auditable, and
   ~one screen of code.

2. **`requireRole(locals, 'admin')` helper** called inside the handful of
   admin-only route handlers (data import/export, config PUT, providers, user
   management, vehicle DELETE) as defense in depth, so a future refactor of the
   middleware or a new non-`/api` server route cannot silently drop the check.

SvelteKit note (framework idiom): `hooks.server.ts` `handle` runs for *every*
server request — pages, API routes, form actions alike — so the middleware
chain *does* see everything; the `/api`-only scoping is a deliberate filter
inside `AuthMiddleware`, not a framework limitation. If upstream ever adds
form actions, the right fix is to widen `requiresAuth`, and the role policy
inherits the same coverage. `event.locals` (typed in `src/app.d.ts`) is the
standard per-request carrier: add `role` to `locals.user`.

UI layer (not security, just UX): expose `role` from `GET /api/auth` into
`authStore` (`src/lib/stores/auth.svelte.ts` — a Svelte 5 class store using
`$state` runes), and conditionally hide destructive buttons. Svelte 5 runes:
`$state` declares reactive fields, `$derived` computed ones — e.g.
`const canDelete = $derived(auth.user?.role === 'admin')` in a component.

### Registration / user management

- Gate `POST /api/auth/register` server-side: **only allowed when zero users
  exist** (matches the maintainer's stated intent and fixes the current hole);
  the first user becomes `admin`.
- Admins create further accounts via a new `POST/GET/PUT/DELETE /api/users`
  (admin-only), with a small "Users" section in Settings: username, temp
  password, role dropdown.

### R3: pt-PT

Plumbing (small, mechanical):

1. `messages/pt-PT.json` — copy of `en.json` with translated values (707 keys,
   `{placeholder}` syntax preserved). BCP-47 tag `pt-PT` is fully supported by
   Paraglide/inlang.
2. `project.inlang/settings.json`: add `"pt-PT"` to both `locales` and
   `languageTags`.
3. `src/lib/components/feature/settings/SettingsModal.svelte`: add
   `'pt-PT': 'Português (Portugal)'` to `localeLabels` (while there: `fi` is
   missing its label too — trivial goodwill fix).
4. `pnpm build` / dev server regenerates `src/lib/paraglide/*` automatically
   (vite plugin) — no manual compile step.

Translation itself is the real work: 707 strings ≈ several evenings. inlang's
Sherlock VS Code extension or Fink web editor work against this repo layout.

**Per-user language** requires decoupling locale from the global config:

- Minimal, upstream-friendliest: make locale **per-browser** — treat the
  Paraglide cookie as the source of truth; keep `configs.locale` only as the
  *default* for browsers with no cookie, instead of force-applying it on every
  config refresh (`config.svelte.ts:76-79` and the Settings save path). For a
  house with two people/two devices this fully delivers R3.
- Fuller: `locale` column on `users` applied at login. More code, requires the
  auth store to know it, and is moot until multi-user lands — propose it as a
  follow-up, not in the pt-PT PR.

### R4: migration safety

- `role` column: `ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT
  'admin'` (generated by `drizzle-kit generate` from the schema change —
  Drizzle idiom: edit `schema/auth.ts`, run `pnpm db:generate`, commit the
  emitted SQL file; it runs automatically on next boot, recorded in
  `_migrations`). Existing installs: their one user becomes admin; behaviour
  unchanged. No `ownerId` = no backfill problem at all.
- No destructive migration anywhere in this plan; every change is additive with
  safe defaults. Keep the JSON export as the pre-upgrade backup story (works
  today), plus SQLite file copy of `DB_PATH`.

## 4. Ordered PR plan

Each PR is independently mergeable; none depends on a later one.

**PR 1 — pt-PT translation** *(no discussion needed; near-certain merge)*
Files: `messages/pt-PT.json` (new), `project.inlang/settings.json`,
`SettingsModal.svelte` (labels). Migration: none. Tests: none required (no
translation PR has shipped tests). Effort: plumbing ≤ 1 h; translation of 707
strings is the long pole — budget 3–5 evenings. Optionally split: plumbing +
first ~200 core strings, then a follow-up completing coverage (Paraglide falls
back to English for missing keys).

**PR 2 — server-side registration gate** *(small, aligns with stated intent;
mention the current behaviour privately to the maintainer first — it's a live
vulnerability on exposed instances)*
Scope: reject `POST /api/auth/register` when a user already exists (reuse
`getUsersCount`); keep the client redirect as UX. Files:
`src/routes/api/auth/register/+server.ts`, `authService.ts`. Migration: none.
Tests: first real API test — needs a tiny vitest + in-memory SQLite harness;
budget the setup here. Effort: fix ~1 h; test harness 2–4 h.

**PR 3 — child-record scoping fix** *(bug fix, uncontroversial)*
Scope: make GET/PUT/DELETE on `[logId]`/`[insuranceId]`/`[puccId]`/
`[reminderId]`/`[notificationId]` verify the record belongs to the `[id]`
vehicle in the path. Files: 5 services + their `[childId]/+server.ts` routes.
Migration: none. Effort: 3–5 h including tests on the PR 2 harness.

**PR 4 — roles + user management (the R1/R2 PR)** *(open design issue first —
see §5; reference #158)*
Scope: `role` column + migration; role policy in `AuthMiddleware` +
`requireRole` helper; `/api/users` CRUD (admin); `role` in `GET /api/auth`
response, `locals.user`, `app.d.ts`, auth store; Settings → Users UI;
conditional rendering of destructive controls; ~10 new message keys (added to
`en.json` + translated in `pt-PT.json`).
Files: `schema/auth.ts`, new migration, `middlewares/auth.ts`,
`authService.ts` or new `userService.ts`, new `routes/api/users/*`,
`app.d.ts`, `stores/auth.svelte.ts`, Settings components, scattered
`{#if}` guards in vehicle/log components.
Migration: additive with `DEFAULT 'admin'`.
Tests: policy-table unit tests (role × method × path matrix) — this is where
tests earn their keep.
Effort: server side is genuinely a weekend; UI (user management + conditional
controls in an unfamiliar Svelte 5 codebase) roughly doubles it. Realistic:
**3–5 focused days** spread over 1–2 weeks, plus review cycles.

**PR 5 — per-browser (later per-user) locale** *(small; can precede or follow
PR 4)*
Scope: stop force-applying `configs.locale` over the cookie; config value
becomes the default for cookie-less browsers; Settings saves the cookie always
and the global default only for admins (once roles exist). Files:
`config.svelte.ts`, `SettingsModal.svelte`, `docs/i18n.md`. Migration: none.
Effort: 2–4 h.

*(Not planned: option (b) ownership/sharing — 1–2 weeks was optimistic; with
the child-scoping prerequisite, query rewrites across 12 services, and review
risk on a fast-moving `dev`, it's closer to 3+ weeks and shouldn't be built
without explicit maintainer buy-in.)*

Sanity check on original assumptions: "guardrails ≈ a weekend" — right for the
backend, ~half the total; "full tenancy 1–2 weeks" — optimistic, and better
not attempted first anyway.

## 5. Draft upstream issue (design proposal)

Post as a comment on #158 (it's exactly this feature and keeps the maintainer's
context) — or as a new issue titled **"Proposal: minimal multi-user — shared
garage with roles (offer to implement)"** cross-linking #158. Draft:

> Hi! I'm evaluating Tracktor for family use (two people, one shared garage —
> same shape as this request) and I'd like to contribute this feature. Before
> writing code I want to check the direction with you.
>
> **Proposal — smallest change that makes multi-user safe:**
>
> 1. Keep the current data model exactly as is: one shared pool of vehicles,
>    no per-user ownership. All accounts see the same garage (which is what
>    this issue asks for, and matches how the data layer already works).
> 2. Add a `role` column to `users` (`admin` | `editor` | `viewer`, default
>    `admin` so existing installs are unaffected). `editor` ≙ the "Driver"
>    role requested above: can add/edit fuel and maintenance records, cannot
>    delete vehicles, import/export data, change config, or manage users.
> 3. Enforce server-side in `AuthMiddleware` via a small method+path → minimum
>    role policy table (plus explicit checks in admin-only handlers), and hide
>    disallowed controls in the UI.
> 4. First registered user stays admin; admins create further accounts from
>    Settings (`/api/users`, admin-only). Related: `POST /api/auth/register`
>    currently only blocks additional signups in the client redirect — I'd
>    include/precede this with a server-side gate ("only when no users exist"),
>    which I believe matches the intent of the v2 "single user" change.
> 5. Explicitly *not* proposing per-user vehicle ownership or sharing — that's
>    a much bigger, riskier change and nothing here requires it. Roles would be
>    a clean foundation if you ever want it (or OIDC group mapping for #16).
>
> I'd split it as: (a) server-side register gate, (b) child-record
> vehicle-scoping fix (`.../maintenance-logs/[logId]` etc. currently resolve by
> child id alone), (c) the role column + enforcement + user management UI.
> Each lands independently. I'm also contributing a full pt-PT translation
> separately.
>
> Does this direction work for you? Happy to adjust the role set, naming, or
> split.

Separately (private email, not a public issue): the open `/api/auth/register`,
unauthenticated `/api/files` upload/download, and password hashes in
`/api/data/export` are worth a responsible-disclosure note to
javedh.dev@gmail.com.

## 6. Suggested sequence

1. Email the security notes; open the design comment on #158.
2. Start the pt-PT translation immediately (PR 1) — independent of everything,
   builds goodwill and familiarity with the codebase before the roles PR.
3. PR 2 (register gate) once the maintainer acks the security note.
4. PR 3 (scoping fix) any time.
5. PR 4 (roles) after a 👍 on the design; PR 5 (locale) whenever.

Fallback if the maintainer rejects multi-user: run the fork with just PR 2
reverted-locally (open registration is the degenerate "shared garage") — but
given #158 exists and is `p3`-labelled rather than closed, outright rejection
looks unlikely.
