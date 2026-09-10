import { LOCAL_DOCUMENT_SET_CODES } from "./document-schemas.mjs";
import { renderTestDocument } from "./templates.mjs";

const OPERATIONS = new Set(["parse", "validate", "send_outbound"]);
const LANGUAGES = new Set(["curl", "node", "python"]);
export const LOCAL_EXAMPLE_DOCUMENT_TYPES = LOCAL_DOCUMENT_SET_CODES;
export const OUTBOUND_EXAMPLE_DOCUMENT_TYPES = Object.freeze(["850", "810", "856"]);

const OUTBOUND_PAYLOADS = Object.freeze({
  "850": { purchaseOrderNumber: "PO-SYNTHETIC-1001", purchaseOrderDate: "20260101", lines: [{ lineNumber: "1", quantity: 1, unitOfMeasure: "EA" }] },
  "810": {
    invoiceNumber: "INV-SYNTHETIC-1001",
    purchaseOrderNumber: "PO-SYNTHETIC-1001",
    invoiceDate: "2026-01-01",
    lines: [{ lineNumber: "1", quantity: 1, unitPrice: 100 }],
  },
  "856": {
    shipmentId: "SHIP-SYNTHETIC-1001",
    purchaseOrderNumber: "PO-SYNTHETIC-1001",
    shipmentDate: "2026-01-01",
    lines: [{ lineNumber: "1", quantity: 1, unitOfMeasure: "EA" }],
  },
});

export function generateIntegrationExample({ language, operation, documentType = "850" }) {
  if (!LANGUAGES.has(language)) throw codedError("UNSUPPORTED_LANGUAGE", `language must be one of ${[...LANGUAGES].join(", ")}.`);
  if (!OPERATIONS.has(operation)) throw codedError("UNSUPPORTED_OPERATION", `operation must be one of ${[...OPERATIONS].join(", ")}.`);
  if (!LOCAL_EXAMPLE_DOCUMENT_TYPES.includes(documentType)) {
    throw codedError("UNSUPPORTED_DOCUMENT_TYPE", `documentType must be one of ${LOCAL_EXAMPLE_DOCUMENT_TYPES.join(", ")}.`);
  }
  if (operation === "send_outbound" && !OUTBOUND_EXAMPLE_DOCUMENT_TYPES.includes(documentType)) {
    throw codedError(
      "UNSUPPORTED_OUTBOUND_DOCUMENT_TYPE",
      `Outbound examples support ${OUTBOUND_EXAMPLE_DOCUMENT_TYPES.join(", ")}; ${documentType} is available only for local parse/validate fixtures.`,
    );
  }

  const method = "POST";
  const path = operation === "send_outbound" ? "/api/v1/documents/outbound" : `/api/v1/${operation}`;
  const mutation = operation === "send_outbound";
  const payload = mutation
    ? {
        partnerId: "partner_test_123",
        documentTypeCode: documentType,
        environment: "SANDBOX",
        payload: OUTBOUND_PAYLOADS[documentType],
      }
    : { content: renderTestDocument(documentType) };

  const generators = { curl: curlExample, node: nodeExample, python: pythonExample };
  return {
    language,
    operation,
    method,
    path,
    code: generators[language]({ method, path, payload, mutation }),
    sourceUri: "signaledi://openapi",
    notes: [
      "Replace synthetic identifiers and fixtures before adapting this example for an approved environment.",
      "Redirects are not followed. Do not log raw EDI or complete parsed payloads; project only non-sensitive status and validation fields.",
      ...(language === "curl" ? ["The cURL example is a Bash snippet that requires jq; pipefail preserves cURL failures through non-sensitive response projection."] : []),
      mutation
        ? "The example explicitly selects SANDBOX. Use a verified non-production API base/key and a durable idempotency key around confirmed application calls."
        : "Parse and validate upload synthetic or approved test data to a non-production API and can record sandbox usage; these examples do not retry. Partner-specific compliance still requires the partner's current guide.",
    ],
  };
}

