// Strict public connection-control-plane contracts.
//
// The REST API already returns a minimized workspace. MCP performs a second
// allowlist projection so an upstream regression cannot expose stored secrets,
// credential references, certificates, transport configuration, or tokens.

export const CONNECTION_LIFECYCLES = Object.freeze([
  "DRAFT",
  "SANDBOX_CONFIGURED",
  "CONNECTIVITY_VERIFIED",
  "TESTING",
  "CERTIFICATION_READY",
  "AWAITING_SIGNOFF",
  "GO_LIVE_APPROVED",
  "PRODUCTION",
  "SUSPENDED",
  "ROLLED_BACK",
  "RETIRED",
]);

export const CONNECTION_ENVIRONMENTS = Object.freeze(["SANDBOX", "PRODUCTION"]);
export const CONNECTION_TRANSPORTS = Object.freeze(["AS2", "SFTP"]);
export const CONNECTION_READ_TRANSPORTS = Object.freeze(["AS2", "SFTP", "API"]);
export const CONNECTION_DIRECTIONS = Object.freeze(["INBOUND", "OUTBOUND", "BIDIRECTIONAL"]);

const STRING_OR_NULL = { anyOf: [{ type: "string" }, { type: "null" }] };
const OBJECT_OR_NULL = (schema) => ({ anyOf: [schema, { type: "null" }] });

export const CONNECTION_ENVIRONMENT_SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    kind: { type: "string", enum: [...CONNECTION_ENVIRONMENTS] },
    status: { type: "string", enum: ["DRAFT", "CONFIGURED", "VERIFIED", "ACTIVE", "INACTIVE", "RETIRED"] },
    envelopeConfigured: { type: "boolean" },
    gatewayId: STRING_OR_NULL,
    credentialConfigured: { type: "boolean" },
    certificatesConfigured: { type: "boolean" },
    certificateExpiresAt: STRING_OR_NULL,
    requirementVersion: STRING_OR_NULL,
    evidenceId: STRING_OR_NULL,
    verifiedAt: STRING_OR_NULL,
    configFingerprint: STRING_OR_NULL,
  },
  required: [
    "id", "kind", "status", "envelopeConfigured", "gatewayId",
    "credentialConfigured", "certificatesConfigured", "certificateExpiresAt",
    "requirementVersion", "evidenceId", "verifiedAt", "configFingerprint",
  ],
  additionalProperties: false,
};

const TRADING_PARTNER_SUMMARY_SCHEMA = {
  type: "object",
  properties: { id: { type: "string" }, name: { type: "string" } },
  required: ["id", "name"],
  additionalProperties: false,
};

const LIST_ACTIVE_PRODUCTION_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    version: { type: "integer" },
    disposition: { type: "string", enum: ["ACTIVE", "SUPERSEDED", "REVOKED"] },
    promotedAt: { type: "string" },
  },
  required: ["id", "version", "disposition", "promotedAt"],
  additionalProperties: false,
};

export const CONNECTION_SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    displayName: { type: "string" },
    lifecycle: { type: "string", enum: [...CONNECTION_LIFECYCLES] },
    activeEnvironment: { type: "string", enum: [...CONNECTION_ENVIRONMENTS] },
    transportMethod: { type: "string", enum: [...CONNECTION_READ_TRANSPORTS] },
    direction: { type: "string", enum: [...CONNECTION_DIRECTIONS] },
    onboardingProjectId: STRING_OR_NULL,
    tradingPartner: TRADING_PARTNER_SUMMARY_SCHEMA,
    environments: { type: "array", items: CONNECTION_ENVIRONMENT_SUMMARY_SCHEMA },
    activeProduction: OBJECT_OR_NULL(LIST_ACTIVE_PRODUCTION_SCHEMA),
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
  required: [
    "id", "displayName", "lifecycle", "activeEnvironment", "transportMethod",
    "direction", "onboardingProjectId", "tradingPartner", "environments",
    "activeProduction", "createdAt", "updatedAt",
  ],
  additionalProperties: false,
};

