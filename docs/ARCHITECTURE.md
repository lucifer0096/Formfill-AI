# FormFill — Architecture

**Status:** Draft v0.1 · 2026-07-29
**Companion docs:** [DESIGN.md](./DESIGN.md) · [ACCESSIBILITY.md](./ACCESSIBILITY.md) · [PRIVACY.md](./PRIVACY.md)

---

## 1. Architectural thesis

Three input sources (paper, PDF, web) and three output targets (filled PDF, print overlay, live DOM) would normally mean nine code paths. They don't, because **everything is normalised into a single Form IR** the moment it is understood, and the entire conversational core operates only on that IR.

```
   INGEST (source-specific)          CORE (source-agnostic)        EMIT (source-specific)
 ┌──────────────────────────┐    ┌───────────────────────────┐   ┌──────────────────────┐
 │ ingest-pdf   (pdf.js)    │    │  form-model   (the IR)    │   │ emit-pdf   (pdf-lib) │
 │ ingest-image (OCR)       │───▶│  conversation (state m/c) │──▶│ emit-overlay         │
 │ ingest-dom   (extension) │    │  validate · profile       │   │ emit-dom             │
 └──────────────────────────┘    │  redact · speech          │   └──────────────────────┘
                                 └───────────────────────────┘
```

The source-specific knowledge survives in exactly one place: each `Field` carries an **`anchor`** — a tagged union describing how to write a value back to its origin. That is the whole trick.

## 2. The Form IR

The contract every other module depends on. Defined in `packages/form-model`.

```ts
Form {
  id, title, source: 'pdf' | 'image' | 'dom',
  locale, provenance: { capturedAt, pageCount, extractor, modelVersion? },
  sections: Section[]
}

Section { id, title?, fields: Field[] }

Field {
  id
  label:       string   // VERBATIM from the form. Never paraphrased. Always retrievable.
  spokenLabel: string   // plain-language rewrite, what gets read aloud
  help?:       string   // explanation of what is actually being asked
  type:        FieldType
  required:    boolean
  constraints: { maxLength?, pattern?, min?, max?, options?: Choice[] }
  sensitivity: 'none' | 'pii' | 'sensitive'
  confidence:  number   // 0..1, from OCR and/or classification
  anchor:      Anchor   // ← the only source-specific part
  dependsOn?:  Condition // conditional / skip-logic
}

FieldType = text | longtext | number | currency | date | email | phone
          | name | address | choice | multichoice | boolean | signature | unknown

Anchor =
  | { kind: 'acroform', fieldName: string }                  // real PDF form field
  | { kind: 'region',   page: number, rect: Rect }           // flat PDF / scan / photo
  | { kind: 'dom',      selector: string, frame?: string }    // live web page
```

**Answers live separately from the form.** `Answer { fieldId, value, state, source, enteredAt }` where `state ∈ empty | filled | skipped | needsReview | confirmed`. Keeping them in a distinct store is what makes "structure may go to the cloud, answers never do" enforceable rather than aspirational — the two are never in the same object graph.

## 3. Module map

Monorepo, npm workspaces, TypeScript throughout.

```
apps/
  web/                Next.js (App Router) — the primary application
  extension/          MV3 browser extension                          [P4]
packages/
  form-model/         IR types, zod schemas, IR construction & traversal helpers
  conversation/       The conversation state machine. Pure, no DOM, no I/O.
  redact/             PII detection, placeholder substitution, rehydration
  validate/           Field-level validators (dates, postcodes, NI/SSN, email…)
  profile/            Encrypted local profile + autofill matching
  speech/             TTS, screen-reader detection, announcement queue
  ingest-pdf/         pdf.js text+geometry extraction, AcroForm discovery
  ingest-image/       OCR, deskew, page/edge detection                [P2/P3]
  emit-pdf/           pdf-lib writer: AcroForm values + drawn text layer
  fixtures/           Hand-authored and captured test forms
```

**Dependency rule:** `conversation` may not import any ingest or emit package, and may not touch the DOM. It is a pure function of `(Form, AnswerSet, Event) → (AnswerSet, Announcement[])`. This keeps the most important logic in the product exhaustively testable without a browser.

## 4. Runtime topology

FormFill is a **local-first web app with one narrow server responsibility.**

