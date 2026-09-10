import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const TEMP_PREFIX = "signaledi-mcp-consumer-smoke-";
const packageRoot = dirname(fileURLToPath(import.meta.url));

function run(command, args, { cwd }) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", rejectRun);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolveRun({ stdout, stderr });
        return;
      }
      rejectRun(
        new Error(
          `${command} exited with ${code ?? `signal ${signal}`}\n${stderr || stdout}`.trim(),
        ),
      );
    });
  });
}

function npmInvocation(args) {
  if (process.env.npm_execpath) {
    return { command: process.execPath, args: [process.env.npm_execpath, ...args] };
  }
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", "npm", ...args],
    };
  }
  return { command: "npm", args };
}

function installedBinInvocation(binPath) {
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", binPath],
    };
  }
  return { command: binPath, args: [] };
}

async function runNpm(args, cwd) {
  const invocation = npmInvocation(args);
  return run(invocation.command, invocation.args, { cwd });
}

function assertDirectChild(basePath, candidatePath, expectedPrefix) {
  const rel = relative(basePath, candidatePath);
  assert.ok(rel && !isAbsolute(rel) && !rel.startsWith(".."), "temporary path escaped the OS temp directory");
  assert.equal(dirname(candidatePath), basePath, "temporary root must be a direct child of the OS temp directory");
  assert.ok(basename(candidatePath).startsWith(expectedPrefix), "temporary root has an unexpected prefix");
}

function assertPathInside(basePath, candidatePath) {
  const rel = relative(basePath, candidatePath);
  assert.ok(rel && !isAbsolute(rel) && !rel.startsWith(".."), `${candidatePath} escaped ${basePath}`);
}

const tempBase = await realpath(tmpdir());
let safeTempRoot;

try {
  const createdTempRoot = await mkdtemp(join(tempBase, TEMP_PREFIX));
  const resolvedTempRoot = await realpath(createdTempRoot);
  assertDirectChild(tempBase, resolvedTempRoot, TEMP_PREFIX);
  safeTempRoot = resolvedTempRoot;

  const sourceManifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  const packDir = join(safeTempRoot, "pack");
  const consumerDir = join(safeTempRoot, "consumer");
  await mkdir(packDir);
  await mkdir(consumerDir);

  const packed = await runNpm(["pack", "--json", "--pack-destination", packDir], packageRoot);
  const packResults = JSON.parse(packed.stdout);
  assert.equal(packResults.length, 1, "npm pack must produce exactly one tarball");
  assert.equal(packResults[0].name, sourceManifest.name);
  assert.equal(packResults[0].version, sourceManifest.version);

  const tarballPath = resolve(packDir, packResults[0].filename);
  assertPathInside(resolve(packDir), tarballPath);
  assert.equal(dirname(tarballPath), resolve(packDir), "tarball must be written directly under the guarded pack directory");
  await access(tarballPath, fsConstants.R_OK);

  await writeFile(
    join(consumerDir, "package.json"),
    `${JSON.stringify({ name: "signaledi-mcp-consumer-smoke", version: "0.0.0", private: true }, null, 2)}\n`,
    { flag: "wx" },
  );
  await runNpm(
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      "--workspaces=false",
      "--omit=dev",
      tarballPath,
    ],
    consumerDir,
  );

  const installedRoot = join(consumerDir, "node_modules", "@signaledi", "mcp-server");
  const installedManifest = JSON.parse(await readFile(join(installedRoot, "package.json"), "utf8"));
  assert.equal(installedManifest.name, sourceManifest.name);
  assert.equal(installedManifest.version, sourceManifest.version);

  const binPath = join(
    consumerDir,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "signaledi-mcp.cmd" : "signaledi-mcp",
  );
  await access(binPath, process.platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK);

  const childEnv = Object.fromEntries(
    ["PATH", "Path", "SystemRoot", "COMSPEC", "PATHEXT", "HOME", "TMPDIR", "TEMP", "TMP"]
      .filter((key) => typeof process.env[key] === "string")
      .map((key) => [key, process.env[key]]),
  );
  Object.assign(childEnv, {
    SIGNALEDI_MCP_PROFILE: "docs",
    SIGNALEDI_MCP_TELEMETRY: "0",
  });

  const binInvocation = installedBinInvocation(binPath);
  const transport = new StdioClientTransport({
    command: binInvocation.command,
    args: binInvocation.args,
    env: childEnv,
    stderr: "pipe",
  });
  const client = new Client({ name: "signaledi-installed-consumer-smoke", version: "1.0.0" });

  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === "search_docs"));
    assert.ok(!tools.tools.some((tool) => tool.name === "parse_edi"));
    assert.ok(!tools.tools.some((tool) => tool.name === "send_outbound_document"));
    assert.equal(tools.tools.length, 7);
    const schema = await client.callTool({
      name: "get_document_schema",
      arguments: { transactionSet: "850" },
    });
    assert.equal(schema.isError, undefined);
    assert.equal(schema.structuredContent.transactionSet, "850");
    assert.equal(schema.structuredContent.capability, "baseline");
    assert.match(schema.structuredContent.limitation, /not a trading-partner implementation guide/i);
    const refused = await client.callTool({
      name: "get_document_schema",
      arguments: { transactionSet: "EDIFACT" },
    });
    assert.equal(refused.isError, true);
    assert.equal(refused.structuredContent.error, "OUT_OF_SCOPE_FORMAT");
  } finally {
    await client.close();
  }

  console.log(`consumer install smoke passed: ${sourceManifest.name}@${sourceManifest.version}`);
} finally {
  if (safeTempRoot) {
    assertDirectChild(tempBase, safeTempRoot, TEMP_PREFIX);
    await rm(safeTempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
