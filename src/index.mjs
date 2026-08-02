#!/usr/bin/env node
// SignalEDI MCP server ΓÇö exposes the SignalEDI Core API (/api/v1) as Model
// Context Protocol tools so AI clients (Claude Desktop, Cursor, Windsurf, etc.)
// can parse, validate, send, and inspect EDI documents.
//
// Transport: stdio. Auth: SIGNALEDI_API_KEY (a workspace key with the `platform`
// scope). Optional: SIGNALEDI_BASE_URL to target a custom domain or preview.
// Without a key the server runs in demo mode (parse/validate via public playground).

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { SignalEDIClient } from "./client.mjs";
import { TOOLS, callTool } from "./tools.mjs";
import { buildDemoStartupLine, resolveStartupFromEnv } from "./demo.mjs";
import { PACKAGE_METADATA } from "./metadata.mjs";
import { getPrompt, listPrompts, listResources, readResource } from "./resources.mjs";

const NAME = PACKAGE_METADATA.name;
const VERSION = PACKAGE_METADATA.version;

function readConfig() {
  const config = resolveStartupFromEnv(process.env);
  if (config.demoMode) {
    process.stderr.write(`${buildDemoStartupLine()}\n`);
  }
  return config;
}

async function main() {
  const config = readConfig();
  const client = new SignalEDIClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    demoMode: config.demoMode,
  });

  const server = new Server(
    { name: NAME, version: VERSION },
    { capabilities: { tools: {}, resources: {}, prompts: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      description: `${t.description}${t.mutation ? ` Required scopes: ${(t.requiredScopes || []).join(", ")}. Requires confirm:true and idempotencyKey.` : " Read-only or local operation."}`,
      inputSchema: t.inputSchema,
      annotations: {
        readOnlyHint: !t.mutation,
        destructiveHint: Boolean(t.mutation),
        idempotentHint: Boolean(t.mutation),
      },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    return callTool(client, name, args);
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: listResources(),
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    return readResource(client, request.params.uri);
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: listPrompts(),
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    return getPrompt(request.params.name, request.params.arguments || {});
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `[signaledi-mcp] ready ΓÇö ${TOOLS.length} tools, ${listResources().length} resources, ${listPrompts().length} prompts on stdio${config.demoMode ? " (demo mode)" : ""}.
`,
  );
}

main().catch((err) => {
  process.stderr.write(`[signaledi-mcp] fatal: ${err?.message || String(err)}\n`);
  process.exit(1);
});