function curlExample({ method, path, payload, mutation }) {
  const base = "$base_url";
  const preamble = [
    'base_url="${SIGNALEDI_BASE_URL:?Set SIGNALEDI_BASE_URL to a verified non-production API base}"',
    'normalized_base="${base_url%/}"',
    'normalized_base="${normalized_base,,}"',
    'if [[ ! "$normalized_base" =~ ^https://[a-z0-9.-]+(:[0-9]+)?$ ]] && [[ ! "$normalized_base" =~ ^http://(localhost|127\\.0\\.0\\.1)(:[0-9]+)?$ ]]; then',
    '  echo "SIGNALEDI_BASE_URL must be an origin-only HTTPS URL (HTTP is allowed only for localhost)" >&2',
    "  exit 1",
    "fi",
    'base_host="${normalized_base#*://}"',
    'base_host="${base_host%%:*}"',
    'base_host="${base_host%.}"',
    'case "$base_host" in',
    '  signaledi.com|www.signaledi.com|api.signaledi.com)',
    '    echo "Refusing generated example against a production SignalEDI host" >&2',
    "    exit 1",
    "    ;;",
    "esac",
    "set -o pipefail",
  ];
  if (mutation) {
    preamble.push(
      'idempotency_key="${SIGNALEDI_IDEMPOTENCY_KEY:-}"',
      'if [ "${#idempotency_key}" -lt 8 ] || [ "${#idempotency_key}" -gt 128 ] || [[ "$idempotency_key" =~ ^[[:space:]]|[[:space:]]$ ]]; then',
      '  echo "SIGNALEDI_IDEMPOTENCY_KEY must be 8-128 non-whitespace-edge characters" >&2',
      "  exit 1",
      "fi",
    );
  }
  const lines = [
    `curl --fail-with-body --silent --show-error --location --max-redirs 0 -X ${method} "${base}${path}"`,
    '-H "Accept: application/json"',
    '-H "Content-Type: application/json"',
    '-H "Authorization: Bearer $SIGNALEDI_API_KEY"',
  ];
  if (mutation) lines.push('-H "Idempotency-Key: $idempotency_key"');
  lines.push(`--data '${JSON.stringify(payload)}'`);
  lines.push(mutation
    ? "| jq '{documentId, status, environment, idempotentReplay}'"
    : "| jq '{valid: .validation.valid, transactionSet: .validation.transactionSet, errorCount: ((.validation.errors // []) | length)}'");
  return `${preamble.join("\n")}\n${lines.map((line, index) => (index < lines.length - 1 ? `${line} \\` : line)).join("\n  ")}`;
}

function nodeExample({ method, path, payload, mutation }) {
  const idempotencySetup = mutation
    ? '\nconst idempotencyKey = process.env.SIGNALEDI_IDEMPOTENCY_KEY?.trim();\nif (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 128) throw new Error("SIGNALEDI_IDEMPOTENCY_KEY must be 8-128 characters");'
    : "";
  const idempotencyHeader = mutation ? '\n    "Idempotency-Key": idempotencyKey,' : "";
  const baseSetup = `
const baseUrlValue = process.env.SIGNALEDI_BASE_URL;
if (!baseUrlValue) throw new Error("Set SIGNALEDI_BASE_URL to a verified non-production API base");
const baseUrl = new URL(baseUrlValue);
const productionHosts = new Set(["signaledi.com", "www.signaledi.com", "api.signaledi.com"]);
const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
const normalizedHost = baseUrl.hostname.toLowerCase().replace(/\\.$/, "");
if (productionHosts.has(normalizedHost)) throw new Error("Refusing generated example against a production SignalEDI host");
if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash || !["", "/"].includes(baseUrl.pathname)) throw new Error("SIGNALEDI_BASE_URL must be an origin-only URL");
if (baseUrl.protocol !== "https:" && !(baseUrl.protocol === "http:" && localHosts.has(baseUrl.hostname))) throw new Error("SIGNALEDI_BASE_URL must use HTTPS except on localhost");`;
  const output = mutation
    ? 'console.log({ documentId: result.documentId, status: result.status, environment: result.environment, idempotentReplay: result.idempotentReplay });'
    : 'console.log({ valid: result.validation?.valid, transactionSet: result.validation?.transactionSet, errorCount: result.validation?.errors?.length ?? 0 });';
  return `const apiKey = process.env.SIGNALEDI_API_KEY;
if (!apiKey) throw new Error("Set SIGNALEDI_API_KEY");${idempotencySetup}${baseSetup}
const response = await fetch(new URL("${path}", baseUrl), {
  method: "${method}",
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: \`Bearer \${apiKey}\`,${idempotencyHeader}
  },
  body: JSON.stringify(${JSON.stringify(payload, null, 2)}),
  redirect: "error",
});
if (!response.ok) throw new Error(\`SignalEDI request failed: \${response.status}\`);
const result = await response.json();
${output}`;
}

