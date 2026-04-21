# notiformer

Real-time push notifications and feature gates for your code.

Know the moment something important happens in your app — a new sale, an error, a spike in costs. Get notified on your phone via the **Notiformer app** (iOS & Android), or in your inbox.

> **Works everywhere.** Use in Node.js, Express, Next.js API routes, serverless functions, Python, Go, or any HTTP client.

---

## Install

```bash
npm install notiformer
```

---

## Quick start

```ts
import { Notiformer } from 'notiformer';

const n = new Notiformer({
  apiKey: 'ntf_live_...', // from app.notiformer.com/projects
});

await n.event({
  channel: 'payments',             // groups related events — auto-created on first use
  event: 'payment_success',        // machine-readable event name
  description: '$49.00 — john@example.com', // optional human-readable detail
  icon: '💳',                      // optional emoji shown in the feed and notification
  tags: { userId: 'usr_123', plan: 'pro' }, // optional key-value metadata
  value: '$49.00',                 // optional value highlighted in the feed
  notify: true,                    // true → push notification | false → silent log only
  recipients: ['you@company.com'], // optional — notify specific people only (see below)
});
```

> **Tip:** Use `apiKey: 'ntf_live_test'` to get started without a real key. The SDK will print setup instructions in your console and skip all API calls.

---

## Get your API key

