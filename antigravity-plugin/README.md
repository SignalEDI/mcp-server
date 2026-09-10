# SignalEDI Antigravity plugin

Manual / one-click-style install package for [Google Antigravity](https://antigravity.google/) (Gemini-compatible plugin layout). Wires the published npm package `@signaledi/mcp-server` over stdio via `npx` — there is no parallel MCP implementation.

> **Note:** Antigravity MCP Store listing is **not self-serve**. This plugin folder is for **manual** install (global or workspace). Brand: **SignalEDI** only.

## Install

### Global (all workspaces)

Copy this folder to:

```bash
mkdir -p ~/.gemini/config/plugins
cp -R antigravity-plugin ~/.gemini/config/plugins/signaledi
```

### Workspace

Copy into the opened workspace:

```bash
mkdir -p .agents/plugins
cp -R antigravity-plugin .agents/plugins/signaledi
```

(`_agents/plugins/signaledi` is also accepted by Antigravity.)

Restart Antigravity / reload the window so the plugin scanner picks up `plugin.json` + `mcp_config.json`.

## Configure

Set host environment variables (or Antigravity MCP env UI when available) before using authenticated profiles:

| Variable | Typical value |
| --- | --- |
| `SIGNALEDI_MCP_PROFILE` | `docs` (default), `sandbox`, or `production` |
| `SIGNALEDI_API_KEY` | Least-privilege workspace key (ignored by `docs`) |
| `SIGNALEDI_BASE_URL` | Verified non-production origin, or exactly `https://signaledi.com` for production |
| `SIGNALEDI_MCP_ALLOW_CUSTOM_BASE_URL` | `1` only for verified custom hosts |
| `SIGNALEDI_MCP_ALLOW_PRODUCTION` | `1` only with the production profile and canonical base |

Unset placeholders stay fail-closed on the keyless `docs` profile.

## Layout

```text
antigravity-plugin/
├── plugin.json       # Required marker (name: signaledi)
├── mcp_config.json   # npx -y @signaledi/mcp-server@<version>
└── README.md
```

Publisher: SignalEDI · Support@signaledi.com · https://signaledi.com
