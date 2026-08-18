// Minimal, dependency-free SignalEDI Core API client for the MCP server.
//
// Mirrors @signaledi/sdk and docs/openapi/v1, but inlined (zero deps) so the
// MCP package stays installable/auditable and testable without a build step.
// Hardened the same way as the GitHub Action: per-attempt timeout, a total
// deadline, and GET-only retry-on-transient with exponential backoff + jitter.

const DEFAULT_BASE_URL = "https://signaledi.com";
const API_PREFIX = "/api/v1";

const ATTEMPT_TIMEOUT_MS = 15_000; // per HTTP attempt
const TOTAL_DEADLINE_MS = 30_000; // across all retries
const MAX_RETRIES = 3;
const MAX_BACKOFF_MS = 2_000;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
export const MCP_EDI_CONTENT_MAX_BYTES = 64 * 1024;
export const MCP_JSON_BODY_MAX_BYTES = 1024 * 1024;
export const MCP_RESPONSE_MAX_BYTES = 4 * 1024 * 1024;
const SUPPORTED_PROFILES = new Set(["docs", "sandbox", "production"]);
const PRODUCTION_READ_PATHS = [
  /^\/transactions(?:\?.*)?$/,
  /^\/transactions\/[^/?]+$/,
  /^\/connections(?:\?.*)?$/,
  /^\/connections\/[^/?]+$/,
  /^\/quickbooks\/status$/,
  /^\/kits$/,
  /^\/openapi\.json$/,
];
const CONNECTION_PATH = /^\/connections\/[^/?]+$/;
const CONNECTION_TEST_PATH = /^\/connections\/[^/?]+\/test$/;
const CONFIGURE_CONNECTION_KEYS = new Set([
  "action", "environment", "gatewayId", "x12Envelope", "requirementVersion",
]);
const X12_ENVELOPE_KEYS = new Set([
  "isaSenderQualifier", "isaSenderId", "isaReceiverQualifier",
  "isaReceiverId", "gsSenderId", "gsReceiverId",
]);

