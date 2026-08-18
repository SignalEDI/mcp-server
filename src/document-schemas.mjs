/** Public, implementation-neutral X12 starter schemas for developer discovery. */

const ENVELOPE = Object.freeze({
  requiredSegments: ["ISA", "GS", "ST", "SE", "GE", "IEA"],
  note: "Control numbers and segment counts must balance across ISA/IEA, GS/GE, and ST/SE.",
});

const DOCUMENT_SCHEMAS = Object.freeze({
  "850": {
    transactionSet: "850",
    name: "Purchase Order",
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

export function listDocumentSchemas() {
  return Object.values(DOCUMENT_SCHEMAS).map((schema) => ({
    transactionSet: schema.transactionSet,
    name: schema.name,
    direction: schema.direction,
  }));
}

export function getDocumentSchema(transactionSet) {
  const code = String(transactionSet || "").trim();
  const schema = DOCUMENT_SCHEMAS[code];
  if (!schema) {
    const error = new Error(`Unsupported transaction set ${JSON.stringify(code)}. Available starter schemas: ${Object.keys(DOCUMENT_SCHEMAS).join(", ")}.`);
    error.code = "DOCUMENT_SCHEMA_NOT_FOUND";
    error.status = 404;
    throw error;
  }
  return {
    ...schema,
    envelope: ENVELOPE,
    authority: "SignalEDI public starter schema",
    limitation: code === "837"
      ? "This starter covers 837 Professional 005010X222A1 only; 837 Institutional and Dental are not supported here. It is not a payer or trading-partner implementation guide. Apply the current partner guide and test requirements before production use."
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