const WORKSPACE_CONNECTION_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    displayName: { type: "string" },
    lifecycle: { type: "string", enum: [...CONNECTION_LIFECYCLES] },
    activeEnvironment: { type: "string", enum: [...CONNECTION_ENVIRONMENTS] },
    onboardingProjectId: STRING_OR_NULL,
    transportMethod: { type: "string", enum: [...CONNECTION_READ_TRANSPORTS] },
    direction: { type: "string", enum: [...CONNECTION_DIRECTIONS] },
    tradingPartner: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        certification: {
          type: "object",
          properties: { status: { type: "string" }, certifiedAt: STRING_OR_NULL },
          required: ["status", "certifiedAt"],
          additionalProperties: false,
        },
      },
      required: ["id", "name", "certification"],
      additionalProperties: false,
    },
  },
  required: [
    "id", "displayName", "lifecycle", "activeEnvironment", "onboardingProjectId",
    "transportMethod", "direction", "tradingPartner",
  ],
  additionalProperties: false,
};

const AVAILABLE_GATEWAY_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    gatewayType: { type: "string", enum: [...CONNECTION_TRANSPORTS] },
    active: { type: "boolean" },
    lastConnectedAt: STRING_OR_NULL,
  },
  required: ["id", "name", "gatewayType", "active", "lastConnectedAt"],
  additionalProperties: false,
};

const APPROVAL_SCHEMA = {
  type: "object",
  properties: {
    party: { type: "string", enum: ["CUSTOMER", "TRADING_PARTNER", "SIGNALEDI"] },
    decision: { type: "string", enum: ["PENDING", "APPROVED", "REJECTED", "REVOKED", "EXPIRED"] },
    evidenceId: STRING_OR_NULL,
    decidedAt: STRING_OR_NULL,
    expiresAt: STRING_OR_NULL,
    validForCandidate: { type: "boolean" },
  },
  required: ["party", "decision", "evidenceId", "decidedAt", "expiresAt", "validForCandidate"],
  additionalProperties: false,
};

const MISSING_TEST_SCHEMA = {
  type: "object",
  properties: {
    stage: { type: "string", enum: ["SIGNAL_SANDBOX", "PARTNER_VALIDATION"] },
    scenario: {
      type: "object",
      properties: {
        transactionSet: { type: "string" },
        direction: { type: "string", enum: ["inbound", "outbound"] },
        specCondition: { type: "string", enum: ["valid", "invalid", "incomplete"] },
        expectedDisposition: { type: "string", enum: ["accept", "reject", "manual_review"] },
      },
      required: ["transactionSet", "direction", "specCondition", "expectedDisposition"],
      additionalProperties: false,
    },
  },
  required: ["stage", "scenario"],
  additionalProperties: false,
};

const TEST_COVERAGE_SCHEMA = {
  type: "object",
  properties: {
    required: { type: "integer", minimum: 0 },
    passed: { type: "integer", minimum: 0 },
    complete: { type: "boolean" },
    missing: { type: "array", items: MISSING_TEST_SCHEMA },
  },
  required: ["required", "passed", "complete", "missing"],
  additionalProperties: false,
};

const ACTIVE_PRODUCTION_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    version: { type: "integer" },
    promotedAt: { type: "string" },
    configFingerprint: { type: "string" },
    gatewayId: STRING_OR_NULL,
    candidateChangesStaged: { type: "boolean" },
  },
  required: [
    "id", "version", "promotedAt", "configFingerprint", "gatewayId",
    "candidateChangesStaged",
  ],
  additionalProperties: false,
};

const READINESS_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["READY", "BLOCKED", "REVIEW"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    blockers: {
      type: "array",
      items: {
        type: "object",
        properties: { code: { type: "string" }, message: { type: "string" }, owner: { type: "string" } },
        required: ["code", "message", "owner"],
        additionalProperties: false,
      },
    },
    nextAction: OBJECT_OR_NULL({
      type: "object",
      properties: { label: { type: "string" }, owner: { type: "string" } },
      required: ["label", "owner"],
      additionalProperties: false,
    }),
  },
  required: ["verdict", "confidence", "blockers", "nextAction"],
  additionalProperties: false,
};

const CUSTOMER_DATA_FLOW_SCHEMA = {
  type: "object",
  properties: {
    progress: { type: "integer", minimum: 0, maximum: 100 },
    ready: { type: "boolean" },
    blockers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string" },
          direction: { type: "string", enum: ["CUSTOMER_TO_PARTNER", "PARTNER_TO_CUSTOMER"] },
          message: { type: "string" },
        },
        required: ["code", "direction", "message"],
        additionalProperties: false,
      },
    },
  },
  required: ["progress", "ready", "blockers"],
  additionalProperties: false,
};

