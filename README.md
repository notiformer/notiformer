# notiformer

Real-time push notifications, approval gates, and feature flags for your AI agents and backend code.

Pause your agent, ask your phone, continue — or fire a one-line alert the moment something important happens.

> **Works everywhere.** Node.js 18+, Next.js, Express, serverless, and any HTTP client.

---

## Get started

**1. Create a free account at [app.notiformer.com](https://app.notiformer.com)**

- No credit card required for the Dev (free) plan
- **You must verify your email address** before you can create projects or use the API. Check your inbox right after sign-up.

**2. Install the package**

```bash
npm install notiformer@latest
```

Prefer pnpm or yarn? Use `pnpm add notiformer@latest` or `yarn add notiformer@latest` instead — you only need one of these, not all three.

**3. Create a project and copy your API key**

Dashboard (app.notiformer.com) → Projects → Create a Project → Copy the API key.

```
ntf_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Every project's default key is **private** (`ntf_live_...`), meant for
server-side code — full access to all four methods. If you need to call
Notiformer directly from a browser or other public client, create a
**public** key instead — see **API keys: public vs private** below before you do.

---

## API keys: public vs private

<details>
<summary><strong>Click to expand — key scopes, domain behavior, rate limits, and kill switch</strong></summary>

You choose a key's scope **once, at creation** — it can never be widened
afterward (only narrowed, e.g. adding a domain restriction, or disabled
entirely). For broader access, create a new key.

|                      | `ntf_live_...` (private)                                             | `ntf_pub_...` (public)               |
| -------------------- | -------------------------------------------------------------------- | ------------------------------------ |
| Use in               | server / backend code                                                | browser, public JS/HTML on your site |
| Can call             | `event()`, `ask()`, `select()`, `gate()`                             | **`event()` only**                   |
| Shown in dashboard   | full value once, at creation only — masked (last 4 chars) after that | always shown in full                 |
| Scope after creation | fixed — never widened                                                | fixed — never widened                |

This is enforced **server-side on every request**, not just hidden in the
dashboard UI — a public key calling `ask()`, `select()`, or `gate()` gets
`403 Forbidden`, regardless of what's calling it (this SDK, a raw GET URL,
anything).

Existing `ntf_live_...` keys are unaffected by any of this — same full
access as always, nothing to migrate.

### Using a public key safely in client-side code

```html
<script>
  fetch("https://api.notiformer.com/v1/events", {
    method: "POST",
    headers: {
      Authorization: "Bearer ntf_pub_...", // safe to expose — this key can only call event()
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: "leads", event: "form_submitted" }),
  });
</script>
```

### Domain behavior for public keys

- **Default ("monitor mode"):** any domain can call a public key
  immediately — paste it into your site, it works. Every new domain seen
  is just logged for visibility in the dashboard, never blocked.
- **Opt-in strict whitelist:** enable it on a specific key in the
  dashboard, and from then on only explicitly approved domains go
  through. Everything else gets a silent `202 { ok: true }` response — no
  visible error, the event just isn't created. This is intentional: a
  public key should never break the site calling it with a visible error.
- Origin/Referer headers can be spoofed by anything that isn't a real
  browser — this is documented honestly as protection against **mass or
  accidental abuse**, not as strong authentication.

### Rate limits specific to public keys

In addition to the existing project-level limits:

| Level                           | Limit                                  | Behavior over the limit                   |
| ------------------------------- | -------------------------------------- | ----------------------------------------- |
| Project (existing, all keys)    | 500 event()/month, 60/min              | event saved, notification skipped         |
| Per domain (public keys only)   | 20/min, ~half the plan's monthly quota | event silently dropped (202, no error)    |
| Per key + IP (public keys only) | 10/min                                 | event silently dropped (202, no error)    |
| New domains tracked             | 20/day/key                             | beyond that: only counted, never blocking |
| New-domain digest push          | max 1 every 15 min / project           | —                                         |

A `202 { ok: true }` response from a public key does **not** guarantee the
notification was actually sent — that's intentional, so a misconfigured or
rate-limited public key never breaks the site calling it.

### Kill switch

Any key, public or private, can be disabled instantly from the dashboard.
There's no server-side cache — the effect is immediate on the very next
request, not "within a few seconds."

</details>

---

## Quick start

Create the client once, then use any of the four methods below.

```ts
import { Notiformer } from "notiformer";

