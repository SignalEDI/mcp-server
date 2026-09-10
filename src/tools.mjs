// Tool definitions for the SignalEDI MCP server.
//
// Pure and dependency-free: each tool carries a JSON Schema `inputSchema`
// (the MCP wire format) plus a `handler(client, args)`. `index.mjs` registers
// these on the MCP Server; `test.mjs` exercises the handlers against a mock
// client. Contracts mirror the tested @signaledi/sdk and docs/openapi/v1.

import { appendDemoFooter, isToolAvailableInProfile, profileToolError } from "./demo.mjs";
import {
  generateIntegrationExample,
  LOCAL_EXAMPLE_DOCUMENT_TYPES,
  OUTBOUND_EXAMPLE_DOCUMENT_TYPES,
} from "./codegen.mjs";
import { MCP_EDI_CONTENT_MAX_BYTES } from "./client.mjs";
import {
  LOCAL_DOCUMENT_SET_CODES,
  LOCAL_OUTBOUND_DOCUMENT_TYPES,
  getDocumentSchema,
} from "./document-schemas.mjs";
import {
  CONNECTION_CREATE_OUTPUT_SCHEMA,
  CONNECTION_DIRECTIONS,
  CONNECTION_ENVIRONMENTS,
  CONNECTION_GET_OUTPUT_SCHEMA,
  CONNECTION_LIFECYCLES,
  CONNECTION_LIST_OUTPUT_SCHEMA,
  CONNECTION_MUTATION_OUTPUT_SCHEMA,
  CONNECTION_TEST_OUTPUT_SCHEMA,
  CONNECTION_TRANSPORTS,
  projectConnectionCreateResponse,
  projectConnectionListResponse,
  projectConnectionTestResponse,
  projectConnectionWorkspaceResponse,
} from "./connections.mjs";
import { searchDeveloperDocs } from "./developer-docs.mjs";
import { explainEdiError, lookupX12 } from "./x12-dictionary.mjs";
import { localFixtureCapability, renderTestDocument } from "./templates.mjs";
import {
  QBO_EXPORT_OUTPUT_SCHEMA,
  QBO_STATUS_OUTPUT_SCHEMA,
  projectQuickBooksExportResponse,
  projectQuickBooksStatusResponse,
} from "./quickbooks.mjs";
import { errorResult, ok, requestId, validateMutationArgs } from "./protocol.mjs";
import { ToolInputError, validateToolArguments } from "./schema-validation.mjs";

/** @typedef {import("./client.mjs").SignalEDIClient} SignalEDIClient */

const SUPPORTED_OUTBOUND_DOCUMENT_TYPES = LOCAL_OUTBOUND_DOCUMENT_TYPES;

function requestMeta(context) {
  return context?.requestId ? { "com.signaledi/requestId": context.requestId } : {};
}

function environmentForProfile(profile) {
  return profile === "production" ? "PRODUCTION" : "SANDBOX";
}

const X12_QUALIFIER_PATTERN = "^(?:0[0-9]|1[0-6]|20|30|ZZ)$";
const X12_CONNECTION_ID_PATTERN = "^(?!.*[*~>^])(?=.*[\\x21-\\x7E])[\\x20-\\x7E]{1,15}$";

function normalizedX12Envelope(envelope) {
  return Object.fromEntries(
    Object.entries(envelope).map(([key, value]) => [key, value.trim()]),
  );
}

/** Schema validation runs first; this preserves concise handler-level errors. */
function requireString(args, key) {
  const v = args?.[key];
  if (typeof v !== "string" || v.trim() === "") {
    throw invalidArguments(`"${key}" is required and must be a non-empty string.`, [`$.${key} must be a non-empty string`]);
  }
  return v;
}

function invalidArguments(message, details = []) {
  return new ToolInputError(`Invalid tool arguments: ${message}`, details);
}

