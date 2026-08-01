# FormFill

FormFill helps blind and low-vision users fill out PDF forms and scanned form images through an accessible, guided workflow — upload a form, answer questions one at a time by keyboard or screen reader, and get a completed document back.

**Live deployment:** https://formfill-rahul.vercel.app

## Branch: `rahul`

This branch builds on [Arya](https://github.com/lucifer0096/Hackathon-AI/tree/Arya)'s first-page UI, adding the remaining pages of the form-filling flow:

| Route | Purpose |
|---|---|
| `/` | Upload a form (PDF, PNG, or JPG) |
| `/review` | Review the fields detected on the form |
| `/overview` | See the form's sections and estimated completion time |
| `/questions` | Answer questions one field at a time |
| `/confirm` | Mandatory read-back of every answer before finishing |

Upload a real PDF and the rest of the flow uses what was actually read from it:

- **PDFs with real form fields (AcroForm):** read directly with `pdf-lib`. No model call, no network — exact fidelity.
- **Flat PDFs with no form fields** (the common case for real-world forms): text is extracted locally with `pdfjs-dist`, then classified into questions by a model call to OpenRouter via `/api/understand`. Requires `OPENROUTER_API_KEY` — see [Getting started](#getting-started). Without a key, `/review` falls back to showing the raw extracted text with a retry option, rather than failing silently.
- **Scanned images / image-only PDFs:** not supported yet — flagged clearly rather than guessed at.

If nothing has been uploaded this session (e.g. a page is opened directly), the four pages fall back to sample placeholder data so they're still browsable during development. Data shapes match `packages/form-model`'s `Form`/`Section`/`Field` types on `main`.

See [`docs/INTEGRATION.html`](docs/INTEGRATION.html) for the full pipeline breakdown.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # then add your OPENROUTER_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see it running locally. Get an OpenRouter key at [openrouter.ai](https://openrouter.ai) — without one, everything works except classifying flat PDFs into questions (AcroForm PDFs and the placeholder fallback don't need it).

```bash
npm run build   # production build
npm run lint    # eslint
```

## Stack

Next.js (App Router, Turbopack) · React · Tailwind CSS · Atkinson Hyperlegible font for readability · `pdf-lib` + `pdfjs-dist` for client-side PDF parsing · OpenRouter for form classification.

## Accessibility

This is not a bolt-on feature — it's the point of the product. Every page follows: keyboard-first navigation with single-key commands (`N`/`P`/`Space`/`H`/`S` on `/questions`), focus moved to the new heading on every route and question change, visible focus rings, semantic landmarks and headings, `aria-live` status regions for dynamic updates, and a skip-to-content link.

See [`docs/ACCESSIBILITY.html`](docs/ACCESSIBILITY.html) for what's implemented on this branch versus what's still a known gap, checked section by section against the normative spec, `docs/ACCESSIBILITY.md` on `main`.

## Deploying

Deployed via the Vercel CLI from this branch:

```bash
npx vercel --prod
```

This project is not currently connected to GitHub for auto-deploy — redeploy manually after pushing changes, or connect the repo in the Vercel dashboard for deploys on every push.
