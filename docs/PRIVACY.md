# FormFill — Privacy & Data-Flow Contract

**Status:** Draft v0.1 · 2026-07-29
**Model:** hybrid — on-device extraction and redaction, cloud understanding of redacted structure only.

FormFill handles benefits claims, medical intake, immigration paperwork and mortgage applications. The privacy model is not a compliance checkbox; it is the reason a user would trust this app instead of asking a relative for help. It has to be simple enough to state in one sentence and strong enough to survive scrutiny.

> **The one-sentence promise:** *Your answers never leave your device. Only the blank structure of the form is ever sent for analysis, with anything personal stripped out first.*

---

## 1. The key insight

Personal data enters the system in two very different ways, and they need opposite treatments:

| | **Form structure** (labels, boxes, layout) | **Answers** (what the user tells us) |
|---|---|---|
| Contains PII? | Usually not — a *blank* form is generic text | Always. This is the sensitive payload. |
| Needs a model? | Yes — layout and language reasoning is genuinely hard | **No.** Capture, validation and formatting are all local rules. |
| Leaves device? | Yes, after redaction | **Never.** No exceptions, no opt-in. |

Almost all the privacy risk lives in the answers, and almost all the value from a cloud model lives in the structure. Splitting them is what makes a strong guarantee cheap.

Structure still needs redaction because real documents are rarely pristine blanks: partly-completed forms, a name and reference number in a header, a caseworker's handwriting, a previous year's return used as a template.

## 2. What is sent, precisely

**Sent to `/api/understand`:**
- Extracted text blocks with bounding boxes and page dimensions
- Detected input-region geometry
- Document-level metadata (page count, locale)
- **All of it after redaction** (§3)

**Never sent, under any configuration:**
- Any `Answer` value
- The raw page image or the original PDF bytes
- The profile (name, address, DOB, ID numbers)
- Any value in a field typed `sensitivity: 'sensitive'`
- Filenames, device identifiers, IP-derived location beyond what TLS inherently exposes

## 3. Redaction

`packages/redact` runs **before** any network call, in the worker.

**Detectors** (locale-aware; UK + US at v1):
- Names — gazetteer + contextual patterns near name-like labels
- Postal codes / ZIP, street addresses
- Dates of birth (dates near DOB-ish context, distinct from generic dates)
- National ID — UK NI number, US SSN, NHS number
- Email, phone, IBAN/sort code/account number, passport & driving licence numbers
- Free-text handwriting regions from OCR (treated as presumptively personal)

**Substitution** is placeholder-based and reversible *locally only*:

```
"Name: Priya Sharma, NI: QQ123456C"  →  "Name: ⟨PERSON_1⟩, NI: ⟨NATIONAL_ID_1⟩"
```

The map `⟨PERSON_1⟩ → "Priya Sharma"` is held in worker memory for the duration of the request and never persisted or transmitted. The model's response is rehydrated locally before the IR reaches the UI.

Placeholders are typed and numbered so the model retains the structural signal it needs (*this is a person's name, and it is the same person as the one three lines up*) without receiving the value.

**Failure posture:** redaction failing open is a leak. If a detector throws, or the redaction pass cannot complete, the request is **not sent** — the app falls back to local heuristic classification and tells the user the form could only be partly understood.

**Recall is the metric.** `redact` is tested against a labelled corpus and CI gates on recall, not F1. A false positive costs a slightly worse IR; a false negative is the failure this whole document exists to prevent.

## 4. Storage

Everything the user owns is local.

| Data | Where | Protection |
|---|---|---|
| Profile (name, address, DOB, IDs) | IndexedDB | AES-GCM, key from WebAuthn PRF or PBKDF2 passphrase |
| Answers / drafts | IndexedDB | same |
| Source documents | Memory only by default; explicit opt-in to save a draft | encrypted if saved |
| Emitted PDFs | User's chosen download location | user's responsibility from that point |
| Redaction maps | Worker memory, request lifetime | never persisted |

- **No accounts, no server-side user database, no sync** in v1. There is nothing on a server to breach.
- **Clear everything** is reachable in two keystrokes from any screen and wipes IndexedDB and all in-memory state, with spoken confirmation.
- Sessions auto-lock after inactivity; the encryption key is dropped from memory on lock.

## 5. Server posture

`/api/understand` is the only server endpoint.

- Stateless. No database, no queue, no object storage.
- **No request/response body logging.** Metrics are counts, durations and error classes only.
- Claude API called with the API key server-side; zero-retention terms; no training on inputs.
- Rate-limited by IP; no cookies, no session, no user identifier.
- CSP forbids all third-party origins. **No analytics SDK, no session-replay, no third-party error reporter** — any of these can capture DOM containing form content, which would silently break the promise in §0.

## 6. Regulatory

- **UK GDPR / EU GDPR:** the operator is a controller for the minimal structural data transiting `/api/understand`; special-category data (health, benefits) is excluded from transit by §2 and §3 by design. Data minimisation is architectural, not procedural.
- **HIPAA:** FormFill is not a covered entity, but medical intake forms are a target use case. Answers-never-leave-device means no PHI transits the service; do not weaken this without a BAA and a redesign.
- **DPIA** required before public launch given the vulnerable-user population and the sensitivity of target documents.
- **Accessibility as compliance:** EN 301 549 / Section 508 conformance is likely a procurement requirement for any public-sector deployment. See [ACCESSIBILITY.md](./ACCESSIBILITY.md).

## 7. What we tell the user, in their words

Spoken on first run, and always available under `Ctrl`+`Alt`+`P`:

> *"FormFill reads forms on your device. To understand a new form's layout, it may send the blank form's wording to our server — never your answers, and never anything that identifies you. Your answers and your saved details stay on this device, encrypted. Nobody at FormFill can see them."*

If that sentence ever stops being literally true, the architecture changed and this document is now a lie. Treat any PR that weakens it as a breaking change requiring explicit sign-off.

## 8. Threat model summary

| Threat | Mitigation |
|---|---|
| Server breach exposes user data | No user data on the server. Nothing to take. |
| Model provider retains sensitive inputs | Zero-retention terms + only redacted structure sent |
| Shared or public device leaks stored answers | Encrypted at rest, auto-lock, two-key wipe |
| XSS exfiltrates answers from the DOM | Strict CSP, no third-party scripts, no `dangerouslySetInnerHTML` |
| Redaction misses a PII span | Recall-gated CI, fail-closed on detector error, sensitive fields never transit |
| A helper/support worker over-collects | Local-only storage means no aggregated dataset can accumulate |
| Malicious PDF (JS, external refs) | pdf.js with scripting disabled, no external resource loading |
