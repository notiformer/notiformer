/**
 * Notiformer — Real-time alerts and feature gates for your code.
 *
 * Works in Node.js (backend) and the browser (frontend).
 *
 * @example
 * import { Notiformer } from 'notiformer';
 *
 * const n = new Notiformer({ apiKey: 'ntf_live_...' });
 *
 * // Fire-and-forget alert
 * await n.event({ channel: 'payments', event: 'new_sale', notify: true });
 *
 * // Block and wait for approval
 * const { approved } = await n.ask({ message: 'Deploy to prod?' });
 *
 * // Block and wait for a choice from multiple options
 * const { selected } = await n.select({
 *   message: 'How to handle the failed payment?',
 *   options: [
 *     { value: 'retry',  label: '🔄 Retry in 1 hour' },
 *     { value: 'notify', label: '📧 Notify customer' },
 *     { value: 'cancel', label: '✕ Cancel order', isDestructive: true },
 *   ],
 *   fallback: 'notify',
 * });
 */

import type {
  NotiformerConfig,
  EventPayload,
  EventResponse,
  GateOptions,
  GateResult,
  AskPayload,
  AskResult,
  SelectPayload,
  SelectResult,
} from "./types";
import { Logger } from "./logger";
import { GateCache } from "./cache";

export type {
  NotiformerConfig,
  EventPayload,
  EventResponse,
  GateOptions,
  GateResult,
  AskPayload,
  AskResult,
  SelectPayload,
  SelectResult,
};
export type { SelectOption } from "./types";

const PLACEHOLDER_KEY = "ntf_live_test";
const API_URL = "https://api.notiformer.com";
const DEFAULT_TIMEOUT = 8_000;
const DEFAULT_GATE_TTL = 30;

export class Notiformer {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly silent: boolean;
  private readonly throwOnError: boolean;
  private readonly onError?: NotiformerConfig["onError"];
  private readonly logger: Logger;
  private readonly gateCache: GateCache;
  private readonly isPlaceholder: boolean;

  constructor(config: NotiformerConfig) {
    if (!config.apiKey) {
      throw new Error(
        "[notiformer] apiKey is required.\n" +
          "→ Get yours at https://app.notiformer.com/projects",
      );
    }

    this.isPlaceholder = config.apiKey === PLACEHOLDER_KEY;
    this.apiKey = config.apiKey;
    this.baseUrl = (config._baseUrl ?? API_URL).replace(/\/$/, "");
    this.timeout = DEFAULT_TIMEOUT;
    this.silent = config.silent ?? false;
    this.throwOnError = config.throwOnError ?? false;
    this.onError = config.onError;
    this.logger = new Logger("warn");
    this.gateCache = new GateCache();

    if (this.isPlaceholder) {
      console.warn(
        "\n" +
          "┌─────────────────────────────────────────────────────┐\n" +
          "│  notiformer — setup required                        │\n" +
          "├─────────────────────────────────────────────────────┤\n" +
          '│  You are using the example key "ntf_live_test".     │\n' +
          "│  Events will not be sent until you use a real key.  │\n" +
          "│                                                     │\n" +
          "│  1. Go to https://app.notiformer.com/projects       │\n" +
          "│  2. Create or open a project                        │\n" +
          "│  3. Copy your API key                               │\n" +
          '│  4. Replace "ntf_live_test" with your real key      │\n' +
          "└─────────────────────────────────────────────────────┘\n",
      );
    }
  }

  // ─────────────────────────────────────────────────────────────
  // event()
  // ─────────────────────────────────────────────────────────────

