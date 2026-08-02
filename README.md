# FormFill

FormFill helps blind and low-vision users fill out PDF forms and scanned form images through an accessible, guided workflow. Upload a form, answer questions one at a time by keyboard or screen reader, and get a completed document back.

**Live deployment:** https://formfill-rahul.vercel.app

## Branch: `rahul`

This branch builds on [Arya](https://github.com/lucifer0096/Hackathon-AI/tree/Arya)'s first-page UI, adding the rest of the form-filling flow plus the AI-integration pipeline behind it.

| Route | Purpose |
|---|---|
| `/` | Upload a form (PDF, PNG, or JPG) |
| `/review` | Review the fields detected on the form |
| `/overview` | See the form's sections and estimated completion time |
| `/questions` | Answer questions one field at a time, skipping any that don't apply |
| `/confirm` | Mandatory read-back of every answer (hear one twice to override), then download the finished document |
| `/help` | How a form session works, keyboard shortcuts, FAQ |
| `/accessibility` | What's supported today and what's still in progress |

Upload a real PDF and the rest of the flow uses what was actually read from it:

- **PDFs with real form fields (AcroForm):** read directly with `pdf-lib`. No model call, no network, exact fidelity.
- **Flat PDFs with no form fields** (the common case for real-world forms): text is extracted locally with `pdfjs-dist`, personal information (names, emails, national ID numbers, addresses, and similar) is stripped and replaced with placeholders, then the redacted text is classified into questions by a model call to OpenRouter via `/api/understand`. Real values are restored locally afterward and never leave the browser/server boundary. Requires `OPENROUTER_API_KEY`, see [Getting started](#getting-started). Without a key, `/review` falls back to showing the raw extracted text with a retry option, rather than failing silently.
- **Scanned images / image-only PDFs:** not supported yet, flagged clearly rather than guessed at.

Confirming on `/confirm` downloads a real document: a genuinely filled, flattened PDF for AcroForm uploads (answers written into the real fields), or a question/answer summary PDF for classified ones (no real field coordinates to draw into yet).

If nothing has been uploaded this session (e.g. a page is opened directly), the four session pages fall back to sample placeholder data so they're still browsable during development. Data shapes match `packages/form-model`'s `Form`/`Section`/`Field` types on `main`.

## Docs

| Doc | Audience | Covers |
|---|---|---|
| [`docs/WORKFLOW.html`](docs/WORKFLOW.html) | Non-technical | What a person experiences, page by page |
| [`docs/MODELS.html`](docs/MODELS.html) | Non-technical | AI model choice and live OpenRouter pricing |
| [`docs/KNOWN-ISSUES.html`](docs/KNOWN-ISSUES.html) | Non-technical | Known risks and limitations, tested not guessed |
| [`docs/WHATS-NEW.html`](docs/WHATS-NEW.html) | Non-technical | Summary of what's new since the `Arya` branch point, for review |
| [`docs/ROADMAP.html`](docs/ROADMAP.html) | Non-technical | What's built vs planned vs P0-demo-worthy, checked against `main`'s roadmap |
| [`docs/PRE-MEETING-CHECKLIST.html`](docs/PRE-MEETING-CHECKLIST.html) | Non-technical | What to build, verify, or decide before the next Nigel meeting |
| [`docs/QUESTIONS-FOR-NIGEL.html`](docs/QUESTIONS-FOR-NIGEL.html) | Non-technical | Specific questions grounded in what's actually implemented, for his feedback |
| [`docs/INTEGRATION.html`](docs/INTEGRATION.html) | Technical | The AI/PDF pipeline implementation, file by file |
| [`docs/ACCESSIBILITY.html`](docs/ACCESSIBILITY.html) | Technical | Accessibility status against `main`'s normative spec, section by section |

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then add your OPENROUTER_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see it running locally. Get an OpenRouter key at [openrouter.ai](https://openrouter.ai). Without one, everything works except classifying flat PDFs into questions (AcroForm PDFs and the placeholder fallback don't need it).

```bash
npm run build   # production build
npm run lint    # eslint
```

## Stack

Next.js (App Router, Turbopack) · React · Tailwind CSS · Atkinson Hyperlegible font for readability · `pdf-lib` + `pdfjs-dist` for client-side PDF parsing · OpenRouter for form classification.

The Answer/Confirm flow runs on a pure conversation-engine reducer ported from `main`'s `packages/conversation`, `form-model`, and `validate` (unmodified logic, hand-copied until this branch is reconciled with the workspace) — real skip-logic, locale-aware validation, and a two-step review gate instead of a simpler independent implementation.

Classification currently runs on a free OpenRouter model (`nvidia/nemotron-3-super-120b-a12b:free`), a deliberate choice for a hackathon demo where cost isn't a concern. See [`docs/MODELS.html`](docs/MODELS.html) for the reasoning and paid alternatives, and [`docs/KNOWN-ISSUES.html`](docs/KNOWN-ISSUES.html) for the reliability tradeoff (occasional slowness on large forms).

## Accessibility

This is not a bolt-on feature. It's the point of the product. Every page follows: keyboard-first navigation with single-key commands on `/questions` (`N`/`P`/`Space`/`H`/`S`, plus `L` to read a field's label as printed and `R` to jump straight to `/confirm` for review), visible format hints shown before input rather than only after a failed submit, focus moved to the new heading on every route and question change, visible focus rings, semantic landmarks and headings, `aria-live` status regions for dynamic updates, and a skip-to-content link.

See [`docs/ACCESSIBILITY.html`](docs/ACCESSIBILITY.html) for what's implemented on this branch versus what's still a known gap, checked section by section against the normative spec, `docs/ACCESSIBILITY.md` on `main`.

## Deploying

Deployed via the Vercel CLI from this branch:

```bash
npx vercel --prod
```