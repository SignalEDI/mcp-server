// Minimal, dependency-free SignalEDI Core API client for the MCP server.
//
// Mirrors @signaledi/sdk and docs/openapi/v1, but inlined (zero deps) so the
// MCP package stays installable/auditable and testable without a build step.
// Hardened the same way as the GitHub Action: per-attempt timeout, a total
// deadline, and retry-on-transient with exponential backoff + jitter.

const DEFAULT_BASE_URL = "https://signaledi.com";
const API_PREFIX = "/api/v1";
const PUBLIC_PLAYGROUND_PREFIX = "/api/public/playground";

const ATTEMPT_TIMEOUT_MS = 15_000; // per HTTP attempt
const TOTAL_DEADLINE_MS = 30_000; // across all retries
const MAX_RETRIES = 3;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export class SignalEDIError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   * @param {string=} code
   */
  constructor(message, status, code) {
    super(message);
    this.name = "SignalEDIError";
    this.status = status;
    this.code = code;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class SignalEDIClient {
  /**
   * @param {{ apiKey?: string, baseUrl?: string, fetch?: typeof fetch, demoMode?: boolean }} options
   */
  constructor(options) {
    this.demoMode = options?.demoMode === true;
    if (!this.demoMode && (!options || !options.apiKey)) {
      throw new Error("SignalEDI: apiKey is required (set SIGNALEDI_API_KEY).");
    }
    this.apiKey = options?.apiKey;
    this.baseUrl = (options?.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = options.fetch || globalThis.fetch;
    if (!this.fetchImpl) {
      throw new Error("SignalEDI: no global fetch available (Node 18+ required).");
    }
  }

  /**
   * @template T
   * @param {"GET"|"POST"|"DELETE"} method
   * @param {string} path
   * @param {unknown=} body
   * @param {{ auth?: boolean }=} opts
   * @returns {Promise<T>}
   */
  async request(method, path, body, opts = { auth: true }) {
    const url = `${this.baseUrl}${API_PREFIX}${path}`;
    const startedAt = Date.now();
    let attempt = 0;
    let lastErr;

    while (attempt <= MAX_RETRIES) {
      const remaining = TOTAL_DEADLINE_MS - (Date.now() - startedAt);
      if (remaining <= 0) break;

      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        Math.min(ATTEMPT_TIMEOUT_MS, remaining),
      );
      try {
        const headers = {
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        };
        if (opts.auth !== false && this.apiKey) {
          headers.Authorization = `Bearer ${this.apiKey}`;
        }

        const res = await this.fetchImpl(url, {
          method,
          headers,
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          signal: controller.signal,
        });

        const text = await res.text();
        const data = text ? safeJson(text) : {};

        if (!res.ok) {
          if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RETRIES) {
            await backoff(attempt, res.headers.get("retry-after"));
            attempt += 1;
            continue;
          }
          throw new SignalEDIError(
            typeof data.error === "string" ? data.error : `Request failed (${res.status})`,
            res.status,
            typeof data.code === "string" ? data.code : undefined,
          );
        }
        return /** @type {T} */ (data);
      } catch (err) {
        lastErr = err;
        if (err instanceof SignalEDIError) throw err;
        if (attempt < MAX_RETRIES) {
          await backoff(attempt, null);
          attempt += 1;
          continue;
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastErr || new Error("SignalEDI: request failed (deadline exceeded)");
  }

  /** Demo-mode playground POST (no auth). */
  async playgroundRequest(mode, content) {
    const url = `${this.baseUrl}${PUBLIC_PLAYGROUND_PREFIX}/${mode}`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const text = await res.text();
    const data = text ? safeJson(text) : {};
    if (!res.ok) {
      throw new SignalEDIError(
        typeof data.error === "string" ? data.error : `Playground failed (${res.status})`,
        res.status,
        typeof data.code === "string" ? data.code : undefined,
      );
    }
    return data;
  }

  /** Parse raw EDI into structured JSON + validation diagnostics. */
  parse(content) {
    if (this.demoMode) return this.playgroundRequest("parse", content);
    return this.request("POST", "/parse", { content });
  }

  /** Validate raw EDI; returns the validation summary only. */
  validate(content) {
    if (this.demoMode) return this.playgroundRequest("validate", content);
    return this.request("POST", "/validate", { content });
  }

  /** Submit an outbound document to a trading partner (async, acked via webhook). */
  sendOutbound(input) {
    return this.request("POST", "/documents/outbound", input);
  }

  /** List recent transactions scoped to the API key (newest first). */
  listTransactions({ limit } = {}) {
    const qs = limit ? `?limit=${encodeURIComponent(String(limit))}` : "";
    return this.request("GET", `/transactions${qs}`);
  }

  /** Fetch one transaction you own, with full lifecycle status. */
  getTransaction(id) {
    return this.request("GET", `/transactions/${encodeURIComponent(id)}`);
  }

  /** QuickBooks Online connection status for the workspace (no tokens returned). */
  quickBooksStatus() {
    return this.request("GET", "/quickbooks/status");
  }

  /** Push EDI transactions INTO QuickBooks (810→Invoice, 850→Bill, 835→Payment). */
  quickBooksSync(input) {
    return this.request("POST", "/quickbooks/sync", input);
  }

  /** Pull QuickBooks entities and emit them as outbound EDI (Invoice→810, PO→850). */
  quickBooksExport(input) {
    return this.request("POST", "/quickbooks/export", input);
  }

  /** List QuickBooks entities for preview/mapping. */
  quickBooksListEntities(entity, { limit } = {}) {
    const qs = new URLSearchParams({ entity });
    if (limit) qs.set("limit", String(limit));
    return this.request("GET", `/quickbooks/entities?${qs.toString()}`);
  }

  /** List packaged API kits from GET /api/v1/kits (platform key required). */
  listPartnerKits() {
    return this.request("GET", "/kits");
  }

  /**
   * Fetch one kit by id from the catalog listing (no per-kit route on /v1).
   * @param {string} kitId
   */
  async getPartnerKit(kitId) {
    const data = await this.listPartnerKits();
    const kits = data?.kits ?? data?.data?.kits ?? [];
    const kit = kits.find((k) => k.id === kitId);
    if (!kit) {
      throw new SignalEDIError(`Unknown kitId: ${kitId}`, 404, "KIT_NOT_FOUND");
    }
    return { kit };
  }
  /** Fetch OpenAPI spec from GET /api/v1/openapi.json (used by MCP resource). */
  fetchOpenApi() {
    return this.request('GET', '/openapi.json', undefined, { auth: !!this.apiKey });
  }

  /** Disconnect QuickBooks — revokes the grant at Intuit and removes the link. */
  quickBooksDisconnect() {
    return this.request("DELETE", "/quickbooks/connection");
  }

}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 500) };
  }
}

async function backoff(attempt, retryAfter) {
  const headerMs = retryAfter ? Number(retryAfter) * 1000 : NaN;
  const base = Number.isFinite(headerMs) ? headerMs : 250 * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 100);
  await sleep(base + jitter);
}
