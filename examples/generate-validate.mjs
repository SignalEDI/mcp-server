#!/usr/bin/env node
/** Example: generate → validate loop using local templates (no API key). */
import { renderTestDocument } from "../src/templates.mjs";
import { SignalEDIClient } from "../src/client.mjs";

const content = renderTestDocument("850");
const client = new SignalEDIClient({ demoMode: true });
const validated = await client.validate(content);
console.log(JSON.stringify({ generatedChars: content.length, validated }, null, 2));
