/** Capability-profile helpers shared by client, tools, and startup. */

import { errorResult } from "./protocol.mjs";

export const DEMO_GET_KEY_URL = "https://signaledi.com/console/keys";
export const DEMO_MODE_FOOTER = "— docs profile; bundled public or local synthetic result";
export const MCP_PROFILES = Object.freeze(["docs", "sandbox", "production"]);

export function isToolAvailableInProfile(tool, profile) {
  if (profile === "docs") return tool.localOnly === true;
  if (profile === "sandbox") return true;
  return profile === "production" && (tool.localOnly === true || tool.productionSafe === true);
}

/** @returns {object} MCP tool error payload for tools outside the active profile. */
export function profileToolError(toolName, profile) {
  const guidance = profile === "docs"
    ? `The docs profile accepts only public-documentation and local tools; it never uploads caller-supplied documents. Choose sandbox only with a separately provisioned non-production API base and key, or production only with the explicit production opt-in and canonical production base. Create a key at ${DEMO_GET_KEY_URL}.`
    : profile === "production"
      ? "Production exposes only explicitly allowlisted reads and environment-bound, API-idempotent mutations. It requires the canonical production base, a platform key, and SIGNALEDI_MCP_ALLOW_PRODUCTION=1."
      : "Sandbox requires a separately provisioned non-production API base and key.";
  return errorResult(
    "TOOL_NOT_AVAILABLE_IN_PROFILE",
    `${toolName} is not available in the ${profile} profile. ${guidance}`,
    { tool: toolName, profile },
  );
}

/** Backwards-compatible name retained for callers of the 0.4 helper. */
export function demoModeToolError(toolName) {
  return profileToolError(toolName, "docs");
}

/** Append the docs-profile footer to successful MCP text results. */
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

/** Cursor/plugin hosts may pass unexpanded `${VAR}` placeholders when unset. */
const UNEXPANDED_ENV_PLACEHOLDER =
  /^(?:\$\{[A-Za-z_][A-Za-z0-9_]*\}|\$[A-Za-z_][A-Za-z0-9_]*|\{[A-Za-z_][A-Za-z0-9_]*\}|\{\{[A-Za-z_][A-Za-z0-9_]*\}\})$/;

/** Read a trimmed env value, treating empty or unexpanded placeholders as unset. */
export function readEnvValue(env, name) {
  const raw = env?.[name];
  if (raw == null) return undefined;
  const value = String(raw).trim();
  if (!value || UNEXPANDED_ENV_PLACEHOLDER.test(value)) return undefined;
  return value;
}

/** Resolve MCP client config from environment variables. */
export function resolveStartupFromEnv(env = process.env) {
  const providedApiKey = readEnvValue(env, "SIGNALEDI_API_KEY");
  const requestedProfile = readEnvValue(env, "SIGNALEDI_MCP_PROFILE")?.toLowerCase();
  const profile = requestedProfile || "docs";
  if (!MCP_PROFILES.includes(profile)) {
    throw new Error(`SIGNALEDI_MCP_PROFILE must be one of ${MCP_PROFILES.join(", ")}.`);
  }
  if (profile !== "docs" && !providedApiKey) {
    throw new Error(`${profile} profile requires SIGNALEDI_API_KEY.`);
  }

  const baseUrl = readEnvValue(env, "SIGNALEDI_BASE_URL");
  if (profile !== "docs" && !baseUrl) {
    throw new Error(`${profile} profile requires an explicit SIGNALEDI_BASE_URL.`);
  }
  const allowProduction = /^(1|true)$/i.test(readEnvValue(env, "SIGNALEDI_MCP_ALLOW_PRODUCTION") || "");
  if (profile === "production" && !allowProduction) {
    throw new Error("production profile requires SIGNALEDI_MCP_ALLOW_PRODUCTION=1.");
  }
  return {
    profile,
    demoMode: profile === "docs",
    apiKey: profile === "docs" ? undefined : providedApiKey,
    baseUrl,
    baseUrlExplicit: Boolean(baseUrl),
    allowCustomBaseUrl: /^(1|true)$/i.test(readEnvValue(env, "SIGNALEDI_MCP_ALLOW_CUSTOM_BASE_URL") || ""),
    allowProduction,
  };
}

export function buildProfileStartupLine(profile) {
  if (profile === "docs") {
    return `SignalEDI MCP running in docs profile — public resources and local/synthetic helpers only. Get a key: ${DEMO_GET_KEY_URL}`;
  }
  if (profile === "production") {
    return "SignalEDI MCP running in production profile against the canonical production API; only allowlisted reads and guarded environment-bound mutations are exposed.";
  }
  return `SignalEDI MCP running in ${profile} profile against an explicitly configured non-production API base.`;
}

export function buildDemoStartupLine() {
  return buildProfileStartupLine("docs");
}
