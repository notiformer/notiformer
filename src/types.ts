/**
 * SDK types — public surface for consumers of the npm package.
 *
 * Billing error codes returned as HTTP 402/403:
 *   - "card_required"         → Pro/Business user has no valid card on file
 *                               (Dev plan never receives this error)
 *   - "card_locked"           → Pro/Business card declined; grace period expired
 *   - "cap_reached"           → quota exhausted (Dev hard stop) or overage safety
 *                               cap reached (Pro/Business) for this billing cycle
 *   - "feature_not_available" → feature requires Pro or Business plan
 *
 * On "cap_reached", the error object includes:
 *   - cycleResetsAt  → ISO date when the cycle resets
 *   - upgradeUrl     → Stripe Checkout URL to upgrade (Dev → Pro or Pro → Business)
 *   - manageUrl      → Notiformer billing settings URL
 */

export interface NotiformerConfig {
  apiKey: string;
  silent?: boolean;
  throwOnError?: boolean;
  onError?: (err: NotiformerError) => void;
  _baseUrl?: string;
}

// ──────────────────────────────────────────────
// Event payload
// ──────────────────────────────────────────────

export interface EventItem {
  name: string;
  /** string | number | boolean | null — never send `undefined`; if you
   *  don't have a value yet, pass `null` explicitly. */
  value: string | number | boolean | null;
  /** Optional URL. Bare domains ("example.com") and "www."-prefixed
   *  values are automatically upgraded to a full "https://" URL server-side.
   *  Rendered as a clickable button in-app, in Slack, and in Telegram. */
  link?: string;
}

export interface EventPayload {
  channel: string;
  event: string;
  description?: string;
  icon?: string;
  /**
   * Simple string labels, e.g. ["urgent", "beta-user"].
   * Limits: max 10 tags, 50 characters each. Extra tags or characters
   * beyond that are silently dropped/truncated — never an error.
   */
  tags?: string[];
  /**
   * Structured name/value/link entries — use this instead of (or
   * alongside) `description` when you have several discrete pieces of
   * information to show, rather than one paragraph of text. Renders as
   * fields in the app, Slack, and Telegram; any entry with a `link`
   * also renders as a clickable button.
   *
   * Rules:
   * - `name` is required. An entry with a missing/blank name is
   *   silently skipped — it will not appear, and the rest of your
   *   request still succeeds (no error).
   * - `value` accepts a string, number, boolean, or `null`. Never omit
   *   it as `undefined` — pass `null` explicitly if you have nothing to
   *   show for that entry.
   * - `link` is optional. Bare domains and "www." links are normalized
   *   to a full "https://" URL automatically.
   *
   * Limits: max 10 items; name max 60 characters; string values max
   * 200 characters; links max 500 characters. Anything beyond that is
   * truncated/dropped, never an error.
   *
   * Example — order notification with a link to the invoice:
   *   items: [
   *     { name: "Order #", value: "8842" },
   *     { name: "Customer", value: "jane@example.com" },
   *     { name: "Total", value: "$129.00" },
   *     { name: "Invoice", value: null, link: "billing.example.com/inv/8842" },
   *   ]
   *
   * This is a good field to point an AI agent at when it has a
   * variable-length list of facts to report (line items, request
   * parameters, changed fields, related links) rather than trying to
   * cram everything into `description`.
   */
  items?: EventItem[];
  value?: string | number;
  notify?: boolean;
  /**
   * Specific email addresses to notify.
   * Plan limits: Dev=1, Pro=1, Business=3, Custom=unlimited.
   */
  recipients?: string[];
}

export interface EventResponse {
  id: string;
  createdAt: string;
  rateLimited?: boolean;
  /** Cumulative cost of this billing cycle so far, in micro-USD. */
  usageMicroUsd?: number;
}

// ──────────────────────────────────────────────
// Gate (feature flag — available on every plan)
// Active-gate cap per plan: Dev=2, Pro=5, Business=30, Custom=unlimited.
// ──────────────────────────────────────────────

export interface GateOptions {
  fallback?: boolean;
  cacheTtl?: number;
}

export interface GateResult {
  key: string;
  enabled: boolean;
  cached: boolean;
}

// ──────────────────────────────────────────────
// Ask
// ──────────────────────────────────────────────

export interface AskPayload {
  message: string;
  context?: string;
  details?: string;
  /** Seconds. Max depends on plan: Dev=300s (5 min), Pro/Business=900s (15 min). */
  timeout?: number;
  fallback?: "deny" | "approve";
}

export interface AskResult {
  approved: boolean;
  timedOut: boolean;
  respondedAt: string | null;
}

// ──────────────────────────────────────────────
// Select
// ──────────────────────────────────────────────

export interface SelectOption {
  value: string;
  label: string;
  isDestructive?: boolean;
}

export interface SelectPayload {
  message: string;
  options: SelectOption[];
  context?: string;
  details?: string;
  timeout?: number;
  /** A value matching one of the option values, used if timed out. */
  fallback?: string;
}

export interface SelectResult {
  selected: string | null;
  timedOut: boolean;
  respondedAt: string | null;
}

// ──────────────────────────────────────────────
// Errors
// ──────────────────────────────────────────────

export type NotiformerErrorCode =
  | "invalid_api_key"
  | "card_required"
  | "card_locked"
  | "cap_reached"
  | "feature_not_available"
  | "validation"
  | "rate_limited"
  | "network"
  | "internal"
  | "timeout";

export class NotiformerError extends Error {
  code: NotiformerErrorCode;
  /** HTTP status returned by the API, when applicable. */
  status?: number;
  /** When code = "cap_reached", this is the ISO date when the cycle resets. */
  cycleResetsAt?: string;
  /** URL to manage billing in the Notiformer dashboard. */
  manageUrl?: string;
  /**
   * Direct URL to start the Pro upgrade flow (Stripe Checkout, pre-configured
   * for the authenticated user). Present when code = "cap_reached" on Dev plan.
   * Open this in a browser — the user must be logged into app.notiformer.com.
   */
  upgradeUrl?: string;

  constructor(
    message: string,
    code: NotiformerErrorCode,
    extras?: {
      status?: number;
      cycleResetsAt?: string;
      manageUrl?: string;
      upgradeUrl?: string;
    },
  ) {
    super(message);
    this.name = "NotiformerError";
    this.code = code;
    if (extras?.status) this.status = extras.status;
    if (extras?.cycleResetsAt) this.cycleResetsAt = extras.cycleResetsAt;
    if (extras?.manageUrl) this.manageUrl = extras.manageUrl;
    if (extras?.upgradeUrl) this.upgradeUrl = extras.upgradeUrl;
  }
}

export type LogLevel = "debug" | "info" | "warn" | "error" | "none" | "silent";
