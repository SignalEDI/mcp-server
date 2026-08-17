// Strict MCP projection for QBO export results. The API is the primary
// authorization boundary; this second allowlist prevents an upstream response
// regression from placing mapped business payloads in model context unless the
// caller explicitly opted in.

const ACTIVATION_PROOF_SCHEMA = {
  oneOf: [
    {
      type: "object",
      properties: {
        status: { type: "string", const: "bound" },
        projectId: { type: "string" },
      },
      required: ["status", "projectId"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        status: { type: "string", const: "unverified" },
        reason: { type: "string" },
        action: {
          type: "object",
          properties: { label: { type: "string" }, href: { type: "string" } },
          required: ["label", "href"],
          additionalProperties: false,
        },
      },
      required: ["status", "reason", "action"],
      additionalProperties: false,
    },
  ],
};

const EXPORT_ITEM_PROPERTIES = {
  qboId: { type: "string" },
  ok: { type: "boolean" },
  documentId: { type: "string" },
  error: { type: "string" },
  activationProof: ACTIVATION_PROOF_SCHEMA,
};

export const QBO_EXPORT_REDACTED_ITEM_SCHEMA = {
  type: "object",
  properties: EXPORT_ITEM_PROPERTIES,
  required: ["ok"],
  additionalProperties: false,
};

export const QBO_EXPORT_PAYLOAD_ITEM_SCHEMA = {
  type: "object",
  properties: {
    ...EXPORT_ITEM_PROPERTIES,
    payload: { type: "object", additionalProperties: true },
  },
  required: ["ok"],
  additionalProperties: false,
};

const BASE_EXPORT_PROPERTIES = {
  ok: { type: "boolean", const: true },
  entity: { type: "string", enum: ["Invoice", "PurchaseOrder"] },
  documentTypeCode: { type: "string", enum: ["810", "850"] },
  environment: { type: "string", enum: ["SANDBOX", "PRODUCTION"] },
  dryRun: { type: "boolean" },
  total: { type: "integer", minimum: 0 },
  exported: { type: "integer", minimum: 0 },
  failed: { type: "integer", minimum: 0 },
};

const BASE_EXPORT_REQUIRED = [
  "ok", "entity", "documentTypeCode", "environment", "dryRun",
  "total", "exported", "failed", "items",
];

export const QBO_STATUS_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    ok: { type: "boolean", const: true },
    connected: { type: "boolean" },
    realmId: { anyOf: [{ type: "string" }, { type: "null" }] },
    environment: { type: "string", enum: ["sandbox", "production"] },
    errorCode: {
      anyOf: [
        { type: "string", enum: ["REAUTH_REQUIRED", "CONNECTION_ERROR"] },
        { type: "null" },
      ],
    },
    connectedAt: { type: "string" },
  },
  required: ["ok", "connected"],
  additionalProperties: false,
};

export const QBO_EXPORT_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    ...BASE_EXPORT_PROPERTIES,
    items: {
      type: "array",
      maxItems: 100,
      items: { anyOf: [QBO_EXPORT_REDACTED_ITEM_SCHEMA, QBO_EXPORT_PAYLOAD_ITEM_SCHEMA] },
    },
    payloadIncluded: { type: "boolean" },
    idempotentReplay: { type: "boolean" },
  },
  required: BASE_EXPORT_REQUIRED,
  additionalProperties: false,
  oneOf: [
    {
      type: "object",
      properties: {
        ...BASE_EXPORT_PROPERTIES,
        dryRun: { type: "boolean", const: true },
        payloadIncluded: { type: "boolean", const: false },
        items: { type: "array", maxItems: 100, items: QBO_EXPORT_REDACTED_ITEM_SCHEMA },
      },
      required: [...BASE_EXPORT_REQUIRED, "payloadIncluded"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        ...BASE_EXPORT_PROPERTIES,
        dryRun: { type: "boolean", const: true },
        payloadIncluded: { type: "boolean", const: true },
        items: { type: "array", maxItems: 100, items: QBO_EXPORT_PAYLOAD_ITEM_SCHEMA },
      },
      required: [...BASE_EXPORT_REQUIRED, "payloadIncluded"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        ...BASE_EXPORT_PROPERTIES,
        dryRun: { type: "boolean", const: false },
        idempotentReplay: { type: "boolean" },
        items: { type: "array", maxItems: 100, items: QBO_EXPORT_REDACTED_ITEM_SCHEMA },
      },
      required: [...BASE_EXPORT_REQUIRED, "idempotentReplay"],
      additionalProperties: false,
    },
  ],
};

class QuickBooksContractError extends Error {
  constructor(path, expected) {
    super(`SignalEDI QuickBooks response is invalid at ${path}; expected ${expected}.`);
    this.name = "QuickBooksContractError";
    this.code = "INVALID_API_RESPONSE";
    this.status = 502;
  }
}

function object(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new QuickBooksContractError(path, "an object");
  }
  return value;
}

function string(value, path) {
  if (typeof value !== "string") throw new QuickBooksContractError(path, "a string");
  return value;
}

function optionalString(value, path) {
  return value === undefined ? undefined : string(value, path);
}

