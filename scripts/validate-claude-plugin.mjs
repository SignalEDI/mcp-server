#!/usr/bin/env node
/**
 * Claude Code / Cowork plugin packaging checks.
 * Validates .claude-plugin/plugin.json + .mcp.json; does not alter MCP runtime.
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
const plugin = readJson(".claude-plugin/plugin.json");
const mcp = readJson(".mcp.json");
const skillPath = "skills/signaledi-mcp-profiles/SKILL.md";

check(existsSync(join(root, skillPath)), `missing ${skillPath}`);
check(plugin.name === "signaledi", "Claude plugin name must be signaledi");
check(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(plugin.name), "Claude plugin name must be kebab-case");
check(plugin.version === pkg.version, "Claude plugin.json version must match package.json");
check(typeof plugin.description === "string" && plugin.description.length > 20, "Claude plugin description required");
check(plugin.author?.name === "SignalEDI", "Claude plugin author must be SignalEDI");
check(plugin.repository === "https://github.com/SignalEDI/mcp-server", "Claude plugin repository must be the public GitHub URL");
check(plugin.license === "MIT", "Claude plugin license must be MIT");
check(plugin.skills === "./skills/", "Claude plugin skills path must be ./skills/");
check(plugin.mcpServers === "./.mcp.json", "Claude plugin mcpServers path must be ./.mcp.json");
for (const pathField of [plugin.skills, plugin.mcpServers].filter(Boolean)) {
  check(!String(pathField).includes("..") && !String(pathField).startsWith("/"), `Claude manifest path must be relative: ${pathField}`);
}

const requiredVars = [
  "SIGNALEDI_MCP_PROFILE",
  "SIGNALEDI_API_KEY",
  "SIGNALEDI_BASE_URL",
  "SIGNALEDI_MCP_ALLOW_CUSTOM_BASE_URL",
  "SIGNALEDI_MCP_ALLOW_PRODUCTION",
];
const server = mcp.mcpServers?.signaledi;
check(server?.command === "npx", ".mcp.json must launch via npx");
check(
  Array.isArray(server?.args) && server.args[0] === "-y" && server.args[1] === `@signaledi/mcp-server@${pkg.version}`,
  `.mcp.json must pin @signaledi/mcp-server@${pkg.version}`,
);
for (const name of requiredVars) {
  check(server?.env?.[name] === `\${${name}}`, `.mcp.json must use host-env placeholder for ${name}`);
}

const skill = readText(skillPath);
check(/^---\nname:\s*signaledi-mcp-profiles\n/m.test(skill), "skill frontmatter name mismatch");
check(/^description:\s*\S+/m.test(skill), "skill frontmatter description required");

const blob = `${JSON.stringify(plugin)}\n${JSON.stringify(mcp)}\n${skill}`;
check(!/sk_live|sk_test|Bearer [A-Za-z0-9._-]{8,}/i.test(blob), "Claude plugin packaging must not embed secrets");
check(!/"SIGNALEDI_API_KEY"\s*:\s*"[^$"][^"]+"/i.test(JSON.stringify(mcp)), ".mcp.json must not hardcode API keys");

const readme = readText("README.md");
check(readme.includes("## Claude Code plugin"), "README must document Claude Code plugin");
check(readme.includes(".claude-plugin/plugin.json"), "README must name the Claude plugin manifest");
check(readme.includes("platform.claude.com/plugins/submit"), "README must link Console plugin submit");
check(readme.includes("claude.ai/admin-settings/directory/submissions/plugins/new"), "README must link claude.ai plugin submit");
check(readme.includes("claude plugin validate"), "README must document claude plugin validate");
check(
  readme.includes("no hosted remote MCP") || readme.includes("does not expose a hosted remote MCP"),
  "README must skip the remote connector directory honestly",
);

if (failures.length) {
  console.error("Claude plugin packaging checks failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Claude plugin packaging ok for ${plugin.name}@${plugin.version} (npx @signaledi/mcp-server@${pkg.version})`);
