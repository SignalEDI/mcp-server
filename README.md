# SignalEDI Developer MCP Server

Connect an AI coding assistant to SignalEDI to discover, scaffold, validate, and test X12 integrations. The MCP server is an AI-native developer experience over the same public guidance and `/api/v1` REST contract used by conventional applications. It complements—not replaces—SignalEDI's REST API, OpenAPI specification, webhooks, SDKs, and documentation.

The package is an uplift of SignalEDI's existing MCP adapter. Version 0.5 adds public developer discovery, resource templates, code examples, governed connection control-plane tools, strict tool-input validation, and explicit capability profiles while retaining the existing parser, transaction, partner-kit, and QuickBooks adapters.

| | |
| --- | --- |
| Package | `@signaledi/mcp-server` |
| MCP Registry | `io.github.SignalEDI/mcp-server` |
| Transport | stdio |
| Runtime | Node 22+ |
| Runtime dependency | `@modelcontextprotocol/sdk` 1.30.0 (2025 protocol generation) |
| Default access | Always keyless `docs`; authenticated tools require explicit `sandbox` or `production` |

## Capability profiles

Set `SIGNALEDI_MCP_PROFILE` to one of these profiles. Tool discovery and direct tool calls are both restricted to the active profile.

| Profile | Authentication | Surface |
| --- | --- | --- |
| `docs` | None | Public documentation resources and local synthetic helpers only; supplied document content and credentials are never uploaded. The OpenAPI resource performs a content-free public GET. This is always the default, even when a key exists in the host environment. |
| `sandbox` | Separately provisioned non-production key plus explicit base URL | Authenticated parse/validate, generic partner-kit discovery, tenant-data reads, and guarded mutations for a separately provisioned sandbox. Canonical production SignalEDI hosts are refused. |
| `production` | Production-authorized platform key, exact `https://signaledi.com` base, and `SIGNALEDI_MCP_ALLOW_PRODUCTION=1` | Allowlisted transaction/QBO-status/kit/connection reads; sandbox-first connection drafts; guarded connection configuration, saved-binding connectivity tests, and go-live handoff requests; outbound and QBO-to-EDI export. Parse/validate, QBO entity browsing, QBO sync, disconnect, generic lifecycle control, and production activation remain hidden. |

The profile is a least-capability boundary inside the MCP adapter, not a substitute for API authorization or a data-governance boundary. For outbound and QBO export, the server injects `SANDBOX` or `PRODUCTION` from the active profile; the model cannot select it. The API then binds that value to the selected partner connection. Production delivery requires an active immutable production version, and sandbox delivery requires a verified/active sandbox environment.

Every authenticated call requires the base `platform` scope. Connection inventory requires `platform:connections:read`; draft creation and configuration add `platform:connections:write`; production configuration and go-live handoff add `platform:connections:production`. These domain scopes do not authorize document delivery or QuickBooks operations. Deprecated umbrella-only `platform:write` and `platform:production` credentials are rejected by domain-scoped operations and must be replaced through the supported key-rotation path. Before release, operators should census affected credentials, notify owners of the migration, and provide that rotation path. MCP profile selection never grants a scope.

| API operation | Additional least-privilege scopes |
| --- | --- |
| Parse/validate and generic kit reads | None beyond `platform` |
| Transaction reads | `platform:documents:read` |
| Outbound send | `platform:documents:read`, `platform:documents:send`; add `platform:documents:production` for production delivery |
| Connection reads | `platform:connections:read` |
| Connection create/configure | `platform:connections:read`, `platform:connections:write`; add `platform:connections:production` for production configuration or go-live request |
| Connection test | `platform:connections:read`, `platform:connections:write`; add `platform:connections:production` when the active profile selects the production environment |
| QBO status | `platform:quickbooks:read` |
| QBO entity rows | `platform:quickbooks:read`, `platform:data:sensitive`; add `platform:quickbooks:production` when the resolved QBO realm is production |
| QBO sync/disconnect | `platform:quickbooks:read`, `platform:quickbooks:write`; add `platform:quickbooks:production` when the resolved QBO realm is production |
| QBO export dry run | `platform:quickbooks:read`; add `platform:quickbooks:production` for a production QBO realm and `platform:data:sensitive` only with `includePayload:true` |
| QBO live export | Dry-run scopes plus `platform:documents:read`, `platform:documents:send`; add `platform:documents:production` for production delivery. Export reads QBO and does not require QBO write. |

