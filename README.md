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
npm install notiformer
pnpm add notiformer
```

**3. Create a project and copy your API key**

Dashboard → choose your plan → create a project → copy the API key.

```bash
ntf_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Quick start

```ts
import { Notiformer } from "notiformer";

const n = new Notiformer({ apiKey: "ntf_live_..." });

// 🛑 Pause and wait for Approve / Deny — ALWAYS set fallback or handle the throw
try {
  const { approved, timedOut } = await n.ask({
    message: "Deploy v2 to production?",
    context: "Build #442 · 3 services affected",
    timeout: 300,
    fallback: "deny", // ← what to do if nobody responds in time
    //   omit this and a timeout throws NotiformerError
  });
  if (approved) await deploy();
  else console.log(timedOut ? "Timed out — auto-denied" : "Denied");
} catch (err) {
  if (err.code === "timeout") {
    // Nobody responded and no fallback was set — handle explicitly
    console.error("No response. Respond via the app, Telegram, or Slack.");
  }
}

// 🔔 Fire-and-forget alert
await n.event({
  channel: "deployments",
  event: "deploy_complete",
  description: "v2 deployed to production",
  icon: "🚀",
});

// 🚦 Feature flag check
if (await n.gate("new-checkout-flow")) {
  return newCheckout(req);
}
```

> **Tip:** Use `apiKey: 'ntf_live_test'` to get started without a real key. The SDK prints setup instructions and skips all API calls.

---

## Configuration

```ts
const n = new Notiformer({
  apiKey: "ntf_live_...", // required
  throwOnError: true, // default: true — throws on errors instead of returning null
  // note: timeout with no fallback always throws, ignores this flag
  silent: false, // optional — true = no API calls (useful in test/dev)
  onError: (err) => {
    // optional — called on any error
    Sentry.captureException(err);
  },
});

// Silence in local development / tests:
const n = new Notiformer({
  apiKey: process.env.NOTIFORMER_API_KEY!,
  silent: process.env.NODE_ENV !== "production",
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

// ❌ WRONG — missing fallback, no try/catch: throws on timeout, crashes silently
const { approved } = await n.ask({ message: "Send emails?" });
if (approved) await sendEmails(); // ← never reached if it throws
```

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
  description: "$49.00 — john@co.com",
  icon: "💳",
  tags: { plan: "pro", userId: "usr_42" },
  value: "$49.00", // highlighted in the feed
  notify: true, // default true — false = store silently
  recipients: ["cto@company.com"], // optional — notify specific people only
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

> Available on **Pro and Business** plans only.

```ts
const isEnabled = await n.gate("new-checkout-flow");
if (isEnabled) return newCheckout(req);

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

---

## REST API

All SDK methods wrap REST endpoints. Use them from Python, Go, Ruby, curl, or any HTTP client:

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

### Python example

```python
import requests, time

NF_KEY  = "ntf_live_..."
HEADERS = {"Authorization": f"Bearer {NF_KEY}"}

# Create an approval request (with fallback for safety)
r = requests.post(
    "https://api.notiformer.com/v1/ask",
    headers=HEADERS,
    json={"message": "Delete 500 rows?", "timeout": 300, "fallback": "deny"}
)
ask_id = r.json()["id"]

# Poll until resolved
while True:
    poll = requests.get(
        f"https://api.notiformer.com/v1/ask/{ask_id}",
        headers=HEADERS
    ).json()

    # Handle ambiguous timeout (no fallback was set)
    if poll.get("code") == "timeout":
        raise RuntimeError("No response — set a fallback or ensure you can respond in time")

    if poll["status"] != "pending":
        break
    time.sleep(2)

if poll["status"] == "approved":
    db.execute(delete_query)
else:
    print("Cancelled:", poll["status"])
```

---

## Common patterns

### Safe destructive action

```ts
// Always set fallback: 'deny' for anything destructive
const { approved, timedOut } = await n.ask({
  message: `Delete ${count} rows from ${table}?`,
  context: `WHERE: ${condition} · Environment: production`,
  details: `Estimated rows: ${count}\nQuery preview: ${query}`,
  timeout: 120,
  fallback: "deny", // safe — auto-deny if nobody responds
});
if (!approved) throw new Error(timedOut ? "Timed out — auto-denied" : "Denied");
await db.execute(query);
```

### Multi-branch agent decision

```ts
// Always set fallback to the safest option
const { selected } = await n.select({
  message: `Build #${build.id} failed at step ${step}`,
  options: [
    { value: "retry", label: "🔄 Retry from this step" },
    { value: "restart", label: "↩ Restart from scratch" },
    { value: "abort", label: "🛑 Abort pipeline", isDestructive: true },
  ],
  fallback: "abort", // safe — abort if nobody decides
  timeout: 600,
});
```

### Silent analytics

```ts
await n.event({
  channel: "analytics",
  event: "page_view",
  tags: { path: req.path, userId: session.userId },
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
    tags: { path: req.path, method: req.method },
    notify: true,
  });
  res.status(500).json({ error: "Internal server error" });
});
```

---

## Requirements

- Node.js 18+ (uses native `fetch`)
- For Node 16: install `node-fetch` and polyfill `global.fetch`

---

## Links

- **Dashboard:** [app.notiformer.com](https://app.notiformer.com)
- **Docs:** [docs.notiformer.com](https://docs.notiformer.com)
- **Pricing:** [notiformer.com/#pricing](https://notiformer.com/#pricing)
- **npm:** [npmjs.com/package/notiformer](https://www.npmjs.com/package/notiformer)
- **Support:** [hello@notiformer.com](mailto:hello@notiformer.com)