export class SignalEDIError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   * @param {string=} code
   * @param {{ fieldErrors?: Record<string, string>, correlationId?: string, detail?: string | null, requestId?: string, remote?: boolean }=} details
   */
  constructor(message, status, code, details = {}) {
    super(message);
    this.name = "SignalEDIError";
    this.status = status;
    this.code = code;
    this.fieldErrors = details.fieldErrors;
    this.correlationId = details.correlationId;
    this.detail = details.detail;
    this.requestId = details.requestId;
    this.remote = details.remote === true;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class SignalEDIClient {
  /**
   * @param {{ apiKey?: string, baseUrl?: string, fetch?: typeof fetch, demoMode?: boolean, profile?: string, baseUrlExplicit?: boolean, allowCustomBaseUrl?: boolean, allowProduction?: boolean }} options
   */
  constructor(options) {
    this.profile = options?.profile || "docs";
    this.demoMode = this.profile === "docs";
    const apiKey = typeof options?.apiKey === "string" ? options.apiKey.trim() : "";
    if (!SUPPORTED_PROFILES.has(this.profile)) {
      throw new Error("SignalEDI: profile must be docs, sandbox, or production.");
    }
    if (this.profile !== "docs" && !apiKey) {
      throw new Error(`SignalEDI: ${this.profile} profile requires apiKey (set SIGNALEDI_API_KEY).`);
    }
    if (this.profile === "production" && options?.allowProduction !== true) {
      throw new Error("SignalEDI: production profile requires SIGNALEDI_MCP_ALLOW_PRODUCTION=1.");
    }
    this.apiKey = this.profile === "docs" ? undefined : apiKey;
    this.baseUrl = validateBaseUrl(options?.baseUrl || DEFAULT_BASE_URL, {
      profile: this.profile,
      baseUrlExplicit: options?.baseUrlExplicit ?? Boolean(options?.baseUrl),
      allowCustomBaseUrl: options?.allowCustomBaseUrl === true,
      allowProduction: options?.allowProduction === true,
    });
    this.fetchImpl = options?.fetch || globalThis.fetch;
    if (!this.fetchImpl) {
      throw new Error("SignalEDI: no global fetch available (Node 22+ required).");
    }
  }

  /**
   * @template T
   * @param {"GET"|"POST"|"PATCH"|"DELETE"} method
   * @param {string} path
   * @param {unknown=} body
   * @param {{ auth?: boolean, toolName?: string, requestId?: string, idempotencyKey?: string, retry?: boolean }=} opts
   * @returns {Promise<T>}
   */
  async request(method, path, body, opts = { auth: true }) {
    const publicDocsOpenApi = this.profile === "docs"
      && method === "GET"
      && path === "/openapi.json"
      && body === undefined
      && opts.auth === false
      && opts.toolName === undefined
      && opts.requestId === undefined
      && opts.idempotencyKey === undefined;
    if (this.profile === "docs" && !publicDocsOpenApi) {
      throw new SignalEDIError(
        "Remote SignalEDI API calls require an explicitly configured sandbox or production profile; docs permits only the content-free public OpenAPI GET.",
        403,
        "REMOTE_PROFILE_REQUIRED",
      );
    }
    const productionRead = method === "GET" && PRODUCTION_READ_PATHS.some((pattern) => pattern.test(path));
    const productionMutation = isAllowedProductionMutation(method, path, body, opts);
    if (this.profile === "production" && !productionRead && !productionMutation) {
      throw new SignalEDIError(
        `Production profile does not permit direct ${method} ${path}; only production-safe reads and explicitly guarded mutation adapters are exposed.`,
        403,
        "PRODUCTION_OPERATION_NOT_ALLOWED",
        { requestId: opts.requestId },
      );
    }
    const url = buildApiUrl(this.baseUrl, path, opts.requestId);
    const serializedBody = body === undefined ? undefined : serializeRequestBody(body, opts.requestId);
    const startedAt = Date.now();
    const retryAllowed = opts.retry === true || (opts.retry !== false && method === "GET");
    const maxRetries = retryAllowed ? MAX_RETRIES : 0;
    let attempt = 0;
    let lastErr;

    while (attempt <= maxRetries) {
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
          ...(serializedBody !== undefined ? { "Content-Type": "application/json" } : {}),
        };
        if (opts.auth !== false && this.apiKey) {
          headers.Authorization = `Bearer ${this.apiKey}`;
        }
        if (opts.toolName) headers["X-SignalEDI-MCP-Tool"] = opts.toolName;
        if (opts.requestId) headers["X-Request-Id"] = opts.requestId;
        if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

        const res = await this.fetchImpl(url, {
          method,
          headers,
          ...(serializedBody !== undefined ? { body: serializedBody } : {}),
          redirect: "error",
          signal: controller.signal,
        });

        const responseRequestId = responseHeader(res, "x-request-id") || opts.requestId;
        assertResponseLengthHeader(responseHeader(res, "content-length"), responseRequestId);
        const text = await readResponseText(res, responseRequestId);
        const parsed = parseJson(text);
        if (res.ok && (!parsed.ok || !isPlainObject(parsed.value))) {
          throw new SignalEDIError(
            "SignalEDI returned a successful HTTP response without a valid JSON object.",
            502,
            "INVALID_API_RESPONSE",
            { requestId: responseRequestId, remote: true },
          );
        }
        const data = parsed.ok && isPlainObject(parsed.value)
          ? parsed.value
          : { error: text.slice(0, 500) };

        if (res.ok && data.ok === false) {
          throw new SignalEDIError(
            apiErrorMessage(data, 502, "SignalEDI returned an error envelope with HTTP 200"),
            502,
            typeof data.code === "string" ? data.code : "INVALID_API_RESPONSE",
            { ...apiErrorDetails(data), requestId: responseRequestId, remote: true },
          );
        }

        if (!res.ok) {
          if (retryAllowed && RETRYABLE_STATUS.has(res.status) && attempt < maxRetries) {
            await backoff(
              attempt,
              responseHeader(res, "retry-after"),
              TOTAL_DEADLINE_MS - (Date.now() - startedAt),
            );
            attempt += 1;
            continue;
          }
          throw new SignalEDIError(
            apiErrorMessage(data, res.status, "Request failed"),
            res.status,
            typeof data.code === "string" ? data.code : undefined,
            { ...apiErrorDetails(data), requestId: responseRequestId, remote: true },
          );
        }
        return /** @type {T} */ (data);
      } catch (err) {
        lastErr = err;
        if (err && typeof err === "object" && opts.requestId && !err.requestId) {
          err.requestId = opts.requestId;
        }
        if (err instanceof SignalEDIError) throw err;
        if (retryAllowed && attempt < maxRetries) {
          await backoff(attempt, null, TOTAL_DEADLINE_MS - (Date.now() - startedAt));
          attempt += 1;
          continue;
        }
        throw new SignalEDIError(
          `SignalEDI request failed: ${err instanceof Error ? err.message : String(err)}`,
          502,
          "UPSTREAM_REQUEST_FAILED",
          { requestId: opts.requestId, remote: true },
        );
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new SignalEDIError(
      `SignalEDI request failed: ${lastErr instanceof Error ? lastErr.message : "deadline exceeded"}`,
      502,
      "UPSTREAM_REQUEST_FAILED",
      { requestId: opts.requestId, remote: true },
    );
  }

  /** Parse raw EDI into structured JSON + validation diagnostics. */
  parse(content, opts = {}) {
    this.assertProfiles("parse", ["sandbox"]);
    assertContentSize(content);
    return this.request("POST", "/parse", { content }, { ...opts, retry: false, toolName: "parse_edi" });
  }

  /** Validate raw EDI; returns the validation summary only. */
  validate(content, opts = {}) {
    this.assertProfiles("validate", ["sandbox"]);
    assertContentSize(content);
    return this.request("POST", "/validate", { content }, { ...opts, retry: false, toolName: "validate_edi" });
  }

  /** Submit an outbound document to a trading partner (async, acked via webhook). */
  sendOutbound(input, opts = {}) {
    this.assertProfiles("sendOutbound", ["sandbox", "production"]);
    this.assertEnvironment("sendOutbound", input);
    return this.request("POST", "/documents/outbound", input, {
      ...opts,
      toolName: "send_outbound_document",
      retry: false,
    });
  }

  /** List recent transactions scoped to the API key (newest first). */
  listTransactions({ limit } = {}, opts = {}) {
    const qs = limit ? `?limit=${encodeURIComponent(String(limit))}` : "";
    return this.request("GET", `/transactions${qs}`, undefined, opts);
  }

  /** Fetch one transaction you own, with full lifecycle status. */
  getTransaction(id, opts = {}) {
    return this.request("GET", `/transactions/${encodeURIComponent(id)}`, undefined, opts);
  }

  /** List sanitized partner-connection control-plane summaries. */
  listConnections(filters = {}, opts = {}) {
    const query = new URLSearchParams();
    for (const key of ["partnerId", "lifecycle", "cursor"]) {
      if (filters[key] !== undefined) query.set(key, String(filters[key]));
    }
    if (filters.limit !== undefined) query.set("limit", String(filters.limit));
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return this.request("GET", `/connections${suffix}`, undefined, opts);
  }

  /** Get one sanitized connection readiness workspace. */
  getConnection(connectionId, opts = {}) {
    return this.request("GET", `/connections/${encodeURIComponent(connectionId)}`, undefined, opts);
  }

  /** Create a sandbox-first connection draft; never activates production. */
  createConnectionDraft(input, opts = {}) {
    this.assertProfiles("createConnectionDraft", ["sandbox", "production"]);
    return this.request("POST", "/connections", input, {
      ...opts,
      toolName: "create_connection_draft",
      retry: false,
    });
  }

  /** Bind an existing gateway reference and server-owned X12 environment profile. */
  configureConnection(connectionId, input, opts = {}) {
    this.assertProfiles("configureConnection", ["sandbox", "production"]);
    return this.request("PATCH", `/connections/${encodeURIComponent(connectionId)}`, input, {
      ...opts,
      toolName: "configure_connection",
      retry: false,
    });
  }

  /** Request governed go-live review; this does not activate production. */
  requestConnectionGoLive(connectionId, opts = {}) {
    this.assertProfiles("requestConnectionGoLive", ["sandbox", "production"]);
    return this.request("PATCH", `/connections/${encodeURIComponent(connectionId)}`, { action: "request_go_live" }, {
      ...opts,
      toolName: "request_connection_go_live",
      retry: false,
    });
  }

  /** Test the exact saved connection/environment; never accepts transport configuration. */
  testConnection(connectionId, input, opts = {}) {
    this.assertProfiles("testConnection", ["sandbox", "production"]);
    this.assertEnvironment("testConnection", input);
    return this.request(
      "POST",
      `/connections/${encodeURIComponent(connectionId)}/test`,
      input,
      {
        ...opts,
        toolName: "test_connection",
        retry: false,
      },
    );
  }

  /** QuickBooks Online connection status for the workspace (no tokens returned). */
  quickBooksStatus(opts = {}) {
    return this.request("GET", "/quickbooks/status", undefined, opts);
  }

  /** Push EDI transactions INTO QuickBooks (810ΓåÆInvoice, 850ΓåÆBill, 835ΓåÆPayment). */
  quickBooksSync(input, opts = {}) {
    this.assertProfiles("quickBooksSync", ["sandbox"]);
    return this.request("POST", "/quickbooks/sync", input, { ...opts, toolName: "quickbooks_sync_to_qbo", retry: false });
  }

  /** Pull QuickBooks entities and emit them as outbound EDI (InvoiceΓåÆ810, POΓåÆ850). */
  quickBooksExport(input, opts = {}) {
    this.assertProfiles("quickBooksExport", ["sandbox", "production"]);
    this.assertEnvironment("quickBooksExport", input);
    return this.request("POST", "/quickbooks/export", input, {
      ...opts,
      toolName: "quickbooks_export_to_edi",
      retry: false,
    });
  }

  /** List QuickBooks entities for preview/mapping. */
  quickBooksListEntities(entity, { limit } = {}, opts = {}) {
    this.assertProfiles("quickBooksListEntities", ["sandbox"]);
    const qs = new URLSearchParams({ entity });
    if (limit) qs.set("limit", String(limit));
    return this.request("GET", `/quickbooks/entities?${qs.toString()}`, undefined, opts);
  }

  /** List packaged API kits from GET /api/v1/kits (platform key required). */
  listPartnerKits(opts = {}) {
    return this.request("GET", "/kits", undefined, opts);
  }

  /**
   * Fetch one kit by id from the catalog listing (no per-kit route on /v1).
   * @param {string} kitId
   */
  async getPartnerKit(kitId, opts = {}) {
    const data = await this.listPartnerKits(opts);
    const kits = data?.kits ?? data?.data?.kits ?? [];
    const kit = kits.find((k) => k.id === kitId);
    if (!kit) {
      throw new SignalEDIError(`Unknown kitId: ${kitId}`, 404, "KIT_NOT_FOUND");
    }
    return { kit };
  }
  /** Fetch OpenAPI spec from GET /api/v1/openapi.json (used by MCP resource). */
  fetchOpenApi(opts = {}) {
    return this.request("GET", "/openapi.json", undefined, { ...opts, auth: false });
  }

  /** Disconnect QuickBooks ΓÇö revokes the grant at Intuit and removes the link. */
  quickBooksDisconnect(opts = {}) {
    this.assertProfiles("quickBooksDisconnect", ["sandbox"]);
    return this.request("DELETE", "/quickbooks/connection", undefined, { ...opts, toolName: "quickbooks_disconnect", retry: false });
  }

  assertProfiles(operation, allowedProfiles) {
    if (!allowedProfiles.includes(this.profile)) {
      throw new SignalEDIError(
        `${operation} is available only in the ${allowedProfiles.join(" or ")} profile.`,
        403,
        "PROFILE_NOT_ALLOWED",
      );
    }
  }

  assertEnvironment(operation, input) {
    const expected = this.profile === "production" ? "PRODUCTION" : "SANDBOX";
    if (!isPlainObject(input) || input.environment !== expected) {
      throw new SignalEDIError(
        `${operation} requires environment:${expected} for the active ${this.profile} profile.`,
        400,
        "ENVIRONMENT_MISMATCH",
      );
    }
  }

}

export function validateBaseUrl(value, options = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("SignalEDI: SIGNALEDI_BASE_URL must be a valid absolute URL.");
  }
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1").replace(/\.$/, "").toLowerCase();
  const local = new Set(["localhost", "127.0.0.1", "::1"]);
  const official = new Set(["signaledi.com", "www.signaledi.com", "api.signaledi.com"]);
  if (url.username || url.password || url.search || url.hash || !["", "/"].includes(url.pathname)) {
    throw new Error("SignalEDI: SIGNALEDI_BASE_URL cannot contain credentials, a path, query parameters, or a fragment.");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local.has(host))) {
    throw new Error("SignalEDI: SIGNALEDI_BASE_URL must use HTTPS (HTTP is allowed only for localhost).");
  }
  if (!official.has(host) && options.allowCustomBaseUrl !== true) {
    throw new Error("SignalEDI: custom API hosts require SIGNALEDI_MCP_ALLOW_CUSTOM_BASE_URL=1 after verifying the destination.");
  }
  if (options.profile === "sandbox") {
    if (options.baseUrlExplicit !== true) {
      throw new Error(`SignalEDI: ${options.profile} profile requires an explicit SIGNALEDI_BASE_URL for a provisioned non-production environment.`);
    }
    if (official.has(host)) {
      throw new Error(`SignalEDI: ${options.profile} profile refuses the production SignalEDI API host.`);
    }
  }
  if (options.profile === "production") {
    if (options.allowProduction !== true) {
      throw new Error("SignalEDI: production profile requires SIGNALEDI_MCP_ALLOW_PRODUCTION=1.");
    }
    if (options.baseUrlExplicit !== true) {
      throw new Error("SignalEDI: production profile requires an explicit SIGNALEDI_BASE_URL.");
    }
    if (host !== "signaledi.com" || url.protocol !== "https:" || url.port) {
      throw new Error("SignalEDI: production profile requires the canonical https://signaledi.com origin.");
    }
  }
  return url.toString().replace(/\/$/, "");
}