/** @type {Array<{ name: string, description: string, inputSchema: object, outputSchema?: object, localOnly?: boolean, remoteSideEffect?: boolean, mutation?: boolean, idempotent?: boolean, productionSafe?: boolean, requiredScopes?: string[], productionScopes?: string[], conditionalScopes?: Array<{ when: string, scopes: string[] }>, handler: (c: SignalEDIClient, args: any, context?: { requestId?: string }) => Promise<object> }>} */
export const TOOLS = [
  {
    name: "parse_edi",
    remoteSideEffect: true,
    requiredScopes: ["platform"],
    description:
      "Upload a raw X12 EDI interchange to the configured non-production SignalEDI API and parse it into structured JSON plus a validation summary. This can record sandbox usage and is never automatically retried. Pass only synthetic or approved test data, including the ISA/GS envelope.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          maxLength: MCP_EDI_CONTENT_MAX_BYTES,
          description: `The full raw EDI document text (ISA through IEA), capped at ${MCP_EDI_CONTENT_MAX_BYTES} UTF-8 bytes.`,
        },
      },
      required: ["content"],
      additionalProperties: false,
    },
    handler: async (client, args, context) => {
      const content = requireString(args, "content");
      return ok(await client.parse(content, context), requestMeta(context));
    },
  },
  {
    name: "validate_edi",
    remoteSideEffect: true,
    requiredScopes: ["platform"],
    description:
      "Upload a raw X12 EDI interchange to the configured non-production SignalEDI API for structural validation. This can record sandbox usage and is never automatically retried. Returns a validation summary without the full parsed JSON; pass only synthetic or approved test data.",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          maxLength: MCP_EDI_CONTENT_MAX_BYTES,
          description: `The full raw EDI document text to validate, capped at ${MCP_EDI_CONTENT_MAX_BYTES} UTF-8 bytes.`,
        },
      },
      required: ["content"],
      additionalProperties: false,
    },
    handler: async (client, args, context) => {
      const content = requireString(args, "content");
      return ok(await client.validate(content, context), requestMeta(context));
    },
  },
  {
    name: "search_docs",
    localOnly: true,
    description:
      "Search the bundled public SignalEDI developer index. Returns authoritative MCP resource URIs and short snippets; it does not search customer data or private partner guides.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: 200, description: "Developer question or keywords." },
        limit: { type: "integer", minimum: 1, maximum: 10, description: "Maximum matches (default 5)." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    handler: async (_client, args) => ok({
      query: requireString(args, "query"),
      results: searchDeveloperDocs(args.query, args.limit || 5),
      scope: "bundled-public-developer-index",
    }),
  },
  {
    name: "get_document_schema",
    localOnly: true,
    description:
      "Get a public X12 starter schema for every local inventory set (retail, transport, warehouse, and 837 Professional partial). Returns an honest capability label and is explicitly not a trading-partner implementation guide. Refuses EDIFACT, HL7, and unknown sets.",
    inputSchema: {
      type: "object",
      properties: {
        transactionSet: {
          type: "string",
          minLength: 2,
          maxLength: 16,
          pattern: "^[A-Za-z0-9][A-Za-z0-9/_-]{0,15}$",
          description: `Local starter codes: ${LOCAL_DOCUMENT_SET_CODES.join(", ")}. 837 means Professional 005010X222A1 only.`,
        },
      },
      required: ["transactionSet"],
      additionalProperties: false,
    },
    handler: async (_client, args) => {
      try {
        return ok(getDocumentSchema(requireString(args, "transactionSet")));
      } catch (error) {
        if (error?.code === "OUT_OF_SCOPE_FORMAT" || error?.code === "UNSUPPORTED_TRANSACTION_SET" || error?.code === "DOCUMENT_SCHEMA_NOT_FOUND") {
          throw Object.assign(new ToolInputError(error.message, [`$.transactionSet ${error.code}`]), { code: error.code });
        }
        throw error;
      }
    },
  },
  {
    name: "generate_integration_example",
    localOnly: true,
    description:
      "Generate a sandbox-safe cURL, Node.js, or Python example for the current SignalEDI REST contract. Uses environment-variable placeholders and synthetic values, sets outbound environment to SANDBOX, refuses production hosts, and never embeds credentials.",
    inputSchema: {
      type: "object",
      properties: {
        language: { type: "string", enum: ["curl", "node", "python"] },
        operation: { type: "string", enum: ["parse", "validate", "send_outbound"] },
        documentType: { type: "string", enum: [...LOCAL_EXAMPLE_DOCUMENT_TYPES], description: "Fixture type. Outbound examples support 850, 810, and 856; 837 is parse/validate only." },
      },
      required: ["language", "operation"],
      additionalProperties: false,
      oneOf: [
        {
          properties: {
            operation: { type: "string", enum: ["parse", "validate"] },
            documentType: { type: "string", enum: [...LOCAL_EXAMPLE_DOCUMENT_TYPES] },
          },
        },
        {
          properties: {
            operation: { type: "string", const: "send_outbound" },
            documentType: { type: "string", enum: [...OUTBOUND_EXAMPLE_DOCUMENT_TYPES] },
          },
        },
      ],
    },
    handler: async (_client, args) => ok(generateIntegrationExample(args)),
  },
  {
    name: "send_outbound_document",
    mutation: true,
    idempotent: true,
    productionSafe: true,
    requiredScopes: ["platform", "platform:documents:read", "platform:documents:send"],
    productionScopes: ["platform:documents:production"],
    description:
      "Send an outbound EDI document through the active partner connection in the selected MCP environment. SignalEDI validates immutable production readiness, serializes the JSON payload into EDI, and returns a queued document id plus replay status.",
    inputSchema: {
      type: "object",
      properties: {
        partnerId: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S", description: "Trading partner id to send to." },
        documentTypeCode: {
          type: "string",
          enum: [...SUPPORTED_OUTBOUND_DOCUMENT_TYPES],
          description: "Document type code, e.g. \"850\", \"810\", \"856\".",
        },
        payload: {
          type: "object",
          description: "The document body as JSON; serialized to EDI by SignalEDI.",
          minProperties: 1,
          additionalProperties: true,
        },
        workspaceId: {
          type: "string",
          description: "Optional workspace id (defaults to the API key's workspace).",
        },
        confirm: { type: "boolean", const: true, description: "Assert that a human reviewed and approved this external send." },
        idempotencyKey: { type: "string", minLength: 8, maxLength: 128, pattern: "^[\\x21-\\x7E](?:[\\x20-\\x7E]*[\\x21-\\x7E])?$", description: "Caller-generated 8-128 printable ASCII key, without edge whitespace, for durable API-side duplicate detection. MCP does not retry mutations." },
      },
      required: ["partnerId", "documentTypeCode", "payload", "confirm", "idempotencyKey"],
      additionalProperties: false,
    },
    handler: async (client, args, context) => {
      const partnerId = requireString(args, "partnerId");
      const documentTypeCode = requireString(args, "documentTypeCode");
      if (typeof args?.payload !== "object" || args.payload === null || Array.isArray(args.payload)) {
        throw invalidArguments('"payload" is required and must be a JSON object.', ["$.payload must be an object"]);
      }
      const { confirm: _confirm, idempotencyKey, ...input } = args;
      return ok(
        await client.sendOutbound({
          ...input,
          environment: environmentForProfile(client.profile),
        }, { idempotencyKey: idempotencyKey.trim(), requestId: context?.requestId }),
        requestMeta(context),
      );
    },
  },
  {
    name: "list_transactions",
    productionSafe: true,
    requiredScopes: ["platform", "platform:documents:read"],
    description:
      "List your recent EDI transactions (newest first), scoped to the API key. Each row includes the transaction set, direction, status, partner, and SLA flag.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          description: "Max rows to return (1-100; the server caps at 100).",
        },
      },
      additionalProperties: false,
    },
    handler: async (client, args, context) => {
      const limit = args?.limit;
      if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
        throw invalidArguments('"limit" must be a positive integer.', ["$.limit must be a positive integer"]);
      }
      return ok(await client.listTransactions(limit ? { limit } : {}, context), requestMeta(context));
    },
  },
  {
    name: "get_transaction",
    productionSafe: true,
    requiredScopes: ["platform", "platform:documents:read"],
    description:
      "Fetch a single EDI transaction you own by id, with its full lifecycle status (created/processed timestamps, partner, error message, SLA).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S", description: "The transaction id." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (client, args, context) => {
      const id = requireString(args, "id");
      return ok(await client.getTransaction(id, context), requestMeta(context));
    },
  },
  {
    name: "list_connections",
    productionSafe: true,
    requiredScopes: ["platform", "platform:connections:read"],
    description:
      "List tenant-scoped partner connection summaries and cursor state. Results are projected onto a secret-free allowlist: status booleans and opaque gateway/evidence references may be returned, but credentials, keys, certificates, tokens, and raw transport configuration are never returned.",
    inputSchema: {
      type: "object",
      properties: {
        partnerId: { type: "string", minLength: 1, maxLength: 128, pattern: "\\S", description: "Optional trading partner id filter." },
        lifecycle: { type: "string", enum: [...CONNECTION_LIFECYCLES], description: "Optional governed lifecycle filter." },
        cursor: { type: "string", minLength: 1, maxLength: 128, pattern: "\\S", description: "Opaque nextCursor from the preceding page." },
        limit: { type: "integer", minimum: 1, maximum: 100, description: "Page size (default 25; maximum 100)." },
      },
      additionalProperties: false,
    },
    handler: async (client, args, context) => ok(
      projectConnectionListResponse(await client.listConnections(args || {}, context)),
      requestMeta(context),
    ),
  },
  {
    name: "get_connection",
    productionSafe: true,
    requiredScopes: ["platform", "platform:connections:read"],
    description:
      "Inspect one sanitized partner connection workspace: environments, safe gateway references, evidence status, test coverage, readiness blockers, and next actions. Stored credentials, private keys, tokens, certificates, and raw transport configuration are never returned.",
    inputSchema: {
      type: "object",
      properties: {
        connectionId: { type: "string", minLength: 1, maxLength: 128, pattern: "\\S", description: "Tenant-scoped partner connection id." },
      },
      required: ["connectionId"],
      additionalProperties: false,
    },
    handler: async (client, args, context) => ok(
      projectConnectionWorkspaceResponse(await client.getConnection(requireString(args, "connectionId"), context)),
      requestMeta(context),
    ),
  },
  {
    name: "create_connection_draft",
    mutation: true,
    idempotent: true,
    productionSafe: true,
    requiredScopes: ["platform", "platform:connections:read", "platform:connections:write"],
    description:
      "Create or idempotently recover the matching sandbox-first partner connection in DRAFT, reporting created=true only for a new row. This operation cannot create an active production environment or activate delivery; it accepts only partner identity, AS2/SFTP transport choice, direction, and an optional display name.",
    inputSchema: {
      type: "object",
      properties: {
        partnerId: { type: "string", minLength: 1, maxLength: 128, pattern: "\\S", description: "Existing tenant-visible trading partner id." },
        displayName: { type: "string", minLength: 1, maxLength: 160, pattern: "\\S", description: "Optional human-readable connection name." },
        transportMethod: { type: "string", enum: [...CONNECTION_TRANSPORTS], description: "Governed transport; only AS2 and SFTP drafts are supported." },
        direction: { type: "string", enum: [...CONNECTION_DIRECTIONS], description: "Document flow direction (defaults server-side when omitted)." },
        confirm: { type: "boolean", const: true, description: "Assert that a human reviewed and approved creating this draft." },
        idempotencyKey: { type: "string", minLength: 8, maxLength: 128, pattern: "^[\\x21-\\x7E](?:[\\x20-\\x7E]*[\\x21-\\x7E])?$", description: "Caller-generated 8-128 printable ASCII key without edge whitespace for API-side replay protection." },
      },
      required: ["partnerId", "transportMethod", "confirm", "idempotencyKey"],
      additionalProperties: false,
    },
    handler: async (client, args, context) => {
      const { confirm: _confirm, idempotencyKey, ...input } = args;
      return ok(
        projectConnectionCreateResponse(await client.createConnectionDraft(input, {
          idempotencyKey: idempotencyKey.trim(),
          requestId: context?.requestId,
        })),
        requestMeta(context),
      );
    },
  },
  {
    name: "configure_connection",
    mutation: true,
    idempotent: true,
    productionSafe: true,
    requiredScopes: ["platform", "platform:connections:read", "platform:connections:write"],
    productionScopes: ["platform:connections:production"],
    description:
      "Configure a SANDBOX or PRODUCTION AS2/SFTP connection environment using only an existing gateway reference and X12 ISA/GS identifiers. Legacy API connections are readable but are configured in the governed API-connections surface. SignalEDI owns ISA15 (T for sandbox, P for production), resolves the gateway server-side, and accepts no credentials, secrets, private keys, tokens, certificates, or raw transport configuration. PRODUCTION configuration additionally requires platform:connections:production and does not activate delivery.",
    inputSchema: {
      type: "object",
      properties: {
        connectionId: { type: "string", minLength: 1, maxLength: 128, pattern: "\\S", description: "Tenant-scoped partner connection id." },
        environment: { type: "string", enum: [...CONNECTION_ENVIRONMENTS], description: "Environment to configure; PRODUCTION requires the production API capability." },
        gatewayId: { type: "string", minLength: 1, maxLength: 128, pattern: "\\S", description: "Opaque reference to an existing compatible gateway; never gateway credentials or configuration." },
        x12Envelope: {
          type: "object",
          properties: {
            isaSenderQualifier: { type: "string", minLength: 2, maxLength: 2, pattern: X12_QUALIFIER_PATTERN, description: "Two-character product-supported X12 qualifier: 00-09, 10-16, 20, 30, or ZZ." },
            isaSenderId: { type: "string", minLength: 1, maxLength: 15, pattern: X12_CONNECTION_ID_PATTERN },
            isaReceiverQualifier: { type: "string", minLength: 2, maxLength: 2, pattern: X12_QUALIFIER_PATTERN, description: "Two-character product-supported X12 qualifier: 00-09, 10-16, 20, 30, or ZZ." },
            isaReceiverId: { type: "string", minLength: 1, maxLength: 15, pattern: X12_CONNECTION_ID_PATTERN },
            gsSenderId: { type: "string", minLength: 1, maxLength: 15, pattern: X12_CONNECTION_ID_PATTERN },
            gsReceiverId: { type: "string", minLength: 1, maxLength: 15, pattern: X12_CONNECTION_ID_PATTERN },
          },
          required: ["isaSenderQualifier", "isaSenderId", "isaReceiverQualifier", "isaReceiverId", "gsSenderId", "gsReceiverId"],
          additionalProperties: false,
          description: "X12 identifiers only. ISA15 usageIndicator is intentionally absent and server-owned.",
        },
        requirementVersion: { type: "string", minLength: 1, maxLength: 100, pattern: "\\S", description: "Optional implementation-requirement version label; not a credential." },
        confirm: { type: "boolean", const: true, description: "Assert that a human reviewed and approved this environment configuration." },
        idempotencyKey: { type: "string", minLength: 8, maxLength: 128, pattern: "^[\\x21-\\x7E](?:[\\x20-\\x7E]*[\\x21-\\x7E])?$", description: "Caller-generated 8-128 printable ASCII key without edge whitespace for API-side replay protection." },
      },
      required: ["connectionId", "environment", "gatewayId", "x12Envelope", "confirm", "idempotencyKey"],
      additionalProperties: false,
    },
    handler: async (client, args, context) => {
      const { connectionId, confirm: _confirm, idempotencyKey, ...configuration } = args;
      const response = await client.configureConnection(connectionId, {
        action: "configure_environment",
        ...configuration,
        gatewayId: configuration.gatewayId.trim(),
        x12Envelope: normalizedX12Envelope(configuration.x12Envelope),
        ...(configuration.requirementVersion === undefined
          ? {}
          : { requirementVersion: configuration.requirementVersion.trim() }),
      }, {
        idempotencyKey: idempotencyKey.trim(),
        requestId: context?.requestId,
      });
      return ok(projectConnectionWorkspaceResponse(response, { mutation: true }), requestMeta(context));
    },
  },
  {
    name: "test_connection",
    mutation: true,
    idempotent: true,
    productionSafe: true,
    requiredScopes: [
      "platform",
      "platform:connections:read",
      "platform:connections:write",
    ],
    productionScopes: ["platform:connections:production"],
    description:
      "Run one governed connectivity-test execution against the exact saved connection and the environment selected by the active MCP profile. This causes partner-network egress and records sanitized audit/evidence state, so confirm:true is only a caller assertion and the MCP host must enforce human review. Completed pass and fail results replay without another test execution. No endpoint, credential, certificate, private key, token, or raw connector error is accepted or returned; a production test never activates delivery.",
    inputSchema: {
      type: "object",
      properties: {
        connectionId: { type: "string", minLength: 1, maxLength: 128, pattern: "\\S", description: "Tenant-scoped partner connection id. The server resolves its saved transport and configuration." },
        confirm: { type: "boolean", const: true, description: "Caller assertion that the host obtained human approval for this external connectivity test." },
        idempotencyKey: { type: "string", minLength: 8, maxLength: 128, pattern: "^[\\x21-\\x7E](?:[\\x20-\\x7E]*[\\x21-\\x7E])?$", description: "Caller-generated 8-128 printable ASCII key without edge whitespace. MCP never retries this egress operation." },
      },
      required: ["connectionId", "confirm", "idempotencyKey"],
      additionalProperties: false,
    },
    outputSchema: CONNECTION_TEST_OUTPUT_SCHEMA,
    handler: async (client, args, context) => {
      const connectionId = requireString(args, "connectionId");
      const environment = environmentForProfile(client.profile);
      const response = await client.testConnection(
        connectionId,
        { environment },
        {
          idempotencyKey: args.idempotencyKey.trim(),
          requestId: context?.requestId,
        },
      );
      return ok(
        projectConnectionTestResponse(response, { connectionId, environment }),
        requestMeta(context),
      );
    },
  },
  {
    name: "request_connection_go_live",
    mutation: true,
    idempotent: true,
    productionSafe: true,
    requiredScopes: [
      "platform",
      "platform:connections:read",
      "platform:connections:write",
      "platform:connections:production",
    ],
    description:
      "Request the governed go-live handoff for a connection whose server-calculated readiness verdict is READY. This always requires platform:connections:production. The API can move only to GO_LIVE_APPROVED. This does not activate production; activation, rollback, isolation, and connectivity verification remain separate staff/evidence-controlled operations.",
    inputSchema: {
      type: "object",
      properties: {
        connectionId: { type: "string", minLength: 1, maxLength: 128, pattern: "\\S", description: "Tenant-scoped partner connection id." },
        confirm: { type: "boolean", const: true, description: "Assert that a human reviewed readiness and approved requesting the go-live handoff." },
        idempotencyKey: { type: "string", minLength: 8, maxLength: 128, pattern: "^[\\x21-\\x7E](?:[\\x20-\\x7E]*[\\x21-\\x7E])?$", description: "Caller-generated 8-128 printable ASCII key without edge whitespace for API-side replay protection." },
      },
      required: ["connectionId", "confirm", "idempotencyKey"],
      additionalProperties: false,
    },
    handler: async (client, args, context) => {
      const response = await client.requestConnectionGoLive(requireString(args, "connectionId"), {
        idempotencyKey: args.idempotencyKey.trim(),
        requestId: context?.requestId,
      });
      return ok(projectConnectionWorkspaceResponse(response, { mutation: true }), requestMeta(context));
    },
  },
  {
    name: "quickbooks_status",
    productionSafe: true,
    requiredScopes: ["platform", "platform:quickbooks:read"],
    conditionalScopes: [
      { when: "resolvedQuickBooksEnvironment=PRODUCTION", scopes: ["platform:quickbooks:production"] },
    ],
    description:
      "Get the QuickBooks Online connection status for your workspace: whether QBO is connected, the masked realm id, environment, and safe error code. A strict allowlist prevents tokens or upstream additions from entering MCP results.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: async (client, _args, context) => ok(
      projectQuickBooksStatusResponse(await client.quickBooksStatus(context)),
      requestMeta(context),
    ),
  },
  {
    name: "quickbooks_sync_to_qbo",
    mutation: true,
    idempotent: true,
    requiredScopes: ["platform", "platform:quickbooks:read", "platform:quickbooks:write"],
    conditionalScopes: [
      { when: "resolvedQuickBooksEnvironment=PRODUCTION", scopes: ["platform:quickbooks:production"] },
    ],
    description:
      "Push EDI transactions into QuickBooks Online. Buyer mode maps 810 to Invoice, 850 to Bill, and 835 to Payment; supplier mode maps 850 to Estimate and applies 856 shipment updates. Provide exactly one bounded selector. all:true processes one server-reported page and returns hasMore/nextCursor when another page remains.",
    inputSchema: {
      type: "object",
      properties: {
        transactionId: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S", description: "Sync a single EDI transaction by id." },
        transactionIds: {
          type: "array",
          items: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S" },
          minItems: 1,
          maxItems: 50,
          uniqueItems: true,
          description: "Sync up to 50 specific EDI transaction ids.",
        },
        all: { type: "boolean", const: true, description: "Sync one bounded page of eligible, not-yet-synced transactions; inspect hasMore/nextCursor." },
        direction: { type: "string", enum: ["buyer", "supplier"], description: "buyer (default) or supplier; supplier requires explicit transaction id(s)." },
        cursor: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S", description: "Opaque nextCursor from a prior all:true response. Valid only with all:true." },
        limit: { type: "integer", minimum: 1, maximum: 50, description: "Page size for all:true (1-50). Valid only with all:true." },
        confirm: { type: "boolean", const: true, description: "Assert that a human reviewed and approved the QBO write." },
        idempotencyKey: { type: "string", minLength: 8, maxLength: 128, pattern: "^[\\x21-\\x7E](?:[\\x20-\\x7E]*[\\x21-\\x7E])?$", description: "Caller-generated 8-128 printable ASCII key, without edge whitespace, for durable API-side duplicate detection. MCP does not retry mutations." },
      },
      required: ["confirm", "idempotencyKey"],
      additionalProperties: false,
      oneOf: [
        {
          type: "object",
          required: ["transactionId"],
          not: { anyOf: [{ required: ["cursor"] }, { required: ["limit"] }] },
        },
        {
          type: "object",
          required: ["transactionIds"],
          not: { anyOf: [{ required: ["cursor"] }, { required: ["limit"] }] },
        },
        {
          type: "object",
          required: ["all"],
          properties: { direction: { type: "string", enum: ["buyer"] } },
        },
      ],
    },
    handler: async (client, args, context) => {
      const selectorCount = [
        typeof args?.transactionId === "string" && args.transactionId.trim() !== "",
        Array.isArray(args?.transactionIds) && args.transactionIds.length > 0,
        args?.all === true,
      ].filter(Boolean).length;
      if (selectorCount !== 1) {
        throw invalidArguments("Provide exactly one of transactionId, transactionIds[], or all:true.", ["$ must contain exactly one selector"]);
      }
      if (args?.all !== true && (args?.cursor !== undefined || args?.limit !== undefined)) {
        throw invalidArguments("cursor and limit are valid only with all:true.", ["$.cursor and $.limit require $.all=true"]);
      }
      if (args?.all === true && args?.direction === "supplier") {
        throw invalidArguments("direction:supplier requires transactionId or transactionIds[], not all:true.", ["$.direction cannot be supplier with $.all=true"]);
      }
      const { confirm: _confirm, idempotencyKey, ...input } = args;
      return ok(
        await client.quickBooksSync(input, { idempotencyKey: idempotencyKey.trim(), requestId: context?.requestId }),
        requestMeta(context),
      );
    },
  },
  {
    name: "quickbooks_export_to_edi",
    mutation: true,
    idempotent: true,
    productionSafe: true,
    requiredScopes: ["platform", "platform:quickbooks:read"],
    conditionalScopes: [
      {
        when: "dryRun=false",
        scopes: ["platform:documents:read", "platform:documents:send"],
      },
      { when: "resolvedQuickBooksEnvironment=PRODUCTION", scopes: ["platform:quickbooks:production"] },
      { when: "dryRun=false and MCP profile=production", scopes: ["platform:documents:production"] },
      { when: "includePayload=true", scopes: ["platform:data:sensitive"] },
    ],
    description:
      "Pull QuickBooks entities and map them to outbound EDI (Invoice to 810, PurchaseOrder to 850) in the selected MCP environment. dryRun returns a payload-redacted summary by default. Full mapped payloads require includePayload:true, platform:data:sensitive, and confirm:true as a caller assertion enforced by the host. Live export adds document read/send scopes—not QuickBooks write—and requires a verified active partner environment and immutable production readiness when production is selected.",
    inputSchema: {
      type: "object",
      properties: {
        entity: { type: "string", enum: ["Invoice", "PurchaseOrder"], description: "QBO entity to export." },
        partnerId: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S", description: "Trading partner id to send to (required unless dryRun)." },
        ids: { type: "array", items: { type: "string", minLength: 1, maxLength: 200, pattern: "^\\d+$" }, minItems: 1, maxItems: 100, uniqueItems: true, description: "Specific numeric QBO ids; omit for most recent." },
        since: { type: "string", format: "date", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "Real ISO calendar date; only entities with TxnDate >= since." },
        maxRows: { type: "integer", minimum: 1, maximum: 100, description: "Cap rows (default/cap 100)." },
        dryRun: { type: "boolean", description: "Map only without creating documents. Results omit mapped business payloads by default." },
        includePayload: { type: "boolean", description: "Dry-run only. Explicitly include mapped business payloads in the MCP/model context; requires platform:data:sensitive and confirm:true under host policy." },
        confirm: { type: "boolean", const: true, description: "Assert that a human reviewed and approved sending the mapped documents." },
        idempotencyKey: { type: "string", minLength: 8, maxLength: 128, pattern: "^[\\x21-\\x7E](?:[\\x20-\\x7E]*[\\x21-\\x7E])?$", description: "Caller-generated 8-128 printable ASCII key, without edge whitespace, for durable API-side duplicate detection. MCP does not retry mutations." },
      },
      required: ["entity"],
      additionalProperties: false,
      oneOf: [
        {
          type: "object",
          required: ["dryRun"],
          properties: {
            dryRun: { type: "boolean", const: true },
            includePayload: { type: "boolean", const: false },
          },
        },
        {
          type: "object",
          required: ["dryRun", "includePayload", "confirm"],
          properties: {
            dryRun: { type: "boolean", const: true },
            includePayload: { type: "boolean", const: true },
            confirm: { type: "boolean", const: true },
          },
        },
        {
          type: "object",
          required: ["partnerId", "confirm", "idempotencyKey"],
          properties: { dryRun: { type: "boolean", const: false } },
          not: { type: "object", required: ["includePayload"] },
        },
      ],
    },
    handler: async (client, args, context) => {
      const entity = requireString(args, "entity");
      if (entity !== "Invoice" && entity !== "PurchaseOrder") {
        throw invalidArguments('"entity" must be "Invoice" or "PurchaseOrder".', ["$.entity is unsupported"]);
      }
      if (args?.dryRun !== true && (typeof args?.partnerId !== "string" || args.partnerId.trim() === "")) {
        throw invalidArguments('"partnerId" is required unless dryRun is true.', ["$.partnerId is required for live export"]);
      }
      if (args?.dryRun === true) {
        const { confirm: _confirm, idempotencyKey: _idempotencyKey, ...input } = args;
        const includePayload = input.includePayload === true;
        const response = await client.quickBooksExport(
          { ...input, includePayload, environment: environmentForProfile(client.profile) },
          { requestId: context?.requestId },
        );
        return ok(
          projectQuickBooksExportResponse(response, { expectedDryRun: true, includePayload }),
          requestMeta(context),
        );
      }
      const { confirm: _confirm, idempotencyKey, ...input } = args;
      const response = await client.quickBooksExport(
        { ...input, environment: environmentForProfile(client.profile) },
        { idempotencyKey: idempotencyKey.trim(), requestId: context?.requestId },
      );
      return ok(
        projectQuickBooksExportResponse(response, { expectedDryRun: false }),
        requestMeta(context),
      );
    },
  },
  {
    name: "quickbooks_list_entities",
    requiredScopes: ["platform", "platform:quickbooks:read", "platform:data:sensitive"],
    conditionalScopes: [
      { when: "resolvedQuickBooksEnvironment=PRODUCTION", scopes: ["platform:quickbooks:production"] },
    ],
    description:
      "List QuickBooks entities for preview/mapping: Invoice, Estimate, PurchaseOrder, Customer, Vendor, or Item. Returns the QBO rows as-is (no tokens).",
    inputSchema: {
      type: "object",
      properties: {
        entity: {
          type: "string",
          enum: ["Invoice", "Estimate", "PurchaseOrder", "Customer", "Vendor", "Item"],
          description: "Which QBO entity to list.",
        },
        limit: { type: "integer", minimum: 1, maximum: 100, description: "Max rows (1-100; default 25)." },
      },
      required: ["entity"],
      additionalProperties: false,
    },
    handler: async (client, args, context) => {
      const entity = requireString(args, "entity");
      return ok(
        await client.quickBooksListEntities(entity, args?.limit ? { limit: args.limit } : {}, context),
        requestMeta(context),
      );
    },
  },
  {
    name: "quickbooks_disconnect",
    mutation: true,
    idempotent: true,
    requiredScopes: ["platform", "platform:quickbooks:read", "platform:quickbooks:write"],
    conditionalScopes: [
      { when: "resolvedQuickBooksEnvironment=PRODUCTION", scopes: ["platform:quickbooks:production"] },
    ],
    description:
      "Disconnect QuickBooks Online for your workspace. The API durably deduplicates retries, removes the local connection, and reports whether Intuit revocation completed or remains pending. Reconnecting is required to restore access.",
    inputSchema: {
      type: "object",
      properties: {
        confirm: { type: "boolean", const: true, description: "Assert that a human reviewed and approved disconnecting QBO." },
        idempotencyKey: { type: "string", minLength: 8, maxLength: 128, pattern: "^[\\x21-\\x7E](?:[\\x20-\\x7E]*[\\x21-\\x7E])?$", description: "Caller-generated 8-128 printable ASCII key without edge whitespace for durable API-side duplicate detection. MCP does not retry mutations." },
      },
      required: ["confirm", "idempotencyKey"],
      additionalProperties: false,
    },
    handler: async (client, args, context) => ok(
      await client.quickBooksDisconnect({ idempotencyKey: args.idempotencyKey.trim(), requestId: context?.requestId }),
      requestMeta(context),
    ),
  },
  {
    name: "list_partner_kits",
    productionSafe: true,
    requiredScopes: ["platform"],
    description:
      "List packaged SignalEDI API kits (retail, healthcare, quickstart) from GET /api/v1/kits. Requires a platform-scoped API key.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: async (client, _args, context) => ok(await client.listPartnerKits(context), requestMeta(context)),
  },
  {
    name: "get_partner_kit",
    productionSafe: true,
    requiredScopes: ["platform"],
    description:
      "Fetch one API kit by kitId from the /api/v1/kits catalog (structured endpoints, webhook events, sample payloads). Requires a platform API key.",
    inputSchema: {
      type: "object",
      properties: {
        kitId: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S", description: "Catalog kit id, e.g. retail_order_lifecycle." },
        partnerId: {
          type: "string",
          minLength: 1,
          maxLength: 200,
          pattern: "\\S",
          description: "Alias for kitId when your workflow names the kit as a partner preset id.",
        },
      },
      additionalProperties: false,
      anyOf: [{ type: "object", required: ["kitId"] }, { type: "object", required: ["partnerId"] }],
    },
    handler: async (client, args, context) => {
      const kitId = (args?.kitId || args?.partnerId || "").trim();
      if (!kitId) throw invalidArguments("Provide kitId (or partnerId alias).", ["$.kitId or $.partnerId is required"]);
      return ok(await client.getPartnerKit(kitId, context), requestMeta(context));
    },
  },
  {
    name: "get_partner_requirements",
    productionSafe: true,
    requiredScopes: ["platform"],
    description:
      "Retrieve a generic SignalEDI API kit as a requirements starting point. The result is labeled generic and must not be represented as a trading partner's current implementation guide.",
    inputSchema: {
      type: "object",
      properties: {
        kitId: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S", description: "SignalEDI kit catalog id, e.g. retail_order_lifecycle." },
        partnerName: { type: "string", minLength: 1, maxLength: 120, description: "Optional display label for the gap report; it does not select private partner rules." },
      },
      required: ["kitId"],
      additionalProperties: false,
    },
    handler: async (client, args, context) => {
      const result = await client.getPartnerKit(requireString(args, "kitId"), context);
      return ok({
        partnerName: args.partnerName,
        partnerSpecific: false,
        requirementsStatus: "generic-kit-only",
        warning: "Obtain and validate against the trading partner's current implementation guide before production use.",
        ...result,
      }, requestMeta(context));
    },
  },
  {
    name: "explain_edi_error",
    localOnly: true,
    description:
      "Explain an EDI validation or functional-ack error using the local X12 dictionary (meaning, typical cause, fix, lookup_x12 cross-refs). Never calls the network; works in the docs profile.",
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
    localOnly: true,
    description:
      "Render a synthetic X12 sample for every local inventory set (retail, transport, warehouse, and 837 Professional partial). Returns an honest capability label. controlNumber and the transaction's primary date apply to every fixture; poNumber applies to 850, 810, and 855. Refuses EDIFACT, HL7, and unknown sets. Local only; works in the docs profile.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          minLength: 2,
          maxLength: 16,
          pattern: "^[A-Za-z0-9][A-Za-z0-9/_-]{0,15}$",
          description: `Local fixture codes: ${LOCAL_DOCUMENT_SET_CODES.join(", ")}. 837 means Professional 005010X222A1 only.`,
        },
        overrides: {
          type: "object",
          properties: {
            controlNumber: { type: "string", minLength: 9, maxLength: 9, pattern: "^\\d{9}$" },
            poNumber: { type: "string", minLength: 1, maxLength: 40, description: "Purchase-order reference for 850, 810, and 855 only." },
            date: { type: "string", pattern: "^\\d{8}$", description: "YYYYMMDD primary transaction date for the selected fixture." },
          },
          additionalProperties: false,
        },
      },
      required: ["type"],
      additionalProperties: false,
    },
    handler: async (_client, args) => {
      const type = requireString(args, "type");
      try {
        const content = renderTestDocument(type, args?.overrides || {});
        return ok({ type, capability: localFixtureCapability(type), content });
      } catch (error) {
        if (error?.code === "OUT_OF_SCOPE_FORMAT" || error?.code === "UNSUPPORTED_TRANSACTION_SET") {
          throw Object.assign(new ToolInputError(error.message, [`$.type ${error.code}`]), { code: error.code });
        }
        throw error;
      }
    },
  },
  {
    name: "lookup_x12",
    localOnly: true,
    description:
      "Search the local X12 dictionary by segment id, ack code, or free text (segment names and purposes). Local only; works in the docs profile.",
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
  // Uplift aliases (DEVELOPER_AND_INTEGRATION_UPLIFT_FSD §3.2) — same handlers,
  // spec-facing names for Cursor/Claude Desktop tool discovery.
  {
    name: "validate_x12_structure",
    remoteSideEffect: true,
    requiredScopes: ["platform"],
    description:
      "Alias for validate_edi — upload approved test data to the configured non-production API, validate its X12 structure, and return a summary. This can record sandbox usage and is never automatically retried.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", maxLength: MCP_EDI_CONTENT_MAX_BYTES, description: `Full raw EDI document text, capped at ${MCP_EDI_CONTENT_MAX_BYTES} UTF-8 bytes.` },
      },
      required: ["content"],
      additionalProperties: false,
    },
    handler: async (client, args, context) => {
      const content = requireString(args, "content");
      return ok(await client.validate(content, context), requestMeta(context));
    },
  },
  {
    name: "parse_segments",
    remoteSideEffect: true,
    requiredScopes: ["platform"],
    description:
      "Alias for parse_edi — upload approved test data to the configured non-production API and parse raw X12 into structured JSON plus a validation summary. This can record sandbox usage and is never automatically retried.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", maxLength: MCP_EDI_CONTENT_MAX_BYTES, description: `Full raw EDI document text, capped at ${MCP_EDI_CONTENT_MAX_BYTES} UTF-8 bytes.` },
      },
      required: ["content"],
      additionalProperties: false,
    },
    handler: async (client, args, context) => {
      const content = requireString(args, "content");
      return ok(await client.parse(content, context), requestMeta(context));
    },
  },
  {
    name: "lookup_element_definition",
    localOnly: true,
    description:
      "Alias for lookup_x12 — search segment maps and ack codes (850/810/856/837 dictionaries).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S", description: "Segment id, element keyword, or ack code." },
        element: { type: "string", minLength: 1, maxLength: 200, pattern: "\\S", description: "Alias for query when prompting by element name." },
      },
      additionalProperties: false,
      anyOf: [{ type: "object", required: ["query"] }, { type: "object", required: ["element"] }],
    },
    handler: async (_client, args) => {
      const query = (args?.query || args?.element || "").trim();
      if (!query) throw invalidArguments("Provide query or element.", ["$.query or $.element is required"]);
      return ok(lookupX12(query));
    },
  },

];

