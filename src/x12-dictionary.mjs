/** Static X12 reference maps for explain_edi_error and lookup_x12. */

export const SEGMENTS = {
  ISA: { name: "Interchange Control Header", purpose: "Opens the interchange envelope." },
  GS: { name: "Functional Group Header", purpose: "Starts a functional group of related transaction sets." },
  ST: { name: "Transaction Set Header", purpose: "Begins a single transaction set (e.g. 850, 810)." },
  SE: { name: "Transaction Set Trailer", purpose: "Closes the transaction set with segment count and control number." },
  GE: { name: "Functional Group Trailer", purpose: "Closes the functional group." },
  IEA: { name: "Interchange Control Trailer", purpose: "Closes the interchange envelope." },
  BEG: { name: "Beginning Segment for Purchase Order", purpose: "Identifies PO purpose, type, and number." },
  BAK: { name: "Beginning Segment for Purchase Order Acknowledgment", purpose: "Identifies PO acknowledgment type and related PO." },
  PO1: { name: "Baseline Item Data", purpose: "Line item quantity, UOM, and price on a purchase order." },
  ACK: { name: "Line Item Acknowledgment", purpose: "Line-level accept/reject/status on an 855." },
  BIG: { name: "Beginning Segment for Invoice", purpose: "Invoice date, number, and related PO reference." },
  BSN: { name: "Beginning Segment for Ship Notice", purpose: "ASN shipment identification." },
  B2: { name: "Beginning Segment for Shipment Information Transaction", purpose: "Load tender carrier and shipment identity on a 204." },
  B2A: { name: "Set Purpose", purpose: "Purpose and application type for transportation transactions." },
  B3: { name: "Beginning Segment for Carrier's Invoice", purpose: "Freight invoice identity on a 210." },
  BOL: { name: "Beginning Segment for the Motor Carrier Bill of Lading", purpose: "Bill of lading identity on a 211." },
  ATA: { name: "Beginning Segment for Motor Carrier Delivery Trailer Manifest", purpose: "Trailer manifest identity on a 212." },
  AT7: { name: "Shipment Status Details", purpose: "Transportation status code and timing." },
  B10: { name: "Beginning Segment for Transportation Carrier Shipment Status Message", purpose: "Status message identity on a 214." },
  BGN: { name: "Beginning Segment", purpose: "Purpose and reference for routing-instruction sets." },
  BX: { name: "General Shipment Information", purpose: "Shipment purpose, method, and identity on an 858." },
  B1: { name: "Beginning Segment for Booking or Pick-up/Delivery", purpose: "Load-tender response identity on a 990." },
  W05: { name: "Shipping Order Identification", purpose: "Warehouse shipping order identity on a 940." },
  W06: { name: "Warehouse Shipment Identification", purpose: "Warehouse shipment/advice identity on 943/945." },
  W07: { name: "Item Detail For Stock Receipt", purpose: "Received item detail on a 944." },
  W12: { name: "Warehouse Item Detail", purpose: "Shipped item detail on a 945." },
  W15: { name: "Warehouse Adjustment Identification", purpose: "Inventory adjustment identity on a 947." },
  W17: { name: "Warehouse Receipt Identification", purpose: "Stock transfer receipt identity on a 944." },
  W19: { name: "Warehouse Adjustment Item Detail", purpose: "Adjusted item detail on a 947." },
  W27: { name: "Carrier Detail", purpose: "Carrier transportation detail on warehouse shipments." },
  W66: { name: "Warehouse Carrier Information", purpose: "Carrier and service detail on a 940." },
  NM1: { name: "Individual or Organizational Name", purpose: "Party identification (buyer, remit-to, provider)." },
  N1: { name: "Party Identification", purpose: "Named party such as shipper, consignee, or warehouse." },
  HL: { name: "Hierarchical Level", purpose: "Hierarchy node in ASN, claim, or shipment structures." },
  LX: { name: "Transaction Set Line Number", purpose: "Assigned number for a line or collection of data." },
  IK3: { name: "Implementation Error Segment", purpose: "999 segment-level error." },
  IK4: { name: "Implementation Data Element Note", purpose: "999 element-level error." },
  AK3: { name: "Data Segment Note", purpose: "997 segment-level error." },
  AK4: { name: "Data Element Note", purpose: "997 element-level syntax error." },
  CLM: { name: "Health Care Claim Information", purpose: "837 claim header with amount and filing indicators." },
};