const n = new Notiformer({
  apiKey: "ntf_live_...", // required: your project's API key, from the dashboard
  silent: false, // optional: true = skip every API call locally and return safe defaults — handy in tests/dev (default: false)
  throwOnError: true, // optional: false = return a safe default instead of throwing on failure (default: true)
  onError: (err) => {}, // optional: called on every failed call — e.g. forward to Sentry (default: none)
});
```

> More on `throwOnError`, `silent`, and `onError` in **[Advanced config](#advanced-config)** below.

### `event()` — A simple notification

Fire-and-forget. Your code continues immediately — no waiting, no approval needed. This example posts a single test notification to your own sandbox channel and yourself — nothing goes out to your whole team.

```ts
await n.event({
  channel: "sandbox", // required: groups related notifications — auto-created on first use
  event: "connection_verified", // required: machine-readable event name
  description: "Your Notiformer setup is working perfectly!", // optional: shown in the notification body (max 500 characters, truncated beyond that)
  icon: "🎉", // optional: emoji shown next to the notification
  tags: ["test", "quickstart"], // optional: simple string labels, filterable in the dashboard (max 10 tags, 50 characters each — extra ones are silently dropped)
  items: [
    // optional: structured facts to show instead of/alongside `description` — great for
    // a variable-length list of details (order lines, request params, related links).
    // Max 10 items; name required (entries missing one are silently skipped, no error);
    // value is string|number|boolean|null (never undefined — use null if you have nothing to show);
    // link is optional and auto-normalized to a full https:// URL (bare domains/"www." both work).
    { name: "Status", value: "Connected" },
    { name: "Documentation", value: null, link: "docs.notiformer.com" },
  ],
  value: "Ready", // optional: highlighted value shown in the feed
  notify: true, // optional: false = store silently, no push sent (default: true)
  recipients: ["you@example.com"], // optional: notify specific people only — default: everyone on the project (max recipients per event: Dev/Pro 1, Business 3, Custom unlimited)
});
```

> **`items` is the field to reach for when an AI agent has a list of facts to report** —
> line items, changed fields, request parameters, related URLs — rather than trying to
> squeeze everything into one `description` string. Each entry renders as a labeled
> field in the app, Slack, and Telegram, and turns into a clickable button wherever a
> `link` is set.

### `ask()` — Stop and approve

Pause your code and wait for a human to **Approve or Deny** from the Notiformer app, Telegram Bot, or Slack Bot. **This is a blocking call.** This example just confirms your setup is wired up correctly — a single one-off notification, not a production approval.

```ts
const { approved, timedOut, respondedAt } = await n.ask({
  message: "Did you receive this test notification?", // required: shown as the notification title
  timeout: 300, // optional: seconds to wait before giving up (default: 300; max: Dev 300s, Pro/Business 900s)
  fallback: "deny", // optional, but strongly recommended: 'deny' | 'approve' — used if nobody responds in time. Omit it and a timeout throws NotiformerError instead
  context: "Quickstart Verification · Step 1 of 1", // optional: shown in the notification body (max 500 chars)
  details: "Click 'Approve' to confirm your integration is working properly.", // optional: long-form text shown in the app (max 10,000 chars)
});

