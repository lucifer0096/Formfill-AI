# MFIF — Design Document

**Status:** Draft v0.1 · 2026-07-29
**Companion docs:** [ARCHITECTURE.md](./ARCHITECTURE.md) · [ACCESSIBILITY.md](./ACCESSIBILITY.md) · [PRIVACY.md](./PRIVACY.md)

---

## 1. Problem

Forms are one of the last hard barriers to independence for blind and low-vision people. A sighted person scans a form, builds a mental map of it in seconds, and fills it in. Without vision, every part of that breaks:

- **Paper forms** are opaque. There is no way to know what is on the page, where the boxes are, or how to write inside them. The usual solution is to hand the form — and everything on it — to another person.
- **Scanned or "flat" PDFs** are images. A screen reader reads nothing, or reads a garbled text layer with no relationship between labels and boxes.
- **Web forms** are often technically accessible but practically hostile: unlabelled inputs, validation errors announced nowhere, multi-page wizards that lose focus, CAPTCHAs, timeouts.
- **Even accessible forms are exhausting.** A screen reader user tabs through 60 fields linearly with no overview, re-entering the same name, address and date of birth they have entered a thousand times.

The cost is not just inconvenience. It is **privacy**: filling in a benefits claim, a medical intake, or a mortgage application currently means reading your income, diagnoses and national insurance number aloud to a family member, a support worker, or a stranger at a desk.

> **The product thesis:** the goal is not "read the form aloud". It is *to let someone complete a form, alone, correctly, and confidently* — and to know when it worked.

## 2. Who this is for

| Persona | Situation | What they need most |
|---|---|---|
| **Priya, 34, blind since birth** | Expert screen-reader user, JAWS/NVDA at 450 wpm. Fills forms constantly for work. | Speed and control. Must not fight the app. Never double-speak over her screen reader. Keyboard everything. |
| **Alan, 71, macular degeneration** | Recent sight loss, no screen reader, low tech confidence. Uses an iPad. | The app must talk *by itself*. Huge text, huge targets, one thing at a time, endless patience, no jargon. |
| **Maria, 45, low vision + dyslexia** | Reads with magnification, struggles with dense officialese. | Plain-language restatement of what each question is *actually asking*. |
| **Sam, support worker** | Helps 20 clients a week with paperwork. | Wants to hand autonomy back, not do it for them. Cares about audit and correctness. |

**Explicit non-user:** we are not building a general OCR reader (Seeing AI, Be My Eyes and Envision already do that well). We do one thing: forms, end to end, to a finished artefact.

## 3. Design principles

1. **One field at a time.** The core interaction is a guided conversation, not a page. The user is never responsible for holding the whole form in their head.
2. **Never the only voice in the room.** If a screen reader is present, the app is silent and speaks only through ARIA. If it is not, the app speaks. Detecting which is a first-class engineering problem, not a toggle we hide in settings.
3. **Answers never leave the device.** Form *structure* may be sent to a model to be understood. The user's *answers* are processed locally, always. See [PRIVACY.md](./PRIVACY.md).
4. **Confidence is part of the data.** Every extracted label carries a confidence. Low confidence is surfaced to the user ("I'm not certain, this looks like it says…"), never silently guessed.
5. **Nothing is submitted without read-back.** The user hears every answer, in order, before anything is written, printed or submitted. Always.
6. **Enter it once, ever.** A local encrypted profile means the tenth form is ninety seconds, not ninety minutes. This is the reason people come back.
7. **Degrade honestly.** When OCR fails, or a field is un-fillable, say so and offer the next best thing. Never fabricate a field or an answer.

## 4. The core flow

All three input sources converge on the same experience after ingest.

```
  CAPTURE            UNDERSTAND           CONVERSE            REVIEW           EMIT
 ┌────────┐         ┌──────────┐        ┌──────────┐       ┌────────┐      ┌────────┐
 │ camera │──┐      │ extract  │        │  ask     │       │ read   │      │ filled │
 │ pdf    │──┼─────▶│ redact   │───────▶│  capture │──────▶│ back   │─────▶│ pdf /  │
 │ web dom│──┘      │ classify │   ▲    │  validate│       │ every  │      │ print /│
 └────────┘         └──────────┘   │    └──────────┘       │ answer │      │ submit │
                                   └──── autofill ─────────└────────┘      └────────┘
                                        from profile
```

### 4.1 Capture
- **PDF:** file picker or share target. Fastest and highest fidelity path.
- **Paper:** camera with *audio framing guidance* — the app tells the user "move back… tilt left… hold still" until all four page corners are detected, then auto-captures. This is the single hardest UX problem in the product (§6).
- **Web:** the browser extension reads the live DOM of the page the user is on.

### 4.2 Understand
Text and geometry are extracted **on-device**. PII is detected and replaced with placeholders. Only the redacted structure goes to the model, which returns a normalised **Form IR**: sections, fields, types, whether each is required, and — critically — a `spokenLabel` and `help` string in plain language.

