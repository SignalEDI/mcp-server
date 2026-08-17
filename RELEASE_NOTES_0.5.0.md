# SignalEDI Developer MCP Server 0.5.0

This release is an uplift of the existing MCP adapter, not a new server.

## Added

- `docs`, explicit `sandbox`, and fail-closed `production` capability profiles with server-side discovery and invocation gates. Production requires a key, the exact canonical origin, and an independent opt-in.
- Public developer tools for documentation search, X12 starter-schema discovery, and REST example generation.
- An honestly labeled generic partner-requirements adapter that does not impersonate a partner implementation guide.
- Developer workflow and X12 document-schema resources, a resource template, and a sandbox-first scaffold prompt.
- Runtime validation of every tool input and precise, operation-specific MCP output schemas for every listed tool.
- Typed `list_connections`, `get_connection`, `create_connection_draft`, `configure_connection`, `test_connection`, and `request_connection_go_live` adapters over the public connection control plane.

## Hardened

- Write tools are hidden from docs and are never automatically retried. Production exposes only server-gated outbound and QBO export mutations; QBO sync/disconnect stay sandbox-only.
- The keyless docs profile exposes bundled/local guidance plus a content-free public OpenAPI GET and cannot upload caller-supplied EDI; tenant transaction/QBO status reads require an explicit authenticated profile.
- Outbound, QBO sync/export/disconnect, and connection mutations advertise idempotence only with durable API-side replay enforcement; disconnect reports pending Intuit revocation truthfully.
- Tool authorization descriptions publish least-privilege domain scopes. Deprecated umbrella-only write/production credentials are rejected by domain-scoped operations and require a pre-release credential census, owner migration notice, and supported rotation path.
- Outbound MCP input no longer accepts arbitrary metadata capable of colliding with trusted fields.
- QuickBooks selectors, direction, cursor pagination, ids, row limits, and dates are validated before any API call; Estimate discovery is included for supplier workflows.
- Custom API hosts require an explicit opt-in; URL credentials, paths, queries, and fragments are rejected.
- Every generated authenticated example validates an explicit origin-only non-production base and refuses canonical production hosts before network use.
- Prompt arguments are length-bounded, JSON-escaped, and isolated as explicitly untrusted data so embedded instructions are not treated as workflow authority.
- Unexpected single and batch outbound API failures return generic messages plus opaque correlation IDs instead of caught exception text.
- Successful HTTP responses must be JSON objects; malformed/empty 2xx responses fail closed. Field errors, correlation IDs, and request IDs remain machine-readable through MCP error results.
- Raw EDI, serialized request bodies, and streamed API responses are capped at 64 KiB, 1 MiB, and 4 MiB respectively.
- Connection reads and mutations are projected through a second MCP-side safe-field allowlist. Inputs cannot contain credentials, secret references, raw transport configuration, private keys, certificates, tokens, or the server-owned ISA15 usage indicator.
- Connection creation is sandbox-first and idempotent. Environment configuration binds only an existing gateway reference plus constrained ISA/GS identifiers; production configuration requires `platform:connections:production` but cannot activate delivery.
- Connection reads retain legitimate legacy API rows; draft creation and gateway/X12 configuration remain constrained to AS2/SFTP, while API configuration stays on its governed surface.
- Generic lifecycle transition remains withheld. `test_connection` exercises only the exact saved, profile-selected binding, records sanitized evidence, and never accepts transport secrets or activates production. Evidence/project-derived stages cannot be claimed manually; the only exposed handoff request requires server-proven readiness and reaches `GO_LIVE_APPROVED`, never `PRODUCTION`.
- Production documentation makes the host/model-context boundary explicit: minimize PII/financial data, and do not submit PHI or regulated data without separate host/model/logging/retention/contract approval. The production profile is not represented as a BAA or data-governance boundary.
- Partner/QBO/EDI/error results are labeled untrusted business data, never workflow authority. QBO dry-run payloads are redacted by default; full payload inclusion requires an explicit flag, sensitive-data scope, and host-enforced confirmation assertion.
- The direct MCP SDK dependency is exact-pinned to 1.30.0, and CI/source installs use the package-local lockfile; custom response metadata is namespaced. The npm tarball does not claim transitive lockfile enforcement for consumers.
- The executable entrypoint is stored without a byte-order mark so the shebang is valid.

## Compatibility

- The dependency remains MCP TypeScript SDK v1 and the 2025 protocol generation. Supporting the 2026-07-28 protocol is a separate SDK v2 migration, not a claim of this release.
- Existing stateless parse/validate remain behind explicit non-production `sandbox` selection. Parse/validate upload synthetic or approved test data, can record sandbox usage, are non-read-only/non-idempotent, and are not automatically retried.
- Live writes require confirmation and an idempotency key. The MCP injects the active `SANDBOX`/`PRODUCTION` environment for outbound and QBO export; production readiness is validated by the API.
- The minimum supported Node.js runtime rises to 22 to match the tested dependency tree and CI compatibility floor.

## Deferred

- `generate_webhook_fixture` and `verify_webhook_signature` remain withheld until the legacy body-only signing path and the timestamp-plus-raw-body signing path are reconciled and proven as one public contract.
- `suggest_mapping`, `validate_mapping`, sandbox-project/test-partner lifecycle, test submission, and test-result tools remain deferred until stable tenant-isolated backend contracts exist.
- Production activation, rollback, and isolation remain staff/MFA operations and are not MCP tools.

## Release gates

Before publishing 0.5.0:

1. Merge the reviewed change through the canonical `SignalEDI/mcp-server` GitHub pull-request pipeline without creating a release tag or publishing an artifact.
2. From clean, unchanged current `main`, prove sandbox against a separately provisioned non-production API base/key, prove production authorization/readiness on the canonical origin without synthetic claims, and run Node 22/24 unit, three-profile stdio protocol, manifest, consumer-install, package-dry-run, and synthetic staging smoke checks.
3. After explicit release approval, create the protected stable `mcp-v0.5.0` tag on that exact current-main commit. The standalone tag workflow publishes npm through its trusted publisher, verifies the exact package, and only then publishes and verifies the MCP Registry record. The platform snapshot is validation-only.
4. Keep public website install commands and the 22-tool v0.4 catalog pinned to verified v0.4.0 until npm and MCP Registry both prove the 28-tool v0.5.0 package; update that catalog in a post-publish pull request.
