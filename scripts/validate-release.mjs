#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const failures = [];
const expected = {
  homepage: "https://signaledi.com/developers/pricing#mcp",
  mcpName: "io.github.SignalEDI/mcp-server",
  packageName: "@signaledi/mcp-server",
  packageRepository: "https://github.com/SignalEDI/mcp-server.git",
  serverRepository: "https://github.com/SignalEDI/mcp-server",
  schema: "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
};

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function read(relativePath) {
  return readFile(join(packageRoot, relativePath), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await read(relativePath));
}

async function exists(relativePath) {
  try {
    await stat(join(packageRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function requireFile(relativePath) {
  check(await exists(relativePath), `missing required file: ${relativePath}`);
}

async function fetchJson(url, label) {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "SignalEDI-MCP-release-validator" },
    });
    check(response.ok, `${label} returned HTTP ${response.status}`);
    return response.ok ? response.json() : undefined;
  } catch (error) {
    failures.push(`${label} request failed: ${error instanceof Error ? error.message : "unknown error"}`);
    return undefined;
  }
}

const [pkg, server, lock, readme, policy, notes, tests, stdio, issueTemplate] = await Promise.all([
  readJson("package.json"),
  readJson("server.json"),
  readJson("package-lock.json"),
  read("README.md"),
  read("MIRROR.md"),
  read("RELEASE_NOTES_0.5.0.md"),
  read("test.mjs"),
  read("stdio-smoke.mjs"),
  read("examples/.github/ISSUE_TEMPLATE/bug_report.yml"),
]);

const stableVersion = /^\d+\.\d+\.\d+$/;
check(pkg.name === expected.packageName, "unexpected npm package name");
check(pkg.mcpName === expected.mcpName, "unexpected MCP ownership name");
check(stableVersion.test(pkg.version), "package version must be stable X.Y.Z semver");
check(server.name === pkg.mcpName, "package mcpName and server name must match");
check(server.version === pkg.version, "package and server versions must match");
check(server.packages?.length === 1, "server manifest must declare exactly one package");
check(server.packages?.[0]?.identifier === pkg.name, "registry package identifier must match npm name");
check(server.packages?.[0]?.version === pkg.version, "registry package version must match npm version");
check(server.packages?.[0]?.registryType === "npm", "registry package type must be npm");
check(server.packages?.[0]?.registryBaseUrl === "https://registry.npmjs.org", "registry base URL must be npm");
check(server.packages?.[0]?.transport?.type === "stdio", "MCP transport must be stdio");

const environmentVariables = server.packages?.[0]?.environmentVariables ?? [];
const environmentNames = new Set(environmentVariables.map((entry) => entry.name));
for (const name of [
  "SIGNALEDI_API_KEY",
  "SIGNALEDI_BASE_URL",
  "SIGNALEDI_MCP_PROFILE",
  "SIGNALEDI_MCP_ALLOW_CUSTOM_BASE_URL",
  "SIGNALEDI_MCP_ALLOW_PRODUCTION",
  "SIGNALEDI_MCP_TELEMETRY",
]) {
  check(environmentNames.has(name), `server manifest is missing ${name}`);
}
const profileVariable = environmentVariables.find((entry) => entry.name === "SIGNALEDI_MCP_PROFILE");
check(/docs.*sandbox.*production/i.test(profileVariable?.description ?? ""), "profile metadata must document all profiles");

check(pkg.homepage === expected.homepage, "package homepage must use the canonical pricing anchor");
check(server.websiteUrl === expected.homepage, "server websiteUrl must use the canonical pricing anchor");
check(pkg.repository?.url === expected.packageRepository, "package repository must be the standalone MCP repo");
check(server.repository?.url === expected.serverRepository, "server repository must be the standalone MCP repo");
check(server.repository?.source === "github", "server repository source must be github");
check(server.$schema === expected.schema, "server manifest must use the approved MCP Registry schema");
check(typeof server.description === "string" && server.description.length > 0 && server.description.length <= 100, "server description must be 1-100 characters");

