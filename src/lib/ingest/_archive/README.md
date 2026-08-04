# Archived: local AcroForm field detection

Moved here 2026-08-03 per the pivot agreed with Nigel (meeting transcript,
2026-08-02). Not deleted — kept for reference / possible reuse of pieces —
but no longer wired into the ingest pipeline.

## Why archived

PDF structure is not standardised enough for local heuristics to be
reliable across real-world forms. Testing across 10-15 real forms found
this path worked correctly on a minority of them and silently produced
wrong or incomplete field lists on the rest (see `docs/KNOWN-ISSUES.html`'s
prior "AcroForm labels showed as 001, 002" entry, and the residential
tenancy agreement test that returned 399 meaningless fields).

Nigel's framing: this isn't an accuracy problem to keep patching, it's a
reliability problem — "it's not that they're inaccurate, it's that
they're unreliable... they'll work perfectly once out of every 10 times,
then fine three out of ten, then completely break seven out of ten." A
solution tuned against one PDF (Acrobat-generated, Word-exported,
scanned, etc.) doesn't generalise to the next one.

## What replaced it

A single multimodal LLM call (`/api/understand`) that reads the PDF
directly and returns structured field JSON — see
`src/lib/openrouter/classify.ts` and `docs/ARCHITECTURE.md` (this
branch's copy) for the current pipeline.

## What's still used from here

`acroform.ts`'s field-name enumeration (not its position/label
detection) is re-implemented in a much smaller form directly in
`src/lib/ingest/acroform-fields.ts` — just listing real AcroForm field
names via pdf-lib, with no label guessing, so the model can be asked to
map its visual field detections back onto real fields for fill-back
(`fillAcroForm` still needs `anchor.fieldName` to write real values into
a real PDF).

## Files here

- `acroform.ts` — full field detection + classification (superseded)
- `acroform-position.ts` — resolves a field's page/rect via its widget annotation
- `nearby-text.ts` — spatial heuristic for finding a label physically near a field