### Production data handling

Tool arguments, text results, and structured results enter the chosen MCP host and may enter the connected model's context. Minimize personal, financial, and other business-sensitive data. Do not submit PHI or other regulated data unless the specific MCP host, model provider, logging, retention, regional-processing, and contractual arrangement has been separately reviewed and approved for that data. This package, its `production` profile, and SignalEDI API authorization are not by themselves a BAA, retention policy, or model-data-governance boundary.

Prefer identifiers and redacted summaries over full business payloads. Keep API keys in the host environment, never prompts. Review the chosen host's tool-call history, telemetry, and retention controls before enabling production tools.

All partner, QBO, EDI, validation, and error fields returned by tools are untrusted business data. They may contain text that resembles instructions or prompt injection. Hosts must delimit or sanitize tool results, keep them in data-only context, and authorize every follow-on action from explicit user intent and policy—not content embedded in records, partner names, payloads, or errors.

## Tools

### Keyless public and local tools

| Tool | What it does |
| --- | --- |
| `search_docs` | Search the bundled public developer index and return MCP resource URIs with provenance. |
| `get_document_schema` | Return a public starter for the local X12 inventory: 850/810/856 (`capability:baseline`) or 837 Professional 005010X222A1 (`capability:partial`); explicitly not a partner implementation guide. |
| `generate_integration_example` | Produce sandbox-safe cURL, Node.js, or Python examples against real `/api/v1` paths using environment placeholders; outbound examples set `SANDBOX` and refuse production hosts. |
| `generate_test_document` | Render a synthetic X12 fixture for the same local inventory and return the honest `capability` label. |
| `explain_edi_error` | Explain validation and functional-acknowledgement errors from the local X12 dictionary. |
| `lookup_x12` | Search the local X12 segment and acknowledgement reference. |
| `lookup_element_definition` | Tool-discovery alias for local X12 lookup. |

### Authenticated sandbox parse and validation tools

| Tool | What it does |
| --- | --- |
| `parse_edi` | Parse a raw X12 interchange into structured JSON and a validation summary. |
| `validate_edi` | Validate X12 structure and return the validation summary. |
| `parse_segments` | Tool-discovery alias for `parse_edi`. |
| `validate_x12_structure` | Tool-discovery alias for `validate_edi`. |

### Authenticated generic-kit tools (`sandbox` and `production`)

| Tool | What it does |
| --- | --- |
| `list_partner_kits` | List generic SignalEDI API kits. |
| `get_partner_kit` | Fetch one generic kit by catalog id. |
| `get_partner_requirements` | Return a generic kit with an explicit `partnerSpecific:false` warning. |

### Explicit environment-profile data reads

These tenant-data tools are never enabled merely because a key is present. Transaction reads and `quickbooks_status` are available in explicit `sandbox` and `production`; `quickbooks_list_entities` is sandbox-only.

| Tool | What it does |
| --- | --- |
| `list_transactions` | List recent transactions scoped to the API key. |
| `get_transaction` | Fetch one owned transaction and its lifecycle status. |
| `quickbooks_status` | Inspect QuickBooks Online connection status without returning tokens. |
| `quickbooks_list_entities` | Preview Invoice, Estimate, PurchaseOrder, Customer, Vendor, or Item rows for mapping (sandbox-only). |

### Governed connection control plane (`sandbox` and `production`)

Connection tools operate on the public `/api/v1/connections` contract. MCP applies a second response allowlist over the API's sanitized representation: it may return opaque gateway/evidence references and configured-status booleans, but never stored credentials, secret references, raw transport configuration, private keys, certificates, or tokens.

