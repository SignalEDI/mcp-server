# GitHub mirror sync policy

The canonical MCP server source lives in this GitLab monorepo at
`signaledi-integrations/integrations/mcp/`.

The public GitHub repo [`signaledi/mcp-server`](https://github.com/signaledi/mcp-server)
mirrors **this folder only** (squash-init acceptable; history not required).

## When to update the mirror

- On each `@signaledi/mcp-server` npm publish (manual step in the publish runbook until automated).
- Copy: `src/`, `examples/`, `README.md`, `LICENSE`, `package.json`, `server.json`, `test.mjs`.

## Security checklist (every mirror push)

- [ ] No internal URLs or employee data
- [ ] No API keys or engine source outside this adapter package
- [ ] README badges point at public npm + MCP registry only

## Source of truth

GitLab monorepo wins on conflicts. GitHub is a read-only distribution mirror for discoverability.

Full runbook: [docs/internal/runbooks/GITHUB_MCP_MIRROR.md](../../../docs/internal/runbooks/GITHUB_MCP_MIRROR.md).
