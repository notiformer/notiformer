# notiformer

Real-time push notifications, approval gates, and feature flags for your code.

Pause your AI agent, ask your phone, and continue — or fire a one-line alert the moment something important happens.

> **Works everywhere.** Node.js, Express, Next.js, serverless functions, Python, Go, or any HTTP client.

---

## Install

```bash
npm install notiformer
```

---

## Quick start

```ts
import { Notiformer } from "notiformer";

const n = new Notiformer({
  apiKey: "ntf_live_...", // from app.notiformer.com/projects
});

// 🛑 Block and wait for approval
const { approved } = await n.ask({
  message: `Deploy v2 to production?`,
  context: "Build #442 · 3 services affected",
  timeout: 300,
});
if (approved) await deploy();

// 🔀 Block and wait for a choice from multiple options
const { selected } = await n.select({
  message: "How to handle the failed payment?",
  options: [
    { value: "retry", label: "🔄 Retry in 1 hour" },
    { value: "notify", label: "📧 Notify the customer" },
    { value: "cancel", label: "✕ Cancel the order", isDestructive: true },
  ],
  fallback: "notify",
  timeout: 300,
});
if (selected === "retry") await scheduleRetry();

// 🔔 Fire-and-forget alert
await n.event({
  channel: "payments",
  event: "payment_success",
  description: "$49.00 — john@example.com",
  icon: "💳",
  value: "$49.00",
  notify: true,
});

// 🚦 Feature gate check (cached 30s)
if (await n.gate("new-checkout-flow")) {
  return newCheckout(req);
}
```

> **Tip:** Use `apiKey: 'ntf_live_test'` to get started without a real key. The SDK prints setup instructions and skips all API calls.

---

## Get your API key

