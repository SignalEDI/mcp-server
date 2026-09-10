import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const childEnv = Object.fromEntries(
  ["PATH", "Path", "SystemRoot", "COMSPEC", "PATHEXT", "HOME", "TMPDIR", "TEMP", "TMP"]
    .filter((key) => typeof process.env[key] === "string")
    .map((key) => [key, process.env[key]]),
);
Object.assign(childEnv, {
  SIGNALEDI_MCP_PROFILE: ["sandbox", "production"].includes(process.argv[2]) ? process.argv[2] : "docs",
  SIGNALEDI_MCP_TELEMETRY: "0",
});
if (childEnv.SIGNALEDI_MCP_PROFILE === "sandbox") {
  Object.assign(childEnv, {
    SIGNALEDI_API_KEY: "synthetic-smoke-key",
    SIGNALEDI_BASE_URL: "http://localhost:3100",
    SIGNALEDI_MCP_ALLOW_CUSTOM_BASE_URL: "1",
  });
}
if (childEnv.SIGNALEDI_MCP_PROFILE === "production") {
  Object.assign(childEnv, {
    SIGNALEDI_API_KEY: "synthetic-production-smoke-key",
    SIGNALEDI_BASE_URL: "https://signaledi.com",
    SIGNALEDI_MCP_ALLOW_PRODUCTION: "1",
  });
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL("./src/index.mjs", import.meta.url))],
  env: childEnv,
  stderr: "pipe",
});
const client = new Client({ name: "signaledi-stdio-smoke", version: "1.0.0" });

