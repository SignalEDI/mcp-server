/** Synthetic X12 templates — obviously fake identifiers; shared by generate_test_document. */

import { LOCAL_DOCUMENT_SET_CODES, getDocumentSchema, unsupportedDocumentSetError } from "./document-schemas.mjs";

const BASE_ISA = (control) =>
  `ISA*00*          *00*          *ZZ*SYNTHVND       *ZZ*SYNTHRCV       *260101*1200*U*00401*${control}*0*P*>~`;

export const LOCAL_TEST_DOCUMENT_TYPES = LOCAL_DOCUMENT_SET_CODES;

const PO_NUMBER_TYPES = new Set(["850", "810", "855"]);

/**
 * @param {string} type
 * @param {{ controlNumber?: string, poNumber?: string, date?: string }} overrides
 */
export function renderTestDocument(type, overrides = {}) {
  if (!LOCAL_DOCUMENT_SET_CODES.includes(type)) {
    throw unsupportedDocumentSetError(type);
  }
  validateOverrides(type, overrides);
  const control = overrides.controlNumber ?? "000000001";
  const po = overrides.poNumber ?? "PO-DEMO-001";
  const date = overrides.date ?? "20260101";
  const gsDate = date;

  const doc = (gsId, groupControl, bodySegments) => {
    const segments = [
      `ST*${type}*0001~`,
      ...bodySegments,
    ];
    const seCount = segments.length + 1; // include SE itself
    return [
      BASE_ISA(control),
      `GS*${gsId}*SYNTHVND*SYNTHRCV*${gsDate}*1200*${groupControl}*X*004010~`,
      ...segments,
      `SE*${seCount}*0001~`,
      `GE*1*${groupControl}~`,
      `IEA*1*${control}~`,
    ].join("");
  };

  switch (type) {
    case "850":
      return doc("PO", "1", [
        `BEG*00*SA*${po}**${date}~`,
        "N1*BY*SYNTH BUYER LLC*92*SYNBUY01~",
        "PO1*1*12*EA*19.99**VN*SKU-DEMO-100~",
        "CTT*1~",
      ]);
    case "810":
      return doc("IN", "2", [
        `BIG*${date}*INV-DEMO-001*20260101*${po}~`,
        "N1*RE*SYNTH REMIT LLC*92*SYNREM01~",
        "IT1*1*12*EA*19.99**VN*SKU-DEMO-100~",
        "TDS*23988~",
      ]);
    case "855":
      return doc("PR", "3", [
        `BAK*00*AC*${po}*${date}~`,
        "N1*SE*SYNTH SELLER LLC*92*SYNSELL01~",
        "PO1*1*12*EA*19.99**VN*SKU-DEMO-100~",
        "ACK*IA*12*EA~",
        "CTT*1~",
      ]);
    case "856":
      return doc("SH", "4", [
        `BSN*00*ASN-DEMO-001*${date}*1400~`,
        "HL*1**S~",
        "TD1*CTN*2****G*12*LB~",
        "REF*BM*CARTON-DEMO-01~",
      ]);
    case "204":
      return doc("SM", "5", [
        "B2**SYNTH**LOAD-DEMO-001**PP~",
        "B2A*00*LT~",
        "L11*REF-DEMO-001*CN~",
        "S5*1*CL~",
        "N1*SH*SYNTH SHIPPER*92*SYNSHP01~",
      ]);
    case "210":
      return doc("IM", "6", [
        `B3**INV-FGT-001*SHIP-DEMO-001*PP**${date}*10000****SYNTH~`,
        "N1*SH*SYNTH SHIPPER*92*SYNSHP01~",
        "LX*1~",
        "L5*1*SYNTHETIC FREIGHT~",
        "L3*10000***10000~",
      ]);
    case "211":
      return doc("BL", "7", [
        "BOL*SYNTH*PP*BOL-DEMO-001~",
        "N1*SH*SYNTH SHIPPER*92*SYNSHP01~",
        "N1*CN*SYNTH CONSIGNEE*92*SYNCON01~",
        "LX*1~",
        "L5*1*SYNTHETIC GOODS~",
      ]);
    case "212":
      return doc("TM", "8", [
        "ATA*SYNTH*MANIFEST-DEMO-001~",
        `AT7*X1*NS***${date}*1200~`,
        "N1*SF*SYNTH FACILITY*92*SYNFAC01~",
        "LX*1~",
        "OID*ORDER-DEMO-001~",
      ]);
    case "214":
      return doc("QM", "9", [
        "B10*STATUS-DEMO-001*SYNTH~",
        "LX*1~",
        `AT7*X1*NS***${date}*1200~`,
        "MS1*TEST CITY*NY*US~",
        "N1*SH*SYNTH SHIPPER*92*SYNSHP01~",
      ]);
    case "753":
      return doc("RF", "10", [
        `BGN*00*ROUTE-REQ-001*${date}~`,
        "N1*SH*SYNTH SHIPPER*92*SYNSHP01~",
        "LX*1~",
        "L11*PO-DEMO-001*PO~",
        "OID*ORDER-DEMO-001~",
      ]);
    case "754":
      return doc("RG", "11", [
        `BGN*00*ROUTE-INS-001*${date}~`,
        "N1*CA*SYNTH CARRIER*2*SYNTH~",
        "LX*1~",
        "L11*PO-DEMO-001*PO~",
        "OID*ORDER-DEMO-001~",
      ]);
    case "858":
      return doc("SI", "12", [
        "BX*00*M*PP*SHIPINFO-001~",
        "N1*SH*SYNTH SHIPPER*92*SYNSHP01~",
        "HL*1**S~",
        "N9*BN*BILL-DEMO-001~",
        "MAN*GM*PKG-DEMO-001~",
      ]);
    case "940":
      return doc("OW", "13", [
        "W05*N*WH-ORDER-001~",
        "N1*WH*SYNTH WAREHOUSE*92*SYNWH01~",
        "N1*ST*SYNTH STORE*92*SYNST01~",
        "W66*PP*M~",
        "LX*1~",
        "W01*12*EA**VN*SKU-DEMO-100~",
      ]);
    case "943":
      return doc("AR", "14", [
        `W06*F*TRANSFER-001*${date}~`,
        "N1*WH*SYNTH WAREHOUSE*92*SYNWH01~",
        "W27*P*SYNTH~",
        "W04*12*EA**VN*SKU-DEMO-100~",
      ]);
    case "944":
      return doc("RE", "15", [
        `W17*F*RECEIPT-001*${date}~`,
        "N1*WH*SYNTH WAREHOUSE*92*SYNWH01~",
        "W07*12*EA**VN*SKU-DEMO-100~",
        "W14*12~",
      ]);
    case "945":
      return doc("SW", "16", [
        `W06*F*SHIPADV-001*${date}~`,
        "N1*WH*SYNTH WAREHOUSE*92*SYNWH01~",
        "W03*12~",
        "LX*1~",
        "W12*SH*12*12*EA**VN*SKU-DEMO-100~",
      ]);
    case "947":
      return doc("AW", "17", [
        `W15*${date}*ADJ-DEMO-001*ADJ-DEMO-001~`,
        "N1*WH*SYNTH WAREHOUSE*92*SYNWH01~",
        "W19*AJ*12*EA**VN*SKU-DEMO-100~",
        "W20*12*EA~",
      ]);
    case "990":
      return doc("GF", "18", [
        "B1*SYNTH*LOAD-DEMO-001*A~",
        "N9*CN*REF-DEMO-001~",
        `G62*86*${date}~`,
      ]);
    case "837":
      return [
        `ISA*00*          *00*          *ZZ*SYNTHBILL      *ZZ*SYNTHCLR       *260201*1030*U*00501*${control}*0*P*>~`,
        "GS*HC*SYNTHBILL*SYNTHCLR*20260201*1030*4*X*005010X222A1~",
        "ST*837*0001*005010X222A1~",
        `BHT*0019*00*BATCH-DEMO-001*${date}*1030*CH~`,
        "NM1*41*2*SYNTHETIC SUBMITTER*****46*SYNTHSUB~",
        "PER*IC*SYNTH SUPPORT*TE*5555550100~",
        "NM1*40*2*SYNTHETIC RECEIVER*****46*SYNTHCLR~",
        "HL*1**20*1~",
        "NM1*85*2*SYNTHETIC BILLING PROVIDER*****XX*1999999999~",
        "N3*100 TEST AVENUE~",
        "N4*TEST CITY*NY*10001~",
        "REF*EI*000000000~",
        "HL*2*1*22*0~",
        "SBR*P*18*******CI~",
        "NM1*IL*1*TEST*PATIENT****MI*SYNTHMEMBER1~",
        "N3*200 TEST AVENUE~",
        "N4*TEST CITY*NY*10001~",
        "DMG*D8*19900101*M~",
        "NM1*PR*2*SYNTHETIC HEALTH PLAN*****PI*SYNTHPLAN~",
        "CLM*CLM-DEMO-001*125.00***11:B:1*Y*A*Y*I~",
        "HI*ABK:M545~",
        "LX*1~",
        "SV1*HC:99213*125.00*UN*1***1~",
        `DTP*472*D8*${date}~`,
        "SE*23*0001~",
        "GE*1*4~",
        `IEA*1*${control}~`,
      ].join("");
    default:
      throw unsupportedDocumentSetError(type);
  }
}

