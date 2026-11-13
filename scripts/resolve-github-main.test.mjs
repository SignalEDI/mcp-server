import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const resolver = new URL("./resolve-github-main.sh", import.meta.url);

function runResolver({ ghBody = '{"commit":{"sha":"0123456789abcdef0123456789abcdef01234567"},"protected":true}', ghError, env = {} } = {}) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "signaledi-main-resolver-"));
  const gh = join(fixtureRoot, "gh");
  const ghScript = ghError
    ? `#!/usr/bin/env bash\nprintf '%s' "${ghError.replaceAll('"', '\\"')}" >&2\nexit 1\n`
    : `#!/usr/bin/env bash\nprintf '%s' '${ghBody}'\n`;

  writeFileSync(gh, ghScript);
  chmodSync(gh, 0o755);

  try {
    return spawnSync("bash", [resolver.pathname], {
      encoding: "utf8",
      env: {
        ...process.env,
        GH_TOKEN: "test-token",
        GITHUB_REPOSITORY: "SignalEDI/mcp-server",
        PATH: `${fixtureRoot}:${process.env.PATH}`,
        ...env,
      },
    });
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

test("emits the canonical main SHA and protection flag with a trailing newline", () => {
  const result = runResolver();

  assert.equal(result.status, 0);
  assert.equal(result.stdout, "0123456789abcdef0123456789abcdef01234567 true\n");
  assert.equal(result.stderr, "");
});

test("reports the GitHub HTTP status and response body on API failure", () => {
  const result = runResolver({ ghError: "gh: branch missing (HTTP 404)" });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /GitHub API HTTP 404 resolving repos\/SignalEDI\/mcp-server\/branches\/main/);
  assert.match(result.stderr, /body: gh: branch missing \(HTTP 404\)/);
});

test("reports an unknown status when gh fails without an HTTP response", () => {
  const result = runResolver({ ghError: "network unavailable" });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /GitHub API HTTP unknown/);
  assert.match(result.stderr, /body: network unavailable/);
});

test("rejects successful API responses that omit required branch metadata", () => {
  const result = runResolver({ ghBody: '{"commit":{},"protected":null}' });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /returned an unusable payload/);
  assert.match(result.stderr, /body: \{"commit":\{\},"protected":null\}/);
});

test("fails before calling GitHub when required environment is absent", () => {
  const missingToken = runResolver({ env: { GH_TOKEN: "" } });
  const missingRepository = runResolver({ env: { GITHUB_REPOSITORY: "" } });

  assert.equal(missingToken.status, 1);
  assert.match(missingToken.stderr, /GH_TOKEN is required/);
  assert.equal(missingRepository.status, 1);
  assert.match(missingRepository.stderr, /GITHUB_REPOSITORY is required/);
});