const SAFE_REMOTE_ERROR_CODES = new Set([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "UPSTREAM_TIMEOUT",
  "UPSTREAM_UNAVAILABLE",
  "UPSTREAM_REQUEST_FAILED",
  "INVALID_API_RESPONSE",
  "CONNECTIVITY_FAILED",
  "CONNECTION_ERROR",
  "REAUTH_REQUIRED",
]);

function safeRemoteErrorCode(value) {
  return typeof value === "string" && SAFE_REMOTE_ERROR_CODES.has(value)
    ? value
    : "TOOL_FAILED";
}

function safeRemoteIdentifier(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
    ? value
    : undefined;
}

const STRING_OR_NULL = { anyOf: [{ type: "string" }, { type: "null" }] };
const OBJECT_OR_NULL = { anyOf: [{ type: "object", additionalProperties: true }, { type: "null" }] };
const VALIDATION_SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    sourceFormat: { type: "string", enum: ["X12", "EDIFACT"] },
    valid: { type: "boolean" },
    errors: { type: "array", items: { type: "string" } },
    issues: { type: "array", items: { type: "object", additionalProperties: true } },
    transactionSet: { type: "string" },
    recognized: { type: "boolean" },
    semanticValidation: { type: "string", enum: ["supported", "unsupported", "unknown"] },
    transactionSets: { type: "array", items: { type: "object", additionalProperties: true } },
    controlNumber: { type: "string" },
    segmentCount: { type: "integer" },
  },
  required: ["sourceFormat", "valid", "errors", "transactionSet", "recognized", "semanticValidation", "transactionSets", "controlNumber", "segmentCount"],
  additionalProperties: true,
};
const PARSE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    ok: { type: "boolean", const: true },
    validation: VALIDATION_SUMMARY_SCHEMA,
    json: OBJECT_OR_NULL,
    envelope: {
      type: "object",
      properties: {
        sender: { type: "string" },
        receiver: { type: "string" },
        date: { type: "string" },
        controlReference: { type: "string" },
      },
      required: ["sender", "receiver", "date"],
      additionalProperties: true,
    },
  },
  required: ["ok", "validation", "json", "envelope"],
  additionalProperties: true,
};
const VALIDATE_OUTPUT_SCHEMA = {
  type: "object",
  properties: { ok: { type: "boolean", const: true }, validation: VALIDATION_SUMMARY_SCHEMA },
  required: ["ok", "validation"],
  additionalProperties: true,
};
const TRANSACTION_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    transactionSet: { type: "string" },
    direction: { type: "string" },
    status: { type: "string" },
    partner: STRING_OR_NULL,
    errorMessage: STRING_OR_NULL,
    slaMet: { anyOf: [{ type: "boolean" }, { type: "null" }] },
    createdAt: { type: "string" },
    processedAt: STRING_OR_NULL,
  },
  required: ["id", "transactionSet", "direction", "status", "partner", "errorMessage", "slaMet", "createdAt", "processedAt"],
  additionalProperties: true,
};
const KIT_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    vertical: { type: "string" },
    name: { type: "string" },
    description: { type: "string" },
    endpoints: { type: "array", items: { type: "object", additionalProperties: true } },
    webhookEvents: { type: "array", items: { type: "string" } },
    samplePayloads: { type: "object", additionalProperties: true },
    connectorPreset: { type: "string" },
    snippetTemplateRefs: { type: "array", items: { type: "string" } },
  },
  required: ["id", "vertical", "name", "description", "endpoints", "webhookEvents", "samplePayloads", "connectorPreset", "snippetTemplateRefs"],
  additionalProperties: true,
};

