# Repository and platform snapshot policy

[`SignalEDI/mcp-server`](https://github.com/SignalEDI/mcp-server) is the
canonical source and sole automated publish authority for
`@signaledi/mcp-server` and `io.github.SignalEDI/mcp-server`.

The private `SignalEDI/platform` repository may retain a synchronized validation
snapshot at `signaledi-integrations/integrations/mcp/` so its hosted API and MCP
adapter contracts can be validated together. That snapshot is not a package or
registry publish source.

## Release authority

- Changes originate here and merge through this repository's protected `main` branch.
- Only a protected stable `mcp-vX.Y.Z` tag on the exact current `main` commit may publish.
- The tag workflow publishes npm through its configured trusted publisher, verifies the
  exact npm version, and only then publishes the MCP Registry record.
- The platform workflow is validation-only. It must never accept release tags, npm
  credentials, or registry-publish authority.

## Platform snapshot updates

After an approved standalone release change merges, copy the package source,
tests, examples, lockfile, manifests, and release notes into the platform
snapshot without `node_modules`. Preserve platform-only repository workflows and
runbooks, run both repositories' validation, and review any drift explicitly.

## Security checklist

- [ ] No internal URLs, employee data, customer data, or production EDI
- [ ] No API keys, credentials, or engine source outside this adapter
- [ ] README badges and repository metadata point only at public distribution surfaces
- [ ] All examples and fixtures remain synthetic

On conflicts, this standalone repository wins. Public consumers should follow
this repository's `README.md`; platform developers should treat the monorepo copy
as a synchronized validation snapshot.
