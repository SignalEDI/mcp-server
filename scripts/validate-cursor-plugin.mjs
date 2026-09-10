#!/usr/bin/env node
/**
 * Lightweight Cursor Marketplace packaging checks for this repo.
 * Does not alter MCP runtime behavior; validates plugin metadata only.
 */

import { readFileSync, existsSync } from "node:fs";
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
const plugin = readJson(".cursor-plugin/plugin.json");
const mcp = readJson("mcp.json");
const skillPath = "skills/signaledi-mcp-profiles/SKILL.md";
const logoPath = "assets/logo.svg";

check(existsSync(join(root, skillPath)), `missing ${skillPath}`);
check(existsSync(join(root, logoPath)), `missing ${logoPath}`);
check(plugin.name === "signaledi", "plugin name must be signaledi");
check(/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(plugin.name), "plugin name must be kebab-case");
check(plugin.version === pkg.version, "plugin.json version must match package.json");
check(plugin.author?.name === "SignalEDI", "plugin author must be SignalEDI");
check(plugin.homepage === "https://signaledi.com/developers/pricing#mcp", "plugin homepage mismatch");
check(plugin.repository === "https://github.com/SignalEDI/mcp-server", "plugin repository must be the public GitHub URL");
check(plugin.license === "MIT", "plugin license must be MIT");
check(plugin.logo === "assets/logo.svg", "plugin logo must be a relative assets path");
check(!String(plugin.logo).includes("..") && !String(plugin.logo).startsWith("/"), "logo path must be relative without traversal");
check(typeof plugin.skills === "string" && !plugin.skills.includes("..") && !plugin.skills.startsWith("/"), "skills path must be relative without traversal");
check(plugin.mcpServers === "./mcp.json" || plugin.mcpServers == null, "mcpServers path must be ./mcp.json or omitted for default discovery");
for (const pathField of [plugin.logo, plugin.skills, plugin.mcpServers].filter(Boolean)) {
  check(!String(pathField).includes("..") && !String(pathField).startsWith("/"), `manifest path must be relative: ${pathField}`);
}

const requiredVars = [
  "SIGNALEDI_MCP_PROFILE",
  "SIGNALEDI_API_KEY",
  "SIGNALEDI_BASE_URL",
  "SIGNALEDI_MCP_ALLOW_CUSTOM_BASE_URL",
  "SIGNALEDI_MCP_ALLOW_PRODUCTION",
];
check(plugin.variables?.type === "object", "variables must be a JSON Schema object");
for (const name of requiredVars) {
  check(plugin.variables?.properties?.[name], `variables missing ${name}`);
}

const server = mcp.mcpServers?.signaledi;
check(server?.command === "npx", "mcp.json must launch via npx");
check(
  Array.isArray(server?.args) && server.args[0] === "-y" && server.args[1] === `@signaledi/mcp-server@${pkg.version}`,
  `mcp.json must pin @signaledi/mcp-server@${pkg.version}`,
);
for (const name of requiredVars) {
  check(server?.env?.[name] === `\${${name}}`, `mcp.json must use placeholder for ${name}`);
}

const skill = readText(skillPath);
check(/^---\nname:\s*signaledi-mcp-profiles\n/m.test(skill), "skill frontmatter name mismatch");
check(/^description:\s*\S+/m.test(skill), "skill frontmatter description required");

const blob = `${JSON.stringify(plugin)}\n${JSON.stringify(mcp)}\n${skill}`;
check(!/sk_live|sk_test|Bearer [A-Za-z0-9._-]{8,}/i.test(blob), "plugin packaging must not embed secrets");
check(!/"SIGNALEDI_API_KEY"\s*:\s*"[^$"][^"]+"/i.test(JSON.stringify(mcp)), "mcp.json must not hardcode API keys");

const readme = readText("README.md");
check(readme.includes("## Cursor Marketplace"), "README must document Cursor Marketplace");
check(readme.includes("cursor.com/marketplace/publish"), "README must link marketplace publish");
check(readme.includes("marketplace-publisher-terms"), "README must link publisher terms");

if (failures.length) {
  console.error("Cursor plugin packaging checks failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Cursor plugin packaging ok for ${plugin.name}@${plugin.version} (npx @signaledi/mcp-server@${pkg.version})`);