export const ACK_CODES = {
  A: { meaning: "Accepted", typicalCause: "Partner accepted the functional group or transaction set.", fix: "No action required." },
  E: { meaning: "Accepted with errors noted", typicalCause: "Partner accepted but reported implementation notes.", fix: "Review IK3/IK4 or AK3/AK4 loops before the next production send if required." },
  P: { meaning: "Partially accepted", typicalCause: "Some transaction sets accepted and others rejected.", fix: "Correct and resend only the failed sets." },
  R: { meaning: "Rejected", typicalCause: "Functional group or transaction set failed partner validation.", fix: "Run validate_edi and explain_edi_error on the ack code." },
  "1": {
    meaning: "Accepted",
    typicalCause: "Partner accepted the functional group or transaction set.",
    fix: "No action required.",
  },
  "4": {
    meaning: "Rejected — segment count mismatch",
    typicalCause: "The SE segment count does not match the number of segments in the transaction set.",
    fix: "Regenerate the transaction set with a correct SE01 count or inspect for missing/extra segments.",
  },
  "5": {
    meaning: "Rejected — control number mismatch",
    typicalCause: "ST02 control number does not match SE02.",
    fix: "Ensure ST and SE control numbers match within each transaction set.",
  },
  "7": {
    meaning: "Rejected — invalid segment",
    typicalCause: "An unexpected or malformed segment appeared in the transaction set.",
    fix: "Validate segment order and element separators; run validate_edi before send.",
  },
};

export const VALIDATION_CATALOG_CODES = [...Object.keys(ACK_CODES), "VALIDATION_ERROR", "PARSE_ERROR"];

export function resolveAckEntry(code) {
  const key = code?.trim();
  if (!key) return undefined;
  return ACK_CODES[key] ?? ACK_CODES[key.toUpperCase()];
}

export function catalogCodeHasDictionaryEntry(code) {
  const c = code?.trim();
  if (!c) return false;
  if (resolveAckEntry(c)) return true;
  return c === "VALIDATION_ERROR" || c === "PARSE_ERROR";
}

export const GENERIC_VALIDATION = {
  meaning: "Structural validation failure",
  typicalCause: "The interchange failed X12 structural or syntax checks.",
  fix: "Run validate_edi, inspect reported segment/element positions, and compare against the partner implementation guide.",
};

/**
 * @param {{ code?: string, segment?: string, rawError?: string }} input
 */
export function explainEdiError(input = {}) {
  const code = input.code?.trim();
  const segment = input.segment?.trim()?.toUpperCase();
  const raw = input.rawError?.trim() ?? "";

  const ack = code ? resolveAckEntry(code) : undefined;
  const seg = segment ? SEGMENTS[segment] : undefined;

  const meaning = ack?.meaning ?? (seg ? `${seg.name} issue` : GENERIC_VALIDATION.meaning);
  const typicalCause =
    ack?.typicalCause ??
    (seg ? `Problem near segment ${segment}: ${seg.purpose}` : GENERIC_VALIDATION.typicalCause);
  const fix = ack?.fix ?? GENERIC_VALIDATION.fix;

  const lookup_x12 = [];
  if (segment && SEGMENTS[segment]) lookup_x12.push({ type: "segment", id: segment, ...SEGMENTS[segment] });
  if (code && resolveAckEntry(code)) lookup_x12.push({ type: "ack_code", id: code, ...resolveAckEntry(code) });

  return {
    meaning,
    typicalCause,
    fix,
    lookup_x12,
    ...(raw ? { rawError: raw.slice(0, 500) } : {}),
  };
}

/**
 * @param {string} query
 */
export function lookupX12(query) {
  const q = query.trim().toLowerCase();
  if (!q) return { matches: [] };

  const matches = [];
  for (const [id, meta] of Object.entries(SEGMENTS)) {
    if (id.toLowerCase().includes(q) || meta.name.toLowerCase().includes(q) || meta.purpose.toLowerCase().includes(q)) {
      matches.push({ kind: "segment", id, ...meta });
    }
  }
  for (const [id, meta] of Object.entries(ACK_CODES)) {
    if (id.includes(q) || meta.meaning.toLowerCase().includes(q)) {
      matches.push({ kind: "ack_code", id, ...meta });
    }
  }
  return { query, matches: matches.slice(0, 20) };
}

export function renderX12ReferenceMarkdown() {
  const lines = ["# SignalEDI X12 reference (MCP resource)", "", "## Segments", ""];
  for (const [id, meta] of Object.entries(SEGMENTS)) {
    lines.push(`- **${id}** — ${meta.name}: ${meta.purpose}`);
  }
  lines.push("", "## Acknowledgement codes", "");
  for (const [id, meta] of Object.entries(ACK_CODES)) {
    lines.push(`- **${id}** — ${meta.meaning}`);
  }
  return lines.join("\n");
}
