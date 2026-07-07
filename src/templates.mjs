/** Synthetic X12 templates — obviously fake identifiers; shared by generate_test_document. */

const BASE_ISA = (control, setId) =>
  `ISA*00*          *00*          *ZZ*SYNTHVND       *ZZ*SYNTHRCV       *260101*1200*U*00401*${control}*0*P*>~`;

/**
 * @param {"850"|"810"|"856"|"837"} type
 * @param {{ controlNumber?: string, poNumber?: string, date?: string }} overrides
 */
export function renderTestDocument(type, overrides = {}) {
  const control = overrides.controlNumber ?? "000000001";
  const po = overrides.poNumber ?? "PO-DEMO-001";
  const date = overrides.date ?? "20260101";

  switch (type) {
    case "850":
      return [
        BASE_ISA(control, "850"),
        "GS*PO*SYNTHVND*SYNTHRCV*20260101*1200*1*X*004010~",
        "ST*850*0001~",
        `BEG*00*SA*${po}**${date}~`,
        "N1*BY*SYNTH BUYER LLC*92*SYNBUY01~",
        "PO1*1*12*EA*19.99**VN*SKU-DEMO-100~",
        "CTT*1~",
        "SE*6*0001~",
        "GE*1*1~",
        `IEA*1*${control}~`,
      ].join("");
    case "810":
      return [
        BASE_ISA("000000002", "810"),
        "GS*IN*SYNTHVND*SYNTHRCV*20260115*0900*2*X*004010~",
        "ST*810*0001~",
        `BIG*20260115*INV-DEMO-001*${date}*${po}~`,
        "N1*RE*SYNTH REMIT LLC*92*SYNREM01~",
        "IT1*1*12*EA*19.99**VN*SKU-DEMO-100~",
        "TDS*23988~",
        "SE*6*0001~",
        "GE*1*2~",
        "IEA*1*000000002~",
      ].join("");
    case "856":
      return [
        BASE_ISA("000000003", "856"),
        "GS*SH*SYNTHVND*SYNTHRCV*20260120*1400*3*X*004010~",
        "ST*856*0001~",
        "BSN*00*ASN-DEMO-001*20260120*1400~",
        "HL*1**S~",
        "TD1*CTN*2****G*12*LB~",
        "REF*BM*CARTON-DEMO-01~",
        "SE*6*0001~",
        "GE*1*3~",
        "IEA*1*000000003~",
      ].join("");
    case "837":
      return [
        "ISA*00*          *00*          *ZZ*SYNTHBILL      *ZZ*SYNTHCLR       *260201*1030*U*00501*000000004*0*P*>~",
        "GS*HC*SYNTHBILL*SYNTHCLR*20260201*1030*4*X*005010X222A1~",
        "ST*837*0001*005010X222A1~",
        "BPR*I*1250.00*C*CHK****01*SYNBNK01**DA*SYNACCT01*20260201~",
        "CLM*CLM-DEMO-001*1250.00***11:B:1*Y*A*Y*I~",
        "SE*4*0001~",
        "GE*1*4~",
        "IEA*1*000000004~",
      ].join("");
    default:
      throw new Error(`Unsupported document type: ${type}`);
  }
}