check(pkg.engines?.node === ">=22", "MCP runtime floor must be Node >=22");
check(lock.name === pkg.name && lock.version === pkg.version, "lockfile root identity must match package");
check(lock.packages?.[""]?.name === pkg.name, "lockfile package name must match package");
check(lock.packages?.[""]?.version === pkg.version, "lockfile package version must match package");
check(lock.packages?.[""]?.engines?.node === pkg.engines?.node, "lockfile Node engine must match package");
check(stableVersion.test(pkg.dependencies?.["@modelcontextprotocol/sdk"] ?? ""), "MCP SDK must be exact stable semver");

const releaseNotes = `RELEASE_NOTES_${pkg.version}.md`;
const packageFiles = new Set(pkg.files ?? []);
const expectedPackageFiles = ["src", "examples", "LICENSE", "MIRROR.md", "README.md", releaseNotes, "server.json", "stdio-smoke.mjs", "test.mjs"];
check(packageFiles.size === expectedPackageFiles.length, "package files allowlist must contain only the approved public package paths");
for (const required of expectedPackageFiles) {
  check(packageFiles.has(required), `package files allowlist is missing ${required}`);
  await requireFile(required);
}
for (const sourceOnly of ["package-lock.json", "consumer-install-smoke.mjs", "scripts/validate-release.mjs", "scripts/resolve-github-main.sh"]) {
  await requireFile(sourceOnly);
}

const binPath = pkg.bin?.["signaledi-mcp"];
check(typeof binPath === "string" && binPath.length > 0, "signaledi-mcp executable is missing");
if (typeof binPath === "string" && binPath.length > 0) {
  const executable = await readFile(join(packageRoot, binPath));
  check(executable[0] === 0x23 && executable[1] === 0x21, "executable must start with #! and no BOM");
  check(
    executable.subarray(0, "#!/usr/bin/env node\n".length).equals(Buffer.from("#!/usr/bin/env node\n")),
    "executable must use an exact LF-terminated Node shebang",
  );
  check(!executable.includes(Buffer.from("\r\n")), "executable must use LF line endings");
}

check(readme.includes("SignalEDI/mcp-server` is the canonical source"), "README must name the standalone canonical source");
check(policy.includes("sole automated publish authority"), "repository policy must assign one publish authority");
check(policy.includes("platform") && policy.includes("validation snapshot"), "repository policy must bound the platform snapshot");
const publicAuthorityCopy = [readme, policy, notes, issueTemplate].join("\n");
check(!/public[- ]mirror|read-only mirror|source of truth is GitLab|platform.{0,80}source of truth/is.test(publicAuthorityCopy), "public package copy must not describe the standalone repository as a downstream mirror");
check(issueTemplate.includes(`placeholder: "${pkg.version}"`), "public issue template must prompt for the candidate package version");
check(readme.toLowerCase().includes("synthetic"), "README must retain the synthetic-data warning");
check(readme.includes("SIGNALEDI_MCP_ALLOW_PRODUCTION"), "README must document production opt-in");
check(notes.includes(pkg.version) && notes.includes("SignalEDI/mcp-server"), "release notes must identify this release authority");