function pythonExample({ method, path, payload, mutation }) {
  const idempotencySetup = mutation
    ? '\nidempotency_key = os.environ.get("SIGNALEDI_IDEMPOTENCY_KEY", "").strip()\nif len(idempotency_key) < 8 or len(idempotency_key) > 128:\n    raise RuntimeError("SIGNALEDI_IDEMPOTENCY_KEY must be 8-128 characters")'
    : "";
  const idempotency = mutation ? '\n    "Idempotency-Key": idempotency_key,' : "";
  const baseSetup = `base_url = os.environ["SIGNALEDI_BASE_URL"]  # verified non-production API base
parsed_base = urlparse(base_url)
production_hosts = {"signaledi.com", "www.signaledi.com", "api.signaledi.com"}
local_hosts = {"localhost", "127.0.0.1", "::1"}
if "%" in parsed_base.netloc or "\\\\" in parsed_base.netloc:
    raise RuntimeError("SIGNALEDI_BASE_URL authority must not contain percent escapes or backslashes")
normalized_host = (parsed_base.hostname or "").lower().rstrip(".")
if not normalized_host or not normalized_host.isascii():
    raise RuntimeError("SIGNALEDI_BASE_URL must use a non-empty ASCII hostname")
if normalized_host in production_hosts:
    raise RuntimeError("Refusing generated example against a production SignalEDI host")
if parsed_base.username or parsed_base.password or parsed_base.query or parsed_base.fragment or parsed_base.path not in ("", "/"):
    raise RuntimeError("SIGNALEDI_BASE_URL must be an origin-only URL")
if parsed_base.scheme != "https" and not (parsed_base.scheme == "http" and parsed_base.hostname in local_hosts):
    raise RuntimeError("SIGNALEDI_BASE_URL must use HTTPS except on localhost")
base_url = base_url.rstrip("/")
prepared_base = urlparse(requests.Request("GET", f"{base_url}/").prepare().url)
prepared_host = (prepared_base.hostname or "").lower().rstrip(".")
if prepared_host in production_hosts:
    raise RuntimeError("Refusing generated example after HTTP-client normalization to a production SignalEDI host")`;
  const output = mutation
    ? 'print({"documentId": result.get("documentId"), "status": result.get("status"), "environment": result.get("environment"), "idempotentReplay": result.get("idempotentReplay")})'
    : 'validation = result.get("validation", {})\nprint({"valid": validation.get("valid"), "transactionSet": validation.get("transactionSet"), "errorCount": len(validation.get("errors", []))})';
  return `import os
from urllib.parse import urlparse

import requests

${baseSetup}${idempotencySetup}
headers = {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Authorization": f"Bearer {os.environ['SIGNALEDI_API_KEY']}",${idempotency}
}
response = requests.${method.toLowerCase()}(
    f"{base_url}${path}",
    headers=headers,
    json=${toPython(payload)},
    timeout=30,
    allow_redirects=False,
)
if 300 <= response.status_code < 400:
    raise RuntimeError(f"SignalEDI refused redirect: {response.status_code}")
response.raise_for_status()
result = response.json()
${output}`;
}

function toPython(value) {
  return JSON.stringify(value, null, 4).replace(/\btrue\b/g, "True").replace(/\bfalse\b/g, "False").replace(/\bnull\b/g, "None");
}

function codedError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 400;
  return error;
}
