/** MCP response and request-safety helpers. No network or package dependencies. */

export const MCP_PROTOCOL_VERSION = "1";

/**
 * Return both human-readable text and machine-readable MCP structured content.
 * The text form keeps compatibility with older MCP hosts.
 */
export function ok(value, meta = {}) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    _meta: { protocolVersion: MCP_PROTOCOL_VERSION, ...meta },
  };
}

export function errorResult(code, message, details = {}, meta = {}) {
  const value = { error: code, message, ...details };
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    _meta: { protocolVersion: MCP_PROTOCOL_VERSION, ...meta },
  };
}

export function requestId() {
  return `mcp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function isMutationTool(tool) {
  return tool?.mutation === true;
}

export function validateMutationArgs(tool, args = {}) {
  if (!isMutationTool(tool)) return null;
  if (tool.name === "quickbooks_export_to_edi" && args.dryRun === true) return null;
  if (args.confirm !== true) {
    return errorResult(
      "CONFIRMATION_REQUIRED",
      `${tool.name} changes external or customer state. Re-run with confirm:true after reviewing the intended action.`,
      { tool: tool.name },
    );
  }
  if (typeof args.idempotencyKey !== "string" || args.idempotencyKey.trim().length < 8) {
    return errorResult(
      "IDEMPOTENCY_KEY_REQUIRED",
      `${tool.name} requires a unique idempotencyKey so retries cannot duplicate the action.`,
      { tool: tool.name },
    );
  }
  return null;
}
