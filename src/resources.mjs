import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderX12ReferenceMarkdown } from "./x12-dictionary.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const QUICKSTART_URI = "signaledi://quickstart";
const OPENAPI_URI = "signaledi://openapi";
const X12_URI = "signaledi://x12-reference";

let openapiCache = null;

function bundledQuickstart() {
  try {
    return readFileSync(join(__dirname, "..", "README.md"), "utf8");
  } catch {
    return "# SignalEDI MCP\n\nSee https://signaledi.com/integrations/mcp";
  }
}

export function listResources() {
  return [
    {
      uri: QUICKSTART_URI,
      name: "SignalEDI MCP quickstart",
      description: "Install, configure, and first prompts for the MCP server.",
      mimeType: "text/markdown",
    },
    {
      uri: OPENAPI_URI,
      name: "SignalEDI OpenAPI",
      description: "Live /api/v1 OpenAPI document from the hosted engine.",
      mimeType: "application/json",
    },
    {
      uri: X12_URI,
      name: "X12 reference",
      description: "Segment and acknowledgement code reference used by explain_edi_error.",
      mimeType: "text/markdown",
    },
  ];
}

/** @param {import("./client.mjs").SignalEDIClient} client */
export async function readResource(client, uri) {
  if (uri === QUICKSTART_URI) {
    return {
      contents: [{ uri, mimeType: "text/markdown", text: bundledQuickstart() }],
    };
  }
  if (uri === OPENAPI_URI) {
    if (!openapiCache) {
      openapiCache = await client.fetchOpenApi();
    }
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(openapiCache, null, 2),
        },
      ],
    };
  }
  if (uri === X12_URI) {
    return {
      contents: [{ uri, mimeType: "text/markdown", text: renderX12ReferenceMarkdown() }],
    };
  }
  throw new Error(`Unknown resource: ${uri}`);
}

export function listPrompts() {
  return [
    {
      name: "onboard-partner",
      description: "Step-by-step partner onboarding using MCP tools.",
      arguments: [
        { name: "partnerName", description: "Trading partner display name", required: true },
        { name: "documentTypes", description: "Comma-separated doc types (e.g. 850,810)", required: false },
      ],
    },
    {
      name: "debug-rejection",
      description: "Diagnose a functional ack or validation rejection.",
      arguments: [
        { name: "rawError", description: "Raw ack segment or validation error text", required: true },
      ],
    },
  ];
}

export function getPrompt(name, args) {
  if (name === "onboard-partner") {
    const partner = args.partnerName || "your partner";
    const docs = args.documentTypes || "850,810,856";
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Onboard trading partner "${partner}" for document types ${docs}.`,
              "1. list_partner_kits (or generate_test_document for samples if no key).",
              "2. validate_edi on a sample interchange.",
              "3. send_outbound_document once a platform API key is configured.",
              "4. list_transactions to confirm delivery status.",
            ].join("\n"),
          },
        },
      ],
    };
  }
  if (name === "debug-rejection") {
    const raw = args.rawError || "";
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              "Debug this EDI rejection using explain_edi_error, lookup_x12, and validate_edi:",
              raw,
            ].join("\n\n"),
          },
        },
      ],
    };
  }
  throw new Error(`Unknown prompt: ${name}`);
}
