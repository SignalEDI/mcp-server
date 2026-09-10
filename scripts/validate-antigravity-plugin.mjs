#!/usr/bin/env node
/**
 * Google Antigravity / Gemini plugin packaging checks.
 * Validates antigravity-plugin/ metadata only; launches the published npm package via npx.
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
const plugin = readJson("antigravity-plugin/plugin.json");
const mcp = readJson("antigravity-plugin/mcp_config.json");
const pluginReadme = readText("antigravity-plugin/README.md");
const logoPath = "assets/logo.svg";

check(existsSync(join(root, logoPath)), `missing ${logoPath}`);
check(plugin.name === "signaledi", "plugin name must be signaledi");
check(plugin.displayName === "SignalEDI" || plugin.display_name === "SignalEDI", "plugin display name must be SignalEDI");
check(plugin.version === pkg.version, "plugin.json version must match package.json");
check(plugin.author === "SignalEDI" || plugin.author?.name === "SignalEDI", "plugin author must be SignalEDI");
check(!/challan116/i.test(JSON.stringify(plugin)), "branding must be SignalEDI only (never challan116)");
check(!/challan116/i.test(JSON.stringify(mcp)), "mcp_config branding must be SignalEDI only");
check(!/challan116/i.test(pluginReadme), "plugin README branding must be SignalEDI only");

const server = mcp.mcpServers?.signaledi;
check(server?.command === "npx", "mcp_config.json must launch via npx");
check(
  Array.isArray(server?.args) && server.args[0] === "-y" && server.args[1] === `@signaledi/mcp-server@${pkg.version}`,
  `mcp_config.json must pin @signaledi/mcp-server@${pkg.version}`,
);

const requiredVars = [
  "SIGNALEDI_MCP_PROFILE",
  "SIGNALEDI_API_KEY",
  "SIGNALEDI_BASE_URL",
  "SIGNALEDI_MCP_ALLOW_CUSTOM_BASE_URL",
  "SIGNALEDI_MCP_ALLOW_PRODUCTION",
];
for (const name of requiredVars) {
  check(server?.env?.[name] != null, `mcp_config.env missing ${name}`);
}

check(pluginReadme.includes("~/.gemini/config/plugins/"), "plugin README must document global install path");
check(
  pluginReadme.includes(".agents/plugins/") || pluginReadme.includes("_agents/plugins/"),
  "plugin README must document workspace install path",
);
check(pluginReadme.includes("MCP Store") || pluginReadme.includes("not self-serve"), "plugin README must note MCP Store is not self-serve");
check(pluginReadme.includes("SignalEDI"), "plugin README must brand SignalEDI");

const readme = readText("README.md");
check(readme.includes("## Google Antigravity"), "README must document Google Antigravity plugin");
check(readme.includes("antigravity-plugin"), "README must reference antigravity-plugin/");
check(readme.includes("~/.gemini/config/plugins/") || readme.includes(".agents/plugins/"), "README must document Antigravity install paths");

check(pkg.scripts?.["validate:antigravity-plugin"]?.includes("validate-antigravity-plugin"), "package.json must define validate:antigravity-plugin");
check(pkg.scripts?.verify?.includes("validate:antigravity-plugin"), "verify script must run validate:antigravity-plugin");

const blob = `${JSON.stringify(plugin)}\n${JSON.stringify(mcp)}\n${pluginReadme}`;
check(!/sk_live|sk_test|Bearer [A-Za-z0-9._-]{8,}/i.test(blob), "plugin packaging must not embed secrets");
check(!/"SIGNALEDI_API_KEY"\s*:\s*"[^$"][^"]+"/i.test(JSON.stringify(mcp)), "mcp_config must not hardcode API keys");

if (failures.length) {
  console.error("Antigravity plugin packaging checks failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Antigravity plugin packaging ok for ${plugin.name}@${plugin.version || pkg.version} (npx @signaledi/mcp-server@${pkg.version})`);