1. Go to [app.notiformer.com](https://app.notiformer.com) and create an account (free)
2. Create a project
3. Copy the API key from the project overview
4. Replace `'ntf_live_test'` in your code with your real key

---

## `event()` — Send an event

```ts
await n.event({
  channel:     'payments',           // required — string, lowercase, a-z 0-9 - _
  event:       'payment_success',    // required — machine-readable event name

  description: '$49.00 — john@example.com',  // optional
  icon:        '💳',                          // optional — emoji
  tags:        { plan: 'pro', userId: '123' }, // optional — displayed in the event feed
  value:       '$49.00',                      // optional — highlighted value in the feed
  notify:      true,                          // optional — default: true
  recipients:  ['alice@company.com'],         // optional — see "Targeting specific people"
});
```

### `notify`

| Value | Behaviour |
|---|---|
| `true` (default) | Sends push notification to subscribed members |
| `false` | Stores the event silently for analytics — no notification sent |

### Return value

```ts
const result = await n.event({ ... });
// result is null if the call failed (never throws by default)
// result.rateLimited === true if you exceeded 60 events/minute (event is stored, notification skipped)
```

`event()` **never throws by default.** A failed notification will never crash your app. If you prefer it to throw, pass `throwOnError: true` in the config.

---

## Targeting specific people — `recipients`

By default, when `notify: true`, all members of the project who are subscribed to that channel receive a notification.

You can override this and target specific people by email:

```ts
await n.event({
  channel:     'payments',
  event:       'large_order',
  description: '$2,400 — enterprise@client.com',
  notify:      true,
  recipients:  ['cto@company.com', 'billing@company.com'], // only these two are notified
});
```

**How it works:**
- If a recipient has a Notiformer account linked to that email and has installed the app, they receive a **push notification**
- Email notifications are **coming soon** — recipients will receive emails once this feature launches
- If you don't specify `recipients`, all project members subscribed to the channel are notified

**Plan limits for `recipients`:**

| Plan | Max recipients per event |
|---|---|
| Free | 1 |
| Starter | 3 |
| Pro | 10 |
| Business | 30 |

> Members are managed from the project dashboard at [app.notiformer.com](https://app.notiformer.com/projects).

---

## `gate()` — Feature gates

Toggle features in your code remotely from the Notiformer dashboard — no redeploy needed.

```ts
const isEnabled = await n.gate('new-checkout-flow');

if (isEnabled) {
  // new behaviour
} else {
  // old behaviour
}
```

Gates are **cached locally for 30 seconds** by default to avoid hammering the API on every request.

### Options

```ts
const isEnabled = await n.gate('my-gate', {
  fallback:  false, // optional — returned if the gate can't be fetched (default: false)
  cacheTtl:  60,    // optional — cache duration in seconds (default: 30)
});
```

### Full gate result

```ts
const result = await n.gateDetails('my-gate');
// { key: 'my-gate', enabled: true, cached: false, fetchedAt: '2025-...' }
```

### Clear the cache

```ts
n.clearGateCache('my-gate'); // clear a specific gate
n.clearGateCache();          // clear all gates
```

---

## Configuration

```ts
const n = new Notiformer({
  apiKey:       'ntf_live_...',  // required — from app.notiformer.com/projects
  silent:       false,           // optional — true = no API calls (great for local dev)
  throwOnError: false,           // optional — true = throws instead of returning null
  onError:      (err) => {       // optional — called when any call fails
    Sentry.captureException(err);
  },
});
```

### Silence in local development

```ts
const n = new Notiformer({
  apiKey: process.env.NOTIFORMER_API_KEY!,
  silent: process.env.NODE_ENV !== 'production', // no calls in dev/test
});
```

---

## Rate limits & quotas

| Limit | Value |
|---|---|
| Events per minute (per project) | 60 |
| Events per month (Free plan) | 500 |
| Events per month (Starter) | 20,000 |
| Events per month (Pro) | 75,000 |
| Events per month (Business) | 300,000 |

If you exceed **60 events/minute**: the event is stored and visible in your feed, but no notification is sent. The API response includes `rateLimited: true`.

If you exceed your **monthly quota**: the event is rejected with HTTP 429. Upgrade your plan at [app.notiformer.com/settings](https://app.notiformer.com/settings).

---

## Common patterns

### Alert on payment success

```ts
await n.event({
  channel:     'payments',
  event:       'payment_success',
  description: `${amount} — ${user.email}`,
  icon:        '💳',
  value:       amount,
  notify:      true,
});
```

### Alert on unhandled errors

```ts
// Express error middleware
app.use(async (err, req, res, next) => {
  await n.event({
    channel:     'errors',
    event:       'unhandled_error',
    description: err.message,
    icon:        '🔴',
    tags:        { path: req.path, method: req.method },
    notify:      true,
  });
  res.status(500).json({ error: 'Internal server error' });
});
```

### Silent analytics (no notification)

```ts
await n.event({
  channel: 'analytics',
  event:   'page_view',
  tags:    { path: req.path, userId: session.userId },
  notify:  false, // stored in feed, no push notification sent
});
```

### Feature gate in an API route

```ts
// Next.js API route
export async function POST(req: Request) {
  const useNewFlow = await n.gate('new-checkout-flow');

  if (useNewFlow) {
    return newCheckoutHandler(req);
  }
  return legacyCheckoutHandler(req);
}
```

### Notify a specific person

```ts
// Only notify the CTO for large orders
await n.event({
  channel:     'sales',
  event:       'enterprise_signup',
  description: `${company} — ${mrr}/mo`,
  icon:        '🏢',
  value:       mrr,
  notify:      true,
  recipients:  ['cto@yourcompany.com'], // only they get the push
});
```

### Using with Python (REST API)

Notiformer works from any language via the REST API:

```python
import requests

requests.post(
  'https://api.notiformer.com/v1/events',
  headers={ 'Authorization': f'Bearer {NF_KEY}' },
  json={
    'channel':     'ai-costs',
    'event':       'cost_spike',
    'description': '🤖 $180 spent in 10 min',
    'notify':      True,
    'recipients':  ['cto@company.com'],  # optional
  }
)
```

---

## Receiving notifications

Push notifications are delivered via the **Notiformer app**, available for iOS and Android.

1. Download the Notiformer app from the App Store or Google Play
2. Sign in with your Notiformer account
3. You'll automatically receive push notifications for projects you own or are a member of
4. Manage which channels you're subscribed to from the app settings

> **Email notifications** are in development and coming soon. Sign up at [notiformer.com](https://notiformer.com) to be notified when they launch.

---

## REST API

The same `event()` call maps to this endpoint:

```
POST https://api.notiformer.com/v1/events
Authorization: Bearer ntf_live_...
Content-Type: application/json

{
  "channel":     "payments",
  "event":       "payment_success",
  "description": "$49.00 — john@example.com",
  "icon":        "💳",
  "tags":        { "plan": "pro" },
  "value":       "$49.00",
  "notify":      true,
  "recipients":  ["you@company.com"]
}
```

Response:
```json
{
  "id":          "evt_abc123",
  "createdAt":   "2025-01-15T10:30:00.000Z",
  "rateLimited": false
}
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