  /**
   * Send an event and optionally notify recipients.
   * Never throws by default — returns null if the call fails.
   */
  async event(payload: EventPayload): Promise<EventResponse | null> {
    if (!payload.channel)
      throw new Error("[notiformer] event.channel is required.");
    if (!payload.event)
      throw new Error("[notiformer] event.event is required.");

    if (this.isPlaceholder) {
      console.warn(
        '[notiformer] Event not sent — using example key "ntf_live_test".\n' +
          "→ Replace it with your real key from https://app.notiformer.com/projects",
      );
      return null;
    }

    if (this.silent) return null;

    try {
      const body: Record<string, unknown> = {
        channel: payload.channel,
        event: payload.event,
        notify: payload.notify ?? true,
      };

      if (payload.description !== undefined)
        body.description = payload.description;
      if (payload.icon !== undefined) body.icon = payload.icon;
      if (payload.tags !== undefined) body.tags = payload.tags;
      if (payload.value !== undefined) body.value = payload.value;
      if (payload.recipients !== undefined && payload.recipients.length > 0) {
        body.recipients = payload.recipients;
      }

      const res = await this.post("/v1/events", body);

      if (!res.ok) {
        const data = await res
          .json()
          .catch(() => ({ error: `HTTP ${res.status}` }));
        this.warnUpgrade(data);
        return this.fail(
          new Error(`[notiformer] ${data.error ?? res.statusText}`),
        );
      }

      return (await res.json()) as EventResponse;
    } catch (err) {
      return this.fail(this.friendlyNetworkError(err));
    }
  }

  // ─────────────────────────────────────────────────────────────
  // gate()
  // ─────────────────────────────────────────────────────────────

  /**
   * Check whether a feature gate is enabled.
   * Results are cached locally for 30 seconds by default.
   * Returns false if the call fails or the plan doesn't support gates.
   */
  async gate(key: string, options: GateOptions = {}): Promise<boolean> {
    if (!key) throw new Error("[notiformer] gate key is required.");

    const fallback = options.fallback ?? false;
    const ttl = options.cacheTtl ?? DEFAULT_GATE_TTL;

    if (this.isPlaceholder || this.silent) return fallback;

    const cached = this.gateCache.get(key);
    if (cached !== null) return cached;

    try {
      const res = await this.get(`/v1/gates/${encodeURIComponent(key)}`);

      if (!res.ok) {
        // 403 = Feature Gates not available on this plan
        if (res.status === 403) {
          const data = await res.json().catch(() => ({}));
          console.warn(
            `[notiformer] gate("${key}") — Feature Gates require Pro or Business plan.` +
              (data.upgradeUrl ? `\n→ Upgrade: ${data.upgradeUrl}` : ""),
          );
        }
        return fallback;
      }

      const data = (await res.json()) as { key: string; enabled: boolean };
      this.gateCache.set(key, data.enabled, ttl);
      return data.enabled;
    } catch {
      return fallback;
    }
  }

  async gateDetails(
    key: string,
    options: GateOptions = {},
  ): Promise<GateResult> {
    const enabled = await this.gate(key, options);
    return { key, enabled, cached: false, fetchedAt: new Date().toISOString() };
  }

  clearGateCache(key?: string): void {
    key ? this.gateCache.delete(key) : this.gateCache.clear();
  }

  // ─────────────────────────────────────────────────────────────
  // ask()
  // ─────────────────────────────────────────────────────────────

  /**
   * Pause execution and wait for a human to approve or deny.
   *
   * A push notification is sent to the Notiformer app with Approve
   * and Deny buttons. The Promise resolves when you respond or when
   * the timeout expires.
   *
   * Never throws by default.
   *
   * @example
   * const { approved } = await n.ask({
   *   message: `Send campaign to ${count} users?`,
   *   context: `Campaign: Black Friday · ${count} recipients`,
   *   timeout: 300,
   * });
   * if (approved) await sendEmails();
   */
  async ask(payload: AskPayload): Promise<AskResult> {
    if (!payload.message)
      throw new Error("[notiformer] ask.message is required.");

    if (this.isPlaceholder) {
      console.warn(
        '[notiformer] ask() not sent — using example key "ntf_live_test".\n' +
          "→ Replace it with your real key from https://app.notiformer.com/projects",
      );
      return { approved: false, timedOut: false, respondedAt: null };
    }

    if (this.silent)
      return { approved: false, timedOut: false, respondedAt: null };

    const body: Record<string, unknown> = {
      message: payload.message,
      timeout: payload.timeout ?? 300,
      fallback: payload.fallback ?? "deny",
    };
    if (payload.context !== undefined) body.context = payload.context;
    if (payload.details !== undefined) body.details = payload.details;

    let createRes: Response;
    try {
      createRes = await this.post("/v1/ask", body);
    } catch (err) {
      return this.failAsk(this.friendlyNetworkError(err));
    }

    if (!createRes.ok) {
      const data = await createRes
        .json()
        .catch(() => ({ error: `HTTP ${createRes.status}` }));
      this.warnUpgrade(data);
      return this.failAsk(
        new Error(`[notiformer] ${data.error ?? createRes.statusText}`),
      );
    }

    const created = (await createRes.json()) as {
      id: string;
      status: string;
      expiresAt: string;
    };
    return this.pollAsk(created.id, new Date(created.expiresAt).getTime());
  }

