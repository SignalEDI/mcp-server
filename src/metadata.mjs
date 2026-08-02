import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function readJson(name) {
  return JSON.parse(readFileSync(join(PACKAGE_ROOT, name), "utf8"));
}

export function loadPackageMetadata() {
  const pkg = readJson("package.json");
  const server = readJson("server.json");
  const registryPackage = server.packages?.find(
    (p) => p.registryType === "npm" && p.identifier === pkg.name,
  );

  return {
    name: "signaledi",
    packageName: pkg.name,
    mcpName: pkg.mcpName,
    version: pkg.version,
    serverVersion: server.version,
    registryPackageVersion: registryPackage?.version,
  };
}

export const PACKAGE_METADATA = loadPackageMetadata();
