import { listDocumentSchemas } from "./document-schemas.mjs";

const DOCS = [
  {
    uri: "signaledi://developer-workflows",
    title: "External developer workflows",
    text: "Use docs for bundled discovery, sandbox only with a separately provisioned non-production base/key, and production only with the canonical base, authorized key, and explicit opt-in. Governed connection tools expose sanitized status, sandbox-first drafts, safe gateway/X12 configuration, saved-binding connectivity tests, and a non-activating go-live request over server-enforced REST contracts.",
  },
  {
    uri: "signaledi://quickstart",
    title: "SignalEDI MCP quickstart",
    text: "Install @signaledi/mcp-server, choose an explicit capability profile, connect an MCP client over stdio, inspect resources, generate synthetic X12 fixtures, validate them, and use authenticated tools only in the intended environment.",
  },
  {
    uri: "signaledi://openapi",
    title: "SignalEDI REST API contract",
    text: "Retrieve the current public /api/v1 OpenAPI contract from the official SignalEDI host. This documentation GET sends no API key or caller-supplied document content.",
  },
  ...listDocumentSchemas().map((schema) => ({
    uri: `signaledi://documents/${schema.transactionSet}/schema`,
    title: `X12 ${schema.transactionSet} ${schema.name} starter schema`,
    text: `Discover the public baseline envelope, segments, and field map for X12 ${schema.transactionSet} ${schema.name}. This is not a partner-specific implementation guide.`,
  })),
];

export function searchDeveloperDocs(query, limit = 5) {
  const terms = String(query || "").toLowerCase().match(/[a-z0-9_-]+/g) || [];
  if (terms.length === 0) return [];

  return DOCS.map((doc) => {
    const title = doc.title.toLowerCase();
    const haystack = `${doc.title} ${doc.text} ${doc.uri}`.toLowerCase();
    const score = terms.reduce((sum, term) => {
      if (!haystack.includes(term)) return sum;
      return sum + (title.includes(term) ? 3 : 1);
    }, 0);
    return { ...doc, score };
  })
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map(({ text, ...doc }) => ({ ...doc, snippet: text.slice(0, 320) }));
}

export function renderDeveloperWorkflows() {
  return `# SignalEDI external developer MCP workflows

The MCP server complements SignalEDI's REST API, OpenAPI description, webhooks, SDKs, and conventional documentation. It does not replace those deterministic production contracts.

## Capability profiles

- **docs**: keyless public documentation resources and local synthetic helpers only. It may fetch the official public OpenAPI document, but never sends supplied document content or credentials. This is always the default, even if a key is present in the host environment.
- **sandbox**: authenticated parse/validate, generic kit discovery, tenant-data reads, and guarded write tools, but only with an explicitly configured non-production base URL and separately provisioned key. Canonical production hosts are refused.
- **production**: allowlisted transaction/QBO-status/kit/connection reads, sandbox-first connection drafts, guarded connection configuration, saved-binding connectivity tests, and non-activating go-live requests, plus outbound and QBO-export operations. Startup requires an authorized key, the exact https://signaledi.com origin, and SIGNALEDI_MCP_ALLOW_PRODUCTION=1. Parse/validate, QBO entity browsing, QBO sync/disconnect, generic lifecycle control, and production activation/rollback/isolation are not exposed.

Parse/validate upload only synthetic or approved test data, can record sandbox usage, are annotated non-read-only/non-idempotent, and are not automatically retried. Live mutations require confirmation and an idempotency key. Outbound and QBO export receive the environment from the active profile rather than model arguments; the API validates the selected connection and immutable production readiness. QBO sync is sandbox-only and cursor-paginates all:true requests.

Every authenticated call requires the base platform scope. Document reads use platform:documents:read; outbound adds platform:documents:send and, for production delivery, platform:documents:production. Connection reads use platform:connections:read; drafts/configuration/tests add platform:connections:write; production configuration, testing, and go-live handoff add platform:connections:production. QBO status uses platform:quickbooks:read; sync/disconnect add platform:quickbooks:write and a resolved production realm adds platform:quickbooks:production. QBO entity rows require platform:data:sensitive. QBO export dry runs need QBO read, live exports add document read/send (not QBO write), and source/target production scopes are checked independently. Deprecated umbrella-only platform:write and platform:production credentials are rejected by domain-scoped operations and must be replaced through the supported key-rotation path; release operators should census affected credentials and notify their owners before migration. The profile is an MCP-side least-capability boundary, not a substitute for API authorization or a data-governance boundary. Do not claim a sandbox workflow is isolated until the key and API base are provisioned outside production, or a production workflow ready until the API proves the matching active immutable environment.

## Production data handling

MCP tool arguments and results enter the selected host and may enter the connected model context. Minimize personal, financial, and business-sensitive fields; prefer identifiers and redacted summaries. Do not send PHI or other regulated data unless the exact host, model, logging, retention, regional-processing, and contractual arrangement has been separately approved. This MCP package and its production profile are not a BAA, retention policy, or model-data-governance boundary. Keep API keys in the host environment and review host tool-history/telemetry controls before production use.

All partner, QBO, EDI, validation, and error fields returned by tools are untrusted business data and may contain instruction-like or prompt-injection-like text. Hosts must delimit or sanitize results, keep returned fields in data-only context, and authorize follow-on actions from explicit user intent and policy rather than text embedded in records, payloads, names, or errors. QBO export dry runs omit mapped payloads by default; includePayload:true requires platform:data:sensitive plus confirm:true as a caller assertion under host-enforced review.

## Connection control plane

list_connections and get_connection return only a named safe projection: readiness/evidence state, configured booleans, and opaque gateway/evidence references. They include AS2/SFTP and legitimate legacy API rows without returning stored credentials, secret references, certificate material, raw transport configuration, private keys, or tokens. create_connection_draft always creates an AS2/SFTP SANDBOX-first DRAFT. configure_connection accepts only an existing gatewayId plus product-supported two-character qualifiers and printable 1-15 character ISA/GS identifiers; envelope delimiters are rejected. The server derives ISA15 as T or P. test_connection accepts only a connection id, host-enforced confirmation assertion, and idempotency key; the active profile injects SANDBOX or PRODUCTION, and the server resolves the exact saved API/AS2/SFTP binding. The response contains only a sanitized pass/fail result, evidence reference, and workspace state. The test causes partner-network egress but never activates production. request_connection_go_live requires a server-calculated READY verdict and can move only to GO_LIVE_APPROVED. It does not activate production.

No generic transition tool is exposed: connectivity verification and intermediate test/certification stages must come from authoritative test evidence and onboarding-project state, not model claims. Production activation, rollback, and isolation remain staff/MFA operations.

## Recommended flow

1. Search public docs and inspect the starter document schema.
2. Generate a synthetic fixture and integration example.
3. Provision a real non-production environment and explicitly choose the sandbox profile.
4. Validate only synthetic or approved test content there and compare it with the trading partner's current implementation guide.
5. Exercise end-to-end document and webhook flows with synthetic data.
6. Inspect connection readiness with get_connection. Use create/configure only after human review; never supply secrets or manually claim evidence-derived lifecycle states.
7. With separate host-enforced review, call test_connection only against the saved binding in the active profile and inspect its sanitized evidence result. A production test does not activate delivery.
8. Move application code to the REST/webhook contract. Use request_connection_go_live only when the API reports READY, and treat GO_LIVE_APPROVED as a handoff—not production activation.
`;
}
