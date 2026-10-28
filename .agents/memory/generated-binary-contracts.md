---
name: Generated binary contracts
description: Orval can infer Blob from an octet-stream body independently of the binary format marker.
---

Orval infers `Blob` for an octet-stream request body even when the schema's
`format: binary` is removed. Removing that marker alone does not remove the
generated type's need for Blob declarations.

**Why:** Attempts to avoid the browser type by changing only binary schema
metadata still generated Blob and failed the shared-library build.

**How to apply:** Keep the wire contract honest and give the shared generated
contract package compatible Blob typings. Do not hand-edit generated types or
misdescribe binary bodies as JSON to work around generation.