function assertContentSize(content) {
  if (typeof content !== "string") return;
  if (Buffer.byteLength(content, "utf8") > MCP_EDI_CONTENT_MAX_BYTES) {
    throw new SignalEDIError(`EDI content exceeds the ${MCP_EDI_CONTENT_MAX_BYTES}-byte limit.`, 413, "PAYLOAD_TOO_LARGE");
  }
}

function parseJson(text) {
  if (!text) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function apiErrorMessage(data, status, fallback) {
  if (status >= 500) return `${fallback} (${status})`;
  return typeof data.error === "string" ? data.error : `${fallback} (${status})`;
}

function apiErrorDetails(data) {
  const fieldErrors = isPlainObject(data.fieldErrors)
    ? Object.fromEntries(Object.entries(data.fieldErrors).filter(([, value]) => typeof value === "string"))
    : undefined;
  return {
    ...(fieldErrors && Object.keys(fieldErrors).length > 0 ? { fieldErrors } : {}),
    ...(typeof data.correlationId === "string" ? { correlationId: data.correlationId } : {}),
    ...(typeof data.detail === "string" || data.detail === null ? { detail: data.detail } : {}),
  };
}

function serializeRequestBody(body, requestId) {
  let serialized;
  try {
    serialized = JSON.stringify(body);
  } catch {
    throw new SignalEDIError("SignalEDI request body must be JSON-serializable.", 400, "INVALID_REQUEST_BODY", { requestId });
  }
  if (typeof serialized !== "string") {
    throw new SignalEDIError("SignalEDI request body must serialize to JSON.", 400, "INVALID_REQUEST_BODY", { requestId });
  }
  if (Buffer.byteLength(serialized, "utf8") > MCP_JSON_BODY_MAX_BYTES) {
    throw new SignalEDIError(
      `SignalEDI request body exceeds the ${MCP_JSON_BODY_MAX_BYTES}-byte limit.`,
      413,
      "REQUEST_BODY_TOO_LARGE",
      { requestId },
    );
  }
  return serialized;
}

function assertResponseLengthHeader(value, requestId) {
  const length = Number(value);
  if (Number.isFinite(length) && length > MCP_RESPONSE_MAX_BYTES) {
    throw new SignalEDIError(
      `SignalEDI response exceeds the ${MCP_RESPONSE_MAX_BYTES}-byte limit.`,
      502,
      "RESPONSE_TOO_LARGE",
      { requestId },
    );
  }
}

function assertResponseSize(text, requestId) {
  if (Buffer.byteLength(text, "utf8") > MCP_RESPONSE_MAX_BYTES) {
    throw new SignalEDIError(
      `SignalEDI response exceeds the ${MCP_RESPONSE_MAX_BYTES}-byte limit.`,
      502,
      "RESPONSE_TOO_LARGE",
      { requestId },
    );
  }
}

function responseHeader(response, name) {
  return typeof response?.headers?.get === "function" ? response.headers.get(name) : null;
}

function buildApiUrl(baseUrl, path, requestId) {
  if (typeof path !== "string" || !path.startsWith("/") || path.includes("#") || /[\\\r\n]/.test(path)) {
    throw new SignalEDIError("SignalEDI API path is invalid.", 400, "INVALID_API_PATH", { requestId });
  }
  const queryIndex = path.indexOf("?");
  const rawPathname = queryIndex >= 0 ? path.slice(0, queryIndex) : path;
  const expectedPathname = `${API_PREFIX}${rawPathname}`;
  const parsed = new URL(`${API_PREFIX}${path}`, `${baseUrl}/`);
  if (parsed.origin !== new URL(baseUrl).origin || parsed.pathname !== expectedPathname) {
    throw new SignalEDIError("SignalEDI API path normalization changed the requested endpoint.", 400, "INVALID_API_PATH", { requestId });
  }
  return parsed.toString();
}

async function readResponseText(response, requestId) {
  const reader = response?.body && typeof response.body.getReader === "function"
    ? response.body.getReader()
    : null;
  if (!reader) {
    const text = await response.text();
    assertResponseSize(text, requestId);
    return text;
  }

  const decoder = new TextDecoder();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MCP_RESPONSE_MAX_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new SignalEDIError(
        `SignalEDI response exceeds the ${MCP_RESPONSE_MAX_BYTES}-byte limit.`,
        502,
        "RESPONSE_TOO_LARGE",
        { requestId },
      );
    }
    chunks.push(decoder.decode(value, { stream: true }));
  }
  chunks.push(decoder.decode());
  return chunks.join("");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value, allowed) {
  return isPlainObject(value) && Object.keys(value).every((key) => allowed.has(key));
}

