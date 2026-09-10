/** Public, implementation-neutral X12 starter schemas for developer discovery. */

const ENVELOPE = Object.freeze({
  requiredSegments: ["ISA", "GS", "ST", "SE", "GE", "IEA"],
  note: "Control numbers and segment counts must balance across ISA/IEA, GS/GE, and ST/SE.",
});

/**
 * Honest local inventory discovered from this package's schemas + synthetic fixtures.
 * The X12 dictionary only adds segment/ack lookup aids and does not invent additional
 * transaction-set starters. No other sets are exposed without a schema + fixture pair.
 */
const DOCUMENT_SCHEMAS = Object.freeze({
  "850": {
    transactionSet: "850",
    name: "Purchase Order",
    capability: "baseline",
    fixture: true,
    direction: "commonly inbound to a supplier",
    requiredSegments: ["BEG", "PO1"],
    commonSegments: ["REF", "PER", "DTM", "N1", "N3", "N4", "PID", "CTT"],
    keyFields: [
      { field: "purchaseOrderNumber", x12: "BEG03", required: true },
      { field: "purchaseOrderDate", x12: "BEG05", required: true },
      { field: "lineNumber", x12: "PO101", required: true },
      { field: "quantity", x12: "PO102", required: true },
      { field: "unitOfMeasure", x12: "PO103", required: true },
      { field: "unitPrice", x12: "PO104", required: false },
      { field: "buyerPartNumber", x12: "PO107 with qualifier BP", required: false },
    ],
  },
  "810": {
    transactionSet: "810",
    name: "Invoice",
    capability: "baseline",
    fixture: true,
    direction: "commonly outbound from a supplier",
    requiredSegments: ["BIG", "IT1", "TDS"],
    commonSegments: ["REF", "N1", "N3", "N4", "ITD", "DTM", "PID", "SAC", "CTT"],
    keyFields: [
      { field: "invoiceDate", x12: "BIG01", required: true },
      { field: "invoiceNumber", x12: "BIG02", required: true },
      { field: "purchaseOrderNumber", x12: "BIG04", required: false },
      { field: "lineNumber", x12: "IT101", required: true },
      { field: "quantityInvoiced", x12: "IT102", required: true },
      { field: "unitPrice", x12: "IT104", required: true },
      { field: "totalInvoiceAmount", x12: "TDS01", required: true },
    ],
  },
  "856": {
    transactionSet: "856",
    name: "Ship Notice / Manifest",
    capability: "baseline",
    fixture: true,
    direction: "commonly outbound from a supplier or warehouse",
    requiredSegments: ["BSN", "HL"],
    commonSegments: ["TD5", "DTM", "N1", "N3", "N4", "PRF", "MAN", "LIN", "SN1", "CTT"],
    keyFields: [
      { field: "shipmentIdentification", x12: "BSN02", required: true },
      { field: "shipmentDate", x12: "BSN03", required: true },
      { field: "hierarchicalId", x12: "HL01", required: true },
      { field: "hierarchicalLevelCode", x12: "HL03", required: true },
      { field: "purchaseOrderNumber", x12: "PRF01", required: false },
      { field: "trackingOrPackageId", x12: "MAN02", required: false },
    ],
  },
  "837": {
    transactionSet: "837",
    name: "Health Care Claim - Professional",
    capability: "partial",
    fixture: true,
    variant: "professional",
    implementationGuide: "005010X222A1",
    direction: "commonly outbound from a provider or clearinghouse",
    requiredSegments: ["BHT", "NM1", "HL", "CLM"],
    commonSegments: ["REF", "PER", "N3", "N4", "DMG", "SBR", "HI", "LX", "SV1", "DTP"],
    keyFields: [
      { field: "submitterTransactionIdentifier", x12: "BHT03", required: true },
      { field: "billingProvider", x12: "NM1 loop 2010AA", required: true },
      { field: "subscriber", x12: "NM1 loop 2010BA", required: true },
      { field: "patientControlNumber", x12: "CLM01", required: true },
      { field: "totalClaimChargeAmount", x12: "CLM02", required: true },
      { field: "diagnosis", x12: "HI", required: true },
    ],
  },
});

/** Local starter inventory that both schema and synthetic-fixture tools may expose. */
export const LOCAL_DOCUMENT_SET_CODES = Object.freeze(["850", "810", "856", "837"]);