```
┌─ Browser ────────────────────────────────────────────────────────┐
│                                                                  │
│  UI (React, RSC shell + client conversation)                     │
│         │                                                        │
│  ┌──────┴───────────────────────────────────────────┐            │
│  │ conversation engine · validate · profile · speech│            │
│  └──────┬───────────────────────────────────────────┘            │
│         │                                                        │
│  ┌──────┴──────────┐   ┌──────────────┐   ┌──────────────────┐   │
│  │ Web Worker:     │   │ IndexedDB    │   │ Web Speech /     │   │
│  │ pdf.js, OCR,    │   │ (encrypted): │   │ OS dictation     │   │
│  │ redact, pdf-lib │   │ profile,     │   └──────────────────┘   │
│  └──────┬──────────┘   │ answers,     │                          │
│         │              │ drafts       │                          │
│         │              └──────────────┘                          │
└─────────┼────────────────────────────────────────────────────────┘
          │  redacted structure only  (see PRIVACY.md §3)
          ▼
┌─ Server (Next.js route handler) ────────────────────────────────┐
│  /api/understand  →  Claude API  →  Form IR                     │
│  stateless · no logging of payloads · no database               │
└──────────────────────────────────────────────────────────────────┘
```

There is **no user database and no accounts** in v1. Everything the user owns lives in their browser, encrypted. This is a deliberate constraint: it removes an entire category of breach risk from a product handling benefits claims and medical intake, and it is a marketing asset. The cost is that sync and multi-device are out of scope until there is a reason to pay for them.

### Why heavy work goes in a Web Worker
OCR of a page takes seconds. On the main thread that freezes the UI *and* stalls the speech-synthesis queue — the user is mid-sentence and the voice stops. Everything CPU-bound (pdf.js, OCR, redaction, PDF writing) runs in a worker so the app can keep talking: *"I'm reading page two of four…"*

## 5. Key flows

### 5.1 Understanding a form

```
file → worker
  ├─ AcroForm present?  ─── yes ──▶ build IR directly from field dictionary   [no model call]
  │                                  labels from /TU tooltip, /T name, widget rects
  └─ no ─▶ extract text + boxes (pdf.js text layer, or OCR for scans)
             │
             ├─▶ redact.scan()      → PII spans → placeholders  ⟨PERSON_1⟩ ⟨DOB_1⟩
             │
             ├─▶ POST /api/understand { blocks, geometry, pageSize }
             │       Claude → sections, labels, types, spokenLabel, help, confidence
             │
             ├─▶ redact.rehydrate() → placeholders restored locally
             │
             └─▶ zod-validate the IR; any field failing → type 'unknown', confidence 0
```

The AcroForm short-circuit matters: for a large share of real government PDFs, **FormFill never makes a network call at all.** P1 ships on this path alone.

### 5.2 The conversation engine

A state machine over the IR. Pure, synchronous, fully unit-testable.

```
        ┌──────────┐   start    ┌───────────┐  answer+valid  ┌──────────┐
        │  Loaded  │───────────▶│  Asking   │───────────────▶│ Advancing│
        └──────────┘            │  field n  │◀──────┐        └────┬─────┘
                                └─────┬─────┘       │ invalid     │
                                      │ help/repeat │             │ more fields?
                                      └─────────────┘             │
                                                                  ▼ no
                          ┌──────────┐  all confirmed   ┌──────────────┐
                          │ Emitting │◀─────────────────│  Reviewing   │
                          └──────────┘                  │ (mandatory)  │
                                                        └──────────────┘
```

Every transition emits `Announcement[]` — `{ text, priority: 'polite'|'assertive', interruptible }`. The UI layer decides how to render them (ARIA live region vs. speech synthesis vs. both); the engine never speaks directly. That indirection is what makes §2 of [ACCESSIBILITY.md](./ACCESSIBILITY.md) — never talking over a screen reader — implementable in one place.

Skip-logic (`dependsOn`) is evaluated on advance, so irrelevant branches are never read aloud. Saving the user forty questions they don't need is worth more than any other optimisation in the product.

### 5.3 Autofill from profile

On entering a field, `profile.suggest(field)` matches on semantic key (`givenName`, `postcode`, `dateOfBirth`…) rather than label text. A hit is **offered, never applied**:

> *"Date of birth. I have 3rd of March 1954 — press Enter to use it, or type a different date."*

Silent autofill is disqualifying here: the user cannot see what was filled in, and an unnoticed stale address on a benefits form is a real harm.