if (approved) console.log("Setup confirmed!");
```

> ⚠️ If nobody responds and no `fallback` was set, this **throws** `NotiformerError { code: 'timeout' }` — always, even with `throwOnError: false`. See the full **`ask()`** section further down for why, and for safe patterns.

### `select()` — Stop and choose an option

Like `ask()`, but the user picks one of **2–6 custom options** instead of Approve/Deny. Same timeout rule as `ask()`. Same idea here — a quick sandbox check of the choice payload, not a real decision.

```ts
const { selected, timedOut, respondedAt } = await n.select({
  message: "How is your testing going?", // required: shown as the notification title
  options: [
    // required: 2 to 6 options
    { value: "smooth", label: "🚀 Smooth sailing" }, // value: required, returned when this option is picked · label: required, button text shown to the user
    { value: "reading_docs", label: "📚 Reading docs" },
    { value: "stop_test", label: "🛑 Stop testing", isDestructive: true }, // isDestructive: optional — renders the button in red (default: false)
  ],
  timeout: 300, // optional: same limits as ask() (default: 300)
  fallback: "reading_docs", // optional, but recommended: must match one of the option values above. Omit it and a timeout throws
  context: "Interactive Sandbox Test", // optional: shown in the notification body (max 500 chars)
  details:
    "Select an option above to test how choice payload responses work in your code.", // optional: long-form text shown in the app (max 10,000 chars)
});
```

### `gate()` — Get a remote variable

A boolean feature flag you toggle from the dashboard — no redeploy needed. **Never throws.**

> Available on **all plans**, including Dev (free). What changes per plan is how many gates you can have _active_ at once: Dev 2 · Pro 5 · Business 30 · Custom unlimited.

```ts
const isEnabled = await n.gate("enable-debug-logs", {
  fallback: false, // optional: value returned if the gate can't be fetched, e.g. on a network error (default: false)
  cacheTtl: 60, // optional: local in-memory cache duration in seconds — 0 always reads fresh from the server (default: 0)
});

if (isEnabled) {
  console.log("Debug mode active");
}
```

---

## Advanced config

The three optional constructor settings, in more depth:

```ts
const n = new Notiformer({
  apiKey: "ntf_live_...",

  // throwOnError (default: true)
  // - true:  event()/gate()'s underlying calls raise NotiformerError on failure
  // - false: they resolve to null / the fallback value instead of throwing
  // NOTE: this does NOT apply to ask()/select() timing out with no fallback —
  // that always throws regardless of throwOnError. See the ask() section.
  throwOnError: true,

  // silent (default: false)
  // true = every method skips the network call entirely and returns a safe
  // default (event() -> null, ask()/select() -> not approved/selected,
  // gate() -> fallback). Useful so test suites and local dev don't spend
  // quota or need a real key at all.
  silent: process.env.NODE_ENV !== "production",

  // onError (default: none)
  // Called with the NotiformerError on every failure, in addition to (not
  // instead of) throwing/returning a default — good for centralized
  // logging regardless of how each call site handles the error locally.
  onError: (err) => {
    Sentry.captureException(err);
  },
});
```

> **Tip:** Use `apiKey: 'ntf_live_test'` to try the SDK without a real key. It prints setup instructions and skips all API calls — safe to run as-is, and a quick way to see `silent`-like behavior without setting it explicitly.

### Combining methods — a few realistic patterns

**Defense in depth: gate() _and_ ask() for a risky rollout**

```ts
// Only offer the new flow at all if it's toggled on — then still require
// a human to approve rolling it out to this specific customer.
if (await n.gate("new-billing-flow")) {
  const { approved } = await n.ask({
    message: `Enable new billing flow for ${customer.name}?`,
    context: `Customer ID: ${customer.id} · MRR: $${customer.mrr}`,
    fallback: "deny",
  });
  if (approved) await enableNewBillingFlow(customer);
}
```

**Audit trail: log the outcome of a select() as an event()**

```ts
const { selected } = await n.select({
  message: `Build #${build.id} failed at step ${step}`,
  options: [
    { value: "retry", label: "🔄 Retry from this step" },
    { value: "abort", label: "🛑 Abort pipeline", isDestructive: true },
  ],
  fallback: "abort",
});

// Keep a silent record in the feed regardless of what was chosen
await n.event({
  channel: "ci",
  event: "pipeline_decision",
  description: `Build #${build.id}: ${selected}`,
  notify: false,
});

