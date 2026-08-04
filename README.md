# FormFill

FormFill helps blind and low-vision users fill out PDF forms and scanned form images through an accessible, guided workflow. Upload a form, answer questions one at a time by keyboard or screen reader, and get a completed document back.

**Live deployment:** [formfill-main.vercel.app](https://formfill-main.vercel.app) — known gap: fails on official NZ government forms, see [`docs/KNOWN-ISSUES.html`](docs/KNOWN-ISSUES.html)

## Branch: `main`

As of 2026-08-04, `rahul` was merged into `main` (`dd8b0fb`, `64b9f6c`) — `main` is now the real, working codebase, not the original placeholder scaffold. Going forward, changes are made directly on `main`, reviewing first if Arya has pushed changes since the last pull, rather than working on separate long-lived feature branches. The `rahul` and `Arya` branches still exist in history but are no longer the active development branches.

The AI/ingest pipeline (this doc, `docs/INTEGRATION.html`, `src/lib/ingest/`, `src/lib/openrouter/`) came from the `rahul` branch's work. `main`'s original commit also included a `packages/*` npm-workspace scaffold that was never completed — it's excluded from typecheck/lint (see `tsconfig.json`, `eslint.config.mjs`) and kept on disk for reference only; the real app is entirely in `src/`.

| Route | Purpose |
|---|---|
| `/` | Upload a form (PDF, PNG, or JPG) |
| `/review` | Review the fields detected on the form |
| `/overview` | See the form's sections and estimated completion time |
| `/questions` | Answer questions one field at a time, skipping any that don't apply |
| `/confirm` | Mandatory read-back of every answer (hear one twice to override), then download the finished document |
| `/help` | How a form session works, keyboard shortcuts, FAQ |
| `/accessibility` | What's supported today and what's still in progress |

Every uploaded PDF is read by an AI model (via OpenRouter) rather than parsed locally — this replaced an earlier local-parsing approach that turned out to be unreliable across real forms. Requires `OPENROUTER_API_KEY`, see [Getting started](#getting-started). Full reasoning and tradeoffs (including a disclosed gap: PII redaction doesn't cover this path) are in [`docs/INTEGRATION.html`](docs/INTEGRATION.html) and [`docs/KNOWN-ISSUES.html`](docs/KNOWN-ISSUES.html). Non-PDF files (photos, other image formats) aren't supported yet.

Confirming on `/confirm` downloads a real document: any field the model mapped to a real AcroForm field name gets written into a filled, flattened PDF; everything else appears as a question/answer summary in the same document.

If nothing has been uploaded this session (e.g. a page is opened directly), the four session pages fall back to sample placeholder data so they're still browsable during development. See `src/lib/form-model/types.ts` for the `Form`/`Section`/`Field` shape those pages expect.

## Docs

| Doc | Audience | Covers |
|---|---|---|
| [`docs/WORKFLOW.html`](docs/WORKFLOW.html) | Non-technical | What a person experiences, page by page |
| [`docs/MODELS.html`](docs/MODELS.html) | Non-technical | AI model choice and live OpenRouter pricing |
| [`docs/KNOWN-ISSUES.html`](docs/KNOWN-ISSUES.html) | Non-technical | Known risks and limitations, tested not guessed |
| [`docs/ROADMAP.html`](docs/ROADMAP.html) | Non-technical | What's built vs planned vs P0-demo-worthy |
| [`docs/INTEGRATION.html`](docs/INTEGRATION.html) | Technical | The AI/PDF pipeline implementation, file by file |
| [`docs/ACCESSIBILITY.html`](docs/ACCESSIBILITY.html) | Technical | Accessibility status against the project's normative spec, section by section |

Some doc text still refers to "this branch" / "`main`'s roadmap" from before the `rahul` → `main` merge — read those as "this codebase" until each doc gets its own pass to update that framing.

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

## Testing models before picking one

Classification model choice isn't finalised yet — `scripts/` has three standalone tools (not part of the app, never deployed) for comparing vision models against real forms before committing to one for production. All three send the exact same system prompt used in `src/lib/openrouter/classify-pdf.ts`.

```bash
# Local (Ollama) — fully offline, no cost, but CPU-only inference is slow (minutes/form)
npm run test:ui
# then open http://localhost:3100
npm run test:local-models -- path/to/form.pdf   # CLI, results saved to scripts/results/<form-name>/
npm run test:local-models -- path/to/form.pdf --models=gemma4:26b,qwen2.5vl:7b

# Online (OpenRouter, free-tier models only) — fast, no cost, but shared free-tier capacity
npm run test:online
# then open http://localhost:3200, upload one or more PDFs at once
```

Local requires [Ollama](https://ollama.com) running with the models you want to test already pulled. Online requires `OPENROUTER_API_KEY` in `.env.local`, but only calls `:free`-suffixed models — no paid model is available in this tool, so a run can never spend money. See [`docs/MODELS.html`](docs/MODELS.html) §04/§04b (local) and §04c/§04d (online) for the current test set, results, and reasoning.

## Stack

Next.js (App Router, Turbopack) · React · Tailwind CSS · Atkinson Hyperlegible font for readability · `pdf-lib` + `pdfjs-dist` for client-side PDF parsing · OpenRouter for form classification.

The Answer/Confirm flow runs on a pure conversation-engine reducer in `src/lib/conversation/` (hand-copied from the original `packages/conversation`, `form-model`, and `validate` design during development on `rahul`, not imported as workspace packages) — real skip-logic, locale-aware validation, and a two-step review gate instead of a simpler independent implementation.

Model choice isn't finalised yet — `google/gemma-4-26b-a4b-it:free` (via OpenRouter) is the current best-tested candidate, though it has a known gap on NZ government forms specifically. See [`docs/MODELS.html`](docs/MODELS.html) for the full testing history and [`docs/KNOWN-ISSUES.html`](docs/KNOWN-ISSUES.html) for current known risks.

A second, independent model call can review filled answers for real mistakes before submission (`src/lib/openrouter/verify-answers.ts`, `/api/verify`) — built and callable, not yet wired into the submit flow.

## Accessibility

This is not a bolt-on feature. It's the point of the product. Every page follows: keyboard-first navigation with single-key commands on `/questions` (`N`/`P`/`Space`/`H`/`S`, plus `L` to read a field's label as printed and `R` to jump straight to `/confirm` for review), visible format hints shown before input rather than only after a failed submit, focus moved to the new heading on every route and question change, visible focus rings, semantic landmarks and headings, `aria-live` status regions for dynamic updates, and a skip-to-content link.

See [`docs/ACCESSIBILITY.html`](docs/ACCESSIBILITY.html) for what's implemented versus what's still a known gap, checked section by section against the project's normative accessibility spec.

## Deploying

Deployed at [formfill-main.vercel.app](https://formfill-main.vercel.app) (Vercel project `formfill-main`, linked to this repo's `main` branch). The previous `rahul`-branch deployment (`formfill-rahul`) still exists but is retired. `OPENROUTER_API_KEY` is set as a Production environment variable on the Vercel project — update it via the Vercel dashboard or `vercel env` if it changes. To deploy a new build from `main`:

```bash
npx vercel --prod
```