function isValidIdempotencyKey(value) {
  return typeof value === "string"
    && value.length >= 8
    && value.length <= 128
    && /^[\x21-\x7E](?:[\x20-\x7E]*[\x21-\x7E])?$/.test(value);
}

function isAllowedProductionMutation(method, path, body, opts = {}) {
  const toolName = opts.toolName;
  if (
    method === "POST"
    && CONNECTION_TEST_PATH.test(path)
    && toolName === "test_connection"
    && hasOnlyKeys(body, new Set(["environment"]))
    && body.environment === "PRODUCTION"
  ) {
    return true;
  }
  if (
    method === "POST"
    && isPlainObject(body)
    && body.environment === "PRODUCTION"
  ) {
    if (path === "/documents/outbound") {
      return toolName === "send_outbound_document"
        && isValidIdempotencyKey(opts.idempotencyKey);
    }
    if (path === "/quickbooks/export") {
      return toolName === "quickbooks_export_to_edi"
        && (body.dryRun === true || isValidIdempotencyKey(opts.idempotencyKey));
    }
  }
  if (
    method === "POST"
    && path === "/connections"
    && toolName === "create_connection_draft"
    && hasOnlyKeys(body, new Set(["partnerId", "displayName", "transportMethod", "direction"]))
    && typeof body.partnerId === "string"
    && ["AS2", "SFTP"].includes(body.transportMethod)
    && (body.displayName === undefined || typeof body.displayName === "string")
    && (body.direction === undefined || ["INBOUND", "OUTBOUND", "BIDIRECTIONAL"].includes(body.direction))
  ) {
    return true;
  }
  if (method !== "PATCH" || !CONNECTION_PATH.test(path) || !isPlainObject(body)) {
    return false;
  }
  if (toolName === "request_connection_go_live") {
    return hasOnlyKeys(body, new Set(["action"])) && body.action === "request_go_live";
  }
  return toolName === "configure_connection"
    && hasOnlyKeys(body, CONFIGURE_CONNECTION_KEYS)
    && body.action === "configure_environment"
    && ["SANDBOX", "PRODUCTION"].includes(body.environment)
    && typeof body.gatewayId === "string"
    && (body.requirementVersion === undefined || typeof body.requirementVersion === "string")
    && hasOnlyKeys(body.x12Envelope, X12_ENVELOPE_KEYS)
    && [...X12_ENVELOPE_KEYS].every((key) => typeof body.x12Envelope[key] === "string");
}

export function retryDelayMs(attempt, retryAfter, remainingMs, jitterMs = Math.floor(Math.random() * 100)) {
  const headerMs = retryAfter ? Number(retryAfter) * 1000 : NaN;
  const base = Number.isFinite(headerMs) && headerMs >= 0 ? headerMs : 250 * 2 ** attempt;
  return Math.max(0, Math.min(base + jitterMs, MAX_BACKOFF_MS, remainingMs));
}

async function backoff(attempt, retryAfter, remainingMs) {
  const delay = retryDelayMs(attempt, retryAfter, remainingMs);
  if (delay > 0) await sleep(delay);
}
