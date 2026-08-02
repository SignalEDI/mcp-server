// Dependency-free tests for the SignalEDI MCP server's pure modules.
// Run: node test.mjs   (no install, no network ├óΓé¼ΓÇ¥ uses a mock fetch.)
//
// Covers the client (auth header, retry, error mapping) and the tools
// (schema shape, handler happy paths, and MCP error results). The stdio
// wiring in index.mjs depends on @modelcontextprotocol/sdk and is exercised
// by the MCP client at runtime, not here.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SignalEDIClient, SignalEDIError } from "./src/client.mjs";
import { TOOLS, getTool, callTool } from "./src/tools.mjs";
import {
  DEMO_GET_KEY_URL,
  DEMO_MODE_FOOTER,
  buildDemoStartupLine,
  resolveStartupFromEnv,
} from "./src/demo.mjs";

import {
  VALIDATION_CATALOG_CODES,
  catalogCodeHasDictionaryEntry,
  explainEdiError,
  lookupX12,
} from "./src/x12-dictionary.mjs";
import { renderTestDocument } from "./src/templates.mjs";
import {
  listResources,
  readResource,
  listPrompts,
  getPrompt,
} from "./src/resources.mjs";
import { loadPackageMetadata } from "./src/metadata.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const readPackageFile = (name) => readFileSync(join(ROOT, name), "utf8");

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err?.message || err}`);
    process.exitCode = 1;
  }
}

/** Build a mock fetch that returns a queued sequence of responses. */
function mockFetch(responses) {
  const calls = [];
  const queue = [...responses];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const next = queue.shift() ?? { status: 200, body: {} };
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      headers: { get: (h) => next.headers?.[h.toLowerCase()] ?? null },
      text: async () => (typeof next.body === "string" ? next.body : JSON.stringify(next.body)),
    };
  };
  fn.calls = calls;
  return fn;
}

// ├óΓÇ¥Γé¼├óΓÇ¥Γé¼ Client ├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼

await test("client requires an apiKey unless demoMode", () => {
  assert.throws(() => new SignalEDIClient({}), /apiKey is required/);
  assert.doesNotThrow(() => new SignalEDIClient({ demoMode: true }));
});

await test("client allows HTTP only for localhost including bracketed IPv6", () => {
  assert.doesNotThrow(() => new SignalEDIClient({ apiKey: "k", baseUrl: "http://localhost:3000" }));
  assert.doesNotThrow(() => new SignalEDIClient({ apiKey: "k", baseUrl: "http://127.0.0.1:3000" }));
  assert.doesNotThrow(() => new SignalEDIClient({ apiKey: "k", baseUrl: "http://[::1]:3000" }));
  assert.throws(
    () => new SignalEDIClient({ apiKey: "k", baseUrl: "http://example.com" }),
    /must use HTTPS/,
  );
});

await test("client sends Bearer auth + JSON body and hits /api/v1", async () => {
  const fetch = mockFetch([{ status: 200, body: { validation: { valid: true }, json: {}, envelope: {} } }]);
  const client = new SignalEDIClient({ apiKey: "sk_test_123", fetch });
  const out = await client.parse("ISA*00*├óΓé¼┬ª");
  assert.equal(out.validation.valid, true);
  const call = fetch.calls[0];
  assert.match(call.url, /\/api\/v1\/parse$/);
  assert.equal(call.init.headers.Authorization, "Bearer sk_test_123");
  assert.equal(call.init.method, "POST");
  assert.deepEqual(JSON.parse(call.init.body), { content: "ISA*00*├óΓé¼┬ª" });
});

await test("client retries a 503 then succeeds", async () => {
  const fetch = mockFetch([
    { status: 503, headers: { "retry-after": "0" }, body: { error: "busy" } },
    { status: 200, body: { validation: { valid: true } } },
  ]);
  const client = new SignalEDIClient({ apiKey: "k", fetch });
  const out = await client.validate("ISA*├óΓé¼┬ª");
  assert.equal(out.validation.valid, true);
  assert.equal(fetch.calls.length, 2);
});

await test("client throws SignalEDIError on a non-retryable 400", async () => {
  const fetch = mockFetch([{ status: 400, body: { error: "bad edi", code: "PARSE_ERROR" } }]);
  const client = new SignalEDIClient({ apiKey: "k", fetch });
  await assert.rejects(() => client.parse("garbage"), (err) => {
    assert.ok(err instanceof SignalEDIError);
    assert.equal(err.status, 400);
    assert.equal(err.code, "PARSE_ERROR");
    return true;
  });
  assert.equal(fetch.calls.length, 1); // no retry on 4xx
});

await test("client sanitizes 5xx upstream error text", async () => {
  const fetch = mockFetch([
    { status: 502, headers: { "retry-after": "0" }, body: "upstream stack trace with tenant detail" },
    { status: 502, headers: { "retry-after": "0" }, body: "upstream stack trace with tenant detail" },
    { status: 502, headers: { "retry-after": "0" }, body: "upstream stack trace with tenant detail" },
    { status: 502, body: "upstream stack trace with tenant detail" },
  ]);
  const client = new SignalEDIClient({ apiKey: "k", fetch });
  await assert.rejects(() => client.parse("ISA*"), (err) => {
    assert.ok(err instanceof SignalEDIError);
    assert.equal(err.status, 502);
    assert.match(err.message, /Request failed \(502\)/);
    assert.doesNotMatch(err.message, /tenant detail|stack trace/);
    return true;
  });
  assert.equal(fetch.calls.length, 4);
});

await test("listTransactions encodes the limit query", async () => {
  const fetch = mockFetch([{ status: 200, body: { transactions: [] } }]);
  const client = new SignalEDIClient({ apiKey: "k", fetch });
  await client.listTransactions({ limit: 25 });
  assert.match(fetch.calls[0].url, /\/transactions\?limit=25$/);
});

// ├óΓÇ¥Γé¼├óΓÇ¥Γé¼ Tool definitions ├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼

await test("every tool has a name, description, and object inputSchema", () => {
  assert.ok(TOOLS.length >= 5);
  const names = new Set();
  for (const t of TOOLS) {
    assert.equal(typeof t.name, "string");
    assert.ok(t.name.length > 0, "tool name");
    assert.ok(!names.has(t.name), `duplicate tool name ${t.name}`);
    names.add(t.name);
    assert.ok(t.description.length > 20, `${t.name} description too short`);
    assert.equal(t.inputSchema.type, "object");
    assert.equal(typeof t.handler, "function");
  }
  for (const expected of [
    "parse_edi",
    "validate_edi",
    "send_outbound_document",
    "list_transactions",
    "get_transaction",
  ]) {
    assert.ok(getTool(expected), `missing tool ${expected}`);
  }
});

// ├óΓÇ¥Γé¼├óΓÇ¥Γé¼ Tool handlers (via callTool) ├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼

function stubClient(overrides = {}) {
  return {
    parse: async (c) => ({ echoed: c, validation: { valid: true } }),
    validate: async (c) => ({ echoed: c, validation: { valid: true } }),
    sendOutbound: async (i) => ({ documentId: "doc_1", status: "queued", input: i }),
    listTransactions: async (p) => ({ transactions: [], params: p }),
    getTransaction: async (id) => ({ transaction: { id } }),
    quickBooksStatus: async () => ({ connected: true, realmId: "****1234" }),
    quickBooksSync: async (i) => ({ synced: 1, failed: 0, results: [], input: i }),
    quickBooksExport: async (i) => ({ entity: i.entity, exported: 1, failed: 0, items: [], input: i }),
    quickBooksListEntities: async (e, p) => ({ entity: e, count: 0, rows: [], params: p }),
    quickBooksDisconnect: async () => ({ success: true, connected: false, revoked: true }),
    ...overrides,
  };
}

await test("demo parse_edi hits public playground endpoint", async () => {
  const fetch = mockFetch([
    {
      status: 200,
      body: { ok: true, demo: true, validation: { valid: true } },
    },
  ]);
  const client = new SignalEDIClient({ demoMode: true, fetch });
  const res = await callTool(client, "parse_edi", { content: "ISA*├óΓé¼┬ª" });
  assert.equal(res.isError, undefined);
  assert.match(res.content[0].text, /demo mode/);
  assert.match(fetch.calls[0].url, /\/api\/public\/playground\/parse$/);
  assert.equal(fetch.calls[0].init.headers.Authorization, undefined);
});

await test("demo playground retries transient failures and posts content payload", async () => {
  const fetch = mockFetch([
    { status: 503, headers: { "retry-after": "0" }, body: { error: "busy" } },
    { status: 200, body: { ok: true, demo: true, validation: { valid: true } } },
  ]);
  const client = new SignalEDIClient({ demoMode: true, fetch });
  const out = await client.validate("ISA*00*");
  assert.equal(out.demo, true);
  assert.equal(fetch.calls.length, 2);
  assert.match(fetch.calls[0].url, /\/api\/public\/playground\/validate$/);
  assert.deepEqual(JSON.parse(fetch.calls[0].init.body), { content: "ISA*00*" });
  assert.ok(fetch.calls[0].init.signal, "playground requests use AbortSignal timeouts");
});

await test("demo gated tool returns structured demo_mode error", async () => {
  const client = new SignalEDIClient({ demoMode: true, fetch: mockFetch([]) });
  const res = await callTool(client, "send_outbound_document", {
    partnerId: "p",
    documentTypeCode: "850",
    payload: {},
  });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /"error": "demo_mode"/);
});



await test("keyed parse_edi regression unchanged", async () => {
  const res = await callTool(stubClient(), "parse_edi", { content: "ISA*├óΓé¼┬ª" });
  assert.equal(res.isError, undefined);
  assert.equal(res.content[0].type, "text");
  assert.match(res.content[0].text, /"valid": true/);
});

await test("parse_edi rejects a missing content arg as an MCP error", async () => {
  const res = await callTool(stubClient(), "parse_edi", {});
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /content.*required/i);
});

await test("send_outbound_document requires an object payload", async () => {
  const bad = await callTool(stubClient(), "send_outbound_document", {
    partnerId: "p1",
    documentTypeCode: "850",
    payload: "not-an-object",
    confirm: true,
    idempotencyKey: "send-test-001",
  });
  assert.equal(bad.isError, true);
  const good = await callTool(stubClient(), "send_outbound_document", {
    partnerId: "p1",
    documentTypeCode: "850",
    payload: { foo: "bar" },
    confirm: true,
    idempotencyKey: "send-test-002",
  });
  assert.equal(good.isError, undefined);
  assert.match(good.content[0].text, /doc_1/);
});

await test("list_transactions rejects a non-positive limit", async () => {
  const res = await callTool(stubClient(), "list_transactions", { limit: 0 });
  assert.equal(res.isError, true);
});

await test("callTool maps an API SignalEDIError into an MCP error result", async () => {
  const client = stubClient({
    getTransaction: async () => {
      throw new SignalEDIError("not found", 404, "NOT_FOUND");
    },
  });
  const res = await callTool(client, "get_transaction", { id: "missing" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /HTTP 404/);
});

await test("callTool reports an unknown tool", async () => {
  const res = await callTool(stubClient(), "no_such_tool", {});
  assert.equal(res.isError, true);
  assert.equal(res.structuredContent.error, "UNKNOWN_TOOL");
  assert.match(res.content[0].text, /Unknown tool/);
});

await test("mutation tools require confirmation and idempotency", async () => {
  const res = await callTool(stubClient(), "send_outbound_document", {
    partnerId: "p1", documentTypeCode: "850", payload: {},
  });
  assert.equal(res.structuredContent.error, "CONFIRMATION_REQUIRED");
  const confirmed = await callTool(stubClient(), "send_outbound_document", {
    partnerId: "p1", documentTypeCode: "850", payload: {}, confirm: true,
  });
  assert.equal(confirmed.structuredContent.error, "IDEMPOTENCY_KEY_REQUIRED");
});

await test("successful tool results include structured content", async () => {
  const res = await callTool(stubClient(), "generate_test_document", { type: "850" });
  assert.equal(typeof res.structuredContent, "object");
  assert.equal(res._meta.protocolVersion, "1");
});

// ├óΓÇ¥Γé¼├óΓÇ¥Γé¼ QuickBooks tools ├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼├óΓÇ¥Γé¼

await test("the QuickBooks tools are registered", () => {
  for (const expected of [
    "quickbooks_status",
    "quickbooks_sync_to_qbo",
    "quickbooks_export_to_edi",
    "quickbooks_list_entities",
    "quickbooks_disconnect",
  ]) {
    assert.ok(getTool(expected), `missing tool ${expected}`);
  }
});

await test("quickbooks_status returns content", async () => {
  const res = await callTool(stubClient(), "quickbooks_status", {});
  assert.equal(res.isError, undefined);
  assert.match(res.content[0].text, /"connected": true/);
});

await test("quickbooks_sync_to_qbo rejects an empty selector", async () => {
  const res = await callTool(stubClient(), "quickbooks_sync_to_qbo", { confirm: true, idempotencyKey: "sync-test-001" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /transactionId.*transactionIds.*all/i);
});

await test("quickbooks_sync_to_qbo requires confirmation and accepts all:true", async () => {
  const gated = await callTool(stubClient(), "quickbooks_sync_to_qbo", { all: true });
  assert.equal(gated.structuredContent.error, "CONFIRMATION_REQUIRED");
  const res = await callTool(stubClient(), "quickbooks_sync_to_qbo", { all: true, confirm: true, idempotencyKey: "sync-test-002" });
  assert.equal(res.isError, undefined);
  assert.match(res.content[0].text, /"synced": 1/);
});

await test("quickbooks_export_to_edi requires partnerId unless dryRun", async () => {
  const bad = await callTool(stubClient(), "quickbooks_export_to_edi", { entity: "Invoice" });
  assert.equal(bad.isError, true);
  const dry = await callTool(stubClient(), "quickbooks_export_to_edi", { entity: "Invoice", dryRun: true });
  assert.equal(dry.isError, undefined);
  const sent = await callTool(stubClient(), "quickbooks_export_to_edi", { entity: "Invoice", partnerId: "p1", confirm: true, idempotencyKey: "export-test-001" });
  assert.equal(sent.isError, undefined);
});

await test("quickbooks_export_to_edi rejects an unknown entity", async () => {
  const res = await callTool(stubClient(), "quickbooks_export_to_edi", { entity: "Bogus", dryRun: true });
  assert.equal(res.isError, true);
});

await test("quickbooks_list_entities forwards the entity", async () => {
  const res = await callTool(stubClient(), "quickbooks_list_entities", { entity: "Customer" });
  assert.equal(res.isError, undefined);
  assert.match(res.content[0].text, /"entity": "Customer"/);
});



await test("demo-mode startup config when SIGNALEDI_API_KEY is absent", () => {
  const cfg = resolveStartupFromEnv({});
  assert.equal(cfg.demoMode, true);
  assert.equal(cfg.apiKey, undefined);
  assert.match(buildDemoStartupLine(), /demo mode/);
  assert.match(buildDemoStartupLine(), /console/);
});

await test("client allows missing apiKey when demoMode is true", () => {
  const fetch = mockFetch([{ status: 200, body: { ok: true } }]);
  assert.doesNotThrow(() => new SignalEDIClient({ demoMode: true, fetch }));
});

await test("demo parse hits public playground without Authorization", async () => {
  const fetch = mockFetch([
    { status: 200, body: { ok: true, validation: { valid: true }, demo: true } },
  ]);
  const client = new SignalEDIClient({ demoMode: true, fetch });
  const out = await client.parse("ISA*00*");
  assert.equal(out.demo, true);
  const call = fetch.calls[0];
  assert.ok(call.url.includes("public/playground/parse"));
  assert.equal(call.init.headers.Authorization, undefined);
});

await test("gated tool returns structured demo_mode JSON", async () => {
  const client = { demoMode: true, ...stubClient() };
  const res = await callTool(client, "list_transactions", {});
  assert.equal(res.isError, true);
  const body = JSON.parse(res.content[0].text);
  assert.equal(body.error, "demo_mode");
  assert.equal(body.getKeyUrl, DEMO_GET_KEY_URL);
});

await test("parse_edi in demo mode appends rate-limit footer", async () => {
  const client = { demoMode: true, ...stubClient() };
  const res = await callTool(client, "parse_edi", { content: "ISA*" });
  assert.ok(res.content[0].text.includes(DEMO_MODE_FOOTER));
});


// ├óΓé¼ΓÇ¥├óΓé¼ΓÇ¥ WP-4 tool surface ├óΓé¼ΓÇ¥├óΓé¼ΓÇ¥

await test("WP-4 tools are registered", () => {
  for (const expected of [
    "list_partner_kits",
    "get_partner_kit",
    "explain_edi_error",
    "generate_test_document",
    "lookup_x12",
  ]) {
    assert.ok(getTool(expected), `missing tool ${expected}`);
  }
});

await test("list_partner_kits calls GET /api/v1/kits", async () => {
  const fetch = mockFetch([{ status: 200, body: { ok: true, kits: [{ id: "quickstart" }] } }]);
  const client = new SignalEDIClient({ apiKey: "k", fetch });
  const res = await callTool(client, "list_partner_kits", {});
  assert.equal(res.isError, undefined);
  assert.match(fetch.calls[0].url, /\/api\/v1\/kits$/);
  assert.match(res.content[0].text, /quickstart/);
});

await test("get_partner_kit selects kit from listing", async () => {
  const fetch = mockFetch([
    { status: 200, body: { kits: [{ id: "retail_order_lifecycle", name: "Retail" }] } },
  ]);
  const client = new SignalEDIClient({ apiKey: "k", fetch });
  const res = await callTool(client, "get_partner_kit", { kitId: "retail_order_lifecycle" });
  assert.equal(res.isError, undefined);
  assert.match(res.content[0].text, /retail_order_lifecycle/);
});

await test("get_partner_kit returns MCP error when kit missing", async () => {
  const fetch = mockFetch([{ status: 200, body: { kits: [] } }]);
  const client = new SignalEDIClient({ apiKey: "k", fetch });
  const res = await callTool(client, "get_partner_kit", { kitId: "missing" });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /KIT_NOT_FOUND|Unknown kitId/);
});

await test("demo mode blocks list_partner_kits", async () => {
  const client = new SignalEDIClient({ demoMode: true, fetch: mockFetch([]) });
  const res = await callTool(client, "list_partner_kits", {});
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /demo_mode/);
});

await test("generate_test_document renders 850 locally", async () => {
  const client = new SignalEDIClient({ demoMode: true, fetch: mockFetch([]) });
  const res = await callTool(client, "generate_test_document", { type: "850", overrides: { poNumber: "PO-TEST" } });
  assert.equal(res.isError, undefined);
  assert.match(res.content[0].text, /PO-TEST/);
  assert.match(res.content[0].text, /ST\*850/);
  assert.ok(res.content[0].text.includes(DEMO_MODE_FOOTER));
});

await test("generate_test_document rejects unknown type", async () => {
  const client = { demoMode: true, ...stubClient() };
  const res = await callTool(client, "generate_test_document", { type: "999" });
  assert.equal(res.isError, true);
});

await test("explain_edi_error resolves ack code R", async () => {
  const client = new SignalEDIClient({ demoMode: true, fetch: mockFetch([]) });
  const res = await callTool(client, "explain_edi_error", { code: "R", segment: "SE" });
  assert.equal(res.isError, undefined);
  assert.match(res.content[0].text, /Rejected/);
  assert.match(res.content[0].text, /lookup_x12/);
});

await test("lookup_x12 finds PO1 segment", async () => {
  const client = new SignalEDIClient({ demoMode: true, fetch: mockFetch([]) });
  const res = await callTool(client, "lookup_x12", { query: "PO1" });
  assert.equal(res.isError, undefined);
  assert.match(res.content[0].text, /Baseline Item Data/);
});

await test("validation catalog codes have dictionary entries", () => {
  for (const code of VALIDATION_CATALOG_CODES) {
    assert.ok(catalogCodeHasDictionaryEntry(code), `missing dictionary entry for ${code}`);
  }
});

await test("renderTestDocument covers all template types", () => {
  for (const type of ["850", "810", "856", "837"]) {
    const doc = renderTestDocument(type);
    assert.match(doc, /ISA\*/);
    assert.match(doc, new RegExp(`ST\\*${type}`));
  }
});

await test("renderTestDocument validates override boundaries", () => {
  const invoice = renderTestDocument("810", { controlNumber: "123456789", poNumber: "PO-SAFE", date: "20260713" });
  assert.match(invoice, /ISA\*.*123456789/);
  assert.match(invoice, /IEA\*1\*123456789~/);
  assert.throws(() => renderTestDocument("850", { date: "2026-07-13" }), /YYYYMMDD/);
  assert.throws(() => renderTestDocument("850", { controlNumber: "123" }), /9 digits/);
  assert.throws(() => renderTestDocument("850", { poNumber: "PO~BAD" }), /EDI separators/);
  assert.throws(() => renderTestDocument("850", { unknown: "x" }), /Unsupported override/);
});

await test("generate_test_document rejects unsafe local-template overrides", async () => {
  const client = { demoMode: true, ...stubClient() };
  const res = await callTool(client, "generate_test_document", { type: "850", overrides: { poNumber: "PO*BAD" } });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /EDI separators/);
});

await test("explainEdiError falls back for unknown code", () => {
  const out = explainEdiError({ code: "ZZZZ", rawError: "test" });
  assert.match(out.meaning, /Structural|issue/);
  assert.equal(out.rawError, "test");
});

await test("lookupX12 returns empty matches for blank query", () => {
  assert.deepEqual(lookupX12("   ").matches, []);
});


// -- WP-5 resources & prompts --

await test("WP-5 lists three MCP resources", () => {
  const resources = listResources();
  assert.equal(resources.length, 3);
  const uris = resources.map((r) => r.uri);
  for (const expected of ["signaledi://quickstart", "signaledi://openapi", "signaledi://x12-reference"]) {
    assert.ok(uris.includes(expected), `missing resource ${expected}`);
  }
});

await test("readResource quickstart returns bundled markdown", async () => {
  const out = await readResource(stubClient(), "signaledi://quickstart");
  assert.equal(out.contents[0].mimeType, "text/markdown");
  assert.ok(out.contents[0].text.length > 40);
});

await test("fetchOpenApi hits openapi.json and caches in readResource", async () => {
  const fetch = mockFetch([{ status: 200, body: { openapi: "3.0.0", info: { title: "SignalEDI" } } }]);
  const client = new SignalEDIClient({ apiKey: "k", fetch });
  await readResource(client, "signaledi://openapi");
  const second = await readResource(client, "signaledi://openapi");
  assert.match(second.contents[0].text, /SignalEDI/);
  assert.equal(fetch.calls.length, 1);
  assert.match(fetch.calls[0].url, /\/openapi\.json$/);
});

await test("readResource x12-reference renders dictionary markdown", async () => {
  const out = await readResource(stubClient(), "signaledi://x12-reference");
  assert.match(out.contents[0].text, /Segments/);
  assert.match(out.contents[0].text, /PO1/);
});

await test("WP-5 lists onboard-partner and debug-rejection prompts", () => {
  const prompts = listPrompts();
  assert.equal(prompts.length, 2);
  const names = prompts.map((p) => p.name);
  assert.ok(names.includes("onboard-partner"));
  assert.ok(names.includes("debug-rejection"));
});

await test("onboard-partner prompt templates partner and tool steps", () => {
  const out = getPrompt("onboard-partner", { partnerName: "Acme Retail", documentTypes: "850,856" });
  const text = out.messages[0].content.text;
  assert.match(text, /Acme Retail/);
  assert.match(text, /850,856/);
  assert.match(text, /validate_edi/);
  assert.match(text, /list_partner_kits/);
});

await test("debug-rejection prompt references explain and lookup tools", () => {
  const out = getPrompt("debug-rejection", { rawError: "AK5*R*5" });
  const text = out.messages[0].content.text;
  assert.match(text, /AK5\*R\*5/);
  assert.match(text, /explain_edi_error/);
  assert.match(text, /lookup_x12/);
  assert.match(text, /validate_edi/);
});

await test("readResource rejects unknown uri", async () => {
  await assert.rejects(() => readResource(stubClient(), "signaledi://nope"), /Unknown resource/);
});

// -- Packaging and registry metadata --

await test("runtime metadata version matches package and server manifest", () => {
  const metadata = loadPackageMetadata();
  assert.equal(metadata.version, "0.4.0");
  assert.equal(metadata.serverVersion, metadata.version);
  assert.equal(metadata.registryPackageVersion, metadata.version);
  assert.equal(metadata.mcpName, "io.github.SignalEDI/mcp-server");
});

await test("README documents every registered tool", () => {
  const readme = readPackageFile("README.md");
  for (const tool of TOOLS) {
    assert.match(readme, new RegExp(`\\\`${tool.name}\\\``), `README missing ${tool.name}`);
  }
  assert.doesNotMatch(readme, /X12\/EDIFACT|no EDI logic lives here/);
  assert.match(readme, /local X12 templates\/dictionary/);
});

await test("npm package includes registry, license, mirror, examples, and tests", () => {
  const pkg = JSON.parse(readPackageFile("package.json"));
  for (const expected of ["src", "examples", "LICENSE", "MIRROR.md", "README.md", "server.json", "test.mjs"]) {
    assert.ok(pkg.files.includes(expected), `package files missing ${expected}`);
  }
  assert.doesNotMatch(JSON.stringify(pkg), /edifact/i);
});

console.log(`\n${passed} passed`);