if (selected === "retry") await retryStep();
if (selected === "abort") await abortPipeline();
```

**Per-environment client: real in prod, silent everywhere else**

```ts
const n = new Notiformer({
  apiKey: process.env.NOTIFORMER_API_KEY!,
  silent: process.env.NODE_ENV !== "production",
  onError: (err) => logger.error("notiformer", err),
});
```

---

## `ask()` — Approval gate (Approve / Deny)

Pause your code and wait for a **human to approve or deny** from the Notiformer app, Telegram Bot, or Slack Bot. **This is a blocking call.**

### ⚠️ Critical: timeout without a fallback throws

If nobody responds in time and you did not set `fallback`, the SDK throws `NotiformerError { code: 'timeout' }` — **always**, even with `throwOnError: false`. This is intentional: silently proceeding when no human has actually decided is exactly what causes incidents like "my agent sent 300k emails because nobody had time to respond."

You have two options:

- Set `fallback: 'deny'` (recommended for destructive actions) for automatic safe resolution
- Omit `fallback` and handle the thrown error explicitly in a `try/catch`

```ts
// ✅ Option A — safe automatic fallback
const { approved, timedOut } = await n.ask({
  message: "Send Black Friday campaign to 3,241 users?",
  context: "Campaign ID: bf-2025 · segment A",
  details: "Subject: Black Friday Sale\nEstimated revenue: $48,000",
  timeout: 300, // seconds to wait (default: 300)
  fallback: "deny", // auto-deny on timeout — SAFE for destructive actions
});