> Officialese: *"Applicant's declaration of relevant prior interests per s.14(2)(b)"*
> `spokenLabel`: *"Have you had a financial interest in this before?"*
> `help`: *"This is asking whether you've owned part of this business, or lent it money, at any time in the past."*

### 4.3 Converse
The user walks the form. Each field is announced, answered, and confirmed. Answers come from typing, from OS dictation, or from the profile (autofill offers, never assumes: *"I have your date of birth as 3rd of March 1954 — use that?"*). Validation is local and immediate.

Navigation is single-key in spoken mode: `N` next, `P` previous, `Space` repeat, `H` help, `R` review, `S` skip.

### 4.4 Review
A linear read-back of every field and its answer, with a running count of anything skipped or left uncertain. The user can jump to any item. **This gate cannot be bypassed.**

### 4.5 Emit
- **PDF with form fields (AcroForm):** values written directly. Perfect fidelity.
- **Flat PDF / scan:** values drawn as a text layer at the detected coordinates.
- **Paper:** two options — (a) a printable filled copy, or (b) a *print-alignment overlay* PDF, so the answers land in the boxes of the original sheet when re-fed through a printer.
- **Web:** the extension fills the live DOM and stops. **The user presses submit, not us.**

## 5. What "done" looks like for v1

A blind user can, alone, on a laptop or tablet:
1. Open a government PDF form they were emailed,
2. Hear what it is and how long it will take,
3. Answer every question by voice or keyboard, with their address and DOB autofilled,
4. Hear every answer back,
5. Save a correctly filled PDF to their downloads folder,

…in under five minutes, having shown their personal data to no one.

## 6. Known-hard problems

These are called out early because they drive the roadmap, not because they are solved.

| Problem | Why it's hard | Current stance |
|---|---|---|
| **Camera framing without sight** | The user cannot see what the lens sees. Blurry, cropped, skewed captures are the norm. | Real-time edge detection + continuous audio guidance + auto-capture. Prior art: KNFB Reader's "field of view" report. Phase 2 — do not attempt until PDF path is excellent. |
| **Signatures** | Legally required, visually placed, and a blind user cannot sign in a box. | v1: detect and *flag* signature fields, emit the form with them empty and tell the user clearly which ones need a physical signature and roughly where. Do not fake a signature. |
| **Checkbox ↔ label association** | On flat scans, which label belongs to which box is genuinely ambiguous. | Geometric heuristics + model reasoning, with a confidence score. Below threshold → ask the user. |
| **Legal correctness** | A mis-parsed question on a benefits or immigration form has real consequences. | Mandatory read-back; verbatim original label always retrievable via `H`; clear "this is a tool, not advice" framing. Never summarise away a negation. |
| **Speech recognition in browsers** | Web Speech API is Chrome-strong, Safari-weak, and sends audio to Apple/Google servers. | Default to typing + the OS's own dictation (which the user already trusts). Cloud STT is opt-in and **hard-blocked on sensitive fields**. |
| **Timeouts & CAPTCHAs on web forms** | Sessions expire mid-conversation; CAPTCHAs are designed to exclude. | Detect session timers and warn; surface audio-CAPTCHA links; ultimately unsolvable by us — fail loudly and helpfully. |

## 7. Roadmap

| Phase | Scope | Why this order |
|---|---|---|
| **P0 — Skeleton** | Form IR, conversation engine, review gate, accessible web shell. Hand-authored fixture forms. | The conversation *is* the product. Build it before any ingest. |
| **P1 — AcroForm PDFs** | Real PDFs with embedded fields. Read + fill + save. Local profile & autofill. | Highest fidelity, zero OCR risk. Ships something genuinely useful. |
| **P2 — Flat PDFs & scans** | On-device OCR, geometry, redaction, model-based classification, text-layer emit. | Unlocks the majority of real-world PDFs. |
| **P3 — Camera capture** | Audio framing guidance, dewarping, multi-page, print overlay. | Hardest UX; deserves its own phase. |
| **P4 — Browser extension** | Live DOM forms, shared IR and conversation engine. | Different distribution and permission model; reuses everything above. |

## 8. Open questions

- **Distribution for P4:** a browser extension is the only way to reach live web forms from a web app. Chrome/Edge MV3 first; Safari extension needs a native wrapper. Accept?
- **Offline:** is a full offline mode (PWA + local models) a v1 requirement, or does P1's local-only PDF path satisfy it?
- **Multi-user/support-worker mode:** does Sam get a supervised mode, and how does that interact with "answers never leave the device"?
- **Jurisdiction:** UK-first (NI numbers, NHS numbers, DWP forms) or US-first (SSN, IRS)? This changes the PII detector, the validators, and the fixture set.
- **Funding/compliance target:** WCAG 2.2 AA is the floor. Is EN 301 549 or Section 508 conformance a procurement requirement?