const OUTPUT_SCHEMAS = Object.freeze({
  parse_edi: PARSE_OUTPUT_SCHEMA,
  validate_edi: VALIDATE_OUTPUT_SCHEMA,
  search_docs: {
    type: "object",
    properties: {
      query: { type: "string" },
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            uri: { type: "string" },
            title: { type: "string" },
            score: { type: "integer" },
            snippet: { type: "string" },
          },
          required: ["uri", "title", "score", "snippet"],
          additionalProperties: false,
        },
      },
      scope: { type: "string", const: "bundled-public-developer-index" },
    },
    required: ["query", "results", "scope"],
    additionalProperties: false,
  },
  get_document_schema: {
    type: "object",
    properties: {
      transactionSet: { type: "string", enum: [...LOCAL_DOCUMENT_SET_CODES] },
      name: { type: "string" },
      capability: { type: "string", enum: ["baseline", "partial"] },
      fixture: { type: "boolean", const: true },
      variant: { type: "string" },
      implementationGuide: { type: "string" },
      direction: { type: "string" },
      requiredSegments: { type: "array", items: { type: "string" } },
      commonSegments: { type: "array", items: { type: "string" } },
      keyFields: { type: "array", items: { type: "object", additionalProperties: true } },
      envelope: { type: "object", additionalProperties: true },
      authority: { type: "string" },
      limitation: { type: "string" },
      sourceUri: { type: "string" },
      error: { type: "string" },
      message: { type: "string" },
      tool: { type: "string" },
      validationErrors: { type: "array", items: { type: "string" } },
      requestId: { type: "string" },
    },
    additionalProperties: true,
    anyOf: [
      {
        required: ["transactionSet", "name", "capability", "fixture", "direction", "requiredSegments", "commonSegments", "keyFields", "envelope", "authority", "limitation", "sourceUri"],
      },
      {
        required: ["error", "message"],
      },
    ],
  },
  generate_integration_example: {
    type: "object",
    properties: {
      language: { type: "string", enum: ["curl", "node", "python"] },
      operation: { type: "string", enum: ["parse", "validate", "send_outbound"] },
      method: { type: "string", const: "POST" },
      path: { type: "string" },
      code: { type: "string" },
      sourceUri: { type: "string" },
      notes: { type: "array", items: { type: "string" } },
    },
    required: ["language", "operation", "method", "path", "code", "sourceUri", "notes"],
    additionalProperties: false,
  },
  send_outbound_document: {
    type: "object",
    properties: {
      ok: { type: "boolean", const: true },
      documentId: { type: "string" },
      status: { type: "string", const: "queued" },
      environment: { type: "string", enum: ["SANDBOX", "PRODUCTION"] },
      idempotentReplay: { type: "boolean" },
    },
    required: ["ok", "documentId", "status", "environment", "idempotentReplay"],
    additionalProperties: true,
  },
  list_transactions: {
    type: "object",
    properties: {
      ok: { type: "boolean", const: true },
      transactions: { type: "array", items: TRANSACTION_SCHEMA },
    },
    required: ["ok", "transactions"],
    additionalProperties: true,
  },
  get_transaction: {
    type: "object",
    properties: { ok: { type: "boolean", const: true }, transaction: TRANSACTION_SCHEMA },
    required: ["ok", "transaction"],
    additionalProperties: true,
  },
  list_connections: CONNECTION_LIST_OUTPUT_SCHEMA,
  get_connection: CONNECTION_GET_OUTPUT_SCHEMA,
  create_connection_draft: CONNECTION_CREATE_OUTPUT_SCHEMA,
  configure_connection: {
    ...CONNECTION_MUTATION_OUTPUT_SCHEMA,
    description: "Sanitized workspace after an idempotent environment configuration.",
  },
  test_connection: CONNECTION_TEST_OUTPUT_SCHEMA,
  request_connection_go_live: {
    ...CONNECTION_MUTATION_OUTPUT_SCHEMA,
    description: "Sanitized workspace after an idempotent GO_LIVE_APPROVED handoff request; production is not activated.",
  },
  quickbooks_status: QBO_STATUS_OUTPUT_SCHEMA,
  quickbooks_sync_to_qbo: {
    type: "object",
    properties: {
      ok: { type: "boolean", const: true },
      total: { type: "integer" },
      synced: { type: "integer" },
      failed: { type: "integer" },
      skipped: { type: "integer" },
      limit: { type: "integer", minimum: 1, maximum: 50 },
      hasMore: { type: "boolean" },
      nextCursor: STRING_OR_NULL,
      idempotentReplay: { type: "boolean" },
      results: { type: "array", items: { type: "object", additionalProperties: true } },
    },
    required: ["ok", "synced", "failed", "results", "idempotentReplay"],
    additionalProperties: true,
  },
  quickbooks_export_to_edi: QBO_EXPORT_OUTPUT_SCHEMA,
  quickbooks_list_entities: {
    type: "object",
    properties: {
      ok: { type: "boolean", const: true },
      entity: { type: "string", enum: ["Invoice", "Estimate", "PurchaseOrder", "Customer", "Vendor", "Item"] },
      count: { type: "integer" },
      rows: { type: "array", items: { type: "object", additionalProperties: true } },
    },
    required: ["ok", "entity", "count", "rows"],
    additionalProperties: true,
  },
  quickbooks_disconnect: {
    type: "object",
    properties: {
      ok: { type: "boolean", const: true },
      success: { type: "boolean", const: true },
      connected: { type: "boolean", const: false },
      revoked: { type: "boolean" },
      pendingRevocation: { type: "boolean" },
      idempotentReplay: { type: "boolean" },
    },
    required: ["ok", "success", "connected", "revoked", "pendingRevocation", "idempotentReplay"],
    additionalProperties: false,
  },
  list_partner_kits: {
    type: "object",
    properties: { ok: { type: "boolean", const: true }, kits: { type: "array", items: KIT_SCHEMA } },
    required: ["ok", "kits"],
    additionalProperties: true,
  },
  get_partner_kit: {
    type: "object",
    properties: { kit: KIT_SCHEMA },
    required: ["kit"],
    additionalProperties: false,
  },
  get_partner_requirements: {
    type: "object",
    properties: {
      partnerName: { type: "string" },
      partnerSpecific: { type: "boolean", const: false },
      requirementsStatus: { type: "string", const: "generic-kit-only" },
      warning: { type: "string" },
      kit: KIT_SCHEMA,
    },
    required: ["partnerSpecific", "requirementsStatus", "warning", "kit"],
    additionalProperties: false,
  },
  explain_edi_error: {
    type: "object",
    properties: {
      meaning: { type: "string" },
      typicalCause: { type: "string" },
      fix: { type: "string" },
      lookup_x12: { type: "array", items: { type: "object", additionalProperties: true } },
      rawError: { type: "string" },
    },
    required: ["meaning", "typicalCause", "fix", "lookup_x12"],
    additionalProperties: false,
  },
  generate_test_document: {
    type: "object",
    properties: {
      type: { type: "string", enum: [...LOCAL_DOCUMENT_SET_CODES] },
      capability: { type: "string", enum: ["baseline", "partial"] },
      content: { type: "string" },
      error: { type: "string" },
      message: { type: "string" },
      tool: { type: "string" },
      validationErrors: { type: "array", items: { type: "string" } },
      requestId: { type: "string" },
    },
    additionalProperties: true,
    anyOf: [
      { required: ["type", "capability", "content"] },
      { required: ["error", "message"] },
    ],
  },
  lookup_x12: {
    type: "object",
    properties: {
      query: { type: "string" },
      matches: { type: "array", items: { type: "object", additionalProperties: true } },
    },
    required: ["query", "matches"],
    additionalProperties: false,
  },
  validate_x12_structure: VALIDATE_OUTPUT_SCHEMA,
  parse_segments: PARSE_OUTPUT_SCHEMA,
  lookup_element_definition: {
    type: "object",
    properties: {
      query: { type: "string" },
      matches: { type: "array", items: { type: "object", additionalProperties: true } },
    },
    required: ["query", "matches"],
    additionalProperties: false,
  },
});

