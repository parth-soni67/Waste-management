# WasteWise AI — Security Guide

Source of truth for security. This sits alongside `ai_rules.md`: `ai_rules.md`
has the always-on constraints; this file has the actual mechanisms to
implement them. Nothing here is optional for a "hackathon MVP" — a civic
platform that handles citizen location data, photos, and municipal
operations has to be trustworthy even as a prototype. If time is short, cut
scope (fewer modules), never cut security depth on the modules you do ship.

## 1. Authentication

- **Password storage**: Argon2id (preferred) or bcrypt with a per-user
  salt and a sane work factor — never MD5/SHA1/plain SHA256, never a
  fixed global salt.
- **Session model**: short-lived JWT access token (15 min) + rotating
  refresh token (httpOnly, `Secure`, `SameSite=Strict` cookie, not
  localStorage) with server-side revocation list in Redis so a refresh
  token can be invalidated on logout/compromise. Access tokens carry role
  + user id only — no sensitive PII in the token payload.
- **Credential verification**: constant-time comparison for password
  checks (library-provided, don't hand-roll); generic "invalid email or
  password" error — never reveal whether the email exists.
- **Brute-force protection**: rate-limit login attempts per account and
  per IP (Redis-backed sliding window); exponential backoff or temporary
  lockout after repeated failures; log failed attempts for the officer/
  admin audit trail.
- **Email verification**: citizens and officers verify email via a
  signed, time-limited (≤1hr) token link before full account access;
  unverified accounts can browse but not submit reports that trigger
  driver dispatch, to reduce fake-report abuse.
- **Password reset**: single-use, time-limited signed token sent to the
  verified email only; invalidate all existing sessions on reset.
- **Passkeys / WebAuthn**: recommended stretch goal for citizen and
  officer accounts (matches 2026 UX baseline — see `design_guide.md`).
  If out of scope for the hackathon timeline, log it as descoped in
  `task.md`, don't silently omit it.
- **MFA**: required for `admin` and `officer` roles at minimum (TOTP is
  sufficient); optional for `citizen`.
- **Driver accounts**: provisioned by admins only, not self-registered —
  drivers operate vehicles and must be vetted before they get an account.

## 2. Authorization

- **RBAC enforcement happens server-side, on every request** — never
  trust a role claim rendered/hidden in the frontend alone. Every router
  in `apps/api/app/routers/` declares its required role(s) via a shared
  dependency, not ad-hoc checks scattered in handlers.
- **Object-level authorization (IDOR prevention)**: a citizen can only
  read/update their own reports; a driver can only act on incidents
  currently assigned to them; an officer's write scope may be limited to
  their zone if zone-scoping is implemented. Check ownership/assignment
  in the query itself (e.g. `WHERE report.user_id = current_user.id`),
  not just in an `if` after fetching.
- **Admin actions are privileged and audited** (see §7) — creating
  vehicles, changing RBAC, overriding routes, and reopening/closing
  incidents outside the normal flow all write an audit log entry with
  actor, action, target, and timestamp.
- **The LangGraph agent runs with its own least-privilege data-access
  role** (§8) — it must never be able to take actions (write, delete,
  reassign) beyond what its specific tool set explicitly allows, and it
  never assumes the identity/permissions of the officer asking the
  question.

## 3. Input validation & verification

- **All external input is validated at the API boundary** via Pydantic
  schemas (`system_guide.md` §3) — reject unknown fields, enforce types,
  lengths, and value ranges (e.g. GPS coordinates within plausible
  bounds, image count per report capped, text description length capped).
- **File/image upload validation** (citizen reports, driver evidence):
  - Enforce a max file size and max count per submission.
  - Validate actual file content (magic-byte/MIME sniffing), not just the
    filename extension or client-supplied `Content-Type`.
  - Re-encode/re-compress uploaded images server-side before storage —
    this strips EXIF metadata (including embedded GPS, which may leak
    more precise location than intended) and neutralizes polyglot-file
    and image-parser exploits.
  - Store uploads in object storage with restricted, non-executable
    permissions; serve via signed, expiring URLs — never a public-write
    bucket, never a path directly derived from unsanitized user input.
- **Geolocation input**: treat client-supplied GPS as untrusted; sanity-
  check it falls within the operating city/zone bounds before it can
  create or influence an incident, to reduce spoofed-location abuse.
- **Text input** (report descriptions, agent queries): sanitize/escape
  before storage and before any templating into HTML; treat it as
  attacker-controlled when it flows into the LangGraph agent context
  (§8) or into any generated report.
- **Duplicate/spam abuse resistance**: rate-limit report creation per
  account; the duplicate-detection module (`program_spec.md` §4.4) also
  functions as an abuse signal — a burst of near-identical reports from
  one account is a spam/gaming pattern, not just a UX dedup case, and
  should be flagged for officer review rather than silently auto-merged
  in a way that inflates apparent citizen consensus.

## 4. Transport & infrastructure

- HTTPS/TLS everywhere, including local dev via a self-signed cert if
  practical — don't build habits around plaintext HTTP.
- Secure HTTP headers: `Content-Security-Policy`, `X-Content-Type-
  Options: nosniff`, `X-Frame-Options: DENY` (or CSP `frame-ancestors`),
  `Strict-Transport-Security`, `Referrer-Policy: strict-origin-when-
  cross-origin`.
- **CORS**: explicit allow-list of known frontend origins — never `*`
  alongside credentialed requests.
- **CSRF**: since auth uses httpOnly cookies for the refresh token,
  implement CSRF tokens (double-submit cookie or header-based) on
  state-changing requests.
- **Secrets**: per `ai_rules.md` #8 — env vars only, never committed;
  distinct secrets per environment; rotate anything that leaks
  immediately and note it in the phase summary (`loops.md`).
- **Dependency hygiene**: run `pip-audit`/`npm audit` (or equivalent) as
  part of CI once CI is scaffolded (`task.md` Phase 0); don't let known-
  vulnerable versions sit unaddressed.

## 5. Data protection & privacy

- **Data minimization**: only collect what a module actually needs
  (`program_spec.md` entities) — don't add speculative PII fields.
- **PII handling**: citizen contact info, precise home-linked GPS
  history, and driver personal details are sensitive — restrict read
  access by role (§2), never expose them in a response payload a citizen
  or driver role shouldn't see (e.g. don't leak one citizen's contact
  info to another via a shared incident view).