if (approved) await sendEmails();
else console.log(timedOut ? "Auto-denied (timed out)" : "Denied by human");
```

```ts
// ✅ Option B — explicit error handling, no silent defaults
try {
  const { approved } = await n.ask({
    message: "Delete 50,000 rows from production?",
    timeout: 120,
    // no fallback — throws if nobody responds
  });
  if (approved) await db.execute(deleteQuery);
} catch (err) {
  if (err.code === "timeout") {
    // Nobody responded — abort and alert.
    // You can respond via: Notiformer App · Telegram Bot · Slack Bot
    await alertTeam("Approval timed out — action aborted");
  }
  throw err;
}
```

> ❌ **Don't copy this one** — missing `fallback` **and** no `try/catch`. It throws on timeout and will crash your process unless something upstream catches it. Shown here only to illustrate the mistake, not as something to paste into your code:
>
> ```ts
> const { approved } = await n.ask({ message: "Send emails?" });
> if (approved) await sendEmails(); // ← never reached if it throws
> ```

### Parameters

| Parameter  | Type                | Default | Description                                                                                                            |
| ---------- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------- |
| `message`  | `string`            | —       | **Required.** Question shown as the notification title.                                                                |
| `fallback` | `'deny'\|'approve'` | none    | What to do automatically when `timeout` expires. **If omitted, timeout throws `NotiformerError { code: 'timeout' }`**. |
| `timeout`  | `number`            | `300`   | Seconds to wait. Max: Dev 300s · Pro/Business 900s.                                                                    |
| `context`  | `string`            | —       | Optional detail shown in the notification body. Max 500 chars.                                                         |
| `details`  | `string`            | —       | Optional long-form text shown in the app. Supports `\n`. Max 10,000 chars.                                             |

### Return value

| Field         | Type             | Description                                                            |
| ------------- | ---------------- | ---------------------------------------------------------------------- |
| `approved`    | `boolean`        | `true` if human approved, or `fallback: 'approve'` was used on timeout |
| `timedOut`    | `boolean`        | `true` if nobody responded before the timeout expired                  |
| `respondedAt` | `string \| null` | ISO timestamp of the human response, or `null` if timed out            |

Or throws `NotiformerError { code: 'timeout' }` if no fallback was set and nobody responded.

---

## `select()` — Multi-option gate

Like `ask()`, but the user picks from **2–6 custom options** instead of Approve/Deny. **Same timeout behavior**: omitting `fallback` throws on timeout.

Uses the same monthly quota as `ask()`.

```ts
// ✅ With fallback — safe automatic resolution
try {
  const { selected, timedOut } = await n.select({
    message: "How should the agent handle the error?",
    options: [
      // required — min 2, max 6
      { value: "retry", label: "🔄 Retry the request" },
      { value: "skip", label: "⏭ Skip and continue" },
      { value: "stop", label: "🛑 Stop the pipeline", isDestructive: true },
    ],
    context: "Step 4/10 failed — HTTP 503",
    timeout: 300,
    fallback: "stop", // ← if nobody responds, stop (safe for pipelines)
    //   omit → throws NotiformerError { code: 'timeout' }
  });

  if (selected === "retry") await retryStep();
  if (selected === "skip") await nextStep();
  if (selected === "stop") await abort();
} catch (err) {
  if (err.code === "timeout") {
    // No response and no fallback was set — stop safely
    await abort();
  }
}
```

### Parameters

| Parameter  | Type             | Default | Description                                                                                                   |
| ---------- | ---------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| `message`  | `string`         | —       | **Required.** Question shown as the notification title.                                                       |
| `options`  | `SelectOption[]` | —       | **Required.** Min 2, max 6. Each option: `value` (returned), `label` (button text), optional `isDestructive`. |
| `fallback` | `string`         | none    | Option value to use on timeout. Must exactly match one of the option values. **If omitted, timeout throws.**  |
| `timeout`  | `number`         | `300`   | Seconds to wait. Same plan limits as `ask()`.                                                                 |
| `context`  | `string`         | —       | Optional notification body text. Max 500 chars.                                                               |
| `details`  | `string`         | —       | Optional long-form text shown in the app. Max 10,000 chars.                                                   |

### Return value

| Field         | Type             | Description                                                  |
| ------------- | ---------------- | ------------------------------------------------------------ |
| `selected`    | `string \| null` | Value of chosen option, or the `fallback` value if timed out |
| `timedOut`    | `boolean`        | `true` if nobody responded in time                           |
| `respondedAt` | `string \| null` | ISO timestamp, or `null` if timed out                        |

Or throws `NotiformerError { code: 'timeout' }` if no fallback was set and nobody responded.

---

## `event()` — Fire-and-forget alert

Send a push notification. Your code continues immediately — no waiting.

```ts
await n.event({
  channel: "payments", // required — auto-created on first use
  event: "payment_success", // required — machine-readable event name
  description: "$49.00 — john@co.com", // optional — max 500 characters, truncated beyond that
  icon: "💳",
  tags: ["pro-plan", "usr_42"], // optional — simple string labels, max 10 tags of 50 characters each (extras dropped, not an error)
  items: [
    // optional — structured name/value/link facts; use for a list of details rather
    // than one description string. name required (missing → entry silently skipped),
    // value is string|number|boolean|null (use null instead of omitting it),
    // link auto-normalized to https:// (bare domains/"www." both accepted).
    // Max 10 items, name ≤60 chars, string value ≤200 chars, link ≤500 chars.
    { name: "Order #", value: "8842" },
    { name: "Invoice", value: null, link: "billing.example.com/inv/8842" },
  ],
  value: "$49.00", // highlighted in the feed
  notify: true, // default true — false = store silently
  recipients: ["cto@company.com"], // optional — notify specific people only (max: Dev/Pro 1, Business 3, Custom unlimited)
});
```

`event()` never throws by default regardless of `throwOnError`. A failed notification will never crash your app.

### Monthly quotas

| Plan     | Included / cycle | Overage         |
| -------- | ---------------- | --------------- |
| Dev      | 500 (hard stop)  | none            |
| Pro      | 5,000            | $0.0005 / event |
| Business | 50,000           | $0.0003 / event |
| Custom   | Negotiated       | Negotiated      |

Rate limit: 60 events/minute per project (`rateLimited: true` in response if exceeded).

---

## `gate()` — Feature flags

Toggle features remotely from the dashboard — no redeploy needed. Always reads fresh from the server; the SDK has an optional local in-memory cache only.

> Available on **all plans**, including Dev (free). What changes per plan is how many gates you can have _active_ at once — see the table below.

```ts
const isEnabled = await n.gate("new-checkout-flow");
if (isEnabled) return newCheckout(req);
```

```ts
// With options:
const isEnabled = await n.gate("my-gate", {
  fallback: false, // returned if the gate can't be fetched (default: false)
  cacheTtl: 60, // local in-memory cache in seconds (default: 0 — always fresh)
});

