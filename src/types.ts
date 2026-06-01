/**
 * SDK types — public surface for consumers of the npm package.
 *
 * The new error codes for the v2 billing model:
 *   - "card_required"        → user has no valid card on file (402)
 *   - "card_locked"          → card declined; grace period expired (402)
 *   - "cap_reached"          → hard system cap hit for this billing cycle (402)
 *   - "feature_not_available"→ feature requires Pro plan (403)
 *
 * The old "quota_exceeded" code is gone — there is no monthly event limit
 * anymore, only a credit allowance + cap.
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

export interface EventPayload {
  channel: string;
  event: string;
  description?: string;
  icon?: string;
  tags?: Record<string, string | number | boolean>;
  value?: string | number;
  notify?: boolean;
  /**
   * Specific email addresses to notify.
   * Plan limits: Dev=1, Pro=10.
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
// Gate (feature flag — Pro plan only)
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
  /** Seconds. Max depends on plan: Dev=300, Pro=900. */
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
  | "internal";

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
