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
   * Each email must belong to a member of your project
   * (added from the Notiformer dashboard).
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

export type LogLevel = "debug" | "info" | "warn" | "error" | "none" | "silent";