1. Go to [app.notiformer.com](https://app.notiformer.com) and create a free account
2. Create a project
3. Copy the API key from the project overview

---

## Configuration

```ts
const n = new Notiformer({
  apiKey: "ntf_live_...", // required
  silent: false, // optional — true = no API calls (great for local dev)
  throwOnError: false, // optional — true = throws instead of returning null
  onError: (err) => {
    // optional — called on any failure
    Sentry.captureException(err);
  },
});

// Silence in local development
const n = new Notiformer({
  apiKey: process.env.NOTIFORMER_API_KEY!,
  silent: process.env.NODE_ENV !== "production",
});
```

---

## `ask()` — Approval gate (binary)

Pause your code and wait for a **human to approve or deny** from the Notiformer app. The `Promise` resolves when you respond, or when the timeout expires.

> **This is a blocking call.** Your agent stops at `await n.ask()` and waits.

```ts
const { approved, timedOut, respondedAt } = await n.ask({
  message: "Send campaign to 3,241 users?", // required — shown as notification title
  context: "Campaign: Black Friday · segment A", // optional — shown in notification body
  details: "Full changelog:\n• Fix auth bug", // optional — shown in app detail screen, supports \n
  timeout: 300, // optional — seconds to wait (default: 300)
  fallback: "deny", // optional — 'deny' | 'approve' on timeout (default: 'deny')
});

if (approved) {
  await sendEmails();
} else {
  console.log(timedOut ? "Timed out" : "Denied");
}
```

### Return value

| Field         | Type             | Description                                           |
| ------------- | ---------------- | ----------------------------------------------------- |
| `approved`    | `boolean`        | `true` if the user tapped Approve                     |
| `timedOut`    | `boolean`        | `true` if nobody responded before the timeout         |
| `respondedAt` | `string \| null` | ISO timestamp of the response, or `null` if timed out |

### Plan limits

| Plan     | Gates/month       | Max timeout |
| -------- | ----------------- | ----------- |
| Free     | — (not available) | —           |
| Starter  | 200               | 5 min       |
| Pro      | 2,000             | 15 min      |
| Business | 20,000            | 60 min      |

---

## `select()` — Approval gate (multi-option)

Like `ask()`, but instead of Approve/Deny the user picks from **2–6 custom options**. Returns the `value` string of the chosen option.

Uses the same monthly quota as `ask()`.

```ts
const { selected, timedOut, respondedAt } = await n.select({
  message: "How should the agent handle the error?", // required
  options: [
    // required — min 2, max 6
    { value: "retry", label: "🔄 Retry the request" },
    { value: "skip", label: "⏭ Skip and continue" },
    { value: "stop", label: "🛑 Stop the pipeline", isDestructive: true },
  ],
  context: "Step 4/10 failed — HTTP 503 from payments API", // optional
  details: "Error: Connection timeout\nEndpoint: /v2/charge\nRetries: 3",
  timeout: 300, // optional — seconds (default: 300)
  fallback: "skip", // optional — value to return on timeout (must match an option)
});

if (selected === "retry") await retryStep();
if (selected === "skip") await nextStep();
if (selected === "stop") await abort();
```

### Return value

| Field         | Type             | Description                                                                                      |
| ------------- | ---------------- | ------------------------------------------------------------------------------------------------ |
| `selected`    | `string \| null` | The value of the chosen option, or the fallback on timeout. `null` if timed out with no fallback |
| `timedOut`    | `boolean`        | `true` if nobody responded in time                                                               |
| `respondedAt` | `string \| null` | ISO timestamp of the response                                                                    |

### Option shape

```ts
interface SelectOption {
  value: string; // returned in result.selected — max 50 chars
  label: string; // button text in the app — max 80 chars, supports emoji
  isDestructive?: boolean; // if true, button is styled in red
}
```

### Validation rules (enforced at call time)

- At least 2 options, maximum 6
- `fallback` must match one of the option `value` strings exactly
- Each `value` max 50 chars, each `label` max 80 chars

---

## `event()` — Fire-and-forget alert

Send an event notification. Never throws by default.

```ts
await n.event({
  channel: "payments", // required — auto-created on first use
  event: "payment_success", // required — machine-readable event name
  description: "$49.00 — john@co.com", // optional — shown in notification + feed
  icon: "💳", // optional — emoji
  tags: { plan: "pro" }, // optional — metadata shown in feed
  value: "$49.00", // optional — highlighted value in feed
  notify: true, // optional — true = push notification (default)
  recipients: ["you@company.com"], // optional — notify specific people only
});
```

### `notify` behaviour

| Value            | Behaviour                                   |
| ---------------- | ------------------------------------------- |
| `true` (default) | Sends push to subscribed members            |
| `false`          | Stores the event silently — no notification |

### Return value

```ts
const result = await n.event({ ... });
// result is null if the call failed (never throws by default)
// result.id          → event ID
// result.createdAt   → ISO timestamp
// result.rateLimited → true if >60 events/min (event stored, notification skipped)
```

### Recipients

By default, all project members subscribed to the channel are notified. Use `recipients` to target specific people:

```ts
await n.event({
  channel: "sales",
  event: "enterprise_signup",
  notify: true,
  recipients: ["cto@company.com"], // only this person gets the push
});
```

| Plan     | Max recipients per event |
| -------- | ------------------------ |
| Free     | 1                        |
| Starter  | 3                        |
| Pro      | 10                       |
| Business | 30                       |

### Monthly event quotas

| Plan     | Events/month |
| -------- | ------------ |
| Free     | 500          |
| Starter  | 20,000       |
| Pro      | 75,000       |
| Business | 300,000      |

Rate limit: 60 events/minute per project. If exceeded, the event is stored but no notification is sent (`rateLimited: true` in the response).

---

## `gate()` — Feature flags

Toggle features remotely from the dashboard — no redeploy needed. Results are **cached locally for 30 seconds** by default.

> Available on **Pro and Business** plans only.

```ts
const isEnabled = await n.gate("new-checkout-flow");

if (isEnabled) {
  return newCheckout(req);
} else {
  return legacyCheckout(req);
}
```

### Options

```ts
const isEnabled = await n.gate("my-gate", {
  fallback: false, // returned if the gate can't be fetched (default: false)
  cacheTtl: 60, // local cache in seconds (default: 30)
});

// Full result with metadata
const result = await n.gateDetails("my-gate");
// { key: 'my-gate', enabled: true, cached: false, fetchedAt: '...' }

// Cache management
n.clearGateCache("my-gate"); // clear one gate
n.clearGateCache(); // clear all gates
```

| Plan     | Gate limit per project |
| -------- | ---------------------- |
| Free     | Not available          |
| Starter  | Not available          |
| Pro      | 50 gates               |
| Business | 500 gates              |

---

## When quota is exceeded

When you hit your monthly limit, the API returns HTTP 429 with an `upgradeUrl` field pointing to a direct Stripe Checkout for the next plan:

```ts
// The SDK logs this automatically:
// [notiformer] Plan limit reached. Upgrade your plan to continue:
// → https://api.notiformer.com/v1/upgrade?plan=pro&uid=...&email=...

// You can also handle it yourself:
const n = new Notiformer({
  apiKey: "ntf_live_...",
  onError: (err) => {
    if (err.message.includes("quota")) {
      notifyAdmin("Notiformer quota exceeded");
    }
  },
});
```

---

## REST API

All SDK methods wrap REST endpoints. Use them from any language:

```
POST   https://api.notiformer.com/v1/events       — n.event()
POST   https://api.notiformer.com/v1/ask          — n.ask() create
GET    https://api.notiformer.com/v1/ask/:id      — n.ask() poll
POST   https://api.notiformer.com/v1/select       — n.select() create
GET    https://api.notiformer.com/v1/select/:id   — n.select() poll
GET    https://api.notiformer.com/v1/gates/:key   — n.gate()
GET    https://api.notiformer.com/v1/health       — status check
```

All endpoints require `Authorization: Bearer ntf_live_...`.

### Python example

```python
import requests, time

NF_KEY  = "ntf_live_..."
HEADERS = {"Authorization": f"Bearer {NF_KEY}"}

# Create an approval request
r = requests.post(
    "https://api.notiformer.com/v1/ask",
    headers=HEADERS,
    json={"message": "Delete 500 rows?", "timeout": 300}
)
ask_id = r.json()["id"]

# Poll until resolved
while True:
    poll = requests.get(
        f"https://api.notiformer.com/v1/ask/{ask_id}",
        headers=HEADERS
    ).json()
    if poll["status"] != "pending":
        break
    time.sleep(2)

if poll["status"] == "approved":
    db.execute(delete_query)
```

---

## Common patterns

### AI agent guard

```ts
// Stop the agent before any destructive action
const { approved } = await n.ask({
  message: `Agent wants to delete ${count} records`,
  context: `Table: ${table} · Environment: production`,
  details: `WHERE clause: ${query}\nEstimated rows: ${count}`,
  timeout: 120,
  fallback: "deny",
});
if (!approved) throw new Error("Action denied by human");
```

### Multi-step decision

```ts
const { selected } = await n.select({
  message: `Build #${build.id} failed at step ${step}`,
  options: [
    { value: "retry", label: "🔄 Retry from this step" },
    { value: "restart", label: "↩ Restart from scratch" },
    { value: "abort", label: "🛑 Abort pipeline", isDestructive: true },
  ],
  fallback: "abort",
  timeout: 600,
});
```

### Silent analytics

```ts
await n.event({
  channel: "analytics",
  event: "page_view",
  tags: { path: req.path, userId: session.userId },
  notify: false, // stored in feed, no push
});
```

### Error alert with context

```ts
app.use(async (err, req, res, next) => {
  await n.event({
    channel: "errors",
    event: "unhandled_error",
    description: err.message,
    icon: "🔴",
    tags: { path: req.path, method: req.method, status: 500 },
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
- **Status:** [status.notiformer.com](https://status.notiformer.com)
- **Pricing:** [notiformer.com/#pricing](https://notiformer.com/#pricing)
- **npm:** [npmjs.com/package/notiformer](https://www.npmjs.com/package/notiformer)
