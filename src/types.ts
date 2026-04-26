export interface NotiformerConfig {
  apiKey: string;
  silent?: boolean;
  throwOnError?: boolean;
  onError?: (err: Error) => void;
  _baseUrl?: string; // internal: override API URL
}

export interface EventPayload {
  /** Channel name (lowercase, letters, numbers, hyphens, underscores). */
  channel: string;
  /** Short event name. */
  event: string;
  description?: string;
  icon?: string; // emoji
  tags?: Record<string, string | number | boolean>;
  value?: string | number;
  /**
   * Whether to send push/email notifications.
   * Defaults to true.
   */
  notify?: boolean;
  /**
   * Specific email addresses to notify.
   *
   * If set, **only** these emails receive notifications — the default
   * (owner + channel subscribers) is ignored.
   *
   * Plan limits: Free=1, Starter=3, Pro=10, Business=30.
   *
   * @example
   * recipients: ['alice@company.com', 'bob@company.com']
   */
  recipients?: string[];
}

export interface EventResponse {
  id: string;
  createdAt: string;
  rateLimited?: boolean;
}

export interface GateOptions {
  fallback?: boolean;
  cacheTtl?: number; // seconds
}

export interface GateResult {
  key: string;
  enabled: boolean;
  cached: boolean;
  fetchedAt: string;
}

export interface AskPayload {
  /** The question shown in the push notification title. */
  message: string;
  /** Optional extra detail shown in the notification body (max 500 chars). */
  context?: string;
  /**
   * Optional long-form text shown in the approval detail screen of the
   * Notiformer app. Supports newlines — use \n to structure content.
   * Max 10,000 characters.
   *
   * @example
   * details: `CHANGES\n• Fix auth bug\n\nROLLBACK\n./rollback.sh v1.0.9`
   */
  details?: string;
  /**
   * Seconds to wait for a response before applying the fallback.
   * Default: 300 (5 min). Maximum depends on your plan:
   * Starter=300s, Pro=900s, Business=3600s.
   */
  timeout?: number;
  /**
   * What to return if nobody responds before the timeout.
   * Default: 'deny' (safe — approved will be false).
   */
  fallback?: "deny" | "approve";
}

export interface AskResult {
  /** true if the user tapped Approve, false if they tapped Deny or it timed out. */
  approved: boolean;
  /** true if nobody responded before the timeout expired. */
  timedOut: boolean;
  /** ISO timestamp of when the user responded. null if timed out. */
  respondedAt: string | null;
}

// ─────────────────────────────────────────────
// n.select() — multi-option approval gate
// ─────────────────────────────────────────────

export interface SelectOption {
  /**
   * The value returned in `result.selected` when this option is chosen.
   * Max 50 chars. Use a short descriptive string.
   *
   * @example 'deploy' | 'rollback' | 'cancel'
   */
  value: string;
  /**
   * The button label shown in the Notiformer app.
   * Max 80 chars. Supports emoji.
   *
   * @example '🚀 Deploy to production'
   */
  label: string;
  /**
   * If true, the button is styled destructively (red) in the mobile app.
   * Use for dangerous or irreversible actions.
   */
  isDestructive?: boolean;
}

export interface SelectPayload {
  /**
   * The question shown as the push notification title. Required.
   */
  message: string;
  /**
   * The options shown as buttons in the Notiformer app.
   * Minimum 2, maximum 6 options.
   */
  options: SelectOption[];
  /** Optional detail shown in the notification body (max 500 chars). */
  context?: string;
  /**
   * Optional long-form text shown in the approval detail screen.
   * Supports newlines. Max 10,000 chars.
   */
  details?: string;
  /**
   * Seconds to wait before applying the fallback.
   * Default: 300. Maximum depends on your plan.
   */
  timeout?: number;
  /**
   * The option value to return automatically if nobody responds.
   * Must match one of the option values exactly.
   * If omitted, `selected` is null on timeout.
   *
   * @example 'cancel' // safe default
   */
  fallback?: string;
}

export interface SelectResult {
  /**
   * The value string of the option the user selected,
   * or the fallback value on timeout.
   * Null if timed out with no fallback set.
   */
  selected: string | null;
  /** True if nobody responded before the timeout expired. */
  timedOut: boolean;
  /** ISO timestamp of when the user responded. null if timed out. */
  respondedAt: string | null;
}

export type LogLevel = "debug" | "info" | "warn" | "error" | "none" | "silent";