export const CONNECTION_WORKSPACE_SCHEMA = {
  type: "object",
  properties: {
    connection: WORKSPACE_CONNECTION_SCHEMA,
    environments: { type: "array", items: CONNECTION_ENVIRONMENT_SUMMARY_SCHEMA },
    availableGateways: { type: "array", items: AVAILABLE_GATEWAY_SCHEMA },
    approvals: { type: "array", items: APPROVAL_SCHEMA },
    tests: TEST_COVERAGE_SCHEMA,
    activeProduction: OBJECT_OR_NULL(ACTIVE_PRODUCTION_SCHEMA),
    readiness: READINESS_SCHEMA,
    customerDataFlow: OBJECT_OR_NULL(CUSTOMER_DATA_FLOW_SCHEMA),
    nextActions: { type: "array", items: { type: "string" } },
  },
  required: [
    "connection", "environments", "availableGateways", "approvals", "tests",
    "activeProduction", "readiness", "customerDataFlow", "nextActions",
  ],
  additionalProperties: false,
};

export const CONNECTION_LIST_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    ok: { type: "boolean", const: true },
    connections: { type: "array", items: CONNECTION_SUMMARY_SCHEMA },
    page: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100 },
        hasMore: { type: "boolean" },
        nextCursor: STRING_OR_NULL,
      },
      required: ["limit", "hasMore", "nextCursor"],
      additionalProperties: false,
    },
  },
  required: ["ok", "connections", "page"],
  additionalProperties: false,
};

export const CONNECTION_CREATE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    ok: { type: "boolean", const: true },
    connectionId: { type: "string" },
    lifecycle: { type: "string", const: "DRAFT" },
    environment: { type: "string", const: "SANDBOX" },
    created: { type: "boolean" },
    idempotentReplay: { type: "boolean" },
  },
  required: ["ok", "connectionId", "lifecycle", "environment", "created", "idempotentReplay"],
  additionalProperties: false,
};

export const CONNECTION_GET_OUTPUT_SCHEMA = {
  type: "object",
  properties: { ok: { type: "boolean", const: true }, workspace: CONNECTION_WORKSPACE_SCHEMA },
  required: ["ok", "workspace"],
  additionalProperties: false,
};

export const CONNECTION_MUTATION_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    ok: { type: "boolean", const: true },
    workspace: CONNECTION_WORKSPACE_SCHEMA,
    idempotentReplay: { type: "boolean" },
  },
  required: ["ok", "workspace", "idempotentReplay"],
  additionalProperties: false,
};

const CONNECTION_TEST_SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    connectionId: { type: "string" },
    environment: { type: "string", enum: [...CONNECTION_ENVIRONMENTS] },
    transportMethod: { type: "string", enum: [...CONNECTION_READ_TRANSPORTS] },
    passed: { type: "boolean" },
    configurationValid: { type: "boolean" },
    connectionAttempted: { type: "boolean" },
    latencyMs: { type: ["integer", "null"], minimum: 0 },
    failureCode: {
      type: ["string", "null"],
      enum: ["CONFIGURATION_INVALID", "CONNECTIVITY_FAILED", null],
    },
    evidenceId: STRING_OR_NULL,
    testedAt: { type: "string", format: "date-time" },
  },
  required: [
    "connectionId", "environment", "transportMethod", "passed",
    "configurationValid", "connectionAttempted", "latencyMs",
    "failureCode", "evidenceId", "testedAt",
  ],
  additionalProperties: false,
};

export const CONNECTION_TEST_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    ok: { type: "boolean", const: true },
    test: CONNECTION_TEST_SUMMARY_SCHEMA,
    workspace: CONNECTION_WORKSPACE_SCHEMA,
    idempotentReplay: { type: "boolean" },
  },
  required: ["ok", "test", "workspace", "idempotentReplay"],
  additionalProperties: false,
};

class ConnectionContractError extends Error {
  constructor(path, expected) {
    super(`SignalEDI connection response is invalid at ${path}; expected ${expected}.`);
    this.name = "ConnectionContractError";
    this.code = "INVALID_API_RESPONSE";
    this.status = 502;
  }
}

