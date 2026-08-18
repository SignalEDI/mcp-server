/**
 * Small JSON Schema validator for MCP tool inputs.
 *
 * The MCP SDK publishes schemas to clients, but publishing a schema does not
 * enforce it. This validator intentionally supports only the keywords used by
 * this package so every tool call is checked again at the trust boundary.
 */

export class ToolInputError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "ToolInputError";
    this.code = "INVALID_TOOL_ARGUMENTS";
    this.status = 400;
    this.details = details;
  }
}

export function validateToolArguments(schema, value) {
  const errors = [];
  visit(schema, value, "$", errors);
  if (errors.length > 0) {
    throw new ToolInputError(`Invalid tool arguments: ${errors.join("; ")}`, errors);
  }
}

function visit(schema, value, path, errors) {
  if (!schema || typeof schema !== "object") return;

  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    errors.push(`${path} must be one of ${schema.enum.map((item) => JSON.stringify(item)).join(", ")}`);
    return;
  }
  if (Object.prototype.hasOwnProperty.call(schema, "const") && !Object.is(schema.const, value)) {
    errors.push(`${path} must equal ${JSON.stringify(schema.const)}`);
    return;
  }

  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter((candidate) => {
      const candidateErrors = [];
      visit(candidate, value, path, candidateErrors);
      return candidateErrors.length === 0;
    }).length;
    if (matches !== 1) errors.push(`${path} must match exactly one allowed shape`);
  }

  if (Array.isArray(schema.anyOf)) {
    const matches = schema.anyOf.some((candidate) => {
      const candidateErrors = [];
      visit(candidate, value, path, candidateErrors);
      return candidateErrors.length === 0;
    });
    if (!matches) errors.push(`${path} must match at least one allowed shape`);
  }

  if (schema.not && typeof schema.not === "object") {
    const candidateErrors = [];
    visit(schema.not, value, path, candidateErrors);
    if (candidateErrors.length === 0) errors.push(`${path} matches a disallowed shape`);
  }

  switch (schema.type) {
    case "object":
      validateObject(schema, value, path, errors);
      break;
    case "array":
      validateArray(schema, value, path, errors);
      break;
    case "string":
      validateString(schema, value, path, errors);
      break;
    case "integer":
      if (!Number.isInteger(value)) errors.push(`${path} must be an integer`);
      else validateNumberBounds(schema, value, path, errors);
      break;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) errors.push(`${path} must be a finite number`);
      else validateNumberBounds(schema, value, path, errors);
      break;
    case "boolean":
      if (typeof value !== "boolean") errors.push(`${path} must be a boolean`);
      break;
    case undefined:
      // JSON Schema permits object applicators without an explicit `type`.
      // Conditional oneOf/anyOf/not branches in the published MCP schemas use
      // this form, so they must be enforced at invocation time too.
      if (
        schema.properties
        || schema.required
        || schema.additionalProperties !== undefined
        || schema.minProperties !== undefined
        || schema.maxProperties !== undefined
      ) {
        validateObject(schema, value, path, errors);
      }
      break;
    default:
      errors.push(`${path} uses unsupported schema type ${JSON.stringify(schema.type)}`);
  }
}

function validateObject(schema, value, path, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  const properties = schema.properties || {};
  if (Number.isInteger(schema.minProperties) && Object.keys(value).length < schema.minProperties) {
    errors.push(`${path} must contain at least ${schema.minProperties} propert${schema.minProperties === 1 ? "y" : "ies"}`);
  }
  if (Number.isInteger(schema.maxProperties) && Object.keys(value).length > schema.maxProperties) {
    errors.push(`${path} must contain at most ${schema.maxProperties} properties`);
  }
  for (const key of schema.required || []) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`${path}.${key} is required`);
  }
  for (const [key, child] of Object.entries(value)) {
    if (Object.prototype.hasOwnProperty.call(properties, key)) {
      visit(properties[key], child, `${path}.${key}`, errors);
    } else if (schema.additionalProperties === false) {
      errors.push(`${path}.${key} is not allowed`);
    } else if (isPlainObject(schema.additionalProperties)) {
      visit(schema.additionalProperties, child, `${path}.${key}`, errors);
    }
  }
}

function validateArray(schema, value, path, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${path} must be an array`);
    return;
  }
  if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
    errors.push(`${path} must contain at least ${schema.minItems} item(s)`);
  }
  if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) {
    errors.push(`${path} must contain at most ${schema.maxItems} item(s)`);
  }
  if (schema.uniqueItems === true) {
    const keys = value.map(stableKey);
    if (new Set(keys).size !== keys.length) errors.push(`${path} must contain unique items`);
  }
  if (schema.items) value.forEach((item, index) => visit(schema.items, item, `${path}[${index}]`, errors));
}

function validateString(schema, value, path, errors) {
  if (typeof value !== "string") {
    errors.push(`${path} must be a string`);
    return;
  }
  if (Number.isInteger(schema.minLength) && value.length < schema.minLength) {
    errors.push(`${path} must contain at least ${schema.minLength} character(s)`);
  }
  if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength) {
    errors.push(`${path} must contain at most ${schema.maxLength} character(s)`);
  }
  if (typeof schema.pattern === "string" && !(new RegExp(schema.pattern).test(value))) {
    errors.push(`${path} has an invalid format`);
  }
  if (schema.format === "date" && !isRealIsoCalendarDate(value)) {
    errors.push(`${path} must be a real ISO calendar date (YYYY-MM-DD)`);
  }
}

function validateNumberBounds(schema, value, path, errors) {
  if (typeof schema.minimum === "number" && value < schema.minimum) errors.push(`${path} must be at least ${schema.minimum}`);
  if (typeof schema.maximum === "number" && value > schema.maximum) errors.push(`${path} must be at most ${schema.maximum}`);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableKey(value) {
  if (value && typeof value === "object") {
    if (Array.isArray(value)) return `[${value.map(stableKey).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableKey(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isRealIsoCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}
