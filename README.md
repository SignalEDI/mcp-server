# SignalEDI MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the
SignalEDI Core API (`/api/v1`) as tools, so AI clients — **Claude Desktop, Cursor,
Windsurf, Claude Code**, and any other MCP host — can parse, validate, send, and
inspect EDI documents directly in a conversation or agent loop.

It is a thin adapter over the same hosted engine that powers every other SignalEDI
integration: no EDI logic lives here, only the MCP transport and auth.

| | |
| --- | --- |
| **Package** | `@signaledi/mcp-server` (npm) |
| **MCP Registry** | `io.github.signaledi/mcp-server` ([registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io)) |
| **Transport** | stdio |
| **Runtime** | Node 18+ (uses global `fetch`) |
| **Runtime deps** | `@modelcontextprotocol/sdk` only |
| **Auth** | Optional — **demo mode** without a key (parse/validate/generate via public playground); set `SIGNALEDI_API_KEY` for send/partner/QBO tools. |

Discoverable in the official MCP Registry and the directories that crawl it
(Smithery, Glama, mcp.so, PulseMCP). The `server.json` in this folder is the registry
manifest; `package.json` carries the matching `mcpName` ownership marker.

## Tools

| Tool | What it does |
| --- | --- |
| `parse_edi` | Parse a raw X12/EDIFACT interchange into structured JSON + a validation summary. |
| `validate_edi` | Validate a raw interchange against X12 structural rules (summary only). |
| `generate_test_document` | Render synthetic 850/810/856/837 samples (works in demo mode). |
| `explain_edi_error` | Local dictionary lookup for ack/validation errors. |
| `lookup_x12` | Search segment and acknowledgement reference. |
| `list_partner_kits` | List packaged API kits (requires key). |
| `get_partner_kit` | Fetch one kit by id (requires key). |
| `send_outbound_document` | Serialize a JSON payload to EDI and send it to a trading partner (async, webhook-acked). |
| `list_transactions` | List your recent transactions (newest first), scoped to the API key. |
| `get_transaction` | Fetch one transaction by id with full lifecycle status. |

Bad arguments and API errors are returned as MCP tool errors (so the model sees and
can recover from them) rather than crashing the server.

## Quick start

1. **Try without a key (demo mode).** Run `npx -y @signaledi/mcp-server` with no env vars —
   `parse_edi`, `validate_edi`, `generate_test_document`, `explain_edi_error`, and `lookup_x12`
   work against the public playground or local templates. Keyed tools return a structured
   `demo_mode` error with a link to create a key.
2. **Add a platform key for production flows.** Create a workspace key with the `platform`
   scope at [signaledi.com/console/keys](https://signaledi.com/console/keys) and set
   `SIGNALEDI_API_KEY`.

### One-click install

- **Cursor:** [Install in Cursor](cursor://anysphere.cursor-deeplink/mcp/install?name=signaledi&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIkBzaWduYWxlZGkvbWNwLXNlcnZlciJdLCJlbnYiOnsiU0lHTkFMRURJX0FQSV9LRVkiOiIifX0) (same deeplink as the developer site chip).
- **Claude Code:** `claude mcp add signaledi -- npx -y @signaledi/mcp-server`

### Claude Desktop / Claude Code

Add to your MCP config (`claude_desktop_config.json`, or `.mcp.json` for Claude Code):

```json
{
  "mcpServers": {
    "signaledi": {
      "command": "npx",
      "args": ["-y", "@signaledi/mcp-server"],
      "env": {
        "SIGNALEDI_API_KEY": "sk_live_…"
      }
    }
  }
}
```

### Cursor / Windsurf

Same shape under the editor's MCP settings (`command: npx`, `args: ["-y",
"@signaledi/mcp-server"]`, and the `SIGNALEDI_API_KEY` env var).

## Demo mode

Without a key, the server runs in demo mode (stderr notice): `parse_edi` and `validate_edi` call the public playground; keyed tools return JSON `{ "error": "demo_mode" }`; successful demo results append `— demo mode; responses rate-limited`.

## Configuration

| Env var | Required | Default | Notes |
| --- | --- | --- | --- |
| `SIGNALEDI_API_KEY` | — (demo mode) / ✅ (full access) | — | Workspace key with the `platform` scope for send/partner/QBO tools. |
| `SIGNALEDI_BASE_URL` | — | `https://signaledi.com` | Point at a custom domain or a preview deployment. |

The server speaks JSON-RPC over **stdout**; all logs go to **stderr**, so it never
corrupts the protocol channel.

## Example prompts

> "Parse this 850 and tell me the PO number and ship-to." *(paste raw EDI)*
> "Validate this interchange and list any structural errors."
> "Show my last 10 transactions and flag any that missed SLA."
> "Send an 810 invoice to partner `acme-co` with these line items…"

## Local development

```bash
node test.mjs        # dependency-free unit tests (mock fetch, no network)
SIGNALEDI_API_KEY=… npm start   # run the stdio server against the live API
```

The client (`src/client.mjs`) and tools (`src/tools.mjs`) are pure and unit-tested;
`src/index.mjs` is the only file that depends on the MCP SDK.

## How it fits

```
MCP client (Claude/Cursor/…) ⇄ @signaledi/mcp-server (stdio) ⇄ SignalEDI Core API (/api/v1)
```

See the [SDK](../../packages/sdk) for a programmatic TypeScript client and
[`docs/openapi/v1`](../../docs/openapi/v1) for the full API reference.
## GitHub mirror

[![npm version](https://img.shields.io/npm/v/@signaledi/mcp-server.svg)](https://www.npmjs.com/package/@signaledi/mcp-server)
[![MCP Registry](https://img.shields.io/badge/MCP-io.github.signaledi%2Fmcp--server-blue)](https://registry.modelcontextprotocol.io)

The public GitHub repo [`signaledi/mcp-server`](https://github.com/signaledi/mcp-server) mirrors **this folder only**. The GitLab monorepo stays the source of truth; the mirror updates on each npm publish (see [`MIRROR.md`](MIRROR.md) and the operator runbook [`docs/internal/runbooks/GITHUB_MCP_MIRROR.md`](../../../docs/internal/runbooks/GITHUB_MCP_MIRROR.md)).

### Examples

| Script | Purpose |
| --- | --- |
| [`examples/parse-demo.mjs`](examples/parse-demo.mjs) | Parse synthetic 850 via demo-mode client |
| [`examples/generate-validate.mjs`](examples/generate-validate.mjs) | Generate 850 locally, then validate |
| [`examples/agent-transcript.md`](examples/agent-transcript.md) | Illustrative agent conversation (no secrets) |

Run from this directory: `node examples/parse-demo.mjs`

Issue templates for the GitHub repo live under [`examples/.github/ISSUE_TEMPLATE/`](examples/.github/ISSUE_TEMPLATE/) (copied to repo root on mirror sync). Layout: [`examples/github-mirror-layout.md`](examples/github-mirror-layout.md).

### Mirror security checklist

Before every mirror push:

- No internal URLs, API keys, engine code, or employee/customer data in the tree
- Examples use synthetic EDI only; transcripts are fictional
- Badges and links point at public npm, MCP registry, and signaledi.com only