function object(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConnectionContractError(path, "an object");
  }
  return value;
}

function array(value, path) {
  if (!Array.isArray(value)) throw new ConnectionContractError(path, "an array");
  return value;
}

function string(value, path) {
  if (typeof value !== "string") throw new ConnectionContractError(path, "a string");
  return value;
}

function nullableString(value, path) {
  return value === null ? null : string(value, path);
}

function isoTimestamp(value, path) {
  const selected = string(value, path);
  const parsed = Date.parse(selected);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== selected) {
    throw new ConnectionContractError(path, "an ISO-8601 UTC timestamp");
  }
  return selected;
}

function boolean(value, path) {
  if (typeof value !== "boolean") throw new ConnectionContractError(path, "a boolean");
  return value;
}

function integer(value, path) {
  if (!Number.isInteger(value)) throw new ConnectionContractError(path, "an integer");
  return value;
}

function number(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ConnectionContractError(path, "a finite number");
  }
  return value;
}

function boundedInteger(value, minimum, maximum, path) {
  const selected = integer(value, path);
  if (selected < minimum || selected > maximum) {
    throw new ConnectionContractError(path, `an integer from ${minimum} through ${maximum}`);
  }
  return selected;
}

function boundedNumber(value, minimum, maximum, path) {
  const selected = number(value, path);
  if (selected < minimum || selected > maximum) {
    throw new ConnectionContractError(path, `a number from ${minimum} through ${maximum}`);
  }
  return selected;
}

function enumString(value, allowed, path) {
  const selected = string(value, path);
  if (!allowed.includes(selected)) throw new ConnectionContractError(path, allowed.join(" or "));
  return selected;
}

function trueValue(value, path) {
  if (value !== true) throw new ConnectionContractError(path, "true");
  return true;
}

function projectEnvironment(value, path) {
  const item = object(value, path);
  return {
    id: string(item.id, `${path}.id`),
    kind: enumString(item.kind, CONNECTION_ENVIRONMENTS, `${path}.kind`),
    status: enumString(item.status, ["DRAFT", "CONFIGURED", "VERIFIED", "ACTIVE", "INACTIVE", "RETIRED"], `${path}.status`),
    envelopeConfigured: boolean(item.envelopeConfigured, `${path}.envelopeConfigured`),
    gatewayId: nullableString(item.gatewayId, `${path}.gatewayId`),
    credentialConfigured: boolean(item.credentialConfigured, `${path}.credentialConfigured`),
    certificatesConfigured: boolean(item.certificatesConfigured, `${path}.certificatesConfigured`),
    certificateExpiresAt: nullableString(item.certificateExpiresAt, `${path}.certificateExpiresAt`),
    requirementVersion: nullableString(item.requirementVersion, `${path}.requirementVersion`),
    evidenceId: nullableString(item.evidenceId, `${path}.evidenceId`),
    verifiedAt: nullableString(item.verifiedAt, `${path}.verifiedAt`),
    configFingerprint: nullableString(item.configFingerprint, `${path}.configFingerprint`),
  };
}

function projectListConnection(value, path) {
  const item = object(value, path);
  const partner = object(item.tradingPartner, `${path}.tradingPartner`);
  const active = item.activeProduction === null
    ? null
    : (() => {
        const production = object(item.activeProduction, `${path}.activeProduction`);
        return {
          id: string(production.id, `${path}.activeProduction.id`),
          version: integer(production.version, `${path}.activeProduction.version`),
          disposition: enumString(production.disposition, ["ACTIVE", "SUPERSEDED", "REVOKED"], `${path}.activeProduction.disposition`),
          promotedAt: string(production.promotedAt, `${path}.activeProduction.promotedAt`),
        };
      })();
  return {
    id: string(item.id, `${path}.id`),
    displayName: string(item.displayName, `${path}.displayName`),
    lifecycle: enumString(item.lifecycle, CONNECTION_LIFECYCLES, `${path}.lifecycle`),
    activeEnvironment: enumString(item.activeEnvironment, CONNECTION_ENVIRONMENTS, `${path}.activeEnvironment`),
    transportMethod: enumString(item.transportMethod, CONNECTION_READ_TRANSPORTS, `${path}.transportMethod`),
    direction: enumString(item.direction, CONNECTION_DIRECTIONS, `${path}.direction`),
    onboardingProjectId: nullableString(item.onboardingProjectId, `${path}.onboardingProjectId`),
    tradingPartner: {
      id: string(partner.id, `${path}.tradingPartner.id`),
      name: string(partner.name, `${path}.tradingPartner.name`),
    },
    environments: array(item.environments, `${path}.environments`).map((entry, index) => projectEnvironment(entry, `${path}.environments[${index}]`)),
    activeProduction: active,
    createdAt: string(item.createdAt, `${path}.createdAt`),
    updatedAt: string(item.updatedAt, `${path}.updatedAt`),
  };
}