for (const tool of TOOLS) {
  tool.title ||= tool.name.split("_").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
  tool.outputSchema = OUTPUT_SCHEMAS[tool.name];
  if (!tool.outputSchema) throw new Error(`Missing output schema for MCP tool ${tool.name}`);
}

/** Look up a tool by name. */
export function getTool(name) {
  return TOOLS.find((t) => t.name === name);
}

export function getToolsForProfile(profile) {
  return TOOLS.filter((tool) => isToolAvailableInProfile(tool, profile));
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
  if (!tool) return errorResult("UNKNOWN_TOOL", `Unknown tool: ${name}`, { tool: name });

  const profile = client.profile || "docs";
  if (!isToolAvailableInProfile(tool, profile)) {
    return profileToolError(name, profile);
  }

  const startedAt = Date.now();
  const context = tool.localOnly ? {} : { requestId: requestId() };
  const meta = requestMeta(context);
  const mutationError = validateMutationArgs(tool, args || {}, meta);
  if (mutationError) {
    emitMetric({ tool: name, profile, ok: false, code: mutationError.structuredContent.error, requestId: context.requestId, latencyMs: Date.now() - startedAt });
    return mutationError;
  }

  try {
    validateToolArguments(tool.inputSchema, args || {});
    const result = await tool.handler(client, args || {}, context);
    emitMetric({ tool: name, profile, ok: !result.isError, requestId: context.requestId, latencyMs: Date.now() - startedAt });
    if (client.demoMode && !result.isError) {
      return appendDemoFooter(result);
    }
    return result;
  } catch (err) {
    const remoteError = err?.remote === true;
    const safeStatus = Number.isInteger(err?.status) && err.status >= 400 && err.status <= 599
      ? err.status
      : undefined;
    const status = safeStatus === undefined ? "" : ` (HTTP ${safeStatus})`;
    const code = remoteError
      ? safeRemoteErrorCode(err?.code)
      : typeof err?.code === "string" ? err.code : "TOOL_FAILED";
    const errorRequestId = safeRemoteIdentifier(err?.requestId)
      || safeRemoteIdentifier(context.requestId);
    const correlationId = safeRemoteIdentifier(err?.correlationId);
    emitMetric({ tool: name, profile, ok: false, code, requestId: errorRequestId, latencyMs: Date.now() - startedAt });
    return errorResult(
      code,
      remoteError
        ? `${tool.name} failed${status}. Sensitive upstream diagnostics were withheld.`
        : `${tool.name} failed${status}: ${err?.message || String(err)}`,
      {
        ...(safeStatus === undefined ? {} : { status: safeStatus }),
        tool: name,
        ...(!remoteError && Array.isArray(err?.details) ? { validationErrors: err.details } : {}),
        ...(!remoteError && err?.fieldErrors && typeof err.fieldErrors === "object" ? { fieldErrors: err.fieldErrors } : {}),
        ...(correlationId ? { correlationId } : {}),
        ...(!remoteError && (typeof err?.detail === "string" || err?.detail === null) ? { detail: err.detail } : {}),
        ...(typeof errorRequestId === "string" ? { requestId: errorRequestId } : {}),
      },
      requestMeta({ requestId: errorRequestId }),
    );
  }
}

function emitMetric(event) {
  if (process.env.SIGNALEDI_MCP_TELEMETRY === "0") return;
  process.stderr.write(`[signaledi-mcp] metric ${JSON.stringify({
    at: new Date().toISOString(),
    ...event,
  })}\n`);
}
