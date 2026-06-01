/**
 * Notiformer — Real-time alerts, approval gates, and feature flags.
 *
 * Pricing model (v2):
 *   Each plan includes a free credit allowance per billing cycle.
 *   Once the allowance is consumed, usage continues at fixed per-unit prices
 *   (pay-as-you-go), capped at a hard system limit per cycle.
 *   See https://notiformer.com/pricing for current rates.
 *
 * Billing errors (HTTP 402):
 *   - "card_required"   → add a payment method at app.notiformer.com
 *   - "card_locked"     → card declined; update payment method
 *   - "cap_reached"     → hard cycle cap reached; usage resets at cycleResetsAt
 *
 * The SDK never throws by default. To opt in:
 *   new Notiformer({ apiKey, throwOnError: true })
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
  NotiformerErrorCode,
} from "./types";
import { NotiformerError } from "./types";
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
  NotiformerErrorCode,
  SelectOption,
} from "./types";
export { NotiformerError } from "./types";

const PLACEHOLDER_KEY = "ntf_live_test";
const API_URL = "https://api.notiformer.com";
const DEFAULT_TIMEOUT = 8_000;
const DEFAULT_GATE_TTL = 30;
const SDK_VERSION = "2.2.0";

interface ApiErrorBody {
  error?: string;
  code?: string;
  cycleResetsAt?: string;
  manageUrl?: string;
  upgradeUrl?: string;
}

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
          "│  Calls will not be sent until you use a real key.   │\n" +
          "│                                                     │\n" +
          "│  1. Go to https://app.notiformer.com/projects       │\n" +
          "│  2. Create or open a project                        │\n" +
          "│  3. Copy your API key                               │\n" +
          "└─────────────────────────────────────────────────────┘\n",
      );
    }
  }

  // ─────────────────────────────────────────────────────────────
  // event()
  // ─────────────────────────────────────────────────────────────

  async event(payload: EventPayload): Promise<EventResponse | null> {
    if (!payload.channel)
      throw new Error("[notiformer] event.channel is required.");
    if (!payload.event)
      throw new Error("[notiformer] event.event is required.");

    if (this.isPlaceholder) {
      console.warn(
        '[notiformer] Event not sent — using example key "ntf_live_test".',
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
        const err = await this.parseError(res);
        this.logBilling(err);
        return this.fail(err);
      }
      return (await res.json()) as EventResponse;
    } catch (err) {
      return this.fail(this.toError(err));
    }
  }

  // ─────────────────────────────────────────────────────────────
  // gate()
  // ─────────────────────────────────────────────────────────────

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
        const err = await this.parseError(res);
        this.logBilling(err);
        // gate() never throws — it always falls back
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
    return { key, enabled, cached: false };
  }

  clearGateCache(key?: string): void {
    key ? this.gateCache.delete(key) : this.gateCache.clear();
  }

  // ─────────────────────────────────────────────────────────────
  // ask()
  // ─────────────────────────────────────────────────────────────

  async ask(payload: AskPayload): Promise<AskResult> {
    if (!payload.message)
      throw new Error("[notiformer] ask.message is required.");

    if (this.isPlaceholder) {
      console.warn("[notiformer] ask() not sent — using example key.");
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
      return this.failAsk(this.toError(err));
    }
    if (!createRes.ok) {
      const err = await this.parseError(createRes);
      this.logBilling(err);
      return this.failAsk(err);
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
      console.warn("[notiformer] select() not sent — using example key.");
      return { selected: null, timedOut: false, respondedAt: null };
    }
    if (this.silent)
      return { selected: null, timedOut: false, respondedAt: null };

    if (payload.fallback !== undefined) {
      const valid = payload.options.map((o) => o.value);
      if (!valid.includes(payload.fallback)) {
        throw new Error(
          `[notiformer] select.fallback "${payload.fallback}" must match one of: ${valid.join(", ")}`,
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
      return this.failSelect(this.toError(err));
    }
    if (!createRes.ok) {
      const err = await this.parseError(createRes);
      this.logBilling(err);
      return this.failSelect(err);
    }
    const created = (await createRes.json()) as {
      id: string;
      status: string;
      expiresAt: string;
    };
    return this.pollSelect(created.id, new Date(created.expiresAt).getTime());
  }

  // ─────────────────────────────────────────────────────────────
  // Polling
  // ─────────────────────────────────────────────────────────────

  private async pollAsk(
    askId: string,
    expiresAtMs: number,
  ): Promise<AskResult> {
    const POLL_MS = 2_000;
    const GRACE_MS = 5_000;
    while (true) {
      await this.sleep(POLL_MS);
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
          const err = await this.parseError(res);
          return this.failAsk(err);
        }
      } catch {
        // network blip — try again next loop
      }
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
          const err = await this.parseError(res);
          return this.failSelect(err);
        }
      } catch {
        // network blip — try again
      }
      if (Date.now() >= expiresAtMs + GRACE_MS) {
        return { selected: null, timedOut: true, respondedAt: null };
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Error helpers
  // ─────────────────────────────────────────────────────────────

  /**
   * Parse an HTTP error response into a typed NotiformerError.
   */
  private async parseError(res: Response): Promise<NotiformerError> {
    const body: ApiErrorBody = await res.json().catch(() => ({}));
    const code =
      (body.code as NotiformerErrorCode | undefined) ??
      this.codeFromStatus(res.status);
    const msg = body.error ?? `HTTP ${res.status} ${res.statusText}`;
    return new NotiformerError(`[notiformer] ${msg}`, code, {
      status: res.status,
      cycleResetsAt: body.cycleResetsAt,
      manageUrl: body.manageUrl,
      upgradeUrl: body.upgradeUrl,
    });
  }

  private codeFromStatus(status: number): NotiformerErrorCode {
    if (status === 401) return "invalid_api_key";
    if (status === 402) return "card_required";
    if (status === 403) return "feature_not_available";
    if (status === 429) return "rate_limited";
    if (status >= 500) return "internal";
    return "validation";
  }

  /**
   * Print a user-friendly message for billing errors (402).
   * This is what developers see in their console — should be actionable.
   */
  /**
   * Print a formatted, actionable billing error in the developer console.
   */
  private logBilling(err: NotiformerError): void {
    const hr = "─".repeat(52);

    if (err.code === "cap_reached") {
      const resetStr = err.cycleResetsAt
        ? new Date(err.cycleResetsAt).toDateString()
        : "next billing cycle";

      const isProCap = err.message.toLowerCase().includes("pro plan");
      const lines = [
        ``,
        `┌${"─".repeat(52)}┐`,
        `│  notiformer — spending cap reached${" ".repeat(17)}│`,
        `└${"─".repeat(52)}┘`,
        ``,
        `  ${err.message.split(".")[0]}.`,
        ``,
      ];

      if (isProCap) {
        lines.push(`  Need a higher limit?`);
        lines.push(`  → Email: support@notiformer.com`);
      } else {
        lines.push(`  Upgrade to Pro (€4.99/mo) to keep using Notiformer:`);
        if (err.upgradeUrl) {
          lines.push(`  → ${err.upgradeUrl}`);
        } else if (err.manageUrl) {
          lines.push(`  → ${err.manageUrl}`);
        }
      }

      lines.push(``);
      lines.push(`  Usage resets on: ${resetStr}`);
      lines.push(``);
      console.warn(lines.join("\n"));
      return;
    }

    if (err.code === "card_required" || err.code === "card_locked") {
      const action =
        err.code === "card_required"
          ? "Add a payment method"
          : "Update your payment method";
      const lines = [
        ``,
        `[notiformer] ⚠ ${action}`,
        err.manageUrl ? `  → ${err.manageUrl}` : "",
      ].filter(Boolean);
      console.warn(lines.join("\n"));
      return;
    }

    if (err.code === "feature_not_available") {
      const cleanMsg = err.message.replace(/^\[notiformer\]\s*/, "");
      const manage = err.upgradeUrl ?? err.manageUrl;
      console.warn(
        `[notiformer] ⚠ ${cleanMsg}` +
          (manage ? `\n  → Upgrade: ${manage}` : ""),
      );
    }
  }

  private toError(err: unknown): NotiformerError {
    if (err instanceof NotiformerError) return err;
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    if (msg.includes("aborted") || msg.includes("timeout")) {
      return new NotiformerError(
        `[notiformer] Request timed out after ${this.timeout / 1000}s.`,
        "network",
      );
    }
    if (
      msg.includes("failed to fetch") ||
      msg.includes("enotfound") ||
      msg.includes("network")
    ) {
      return new NotiformerError(
        "[notiformer] Cannot reach the Notiformer API. Check your connection.",
        "network",
      );
    }
    return new NotiformerError(
      err instanceof Error ? err.message : String(err),
      "internal",
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Failure handlers (default: don't throw, return safe value)
  // ─────────────────────────────────────────────────────────────

  private failAsk(error: NotiformerError): AskResult {
    this.logger.error(error.message);
    this.onError?.(error);
    if (this.throwOnError) throw error;
    return { approved: false, timedOut: false, respondedAt: null };
  }

  private failSelect(error: NotiformerError): SelectResult {
    this.logger.error(error.message);
    this.onError?.(error);
    if (this.throwOnError) throw error;
    return { selected: null, timedOut: false, respondedAt: null };
  }

  private fail(error: NotiformerError): null {
    this.logger.error(error.message);
    this.onError?.(error);
    if (this.throwOnError) throw error;
    return null;
  }

  // ─────────────────────────────────────────────────────────────
  // HTTP plumbing
  // ─────────────────────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private post(path: string, body: unknown): Promise<Response> {
    return this.request(path, { method: "POST", body: JSON.stringify(body) });
  }

  private get(path: string): Promise<Response> {
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
          "X-SDK-Version": SDK_VERSION,
          ...(init.headers ?? {}),
        },
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

export default Notiformer;