  // ─────────────────────────────────────────────────────────────
  // select()
  // ─────────────────────────────────────────────────────────────

  /**
   * Pause execution and wait for a human to choose from multiple options.
   *
   * Unlike ask() which returns a boolean, select() returns the `value`
   * string of the chosen option. Use it when you need more than two actions.
   *
   * Uses the same monthly quota as ask().
   * Never throws by default.
   *
   * @example
   * const { selected } = await n.select({
   *   message: 'How should I handle the failed payment?',
   *   options: [
   *     { value: 'retry',  label: '🔄 Retry in 1 hour' },
   *     { value: 'notify', label: '📧 Notify the customer' },
   *     { value: 'cancel', label: '✕ Cancel the order', isDestructive: true },
   *   ],
   *   fallback: 'notify', // returned automatically on timeout
   *   timeout: 300,
   * });
   *
   * if (selected === 'retry')  await scheduleRetry();
   * if (selected === 'notify') await sendEmail();
   * if (selected === 'cancel') await cancelOrder();
   */
  async select(payload: SelectPayload): Promise<SelectResult> {
    if (!payload.message)
      throw new Error("[notiformer] select.message is required.");
    if (!payload.options || payload.options.length < 2) {
      throw new Error(
        "[notiformer] select.options requires at least 2 options.",
      );
    }
    if (payload.options.length > 6) {
      throw new Error(
        "[notiformer] select.options supports a maximum of 6 options.",
      );
    }

    if (this.isPlaceholder) {
      console.warn(
        '[notiformer] select() not sent — using example key "ntf_live_test".\n' +
          "→ Replace it with your real key from https://app.notiformer.com/projects",
      );
      return { selected: null, timedOut: false, respondedAt: null };
    }

    if (this.silent)
      return { selected: null, timedOut: false, respondedAt: null };

    // Local validation: fallback must be a valid option value
    if (payload.fallback !== undefined) {
      const validValues = payload.options.map((o) => o.value);
      if (!validValues.includes(payload.fallback)) {
        throw new Error(
          `[notiformer] select.fallback "${payload.fallback}" must match one of the option values: ` +
            validValues.join(", "),
        );
      }
    }

    const body: Record<string, unknown> = {
      message: payload.message,
      options: payload.options,
      timeout: payload.timeout ?? 300,
    };
    if (payload.context !== undefined) body.context = payload.context;
    if (payload.details !== undefined) body.details = payload.details;
    if (payload.fallback !== undefined) body.fallback = payload.fallback;

    let createRes: Response;
    try {
      createRes = await this.post("/v1/select", body);
    } catch (err) {
      return this.failSelect(this.friendlyNetworkError(err));
    }

    if (!createRes.ok) {
      const data = await createRes
        .json()
        .catch(() => ({ error: `HTTP ${createRes.status}` }));
      this.warnUpgrade(data);
      return this.failSelect(
        new Error(`[notiformer] ${data.error ?? createRes.statusText}`),
      );
    }

    const created = (await createRes.json()) as {
      id: string;
      status: string;
      expiresAt: string;
    };
    return this.pollSelect(created.id, new Date(created.expiresAt).getTime());
  }

  // ─────────────────────────────────────────────────────────────
  // Private: polling
  // ─────────────────────────────────────────────────────────────