function projectWorkspaceConnection(value, path) {
  const item = object(value, path);
  const partner = object(item.tradingPartner, `${path}.tradingPartner`);
  const certification = object(partner.certification, `${path}.tradingPartner.certification`);
  return {
    id: string(item.id, `${path}.id`),
    displayName: string(item.displayName, `${path}.displayName`),
    lifecycle: enumString(item.lifecycle, CONNECTION_LIFECYCLES, `${path}.lifecycle`),
    activeEnvironment: enumString(item.activeEnvironment, CONNECTION_ENVIRONMENTS, `${path}.activeEnvironment`),
    onboardingProjectId: nullableString(item.onboardingProjectId, `${path}.onboardingProjectId`),
    transportMethod: enumString(item.transportMethod, CONNECTION_READ_TRANSPORTS, `${path}.transportMethod`),
    direction: enumString(item.direction, CONNECTION_DIRECTIONS, `${path}.direction`),
    tradingPartner: {
      id: string(partner.id, `${path}.tradingPartner.id`),
      name: string(partner.name, `${path}.tradingPartner.name`),
      certification: {
        status: string(certification.status, `${path}.tradingPartner.certification.status`),
        certifiedAt: nullableString(certification.certifiedAt, `${path}.tradingPartner.certification.certifiedAt`),
      },
    },
  };
}

function projectMissingTest(value, path) {
  const item = object(value, path);
  const scenario = object(item.scenario, `${path}.scenario`);
  return {
    stage: enumString(item.stage, ["SIGNAL_SANDBOX", "PARTNER_VALIDATION"], `${path}.stage`),
    scenario: {
      transactionSet: string(scenario.transactionSet, `${path}.scenario.transactionSet`),
      direction: enumString(scenario.direction, ["inbound", "outbound"], `${path}.scenario.direction`),
      specCondition: enumString(scenario.specCondition, ["valid", "invalid", "incomplete"], `${path}.scenario.specCondition`),
      expectedDisposition: enumString(scenario.expectedDisposition, ["accept", "reject", "manual_review"], `${path}.scenario.expectedDisposition`),
    },
  };
}

