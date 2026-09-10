#!/usr/bin/env node
/**
 * Build Claude Desktop MCPB artifact from the existing stdio MCP package.
 * Does not fork server logic — stages src/ + production node_modules + mcpb/manifest.json.
 */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifestSrc = join(root, "mcpb", "manifest.json");
const iconSrc = join(root, "mcpb", "icon.png");
const outDir = join(root, "dist");
const outFile = join(outDir, `signaledi-mcp-server-${pkg.version}.mcpb`);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: false });
  if (result.status !== 0) {
    fail(`Command failed (${command} ${args.join(" ")}) with exit ${result.status}`);
  }
}

if (!existsSync(manifestSrc)) fail("missing mcpb/manifest.json");
if (!existsSync(iconSrc)) fail("missing mcpb/icon.png — regenerate from assets/logo.svg");
if (!existsSync(join(root, "src", "index.mjs"))) fail("missing src/index.mjs");
if (!existsSync(join(root, "package-lock.json"))) fail("missing package-lock.json");

const manifest = JSON.parse(readFileSync(manifestSrc, "utf8"));
if (manifest.version !== pkg.version) {
  fail(`mcpb/manifest.json version ${manifest.version} must match package.json ${pkg.version}`);
}
if (manifest.author?.name !== "SignalEDI") fail("mcpb author must be SignalEDI");
const brandBlob = JSON.stringify(manifest).toLowerCase();
if (brandBlob.includes("challan" + "116")) fail("branding must use SignalEDI only");

mkdirSync(outDir, { recursive: true });
const staging = mkdtempSync(join(tmpdir(), "signaledi-mcpb-"));

try {
  writeFileSync(join(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  cpSync(iconSrc, join(staging, "icon.png"));
  cpSync(join(root, "package.json"), join(staging, "package.json"));
  cpSync(join(root, "package-lock.json"), join(staging, "package-lock.json"));
  cpSync(join(root, "server.json"), join(staging, "server.json"));
  cpSync(join(root, "src"), join(staging, "src"), { recursive: true });
  cpSync(join(root, "LICENSE"), join(staging, "LICENSE"));
  cpSync(join(root, "README.md"), join(staging, "README.md"));
  if (existsSync(join(root, "assets", "logo.svg"))) {
    mkdirSync(join(staging, "assets"), { recursive: true });
    cpSync(join(root, "assets", "logo.svg"), join(staging, "assets", "logo.svg"));
  }

  writeFileSync(
    join(staging, ".mcpbignore"),
    ["*.mcpb", ".git", ".github", "test.mjs", "stdio-smoke.mjs", "consumer-install-smoke.mjs", "node_modules/.cache"].join("\n") + "\n",
  );

  console.log(`Installing production dependencies for SignalEDI MCPB ${pkg.version}…`);
  run("npm", ["ci", "--omit=dev"], staging);

  if (existsSync(outFile)) rmSync(outFile);

  console.log("Packing MCPB with @anthropic-ai/mcpb…");
  run("npx", ["--yes", "@anthropic-ai/mcpb", "pack", staging, outFile], root);

  if (!existsSync(outFile)) fail(`expected artifact missing: ${outFile}`);
  console.log(`Built ${outFile}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
