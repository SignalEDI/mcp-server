# SignalEDI MCPB (Claude Desktop)

Package the existing `@signaledi/mcp-server` stdio MCP adapter as a Claude Desktop Extension (`.mcpb`). This does **not** duplicate the server implementation—the bundle ships the same `src/` entry point and production `node_modules`.

## Build locally

From the repository root (Node 22+):

```bash
npm ci
npm run build:mcpb
```

Artifact: `dist/signaledi-mcp-server-<version>.mcpb`

What the build does:

1. Stages `package.json`, `package-lock.json`, `src/`, `LICENSE`, `README.md`, and `mcpb/manifest.json` / `mcpb/icon.png`
2. Runs `npm ci --omit=dev` inside the staging directory (bundles `@modelcontextprotocol/sdk`)
3. Invokes `@anthropic-ai/mcpb` `pack` to produce the `.mcpb` zip

Validate packaging metadata without packing:

```bash
npm run validate:mcpb
```

Optional: validate the manifest with the Anthropic CLI after install:

```bash
npx -y @anthropic-ai/mcpb validate mcpb/manifest.json
```

## Install in Claude Desktop

1. Build the `.mcpb` (or download a release artifact when published)
2. Double-click the file, drag it into Claude Desktop, or use **Settings → Extensions → Advanced → Install Extension…**
3. Configure profile / API settings in the extension UI (defaults to keyless `docs`)

## Submit to Anthropic Connectors Directory (manual)

Do **not** auto-submit from CI or agents. When ready:

1. Confirm tool annotations (`title`, `readOnlyHint` / `destructiveHint`) — already emitted by `src/index.mjs`
2. Confirm `privacy_policies` in `mcpb/manifest.json` and a Privacy Policy section in the root README
3. Build and smoke-test the `.mcpb` on macOS and Windows Claude Desktop
4. Submit via Anthropic’s [desktop extension submission form](https://claude.com/docs/connectors/building/submission) (separate from the remote MCP portal)
5. Use publisher contact **Support@signaledi.com** / **https://signaledi.com**

Brand: **SignalEDI** only.
