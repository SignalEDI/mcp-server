/** Demo-mode helpers shared by client + tools. */

export const DEMO_GET_KEY_URL = "https://signaledi.com/console/keys";
export const DEMO_MODE_FOOTER = "— demo mode; responses rate-limited";

/** Tools that require a workspace API key (blocked in demo mode). */
export const KEYED_ONLY_TOOLS = new Set([
  "send_outbound_document",
  "list_transactions",
  "get_transaction",
  "quickbooks_status",
  "quickbooks_sync_to_qbo",
  "quickbooks_export_to_edi",
  "quickbooks_list_entities",
  "quickbooks_disconnect",
  "list_partner_kits",
  "get_partner_kit",
]);

/** @returns {object} MCP tool error payload for demo-gated tools. */
export function demoModeToolError(toolName) {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            error: "demo_mode",
            message: `${toolName} requires a workspace API key. Create one at ${DEMO_GET_KEY_URL}.`,
            getKeyUrl: DEMO_GET_KEY_URL,
          },
          null,
          2,
        ),
      },
    ],
  };
}

/** Append the demo footer line to successful MCP text results. */
export function appendDemoFooter(result) {
  if (result?.isError || !Array.isArray(result?.content)) return result;
  return {
    ...result,
    content: result.content.map((block) => {
      if (block?.type !== "text" || typeof block.text !== "string") return block;
      return { ...block, text: `${block.text}\n${DEMO_MODE_FOOTER}` };
    }),
  };
}

/** Resolve MCP client config from env (mirrors index.mjs startup). */
export function resolveStartupFromEnv(env = process.env) {
  const apiKey = env.SIGNALEDI_API_KEY?.trim();
  return {
    demoMode: !apiKey,
    apiKey: apiKey || undefined,
    baseUrl: env.SIGNALEDI_BASE_URL?.trim() || undefined,
  };
}

export function buildDemoStartupLine() {
  return `SignalEDI MCP running in demo mode — parse/validate/generate_test_document/explain/lookup only. Get a key: ${DEMO_GET_KEY_URL}`;
}