### 5.4 Emit

| Anchor kind | Writer | Fidelity |
|---|---|---|
| `acroform` | `pdf-lib` sets field values, then flattens on request | Exact |
| `region` | `pdf-lib` draws text at `rect`, auto-fitted font size | Good; needs visual QA |
| `dom` | extension sets `.value` + dispatches `input`/`change` | Good; SPA frameworks need native setter |

Paper additionally gets an **overlay PDF**: answers only, transparent background, printed onto the original sheet.

## 6. Technology choices

| Choice | Why | Rejected alternative |
|---|---|---|
| **TypeScript + npm workspaces** | Shared IR types across app, worker and extension is the whole point. No pnpm dependency. | Nx/Turborepo — overhead not yet justified |
| **Next.js App Router** | One deploy for static shell + the single `/api/understand` route; strong a11y defaults; easy Vercel/self-host | Vite SPA + separate API (more moving parts) |
| **React** | Best-tested screen-reader behaviour, mature a11y tooling and testing-library support | Svelte/Solid — smaller a11y ecosystem |
| **pdf.js** | Only credible browser PDF parser; gives text *with* geometry | Server-side parsing — breaks local-first |
| **pdf-lib** | Pure-JS AcroForm read/write in-browser | Server generation — breaks local-first |
| **Tesseract.js (P2), then a WASM VLM** | Ships now, no server. Revisit when on-device VLMs make layout parsing tractable | Cloud OCR — sends the whole form image off-device |
| **Web Speech Synthesis** | Zero-cost, offline, OS voices the user has already configured | Cloud TTS — latency, cost, privacy |
| **IndexedDB + WebCrypto (AES-GCM)** | Local, large, structured. Key from WebAuthn PRF or passphrase (PBKDF2) | localStorage — unencrypted, size-limited, sync |
| **Claude (`claude-opus-5`) for understanding** | Layout + language reasoning in one call; plain-language rewriting is the differentiating output | Rules-only — brittle on real forms |
| **XState-style hand-rolled machine** | Conversation logic must be inspectable and exhaustively testable | Ad-hoc `useState` — untestable, the classic way this product rots |

## 7. Testing strategy

Accessibility bugs are silent, so testing is weighted unusually toward the top of the stack.

- **Unit** — `conversation` engine: every transition, skip-logic branch, and announcement sequence. Snapshot the *announcement transcript* for each fixture form; a diff in what the user hears is a reviewable artefact.
- **Unit** — `redact`: precision/recall against a labelled PII corpus. **Recall is the safety metric; a miss is a leak.** Gate CI on it.
- **Golden-file** — `ingest-pdf` → IR for each fixture; `emit-pdf` → rendered PNG compared per-pixel.
- **Integration** — full ingest→converse→emit with Playwright, driven **keyboard-only**. No test may use a mouse.
- **Automated a11y** — axe-core on every route, zero violations, CI-blocking.
- **Manual, non-negotiable** — each release tested with NVDA (Windows/Chrome), VoiceOver (macOS/Safari, iOS), and TalkBack. Automated tools catch roughly a third of real screen-reader defects.
- **User testing** — recruit blind and low-vision testers from phase P1 onward. Nothing in this document substitutes for that.

## 8. Performance budgets

Chosen because latency in a voice interface is felt as the app being *broken*, not slow.

| Metric | Budget |
|---|---|
| Key press → speech begins | < 100 ms |
| Field advance (no I/O) | < 50 ms |
| AcroForm PDF → first question | < 2 s |
| Scanned page → OCR complete | < 8 s/page, with spoken progress |
| `/api/understand` round trip | < 6 s, spoken progress after 1 s |
| Emit filled PDF | < 1.5 s |

## 9. Security notes

- `/api/understand` is stateless, logs no payloads, and rate-limits by IP. The Claude API key never reaches the client.
- CSP: no third-party origins. No analytics SDKs, no fonts from CDNs, no error reporters that could capture form content in a stack trace or DOM snapshot.
- Encrypted-at-rest IndexedDB with an explicit **"clear everything"** control reachable in two keystrokes from anywhere.
- Sensitive-typed fields (`sensitivity: 'sensitive'`) are hard-blocked from cloud STT, from any log line, and from crash reports.

See [PRIVACY.md](./PRIVACY.md) for the full data-flow contract.