function projectWorkspace(value, path) {
  const workspace = object(value, path);
  const tests = object(workspace.tests, `${path}.tests`);
  const readiness = object(workspace.readiness, `${path}.readiness`);
  const activeProduction = workspace.activeProduction === null
    ? null
    : (() => {
        const active = object(workspace.activeProduction, `${path}.activeProduction`);
        return {
          id: string(active.id, `${path}.activeProduction.id`),
          version: integer(active.version, `${path}.activeProduction.version`),
          promotedAt: string(active.promotedAt, `${path}.activeProduction.promotedAt`),
          configFingerprint: string(active.configHash, `${path}.activeProduction.configHash`),
          gatewayId: nullableString(active.gatewayId, `${path}.activeProduction.gatewayId`),
          candidateChangesStaged: boolean(active.candidateChangesStaged, `${path}.activeProduction.candidateChangesStaged`),
        };
      })();
  const customerDataFlow = workspace.customerDataFlow === null
    ? null
    : (() => {
        const flow = object(workspace.customerDataFlow, `${path}.customerDataFlow`);
        return {
          progress: boundedInteger(flow.progress, 0, 100, `${path}.customerDataFlow.progress`),
          ready: boolean(flow.ready, `${path}.customerDataFlow.ready`),
          blockers: array(flow.blockers, `${path}.customerDataFlow.blockers`).map((entry, index) => {
            const blocker = object(entry, `${path}.customerDataFlow.blockers[${index}]`);
            return {
              code: string(blocker.code, `${path}.customerDataFlow.blockers[${index}].code`),
              direction: enumString(blocker.direction, ["CUSTOMER_TO_PARTNER", "PARTNER_TO_CUSTOMER"], `${path}.customerDataFlow.blockers[${index}].direction`),
              message: string(blocker.message, `${path}.customerDataFlow.blockers[${index}].message`),
            };
          }),
        };
      })();
  return {
    connection: projectWorkspaceConnection(workspace.connection, `${path}.connection`),
    environments: array(workspace.environments, `${path}.environments`).map((entry, index) => projectEnvironment(entry, `${path}.environments[${index}]`)),
    availableGateways: array(workspace.availableGateways, `${path}.availableGateways`).map((entry, index) => {
      const gateway = object(entry, `${path}.availableGateways[${index}]`);
      return {
        id: string(gateway.id, `${path}.availableGateways[${index}].id`),
        name: string(gateway.name, `${path}.availableGateways[${index}].name`),
        gatewayType: enumString(gateway.gatewayType, CONNECTION_TRANSPORTS, `${path}.availableGateways[${index}].gatewayType`),
        active: boolean(gateway.active, `${path}.availableGateways[${index}].active`),
        lastConnectedAt: nullableString(gateway.lastConnectedAt, `${path}.availableGateways[${index}].lastConnectedAt`),
      };
    }),
    approvals: array(workspace.approvals, `${path}.approvals`).map((entry, index) => {
      const approval = object(entry, `${path}.approvals[${index}]`);
      return {
        party: enumString(approval.party, ["CUSTOMER", "TRADING_PARTNER", "SIGNALEDI"], `${path}.approvals[${index}].party`),
        decision: enumString(approval.decision, ["PENDING", "APPROVED", "REJECTED", "REVOKED", "EXPIRED"], `${path}.approvals[${index}].decision`),
        evidenceId: nullableString(approval.evidenceId, `${path}.approvals[${index}].evidenceId`),
        decidedAt: nullableString(approval.decidedAt, `${path}.approvals[${index}].decidedAt`),
        expiresAt: nullableString(approval.expiresAt, `${path}.approvals[${index}].expiresAt`),
        validForCandidate: boolean(approval.validForCandidate, `${path}.approvals[${index}].validForCandidate`),
      };
    }),
    tests: {
      required: boundedInteger(tests.required, 0, Number.MAX_SAFE_INTEGER, `${path}.tests.required`),
      passed: boundedInteger(tests.passed, 0, Number.MAX_SAFE_INTEGER, `${path}.tests.passed`),
      complete: boolean(tests.complete, `${path}.tests.complete`),
      missing: array(tests.missing, `${path}.tests.missing`).map((entry, index) => projectMissingTest(entry, `${path}.tests.missing[${index}]`)),
    },
    activeProduction,
    readiness: {
      verdict: enumString(readiness.verdict, ["READY", "BLOCKED", "REVIEW"], `${path}.readiness.verdict`),
      confidence: boundedNumber(readiness.confidence, 0, 1, `${path}.readiness.confidence`),
      blockers: array(readiness.blockers, `${path}.readiness.blockers`).map((entry, index) => {
        const blocker = object(entry, `${path}.readiness.blockers[${index}]`);
        return {
          code: string(blocker.code, `${path}.readiness.blockers[${index}].code`),
          message: string(blocker.message, `${path}.readiness.blockers[${index}].message`),
          owner: string(blocker.owner, `${path}.readiness.blockers[${index}].owner`),
        };
      }),
      nextAction: readiness.nextAction === null
        ? null
        : (() => {
            const action = object(readiness.nextAction, `${path}.readiness.nextAction`);
            return {
              label: string(action.label, `${path}.readiness.nextAction.label`),
              owner: string(action.owner, `${path}.readiness.nextAction.owner`),
            };
          })(),
    },
    customerDataFlow,
    nextActions: array(workspace.nextActions, `${path}.nextActions`).map((entry, index) => string(entry, `${path}.nextActions[${index}]`)),
  };
}

