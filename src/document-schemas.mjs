/** Public, implementation-neutral X12 starter schemas for developer discovery. */

const ENVELOPE = Object.freeze({
  requiredSegments: ["ISA", "GS", "ST", "SE", "GE", "IEA"],
  note: "Control numbers and segment counts must balance across ISA/IEA, GS/GE, and ST/SE.",
});

/**
 * Local inventory = every X12 set this package can honestly expose with both a
 * public starter schema and a synthetic fixture. Sourced from the outbound
 * allowlist plus healthcare 837 Professional. Capability labels stay honest:
 * baseline = full public starter; partial = intentionally limited variant.
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
  "855": {
    transactionSet: "855",
    name: "Purchase Order Acknowledgment",
    capability: "baseline",
    fixture: true,
    direction: "commonly outbound from a supplier",
    requiredSegments: ["BAK", "PO1"],
    commonSegments: ["REF", "DTM", "N1", "N3", "N4", "ACK", "CTT"],
    keyFields: [
      { field: "acknowledgmentType", x12: "BAK02", required: true },
      { field: "purchaseOrderNumber", x12: "BAK03", required: true },
      { field: "purchaseOrderDate", x12: "BAK04", required: true },
      { field: "lineNumber", x12: "PO101", required: true },
      { field: "lineItemStatus", x12: "ACK01", required: false },
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
  "204": {
    transactionSet: "204",
    name: "Motor Carrier Load Tender",
    capability: "baseline",
    fixture: true,
    direction: "commonly outbound from a shipper or broker to a carrier",
    requiredSegments: ["B2", "B2A"],
    commonSegments: ["L11", "G62", "N1", "N3", "N4", "S5", "OID", "L5", "AT8"],
    keyFields: [
      { field: "scac", x12: "B202", required: true },
      { field: "shipmentIdentification", x12: "B204", required: true },
      { field: "purposeCode", x12: "B2A01", required: true },
      { field: "stopSequence", x12: "S501", required: false },
    ],
  },
  "210": {
    transactionSet: "210",
    name: "Motor Carrier Freight Details and Invoice",
    capability: "baseline",
    fixture: true,
    direction: "commonly outbound from a carrier",
    requiredSegments: ["B3", "N1"],
    commonSegments: ["C3", "G62", "R3", "LX", "L5", "L0", "L1", "L3"],
    keyFields: [
      { field: "invoiceNumber", x12: "B302", required: true },
      { field: "shipmentIdentification", x12: "B303", required: true },
      { field: "invoiceDate", x12: "B306", required: true },
      { field: "netAmountDue", x12: "B307", required: true },
      { field: "scac", x12: "B311", required: true },
    ],
  },
  "211": {
    transactionSet: "211",
    name: "Motor Carrier Bill of Lading",
    capability: "baseline",
    fixture: true,
    direction: "commonly outbound from a shipper or carrier",
    requiredSegments: ["BOL", "N1"],
    commonSegments: ["G62", "L11", "AT5", "LX", "L5", "L0", "L3"],
    keyFields: [
      { field: "scac", x12: "BOL01", required: true },
      { field: "shipmentMethodOfPayment", x12: "BOL02", required: false },
      { field: "bolNumber", x12: "BOL03", required: true },
    ],
  },
  "212": {
    transactionSet: "212",
    name: "Motor Carrier Delivery Trailer Manifest",
    capability: "baseline",
    fixture: true,
    direction: "commonly outbound from a carrier",
    requiredSegments: ["ATA", "AT7"],
    commonSegments: ["B2A", "L11", "N1", "N3", "N4", "LX", "OID"],
    keyFields: [
      { field: "scac", x12: "ATA01", required: true },
      { field: "manifestNumber", x12: "ATA02", required: true },
      { field: "statusCode", x12: "AT701", required: true },
    ],
  },
  "214": {
    transactionSet: "214",
    name: "Transportation Carrier Shipment Status Message",
    capability: "baseline",
    fixture: true,
    direction: "commonly outbound from a carrier",
    requiredSegments: ["B10", "LX", "AT7"],
    commonSegments: ["L11", "MAN", "Q7", "N1", "N3", "N4", "MS1", "MS2"],
    keyFields: [
      { field: "referenceIdentification", x12: "B1001", required: true },
      { field: "scac", x12: "B1002", required: true },
      { field: "statusCode", x12: "AT701", required: true },
      { field: "statusDate", x12: "AT705", required: false },
    ],
  },
  "753": {
    transactionSet: "753",
    name: "Request for Routing Instructions",
    capability: "baseline",
    fixture: true,
    direction: "commonly outbound from a shipper",
    requiredSegments: ["BGN", "N1"],
    commonSegments: ["PER", "Y6", "LX", "L11", "OID", "G62"],
    keyFields: [
      { field: "purposeCode", x12: "BGN01", required: true },
      { field: "referenceIdentification", x12: "BGN02", required: true },
      { field: "transactionDate", x12: "BGN03", required: true },
    ],
  },
  "754": {
    transactionSet: "754",
    name: "Routing Instructions",
    capability: "baseline",
    fixture: true,
    direction: "commonly outbound from a carrier or logistics provider",
    requiredSegments: ["BGN", "N1"],
    commonSegments: ["PER", "LX", "L11", "OID", "G62", "QTY"],
    keyFields: [
      { field: "purposeCode", x12: "BGN01", required: true },
      { field: "referenceIdentification", x12: "BGN02", required: true },
      { field: "transactionDate", x12: "BGN03", required: true },
    ],
  },
  "858": {
    transactionSet: "858",
    name: "Shipment Information",
    capability: "baseline",
    fixture: true,
    direction: "commonly outbound from a shipper or 3PL",
    requiredSegments: ["BX", "N1", "HL"],
    commonSegments: ["N9", "G62", "NTE", "L0", "L5", "MAN"],
    keyFields: [
      { field: "purposeCode", x12: "BX01", required: true },
      { field: "transportationMethod", x12: "BX02", required: true },
      { field: "shipmentMethodOfPayment", x12: "BX03", required: true },
      { field: "hierarchicalId", x12: "HL01", required: true },
    ],
  },
  "940": {
    transactionSet: "940",
    name: "Warehouse Shipping Order",
    capability: "baseline",
    fixture: true,
    direction: "commonly outbound from a shipper to a warehouse",
    requiredSegments: ["W05", "N1", "W66"],
    commonSegments: ["N9", "G62", "NTE", "LX", "W01", "G69", "NTE"],
    keyFields: [
      { field: "orderStatusCode", x12: "W0501", required: true },
      { field: "depositOrderNumber", x12: "W0502", required: true },
      { field: "warehouseId", x12: "N104 with qualifier WH", required: false },
    ],
  },
  "943": {
    transactionSet: "943",
    name: "Warehouse Stock Transfer Shipment Advice",
    capability: "baseline",
    fixture: true,
    direction: "commonly outbound from a shipping warehouse",
    requiredSegments: ["W06", "N1", "W27"],
    commonSegments: ["G62", "N9", "W04", "G69", "W20"],
    keyFields: [
      { field: "reportingCode", x12: "W0601", required: true },
      { field: "depositorOrderNumber", x12: "W0602", required: true },
      { field: "shipmentDate", x12: "W0603", required: false },
    ],
  },
  "944": {
    transactionSet: "944",
    name: "Warehouse Stock Transfer Receipt Advice",
    capability: "baseline",
    fixture: true,
    direction: "commonly outbound from a receiving warehouse",
    requiredSegments: ["W17", "N1", "W07"],
    commonSegments: ["G62", "N9", "W14", "G69", "W20"],
    keyFields: [
      { field: "reportingCode", x12: "W1701", required: true },
      { field: "depositorOrderNumber", x12: "W1702", required: true },
      { field: "receiptDate", x12: "W1703", required: false },
    ],
  },
  "945": {
    transactionSet: "945",
    name: "Warehouse Shipping Advice",
    capability: "baseline",
    fixture: true,
    direction: "commonly outbound from a warehouse",
    requiredSegments: ["W06", "N1", "LX", "W12"],
    commonSegments: ["G62", "N9", "W03", "W27", "G69", "NTE"],
    keyFields: [
      { field: "reportingCode", x12: "W0601", required: true },
      { field: "depositorOrderNumber", x12: "W0602", required: true },
      { field: "quantityShipped", x12: "W1202", required: false },
    ],
  },
  "947": {
    transactionSet: "947",
    name: "Warehouse Inventory Adjustment Advice",
    capability: "baseline",
    fixture: true,
    direction: "commonly outbound from a warehouse",
    requiredSegments: ["W15", "N1", "W19"],
    commonSegments: ["G62", "N9", "W20", "G69", "NTE"],
    keyFields: [
      { field: "date", x12: "W1501", required: true },
      { field: "adjustmentNumber", x12: "W1502", required: false },
      { field: "adjustmentReason", x12: "W1901", required: false },
    ],
  },
  "990": {
    transactionSet: "990",
    name: "Response to a Load Tender",
    capability: "baseline",
    fixture: true,
    direction: "commonly outbound from a carrier",
    requiredSegments: ["B1", "N9"],
    commonSegments: ["G62", "N7", "L11", "K1"],
    keyFields: [
      { field: "scac", x12: "B101", required: true },
      { field: "shipmentIdentification", x12: "B102", required: true },
      { field: "reservationActionCode", x12: "B103", required: true },
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

/**
 * Stable discovery order: retail/order, transport, warehouse, load-tender response, healthcare.
 * Intentionally not Object.keys() — numeric-looking keys would sort lexicographically wrong.
 */
export const LOCAL_DOCUMENT_SET_CODES = Object.freeze([
  "850", "810", "855", "856",
  "204", "210", "211", "212", "214", "753", "754", "858",
  "940", "943", "944", "945", "947", "990",
  "837",
]);

/** Local sets that mirror the MCP outbound send allowlist (excludes healthcare 837). */
export const LOCAL_OUTBOUND_DOCUMENT_TYPES = Object.freeze(
  LOCAL_DOCUMENT_SET_CODES.filter((code) => code !== "837"),
);

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
    limitation: schema.capability === "partial" && code === "837"
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