// Full details:
const result = await n.gateDetails("my-gate");
// { key: 'my-gate', enabled: true, cached: false }

// Clear local cache:
n.clearGateCache("my-gate");
n.clearGateCache();
```

| Plan     | Max active gates / project |
| -------- | -------------------------- |
| Dev      | 2                          |
| Pro      | 5                          |
| Business | 30                         |
| Custom   | Unlimited                  |

---

## Error handling

```ts
import { NotiformerError } from "notiformer";

const n = new Notiformer({ apiKey: "ntf_live_...", throwOnError: true });

try {
  const { approved } = await n.ask({
    message: "Delete records?",
    timeout: 120,
    // no fallback → throws if nobody responds
  });
  if (approved) await deleteRecords();
} catch (err) {
  if (err instanceof NotiformerError) {
    switch (err.code) {
      case "timeout":
        // Nobody responded in time, no fallback was configured.
        // Respond via: Notiformer App · Telegram Bot · Slack Bot
        console.error("No response — action aborted.");
        break;
      case "cap_reached":
        // Monthly quota exhausted. Resets at err.cycleResetsAt.
        console.error("Quota reached. Resets:", err.cycleResetsAt);
        break;
      case "card_required":
      case "card_locked":
        // Pro/Business only — Dev plan never receives this.
        console.error("Payment issue:", err.manageUrl);
        break;
      case "network":
        console.error("Network error — check your connection.");
        break;
    }
  }
}
```

### Error codes

| Code                    | HTTP | When                                                                   |
| ----------------------- | ---- | ---------------------------------------------------------------------- |
| `timeout`               | 408  | `ask()`/`select()` timed out with no fallback set and nobody responded |
| `cap_reached`           | 402  | Dev hard quota or Pro/Business overage safety cap reached this cycle   |
| `card_required`         | 402  | Pro/Business: no payment method on file (Dev plan never receives this) |
| `card_locked`           | 402  | Pro/Business: card declined and grace period expired                   |
| `feature_not_available` | 403  | Feature requires a higher plan                                         |
| `invalid_api_key`       | 401  | Missing or invalid API key                                             |
| `rate_limited`          | 429  | Event rate limit (60/min per project)                                  |
| `network`               | —    | Cannot reach the API                                                   |

---

## Plans & quotas

| Feature                  | Dev         | Pro          | Business       | Custom     |
| ------------------------ | ----------- | ------------ | -------------- | ---------- |
| **Price**                | Free        | $4.99 / mo   | $29.99 / mo    | Contact us |
| **Credit card required** | ✗ No        | ✓ Yes        | ✓ Yes          | ✓ Yes      |
| **ask() + select()**     | 15 / cycle  | 100 incl.    | 1,500 incl.    | Custom     |
| **ask() overage**        | Hard stop   | $0.03 / call | $0.02 / call   | —          |
| **event()**              | 500 / cycle | 5,000 incl.  | 50,000 incl.   | Custom     |
| **event() overage**      | Hard stop   | $0.0005 / ev | $0.0003 / ev   | —          |
| **Email via relay**      | —           | 150 incl.    | 2,500 incl.    | Custom     |
| **Feature gates**        | 2           | 5            | 30             | Unlimited  |
| **Projects**             | 1           | 2            | 3              | Unlimited  |
| **Team members**         | Owner only  | Owner only   | 3 per project  | Custom     |
| **Push devices / user**  | 2           | 3            | 5              | Unlimited  |
| **Max ask() timeout**    | 5 min       | 15 min       | 15 min         | 60 min     |
| **Overage safety cap**   | —           | $500 / cycle | $2,000 / cycle | —          |

> **Email verification required** on all plans. You must verify your email address before creating projects or using the API.

### Field limits

Every free-text/array field is capped. Exceeding a limit below never errors the whole
request — the field is silently truncated or, for `items` entries missing a `name`,
that one entry is dropped. The only fields that DO return a validation error when
invalid are `channel`, `event`, `recipients` (must be valid emails), and the
`recipients` count (enforced per-plan, see the table above).

| Field                        | Limit                          | Behavior beyond the limit                                                                               |
| ---------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `description`                | 500 characters                 | Truncated                                                                                               |
| `icon`                       | 10 characters                  | Truncated                                                                                               |
| `tags` (array)               | 10 entries, 50 characters each | Extra entries dropped, long ones truncated                                                              |
| `items` (array)              | 10 entries                     | Extra entries dropped                                                                                   |
| `items[].name`               | 60 characters, **required**    | Entry silently skipped if missing/blank                                                                 |
| `items[].value`              | 200 characters if a string     | Truncated (never send `undefined` — use `null`)                                                         |
| `items[].link`               | 500 characters                 | Dropped if invalid or too long (rest of the entry still saves)                                          |
| `ask()`/`select()` `message` | 300 characters                 | Truncated                                                                                               |
| `ask()`/`select()` `context` | 500 characters                 | Truncated                                                                                               |
| `ask()`/`select()` `details` | 10,000 characters              | Truncated — only ever stored/shown in-app, never sent to push/Telegram/Slack                            |
| Push notification title/body | ~100 / ~300 characters         | Truncated server-side regardless of the above, as a hard safety net against APNs/FCM's ~4KB payload cap |

---

## REST API

All SDK methods wrap REST endpoints. Use them from Python, Go, Ruby, curl, or any HTTP client — or see the **[official Python SDK](https://pypi.org/project/notiformer/)** for a ready-made client:

```
POST  https://api.notiformer.com/v1/events       — n.event()
POST  https://api.notiformer.com/v1/ask          — n.ask() create
GET   https://api.notiformer.com/v1/ask/:id      — n.ask() poll
POST  https://api.notiformer.com/v1/select       — n.select() create
GET   https://api.notiformer.com/v1/select/:id   — n.select() poll
GET   https://api.notiformer.com/v1/gates/:key   — n.gate()
GET   https://api.notiformer.com/v1/health       — status check
```

All endpoints require `Authorization: Bearer ntf_live_...`.

**Important for polling ask/select:** if `GET /v1/ask/:id` returns `HTTP 408` with `{ "code": "timeout" }`, it means the request expired with no fallback configured — treat this as an error, not a normal resolution.

A full, importable **Postman collection** (with a matching environment) covering every endpoint above is available from the [docs](https://notiformer.com/docs#postman).

---

## Common patterns

### Silent analytics

```ts
await n.event({
  channel: "analytics",
  event: "page_view",
  items: [
    { name: "path", value: req.path },
    { name: "userId", value: session.userId ?? null },
  ],
  notify: false, // stored in feed, no push notification
});
```

### Error alert

```ts
app.use(async (err, req, res, next) => {
  await n.event({
    channel: "errors",
    event: "unhandled_error",
    description: err.message,
    icon: "🔴",
    items: [
      { name: "path", value: req.path },
      { name: "method", value: req.method },
    ],
    notify: true,
  });
  res.status(500).json({ error: "Internal server error" });
});
```

> More combined examples (gate + ask, select + event, per-environment client) are in **[Advanced config](#advanced-config)** above.

---

## Requirements

- Node.js 18+ (uses native `fetch`)
- For Node 16: install `node-fetch` and polyfill `global.fetch`

---

## Links

- **Dashboard:** [app.notiformer.com](https://app.notiformer.com)
- **Docs:** [notiformer.com/docs](https://notiformer.com/docs)
- **Pricing:** [notiformer.com/#pricing](https://notiformer.com/#pricing)
- **npm:** [npmjs.com/package/notiformer](https://www.npmjs.com/package/notiformer)
- **PyPI (Python SDK):** [pypi.org/project/notiformer](https://pypi.org/project/notiformer/)
- **GitHub:** [github.com/notiformer](https://github.com/notiformer)
- **Support:** [hello@notiformer.com](mailto:hello@notiformer.com)