| Tool | What it does |
| --- | --- |
| `list_connections` | Cursor-page tenant-scoped AS2/SFTP and legitimate legacy API connection summaries with optional partner/lifecycle filters. |
| `get_connection` | Inspect safe environment, gateway, approval, test-coverage, readiness, and next-action state for one AS2/SFTP or legacy API connection. |
| `create_connection_draft` | Create or recover an idempotent sandbox-first `DRAFT`; `created` distinguishes insertion from matching reuse, and it cannot activate production. |
| `configure_connection` | Bind an existing gateway reference and constrained X12 ISA/GS identifiers to an AS2/SFTP `SANDBOX` or `PRODUCTION` environment; the server owns ISA15 and accepts no credential material. Production configuration requires `platform:connections:production` and still does not activate delivery. Legacy API rows remain read-only here and use the governed API-connections surface. |
| `test_connection` | Test the exact saved connection in the environment injected from the active profile. The operation causes partner-network egress, records sanitized evidence, requires host-enforced review plus an idempotency key, and never accepts endpoints or credentials or activates production. |
| `request_connection_go_live` | Ask the API to move a server-proven `READY` connection only to `GO_LIVE_APPROVED`. SignalEDI staff activation remains a separate MFA/governance operation. |

There is deliberately no generic lifecycle-transition tool. `test_connection` can create authoritative connectivity evidence for the exact saved binding; intermediate testing/certification stages otherwise come from evidence or onboarding-project state, not model claims. There are no production activation, rollback, or isolation tools.

### Explicit write-profile tools

| Tool | What it does |
| --- | --- |
| `send_outbound_document` | Submit an outbound EDI document in the active sandbox/production environment. |
| `quickbooks_sync_to_qbo` | Push a bounded transaction selection into QBO (sandbox-only); buyer and supplier directions are explicit, and `all:true` is cursor-paginated. |
| `quickbooks_export_to_edi` | Preview or export QBO invoices/purchase orders as EDI in the active sandbox/production environment. Dry-run results are payload-redacted by default; full payloads require `includePayload:true`, `platform:data:sensitive`, and host-enforced `confirm:true`. |
| `quickbooks_disconnect` | Revoke and remove the workspace QBO connection (sandbox-only). |

Every tool publishes an input and output schema. The server validates inputs itself, rejects unknown fields, and returns both readable text and `structuredContent` with namespaced contract metadata.

## Mutation safety

Write tools are absent from `docs`. Every live mutation requires `confirm:true` and a caller-generated `idempotencyKey` of 8–128 printable ASCII characters without leading/trailing whitespace. Outbound sends, QBO sync/export/disconnect, and connection create/configure/test/go-live requests enforce durable API-side replay protection and are annotated idempotent. QBO disconnect stays sandbox-only and reports a pending Intuit revocation instead of claiming completion. `confirm:true` is an assertion from the calling workflow; the MCP server cannot independently prove that a human approved it, so the host must present the action for review.

The MCP client never automatically retries mutations or parse/validate POSTs. Parse/validate upload synthetic or approved test data and can record sandbox usage, so their annotations remain non-read-only and non-idempotent. Read-only GETs retain bounded transient retry behavior.

Custom base URLs are rejected unless `SIGNALEDI_MCP_ALLOW_CUSTOM_BASE_URL=1` is set after the destination is verified. URLs containing credentials, paths, queries, or fragments are rejected. HTTP is allowed only for localhost and still requires the custom-host opt-in.

The adapter caps raw EDI inputs at 65,536 UTF-8 bytes, serialized JSON request bodies at 1 MiB, and API responses at 4 MiB. The input schemas publish character/collection bounds; byte limits are rechecked immediately before network use, and streamed responses are cancelled when they cross the cap.

## Resources and prompts

Stable guidance is exposed as resources rather than action tools:

- `signaledi://quickstart`
- `signaledi://openapi`
- `signaledi://developer-workflows`
- `signaledi://x12-reference`
- `signaledi://documents/{transactionSet}/schema`

The document schema is also advertised as a resource template. Prompts include `scaffold-integration`, `onboard-partner`, and `debug-rejection`; scaffold and onboarding prompts default to synthetic data and avoid writes until an isolated sandbox is confirmed.

## Quick start

Run the public docs profile:

```bash
npx -y @signaledi/mcp-server@0.5.0
```

Configure the authenticated sandbox profile only after a non-production base and key have been provisioned. Claude Code project config (`.mcp.json`) expands `${NAME}` from the host environment:

```json
{
  "mcpServers": {
    "signaledi": {
      "command": "npx",
      "args": ["-y", "@signaledi/mcp-server@0.5.0"],
      "env": {
        "SIGNALEDI_MCP_PROFILE": "sandbox",
        "SIGNALEDI_API_KEY": "${SIGNALEDI_SANDBOX_API_KEY}",
        "SIGNALEDI_BASE_URL": "${SIGNALEDI_SANDBOX_BASE_URL}",
        "SIGNALEDI_MCP_ALLOW_CUSTOM_BASE_URL": "1"
      }
    }
  }
}
```

