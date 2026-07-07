#!/usr/bin/env node
/** Example: parse raw EDI via the MCP server's parse_edi tool contract (HTTP playground in demo mode). */
import { SignalEDIClient } from "../src/client.mjs";

const sample =
  "ISA*00*          *00*          *ZZ*SYNTHVND       *ZZ*SYNTHRCV       *260101*1200*U*00401*000000001*0*P*>~" +
  "GS*PO*SYNTHVND*SYNTHRCV*20260101*1200*1*X*004010~ST*850*0001~BEG*00*SA*PO-DEMO-001**20260101~SE*4*0001~GE*1*1~IEA*1*000000001~";

const client = new SignalEDIClient({ demoMode: true });
const result = await client.parse(sample);
console.log(JSON.stringify(result, null, 2));
