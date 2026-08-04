# FormFill

FormFill helps blind and low-vision users fill out PDF forms and scanned form images through an accessible, guided workflow. Upload a form, answer questions one at a time by keyboard or screen reader, and get a completed document back.

**Live deployment:** https://formfill-rahul.vercel.app

## Branch: `rahul`

UI ownership moved to the [Arya](https://github.com/lucifer0096/Hackathon-AI/tree/Arya) branch as of 2026-08-03. This branch's focus from here is the AI/ingest pipeline — the routes below still exist on `rahul` for now, but the primary UI work happens on `Arya`.

| Route | Purpose |
|---|---|
| `/` | Upload a form (PDF, PNG, or JPG) |
| `/review` | Review the fields detected on the form |
| `/overview` | See the form's sections and estimated completion time |
| `/questions` | Answer questions one field at a time, skipping any that don't apply |
| `/confirm` | Mandatory read-back of every answer (hear one twice to override), then download the finished document |
| `/help` | How a form session works, keyboard shortcuts, FAQ |
| `/accessibility` | What's supported today and what's still in progress |

**Pipeline pivot, 2026-08-03** (see [`docs/INTEGRATION.html`](docs/INTEGRATION.html) for the full reasoning): following a meeting with our mentor, local PDF-structure detection (AcroForm field parsing, text-layer extraction) was replaced with a single multimodal model call for every PDF. Local testing against 10-15 real forms found the previous approach unreliable, not just occasionally inaccurate — a solution tuned against one PDF's structure didn't generalise to the next one. The old pipeline is archived, not deleted, at `src/lib/ingest/_archive/`.

Upload a real PDF and the rest of the flow uses what was actually read from it:

- **Every PDF** is sent whole to a multimodal model via OpenRouter (`/api/understand`), which returns the questions it found. A quick local `pdf-lib` pass first lists any real fillable field names (no position/label guessing) and gives them to the model as context, so it can map its own detections back onto real fields for fill-back where they exist — a single form can have a mix of real and non-real fields. Requires `OPENROUTER_API_KEY`, see [Getting started](#getting-started).
- **PII redaction does not cover this path.** Redaction only ever pattern-matched extracted text; it can't inspect a PDF's rendered content before it's sent. This is a disclosed tradeoff agreed as part of the pivot, not an oversight — see [`docs/KNOWN-ISSUES.html`](docs/KNOWN-ISSUES.html).
- **Non-PDF files** (photos, other image formats): not supported yet, flagged clearly rather than guessed at.

Confirming on `/confirm` downloads a real document: any field the model mapped to a real AcroForm field name gets written into a filled, flattened PDF; everything else appears as a question/answer summary in the same document.

If nothing has been uploaded this session (e.g. a page is opened directly), the four session pages fall back to sample placeholder data so they're still browsable during development. Data shapes match `packages/form-model`'s `Form`/`Section`/`Field` types on `main`.

## Docs

| Doc | Audience | Covers |
|---|---|---|
| [`docs/WORKFLOW.html`](docs/WORKFLOW.html) | Non-technical | What a person experiences, page by page |
| [`docs/MODELS.html`](docs/MODELS.html) | Non-technical | AI model choice and live OpenRouter pricing |
| [`docs/KNOWN-ISSUES.html`](docs/KNOWN-ISSUES.html) | Non-technical | Known risks and limitations, tested not guessed |
| [`docs/ROADMAP.html`](docs/ROADMAP.html) | Non-technical | What's built vs planned vs P0-demo-worthy, checked against `main`'s roadmap |
| [`docs/INTEGRATION.html`](docs/INTEGRATION.html) | Technical | The AI/PDF pipeline implementation, file by file |
| [`docs/ACCESSIBILITY.html`](docs/ACCESSIBILITY.html) | Technical | Accessibility status against `main`'s normative spec, section by section |

Meeting-scoped and point-in-time docs (pre-meeting checklist, questions drafted for a specific review, an old changelog snapshot) are archived at [`docs/_archive/`](docs/_archive/README.md), not deleted — see that folder's README for what's there and why.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then add your OPENROUTER_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see it running locally. Get an OpenRouter key at [openrouter.ai](https://openrouter.ai). An `OPENROUTER_API_KEY` is now required for any real form upload — only the placeholder demo data works without one.

```bash
npm run build   # production build
npm run lint    # eslint
```

## Testing local models before picking one

Classification model choice isn't finalised yet — `scripts/` has two standalone tools (not part of the app, never deployed) for comparing local Ollama vision models against real forms before committing to one for production. Both send the exact same system prompt used in `src/lib/openrouter/classify-pdf.ts`, and both talk only to your local Ollama daemon (`http://localhost:11434`) — no OpenRouter, no paid API, nothing leaves your machine.

```bash
# Browser UI: upload a PDF, pick models, watch results stream in side by side
npm run test:ui
# then open http://localhost:3100

# Or from the command line, results saved to scripts/results/<form-name>/
npm run test:local-models -- path/to/form.pdf
npm run test:local-models -- path/to/form.pdf --models=gemma4:26b,qwen2.5vl:7b
```

Requires [Ollama](https://ollama.com) running locally with the models you want to test already pulled — see [`docs/MODELS.html`](docs/MODELS.html) §03 for the current test set and reasoning.

## Stack

Next.js (App Router, Turbopack) · React · Tailwind CSS · Atkinson Hyperlegible font for readability · `pdf-lib` + `pdfjs-dist` for client-side PDF parsing · OpenRouter for form classification.

The Answer/Confirm flow runs on a pure conversation-engine reducer ported from `main`'s `packages/conversation`, `form-model`, and `validate` (unmodified logic, hand-copied until this branch is reconciled with the workspace) — real skip-logic, locale-aware validation, and a two-step review gate instead of a simpler independent implementation.

Classification currently targets Gemma 3 27B via OpenRouter, our mentor's recommendation for a cheap multimodal model — not yet finalised. Two local test cycles have run against Ollama on two different real forms: `gemma4:e4b` was dropped after fabricating answers on both forms; `gemma3:4b`, `qwen2.5vl:7b`, and `gemma4:26b` all passed both, and the remaining choice is speed (`gemma3:4b`) vs. Nigel's pick (`gemma4:26b`, ~4x slower for a modest accuracy edge). A third form is planned before committing to a model for the demo. See [`docs/MODELS.html`](docs/MODELS.html) §04/§04b for the full results and pricing comparison, and [`docs/KNOWN-ISSUES.html`](docs/KNOWN-ISSUES.html) for the current known risks (redaction gap, untested pipeline, latency).

A second, independent model call can review filled answers for real mistakes before submission (`src/lib/openrouter/verify-answers.ts`, `/api/verify`) — built and callable, not yet wired into either branch's submit flow.

## Accessibility

This is not a bolt-on feature. It's the point of the product. Every page follows: keyboard-first navigation with single-key commands on `/questions` (`N`/`P`/`Space`/`H`/`S`, plus `L` to read a field's label as printed and `R` to jump straight to `/confirm` for review), visible format hints shown before input rather than only after a failed submit, focus moved to the new heading on every route and question change, visible focus rings, semantic landmarks and headings, `aria-live` status regions for dynamic updates, and a skip-to-content link.

See [`docs/ACCESSIBILITY.html`](docs/ACCESSIBILITY.html) for what's implemented on this branch versus what's still a known gap, checked section by section against the normative spec, `docs/ACCESSIBILITY.md` on `main`.

## Deploying

Deployed via the Vercel CLI from this branch:

```bash
npx vercel --prod
```