/** Project the list API envelope to the MCP-safe public schema. */
export function projectConnectionListResponse(value) {
  const result = object(value, "$response");
  const page = object(result.page, "$response.page");
  return {
    ok: trueValue(result.ok, "$response.ok"),
    connections: array(result.connections, "$response.connections").map((entry, index) => projectListConnection(entry, `$response.connections[${index}]`)),
    page: {
      limit: boundedInteger(page.limit, 1, 100, "$response.page.limit"),
      hasMore: boolean(page.hasMore, "$response.page.hasMore"),
      nextCursor: nullableString(page.nextCursor, "$response.page.nextCursor"),
    },
  };
}

/** Project the sandbox-first create response; any added upstream fields are dropped. */
export function projectConnectionCreateResponse(value) {
  const result = object(value, "$response");
  return {
    ok: trueValue(result.ok, "$response.ok"),
    connectionId: string(result.connectionId, "$response.connectionId"),
    lifecycle: enumString(result.lifecycle, ["DRAFT"], "$response.lifecycle"),
    environment: enumString(result.environment, ["SANDBOX"], "$response.environment"),
    created: boolean(result.created, "$response.created"),
    idempotentReplay: boolean(result.idempotentReplay, "$response.idempotentReplay"),
  };
}

/** Project a get or mutation workspace response to a strict secret-free shape. */
export function projectConnectionWorkspaceResponse(value, { mutation = false } = {}) {
  const result = object(value, "$response");
  const projected = {
    ok: trueValue(result.ok, "$response.ok"),
    workspace: projectWorkspace(result.workspace, "$response.workspace"),
  };
  if (mutation) {
    return {
      ...projected,
      idempotentReplay: boolean(result.idempotentReplay, "$response.idempotentReplay"),
    };
  }
  return projected;
}

/** Project a connectivity-test response and enforce result/evidence invariants. */
export function projectConnectionTestResponse(value, expected) {
  const result = object(value, "$response");
  const test = object(result.test, "$response.test");
  const connectionId = string(test.connectionId, "$response.test.connectionId");
  const environment = enumString(
    test.environment,
    CONNECTION_ENVIRONMENTS,
    "$response.test.environment",
  );
  if (connectionId !== expected.connectionId) {
    throw new ConnectionContractError(
      "$response.test.connectionId",
      `the requested connection id ${expected.connectionId}`,
    );
  }
  if (environment !== expected.environment) {
    throw new ConnectionContractError(
      "$response.test.environment",
      `the active profile environment ${expected.environment}`,
    );
  }

  const passed = boolean(test.passed, "$response.test.passed");
  const configurationValid = boolean(
    test.configurationValid,
    "$response.test.configurationValid",
  );
  const connectionAttempted = boolean(
    test.connectionAttempted,
    "$response.test.connectionAttempted",
  );
  const latencyMs = test.latencyMs === null
    ? null
    : boundedInteger(
        test.latencyMs,
        0,
        Number.MAX_SAFE_INTEGER,
        "$response.test.latencyMs",
      );
  const failureCode = test.failureCode === null
    ? null
    : enumString(
        test.failureCode,
        ["CONFIGURATION_INVALID", "CONNECTIVITY_FAILED"],
        "$response.test.failureCode",
      );
  const evidenceId = nullableString(test.evidenceId, "$response.test.evidenceId");

  if (
    passed
      ? !configurationValid || !connectionAttempted || failureCode !== null || !evidenceId
      : evidenceId !== null ||
        (configurationValid
          ? failureCode !== "CONNECTIVITY_FAILED"
          : failureCode !== "CONFIGURATION_INVALID" || connectionAttempted)
  ) {
    throw new ConnectionContractError(
      "$response.test",
      "a consistent pass/fail, evidence, configuration, and egress result",
    );
  }

  return {
    ok: trueValue(result.ok, "$response.ok"),
    test: {
      connectionId,
      environment,
      transportMethod: enumString(
        test.transportMethod,
        CONNECTION_READ_TRANSPORTS,
        "$response.test.transportMethod",
      ),
      passed,
      configurationValid,
      connectionAttempted,
      latencyMs,
      failureCode,
      evidenceId,
      testedAt: isoTimestamp(test.testedAt, "$response.test.testedAt"),
    },
    workspace: projectWorkspace(result.workspace, "$response.workspace"),
    idempotentReplay: boolean(
      result.idempotentReplay,
      "$response.idempotentReplay",
    ),
  };
}
