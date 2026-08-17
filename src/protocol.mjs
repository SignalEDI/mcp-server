/** MCP response and request-safety helpers. No network or package dependencies. */

import { randomUUID } from "node:crypto";

export const SIGNALEDI_CONTRACT_VERSION = "2";

/**
 * Return both human-readable text and machine-readable MCP structured content.
 * The text form keeps compatibility with older MCP hosts.
 */
export function ok(value, meta = {}) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    _meta: { "com.signaledi/contractVersion": SIGNALEDI_CONTRACT_VERSION, ...meta },
  };
}

export function errorResult(code, message, details = {}, meta = {}) {
  const value = { error: code, message, ...details };
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    _meta: { "com.signaledi/contractVersion": SIGNALEDI_CONTRACT_VERSION, ...meta },
  };
}

export function requestId() {
  return `mcp_${randomUUID()}`;
}

export function isMutationTool(tool) {
  return tool?.mutation === true;
}

export function validateMutationArgs(tool, args = {}, meta = {}) {
  if (!isMutationTool(tool)) return null;
  const requestDetails = typeof meta["com.signaledi/requestId"] === "string"
    ? { requestId: meta["com.signaledi/requestId"] }
    : {};
  if (tool.name === "quickbooks_export_to_edi" && args.dryRun === true) {
    if (args.includePayload !== true || args.confirm === true) return null;
    return errorResult(
      "CONFIRMATION_REQUIRED",
      "quickbooks_export_to_edi includePayload:true places mapped business data in the MCP/model context. Re-run with confirm:true only after the host enforced human review under the approved data policy.",
      { tool: tool.name, ...requestDetails },
      meta,
    );
  }
  if (args.confirm !== true) {
    return errorResult(
      "CONFIRMATION_REQUIRED",
      `${tool.name} changes external or customer state. Re-run with confirm:true only after the human has reviewed the intended action.`,
      { tool: tool.name, ...requestDetails },
      meta,
    );
  }
  if (
    typeof args.idempotencyKey !== "string"
    || args.idempotencyKey.trim().length < 8
    || args.idempotencyKey.trim().length > 128
  ) {
    return errorResult(
      "IDEMPOTENCY_KEY_REQUIRED",
      `${tool.name} requires a caller-supplied idempotencyKey for request correlation and route-supported replay protection. The MCP server does not retry mutations.`,
      { tool: tool.name, ...requestDetails },
      meta,
    );
  }
  return null;
}
