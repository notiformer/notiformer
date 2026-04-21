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
 * // Notify everyone subscribed to the 'payments' channel
 * await n.event({ channel: 'payments', event: 'new_sale', notify: true });
 *
 * // Notify specific people only
 * await n.event({
 *   channel: 'payments',
 *   event: 'refund_requested',
 *   notify: true,
 *   recipients: ['admin@company.com', 'billing@company.com'],
 * });
 */

import type {
  NotiformerConfig,
  EventPayload,
  EventResponse,
  GateOptions,
  GateResult,
} from "./types";
import { Logger } from "./logger";
import { GateCache } from "./cache";

export type {
  NotiformerConfig,
  EventPayload,
  EventResponse,
  GateOptions,
  GateResult,
};

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

  /**
   * Send an event and optionally notify recipients.
   *
   * - Without `recipients`: notifies the project owner + all members
   *   subscribed to the event's channel.
   * - With `recipients`: notifies only the specified email addresses
   *   (must be project members). Overrides the default behaviour.
   *
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
        return this.fail(
          new Error(`[notiformer] ${data.error ?? res.statusText}`),
        );
      }

      return (await res.json()) as EventResponse;
    } catch (err) {
      return this.fail(this.friendlyNetworkError(err));
    }
  }

  /**
   * Check whether a feature gate is enabled.
   * Results are cached locally for 30 seconds by default.
   * Returns false if the call fails.
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
      if (!res.ok) return fallback;
      const data = (await res.json()) as GateResult;
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
          "X-SDK-Version": "1.0.6",
          ...(init.headers ?? {}),
        },
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private fail(error: Error): null {
    this.logger.error(error.message);
    this.onError?.(error);
    if (this.throwOnError) throw error;
    return null;
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
