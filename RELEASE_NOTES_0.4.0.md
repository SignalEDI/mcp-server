# SignalEDI MCP Server 0.4.0

This release makes SignalEDI MCP safer and more agent-friendly.

## Highlights

- Native structured MCP results alongside backwards-compatible text output.
- Stable machine-readable error codes for model recovery.
- Explicit `confirm: true` and unique `idempotencyKey` requirements for EDI and QuickBooks mutations.
- Tool capability metadata and required-scope hints for MCP hosts.
- Request correlation and idempotency headers on outbound API calls.
- 64 KiB EDI payload protection and HTTPS-only base URL validation, except localhost.
- Redacted per-tool latency and success metrics on stderr, with an opt-out switch.
- Expanded regression coverage and updated installation and safety documentation.

Read-only and demo-mode workflows remain compatible. Mutation callers must now provide
the confirmation and idempotency fields described above.