On native Windows, Claude Code must launch the npm shim through `cmd`:

```json
{
  "mcpServers": {
    "signaledi": {
      "command": "cmd",
      "args": ["/c", "npx", "-y", "@signaledi/mcp-server@0.5.0"],
      "env": {
        "SIGNALEDI_MCP_PROFILE": "sandbox",
        "SIGNALEDI_API_KEY": "${SIGNALEDI_SANDBOX_API_KEY}",
        "SIGNALEDI_BASE_URL": "${SIGNALEDI_SANDBOX_BASE_URL}",
        "SIGNALEDI_MCP_ALLOW_CUSTOM_BASE_URL": "1"
      }
    }
  }
}
```

Cursor uses `.cursor/mcp.json`, `mcpServers`, and `${env:NAME}` references:

```json
{
  "mcpServers": {
    "signaledi": {
      "command": "npx",
      "args": ["-y", "@signaledi/mcp-server@0.5.0"],
      "env": {
        "SIGNALEDI_MCP_PROFILE": "sandbox",
        "SIGNALEDI_API_KEY": "${env:SIGNALEDI_SANDBOX_API_KEY}",
        "SIGNALEDI_BASE_URL": "${env:SIGNALEDI_SANDBOX_BASE_URL}",
        "SIGNALEDI_MCP_ALLOW_CUSTOM_BASE_URL": "1"
      }
    }
  }
}
```

### Cursor Marketplace

This repository is also packaged as a Cursor Plugin for the official Marketplace. The plugin launches the same npm package over stdio — there is no parallel MCP implementation.

| | |
| --- | --- |
| Plugin manifest | `.cursor-plugin/plugin.json` (`name`: `signaledi`) |
| MCP config | `mcp.json` → `npx -y @signaledi/mcp-server@0.5.0` |
| Logo | `assets/logo.svg` |
| Skill | `skills/signaledi-mcp-profiles/` |

**Install (after listing):** open Customize → Marketplace, search for SignalEDI, and install. Or submit/review at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish) once the public Git repo is ready.

**Configure:** set plugin variables under Plugins → Configure (no secrets in the repo or prompts):

| Variable | Typical value |
| --- | --- |
| `SIGNALEDI_MCP_PROFILE` | `docs` (default), `sandbox`, or `production` |
| `SIGNALEDI_API_KEY` | Least-privilege workspace key (ignored by `docs`) |
| `SIGNALEDI_BASE_URL` | Verified non-production origin, or exactly `https://signaledi.com` for production |
| `SIGNALEDI_MCP_ALLOW_CUSTOM_BASE_URL` | `1` only for verified custom hosts |
| `SIGNALEDI_MCP_ALLOW_PRODUCTION` | `1` only with the production profile and canonical base |

Plugin `mcp.json` uses `${VAR}` placeholders that match those dashboard variables (not the manual `${env:NAME}` syntax used in project `.cursor/mcp.json`). Unset placeholders stay fail-closed on the keyless `docs` profile.