try {
  await client.connect(transport);

  const tools = await client.listTools();
  assert.ok(tools.tools.length >= 7);
  assert.ok(tools.tools.some((tool) => tool.name === "search_docs"));
  const expectedCounts = { docs: 7, sandbox: 28, production: 21 };
  assert.equal(tools.tools.length, expectedCounts[childEnv.SIGNALEDI_MCP_PROFILE]);
  const toolNames = tools.tools.map((tool) => tool.name).sort();
  if (childEnv.SIGNALEDI_MCP_PROFILE === "docs") {
    assert.deepEqual(toolNames, [
      "explain_edi_error",
      "generate_integration_example",
      "generate_test_document",
      "get_document_schema",
      "lookup_element_definition",
      "lookup_x12",
      "search_docs",
    ]);
  }
  if (childEnv.SIGNALEDI_MCP_PROFILE === "sandbox") {
    assert.ok(toolNames.includes("parse_edi"));
    assert.ok(toolNames.includes("validate_edi"));
    assert.ok(toolNames.includes("send_outbound_document"));
    assert.ok(toolNames.includes("quickbooks_sync_to_qbo"));
    assert.ok(toolNames.includes("quickbooks_list_entities"));
    assert.ok(toolNames.includes("list_connections"));
  }
  if (childEnv.SIGNALEDI_MCP_PROFILE === "production") {
    assert.ok(toolNames.includes("send_outbound_document"));
    assert.ok(toolNames.includes("list_connections"));
    assert.ok(toolNames.includes("test_connection"));
    assert.equal(toolNames.includes("parse_edi"), false);
    assert.equal(toolNames.includes("validate_edi"), false);
    assert.equal(toolNames.includes("quickbooks_sync_to_qbo"), false);
    assert.equal(toolNames.includes("quickbooks_disconnect"), false);
    assert.equal(toolNames.includes("quickbooks_list_entities"), false);
  }
  const parseTool = tools.tools.find((tool) => tool.name === "parse_edi");
  if (childEnv.SIGNALEDI_MCP_PROFILE === "sandbox") {
    assert.ok(parseTool);
    assert.equal(parseTool.annotations.readOnlyHint, false);
    assert.equal(parseTool.annotations.destructiveHint, false);
    assert.equal(parseTool.annotations.idempotentHint, false);
    assert.match(parseTool.description, /uploads caller-provided test data/i);
  } else {
    assert.equal(parseTool, undefined);
  }
  const sendTool = tools.tools.find((tool) => tool.name === "send_outbound_document");
  if (["sandbox", "production"].includes(childEnv.SIGNALEDI_MCP_PROFILE)) {
    assert.ok(sendTool);
    assert.equal(sendTool.annotations.readOnlyHint, false);
    assert.equal(sendTool.annotations.destructiveHint, true);
    assert.equal(sendTool.annotations.idempotentHint, true);
    assert.deepEqual(sendTool._meta["com.signaledi/requiredScopes"], ["platform", "platform:documents:read", "platform:documents:send"]);
    assert.match(sendTool.description, /platform:documents:send/);
    if (childEnv.SIGNALEDI_MCP_PROFILE === "production") assert.match(sendTool.description, /platform:documents:production/);
  } else {
    assert.equal(sendTool, undefined);
  }
  assert.ok(tools.tools.every((tool) => tool.inputSchema?.type === "object"));
  assert.ok(tools.tools.every((tool) => tool.outputSchema?.type === "object"));
  assert.ok(tools.tools.every((tool) => {
    if (Array.isArray(tool.outputSchema?.anyOf)) {
      return tool.outputSchema.anyOf.every((branch) => Array.isArray(branch.required) && branch.required.length > 0);
    }
    if (Array.isArray(tool.outputSchema?.oneOf)) {
      return tool.outputSchema.oneOf.every((branch) => Array.isArray(branch.required) && branch.required.length > 0);
    }
    return Array.isArray(tool.outputSchema.required) && tool.outputSchema.required.length > 0;
  }));
  const configureConnection = tools.tools.find((tool) => tool.name === "configure_connection");
  if (["sandbox", "production"].includes(childEnv.SIGNALEDI_MCP_PROFILE)) {
    assert.ok(configureConnection);
    assert.equal(configureConnection.annotations.destructiveHint, true);
    assert.equal(configureConnection.annotations.idempotentHint, true);
    assert.match(configureConnection.description, /platform:connections:read/);
    assert.match(configureConnection.description, /platform:connections:write/);
    assert.match(configureConnection.description, /platform:connections:production/);
    assert.deepEqual(configureConnection._meta["com.signaledi/requiredScopes"], ["platform", "platform:connections:read", "platform:connections:write"]);
    assert.deepEqual(configureConnection._meta["com.signaledi/productionScopes"], ["platform:connections:production"]);
    assert.equal(configureConnection._meta["com.signaledi/confirmation"], "caller-assertion-host-enforced");
    assert.equal(configureConnection.inputSchema.properties.x12Envelope.properties.usageIndicator, undefined);
    assert.equal(configureConnection.inputSchema.properties.secretRef, undefined);
    const goLive = tools.tools.find((tool) => tool.name === "request_connection_go_live");
    assert.ok(goLive);
    assert.match(goLive.description, /does not activate production/i);
    assert.deepEqual(goLive._meta["com.signaledi/requiredScopes"], [
      "platform",
      "platform:connections:read",
      "platform:connections:write",
      "platform:connections:production",
    ]);
    assert.deepEqual(goLive._meta["com.signaledi/productionScopes"], []);
    const testConnection = tools.tools.find((tool) => tool.name === "test_connection");
    assert.ok(testConnection);
    assert.equal(testConnection.annotations.destructiveHint, true);
    assert.equal(testConnection.annotations.idempotentHint, true);
    assert.deepEqual(testConnection._meta["com.signaledi/requiredScopes"], [
      "platform",
      "platform:connections:read",
      "platform:connections:write",
    ]);
    assert.deepEqual(testConnection._meta["com.signaledi/productionScopes"], ["platform:connections:production"]);
    assert.equal(testConnection._meta["com.signaledi/confirmation"], "caller-assertion-host-enforced");
    assert.deepEqual(Object.keys(testConnection.inputSchema.properties).sort(), ["confirm", "connectionId", "idempotencyKey"]);
    assert.equal(testConnection.inputSchema.properties.environment, undefined);
    assert.equal(testConnection.inputSchema.properties.endpoint, undefined);
    assert.match(testConnection.description, /partner-network egress/i);
    assert.match(testConnection.description, /never activates delivery/i);
  } else {
    assert.equal(configureConnection, undefined);
    assert.equal(tools.tools.find((tool) => tool.name === "test_connection"), undefined);
  }
  const qboExport = tools.tools.find((tool) => tool.name === "quickbooks_export_to_edi");
  if (["sandbox", "production"].includes(childEnv.SIGNALEDI_MCP_PROFILE)) {
    assert.ok(qboExport);
    assert.deepEqual(qboExport._meta["com.signaledi/requiredScopes"], ["platform", "platform:quickbooks:read"]);
    assert.deepEqual(qboExport._meta["com.signaledi/productionScopes"], []);
    assert.ok(qboExport._meta["com.signaledi/conditionalScopes"].some((entry) =>
      entry.when === "includePayload=true" && entry.scopes.includes("platform:data:sensitive")));
    assert.match(qboExport.description, /payload-redacted summary by default/i);
  } else {
    assert.equal(qboExport, undefined);
  }
  assert.equal(tools.tools.some((tool) => tool.name === "transition_connection"), false);
  if (childEnv.SIGNALEDI_MCP_PROFILE === "production") {
    assert.ok(tools.tools.some((tool) => tool.name === "list_transactions"));
    assert.ok(tools.tools.some((tool) => tool.name === "quickbooks_export_to_edi"));
    assert.ok(tools.tools.some((tool) => tool.name === "list_connections"));
    assert.ok(tools.tools.some((tool) => tool.name === "get_connection"));
    assert.ok(tools.tools.some((tool) => tool.name === "create_connection_draft"));
    assert.ok(tools.tools.some((tool) => tool.name === "test_connection"));
    assert.equal(tools.tools.some((tool) => tool.name === "quickbooks_sync_to_qbo"), false);
    assert.equal(tools.tools.some((tool) => tool.name === "quickbooks_disconnect"), false);
    assert.equal(tools.tools.some((tool) => tool.name === "quickbooks_list_entities"), false);
  }

  const resources = await client.listResources();
  assert.ok(resources.resources.some((resource) => resource.uri === "signaledi://developer-workflows"));
  const templates = await client.listResourceTemplates();
  assert.equal(templates.resourceTemplates[0].uriTemplate, "signaledi://documents/{transactionSet}/schema");

  const schema = await client.callTool({ name: "get_document_schema", arguments: { transactionSet: "850" } });
  assert.equal(schema.isError, undefined);
  assert.equal(schema.structuredContent.transactionSet, "850");
  if (childEnv.SIGNALEDI_MCP_PROFILE === "docs") {
    await assert.rejects(
      () => client.callTool({ name: "send_outbound_document", arguments: {} }),
      (error) => error?.code === -32602 && /not available in the docs profile/.test(error.message),
    );
    await assert.rejects(
      () => client.callTool({ name: "parse_edi", arguments: { content: "ISA*SYNTHETIC" } }),
      (error) => error?.code === -32602 && /not available in the docs profile/.test(error.message),
    );
  }
  if (childEnv.SIGNALEDI_MCP_PROFILE === "production") {
    await assert.rejects(
      () => client.callTool({ name: "parse_edi", arguments: { content: "ISA*SYNTHETIC" } }),
      (error) => error?.code === -32602 && /not available in the production profile/.test(error.message),
    );
  }

  const resource = await client.readResource({ uri: "signaledi://documents/850/schema" });
  assert.match(resource.contents[0].text, /Purchase Order/);
  await assert.rejects(
    () => client.readResource({ uri: "signaledi://not-a-resource" }),
    (error) => error?.code === -32602 && /Unknown resource/.test(error.message),
  );

  const prompts = await client.listPrompts();
  assert.ok(prompts.prompts.some((prompt) => prompt.name === "scaffold-integration"));
  const prompt = await client.getPrompt({ name: "scaffold-integration", arguments: { documentType: "850", language: "node" } });
  assert.match(prompt.messages[0].content.text, /Do not call a mutation tool/);
  assert.match(prompt.messages[0].content.text, /only after the operator explicitly reconfigures.*authenticated sandbox profile/i);
  await assert.rejects(
    () => client.getPrompt({ name: "not-a-prompt", arguments: {} }),
    (error) => error?.code === -32602 && /Unknown prompt/.test(error.message),
  );
  await assert.rejects(
    () => client.getPrompt({ name: "scaffold-integration", arguments: {} }),
    (error) => error?.code === -32602 && /documentType is required/.test(error.message),
  );
  await assert.rejects(
    () => client.getPrompt({ name: "scaffold-integration", arguments: { documentType: "850x" } }),
    (error) => error?.code === -32602 && /at most 3 characters/.test(error.message),
  );
  if (childEnv.SIGNALEDI_MCP_PROFILE === "docs") {
    const edifact = await client.callTool({ name: "get_document_schema", arguments: { transactionSet: "EDIFACT" } });
    assert.equal(edifact.isError, true);
    assert.equal(edifact.structuredContent.error, "OUT_OF_SCOPE_FORMAT");
    const unknown = await client.callTool({ name: "get_document_schema", arguments: { transactionSet: "855" } });
    assert.equal(unknown.isError, true);
    assert.equal(unknown.structuredContent.error, "UNSUPPORTED_TRANSACTION_SET");
    const baseline = await client.callTool({ name: "get_document_schema", arguments: { transactionSet: "850" } });
    assert.equal(baseline.structuredContent.capability, "baseline");
    const partial = await client.callTool({ name: "generate_test_document", arguments: { type: "837" } });
    assert.equal(partial.structuredContent.capability, "partial");
  }

  console.log(`stdio smoke passed: ${tools.tools.length} ${childEnv.SIGNALEDI_MCP_PROFILE} tools, ${resources.resources.length} resources, ${templates.resourceTemplates.length} template, ${prompts.prompts.length} prompts`);
} finally {
  await client.close();
}
