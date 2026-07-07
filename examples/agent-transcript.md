# Agent transcript excerpt (illustrative)

**User:** Parse this 850 and tell me the PO number.

**Assistant:** *(calls `generate_test_document` with type 850, then `parse_edi`)*

The purchase order number is **PO-DEMO-001** (synthetic sample).

**User:** Why did my partner reject segment SE?

**Assistant:** *(calls `explain_edi_error` with segment SE and code 4)*

Segment count mismatch — regenerate the transaction set with a matching SE01 count.

— demo mode; responses rate-limited