/** Capability label for a locally rendered synthetic fixture. */
export function localFixtureCapability(type) {
  return getDocumentSchema(type).capability;
}

function validateOverrides(type, overrides) {
  if (typeof overrides !== "object" || overrides === null || Array.isArray(overrides)) {
    throw new Error("overrides must be a JSON object.");
  }
  for (const key of Object.keys(overrides)) {
    if (!["controlNumber", "poNumber", "date"].includes(key)) {
      throw new Error(`Unsupported override: ${key}`);
    }
  }
  if (overrides.controlNumber !== undefined && !/^\d{9}$/.test(overrides.controlNumber)) {
    throw new Error("controlNumber must be exactly 9 digits.");
  }
  if (overrides.date !== undefined && !/^\d{8}$/.test(overrides.date)) {
    throw new Error("date must be YYYYMMDD.");
  }
  if (overrides.poNumber !== undefined) {
    if (!PO_NUMBER_TYPES.has(type)) {
      throw new Error(`poNumber does not apply to the ${type} synthetic fixture; it is supported only for 850, 810, and 855.`);
    }
    if (typeof overrides.poNumber !== "string" || overrides.poNumber.trim() === "") {
      throw new Error("poNumber must be a non-empty string.");
    }
    if (overrides.poNumber.length > 40 || /[~*\r\n]/.test(overrides.poNumber)) {
      throw new Error("poNumber must not contain EDI separators and must be 40 characters or fewer.");
    }
  }
}
