#!/usr/bin/env node
// SignalEDI MCP server — exposes the SignalEDI Core API (/api/v1) as Model
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
import { getPrompt, listPrompts, listResources, readResource } from "./resources.mjs";

const NAME = "signaledi";
const VERSION = "0.3.0";

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
      description: t.description,
      inputSchema: t.inputSchema,
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
    `[signaledi-mcp] ready — ${TOOLS.length} tools, ${listResources().length} resources, ${listPrompts().length} prompts on stdio${config.demoMode ? " (demo mode)" : ""}.
`,
  );
}

main().catch((err) => {
  process.stderr.write(`[signaledi-mcp] fatal: ${err?.message || String(err)}\n`);
  process.exit(1);
});