Publishing is subject to the [Cursor Marketplace Publisher Terms](https://cursor.com/marketplace-publisher-terms). Marketplace plugins must be open source and pass manual review; see [marketplace security](https://cursor.com/help/security-and-privacy/marketplace-security).

VS Code uses `.vscode/mcp.json`, a top-level `servers` object, and a password input for secrets:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "signaledi-api-key",
      "description": "SignalEDI non-production sandbox API key",
      "password": true
    },
    {
      "type": "promptString",
      "id": "signaledi-api-base",
      "description": "Verified non-production SignalEDI API base URL"
    }
  ],
  "servers": {
    "signaledi": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@signaledi/mcp-server@0.5.0"],
      "env": {
        "SIGNALEDI_MCP_PROFILE": "sandbox",
        "SIGNALEDI_API_KEY": "${input:signaledi-api-key}",
        "SIGNALEDI_BASE_URL": "${input:signaledi-api-base}",
        "SIGNALEDI_MCP_ALLOW_CUSTOM_BASE_URL": "1"
      }
    }
  }
}
```

For a provisioned local sandbox, add the following values to the chosen client's `env` object, using that client's environment-reference syntax for the key:

```json
{
  "SIGNALEDI_MCP_PROFILE": "sandbox",
  "SIGNALEDI_API_KEY": "<host environment reference to SIGNALEDI_SANDBOX_API_KEY>",
  "SIGNALEDI_BASE_URL": "http://localhost:3100",
  "SIGNALEDI_MCP_ALLOW_CUSTOM_BASE_URL": "1"
}
```

Production is an explicit, fail-closed opt-in. Use only the canonical origin and keep the key in the MCP host environment:

```json
{
  "SIGNALEDI_MCP_PROFILE": "production",
  "SIGNALEDI_API_KEY": "<host environment reference to SIGNALEDI_PRODUCTION_API_KEY>",
  "SIGNALEDI_BASE_URL": "https://signaledi.com",
  "SIGNALEDI_MCP_ALLOW_PRODUCTION": "1"
}
```

The production profile does not accept custom hosts or a missing/implicit base. Removing any one of the profile, key, canonical base, or opt-in prevents startup.

Never paste real keys or secrets into prompts. MCP server environment variables are resolved by the host process, not by the model.

## Configuration

| Environment variable | Default | Purpose |
| --- | --- | --- |
| `SIGNALEDI_MCP_PROFILE` | `docs` | Capability boundary: `docs`, explicit `sandbox`, or explicit `production`. Supplying a key alone never enables remote tools. |
| `SIGNALEDI_API_KEY` | — | Least-privilege workspace key; ignored in `docs`, required in authenticated profiles. It needs base `platform` plus each tool's published domain scopes. Do not issue legacy umbrella write/production scopes to an MCP host. |
| `SIGNALEDI_BASE_URL` | Public production base for the content-free docs OpenAPI GET only | Sandbox requires an explicit verified non-production origin; production requires exactly `https://signaledi.com`. |
| `SIGNALEDI_MCP_ALLOW_CUSTOM_BASE_URL` | — | Set to `1` only for a verified localhost, preview, or sandbox host. |
| `SIGNALEDI_MCP_ALLOW_PRODUCTION` | — | Set to `1` as the independent production opt-in; ignored by other profiles. |
| `SIGNALEDI_MCP_TELEMETRY` | enabled | Set to `0` to disable redacted local metric lines. Metrics contain tool, profile, result/code, latency, and request id—not payloads or secrets. |

The server writes JSON-RPC only to stdout and logs only to stderr.

## Deliberately deferred surfaces

The MCP does not fabricate hosted capabilities that are not yet backed by stable, tenant-isolated APIs:

- `suggest_mapping` and `validate_mapping` wait for the structured mapping-validation service and partner-guide provenance contract.
- `create_sandbox_project`, `create_test_partner`, `submit_test_document`, and `get_test_results` wait for stable tenant-isolated lifecycle/test routes.
- `generate_webhook_fixture` and `verify_webhook_signature` wait for one canonical runtime signing contract; the current primary delivery/replay path and remediation path sign differently.
- Credential rotation, raw gateway configuration, mapping deployment, arbitrary partner edits, manual evidence/lifecycle claims, production activation/rollback/isolation, QBO sync/disconnect, and document retransmission are not exposed in production. The production profile is limited to the allowlisted reads and server-gated draft/configuration/connectivity-test/go-live-request/outbound/QBO-export operations described above.

## Local development

```bash
node test.mjs
npm run test:stdio
npm start
```

Unit tests use synthetic data and mock HTTP. The stdio integration tests exercise docs, sandbox, and production discovery without live API calls. See `RELEASE_NOTES_0.5.0.md` for release gates.

## Architecture and repository authority

```text
MCP client
  <-> @signaledi/mcp-server over stdio
      |- public documentation resources and local synthetic helpers
      `- profile-gated calls to the conventional SignalEDI /api/v1 REST API
```

The standalone GitHub repository `SignalEDI/mcp-server` is the canonical source and sole automated npm/MCP Registry publish authority. The private `SignalEDI/platform` repository may retain a synchronized validation snapshot for its hosted API/backend contracts; see `MIRROR.md`. All examples are synthetic and must remain free of customer, health, financial, and credential data.
