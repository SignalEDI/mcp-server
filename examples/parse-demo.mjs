#!/usr/bin/env node
/** Example: parse a synthetic document through an authenticated non-production API. */
import { SignalEDIClient } from "../src/client.mjs";
import { renderTestDocument } from "../src/templates.mjs";

const sample = renderTestDocument("850");

const apiKey = process.env.SIGNALEDI_API_KEY;
if (!apiKey) throw new Error("Set SIGNALEDI_API_KEY before running this authenticated example.");
const baseUrl = process.env.SIGNALEDI_BASE_URL;
if (!baseUrl) throw new Error("Set SIGNALEDI_BASE_URL to a verified non-production API base.");

const client = new SignalEDIClient({ apiKey, profile: "sandbox", baseUrl, allowCustomBaseUrl: true });
const result = await client.parse(sample);
const validation = result.validation ?? {};
console.log(JSON.stringify({
  valid: validation.valid,
  transactionSet: validation.transactionSet,
  errorCount: Array.isArray(validation.errors) ? validation.errors.length : 0,
}, null, 2));