const unitCount = tests.match(/^await test\(/gm)?.length ?? 0;
check(unitCount >= 107, `unit contract must contain at least 107 tests; found ${unitCount}`);
check(tests.includes("remote connection, QuickBooks, and outbound failures withhold sensitive upstream diagnostics"), "unit contract must cover sensitive remote diagnostic redaction");
check(tests.includes("production raw outbound and export requests require exact adapter identity and replay semantics"), "unit contract must cover production adapter and replay admission");
check(tests.includes("parse_edi and validate_edi reject empty or whitespace content before network"), "unit contract must cover empty EDI refusal");
check(tests.includes("parse_edi rejects oversized EDI at the tool schema boundary"), "unit contract must cover tool-layer oversized EDI");
check(tests.includes("remote missing-scope and deprecated-umbrella API errors surface safely"), "unit contract must cover missing-scope and deprecated-umbrella error mapping");
check(tests.includes("local schema and fixture tools refuse out-of-scope EDI flavors and unknown sets"), "unit contract must cover EDIFACT/HL7/unknown-set refusals");
check(tests.includes("get_document_schema never claims partner-IG authority for supported starters"), "unit contract must cover partner-IG non-impersonation");
check(stdio.includes("{ docs: 7, sandbox: 28, production: 21 }"), "stdio smoke must enforce 7/28/21 tools");
check(stdio.includes('"explain_edi_error"'), "stdio smoke must pin the exact docs tool set");
check(pkg.scripts?.["test:stdio"]?.includes("stdio-smoke.mjs sandbox"), "stdio script must run sandbox profile");
check(pkg.scripts?.["test:stdio"]?.includes("stdio-smoke.mjs production"), "stdio script must run production profile");
check(pkg.scripts?.verify?.includes("consumer-install-smoke.mjs"), "verify script must install and run the packed consumer");

const standaloneAuthority = (await exists(".git")) && (await exists(".github/workflows/mcp-publish.yml"));
if (standaloneAuthority) {
  const [attributes, ciWorkflow, publishWorkflow] = await Promise.all([
    read(".gitattributes"),
    read(".github/workflows/ci.yml"),
    read(".github/workflows/mcp-publish.yml"),
  ]);
  check(attributes.includes("*.mjs text eol=lf"), ".gitattributes must force LF for executable JavaScript modules");
  check(attributes.includes("*.yml text eol=lf"), ".gitattributes must force LF for GitHub workflows");
  check(ciWorkflow.includes('node-version: ["22", "24"]'), "CI must test Node 22 and 24");
  check(publishWorkflow.includes('tags:\n      - "mcp-v*"'), "publish workflow must listen only for MCP tags");
  check(!publishWorkflow.includes("workflow_dispatch"), "publish workflow must not support manual dispatch");
  check(!publishWorkflow.includes('- "v*"'), "generic v* tags must never publish");
  check(publishWorkflow.includes("runs-on: ubuntu-latest"), "publishing must use a GitHub-hosted runner");
  check(publishWorkflow.includes("id-token: write"), "publishing must have OIDC permission");
  check(!publishWorkflow.includes("NPM_TOKEN") && !publishWorkflow.includes("secrets."), "trusted publishing must not use repository secrets");
  check(publishWorkflow.includes("github.ref_protected"), "publishing must require a protected tag");
  check(publishWorkflow.includes("Canonical main must be protected before publishing."), "publishing must require protected main");
  check(publishWorkflow.includes("1291556004"), "publishing must bind the immutable repository id");
  check(publishWorkflow.includes("^mcp-v[0-9]+\\.[0-9]+\\.[0-9]+$"), "publishing must accept only stable MCP tags");
  check(publishWorkflow.includes("release tag must point at current GitHub main"), "publishing must require exact current main");
  check(publishWorkflow.includes("GH_TOKEN: ${{ github.token }}"), "publishing must authenticate gh with GITHUB_TOKEN");
  check(
    (publishWorkflow.match(/scripts\/resolve-github-main\.sh/g) ?? []).length >= 2,
    "publishing must resolve main via scripts/resolve-github-main.sh at the gate and again before npm publish",
  );
  check(
    !publishWorkflow.includes("if (!response.ok) process.exit(1)"),
    "publishing must not silently exit on GitHub API failure",
  );
  const resolveMainScript = await read("scripts/resolve-github-main.sh");
  check(resolveMainScript.includes('gh api "repos/${GITHUB_REPOSITORY}/branches/main"'), "main resolver must use gh api");
  check(
    resolveMainScript.includes("GitHub API HTTP") && resolveMainScript.includes("body:"),
    "main resolver must log GitHub API status and body on failure",
  );
  check(!resolveMainScript.includes("process.exit(1)"), "main resolver must not use silent node process.exit");
  check(
    resolveMainScript.includes("printf '%s %s\\n'") || resolveMainScript.includes('printf "%s %s\\n"'),
    "main resolver must emit a trailing newline so bash read does not fail under set -e",
  );
  check(publishWorkflow.includes('PUBLISHER_VERSION="v1.8.1"'), "MCP publisher must be version-pinned");
  check(publishWorkflow.includes("a06c9096dcb9727c13555b6be26c7effa707b01f06a4c561ba7a3635443cf2cc"), "MCP publisher checksum must be pinned");
  check(publishWorkflow.includes('"$RUNNER_TEMP/mcp-publisher" validate server.json'), "official MCP publisher must validate server.json");
  const npmPublish = publishWorkflow.indexOf('npm publish "$LOCAL_TARBALL" --access public');
  const registryValidate = publishWorkflow.indexOf('"$RUNNER_TEMP/mcp-publisher" validate server.json');
  const npmVerify = publishWorkflow.indexOf("Verify exact npm package");
  const registryRecovery = publishWorkflow.indexOf("Inspect immutable MCP Registry version for crash recovery");
  const registryPublish = publishWorkflow.indexOf("Publish to MCP Registry");
  const registryVerify = publishWorkflow.lastIndexOf("--published");
  check(registryValidate >= 0 && registryValidate < npmPublish, "official Registry validation must run before immutable npm publish");
  check(publishWorkflow.includes("LOCAL_TARBALL: ${{ steps.pack.outputs.tarball }}"), "npm publishing must consume the exact packed tarball output");
  check(npmPublish >= 0 && npmVerify > npmPublish && registryRecovery > npmVerify && registryPublish > registryRecovery && registryVerify > registryPublish, "release order must be registry validate, npm publish, npm verify, registry recovery, registry publish, registry verify");
  check(publishWorkflow.includes("/versions/${encodeURIComponent(expected.version)}"), "Registry recovery must query the exact immutable name and version endpoint");
  check(publishWorkflow.includes("response.status === 404"), "Registry recovery may publish only when the exact immutable version is absent");
  check(publishWorkflow.includes("does not exactly match server.json"), "Registry recovery must fail when the immutable manifest differs");
  check((publishWorkflow.match(/if: steps\.registry_state\.outputs\.exists != 'true'/g) ?? []).length === 2, "Registry authentication and publishing must both skip only after an exact recovery match");
  for (const action of ["actions/checkout", "actions/setup-node"]) {
    check(new RegExp(`${action}@[0-9a-f]{40}`).test(`${ciWorkflow}\n${publishWorkflow}`), `${action} must be commit-pinned`);
  }
}

if (process.argv.includes("--published")) {
  const npmMetadata = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/${pkg.version}`, `npm ${pkg.name}@${pkg.version}`);
  if (npmMetadata) {
    check(npmMetadata.name === pkg.name, "published npm package name does not match");
    check(npmMetadata.version === pkg.version, "published npm version does not match");
    check(npmMetadata.mcpName === pkg.mcpName, "published npm ownership marker does not match");
    check(Boolean(npmMetadata.dist?.integrity && npmMetadata.dist?.tarball), "published npm artifact metadata is incomplete");
  }
  const registryEntry = await fetchJson(
    `https://registry.modelcontextprotocol.io/v0.1/servers/${encodeURIComponent(server.name)}/versions/${encodeURIComponent(pkg.version)}`,
    "official MCP Registry exact version",
  );
  if (registryEntry) {
    check(
      registryEntry?.server?.name === server.name && registryEntry.server.version === pkg.version,
      "official MCP Registry exact-version endpoint returned a different name or version",
    );
    const official = registryEntry?._meta?.["io.modelcontextprotocol.registry/official"];
    check(
      official?.status === "active" && official?.isLatest === true,
      "official MCP Registry version is not the active latest record",
    );
    function canonicalize(value) {
      if (Array.isArray(value)) return value.map((item) => canonicalize(item));
      if (value && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value)
            .filter(([childKey, childValue]) => !(
              ["isRequired", "isSecret"].includes(childKey) && childValue === false
            ))
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([childKey, childValue]) => [childKey, canonicalize(childValue)]),
        );
      }
      return value;
    }
    const expectedCanonical = JSON.stringify(canonicalize(server));
    const actualCanonical = JSON.stringify(canonicalize(registryEntry.server));
    check(
      expectedCanonical === actualCanonical,
      "official MCP Registry immutable manifest does not exactly match server.json",
    );
  }
}

if (failures.length > 0) {
  console.error("MCP release contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  const remote = process.argv.includes("--published") ? ", npm and MCP Registry verified" : "";
  console.log(`MCP release contract passed for ${pkg.name}@${pkg.version} (${unitCount} unit contracts${remote}).`);
}
