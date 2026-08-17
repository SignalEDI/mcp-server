#!/usr/bin/env node
/** Example: generate locally, then validate the synthetic fixture through an authenticated non-production API. */
import { renderTestDocument } from "../src/templates.mjs";
import { SignalEDIClient } from "../src/client.mjs";

const content = renderTestDocument("850");
const apiKey = process.env.SIGNALEDI_API_KEY;
if (!apiKey) throw new Error("Set SIGNALEDI_API_KEY before running authenticated validation.");
const baseUrl = process.env.SIGNALEDI_BASE_URL;
if (!baseUrl) throw new Error("Set SIGNALEDI_BASE_URL to a verified non-production API base.");

const client = new SignalEDIClient({ apiKey, profile: "sandbox", baseUrl, allowCustomBaseUrl: true });
const validated = await client.validate(content);
const validation = validated.validation ?? {};
console.log(JSON.stringify({
  generatedChars: content.length,
  valid: validation.valid,
  transactionSet: validation.transactionSet,
  errorCount: Array.isArray(validation.errors) ? validation.errors.length : 0,
}, null, 2));