function boolean(value, path) {
  if (typeof value !== "boolean") throw new QuickBooksContractError(path, "a boolean");
  return value;
}

function nonnegativeInteger(value, path) {
  if (!Number.isInteger(value) || value < 0) {
    throw new QuickBooksContractError(path, "a non-negative integer");
  }
  return value;
}

function enumString(value, choices, path) {
  const selected = string(value, path);
  if (!choices.includes(selected)) {
    throw new QuickBooksContractError(path, choices.join(" or "));
  }
  return selected;
}

function nullableEnumString(value, choices, path) {
  return value === null ? null : enumString(value, choices, path);
}

function projectActivationProof(value, path) {
  if (value === undefined) return undefined;
  const proof = object(value, path);
  if (proof.status === "bound") {
    return { status: "bound", projectId: string(proof.projectId, `${path}.projectId`) };
  }
  if (proof.status === "unverified") {
    const action = object(proof.action, `${path}.action`);
    return {
      status: "unverified",
      reason: string(proof.reason, `${path}.reason`),
      action: {
        label: string(action.label, `${path}.action.label`),
        href: string(action.href, `${path}.action.href`),
      },
    };
  }
  throw new QuickBooksContractError(`${path}.status`, "bound or unverified");
}

function projectItem(value, index, includePayload) {
  const path = `$response.items[${index}]`;
  const item = object(value, path);
  const projected = {
    ok: boolean(item.ok, `${path}.ok`),
    ...(item.qboId === undefined ? {} : { qboId: optionalString(item.qboId, `${path}.qboId`) }),
    ...(item.documentId === undefined ? {} : { documentId: optionalString(item.documentId, `${path}.documentId`) }),
    ...(item.error === undefined ? {} : { error: optionalString(item.error, `${path}.error`) }),
    ...(item.activationProof === undefined
      ? {}
      : { activationProof: projectActivationProof(item.activationProof, `${path}.activationProof`) }),
  };
  if (!includePayload || item.payload === undefined) return projected;
  return { ...projected, payload: object(item.payload, `${path}.payload`) };
}

/** Return only the documented QBO export contract and redact payloads by default. */
export function projectQuickBooksExportResponse(
  value,
  { expectedDryRun, includePayload = false } = {},
) {
  const result = object(value, "$response");
  if (result.ok !== true) throw new QuickBooksContractError("$response.ok", "true");
  const dryRun = boolean(result.dryRun, "$response.dryRun");
  if (typeof expectedDryRun === "boolean" && dryRun !== expectedDryRun) {
    throw new QuickBooksContractError("$response.dryRun", String(expectedDryRun));
  }
  if (!dryRun && includePayload) {
    throw new QuickBooksContractError("$response.dryRun", "true when payload inclusion is requested");
  }
  if (!Array.isArray(result.items) || result.items.length > 100) {
    throw new QuickBooksContractError("$response.items", "an array of at most 100 items");
  }
  const entity = enumString(result.entity, ["Invoice", "PurchaseOrder"], "$response.entity");
  const documentTypeCode = enumString(result.documentTypeCode, ["810", "850"], "$response.documentTypeCode");
  if ((entity === "Invoice" && documentTypeCode !== "810") || (entity === "PurchaseOrder" && documentTypeCode !== "850")) {
    throw new QuickBooksContractError("$response.documentTypeCode", `the code mapped from ${entity}`);
  }
  const projected = {
    ok: true,
    entity,
    documentTypeCode,
    environment: enumString(result.environment, ["SANDBOX", "PRODUCTION"], "$response.environment"),
    dryRun,
    total: nonnegativeInteger(result.total, "$response.total"),
    exported: nonnegativeInteger(result.exported, "$response.exported"),
    failed: nonnegativeInteger(result.failed, "$response.failed"),
    items: result.items.map((item, index) => projectItem(item, index, dryRun && includePayload)),
  };
  if (dryRun) {
    const payloadIncluded = boolean(result.payloadIncluded, "$response.payloadIncluded");
    if (payloadIncluded !== includePayload) {
      throw new QuickBooksContractError("$response.payloadIncluded", String(includePayload));
    }
    return { ...projected, payloadIncluded };
  }
  return {
    ...projected,
    idempotentReplay: boolean(result.idempotentReplay, "$response.idempotentReplay"),
  };
}

/** Project status to the safe public enum/metadata fields; never pass tokens through. */
export function projectQuickBooksStatusResponse(value) {
  const result = object(value, "$response");
  if (result.ok !== true) throw new QuickBooksContractError("$response.ok", "true");
  return {
    ok: true,
    connected: boolean(result.connected, "$response.connected"),
    ...(result.realmId === undefined
      ? {}
      : { realmId: result.realmId === null ? null : string(result.realmId, "$response.realmId") }),
    ...(result.environment === undefined
      ? {}
      : { environment: enumString(result.environment, ["sandbox", "production"], "$response.environment") }),
    ...(result.errorCode === undefined
      ? {}
      : { errorCode: nullableEnumString(result.errorCode, ["REAUTH_REQUIRED", "CONNECTION_ERROR"], "$response.errorCode") }),
    ...(result.connectedAt === undefined
      ? {}
      : { connectedAt: string(result.connectedAt, "$response.connectedAt") }),
  };
}