  private async pollAsk(
    askId: string,
    expiresAtMs: number,
  ): Promise<AskResult> {
    const POLL_MS = 2_000;
    const GRACE_MS = 5_000; // matches server grace period

    while (true) {
      await this.sleep(POLL_MS);

      // ── Poll FIRST, check expiry after ─────────────────────
      // This ensures a response made at the last instant is not
      // incorrectly returned as timedOut.
      try {
        const res = await this.get(`/v1/ask/${encodeURIComponent(askId)}`);

        if (res.ok) {
          const data = (await res.json()) as {
            status: string;
            respondedAt: string | null;
          };

          if (data.status !== "pending") {
            return {
              approved: data.status === "approved",
              timedOut: data.status === "timed_out",
              respondedAt: data.respondedAt ?? null,
            };
          }
        } else if (res.status >= 400 && res.status < 500) {
          const data = await res
            .json()
            .catch(() => ({ error: `HTTP ${res.status}` }));
          return this.failAsk(
            new Error(`[notiformer] ${data.error ?? res.statusText}`),
          );
        }
        // 5xx — fall through to expiry check, retry next loop
      } catch {
        // network error — fall through
      }

      // ── Only declare client-side timeout after grace period ─
      if (Date.now() >= expiresAtMs + GRACE_MS) {
        return { approved: false, timedOut: true, respondedAt: null };
      }
    }
  }

  private async pollSelect(
    selectId: string,
    expiresAtMs: number,
  ): Promise<SelectResult> {
    const POLL_MS = 2_000;
    const GRACE_MS = 5_000;

    while (true) {
      await this.sleep(POLL_MS);

      try {
        const res = await this.get(
          `/v1/select/${encodeURIComponent(selectId)}`,
        );

        if (res.ok) {
          const data = (await res.json()) as {
            status: string;
            selectedValue: string | null;
            respondedAt: string | null;
          };

          if (data.status !== "pending") {
            return {
              selected: data.selectedValue ?? null,
              timedOut: data.status === "timed_out",
              respondedAt: data.respondedAt ?? null,
            };
          }
        } else if (res.status >= 400 && res.status < 500) {
          const data = await res
            .json()
            .catch(() => ({ error: `HTTP ${res.status}` }));
          return this.failSelect(
            new Error(`[notiformer] ${data.error ?? res.statusText}`),
          );
        }
      } catch {
        // network error — fall through
      }

      if (Date.now() >= expiresAtMs + GRACE_MS) {
        return { selected: null, timedOut: true, respondedAt: null };
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Private: helpers
  // ─────────────────────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * If the API response includes an upgradeUrl (quota exceeded),
   * print a visible warning in the developer's console.
   */
  private warnUpgrade(data: any): void {
    if (data?.upgradeUrl) {
      console.warn(
        `[notiformer] Plan limit reached. Upgrade your plan to continue:\n` +
          `→ ${data.upgradeUrl}`,
      );
    }
  }

  private failAsk(error: Error): AskResult {
    this.logger.error(error.message);
    this.onError?.(error);
    if (this.throwOnError) throw error;
    return { approved: false, timedOut: false, respondedAt: null };
  }

  private failSelect(error: Error): SelectResult {
    this.logger.error(error.message);
    this.onError?.(error);
    if (this.throwOnError) throw error;
    return { selected: null, timedOut: false, respondedAt: null };
  }

  private fail(error: Error): null {
    this.logger.error(error.message);
    this.onError?.(error);
    if (this.throwOnError) throw error;
    return null;
  }

  private async post(path: string, body: unknown): Promise<Response> {
    return this.request(path, { method: "POST", body: JSON.stringify(body) });
  }

  private async get(path: string): Promise<Response> {
    return this.request(path, { method: "GET" });
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          "X-SDK-Version": "1.1.2",
          ...(init.headers ?? {}),
        },
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private friendlyNetworkError(err: unknown): Error {
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    if (msg.includes("aborted") || msg.includes("timeout")) {
      return new Error(
        `[notiformer] Request timed out after ${this.timeout / 1000}s.`,
      );
    }
    if (
      msg.includes("failed to fetch") ||
      msg.includes("enotfound") ||
      msg.includes("network")
    ) {
      return new Error(
        "[notiformer] Cannot reach the Notiformer API.\n" +
          "Check your connection. If the issue persists: https://status.notiformer.com",
      );
    }
    return err instanceof Error ? err : new Error(String(err));
  }
}

export default Notiformer;
