// Tool definitions for the SignalEDI MCP server.
//
// Pure and dependency-free: each tool carries a JSON Schema `inputSchema`
// (the MCP wire format) plus a `handler(client, args)`. `index.mjs` registers
// these on the MCP Server; `test.mjs` exercises the handlers against a mock
// client. Contracts mirror the tested @signaledi/sdk and docs/openapi/v1.

import { appendDemoFooter, demoModeToolError, KEYED_ONLY_TOOLS } from "./demo.mjs";
import { explainEdiError, lookupX12 } from "./x12-dictionary.mjs";
import { renderTestDocument } from "./templates.mjs";

/** @typedef {import("./client.mjs").SignalEDIClient} SignalEDIClient */

/** Wrap a JSON-serializable result as MCP text content. */
function ok(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

/** Wrap an error as an MCP tool error result (so the model sees it, not a crash). */
function fail(message) {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}

/** Minimal required-string check; richer validation is the API's job. */
function requireString(args, key) {
  const v = args?.[key];
  if (typeof v !== "string" || v.trim() === "") {
    throw new Error(`"${key}" is required and must be a non-empty string.`);
  }
  return v;
}

/** @type {Array<{ name: string, description: string, inputSchema: object, handler: (c: SignalEDIClient, args: any) => Promise<object> }>} */
export const TOOLS = [
  {
    name: "parse_edi",
    description:
      "Parse a raw X12/EDIFACT EDI interchange (e.g. an 850 purchase order, 810 invoice, or 856 ASN) into structured JSON plus a validation summary. Pass the full raw EDI text including the ISA/GS envelope.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The full raw EDI document text (ISAâ€¦IEA).",
        },
      },
      required: ["content"],
      additionalProperties: false,
    },
    handler: async (client, args) => {
      const content = requireString(args, "content");
      return ok(await client.parse(content));
    },
  },
  {
    name: "validate_edi",
    description:
      "Validate a raw EDI interchange against X12 structural rules. Returns a validation summary (valid flag, errors, transaction set, control number, segment count) without the full parsed JSON.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The full raw EDI document text to validate.",
        },
      },
      required: ["content"],
      additionalProperties: false,
    },
    handler: async (client, args) => {
      const content = requireString(args, "content");
      return ok(await client.validate(content));
    },
  },
  {
    name: "send_outbound_document",
    description:
      "Send an outbound EDI document to a trading partner. SignalEDI serializes the JSON payload into valid EDI and delivers it; the call returns a document id and status and is acknowledged asynchronously via webhook.",
    inputSchema: {
      type: "object",
      properties: {
        partnerId: { type: "string", description: "Trading partner id to send to." },
        documentTypeCode: {
          type: "string",
          description: "Document type code, e.g. \"850\", \"810\", \"856\".",
        },
        payload: {
          type: "object",
          description: "The document body as JSON; serialized to EDI by SignalEDI.",
          additionalProperties: true,
        },
        workspaceId: {
          type: "string",
          description: "Optional workspace id (defaults to the API key's workspace).",
        },
        metadata: {
          type: "object",
          description: "Optional metadata echoed back on lifecycle webhooks.",
          additionalProperties: true,
        },
      },
      required: ["partnerId", "documentTypeCode", "payload"],
      additionalProperties: false,
    },
    handler: async (client, args) => {
      const partnerId = requireString(args, "partnerId");
      const documentTypeCode = requireString(args, "documentTypeCode");
      if (typeof args?.payload !== "object" || args.payload === null || Array.isArray(args.payload)) {
        throw new Error('"payload" is required and must be a JSON object.');
      }
      return ok(
        await client.sendOutbound({
          partnerId,
          documentTypeCode,
          payload: args.payload,
          ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
          ...(args.metadata ? { metadata: args.metadata } : {}),
        }),
      );
    },
  },
  {
    name: "list_transactions",
    description:
      "List your recent EDI transactions (newest first), scoped to the API key. Each row includes the transaction set, direction, status, partner, and SLA flag.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Max rows to return (1â€“100; the server caps at 100).",
        },
      },
      additionalProperties: false,
    },
    handler: async (client, args) => {
      const limit = args?.limit;
      if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
        throw new Error('"limit" must be a positive integer.');
      }
      return ok(await client.listTransactions(limit ? { limit } : {}));
    },
  },
  {
    name: "get_transaction",
    description:
      "Fetch a single EDI transaction you own by id, with its full lifecycle status (created/processed timestamps, partner, error message, SLA).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The transaction id." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (client, args) => {
      const id = requireString(args, "id");
      return ok(await client.getTransaction(id));
    },
  },
  {
    name: "quickbooks_status",
    description:
      "Get the QuickBooks Online connection status for your workspace â€” whether QBO is connected, the masked realm id, environment, and any last error. No tokens are returned.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: async (client) => ok(await client.quickBooksStatus()),
  },
  {
    name: "quickbooks_sync_to_qbo",
    description:
      "Push EDI transactions INTO QuickBooks Online (810â†’Invoice, 850â†’Bill, 835â†’Payment). Provide exactly one of: transactionId (one), transactionIds (up to 50), or all:true (every eligible, not-yet-synced transaction). QBO creates are de-duplicated against prior successful syncs.",
    inputSchema: {
      type: "object",
      properties: {
        transactionId: { type: "string", description: "Sync a single EDI transaction by id." },
        transactionIds: {
          type: "array",
          items: { type: "string" },
          description: "Sync up to 50 specific EDI transaction ids.",
        },
        all: { type: "boolean", description: "Sync all eligible, not-yet-synced transactions." },
      },
      additionalProperties: false,
    },
    handler: async (client, args) => {
      const hasOne =
        (typeof args?.transactionId === "string" && args.transactionId.trim() !== "") ||
        (Array.isArray(args?.transactionIds) && args.transactionIds.length > 0) ||
        args?.all === true;
      if (!hasOne) {
        throw new Error("Provide transactionId, transactionIds[], or all:true.");
      }
      return ok(await client.quickBooksSync(args));
    },
  },
  {
    name: "quickbooks_export_to_edi",
    description:
      "Pull QuickBooks entities and emit them as outbound EDI to a trading partner (Invoiceâ†’810, PurchaseOrderâ†’850). Use dryRun:true to preview the mapped payloads without sending. partnerId is required unless dryRun.",
    inputSchema: {
      type: "object",
      properties: {
        entity: { type: "string", enum: ["Invoice", "PurchaseOrder"], description: "QBO entity to export." },
        partnerId: { type: "string", description: "Trading partner id to send to (required unless dryRun)." },
        ids: { type: "array", items: { type: "string" }, description: "Specific QBO ids; omit for most recent." },
        since: { type: "string", description: "ISO date; only entities with TxnDate >= since." },
        maxRows: { type: "integer", minimum: 1, maximum: 100, description: "Cap rows (default/cap 100)." },
        dryRun: { type: "boolean", description: "Map only â€” return payloads without creating documents." },
      },
      required: ["entity"],
      additionalProperties: false,
    },
    handler: async (client, args) => {
      const entity = requireString(args, "entity");
      if (entity !== "Invoice" && entity !== "PurchaseOrder") {
        throw new Error('"entity" must be "Invoice" or "PurchaseOrder".');
      }
      if (args?.dryRun !== true && (typeof args?.partnerId !== "string" || args.partnerId.trim() === "")) {
        throw new Error('"partnerId" is required unless dryRun is true.');
      }
      return ok(await client.quickBooksExport(args));
    },
  },
  {
    name: "quickbooks_list_entities",
    description:
      "List QuickBooks entities for preview/mapping: Invoice, PurchaseOrder, Customer, Vendor, or Item. Returns the QBO rows as-is (no tokens).",
    inputSchema: {
      type: "object",
      properties: {
        entity: {
          type: "string",
          enum: ["Invoice", "PurchaseOrder", "Customer", "Vendor", "Item"],
          description: "Which QBO entity to list.",
        },
        limit: { type: "integer", minimum: 1, maximum: 100, description: "Max rows (1â€“100; default 25)." },
      },
      required: ["entity"],
      additionalProperties: false,
    },
    handler: async (client, args) => {
      const entity = requireString(args, "entity");
      return ok(await client.quickBooksListEntities(entity, args?.limit ? { limit: args.limit } : {}));
    },
  },
  {
    name: "quickbooks_disconnect",
    description:
      "Disconnect QuickBooks Online for your workspace â€” revokes the OAuth grant at Intuit and removes the connection. Irreversible without reconnecting.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: async (client) => ok(await client.quickBooksDisconnect()),
  },
  {
    name: "list_partner_kits",
    description:
      "List packaged SignalEDI API kits (retail, healthcare, quickstart) from GET /api/v1/kits. Requires a platform-scoped API key.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: async (client) => ok(await client.listPartnerKits()),
  },
  {
    name: "get_partner_kit",
    description:
      "Fetch one API kit by kitId from the /api/v1/kits catalog (structured endpoints, webhook events, sample payloads). Requires a platform API key.",
    inputSchema: {
      type: "object",
      properties: {
        kitId: { type: "string", description: "Catalog kit id, e.g. retail_order_lifecycle." },
        partnerId: {
          type: "string",
          description: "Alias for kitId when your workflow names the kit as a partner preset id.",
        },
      },
      additionalProperties: false,
    },
    handler: async (client, args) => {
      const kitId = (args?.kitId || args?.partnerId || "").trim();
      if (!kitId) throw new Error('Provide kitId (or partnerId alias).');
      return ok(await client.getPartnerKit(kitId));
    },
  },
  {
    name: "explain_edi_error",
    description:
      "Explain an EDI validation or functional-ack error using the local X12 dictionary (meaning, typical cause, fix, lookup_x12 cross-refs). Never calls the network; works in demo mode.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "Ack or validation code (e.g. R, 4, 7)." },
        segment: { type: "string", description: "Segment id near the error (e.g. SE, PO1)." },
        rawError: { type: "string", description: "Optional raw error text from validate_edi or a 997/999." },
      },
      additionalProperties: false,
    },
    handler: async (_client, args) => ok(explainEdiError(args || {})),
  },
  {
    name: "generate_test_document",
    description:
      "Render a synthetic X12 sample for 850, 810, 856, or 837 with optional control number, PO, and date overrides. Local only; works in demo mode.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["850", "810", "856", "837"], description: "Transaction set to generate." },
        overrides: {
          type: "object",
          properties: {
            controlNumber: { type: "string" },
            poNumber: { type: "string" },
            date: { type: "string", description: "YYYYMMDD" },
          },
          additionalProperties: false,
        },
      },
      required: ["type"],
      additionalProperties: false,
    },
    handler: async (_client, args) => {
      const type = requireString(args, "type");
      if (!["850", "810", "856", "837"].includes(type)) {
        throw new Error('type must be one of "850", "810", "856", "837".');
      }
      const content = renderTestDocument(type, args?.overrides || {});
      return ok({ type, content });
    },
  },
  {
    name: "lookup_x12",
    description:
      "Search the local X12 dictionary by segment id, ack code, or free text (segment names and purposes). Local only; works in demo mode.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Segment id, ack code, or keyword." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    handler: async (_client, args) => ok(lookupX12(requireString(args, "query"))),
  },

];

/** Look up a tool by name. */
export function getTool(name) {
  return TOOLS.find((t) => t.name === name);
}

/**
 * Invoke a tool by name, translating thrown errors into MCP error results so a
 * bad argument or API failure surfaces to the model instead of killing the server.
 * @param {SignalEDIClient} client
 * @param {string} name
 * @param {any} args
 */
export async function callTool(client, name, args) {
  const tool = getTool(name);
  if (!tool) return fail(`Unknown tool: ${name}`);

  if (client.demoMode && KEYED_ONLY_TOOLS.has(name)) {
    return demoModeToolError(name);
  }

  try {
    const result = await tool.handler(client, args || {});
    if (client.demoMode && !result.isError) {
      return appendDemoFooter(result);
    }
    return result;
  } catch (err) {
    const status = err && typeof err.status === "number" ? ` (HTTP ${err.status})` : "";
    return fail(`${tool.name} failed${status}: ${err?.message || String(err)}`);
  }
}
