#!/usr/bin/env node
/**
 * Claude Desktop MCPB packaging checks.
 * Validates mcpb/manifest.json against package/server metadata; does not alter MCP runtime.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
}

function readText(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

const pkg = readJson("package.json");
const server = readJson("server.json");
const manifest = readJson("mcpb/manifest.json");
const logoPath = "assets/logo.svg";
const iconPath = "mcpb/icon.png";

check(existsSync(join(root, logoPath)), `missing ${logoPath}`);
check(existsSync(join(root, iconPath)), `missing ${iconPath} (PNG for Claude Desktop)`);
check(existsSync(join(root, "scripts/build-mcpb.mjs")), "missing scripts/build-mcpb.mjs");
check(manifest.manifest_version === "0.3", "manifest_version must be 0.3");
check(manifest.name === "signaledi", "mcpb name must be signaledi");
check(manifest.display_name === "SignalEDI", "display_name must be SignalEDI");
check(manifest.version === pkg.version, "mcpb version must match package.json");
check(manifest.author?.name === "SignalEDI", "author.name must be SignalEDI");
check(manifest.author?.email === "Support@signaledi.com", "author.email must be Support@signaledi.com");
check(manifest.author?.url === "https://signaledi.com", "author.url must be https://signaledi.com");
check(manifest.homepage === "https://signaledi.com", "homepage must be https://signaledi.com");
check(manifest.documentation === "https://signaledi.com/developers/pricing#mcp", "documentation URL mismatch");
check(manifest.support === "https://github.com/SignalEDI/mcp-server/issues", "support must be the GitHub issues URL");
check(manifest.icon === "icon.png", "icon must be icon.png at bundle root");
check(manifest.license === "MIT", "license must be MIT");
check(Array.isArray(manifest.privacy_policies) && manifest.privacy_policies.includes("https://signaledi.com/privacy"), "privacy_policies must include https://signaledi.com/privacy");
check(!/challan116/i.test(JSON.stringify(manifest)), "branding must be SignalEDI only (never challan116)");

check(manifest.server?.type === "node", "server.type must be node");
check(manifest.server?.entry_point === "src/index.mjs", "entry_point must be existing src/index.mjs");
check(manifest.server?.mcp_config?.command === "node", "mcp_config.command must be node");
check(
  Array.isArray(manifest.server?.mcp_config?.args) &&
    manifest.server.mcp_config.args[0] === "${__dirname}/src/index.mjs",
  "mcp_config.args must launch ${__dirname}/src/index.mjs",
);

const env = manifest.server?.mcp_config?.env || {};
const serverEnvNames = (server.packages?.[0]?.environmentVariables || []).map((item) => item.name);
const requiredUserConfig = [
  "SIGNALEDI_API_KEY",
  "SIGNALEDI_BASE_URL",
  "SIGNALEDI_MCP_PROFILE",
  "SIGNALEDI_MCP_ALLOW_CUSTOM_BASE_URL",
  "SIGNALEDI_MCP_ALLOW_PRODUCTION",
  "SIGNALEDI_MCP_TELEMETRY",
];
for (const name of requiredUserConfig) {
  check(serverEnvNames.includes(name), `server.json missing env ${name}`);
  check(manifest.user_config?.[name], `user_config missing ${name}`);
  check(env[name] === `\${user_config.${name}}`, `mcp_config.env must map ${name} from user_config`);
}

check(manifest.user_config.SIGNALEDI_API_KEY.sensitive === true, "API key must be sensitive");
check(manifest.user_config.SIGNALEDI_API_KEY.required === false, "API key must be optional (docs profile)");
check(manifest.user_config.SIGNALEDI_MCP_PROFILE.default === "docs", "profile default must be docs");
check(manifest.tools_generated === true, "tools_generated must be true (profile-gated tools)");
check(manifest.compatibility?.runtimes?.node === ">=22", "compatibility node runtime must be >=22");
check(
  Array.isArray(manifest.compatibility?.platforms) &&
    ["darwin", "win32"].every((p) => manifest.compatibility.platforms.includes(p)),
  "compatibility must include darwin and win32",
);

const readme = readText("README.md");
check(readme.includes("## Claude Desktop (MCPB)"), "README must document Claude Desktop MCPB");
check(readme.includes("npm run build:mcpb"), "README must document build:mcpb");
check(readme.includes("desktop extension submission") || readme.includes("connectors/building/submission"), "README must document MCPB submit steps without auto-submitting");
check(readme.includes("@anthropic-ai/mcpb") || readme.includes("mcpb pack"), "README must reference MCPB tooling");

const buildScript = readText("scripts/build-mcpb.mjs");
check(buildScript.includes("mcpb pack") || buildScript.includes("@anthropic-ai/mcpb"), "build-mcpb must invoke mcpb pack");
check(buildScript.includes("signaledi") || buildScript.includes("SignalEDI"), "build-mcpb must brand SignalEDI");
check(!/challan116/i.test(buildScript), "build-mcpb must not mention challan116");

check(pkg.scripts?.["build:mcpb"]?.includes("build-mcpb"), "package.json must define build:mcpb");
check(pkg.scripts?.["validate:mcpb"]?.includes("validate-mcpb"), "package.json must define validate:mcpb");
check(pkg.scripts?.verify?.includes("validate:mcpb"), "verify script must run validate:mcpb");

if (failures.length) {
  console.error("MCPB packaging checks failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`MCPB packaging ok for ${manifest.name}@${manifest.version} (entry ${manifest.server.entry_point})`);