export function listDocumentSchemas() {
  return LOCAL_DOCUMENT_SET_CODES.map((code) => {
    const schema = DOCUMENT_SCHEMAS[code];
    return {
      transactionSet: schema.transactionSet,
      name: schema.name,
      capability: schema.capability,
      direction: schema.direction,
      ...(schema.variant ? { variant: schema.variant } : {}),
      ...(schema.implementationGuide ? { implementationGuide: schema.implementationGuide } : {}),
    };
  });
}

export function unsupportedDocumentSetError(transactionSet) {
  const code = String(transactionSet ?? "").trim();
  const upper = code.toUpperCase();
  const available = LOCAL_DOCUMENT_SET_CODES.join(", ");
  const error = new Error("");
  error.status = 404;

  if (!code) {
    error.code = "UNSUPPORTED_TRANSACTION_SET";
    error.message = `transactionSet is required. Supported local X12 starters: ${available}.`;
    return error;
  }
  if (isEdifactLike(upper)) {
    error.code = "OUT_OF_SCOPE_FORMAT";
    error.message = `EDIFACT and other non-X12 formats are out of scope for local schema/fixture tools. Supported local X12 starters: ${available}.`;
    return error;
  }
  if (isHl7Like(upper)) {
    error.code = "OUT_OF_SCOPE_FORMAT";
    error.message = `HL7 is out of scope for local schema/fixture tools. Supported local X12 starters: ${available}.`;
    return error;
  }
  if (/^837[ID]$/i.test(code)) {
    error.code = "UNSUPPORTED_TRANSACTION_SET";
    error.message = `Only 837 Professional (005010X222A1) is available as a partial local starter; 837 Institutional and Dental are not exposed. Supported local X12 starters: ${available}.`;
    return error;
  }
  if (/^\d{3}$/.test(code)) {
    error.code = "UNSUPPORTED_TRANSACTION_SET";
    error.message = `X12 transaction set ${JSON.stringify(code)} is not in the local starter inventory (${available}). No invented schema or fixture is exposed.`;
    return error;
  }
  error.code = "OUT_OF_SCOPE_FORMAT";
  error.message = `${JSON.stringify(code)} is not a supported local X12 starter. Supported local X12 starters: ${available}.`;
  return error;
}

export function getDocumentSchema(transactionSet) {
  const code = String(transactionSet || "").trim();
  const schema = DOCUMENT_SCHEMAS[code];
  if (!schema) {
    throw unsupportedDocumentSetError(code);
  }
  return {
    ...schema,
    envelope: ENVELOPE,
    authority: "SignalEDI public starter schema",
    limitation: schema.capability === "partial"
      ? "This starter covers 837 Professional 005010X222A1 only; 837 Institutional and Dental are not supported here. It is a partial public aid, not a payer or trading-partner implementation guide. Apply the current partner guide and test requirements before production use."
      : "This is a baseline implementation aid, not a trading-partner implementation guide. Apply the partner's current guide and test requirements before production use.",
    sourceUri: `signaledi://documents/${code}/schema`,
  };
}

export function renderDocumentSchemaMarkdown(transactionSet) {
  const schema = getDocumentSchema(transactionSet);
  const required = [...schema.envelope.requiredSegments, ...schema.requiredSegments];
  return [
    `# X12 ${schema.transactionSet} - ${schema.name}`,
    "",
    `Capability: **${schema.capability}** local starter${schema.variant ? ` (${schema.variant})` : ""}.`,
    "",
    `Typical direction: ${schema.direction}.`,
    "",
    `Required baseline segments: ${required.map((segment) => `\`${segment}\``).join(", ")}.`,
    "",
    "## Key fields",
    "",
    ...schema.keyFields.map((item) => `- ${item.field}: ${item.x12}${item.required ? " (required baseline)" : ""}`),
    "",
    `> ${schema.limitation}`,
  ].join("\n");
}

function isEdifactLike(upper) {
  return upper === "EDIFACT"
    || upper === "UN/EDIFACT"
    || ["ORDERS", "INVOIC", "DESADV", "RECADV", "ORDRSP", "PRICAT"].includes(upper)
    || upper.startsWith("EDIFACT");
}

function isHl7Like(upper) {
  return upper === "HL7"
    || upper.startsWith("HL7")
    || ["ADT", "ORU", "ORM", "DFT", "SIU", "MDM"].includes(upper);
}