- **Location data**: an incident's public-facing map representation
  (e.g. shown to other citizens browsing "nearby issues") should not
  expose the reporting citizen's identity; officer/admin views may show
  more detail than the public citizen view.
- **Retention**: define a reasonable retention/anonymization point for
  closed incidents' raw images vs. their aggregated analytics — raw
  photos don't need to live forever once verification is complete and
  the incident is closed.
- **Audit logs contain actor + action + target + timestamp, not raw
  request bodies** — don't accidentally log passwords, tokens, or full
  image payloads into application logs.

## 6. Real-time channels (WebSockets)

- WebSocket connections authenticate with the same JWT access token
  (validated on connect, re-validated on reconnect/refresh) — don't
  leave a socket channel open and implicitly trusted after a token
  expires.
- Scope each socket subscription to what that role/user is authorized to
  see (a driver's socket only receives their own route/task updates; an
  officer's socket can subscribe to zone/city-wide channels).

## 7. Auditability

Maintain an append-only audit log for: login/logout, failed logins,
password resets, role/permission changes, vehicle/zone/config changes,
manual incident reopen/close/override, and any agent-initiated
recommendation an officer acts on. This both supports investigation if
something goes wrong and feeds the "AI accuracy" success metrics in
`program_spec.md` §9 (e.g. did officers actually follow the agent's
recommendation).

## 8. LangGraph municipal agent — specific security notes

The agent is a new, distinct attack surface — treat it accordingly:

- **Least privilege**: the agent's data-access tools run against a
  restricted DB role/service account (read-heavy, narrowly-scoped
  writes only where the product explicitly requires them) — it must
  never have the same access as a raw admin DB connection.
- **Prompt-injection resistance**: citizen report text, image-derived
  captions, and any other user-originated content that ends up in the
  agent's context is *data*, not instructions (mirrors `ai_rules.md`
  #10). The agent's system/tool-calling prompt must be structured so
  that content retrieved via tools cannot redefine the agent's
  instructions or trigger unintended tool calls.
- **Output handling**: agent responses shown to officers are
  informational/advisory — no agent output should directly execute a
  privileged action (e.g. dispatching a vehicle, closing an incident)
  without an explicit, separate, authenticated officer confirmation step.
- **Grounding over generation**: prefer the agent citing/quoting real
  queried data over free-generating plausible-sounding numbers — this is
  also a correctness requirement from `program_spec.md` §4.15, not just
  a security one.
- **Query/answer logging**: log agent queries and the data/tools it used
  to answer them (not just the final text) so an officer decision made
  on the agent's advice is traceable later.

## 9. OWASP Top 10 — quick self-check before any phase is marked done

Run this checklist at the end of every phase in `loops.md` Loop B:

- [ ] Broken access control — object-level checks in place (§2)?
- [ ] Cryptographic failures — passwords hashed correctly, TLS on, no
      secrets in code (§1, §4)?
- [ ] Injection — parameterized queries only (SQLAlchemy ORM/params, no
      raw string-built SQL), agent tool calls parameterized (§8)?
- [ ] Insecure design — does this module have an explicit fallback per
      `ai_rules.md` #7, and rate limiting where it accepts user input?
- [ ] Security misconfiguration — CORS, headers, debug mode off in any
      non-local environment?
- [ ] Vulnerable/outdated components — dependency audit clean (§4)?
- [ ] Identification & authentication failures — brute-force protection,
      session handling per §1?
- [ ] Software/data integrity — file upload validation (§3), audit log
      integrity (§7)?
- [ ] Logging & monitoring failures — audit log covers §7's list?
- [ ] SSRF — any server-side fetch triggered by user input (e.g. a URL
      field) validated against an allow-list?

## 10. What "done" looks like for this guide

By the end of Phase 1, authentication, RBAC, and file-upload validation
are fully implemented (not stubbed) for every module built so far. By the
end of Phase 4, the full checklist in §9 passes for the whole platform,
and the LangGraph agent's tool access has been reviewed against §8 before
the demo.
