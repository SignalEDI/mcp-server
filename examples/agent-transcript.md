# Agent transcript excerpt (illustrative)

**User:** Generate a synthetic 850 and tell me the example PO number.

**Assistant:** *(in the keyless docs profile, calls `generate_test_document` with type 850 and inspects the synthetic fixture locally)*

The purchase order number is **PO-DEMO-001** (synthetic sample).

**User:** Why did my partner reject segment SE?

**Assistant:** *(calls `explain_edi_error` with segment SE and code 4)*

Segment count mismatch — regenerate the transaction set with a matching SE01 count.

— docs profile; bundled public or local synthetic result

`parse_edi` becomes available only after explicit `sandbox` selection with a separately provisioned non-production base and key. It uploads synthetic or approved test data and can record sandbox usage. Tenant transaction and QuickBooks data reads share the same sandbox boundary. Version 0.5 has no developer or production remote profile.
