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

## Republish after failed `mcp-v0.5.0` (gate fix on main)

Tag `mcp-v0.5.0` already exists. Early failures were silent main-resolution under `set -e` (`read`/node fetch). PR #5 fixed that gate (`scripts/resolve-github-main.sh`).

### Proven status (2026-09-10)

- Gate fix works: Actions run [34507766713](https://github.com/SignalEDI/mcp-server/actions/runs/34507766713) on tag tip `282bf6c` passed validation/pack and reached `npm publish`.
- npm still failed: `PUT https://registry.npmjs.org/@signaledi%2fmcp-server` → **HTTP 404** (“could not be found or you do not have permission”). Latest on the registry remains **`0.4.0`**.
- That 404 is an **npm trusted-publisher / OIDC permission** problem, not the GitHub main-resolution gate. Cutting `0.5.1` alone will hit the same error until OIDC is fixed.
- This agent **cannot** move protected tag `mcp-v0.5.0` (`GH013: Cannot update this protected ref`).

### Fix npm trusted publishing first (exact dashboard clicks)

You must be logged into npmjs.com as a user with **owner/admin** on the `@signaledi` scope (or maintain rights on this package). Official docs: [Trusted publishing for npm packages](https://docs.npmjs.com/trusted-publishers/).

#### Required connection values (case-sensitive; exact)

| npm field | Exact value | Notes |
| --- | --- | --- |
| Package | `@signaledi/mcp-server` | Existing public package (`0.4.0` latest today) |
| Publisher | **GitHub Actions** | Not GitLab / CircleCI |
| Organization or user | `SignalEDI` | GitHub **owner** only (no `/repo`) |
| Repository | `mcp-server` | Repo name only (no `SignalEDI/`) |
| Workflow filename | `mcp-publish.yml` | **Filename only** — do **not** enter `.github/workflows/mcp-publish.yml` |
| Environment name | *(leave blank)* | Workflow has **no** `environment:` key |
| Allowed actions | enable **`npm publish`** | Required for this workflow’s direct `npm publish` (not stage-only) |

Repo URL that must match `package.json` → `repository.url`: `https://github.com/SignalEDI/mcp-server.git`

Workflow already has job permission `id-token: write`, Node 24, and npm ≥ 11.5.1 gate. GitHub-hosted `ubuntu-latest` runners only (self-hosted not supported by npm trusted publishing).

#### Click path

1. Open **https://www.npmjs.com/package/@signaledi/mcp-server** while signed in.
2. Open package **Settings** (package gear / Settings tab — not your account settings).
3. Find **Trusted Publisher** / **Trusted publishing**.
4. Under **Select your publisher**, click **GitHub Actions**.
5. Fill the form with the table values above:
   - Organization or user → `SignalEDI`
   - Repository → `mcp-server`
   - Workflow filename → `mcp-publish.yml`
   - Environment name → leave empty
   - Allowed actions → allow **`npm publish`** (do not leave stage-only if that would block direct publish)
6. Click **Save** / **Add trusted publisher** (npm does **not** validate the fields until the next publish attempt).
7. If an **old/wrong** GitHub trusted publisher already exists (wrong workflow name, path prefix, or environment), **delete it** and create a new one — existing connections cannot be edited in place.
8. Optional hardening **after** a successful 0.5.0 publish: Settings → **Publishing access** → prefer requiring 2FA / disallowing classic tokens. Do **not** flip this before the first OIDC publish succeeds.

#### Common misconfigs that produce E404 / ENEEDAUTH

- Workflow filed as `.github/workflows/mcp-publish.yml` instead of `mcp-publish.yml`
- Org filled as `SignalEDI/mcp-server` or repo filled as `SignalEDI/mcp-server`
- Environment set to a name while the workflow has no GitHub Environment
- Trusted publisher pointing at a different workflow file (`ci.yml`, etc.)
- Missing `id-token: write` (already present on the publish job in `mcp-publish.yml`)
- Attempting publish from a tag tip that predates the OIDC publish fix (#9) while also relying on a broken `_authToken` placeholder path — prefer re-firing from **current `main`** after #9

### Then re-fire 0.5.0 (preferred; never successfully published)

1. Confirm trusted publisher is saved with the exact table above.
2. Confirm `main` still has `package.json` / `server.json` version `0.5.0`, the gate fix (#5), and the OIDC publish path (#9).
3. Repo admin with protected-tag rights moves the tag to **current** `main` (required: `TAG_SHA == MAIN_SHA`; tag workflows use the workflow file **on the tagged commit**):
   ```bash
   git fetch origin main
   MAIN=$(git rev-parse origin/main)
   git tag -f mcp-v0.5.0 "$MAIN"
   git push --force origin refs/tags/mcp-v0.5.0
   ```
4. Confirm Actions **Publish stable MCP server release** succeeds (npm trusted publish, then MCP Registry).
5. Verify: `npm view @signaledi/mcp-server version` → `0.5.0`.

Do **not** expect `workflow_dispatch` — `mcp-publish.yml` only triggers on `mcp-v*` tag pushes. Re-running [34507766713](https://github.com/SignalEDI/mcp-server/actions/runs/34507766713) alone will **not** pick up #9 (that run’s tag tip predates the OIDC workflow fix) and still needs a correct trusted-publisher connection.

### Fallback after OIDC works: cut `0.5.1` (avoid moving protected tag)

1. Bump `package.json`, `server.json`, and add `RELEASE_NOTES_0.5.1.md`; update marketplace `mcp.json` pin to `@signaledi/mcp-server@0.5.1`.
2. Merge to `main`, then create protected tag `mcp-v0.5.1` on that tip (leave `mcp-v0.5.0` alone).
3. Verify: `npm view @signaledi/mcp-server version` → `0.5.1`.
